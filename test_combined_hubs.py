import logging
import time
import os
import sys
import requests
import json
from signalrcore.hub_connection_builder import HubConnectionBuilder

# --- Configuration ---
MARKET_HUB_URL_BASE = 'wss://rtc.topstepx.com/hubs/market'
USER_HUB_URL_BASE = 'wss://rtc.topstepx.com/hubs/user'
CONTRACT_ID = 'CON.F.US.MES.M25' # Example for Market Hub
SELECTED_ACCOUNT_ID = 7896035     # Example for User Hub

# --- Token Generation Configuration ---
LOGIN_URL = "https://api.topstepx.com/api/Auth/loginKey"
API_KEY_ENV_VAR = "PROJECTX_API_TOKEN" # Environment variable for the API Key
USERNAME_FOR_TOKEN_GENERATION = "kevtrinh" # Hardcoded username for token generation

# --- Global JWT Token ---
JWT_TOKEN = None

# --- Logging Setup ---
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(hub)s - %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

class HubSpecificFormatter(logging.Formatter):
    def format(self, record):
        record.hub = getattr(record, 'hub', 'General')
        return super().format(record)

if logger.handlers:
    logger.handlers[0].setFormatter(HubSpecificFormatter('%(asctime)s - %(name)s - %(levelname)s - %(hub)s - %(message)s'))

# Configure parent loggers for SignalRCoreClient to prevent duplicate messages if they also have handlers
# signalr_client_logger = logging.getLogger("SignalRCoreClient")
# signalr_client_logger.propagate = False # This will be done after connections are made

# --- Function to Generate and Get Session JWT Token ---
def generate_and_get_session_token():
    logger.info("Attempting to generate a new session token...", extra={'hub': 'Auth'})
    api_key = os.environ.get(API_KEY_ENV_VAR)
    
    if not api_key:
        logger.error(f"CRITICAL: API Key environment variable {API_KEY_ENV_VAR} is not set. Cannot generate session token.", extra={'hub': 'Auth'})
        print(f"Error: The environment variable {API_KEY_ENV_VAR} must be set with your API key to generate a session token.")
        return None
    
    logger.info(f"Using API Key from {API_KEY_ENV_VAR} and username '{USERNAME_FOR_TOKEN_GENERATION}' for session token generation.", extra={'hub': 'Auth'})

    headers = {
        "accept": "text/plain",
        "Content-Type": "application/json"
    }
    payload = {
        "userName": USERNAME_FOR_TOKEN_GENERATION,
        "apiKey": api_key
    }
    response_obj = None # Initialize response_obj to ensure it's defined in except blocks
    try:
        response_obj = requests.post(LOGIN_URL, headers=headers, json=payload, timeout=10)
        response_obj.raise_for_status()
        response_data = response_obj.json()

        if response_data.get("success") and response_data.get("errorCode") == 0:
            session_token = response_data.get("token")
            if session_token:
                logger.info("Successfully obtained new session token.", extra={'hub': 'Auth'})
                return session_token
            else:
                logger.error("Session token not found in successful API response.", extra={'hub': 'Auth'})
                logger.debug(f"Full API response: {response_data}", extra={'hub': 'Auth'})
                return None
        else:
            error_message = response_data.get("errorMessage", "Unknown error during token generation")
            error_code = response_data.get("errorCode", "N/A")
            logger.error(f"Error obtaining session token. API Error Code: {error_code}, Message: {error_message}", extra={'hub': 'Auth'})
            logger.debug(f"Full API response: {response_data}", extra={'hub': 'Auth'})
            return None
            
    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error occurred during session token generation: {http_err}", extra={'hub': 'Auth'})
        if response_obj is not None and hasattr(response_obj, 'text'):
             logger.debug(f"Response content: {response_obj.text}", extra={'hub': 'Auth'})
    except requests.exceptions.ConnectionError as conn_err:
        logger.error(f"Connection error during session token generation: {conn_err}", extra={'hub': 'Auth'})
    except requests.exceptions.Timeout as timeout_err:
        logger.error(f"Request timed out during session token generation: {timeout_err}", extra={'hub': 'Auth'})
    except requests.exceptions.RequestException as req_err:
        logger.error(f"Request exception occurred during session token generation: {req_err}", extra={'hub': 'Auth'})
    except json.JSONDecodeError:
        logger.error("Failed to decode JSON response from token server.", extra={'hub': 'Auth'})
        if response_obj is not None and hasattr(response_obj, 'text'):
            logger.debug(f"Response text: {response_obj.text}", extra={'hub': 'Auth'})
    return None

