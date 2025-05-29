from . import trend_utils
from .trend_patterns import (
    is_lower_ohlc_bar, is_pending_downtrend_start_rule, is_simple_pending_downtrend_start_signal,
    is_higher_ohlc_bar, is_pending_uptrend_start_rule, is_simple_pending_uptrend_start_signal,
    is_hhll_down_close_pattern
)

# Assuming ALLOWED_BARS_INTO_CONTAINMENT_FOR_CUS_CONFIRM is defined elsewhere or passed if needed by _handle_containment_logic
# For now, if it was a global in the original file, it might need to be passed or defined here if _handle_containment_logic uses it directly.
# Based on current _handle_containment_logic, it does not directly use this constant.

def _handle_containment_logic(current_bar, state, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions):
    """
    Manages logic for entering, exiting, and tracking price containment.
    Modifies state.in_containment and related fields, and appends to current_bar_event_descriptions.
    """
    if state.in_containment:
        trend_utils.log_debug(current_bar.index, f"Containment Logic: Currently IN containment (Ref Bar: {state.containment_ref_bar_index}, H:{state.containment_ref_high}, L:{state.containment_ref_low}).")
        if current_bar.index == state.containment_start_bar_index_for_log:
            pass 
        elif current_bar.h <= state.containment_ref_high and \
             current_bar.l >= state.containment_ref_low:
            state.containment_consecutive_bars_inside += 1
            current_bar_event_descriptions.append(
                f"Containment: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low}) "
                f"for {state.containment_consecutive_bars_inside} bars."
            )
            trend_utils.log_debug(current_bar.index, f"Containment Logic: Bar {current_bar.index} remains inside. Consecutive: {state.containment_consecutive_bars_inside}.")
        else: # current bar is outside the containment range
            break_type = "moves outside"
            if current_bar.c > state.containment_ref_high: break_type = "BREAKOUT above"
            elif current_bar.c < state.containment_ref_low: break_type = "BREAKDOWN below"
            current_bar_event_descriptions.append(
                f"Containment ENDED: Bar {current_bar.index} {break_type} Bar {state.containment_ref_bar_index} range "
                f"(was {state.containment_consecutive_bars_inside} bar(s) inside)."
            )
            trend_utils.log_debug(current_bar.index, f"Containment Logic: ENDED. Bar {current_bar.index} {break_type} range. Was {state.containment_consecutive_bars_inside} bars inside.")
            state._reset_containment_state()
        
    if not state.in_containment:
        chosen_candidate_ref_bar = None
        ref_type_for_log = None
        if initial_pds_candidate_bar_obj:
            chosen_candidate_ref_bar = initial_pds_candidate_bar_obj
            ref_type_for_log = "PENDING_DOWNTREND_HIGH"
        elif initial_pus_candidate_bar_obj:
            chosen_candidate_ref_bar = initial_pus_candidate_bar_obj
            ref_type_for_log = "PENDING_UPTREND_LOW"

        if chosen_candidate_ref_bar and chosen_candidate_ref_bar.index != current_bar.index:
            if current_bar.h <= chosen_candidate_ref_bar.h and \
               current_bar.l >= chosen_candidate_ref_bar.l:
                state.in_containment = True
                state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                state.containment_ref_type = ref_type_for_log
                state.containment_ref_high = chosen_candidate_ref_bar.h
                state.containment_ref_low = chosen_candidate_ref_bar.l
                state.containment_start_bar_index_for_log = current_bar.index
                state.containment_consecutive_bars_inside = 1
                current_bar_event_descriptions.append(
                    f"Containment START: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                    f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low})."
                )
                trend_utils.log_debug(current_bar.index, f"Containment Logic: START. Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} ({state.containment_ref_type}).")

