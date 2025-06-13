import sys
sys.stderr.write("Broadcaster.py: Top of file reached (stderr)\n")
sys.stderr.flush()

import asyncio
import asyncpg
import websockets
import json
import logging
import os
from dotenv import load_dotenv
from typing import Optional

sys.stderr.write("Broadcaster.py: Imports done (stderr)\n")
sys.stderr.flush()

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("OHLCBroadcaster")
logger.info("Broadcaster.py: Logging configured.") # This uses the logger
logger.setLevel(logging.INFO) # Set level for OHLCBroadcaster to INFO to see connection logs

# --- Add File Handler ---
log_file_path = os.path.join(os.path.dirname(__file__), '..', '..', 'logs', 'broadcaster.log')
os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
file_handler = logging.FileHandler(log_file_path)
file_handler.setLevel(logging.INFO) # Log INFO and above to file
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logging.getLogger().addHandler(file_handler) # Add to root logger to catch all
logger.info(f"Broadcaster.py: Also logging to {log_file_path}") # Confirm file logging setup
# --- End Add File Handler ---

# --- Configuration ---
def load_db_config():
    # Load .env from the project root
    dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env') # ../../.env
    load_dotenv(dotenv_path=dotenv_path)
    
    # Basic config, assuming similar env var names as LiveIngester for local DB
    return {
        'host': os.getenv("LOCAL_DB_HOST", "localhost"),
        'port': int(os.getenv("LOCAL_DB_PORT", 5432)),
        'user': os.getenv("LOCAL_DB_USER", "postgres"),
        'password': os.getenv("LOCAL_DB_PASSWORD", "password"), # Ensure this is set in .env
        'database': os.getenv("LOCAL_DB_NAME", "projectx_test")
    }

DB_CONFIG = load_db_config()
WEBSOCKET_HOST = os.getenv("WEBSOCKET_HOST", "localhost") # Or "0.0.0.0" to listen on all interfaces
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT", 8765))

# Ensure password is loaded
if DB_CONFIG.get('password') is None:
    logger.critical("LOCAL_DB_PASSWORD not found in .env file. Broadcaster cannot connect to DB.")
    # In a real app, you might exit here or raise an exception
    # For now, it will fail when trying to connect.

# --- WebSocket Handling ---
connected_clients = set()

async def register_client(websocket):
    connected_clients.add(websocket)
    logger.info(f"Client connected: {websocket.remote_address}. Total clients: {len(connected_clients)}")
    try:
        # Keep the connection open and listen for any messages from the client (optional)
        # If you expect client messages, you'd have a loop here: async for message in websocket:
        await websocket.wait_closed() # Keeps the handler alive until connection closes
    except websockets.exceptions.ConnectionClosedError:
        logger.info(f"Client connection closed error (expected): {websocket.remote_address}")
    except Exception as e:
        logger.error(f"Error during client handling {websocket.remote_address}: {e}")
    finally:
        connected_clients.remove(websocket)
        logger.info(f"Client disconnected: {websocket.remote_address}. Total clients: {len(connected_clients)}")

async def broadcast_message(message_json_str):
    if not connected_clients:
        return

    # Create a list of tasks for sending messages to avoid blocking on one slow client
    # We send the raw JSON string as received from NOTIFY
    tasks = [client.send(message_json_str) for client in connected_clients]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            # A client might have disconnected abruptly or there was a network issue
            # You could log the specific client if you store them in a way that allows retrieval here
            logger.warning(f"Failed to send message to a client: {result}. Consider removing client if persistent.")
            # Potentially remove problematic clients from connected_clients here

# --- PostgreSQL LISTEN/NOTIFY Handling ---
MAIN_EVENT_LOOP: Optional[asyncio.AbstractEventLoop] = None

def pg_notification_handler_threadsafe(connection, pid, channel, payload_str):
    """
    This is the actual callback from asyncpg, which may run in a different thread.
    It safely schedules the async handler to run on the main event loop.
    """
    if MAIN_EVENT_LOOP:
        asyncio.run_coroutine_threadsafe(
            pg_notification_handler_async(channel, payload_str), 
            MAIN_EVENT_LOOP
        )
    else:
        logger.error("Main event loop not available for notification handler.")

async def pg_notification_handler_async(channel, payload_str):
    """This async version of the handler does the actual work."""
    logger.info(f"Received NOTIFY on channel '{channel}'")
    try:
        json.loads(payload_str)
        await broadcast_message(payload_str)
    except json.JSONDecodeError:
        logger.error(f"Failed to decode JSON payload from NOTIFY: {payload_str}")
    except Exception as e:
        logger.error(f"Error in async notification handler: {e}", exc_info=True)

async def listen_for_db_notifications():
    conn = None
    while True: # Keep trying to connect and listen
        try:
            conn = await asyncpg.connect(**DB_CONFIG)
            logger.info("Successfully connected to PostgreSQL for LISTEN.")
            
            # Add listeners for both channels, using the thread-safe wrapper
            await conn.add_listener('ohlc_update', pg_notification_handler_threadsafe)
            logger.info("Listening for 'ohlc_update' notifications from PostgreSQL...")
            await conn.add_listener('tick_data_channel', pg_notification_handler_threadsafe)
            logger.info("Listening for 'tick_data_channel' notifications from PostgreSQL...")
            
            # Keep the connection alive and processing notifications.
            while conn and not conn.is_closed():
                await asyncio.sleep(1) # Check connection status periodically
            
            logger.warning("PostgreSQL connection closed. Attempting to reconnect...")
            if conn and not conn.is_closed():
                 await conn.remove_listener('ohlc_update', pg_notification_handler_threadsafe)
                 await conn.remove_listener('tick_data_channel', pg_notification_handler_threadsafe)
                 await conn.close()
            conn = None

        except (asyncpg.exceptions.PostgresConnectionError, ConnectionRefusedError, OSError) as e:
            logger.error(f"PostgreSQL connection failed: {e}. Retrying in 10 seconds...")
        except Exception as e:
            logger.error(f"Unexpected error in listen_for_db_notifications: {e}", exc_info=True)
            logger.info("Retrying in 10 seconds due to unexpected error...")
        finally:
            if conn and not conn.is_closed():
                try:
                    await conn.remove_listener('ohlc_update', pg_notification_handler_threadsafe)
                    await conn.remove_listener('tick_data_channel', pg_notification_handler_threadsafe)
                except Exception as e_rem:
                    logger.error(f"Error removing listeners during cleanup: {e_rem}")
                await conn.close()
                logger.info("PostgreSQL connection (finally) closed.")
            conn = None 
        await asyncio.sleep(10)

# --- Main Server ---
async def main():
    global MAIN_EVENT_LOOP
    MAIN_EVENT_LOOP = asyncio.get_running_loop()

    # Start the PostgreSQL listener
    listener_task = asyncio.create_task(listen_for_db_notifications())
    # Start the WebSocket server
    async with websockets.serve(register_client, WEBSOCKET_HOST, WEBSOCKET_PORT) as server:
        logger.info(f"WebSocket server started on ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
        await asyncio.Future() # Keep the server running indefinitely until an error or manual stop
    # If serve() exits, it means the server stopped (e.g. due to an unhandled error in serve itself)
    # Ensure listener_task is handled if main execution somehow continues past `await asyncio.Future()`
    if not listener_task.done():
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            logger.info("PostgreSQL listener task cancelled because server stopped.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Broadcaster shutting down (KeyboardInterrupt).")
    except Exception as e:
        logger.critical(f"Broadcaster critical error in __main__: {e}", exc_info=True)