# --- Connection Setup for a Generic Hub ---
def create_hub_connection(hub_name, hub_url_base, access_token):
    hub_full_url = f"{hub_url_base}?access_token={access_token}"
    logger.info(f"Preparing to connect to {hub_name}: {hub_full_url}", extra={'hub': hub_name})

    connection = HubConnectionBuilder() \
        .with_url(hub_full_url, options={
            "skip_negotiation": True,
            "access_token_factory": lambda: access_token
        }) \
        .configure_logging(logging.DEBUG) \
        .with_automatic_reconnect({
            "type": "interval",
            "keep_alive_interval": 10,
            "intervals": [0, 2, 5, 10, 15, 30, 60]
        }) \
        .build()
    
    # The HubSpecificFormatter on the main logger should now correctly
    # capture and format messages from the signalrcore client loggers,
    # as they usually log to child loggers of the root or a named logger
    # that our main logger can capture if its level is appropriate.

    # Generic Event Handlers
    def on_open():
        logger.info(f"Connection opened.", extra={'hub': hub_name})
        # Trigger subscription after connection is open
        if hub_name == "MarketHub":
            subscribe_market_events(connection)
        elif hub_name == "UserHub":
            logger.info(f"UserHub opened. Waiting 1 second before subscribing to user events...", extra={'hub': "UserHub"})
            time.sleep(1) # Delay before UserHub subscribes
            subscribe_user_events(connection)

    def on_close():
        logger.info(f"Connection closed.", extra={'hub': hub_name})

    def on_error(err):
        logger.error(f"Hub Error: {err}", extra={'hub': hub_name})
    
    def on_reconnected():
        logger.info(f"Connection Reconnected. Resubscribing...", extra={'hub': hub_name})
        if hub_name == "MarketHub":
            subscribe_market_events(connection)
        elif hub_name == "UserHub":
            subscribe_user_events(connection)

    connection.on_open(on_open)
    connection.on_close(on_close)
    connection.on_error(on_error)
    connection.on_reconnect(on_reconnected)

    # Specific message handlers
    if hub_name == "MarketHub":
        connection.on("GatewayQuote", lambda args: logger.info(f"Received GatewayQuote: {args}", extra={'hub': hub_name}))
        # Add other Market Hub handlers if needed for basic test
        connection.on("GatewayTrade", lambda args: logger.info(f"Received GatewayTrade: {args}", extra={'hub': hub_name}))
        connection.on("GatewayDepth", lambda args: logger.info(f"Received GatewayDepth: {args}", extra={'hub': hub_name}))
    elif hub_name == "UserHub":
        connection.on("GatewayUserAccount", lambda args: logger.info(f"Received GatewayUserAccount: {args}", extra={'hub': hub_name}))
        connection.on("GatewayUserOrder", lambda args: logger.info(f"Received GatewayUserOrder: {args}", extra={'hub': hub_name}))
        connection.on("GatewayUserPosition", lambda args: logger.info(f"Received GatewayUserPosition: {args}", extra={'hub': hub_name}))
        connection.on("GatewayUserTrade", lambda args: logger.info(f"Received GatewayUserTrade: {args}", extra={'hub': hub_name}))
        connection.on("GatewayLogout", lambda args: logger.warning(f"Received GatewayLogout: {args}. Session may be terminated.", extra={'hub': hub_name}))
        # Add other User Hub handlers if needed

    return connection

# --- Subscription Logic ---
def subscribe_market_events(connection):
    try:
        logger.info(f"Attempting to subscribe to Quotes for {CONTRACT_ID}", extra={'hub': "MarketHub"})
        connection.send('SubscribeContractQuotes', [CONTRACT_ID], lambda msg: logger.info(f"MarketHub SubscribeContractQuotes CB: {msg}", extra={'hub': "MarketHub"}))
        logger.info(f"Sent SubscribeContractQuotes for {CONTRACT_ID}", extra={'hub': "MarketHub"})
        # Example for multiple subscriptions on MarketHub, each with its own callback
        # connection.send('SubscribeContractTrades', [CONTRACT_ID], lambda msg: logger.info(f"MarketHub SubscribeContractTrades CB: {msg}", extra={'hub': "MarketHub"}))
        # logger.info(f"Sent SubscribeContractTrades for {CONTRACT_ID}", extra={'hub': "MarketHub"})
    except Exception as e:
        logger.error(f"Error sending MarketHub subscription: {e}", extra={'hub': "MarketHub"})

