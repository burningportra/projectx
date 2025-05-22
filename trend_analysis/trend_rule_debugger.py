import argparse
import pandas as pd
import sys
import os

# Default OHLC data file path - relative to the script location
DEFAULT_OHLC_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "CON.F.US.MES.M25_4h_ohlc.csv")

# Add project root to sys.path to allow importing from trend_analyzer_alt
# This assumes the script is in trend_analysis/ and trend_analyzer_alt.py is in the same directory
# For more robust imports, especially if structure changes, consider package structure or other path adjustments.
# Assuming trend_analyzer_alt.py is in the same directory as this script for now.
try:
    from .trend_analyzer_alt import (
        Bar, State, CUS_RULE_DEFINITIONS, CDS_RULE_DEFINITIONS,
        load_bars_from_alt_csv,  # To load initial data
        _evaluate_cus_rules, _evaluate_cds_rules, # For specific rule evaluation
        _apply_cus_confirmation, _apply_cds_confirmation, # To apply state changes
        _handle_containment_logic, _check_and_set_new_pending_signals, # For state evolution
        get_unique_sorted_events # For logging multiple events
    )
except ImportError:
    # Fallback if running as a script and . is not the current package
    # This might happen if trend_analysis is not treated as a package
    # or if the script is run from a different working directory.
    # A more robust solution would involve setting up the project as a package.
    print("Attempting fallback import for trend_analyzer_alt components...")
    # Assuming trend_analyzer_alt.py is in the same directory
    # This is a common pattern but can be fragile.
    # For cleaner project structure, __init__.py in trend_analysis and proper PYTHONPATH are better.
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from trend_analyzer_alt import (
        Bar, State, CUS_RULE_DEFINITIONS, CDS_RULE_DEFINITIONS,
        load_bars_from_alt_csv,
        _evaluate_cus_rules, _evaluate_cds_rules,
        _apply_cus_confirmation, _apply_cds_confirmation,
        _handle_containment_logic, _check_and_set_new_pending_signals,
        get_unique_sorted_events
    )

def format_state_for_log(state_obj: State) -> str:
    """Helper to format the State object for logging."""
    if not state_obj:
        return "State: None"
    
    # Basic PUS/PDS candidate info
    pus_cand_idx = state_obj.pus_candidate_for_cus_bar_index
    pus_cand_low = state_obj.pus_candidate_for_cus_low
    pds_cand_idx = state_obj.pds_candidate_for_cds_bar_index
    pds_cand_high = state_obj.pds_candidate_for_cds_high

    # Containment
    containment_info = "Not in containment"
    if state_obj.in_containment:
        containment_info = (
            f"In containment (RefBar: {state_obj.containment_ref_bar_index}, "
            f"Type: {state_obj.containment_ref_type}, "
            f"H: {state_obj.containment_ref_high}, L: {state_obj.containment_ref_low}, "
            f"BarsInside: {state_obj.containment_consecutive_bars_inside})"
        )
    
    # Last confirmed trend
    last_trend = "None"
    if state_obj.last_confirmed_trend_type:
        last_trend = f"{state_obj.last_confirmed_trend_type.upper()} at bar {state_obj.last_confirmed_trend_bar_index}"

    return (
        f"PUS_Cand_Idx: {pus_cand_idx if pus_cand_idx else 'N/A'}, PUS_Cand_L: {pus_cand_low if pus_cand_low else 'N/A'}; "
        f"PDS_Cand_Idx: {pds_cand_idx if pds_cand_idx else 'N/A'}, PDS_Cand_H: {pds_cand_high if pds_cand_high else 'N/A'}; "
        f"Containment: {containment_info}; "
        f"LastConfirmedTrend: {last_trend}; "
        f"CurrentConfirmedTrendIsUptrend: {state_obj.current_confirmed_trend_is_uptrend}"
    )

