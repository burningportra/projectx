import logging
import os
import sys
import time
import datetime
import decimal # For precise arithmetic with prices
import requests
import yaml
from dotenv import load_dotenv
from signalrcore.hub_connection_builder import HubConnectionBuilder
import psycopg2
from psycopg2 import sql
import threading
from functools import partial # For callbacks
import json # Added for NOTIFY payload

# --- Constants ---
SCRIPT_NAME = "LiveIngester"
# DEFAULT_TIMEFRAME_SECONDS = 60 # No longer default, read from config

# --- Logging Setup ---
# Basic configuration, can be enhanced based on settings.yaml
logging.basicConfig(level=logging.DEBUG, # Temporarily DEBUG for detailed testing
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    handlers=[logging.StreamHandler(sys.stdout)])
logger = logging.getLogger(SCRIPT_NAME)

# --- Global Variables ---
# Dictionary to hold OHLCAggregator instances, keyed by timeframe_seconds
ohlc_aggregators = {}
# SignalR Hub Connection
hub_connection = None
# Lock for thread-safe operations on shared resources if needed, e.g., aggregators
# aggregator_lock = threading.Lock() # Consider if needed with multiple callbacks potentially

# --- Configuration Loading ---
def load_configuration():
    """Loads configuration from .env and settings.yaml"""
    # Load .env
    dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env') # ../../../.env
    if not os.path.exists(dotenv_path):
        logger.error(f".env file not found at {dotenv_path}. Please ensure it exists.")
        sys.exit(1)
    load_dotenv(dotenv_path=dotenv_path)
    logger.info(f".env file loaded from {dotenv_path}")

    # Load settings.yaml
    settings_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'config', 'settings.yaml')
    if not os.path.exists(settings_path):
        logger.error(f"settings.yaml file not found at {settings_path}. Please ensure it exists.")
        sys.exit(1)
        
    try:
        with open(settings_path, 'r') as f:
            config = yaml.safe_load(f)
        logger.info(f"Configuration loaded from {settings_path}")
    except yaml.YAMLError as e:
        logger.error(f"Error parsing settings.yaml: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Could not read settings.yaml: {e}")
        sys.exit(1)
        
    # Merge .env variables into config where appropriate (e.g., API keys, DB passwords)
    # API
    config['api']['api_key'] = os.getenv("PROJECTX_API_TOKEN")
    config['api']['username_for_token'] = os.getenv("USERNAME_FOR_TOKEN_GENERATION")
    
    # Database (Local TimescaleDB for now)
    db_type = config.get('database', {}).get('default_ingestion_db', 'local_timescaledb')
    db_config_from_yaml = config.get('database', {}).get(db_type, {})
    
    # Create a new dictionary for the active DB config to avoid modifying YAML structure directly during override
    active_db_config = {}

    if db_type == 'local_timescaledb':
        active_db_config['host'] = os.getenv("LOCAL_DB_HOST", db_config_from_yaml.get('host'))
        active_db_config['port'] = os.getenv("LOCAL_DB_PORT", db_config_from_yaml.get('port'))
        active_db_config['user'] = os.getenv("LOCAL_DB_USER", db_config_from_yaml.get('user'))
        active_db_config['password'] = os.getenv("LOCAL_DB_PASSWORD") # Must come from .env for local
        active_db_config['dbname'] = os.getenv("LOCAL_DB_NAME", db_config_from_yaml.get('dbname'))
    else:
        # For other db_types, maintain the generic lookup or define specific handling
        active_db_config['host'] = os.getenv(f"{db_type.upper()}_DB_HOST", db_config_from_yaml.get('host'))
        active_db_config['port'] = os.getenv(f"{db_type.upper()}_DB_PORT", db_config_from_yaml.get('port'))
        active_db_config['user'] = os.getenv(f"{db_type.upper()}_DB_USER", db_config_from_yaml.get('user'))
        active_db_config['password'] = os.getenv(f"{db_type.upper()}_DB_PASSWORD")
        active_db_config['dbname'] = os.getenv(f"{db_type.upper()}_DB_NAME", db_config_from_yaml.get('dbname'))
    
    config['database']['active_ingestion_db'] = active_db_config
    config['database']['active_ingestion_db_type'] = db_type

    if not config['api']['api_key'] or not config['api']['username_for_token']:
        logger.error("API key or username for token generation not found in environment variables.")
        sys.exit(1)
    if not config['database']['active_ingestion_db'].get('password'):
        logger.error(f"Database password for {db_type} not found in environment variables.")
        sys.exit(1)
        
    # Validate live_contracts configuration
    if not config.get('live_contracts') or not isinstance(config['live_contracts'], list):
        logger.error("Missing or invalid 'live_contracts' configuration in settings.yaml.")
        sys.exit(1)
    for contract_conf in config['live_contracts']:
        if 'contract_id' not in contract_conf or 'timeframes_seconds' not in contract_conf:
            logger.error("Each entry in 'live_contracts' must have 'contract_id' and 'timeframes_seconds'.")
            sys.exit(1)
        if not isinstance(contract_conf['timeframes_seconds'], list) or not contract_conf['timeframes_seconds']:
            logger.error("'timeframes_seconds' must be a non-empty list.")
            sys.exit(1)

    return config

