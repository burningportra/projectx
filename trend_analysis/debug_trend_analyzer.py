import readline # For better input experience
from .analyzer import TrendAnalyzer
from .utils.bar_loader import load_bars_from_alt_csv
from .models.bar import Bar
from .models.state import State # May be needed for type hinting or direct state inspection
# Import specific rule evaluation logic if we want to break them down further
from .rules.cus_rules import CUS_RULE_DEFINITIONS, _evaluate_cus_rules 
from .rules.cds_rules import CDS_RULE_DEFINITIONS, _evaluate_cds_rules
# Import individual check functions if we want to show their pass/fail status
# For example: from .rules.cus_rules import check_cus_confirmation_low_undercut_high_respect
# from .patterns.bar_patterns import is_lower_ohlc_bar # etc.

# Global-like variables to store loaded data and analysis results
ALL_BARS = []
ANALYZER_LOG = []
FULL_ANALYZER_INSTANCE = None

def get_bar_by_index(target_index: int):
    """Safely retrieves a bar by its 1-based chronological index."""
    if 1 <= target_index <= len(ALL_BARS):
        return ALL_BARS[target_index - 1]
    return None

def get_log_entry_for_bar(bar_index: int):
    """Retrieves the log entry for a specific 1-based bar index."""
    if 1 <= bar_index <= len(ANALYZER_LOG):
        # ANALYZER_LOG is 0-indexed but its content refers to 1-based bar indices
        # The structure is "k. Log message", so k matches bar_index
        for entry in ANALYZER_LOG:
            if entry.startswith(f"{bar_index}. "):
                return entry
    return f"No log entry found for bar {bar_index}."

def display_bar_ohlc(bar: Bar):
    if bar:
        print(f"  OHLC: O:{bar.o} H:{bar.h} L:{bar.l} C:{bar.c} Date:{bar.date}")
    else:
        print("  Bar data not available.")

def view_log_for_bar_range():
    print("\n--- View Log for Bar Range ---")
    try:
        start_idx_str = input("Enter start bar index: ")
        if not start_idx_str: # Handle empty input - view single bar
            target_idx = int(input("Enter target bar index for single log entry: "))
            print(get_log_entry_for_bar(target_idx))
            return

        start_idx = int(start_idx_str)
        end_idx_str = input(f"Enter end bar index (or press Enter to view from {start_idx} to end): ")
        
        if not end_idx_str:
            end_idx = len(ANALYZER_LOG)
        else:
            end_idx = int(end_idx_str)

        if start_idx < 1 or end_idx > len(ANALYZER_LOG) or start_idx > end_idx:
            print(f"Invalid range. Max bar index is {len(ANALYZER_LOG)}.")
            return

        for i in range(start_idx, end_idx + 1):
            print(get_log_entry_for_bar(i))
            
    except ValueError:
        print("Invalid input. Please enter numeric indices.")
    except Exception as e:
        print(f"An error occurred: {e}")


def inspect_bar_details():
    print("\n--- Inspect Bar Details ---")
    try:
        target_idx = int(input("Enter target bar index: "))
        bar = get_bar_by_index(target_idx)
        if not bar:
            print(f"Bar {target_idx} not found.")
            return

        print(f"\nDetails for Bar {target_idx}:")
        display_bar_ohlc(bar)
        print(f"  Log Entry: {get_log_entry_for_bar(target_idx)}")

    except ValueError:
        print("Invalid input. Please enter a numeric index.")
    except Exception as e:
        print(f"An error occurred: {e}")

def get_contextual_candidates(current_bar_eval_index: int):
    """
    Runs a temporary analysis up to prev_bar to get PUS/PDS candidates.
    current_bar_eval_index is the 1-based index of the bar we want to evaluate.
    So, we analyze up to the bar *before* it.
    """
    if current_bar_eval_index <= 1: # First bar has no prev, no candidates
        return None, None 

    # Analyze bars up to (but not including) the current_bar_eval_index
    # Slice end index for all_bars is exclusive, so prev_bar_index (0-based) is current_bar_eval_index - 1
    # The length of the slice will be current_bar_eval_index - 1
    bars_to_analyze = ALL_BARS[:current_bar_eval_index -1]


    if not bars_to_analyze: # e.g. if current_bar_eval_index is 1
         return None, None # No PUS/PDS before the first bar is processed

    temp_analyzer = TrendAnalyzer()
    temp_analyzer.analyze(bars_to_analyze) # This populates temp_analyzer.state

    initial_pus_candidate_bar_obj = None
    if temp_analyzer.state.pus_candidate_for_cus_bar_index is not None:
        initial_pus_candidate_bar_obj = get_bar_by_index(temp_analyzer.state.pus_candidate_for_cus_bar_index)

    initial_pds_candidate_bar_obj = None
    if temp_analyzer.state.pds_candidate_for_cds_bar_index is not None:
        initial_pds_candidate_bar_obj = get_bar_by_index(temp_analyzer.state.pds_candidate_for_cds_bar_index)
        
    return initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, temp_analyzer.state