def prompt_for_input():
    """
    Interactive mode to prompt user for all required inputs.
    Returns a dictionary with all parameters for analysis.
    """
    print("\n=== Trend Rule Debugger Interactive Mode ===")
    print("Please provide the following information:\n")
    
    # Get OHLC data file
    while True:
        ohlc_data_file = input("OHLC data file path (leave blank for default): ").strip() or DEFAULT_OHLC_FILE
        if os.path.exists(ohlc_data_file):
            break
        print(f"Error: File '{ohlc_data_file}' not found. Please enter a valid file path.")
    
    # Get expected trend type
    while True:
        expected_trend_type = input("Expected trend type (CUS or CDS): ").strip().upper()
        if expected_trend_type in ["CUS", "CDS"]:
            break
        print("Error: Please enter either 'CUS' (Confirmed Uptrend Start) or 'CDS' (Confirmed Downtrend Start).")
    
    # Get event and confirmation indices
    while True:
        try:
            trend_start_event_bar_index = int(input("Trend start event bar index (1-based): ").strip())
            if trend_start_event_bar_index > 0:
                break
            print("Error: Bar index must be a positive integer.")
        except ValueError:
            print("Error: Please enter a valid integer.")
    
    while True:
        try:
            trend_confirmation_bar_index = int(input("Trend confirmation bar index (1-based): ").strip())
            if trend_confirmation_bar_index > 0:
                if trend_confirmation_bar_index < trend_start_event_bar_index:
                    print("Warning: Confirmation bar comes before event bar. This is unusual but proceeding...")
                break
            print("Error: Bar index must be a positive integer.")
        except ValueError:
            print("Error: Please enter a valid integer.")
    
    # Get context bars
    while True:
        try:
            context_bars_before = int(input("Number of context bars before event bar [10]: ").strip() or "10")
            if context_bars_before >= 0:
                break
            print("Error: Must be a non-negative integer.")
        except ValueError:
            print("Error: Please enter a valid integer or leave blank for default (10).")
    
    while True:
        try:
            context_bars_after = int(input("Number of context bars after confirmation bar [5]: ").strip() or "5")
            if context_bars_after >= 0:
                break
            print("Error: Must be a non-negative integer.")
        except ValueError:
            print("Error: Please enter a valid integer or leave blank for default (5).")
    
    # Get optional outputs
    output_log_file = input("Output log file (leave blank for console only): ").strip() or None
    export_data_slice_file = input("Export data slice file (leave blank to skip): ").strip() or None
    
    # Get unwanted trend start flag
    while True:
        unwanted_trend_response = input("Is this an unwanted trend start? (y/n): ").strip().lower()
        if unwanted_trend_response in ['y', 'yes', 'n', 'no']:
            unwanted_trend_start = unwanted_trend_response in ['y', 'yes']
            break
        print("Error: Please answer 'y' or 'n'.")
    
    # Return as a dictionary that mimics the argparse namespace
    return {
        'ohlc_data_file': ohlc_data_file,
        'expected_trend_type': expected_trend_type,
        'trend_start_event_bar_index': trend_start_event_bar_index,
        'trend_confirmation_bar_index': trend_confirmation_bar_index,
        'context_bars_before': context_bars_before,
        'context_bars_after': context_bars_after,
        'output_log_file': output_log_file,
        'export_data_slice_file': export_data_slice_file,
        'unwanted_trend_start': unwanted_trend_start,
        'interactive_mode': True
    }

