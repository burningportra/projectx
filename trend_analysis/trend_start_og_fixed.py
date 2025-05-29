import csv
import argparse
import pandas as pd # Keep for potential future use, though not directly used by core logic now
import datetime # Ensure datetime is imported
from typing import List
from .trend_models import Bar, State
from . import trend_utils
from . import trend_patterns
from . import cus_rules
from . import cds_rules
from . import signal_logic

# Ensure all imported utility functions are available if used directly in this file later
# from .trend_utils import log_debug, load_bars_from_alt_csv, get_unique_sorted_events, find_intervening_bar_for_forced_trend 
# from .trend_patterns import ...
# from .cus_rules import ...
# from .cds_rules import ...
# from .signal_logic import ...

def _create_signal_dict(bar_obj: Bar, signal_type: str, triggering_bar_index: int, rule_type: str, contract_id: str = "", timeframe_str: str = "") -> dict:
    """Helper to create a standardized signal dictionary."""
    return {
        'timestamp': bar_obj.timestamp, # Use datetime object directly
        'contract_id': contract_id, # Will be filled by caller if needed
        'timeframe': timeframe_str, # Will be filled by caller if needed
        'signal_type': signal_type, # 'uptrend_start' or 'downtrend_start'
        'signal_price': bar_obj.c, # Or another relevant price like PUS low or PDS high
        'signal_open': bar_obj.o,
        'signal_high': bar_obj.h,
        'signal_low': bar_obj.l,
        'signal_close': bar_obj.c,
        'signal_volume': bar_obj.volume,
        'details': {
            "confirmed_signal_bar_index": bar_obj.index,
            "confirmed_signal_bar_date": bar_obj.date, # Keep ISO string date for details
            "triggering_bar_index": triggering_bar_index, # Bar that caused confirmation
            "rule_type": rule_type # e.g., CUS_Exhaustion, CDS_PatternA
        }
    }

