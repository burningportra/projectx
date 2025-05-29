import pandas as pd
import datetime
from datetime import timezone
import logging
from typing import List, Dict, Optional, Any, Tuple

# Import the refactored components
from trend_analysis.trend_models import Bar, State # State may not be directly used here but good to have if Bar needs it implicitly
from trend_analysis import trend_utils
from trend_analysis import trend_start_og_fixed # For process_trend_logic

logger = logging.getLogger(__name__)

MIN_BARS_FOR_TREND_START = 2 # From original trend_start_finder.py, keep for consistency

def generate_trend_starts(
    bars_df: pd.DataFrame, 
    contract_id: str, 
    timeframe_str: str,
    config: Optional[Dict[str, Any]] = None, # Keep for API compatibility, though not used by new core logic directly
    debug: bool = False # This will now be controlled by trend_utils.DEBUG_MODE_ACTIVE via script args
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Generates trend start signals (CUS/CDS) using the refactored trend_analysis logic.

    Args:
        bars_df (pd.DataFrame): Input DataFrame with OHLCV data. 
                                Must include 'timestamp', 'open', 'high', 'low', 'close', 'volume'.
        contract_id (str): Contract identifier for enriching signal data.
        timeframe_str (str): Timeframe identifier for enriching signal data.
        config (Optional[Dict[str, Any]]): Optional configuration (currently unused by core logic).
        debug (bool): Controls debug log generation (now through trend_utils global flags).

    Returns:
        Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]: 
            - A list of signal dictionaries.
            - A list of debug log dictionaries.
    """
    log_prefix = f"[generate_trend_starts_v2][{contract_id}][{timeframe_str}]"
    
    initial_debug_active = trend_utils.DEBUG_MODE_ACTIVE
    initial_debug_start = trend_utils.DEBUG_START_INDEX
    initial_debug_end = trend_utils.DEBUG_END_INDEX

    if debug: 
        trend_utils.DEBUG_MODE_ACTIVE = True
        trend_utils.DEBUG_START_INDEX = 1 
        trend_utils.DEBUG_END_INDEX = len(bars_df) if not bars_df.empty else 1
        logger.info(f"{log_prefix} Debug mode explicitly enabled for this call. Start: {trend_utils.DEBUG_START_INDEX}, End: {trend_utils.DEBUG_END_INDEX}")

    if bars_df.empty or len(bars_df) < MIN_BARS_FOR_TREND_START:
        logger.info(f"{log_prefix} Not enough bars ({len(bars_df)}). Min: {MIN_BARS_FOR_TREND_START}.")
        if debug: 
            trend_utils.DEBUG_MODE_ACTIVE = initial_debug_active
            trend_utils.DEBUG_START_INDEX = initial_debug_start
            trend_utils.DEBUG_END_INDEX = initial_debug_end
        return [], []

    all_bars: List[Bar] = []
    for i, row_tuple in enumerate(bars_df.itertuples(index=False)):
        try:
            bar_ts = row_tuple.timestamp
            if not isinstance(bar_ts, datetime.datetime):
                 bar_ts = pd.to_datetime(bar_ts).to_pydatetime()
            if bar_ts.tzinfo is None:
                bar_ts = bar_ts.replace(tzinfo=timezone.utc)
            
            o = float(row_tuple.open)
            h = float(row_tuple.high)
            l = float(row_tuple.low)
            c = float(row_tuple.close)
            vol = float(row_tuple.volume) if hasattr(row_tuple, 'volume') and row_tuple.volume is not None else 0.0

            all_bars.append(Bar(
                timestamp=bar_ts,
                o=o, h=h, l=l, c=c,
                volume=vol,
                index=i + 1, 
            ))
        except AttributeError as e:
            logger.error(f"{log_prefix} Error processing row {i} from DataFrame: Missing attribute {e}. Row: {row_tuple}")
            if debug: 
                trend_utils.DEBUG_MODE_ACTIVE = initial_debug_active
                trend_utils.DEBUG_START_INDEX = initial_debug_start
                trend_utils.DEBUG_END_INDEX = initial_debug_end
            return [], [] 
        except ValueError as e:
            logger.error(f"{log_prefix} Error processing row {i} from DataFrame: Value error {e}. Row: {row_tuple}")
            if debug: 
                trend_utils.DEBUG_MODE_ACTIVE = initial_debug_active
                trend_utils.DEBUG_START_INDEX = initial_debug_start
                trend_utils.DEBUG_END_INDEX = initial_debug_end
            return [], []

    if not all_bars:
        logger.info(f"{log_prefix} No bars could be constructed from DataFrame.")
        if debug: 
            trend_utils.DEBUG_MODE_ACTIVE = initial_debug_active
            trend_utils.DEBUG_START_INDEX = initial_debug_start
            trend_utils.DEBUG_END_INDEX = initial_debug_end
        return [], []

    logger.info(f"{log_prefix} Successfully prepared {len(all_bars)} bars for trend analysis.")

    signals_found, debug_log_entries = trend_start_og_fixed.process_trend_logic(
        all_bars, 
        contract_id=contract_id, 
        timeframe_str=timeframe_str
    )

    logger.info(f"{log_prefix} Finished. Generated {len(signals_found)} signals.")
    if debug_log_entries:
        logger.info(f"{log_prefix} Collected {len(debug_log_entries)} debug log entries.")
    
    if debug: 
        trend_utils.DEBUG_MODE_ACTIVE = initial_debug_active
        trend_utils.DEBUG_START_INDEX = initial_debug_start
        trend_utils.DEBUG_END_INDEX = initial_debug_end

    return signals_found, debug_log_entries

if __name__ == '__main__':
    print(f"trend_start_finder.py (Refactored Entry Point) loaded as main.")
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s')

    data = {
        'timestamp': pd.to_datetime([
            '2023-01-01 10:00:00', '2023-01-01 11:00:00', '2023-01-01 12:00:00', 
            '2023-01-01 13:00:00', '2023-01-01 14:00:00', '2023-01-01 15:00:00'
        ], utc=True),
        'open': [100, 101, 102, 103, 104, 105],
        'high': [105, 106, 107, 108, 109, 110],
        'low': [99, 100, 101, 102, 103, 104],
        'close': [101, 102, 103, 104, 105, 106],
        'volume': [1000, 1100, 1200, 1300, 1400, 1500]
    }
    sample_df = pd.DataFrame(data)

    signals, debug_logs = generate_trend_starts(sample_df, "TEST.CON.CLI", "1h", debug=True)
    
    print("\n--- Signals Found ---")
    if signals:
        for s_idx, s_val in enumerate(signals):
            print(f"Signal {s_idx + 1}: {s_val}")
    else:
        print("No signals generated.")

    print("\n--- Debug Logs Collected ---")
    if debug_logs:
        for dl_idx, dl_val in enumerate(debug_logs):
            bar_idx_log = dl_val.get('processing_bar_index', 'N/A')
            msg_log = dl_val.get('message', 'N/A')
            print(f"Debug Log {dl_idx + 1}: Bar {bar_idx_log} - {msg_log}")
    else:
        print("No debug logs collected (or debug range didn't match any bars).")