CONFIG = load_configuration()

# --- JWT Token Generation ---
def generate_jwt_token():
    """Generates a session JWT token for SignalR."""
    logger.info("Attempting to generate session token...")
    api_config = CONFIG['api']
    headers = {"accept": "text/plain", "Content-Type": "application/json"}
    payload = {"userName": api_config['username_for_token'], "apiKey": api_config['api_key']}
    
    try:
        response = requests.post(f"{api_config['base_url']}{api_config['login_url']}", headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and data.get("token"):
            logger.info("Session token generated successfully.")
            return data["token"]
        else:
            logger.error(f"Failed to generate token: {data.get('errorMessage', 'Unknown error')}")
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error during token generation: {e}")
        return None

# --- Database Operations ---
DB_CONNECTION = None

def get_db_connection():
    """Establishes and returns a database connection."""
    global DB_CONNECTION
    if DB_CONNECTION and DB_CONNECTION.closed == 0:
        return DB_CONNECTION

    db_conf = CONFIG['database']['active_ingestion_db']
    logger.info(f"Connecting to {CONFIG['database']['active_ingestion_db_type']} database: {db_conf['dbname']} on {db_conf['host']}:{db_conf['port']}")
    try:
        DB_CONNECTION = psycopg2.connect(
            host=db_conf['host'],
            port=db_conf['port'],
            dbname=db_conf['dbname'],
            user=db_conf['user'],
            password=db_conf['password']
        )
        logger.info("Database connection successful.")
        return DB_CONNECTION
    except psycopg2.Error as e:
        logger.error(f"Database connection error: {e}")
        # Consider a retry mechanism or exit
        return None

def log_last_known_bar_timestamp(contract_id, timeframe_seconds):
    """Queries and logs the timestamp of the most recent bar for a given contract and timeframe."""
    conn = get_db_connection()
    if not conn:
        logger.warning(f"No DB connection to query last bar for {contract_id} / {timeframe_seconds}s.")
        return

    # Calculate timeframe_unit and timeframe_value from timeframe_seconds
    if timeframe_seconds >= 3600 and timeframe_seconds % 3600 == 0:
        timeframe_unit = 3
        timeframe_value = timeframe_seconds // 3600
    elif timeframe_seconds >= 60 and timeframe_seconds % 60 == 0:
        timeframe_unit = 2
        timeframe_value = timeframe_seconds // 60
    else:
        timeframe_unit = 1
        timeframe_value = timeframe_seconds

    query = sql.SQL("""
        SELECT MAX(timestamp)
        FROM ohlc_bars
        WHERE contract_id = %s AND timeframe_unit = %s AND timeframe_value = %s;
    """)
    
    last_ts = None
    try:
        with conn.cursor() as cur:
            cur.execute(query, (contract_id, timeframe_unit, timeframe_value))
            result = cur.fetchone()
            if result and result[0] is not None:
                last_ts = result[0]
        # No commit needed for SELECT
        if last_ts:
            logger.info(f"Last known bar for {contract_id} (TF: {timeframe_value} U:{timeframe_unit} - {timeframe_seconds}s) in DB: {last_ts}")
        else:
            logger.info(f"No prior bars found in DB for {contract_id} (TF: {timeframe_value} U:{timeframe_unit} - {timeframe_seconds}s).")
    except psycopg2.Error as e:
        logger.error(f"Error querying last bar for {contract_id} / {timeframe_seconds}s: {e}")
    except Exception as e:
        logger.error(f"Unexpected error querying last bar for {contract_id} / {timeframe_seconds}s: {e}")

def insert_ohlc_bar(contract_id, ts, o, h, l, c, v, timeframe_unit, timeframe_value):
    """Inserts an OHLC bar into the database and sends a NOTIFY signal."""
    conn = get_db_connection()
    if not conn:
        logger.error("No database connection available for inserting OHLC bar.")
        return

    # Make sure timestamp is timezone-aware (UTC assumed from source or converted)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=datetime.timezone.utc)

    insert_query = sql.SQL("""
        INSERT INTO ohlc_bars (contract_id, timestamp, open, high, low, close, volume, timeframe_unit, timeframe_value)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (contract_id, timestamp, timeframe_unit, timeframe_value) DO NOTHING;
    """)
    
    row_inserted = False # Initialize
    try:
        with conn.cursor() as cur:
            cur.execute(insert_query, (contract_id, ts, float(o), float(h), float(l), float(c), int(v), timeframe_unit, timeframe_value))
            row_inserted = cur.rowcount > 0

            if row_inserted:
                logger.info(f"Inserted OHLC bar for {contract_id} at {ts} (TF Val: {timeframe_value}, Unit: {timeframe_unit}) O:{o} H:{h} L:{l} C:{c} V:{v}")
            else:
                logger.info(f"OHLC bar for {contract_id} at {ts} (TF Val: {timeframe_value}, Unit: {timeframe_unit}) likely already existed or no update needed based on ON CONFLICT.")

            # Always prepare and send notification if the bar data is complete and valid
            # The INSERT ON CONFLICT ensures the bar is in the DB (either new or existing)
            logger.info(f"Attempting to send NOTIFY for completed bar: {contract_id} at {ts}")
            notify_payload_dict = {
                "type": "ohlc", 
                "contract_id": contract_id,
                "timestamp": ts.isoformat(),
                "open": float(o),
                "high": float(h),
                "low": float(l),
                "close": float(c),
                "volume": int(v),
                "timeframe_unit": timeframe_unit,
                "timeframe_value": timeframe_value
            }
            notify_payload = json.dumps(notify_payload_dict)
            notify_query = sql.SQL("SELECT pg_notify('ohlc_update', %s);")
            cur.execute(notify_query, (notify_payload,))
            logger.info(f"Executed NOTIFY ohlc_update for {contract_id} at {ts}")

        conn.commit() 
        logger.info(f"DB transaction committed for OHLC bar and NOTIFY for {contract_id} at {ts}. Row inserted: {row_inserted}")

    except psycopg2.Error as e:
        logger.error(f"Error during OHLC bar DB operation: {e}")
        if conn: conn.rollback() # Rollback on error
    except Exception as e:
        logger.error(f"Unexpected error during OHLC bar DB operation: {e}")
        if conn: conn.rollback()

def send_tick_notification(contract_id_from_stream, timestamp_dt, price_decimal, volume, message_type):
    """Sends a real-time tick notification via PostgreSQL pg_notify."""
    conn = get_db_connection()
    if not conn:
        logger.error("No database connection available for sending tick notification.")
        return

    try:
        payload_dict = {
            "type": "tick", # To differentiate from OHLC bar messages
            "contract_id": contract_id_from_stream,
            "timestamp": timestamp_dt.isoformat(),
            "price": float(price_decimal),
            "tick_type": message_type # 'quote' or 'trade'
        }
        if message_type == "trade":
            payload_dict["volume"] = float(volume) # Volume is only for trades

        notify_payload = json.dumps(payload_dict)
        
        with conn.cursor() as cur:
            # Use the new channel 'tick_data_channel'
            notify_query = sql.SQL("SELECT pg_notify('tick_data_channel', %s);")
            cur.execute(notify_query, (notify_payload,))
            conn.commit() 
            # Minimal logging for tick notifications to avoid flooding, maybe DEBUG level
            # logger.debug(f"Sent NOTIFY on 'tick_data_channel' for {contract_id_from_stream} at {timestamp_dt}")

    except psycopg2.Error as e:
        logger.error(f"Error sending tick notification: {e}")
        if conn: conn.rollback()
    except Exception as e:
        logger.error(f"Unexpected error sending tick notification: {e}")
        if conn: conn.rollback()

# --- OHLC Aggregator ---
class OHLCAggregator:
    def __init__(self, contract_id, timeframe_seconds, bar_completion_callback):
        self.contract_id = contract_id
        self.timeframe_seconds = timeframe_seconds
        self.bar_completion_callback = bar_completion_callback # Callback function
        self.current_bar_start_time = None
        self.open = None
        self.high = None
        self.low = None
        self.close = None
        self.volume = decimal.Decimal('0') # Use Decimal for volume if fractional volume is possible or for consistency
        
        if self.timeframe_seconds >= 3600 and self.timeframe_seconds % 3600 == 0:
            self.timeframe_unit = 3  # Hours
            self.timeframe_value = self.timeframe_seconds // 3600
        elif self.timeframe_seconds >= 60 and self.timeframe_seconds % 60 == 0:
            self.timeframe_unit = 2  # Minutes
            self.timeframe_value = self.timeframe_seconds // 60
        else:
            self.timeframe_unit = 1  # Seconds
            self.timeframe_value = self.timeframe_seconds
        
        log_last_known_bar_timestamp(self.contract_id, self.timeframe_seconds)
        logger.info(f"OHLC Aggregator initialized for {contract_id} with {timeframe_seconds}s timeframe (Unit: {self.timeframe_unit}, Value: {self.timeframe_value}).")

    def _get_aligned_bar_start_time(self, timestamp):
        """Calculates the start time of the bar this timestamp belongs to."""
        if timestamp.tzinfo is None or timestamp.tzinfo.utcoffset(timestamp) is None:
             timestamp = timestamp.replace(tzinfo=datetime.timezone.utc) 
        elif timestamp.tzinfo != datetime.timezone.utc:
            timestamp = timestamp.astimezone(datetime.timezone.utc)

        current_epoch_seconds = int(timestamp.timestamp())
        bar_start_epoch_seconds = current_epoch_seconds - (current_epoch_seconds % self.timeframe_seconds)
        return datetime.datetime.fromtimestamp(bar_start_epoch_seconds, tz=datetime.timezone.utc)

    def _reset_bar(self, bar_start_timestamp, price, volume_tick=decimal.Decimal('0')):
        self.current_bar_start_time = bar_start_timestamp
        # Ensure price is Decimal
        price_decimal = decimal.Decimal(str(price)) if not isinstance(price, decimal.Decimal) else price
        self.open = price_decimal
        self.high = price_decimal
        self.low = price_decimal
        self.close = price_decimal # Will be updated by each tick
        self.volume = decimal.Decimal(str(volume_tick)) if not isinstance(volume_tick, decimal.Decimal) else volume_tick
        # logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] Bar reset. Start: {self.current_bar_start_time}, O:{self.open}, V:{self.volume}") # Made too verbose

    def timeframe_unit_char(self):
        if self.timeframe_unit == 1: return "S"
        if self.timeframe_unit == 2: return "M"
        if self.timeframe_unit == 3: return "H"
        return "Unknown"

    def check_and_finalize_bar(self):
        """Checks if the current bar is valid and calls the completion callback."""
        if self.current_bar_start_time is None or self.open is None: # Bar was not even started
            logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] check_and_finalize_bar called, but no current bar to finalize or open is None.")
            return

        logger.info(
            f"[{self.contract_id} TF:{self.timeframe_value}{self.timeframe_unit_char()}] Bar completed for {self.current_bar_start_time}: "
            f"O:{self.open} H:{self.high} L:{self.low} C:{self.close} V:{self.volume}"
        )
        if self.bar_completion_callback:
            # Ensure all OHLC values are not None before callback
            if None not in [self.open, self.high, self.low, self.close] and self.volume is not None: # self.volume can be 0
                self.bar_completion_callback(
                    self.contract_id,
                    self.current_bar_start_time, # This is the timestamp FOR the bar
                    self.open, self.high, self.low, self.close, self.volume,
                    self.timeframe_unit, self.timeframe_value
                )
            else:
                logger.warning(f"[{self.contract_id} TF:{self.timeframe_seconds}s] Bar for {self.current_bar_start_time} completed but some OHLCV data is None. Skipping callback. Data: O:{self.open}, H:{self.high}, L:{self.low}, C:{self.close}, V:{self.volume}")

    def add_tick(self, timestamp, price, volume_tick=decimal.Decimal('0'), tick_type=None):
        """Adds a tick to the current bar or starts a new one. Calls callback if bar completes."""
        # Ensure timestamp is timezone-aware and UTC
        if timestamp.tzinfo is None or timestamp.tzinfo.utcoffset(timestamp) is None:
            dt_timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
        elif timestamp.tzinfo != datetime.timezone.utc:
            dt_timestamp = timestamp.astimezone(datetime.timezone.utc)
        else:
            dt_timestamp = timestamp
            
        # Ensure price and volume are Decimal
        price_decimal = decimal.Decimal(str(price)) if not isinstance(price, decimal.Decimal) else price
        volume_decimal = decimal.Decimal(str(volume_tick)) if not isinstance(volume_tick, decimal.Decimal) else volume_tick

        # logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] Received tick: {dt_timestamp} P:{price_decimal} V:{volume_decimal} Type: {tick_type}") # Made too verbose

        new_bar_start_time = self._get_aligned_bar_start_time(dt_timestamp)

        if self.current_bar_start_time is None:
            # This is the first tick ever for this aggregator
            self.current_bar_start_time = new_bar_start_time # Use the correctly aligned time
            self._reset_bar(new_bar_start_time, price_decimal, volume_decimal)
            # logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] First tick for this aggregator. New bar starting at {self.current_bar_start_time} based on tick at {dt_timestamp}.") # Made too verbose
            return

        # Check if the current tick belongs to a new bar period
        expected_bar_end_time = self.current_bar_start_time + datetime.timedelta(seconds=self.timeframe_seconds)

        if dt_timestamp >= expected_bar_end_time:
            # Current tick is for the next bar or later. Finalize the current one.
            logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] Tick at {dt_timestamp} crossed boundary for bar starting {self.current_bar_start_time} (expected end {expected_bar_end_time}). Finalizing old bar.")
            self.check_and_finalize_bar() # Finalize the existing bar
            
            # Start a new bar with the current tick's data
            previous_bar_start_time = self.current_bar_start_time # For logging
            self.current_bar_start_time = new_bar_start_time # Use the correctly aligned time for the new bar
            self._reset_bar(new_bar_start_time, price_decimal, volume_decimal)
            # logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] New bar initiated at {self.current_bar_start_time} (was {previous_bar_start_time}) due to tick at {dt_timestamp}.") # Made too verbose
            return # Bar reset, no further processing on this tick for the *old* bar

        # Tick belongs to the current bar, update HLCV
        if self.open is None: # Should ideally be caught by the first tick logic, but as a safeguard
             self._reset_bar(new_bar_start_time, price_decimal, volume_decimal) # or self.current_bar_start_time
        
        # Update H, L, C, V
        # Ensure all values are Decimal for comparison and arithmetic
        current_high = self.high if self.high is not None else decimal.Decimal('-Infinity')
        current_low = self.low if self.low is not None else decimal.Decimal('Infinity')

        self.high = max(current_high, price_decimal)
        self.low = min(current_low, price_decimal)
        self.close = price_decimal # Last price becomes the close
        self.volume += volume_decimal
        # logger.debug(f"[{self.contract_id} TF:{self.timeframe_seconds}s] Tick updated bar. H:{self.high}, L:{self.low}, C:{self.close}, V:{self.volume}") # Made too verbose


