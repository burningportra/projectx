from ..models.bar import Bar
from ..patterns.bar_patterns import is_lower_ohlc_bar

def check_cus_confirmation_low_undercut_high_respect(current_bar, prev_bar, pds_candidate_bar):
    """
    Custom Rule 'LowUndercutHighRespect' for confirming a Confirmed Uptrend Start (CUS).
    Based on observations where the current bar undercuts a PDS candidate's low while respecting its high,
    and closing with a higher close than the previous bar.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.
        pds_candidate_bar (Bar, optional): A relevant PDS candidate bar for context.
                                          If None, the rule cannot be confirmed.

    Returns:
        bool: True if the CUS confirmation conditions are met, False otherwise.
    """
    if pds_candidate_bar is None:
        return False # Cannot confirm without a PDS candidate context
    
    # Condition 1: Current bar's low is lower than the PDS candidate's low.
    cond_low_undercut = current_bar.l < pds_candidate_bar.l
    # Condition 2: Current bar's high is less than or equal to the PDS candidate's high.
    cond_high_respect = current_bar.h <= pds_candidate_bar.h
    # Condition 3: Current bar closes with a higher close than the previous bar's close.
    cond_closes_higher = current_bar.c > prev_bar.c
    
    return cond_low_undercut and cond_high_respect and cond_closes_higher

def check_cus_confirmation_higher_high_lower_low_down_close(current_bar, prev_bar):
    """
    Custom Rule 'HHLL' (Higher High, Lower Low, Down Close) for confirming a Confirmed Uptrend Start (CUS).
    This rule identifies an outside bar (higher high, lower low than prev_bar) that closes with a lower close than its open,
    potentially marking a failed PUS attempt by prev_bar (if prev_bar was a PUS candidate)
    and thus confirming a CUS on a *prior* PUS candidate.
    The effect is that this pattern can confirm a CUS on a prior PUS candidate, while `current_bar` itself
    might become a PDS.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.

    Returns:
        bool: True if the CUS confirmation conditions are met, False otherwise.
    """
    # CUS for prior PUS candidate is triggered if:
    # 1. current_bar makes a higher high than prev_bar.
    # 2. current_bar makes a lower low than prev_bar. (i.e., an outside bar)
    # 3. current_bar closes with a lower close than its open (is a down-closing bar).
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o # Current bar shows weakness on close
    return cond1_higher_high and cond2_lower_low and cond3_down_close

def check_cus_confirmation_engulfing_up_with_pds_low_break(current_bar, prev_bar, pds_candidate_bar_for_context):
    """
    Custom Rule 'EngulfingUpPDSLowBreak' for confirming a Confirmed Uptrend Start (CUS).
    This rule identifies a bullish engulfing bar (higher high, lower low than prev_bar, closes higher than prev_bar.c, current bar closes higher than its open)
    that also breaks below a relevant PDS candidate's low, signaling a strong reversal that confirms a prior PUS candidate.

    Args:
        current_bar (Bar): The current bar being processed.
        prev_bar (Bar): The previous bar.
        pds_candidate_bar_for_context (Bar, optional):
            A PDS candidate bar used for context (specifically, its low).
            If None, the rule cannot fully confirm.

    Returns:
        bool: True if the CUS confirmation conditions are met, False otherwise.
    """
    # 1. current_bar.h > prev_bar.h (Higher high than prev_bar)
    # 2. current_bar.l < prev_bar.l (Lower low than prev_bar - engulfing aspect)
    # 3. current_bar.c > prev_bar.c (Closes with a higher close than previous bar's close - bullish strength)
    # 4. current_bar.c > current_bar.o (Current bar is an UP bar - closes higher than its open)
    # 5. current_bar.l < pds_candidate_bar_for_context.l (Must also have a lower low than a relevant PDS candidate's low)

    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l 
    cond3_closes_higher_than_prev_close = current_bar.c > prev_bar.c
    cond4_up_bar = current_bar.c > current_bar.o # Current bar must be bullish itself
    
    cond5_break_pds_low = False # Default to FALSE if no PDS context
    pds_context_details = "None (Cond5 default False)"
    if pds_candidate_bar_for_context is not None:
        # Condition 5: Current bar's low must be lower than the low of the provided PDS candidate.
        cond5_break_pds_low = current_bar.l < pds_candidate_bar_for_context.l
        pds_context_details = f"PDS_Cand_Idx: {pds_candidate_bar_for_context.index}, PDS_Cand_L: {pds_candidate_bar_for_context.l}"
    else:
        # If no PDS context is provided, this rule cannot be satisfied as per its definition requiring PDS low break.
        return False 
        
    final_result = cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low

    return final_result

