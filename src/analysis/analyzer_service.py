import asyncio
import pandas as pd
from datetime import datetime, timezone
import logging # Added for basic logging
import logging.config # Ensure this is imported
import json # Added for json.dumps
import asyncpg # Added for direct asyncpg usage
import numpy as np # Add numpy for type checking
from typing import List, Dict, Any, Callable, Optional
import os # Added os import

from src.core.config import Config
# from src.data.storage.db_handler import DBHandler # Removed DBHandler
from src.strategies.trend_start_finder import generate_trend_starts
from src.core.utils import parse_timeframe, format_timeframe_from_unit_value # MODIFIED: Added format_timeframe_from_unit_value

# --- Configuration ---
# Basic logging setup (can be enhanced via a shared logging_config later)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

config = Config()
BAR_HISTORY_COUNT = 200 # Number of bars to fetch for context, including the new one.

# MODIFIED: Moved strategy_mapping to module level
STRATEGY_MAPPING = {
    "cus_cds_trend_finder": generate_trend_starts
    # Add other strategies here if needed
}

# This will hold the pool when running as a service directly
# Needs to be accessible by the notification handler
DB_POOL_MAIN_FOR_HANDLER: Optional[asyncpg.Pool] = None

async def create_watermarks_table_if_not_exists(pool: asyncpg.Pool):
    if not pool:
        logger.critical("Database pool not provided. Cannot create analyzer_watermarks table.")
        return
    
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS analyzer_watermarks (
        analyzer_id TEXT NOT NULL,
        contract_id TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        last_processed_timestamp TIMESTAMPTZ,
        PRIMARY KEY (analyzer_id, contract_id, timeframe)
    );
    """
    conn = None
    try:
        conn = await pool.acquire()
        logger.debug(f"Acquired connection for DDL operations on analyzer_watermarks.")
        status = await conn.execute(create_table_sql)
        logger.info(f"Table 'analyzer_watermarks' checked/created. Status: {status}")
        return True
    except Exception as e:
        logger.error(f"Error creating analyzer_watermarks table: {e}", exc_info=True)
        return False
    finally:
        if conn:
            try:
                await pool.release(conn)
                logger.debug(f"Connection released after DDL operations on analyzer_watermarks.")
            except Exception as e:
                logger.error(f"Error releasing connection in create_watermarks_table_if_not_exists: {e}")

async def create_signals_table_if_not_exists(pool: asyncpg.Pool):
    if not pool: # Check the passed pool argument
        logger.critical("Database pool not provided. Cannot create signals table.")
        return

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS detected_signals (
        signal_id SERIAL PRIMARY KEY,
        analyzer_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,         -- Main event timestamp from signal_data
        trigger_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When this row was inserted/triggered
        contract_id TEXT NOT NULL,
        timeframe TEXT NOT NULL,                -- Consistent with insert logic & Prisma schema
        signal_type TEXT NOT NULL,              -- Consistent with insert logic & Prisma schema
        signal_price REAL,
        signal_open REAL,
        signal_high REAL,
        signal_low REAL,
        signal_close REAL,
        signal_volume REAL,
        details JSONB
        -- Constraint will be added/ensured separately
    );
    """
    # Removed CONSTRAINT detected_signals_unique_idx UNIQUE (analyzer_id, contract_id, timeframe, timestamp, signal_type) from initial CREATE

    drop_constraint_sql = "ALTER TABLE detected_signals DROP CONSTRAINT IF EXISTS detected_signals_unique_idx;"
    add_constraint_sql = "ALTER TABLE detected_signals ADD CONSTRAINT detected_signals_unique_idx UNIQUE (analyzer_id, contract_id, timeframe, timestamp, signal_type);"

    conn = None
    try:
        conn = await pool.acquire()
        logger.debug(f"Acquired connection for DDL operations on detected_signals.")

        status_create = await conn.execute(create_table_sql)
        logger.info(f"Table 'detected_signals' checked/created. Status: {status_create}")

        status_drop = await conn.execute(drop_constraint_sql)
        logger.info(f"Attempted to drop constraint 'detected_signals_unique_idx'. Status: {status_drop}")
        
        status_add = await conn.execute(add_constraint_sql)
        logger.info(f"Attempted to add constraint 'detected_signals_unique_idx'. Status: {status_add}")
        
        return True
    except Exception as e:
        logger.error(f"Error during DDL operations for detected_signals table (create/drop/add constraint): {e}", exc_info=True)
        return False
    finally:
        if conn:
            try:
                await pool.release(conn)
                logger.debug(f"Connection released after DDL operations on detected_signals.")
            except Exception as e:
                logger.error(f"Error releasing connection in create_signals_table_if_not_exists: {e}")

