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
from src.core.utils import parse_timeframe # For converting timeframe string to unit/value if needed by DBHandler

# --- Configuration ---
# Basic logging setup (can be enhanced via a shared logging_config later)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

config = Config()

# Removed global DB_POOL, init_db_pool, close_db_pool definitions here
# Pool will be managed in the main execution block

async def create_signals_table_if_not_exists(pool: asyncpg.Pool):
    if not pool: # Check the passed pool argument
        logger.critical("Database pool not provided. Cannot create signals table.")
        return

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS detected_signals (
        signal_id SERIAL PRIMARY KEY,
        analyzer_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,         -- Main event timestamp from signal_data
        trigger_timestamp TIMESTAMPTZ NOT NULL, -- When this row was inserted/triggered
        contract_id TEXT NOT NULL,
        timeframe_value INTEGER NOT NULL,
        timeframe_unit INTEGER NOT NULL,        -- Assuming parse_timeframe maps units to integers
        rule_type TEXT NOT NULL,                -- Name alignment with insert query
        signal_price REAL,
        signal_open REAL,
        signal_high REAL,
        signal_low REAL,
        signal_close REAL,
        signal_volume REAL,
        details JSONB NULL,
        UNIQUE(analyzer_id, contract_id, timeframe_value, timeframe_unit, timestamp, rule_type)
    );
    """
    async with pool.acquire() as conn: # Use the passed pool argument
        await conn.execute(create_table_sql)
    logger.info("Table 'detected_signals' checked/created.")

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

async def store_signals(pool: asyncpg.Pool, signals: List[Dict[str, Any]], analyzer_id: str, contract_id_log: str, timeframe_log: str) -> int:
    """
    Stores a list of signal dictionaries in the detected_signals table.
    Returns the number of signals successfully stored.
    """
    if not signals:
        return 0

    signals_to_store = []
    current_trigger_time = datetime.now(timezone.utc)
    for signal_data in signals:
        # Parse timeframe string into unit and value for storage and unique constraint
        tf_unit, tf_value = parse_timeframe(signal_data['timeframe'])
        
        signals_to_store.append((
            analyzer_id,
            signal_data['timestamp'],
            current_trigger_time,
            signal_data['contract_id'],
            tf_value,  # Parsed timeframe value (integer)
            tf_unit,   # Parsed timeframe unit (integer)
            signal_data['signal_type'], # This is the 'rule_type' for the constraint
            signal_data.get('signal_price'),
            signal_data.get('signal_open'),
            signal_data.get('signal_high'),
            signal_data.get('signal_low'),
            signal_data.get('signal_close'),
            signal_data.get('signal_volume'),
            json.dumps(convert_np_types(signal_data.get('details', {})))
        ))

    if not signals_to_store:
        return 0

    # Ensure the column names match your detected_signals table schema
    # and the unique constraint columns are correct in ON CONFLICT
    insert_query = """
    INSERT INTO detected_signals (
        analyzer_id, timestamp, trigger_timestamp, contract_id, 
        timeframe_value, timeframe_unit, rule_type, 
        signal_price, signal_open, signal_high, signal_low, signal_close, signal_volume, details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (analyzer_id, contract_id, timeframe_value, timeframe_unit, timestamp, rule_type) DO NOTHING;
    """
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                # executemany returns a status string like 'INSERT 0 10'
                status = await conn.executemany(insert_query, signals_to_store)
                # To get actual number inserted when ON CONFLICT DO NOTHING is used, 
                # it's tricky with executemany. We assume if no error, all were attempted.
                # For precise count, one might need row-by-row insert or more complex query.
                # For now, log based on number attempted.
                num_attempted = len(signals_to_store)
                logger.info(f"Attempted to store {num_attempted} signals for analyzer '{analyzer_id}' ({contract_id_log} [{timeframe_log}]). DB Status: {status}")
                # This status does not directly give count of rows actually inserted vs ignored.
                # We will return num_attempted assuming the purpose is to know how many signals were generated and sent to DB.
                return num_attempted 
    except asyncpg.exceptions.UniqueViolationError:
        # This should ideally be caught by ON CONFLICT DO NOTHING, but if it still occurs, log it.
        logger.warning(f"Unique constraint violation encountered unexpectedly for {analyzer_id} ({contract_id_log} [{timeframe_log}]), despite ON CONFLICT DO NOTHING.")
        return 0 # Or a specific value indicating partial success / conflict
    except Exception as e:
        logger.error(f"Error storing signals for {analyzer_id} ({contract_id_log} [{timeframe_log}]): {e}", exc_info=True)
        return 0

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

    logger.info(f"    Fetched {len(new_bars_df)} new bars for analysis for {contract_id} [{timeframe_str}].")
    generated_signals = strategy_func(new_bars_df, contract_id=contract_id, timeframe_str=timeframe_str)

    if not generated_signals:
        logger.info(f"    No signals generated by '{analyzer_id}' for {contract_id} [{timeframe_str}] from {len(new_bars_df)} bars.")
    else:
        logger.info(f"    Generated {len(generated_signals)} signals by '{analyzer_id}' for {contract_id} [{timeframe_str}].")
        num_stored = await store_signals(pool, generated_signals, analyzer_id, contract_id, timeframe_str) # Pass analyzer_id, contract_id, timeframe_str
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

async def main_analyzer_loop(app_config: Config, pool: asyncpg.Pool): # Renamed 'config' to 'app_config' to avoid conflict with global 'config'
    analysis_config = app_config.get_analysis_config()
    if not analysis_config:
        logger.error("Analysis configuration not found. Exiting.")
        return

    loop_interval = analysis_config.get("loop_sleep_seconds", 300)
    targets = analysis_config.get("targets", [])

    if not targets:
        logger.warning("No analysis targets configured. Analyzer will sleep.")

    strategy_map = {
        "cus_cds_trend_finder": generate_trend_starts 
        # Add other strategy functions here by their analyzer_id
    }

    logger.info("Starting main analyzer loop...")
    cycle_count = 0
    try:
        while True:
            cycle_count += 1
            logger.info(f"--- Analyzer Service: Starting cycle {cycle_count} ---")
            
            active_targets_in_cycle = 0
            for target_group_config in targets: # e.g., {'analyzer_id': 'x', 'contract_id': 'y', 'timeframes': ['1m', '5m']}
                analyzer_id_from_config = target_group_config.get('analyzer_id')
                contract_id_from_config = target_group_config.get('contract_id')
                timeframes_for_target = target_group_config.get('timeframes', [])

                if not all([analyzer_id_from_config, contract_id_from_config, timeframes_for_target]):
                    logger.warning(f"Skipping invalid target configuration: {target_group_config}")
                    continue

                strategy_func_to_use = strategy_map.get(analyzer_id_from_config)
                if not strategy_func_to_use:
                    logger.error(f"No strategy function found for analyzer_id: '{analyzer_id_from_config}'. Skipping target.")
                    continue
                
                logger.info(f"Processing target group: Analyzer '{analyzer_id_from_config}', Contract '{contract_id_from_config}', Timeframes: {timeframes_for_target}")
                active_targets_in_cycle +=1

                for tf_str in timeframes_for_target:
                    # Create a specific config for this single run (analyzer, contract, one timeframe)
                    single_run_target_config = {
                        'analyzer_id': analyzer_id_from_config,
                        'contract_id': contract_id_from_config,
                        'timeframe': tf_str # Pass the single timeframe string
                    }
                    try:
                        await run_analyzer_for_target(pool, single_run_target_config, strategy_func_to_use)
                    except Exception as e:
                        logger.error(f"ERROR during analysis for {analyzer_id_from_config}/{contract_id_from_config}/{tf_str}: {e}", exc_info=True)
            
            if active_targets_in_cycle == 0 and targets: # Targets were configured but all were invalid/skipped
                 logger.warning("No valid targets were processed in this cycle despite configurations existing.")
            elif not targets: # No targets configured at all
                pass # Already logged "Analyzer will sleep"

            logger.info(f"--- Analyzer Service: Cycle {cycle_count} complete. Sleeping for {loop_interval} seconds. ---")
            await asyncio.sleep(loop_interval)
    except asyncio.CancelledError:
        logger.info("Main analyzer loop cancelled.")
    except Exception as e:
        logger.critical(f"Critical error in main_analyzer_loop: {e}", exc_info=True)
    finally:
        logger.info("Main analyzer loop is ending.")

async def shutdown_handler(): # This function might not be strictly needed if main_analyzer_loop handles its own cleanup
    logger.info("Analyzer service shutting down (called via shutdown_handler)...")
    # await close_db_pool() # Already handled by main_analyzer_loop's finally
    logger.info("Shutdown complete (called via shutdown_handler).")

if __name__ == "__main__":
    # Global 'config' instance is used here
    
    async def run_service_with_pool():
        # Removed: nonlocal db_pool. db_pool will be local to this function.
        local_db_pool = None # Use a distinct name for clarity if needed, or just db_pool
        
        log_cfg = config.get_logging_config()
        if log_cfg:
            logging.config.dictConfig(log_cfg) 
            logger.info("Logging configured using settings.yaml.")
        else:
            # Fallback to basicConfig if no specific config is found or if dictConfig is not preferred initially
            logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            logger.info("Basic logging active (no valid logging section in settings.yaml or basicConfig preferred).")

        db_settings = config.get_database_config()
        if not db_settings:
            logger.critical("Database configuration not found. Exiting.")
            return

        password_env_var = db_settings.get('password_env_var')
        actual_password = os.getenv(password_env_var) if password_env_var else None
        
        db_password_to_use = actual_password
        if not db_password_to_use and 'password' in db_settings: 
            db_password_to_use = db_settings.get('password')
            logger.info(f"Using direct password from config for DB user {db_settings.get('user')}")
        elif not db_password_to_use:
            logger.critical(f"Database password not found using env var '{password_env_var}' and not set directly in config. Exiting.")
            return

        try:
            local_db_pool = await asyncpg.create_pool(
                user=db_settings['user'],
                password=db_password_to_use,
                database=db_settings['dbname'],
                host=db_settings['host'],
                port=db_settings['port'],
                min_size=1,
                max_size=10,
                timeout=30.0,  # General connection timeout for acquiring from pool
                command_timeout=60.0  # Default timeout for commands
            )
            logger.info("Database connection pool created successfully for main run.")

            # Ensure the table exists with the correct schema
            await create_signals_table_if_not_exists(local_db_pool)

            await main_analyzer_loop(config, local_db_pool) 

        except Exception as e: 
            logger.critical(f"Critical error during service execution or pool creation: {e}", exc_info=True)
        finally:
            if local_db_pool:
                logger.info("Closing database connection pool from main run_service_with_pool.")
                await local_db_pool.close()
    
    try:
        asyncio.run(run_service_with_pool())
    except KeyboardInterrupt:
        logger.info("Analyzer service interrupted by user (KeyboardInterrupt in main).")
    except Exception as e: 
        logger.critical(f"Unhandled exception in top-level asyncio.run: {e}", exc_info=True)
    finally:
        logger.info("Analyzer service main execution block finished.")
        # No explicit call to asyncio.run(shutdown_handler()) here anymore to avoid loop issues. 