# --- CUS Rule Wrapper Functions ---
def _cus_rule_lower_ohlc(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule: Lower OHLC bar confirms PUS, if contextually valid."""
    if not is_lower_ohlc_bar(current_bar, prev_bar):
        return False
    # Context validation: If a Lower OHLC Bar occurs but current_bar also breaks below an existing PDS low, 
    # it might be a continuation of downtrend rather than CUS.
    if initial_pds_candidate_bar_obj is not None and current_bar.l < initial_pds_candidate_bar_obj.l:
        return False
    return True

def _cus_rule_low_undercut_high_respect(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule: LowUndercutHighRespect pattern."""
    pds_context = initial_pds_candidate_bar_obj
    if not pds_context and state.pds_candidate_for_cds_bar_index is not None:
        # Ensure the index is valid before accessing all_bars
        if 0 <= (state.pds_candidate_for_cds_bar_index - 1) < len(all_bars):
            pds_context = all_bars[state.pds_candidate_for_cds_bar_index - 1]
        else:
            # Log or handle invalid index if necessary, for now, pds_context remains None
            pass 
    return check_cus_confirmation_low_undercut_high_respect(current_bar, prev_bar, pds_context)

def _cus_rule_hhll_down_close(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule: HigherHighLowerLowDownClose (outside bar, closes down)."""
    return check_cus_confirmation_higher_high_lower_low_down_close(current_bar, prev_bar)

def _cus_rule_engulfing_up_pds_low_break(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule: EngulfingUpPDSLowBreak (bullish engulfing that breaks PDS low)."""
    return check_cus_confirmation_engulfing_up_with_pds_low_break(current_bar, prev_bar, initial_pds_candidate_bar_obj)

def _cus_rule_high_breakout_pus_intervening_pds(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """
    CUS Rule: HighBreakoutAfterPUSAndInterveningPDS.
    Context: A PUS exists, and a PDS has formed after it.
    Rule: current_bar.h breaks above both the PUS high and the intervening PDS high.
    """
    if not (initial_pus_candidate_bar_obj and initial_pds_candidate_bar_obj):
        return False

    # Ensure PDS is after PUS
    if initial_pds_candidate_bar_obj.index <= initial_pus_candidate_bar_obj.index:
        return False

    cond_h_gt_pus_h = current_bar.h > initial_pus_candidate_bar_obj.h
    cond_h_gt_pds_h = current_bar.h > initial_pds_candidate_bar_obj.h
    cond_c_gt_prev_l = current_bar.c > prev_bar.l # Minor check against collapse

    return cond_h_gt_pus_h and cond_h_gt_pds_h and cond_c_gt_prev_l

def _cus_rule_reversal_attempt_after_cds(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """
    CUS Rule: ReversalAttemptAfterCDS.
    Context: A PUS exists. The prev_bar just confirmed a CDS.
    Rule: If current_bar makes a higher high than the PUS bar, and current_bar's high is above prev_bar's low.
    This is an aggressive rule looking for a quick turn attempt after a CDS confirmation.
    """
    if initial_pus_candidate_bar_obj is None:
        return False

    # Condition: prev_bar just confirmed the last CDS
    prev_bar_confirmed_last_cds = (
        state.last_confirmed_trend_type == "downtrend" and
        state.last_confirmed_trend_bar_index == prev_bar.index
    )
    if not prev_bar_confirmed_last_cds:
        return False
        
    # Condition: current_bar.h > initial_pus_candidate_bar_obj.h
    cond_curr_h_gt_pus_h = current_bar.h > initial_pus_candidate_bar_obj.h
    
    # Condition: current_bar.h > prev_bar.l (minimal sanity check against freefall)
    cond_curr_h_gt_prev_l = current_bar.h > prev_bar.l

    return cond_curr_h_gt_pus_h and cond_curr_h_gt_prev_l

CUS_RULE_DEFINITIONS = [
    ("LOWER_OHLC", _cus_rule_lower_ohlc),
    ("LowUndercutHighRespect", _cus_rule_low_undercut_high_respect),
    ("HigherHighLowerLowDownClose", _cus_rule_hhll_down_close),
    ("EngulfingUpPDSLowBreak", _cus_rule_engulfing_up_pds_low_break),
    ("HighBreakoutAfterPUSAndInterveningPDS", _cus_rule_high_breakout_pus_intervening_pds),
    ("ReversalAttemptAfterCDS", _cus_rule_reversal_attempt_after_cds),
]

def _evaluate_cus_rules(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """
    Evaluates all Confirmed Uptrend Start (CUS) rules based on an initial PUS candidate.
    Iterates through CUS_RULE_DEFINITIONS.
    Returns:
        tuple: (bool, str or None) indicating (can_confirm_cus, cus_trigger_rule_type)
    """
    # --- OLD GLOBAL CONTAINMENT BLOCK REMOVED ---
    # Removed old containment blocking - now using new confirmed containment system
    can_confirm_cus = False
    cus_trigger_rule_type = None

    if initial_pus_candidate_bar_obj is not None:  # A PUS candidate must exist
        for rule_name, rule_func in CUS_RULE_DEFINITIONS:
            if rule_func(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
                can_confirm_cus = True
                cus_trigger_rule_type = rule_name
                break # First rule that triggers confirms CUS
    return can_confirm_cus, cus_trigger_rule_type 