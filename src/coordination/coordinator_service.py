import asyncio
import asyncpg
import logging
import logging.config # Added for dictConfig
from typing import List, Dict, Any, Optional, Tuple
import datetime
import os

from src.core.config import Config, load_config # Added load_config
# from src.core.db_utils import create_db_pool, close_db_pool # Removed this import

# Configure logging
logger = logging.getLogger(__name__)
DB_CONN_RETRY_INTERVAL = 5 # For initial connection in main

async def get_coordinator_watermark(pool: asyncpg.Pool, coordinator_id: str) -> Optional[int]:
    """Fetches the last processed signal ID for the given coordinator."""
    query = "SELECT last_processed_signal_id FROM coordinator_watermarks WHERE coordinator_id = $1;"
    try:
        result = await pool.fetchval(query, coordinator_id)
        if result is not None:
            logger.info(f"Retrieved watermark for {coordinator_id}: {result}")
            return int(result)
        else:
            logger.info(f"No watermark found for {coordinator_id}. Will process from the beginning or a defined start point.")
            return None # Or 0 if you prefer to start from the absolute beginning
    except Exception as e:
        logger.error(f"Error fetching watermark for {coordinator_id}: {e}")
        return None # Or handle as appropriate

async def update_coordinator_watermark(pool: asyncpg.Pool, coordinator_id: str, last_processed_signal_id: int):
    """Updates or inserts the last processed signal ID for the coordinator."""
    query = """
    INSERT INTO coordinator_watermarks (coordinator_id, last_processed_signal_id)
    VALUES ($1, $2)
    ON CONFLICT (coordinator_id) DO UPDATE SET last_processed_signal_id = $2;
    """
    try:
        await pool.execute(query, coordinator_id, last_processed_signal_id)
        logger.info(f"Updated watermark for {coordinator_id} to {last_processed_signal_id}")
    except Exception as e:
        logger.error(f"Error updating watermark for {coordinator_id}: {e}")

async def fetch_new_signals(pool: asyncpg.Pool, last_processed_signal_id: Optional[int], limit: int) -> List[Dict[str, Any]]:
    """Fetches new signals from the detected_signals table."""
    if last_processed_signal_id is None:
        # If no watermark, fetch all signals up to the limit, ordered by signal_id
        # This ensures we start processing from the oldest available signal if no history.
        query = """
        SELECT signal_id, timestamp, contract_id, timeframe, signal_type, signal_price, details, analyzer_id, trigger_timestamp
        FROM detected_signals
        ORDER BY signal_id ASC
        LIMIT $1;
        """
        params = [limit]
        logger.info(f"Fetching initial batch of signals (up to {limit}).")
    else:
        query = """
        SELECT signal_id, timestamp, contract_id, timeframe, signal_type, signal_price, details, analyzer_id, trigger_timestamp
        FROM detected_signals
        WHERE signal_id > $1
        ORDER BY signal_id ASC
        LIMIT $2;
        """
        params = [last_processed_signal_id, limit]
        logger.info(f"Fetching new signals after signal_id {last_processed_signal_id} (limit {limit}).")
    
    try:
        rows = await pool.fetch(query, *params)
        signals = [dict(row) for row in rows]
        if signals:
            logger.info(f"Fetched {len(signals)} new signals.")
        else:
            logger.debug("No new signals found in this fetch cycle.")
        return signals
    except Exception as e:
        logger.error(f"Error fetching new signals: {e}")
        return []

