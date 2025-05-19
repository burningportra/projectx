import asyncio
import pandas as pd
from datetime import datetime, timezone
import logging # Added for basic logging
import json # Added for json.dumps
import asyncpg # Added for direct asyncpg usage
import numpy as np # Add numpy for type checking

from src.core.config import Config
# from src.data.storage.db_handler import DBHandler # Removed DBHandler
from src.strategies.trend_start_finder import generate_trend_starts
from src.core.utils import parse_timeframe # For converting timeframe string to unit/value if needed by DBHandler

# --- Configuration ---
# Basic logging setup (can be enhanced via a shared logging_config later)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

config = Config()
DB_POOL = None # Global variable for the K)

async def init_db_pool():
    global DB_POOL
    if DB_POOL is None:
        try:
            db_url = config.get_database_url() # Assuming this gets the DSN string
            DB_POOL = await asyncpg.create_pool(dsn=db_url, min_size=1, max_size=10)
            logger.info("Database connection pool created successfully.")
        except Exception as e:
            logger.error(f"Failed to create database connection pool: {e}", exc_info=True)
            # Depending on the desired behavior, you might want to re-raise the exception
            # or handle it in a way that the application can retry or exit gracefully.
            raise # Re-raise to stop the application if DB connection is critical

async def close_db_pool():
    global DB_POOL
    if DB_POOL:
        await DB_POOL.close()
        logger.info("Database connection pool closed.")
        DB_POOL = None

# --- Detected Signals Table Schema (Reminder) ---
# signal_id SERIAL PRIMARY KEY
# timestamp TIMESTAMPTZ NOT NULL
# contract_id TEXT NOT NULL
# timeframe TEXT NOT NULL (e.g., "5m")
# signal_type TEXT NOT NULL (e.g., "uptrend_start")
# signal_price REAL
# signal_open REAL
# signal_high REAL
# signal_low REAL
# signal_close REAL
# signal_volume REAL
# details JSONB NULL
# UNIQUE(contract_id, timeframe, signal_type, timestamp)