def _check_and_set_new_pending_signals(current_bar, prev_bar, bar_before_prev_bar, state, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions):
    """
    Checks for and sets new Pending Downtrend Start (PDS) or Pending Uptrend Start (PUS) signals.
    This includes PDS Rule C and general PDS/PUS generation on prev_bar.
    Modifies state for pending signals and appends to current_bar_event_descriptions.
    """
    if state.in_containment and state.containment_start_bar_index_for_log != current_bar.index:
        trend_utils.log_debug(current_bar.index, "Signal Generation: Suppressed due to being deep in containment.")
        return

    new_pds_on_curr_bar_this_iteration = False
    if not cds_confirmed_this_iteration and current_bar.h > prev_bar.h and current_bar.c < current_bar.o: 
        trend_utils.log_debug(current_bar.index, f"Signal Generation: Checking Rule C for PDS on current_bar ({current_bar.index}).")
        if state.set_new_pending_downtrend_signal(current_bar, prev_bar, current_bar_event_descriptions, "by Rule C"):
            new_pds_on_curr_bar_this_iteration = True
            trend_utils.log_debug(current_bar.index, f"Signal Generation: Rule C MET. PDS set on current_bar ({current_bar.index}).")
        else:
            trend_utils.log_debug(current_bar.index, f"Signal Generation: Rule C NOT MET or PDS rejected for current_bar ({current_bar.index}).")
        
    if not cds_confirmed_this_iteration and not new_pds_on_curr_bar_this_iteration:
        trend_utils.log_debug(current_bar.index, f"Signal Generation: Checking PDS for prev_bar ({prev_bar.index}) triggered by current_bar ({current_bar.index}).")
        cond_lower_ohlc = is_lower_ohlc_bar(current_bar, prev_bar)
        cond_pds_rule = is_pending_downtrend_start_rule(current_bar, prev_bar)
        cond_simple_pds = is_simple_pending_downtrend_start_signal(current_bar, prev_bar)
        trend_utils.log_debug(current_bar.index, f"Signal Generation (PDS on prev_bar {prev_bar.index}): is_lower_ohlc_bar={cond_lower_ohlc}, is_pending_downtrend_start_rule={cond_pds_rule}, is_simple_pending_downtrend_start_signal={cond_simple_pds}")

        if cond_lower_ohlc or cond_pds_rule or cond_simple_pds:
            if state.set_new_pending_downtrend_signal(prev_bar, bar_before_prev_bar, current_bar_event_descriptions):
                 trend_utils.log_debug(current_bar.index, f"Signal Generation: PDS conditions MET. PDS set/updated on prev_bar ({prev_bar.index}).")
            else:
                 trend_utils.log_debug(current_bar.index, f"Signal Generation: PDS conditions MET BUT PDS on prev_bar ({prev_bar.index}) was rejected or not updated (e.g. H < prev H, or existing cand better).")
        else:
            trend_utils.log_debug(current_bar.index, f"Signal Generation: No PDS conditions met for prev_bar ({prev_bar.index}).")
            
    if not cus_confirmed_this_iteration and not new_pds_on_curr_bar_this_iteration:
        trend_utils.log_debug(current_bar.index, f"Signal Generation: Checking PUS for prev_bar ({prev_bar.index}) triggered by current_bar ({current_bar.index}).")
        cond_higher_ohlc = is_higher_ohlc_bar(current_bar, prev_bar)
        cond_pus_rule = is_pending_uptrend_start_rule(current_bar, prev_bar)
        cond_simple_pus = is_simple_pending_uptrend_start_signal(current_bar, prev_bar)
        cond_curr_triggers_pus_on_prev_via_hhll = is_hhll_down_close_pattern(current_bar, prev_bar)
        
        trend_utils.log_debug(current_bar.index, f"Signal Generation (PUS on prev_bar {prev_bar.index}): is_higher_ohlc_bar={cond_higher_ohlc}, is_pending_uptrend_start_rule={cond_pus_rule}, is_simple_pending_uptrend_start_signal={cond_simple_pus}, cond_curr_triggers_pus_on_prev_via_hhll={cond_curr_triggers_pus_on_prev_via_hhll}")

        if cond_higher_ohlc or cond_pus_rule or cond_simple_pus or cond_curr_triggers_pus_on_prev_via_hhll:
            if state.set_new_pending_uptrend_signal(prev_bar, current_bar_event_descriptions, 
                                              reason_message_suffix=f"(triggered by current_bar {current_bar.index} with HHLL)" if cond_curr_triggers_pus_on_prev_via_hhll else ""):
                trend_utils.log_debug(current_bar.index, f"Signal Generation: PUS conditions MET. PUS set/updated on prev_bar ({prev_bar.index}).")
            else:
                trend_utils.log_debug(current_bar.index, f"Signal Generation: PUS conditions MET BUT PUS on prev_bar ({prev_bar.index}) was not updated (e.g. existing cand better).")
        else:
            trend_utils.log_debug(current_bar.index, f"Signal Generation: No PUS conditions met for prev_bar ({prev_bar.index}).") 