"""
ProjectX Gateway API client.

This module handles communication with the ProjectX Gateway API for both 
REST API calls and WebSocket connections.
"""

import json
import asyncio
import logging
import os
from typing import Dict, List, Any, Optional, Callable, Union
import aiohttp
import websockets
from datetime import datetime, timezone, timedelta
from signalrcore.hub_connection_builder import HubConnectionBuilder
import base64
import urllib.parse

from src.core.exceptions import ApiError, WebSocketConnectionError
from src.core.config import Config
from src.data.models import Bar, Trade
from src.core.utils import get_bar_start_time


logger = logging.getLogger(__name__)


class GatewayClient:
    """Client for interacting with the ProjectX Gateway API."""
    
    def __init__(self, config: Config):
        """
        Initialize the client with configuration.
        
        Args:
            config: Configuration object
        """
        self.api_url = config.get_api_url()
        self.api_token = config.get_api_token()
        self.market_hub_url = config.get_rtc_market_url()
        self.user_hub_url = config.get_rtc_user_url()
        self.username = os.getenv("PROJECTX_USERNAME", "")
        print(f"DEBUG: GatewayClient.__init__ - self.username: '{self.username}', api_token (prefix): '{self.api_token[:5] if self.api_token else 'None'}'") # DEBUG
        
        self.session = None
        self.market_hub_connection = None
        self.trade_callbacks = []
        self.session_token = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        await self._ensure_session()
        await self._ensure_auth()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
        if self.market_hub_connection:
            await self.disconnect_market_hub()
            
    async def _ensure_session(self):
        """Ensure an aiohttp session exists."""
        if self.session is None:
            self.session = aiohttp.ClientSession()
    
    async def _ensure_auth(self):
        """Ensure we have a valid session token."""
        if self.session_token is None:
            await self._login()
    
    async def _login(self):
        """
        Login to get a session token.
        
        Raises:
            ApiError: If login fails
        """
        # Check if we have the required credentials
        if not self.api_token:
            logger.error("Missing API token for authentication")
            raise ApiError("Missing API token for authentication")
            
        if not self.username:
            logger.error("Missing username for authentication")
            raise ApiError("Missing username for authentication")
            
        logger.info(f"Attempting login with username: {self.username}")
        
        url = f"{self.api_url}/api/Auth/loginKey"
        headers = {
            "accept": "application/json",
            "Content-Type": "application/json"
        }
        
        # Properly format the data according to API docs - match test_auth.py exactly
        data = {
            "userName": self.username.strip(),  # Remove any whitespace
            "apiKey": self.api_token.strip()  # Remove any whitespace
        }
        
        logger.info(f"Login request data (sanitized): {{'userName': '{self.username}', 'apiKey': '***'}}")

        try:
            logger.debug(f"Attempting login with URL: {url}")
            logger.info(f"API URL: {self.api_url}")
            logger.info(f"Username: {self.username}")
            logger.debug(f"API token (masked): {self.api_token[:5]}...{self.api_token[-5:] if len(self.api_token) > 10 else ''}")
            
            if self.session is None:
                logger.info("Creating new session for login")
                self.session = aiohttp.ClientSession()
            
            async with self.session.post(url, headers=headers, json=data) as response:
                logger.info(f"Login response status: {response.status}")
                
                response_text = await response.text()
                
                try:
                    # Try to parse JSON first
                    response_data = json.loads(response_text)
                    logger.debug("Successfully parsed JSON response")
                except json.JSONDecodeError as e:
                    # If JSON parsing fails, log the raw text and raise an error
                    logger.error("Failed to parse JSON response from server.", exc_info=True)
                    logger.error(f"Raw response text that caused the error:\n---\n{response_text}\n---")
                    raise ApiError(f"Invalid JSON response from server. Status: {response.status}") from e

                if not response.ok:
                    error_msg = response_data.get('errorMessage', 'Unknown error')
                    logger.error(f"Login failed with status {response.status}: {error_msg}")
                    logger.debug(f"Response data: {response_data}")
                    raise ApiError(
                        f"Login failed with status {response.status}: {error_msg}",
                        status_code=response.status,
                        response=response_data
                    )
                    
                if not response_data.get("success", False):
                    error_code = response_data.get('errorCode')
                    error_msg = response_data.get('errorMessage', 'Unknown error')
                    
                    # Handle specific error codes
                    if error_code == 3:
                        error_description = "Invalid API key or username (Error Code 3)"
                    elif error_code == 1000:
                        error_description = "Invalid credentials (Error Code 1000)"
                    elif error_code == 1001:
                        error_description = "Token expired (Error Code 1001)"
                    elif error_code == 1002:
                        error_description = "Invalid token (Error Code 1002)"
                    elif error_code == 2000:
                        error_description = "Rate limit exceeded (Error Code 2000)"
                    else:
                        error_description = f"Error Code {error_code}" if error_code else "Unknown error"
                    
                    logger.error(f"Login failed (success=false): {error_description}")
                    if error_msg and error_msg != 'Unknown error':
                        logger.error(f"Error message: {error_msg}")
                    
                    logger.debug(f"Response data: {response_data}")
                    
                    raise ApiError(
                        f"Login failed: {error_description}",
                        response=response_data
                    )

                self.session_token = response_data.get("token")
                if not self.session_token:
                    logger.error("No token in login response")
                    logger.debug(f"Response data: {response_data}")
                    raise ApiError("No token in login response")

                token_preview = f"{self.session_token[:5]}...{self.session_token[-5:] if len(self.session_token) > 10 else ''}"
                logger.info(f"Successfully logged in and got session token: {token_preview}")

        except aiohttp.ClientError as e:
            logger.error(f"HTTP request error during login: {str(e)}")
            raise ApiError(f"Login request failed: {str(e)}")
        except ApiError:
            # Re-raise API errors without wrapping
            raise
        except Exception as e:
            logger.error(f"Unexpected error during login: {str(e)}", exc_info=True)
            raise ApiError(f"Login failed due to unexpected error: {str(e)}")
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """
        Get authentication headers for API requests.
        
        Returns:
            Dict containing auth headers
        """
        if not self.session_token:
            raise ApiError("No session token available")
            
        return {
            "Authorization": f"Bearer {self.session_token}",
            "Content-Type": "application/json"
        }
    
    def _encode_token(self) -> str:
        """
        Encode the API token for WebSocket authentication.
        
        Returns:
            Encoded token string
        """
        # Remove any trailing equals signs and URL encode
        token = self.api_token.rstrip("=")
        return urllib.parse.quote(token)
    
    async def retrieve_bars(
        self,
        contract_id: str,
        timeframe: str,
        start_time: Optional[Union[datetime, str]] = None,
        end_time: Optional[Union[datetime, str]] = None,
        limit: int = 100,
        include_partial_bar: bool = False
    ) -> List[Bar]:
        """
        Retrieve OHLC bars from the ProjectX Gateway API.
        
        Args:
            contract_id: The contract ID to retrieve bars for
            timeframe: String representation of the timeframe (e.g., "5m", "1h")
            start_time: Start time for the bars, defaults to 30 days ago
            end_time: End time for the bars, defaults to now
            limit: Maximum number of bars to retrieve
            include_partial_bar: Whether to include a partial bar for the current period
            
        Returns:
            List of Bar objects
            
        Raises:
            ApiError: If the API returns an error
        """
        from src.core.utils import parse_timeframe
        
        # Parse the timeframe into unit and value
        unit, unit_number = parse_timeframe(timeframe)
        
        # Set default times if not provided
        if end_time is None:
            end_time = datetime.now(timezone.utc)
        elif isinstance(end_time, str):
            end_time = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        
        if start_time is None:
            # Default to 100 bars back
            if unit == 2:  # Minutes
                start_time = end_time - timedelta(minutes=unit_number * limit)
            elif unit == 3:  # Hours
                start_time = end_time - timedelta(hours=unit_number * limit)
            elif unit == 4:  # Days
                start_time = end_time - timedelta(days=unit_number * limit)
            else:
                # Default to 30 days for other units
                start_time = end_time - timedelta(days=30)
        elif isinstance(start_time, str):
            start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        
        # Format timestamps for API
        start_time_iso = start_time.isoformat()
        end_time_iso = end_time.isoformat()
        
        # Prepare request data
        url = f"{self.api_url}/api/History/retrieveBars"
        headers = {
            "accept": "text/plain",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}" if self.session_token else ""
        }
        
        data = {
            "contractId": contract_id,
            "live": False,  # Assuming we want historical data
            "startTime": start_time_iso,
            "endTime": end_time_iso,
            "unit": unit,
            "unitNumber": unit_number,
            "limit": limit,
            "includePartialBar": include_partial_bar
        }
        
        # Make the request
        await self._ensure_session()
        try:
            async with self.session.post(url, headers=headers, json=data) as response:
                response_data = await response.json()
                
                if not response.ok:
                    # Try to get error message, otherwise use a generic one or the response text
                    error_detail = "Unknown error"
                    try:
                        # Prefer errorMessage if available and not null
                        api_err_msg = response_data.get('errorMessage')
                        if api_err_msg is not None:
                            error_detail = api_err_msg
                        elif response_data: # If errorMessage is null but we have other data
                             error_detail = f"Status: {response.status}, Response: {str(response_data)[:200]}" # Log part of response
                        else: # Fallback if response_data is also empty or not parsable
                            error_detail = await response.text()
                            error_detail = f"Status: {response.status}, Response: {error_detail[:200]}"

                    except Exception: # Fallback if response_data parsing failed for error
                        pass # error_detail remains "Unknown error" or previous value
                        
                    logger.error(f"API request failed: {error_detail}")
                    logger.debug(f"Request data: {data}")
                    logger.debug(f"Response status: {response.status}")
                    logger.debug(f"Full Response data: {response_data}")
                    raise ApiError(
                        f"Failed to retrieve bars: {error_detail}",
                        status_code=response.status,
                        response=response_data
                    )
                    
                if not response_data.get("success", False):
                    error_msg_from_api = response_data.get('errorMessage')
                    actual_error_message = error_msg_from_api if error_msg_from_api is not None else f"API success=false, null/no errorMessage. Full response: {str(response_data)[:500]}"
                    
                    logger.error(f"API returned error: {actual_error_message}")
                    logger.debug(f"Request data: {data}")
                    logger.debug(f"Full Response data: {response_data}")
                    raise ApiError(
                        f"API returned error: {actual_error_message}",
                        response=response_data
                    )
                    
                # Process the bars
                bars = []
                for bar_data in response_data.get("bars", []):
                    try:
                        # Convert the API response to our Bar model
                        bar = Bar(
                            t=bar_data["t"],
                            o=bar_data["o"],
                            h=bar_data["h"],
                            l=bar_data["l"],
                            c=bar_data["c"],
                            v=bar_data.get("v", 0),
                            contract_id=contract_id,
                            timeframe_unit=unit,
                            timeframe_value=unit_number
                        )
                        bars.append(bar)
                    except Exception as e:
                        logger.error(f"Error processing bar data: {str(e)}")
                        logger.debug(f"Bar data: {bar_data}")
                        continue
                    
                return bars
                
        except aiohttp.ClientError as e:
            logger.error(f"HTTP request error: {str(e)}")
            raise ApiError(f"HTTP request failed: {str(e)}")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response: {str(e)}")
            raise ApiError("Invalid JSON response from API")
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            raise ApiError(f"Unexpected error: {str(e)}")
            
    async def connect_market_hub(self):
        """
        Connect to the ProjectX Market Hub for real-time market data.
        
        Raises:
            WebSocketConnectionError: If connection fails
        """
        try:
            await self._ensure_auth()
            
            # Construct the URL with the session token as a query parameter
            if "?" in self.market_hub_url:
                url_with_token = f"{self.market_hub_url}&access_token={self.session_token}"
            else:
                url_with_token = f"{self.market_hub_url}?access_token={self.session_token}"

            logger.info(f"Connecting to Market Hub URL: {self.market_hub_url}")
            
            # Build the SignalR connection using the correct authentication method
            builder = HubConnectionBuilder()
            builder = builder.with_url(
                url_with_token,
                options={ 
                    "access_token_factory": lambda: self.session_token,
                    "skip_negotiation": True
                }
            )
            
            builder = builder.with_automatic_reconnect({
                "type": "interval",
                "keep_alive_interval": 10,
                "reconnect_interval": 5,
                "max_attempts": 5
            })
            
            # Build the connection
            logger.info("Building hub connection...")
            self.market_hub_connection = builder.build()
            logger.info(f"Hub connection built: {type(self.market_hub_connection).__name__}")
                
            # Set up event handlers
            self.market_hub_connection.on("GatewayTrade", self._handle_trade_event)
            self.market_hub_connection.on("GatewayQuote", self._handle_quote_event)
            self.market_hub_connection.on("GatewayDepth", self._handle_depth_event)
            
            # Create a future to track connection status
            connection_future = asyncio.Future()
            
            def on_connect():
                if not connection_future.done():
                    connection_future.set_result(True)
                    
            def on_error(error):
                if not connection_future.done():
                    connection_future.set_exception(WebSocketConnectionError(str(error)))
                    
            # Add connection status handlers
            self.market_hub_connection.on_open(on_connect)
            self.market_hub_connection.on_error(on_error)
            
            # Start the connection
            self.market_hub_connection.start()
            
            try:
                # Wait for connection with timeout
                await asyncio.wait_for(connection_future, timeout=30.0)
                logger.info("Connected to ProjectX Market Hub")
                return self.market_hub_connection # Return the connection object on success
            except asyncio.TimeoutError:
                raise WebSocketConnectionError("Connection timeout")
            except Exception as e:
                raise WebSocketConnectionError(f"Connection failed: {str(e)}")
            
        except Exception as e:
            logger.error(f"Failed to connect to Market Hub: {str(e)}")
            if self.market_hub_connection:
                try:
                    self.market_hub_connection.stop()
                except:
                    pass
                self.market_hub_connection = None
            raise WebSocketConnectionError(f"Failed to connect to Market Hub: {str(e)}")
            
    async def disconnect_market_hub(self):
        """Disconnect from the ProjectX Market Hub."""
        if self.market_hub_connection is not None:
            try:
                self.market_hub_connection.stop()
            except Exception as e:
                logger.error(f"Error disconnecting from Market Hub: {str(e)}")
            finally:
                self.market_hub_connection = None
                logger.info("Disconnected from ProjectX Market Hub")
            
    async def subscribe_contract_trades(self, contract_id: str):
        """
        Subscribe to trades for a specific contract.
        
        Args:
            contract_id: Contract ID to subscribe to
            
        Raises:
            WebSocketConnectionError: If not connected to the Market Hub
        """
        if self.market_hub_connection is None:
            raise WebSocketConnectionError("Not connected to Market Hub")
            
        try:
            # The signalrcore library's send method is not async
            self.market_hub_connection.send("SubscribeContractTrades", [contract_id])
                
            logger.info(f"Subscribed to trades for contract: {contract_id}")
        except Exception as e:
            logger.error(f"Failed to subscribe to trades: {str(e)}")
            raise WebSocketConnectionError(f"Failed to subscribe to trades: {str(e)}")
            
    def register_trade_callback(self, callback: Callable[[Trade], None]):
        """
        Register a callback for trade events.
        
        Args:
            callback: Function to call when a trade event is received
        """
        self.trade_callbacks.append(callback)
        
    def _handle_trade_event(self, args: List[Any]):
        """
        Handle a trade event from the Market Hub.
        The 'args' parameter is a list from the SignalR message.
        Example: ['CON.F.US.MES.M25', [{'symbolId': 'F.US.MES', 'price': ...}]]
        """
        if not isinstance(args, list) or len(args) < 2:
            logger.warning(f"Received malformed trade event args: {args}")
            return

        contract_id = args[0]
        trade_data_list = args[1]

        if not isinstance(trade_data_list, list):
            logger.warning(f"Expected list for trade data, got {type(trade_data_list)}")
            return
            
        for trade_item in trade_data_list:
            try:
                # Parse the trade data
                trade = Trade(
                    contract_id=contract_id,
                    timestamp=datetime.fromisoformat(trade_item.get("timestamp", datetime.now().isoformat())),
                    price=trade_item.get("price", 0.0),
                    volume=trade_item.get("volume", 0.0)
                )
                
                # Call all registered callbacks
                for callback in self.trade_callbacks:
                    try:
                        callback(trade)
                    except Exception as e:
                        logger.error(f"Error in trade callback: {str(e)}")
                        
            except Exception as e:
                logger.error(f"Error handling single trade item: {str(e)}", exc_info=True)
            
    def _handle_quote_event(self, args: List[Any]):
        """
        Handle a quote event from the Market Hub.
        The 'args' parameter is a list from the SignalR message.
        """
        if not isinstance(args, list) or len(args) < 2:
            logger.warning(f"Received malformed quote event args: {args}")
            return
            
        contract_id = args[0]
        quote_data = args[1]
        
        # Placeholder for quote processing logic
        # For now, we'll just log it to confirm it's being received correctly.
        logger.debug(f"Quote received for {contract_id}: {quote_data}")
        
    def _handle_depth_event(self, contract_id: str, data: Dict[str, Any]):
        """
        Handle a market depth event from the Market Hub.
        
        Args:
            contract_id: Contract ID the depth data belongs to
            data: Market depth data from the API
        """
        # Implementation for handling market depth
        pass