def evaluate_rules_for_bar():
    print("\n--- Evaluate Rules for a Bar ---")
    try:
        target_idx = int(input("Enter target bar index to evaluate rules for: "))
        current_bar = get_bar_by_index(target_idx)
        if not current_bar:
            print(f"Bar {target_idx} not found.")
            return
        if target_idx == 1:
            print("Cannot evaluate rules for the first bar as it has no previous bar.")
            return
            
        prev_bar = get_bar_by_index(target_idx - 1)

        print(f"\nEvaluating rules for Current Bar {target_idx} (acting on Prev Bar {target_idx-1} state):")
        print(f"Current Bar {target_idx}:")
        display_bar_ohlc(current_bar)
        print(f"Prev Bar {target_idx-1}:")
        display_bar_ohlc(prev_bar)

        pus_candidate, pds_candidate, temp_state_after_prev_bar = get_contextual_candidates(target_idx)

        print("\n--- Context from processing up to Prev Bar --- ")
        if pus_candidate:
            print(f"Active PUS Candidate (before this Current Bar): Bar {pus_candidate.index}")
            display_bar_ohlc(pus_candidate)
        else:
            print("No active PUS Candidate before this Current Bar.")
        
        if pds_candidate:
            print(f"Active PDS Candidate (before this Current Bar): Bar {pds_candidate.index}")
            display_bar_ohlc(pds_candidate)
        else:
            print("No active PDS Candidate before this Current Bar.")
        print("---------------------------------------------")

        # Evaluate CUS Rules
        print("\n--- CUS Rule Evaluation --- (Will Current Bar confirm the PUS Candidate?)")
        if not pus_candidate:
            print("No PUS candidate to confirm.")
        else:
            # Create a minimal state or pass the temp_state_after_prev_bar
            # The _evaluate_cus_rules expects a state object.
            # We use temp_state_after_prev_bar as it reflects the state *before* current_bar acts.
            can_confirm_cus, cus_trigger_rule = _evaluate_cus_rules(
                current_bar, prev_bar, pus_candidate, pds_candidate, temp_state_after_prev_bar, ALL_BARS
            )
            if can_confirm_cus:
                print(f"✅ CUS would be CONFIRMED by rule: {cus_trigger_rule}")
            else:
                print("❌ No CUS rule confirmed the PUS candidate.")
            
            # Optionally, break down individual CUS_RULE_DEFINITIONS
            for rule_name, rule_func in CUS_RULE_DEFINITIONS:
                # We need to pass the state that the rule_func might use.
                # This state should be the one *before* current_bar is processed.
                if rule_func(current_bar, prev_bar, pus_candidate, pds_candidate, temp_state_after_prev_bar, ALL_BARS):
                    print(f"  - Rule '{rule_name}': PASSED")
                else:
                    print(f"  - Rule '{rule_name}': FAILED")
        
        # Evaluate CDS Rules
        print("\n--- CDS Rule Evaluation --- (Will Current Bar confirm the PDS Candidate?)")
        if not pds_candidate:
            print("No PDS candidate to confirm.")
        else:
            can_confirm_cds, cds_trigger_rule = _evaluate_cds_rules(
                current_bar, prev_bar, pds_candidate, ALL_BARS # _evaluate_cds_rules doesn't use state directly
            )
            if can_confirm_cds:
                print(f"✅ CDS would be CONFIRMED by rule: {cds_trigger_rule}")
            else:
                print("❌ No CDS rule confirmed the PDS candidate.")

            for rule_name, rule_func in CDS_RULE_DEFINITIONS:
                if rule_func(current_bar, prev_bar, pds_candidate, ALL_BARS): # rule_func for CDS might not need state
                    print(f"  - Rule '{rule_name}': PASSED")
                else:
                    print(f"  - Rule '{rule_name}': FAILED")

    except ValueError:
        print("Invalid input. Please enter a numeric index.")
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()