def subscribe_user_events(connection):
    try:
        logger.info(f"Attempting to subscribe to Accounts", extra={'hub': "UserHub"})
        connection.send('SubscribeAccounts', [], lambda msg: logger.info(f"UserHub SubscribeAccounts CB: {msg}", extra={'hub': "UserHub"}))
        logger.info(f"Sent SubscribeAccounts request", extra={'hub': "UserHub"})
        
        time.sleep(0.1) # Small delay between sends, just in case

        logger.info(f"Attempting to subscribe to Orders for Account ID: {SELECTED_ACCOUNT_ID}", extra={'hub': "UserHub"})
        connection.send('SubscribeOrders', [SELECTED_ACCOUNT_ID], lambda msg: logger.info(f"UserHub SubscribeOrders CB: {msg}", extra={'hub': "UserHub"}))
        logger.info(f"Sent SubscribeOrders for Account ID: {SELECTED_ACCOUNT_ID}", extra={'hub': "UserHub"})
        
        time.sleep(0.1) # Small delay

        logger.info(f"Attempting to subscribe to Positions for Account ID: {SELECTED_ACCOUNT_ID}", extra={'hub': "UserHub"})
        connection.send('SubscribePositions', [SELECTED_ACCOUNT_ID], lambda msg: logger.info(f"UserHub SubscribePositions CB: {msg}", extra={'hub': "UserHub"}))
        logger.info(f"Sent SubscribePositions for Account ID: {SELECTED_ACCOUNT_ID}", extra={'hub': "UserHub"})

    except Exception as e:
        logger.error(f"Error sending UserHub subscription(s): {e}", exc_info=True, extra={'hub': "UserHub"})


# --- Main Execution ---
if __name__ == "__main__":
    print("--- Combined Hubs Client Test ---")
    print("This script will attempt to generate a new session token using your API key")
    print(f"(from env var {API_KEY_ENV_VAR}) and username '{USERNAME_FOR_TOKEN_GENERATION}',")
    print("then connect to both Market and User hubs simultaneously.")
    print("IMPORTANT: Ensure you are logged OUT of the TopstepX web platform on all devices.")

    JWT_TOKEN = generate_and_get_session_token()
    if not JWT_TOKEN:
        logger.critical("No JWT Session Token was generated. Exiting.", extra={'hub': 'Setup'})
        print("Failed to generate a session token. Please check logs and ensure API key is correctly set in environment.")
        sys.exit(1)

    market_hub_connection = create_hub_connection("MarketHub", MARKET_HUB_URL_BASE, JWT_TOKEN)
    user_hub_connection = create_hub_connection("UserHub", USER_HUB_URL_BASE, JWT_TOKEN)

    # Attempt to prevent duplicate logging from SignalRCoreClient
    # by setting propagate to False on its main logger.
    # This should be done after the connections call .configure_logging()
    # logging.getLogger("SignalRCoreClient").propagate = False # Temporarily removed for this test
    # For more granular control if needed:
    # logging.getLogger("SignalRCoreClient.transports.websockets").propagate = False

    try:
        logger.info("Starting MarketHub connection...", extra={'hub': "MarketHub"})
        market_hub_connection.start()
        # MarketHub's on_open will trigger its subscriptions.
        # We'll wait a moment to ensure that has happened.
        logger.info("Waiting 2 seconds for MarketHub to subscribe...", extra={'hub': 'Main'})
        time.sleep(2)

        logger.info("Re-creating UserHub connection object before starting...", extra={'hub': 'Main'})
        try:
            logger.info("Stopping existing UserHub connection (if any state exists)...", extra={'hub': 'UserHub'})
            user_hub_connection.stop() # Ensure it's stopped if it had any prior latent state
            logger.info("Existing UserHub connection stopped.", extra={'hub': 'UserHub'})
        except Exception as e:
            logger.info(f"Exception while stopping pre-existing UserHub placeholder: {e}", extra={'hub': 'UserHub'})
        
        user_hub_connection = create_hub_connection("UserHub", USER_HUB_URL_BASE, JWT_TOKEN)
        # Re-apply the propagate=False for the new UserHub connection's logger if needed,
        # but let's see default logging first.
        # logging.getLogger("SignalRCoreClient").propagate = False # For the new instance too?

        logger.info("Starting UserHub connection (newly created object)...", extra={'hub': "UserHub"})
        user_hub_connection.start()

        logger.info("Both connection processes initiated. Press Ctrl+C to disconnect and exit.", extra={'hub': 'Main'})
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Disconnecting due to KeyboardInterrupt...", extra={'hub': 'Main'})
    except Exception as e:
        logger.error(f"Failed during main execution: {e}", exc_info=True, extra={'hub': 'Main'})
    finally:
        logger.info("Attempting to stop connections...", extra={'hub': 'Main'})
        try:
            # if market_hub_connection.transport_connected: # Removed this check
            market_hub_connection.stop()
            logger.info("MarketHub connection stopped.", extra={'hub': "MarketHub"})
        except Exception as e:
            logger.error(f"Error stopping MarketHub connection: {e}", extra={'hub': "MarketHub"})
        
        try:
            # if user_hub_connection.transport_connected: # Removed this check
            user_hub_connection.stop()
            logger.info("UserHub connection stopped.", extra={'hub': "UserHub"})
        except Exception as e:
            logger.error(f"Error stopping UserHub connection: {e}", extra={'hub': "UserHub"})
        
        logger.info("All connections attempts finished.", extra={'hub': 'Main'}) 