# --- SignalR Message Handlers ---
def process_single_data_item(data_item, contract_id_from_stream, message_type):
    """Processes a single quote or trade data item."""
    # data_item is a dictionary representing one quote or one trade.
    # contract_id_from_stream is the contract ID received from the SignalR message argument.

    price = None
    volume = decimal.Decimal('0')
    timestamp_str = None
    # The actual contract ID within the payload might be different (e.g. "symbol" or "symbolId")
    # but we primarily trust contract_id_from_stream for routing to aggregators.
    # We can log if they differ for diagnostics.
    
    payload_contract_id_key = "contractId" # Default, might vary, check specific message_type if needed

    if message_type == "quote":
        # Quote structure from logs: {"symbol":"F.US.MES","bestBid":5984.75,"bestAsk":5985.00,"lastUpdated":"...", "timestamp":"..."}
        # Sometimes also "lastPrice" is present.
        
        if "lastPrice" in data_item and data_item["lastPrice"] is not None: # Prefer lastPrice if available
            price = data_item.get("lastPrice")
        elif "last" in data_item and data_item["last"] is not None: # Fallback for "last" if "lastPrice" is not there
            price = data_item.get("last")
        # Use bestBid and bestAsk for mid-price calculation or direct use
        elif "bestAsk" in data_item and data_item["bestAsk"] is not None and \
             "bestBid" in data_item and data_item["bestBid"] is not None:
            try:
                # Ensure both are convertible to Decimal before calculation
                best_ask_decimal = decimal.Decimal(str(data_item["bestAsk"]))
                best_bid_decimal = decimal.Decimal(str(data_item["bestBid"]))
                price = (best_ask_decimal + best_bid_decimal) / 2
            except (TypeError, decimal.InvalidOperation) as e:
                logger.warning(f"Could not calculate mid-price from bestBid/bestAsk: {data_item.get('bestBid')}/{data_item.get('bestAsk')}. Error: {e}")
                return # Skip this tick if mid-price calculation fails
        elif "price" in data_item and data_item["price"] is not None: # Another common key for price
            price = data_item.get("price")
        elif "bestAsk" in data_item and data_item["bestAsk"] is not None: # Use bestAsk if available and others failed
            price = data_item.get("bestAsk")
        elif "bestBid" in data_item and data_item["bestBid"] is not None: # Use bestBid if available and others failed
            price = data_item.get("bestBid")
        # Fallback to older keys if absolutely necessary, though less likely with current logs
        elif "ask" in data_item and data_item["ask"] is not None:
             price = data_item.get("ask")
        elif "bid" in data_item and data_item["bid"] is not None:
             price = data_item.get("bid")

        # Timestamp for quotes: prioritize "lastUpdated" as it's more likely to be current.
        # "timestamp" might be an older (e.g., last trade) timestamp.
        timestamp_str = data_item.get("lastUpdated") 
        if not timestamp_str: timestamp_str = data_item.get("timestamp") # Fallback to "timestamp"
        if not timestamp_str: timestamp_str = data_item.get("DateTime") # Older fallback

    elif message_type == "trade":
        # Trade structure from logs: {"symbolId":"F.US.MES","price":5984.75,"timestamp":"...","type":1,"volume":1}
        # contract_id_in_payload = data_item.get("symbolId") # Example
        
        price = data_item.get("price")
        if price is None: price = data_item.get("Price")
        
        raw_volume = data_item.get("volume")
        if raw_volume is None: raw_volume = data_item.get("Volume")

        if raw_volume is not None:
            try:
                volume = decimal.Decimal(str(raw_volume))
            except decimal.InvalidOperation:
                logger.warning(f"Invalid volume format in trade data: {raw_volume} for {contract_id_from_stream}")
                volume = decimal.Decimal('0')
        
        timestamp_str = data_item.get("timestamp")
        if not timestamp_str: timestamp_str = data_item.get("DateTime")

    else:
        logger.warning(f"process_single_data_item called with unknown message_type: {message_type}")
        return

    if price is None or timestamp_str is None:
        logger.warning(f"Missing price or timestamp in {message_type} data_item for {contract_id_from_stream}: Price='{price}', Timestamp='{timestamp_str}'. Data: {data_item}")
        return

    try:
        if timestamp_str.endswith('Z'):
            timestamp_dt = datetime.datetime.fromisoformat(timestamp_str[:-1] + '+00:00')
        # Handle timestamps that might have more than 6 microsecond digits (Python's fromisoformat limitation)
        elif '.' in timestamp_str and '+' in timestamp_str.split('.')[1]: # e.g., 2025-05-19T17:15:26.1199235+00:00
            base_part, micro_tz_part = timestamp_str.split('.')
            micro_part = micro_tz_part[:6] # Truncate to 6 digits
            tz_part = micro_tz_part[len(micro_part):]
            timestamp_dt = datetime.datetime.fromisoformat(f"{base_part}.{micro_part}{tz_part}")
        elif '.' in timestamp_str and 'Z' in timestamp_str.split('.')[1]: # e.g., 2025-05-19T17:15:26.1199235Z
            base_part, micro_z_part = timestamp_str.split('.')
            micro_part = micro_z_part[:6] # Truncate to 6 digits
            timestamp_dt = datetime.datetime.fromisoformat(f"{base_part}.{micro_part}+00:00") # Assume Z is UTC
        else:
            timestamp_dt = datetime.datetime.fromisoformat(timestamp_str)
    except ValueError as e:
        logger.error(f"Could not parse timestamp '{timestamp_str}' for {contract_id_from_stream}. Error: {e}. Data: {data_item}")
        return

    if timestamp_dt.tzinfo is None or timestamp_dt.tzinfo.utcoffset(timestamp_dt) is None:
        timestamp_dt = timestamp_dt.replace(tzinfo=datetime.timezone.utc)
    elif timestamp_dt.tzinfo != datetime.timezone.utc:
        timestamp_dt = timestamp_dt.astimezone(datetime.timezone.utc)
        
    try:
        price_decimal = decimal.Decimal(str(price))
    except decimal.InvalidOperation:
        logger.error(f"Invalid price format: {price} for {contract_id_from_stream}. Data: {data_item}")
        return

    # Send raw tick notification before passing to aggregators
    send_tick_notification(contract_id_from_stream, timestamp_dt, price_decimal, volume, message_type)

    # Pass to aggregators
    for contract_config in CONFIG.get('live_contracts', []):
        if contract_config['contract_id'] == contract_id_from_stream: # Use the ID from the SignalR stream args for routing
            for tf_seconds in contract_config.get('timeframes_seconds', []):
                aggregator_key = (contract_id_from_stream, tf_seconds)
                if aggregator_key in ohlc_aggregators:
                    ohlc_aggregators[aggregator_key].add_tick(timestamp_dt, price_decimal, volume, tick_type=message_type)
                else:
                    logger.warning(f"No aggregator found for key: {aggregator_key} when processing single data item.")

