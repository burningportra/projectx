import pandas as pd
import datetime
from datetime import timezone
import logging
from typing import List, Dict, Optional, Any, Tuple

logger = logging.getLogger(__name__)

MIN_BARS_FOR_TREND_START = 2 # Adjusted to allow initial PDS/PUS on first bar vs second

class Bar:
    def __init__(self, timestamp: datetime.datetime, o: float, h: float, l: float, c: float, volume: float = None, index: int = None):
        self.timestamp = timestamp
        self.o = float(o)
        self.h = float(h)
        self.l = float(l)
        self.c = float(c)
        self.volume = float(volume) if volume is not None else 0.0
        self.index: int = index # 1-based chronological index

    def __repr__(self):
        ts_str = self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else 'NoTime'
        return (f"Bar(Idx:{self.index}, T:{ts_str}, "
                f"O:{self.o} H:{self.h} L:{self.l} C:{self.c} V:{self.volume})")

class State:
    def __init__(self):
        self.potential_downtrend_signal_bar_index = None
        self.potential_downtrend_anchor_high = None
        self.potential_uptrend_signal_bar_index = None
        self.potential_uptrend_anchor_low = None
        self.confirmed_downtrend_candidate_peak_bar_index = None
        self.confirmed_downtrend_candidate_peak_high = None
        self.confirmed_downtrend_candidate_peak_low = None
        self.confirmed_uptrend_candidate_low_bar_index = None
        self.confirmed_uptrend_candidate_low_low = None
        self.confirmed_uptrend_candidate_low_high = None
        self.in_containment = False
        self.containment_ref_bar_index = None
        self.containment_ref_type = None
        self.containment_ref_high = None
        self.containment_ref_low = None
        self.containment_start_bar_index_for_log = None
        self.containment_consecutive_bars_inside = 0
        self.overall_trend_is_up = None
        self.last_confirmed_trend_type = None
        self.last_confirmed_trend_bar_index = None

# --- Helper Functions for Bar Patterns (from trend_analyzer_alt.py) ---
def is_SDB(current_bar: Bar, prev_bar: Bar) -> bool:
  res_l = current_bar.l < prev_bar.l
  res_h = current_bar.h < prev_bar.h
  res_c = current_bar.c < prev_bar.c
  return res_l and res_h and res_c

