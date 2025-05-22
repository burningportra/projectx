import asyncio
import pandas as pd
from datetime import datetime, timezone
import logging
import logging.config
import json
import asyncpg
import numpy as np
from typing import List, Dict, Any, Callable, Optional
import os
import csv

from src.core.config import Config
from src.strategies.trend_start_finder import generate_trend_starts
from src.core.utils import parse_timeframe, format_timeframe_from_unit_value

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

config = Config()
BAR_HISTORY_COUNT = 200

STRATEGY_MAPPING = {
    "cus_cds_trend_finder": generate_trend_starts
}

DB_POOL_MAIN_FOR_HANDLER: Optional[asyncpg.Pool] = None

CSV_LOG_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'logs')
CSV_FILE_PATH = os.path.join(CSV_LOG_DIR, 'detected_signals_history.csv')
CSV_HEADERS = [
    'analyzer_id', 'timestamp', 'trigger_timestamp', 'contract_id', 'timeframe',
    'signal_type', 'signal_price',
    'signal_open', 'signal_high', 'signal_low', 'signal_close', 'signal_volume',
    'details'
]

def ensure_csv_headers():
    os.makedirs(CSV_LOG_DIR, exist_ok=True)
    if not os.path.exists(CSV_FILE_PATH) or os.path.getsize(CSV_FILE_PATH) == 0:
        with open(CSV_FILE_PATH, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(CSV_HEADERS)
            logger.info(f"CSV headers written to {CSV_FILE_PATH}")

ensure_csv_headers()

DEBUG_LOG_DIR = CSV_LOG_DIR
DEBUG_LOG_FIELDNAMES = [
    "event_timestamp", "event_type", "message", 
    "processing_bar_timestamp", "processing_bar_index", "processing_bar_ohlc",
    "confirmed_bar_index", "rule", 
    "pus_low_bar_index", "pus_low_value",
    "pds_high_bar_index", "pds_high_value",
    "pds_bar_index", "pds_high",
    "pus_bar_index", "pus_low",
    "original_cus_bar_index", "original_cds_bar_index",
    "ref_bar_index", "ref_type", "ref_high", "ref_low",
    "last_trend_type", "last_trend_bar",
    "current_bar_low_val", "pds_low_val",
    "current_bar_high_val", "pus_high_val",
    "pds_anchor_high",
    "pds_confirmed_peak_bar_index", "pds_confirmed_peak_high", "pds_confirmed_peak_low",
    "pus_anchor_low",
    "pus_confirmed_low_bar_index", "pus_confirmed_low_low", "pus_confirmed_low_high",
    "in_containment", "containment_ref_bar_index", 
    "overall_trend_is_up"
]

def write_strategy_debug_logs_to_csv(
    debug_log_entries: List[Dict[str, Any]],
    analyzer_id: str,
    contract_id: str,
    timeframe_str: str
):
    if not debug_log_entries:
        logger.info(f"No debug log entries to write for {analyzer_id}/{contract_id}/{timeframe_str}.")
        return

    os.makedirs(DEBUG_LOG_DIR, exist_ok=True)
    debug_log_filename = f"trend_finder_debug_{analyzer_id}_{contract_id}_{timeframe_str}.csv".replace("/", "_")
    debug_log_filepath = os.path.join(DEBUG_LOG_DIR, debug_log_filename)

    fieldnames = DEBUG_LOG_FIELDNAMES # Use the predefined comprehensive list

    try:
        file_exists = os.path.exists(debug_log_filepath)
        # Always open in 'w' mode to overwrite with the latest full log for this run
        # Append mode was causing issues with partial writes from aborted runs.
        # For a full bar-by-bar log, overwriting each time analyzer runs for this target is better.
        with open(debug_log_filepath, 'w', newline='') as csvfile: 
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction='ignore') # Ignore extra fields from dict
            writer.writeheader() 
            writer.writerows(debug_log_entries)
        logger.info(f"Wrote {len(debug_log_entries)} debug log entries to {debug_log_filepath}")
    except Exception as e:
        logger.error(f"Error writing strategy debug logs to {debug_log_filepath}: {e}", exc_info=True)

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
        await conn.execute(create_table_sql)
        logger.info("Table 'analyzer_watermarks' checked/created.")
        return True
    except Exception as e:
        logger.error(f"Error creating analyzer_watermarks table: {e}", exc_info=True)
        return False
    finally:
        if conn: await pool.release(conn)