class SignalCoordinator:
    def __init__(self, config: Config, pool: asyncpg.Pool):
        self.config = config
        self.pool = pool
        self.coordination_config = self.config.get_coordination_config()
        if not self.coordination_config:
            raise ValueError("Coordination config not found in settings.yaml")
        
        self.coordinator_id = self.coordination_config.get("coordinator_id", "default_coordinator")
        self.loop_interval = self.coordination_config.get("loop_interval_seconds", 60)
        self.db_fetch_limit = self.coordination_config.get("db_fetch_limit", 100)
        self.rules = self.coordination_config.get("rules", [])
        
        # State for coordination logic (e.g., recently seen signals)
        # Key: (contract_id, timeframe), Value: list of {'timestamp': datetime, 'signal_type': str, 'signal_id': int, 'signal_price': float}
        self.recent_signals_cache: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        # Determine max window needed for cache based on rule offsets, ensure it's positive
        self.cache_window_minutes = 60 # Default cache window
        if self.rules:
            max_offset = 0
            for rule in self.rules:
                # Consider absolute offset for cache window size
                rule_max_offset = abs(rule.get("max_time_offset_minutes", 0))
                if rule_max_offset > max_offset:
                    max_offset = rule_max_offset
            self.cache_window_minutes = max(max_offset, 60) # Ensure at least a 60 min window or largest offset
        logger.info(f"Signal cache window set to {self.cache_window_minutes} minutes.")

    def _add_signal_to_cache(self, signal: Dict[str, Any]):
        """Adds a signal to the internal cache and ensures timestamps are datetime objects."""
        # Ensure timestamp is a datetime object and UTC (or consistently timezone-aware)
        # asyncpg typically returns timestamptz as timezone-aware datetime objects.
        sig_timestamp = signal.get('timestamp')
        if not isinstance(sig_timestamp, datetime.datetime):
            try:
                # Attempt to parse if it's an ISO format string (common from JSON or other sources)
                sig_timestamp = datetime.datetime.fromisoformat(str(sig_timestamp))
            except (TypeError, ValueError) as e:
                logger.warning(f"Could not parse timestamp for signal {signal.get('signal_id')}: {sig_timestamp}, error: {e}. Skipping cache add.")
                return
        
        # Ensure timezone awareness (preferably UTC)
        if sig_timestamp.tzinfo is None:
            logger.warning(f"Signal {signal.get('signal_id')} timestamp {sig_timestamp} is naive. Assuming UTC for caching.")
            sig_timestamp = sig_timestamp.replace(tzinfo=datetime.timezone.utc)
        else:
            sig_timestamp = sig_timestamp.astimezone(datetime.timezone.utc) # Convert to UTC if not already

        key = (signal["contract_id"], signal["timeframe"])
        if key not in self.recent_signals_cache:
            self.recent_signals_cache[key] = []
        
        # Store essential info for matching, keep it lean
        cached_signal_info = {
            "timestamp": sig_timestamp,
            "signal_type": signal["signal_type"],
            "signal_id": signal["signal_id"],
            "signal_price": signal.get("signal_price") # Include price for potential future use in coordinated signal details
        }
        
        self.recent_signals_cache[key].append(cached_signal_info)
        # Keep cache sorted by timestamp for efficient searching/pruning (newest last)
        self.recent_signals_cache[key].sort(key=lambda s: s["timestamp"])

    def _prune_cache(self):
        """Prunes signals older than self.cache_window_minutes from the cache."""
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        cutoff_time = now_utc - datetime.timedelta(minutes=self.cache_window_minutes)
        
        keys_to_prune = []
        for key, signals_list in self.recent_signals_cache.items():
            # Filter out old signals. Since list is sorted, can optimize, but simple filter is fine for now.
            self.recent_signals_cache[key] = [s for s in signals_list if s["timestamp"] >= cutoff_time]
            if not self.recent_signals_cache[key]:
                keys_to_prune.append(key) # Mark for deletion if list becomes empty
        
        for key in keys_to_prune:
            del self.recent_signals_cache[key]
        logger.debug(f"Cache pruned. Cutoff: {cutoff_time}. Current cache size: {sum(len(v) for v in self.recent_signals_cache.values())} signals.")

    async def process_signals(self, signals: List[Dict[str, Any]]):
        """Processes fetched signals according to defined coordination rules."""
        if not signals:
            return

        coordinated_signals_log = [] # Store log messages for coordinated signals
        
        # First, add all new signals to cache and prune the cache
        for signal in signals:
            self._add_signal_to_cache(signal)
        self._prune_cache()

        # Then, iterate through (potentially only the new) signals to find primary rule matches
        # For simplicity, we re-evaluate all rules against all new signals as potential primary signals.
        # More advanced: only check new signals as primary, or use a more event-driven approach if performance is critical.
        for primary_signal in signals: 
            # Ensure primary_signal's timestamp is prepared (done if it came through _add_signal_to_cache)
            # Re-fetch from cache to ensure we have the processed datetime object
            key_ps = (primary_signal["contract_id"], primary_signal["timeframe"])
            processed_primary_signal_info = None
            if key_ps in self.recent_signals_cache:
                for s_info in reversed(self.recent_signals_cache[key_ps]): # Search newest first
                    if s_info["signal_id"] == primary_signal["signal_id"]:
                        processed_primary_signal_info = s_info
                        break
            
            if not processed_primary_signal_info:
                logger.debug(f"Primary signal {primary_signal.get('signal_id')} not found in processed cache, skipping rule check for it.")
                continue
            
            primary_ts = processed_primary_signal_info["timestamp"]

            for rule in self.rules:
                if not rule.get("enabled", False):
                    continue

                if rule.get("contract_id") != "ALL" and rule.get("contract_id") != primary_signal["contract_id"]:
                    continue

                if primary_signal["timeframe"] == rule.get("primary_timeframe"):
                    primary_signal_type = primary_signal["signal_type"]
                    confirming_timeframe = rule.get("confirming_timeframe")
                    min_offset_minutes = rule.get("min_time_offset_minutes", 0)
                    max_offset_minutes = rule.get("max_time_offset_minutes", 60)

                    expected_confirming_signal_type = ""
                    if rule.get("signal_type_match") == "any_matching_trend":
                        expected_confirming_signal_type = primary_signal_type
                    # Add other signal_type_match logic here if needed (e.g., opposite_trend)
                    else:
                        expected_confirming_signal_type = rule.get("signal_type_match", primary_signal_type)

                    confirming_cache_key = (primary_signal["contract_id"], confirming_timeframe)
                    if confirming_cache_key not in self.recent_signals_cache:
                        continue # No signals for this contract/confirming_timeframe in cache

                    # Search for a confirming signal in the cache
                    for confirming_signal_info in self.recent_signals_cache[confirming_cache_key]:
                        if confirming_signal_info["signal_type"] == expected_confirming_signal_type:
                            confirming_ts = confirming_signal_info["timestamp"]
                            time_diff_minutes = (confirming_ts - primary_ts).total_seconds() / 60

                            if min_offset_minutes <= time_diff_minutes <= max_offset_minutes:
                                log_msg = (
                                    f"COORDINATED SIGNAL by rule '{rule['rule_name']}': "
                                    f"Primary: ID {primary_signal['signal_id']} ({primary_signal['contract_id']}@{primary_signal['timeframe']} {primary_signal_type} @ {primary_ts.strftime('%Y-%m-%d %H:%M:%S %Z')}), "
                                    f"Confirming: ID {confirming_signal_info['signal_id']} ({primary_signal['contract_id']}@{confirming_timeframe} {expected_confirming_signal_type} @ {confirming_ts.strftime('%Y-%m-%d %H:%M:%S %Z')}), "
                                    f"Time Diff: {time_diff_minutes:.2f} mins."
                                )
                                logger.info(log_msg)
                                coordinated_signals_log.append(log_msg)
                                # Optional: Break if one confirming signal is enough per primary signal/rule
                                # break 
        # No separate coordinated_signals_found list needed if just logging
        # if coordinated_signals_log:
        #     logger.info(f"Found {len(coordinated_signals_log)} coordinated signal instances in this cycle.")


    async def run_cycle(self):
        """Runs a single cycle of fetching and processing signals."""
        logger.info("Coordinator cycle starting...")
        last_processed_id = await get_coordinator_watermark(self.pool, self.coordinator_id)
        
        new_signals = await fetch_new_signals(self.pool, last_processed_id, self.db_fetch_limit)
        
        if new_signals:
            await self.process_signals(new_signals)
            
            # Update watermark to the ID of the last signal processed in this batch
            # Ensure signals are sorted by signal_id if not already guaranteed by fetch_new_signals
            # If fetch_new_signals returns them ordered by signal_id ASC, the last one is the highest.
            highest_processed_id = new_signals[-1]["signal_id"]
            await update_coordinator_watermark(self.pool, self.coordinator_id, highest_processed_id)
        else:
            logger.info("No new signals to process in this cycle.")
        
        logger.info("Coordinator cycle finished.")

