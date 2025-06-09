import logging
import time
import os
import sys
from signalrcore.hub_connection_builder import HubConnectionBuilder

# --- Configuration ---
# IMPORTANT: Ensure PROJECTX_API_TOKEN_SESSION environment variable is set OR you provide the token when prompted.
JWT_TOKEN = os.environ.get("PROJECTX_API_TOKEN_SESSION")
# Fallback hardcoded token (primarily for dev, should be replaced by env var or prompt)
DEFAULT_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjQyODE1IiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvc2lkIjoiZTQ1NDQzZGEtMjM1ZC00MTk0LTkwMGItYmYzYzQ2ZDZlNTcyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6ImtldnRyaW5oIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjoidXNlciIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvYXV0aGVudGljYXRpb25tZXRob2QiOiJhcGkta2V5IiwibXNkIjpbIkNNRUdST1VQX1RPQiIsIkNNRV9UT0IiXSwibWZhIjoidmVyaWZpZWQiLCJleHAiOjE3NDc3MDgwMjB9.elYsmE1FPVOvcjJDAsQcztf_3af1IBF66URsN7u-Erc'

MARKET_HUB_URL_BASE = 'wss://rtc.topstepx.com/hubs/market'  # Base URL without token
CONTRACT_ID = 'CON.F.US.MES.M25'  # Example contract ID

# --- Logging Setup ---
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers: # Avoid adding multiple handlers
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

# --- Function to get JWT Token ---
def get_jwt_token():
    token = os.environ.get("PROJECTX_API_TOKEN_SESSION")
    if token:
        logger.info("Using JWT token from PROJECTX_API_TOKEN_SESSION environment variable.")
        return token
    else:
        logger.info("PROJECTX_API_TOKEN_SESSION environment variable not found or is empty.")
        print("--- ProjectX Market Hub Connection ---")
        print("IMPORTANT: To ensure a stable connection, please make sure you are logged OUT of the TopstepX web platform.")
        print("You can obtain a fresh session token by running the 'generate_jwt_token.py' script,")
        print("or by other methods if you are familiar (e.g., browser developer tools after logging into the platform).")
        
        while True:
            token_input = input("Please paste your ProjectX SESSION token here and press Enter: ")
            if token_input and token_input.strip():
                logger.info("Using JWT token provided via prompt.")
                return token_input.strip()
            else:
                print("Token cannot be empty. Please paste a valid token.")

