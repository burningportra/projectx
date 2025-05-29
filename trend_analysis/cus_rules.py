from . import trend_utils
from .trend_patterns import is_lower_ohlc_bar, is_pending_downtrend_start_rule, is_simple_pending_downtrend_start_signal # Changed to relative import

# --- Configuration Constants (from original file, if needed by CUS rules directly) ---
CUS_EXHAUSTION_MAX_BARS_FROM_CANDIDATE = 6
ALLOWED_BARS_INTO_CONTAINMENT_FOR_CUS_CONFIRM = 5

# --- Detailed CUS Confirmation Check Functions ---
def check_cus_confirmation_low_undercut_high_respect(current_bar, prev_bar, pds_candidate_bar):
    """
    Custom Rule 'LowUndercutHighRespect' for confirming a Confirmed Uptrend Start (CUS).
    Pattern: Current bar undercuts the low of a recent PDS (Pending Downtrend Start) candidate 
             while respecting (not exceeding) that PDS candidate's high. The current bar must also
             close higher than the previous bar, signaling a potential reversal of the PDS.
    Args:
        current_bar (Bar): The bar being evaluated for confirming a CUS.
        prev_bar (Bar): The bar immediately preceding current_bar.
        pds_candidate_bar (Bar, optional): The relevant PDS candidate bar whose range is being tested.
                                          If None, the rule cannot be confirmed.
    Returns:
        bool: True if CUS confirmation conditions are met, False otherwise.
    """
    if pds_candidate_bar is None:
        return False 
    cond_low_undercut = current_bar.l < pds_candidate_bar.l
    cond_high_respect = current_bar.h <= pds_candidate_bar.h
    cond_closes_higher = current_bar.c > prev_bar.c
    result = cond_low_undercut and cond_high_respect and cond_closes_higher
    if result:
        trend_utils.log_debug(current_bar.index, f"CUS Rule 'check_cus_confirmation_low_undercut_high_respect' MET for PDS cand {pds_candidate_bar.index if pds_candidate_bar else 'None'}")
    return result

def check_cus_confirmation_higher_high_lower_low_down_close(current_bar, prev_bar):
    """
    Custom Rule 'HHLL' (Higher High, Lower Low, Down Close) for confirming a Confirmed Uptrend Start (CUS).
    Pattern: Current bar is an "outside bar" relative to prev_bar (higher high AND lower low),
             and current_bar closes below its own open (a down-closing bar). 
             This pattern can confirm a CUS on a *prior* PUS candidate if prev_bar's attempted
             up-move (if it was a PUS) failed, as shown by current_bar's engulfing and weak close.
             Current_bar itself might become a PDS candidate.
    Args:
        current_bar (Bar): The bar being evaluated.
        prev_bar (Bar): The bar immediately preceding current_bar.
    Returns:
        bool: True if CUS confirmation conditions are met, False otherwise.
    """
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o 
    result = cond1_higher_high and cond2_lower_low and cond3_down_close
    if result:
        trend_utils.log_debug(current_bar.index, "CUS Rule 'check_cus_confirmation_higher_high_lower_low_down_close' MET")
    return result

def check_cus_confirmation_engulfing_up_with_pds_low_break(current_bar, prev_bar, pds_candidate_bar_for_context):
    """
    Custom Rule 'EngulfingUpPDSLowBreak' for confirming a Confirmed Uptrend Start (CUS).
    Pattern: Current bar is a strong bullish engulfing bar: it makes a higher high and lower low 
             than prev_bar, closes higher than prev_bar's close, and closes above its own open (up-bar).
             Crucially, it must also break below the low of a relevant PDS candidate, signifying 
             a decisive reversal and confirming a prior PUS.
    Args:
        current_bar (Bar): The bar being evaluated.
        prev_bar (Bar): The bar immediately preceding current_bar.
        pds_candidate_bar_for_context (Bar, optional):
            The PDS candidate bar whose low must be broken by current_bar.l.
            If None, this rule cannot fully confirm.
    Returns:
        bool: True if CUS confirmation conditions are met, False otherwise.
    """
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l 
    cond3_closes_higher_than_prev_close = current_bar.c > prev_bar.c
    cond4_up_bar = current_bar.c > current_bar.o 
    if pds_candidate_bar_for_context is None:
        return False 
    cond5_break_pds_low = current_bar.l < pds_candidate_bar_for_context.l
    result = cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low
    if result:
        trend_utils.log_debug(current_bar.index, f"CUS Rule 'check_cus_confirmation_engulfing_up_with_pds_low_break' MET for PDS cand {pds_candidate_bar_for_context.index if pds_candidate_bar_for_context else 'None'}")
    return result

