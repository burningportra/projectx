from ..models.bar import Bar
from ..patterns.bar_patterns import is_low_then_higher_close_bar, is_higher_ohlc_bar

# --- Function for decline confirmation pattern A ---
def check_cds_confirmation_pattern_A(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern A for confirming a Confirmed Downtrend Start (CDS).
    Checks for a specific sequence: a PDS high, a pullback, and a failed rally attempt.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.
        peak_bar (Bar): The candidate peak bar signaling potential decline.
        all_bars (list[Bar]): List of all bars for historical checks.

    Returns:
        bool: True if the decline confirmation conditions are met, False otherwise.
    """
    # Required conditions:
    # Cond1: Current bar makes a higher high than previous bar.
    # Cond2: Current bar closes higher than previous bar's close.
    # Cond3: Current bar's low is below the peak candidate's low.
    cond1 = current_bar.h > prev_bar.h
    cond2 = current_bar.c > prev_bar.c
    cond3 = current_bar.l < peak_bar.l

    # Check if no bar between the peak (exclusive) and prev_bar (inclusive)
    # made a high greater than the peak's high.
    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    
    # Check if any bar between the peak (exclusive) and prev_bar (inclusive)
    # made a low less than or equal to the peak's low (pullback).
    found_pullback = False
    if peak_bar.index < prev_bar.index + 1: # Ensure there's room for intermediate bars
        start_idx = peak_bar.index + 1
        end_idx = prev_bar.index # Check up to and including prev_bar
        if start_idx <= end_idx:
             for j_1based_idx in range(start_idx, end_idx + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar.l:
                    found_pullback = True
                    break
    
    return found_pullback and cond1 and cond2 and no_higher_high_between and cond3

# --- Function for decline confirmation pattern B ---
def check_cds_confirmation_pattern_B(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern B for confirming a Confirmed Downtrend Start (CDS).
    Similar to Pattern A, but with slightly different requirements for the current bar.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.
        peak_bar (Bar): The candidate peak bar signaling potential decline.
        all_bars (list[Bar]): List of all bars for historical checks.

    Returns:
        bool: True if the decline confirmation conditions are met, False otherwise.
    """
    # Required conditions:
    # Cond1: Current bar closes higher than previous bar's close.
    # Cond2: Current bar's low is greater than or equal to previous bar's low.
    # Cond3: Current bar makes a higher high than the peak candidate's high.
    cond1 = current_bar.c > prev_bar.c
    cond2 = current_bar.l >= prev_bar.l
    cond3 = current_bar.h > peak_bar.h

    # Check if no bar between the peak (exclusive) and prev_bar (inclusive)
    # made a high greater than the peak's high.
    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    
    # Check if any bar between the peak (exclusive) and prev_bar (inclusive)
    # made a low less than or equal to the peak's low (pullback).
    found_pullback = False
    if peak_bar.index < prev_bar.index + 1: # Ensure there's room for intermediate bars
        start_idx = peak_bar.index + 1
        end_idx = prev_bar.index # Check up to and including prev_bar
        if start_idx <= end_idx:
             for j_1based_idx in range(start_idx, end_idx + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar.l:
                    found_pullback = True
                    break
    
    return found_pullback and cond1 and cond2 and cond3 and no_higher_high_between

# --- Function for decline confirmation pattern F (failed rally) ---
def check_cds_confirmation_failed_rally(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern F for confirming a Confirmed Downtrend Start (CDS).
    This pattern identifies a failed rally attempt after a new low below the PDS high's low.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.
        peak_bar (Bar): The candidate peak bar signaling potential decline.
        all_bars (list[Bar]): List of all bars for historical context.

    Returns:
        bool: True if the decline confirmation conditions are met, False otherwise.
    """
    # The confirmation pattern consists of:
    # 1. No bar between the peak (exclusive) and prev_bar (inclusive) made a high greater than the peak's high.
    # 2. prev_bar made a new low below the peak's low.
    # 3. current_bar attempts to rally by making a higher high than prev_bar.
    # 4. current_bar closes lower than prev_bar (rally failure).
    # 5. current_bar closes below its open (is a down-closing bar).

    # Check if no bar between the peak (exclusive) and prev_bar (inclusive)
    # made a high greater than the peak's high.
    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: # Check only if there are intermediate bars
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    if not no_higher_high_between:
        return False

    # Check if prev_bar made a new low below the peak's low.
    prev_bar_broke_low = prev_bar.l < peak_bar.l
    if not prev_bar_broke_low:
        return False

    # Check if current_bar attempts to rally by making a higher high than prev_bar.
    current_bar_higher_high = current_bar.h > prev_bar.h
    if not current_bar_higher_high:
        return False

    # Check if current_bar closes lower than prev_bar (rally failure).
    current_bar_closes_lower = current_bar.c < prev_bar.c
    if not current_bar_closes_lower:
        return False

    # Check if current_bar closes below its open (is a down-closing bar).
    current_bar_closes_down = current_bar.c < current_bar.o
    
    return current_bar_closes_down # Returns True if all prior conditions passed

# --- Function for decline confirmation pattern G (higher bar with lower low) ---
def check_cds_confirmation_pattern_G(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern G for confirming a Confirmed Downtrend Start (CDS).
    This pattern is triggered when current_bar forms a higher OHLC bar with prev_bar,
    and prev_bar made a low below the PDS high bar's low, without any higher highs between.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.
        peak_bar (Bar): The candidate peak bar signaling potential decline.
        all_bars (list[Bar]): List of all bars for historical context.

    Returns:
        bool: True if the decline confirmation conditions are met, False otherwise.
    """
    # Check if current_bar forms a higher price bar with prev_bar
    if not is_higher_ohlc_bar(current_bar, prev_bar):
        return False

    # Check if no bar between the peak (exclusive) and prev_bar (inclusive)
    # made a high greater than the peak's high.
    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: # Check only if there are intermediate bars
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    if not no_higher_high_between:
        return False

    # Check if prev_bar made a low below the peak bar's low.
    prev_bar_broke_low = prev_bar.l < peak_bar.l
    
    return prev_bar_broke_low

# --- Function for decline confirmation pattern H (outside bar) ---
def check_cds_confirmation_outside_bar(current_bar, prev_bar_is_peak):
    """
    Pattern H for confirming a Confirmed Downtrend Start (CDS).
    This pattern identifies when the current_bar is an "outside bar" that engulfs prev_bar (the PDS high)
    and closes with a higher close than prev_bar's close, indicating a potential reversal that confirms CDS.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar_is_peak (Bar): The previous bar, which is also the peak candidate.

    Returns:
        bool: True if the decline confirmation conditions are met, False otherwise.
    """
    # The pattern requires:
    # 1. current_bar makes a higher high than prev_bar's high (current_bar.h > prev_bar.h)
    # 2. current_bar makes a lower low than prev_bar's low (current_bar.l < prev_bar.l)
    # 3. current_bar closes above prev_bar's close (current_bar.c > prev_bar.c)
    
    higher_high = current_bar.h > prev_bar_is_peak.h
    lower_low = current_bar.l < prev_bar_is_peak.l
    closes_stronger = current_bar.c > prev_bar_is_peak.c 
    
    return higher_high and lower_low and closes_stronger

# --- CDS Rule Wrapper Functions ---
def _cds_rule_low_then_higher_close_vs_pds_open(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule: LowThenHigherClose_vs_PDSOpen pattern."""
    if not initial_pds_candidate_bar_obj:
        return False
    no_higher_high_for_low_then_higher_path = True
    if initial_pds_candidate_bar_obj.index < prev_bar.index:
        for j_1based_idx in range(initial_pds_candidate_bar_obj.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > initial_pds_candidate_bar_obj.h:
                no_higher_high_for_low_then_higher_path = False
                break
    return is_low_then_higher_close_bar(current_bar, prev_bar) and \
           no_higher_high_for_low_then_higher_path and \
           current_bar.l < initial_pds_candidate_bar_obj.o

def _cds_rule_pattern_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule: Pattern A."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_pattern_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_pattern_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule: Pattern B."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_pattern_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_failed_rally(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule: Failed Rally (Pattern F)."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_failed_rally(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_pattern_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule: Pattern G."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_pattern_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_outside_bar(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule: Outside Bar (Pattern H)."""
    if not initial_pds_candidate_bar_obj:
        return False
    # Pattern H specifically requires prev_bar to be the peak (PDS candidate)
    if initial_pds_candidate_bar_obj != prev_bar:
        return False
    return check_cds_confirmation_outside_bar(current_bar, prev_bar)

CDS_RULE_DEFINITIONS = [
    ("LowThenHigherClose_vs_PDSOpen", _cds_rule_low_then_higher_close_vs_pds_open),
    ("A", _cds_rule_pattern_A),
    ("B", _cds_rule_pattern_B),
    ("F", _cds_rule_failed_rally),
    ("G", _cds_rule_pattern_G),
    ("H", _cds_rule_outside_bar),
]

def _evaluate_cds_rules(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """
    Evaluates all Confirmed Downtrend Start (CDS) rules based on an initial PDS candidate.
    Returns:
        tuple: (bool, str or None) indicating (can_confirm_cds, cds_trigger_rule_type)
    """
    can_confirm_cds = False
    cds_trigger_rule_type = None

    if initial_pds_candidate_bar_obj is not None:  # A PDS candidate must exist
        for rule_name, rule_func in CDS_RULE_DEFINITIONS:
            if rule_func(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = rule_name
                break # First rule that triggers confirms CDS
            
    return can_confirm_cds, cds_trigger_rule_type 