def main():
    # Setup argument parser for command-line mode
    parser = argparse.ArgumentParser(description="Trend Rule Debugger & Developer Tool")
    parser.add_argument("--ohlc_data_file", type=str, default=DEFAULT_OHLC_FILE, 
                       help=f"Path to the OHLC data CSV file (default: {DEFAULT_OHLC_FILE}).")
    parser.add_argument("--expected_trend_type", type=str, choices=["CUS", "CDS"], help="Expected trend type (CUS or CDS).")
    parser.add_argument("--trend_start_event_bar_index", type=int, help="1-based index of the PUS/PDS event bar (the bar that *becomes* the PUS/PDS).")
    parser.add_argument("--trend_confirmation_bar_index", type=int, help="1-based index of the bar where the trend is expected to be *confirmed*.")
    parser.add_argument("--context_bars_before", type=int, default=10, help="Number of bars to load before the PUS/PDS event bar.")
    parser.add_argument("--context_bars_after", type=int, default=5, help="Number of bars to load after the trend confirmation bar.")
    parser.add_argument("--output_log_file", type=str, help="Optional: Path to write the detailed log to a file.")
    parser.add_argument("--export_data_slice_file", type=str, help="Optional: Path to export the OHLC data slice (as Bar objects) to a CSV file.")
    parser.add_argument("--unwanted_trend_start", action="store_true", help="Flag to mark this as an unwanted trend start (false positive).")
    parser.add_argument("--interactive", "-i", action="store_true", help="Run in interactive mode (prompts for inputs).")

    args = parser.parse_args()
    
    # Check if we should run in interactive mode
    # Either explicitly requested or no required args provided
    if args.interactive or not (args.expected_trend_type and 
                               args.trend_start_event_bar_index is not None and 
                               args.trend_confirmation_bar_index is not None):
        # Use interactive mode
        input_params = prompt_for_input()
    else:
        # Use command-line args
        input_params = vars(args)
        input_params['interactive_mode'] = False
    
    # From here, use input_params as a dictionary instead of args namespace
    
    log_messages = []
    def custom_print(message):
        print(message)
        log_messages.append(str(message))

    custom_print("Trend Rule Debugger")
    custom_print("===================")
    custom_print(f"Running with parameters:")
    for key, value in input_params.items():
        if key != 'interactive_mode':  # Skip the internal flag
            custom_print(f"  {key.replace('_', ' ').capitalize()}: {value}")
    custom_print("\n")
    
    # Mark if this is an unwanted trend start in the log
    if input_params.get('unwanted_trend_start', False):
        custom_print("⚠️ NOTE: This has been marked as an UNWANTED trend start (false positive) ⚠️")
        custom_print("\n")
    
    # --- 1. Data Loading and Slicing ---
    custom_print("--- 1. Data Loading and Slicing ---")
    try:
        # Load all bars using the function from trend_analyzer_alt
        # This ensures Bar objects are created correctly with all necessary attributes.
        all_bars_from_file = load_bars_from_alt_csv(filename=input_params['ohlc_data_file'])
        if not all_bars_from_file:
            custom_print(f"Error: No bars were loaded from {input_params['ohlc_data_file']}. Please check the file and its format.")
            return
        custom_print(f"Successfully loaded {len(all_bars_from_file)} bars from {input_params['ohlc_data_file']}.")
    except FileNotFoundError:
        custom_print(f"Error: OHLC data file not found at {input_params['ohlc_data_file']}")
        return
    except Exception as e:
        custom_print(f"Error reading OHLC data file or creating Bar objects: {e}")
        import traceback
        traceback.print_exc()
        return

    # Adjust for 0-based indexing for slicing from the list of Bar objects
    # Note: Bar.index is 1-based (chronological_index)
    # User provides 1-based indices
    event_bar_1_idx = input_params['trend_start_event_bar_index']
    confirmation_bar_1_idx = input_params['trend_confirmation_bar_index']

    # Find the 0-based list indices for slicing
    # The PUS/PDS event bar is the bar *at* trend_start_event_bar_index
    # The confirmation bar is the bar *at* trend_confirmation_bar_index

    # Ensure indices are valid relative to loaded bars
    if not (0 < event_bar_1_idx <= len(all_bars_from_file)):
        custom_print(f"Error: trend_start_event_bar_index ({event_bar_1_idx}) is out of bounds for the data file (1 to {len(all_bars_from_file)}).")
        return
    if not (0 < confirmation_bar_1_idx <= len(all_bars_from_file)):
        custom_print(f"Error: trend_confirmation_bar_index ({confirmation_bar_1_idx}) is out of bounds for the data file (1 to {len(all_bars_from_file)}).")
        return
    
    # Calculate slice boundaries (0-based for list slicing)
    slice_start_0_idx = max(0, (event_bar_1_idx - 1) - input_params['context_bars_before'])
    # end_slice_0_idx is inclusive for list slicing, so +1 to confirmation_bar_0_idx + context_bars_after
    slice_end_0_idx = min(len(all_bars_from_file) - 1, (confirmation_bar_1_idx - 1) + input_params['context_bars_after'])

    if slice_start_0_idx > slice_end_0_idx:
        custom_print(f"Error: Calculated start index for slice ({slice_start_0_idx + 1}) is after end index ({slice_end_0_idx + 1}). Check input indices and context bars.")
        return

    # The actual slice of Bar objects to analyze
    analysis_slice_bar_objects = all_bars_from_file[slice_start_0_idx : slice_end_0_idx + 1]

    if not analysis_slice_bar_objects:
        custom_print("Error: The calculated data slice is empty. Please check your input parameters.")
        return
        
    custom_print(f"Analyzing slice from original bar index {analysis_slice_bar_objects[0].index} to {analysis_slice_bar_objects[-1].index} (inclusive).")
    custom_print(f"Total bars in slice: {len(analysis_slice_bar_objects)}\n")

    if input_params.get('export_data_slice_file'):
        try:
            # Exporting Bar object data to CSV
            slice_data_for_export = [{
                'date': b.date, 'open': b.o, 'high': b.h, 'low': b.l, 'close': b.c,
                'original_file_line': b.original_file_line, 'chronological_index': b.index
            } for b in analysis_slice_bar_objects]
            pd.DataFrame(slice_data_for_export).to_csv(input_params['export_data_slice_file'], index=False)
            custom_print(f"Data slice (Bar objects) exported to {input_params['export_data_slice_file']}\n")
        except Exception as e:
            custom_print(f"Error exporting data slice: {e}\n")

    # --- 2. Initialize State ---
    current_state = State() # Fresh state for the purpose of this focused analysis run
    custom_print("--- 2. Initializing State for Slice Analysis ---")
    custom_print(f"Initial State (before processing slice): {format_state_for_log(current_state)}\n")

    # --- 3. Targeted Logic Execution & Detailed Output ---
    custom_print("--- 3. Targeted Logic Execution & Detailed Output ---")
    
    prev_bar_obj_in_slice = None

    for slice_idx, current_bar_obj_in_slice in enumerate(analysis_slice_bar_objects):
        current_bar_event_descriptions_for_log = [] # For this bar's events in the log
        
        # The _actual_ prev_bar for rule evaluation is the one just before current_bar_obj_in_slice in the *full* dataset,
        # which might be outside the slice if current_bar_obj_in_slice is the first in the slice.
        # The rule functions in trend_analyzer_alt expect Bar objects.
        actual_prev_bar_for_rules = None
        if current_bar_obj_in_slice.index > 1: # Bar.index is 1-based
             # all_bars_from_file is 0-indexed list, Bar.index is 1-based
            actual_prev_bar_for_rules = all_bars_from_file[current_bar_obj_in_slice.index - 2]


        custom_print(f"\n--- Processing Bar (Original Index: {current_bar_obj_in_slice.index}, Date: {current_bar_obj_in_slice.date}) ---")
        
        # Log Bar Data
        custom_print("  Bar Data:")
        custom_print(f"    Current Bar: {current_bar_obj_in_slice}")
        if actual_prev_bar_for_rules: # This is the true previous bar from the full dataset
            custom_print(f"    Prev Bar (Actual for Rules): {actual_prev_bar_for_rules}")
        elif prev_bar_obj_in_slice: # Fallback to prev_bar_obj_in_slice if at start of full data
             custom_print(f"    Prev Bar (Slice Context): {prev_bar_obj_in_slice} (Note: actual_prev_bar_for_rules is None, likely first bar of dataset)")
        else:
            custom_print("    Prev Bar: N/A (first bar in slice and dataset or issue with prev bar logic)")


        # State Snapshot (Before rule eval for this bar)
        custom_print(f"  State Snapshot (BEFORE processing Bar {current_bar_obj_in_slice.index}): {format_state_for_log(current_state)}")
        
        # PUS/PDS Candidate Info from State
        # These are candidates *before* current_bar is processed by state-update logic like _check_and_set_new_pending_signals
        # The rule evaluators will use these.
        initial_pus_candidate_bar_obj_for_eval = None
        if current_state.pus_candidate_for_cus_bar_index is not None and 0 < current_state.pus_candidate_for_cus_bar_index <= len(all_bars_from_file):
            initial_pus_candidate_bar_obj_for_eval = all_bars_from_file[current_state.pus_candidate_for_cus_bar_index - 1]
        
        initial_pds_candidate_bar_obj_for_eval = None
        if current_state.pds_candidate_for_cds_bar_index is not None and 0 < current_state.pds_candidate_for_cds_bar_index <= len(all_bars_from_file):
            initial_pds_candidate_bar_obj_for_eval = all_bars_from_file[current_state.pds_candidate_for_cds_bar_index - 1]

        custom_print("  PUS/PDS Candidates (from state before this bar's logic):")
        custom_print(f"    Initial PUS Candidate for CUS: {initial_pus_candidate_bar_obj_for_eval if initial_pus_candidate_bar_obj_for_eval else 'None'}")
        custom_print(f"    Initial PDS Candidate for CDS: {initial_pds_candidate_bar_obj_for_eval if initial_pds_candidate_bar_obj_for_eval else 'None'}")


        # --- Detailed CUS Rule Evaluation Log ---
        custom_print("  CUS Rule Evaluation Details:")
        cus_triggered_by_rule_name_for_log = None
        if initial_pus_candidate_bar_obj_for_eval and actual_prev_bar_for_rules:
            for rule_name, rule_func in CUS_RULE_DEFINITIONS:
                # Signature: rule_func(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars)
                outcome = rule_func(current_bar_obj_in_slice, actual_prev_bar_for_rules, 
                                    initial_pus_candidate_bar_obj_for_eval, 
                                    initial_pds_candidate_bar_obj_for_eval, # Pass current PDS candidate for context
                                    current_state, all_bars_from_file)
                custom_print(f"    - Rule '{rule_name}': Evaluated. Outcome: {outcome}")
                if outcome and not cus_triggered_by_rule_name_for_log: # Capture first trigger
                    cus_triggered_by_rule_name_for_log = rule_name
                    custom_print(f"      ^-- This rule would trigger CUS for PUS at Bar {initial_pus_candidate_bar_obj_for_eval.index}")
        elif not actual_prev_bar_for_rules:
            custom_print("    Skipping CUS rule evaluation (no previous bar for comparison).")
        else:
            custom_print("    Skipping CUS rule evaluation (no active PUS candidate to confirm).")

        # --- Detailed CDS Rule Evaluation Log ---
        custom_print("  CDS Rule Evaluation Details:")
        cds_triggered_by_rule_name_for_log = None
        if initial_pds_candidate_bar_obj_for_eval and actual_prev_bar_for_rules:
            for rule_name, rule_func in CDS_RULE_DEFINITIONS:
                # Signature: rule_func(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)
                # Note: CDS rules in trend_analyzer_alt might have slightly different signatures if state is needed
                # Adapting for now based on typical CDS rule structure.
                # The provided `_evaluate_cds_rules` takes `all_bars`.
                outcome = rule_func(current_bar_obj_in_slice, actual_prev_bar_for_rules,
                                    initial_pds_candidate_bar_obj_for_eval,
                                    all_bars_from_file) # state not typically passed directly to CDS rule funcs in example
                custom_print(f"    - Rule '{rule_name}': Evaluated. Outcome: {outcome}")
                if outcome and not cds_triggered_by_rule_name_for_log: # Capture first trigger
                    cds_triggered_by_rule_name_for_log = rule_name
                    custom_print(f"      ^-- This rule would trigger CDS for PDS at Bar {initial_pds_candidate_bar_obj_for_eval.index}")
        elif not actual_prev_bar_for_rules:
            custom_print("    Skipping CDS rule evaluation (no previous bar for comparison).")
        else:
            custom_print("    Skipping CDS rule evaluation (no active PDS candidate to confirm).")

        # --- Simulate State Evolution for THIS BAR ---
        # This part updates current_state based on current_bar_obj_in_slice and actual_prev_bar_for_rules
        # It uses the helper functions from trend_analyzer_alt.py's main loop.
        
        # These flags will be set by the _apply functions if a confirmation happens.
        # We need to manage event descriptions for the current bar's processing log.
        current_bar_processing_events = [] # Distinct from current_bar_event_descriptions_for_log which is for overall log entry

        if actual_prev_bar_for_rules: # Logic can only run if there's a previous bar
            _handle_containment_logic(current_bar_obj_in_slice, current_state, 
                                      initial_pds_candidate_bar_obj_for_eval, # Use the PDS cand *before* this bar's logic
                                      initial_pus_candidate_bar_obj_for_eval, # Use the PUS cand *before* this bar's logic
                                      current_bar_processing_events)

            # Re-evaluate for actual confirmation based on current state & bar
            # _evaluate_cus_rules returns (can_confirm_cus, cus_trigger_rule_type)
            can_confirm_cus_now, actual_cus_trigger_rule = _evaluate_cus_rules(
                current_bar_obj_in_slice, actual_prev_bar_for_rules, 
                initial_pus_candidate_bar_obj_for_eval, 
                initial_pds_candidate_bar_obj_for_eval, current_state, all_bars_from_file
            )
            
            # _evaluate_cds_rules returns (can_confirm_cds, cds_trigger_rule_type)
            can_confirm_cds_now, actual_cds_trigger_rule = _evaluate_cds_rules(
                current_bar_obj_in_slice, actual_prev_bar_for_rules,
                initial_pds_candidate_bar_obj_for_eval, all_bars_from_file
            )
            
            confirmed_cus_this_bar = False
            confirmed_cds_this_bar = False

            # Apply CUS confirmation if rules met
            if can_confirm_cus_now and initial_pus_candidate_bar_obj_for_eval:
                _apply_cus_confirmation(current_bar_obj_in_slice, initial_pus_candidate_bar_obj_for_eval, 
                                        actual_cus_trigger_rule, current_state, 
                                        all_bars_from_file, current_bar_processing_events)
                confirmed_cus_this_bar = True
            
            # Apply CDS confirmation if rules met (and CUS didn't take precedence or rules allow both)
            # The original logic implies CUS has priority if both PUS/PDS could be confirmed.
            # For debugging, we want to see if CDS *would* have fired.
            # _apply_cds_confirmation will update state.
            if can_confirm_cds_now and initial_pds_candidate_bar_obj_for_eval:
                # If CUS was also confirmed, the state might have changed (e.g. PDS invalidated by CUS logic)
                # For pure debugging, we might want to show "CDS would have fired" even if CUS took it.
                # But for state evolution, apply CDS only if CUS didn't happen or if it makes sense.
                # Assuming for now: if CUS happened, it might clear PDS, so CDS might not apply.
                # The _apply_cds_confirmation has its own logic.
                # We are using the state *as it is* after potential CUS application.
                 _apply_cds_confirmation(initial_pds_candidate_bar_obj_for_eval, current_state,
                                        all_bars_from_file, initial_pus_candidate_bar_obj_for_eval, # PUS cand before this bar
                                        current_bar_processing_events)
                 confirmed_cds_this_bar = True # This means CDS logic was applied.

            # Check for new pending signals
            _check_and_set_new_pending_signals(current_bar_obj_in_slice, actual_prev_bar_for_rules, current_state, 
                                               confirmed_cds_this_bar, confirmed_cus_this_bar, # Use status from *this bar's* processing
                                               current_bar_processing_events)
        else:
            current_bar_processing_events.append("First bar in slice/dataset, skipping state evolution logic that requires a previous bar.")


        # Confirmation Outcome Logging (based on what actually happened to the state)
        custom_print("  Confirmation Outcome for this Bar:")
        final_confirmed_trend_type_this_bar = None
        final_triggering_rule_this_bar = None # This is the rule that *actually* confirmed and changed state

        # We need to check the state *after* _apply_... functions to see what was confirmed.
        # The easiest way is to see if last_confirmed_trend_bar_index was updated to current_bar_obj_in_slice.index
        # or if the PUS/PDS that was candidate got confirmed.
        
        # This logic needs to be more robust by checking if the *expected* PUS/PDS candidate was confirmed
        # The `cus_triggered_by_rule_name_for_log` and `cds_triggered_by_rule_name_for_log` are from *pure evaluation*.
        # The `actual_cus_trigger_rule` and `actual_cds_trigger_rule` are what `_evaluate_...` returned just before `_apply_...`
        
        # Let's report based on the *logged* individual rule triggers for clarity,
        # and then compare to the *expected* confirmation.
        
        effective_confirmed_cus = False
        effective_confirmed_cds = False

        if cus_triggered_by_rule_name_for_log and initial_pus_candidate_bar_obj_for_eval and \
           current_state.last_confirmed_trend_type == 'uptrend' and \
           current_state.last_confirmed_trend_bar_index == initial_pus_candidate_bar_obj_for_eval.index:
            final_confirmed_trend_type_this_bar = "CUS"
            final_triggering_rule_this_bar = actual_cus_trigger_rule # The one used by _apply_cus_confirmation
            custom_print(f"    ACTUAL CUS Confirmed for PUS at Bar {initial_pus_candidate_bar_obj_for_eval.index} by rule: {final_triggering_rule_this_bar} (on current_bar {current_bar_obj_in_slice.index})")
            effective_confirmed_cus = True
        
        if cds_triggered_by_rule_name_for_log and initial_pds_candidate_bar_obj_for_eval and \
           current_state.last_confirmed_trend_type == 'downtrend' and \
           current_state.last_confirmed_trend_bar_index == initial_pds_candidate_bar_obj_for_eval.index :
            # If CUS also confirmed, this might be complex. For now, assume they are somewhat exclusive due to state changes.
            final_confirmed_trend_type_this_bar = "CDS" # Can be overwritten if CUS also happened
            final_triggering_rule_this_bar = actual_cds_trigger_rule # The one used by _apply_cds_confirmation
            custom_print(f"    ACTUAL CDS Confirmed for PDS at Bar {initial_pds_candidate_bar_obj_for_eval.index} by rule: {final_triggering_rule_this_bar} (on current_bar {current_bar_obj_in_slice.index})")
            effective_confirmed_cds = True

        if not effective_confirmed_cus and not effective_confirmed_cds:
            custom_print(f"    No CUS or CDS confirmed for any existing PUS/PDS candidate by this bar ({current_bar_obj_in_slice.index}).")
            if cus_triggered_by_rule_name_for_log and initial_pus_candidate_bar_obj_for_eval:
                 custom_print(f"      (Note: CUS Rule '{cus_triggered_by_rule_name_for_log}' FIRED for PUS at {initial_pus_candidate_bar_obj_for_eval.index}, but state may not reflect it as final confirmation, or it was overridden).")
            if cds_triggered_by_rule_name_for_log and initial_pds_candidate_bar_obj_for_eval:
                 custom_print(f"      (Note: CDS Rule '{cds_triggered_by_rule_name_for_log}' FIRED for PDS at {initial_pds_candidate_bar_obj_for_eval.index}, but state may not reflect it as final confirmation, or it was overridden).")


        is_expected_confirmation_bar = (current_bar_obj_in_slice.index == input_params['trend_confirmation_bar_index'])
        is_expected_pus_pds_event_bar = (current_bar_obj_in_slice.index == input_params['trend_start_event_bar_index'])

        if is_expected_confirmation_bar:
            custom_print(f"    DEBUG: This bar ({current_bar_obj_in_slice.index}) IS the EXPECTED CONFIRMATION BAR for {input_params['expected_trend_type']} (expected PUS/PDS was at {input_params['trend_start_event_bar_index']}).")
            
            # Did the *expected PUS/PDS* (from trend_start_event_bar_index) get confirmed as *expected_trend_type*?
            expected_candidate_confirmed_as_expected_type = False
            trigger_for_expected = "N/A"

            if input_params['expected_trend_type'] == "CUS" and effective_confirmed_cus:
                if initial_pus_candidate_bar_obj_for_eval and initial_pus_candidate_bar_obj_for_eval.index == input_params['trend_start_event_bar_index']:
                    expected_candidate_confirmed_as_expected_type = True
                    trigger_for_expected = final_triggering_rule_this_bar
            elif input_params['expected_trend_type'] == "CDS" and effective_confirmed_cds:
                 if initial_pds_candidate_bar_obj_for_eval and initial_pds_candidate_bar_obj_for_eval.index == input_params['trend_start_event_bar_index']:
                    expected_candidate_confirmed_as_expected_type = True
                    trigger_for_expected = final_triggering_rule_this_bar
            
            # If this was marked as unwanted, we want to highlight different things
            if input_params.get('unwanted_trend_start', False):
                if expected_candidate_confirmed_as_expected_type:
                    custom_print(f"    ❌ FALSE POSITIVE DETECTED: Unwanted {input_params['expected_trend_type']} for event at bar {input_params['trend_start_event_bar_index']} WAS CONFIRMED by rule '{trigger_for_expected}'.")
                    custom_print(f"       This is problematic because you marked this as an unwanted trend start, but the rules still confirmed it.")
                else:
                    custom_print(f"    ✅ GOOD: Unwanted {input_params['expected_trend_type']} for event at bar {input_params['trend_start_event_bar_index']} was NOT confirmed.")
                    if final_confirmed_trend_type_this_bar:
                        custom_print(f"       (Note: A different trend {final_confirmed_trend_type_this_bar} was confirmed instead, which is fine)")
            else:
                # Normal expected trend behavior
                if expected_candidate_confirmed_as_expected_type:
                    custom_print(f"    ✅ SUCCESS: Expected {input_params['expected_trend_type']} for event at bar {input_params['trend_start_event_bar_index']} WAS CONFIRMED at this bar by rule '{trigger_for_expected}'.")
                elif final_confirmed_trend_type_this_bar: # Something was confirmed, but not the expected one or not for the right PUS/PDS
                     custom_print(f"    ❌ MISMATCH: A {final_confirmed_trend_type_this_bar} (rule '{final_triggering_rule_this_bar}') was confirmed, but not the expected {input_params['expected_trend_type']} for event at {input_params['trend_start_event_bar_index']}, or for a different PUS/PDS.")
                     if input_params['expected_trend_type'] == "CUS" and initial_pus_candidate_bar_obj_for_eval and initial_pus_candidate_bar_obj_for_eval.index == input_params['trend_start_event_bar_index']:
                         custom_print(f"        The PUS at {input_params['trend_start_event_bar_index']} was a candidate, but CUS rules did not confirm it as such via state update.")
                     elif input_params['expected_trend_type'] == "CDS" and initial_pds_candidate_bar_obj_for_eval and initial_pds_candidate_bar_obj_for_eval.index == input_params['trend_start_event_bar_index']:
                         custom_print(f"        The PDS at {input_params['trend_start_event_bar_index']} was a candidate, but CDS rules did not confirm it as such via state update.")

                else: # No trend confirmed for the expected PUS/PDS
                    custom_print(f"    ❓ FALSE NEGATIVE?: Expected {input_params['expected_trend_type']} for event at bar {input_params['trend_start_event_bar_index']} was NOT confirmed at this expected confirmation bar.")
                    # Add more detail: was the PUS/PDS even active?
                    if input_params['expected_trend_type'] == "CUS":
                        if not initial_pus_candidate_bar_obj_for_eval or initial_pus_candidate_bar_obj_for_eval.index != input_params['trend_start_event_bar_index']:
                            custom_print(f"        Reason: PUS from bar {input_params['trend_start_event_bar_index']} was not the active PUS candidate for CUS eval (Active PUS: {initial_pus_candidate_bar_obj_for_eval}).")
                        elif cus_triggered_by_rule_name_for_log:
                             custom_print(f"        Reason: A CUS rule ('{cus_triggered_by_rule_name_for_log}') DID fire for the PUS, but it didn't result in confirmed state for it.")
                        else:
                             custom_print(f"        Reason: No CUS rule fired for the active PUS candidate from bar {input_params['trend_start_event_bar_index']}.")
                    elif input_params['expected_trend_type'] == "CDS":
                        if not initial_pds_candidate_bar_obj_for_eval or initial_pds_candidate_bar_obj_for_eval.index != input_params['trend_start_event_bar_index']:
                            custom_print(f"        Reason: PDS from bar {input_params['trend_start_event_bar_index']} was not the active PDS candidate for CDS eval (Active PDS: {initial_pds_candidate_bar_obj_for_eval}).")
                        elif cds_triggered_by_rule_name_for_log:
                            custom_print(f"        Reason: A CDS rule ('{cds_triggered_by_rule_name_for_log}') DID fire for the PDS, but it didn't result in confirmed state for it.")
                        else:
                            custom_print(f"        Reason: No CDS rule fired for the active PDS candidate from bar {input_params['trend_start_event_bar_index']}.")

        elif final_confirmed_trend_type_this_bar: # A trend was confirmed, but not on the expected bar
             custom_print(f"    NOTE: A {final_confirmed_trend_type_this_bar} (rule '{final_triggering_rule_this_bar}') was confirmed by this bar ({current_bar_obj_in_slice.index}), which is NOT the expected confirmation bar ({input_params['trend_confirmation_bar_index']} for {input_params['expected_trend_type']} from {input_params['trend_start_event_bar_index']}).")


        # Log events from state processing for this bar
        if current_bar_processing_events:
            unique_events = get_unique_sorted_events(current_bar_processing_events)
            custom_print(f"  State machine events during this bar's processing: {'; '.join(unique_events)}")
        else:
            custom_print("  No specific state machine events logged during this bar's core processing.")
            
        # Final State Snapshot (After all logic for this bar)
        custom_print(f"  State Snapshot (AFTER processing Bar {current_bar_obj_in_slice.index}): {format_state_for_log(current_state)}")

        prev_bar_obj_in_slice = current_bar_obj_in_slice # For the next iteration's "Prev Bar (Slice Context)" log

    custom_print("\nDebugging session finished.")

    # Process output log file
    if input_params.get('output_log_file'):
        try:
            with open(input_params['output_log_file'], 'w') as f:
                for msg in log_messages:
                    f.write(msg + "\n")
            print(f"Full debug log also written to {input_params['output_log_file']}")
        except Exception as e:
            print(f"Error writing log to file {input_params['output_log_file']}: {e}")
    
    # If in interactive mode, ask if they want to continue with another analysis
    if input_params.get('interactive_mode', False):
        while True:
            continue_response = input("\nWould you like to analyze another scenario? (y/n): ").strip().lower()
            if continue_response in ['y', 'yes']:
                # Recursive call to main for another analysis
                print("\n" + "="*50 + "\n")
                main()
                return
            elif continue_response in ['n', 'no']:
                print("Exiting trend rule debugger. Goodbye!")
                return
            else:
                print("Please answer 'y' or 'n'.")


if __name__ == "__main__":
    main() 