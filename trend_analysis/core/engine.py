"""
Core engine for trend detection algorithm.
"""

import logging
from trend_analysis.core.models import State
from trend_analysis.core.patterns import (
    is_SDB, is_SUB, is_BRB, is_your_custom_pds_rule, is_your_custom_pus_rule,
    is_custom_pds_rule_B, is_custom_pus_rule_B
)
from trend_analysis.core.rules import (
    check_custom_cds_confirmation_A, check_custom_cds_confirmation_B,
    check_custom_cds_confirmation_F, check_custom_cds_confirmation_G,
    check_custom_cds_confirmation_H, check_custom_cus_confirmation_ref36,
    check_custom_cus_confirmation_HHLL, check_custom_cus_EngulfingUp
)
from trend_analysis.utils.helpers import get_unique_sorted_events, find_intervening_bar

logger = logging.getLogger(__name__)

def process_trend_logic(all_bars, debug_mode=False, debug_indices=None):
    """
    Process bar data to detect trend starts and changes.
    
    This is the main algorithm that analyzes price bars to identify potential 
    and confirmed trend signals based on predefined rules.
    
    Args:
        all_bars (list): List of Bar objects in chronological order
        debug_mode (bool): Whether to enable verbose debugging
        debug_indices (list): List of specific bar indices to debug
        
    Returns:
        list: Log entries describing trend events for each bar
        
    Raises:
        ValueError: If all_bars is empty
    """
    if not all_bars:
        logger.error("No bars provided for trend analysis")
        return []

    state = State()
    for k in range(len(all_bars)):
        log_index_for_this_entry = k + 1
        current_bar_event_descriptions = []
        
        # Skip the first bar as it has no previous bar for comparison
        if k == 0:
            state.log_entries.append(f"{log_index_for_this_entry}. Nothing")
            continue
        
        current_bar = all_bars[k]
        prev_bar = all_bars[k-1]
        
        # Enable specific debugging for certain bar indices
        if debug_mode and debug_indices and log_index_for_this_entry in debug_indices:
            logger.debug(f"\n--- DEBUG START: Processing Log Entry {log_index_for_this_entry} "
                       f"(CurrentBar: {current_bar.index}) ---")
            logger.debug(f"  PrevBar: {prev_bar.index if prev_bar else 'N/A'}")
            logger.debug(f"  State BEFORE CUS/CDS Eval:")
            logger.debug(f"    PUS Candidate Index: {state.confirmed_uptrend_candidate_low_bar_index}, "
                       f"Low: {state.confirmed_uptrend_candidate_low_low}")
            logger.debug(f"    PDS Candidate Index: {state.confirmed_downtrend_candidate_peak_bar_index}, "
                       f"High: {state.confirmed_downtrend_candidate_peak_high}")
            logger.debug(f"    Last Confirmed Trend: {state.last_confirmed_trend_type}, "
                       f"Bar Index: {state.last_confirmed_trend_bar_index}")
            logger.debug(f"    Overall Trend Is Up: {state.overall_trend_is_up}")
        
        confirmed_uptrend_this_iteration = False
        confirmed_downtrend_this_iteration = False

        # --- Store initial candidates for this iteration's evaluation ---
        initial_pus_candidate_idx = state.confirmed_uptrend_candidate_low_bar_index
        initial_pus_candidate_bar_obj = None
        if initial_pus_candidate_idx is not None:
            initial_pus_candidate_bar_obj = all_bars[initial_pus_candidate_idx - 1]

        initial_pds_candidate_idx = state.confirmed_downtrend_candidate_peak_bar_index
        initial_pds_candidate_bar_obj = None
        if initial_pds_candidate_idx is not None:
            initial_pds_candidate_bar_obj = all_bars[initial_pds_candidate_idx - 1]

        # --- BEGIN CONTAINMENT LOGIC ---
        if state.in_containment:
            # Check if current_bar is still within the established containment range
            if current_bar.index == state.containment_start_bar_index_for_log:
                # This case should ideally not be hit if logic is correct, 
                # as containment_start_bar_index_for_log is the bar that *entered*.
                # The consecutive_bars_inside would be 1. This is more of a marker.
                pass  # Handled by initial log when containment started
            elif (current_bar.h <= state.containment_ref_high and 
                  current_bar.l >= state.containment_ref_low):
                state.containment_consecutive_bars_inside += 1
                current_bar_event_descriptions.append(
                    f"Containment: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                    f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low}) "
                    f"for {state.containment_consecutive_bars_inside} bars."
                )
            else:  # Broke out of containment
                break_type = "moves outside"
                if current_bar.c > state.containment_ref_high: 
                    break_type = "BREAKOUT above"
                elif current_bar.c < state.containment_ref_low: 
                    break_type = "BREAKDOWN below"
                
                current_bar_event_descriptions.append(
                    f"Containment ENDED: Bar {current_bar.index} {break_type} Bar {state.containment_ref_bar_index} range "
                    f"(was {state.containment_consecutive_bars_inside} bar(s) inside)."
                )
                state.in_containment = False
                state.containment_ref_bar_index = None
                state.containment_ref_type = None
                state.containment_ref_high = None
                state.containment_ref_low = None
                state.containment_start_bar_index_for_log = None
                state.containment_consecutive_bars_inside = 0
        
        if not state.in_containment:
            # Try to initiate new containment based on initial PDS/PUS candidates from *before* this bar's full processing
            chosen_candidate_ref_bar = None
            ref_type_for_log = None

            if initial_pds_candidate_bar_obj:
                chosen_candidate_ref_bar = initial_pds_candidate_bar_obj
                ref_type_for_log = "PDS_PEAK"
            elif initial_pus_candidate_bar_obj:  # Only if no PDS candidate
                chosen_candidate_ref_bar = initial_pus_candidate_bar_obj
                ref_type_for_log = "PUS_LOW"
            
            if chosen_candidate_ref_bar and chosen_candidate_ref_bar.index != current_bar.index:
                if (current_bar.h <= chosen_candidate_ref_bar.h and 
                    current_bar.l >= chosen_candidate_ref_bar.l):
                    state.in_containment = True
                    state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                    state.containment_ref_type = ref_type_for_log
                    state.containment_ref_high = chosen_candidate_ref_bar.h
                    state.containment_ref_low = chosen_candidate_ref_bar.l
                    state.containment_start_bar_index_for_log = current_bar.index
                    state.containment_consecutive_bars_inside = 1  # current_bar is the first bar inside
                    current_bar_event_descriptions.append(
                        f"Containment START: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                        f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low})."
                    )
        # --- END CONTAINMENT LOGIC ---

        # --- Evaluate CUS Possibility (based on initial PUS candidate) ---
        can_confirm_cus = False
        cus_trigger_rule_type = None  # e.g., "SDB", "REF36", "HHLL"
        
        if initial_pus_candidate_bar_obj is not None:
            sdb_triggers_cus = is_SDB(current_bar, prev_bar)
            
            sdb_cus_valid_context = True  # Restored: sdb_cus_valid_context logic
            if sdb_triggers_cus and initial_pds_candidate_bar_obj is not None: 
                if current_bar.l < initial_pds_candidate_bar_obj.l:
                    sdb_cus_valid_context = False
            
            # Context for REF36 CUS rule
            ref36_pds_context_for_check = initial_pds_candidate_bar_obj 
            if not ref36_pds_context_for_check and state.confirmed_downtrend_candidate_peak_bar_index is not None:
                 ref36_pds_context_for_check = all_bars[state.confirmed_downtrend_candidate_peak_bar_index - 1]
            
            ref36_triggers_cus = check_custom_cus_confirmation_ref36(
                current_bar, prev_bar, ref36_pds_context_for_check
            )
            hhll_triggers_cus = check_custom_cus_confirmation_HHLL(current_bar, prev_bar)
            engulfing_up_triggers_cus = check_custom_cus_EngulfingUp(
                current_bar, prev_bar, initial_pds_candidate_bar_obj
            )

            if debug_mode and log_index_for_this_entry == 54:  # Specific debug case
                logger.debug(f"DEBUG LOG 54 CUS TRIGGERS: sdb={sdb_triggers_cus}, "
                           f"sdb_valid={sdb_cus_valid_context}, ref36={ref36_triggers_cus}, "
                           f"hhll={hhll_triggers_cus}, engulf={engulfing_up_triggers_cus}")

            if sdb_triggers_cus and sdb_cus_valid_context: 
                can_confirm_cus = True
                cus_trigger_rule_type = "SDB"
            elif ref36_triggers_cus: 
                can_confirm_cus = True
                cus_trigger_rule_type = "REF36"
            elif hhll_triggers_cus: 
                can_confirm_cus = True
                cus_trigger_rule_type = "HHLL"
            elif engulfing_up_triggers_cus: 
                can_confirm_cus = True
                cus_trigger_rule_type = "EngulfingUp"

        # --- Evaluate CDS Possibility (based on initial PDS candidate) ---
        can_confirm_cds = False
        cds_trigger_rule_type = None  # e.g., "BRB", "A", "B", "F"
        
        if initial_pds_candidate_bar_obj is not None:
            # For BRB, 'no_higher_high_for_brb_path' needs initial_pds_candidate_bar_obj
            no_higher_high_for_brb_path = True
            if initial_pds_candidate_bar_obj.index < prev_bar.index:
                for j_1based_idx in range(initial_pds_candidate_bar_obj.index + 1, prev_bar.index + 1):
                    if all_bars[j_1based_idx - 1].h > initial_pds_candidate_bar_obj.h:
                        no_higher_high_for_brb_path = False
                        break
            
            # Check for BRB with custom rules
            if (is_BRB(current_bar, prev_bar) and no_higher_high_for_brb_path and 
                current_bar.l < initial_pds_candidate_bar_obj.o): 
                can_confirm_cds = True
                cds_trigger_rule_type = "BRB_vs_PDSOpen"
            elif check_custom_cds_confirmation_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = "A"
            elif check_custom_cds_confirmation_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = "B"
            elif check_custom_cds_confirmation_F(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = "F"
            elif check_custom_cds_confirmation_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = "G"
            # Check for Rule H if prev_bar was the peak PDS candidate
            elif (initial_pds_candidate_bar_obj == prev_bar and 
                  check_custom_cds_confirmation_H(current_bar, prev_bar)):
                can_confirm_cds = True
                cds_trigger_rule_type = "H"

        # --- Apply Consequences (PRIORITY 1: CUS) ---
        if can_confirm_cus:
            confirmed_uptrend_this_iteration = True
            confirmed_bar_for_this_cus = initial_pus_candidate_bar_obj

            # Debug for specific bar range
            if debug_mode and debug_indices and log_index_for_this_entry in debug_indices:
                logger.debug(f"  CUS TRIGGERED for PUS Bar {confirmed_bar_for_this_cus.index} "
                           f"by CurrentBar {current_bar.index}")
                logger.debug(f"    Rule: {cus_trigger_rule_type}")
                logger.debug(f"    Initial PDS for context (if used by rule): "
                           f"{initial_pds_candidate_bar_obj.index if initial_pds_candidate_bar_obj else 'None'}")

            # Check for needed alternate downtrend confirmation
            if (state.last_confirmed_trend_type == 'uptrend' and 
                confirmed_bar_for_this_cus and state.last_confirmed_trend_bar_index is not None and 
                confirmed_bar_for_this_cus.index > state.last_confirmed_trend_bar_index):
                
                intervening_high_bar_for_dt = find_intervening_bar(
                    all_bars, state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cus.index,
                    find_lowest_low=False
                )
                
                if intervening_high_bar_for_dt:
                    current_bar_event_descriptions.append(
                        f"Downtrend Start Confirmed for Bar {intervening_high_bar_for_dt.index} "
                        f"({intervening_high_bar_for_dt.date}) # FORCED to alternate"
                    )
                    
                    if debug_mode and log_index_for_this_entry == 70:  # Specific debug case
                        logger.debug(f"    LOG_70_DEBUG_FORCED_DT: *** CORRECTLY ENTERING FORCED DT BLOCK NOW *** "
                                   f"Last Confirmed: {state.last_confirmed_trend_type} @ {state.last_confirmed_trend_bar_index}. "
                                   f"Current CUS for Bar: {confirmed_bar_for_this_cus.index if confirmed_bar_for_this_cus else 'N/A'}")

            # Confirm uptrend
            current_bar_event_descriptions.append(
                f"Uptrend Start Confirmed for Bar {confirmed_bar_for_this_cus.index} "
                f"({confirmed_bar_for_this_cus.date})"
            )
            state.overall_trend_is_up = True 
            state.last_confirmed_trend_type = 'uptrend'  # This is the actual confirmed trend
            state.last_confirmed_trend_bar_index = confirmed_bar_for_this_cus.index
            
            cus_confirmed_bar = confirmed_bar_for_this_cus
            cus_triggering_bar = current_bar

            # Clear ALL PUS state as it's now confirmed
            state.potential_uptrend_signal_bar_index = None
            state.potential_uptrend_anchor_low = None
            state.confirmed_uptrend_candidate_low_bar_index = None
            state.confirmed_uptrend_candidate_low_low = None
            state.confirmed_uptrend_candidate_low_high = None

            # Check if the CUS bar should become a PDS
            made_cus_bar_pds = False
            if cus_confirmed_bar and cus_triggering_bar:  # Redundant check, but safe
                is_pds_by_trigger = False
                if (is_SDB(cus_triggering_bar, cus_confirmed_bar) or 
                    is_your_custom_pds_rule(cus_triggering_bar, cus_confirmed_bar) or 
                    is_custom_pds_rule_B(cus_triggering_bar, cus_confirmed_bar)):
                    is_pds_by_trigger = True
                
                if is_pds_by_trigger:
                    # Only set PDS on CUS bar if it's a new peak or no PDS exists
                    if (state.confirmed_downtrend_candidate_peak_bar_index is None or 
                        cus_confirmed_bar.h > state.confirmed_downtrend_candidate_peak_high):
                        current_bar_event_descriptions.append(
                            f"Potential Downtrend Signal on CUS Bar {cus_confirmed_bar.index} "
                            f"(due to trigger by {cus_triggering_bar.index})"
                        )
                        state.potential_downtrend_signal_bar_index = cus_confirmed_bar.index
                        state.potential_downtrend_anchor_high = cus_confirmed_bar.h
                        state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_bar.index
                        state.confirmed_downtrend_candidate_peak_high = cus_confirmed_bar.h
                        state.confirmed_downtrend_candidate_peak_low = cus_confirmed_bar.l
                        made_cus_bar_pds = True

            # Apply rule-specific PDS logic if not already set
            if not made_cus_bar_pds:
                if cus_trigger_rule_type == "HHLL":
                    current_bar_event_descriptions.append(
                        f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})"
                    )
                    state.potential_downtrend_signal_bar_index = current_bar.index
                    state.potential_downtrend_anchor_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                    state.confirmed_downtrend_candidate_peak_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_low = current_bar.l
                elif cus_trigger_rule_type != "EngulfingUp":  # SDB or REF36 CUS
                    if (state.confirmed_downtrend_candidate_peak_bar_index is None or 
                        cus_confirmed_bar.h > state.confirmed_downtrend_candidate_peak_high):
                        current_bar_event_descriptions.append(
                            f"Potential Downtrend Signal on Bar {cus_confirmed_bar.index} ({cus_confirmed_bar.date})"
                        )
                        state.potential_downtrend_signal_bar_index = cus_confirmed_bar.index
                        state.potential_downtrend_anchor_high = cus_confirmed_bar.h
                        state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_bar.index
                        state.confirmed_downtrend_candidate_peak_high = cus_confirmed_bar.h
                        state.confirmed_downtrend_candidate_peak_low = cus_confirmed_bar.l
        
        # --- Apply Consequences (PRIORITY 2: CDS) ---
        if can_confirm_cds:
            confirmed_downtrend_this_iteration = True
            confirmed_bar_for_this_cds = initial_pds_candidate_bar_obj

            # Debug for specific bar range
            if debug_mode and debug_indices and log_index_for_this_entry in debug_indices:
                logger.debug(f"  CDS TRIGGERED for PDS Bar {confirmed_bar_for_this_cds.index} "
                           f"by CurrentBar {current_bar.index}")
                logger.debug(f"    Rule: {cds_trigger_rule_type}")
                logger.debug(f"    Initial PUS for context (if used by rule): "
                           f"{initial_pus_candidate_bar_obj.index if initial_pus_candidate_bar_obj else 'None'}")

            # Check for needed alternate uptrend confirmation
            if (state.last_confirmed_trend_type == 'downtrend' and 
                confirmed_bar_for_this_cds.index > state.last_confirmed_trend_bar_index):
                
                intervening_low_bar_for_ut = find_intervening_bar(
                    all_bars, state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cds.index,
                    find_lowest_low=True
                )
                
                if intervening_low_bar_for_ut:
                    current_bar_event_descriptions.append(
                        f"Uptrend Start Confirmed for Bar {intervening_low_bar_for_ut.index} "
                        f"({intervening_low_bar_for_ut.date}) # FORCED to alternate"
                    )
                    state.last_confirmed_trend_type = 'uptrend'
                    state.last_confirmed_trend_bar_index = intervening_low_bar_for_ut.index
            
            # Confirm downtrend
            current_bar_event_descriptions.append(
                f"Downtrend Start Confirmed for Bar {confirmed_bar_for_this_cds.index} "
                f"({confirmed_bar_for_this_cds.date})"
            )
            state.overall_trend_is_up = False
            state.last_confirmed_trend_type = 'downtrend'
            state.last_confirmed_trend_bar_index = confirmed_bar_for_this_cds.index

            cds_confirmed_bar = confirmed_bar_for_this_cds

            # Invalidate any PUS candidate that occurred at or before this confirmed CDS bar
            if (state.confirmed_uptrend_candidate_low_bar_index is not None and 
                state.confirmed_uptrend_candidate_low_bar_index <= initial_pds_candidate_bar_obj.index):
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None
                state.confirmed_uptrend_candidate_low_bar_index = None
                state.confirmed_uptrend_candidate_low_low = None
                state.confirmed_uptrend_candidate_low_high = None
            
            # Clear the PDS state for the bar that was just confirmed
            if state.confirmed_downtrend_candidate_peak_bar_index == cds_confirmed_bar.index:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None
                state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
            
            if state.potential_downtrend_signal_bar_index == cds_confirmed_bar.index:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None

            # Apply rule-specific PUS logic
            if cds_trigger_rule_type == "BRB_vs_PDSOpen":
                current_bar_event_descriptions.append(
                    f"Potential Uptrend Signal on Bar {current_bar.index} ({current_bar.date})"
                )
                state.potential_uptrend_signal_bar_index = current_bar.index
                state.potential_uptrend_anchor_low = current_bar.l
                
                # Intelligent CUS candidate update for BRB
                chosen_pus_candidate_bar = current_bar
                if (state.confirmed_uptrend_candidate_low_bar_index is not None and 
                    state.confirmed_uptrend_candidate_low_low is not None and 
                    state.confirmed_uptrend_candidate_low_low < current_bar.l):
                    chosen_pus_candidate_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1]
                
                # Update confirmed_uptrend_candidate_... states
                state.confirmed_uptrend_candidate_low_bar_index = chosen_pus_candidate_bar.index
                state.confirmed_uptrend_candidate_low_low = chosen_pus_candidate_bar.l
                state.confirmed_uptrend_candidate_low_high = chosen_pus_candidate_bar.h
            
            elif cds_trigger_rule_type in ["A", "B", "F"]:
                # Use existing PUS candidate if available (it might be None if CUS just cleared it)
                # OR find lowest_low between initial_pds_candidate_bar_obj and current_bar
                temp_pus_candidate_bar = None
                if state.confirmed_uptrend_candidate_low_bar_index is not None:
                    temp_pus_candidate_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1]
                else:  # Find lowest_low
                    lowest_low_bar_search = None
                    min_l_val = float('inf')
                    s_start_0idx = initial_pds_candidate_bar_obj.index - 1  # Convert to 0-based
                    s_end_0idx = current_bar.index - 2  # Convert to 0-based
                    
                    if s_start_0idx <= s_end_0idx:
                        for i_0based in range(s_start_0idx, s_end_0idx + 1):
                            bar_in_range = all_bars[i_0based]
                            if bar_in_range.l < min_l_val:
                                min_l_val = bar_in_range.l
                                lowest_low_bar_search = bar_in_range
                    
                    if lowest_low_bar_search is not None:
                        temp_pus_candidate_bar = lowest_low_bar_search
                
                if temp_pus_candidate_bar is not None:
                    current_bar_event_descriptions.append(
                        f"Potential Uptrend Signal on Bar {temp_pus_candidate_bar.index} "
                        f"({temp_pus_candidate_bar.date})"
                    )
                    state.potential_uptrend_signal_bar_index = temp_pus_candidate_bar.index
                    state.potential_uptrend_anchor_low = temp_pus_candidate_bar.l
                    state.confirmed_uptrend_candidate_low_bar_index = temp_pus_candidate_bar.index
                    state.confirmed_uptrend_candidate_low_low = temp_pus_candidate_bar.l
                    state.confirmed_uptrend_candidate_low_high = temp_pus_candidate_bar.h

            elif cds_trigger_rule_type == "G":
                # PUS for Rule G is prev_bar (which formed PUS due to current_bar SUB)
                current_bar_event_descriptions.append(
                    f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.date})"
                )
                state.potential_uptrend_signal_bar_index = prev_bar.index
                state.potential_uptrend_anchor_low = prev_bar.l
                
                # Only update confirmed candidate if prev_bar is better or none exists
                if (state.confirmed_uptrend_candidate_low_bar_index is None or 
                    prev_bar.l < state.confirmed_uptrend_candidate_low_low):
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = prev_bar.l
                    state.confirmed_uptrend_candidate_low_high = prev_bar.h

            # Special PDS rules
            if cds_trigger_rule_type == "F":  # Rule F specific PDS on current_bar
                current_bar_event_descriptions.append(
                    f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})"
                )
                state.potential_downtrend_signal_bar_index = current_bar.index
                state.potential_downtrend_anchor_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                state.confirmed_downtrend_candidate_peak_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_low = current_bar.l
            elif cds_trigger_rule_type == "H":
                # CDS for prev_bar (initial_pds_candidate_bar_obj) confirmed.
                # PUS on current_bar
                current_bar_event_descriptions.append(
                    f"Potential Uptrend Signal on Bar {current_bar.index} ({current_bar.date})"
                )
                state.potential_uptrend_signal_bar_index = current_bar.index
                state.potential_uptrend_anchor_low = current_bar.l
                state.confirmed_uptrend_candidate_low_bar_index = current_bar.index
                state.confirmed_uptrend_candidate_low_low = current_bar.l
                state.confirmed_uptrend_candidate_low_high = current_bar.h
                
                # PDS on current_bar
                current_bar_event_descriptions.append(
                    f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})"
                )
                state.potential_downtrend_signal_bar_index = current_bar.index
                state.potential_downtrend_anchor_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                state.confirmed_downtrend_candidate_peak_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_low = current_bar.l

        # --- Check for New Potential Signals (on prev_bar) ---
        # PDS Rule C (Failed Rally PDS on current_bar) is checked first
        new_pds_on_curr_bar_this_iteration = False 
        if current_bar.h > prev_bar.h and current_bar.c < current_bar.o:  # Outer if for PDS Rule C
            # Always set current_bar as PDS candidate if Rule C conditions are met
            current_bar_event_descriptions.append(
                f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date}) by Rule C"
            )
            state.potential_downtrend_signal_bar_index = current_bar.index
            state.potential_downtrend_anchor_high = current_bar.h
            state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
            state.confirmed_downtrend_candidate_peak_high = current_bar.h
            state.confirmed_downtrend_candidate_peak_low = current_bar.l
            new_pds_on_curr_bar_this_iteration = True
            
            # Clear PUS on the same bar if it exists
            if state.potential_uptrend_signal_bar_index == current_bar.index:
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None

        # Check for PDS on prev_bar, allow if no CDS confirmed for a *different* peak this iteration
        # And PDS Rule C didn't just fire for current_bar (to avoid double PDS setting if curr becomes prev)
        if not confirmed_downtrend_this_iteration and not new_pds_on_curr_bar_this_iteration:
            if (is_SDB(current_bar, prev_bar) or 
                is_your_custom_pds_rule(current_bar, prev_bar) or 
                is_custom_pds_rule_B(current_bar, prev_bar)): 
                
                # --- Modified PDS Candidate Update Logic ---
                old_pds_idx = state.confirmed_downtrend_candidate_peak_bar_index
                old_pds_high = state.confirmed_downtrend_candidate_peak_high
                
                can_set_pds_on_prev_bar = False
                if old_pds_idx is None or prev_bar.h > old_pds_high:
                    can_set_pds_on_prev_bar = True
                
                if can_set_pds_on_prev_bar:
                    state.potential_downtrend_signal_bar_index = prev_bar.index
                    state.potential_downtrend_anchor_high = prev_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                    state.confirmed_downtrend_candidate_peak_high = prev_bar.h
                    state.confirmed_downtrend_candidate_peak_low = prev_bar.l
                    current_bar_event_descriptions.append(
                        f"Potential Downtrend Signal on Bar {prev_bar.index} ({prev_bar.date})"
                    )
                    
                    # If PDS is set on prev_bar, and PUS was also potentially on prev_bar, clear PUS.
                    if state.potential_uptrend_signal_bar_index == prev_bar.index:
                        state.potential_uptrend_signal_bar_index = None
                        state.potential_uptrend_anchor_low = None
                    if state.confirmed_uptrend_candidate_low_bar_index == prev_bar.index:
                        state.confirmed_uptrend_candidate_low_bar_index = None
                        state.confirmed_uptrend_candidate_low_low = None
                        state.confirmed_uptrend_candidate_low_high = None
        
        # Check for PUS on prev_bar, allow if no CUS confirmed for a *different* trough this iteration
        # And PDS Rule C didn't just fire for current_bar (as that's a bearish signal)
        if not confirmed_uptrend_this_iteration and not new_pds_on_curr_bar_this_iteration:
            if (is_SUB(current_bar, prev_bar) or 
                is_your_custom_pus_rule(current_bar, prev_bar) or 
                is_custom_pus_rule_B(current_bar, prev_bar)): 
                
                state.potential_uptrend_signal_bar_index = prev_bar.index
                state.potential_uptrend_anchor_low = prev_bar.l
                
                if (state.confirmed_uptrend_candidate_low_bar_index is None or 
                    prev_bar.l < state.confirmed_uptrend_candidate_low_low):
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = prev_bar.l
                    state.confirmed_uptrend_candidate_low_high = prev_bar.h
                    current_bar_event_descriptions.append(
                        f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.date})"
                    )
                
                # If PUS is set and conflicting PDS exists, clear the PDS
                if state.potential_downtrend_signal_bar_index is not None:
                    state.potential_downtrend_signal_bar_index = None
                    state.potential_downtrend_anchor_high = None

        # --- Prepare Final Log Entry ---
        if not current_bar_event_descriptions:
            final_log_text = "Neutral"
        else:
            # Get unique sorted events to avoid duplicates
            unique_events = get_unique_sorted_events(current_bar_event_descriptions)
            final_log_text = "; ".join(unique_events)
        
        # Debug for specific bar indices
        if debug_mode and debug_indices and log_index_for_this_entry in debug_indices:
            logger.debug(f"  State AFTER CUS/CDS and PDS/PUS updates:")
            logger.debug(f"    PUS Candidate Index: {state.confirmed_uptrend_candidate_low_bar_index}, "
                       f"Low: {state.confirmed_uptrend_candidate_low_low}")
            logger.debug(f"    PDS Candidate Index: {state.confirmed_downtrend_candidate_peak_bar_index}, "
                       f"High: {state.confirmed_downtrend_candidate_peak_high}")
            logger.debug(f"    Last Confirmed Trend: {state.last_confirmed_trend_type}, "
                       f"Bar Index: {state.last_confirmed_trend_bar_index}")
            logger.debug(f"    Overall Trend Is Up: {state.overall_trend_is_up}")
            logger.debug(f"  LOGGED FOR {log_index_for_this_entry}: {final_log_text}")
            logger.debug(f"--- DEBUG END: Processing Log Entry {log_index_for_this_entry} ---")

        state.log_entries.append(f"{log_index_for_this_entry}. {final_log_text}")
    
    return state.log_entries 