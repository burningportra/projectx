import csv
import argparse
import pandas as pd
import datetime
import sys
import os
from typing import List, Optional, Tuple, Dict, Any

# Add the project root to Python path for package imports
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from trend_analysis.trend_models import Bar, State
import trend_analysis.trend_utils as trend_utils
import trend_analysis.trend_patterns as trend_patterns
import trend_analysis.cus_rules as cus_rules
import trend_analysis.cds_rules as cds_rules
import trend_analysis.signal_logic as signal_logic

class ForwardTrendAnalyzer:
    """
    Forward-testing trend analyzer that processes bars one at a time,
    only using historical data available up to the current bar.
    """
    
    def __init__(self, contract_id: str = "", timeframe_str: str = ""):
        self.contract_id = contract_id
        self.timeframe_str = timeframe_str
        self.state = State()
        self.historical_bars: List[Bar] = []
        self.signals_found: List[dict] = []
        self.current_bar_index = 0
        
        # Clear any existing debug logs
        trend_utils.get_and_clear_debug_logs()
    
    def _create_signal_dict(self, bar_obj: Bar, signal_type: str, triggering_bar_index: int, rule_type: str) -> dict:
        """Helper to create a standardized signal dictionary."""
        return {
            'timestamp': bar_obj.timestamp,
            'contract_id': self.contract_id,
            'timeframe': self.timeframe_str,
            'signal_type': signal_type,  # 'uptrend_start' or 'downtrend_start'
            'signal_price': bar_obj.c,
            'signal_open': bar_obj.o,
            'signal_high': bar_obj.h,
            'signal_low': bar_obj.l,
            'signal_close': bar_obj.c,
            'signal_volume': bar_obj.volume,
            'details': {
                "confirmed_signal_bar_index": bar_obj.index,
                "confirmed_signal_bar_date": bar_obj.date,
                "triggering_bar_index": triggering_bar_index,
                "rule_type": rule_type
            }
        }
    
    def process_new_bar(self, new_bar: Bar) -> List[dict]:
        """
        Process a new bar as it arrives, returning any new trend start signals.
        Only uses historical data available up to this point.
        
        Args:
            new_bar (Bar): The new bar to process
            
        Returns:
            List[dict]: Any new trend start signals detected on this bar
        """
        # Add the new bar to our historical record
        self.historical_bars.append(new_bar)
        self.current_bar_index += 1
        
        log_index_for_this_entry = self.current_bar_index
        current_bar_event_descriptions = []
        current_bar = new_bar
        
        # Log current bar processing
        trend_utils.log_debug(log_index_for_this_entry, 
                             f"Forward Test - Processing Bar {log_index_for_this_entry} ({current_bar.date})", 
                             current_bar, self.state)
        trend_utils.log_debug(log_index_for_this_entry, 
                             f"Bar OHLCV: O:{current_bar.o} H:{current_bar.h} L:{current_bar.l} C:{current_bar.c} V:{current_bar.volume}", 
                             current_bar, self.state)
        
        # First bar has no previous bars to compare
        if len(self.historical_bars) == 1:
            trend_utils.log_debug(log_index_for_this_entry, "First bar, no previous bar for comparison.", current_bar, self.state)
            return []
        
        # Get previous bars (only historical data available)
        prev_bar = self.historical_bars[-2]  # Previous bar
        bar_before_prev_bar = self.historical_bars[-3] if len(self.historical_bars) >= 3 else None
        
        signals_for_this_bar = []
        cus_confirmed_this_iteration = False
        cds_confirmed_this_iteration = False
        
        # Get current state
        initial_pus_candidate_idx = self.state.pus_candidate_for_cus_bar_index
        initial_pus_candidate_bar_obj = self.historical_bars[initial_pus_candidate_idx - 1] if initial_pus_candidate_idx else None
        initial_pds_candidate_idx = self.state.pds_candidate_for_cds_bar_index
        initial_pds_candidate_bar_obj = self.historical_bars[initial_pds_candidate_idx - 1] if initial_pds_candidate_idx else None
        
        # Log initial state
        trend_utils.log_debug(log_index_for_this_entry, 
            f"Initial State - PUS Candidate: Bar {initial_pus_candidate_idx if initial_pus_candidate_idx else 'None'} (L:{initial_pus_candidate_bar_obj.l if initial_pus_candidate_bar_obj else 'N/A'}) | "
            f"PDS Candidate: Bar {initial_pds_candidate_idx if initial_pds_candidate_idx else 'None'} (H:{initial_pds_candidate_bar_obj.h if initial_pds_candidate_bar_obj else 'N/A'})",
            current_bar, self.state)
        
        # --- PUS Invalidation due to Lower Low Break ---
        # Only check among historical bars (no future data)
        if initial_pus_candidate_bar_obj:
            first_bar_to_check_1_based = initial_pus_candidate_bar_obj.index + 1
            last_bar_to_check_1_based = current_bar.index - 2
            
            original_pus_candidate_index_for_log = initial_pus_candidate_bar_obj.index
            
            if first_bar_to_check_1_based <= last_bar_to_check_1_based:
                for bar_1_idx_in_range in range(first_bar_to_check_1_based, last_bar_to_check_1_based + 1):
                    bar_to_check_0_idx = bar_1_idx_in_range - 1
                    if 0 <= bar_to_check_0_idx < len(self.historical_bars):
                        if self.historical_bars[bar_to_check_0_idx].l < initial_pus_candidate_bar_obj.l:
                            trend_utils.log_debug(log_index_for_this_entry, 
                                      f"PUS Invalidation: PUS Candidate Bar {original_pus_candidate_index_for_log} (L:{initial_pus_candidate_bar_obj.l}) "
                                      f"invalidated by Bar {self.historical_bars[bar_to_check_0_idx].index}'s Low ({self.historical_bars[bar_to_check_0_idx].l}).", 
                                      current_bar, self.state)
                            self.state._reset_all_pending_uptrend_states()
                            current_bar_event_descriptions.append(
                                f"PUS Candidate at Bar {original_pus_candidate_index_for_log} invalidated by lower low before Bar {current_bar.index}."
                            )
                            initial_pus_candidate_bar_obj = None
                            initial_pus_candidate_idx = None
                            break
        
        # Handle containment logic
        signal_logic._handle_containment_logic(current_bar, self.state, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions)
        
        # Evaluate CUS rules (only using historical bars)
        can_confirm_cus, cus_trigger_rule_type = cus_rules._evaluate_cus_rules(
            current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, self.state, self.historical_bars
        )
        
        # Evaluate CDS rules (only using historical bars)
        can_confirm_cds, cds_trigger_rule_type = cds_rules._evaluate_cds_rules(
            current_bar, prev_bar, initial_pds_candidate_bar_obj, self.historical_bars, self.state
        )
        
        # Process CUS confirmation
        if can_confirm_cus:
            cus_confirmed_this_iteration = True
            confirmed_bar_for_this_cus = initial_pus_candidate_bar_obj
            
            # Handle forced alternation before primary CUS signal
            if self.state.last_confirmed_trend_type == 'uptrend' and \
               self.state.last_confirmed_trend_bar_index and confirmed_bar_for_this_cus and \
               confirmed_bar_for_this_cus.index > self.state.last_confirmed_trend_bar_index:
                forced_dt_bar = trend_utils.find_intervening_bar_for_forced_trend(
                    self.historical_bars, self.state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cus.index, find_lowest_low_for_forced_cus=False
                )
                if forced_dt_bar:
                    forced_signal = self._create_signal_dict(forced_dt_bar, "downtrend_start", current_bar.index, f"FORCED_by_CUS_{cus_trigger_rule_type}")
                    signals_for_this_bar.append(forced_signal)
                    self.signals_found.append(forced_signal)
                    current_bar_event_descriptions.append(f"Confirmed Downtrend Start from Bar {forced_dt_bar.index} ({forced_dt_bar.date}) # FORCED by CUS_{cus_trigger_rule_type} @ {confirmed_bar_for_this_cus.index}")
            
            # Add primary CUS signal
            cus_signal = self._create_signal_dict(confirmed_bar_for_this_cus, "uptrend_start", current_bar.index, cus_trigger_rule_type)
            signals_for_this_bar.append(cus_signal)
            self.signals_found.append(cus_signal)
            cus_rules._apply_cus_confirmation(current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, self.state, self.historical_bars, current_bar_event_descriptions)
        
        # Process CDS confirmation
        if can_confirm_cds:
            cds_confirmed_this_iteration = True
            confirmed_bar_for_this_cds = initial_pds_candidate_bar_obj
            
            # Handle forced alternation before primary CDS signal
            if self.state.last_confirmed_trend_type == 'downtrend' and \
               self.state.last_confirmed_trend_bar_index and confirmed_bar_for_this_cds and \
               confirmed_bar_for_this_cds.index > self.state.last_confirmed_trend_bar_index:
                forced_ut_bar = trend_utils.find_intervening_bar_for_forced_trend(
                    self.historical_bars, self.state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cds.index, find_lowest_low_for_forced_cus=True
                )
                if forced_ut_bar:
                    forced_signal = self._create_signal_dict(forced_ut_bar, "uptrend_start", current_bar.index, f"FORCED_by_CDS_{cds_trigger_rule_type}")
                    signals_for_this_bar.append(forced_signal)
                    self.signals_found.append(forced_signal)
                    current_bar_event_descriptions.append(f"Confirmed Uptrend Start from Bar {forced_ut_bar.index} ({forced_ut_bar.date}) # FORCED by CDS_{cds_trigger_rule_type} @ {confirmed_bar_for_this_cds.index}")
            
            # Add primary CDS signal
            cds_signal = self._create_signal_dict(confirmed_bar_for_this_cds, "downtrend_start", current_bar.index, cds_trigger_rule_type)
            signals_for_this_bar.append(cds_signal)
            self.signals_found.append(cds_signal)
            cds_rules._apply_cds_confirmation(confirmed_bar_for_this_cds, self.state, self.historical_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions)
        
        # Check for new pending signals
        signal_logic._check_and_set_new_pending_signals(current_bar, prev_bar, bar_before_prev_bar, self.state, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions)
        
        # Log summary for this bar
        if current_bar_event_descriptions:
            unique_events = trend_utils.get_unique_sorted_events(current_bar_event_descriptions)
            final_log_text_for_bar = "; ".join(unique_events)
            trend_utils.log_debug(log_index_for_this_entry, f"Bar Summary: {final_log_text_for_bar}", current_bar, self.state)
        else:
            trend_utils.log_debug(log_index_for_this_entry, "Bar Summary: Neutral (no specific events).", current_bar, self.state)
        
        return signals_for_this_bar
    
    def get_all_signals(self) -> List[dict]:
        """Get all signals found so far."""
        # Sort and de-duplicate signals
        signals_sorted = sorted(self.signals_found, key=lambda s: (s['details']['confirmed_signal_bar_index'], 0 if s['signal_type'] == 'downtrend_start' else 1, s['details']['triggering_bar_index']))
        unique_signals_deduped = []
        seen_keys = set()
        for sig in signals_sorted:
            key = (sig['details']['confirmed_signal_bar_index'], sig['signal_type'])
            if key not in seen_keys:
                seen_keys.add(key)
                unique_signals_deduped.append(sig)
        return unique_signals_deduped
    
    def get_debug_logs(self) -> List[dict]:
        """Get debug logs collected during processing."""
        return trend_utils.get_and_clear_debug_logs()