# --- CUS Rule Wrapper Functions ---
def _cus_rule_exhaustion_reversal(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule: Exhaustion reversal - A lower OHLC bar after a PUS candidate suggests
    the downtrend has exhausted and uptrend is confirmed.
    """
    if not is_lower_ohlc_bar(current_bar, prev_bar):
        return False
    if initial_pds_candidate_bar_obj is not None and current_bar.l < initial_pds_candidate_bar_obj.l:
        return False
    if initial_pus_candidate_bar_obj is None:
        return False
    if current_bar.index - initial_pus_candidate_bar_obj.index > CUS_EXHAUSTION_MAX_BARS_FROM_CANDIDATE:
        return False
    trend_utils.log_debug(current_bar.index, f"CUS Rule '_cus_rule_exhaustion_reversal' MET for PUS {initial_pus_candidate_bar_obj.index}")
    return True

def _cus_rule_low_undercut_high_respect(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule Wrapper: LowUndercutHighRespect pattern."""
    pds_context = initial_pds_candidate_bar_obj
    if not pds_context and state.pds_candidate_for_cds_bar_index is not None:
        if 0 <= (state.pds_candidate_for_cds_bar_index - 1) < len(all_bars):
            pds_context = all_bars[state.pds_candidate_for_cds_bar_index - 1]

    if not initial_pus_candidate_bar_obj or not pds_context:
        trend_utils.log_debug(current_bar.index, f"CUS Rule 'LowUndercutHighRespect' REJECTED: Missing PUS ({initial_pus_candidate_bar_obj.index if initial_pus_candidate_bar_obj else 'None'}) or PDS context ({pds_context.index if pds_context else 'None'}).")
        return False

    if pds_context.index <= initial_pus_candidate_bar_obj.index:
        trend_utils.log_debug(current_bar.index, f"CUS Rule 'LowUndercutHighRespect' REJECTED: PDS context (Bar {pds_context.index}) not after PUS candidate (Bar {initial_pus_candidate_bar_obj.index}).")
        return False
        
    return check_cus_confirmation_low_undercut_high_respect(current_bar, prev_bar, pds_context)

def _cus_rule_hhll_down_close(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule Wrapper: HigherHighLowerLowDownClose (outside bar, closes down)."""
    return check_cus_confirmation_higher_high_lower_low_down_close(current_bar, prev_bar)

def _cus_rule_engulfing_up_pds_low_break(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule Wrapper: EngulfingUpPDSLowBreak (bullish engulfing that breaks PDS low)."""
    return check_cus_confirmation_engulfing_up_with_pds_low_break(current_bar, prev_bar, initial_pds_candidate_bar_obj)

def _cus_rule_breakout_after_failed_low_v2(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """
    CUS Rule: Breakout After Failed Low.
    Confirms a PUS if:
    1. A PUS candidate exists.
    2. A subsequent PDS candidate exists (after the PUS).
    3. The PUS candidate's low has not been violated by any bar between PUS and current_bar-1.
    4. Current bar makes a new high above the PDS candidate's high.
    5. Current bar closes higher than previous bar's close.
    6. Current bar is an up-bar (closes above its open).
    """
    if not initial_pus_candidate_bar_obj or not initial_pds_candidate_bar_obj:
        trend_utils.log_debug(current_bar.index, f"CUS Rule '_cus_rule_breakout_after_failed_low_v2' REJECTED: No initial PUS ({initial_pus_candidate_bar_obj.index if initial_pus_candidate_bar_obj else 'None'}) or PDS ({initial_pds_candidate_bar_obj.index if initial_pds_candidate_bar_obj else 'None'}) candidate.")
        return False
    if not (initial_pds_candidate_bar_obj.index > initial_pus_candidate_bar_obj.index):
        trend_utils.log_debug(current_bar.index, f"CUS Rule '_cus_rule_breakout_after_failed_low_v2' REJECTED: PDS candidate Bar {initial_pds_candidate_bar_obj.index} not after PUS candidate Bar {initial_pus_candidate_bar_obj.index}.")
        return False

    pus_low_respected = True
    check_from_1_based_idx = initial_pus_candidate_bar_obj.index + 1
    check_to_1_based_idx = current_bar.index - 1

    if check_from_1_based_idx <= check_to_1_based_idx:
        for bar_1_based_idx_to_check in range(check_from_1_based_idx, check_to_1_based_idx + 1):
            bar_to_check_0_idx = bar_1_based_idx_to_check - 1
            if 0 <= bar_to_check_0_idx < len(all_bars):
                if all_bars[bar_to_check_0_idx].l < initial_pus_candidate_bar_obj.l:
                    pus_low_respected = False
                    trend_utils.log_debug(current_bar.index, f"CUS Rule '_cus_rule_breakout_after_failed_low_v2' REJECTED: PUS_Low_Violated by Bar {all_bars[bar_to_check_0_idx].index} (L:{all_bars[bar_to_check_0_idx].l}) vs PUS Bar {initial_pus_candidate_bar_obj.index} (L:{initial_pus_candidate_bar_obj.l})")
                    break
    if not pus_low_respected:
        return False

    cond_new_high_vs_pds = current_bar.h > initial_pds_candidate_bar_obj.h
    cond_closes_higher_prev = current_bar.c > prev_bar.c
    cond_up_bar = current_bar.c > current_bar.o

    result = cond_new_high_vs_pds and cond_closes_higher_prev and cond_up_bar
    if result:
        trend_utils.log_debug(current_bar.index, f"CUS Rule '_cus_rule_breakout_after_failed_low_v2' MET for PUS {initial_pus_candidate_bar_obj.index} and PDS {initial_pds_candidate_bar_obj.index}")
    else:
        trend_utils.log_debug(current_bar.index, f"CUS Rule '_cus_rule_breakout_after_failed_low_v2' NOT MET. PUS:{initial_pus_candidate_bar_obj.index if initial_pus_candidate_bar_obj else 'N/A'}, PDS:{initial_pds_candidate_bar_obj.index if initial_pds_candidate_bar_obj else 'N/A'}. cond_new_high_vs_pds:{cond_new_high_vs_pds}, cond_closes_higher_prev:{cond_closes_higher_prev}, cond_up_bar:{cond_up_bar}, pus_low_respected:{pus_low_respected}")
    return result

CUS_RULE_DEFINITIONS = [
    ("EXHAUSTION_REVERSAL", _cus_rule_exhaustion_reversal),
    ("LowUndercutHighRespect", _cus_rule_low_undercut_high_respect),
    ("HigherHighLowerLowDownClose", _cus_rule_hhll_down_close),
    ("EngulfingUpPDSLowBreak", _cus_rule_engulfing_up_pds_low_break),
    ("BreakoutAfterFailedLowV2", _cus_rule_breakout_after_failed_low_v2),
]

def _evaluate_cus_rules(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """
    Evaluates all Confirmed Uptrend Start (CUS) rules based on an initial PUS candidate.
    Iterates through CUS_RULE_DEFINITIONS.
    Returns:
        tuple: (bool, str or None) indicating (can_confirm_cus, cus_trigger_rule_type)
    """
    if state.in_containment and \
       state.containment_start_bar_index_for_log is not None and \
       current_bar.index > state.containment_start_bar_index_for_log + ALLOWED_BARS_INTO_CONTAINMENT_FOR_CUS_CONFIRM:
        trend_utils.log_debug(current_bar.index, f"CUS Evaluation: Suppressed. Bar {current_bar.index} is > {ALLOWED_BARS_INTO_CONTAINMENT_FOR_CUS_CONFIRM} bars after containment start ({state.containment_start_bar_index_for_log}).")
        return False, None

    can_confirm_cus = False
    cus_trigger_rule_type = None
    if initial_pus_candidate_bar_obj is not None: 
        for rule_name, rule_func in CUS_RULE_DEFINITIONS:
            trend_utils.log_debug(current_bar.index, f"CUS Evaluation: Checking rule '{rule_name}' for PUS on Bar {initial_pus_candidate_bar_obj.index}.")
            if rule_func(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
                can_confirm_cus = True
                cus_trigger_rule_type = rule_name
                trend_utils.log_debug(current_bar.index, f"CUS Evaluation: Rule '{rule_name}' MET for PUS on Bar {initial_pus_candidate_bar_obj.index}.")
                break
            else:
                trend_utils.log_debug(current_bar.index, f"CUS Evaluation: Rule '{rule_name}' NOT MET for PUS on Bar {initial_pus_candidate_bar_obj.index}.")
    else:
        trend_utils.log_debug(current_bar.index, "CUS Evaluation: No initial PUS candidate to evaluate.")
    return can_confirm_cus, cus_trigger_rule_type

def _apply_cus_confirmation(current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, state, all_bars, current_bar_event_descriptions):
    """
    Applies the consequences of a Confirmed Uptrend Start (CUS).
    Updates state, logs events, and handles PDS generation after CUS.
    """
    state.confirm_uptrend(confirmed_bar_for_this_cus, all_bars, current_bar_event_descriptions)
    state._reset_all_pending_uptrend_states()

    if cus_trigger_rule_type == "HigherHighLowerLowDownClose":
        prev_to_current_bar = all_bars[current_bar.index - 2] if current_bar.index > 1 else None
        trend_utils.log_debug(current_bar.index, f"Apply CUS: Rule '{cus_trigger_rule_type}' triggered. Attempting PDS on current_bar ({current_bar.index}) due to pattern.")
        state.set_new_pending_downtrend_signal(current_bar, prev_to_current_bar, current_bar_event_descriptions, 
                                              "(from HigherHighLowerLowDownClose pattern)")
    elif cus_trigger_rule_type == "EngulfingUpPDSLowBreak":
        trend_utils.log_debug(current_bar.index, f"Apply CUS: Rule '{cus_trigger_rule_type}' triggered. No automatic PDS generation for this rule.")
        pass
    else:
        cus_triggering_bar = current_bar
        if confirmed_bar_for_this_cus and cus_triggering_bar:
            if (is_lower_ohlc_bar(cus_triggering_bar, confirmed_bar_for_this_cus) or
                is_pending_downtrend_start_rule(cus_triggering_bar, confirmed_bar_for_this_cus) or 
                is_simple_pending_downtrend_start_signal(cus_triggering_bar, confirmed_bar_for_this_cus)):
                prev_to_confirmed_cus_bar = None
                if confirmed_bar_for_this_cus.index > 1:
                    idx_before_confirmed_cus = confirmed_bar_for_this_cus.index - 2 
                    if idx_before_confirmed_cus >= 0 and idx_before_confirmed_cus < len(all_bars):
                        prev_to_confirmed_cus_bar = all_bars[idx_before_confirmed_cus]
                trend_utils.log_debug(current_bar.index, f"Apply CUS: Rule '{cus_trigger_rule_type}' triggered. Attempting PDS on confirmed_cus_bar ({confirmed_bar_for_this_cus.index}) due to trigger by Bar {cus_triggering_bar.index}.")
                state.set_new_pending_downtrend_signal(confirmed_bar_for_this_cus, prev_to_confirmed_cus_bar, current_bar_event_descriptions,
                                                     f"(due to trigger by Bar {cus_triggering_bar.index})") 