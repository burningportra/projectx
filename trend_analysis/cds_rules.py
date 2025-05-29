from . import trend_utils
from .trend_patterns import is_low_then_higher_close_bar, is_higher_ohlc_bar # Changed to relative import

# --- Detailed CDS Confirmation Check Functions ---
def check_cds_confirmation_low_then_higher_close_vs_pds_open(current_bar, prev_bar, peak_bar, all_bars):
    """CDS Rule: LowThenHigherClose_vs_PDSOpen pattern."""
    no_higher_high_for_low_then_higher_path = True
    if peak_bar.index < prev_bar.index:
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_for_low_then_higher_path = False
                break
    result = is_low_then_higher_close_bar(current_bar, prev_bar) and \
           no_higher_high_for_low_then_higher_path and \
           current_bar.l < peak_bar.o
    if result:
        trend_utils.log_debug(current_bar.index, f"CDS Rule 'check_cds_confirmation_low_then_higher_close_vs_pds_open' MET for PDS {peak_bar.index}")
    return result

def check_cds_confirmation_pattern_A(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern A for confirming a Confirmed Downtrend Start (CDS).
    Market Dynamic: After a PDS candidate (`peak_bar`), price pulls back (makes a low at or below `peak_bar.l`).
                  Then, `current_bar` attempts to rally (higher high and higher close than `prev_bar`)
                  but fails to sustain above `peak_bar`'s influence, as `current_bar`'s low undercuts `peak_bar.l`.
                  Crucially, no bar between `peak_bar` and `prev_bar` made a new high above `peak_bar.h`.

    Args:
        current_bar (Bar): The bar whose action might confirm CDS on `peak_bar`.
        prev_bar (Bar): The bar immediately preceding `current_bar`.
        peak_bar (Bar): The PDS candidate bar being evaluated for CDS confirmation.
        all_bars (list[Bar]): List of all bars for historical checks (e.g., no intervening new highs).

    Returns:
        bool: True if this CDS confirmation pattern is met, False otherwise.
    """
    cond1 = current_bar.h > prev_bar.h
    cond2 = current_bar.c > prev_bar.c
    cond3 = current_bar.l < peak_bar.l

    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    
    found_pullback = False
    if peak_bar.index < prev_bar.index + 1: 
        start_idx = peak_bar.index + 1
        end_idx = prev_bar.index 
        if start_idx <= end_idx:
             for j_1based_idx in range(start_idx, end_idx + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar.l:
                    found_pullback = True
                    break
    
    result = found_pullback and cond1 and cond2 and no_higher_high_between and cond3
    if result:
        trend_utils.log_debug(current_bar.index, f"CDS Rule 'check_cds_confirmation_pattern_A' MET for PDS {peak_bar.index}")
    return result

def check_cds_confirmation_pattern_B(current_bar, prev_bar, peak_bar, all_bars):
    """
    FIX 6: Updated Pattern B documentation to clarify its distinct purpose.
    Pattern B for confirming a Confirmed Downtrend Start (CDS).
    Market Dynamic: After a PDS candidate (`peak_bar`), price pulls back (makes a low at or below `peak_bar.l`).
                  `current_bar` then makes a new high above `peak_bar.h` but does so with weak internal
                  characteristics (closes higher than `prev_bar.c` and `current_bar.l >= prev_bar.l`),
                  suggesting the breakout is not strong and confirming the PDS on `peak_bar`.
                  No bar between `peak_bar` and `prev_bar` made a new high above `peak_bar.h` prior to `current_bar`.

    Args:
        current_bar (Bar): The bar whose action might confirm CDS on `peak_bar`.
        prev_bar (Bar): The bar immediately preceding `current_bar`.
        peak_bar (Bar): The PDS candidate bar being evaluated for CDS confirmation.
        all_bars (list[Bar]): List of all bars for historical checks.

    Returns:
        bool: True if this CDS confirmation pattern is met, False otherwise.
    """
    cond1 = current_bar.c > prev_bar.c
    cond2 = current_bar.l >= prev_bar.l
    cond3 = current_bar.h > peak_bar.h

    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    
    found_pullback = False
    if peak_bar.index < prev_bar.index + 1: 
        start_idx = peak_bar.index + 1
        end_idx = prev_bar.index 
        if start_idx <= end_idx:
             for j_1based_idx in range(start_idx, end_idx + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar.l:
                    found_pullback = True
                    break
    
    result = found_pullback and cond1 and cond2 and cond3 and no_higher_high_between
    if result:
        trend_utils.log_debug(current_bar.index, f"CDS Rule 'check_cds_confirmation_pattern_B' MET for PDS {peak_bar.index}")
    return result

def check_cds_confirmation_failed_rally(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern F for confirming a Confirmed Downtrend Start (CDS) - "Failed Rally".
    Market Dynamic: After a PDS candidate (`peak_bar`), `prev_bar` makes a new low below `peak_bar.l`.
                  `current_bar` then attempts to rally (higher high than `prev_bar`) but fails:
                  it closes lower than `prev_bar.c` and also closes below its own open (down-bar).
                  This failed rally confirms the PDS on `peak_bar`.
                  No bar between `peak_bar` and `prev_bar` made a high above `peak_bar.h`.

    Args:
        current_bar (Bar): The bar showing the failed rally attempt.
        prev_bar (Bar): The bar that made a new low after `peak_bar`.
        peak_bar (Bar): The PDS candidate bar being evaluated for CDS confirmation.
        all_bars (list[Bar]): List of all bars for historical context.

    Returns:
        bool: True if this CDS confirmation pattern is met, False otherwise.
    """
    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    if not no_higher_high_between:
        return False

    prev_bar_broke_low = prev_bar.l < peak_bar.l
    if not prev_bar_broke_low:
        return False

    current_bar_higher_high = current_bar.h > prev_bar.h
    if not current_bar_higher_high:
        return False

    current_bar_closes_lower = current_bar.c < prev_bar.c
    if not current_bar_closes_lower:
        return False

    current_bar_closes_down = current_bar.c < current_bar.o
    result = current_bar_closes_down 
    if result:
        trend_utils.log_debug(current_bar.index, f"CDS Rule 'check_cds_confirmation_failed_rally' MET for PDS {peak_bar.index}")
    return result

def check_cds_confirmation_pattern_G(current_bar, prev_bar, peak_bar, all_bars):
    """
    Pattern G for confirming a Confirmed Downtrend Start (CDS).
    Market Dynamic: After a PDS candidate (`peak_bar`), `prev_bar` makes a new low below `peak_bar.l`.
                  `current_bar` then forms a higher OHLC bar compared to `prev_bar` (higher high, low, close).
                  This upward movement after a break of `peak_bar.l` (without an intervening new high above `peak_bar.h`)
                  is treated as a confirmation of the PDS on `peak_bar`.

    Args:
        current_bar (Bar): The higher OHLC bar following `prev_bar`.
        prev_bar (Bar): The bar that made a new low after `peak_bar`.
        peak_bar (Bar): The PDS candidate bar being evaluated for CDS confirmation.
        all_bars (list[Bar]): List of all bars for historical context.

    Returns:
        bool: True if this CDS confirmation pattern is met, False otherwise.
    """
    if not is_higher_ohlc_bar(current_bar, prev_bar):
        return False

    no_higher_high_between = True
    if peak_bar.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_between = False
                break
    if not no_higher_high_between:
        return False

    prev_bar_broke_low = prev_bar.l < peak_bar.l
    result = prev_bar_broke_low
    if result:
        trend_utils.log_debug(current_bar.index, f"CDS Rule 'check_cds_confirmation_pattern_G' MET for PDS {peak_bar.index}")
    return result

def check_cds_confirmation_outside_bar(current_bar, prev_bar_is_peak):
    """
    Pattern H for confirming a Confirmed Downtrend Start (CDS) - "Outside Bar Reversal".
    Market Dynamic: `prev_bar` is the PDS candidate (`prev_bar_is_peak`).
                  `current_bar` is an "outside bar" that engulfs `prev_bar_is_peak` (higher high AND lower low).
                  Despite being an outside bar, `current_bar` closes *above* `prev_bar_is_peak.c`.
                  This specific combination (engulfing with a stronger close against the PDS direction)
                  is interpreted as a confirmation of the PDS on `prev_bar_is_peak`.

    Args:
        current_bar (Bar): The outside bar.
        prev_bar_is_peak (Bar): The previous bar, which is also the PDS candidate `peak_bar`.

    Returns:
        bool: True if this CDS confirmation pattern is met, False otherwise.
    """
    higher_high = current_bar.h > prev_bar_is_peak.h
    lower_low = current_bar.l < prev_bar_is_peak.l
    closes_stronger = current_bar.c > prev_bar_is_peak.c 
    result = higher_high and lower_low and closes_stronger
    if result:
        trend_utils.log_debug(current_bar.index, f"CDS Rule 'check_cds_confirmation_outside_bar' MET for PDS {prev_bar_is_peak.index}")
    return result

# --- CDS Rule Wrapper Functions ---
def _cds_rule_low_then_higher_close_vs_pds_open(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule Wrapper: LowThenHigherClose_vs_PDSOpen pattern."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_low_then_higher_close_vs_pds_open(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_pattern_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule Wrapper: Pattern A - RallyLowBreaksPeakLow."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_pattern_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_pattern_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule Wrapper: Pattern B - NewHighWeakAdvance."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_pattern_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_failed_rally(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule Wrapper: Failed Rally (Pattern F)."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_failed_rally(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_pattern_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule Wrapper: Pattern G - HigherOHLCAfterLowBreak."""
    if not initial_pds_candidate_bar_obj:
        return False
    return check_cds_confirmation_pattern_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars)

def _cds_rule_outside_bar(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """CDS Rule Wrapper: Outside Bar (Pattern H - OutsideBarStrongerClose)."""
    if not initial_pds_candidate_bar_obj:
        return False
    if initial_pds_candidate_bar_obj != prev_bar:
        return False
    return check_cds_confirmation_outside_bar(current_bar, prev_bar)

# --- CDS Rule Name Constants ---
CDS_RULE_LOW_THEN_HIGHER_CLOSE_VS_PDS_OPEN = "LowThenHigherClose_vs_PDSOpen"
CDS_RULE_RALLY_LOW_BREAKS_PEAK_LOW = "RallyLowBreaksPeakLow_A"
CDS_RULE_NEW_HIGH_WEAK_ADVANCE = "NewHighWeakAdvance_B"
CDS_RULE_FAILED_RALLY_AFTER_LOW_BREAK = "FailedRallyAfterLowBreak_F"
CDS_RULE_HIGHER_OHLC_AFTER_LOW_BREAK = "HigherOHLCAfterLowBreak_G"
CDS_RULE_OUTSIDE_BAR_STRONGER_CLOSE = "OutsideBarStrongerClose_H"

CDS_RULE_DEFINITIONS = [
    (CDS_RULE_LOW_THEN_HIGHER_CLOSE_VS_PDS_OPEN, _cds_rule_low_then_higher_close_vs_pds_open),
    (CDS_RULE_RALLY_LOW_BREAKS_PEAK_LOW, _cds_rule_pattern_A),
    (CDS_RULE_NEW_HIGH_WEAK_ADVANCE, _cds_rule_pattern_B),
    (CDS_RULE_FAILED_RALLY_AFTER_LOW_BREAK, _cds_rule_failed_rally),
    (CDS_RULE_HIGHER_OHLC_AFTER_LOW_BREAK, _cds_rule_pattern_G),
    (CDS_RULE_OUTSIDE_BAR_STRONGER_CLOSE, _cds_rule_outside_bar),
]

ALLOWED_BARS_INTO_CONTAINMENT_FOR_CDS_CONFIRM = 5 # Define if not already globally available

def _evaluate_cds_rules(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars, state):
    """
    Evaluates all Confirmed Downtrend Start (CDS) rules based on an initial PDS candidate.
    Returns:
        tuple: (bool, str or None) indicating (can_confirm_cds, cds_trigger_rule_type)
    """
    if state.in_containment and \
       state.containment_start_bar_index_for_log is not None and \
       current_bar.index > state.containment_start_bar_index_for_log + ALLOWED_BARS_INTO_CONTAINMENT_FOR_CDS_CONFIRM:
        trend_utils.log_debug(current_bar.index, f"CDS Evaluation: Suppressed. Bar {current_bar.index} is > {ALLOWED_BARS_INTO_CONTAINMENT_FOR_CDS_CONFIRM} bars after containment start ({state.containment_start_bar_index_for_log}).")
        return False, None

    can_confirm_cds = False
    cds_trigger_rule_type = None

    if initial_pds_candidate_bar_obj is not None:
        for rule_name, rule_func in CDS_RULE_DEFINITIONS:
            trend_utils.log_debug(current_bar.index, f"CDS Evaluation: Checking rule '{rule_name}' for PDS on Bar {initial_pds_candidate_bar_obj.index}.")
            if rule_func(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = rule_name
                trend_utils.log_debug(current_bar.index, f"CDS Evaluation: Rule '{rule_name}' MET for PDS on Bar {initial_pds_candidate_bar_obj.index}.")
                break
            else:
                trend_utils.log_debug(current_bar.index, f"CDS Evaluation: Rule '{rule_name}' NOT MET for PDS on Bar {initial_pds_candidate_bar_obj.index}.")
    else:
        trend_utils.log_debug(current_bar.index, "CDS Evaluation: No initial PDS candidate to evaluate.")
            
    return can_confirm_cds, cds_trigger_rule_type

def _apply_cds_confirmation(confirmed_bar_for_this_cds, state, all_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions):
    """
    Applies the consequences of a Confirmed Downtrend Start (CDS).
    Updates state, logs events, and handles PUS invalidation.
    """
    state.confirm_downtrend(confirmed_bar_for_this_cds, all_bars, current_bar_event_descriptions)

    if state.pus_candidate_for_cus_bar_index is not None and \
       state.pus_candidate_for_cus_bar_index < confirmed_bar_for_this_cds.index:
        trend_utils.log_debug(confirmed_bar_for_this_cds.index, f"Apply CDS: PUS candidate strictly before CDS Bar {confirmed_bar_for_this_cds.index} (PUS at {state.pus_candidate_for_cus_bar_index}) is being reset.")
        state._reset_all_pending_uptrend_states()
    
    if state.pds_candidate_for_cds_bar_index == confirmed_bar_for_this_cds.index:
        trend_utils.log_debug(confirmed_bar_for_this_cds.index, f"Apply CDS: PDS candidate on CDS Bar {confirmed_bar_for_this_cds.index} is being reset as it is now confirmed.")
        state._reset_all_pending_downtrend_states() 