def show_active_candidates_before_bar():
    print("\n--- Show Active PUS/PDS Candidates Before a Bar is Processed ---")
    try:
        target_idx = int(input("Enter target bar index (to see candidates *before* this bar acts): "))
        if target_idx <= 0:
            print("Bar index must be 1 or greater.")
            return

        pus_candidate, pds_candidate, _ = get_contextual_candidates(target_idx)
        
        print(f"\n--- Active Candidates evaluated by Bar {target_idx} --- ")
        if pus_candidate:
            print(f"PUS Candidate: Bar {pus_candidate.index}")
            display_bar_ohlc(pus_candidate)
        else:
            print("No active PUS Candidate.")
        
        if pds_candidate:
            print(f"PDS Candidate: Bar {pds_candidate.index}")
            display_bar_ohlc(pds_candidate)
        else:
            print("No active PDS Candidate.")
        print("---------------------------------------------")

    except ValueError:
        print("Invalid input. Please enter a numeric index.")
    except Exception as e:
        print(f"An error occurred: {e}")

def show_resulting_candidates_after_bar():
    print("\n--- Show PUS/PDS Candidates Resulting From Processing a Bar ---")
    # This shows candidates that were set *by* the processing of target_idx
    # So we analyze up to and *including* target_idx
    try:
        target_idx = int(input("Enter target bar index (to see candidates set *by* this bar): "))
        if target_idx <= 0:
            print("Bar index must be 1 or greater.")
            return

        bars_to_analyze = ALL_BARS[:target_idx]
        if not bars_to_analyze:
            print(f"Not enough bar data to analyze up to bar {target_idx}.")
            return
            
        temp_analyzer = TrendAnalyzer()
        temp_analyzer.analyze(bars_to_analyze)

        print(f"\n--- Candidates after Bar {target_idx} was processed --- ")
        pus_cand_idx = temp_analyzer.state.pus_candidate_for_cus_bar_index
        if pus_cand_idx:
            pus_bar = get_bar_by_index(pus_cand_idx)
            print(f"Resulting PUS Candidate: Bar {pus_bar.index}")
            display_bar_ohlc(pus_bar)
        else:
            print("No PUS Candidate set/active after this bar.")

        pds_cand_idx = temp_analyzer.state.pds_candidate_for_cds_bar_index
        if pds_cand_idx:
            pds_bar = get_bar_by_index(pds_cand_idx)
            print(f"Resulting PDS Candidate: Bar {pds_bar.index}")
            display_bar_ohlc(pds_bar)
        else:
            print("No PDS Candidate set/active after this bar.")
        print("-----------------------------------------------------")
        # Also show the log for this bar as it contains the PUS/PDS setting messages
        print(f"Log for Bar {target_idx}: {get_log_entry_for_bar(target_idx)}")


    except ValueError:
        print("Invalid input. Please enter a numeric index.")
    except Exception as e:
        print(f"An error occurred: {e}")


def main():
    global ALL_BARS, ANALYZER_LOG, FULL_ANALYZER_INSTANCE
    print("Trend Analyzer Debugger")
    
    # Load data
    default_csv_path = "data/CON.F.US.MES.M25_4h_ohlc.csv" # Relative to project root
    csv_path = input(f"Enter CSV file path (default: {default_csv_path}): ") or default_csv_path
    
    try:
        ALL_BARS = load_bars_from_alt_csv(csv_path)
        if not ALL_BARS:
            print(f"No bars loaded from {csv_path}. Exiting.")
            return
        print(f"Successfully loaded {len(ALL_BARS)} bars.")

        # Run initial analysis
        print("Running initial trend analysis on full dataset...")
        FULL_ANALYZER_INSTANCE = TrendAnalyzer()
        ANALYZER_LOG = FULL_ANALYZER_INSTANCE.analyze(ALL_BARS)
        print("Initial analysis complete.")

    except FileNotFoundError:
        print(f"Error: Data file '{csv_path}' not found. Make sure you are in the project root or provide the correct path.")
        return
    except Exception as e:
        print(f"An error occurred during setup: {e}")
        return

    while True:
        print("\nDebugger Menu:")
        print("1. View Log for Bar(s)")
        print("2. Inspect Bar Details")
        print("3. Evaluate Rules for a Bar (see why it might/might not confirm)")
        print("4. Show Active PUS/PDS Candidates (context *before* a bar is processed)")
        print("5. Show Resulting PUS/PDS Candidates (set *by* processing a bar)")
        print("0. Exit")
        
        choice = input("Enter your choice: ")
        
        if choice == '1':
            view_log_for_bar_range()
        elif choice == '2':
            inspect_bar_details()
        elif choice == '3':
            evaluate_rules_for_bar()
        elif choice == '4':
            show_active_candidates_before_bar()
        elif choice == '5':
            show_resulting_candidates_after_bar()
        elif choice == '0':
            print("Exiting debugger.")
            break
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    # This script should be run as a module from the project root:
    # python -m trend_analysis.debug_trend_analyzer
    main() 