def process_trend_logic(all_bars: List[Bar], contract_id: str = "", timeframe_str: str = ""):
    """
    Main logic for processing bars to identify price direction signals and confirmations.

    Args:
        all_bars (list[Bar]): A list of Bar objects, in chronological order.
        contract_id (str): Optional contract ID for enriching signal data.
        timeframe_str (str): Optional timeframe string for enriching signal data.

    Returns:
        tuple: (list[dict], list[dict])
            - A list of signal dictionaries (for CUS/CDS).
            - A list of debug log dictionaries collected during processing.
    """
    if not all_bars:
        return [], []

    state = State()
    signals_found = []
    # Ensure debug logs are cleared at the start of processing for this run
    trend_utils.get_and_clear_debug_logs() # Clear any prior logs

    for k in range(len(all_bars)):
        log_index_for_this_entry = k + 1
        current_bar_event_descriptions = []
        current_bar = all_bars[k]

        # Pass current_bar and state to log_debug for richer context
        trend_utils.log_debug(log_index_for_this_entry, f"Processing Bar {log_index_for_this_entry} ({current_bar.date})", current_bar, state)
        trend_utils.log_debug(log_index_for_this_entry, f"Bar OHLCV: O:{current_bar.o} H:{current_bar.h} L:{current_bar.l} C:{current_bar.c} V:{current_bar.volume}", current_bar, state)

        if k == 0:
            # state.log_entries.append(f"{log_index_for_this_entry}. Nothing") # Old log style
            trend_utils.log_debug(log_index_for_this_entry, "First bar, no previous bar for comparison.", current_bar, state)
            continue
        
        prev_bar = all_bars[k-1]
        bar_before_prev_bar = all_bars[k-2] if k >= 2 else None
        
        cus_confirmed_this_iteration = False
        cds_confirmed_this_iteration = False

        initial_pus_candidate_idx = state.pus_candidate_for_cus_bar_index
        initial_pus_candidate_bar_obj = all_bars[initial_pus_candidate_idx - 1] if initial_pus_candidate_idx else None
        initial_pds_candidate_idx = state.pds_candidate_for_cds_bar_index
        initial_pds_candidate_bar_obj = all_bars[initial_pds_candidate_idx - 1] if initial_pds_candidate_idx else None

        trend_utils.log_debug(log_index_for_this_entry, 
            f"Initial State - PUS Candidate: Bar {initial_pus_candidate_idx if initial_pus_candidate_idx else 'None'} (L:{initial_pus_candidate_bar_obj.l if initial_pus_candidate_bar_obj else 'N/A'}) | "
            f"PDS Candidate: Bar {initial_pds_candidate_idx if initial_pds_candidate_idx else 'None'} (H:{initial_pds_candidate_bar_obj.h if initial_pds_candidate_bar_obj else 'N/A'})",
            current_bar, state)
        trend_utils.log_debug(log_index_for_this_entry, f"Initial State - Last Confirmed Trend: {state.last_confirmed_trend_type} at Bar {state.last_confirmed_trend_bar_index if state.last_confirmed_trend_bar_index else 'None'}", current_bar, state)
        trend_utils.log_debug(log_index_for_this_entry, f"Initial State - Containment: {state.in_containment} (Ref Bar: {state.containment_ref_bar_index if state.containment_ref_bar_index else 'None'}, H:{state.containment_ref_high if state.containment_ref_high else 'N/A'}, L:{state.containment_ref_low if state.containment_ref_low else 'N/A'}, Start Bar: {state.containment_start_bar_index_for_log if state.containment_start_bar_index_for_log else 'None'}, Consecutive Inside: {state.containment_consecutive_bars_inside})", current_bar, state)

        # --- PUS Invalidation due to Lower Low Break ---
        # Check if the initial PUS candidate (if any) has been invalidated by a lower low
        # occurring between the PUS candidate bar and the bar *before* current_bar.
        if initial_pus_candidate_bar_obj: # A PUS candidate must exist to be invalidated
            # Determine the range of bars to check for a lower low
            # Start checking from the bar immediately *after* the PUS candidate
            # PUS candidate bar has 1-based index: initial_pus_candidate_bar_obj.index
            # So, its 0-based index in all_bars is initial_pus_candidate_bar_obj.index - 1
            
            # We check bars from (PUS_candidate_index + 1) up to (current_bar_index - 1) [1-based indices]
            first_bar_to_check_1_based = initial_pus_candidate_bar_obj.index + 1
            # MODIFICATION: Check up to bar_before_prev_bar, so prev_bar (potential CUS trigger) is not included
            last_bar_to_check_1_based = current_bar.index - 2

            original_pus_candidate_index_for_log = initial_pus_candidate_bar_obj.index # Store for logging

            if first_bar_to_check_1_based <= last_bar_to_check_1_based: # Ensure there's a valid range
                for bar_1_idx_in_range in range(first_bar_to_check_1_based, last_bar_to_check_1_based + 1):
                    bar_to_check_0_idx = bar_1_idx_in_range -1 # Convert to 0-based for all_bars access
                    if 0 <= bar_to_check_0_idx < len(all_bars): # Bounds check
                        if all_bars[bar_to_check_0_idx].l < initial_pus_candidate_bar_obj.l:
                            trend_utils.log_debug(log_index_for_this_entry, 
                                      f"PUS Invalidation: PUS Candidate Bar {original_pus_candidate_index_for_log} (L:{initial_pus_candidate_bar_obj.l}) "
                                      f"invalidated by Bar {all_bars[bar_to_check_0_idx].index}'s Low ({all_bars[bar_to_check_0_idx].l}).", current_bar, state)
                            state._reset_all_pending_uptrend_states()
                            current_bar_event_descriptions.append(
                                f"PUS Candidate at Bar {original_pus_candidate_index_for_log} invalidated by lower low before Bar {current_bar.index}."
                            )
                            initial_pus_candidate_bar_obj = None # Nullify for current iteration's CUS eval
                            initial_pus_candidate_idx = None     # Nullify its 1-based index too
                            break # Stop checking once invalidated

        signal_logic._handle_containment_logic(current_bar, state, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions)

        can_confirm_cus, cus_trigger_rule_type = cus_rules._evaluate_cus_rules(
            current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars
        )

        can_confirm_cds, cds_trigger_rule_type = cds_rules._evaluate_cds_rules(
            current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars, state
        )

        if can_confirm_cus:
            cus_confirmed_this_iteration = True
            confirmed_bar_for_this_cus = initial_pus_candidate_bar_obj
            
            # Handle forced alternation before primary CUS signal
            if state.last_confirmed_trend_type == 'uptrend' and \
               state.last_confirmed_trend_bar_index and confirmed_bar_for_this_cus and \
               confirmed_bar_for_this_cus.index > state.last_confirmed_trend_bar_index:
                forced_dt_bar = trend_utils.find_intervening_bar_for_forced_trend(
                    all_bars, state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cus.index, find_lowest_low_for_forced_cus=False
                )
                if forced_dt_bar:
                    signals_found.append(_create_signal_dict(forced_dt_bar, "downtrend_start", current_bar.index, f"FORCED_by_CUS_{cus_trigger_rule_type}", contract_id, timeframe_str))
                    current_bar_event_descriptions.append(f"Confirmed Downtrend Start from Bar {forced_dt_bar.index} ({forced_dt_bar.date}) # FORCED by CUS_{cus_trigger_rule_type} @ {confirmed_bar_for_this_cus.index}")
                    # This forced signal also updates the last_confirmed_trend in state via state.confirm_downtrend if we call it here
                    # For now, State.confirm_uptrend will handle its own alternation check too.

            signals_found.append(_create_signal_dict(confirmed_bar_for_this_cus, "uptrend_start", current_bar.index, cus_trigger_rule_type, contract_id, timeframe_str))
            cus_rules._apply_cus_confirmation(current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, state, all_bars, current_bar_event_descriptions)
        
        if can_confirm_cds:
            cds_confirmed_this_iteration = True
            confirmed_bar_for_this_cds = initial_pds_candidate_bar_obj

            # Handle forced alternation before primary CDS signal
            if state.last_confirmed_trend_type == 'downtrend' and \
               state.last_confirmed_trend_bar_index and confirmed_bar_for_this_cds and \
               confirmed_bar_for_this_cds.index > state.last_confirmed_trend_bar_index:
                forced_ut_bar = trend_utils.find_intervening_bar_for_forced_trend(
                    all_bars, state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cds.index, find_lowest_low_for_forced_cus=True
                )
                if forced_ut_bar:
                    signals_found.append(_create_signal_dict(forced_ut_bar, "uptrend_start", current_bar.index, f"FORCED_by_CDS_{cds_trigger_rule_type}", contract_id, timeframe_str))
                    current_bar_event_descriptions.append(f"Confirmed Uptrend Start from Bar {forced_ut_bar.index} ({forced_ut_bar.date}) # FORCED by CDS_{cds_trigger_rule_type} @ {confirmed_bar_for_this_cds.index}")

            signals_found.append(_create_signal_dict(confirmed_bar_for_this_cds, "downtrend_start", current_bar.index, cds_trigger_rule_type, contract_id, timeframe_str))
            cds_rules._apply_cds_confirmation(confirmed_bar_for_this_cds, state, all_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions)

        signal_logic._check_and_set_new_pending_signals(current_bar, prev_bar, bar_before_prev_bar, state, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions)

        # Log final unique events for this bar for traceability if needed, though debug logs are primary now
        if current_bar_event_descriptions:
            unique_events = trend_utils.get_unique_sorted_events(current_bar_event_descriptions)
            final_log_text_for_bar = "; ".join(unique_events)
            trend_utils.log_debug(log_index_for_this_entry, f"Bar Summary: {final_log_text_for_bar}", current_bar, state)
        else:
            trend_utils.log_debug(log_index_for_this_entry, "Bar Summary: Neutral (no specific events).", current_bar, state)

    # Collect all debug logs from trend_utils
    debug_log_entries = trend_utils.get_and_clear_debug_logs()
    
    # Sort and de-duplicate signals before returning
    signals_found.sort(key=lambda s: (s['details']['confirmed_signal_bar_index'], 0 if s['signal_type'] == 'downtrend_start' else 1, s['details']['triggering_bar_index']))
    unique_signals_deduped = []
    seen_keys = set()
    for sig in signals_found:
        key = (sig['details']['confirmed_signal_bar_index'], sig['signal_type'])
        if key not in seen_keys:
            seen_keys.add(key)
            unique_signals_deduped.append(sig)

    return unique_signals_deduped, debug_log_entries