def run_forward_test_simulation(all_bars: List[Bar], contract_id: str = "", timeframe_str: str = "") -> Tuple[List[dict], List[dict]]:
    """
    Simulate forward testing by processing bars one at a time.
    
    Args:
        all_bars (list[Bar]): A list of Bar objects, in chronological order.
        contract_id (str): Optional contract ID for enriching signal data.
        timeframe_str (str): Optional timeframe string for enriching signal data.
    
    Returns:
        tuple: (list[dict], list[dict])
            - A list of signal dictionaries (for CUS/CDS).
            - A list of debug log dictionaries collected during processing.
    """
    analyzer = ForwardTrendAnalyzer(contract_id, timeframe_str)
    
    print(f"Starting forward test simulation with {len(all_bars)} bars...")
    
    for i, bar in enumerate(all_bars):
        signals_for_bar = analyzer.process_new_bar(bar)
        if signals_for_bar:
            print(f"Bar {i+1} ({bar.date}): Found {len(signals_for_bar)} signal(s)")
            for signal in signals_for_bar:
                signal_type = signal['signal_type'].replace('_start', '')
                confirmed_bar = signal['details']['confirmed_signal_bar_index']
                rule_type = signal['details']['rule_type']
                print(f"  -> {signal_type} confirmed at bar {confirmed_bar} (triggered by bar {bar.index}) - Rule: {rule_type}")
    
    all_signals = analyzer.get_all_signals()
    debug_logs = analyzer.get_debug_logs()
    
    print(f"Forward test completed. Total signals: {len(all_signals)}")
    return all_signals, debug_logs