def convert_np_types(data):
    """Recursively convert numpy types in a dictionary to standard Python types for JSON serialization."""
    if isinstance(data, dict):
        return {k: convert_np_types(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_np_types(i) for i in data]
    elif isinstance(data, (np.int_, np.intc, np.intp, np.int8, np.int16, np.int32, np.int64,
                           np.uint8, np.uint16, np.uint32, np.uint64)):
        return int(data)
    elif isinstance(data, (np.float16, np.float32, np.float64)):
        return float(data)
    elif isinstance(data, (np.complex64, np.complex128)):
        return {'real': data.real, 'imag': data.imag}
    elif isinstance(data, (np.ndarray,)):
        return data.tolist()
    elif isinstance(data, np.bool_):
        return bool(data)
    elif pd.isna(data): # Handle pandas NaT or NaN if they sneak in
        return None
    return data

async def store_signals(
    pool: asyncpg.Pool,
    analyzer_id: str,
    contract_id: str,
    timeframe_unit: int, # Still needed to format the string
    timeframe_value: int, # Still needed to format the string
    signals: List[Dict[str, Any]]
) -> int:
    if not signals:
        return 0
    if not pool:
        logger.error(f"Database pool not available for store_signals for {analyzer_id}/{contract_id}")
        return 0

    timeframe_str = format_timeframe_from_unit_value(timeframe_unit, timeframe_value) # Generate timeframe string

    # Prepare data for insertion
    signals_to_store = []
    for signal in signals:
        # Ensure timestamp from signal is timezone-aware (UTC)
        signal_timestamp = signal['timestamp']
        if isinstance(signal_timestamp, str):
            try:
                if signal_timestamp.endswith('Z'):
                    signal_timestamp = datetime.fromisoformat(signal_timestamp[:-1] + '+00:00')
                else:
                    signal_timestamp = datetime.fromisoformat(signal_timestamp)
            except ValueError as e:
                logger.error(f"Error parsing signal timestamp string '{signal_timestamp}': {e}. Skipping signal.")
                continue # Skip this signal
        
        if not isinstance(signal_timestamp, datetime):
            logger.error(f"Signal timestamp is not a datetime object after parsing: {signal_timestamp} (type: {type(signal_timestamp)}). Skipping signal.")
            continue

        if signal_timestamp.tzinfo is None:
            signal_timestamp = signal_timestamp.replace(tzinfo=timezone.utc)
        elif signal_timestamp.tzinfo != timezone.utc:
            signal_timestamp = signal_timestamp.astimezone(timezone.utc)

        signals_to_store.append((
            analyzer_id,
            signal_timestamp,         # Use the processed, timezone-aware timestamp
            datetime.now(timezone.utc),  # trigger_timestamp
            contract_id,
            timeframe_str,               # This should be the string timeframe like "1m", "1h"
            signal['signal_type'],
            signal.get('signal_price'),
            signal.get('open'),
            signal.get('high'),
            signal.get('low'),
            signal.get('close'),
            signal.get('volume'),
            json.dumps(convert_np_types(signal.get('details', {}))) # Ensure details is a JSON string and numpy types are converted
        ))

    insert_query = """
        INSERT INTO detected_signals (
            analyzer_id, timestamp, trigger_timestamp, contract_id, timeframe, 
            signal_type, signal_price, 
            signal_open, signal_high, signal_low, signal_close, signal_volume, 
            details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT ON CONSTRAINT detected_signals_unique_idx
        DO UPDATE SET
            trigger_timestamp = EXCLUDED.trigger_timestamp,
            signal_price = EXCLUDED.signal_price,
            signal_open = EXCLUDED.signal_open,
            signal_high = EXCLUDED.signal_high,
            signal_low = EXCLUDED.signal_low,
            signal_close = EXCLUDED.signal_close,
            signal_volume = EXCLUDED.signal_volume,
            details = EXCLUDED.details
        RETURNING signal_id;
        """ 
        # Updated ON CONFLICT to use the correct unique constraint fields

    conn = None
    num_inserted_or_updated = 0
    try:
        conn = await pool.acquire()
        logger.debug(f"Acquired connection for storing {len(signals_to_store)} signals for {analyzer_id} ({contract_id} [{timeframe_str}]).")

        status = await conn.executemany(insert_query, signals_to_store)
        # executemany returns None in asyncpg, so we check the count of items we attempted to store.
        # For more precise count of actual rows inserted, one might need row-by-row insert or other logic.
        num_inserted_or_updated = len(signals_to_store) # Assume all were processed if no error
        logger.info(f"Successfully stored/updated {num_inserted_or_updated} signals for {analyzer_id} ({contract_id} [{timeframe_str}]) with status: {status}")
        return num_inserted_or_updated
    except asyncpg.PostgresError as e:  # Catch specific database errors
        logger.error(f"Database error storing signals for {analyzer_id} ({contract_id} [{timeframe_str}]): {e}")
        # Consider the nature of the error. If it's about the ON CONFLICT, the DDL or constraint name might be wrong.
        # If it's a data type issue, the data conversion logic above might need refinement.
        num_inserted_or_updated = 0 # Indicate failure or partial success if applicable
    except Exception as e:
        logger.error(f"Unexpected error storing signals for {analyzer_id} ({contract_id} [{timeframe_str}]): {type(e).__name__} - {e}")
        num_inserted_or_updated = 0
    finally:
        if conn:
            try:
                await pool.release(conn)
                logger.debug(f"Connection released after attempting to store signals for {analyzer_id} ({contract_id} [{timeframe_str}]).")
            except Exception as e:
                logger.error(f"Error releasing connection in store_signals: {e}")
    return num_inserted_or_updated

async def fetch_ohlc_bars_for_analysis(
    pool: asyncpg.Pool, 
    contract_id: str, 
    timeframe_unit: int, 
    timeframe_value: int, 
    last_processed_timestamp: Optional[datetime]
) -> pd.DataFrame:
    if not pool: # Check the passed pool argument
        logger.error("Database pool not available for fetch_ohlc_bars_for_analysis")
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
    # Default to a very old timestamp if None (process all historical data)
    if last_processed_timestamp is None:
        last_processed_timestamp = datetime(1970, 1, 1, tzinfo=timezone.utc)

    query = """
        SELECT "timestamp", "open", "high", "low", "close", "volume" 
        FROM ohlc_bars
        WHERE contract_id = $1 AND timeframe_unit = $2 AND timeframe_value = $3 AND "timestamp" > $4
        ORDER BY "timestamp" ASC;
    """
    try:
        async with pool.acquire() as conn: # Use the passed pool argument
            records = await conn.fetch(query, contract_id, timeframe_unit, timeframe_value, last_processed_timestamp)
    except Exception as e:
        logger.error(f"Error fetching OHLC bars: {e}", exc_info=True)
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    
    if not records:
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    df = pd.DataFrame(records, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    # Ensure numeric types for OHLCV columns
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df

async def fetch_ohlc_bars_for_analysis_window(
    pool: asyncpg.Pool,
    contract_id: str,
    timeframe_unit: int, # Parsed from timeframe_str
    timeframe_value: int, # Parsed from timeframe_str
    end_timestamp: datetime, # Timestamp of the notified bar
    bar_count: int
) -> pd.DataFrame:
    if not pool:
        logger.error("Database pool not available for fetch_ohlc_bars_for_analysis_window")
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    query = """
        SELECT "timestamp", "open", "high", "low", "close", "volume"
        FROM ohlc_bars
        WHERE contract_id = $1
          AND timeframe_unit = $2
          AND timeframe_value = $3
          AND "timestamp" <= $4  -- Include the notified bar itself
        ORDER BY "timestamp" DESC
        LIMIT $5;
    """
    # Note: After fetching, we'll need to re-sort by timestamp ASC for the strategy
    try:
        async with pool.acquire() as conn:
            records = await conn.fetch(query, contract_id, timeframe_unit, timeframe_value, end_timestamp, bar_count)
    except Exception as e:
        logger.error(f"Error fetching OHLC window for {contract_id} TF {timeframe_value}{timeframe_unit} ending {end_timestamp}: {e}", exc_info=True)
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    if not records:
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    # Convert to DataFrame and sort ascending by timestamp
    df = pd.DataFrame(records, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df = df.sort_values(by='timestamp', ascending=True).reset_index(drop=True)
    
    # Ensure numeric types for OHLCV columns
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df

async def get_analyzer_watermark(pool: asyncpg.Pool, analyzer_id: str, contract_id: str, timeframe: str) -> Optional[datetime]:
    if not pool: # Check the passed pool argument
        logger.error("Database pool not available for get_analyzer_watermark")
        return None # Return None or raise an error, consistent with other services
        
    query = """
    SELECT last_processed_timestamp FROM analyzer_watermarks
    WHERE analyzer_id = $1 AND contract_id = $2 AND timeframe = $3;
    """
    try:
        async with pool.acquire() as conn: # Use the passed pool argument
            record = await conn.fetchrow(query, analyzer_id, contract_id, timeframe)
    except Exception as e:
        logger.error(f"Error fetching watermark for {analyzer_id}/{contract_id}/{timeframe}: {e}", exc_info=True)
        return None
    
    if record and record['last_processed_timestamp']:
        return record['last_processed_timestamp']
    return None

async def update_analyzer_watermark(pool: asyncpg.Pool, analyzer_id: str, contract_id: str, timeframe: str, new_timestamp: datetime):
    if not pool: # Check the passed pool argument
        logger.error("Database pool not available for update_analyzer_watermark")
        return
        
    query = """
    INSERT INTO analyzer_watermarks (analyzer_id, contract_id, timeframe, last_processed_timestamp)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (analyzer_id, contract_id, timeframe) DO UPDATE SET last_processed_timestamp = EXCLUDED.last_processed_timestamp;
    """
    try:
        async with pool.acquire() as conn: # Use the passed pool argument
            await conn.execute(query, analyzer_id, contract_id, timeframe, new_timestamp)
    except Exception as e:
        logger.error(f"Error updating watermark for {analyzer_id}/{contract_id}/{timeframe} to {new_timestamp}: {e}", exc_info=True)

async def run_analyzer_for_target(
    pool: asyncpg.Pool,
    target_config: Dict[str, Any], # This will be the specific dict for one target run
    strategy_func: Callable
):
    """
    Runs the analysis for a single target (contract_id and ONE timeframe from that target's list).
    This function is called for each timeframe within a target's configuration.
    """
    analyzer_id = target_config['analyzer_id']
    contract_id = target_config['contract_id']
    timeframe_str = target_config['timeframe'] # Expecting a single timeframe string here

    logger.info(f"  Processing {contract_id} [{timeframe_str}] for analyzer '{analyzer_id}'")

    watermark_ts = await get_analyzer_watermark(pool, analyzer_id, contract_id, timeframe_str)
    logger.info(f"    Last processed timestamp for {analyzer_id}/{contract_id}/{timeframe_str}: {watermark_ts if watermark_ts else 'None (will process from beginning)'}")

    from src.core.utils import parse_timeframe
    tf_unit_val, tf_value_val = parse_timeframe(timeframe_str)

    new_bars_df = await fetch_ohlc_bars_for_analysis(
        pool=pool,
        contract_id=contract_id,
        timeframe_unit=tf_unit_val,
        timeframe_value=tf_value_val,
        last_processed_timestamp=watermark_ts
    )

    if new_bars_df.empty:
        logger.info(f"    No new OHLC data found for {contract_id} [{timeframe_str}] since {watermark_ts if watermark_ts else 'the beginning of time'}.")
        # Watermark logic: if no new bars, watermark remains unchanged.
        # If first run (watermark_ts is None) and no data, it also remains None.
        # This ensures we re-check from the beginning if no data was ever found.
        return

    logger.info(f"    Fetched {len(new_bars_df)} new OHLC bars for {contract_id} [{timeframe_str}] for analysis.")
    generated_signals = strategy_func(new_bars_df, contract_id=contract_id, timeframe_str=timeframe_str)

    if not generated_signals:
        logger.info(f"    No signals generated by '{analyzer_id}' for {contract_id} [{timeframe_str}] from {len(new_bars_df)} bars.")
    else:
        logger.info(f"    Generated {len(generated_signals)} signals by '{analyzer_id}' for {contract_id} [{timeframe_str}].")
        num_stored = await store_signals(
            pool=pool, 
            analyzer_id=analyzer_id,
            contract_id=contract_id,
            timeframe_unit=tf_unit_val,  # Parsed from timeframe_str
            timeframe_value=tf_value_val, # Parsed from timeframe_str
            signals=generated_signals
        )
        logger.info(f"    Stored {num_stored} signals in the database for {analyzer_id}/{contract_id}/{timeframe_str}.")

    new_max_timestamp = new_bars_df['timestamp'].max()
    if pd.notna(new_max_timestamp):
        new_watermark = new_max_timestamp.to_pydatetime()
        if new_watermark.tzinfo is None:
            new_watermark = new_watermark.replace(tzinfo=timezone.utc)
        await update_analyzer_watermark(pool, analyzer_id, contract_id, timeframe_str, new_watermark)
        logger.info(f"    Updated watermark for {analyzer_id}/{contract_id}/{timeframe_str} to {new_watermark}.")
    else:
        logger.warning(f"    Could not determine new watermark for {analyzer_id}/{contract_id}/{timeframe_str} as max timestamp was NaT. Watermark not updated.")

    logger.info(f"Finished analysis cycle for {analyzer_id} - {contract_id} [{timeframe_str}].")

async def handle_new_bar_notification(connection, pid, channel, payload_str):
    logger.info(f"Received notification on channel '{channel}' with PID {pid}. Raw payload string: {payload_str[:500]}...") # Log raw payload string (truncated)
    try:
        payload = json.loads(payload_str)
        logger.info(f"Successfully parsed JSON payload: {payload}")

        # Determine if this is an OHLC bar notification we should process
        is_ohlc_notification_from_ingester = payload.get('type') == 'ohlc'
        logger.info(f"Checking notification type: '{payload.get('type')}'. Is OHLC from Ingester? {is_ohlc_notification_from_ingester}")

        if is_ohlc_notification_from_ingester:
            # Extract data directly from the payload sent by live_ingester.py
            contract_id_notif = payload.get('contract_id')
            bar_timestamp_str = payload.get('timestamp') 
            timeframe_unit_notif = payload.get('timeframe_unit') # Integer
            timeframe_value_notif = payload.get('timeframe_value') # Integer
            
            logger.info(f"Extracted OHLC data: contract='{contract_id_notif}', ts_str='{bar_timestamp_str}', tf_unit='{timeframe_unit_notif}', tf_val='{timeframe_value_notif}'")

            if not all([contract_id_notif, bar_timestamp_str, 
                        timeframe_unit_notif is not None, timeframe_value_notif is not None]):
                logger.warning(f"Notification missing essential data fields after extraction. Payload data: {payload}")
                return
            
            try:
                timeframe_str_notif = format_timeframe_from_unit_value(timeframe_unit_notif, timeframe_value_notif)
                logger.info(f"Successfully formatted timeframe_str_notif: '{timeframe_str_notif}'") # Log successful timeframe formatting
            except ValueError as e:
                logger.error(f"Error formatting timeframe from notification unit/value ({timeframe_unit_notif}, {timeframe_value_notif}): {e}")
                return

            try:
                if bar_timestamp_str.endswith('Z'):
                    bar_timestamp = datetime.fromisoformat(bar_timestamp_str[:-1] + '+00:00')
                else:
                    bar_timestamp = datetime.fromisoformat(bar_timestamp_str)
                
                if bar_timestamp.tzinfo is None:
                    bar_timestamp = bar_timestamp.replace(tzinfo=timezone.utc)
                elif bar_timestamp.tzinfo != timezone.utc:
                    bar_timestamp = bar_timestamp.astimezone(timezone.utc)
                logger.info(f"Successfully parsed bar_timestamp: {bar_timestamp}") # Log successful timestamp parsing

            except ValueError as e:
                logger.error(f"Error parsing timestamp from notification '{bar_timestamp_str}': {e}")
                return

            logger.info(f"New OHLC bar notification: Contract={contract_id_notif}, Timestamp={bar_timestamp}, Timeframe={timeframe_str_notif} (Unit={timeframe_unit_notif}, Val={timeframe_value_notif})")

            # Access analysis targets from the global config object
            # The 'config' object is available globally in this module
            analysis_config = config.settings.get('analysis', {})
            configured_targets = analysis_config.get('targets', [])
            found_matching_target = False

            for target_config in configured_targets: # Renamed target_group to target_config for clarity
                analyzer_id = target_config.get('analyzer_id')
                config_contract_id = target_config.get('contract_id')
                
                if not analyzer_id or not config_contract_id:
                    logger.warning(f"Skipping invalid target configuration in settings.yaml: {target_config}. Missing 'analyzer_id' or 'contract_id'.")
                    continue

                strategy_func_name = target_config.get('strategy', 'cus_cds_trend_finder')
                strategy_func = STRATEGY_MAPPING.get(strategy_func_name) # MODIFIED: Use module-level STRATEGY_MAPPING

                if not strategy_func: # Added check for strategy_func in notification handler context
                    logger.error(f"Strategy '{strategy_func_name}' for analyzer '{analyzer_id}' not found in STRATEGY_MAPPING. Cannot process notification.")
                    continue # Skip this target if strategy function is not found

                if contract_id_notif == config_contract_id:
                    for config_timeframe_str in target_config.get('timeframes', []):
                        if timeframe_str_notif == config_timeframe_str:
                            found_matching_target = True
                            logger.info(f"  MATCH FOUND for notification: Analyzer='{analyzer_id}', Contract='{contract_id_notif}', Timeframe='{timeframe_str_notif}'. Will trigger analysis.")
                            
                            # --- Begin Analysis Logic for Matched Target ---
                            if not strategy_func: # Should have been caught earlier, but double-check
                                logger.error(f"    Strategy function for '{analyzer_id}' not found. Skipping analysis.")
                                continue # Skip to next timeframe or target

                            try:
                                # Parse the config_timeframe_str (e.g., "1m") to unit/value for the DB query
                                tf_unit_for_query, tf_value_for_query = parse_timeframe(config_timeframe_str)
                            except ValueError as e:
                                logger.error(f"    Error parsing configured timeframe '{config_timeframe_str}' for DB query: {e}. Skipping analysis for this timeframe.")
                                continue

                            logger.info(f"    Fetching ~{BAR_HISTORY_COUNT} bars for {contract_id_notif} [{config_timeframe_str}] ending at {bar_timestamp}")
                            historical_bars_df = await fetch_ohlc_bars_for_analysis_window(
                                pool=DB_POOL_MAIN_FOR_HANDLER, # MODIFIED: Use accessible main pool
                                contract_id=contract_id_notif,
                                timeframe_unit=tf_unit_for_query,
                                timeframe_value=tf_value_for_query,
                                end_timestamp=bar_timestamp, # Timestamp of the notified bar
                                bar_count=BAR_HISTORY_COUNT
                            )

                            if historical_bars_df.empty:
                                logger.info(f"    No historical bars found for {contract_id_notif} [{config_timeframe_str}] ending {bar_timestamp}. Min history {BAR_HISTORY_COUNT} might not be met. Skipping strategy execution.")
                            elif len(historical_bars_df) < BAR_HISTORY_COUNT:
                                logger.warning(f"    Fetched only {len(historical_bars_df)} bars for {contract_id_notif} [{config_timeframe_str}] (less than requested {BAR_HISTORY_COUNT}). Strategy might not perform optimally.")
                                # Decide if you want to proceed or skip if not enough history. For now, proceed.

                            # Ensure the notified bar is the last one in the DataFrame if present, or that history leads up to it.
                            # The query for fetch_ohlc_bars_for_analysis_window includes bar_timestamp, so it should be the last one.

                            generated_signals = strategy_func(
                                historical_bars_df, 
                                contract_id=contract_id_notif, 
                                timeframe_str=config_timeframe_str
                            )

                            if not generated_signals:
                                logger.info(f"    No signals generated by '{analyzer_id}' for {contract_id_notif} [{config_timeframe_str}] from {len(historical_bars_df)} bars.")
                            else:
                                logger.info(f"    Generated {len(generated_signals)} signals by '{analyzer_id}' for {contract_id_notif} [{config_timeframe_str}].")
                                num_stored = await store_signals(
                                    pool=DB_POOL_MAIN_FOR_HANDLER, 
                                    analyzer_id=analyzer_id,
                                    contract_id=contract_id_notif,
                                    timeframe_unit=tf_unit_for_query,  # Parsed from config_timeframe_str
                                    timeframe_value=tf_value_for_query, # Parsed from config_timeframe_str
                                    signals=generated_signals
                                )
                                logger.info(f"    Stored {num_stored} signals in the database for {analyzer_id}/{contract_id_notif}/{config_timeframe_str}.")

                            # Update watermark to the timestamp of the bar that triggered this notification
                            await update_analyzer_watermark(DB_POOL_MAIN_FOR_HANDLER, analyzer_id, contract_id_notif, config_timeframe_str, bar_timestamp) # MODIFIED
                            logger.info(f"    Updated watermark for {analyzer_id}/{contract_id_notif}/{config_timeframe_str} to {bar_timestamp}.")
                            
                            # --- End Analysis Logic for Matched Target ---
                            break # Found matching timeframe for this target_config
                
                # If a match was found for this target_config, we don't necessarily break from the outer loop,
                # as another analyzer_id (another item in configured_targets) might also be interested in the same bar.
                # The found_matching_target flag is mostly for the final "No matching target found" log.
                # However, the inner break for timeframes is correct.

            if not found_matching_target:
                logger.info(f"  No matching analysis target found in config for Contract='{contract_id_notif}', Timeframe='{timeframe_str_notif}'. Notification will be ignored for analysis.")

    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON payload from notification: {e}. Payload: {payload_str}")
    except Exception as e:
        logger.error(f"Error processing new bar notification: {e}", exc_info=True)

async def main_analyzer_loop(app_config: Config, pool: asyncpg.Pool):
    logger.info("Starting Analyzer Service event loop...")
    await create_signals_table_if_not_exists(pool)
    await create_watermarks_table_if_not_exists(pool)

    analysis_config = app_config.settings.get('analysis', {})
    analysis_targets = analysis_config.get('targets', [])

    if not analysis_targets:
        logger.warning("No analysis targets configured (expected under 'analysis.targets' in settings.yaml). Analyzer service will be idle.")
        # Keep running to listen for notifications if added dynamically, or just exit?
        # For now, it will keep running and listening.

    try:
        async with pool.acquire() as conn:
            await conn.add_listener('ohlc_update', handle_new_bar_notification)
            logger.info("Listening for new OHLC bar notifications on 'ohlc_update'...")

            # Keep the service alive to listen for notifications
            # Polling logic (run_analyzer_for_target) can be run on a less frequent schedule as a fallback/sync
            # or on startup to process backlog.
            
            # Initial run for all targets to process backlog before relying solely on notifications
            logger.info("Performing initial analysis run for all configured targets to process backlog...")
            initial_analysis_tasks = []
            for target_config in analysis_targets: # Iterate directly over each configured target
                analyzer_id = target_config.get('analyzer_id')
                strategy_func_name = target_config.get('strategy', 'cus_cds_trend_finder')
                strategy_func = STRATEGY_MAPPING.get(strategy_func_name)

                if not analyzer_id: # Added check for analyzer_id
                    logger.warning(f"Skipping target configuration due to missing 'analyzer_id': {target_config}")
                    continue

                if not strategy_func:
                    logger.error(f"Strategy '{strategy_func_name}' not found for analyzer '{analyzer_id}'. Skipping target group.")
                    continue

                contract_id = target_config.get('contract_id') # Get contract_id directly
                if not contract_id: # Added check for contract_id
                    logger.warning(f"Skipping target configuration for analyzer '{analyzer_id}' due to missing 'contract_id': {target_config}")
                    continue

                for tf_str in target_config.get('timeframes', []): # Get timeframes list directly
                    # Construct a single_target_run_config dict for run_analyzer_for_target
                    # This structure is what run_analyzer_for_target expects
                    single_target_run_config_for_backlog = {
                            'analyzer_id': analyzer_id,
                            'contract_id': contract_id,
                            'timeframe': tf_str,
                            # 'strategy': strategy_func_name # strategy_func is passed directly
                        }
                    logger.info(f"Queueing backlog analysis for: {analyzer_id} - {contract_id} [{tf_str}]")
                    task = run_analyzer_for_target(pool, single_target_run_config_for_backlog, strategy_func)
                    initial_analysis_tasks.append(task)
            
            if initial_analysis_tasks:
                await asyncio.gather(*initial_analysis_tasks)
            logger.info("Initial backlog processing complete. Switching to notification-driven mode.")

            while True:
                # The listener runs in the background. This loop keeps the main coroutine alive.
                # We could add a very infrequent polling cycle here if desired as a fallback.
                await asyncio.sleep(3600) # Sleep for a long time, or use an Event
                logger.debug("Analyzer service alive, listener active...") # Heartbeat log

    except asyncio.CancelledError:
        logger.info("Analyzer service loop cancelled.")
    except Exception as e:
        logger.error(f"Critical error in analyzer service loop: {e}", exc_info=True)
    finally:
        logger.info("Analyzer service loop finished.")


async def shutdown_handler(): # This function might not be strictly needed if main_analyzer_loop handles its own cleanup
    logger.info("AnalyzerService shutting down...")
    # No explicit pool.close() here as it's managed by the main execution block that calls this
    # If this service managed its own pool, it would close it here.
    await asyncio.sleep(1) # Give time for any pending tasks if necessary
    logger.info("AnalyzerService shutdown complete.")

if __name__ == "__main__":
    # This setup is for running the service directly.
    # It needs its own asyncpg.create_pool call.

    # --- Database Pool Management ---
    db_pool_main: Optional[asyncpg.Pool] = None # This is local to the __main__ execution scope

    async def init_db_pool_main():
        global db_pool_main # This refers to the one in __main__ scope
        global DB_POOL_MAIN_FOR_HANDLER # This refers to the module-level one
        database_configs = config.settings['database']
        active_db_key = database_configs.get('default_analysis_db', 'local_timescaledb') 
        db_connection_details = database_configs.get(active_db_key)

        if not db_connection_details:
            logger.critical(f"Database configuration for '{active_db_key}' not found in settings.yaml.")
            return None

        # Resolve password from environment variable if specified
        password = db_connection_details.get('password') # Direct password
        password_env_var = db_connection_details.get('password_env_var')
        if password_env_var:
            env_password = os.getenv(password_env_var)
            if env_password:
                password = env_password
            else:
                logger.warning(f"Environment variable '{password_env_var}' for DB password not set. Trying direct password from config.")
        
        if not password:
            logger.critical(f"Database password for '{active_db_key}' could not be resolved (checked env var '{password_env_var}' and direct 'password' key).")
            return None

        try:
            db_pool_main = await asyncpg.create_pool(
                user=db_connection_details.get('user'),
                password=password, # Use resolved password
                database=db_connection_details.get('dbname'),
                host=db_connection_details.get('host'),
                port=db_connection_details.get('port'),
                min_size=db_connection_details.get('min_pool_size', 1),
                max_size=db_connection_details.get('max_pool_size', 10)
            )
            DB_POOL_MAIN_FOR_HANDLER = db_pool_main # Assign to the module-level variable
            logger.info(f"Successfully created database pool for AnalyzerService (main) using '{active_db_key}'. Min: {db_connection_details.get('min_pool_size', 1)}, Max: {db_connection_details.get('max_pool_size', 10)}")
            return db_pool_main
        except Exception as e:
            logger.critical(f"Failed to create database pool for AnalyzerService (main) using '{active_db_key}': {e}", exc_info=True)
            return None

    async def close_db_pool_main():
        global db_pool_main
        global DB_POOL_MAIN_FOR_HANDLER
        if db_pool_main:
            logger.info("Closing database pool for AnalyzerService (main)...")
            await db_pool_main.close()
            DB_POOL_MAIN_FOR_HANDLER = None # Clear the module-level reference
            logger.info("Database pool for AnalyzerService (main) closed.")

    async def run_service_with_pool():
        pool = await init_db_pool_main()
        if not pool:
            logger.error("Failed to initialize database pool. Analyzer service cannot start.")
            return
        
        try:
            await main_analyzer_loop(config, pool) # Pass config and the newly created pool
        except asyncio.CancelledError:
            logger.info("Analyzer service run_service_with_pool cancelled.")
        finally:
            await close_db_pool_main()

    try:
        asyncio.run(run_service_with_pool())
    except KeyboardInterrupt:
        logger.info("AnalyzerService received KeyboardInterrupt. Shutting down...")
    except Exception as e:
        logger.error(f"Unhandled exception in AnalyzerService __main__: {e}", exc_info=True)
    finally:
        # Ensure shutdown_handler is called if needed, or rely on close_db_pool_main
        # asyncio.run(shutdown_handler()) # This would need its own loop management if it uses async features extensively
        logger.info("AnalyzerService main execution finished.") 