# --- SignalR Connection Setup ---
def setup_signalr_connection():
    global JWT_TOKEN # Allow modification of the global JWT_TOKEN
    JWT_TOKEN = get_jwt_token()

    if not JWT_TOKEN:
        logger.error("CRITICAL: No JWT_TOKEN available. Exiting.")
        sys.exit(1) # Exit if no token could be obtained
    
    # Construct the full URL with the access token
    market_hub_full_url = f"{MARKET_HUB_URL_BASE}?access_token={JWT_TOKEN}"

    logger.info(f"Attempting to connect to Market Hub: {market_hub_full_url} for contract {CONTRACT_ID}") # Log the full URL
    logger.info(f"Using JWT_TOKEN (first 10 chars): {JWT_TOKEN[:10]}... for Authorization header via factory (and in URL)")

    # Build the connection
    connection = HubConnectionBuilder() \
        .with_url(market_hub_full_url, options={ # Use the full URL
            "skip_negotiation": True, # As per JS example
            "access_token_factory": lambda: JWT_TOKEN, # Still provide factory, as in JS example
            "headers": {
                # "User-Agent": "PythonSignalRClient/0.9.5"
            }
        }) \
        .configure_logging(logging.DEBUG) \
        .with_automatic_reconnect({
            "type": "interval",
            "keep_alive_interval": 10,  # seconds
            "intervals": [0, 2, 5, 10, 15, 30, 60] # seconds
        }) \
        .build()

    # --- Event Handlers ---
    def on_gateway_quote(message_args):
        try:
            contract_id = message_args[0] if isinstance(message_args, list) and len(message_args) > 0 else "N/A"
            quote_data = message_args[1] if isinstance(message_args, list) and len(message_args) > 1 else message_args
            logger.info(f"Received GatewayQuote for {contract_id}: {quote_data}")
        except Exception as e:
            logger.error(f"Error processing GatewayQuote: {message_args}, Error: {e}")

    def on_gateway_trade(message_args):
        try:
            contract_id = message_args[0] if isinstance(message_args, list) and len(message_args) > 0 else "N/A"
            trade_data = message_args[1] if isinstance(message_args, list) and len(message_args) > 1 else message_args
            logger.info(f"Received GatewayTrade for {contract_id}: {trade_data}")
        except Exception as e:
            logger.error(f"Error processing GatewayTrade: {message_args}, Error: {e}")

    def on_gateway_depth(message_args):
        try:
            contract_id = message_args[0] if isinstance(message_args, list) and len(message_args) > 0 else "N/A"
            depth_data = message_args[1] if isinstance(message_args, list) and len(message_args) > 1 else message_args
            logger.info(f"Received GatewayDepth for {contract_id}: {depth_data}")
        except Exception as e:
            logger.error(f"Error processing GatewayDepth: {message_args}, Error: {e}")

    connection.on("GatewayQuote", on_gateway_quote)
    connection.on("GatewayTrade", on_gateway_trade)
    connection.on("GatewayDepth", on_gateway_depth)

    # --- Subscribe Logic ---
    def subscribe_to_events():
        logger.info(f"Attempting to subscribe to events for {CONTRACT_ID}")
        try:
            connection.send('SubscribeContractQuotes', [CONTRACT_ID])
            logger.info(f"Successfully sent subscription request for Quotes on {CONTRACT_ID}")
            connection.send('SubscribeContractTrades', [CONTRACT_ID])
            logger.info(f"Successfully sent subscription request for Trades on {CONTRACT_ID}")
            connection.send('SubscribeContractMarketDepth', [CONTRACT_ID])
            logger.info(f"Successfully sent subscription request for Market Depth on {CONTRACT_ID}")
        except Exception as e:
            logger.error(f"Error sending subscription requests for {CONTRACT_ID}: {e}")

    # --- Connection Lifecycle Callbacks ---
    def on_connection_open():
        logger.info("SignalR connection opened. Subscribing to events...")
        subscribe_to_events()

    def on_connection_close():
        logger.info("SignalR connection closed.")

    def on_reconnected():
        logger.info("RTC Connection Reconnected. Resubscribing...")
        subscribe_to_events()

    connection.on_reconnect(on_reconnected)

    def on_error(err):
        logger.error(f"SignalR Hub Error or Message Processing Error: {err}")

    connection.on_error(on_error)
    connection.on_open(on_connection_open) # Register the on_open handler
    connection.on_close(on_connection_close) # Register the on_close handler

    # --- Start Connection and Keep Alive ---
    try:
        logger.info("Starting SignalR connection...")
        connection.start()  # This is a blocking call
        # logger.info("SignalR connection process initiated. Subscribing to events...") # Moved to on_open
        # subscribe_to_events() # Moved to on_open

        logger.info("Connection process started. Listening for messages if connection succeeds. Press Ctrl+C to disconnect and exit.")
        while True: # Keep the main thread alive
            time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Disconnecting due to KeyboardInterrupt...")
    except Exception as e:
        logger.error(f"Failed to start or maintain SignalR connection: {e}", exc_info=True)
    finally:
        logger.info("Attempting to stop SignalR connection...")
        try:
            connection.stop()
            logger.info("SignalR connection stopped successfully.")
        except Exception as e:
            logger.error(f"Error during connection.stop(): {e}", exc_info=True)
            logger.info("Connection might have already been closed or was not fully initialized.")

# --- Main Execution ---
if __name__ == "__main__":
    print("--- Market Hub Client ---")
    print("This script connects to the TopstepX Market Hub to stream market data.")
    print("IMPORTANT: Ensure you are logged OUT of the TopstepX web platform on all devices before running this script.")
    print("A valid session token is required. The script will check for the PROJECTX_API_TOKEN_SESSION env variable,")
    print("or prompt you to enter one if it's not found.\n")
    setup_signalr_connection() 