async def create_signals_table_if_not_exists():
    if not DB_POOL:
        logger.error("DB_POOL not initialized for create_signals_table_if_not_exists")
        await init_db_pool() # Attempt to initialize if called standalone, though main_loop should handle it
        if not DB_POOL: # Check again after attempt
             logger.critical("Failed to initialize DB_POOL. Cannot create signals table.")
             return

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS detected_signals (
        signal_id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        contract_id TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_price REAL,
        signal_open REAL,
        signal_high REAL,
        signal_low REAL,
        signal_close REAL,
        signal_volume REAL,
        details JSONB NULL,
        UNIQUE(contract_id, timeframe, signal_type, timestamp)
    );
    """
    async with DB_POOL.acquire() as conn:
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

async def store_signals(signals: list):
    if not signals:
        return
    if not DB_POOL:
        logger.error("DB_POOL not initialized for store_signals")
        return

    records_to_insert = []
    for sig in signals:
        # Ensure details are JSON serializable by converting numpy types
        details_for_json = None
        if sig.get('details'):
            details_for_json = json.dumps(convert_np_types(sig.get('details')))
        
        records_to_insert.append((
            sig['timestamp'],
            sig['contract_id'],
            sig['timeframe'],
            sig['signal_type'],
            sig.get('signal_price'),
            sig.get('signal_open'),
            sig.get('signal_high'),
            sig.get('signal_low'),
            sig.get('signal_close'),
            sig.get('signal_volume'),
            details_for_json 
        ))

    insert_sql = """
    INSERT INTO detected_signals 
    (timestamp, contract_id, timeframe, signal_type, signal_price, signal_open, signal_high, signal_low, signal_close, signal_volume, details)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (contract_id, timeframe, signal_type, timestamp) DO NOTHING;
    """
    async with DB_POOL.acquire() as conn:
        await conn.executemany(insert_sql, records_to_insert)
    logger.info(f"Attempted to store {len(signals)} signals.")


async def fetch_ohlc_bars_for_analysis(contract_id: str, timeframe_str: str, last_processed_ts: datetime) -> pd.DataFrame:
    if not DB_POOL:
        logger.error("DB_POOL not initialized for fetch_ohlc_bars_for_analysis")
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
    tf_unit, tf_value = parse_timeframe(timeframe_str)

    query = """
        SELECT timestamp, open, high, low, close, volume 
        FROM ohlc_bars
        WHERE contract_id = $1 AND timeframe_unit = $2 AND timeframe_value = $3 AND timestamp > $4
        ORDER BY timestamp ASC;
    """
    async with DB_POOL.acquire() as conn:
        records = await conn.fetch(query, contract_id, tf_unit, tf_value, last_processed_ts)
    
    if not records:
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    df = pd.DataFrame(records, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df


async def get_watermark(analyzer_id: str, contract_id: str, timeframe_str: str) -> datetime:
    if not DB_POOL:
        logger.error("DB_POOL not initialized for get_watermark")
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
        
    query = """
    SELECT last_processed_timestamp FROM analyzer_watermarks
    WHERE analyzer_id = $1 AND contract_id = $2 AND timeframe = $3;
    """
    async with DB_POOL.acquire() as conn:
        record = await conn.fetchrow(query, analyzer_id, contract_id, timeframe_str)
    
    if record and record['last_processed_timestamp']:
        return record['last_processed_timestamp']
    return datetime(1970, 1, 1, tzinfo=timezone.utc)

async def update_watermark(analyzer_id: str, contract_id: str, timeframe_str: str, new_timestamp: datetime):
    if not DB_POOL:
        logger.error("DB_POOL not initialized for update_watermark")
        return
        
    query = """
    INSERT INTO analyzer_watermarks (analyzer_id, contract_id, timeframe, last_processed_timestamp)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (analyzer_id, contract_id, timeframe) DO UPDATE SET last_processed_timestamp = EXCLUDED.last_processed_timestamp;
    """
    async with DB_POOL.acquire() as conn:
        await conn.execute(query, analyzer_id, contract_id, timeframe_str, new_timestamp)

async def run_analyzer_for_target(analyzer_id: str, contract_id: str, timeframe_str: str):
    logger.info(f"Running analyzer {analyzer_id} for {contract_id} on {timeframe_str}...")
    last_ts = await get_watermark(analyzer_id, contract_id, timeframe_str)
    logger.info(f"  Last processed timestamp: {last_ts}")

    ohlc_df = await fetch_ohlc_bars_for_analysis(contract_id, timeframe_str, last_ts)

    if ohlc_df.empty:
        logger.info(f"  No new OHLC data found for {contract_id} [{timeframe_str}] since {last_ts}.")
        return

    logger.info(f"  Fetched {len(ohlc_df)} new bars for analysis.")
    
    if 'volume' not in ohlc_df.columns:
        ohlc_df['volume'] = 0.0 

    signals = generate_trend_starts(ohlc_df, contract_id, timeframe_str)

    if signals:
        logger.info(f"  Generated {len(signals)} signals.")
        await store_signals(signals)
        latest_bar_timestamp = ohlc_df['timestamp'].max()
        if pd.notna(latest_bar_timestamp):
             await update_watermark(analyzer_id, contract_id, timeframe_str, latest_bar_timestamp)
             logger.info(f"  Watermark updated to: {latest_bar_timestamp}")
        else:
            logger.warning("  Warning: No valid timestamp found in processed bars to update watermark.")
    else:
        logger.info("  No signals generated.")
        latest_bar_timestamp = ohlc_df['timestamp'].max()
        if pd.notna(latest_bar_timestamp):
            await update_watermark(analyzer_id, contract_id, timeframe_str, latest_bar_timestamp)
            logger.info(f"  Watermark updated to: {latest_bar_timestamp} (no signals generated)")
        else:
             logger.warning("  Warning: No valid timestamp found in processed bars to update watermark (no signals).")

async def main_analyzer_loop():
    logger.info("Starting main analyzer loop...")
    try:
        await init_db_pool() # Initialize the global DB_POOL
        await create_signals_table_if_not_exists()
    except Exception as e:
        logger.critical(f"Failed to initialize database or create tables: {e}. Exiting.", exc_info=True)
        await close_db_pool() # Attempt to close pool if initialization failed partially
        return # Exit if DB setup fails

    try:
        configured_targets = []
        
        # Load targets from settings.yaml (example structure)
        # analysis_config = config.settings.get('analysis', {})
        # targets_from_config = analysis_config.get('targets', [])
        # for target_group in targets_from_config:
        #     analyzer_id = target_group.get('analyzer_id', 'default_trend_analyzer')
        #     contract_id = target_group.get('contract_id')
        #     timeframes = target_group.get('timeframes', [])
        #     if contract_id and timeframes:
        #         for tf_str in timeframes:
        #             configured_targets.append((analyzer_id, contract_id, tf_str))

        # Fallback to using live_contracts and trading.timeframes if 'analysis.targets' not defined
        if not configured_targets:
            logger.info("No specific 'analysis.targets' found in config, deriving from 'live_contracts' and 'trading.timeframes'.")
            live_contracts_config = config.settings.get('live_contracts', [])
            default_timeframes_str = config.settings.get('trading',{}).get('timeframes', ["1m", "5m", "15m"]) # Default if not in live_contracts
            
            for contract_entry in live_contracts_config:
                cid = contract_entry.get('contract_id')
                # Timeframes for live ingestion are in seconds, need to map to strings like "1m"
                # This mapping logic needs to be robust or settings.yaml needs to provide these strings for analysis
                # For now, let's assume we use the general 'trading.timeframes' list for all live contracts
                if cid:
                    for tf_str in default_timeframes_str:
                         configured_targets.append(("trend_start_finder_v1", cid, tf_str))


        unique_targets = sorted(list(set(configured_targets)))
        logger.info(f"Analyzer will run for the following targets: {unique_targets}")

        if not unique_targets:
            logger.warning("No analysis targets configured. Analyzer loop will sleep indefinitely after initial setup.")
        
        loop_count = 0
        while True:
            loop_count += 1
            logger.info(f"--- Analyzer Cycle {loop_count} starting at {datetime.now(timezone.utc)} ---")
            if not unique_targets:
                # If no targets, we might just want the loop to effectively stop or sleep very long
                # For now, it will just print this message and sleep for the configured duration.
                logger.info("No targets to process in this cycle.")
                # Fall through to sleep

            for analyzer_id, contract_id, timeframe_str in unique_targets:
                try:
                    await run_analyzer_for_target(analyzer_id, contract_id, timeframe_str)
                except Exception as e:
                    logger.error(f"ERROR running analyzer for {contract_id} [{timeframe_str}]: {e}", exc_info=True)
            
            analysis_settings = config.settings.get('analysis', {}) if isinstance(config.settings, dict) else {}
            sleep_duration_seconds = analysis_settings.get('loop_sleep_seconds', 300)

            logger.info(f"--- Analysis cycle {loop_count} complete. Sleeping for {sleep_duration_seconds} seconds. ---")
            await asyncio.sleep(sleep_duration_seconds)
    finally:
        logger.info("Main analyzer loop is ending. Closing database pool.")
        await close_db_pool()

async def shutdown_handler(): # This function might not be strictly needed if main_analyzer_loop handles its own cleanup
    logger.info("Analyzer service shutting down (called via shutdown_handler)...")
    # await close_db_pool() # Already handled by main_analyzer_loop's finally
    logger.info("Shutdown complete (called via shutdown_handler).")

if __name__ == "__main__":
    try:
        asyncio.run(main_analyzer_loop())
    except KeyboardInterrupt:
        logger.info("Analyzer service interrupted by user.")
    except Exception as e:
        logger.critical(f"Unhandled exception in main: {e}", exc_info=True)
    finally:
        # The main_analyzer_loop's finally block should handle pool closure.
        # If an exception occurs *outside* or *before* main_analyzer_loop truly starts its try/finally,
        # direct cleanup might be needed, but asyncio.run should manage the loop itself.
        logger.info("Main execution block finished.")
        # No explicit call to asyncio.run(shutdown_handler()) here anymore to avoid loop issues. 