def on_market_data_message(message_type, args):
    """Generic handler to process incoming market data (quotes or trades).
       Args format for GatewayQuote/GatewayTrade: [contractId_string, payload_object]
       For GatewayTrade, payload_object can be a list of trade objects.
    """
    # logger.debug(f"Raw {message_type} message args: {args}") # Very verbose
    if not args or not isinstance(args, list) or len(args) < 2:
        logger.warning(f"Received malformed {message_type} message (expected list with at least 2 elements): {args}")
        return

    contract_id_from_stream = args[0] # First element is the contractId string
    payload_data = args[1]          # Second element is the data payload

    if not isinstance(contract_id_from_stream, str):
        logger.warning(f"Contract ID from stream is not a string in {message_type}: {contract_id_from_stream}. Args: {args}")
        return
        
    # Filter for the contracts we are interested in
    subscribed_contracts = [c['contract_id'] for c in CONFIG.get('live_contracts', [])]
    if contract_id_from_stream not in subscribed_contracts:
        # logger.debug(f"Ignoring {message_type} for unsubscribed contract: {contract_id_from_stream}")
        return

    if message_type == "quote":
        if not isinstance(payload_data, dict):
            logger.warning(f"Expected dict payload for quote, got {type(payload_data)}: {payload_data}")
            return
        # logger.debug(f"Processing quote for {contract_id_from_stream}: {payload_data}")
        process_single_data_item(payload_data, contract_id_from_stream, "quote")

    elif message_type == "trade":
        if not isinstance(payload_data, list):
            # Log shows "GatewayTrade" arguments: ["CON.F.US.MES.M25", [{"symbolId":"F.US.MES","price":...,"volume":...}]]
            # So payload_data should be a list of trade dicts.
            logger.warning(f"Expected list payload for trade, got {type(payload_data)}: {payload_data}")
            return
        
        # logger.debug(f"Processing {len(payload_data)} trade(s) for {contract_id_from_stream}: {payload_data}")
        for trade_item in payload_data:
            if not isinstance(trade_item, dict):
                logger.warning(f"Expected dict for individual trade item, got {type(trade_item)}: {trade_item}")
                continue
            process_single_data_item(trade_item, contract_id_from_stream, "trade")
            
    else:
        logger.warning(f"on_market_data_message received unknown message_type: {message_type}")