def export_trend_start_events_to_csv(signals_list: List[dict], output_csv="trend_analysis/confirmed_trend_starts_forward.csv"):
    """
    Exports a list of signal dictionaries to a CSV file.
    """
    if not signals_list:
        print(f"No signals to export to {output_csv}.")
        return

    rows_for_csv = []
    for signal in signals_list:
        rows_for_csv.append({
            'trend_start_type': signal['signal_type'].replace("_start", ""),
            'bar_index': signal['details']['confirmed_signal_bar_index'],
            'date': signal['details']['confirmed_signal_bar_date'],
            'rule': signal['details'].get('rule_type', 'N/A'),
            'trigger_bar_index': signal['details'].get('triggering_bar_index', 'N/A')
        })

    rows_for_csv.sort(key=lambda x: (x['bar_index'], x['trend_start_type']))
    
    fieldnames = ['trend_start_type', 'bar_index', 'date', 'rule', 'trigger_bar_index']
    with open(output_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_for_csv)
    print(f"Exported {len(rows_for_csv)} confirmed trend starts to {output_csv}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Forward Test Trend Start Analysis Script")
    parser.add_argument("--debug-start", type=int, help="Start bar index for detailed debugging (1-based)")
    parser.add_argument("--debug-end", type=int, help="End bar index for detailed debugging (1-based)")
    parser.add_argument("--input-csv", type=str, default="trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv", help="Input CSV file path")
    parser.add_argument("--output-csv", type=str, default="trend_analysis/confirmed_trend_starts_forward.csv", help="Output CSV file path for signals")
    parser.add_argument("--debug-log-csv", type=str, default="trend_analysis/debug_log_forward.csv", help="Output CSV file path for debug logs")
    args = parser.parse_args()

    if args.debug_start is not None and args.debug_end is not None:
        trend_utils.DEBUG_MODE_ACTIVE = True
        trend_utils.DEBUG_START_INDEX = args.debug_start
        trend_utils.DEBUG_END_INDEX = args.debug_end
        print(f"*** DETAILED DEBUG MODE ACTIVE for bars {trend_utils.DEBUG_START_INDEX} to {trend_utils.DEBUG_END_INDEX} ***")

    try:
        csv_file_path = args.input_csv
        print(f"Attempting to load bars from: {csv_file_path}")
        all_bars_chronological = trend_utils.load_bars_from_alt_csv(filename=csv_file_path, BarClass=Bar)
        
        if not all_bars_chronological:
            print(f"No bars were loaded. Please check the CSV file path '{csv_file_path}' and its format.")
        else:
            print(f"Successfully loaded {len(all_bars_chronological)} bars.")
            
            print("\nStarting forward test trend start analysis...")
            generated_signals, collected_debug_logs = run_forward_test_simulation(all_bars_chronological, contract_id="FORWARD_TEST", timeframe_str="1D")
            print("Forward test trend start analysis finished.")

            if generated_signals:
                print(f"\n--- Generated {len(generated_signals)} Signals in Forward Test ---")
                export_trend_start_events_to_csv(generated_signals, output_csv=args.output_csv)
            else:
                print("\n--- No signals generated in forward test. ---")

            if collected_debug_logs:
                print(f"\n--- Collected {len(collected_debug_logs)} Debug Log Entries ---")
                if args.debug_log_csv:
                    debug_df = pd.DataFrame(collected_debug_logs)
                    debug_df.to_csv(args.debug_log_csv, index=False)
                    print(f"Debug logs exported to {args.debug_log_csv}")
            else:
                print("\n--- No debug logs collected. ---")

    except FileNotFoundError:
        print(f"Error: The CSV data file '{csv_file_path}' was not found.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc() 