async def main():
    config = load_config()
    log_cfg = config.get_logging_config()
    if log_cfg:
        logging.config.dictConfig(log_cfg)
    else:
        # Basic logging if no config is found
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    logger.info("Starting Coordinator Service...")

    db_settings = config.get_database_config()
    if not db_settings:
        logger.critical("Database configuration not found. Exiting.")
        return

    pool = None
    while True: # Retry loop for initial pool creation
        try:
            password_env_var_name = db_settings.get('password_env_var')
            actual_password = None
            if password_env_var_name:
                actual_password = os.getenv(password_env_var_name)
            
            if not actual_password:
                logger.error(f"Database password not found using env var: {password_env_var_name}. Check .env file and its loading.")
                # Optionally, raise an error or exit if password is critical and not found
                # For now, it will likely fail at asyncpg.create_pool and retry

            pool = await asyncpg.create_pool(
                user=db_settings.get('user'),
                password=actual_password, # Use the fetched password
                database=db_settings.get('dbname'),
                host=db_settings.get('host'),
                port=db_settings.get('port'),
                min_size=config.get_db_min_connections(),
                max_size=config.get_db_max_connections()
            )
            if pool:
                 logger.info("Database connection pool established.")
                 break # Exit retry loop on success
        except (ConnectionRefusedError, asyncpg.exceptions.CannotConnectNowError) as e:
            logger.error(f"Database connection pool failed: {e}. Retrying in {DB_CONN_RETRY_INTERVAL}s...")
            await asyncio.sleep(DB_CONN_RETRY_INTERVAL)
        except Exception as e:
            logger.error(f"An unexpected error occurred creating DB pool: {e}. Retrying in {DB_CONN_RETRY_INTERVAL}s...")
            await asyncio.sleep(DB_CONN_RETRY_INTERVAL)
    
    if not pool:
        logger.critical("Failed to create database pool after retries. Exiting.")
        return

    coordinator = SignalCoordinator(config, pool)
    shutdown_event = asyncio.Event()

    try:
        logger.info("SignalCoordinator running. Press Ctrl+C to stop.")
        while not shutdown_event.is_set():
            await coordinator.run_cycle()
            try:
                # Wait for the loop interval or until shutdown_event is set
                await asyncio.wait_for(shutdown_event.wait(), timeout=coordinator.loop_interval)
            except asyncio.TimeoutError:
                pass # Loop interval passed, continue to next cycle
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received, stopping coordinator...")
    except asyncio.CancelledError:
        logger.info("Coordinator run cancelled.")
    finally:
        logger.info("Shutting down SignalCoordinator...")
        shutdown_event.set() # Signal other tasks if any depend on this
        if pool:
            await pool.close()
            logger.info("Database connection pool closed.")
        logger.info("SignalCoordinator stopped.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Coordinator service application interrupted.") 