def on_market_data_quote(args):
    """Callback for quote messages from SignalR."""
    on_market_data_message("quote", args)

def on_market_data_trade(args):
    """Callback for trade messages from SignalR."""
    on_market_data_message("trade", args)


# --- SignalR Connection ---
def start_signalr_connection(token):
    """DEPRECATED or for other hub types: Starts and configures a SignalR connection.
       The main market data hub connection is now established directly in main()."""
    # This function's original HubConnectionBuilder logic for the market data hub 
    # has been moved to main() for a cleaner flow and to use the session_token directly.
    # If this function is intended for OTHER hubs (e.g., a user hub), its implementation
    # would need to be specific to that hub's URL and configuration.
    # For now, making it a pass-through or logging a warning if called unexpectedly for market data.
    global hub_connection # If it were to manage a generic hub_connection
    logger.warning("DEPRECATED start_signalr_connection called. Market data connection is handled in main().")
    # Example if it were for a different hub:
    # other_hub_url = "wss://example.com/otherhub"
    # hub_connection = HubConnectionBuilder().with_url(other_hub_url, ...).build()
    # hub_connection.start()
    return False # Indicate failure or no action for market data purposes


def subscribe_to_streams():
    """Subscribes to configured data streams once SignalR connection is open."""
    # The on_signalr_open callback ensures hub_connection is established.
    # The explicit check for connection_alive might be problematic with certain library versions or connection types.
    if not hub_connection: # Basic check that hub_connection object exists
        logger.warning("Cannot subscribe to streams, SignalR hub_connection object is None.")
        return

    logger.info("SignalR connection active (on_open called), proceeding with subscriptions.")
    
    # Register handlers for quote and trade messages BEFORE subscribing
    # Names based on the provided JavaScript example
    hub_connection.on("GatewayQuote", on_market_data_quote) 
    hub_connection.on("GatewayTrade", on_market_data_trade)
    logger.info("Registered SignalR handlers for 'GatewayQuote' and 'GatewayTrade'.")

    contracts_to_subscribe = [c['contract_id'] for c in CONFIG.get('live_contracts', [])]
    if not contracts_to_subscribe:
        logger.warning("No contracts configured for live ingestion in settings.yaml. Ingester will be idle.")
        return

    for contract_id in contracts_to_subscribe:
        try:
            # Method names based on the provided JavaScript example
            hub_connection.send("SubscribeContractQuotes", [contract_id]) 
            logger.info(f"Sent subscription request for Quotes (SubscribeContractQuotes): {contract_id}")
            hub_connection.send("SubscribeContractTrades", [contract_id])
            logger.info(f"Sent subscription request for Trades (SubscribeContractTrades): {contract_id}")
        except Exception as e:
            logger.error(f"Error subscribing to {contract_id}: {e}")
            # Decide if this is fatal or if we continue with other subscriptions