def export_trend_start_events_to_csv(signals_list: List[dict], output_csv="trend_analysis/confirmed_trend_starts.csv"):
    """
    Exports a list of signal dictionaries to a CSV file.

    Args:
        signals_list (list[dict]): A list of signal dictionaries from process_trend_logic.
        output_csv (str): The file path for the output CSV file.
    """
    if not signals_list:
        print(f"No signals to export to {output_csv}.")
        return

    # Prepare rows for CSV: extract relevant fields from signal dictionaries
    rows_for_csv = []
    for signal in signals_list:
        rows_for_csv.append({
            'trend_start_type': signal['signal_type'].replace("_start", ""), # e.g. 'uptrend' or 'downtrend'
            'bar_index': signal['details']['confirmed_signal_bar_index'],
            'date': signal['details']['confirmed_signal_bar_date'], # Using the string date from details
            'rule': signal['details'].get('rule_type', 'N/A'),
            'trigger_bar_index': signal['details'].get('triggering_bar_index', 'N/A')
        })

    # Sort rows by bar_index first, then by trend_start_type if bar_index is the same.
    rows_for_csv.sort(key=lambda x: (x['bar_index'], x['trend_start_type']))
    
    fieldnames = ['trend_start_type', 'bar_index', 'date', 'rule', 'trigger_bar_index']
    with open(output_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_for_csv)
    print(f"Exported {len(rows_for_csv)} confirmed trend starts to {output_csv}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Trend Start Analysis Script")
    parser.add_argument("--debug-start", type=int, help="Start bar index for detailed debugging (1-based)")
    parser.add_argument("--debug-end", type=int, help="End bar index for detailed debugging (1-based)")
    parser.add_argument("--input-csv", type=str, default="data/CON.F.US.MES.M25_1d_ohlc.csv", help="Input CSV file path")
    parser.add_argument("--output-csv", type=str, default="trend_analysis/confirmed_trend_starts_output.csv", help="Output CSV file path for signals")
    parser.add_argument("--debug-log-csv", type=str, default="trend_analysis/debug_log_output.csv", help="Output CSV file path for debug logs")
    args = parser.parse_args()

    if args.debug_start is not None and args.debug_end is not None:
        trend_utils.DEBUG_MODE_ACTIVE = True
        trend_utils.DEBUG_START_INDEX = args.debug_start
        trend_utils.DEBUG_END_INDEX = args.debug_end
        print(f"*** DETAILED DEBUG MODE ACTIVE for bars {trend_utils.DEBUG_START_INDEX} to {trend_utils.DEBUG_END_INDEX} ***")

    try:
        csv_file_path = args.input_csv
        print(f"Attempting to load bars from: {csv_file_path}")
        # Pass the Bar class from trend_models to the loader function
        all_bars_chronological = trend_utils.load_bars_from_alt_csv(filename=csv_file_path, BarClass=Bar)
        
        if not all_bars_chronological:
            print(f"No bars were loaded. Please check the CSV file path '{csv_file_path}' and its format.")
        else:
            print(f"Successfully loaded {len(all_bars_chronological)} bars.")
            
            print("\nStarting trend start analysis...")
            # process_trend_logic now returns (signals, debug_logs)
            generated_signals, collected_debug_logs = process_trend_logic(all_bars_chronological, contract_id="CLI_RUN", timeframe_str="TF_CLI")
            print("Trend start analysis finished.")

            if generated_signals:
                print(f"\n--- Generated {len(generated_signals)} Signals ---")
                # for signal in generated_signals:
                #     print(signal) # Can be verbose
                export_trend_start_events_to_csv(generated_signals, output_csv=args.output_csv)
            else:
                print("\n--- No signals generated. ---")

            if collected_debug_logs:
                print(f"\n--- Collected {len(collected_debug_logs)} Debug Log Entries ---")
                # for log_entry in collected_debug_logs:
                #     print(log_entry) # Can be verbose
                # Optionally, write debug logs to their own CSV
                if args.debug_log_csv:
                    debug_df = pd.DataFrame(collected_debug_logs)
                    debug_df.to_csv(args.debug_log_csv, index=False)
                    print(f"Debug logs exported to {args.debug_log_csv}")
            else:
                print("\n--- No debug logs collected (or debug mode was off/range did not match). ---")

    except FileNotFoundError:
        print(f"Error: The CSV data file '{csv_file_path}' was not found. ")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc() 