def is_SUB(current_bar: Bar, prev_bar: Bar) -> bool:
  return (current_bar.l > prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_BRB(current_bar: Bar, prev_bar: Bar) -> bool:
  return (current_bar.l < prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_BeRB(current_bar: Bar, prev_bar: Bar) -> bool:
  return (current_bar.h > prev_bar.h and \
          current_bar.l < prev_bar.l and \
          current_bar.c < prev_bar.c)

def is_your_custom_pds_rule(current_bar: Bar, prev_bar: Bar) -> bool:
    return (current_bar.h <= prev_bar.h and 
            current_bar.c < prev_bar.o)

def is_your_custom_pus_rule(current_bar: Bar, prev_bar: Bar) -> bool:
    return (current_bar.l >= prev_bar.l and
            current_bar.c > prev_bar.o)

def check_custom_cds_confirmation_A(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: List[Bar]) -> bool:
    cond1_orig = current_bar.h > prev_bar.h
    cond2_orig = current_bar.c > prev_bar.c
    cond4_orig = current_bar.l < peak_bar_for_cds.l
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False; break
    found_deep_enough_pullback = False
    if peak_bar_for_cds.index < prev_bar.index + 1:
        start_1based_intermediate = peak_bar_for_cds.index + 1
        end_1based_intermediate = prev_bar.index
        if start_1based_intermediate <= end_1based_intermediate:
             for j_1based_idx in range(start_1based_intermediate, end_1based_intermediate + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar_for_cds.l:
                    found_deep_enough_pullback = True; break
    return found_deep_enough_pullback and cond1_orig and cond2_orig and no_higher_high_intermediate and cond4_orig

def check_custom_cds_confirmation_B(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: List[Bar]) -> bool:
    cond1_orig = current_bar.c > prev_bar.c
    cond2_orig = current_bar.l >= prev_bar.l
    cond3_orig = current_bar.h > peak_bar_for_cds.h
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False; break
    found_deep_enough_pullback = False
    if peak_bar_for_cds.index < prev_bar.index + 1:
        start_1based_intermediate = peak_bar_for_cds.index + 1
        end_1based_intermediate = prev_bar.index
        if start_1based_intermediate <= end_1based_intermediate:
             for j_1based_idx in range(start_1based_intermediate, end_1based_intermediate + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar_for_cds.l:
                    found_deep_enough_pullback = True; break
    return found_deep_enough_pullback and cond1_orig and cond2_orig and cond3_orig and no_higher_high_intermediate

def check_custom_cds_confirmation_F(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: List[Bar]) -> bool:
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False; break
    if not no_higher_high_intermediate: return False
    if not (prev_bar.l < peak_bar_for_cds.l): return False
    if not (current_bar.h > prev_bar.h): return False
    if not (current_bar.c < prev_bar.c): return False
    return current_bar.c < current_bar.o

def check_custom_cds_confirmation_G(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: List[Bar]) -> bool:
    if not is_SUB(current_bar, prev_bar): return False
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False; break
    if not no_higher_high_intermediate: return False
    return prev_bar.l < peak_bar_for_cds.l

def check_custom_cds_confirmation_H(current_bar: Bar, prev_bar_is_peak: Bar) -> bool:
    cond_higher_high = current_bar.h > prev_bar_is_peak.h
    cond_lower_low = current_bar.l < prev_bar_is_peak.l
    cond_closes_stronger = current_bar.c > prev_bar_is_peak.c 
    return cond_higher_high and cond_lower_low and cond_closes_stronger

def is_custom_pds_rule_B(current_bar: Bar, prev_bar: Bar) -> bool:
    return current_bar.h <= prev_bar.h

def is_custom_pus_rule_B(current_bar: Bar, prev_bar: Bar) -> bool:
    return current_bar.l >= prev_bar.l

def check_custom_cus_confirmation_ref36(current_bar: Bar, prev_bar: Bar, pds_candidate_bar: Optional[Bar]) -> bool:
    if pds_candidate_bar is None:
        return False
    original_cond_low_undercut = current_bar.l < pds_candidate_bar.l
    original_cond_high_respect = current_bar.h <= pds_candidate_bar.h
    # TAA's REF36 used current_bar.c > prev_bar.c. Our prev_bar IS TAA's prev_bar.
    new_cond_closes_stronger = current_bar.c > prev_bar.c
    return original_cond_low_undercut and original_cond_high_respect and new_cond_closes_stronger

def check_custom_cus_confirmation_HHLL(current_bar: Bar, prev_bar: Bar) -> bool:
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o
    return cond1_higher_high and cond2_lower_low and cond3_down_close

def check_custom_cus_EngulfingUp(current_bar: Bar, prev_bar: Bar, initial_pds_candidate_bar_obj_for_context: Optional[Bar]) -> bool:
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l 
    cond3_closes_higher_than_prev_close = current_bar.c > prev_bar.c
    cond4_up_bar = current_bar.c > current_bar.o
    cond5_break_pds_low = False
    if initial_pds_candidate_bar_obj_for_context is not None:
        cond5_break_pds_low = current_bar.l < initial_pds_candidate_bar_obj_for_context.l
    return cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low

def find_intervening_bar(all_bars: List[Bar], start_bar_idx_1based: int, end_bar_idx_1based: int, find_lowest_low: bool = True) -> Optional[Bar]:
    start_0idx = start_bar_idx_1based - 1
    end_0idx = end_bar_idx_1based - 1
    search_start_0idx = start_0idx + 1 
    search_end_0idx = end_0idx - 1
    if search_start_0idx > search_end_0idx or search_start_0idx < 0 or search_end_0idx >= len(all_bars): return None # Added bounds check
    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice: return None
    return min(relevant_slice, key=lambda bar: bar.l) if find_lowest_low else max(relevant_slice, key=lambda bar: bar.h)

def get_unique_sorted_event_descriptions(descriptions: List[str]) -> List[str]:
    return sorted(list(set(descriptions)))

# --- START OF NEW HELPER METHODS FOR CUS/CDS REFACTORING ---

def _evaluate_cus_cds_trigger_conditions(
    current_bar: Bar, 
    prev_bar: Bar, 
    state: State, 
    all_bars: List[Bar]
) -> Tuple[Optional[str], Optional[Bar], Optional[str], Optional[Bar]]:
    \"\"\"
    Evaluates if CUS or CDS conditions are met, returning the rule type and candidate bar if so.
    This function SHOULD NOT modify the state or create signals.
    It returns (cus_trigger_rule, initial_pus_candidate_bar_obj, cds_trigger_rule, initial_pds_candidate_bar_obj).
    Each rule can be None or a string like "CUS_REF36", "CDS_A", etc.
    Candidate bars are the bars that would be confirmed as PUS/PDS.
    \"\"\"
    cus_trigger_rule: Optional[str] = None
    cds_trigger_rule: Optional[str] = None

    # Determine PUS Candidate (bar to be confirmed as CUS)
    initial_pus_candidate_idx = state.confirmed_uptrend_candidate_low_bar_index
    initial_pus_candidate_bar_obj = all_bars[initial_pus_candidate_idx - 1] if initial_pus_candidate_idx and 0 < initial_pus_candidate_idx <= len(all_bars) else None

    # Determine PDS Candidate (bar to be confirmed as CDS)
    initial_pds_candidate_idx = state.confirmed_downtrend_candidate_peak_bar_index
    initial_pds_candidate_bar_obj = all_bars[initial_pds_candidate_idx - 1] if initial_pds_candidate_idx and 0 < initial_pds_candidate_idx <= len(all_bars) else None

    # --- CUS CONDITION CHECKS ---
    if initial_pus_candidate_bar_obj and prev_bar and current_bar.index > initial_pus_candidate_bar_obj.index: # current_bar must be after PUS candidate
        # Context for SDB CUS invalidation and REF36 CUS
        pds_context_bar_for_cus = initial_pds_candidate_bar_obj # Primary: current confirmed PDS peak
        if not pds_context_bar_for_cus and state.potential_downtrend_signal_bar_index: # Fallback: potential PDS peak
            if 0 < state.potential_downtrend_signal_bar_index <= len(all_bars):
                 pds_context_bar_for_cus = all_bars[state.potential_downtrend_signal_bar_index - 1]
        
        sdb_triggers_cus = is_SDB(current_bar, prev_bar)
        sdb_cus_valid_context = True
        if sdb_triggers_cus and pds_context_bar_for_cus and current_bar.l < pds_context_bar_for_cus.l:
            sdb_cus_valid_context = False
        
        if sdb_triggers_cus and sdb_cus_valid_context: 
            cus_trigger_rule = "CUS_SDB"
        elif check_custom_cus_confirmation_ref36(current_bar, prev_bar, pds_context_bar_for_cus): # Pass pds_context_bar_for_cus
            cus_trigger_rule = "CUS_REF36"
        elif check_custom_cus_confirmation_HHLL(current_bar, prev_bar):
            cus_trigger_rule = "CUS_HHLL"
        elif check_custom_cus_EngulfingUp(current_bar, prev_bar, pds_context_bar_for_cus): # Pass pds_context_bar_for_cus
            cus_trigger_rule = "CUS_EngulfingUp"

    # --- CDS CONDITION CHECKS ---
    if initial_pds_candidate_bar_obj and prev_bar and current_bar.index > initial_pds_candidate_bar_obj.index: # current_bar must be after PDS candidate
        no_higher_high_for_brb_path = True
        if initial_pds_candidate_bar_obj.index < prev_bar.index: # Check bars between PDS candidate and prev_bar
            for j_1based_idx in range(initial_pds_candidate_bar_obj.index + 1, prev_bar.index + 1):
                if all_bars[j_1based_idx - 1].h > initial_pds_candidate_bar_obj.h:
                    no_higher_high_for_brb_path = False; break
        
        if is_BRB(current_bar, prev_bar) and no_higher_high_for_brb_path and current_bar.l < initial_pds_candidate_bar_obj.o:
            cds_trigger_rule = "CDS_BRB_vs_PDSOpen"
        elif check_custom_cds_confirmation_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
            cds_trigger_rule = "CDS_A"
        elif check_custom_cds_confirmation_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
            cds_trigger_rule = "CDS_B"
        elif check_custom_cds_confirmation_F(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
            cds_trigger_rule = "CDS_F"
        elif check_custom_cds_confirmation_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
            cds_trigger_rule = "CDS_G"
        # H rule needs prev_bar to be the PDS peak
        elif initial_pds_candidate_bar_obj == prev_bar and check_custom_cds_confirmation_H(current_bar, prev_bar):
            cds_trigger_rule = "CDS_H"
            
    return cus_trigger_rule, initial_pus_candidate_bar_obj, cds_trigger_rule, initial_pds_candidate_bar_obj

def _apply_cus_confirmation_and_consequences(
    cus_rule: str,
    cus_confirmed_on_bar_obj: Bar, 
    triggering_bar: Bar, 
    state: State,
    all_bars: List[Bar],
    signals_found_final: List[Dict[str, Any]],
    contract_id: str, 
    timeframe_str: str
) -> List[str]: 
    \"\"\"
    Applies CUS confirmation, updates state, generates signal, and handles forced trends/consequential PDS.
    Returns a list of event descriptions for logging.
    \"\"\"
    event_descriptions_for_this_action: List[str] = []
    
    # 1. Forced Alternation Logic (Downtrend forced by CUS)
    if state.last_confirmed_trend_type == 'uptrend' and state.last_confirmed_trend_bar_index and \
       cus_confirmed_on_bar_obj.index > state.last_confirmed_trend_bar_index:
        # Find highest high bar between last CUS and current PUS (cus_confirmed_on_bar_obj)
        forced_dt_bar = find_intervening_bar(all_bars, state.last_confirmed_trend_bar_index, cus_confirmed_on_bar_obj.index, find_lowest_low=False)
        if forced_dt_bar:
            event_descriptions_for_this_action.append(f"Downtrend Start Confirmed for Bar {forced_dt_bar.index} ({forced_dt_bar.timestamp.date()}) # FORCED by CUS_{cus_rule} @ {cus_confirmed_on_bar_obj.index}")
            signals_found_final.append(_create_signal_dict(forced_dt_bar, contract_id, timeframe_str, "downtrend_start", triggering_bar.index, f"ForcedDT_ByCUS_{cus_rule}"))
            # Note: TAA doesn't change overall_trend_is_up here, primary CUS/CDS does.
            # It does update its internal 'last confirmed trend' for alternation checks.
            # We reflect this by adding the signal; the main CUS will set the new primary trend.

    # 2. Create the CUS signal
    event_descriptions_for_this_action.append(f"Uptrend Start Confirmed for Bar {cus_confirmed_on_bar_obj.index} ({cus_confirmed_on_bar_obj.timestamp.date()}) by CUS_{cus_rule}")
    signals_found_final.append(_create_signal_dict(cus_confirmed_on_bar_obj, contract_id, timeframe_str, "uptrend_start", triggering_bar.index, f"CUS_{cus_rule}"))
    
    # 3. Update core state for CUS
    state.overall_trend_is_up = True # CUS always sets overall trend to up
    state.last_confirmed_trend_type = 'uptrend'
    state.last_confirmed_trend_bar_index = cus_confirmed_on_bar_obj.index # PUS bar is the new trend start
    
    # 4. Reset PUS candidate states (as it's now confirmed)
    state.potential_uptrend_signal_bar_index = None
    state.potential_uptrend_anchor_low = None
    state.confirmed_uptrend_candidate_low_bar_index = None
    state.confirmed_uptrend_candidate_low_low = None
    state.confirmed_uptrend_candidate_low_high = None

    # 5. Consequential PDS logic (derived from TAA structure)
    made_consequential_pds = False
    # 5a. PDS on CUS bar itself, if triggered by `triggering_bar`
    is_pds_on_cus_bar_by_trigger = (
        is_SDB(triggering_bar, cus_confirmed_on_bar_obj) or \
        is_your_custom_pds_rule(triggering_bar, cus_confirmed_on_bar_obj) or \
        is_custom_pds_rule_B(triggering_bar, cus_confirmed_on_bar_obj)
    )
    if is_pds_on_cus_bar_by_trigger:
        # Condition: new PDS must be higher than existing PDS candidate, or no PDS candidate exists
        can_set_pds_on_cus_bar = (
            state.confirmed_downtrend_candidate_peak_bar_index is None or \
            cus_confirmed_on_bar_obj.h > state.confirmed_downtrend_candidate_peak_high
        )
        if can_set_pds_on_cus_bar:
            event_descriptions_for_this_action.append(f"Potential Downtrend Signal on CUS Bar {cus_confirmed_on_bar_obj.index} (due to trigger by {triggering_bar.index})")
            state.potential_downtrend_signal_bar_index = cus_confirmed_on_bar_obj.index
            state.potential_downtrend_anchor_high = cus_confirmed_on_bar_obj.h
            state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_on_bar_obj.index
            state.confirmed_downtrend_candidate_peak_high = cus_confirmed_on_bar_obj.h
            state.confirmed_downtrend_candidate_peak_low = cus_confirmed_on_bar_obj.l
            made_consequential_pds = True
    
    # 5b. PDS based on CUS rule type (if not already made by 5a)
    if not made_consequential_pds:
        if cus_rule == "CUS_HHLL": # PDS on `triggering_bar`
            event_descriptions_for_this_action.append(f"Potential Downtrend Signal on Bar {triggering_bar.index} ({triggering_bar.timestamp.date()}) from CUS Rule HHLL")
            state.potential_downtrend_signal_bar_index = triggering_bar.index
            state.potential_downtrend_anchor_high = triggering_bar.h
            state.confirmed_downtrend_candidate_peak_bar_index = triggering_bar.index
            state.confirmed_downtrend_candidate_peak_high = triggering_bar.h
            state.confirmed_downtrend_candidate_peak_low = triggering_bar.l
        elif cus_rule != "CUS_EngulfingUp": # Fallback: PDS on `cus_confirmed_on_bar_obj` for SDB, REF36
            can_fallback_pds_on_cus_bar = (
                state.confirmed_downtrend_candidate_peak_bar_index is None or \
                cus_confirmed_on_bar_obj.h > state.confirmed_downtrend_candidate_peak_high
            )
            if can_fallback_pds_on_cus_bar:
                event_descriptions_for_this_action.append(f"Potential Downtrend Signal on CUS Bar {cus_confirmed_on_bar_obj.index} ({cus_confirmed_on_bar_obj.timestamp.date()}) from CUS Rule {cus_rule} (fallback)")
                state.potential_downtrend_signal_bar_index = cus_confirmed_on_bar_obj.index
                state.potential_downtrend_anchor_high = cus_confirmed_on_bar_obj.h
                state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_on_bar_obj.index
                state.confirmed_downtrend_candidate_peak_high = cus_confirmed_on_bar_obj.h
                state.confirmed_downtrend_candidate_peak_low = cus_confirmed_on_bar_obj.l
    
    return event_descriptions_for_this_action

def _apply_cds_confirmation_and_consequences(
    cds_rule: str,
    cds_confirmed_on_bar_obj: Bar, 
    triggering_bar: Bar, 
    prev_bar_of_trigger: Bar, # This is prev_bar relative to triggering_bar (current_bar)
    state: State,
    all_bars: List[Bar],
    signals_found_final: List[Dict[str, Any]],
    cus_confirmed_in_same_iteration: bool, # To manage overall_trend_is_up correctly
    contract_id: str, 
    timeframe_str: str
) -> List[str]: 
    \"\"\"
    Applies CDS confirmation, updates state, generates signal, and handles forced trends/consequential PUS.
    Returns a list of event descriptions for logging.
    \"\"\"
    event_descriptions_for_this_action: List[str] = []

    # 1. Forced Alternation Logic (Uptrend forced by CDS)
    if state.last_confirmed_trend_type == 'downtrend' and state.last_confirmed_trend_bar_index and \
       cds_confirmed_on_bar_obj.index > state.last_confirmed_trend_bar_index:
        # Find lowest low bar between last CDS and current PDS (cds_confirmed_on_bar_obj)
        forced_ut_bar = find_intervening_bar(all_bars, state.last_confirmed_trend_bar_index, cds_confirmed_on_bar_obj.index, find_lowest_low=True)
        if forced_ut_bar:
            event_descriptions_for_this_action.append(f"Uptrend Start Confirmed for Bar {forced_ut_bar.index} ({forced_ut_bar.timestamp.date()}) # FORCED by CDS_{cds_rule} @ {cds_confirmed_on_bar_obj.index}")
            signals_found_final.append(_create_signal_dict(forced_ut_bar, contract_id, timeframe_str, "uptrend_start", triggering_bar.index, f"ForcedUT_ByCDS_{cds_rule}"))

    # 2. Create the CDS signal
    event_descriptions_for_this_action.append(f"Downtrend Start Confirmed for Bar {cds_confirmed_on_bar_obj.index} ({cds_confirmed_on_bar_obj.timestamp.date()}) by CDS_{cds_rule}")
    signals_found_final.append(_create_signal_dict(cds_confirmed_on_bar_obj, contract_id, timeframe_str, "downtrend_start", triggering_bar.index, f"CDS_{cds_rule}"))
    
    # 3. Update core state for CDS
    if not cus_confirmed_in_same_iteration: # CUS has priority for overall_trend_is_up
        state.overall_trend_is_up = False
    # CDS always sets its own last_confirmed_trend type/index for its alternation check context
    state.last_confirmed_trend_type = 'downtrend'
    state.last_confirmed_trend_bar_index = cds_confirmed_on_bar_obj.index # PDS bar is the new trend start

    # 4. Reset PDS candidate states (as it's now confirmed), unless CDS_H which sets PDS on triggering_bar
    if not (cds_rule == "CDS_H" and state.confirmed_downtrend_candidate_peak_bar_index == triggering_bar.index and cds_confirmed_on_bar_obj == triggering_bar): # cds_confirmed_on_bar_obj is prev_bar in H case
        # If PDS was on the cds_confirmed_on_bar_obj, clear it
        if state.potential_downtrend_signal_bar_index == cds_confirmed_on_bar_obj.index:
            state.potential_downtrend_signal_bar_index = None; state.potential_downtrend_anchor_high = None
        if state.confirmed_downtrend_candidate_peak_bar_index == cds_confirmed_on_bar_obj.index:
            state.confirmed_downtrend_candidate_peak_bar_index = None; state.confirmed_downtrend_candidate_peak_high = None; state.confirmed_downtrend_candidate_peak_low = None
            
    # 5. Clear PUS candidate if it was at or before the confirmed CDS bar (PDS bar)
    if state.confirmed_uptrend_candidate_low_bar_index and state.confirmed_uptrend_candidate_low_bar_index <= cds_confirmed_on_bar_obj.index:
        state.potential_uptrend_signal_bar_index = None; state.potential_uptrend_anchor_low = None
        state.confirmed_uptrend_candidate_low_bar_index = None; state.confirmed_uptrend_candidate_low_low = None; state.confirmed_uptrend_candidate_low_high = None

    # 6. Consequential PUS logic
    if cds_rule == "CDS_BRB_vs_PDSOpen": # PUS on triggering_bar (current_bar in original context)
        chosen_pus_bar = triggering_bar
        # If existing PUS candidate is lower, keep it (TAA rule)
        condition_keep_existing_pus = (
            state.confirmed_uptrend_candidate_low_bar_index and 
            state.confirmed_uptrend_candidate_low_low is not None and \
            all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1].l < chosen_pus_bar.l
        )
        if condition_keep_existing_pus:
             chosen_pus_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1]
        
        event_descriptions_for_this_action.append(f"Potential Uptrend Signal on Bar {chosen_pus_bar.index} ({chosen_pus_bar.timestamp.date()}) from CDS Rule BRB_vs_PDSOpen")
        state.potential_uptrend_signal_bar_index = chosen_pus_bar.index
        state.potential_uptrend_anchor_low = chosen_pus_bar.l
        state.confirmed_uptrend_candidate_low_bar_index = chosen_pus_bar.index
        state.confirmed_uptrend_candidate_low_low = chosen_pus_bar.l
        state.confirmed_uptrend_candidate_low_high = chosen_pus_bar.h
    elif cds_rule in ["CDS_A", "CDS_B", "CDS_F"]:
        pus_cand_for_consequence = None
        # Check existing confirmed PUS
        if state.confirmed_uptrend_candidate_low_bar_index and 0 < state.confirmed_uptrend_candidate_low_bar_index <= len(all_bars):
            pus_cand_for_consequence = all_bars[state.confirmed_uptrend_candidate_low_bar_index-1]
        
        # Check intervening low between PDS bar (cds_confirmed_on_bar_obj) and triggering_bar
        intervening_low_bar = None
        if cds_confirmed_on_bar_obj.index < triggering_bar.index:
             intervening_low_bar = find_intervening_bar(all_bars, cds_confirmed_on_bar_obj.index, triggering_bar.index, find_lowest_low=True)

        if intervening_low_bar:
            if pus_cand_for_consequence is None or intervening_low_bar.l < pus_cand_for_consequence.l:
                pus_cand_for_consequence = intervening_low_bar
        
        if pus_cand_for_consequence:
            event_descriptions_for_this_action.append(f"Potential Uptrend Signal on Bar {pus_cand_for_consequence.index} ({pus_cand_for_consequence.timestamp.date()}) from CDS Rule {cds_rule}")
            state.potential_uptrend_signal_bar_index = pus_cand_for_consequence.index
            state.potential_uptrend_anchor_low = pus_cand_for_consequence.l
            state.confirmed_uptrend_candidate_low_bar_index = pus_cand_for_consequence.index
            state.confirmed_uptrend_candidate_low_low = pus_cand_for_consequence.l
            state.confirmed_uptrend_candidate_low_high = pus_cand_for_consequence.h
    elif cds_rule == "CDS_G" and prev_bar_of_trigger: # PUS on prev_bar_of_trigger
        if state.confirmed_uptrend_candidate_low_bar_index is None or prev_bar_of_trigger.l < state.confirmed_uptrend_candidate_low_low:
            event_descriptions_for_this_action.append(f"Potential Uptrend Signal on Bar {prev_bar_of_trigger.index} ({prev_bar_of_trigger.timestamp.date()}) from CDS Rule G")
            state.potential_uptrend_signal_bar_index = prev_bar_of_trigger.index
            state.potential_uptrend_anchor_low = prev_bar_of_trigger.l
            state.confirmed_uptrend_candidate_low_bar_index = prev_bar_of_trigger.index
            state.confirmed_uptrend_candidate_low_low = prev_bar_of_trigger.l
            state.confirmed_uptrend_candidate_low_high = prev_bar_of_trigger.h
    elif cds_rule == "CDS_H": # PUS and PDS on triggering_bar
        # PUS on triggering_bar
        event_descriptions_for_this_action.append(f"Potential Uptrend Signal on Bar {triggering_bar.index} ({triggering_bar.timestamp.date()}) from CDS Rule H")
        state.potential_uptrend_signal_bar_index = triggering_bar.index
        state.potential_uptrend_anchor_low = triggering_bar.l
        state.confirmed_uptrend_candidate_low_bar_index = triggering_bar.index
        state.confirmed_uptrend_candidate_low_low = triggering_bar.l
        state.confirmed_uptrend_candidate_low_high = triggering_bar.h
        # PDS also on triggering_bar
        event_descriptions_for_this_action.append(f"Potential Downtrend Signal on Bar {triggering_bar.index} ({triggering_bar.timestamp.date()}) from CDS Rule H")
        state.potential_downtrend_signal_bar_index = triggering_bar.index
        state.potential_downtrend_anchor_high = triggering_bar.h
        # This PDS set by CDS_H should persist
        state.confirmed_downtrend_candidate_peak_bar_index = triggering_bar.index 
        state.confirmed_downtrend_candidate_peak_high = triggering_bar.h
        state.confirmed_downtrend_candidate_peak_low = triggering_bar.l
            
    return event_descriptions_for_this_action

# --- END OF NEW HELPER METHODS ---

def _format_debug_log_entry(
    current_bar_for_log_ts_idx: Bar, 
    state: State, 
    event_descriptions: List[str], 
    log_prefix_for_event_ts: str = "BAR_PROCESS_STATE"
) -> Dict[str, Any]:
    final_log_msg = "; ".join(get_unique_sorted_event_descriptions(event_descriptions)) if event_descriptions else "Neutral"
    return {
        "event_timestamp": datetime.datetime.now(timezone.utc).isoformat(), 
        "event_type": log_prefix_for_event_ts, 
        "message": final_log_msg,
        "processing_bar_timestamp": current_bar_for_log_ts_idx.timestamp.isoformat(), 
        "processing_bar_index": current_bar_for_log_ts_idx.index,
        "processing_bar_ohlc": f"O:{current_bar_for_log_ts_idx.o},H:{current_bar_for_log_ts_idx.h},L:{current_bar_for_log_ts_idx.l},C:{current_bar_for_log_ts_idx.c}",
        "pds_potential_idx": state.potential_downtrend_signal_bar_index, "pds_anchor_h": state.potential_downtrend_anchor_high,
        "pds_candidate_idx": state.confirmed_downtrend_candidate_peak_bar_index, "pds_candidate_h": state.confirmed_downtrend_candidate_peak_high, "pds_candidate_l": state.confirmed_downtrend_candidate_peak_low,
        "pus_potential_idx": state.potential_uptrend_signal_bar_index, "pus_anchor_l": state.potential_uptrend_anchor_low,
        "pus_candidate_idx": state.confirmed_uptrend_candidate_low_bar_index, "pus_candidate_l": state.confirmed_uptrend_candidate_low_low, "pus_candidate_h": state.confirmed_uptrend_candidate_low_high,
        "in_containment": state.in_containment, "containment_ref_idx": state.containment_ref_bar_index, "containment_ref_type": state.containment_ref_type,
        "last_trend_type": state.last_confirmed_trend_type, "last_trend_idx": state.last_confirmed_trend_bar_index, "overall_trend_up": state.overall_trend_is_up
    }

def _create_signal_dict(
    bar_obj: Bar, contract_id: str, timeframe_str: str, signal_type: str,
    triggering_bar_index: int, rule_type: str
) -> Dict[str, Any]:
    return {
        'timestamp': bar_obj.timestamp, 'contract_id': contract_id, 'timeframe': timeframe_str,
        'signal_type': signal_type, 'signal_price': bar_obj.c,
        'signal_open': bar_obj.o, 'signal_high': bar_obj.h, 'signal_low': bar_obj.l,
        'signal_close': bar_obj.c, 'signal_volume': bar_obj.volume,
        'details': {
            "confirmed_signal_bar_index": bar_obj.index,
            "triggering_bar_index": triggering_bar_index,
            "rule_type": rule_type
        }
    }

def generate_trend_starts(
    bars_df: pd.DataFrame, contract_id: str, timeframe_str: str,
    config: Optional[Dict[str, Any]] = None, debug: bool = False # debug param not used by TAA core logic
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    
    log_prefix = f"[generate_trend_starts][{contract_id}][{timeframe_str}]"
    signals_found_final: List[Dict[str, Any]] = []
    debug_log_entries: List[Dict[str, Any]] = []

    if bars_df.empty or len(bars_df) < MIN_BARS_FOR_TREND_START:
        logger.info(f"{log_prefix} Not enough bars ({len(bars_df)}). Min: {MIN_BARS_FOR_TREND_START}.")
        return [], []

    all_bars: List[Bar] = []
    for i, row_tuple in enumerate(bars_df.itertuples(index=False)):
        # Assuming 'timestamp' is a column name in bars_df and is already datetime object
        # If 'timestamp' is string, convert: pd.to_datetime(row_tuple.timestamp)
        bar_ts = row_tuple.timestamp
        if not isinstance(bar_ts, datetime.datetime): # Ensure it's datetime
             bar_ts = pd.to_datetime(bar_ts).to_pydatetime() # Convert if it's pandas Timestamp or string
        if bar_ts.tzinfo is None: # Ensure timezone aware (UTC)
            bar_ts = bar_ts.replace(tzinfo=timezone.utc)
        
        all_bars.append(Bar(
            timestamp=bar_ts,
            o=float(row_tuple.open), h=float(row_tuple.high), 
            l=float(row_tuple.low), c=float(row_tuple.close),
            volume=float(row_tuple.volume) if hasattr(row_tuple, 'volume') and row_tuple.volume is not None else 0.0,
            index=i + 1 # 1-based chronological index
        ))

    if not all_bars: return [], []
    state = State()

    # --- Process first bar (k=0 equivalent from TAA) ---
    # TAA's process_trend_logic effectively starts evaluation from the second bar (k=1),
    # using all_bars[k] (current) and all_bars[k-1] (prev).
    # The very first bar (all_bars[0]) in TAA's loop just gets "Nothing" logged.
    # No PDS/PUS/CUS/CDS can form with only one bar.
    # Our previous version had special handling for bar 0 vs bar 1. TAA does not.
    # It implies first actual PDS/PUS can only be on bar 1 (triggered by bar 2) or bar 2 (PDS Rule C).

    first_bar_obj = all_bars[0]
    debug_log_entries.append(_format_debug_log_entry(first_bar_obj, state, ["Initial Bar (TAA: Nothing)"], "BAR_PROCESS_STATE_TAA_EQUIV"))


    # --- Main Loop (equivalent to k=1 onwards in TAA) ---
    for k in range(1, len(all_bars)):
        current_bar = all_bars[k]
        prev_bar = all_bars[k-1] # Exists because k starts at 1
        current_bar_event_descriptions: List[str] = []
        
        cus_confirmed_this_iteration = False
        cds_confirmed_this_iteration = False
        
        # Evaluate potential CUS/CDS based on current state and bars
        # This function now also returns the candidate PUS/PDS bars
        cus_trigger_rule, pus_candidate_for_cus, cds_trigger_rule, pds_candidate_for_cds = \
            _evaluate_cus_cds_trigger_conditions(current_bar, prev_bar, state, all_bars)

        # --- Containment Logic (from TAA) ---
        # Determine containment reference based on state *before* current bar's CUS/CDS processing
        containment_ref_pds_bar = all_bars[state.confirmed_downtrend_candidate_peak_bar_index - 1] if state.confirmed_downtrend_candidate_peak_bar_index else None
        containment_ref_pus_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1] if state.confirmed_uptrend_candidate_low_bar_index else None
        
        if state.in_containment:
            if current_bar.index == state.containment_start_bar_index_for_log: pass 
            elif current_bar.h <= state.containment_ref_high and current_bar.l >= state.containment_ref_low:
                state.containment_consecutive_bars_inside += 1
                current_bar_event_descriptions.append(f"Containment: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} ({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low}) for {state.containment_consecutive_bars_inside} bars.")
            else: 
                break_type = "moves outside"; 
                if current_bar.c > state.containment_ref_high: break_type = "BREAKOUT above"
                elif current_bar.c < state.containment_ref_low: break_type = "BREAKDOWN below"
                current_bar_event_descriptions.append(f"Containment ENDED: Bar {current_bar.index} {break_type} Bar {state.containment_ref_bar_index} range (was {state.containment_consecutive_bars_inside} bar(s) inside).")
                state.in_containment = False; state.containment_ref_bar_index = None; state.containment_ref_type = None
                state.containment_ref_high = None; state.containment_ref_low = None; state.containment_start_bar_index_for_log = None
                state.containment_consecutive_bars_inside = 0
        
        if not state.in_containment: 
            chosen_candidate_ref_bar = containment_ref_pds_bar if containment_ref_pds_bar else containment_ref_pus_bar
            ref_type_for_log = "PDS_PEAK" if containment_ref_pds_bar else ("PUS_LOW" if containment_ref_pus_bar else None)
            
            if chosen_candidate_ref_bar and chosen_candidate_ref_bar.index != current_bar.index and ref_type_for_log:
                if current_bar.h <= chosen_candidate_ref_bar.h and current_bar.l >= chosen_candidate_ref_bar.l:
                    state.in_containment = True; state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                    state.containment_ref_type = ref_type_for_log; state.containment_ref_high = chosen_candidate_ref_bar.h
                    state.containment_ref_low = chosen_candidate_ref_bar.l; state.containment_start_bar_index_for_log = current_bar.index
                    state.containment_consecutive_bars_inside = 1 
                    current_bar_event_descriptions.append(f"Containment START: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} ({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low}).")
        
        # --- Apply CUS Confirmation (Priority 1) ---
        if cus_trigger_rule and pus_candidate_for_cus:
            cus_event_descriptions = _apply_cus_confirmation_and_consequences(
                cus_rule=cus_trigger_rule,
                cus_confirmed_on_bar_obj=pus_candidate_for_cus,
                triggering_bar=current_bar,
                state=state,
                all_bars=all_bars,
                signals_found_final=signals_found_final,
                contract_id=contract_id,
                timeframe_str=timeframe_str
            )
            current_bar_event_descriptions.extend(cus_event_descriptions)
            cus_confirmed_this_iteration = True # Mark that CUS was confirmed

        # --- Apply CDS Confirmation (Processed independently of CUS) ---
        if cds_trigger_rule and pds_candidate_for_cds:
            cds_event_descriptions = _apply_cds_confirmation_and_consequences(
                cds_rule=cds_trigger_rule,
                cds_confirmed_on_bar_obj=pds_candidate_for_cds,
                triggering_bar=current_bar,
                prev_bar_of_trigger=prev_bar,
                state=state,
                all_bars=all_bars,
                signals_found_final=signals_found_final,
                cus_confirmed_in_same_iteration=cus_confirmed_this_iteration, # Pass CUS status
                contract_id=contract_id,
                timeframe_str=timeframe_str
            )
            current_bar_event_descriptions.extend(cds_event_descriptions)
            cds_confirmed_this_iteration = True # Mark that CDS was confirmed
        
        # --- PDS Rule C on current bar (Failed Rally PDS) ---
        pds_rule_c_confirmed_this_bar = False
        if current_bar.h > prev_bar.h and current_bar.c < current_bar.o:
            current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.timestamp.date()}) by Rule C")
            state.potential_downtrend_signal_bar_index = current_bar.index
            state.potential_downtrend_anchor_high = current_bar.h
            state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
            state.confirmed_downtrend_candidate_peak_high = current_bar.h
            state.confirmed_downtrend_candidate_peak_low = current_bar.l
            pds_rule_c_confirmed_this_bar = True
            
            if state.potential_uptrend_signal_bar_index == current_bar.index:
                state.potential_uptrend_signal_bar_index = None; state.potential_uptrend_anchor_low = None
            if state.confirmed_uptrend_candidate_low_bar_index == current_bar.index:
                state.confirmed_uptrend_candidate_low_bar_index = None; state.confirmed_uptrend_candidate_low_low = None; state.confirmed_uptrend_candidate_low_high = None
        
        # --- PDS on previous bar ---
        if not cds_confirmed_this_iteration and not pds_rule_c_confirmed_this_bar:
            pds_rules_hit_on_prev = is_SDB(current_bar, prev_bar) or \
                                    is_your_custom_pds_rule(current_bar, prev_bar) or \
                                    is_custom_pds_rule_B(current_bar, prev_bar)
            if pds_rules_hit_on_prev:
                is_new_or_higher_pds_candidate = False
                if state.confirmed_downtrend_candidate_peak_bar_index is None:
                    is_new_or_higher_pds_candidate = True
                elif prev_bar.index > state.confirmed_downtrend_candidate_peak_bar_index: # Later bar
                     if prev_bar.h > state.confirmed_downtrend_candidate_peak_high : is_new_or_higher_pds_candidate = True
                elif prev_bar.index == state.confirmed_downtrend_candidate_peak_bar_index : # Same bar, higher high
                     if prev_bar.h > state.confirmed_downtrend_candidate_peak_high : is_new_or_higher_pds_candidate = True
                # else: prev_bar.index < state.confirmed_downtrend_candidate_peak_bar_index (earlier bar, always new candidate)
                # This condition means: if no confirmed PDS, or if prev_bar makes a higher peak than current PDS candidate peak
                # Or, if prev_bar is earlier than current PDS candidate (TAA seems to allow replacing with earlier higher peaks)
                # Simplified TAA: if no PDS, or this prev_bar is better (higher high).
                should_update_pds_candidate_on_prev = (
                    state.confirmed_downtrend_candidate_peak_bar_index is None or \
                    prev_bar.h > state.confirmed_downtrend_candidate_peak_high or \
                    (prev_bar.h == state.confirmed_downtrend_candidate_peak_high and prev_bar.index < state.confirmed_downtrend_candidate_peak_bar_index)
                )
                if should_update_pds_candidate_on_prev:
                    current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {prev_bar.index} ({prev_bar.timestamp.date()}) (triggered by {current_bar.index})")
                    state.potential_downtrend_signal_bar_index = prev_bar.index
                    state.potential_downtrend_anchor_high = prev_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                    state.confirmed_downtrend_candidate_peak_high = prev_bar.h
                    state.confirmed_downtrend_candidate_peak_low = prev_bar.l
                    
                    if state.potential_uptrend_signal_bar_index == prev_bar.index:
                        state.potential_uptrend_signal_bar_index = None; state.potential_uptrend_anchor_low = None
                    if state.confirmed_uptrend_candidate_low_bar_index == prev_bar.index:
                        state.confirmed_uptrend_candidate_low_bar_index = None; state.confirmed_uptrend_candidate_low_low = None; state.confirmed_uptrend_candidate_low_high = None
        
        # --- PUS on previous bar ---
        if not cus_confirmed_this_iteration and not pds_rule_c_confirmed_this_bar: 
            pus_rules_hit_on_prev = is_SUB(current_bar, prev_bar) or \
                                    is_your_custom_pus_rule(current_bar, prev_bar) or \
                                    is_custom_pus_rule_B(current_bar, prev_bar)
            if pus_rules_hit_on_prev:
                # TAA always logs potential PUS if rules hit. Confirmation depends on new low.
                current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.timestamp.date()}) (triggered by {current_bar.index})")
                state.potential_uptrend_signal_bar_index = prev_bar.index
                state.potential_uptrend_anchor_low = prev_bar.l
                
                # Update confirmed PUS candidate if prev_bar is a new low or no PUS candidate exists
                # Or if prev_bar is earlier and same low
                should_update_pus_candidate_on_prev = (
                    state.confirmed_uptrend_candidate_low_bar_index is None or \
                    prev_bar.l < state.confirmed_uptrend_candidate_low_low or \
                    (prev_bar.l == state.confirmed_uptrend_candidate_low_low and prev_bar.index < state.confirmed_uptrend_candidate_low_bar_index)
                )
                if should_update_pus_candidate_on_prev:
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = prev_bar.l
                    state.confirmed_uptrend_candidate_low_high = prev_bar.h
                    
                    if state.potential_downtrend_signal_bar_index == prev_bar.index:
                        state.potential_downtrend_signal_bar_index = None; state.potential_downtrend_anchor_high = None
                    if state.confirmed_downtrend_candidate_peak_bar_index == prev_bar.index:
                        state.confirmed_downtrend_candidate_peak_bar_index = None; state.confirmed_downtrend_candidate_peak_high = None; state.confirmed_downtrend_candidate_peak_low = None

        if current_bar_event_descriptions: 
            debug_log_entries.append(_format_debug_log_entry(current_bar, state, current_bar_event_descriptions, "BAR_PROCESS_STATE_REFACTORED"))
        elif k > 0 : 
             debug_log_entries.append(_format_debug_log_entry(current_bar, state, ["Neutral processed bar"], "BAR_PROCESS_STATE_REFACTORED"))

    # Final processing of signals (sorting, deduping)
    signals_found_final.sort(key=lambda s: (s['details']['confirmed_signal_bar_index'], 0 if s['signal_type'] == 'downtrend_start' else 1, s['details']['triggering_bar_index']))
    unique_signals_deduped = []
    seen_keys = set()
    for sig in signals_found_final:
        key = (sig['details']['confirmed_signal_bar_index'], sig['signal_type'])
        if key not in seen_keys:
            seen_keys.add(key)
            unique_signals_deduped.append(sig)
    
    logger.info(f"{log_prefix} Finished. Generated {len(unique_signals_deduped)} unique signals from {len(signals_found_final)} raw signals (TAA logic).")
    return unique_signals_deduped, debug_log_entries

if __name__ == '__main__':
    print(f"trend_start_finder.py (TAA-based) loaded as main.")
    # Minimal test setup if run directly
    # Create a dummy DataFrame
    data = {
        'timestamp': pd.to_datetime(['2023-01-01 10:00:00', '2023-01-01 11:00:00', '2023-01-01 12:00:00', '2023-01-01 13:00:00', '2023-01-01 14:00:00']),
        'open': [100, 101, 102, 103, 104],
        'high': [105, 106, 107, 108, 109],
        'low': [99, 100, 101, 102, 103],
        'close': [101, 102, 103, 104, 105],
        'volume': [1000, 1100, 1200, 1300, 1400]
    }
    sample_df = pd.DataFrame(data)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s')
    
    signals, debug_logs = generate_trend_starts(sample_df, "TEST.CON", "1h")
    print("\n--- Signals ---")
    for s in signals:
        print(s)
    print("\n--- Debug Logs ---")
    for dl_idx, dl in enumerate(debug_logs):
        print(f"Log {dl_idx}: {dl['processing_bar_index']} - {dl['message']}")