# Modify on_open to call subscribe_to_streams
def on_signalr_open():
    logger.info("SignalR connection opened successfully.")
    subscribe_to_streams()

# --- Main Application Logic ---
def main():
    global ohlc_aggregators # Make sure it's the global one
    global hub_connection

    logger.info(f"Starting {SCRIPT_NAME}...")
    
    # Initialize Database Connection
    if not get_db_connection():
        logger.error("Failed to connect to the database. Exiting.")
        sys.exit(1)

    # Initialize OHLCAggregators for each configured contract and timeframe
    # The key for the dictionary will be a tuple (contract_id, timeframe_seconds)
    # to uniquely identify each aggregator.
    ohlc_aggregators = {} # Reset if main is called multiple times (e.g. in a loop/restart)
    
    live_contracts_config = CONFIG.get('live_contracts', [])
    if not live_contracts_config:
        logger.warning("No 'live_contracts' configured in settings.yaml. Ingester will start but not process data.")
    
    for contract_config in live_contracts_config:
        contract_id = contract_config['contract_id']
        timeframes = contract_config.get('timeframes_seconds', [])
        if not timeframes:
            logger.warning(f"No 'timeframes_seconds' configured for contract {contract_id}. Skipping.")
            continue
        for tf_seconds in timeframes:
            try:
                tf_s = int(tf_seconds)
                if tf_s <= 0:
                    logger.error(f"Invalid timeframe {tf_s}s for {contract_id}. Must be positive. Skipping.")
                    continue
                
                # Define the callback function for this specific aggregator
                # It will call insert_ohlc_bar with all necessary parameters
                # `partial` could be used here, or a lambda, or a nested function.
                # For simplicity, insert_ohlc_bar is designed to accept all these.
                
                aggregator_key = (contract_id, tf_s)
                ohlc_aggregators[aggregator_key] = OHLCAggregator(
                    contract_id=contract_id,
                    timeframe_seconds=tf_s,
                    bar_completion_callback=insert_ohlc_bar # Pass the DB insert function directly
                )
                logger.info(f"Initialized aggregator for {contract_id} - {tf_s}s.")
            except ValueError:
                logger.error(f"Invalid timeframe value '{tf_seconds}' for {contract_id}. Must be an integer. Skipping.")
            except Exception as e:
                logger.error(f"Error initializing aggregator for {contract_id} - {tf_seconds}s: {e}")

    if not ohlc_aggregators:
        logger.warning("No aggregators were initialized. Live Ingester will be idle.")
        # Optionally, exit if no aggregators, or let it run to allow config changes later.

    # Generate JWT Token
    session_token = generate_jwt_token()
    if not session_token:
        logger.error("Failed to generate session token. Exiting.")
        sys.exit(1)

    # Start SignalR Connection
    if hub_connection: 
        try:
            hub_connection.stop()
        except: 
            pass 
    
    api_config = CONFIG['api']
    base_market_data_hub_url = api_config.get('market_hub_url_base') 
    if not base_market_data_hub_url:
        logger.error("Configuration error: 'api.market_hub_url_base' not found in settings.yaml. Cannot connect to SignalR.")
        sys.exit(1)

    if "?" in base_market_data_hub_url:
        market_data_hub_url_with_token = f"{base_market_data_hub_url}&access_token={session_token}"
    else:
        market_data_hub_url_with_token = f"{base_market_data_hub_url}?access_token={session_token}"

    logger.info(f"Connecting to SignalR Market Data Hub (with token in URL): {market_data_hub_url_with_token}")

    hub_connection = HubConnectionBuilder() \
        .with_url(market_data_hub_url_with_token, options={ 
            "access_token_factory": lambda: session_token, 
            "headers": {"User-Agent": "ProjectXLiveIngester/1.0"},
            "skip_negotiation": True 
        }) \
        .configure_logging(logging.WARNING) \
        .with_automatic_reconnect({
            "type": "interval",
            "keep_alive_interval": 10, 
            "intervals": [1, 2, 5, 10, 20, 30, 60] 
        }) \
        .build()

    hub_connection.on_open(on_signalr_open) 
    hub_connection.on_close(lambda: logger.info("SignalR connection closed."))
    hub_connection.on_error(lambda err: logger.error(f"SignalR connection error: {err}"))
    
    try:
        hub_connection.start()
        logger.info("SignalR connection process initiated.")
        
        while True:
            time.sleep(1) 

    except KeyboardInterrupt:
        logger.info("Shutdown signal received (KeyboardInterrupt).")
    except Exception as e:
        logger.error(f"An unhandled error occurred in main loop: {e}", exc_info=True)
    finally:
        logger.info(f"Shutting down {SCRIPT_NAME}...")
        if hub_connection:
            try:
                logger.info("Attempting to stop SignalR hub connection...")
                hub_connection.stop()
                logger.info("SignalR hub connection stopped.")
            except Exception as e:
                logger.error(f"Error stopping SignalR connection: {e}")
        
        if DB_CONNECTION:
            try:
                logger.info("Closing database connection...")
                DB_CONNECTION.close()
                logger.info("Database connection closed.")
            except Exception as e:
                logger.error(f"Error closing database connection: {e}")
        logger.info(f"{SCRIPT_NAME} has been shut down.")

if __name__ == "__main__":
    main() 