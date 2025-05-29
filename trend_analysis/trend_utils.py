import csv
import datetime

# Global debug flags, to be set by command-line arguments
DEBUG_MODE_ACTIVE = False
DEBUG_START_INDEX = -1
DEBUG_END_INDEX = -1

# List to store debug log entries
_debug_log_entries_collector = []

# --- Debug Helper Function ---
def log_debug(bar_index, message, current_bar_obj=None, state_obj=None):
    """Adds a debug message to the collector if the current bar_index is within the debug range."""
    global _debug_log_entries_collector
    if DEBUG_MODE_ACTIVE and (DEBUG_START_INDEX <= bar_index <= DEBUG_END_INDEX):
        entry = {
            "event_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "event_type": "STRATEGY_DEBUG",
            "processing_bar_index": bar_index,
            "message": message,
        }
        if current_bar_obj:
            entry["processing_bar_timestamp"] = current_bar_obj.timestamp.isoformat()
            entry["processing_bar_ohlc"] = f"O:{current_bar_obj.o},H:{current_bar_obj.h},L:{current_bar_obj.l},C:{current_bar_obj.c},V:{current_bar_obj.volume}"
        if state_obj:
            # Add relevant state fields to the debug entry
            entry.update({
                "pds_potential_idx": state_obj.pending_downtrend_start_bar_index,
                "pds_anchor_h": state_obj.pending_downtrend_start_anchor_high,
                "pds_candidate_idx": state_obj.pds_candidate_for_cds_bar_index,
                "pds_candidate_h": state_obj.pds_candidate_for_cds_high,
                "pds_candidate_l": state_obj.pds_candidate_for_cds_low,
                "pus_potential_idx": state_obj.pending_uptrend_start_bar_index,
                "pus_anchor_l": state_obj.pending_uptrend_start_anchor_low,
                "pus_candidate_idx": state_obj.pus_candidate_for_cus_bar_index,
                "pus_candidate_l": state_obj.pus_candidate_for_cus_low,
                "pus_candidate_h": state_obj.pus_candidate_for_cus_high,
                "in_containment": state_obj.in_containment,
                "containment_ref_idx": state_obj.containment_ref_bar_index,
                "containment_ref_type": state_obj.containment_ref_type,
                "last_trend_type": state_obj.last_confirmed_trend_type,
                "last_trend_idx": state_obj.last_confirmed_trend_bar_index,
                "overall_trend_up": state_obj.current_confirmed_trend_is_uptrend
            })
        _debug_log_entries_collector.append(entry)

def get_and_clear_debug_logs():
    """Returns all collected debug logs and clears the internal collector."""
    global _debug_log_entries_collector
    logs_to_return = list(_debug_log_entries_collector)
    _debug_log_entries_collector.clear()
    return logs_to_return

# --- General Helper Functions ---
def load_bars_from_alt_csv(filename="trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv", BarClass=None):
    """
    Loads bar data from a CSV file into a list of Bar objects.
    The CSV file is expected to have 'timestamp', 'open', 'high', 'low', 'close', and optionally 'volume'.
    Bars are assumed to be in chronological order in the CSV.
    Args:
        filename (str): The path to the CSV file.
        BarClass: The Bar class to use for instantiation.
    Returns:
        list[object]: A list of Bar objects (type depends on BarClass).
    """
    if BarClass is None:
        raise ValueError("BarClass must be provided to load_bars_from_alt_csv")
    bars = []
    with open(filename, 'r', newline='') as f:
        reader = csv.DictReader(f)
        raw_bars = list(reader) # Read all rows to handle potential errors robustly
    
    required_cols = ['timestamp', 'open', 'high', 'low', 'close']
    if not raw_bars or not all(col in raw_bars[0] for col in required_cols):
        raise ValueError(f"CSV file {filename} must contain columns: {', '.join(required_cols)}")

    for i, row in enumerate(raw_bars):
        try:
            # Convert timestamp string to datetime object
            # Assuming UTC if no timezone info. Adjust if your CSV has local times.
            ts_str = row['timestamp']
            try:
                # Attempt to parse with timezone offset
                bar_timestamp = datetime.datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
            except ValueError:
                # Fallback for formats without timezone, assume UTC
                bar_timestamp = datetime.datetime.fromisoformat(ts_str)
                if bar_timestamp.tzinfo is None:
                    bar_timestamp = bar_timestamp.replace(tzinfo=datetime.timezone.utc)
            
            volume = float(row.get('volume', 0.0)) # Get volume, default to 0.0 if not present

            bars.append(BarClass(
                timestamp=bar_timestamp, 
                o=float(row['open']), 
                h=float(row['high']),
                l=float(row['low']), 
                c=float(row['close']), 
                volume=volume,
                original_file_line=i + 2, # +1 for header, +1 for 0-indexing
                index=i + 1 # 1-based chronological index
            ))
        except KeyError as e:
            print(f"Error processing row {i+2} in {filename}: Missing column {e}. Row: {row}")
            # Decide whether to skip, raise, or fill with defaults
            continue 
        except ValueError as e:
            print(f"Error processing row {i+2} in {filename}: Invalid data type {e}. Row: {row}")
            continue
    return bars

def get_unique_sorted_events(descriptions):
    """
    Takes a list of event description strings, removes duplicates, and sorts them.
    This is used to ensure log entries for a single bar are consistent and ordered.
    Args:
        descriptions (list[str]): A list of event description strings.
    Returns:
        list[str]: A sorted list of unique event description strings.
    """
    seen = set()
    unique_list = []
    for item in descriptions:
        if item not in seen:
            seen.add(item)
            unique_list.append(item)
    return sorted(unique_list)

def find_intervening_bar_for_forced_trend(all_bars, prev_confirmed_trend_bar_idx_1based, current_conflicting_trend_bar_idx_1based, find_lowest_low_for_forced_cus=True):
    """
    Finds the bar with the lowest low or highest high within a specified range of bars.
    Args:
        all_bars (list): The complete list of Bar objects (or any objects with .l, .h, .index).
        prev_confirmed_trend_bar_idx_1based (int): 1-based index of the previous confirmed trend bar.
        current_conflicting_trend_bar_idx_1based (int): 1-based index of the current conflicting trend bar.
        find_lowest_low_for_forced_cus (bool): True to find lowest low, False for highest high.
    Returns:
        object or None: The Bar object that meets the criteria, or None.
    """
    start_0idx = prev_confirmed_trend_bar_idx_1based - 1
    end_0idx = current_conflicting_trend_bar_idx_1based - 1
    if start_0idx < 0 or end_0idx >= len(all_bars) or start_0idx > end_0idx:
        return None
    search_start_0idx = start_0idx + 1
    search_end_0idx = end_0idx - 1
    if search_start_0idx > search_end_0idx:
        return None
    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice:
        return None
    if find_lowest_low_for_forced_cus:
        chosen_bar =  min(relevant_slice, key=lambda bar: bar.l)
    else:
        chosen_bar = max(relevant_slice, key=lambda bar: bar.h)
    return chosen_bar 