async def create_signals_table_if_not_exists(pool: asyncpg.Pool):
    if not pool:
        logger.critical("Database pool not provided. Cannot create signals table.")
        return
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS detected_signals (
        signal_id SERIAL PRIMARY KEY,
        analyzer_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        trigger_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        contract_id TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_price REAL,
        signal_open REAL,
        signal_high REAL,
        signal_low REAL,
        signal_close REAL,
        signal_volume REAL,
        details JSONB
    );
    """
    drop_constraint_sql = "ALTER TABLE detected_signals DROP CONSTRAINT IF EXISTS detected_signals_unique_idx;"
    add_constraint_sql = "ALTER TABLE detected_signals ADD CONSTRAINT detected_signals_unique_idx UNIQUE (analyzer_id, contract_id, timeframe, timestamp, signal_type);"
    conn = None
    try:
        conn = await pool.acquire()
        await conn.execute(create_table_sql)
        logger.info("Table 'detected_signals' checked/created.")
        await conn.execute(drop_constraint_sql)
        await conn.execute(add_constraint_sql)
        logger.info("Unique constraint 'detected_signals_unique_idx' ensured.")
        return True
    except Exception as e:
        logger.error(f"Error in DDL for detected_signals: {e}", exc_info=True)
        return False
    finally:
        if conn: await pool.release(conn)

def convert_np_types(data):
    if isinstance(data, dict):
        return {k: convert_np_types(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_np_types(i) for i in data]
    elif isinstance(data, (np.int_, np.intc, np.intp, np.int8, np.int16, np.int32, np.int64,
                           np.uint8, np.uint16, np.uint32, np.uint64)):
        return int(data)
    elif isinstance(data, (np.float16, np.float32, np.float64)):
        return float(data)
    elif isinstance(data, np.bool_):
        return bool(data)
    elif pd.isna(data):
        return None
    return data

async def store_signals(
    pool: asyncpg.Pool, analyzer_id: str, contract_id: str,
    timeframe_unit: int, timeframe_value: int, signals: List[Dict[str, Any]]
) -> int:
    if not signals or not pool: return 0
    timeframe_str = format_timeframe_from_unit_value(timeframe_unit, timeframe_value)
    signals_to_store = []
    for signal in signals:
        signal_timestamp = signal['timestamp']
        if isinstance(signal_timestamp, str):
            try:
                signal_timestamp = datetime.fromisoformat(signal_timestamp.replace('Z', '+00:00'))
            except ValueError as e:
                logger.error(f"Error parsing signal timestamp string '{signal_timestamp}': {e}. Skipping.")
                continue
        if not isinstance(signal_timestamp, datetime): continue
        if signal_timestamp.tzinfo is None:
            signal_timestamp = signal_timestamp.replace(tzinfo=timezone.utc)
        elif signal_timestamp.tzinfo != timezone.utc:
            signal_timestamp = signal_timestamp.astimezone(timezone.utc)
        
        signals_to_store.append((
            analyzer_id, signal_timestamp, datetime.now(timezone.utc), contract_id, timeframe_str,
            signal['signal_type'], signal.get('signal_price'), signal.get('open'),
            signal.get('high'), signal.get('low'), signal.get('close'), signal.get('volume'),
            json.dumps(convert_np_types(signal.get('details', {})))
        ))
    
    if signals_to_store:
        try:
            with open(CSV_FILE_PATH, 'a', newline='') as csvfile:
                writer = csv.writer(csvfile)
                for signal_row_tuple in signals_to_store:
                    csv_row = [item.isoformat() if isinstance(item, datetime) else item for item in signal_row_tuple]
                    writer.writerow(csv_row)
            logger.info(f"Appended {len(signals_to_store)} signal(s) to {CSV_FILE_PATH}")
        except Exception as e:
            logger.error(f"Error writing signals to CSV {CSV_FILE_PATH}: {e}", exc_info=True)

    insert_query = """
        INSERT INTO detected_signals (
            analyzer_id, timestamp, trigger_timestamp, contract_id, timeframe, 
            signal_type, signal_price, signal_open, signal_high, signal_low, signal_close, signal_volume, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT ON CONSTRAINT detected_signals_unique_idx DO UPDATE SET
            trigger_timestamp = EXCLUDED.trigger_timestamp, signal_price = EXCLUDED.signal_price,
            signal_open = EXCLUDED.signal_open, signal_high = EXCLUDED.signal_high,
            signal_low = EXCLUDED.signal_low, signal_close = EXCLUDED.signal_close,
            signal_volume = EXCLUDED.signal_volume, details = EXCLUDED.details
        RETURNING signal_id;
    """
    conn = None
    num_stored = 0
    try:
        conn = await pool.acquire()
        await conn.executemany(insert_query, signals_to_store)
        num_stored = len(signals_to_store)
        logger.info(f"Successfully stored/updated {num_stored} signals for {analyzer_id} ({contract_id} [{timeframe_str}]).")
    except Exception as e:
        logger.error(f"Error storing signals for {analyzer_id} ({contract_id} [{timeframe_str}]): {e}", exc_info=True)
    finally:
        if conn: await pool.release(conn)
    return num_stored

async def fetch_ohlc_bars_for_analysis(
    pool: asyncpg.Pool, contract_id: str, timeframe_unit: int, 
    timeframe_value: int, last_processed_timestamp: Optional[datetime]
) -> pd.DataFrame:
    if not pool: return pd.DataFrame()
    if last_processed_timestamp is None:
        last_processed_timestamp = datetime(1970, 1, 1, tzinfo=timezone.utc)
    query = """
        SELECT "timestamp", "open", "high", "low", "close", "volume" 
        FROM ohlc_bars
        WHERE contract_id = $1 AND timeframe_unit = $2 AND timeframe_value = $3 AND "timestamp" > $4
        ORDER BY "timestamp" ASC;
    """
    try:
        async with pool.acquire() as conn:
            records = await conn.fetch(query, contract_id, timeframe_unit, timeframe_value, last_processed_timestamp)
    except Exception as e:
        logger.error(f"Error fetching OHLC bars: {e}", exc_info=True)
        return pd.DataFrame()
    if not records: return pd.DataFrame()
    df = pd.DataFrame(records, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns: df[col] = pd.to_numeric(df[col], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df

async def fetch_ohlc_bars_for_analysis_window(
    pool: asyncpg.Pool, contract_id: str, timeframe_unit: int, 
    timeframe_value: int, end_timestamp: datetime, bar_count: int
) -> pd.DataFrame:
    if not pool: return pd.DataFrame()
    query = """
        SELECT "timestamp", "open", "high", "low", "close", "volume"
        FROM ohlc_bars
        WHERE contract_id = $1 AND timeframe_unit = $2 AND timeframe_value = $3 AND "timestamp" <= $4
        ORDER BY "timestamp" DESC LIMIT $5;
    """
    try:
        async with pool.acquire() as conn:
            records = await conn.fetch(query, contract_id, timeframe_unit, timeframe_value, end_timestamp, bar_count)
    except Exception as e:
        logger.error(f"Error fetching OHLC window: {e}", exc_info=True)
        return pd.DataFrame()
    if not records: return pd.DataFrame()
    df = pd.DataFrame(records, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df = df.sort_values(by='timestamp', ascending=True).reset_index(drop=True)
    for col in ['open', 'high', 'low', 'close', 'volume']:
        if col in df.columns: df[col] = pd.to_numeric(df[col], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df

async def get_analyzer_watermark(pool: asyncpg.Pool, analyzer_id: str, contract_id: str, timeframe: str) -> Optional[datetime]:
    if not pool: return None
    query = "SELECT last_processed_timestamp FROM analyzer_watermarks WHERE analyzer_id = $1 AND contract_id = $2 AND timeframe = $3;"
    try:
        async with pool.acquire() as conn:
            record = await conn.fetchrow(query, analyzer_id, contract_id, timeframe)
    except Exception as e:
        logger.error(f"Error fetching watermark for {analyzer_id}/{contract_id}/{timeframe}: {e}", exc_info=True)
        return None
    return record['last_processed_timestamp'] if record and record['last_processed_timestamp'] else None

async def update_analyzer_watermark(pool: asyncpg.Pool, analyzer_id: str, contract_id: str, timeframe: str, new_timestamp: datetime):
    if not pool: return
    query = """
    INSERT INTO analyzer_watermarks (analyzer_id, contract_id, timeframe, last_processed_timestamp)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (analyzer_id, contract_id, timeframe) DO UPDATE SET last_processed_timestamp = EXCLUDED.last_processed_timestamp;
    """
    try:
        async with pool.acquire() as conn:
            await conn.execute(query, analyzer_id, contract_id, timeframe, new_timestamp)
    except Exception as e:
        logger.error(f"Error updating watermark for {analyzer_id}/{contract_id}/{timeframe} to {new_timestamp}: {e}", exc_info=True)

async def run_analyzer_for_target(
    pool: asyncpg.Pool, target_config: Dict[str, Any], strategy_func: Callable
):
    analyzer_id = target_config['analyzer_id']
    contract_id = target_config['contract_id']
    timeframe_str = target_config['timeframe']
    logger.info(f"  Processing {contract_id} [{timeframe_str}] for analyzer '{analyzer_id}'")
    watermark_ts = await get_analyzer_watermark(pool, analyzer_id, contract_id, timeframe_str)
    logger.info(f"    Last processed timestamp for {analyzer_id}/{contract_id}/{timeframe_str}: {watermark_ts or 'None'}")
    
    tf_unit_val, tf_value_val = parse_timeframe(timeframe_str)
    new_bars_df = await fetch_ohlc_bars_for_analysis(
        pool, contract_id, tf_unit_val, tf_value_val, watermark_ts
    )
    if new_bars_df.empty:
        logger.info(f"    No new OHLC data for {contract_id} [{timeframe_str}] since {watermark_ts or 'beginning'}.")
        return

    logger.info(f"    Fetched {len(new_bars_df)} new OHLC bars for {contract_id} [{timeframe_str}].")
    
    generated_signals, debug_logs = strategy_func(new_bars_df, contract_id=contract_id, timeframe_str=timeframe_str)

    if debug_logs:
        write_strategy_debug_logs_to_csv(debug_logs, analyzer_id, contract_id, timeframe_str)

    if not generated_signals:
        logger.info(f"    No signals by '{analyzer_id}' for {contract_id} [{timeframe_str}].")
    else:
        logger.info(f"    Generated {len(generated_signals)} signals by '{analyzer_id}' for {contract_id} [{timeframe_str}].")
        num_stored = await store_signals(
            pool, analyzer_id, contract_id, tf_unit_val, tf_value_val, generated_signals
        )
        logger.info(f"    Stored {num_stored} signals for {analyzer_id}/{contract_id}/{timeframe_str}.")

    new_max_timestamp = new_bars_df['timestamp'].max()
    if pd.notna(new_max_timestamp):
        new_watermark = new_max_timestamp.to_pydatetime()
        if new_watermark.tzinfo is None: new_watermark = new_watermark.replace(tzinfo=timezone.utc)
        await update_analyzer_watermark(pool, analyzer_id, contract_id, timeframe_str, new_watermark)
        logger.info(f"    Updated watermark for {analyzer_id}/{contract_id}/{timeframe_str} to {new_watermark}.")
    else:
        logger.warning(f"    Could not get new watermark for {analyzer_id}/{contract_id}/{timeframe_str}.")
    logger.info(f"Finished analysis cycle for {analyzer_id} - {contract_id} [{timeframe_str}].")

async def handle_new_bar_notification(connection, pid, channel, payload_str):
    logger.info(f"Notification on '{channel}'. Raw: {payload_str[:200]}...")
    try:
        payload = json.loads(payload_str)
        if payload.get('type') != 'ohlc': return

        contract_id_notif = payload.get('contract_id')
        bar_timestamp_str = payload.get('timestamp') 
        timeframe_unit_notif = payload.get('timeframe_unit')
        timeframe_value_notif = payload.get('timeframe_value')
            
        if not all([contract_id_notif, bar_timestamp_str, timeframe_unit_notif is not None, timeframe_value_notif is not None]):
            logger.warning(f"Notification missing data: {payload}")
            return
        
        timeframe_str_notif = format_timeframe_from_unit_value(timeframe_unit_notif, timeframe_value_notif)
        bar_timestamp = datetime.fromisoformat(bar_timestamp_str.replace('Z', '+00:00'))
        if bar_timestamp.tzinfo is None: bar_timestamp = bar_timestamp.replace(tzinfo=timezone.utc)
        
        logger.info(f"OHLC bar: Contract={contract_id_notif}, TS={bar_timestamp}, TF={timeframe_str_notif}")

        analysis_config = config.settings.get('analysis', {})
        configured_targets = analysis_config.get('targets', [])
        
        for target_config in configured_targets:
            analyzer_id = target_config.get('analyzer_id')
            config_contract_id = target_config.get('contract_id')
            if not analyzer_id or not config_contract_id: continue

            strategy_func_name = target_config.get('strategy', 'cus_cds_trend_finder')
            strategy_func = STRATEGY_MAPPING.get(strategy_func_name)
            if not strategy_func:
                logger.error(f"Strategy '{strategy_func_name}' for analyzer '{analyzer_id}' not found. Cannot process notification.")
                continue

            if contract_id_notif == config_contract_id:
                for config_timeframe_str in target_config.get('timeframes', []):
                    if timeframe_str_notif == config_timeframe_str:
                        logger.info(f"  MATCH: Analyzer='{analyzer_id}', Contract='{contract_id_notif}', TF='{timeframe_str_notif}'. Triggering.")
                        tf_unit_for_query, tf_value_for_query = parse_timeframe(config_timeframe_str)
                        
                        historical_bars_df = await fetch_ohlc_bars_for_analysis_window(
                            DB_POOL_MAIN_FOR_HANDLER, contract_id_notif, 
                            tf_unit_for_query, tf_value_for_query, bar_timestamp, BAR_HISTORY_COUNT
                        )
                        if historical_bars_df.empty or len(historical_bars_df) < config.settings.get('analysis',{}).get('min_bars_for_notification_trigger', 50): # Use a config value
                            logger.info(f"    Not enough history ({len(historical_bars_df)}) for {contract_id_notif} [{config_timeframe_str}]. Skipping.")
                            continue
                        
                        generated_signals, debug_logs = strategy_func(
                            historical_bars_df, contract_id=contract_id_notif, timeframe_str=config_timeframe_str
                        )
                        if debug_logs:
                            write_strategy_debug_logs_to_csv(
                                debug_logs, analyzer_id, contract_id_notif, config_timeframe_str
                            )
                        if generated_signals:
                            num_stored = await store_signals(
                                DB_POOL_MAIN_FOR_HANDLER, analyzer_id, contract_id_notif,
                                tf_unit_for_query, tf_value_for_query, generated_signals
                            )
                            logger.info(f"    Stored {num_stored} signals for {analyzer_id}/{contract_id_notif}/{config_timeframe_str} from notification.")
                        
                        await update_analyzer_watermark(DB_POOL_MAIN_FOR_HANDLER, analyzer_id, contract_id_notif, config_timeframe_str, bar_timestamp)
                        logger.info(f"    Updated watermark for {analyzer_id}/{contract_id_notif}/{config_timeframe_str} to {bar_timestamp} from notification.")
                        break 
    except Exception as e:
        logger.error(f"Error processing notification: {e}", exc_info=True)

async def main_analyzer_loop(app_config: Config, pool: asyncpg.Pool):
    logger.info("Starting Analyzer Service event loop...")
    await create_signals_table_if_not_exists(pool)
    await create_watermarks_table_if_not_exists(pool)

    analysis_config = app_config.settings.get('analysis', {})
    analysis_targets = analysis_config.get('targets', [])
    if not analysis_targets: logger.warning("No analysis targets configured. Analyzer will be idle.")

    try:
        async with pool.acquire() as conn:
            await conn.add_listener('ohlc_update', handle_new_bar_notification)
            logger.info("Listening for new OHLC bar notifications on 'ohlc_update'...")

            logger.info("Performing initial analysis run for configured targets (1D only for debug)...")
            initial_analysis_tasks = []
            for target_config in analysis_targets:
                analyzer_id = target_config.get('analyzer_id')
                strategy_func_name = target_config.get('strategy', 'cus_cds_trend_finder')
                strategy_func = STRATEGY_MAPPING.get(strategy_func_name)
                if not analyzer_id or not strategy_func: continue
                contract_id = target_config.get('contract_id')
                if not contract_id: continue

                for tf_str in target_config.get('timeframes', []):
                    single_target_run_config_for_backlog = {
                        'analyzer_id': analyzer_id, 'contract_id': contract_id, 'timeframe': tf_str,
                    }
                    logger.info(f"Queueing {tf_str} backlog analysis for: {analyzer_id} - {contract_id} [{tf_str}]")
                    task = run_analyzer_for_target(pool, single_target_run_config_for_backlog, strategy_func)
                    initial_analysis_tasks.append(task)
            
            if initial_analysis_tasks:
                await asyncio.gather(*initial_analysis_tasks)
            logger.info("Initial backlog processing complete (1D only). Switching to full notification-driven mode.")

            while True:
                await asyncio.sleep(3600)
                logger.debug("Analyzer service alive...")
    except asyncio.CancelledError:
        logger.info("Analyzer service loop cancelled.")
    except Exception as e:
        logger.error(f"Critical error in analyzer service loop: {e}", exc_info=True)
    finally:
        logger.info("Analyzer service loop finished.")

DB_POOL_MAIN: Optional[asyncpg.Pool] = None # Renamed from db_pool_main to avoid conflict

async def init_db_pool_main_runner(): # Renamed
    global DB_POOL_MAIN 
    global DB_POOL_MAIN_FOR_HANDLER
    database_configs = config.settings['database']
    active_db_key = database_configs.get('default_analysis_db', 'local_timescaledb') 
    db_conn_details = database_configs.get(active_db_key)
    if not db_conn_details:
        logger.critical(f"DB config '{active_db_key}' not found.")
        return None
    
    password = db_conn_details.get('password')
    password_env_var = db_conn_details.get('password_env_var')
    if password_env_var:
        env_password = os.getenv(password_env_var)
        if env_password: password = env_password
        else: logger.warning(f"Env var '{password_env_var}' for DB password not set.")
    if not password:
        logger.critical(f"DB password for '{active_db_key}' not resolved.")
        return None

    try:
        DB_POOL_MAIN = await asyncpg.create_pool(
            user=db_conn_details.get('user'), password=password,
            database=db_conn_details.get('dbname'), host=db_conn_details.get('host'),
            port=db_conn_details.get('port'),
            min_size=db_conn_details.get('min_pool_size', 1),
            max_size=db_conn_details.get('max_pool_size', 10)
        )
        DB_POOL_MAIN_FOR_HANDLER = DB_POOL_MAIN
        logger.info(f"Created DB pool for AnalyzerService (main) using '{active_db_key}'.")
        return DB_POOL_MAIN
    except Exception as e:
        logger.critical(f"Failed to create DB pool for AnalyzerService (main) using '{active_db_key}': {e}", exc_info=True)
        return None

async def close_db_pool_main_runner(): # Renamed
    global DB_POOL_MAIN
    global DB_POOL_MAIN_FOR_HANDLER
    if DB_POOL_MAIN:
        logger.info("Closing DB pool for AnalyzerService (main)...")
        await DB_POOL_MAIN.close()
        DB_POOL_MAIN_FOR_HANDLER = None
        logger.info("DB pool for AnalyzerService (main) closed.")

async def run_service_with_pool():
    pool = await init_db_pool_main_runner() # Use renamed function
    if not pool:
        logger.error("Failed to init DB pool. Analyzer service cannot start.")
        return
    try:
        await main_analyzer_loop(config, pool)
    except asyncio.CancelledError:
        logger.info("Analyzer service run_service_with_pool cancelled.")
    finally:
        await close_db_pool_main_runner() # Use renamed function

if __name__ == "__main__":
    try:
        asyncio.run(run_service_with_pool())
    except KeyboardInterrupt:
        logger.info("AnalyzerService received KeyboardInterrupt. Shutting down...")
    except Exception as e:
        logger.error(f"Unhandled exception in AnalyzerService __main__: {e}", exc_info=True)
    finally:
        logger.info("AnalyzerService main execution finished.") 