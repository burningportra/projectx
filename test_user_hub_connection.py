import logging
import time
import os
import sys
# import threading # No longer needed for this approach
from signalrcore.hub_connection_builder import HubConnectionBuilder

# --- Configuration ---
# IMPORTANT: Ensure PROJECTX_API_TOKEN_SESSION environment variable is set to your SESSION TOKEN
JWT_TOKEN = os.environ.get("PROJECTX_API_TOKEN_SESSION", "") # Default to empty string
USER_HUB_URL_BASE = 'wss://rtc.topstepx.com/hubs/user'
SELECTED_ACCOUNT_ID = 7896035

# --- Logging Setup ---
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

# --- SignalR Connection Setup ---
def setup_user_hub_connection():
    if not JWT_TOKEN:
        logger.warning("CRITICAL: JWT_TOKEN is empty. Please ensure the PROJECTX_API_TOKEN_SESSION environment variable is set with your valid session token, or update the hardcoded token in the script if not using an env var.")
        # Depending on requirements, you might want to exit here if no token is available.
        # For this test, we'll let it proceed, but it will likely fail authentication.
    elif JWT_TOKEN == 'INVALID_TOKEN_PLEASE_REPLACE_OR_SET_ENV_VAR': # Legacy check, just in case
        logger.warning("CRITICAL: Using an invalid placeholder JWT_TOKEN. Update script or set PROJECTX_API_TOKEN_SESSION.")

    if SELECTED_ACCOUNT_ID == 123:
        logger.warning(f"Using a placeholder SELECTED_ACCOUNT_ID: {SELECTED_ACCOUNT_ID}. Please update.")

    user_hub_full_url = f"{USER_HUB_URL_BASE}?access_token={JWT_TOKEN}"
    logger.info(f"Attempting to connect to User Hub: {user_hub_full_url}")
    logger.info(f"Using JWT_TOKEN (first 10 chars): {JWT_TOKEN[:10]}...")

    connection = HubConnectionBuilder() \
        .with_url(user_hub_full_url, options={
            "skip_negotiation": True,
            "access_token_factory": lambda: JWT_TOKEN
        }) \
        .configure_logging(logging.DEBUG) \
        .with_automatic_reconnect({
            "type": "interval",
            "keep_alive_interval": 10,
            "intervals": [0, 2, 5, 10, 15, 30, 60]
        }) \
        .build()

    # --- Event Handlers ---
    def on_gateway_user_account(message_args):
        data = message_args[0] if isinstance(message_args, list) else message_args
        logger.info(f"Received GatewayUserAccount: {data}")

    def on_gateway_user_order(message_args):
        data = message_args[0] if isinstance(message_args, list) else message_args
        logger.info(f"Received GatewayUserOrder: {data}")

    def on_gateway_user_position(message_args):
        data = message_args[0] if isinstance(message_args, list) else message_args
        logger.info(f"Received GatewayUserPosition: {data}")

    def on_gateway_user_trade(message_args):
        data = message_args[0] if isinstance(message_args, list) else message_args
        logger.info(f"Received GatewayUserTrade: {data}")

    def on_gateway_logout(message_args):
        message = message_args[0] if isinstance(message_args, list) and message_args else str(message_args)
        logger.warning(f"Received GatewayLogout: {message}. The server has disconnected this session.")
        # Optionally, you could trigger a clean shutdown of the script here.

    connection.on("GatewayUserAccount", on_gateway_user_account)
    connection.on("GatewayUserOrder", on_gateway_user_order)
    connection.on("GatewayUserPosition", on_gateway_user_position)
    connection.on("GatewayUserTrade", on_gateway_user_trade)
    connection.on("GatewayLogout", on_gateway_logout)

    # --- Subscribe Logic ---
    def on_subscribe_accounts_complete(message): # Callback for SubscribeAccounts
        logger.info(f"SubscribeAccounts completion/callback received: {message}")

    def on_subscribe_orders_complete(message): # Callback for SubscribeOrders
        logger.info(f"SubscribeOrders completion/callback received: {message}")

    def subscribe_to_user_events():
        # logger.info(f"Attempting ONLY SubscribeAccounts with a callback.")
        logger.info(f"Attempting ONLY SubscribeOrders (no explicit callback) for Account ID: {SELECTED_ACCOUNT_ID}.")
        try:
            # connection.send('SubscribeAccounts', [], on_subscribe_accounts_complete)
            # logger.info(f"Sent SubscribeAccounts request (with callback).")
            
            connection.send('SubscribeOrders', [SELECTED_ACCOUNT_ID]) # Removed explicit callback
            logger.info(f"Sent SubscribeOrders for Account ID: {SELECTED_ACCOUNT_ID} (no explicit callback).")
            
            # logger.info("Only SubscribeAccounts request was sent.")
            logger.info("Only SubscribeOrders request was sent.")
        except Exception as e:
            logger.error(f"Error sending SubscribeOrders request: {e}", exc_info=True)

    # --- Connection Lifecycle Callbacks ---
    def on_connection_open():
        logger.info("User Hub SignalR connection opened. Subscribing to events...")
        subscribe_to_user_events()

    def on_connection_close():
        logger.info("User Hub SignalR connection closed.")
        
    def on_reconnected():
        logger.info("User Hub RTC Connection Reconnected. Resubscribing...")
        subscribe_to_user_events() # Resubscribe on reconnect

    connection.on_reconnect(on_reconnected)

    def on_error(err):
        logger.error(f"User Hub SignalR Error: {err}")

    connection.on_error(on_error)
    connection.on_open(on_connection_open)
    connection.on_close(on_connection_close)

    # --- Start Connection and Keep Alive ---
    try:
        logger.info("Starting User Hub SignalR connection...")
        connection.start()
        logger.info("User Hub connection process started. Press Ctrl+C to disconnect.")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Disconnecting User Hub due to KeyboardInterrupt...")
    except Exception as e:
        logger.error(f"Failed to start or maintain User Hub SignalR connection: {e}", exc_info=True)
    finally:
        logger.info("Attempting to stop User Hub SignalR connection...")
        try:
            connection.stop()
            logger.info("User Hub SignalR connection stopped successfully.")
        except Exception as e:
            logger.error(f"Error during User Hub connection.stop(): {e}", exc_info=True)

# --- Main Execution ---
if __name__ == "__main__":
    # Basic check, user should ensure token is set via env var primarily
    if not os.environ.get("PROJECTX_API_TOKEN_SESSION"):
        print("--- WARNING: Environment variable PROJECTX_API_TOKEN_SESSION is not set. ---")
        print("--- The script will use the hardcoded fallback token if available, or an empty token. ---")
        print("--- For reliable operation, please set PROJECTX_API_TOKEN_SESSION. ---")

    if SELECTED_ACCOUNT_ID == 123:
        print("--- IMPORTANT: SELECTED_ACCOUNT_ID is set to a placeholder (123). ---")
        print("--- Please update it in the script with your actual account ID. ---")
    setup_user_hub_connection() 