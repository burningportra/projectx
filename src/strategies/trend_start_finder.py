import pandas as pd
import datetime # Required for type hinting if not already imported by pandas
import logging # Added for debug logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__) # Initialize logger at module level

MIN_BARS_FOR_TREND_START = 5 # Define the constant

# --- Bar Class (Adapted from trend_analyzer_alt.py) ---
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
        # Use strftime for datetime objects
        ts_str = self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else 'NoTime'
        return (f"Bar(Idx:{self.index}, T:{ts_str}, "
                f"O:{self.o} H:{self.h} L:{self.l} C:{self.c} V:{self.volume})")

# --- State Class (Copied from trend_analyzer_alt.py and adapted) ---
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
        # log_entries is removed, signals will be returned directly

# --- Helper Functions for Bar Patterns (Copied from trend_analyzer_alt.py) ---
def is_SDB(current_bar: Bar, prev_bar: Bar) -> bool:
  res_l = current_bar.l < prev_bar.l
  res_h = current_bar.h < prev_bar.h
  res_c = current_bar.c < prev_bar.c
  
  # --- START SDB DETAILED DEBUG for Bar8 vs Bar7 ---
  # Ensure logger is accessible or passed if this is in a different scope
  # For simplicity, assuming a global logger or one accessible via current_bar context if possible
  # This might require passing the logger or contract_id/timeframe_str for conditional logging
  # For now, let's try a direct log, assuming logger is configured and accessible.
  # try:
  #     logger = logging.getLogger(__name__ + ".is_SDB") # Or a more specific logger name
  #     if current_bar.index == 8 and prev_bar.index == 7: # Hardcoding target bars for debug
  #         logger.info(f"SDB_DEBUG (Bar8 vs Bar7): current_bar={current_bar}, prev_bar={prev_bar}")
  #         logger.info(f"SDB_DEBUG (Bar8 vs Bar7): current_bar.l ({current_bar.l}) < prev_bar.l ({prev_bar.l}) = {res_l}")
  #         logger.info(f"SDB_DEBUG (Bar8 vs Bar7): current_bar.h ({current_bar.h}) < prev_bar.h ({prev_bar.h}) = {res_h}")
  #         logger.info(f"SDB_DEBUG (Bar8 vs Bar7): current_bar.c ({current_bar.c}) < prev_bar.c ({prev_bar.c}) = {res_c}")
  #         logger.info(f"SDB_DEBUG (Bar8 vs Bar7): final_result = {res_l and res_h and res_c}")
  # except Exception as e:
  #     # In case logger isn't set up as expected in this direct context
  #     print(f"SDB_DEBUG_PRINT (Bar8 vs Bar7): current_bar.l ({current_bar.l}) < prev_bar.l ({prev_bar.l}) = {res_l}")
  #     print(f"SDB_DEBUG_PRINT (Bar8 vs Bar7): current_bar.h ({current_bar.h}) < prev_bar.h ({prev_bar.h}) = {res_h}")
  #     print(f"SDB_DEBUG_PRINT (Bar8 vs Bar7): current_bar.c ({current_bar.c}) < prev_bar.c ({prev_bar.c}) = {res_c}")
  #     print(f"SDB_DEBUG_PRINT (Bar8 vs Bar7): final_result = {res_l and res_h and res_c}")
  # --- END SDB DETAILED DEBUG ---
  return res_l and res_h and res_c

def is_SUB(current_bar: Bar, prev_bar: Bar) -> bool:
  return (current_bar.l > prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_BRB(current_bar: Bar, prev_bar: Bar) -> bool: # Bullish Reversal Bar
  return (current_bar.l < prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_BeRB(current_bar: Bar, prev_bar: Bar) -> bool: # Bearish Reversal Bar
  return (current_bar.h > prev_bar.h and \
          current_bar.l < prev_bar.l and \
          current_bar.c < prev_bar.c)

def is_your_custom_pds_rule(current_bar: Bar, prev_bar: Bar) -> bool:
    return (current_bar.h <= prev_bar.h and 
            current_bar.c < prev_bar.o)

def is_your_custom_pus_rule(current_bar: Bar, prev_bar: Bar) -> bool:
    return (current_bar.l >= prev_bar.l and
            current_bar.c > prev_bar.o)

def check_custom_cds_confirmation_A(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: list) -> bool:
    cond1_orig = current_bar.h > prev_bar.h
    cond2_orig = current_bar.c > prev_bar.c
    cond4_orig = current_bar.l < peak_bar_for_cds.l

    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False
                break
    
    found_deep_enough_pullback = False
    if peak_bar_for_cds.index < prev_bar.index + 1:
        start_1based_intermediate = peak_bar_for_cds.index + 1
        end_1based_intermediate = prev_bar.index
        if start_1based_intermediate <= end_1based_intermediate :
             for j_1based_idx in range(start_1based_intermediate, end_1based_intermediate + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar_for_cds.l:
                    found_deep_enough_pullback = True
                    break
    
    return found_deep_enough_pullback and cond1_orig and cond2_orig and no_higher_high_intermediate and cond4_orig

def check_custom_cds_confirmation_B(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: list) -> bool:
    cond1_orig = current_bar.c > prev_bar.c
    cond2_orig = current_bar.l >= prev_bar.l
    cond3_orig = current_bar.h > peak_bar_for_cds.h

    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False
                break
    
    found_deep_enough_pullback = False
    if peak_bar_for_cds.index < prev_bar.index + 1:
        start_1based_intermediate = peak_bar_for_cds.index + 1
        end_1based_intermediate = prev_bar.index
        if start_1based_intermediate <= end_1based_intermediate :
             for j_1based_idx in range(start_1based_intermediate, end_1based_intermediate + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar_for_cds.l:
                    found_deep_enough_pullback = True
                    break
    
    return found_deep_enough_pullback and cond1_orig and cond2_orig and cond3_orig and no_higher_high_intermediate

def check_custom_cds_confirmation_F(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: list) -> bool:
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False
                break
    if not no_higher_high_intermediate: return False
    cond2_prev_low_break = prev_bar.l < peak_bar_for_cds.l
    if not cond2_prev_low_break: return False
    cond3_curr_higher_high_attempt = current_bar.h > prev_bar.h
    if not cond3_curr_higher_high_attempt: return False
    cond4_curr_closes_lower_than_prev = current_bar.c < prev_bar.c
    if not cond4_curr_closes_lower_than_prev: return False
    cond5_curr_down_close = current_bar.c < current_bar.o
    return cond5_curr_down_close

def check_custom_cds_confirmation_G(current_bar: Bar, prev_bar: Bar, peak_bar_for_cds: Bar, all_bars: list) -> bool:
    if not is_SUB(current_bar, prev_bar): return False
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False
                break
    if not no_higher_high_intermediate: return False
    cond2_prev_low_break = prev_bar.l < peak_bar_for_cds.l
    return cond2_prev_low_break

def check_custom_cds_confirmation_H(current_bar: Bar, prev_bar_is_peak: Bar) -> bool:
    cond_higher_high = current_bar.h > prev_bar_is_peak.h
    cond_lower_low = current_bar.l < prev_bar_is_peak.l
    cond_closes_stronger = current_bar.c > prev_bar_is_peak.c 
    return cond_higher_high and cond_lower_low and cond_closes_stronger

def is_custom_pds_rule_B(current_bar: Bar, prev_bar: Bar) -> bool:
    return current_bar.h <= prev_bar.h

def is_custom_pus_rule_B(current_bar: Bar, prev_bar: Bar) -> bool:
    return current_bar.l >= prev_bar.l

def check_custom_cus_confirmation_ref36(current_bar: Bar, prev_bar: Bar, pds_candidate_bar: Bar) -> bool:
    if pds_candidate_bar is None: return False
    original_cond_low_undercut = current_bar.l < pds_candidate_bar.l
    original_cond_high_respect = current_bar.h <= pds_candidate_bar.h
    new_cond_closes_stronger = current_bar.c > prev_bar.c
    return original_cond_low_undercut and original_cond_high_respect and new_cond_closes_stronger

def check_custom_cus_confirmation_HHLL(current_bar: Bar, prev_bar: Bar) -> bool:
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o
    return cond1_higher_high and cond2_lower_low and cond3_down_close

def check_custom_cus_EngulfingUp(current_bar: Bar, prev_bar: Bar, initial_pds_candidate_bar_obj_for_context: Bar) -> bool:
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l 
    cond3_closes_higher_than_prev_close = current_bar.c > prev_bar.c
    cond4_up_bar = current_bar.c > current_bar.o
    cond5_break_pds_low = False
    if initial_pds_candidate_bar_obj_for_context is not None:
        cond5_break_pds_low = current_bar.l < initial_pds_candidate_bar_obj_for_context.l
    return cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low

def find_intervening_bar(all_bars: list, start_bar_idx_1based: int, end_bar_idx_1based: int, find_lowest_low: bool = True) -> Bar:
    start_0idx = start_bar_idx_1based -1
    end_0idx = end_bar_idx_1based -1
    search_start_0idx = start_0idx + 1 
    search_end_0idx = end_0idx - 1
    if search_start_0idx > search_end_0idx: return None
    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice: return None
    if find_lowest_low:
        return min(relevant_slice, key=lambda bar: bar.l)
    else: # find highest_high
        return max(relevant_slice, key=lambda bar: bar.h)

# --- Main Signal Generation Function ---
def generate_trend_starts(
    bars_df: pd.DataFrame,
    contract_id: str,
    timeframe_str: str,
    config: Optional[Dict[str, Any]] = None,
    debug: bool = False
) -> List[Dict[str, Any]]:
    """
    Identifies trend start signals (CUS/CDS) from a DataFrame of OHLC bars.
    Uses the detailed CUS/CDS logic with Potential Uptrend/Downtrend Starts (PUS/PDS)
    and various confirmation rules.
    """
    global logger # Ensure logger is accessible
    # Initialize logger if it hasn't been (e.g., if run standalone for testing)
    if logger is None:
        logger = logging.getLogger(__name__)
        if not logger.hasHandlers(): # Avoid adding multiple handlers if already configured
            logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            logger.info("Logger for trend_start_finder initialized (likely in standalone or test mode).")
    
    log_prefix = f"[generate_trend_starts][{contract_id}][{timeframe_str}]"
    logger.info(f"{log_prefix} Starting trend start generation for {len(bars_df)} bars.")

    signals_found = []
    unique_signals = [] # Initialize unique_signals list
    seen = set()      # Initialize seen set

    if bars_df.empty or len(bars_df) < MIN_BARS_FOR_TREND_START:
        logger.info(f"{log_prefix} Not enough bars ({len(bars_df)}) to process. Minimum required: {MIN_BARS_FOR_TREND_START}.")
        return []

    all_bars = []
    for i, row in enumerate(bars_df.itertuples(index=False)):
        bar = Bar(
            timestamp=row.timestamp, 
            o=float(row.open), # Ensure float
            h=float(row.high),
            l=float(row.low),
            c=float(row.close),
            volume=float(row.volume) if hasattr(row, 'volume') and row.volume is not None else 0.0,
            index=i + 1 # Assign 1-based index based on DataFrame order
        )
        all_bars.append(bar)

    if not all_bars: # Should be redundant due to bars_df.empty check, but safe
        return []

    state = State()

    # --- Rule Name Mappings (Systematic for signal details) ---
    CUS_RULES_MAP = {
        "SDB": "CUS_ConfirmedBy_SDB_Trigger",
        "REF36": "CUS_ConfirmedBy_Ref36_PDS_Undercut_Trigger",
        "HHLL": "CUS_ConfirmedBy_HHLL_DownBar_Trigger",
        "EngulfingUp": "CUS_ConfirmedBy_EngulfingUp_PDSBreak_Trigger"
    }
    CDS_RULES_MAP = {
        "BRB_vs_PDSOpen": "CDS_ConfirmedBy_BRB_vs_PDSOpen_Trigger",
        "A": "CDS_ConfirmedBy_RuleA_PDSLowBreak_Trigger",
        "B": "CDS_ConfirmedBy_RuleB_PDSHighBreak_Thrust_Trigger",
        "F": "CDS_ConfirmedBy_RuleF_PDSLowBreak_FailedHigh_Trigger",
        "G": "CDS_ConfirmedBy_RuleG_SUB_PostPDSLowBreak_Trigger",
        "H": "CDS_ConfirmedBy_RuleH_HHLL_vs_PDS_Trigger"
    }

    # --- Friendly Rule Name Mappings (For logging) ---
    CUS_FRIENDLY_NAMES = {
        "CUS_ConfirmedBy_SDB_Trigger": "Strong Down Bar",
        "CUS_ConfirmedBy_Ref36_PDS_Undercut_Trigger": "Potential Downtrend Start Low Undercut (Ref36)",
        "CUS_ConfirmedBy_HHLL_DownBar_Trigger": "HigherHigh-LowerLow Bar",
        "CUS_ConfirmedBy_EngulfingUp_PDSBreak_Trigger": "Engulfing Up Bar & Potential Downtrend Start Break"
    }
    CDS_FRIENDLY_NAMES = {
        "CDS_ConfirmedBy_BRB_vs_PDSOpen_Trigger": "Bullish Reversal Bar vs Potential Downtrend Start Open",
        "CDS_ConfirmedBy_RuleA_PDSLowBreak_Trigger": "Potential Downtrend Start Low Break (Rule A)",
        "CDS_ConfirmedBy_RuleB_PDSHighBreak_Thrust_Trigger": "Potential Downtrend Start High Break & Thrust (Rule B)",
        "CDS_ConfirmedBy_RuleF_PDSLowBreak_FailedHigh_Trigger": "Potential Downtrend Start Low Break & Failed High (Rule F)",
        "CDS_ConfirmedBy_RuleG_SUB_PostPDSLowBreak_Trigger": "Strong Up Bar after Potential Downtrend Start Low Break (Rule G)",
        "CDS_ConfirmedBy_RuleH_HHLL_vs_PDS_Trigger": "HigherHigh-LowerLow Bar vs Potential Downtrend Start (Rule H)"
    }

    for k in range(len(all_bars)):
        current_bar = all_bars[k]
        current_bar_dt_str = current_bar.timestamp.strftime('%Y-%m-%d %H:%M')
        
        # Trader-friendly log for bar processing
        logger.info(f"{log_prefix} Processing Bar {current_bar.index} ({current_bar_dt_str})")

        if k == 0:
            # logger.info("First bar, skipping PDS/PUS logic based on prev_bar.") # Optional: can be too noisy
            continue 
        
        prev_bar = all_bars[k-1]
        prev_bar_dt_str = prev_bar.timestamp.strftime('%Y-%m-%d %H:%M')

        initial_pus_candidate_bar_obj = None
        if state.confirmed_uptrend_candidate_low_bar_index is not None:
            initial_pus_candidate_bar_obj = all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1]

        initial_pds_candidate_bar_obj = None
        if state.confirmed_downtrend_candidate_peak_bar_index is not None:
            initial_pds_candidate_bar_obj = all_bars[state.confirmed_downtrend_candidate_peak_bar_index - 1]
        
        # Current trend context for logs
        current_trend_log_str = f"Previous Trend: {state.last_confirmed_trend_type} @ Bar {state.last_confirmed_trend_bar_index}" if state.last_confirmed_trend_bar_index is not None else "Previous Trend: None"


        # --- Variables to track if a CUS/CDS was confirmed in THIS iteration for THIS current_bar ---
        cus_confirmed_on_bar = None # Bar object that is the CUS
        cus_rule_applied = None
        forced_dt_bar_due_to_cus = None

        cds_confirmed_on_bar = None # Bar object that is the CDS
        cds_rule_applied = None
        forced_ut_bar_due_to_cds = None
        
        # --- CONTAINMENT LOGIC (simplified for signal generation focus) ---
        # While containment is interesting, the primary output is trend start signals.
        # We'll keep the state updates for containment if they affect PDS/PUS states
        # that lead to CUS/CDS, but won't generate "containment" signals.
        if state.in_containment:
            if not (current_bar.h <= state.containment_ref_high and current_bar.l >= state.containment_ref_low):
                state.in_containment = False # Broke out
                # Resetting containment state vars
                state.containment_ref_bar_index = None
                state.containment_ref_type = None
                state.containment_ref_high = None
                state.containment_ref_low = None
                state.containment_start_bar_index_for_log = None
                state.containment_consecutive_bars_inside = 0
        
        if not state.in_containment:
            chosen_candidate_ref_bar = None
            if initial_pds_candidate_bar_obj: chosen_candidate_ref_bar = initial_pds_candidate_bar_obj
            elif initial_pus_candidate_bar_obj: chosen_candidate_ref_bar = initial_pus_candidate_bar_obj
            
            # Containment logging can be very minimal or removed for trader view unless critical
            # For now, let's skip explicit containment logging unless it directly results in a signal or state change relevant to PUS/PDS that gets logged later.
            if chosen_candidate_ref_bar and chosen_candidate_ref_bar.index != current_bar.index:
                if current_bar.h <= chosen_candidate_ref_bar.h and current_bar.l >= chosen_candidate_ref_bar.l:
                    state.in_containment = True
                    state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                    state.containment_ref_type = "PDS_PEAK" if initial_pds_candidate_bar_obj else "PUS_LOW"
                    state.containment_ref_high = chosen_candidate_ref_bar.h
                    state.containment_ref_low = chosen_candidate_ref_bar.l
                    state.containment_start_bar_index_for_log = current_bar.index
                    state.containment_consecutive_bars_inside = 1
        
        # --- Evaluate CUS Possibility ---
        can_confirm_cus = False
        temp_cus_trigger_rule_type = None
        if initial_pus_candidate_bar_obj is not None:
            sdb_triggers_cus = is_SDB(current_bar, prev_bar)
            sdb_cus_valid_context = True
            if sdb_triggers_cus and initial_pds_candidate_bar_obj is not None: 
                if current_bar.l < initial_pds_candidate_bar_obj.l: sdb_cus_valid_context = False
            
            ref36_pds_context_for_check = initial_pds_candidate_bar_obj 
            if not ref36_pds_context_for_check and state.confirmed_downtrend_candidate_peak_bar_index is not None:
                 ref36_pds_context_for_check = all_bars[state.confirmed_downtrend_candidate_peak_bar_index -1]
            ref36_triggers_cus = check_custom_cus_confirmation_ref36(current_bar, prev_bar, ref36_pds_context_for_check)
            hhll_triggers_cus = check_custom_cus_confirmation_HHLL(current_bar, prev_bar)
            engulfing_up_triggers_cus = check_custom_cus_EngulfingUp(current_bar, prev_bar, initial_pds_candidate_bar_obj)

            if sdb_triggers_cus and sdb_cus_valid_context: can_confirm_cus = True; temp_cus_trigger_rule_type = CUS_RULES_MAP["SDB"]
            elif ref36_triggers_cus: can_confirm_cus = True; temp_cus_trigger_rule_type = CUS_RULES_MAP["REF36"]
            elif hhll_triggers_cus: can_confirm_cus = True; temp_cus_trigger_rule_type = CUS_RULES_MAP["HHLL"]
            elif engulfing_up_triggers_cus: can_confirm_cus = True; temp_cus_trigger_rule_type = CUS_RULES_MAP["EngulfingUp"]

        # Minimal log for CUS/CDS evaluation if needed, or remove if confirmations are clear
        # if can_confirm_cus or can_confirm_cds:
        #    logger.info(f"  Eval: CUS ({can_confirm_cus}, {temp_cus_trigger_rule_type}), CDS ({can_confirm_cds}, {temp_cds_trigger_rule_type})")

        # --- Evaluate CDS Possibility ---
        can_confirm_cds = False
        temp_cds_trigger_rule_type = None
        if initial_pds_candidate_bar_obj is not None:
            no_higher_high_for_brb_path = True
            if initial_pds_candidate_bar_obj.index < prev_bar.index:
                for j_1based_idx in range(initial_pds_candidate_bar_obj.index + 1, prev_bar.index + 1):
                    if all_bars[j_1based_idx - 1].h > initial_pds_candidate_bar_obj.h:
                        no_higher_high_for_brb_path = False; break
            
            if is_BRB(current_bar, prev_bar) and no_higher_high_for_brb_path and current_bar.l < initial_pds_candidate_bar_obj.o: 
                can_confirm_cds = True; temp_cds_trigger_rule_type = CDS_RULES_MAP["BRB_vs_PDSOpen"]
            elif check_custom_cds_confirmation_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; temp_cds_trigger_rule_type = CDS_RULES_MAP["A"]
            elif check_custom_cds_confirmation_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; temp_cds_trigger_rule_type = CDS_RULES_MAP["B"]
            elif check_custom_cds_confirmation_F(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; temp_cds_trigger_rule_type = CDS_RULES_MAP["F"]
            elif check_custom_cds_confirmation_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; temp_cds_trigger_rule_type = CDS_RULES_MAP["G"]
            elif initial_pds_candidate_bar_obj == prev_bar and check_custom_cds_confirmation_H(current_bar, prev_bar):
                can_confirm_cds = True; temp_cds_trigger_rule_type = CDS_RULES_MAP["H"]
        
        # Log CUS/CDS evaluation only if positive, or rely on confirmation logs
        # Example: if can_confirm_cus: logger.info(f"  Potential CUS with {temp_cus_trigger_rule_type} on PUS Bar {initial_pus_candidate_bar_obj.index} by current Bar {current_bar.index}")
        # Example: if can_confirm_cds: logger.info(f"  Potential CDS with {temp_cds_trigger_rule_type} on PDS Bar {initial_pds_candidate_bar_obj.index} by current Bar {current_bar.index}")

        _cus_triggered_this_iter = False
        _cds_triggered_this_iter = False

        # --- Apply Consequences (PRIORITY 1: CUS) ---
        if can_confirm_cus:
            _cus_triggered_this_iter = True # Set flag
            cus_confirmed_on_bar = initial_pus_candidate_bar_obj # This is the bar whose PUS status is confirmed
            cus_rule_applied = temp_cus_trigger_rule_type

            if state.last_confirmed_trend_type == 'uptrend' and \
               (state.last_confirmed_trend_bar_index is not None and cus_confirmed_on_bar and cus_confirmed_on_bar.index > state.last_confirmed_trend_bar_index):
                forced_dt_bar_due_to_cus = find_intervening_bar(all_bars, state.last_confirmed_trend_bar_index, cus_confirmed_on_bar.index, find_lowest_low=False)
                if forced_dt_bar_due_to_cus:
                    forced_bar_dt_str = forced_dt_bar_due_to_cus.timestamp.strftime('%Y-%m-%d %H:%M')
                    cus_bar_dt_str = cus_confirmed_on_bar.timestamp.strftime('%Y-%m-%d %H:%M')
                    friendly_cus_rule_name = CUS_FRIENDLY_NAMES.get(cus_rule_applied, cus_rule_applied)
                    logger.info(f"{log_prefix} 📉 FORCED DOWNTREND on {forced_bar_dt_str} (Bar {forced_dt_bar_due_to_cus.index}). Caused by Confirmed Uptrend Start on {cus_bar_dt_str} (Bar {cus_confirmed_on_bar.index}) with rule '{friendly_cus_rule_name}'. Triggered by Bar {current_bar.index}. {current_trend_log_str}")
                    signal = {
                        'timestamp': forced_dt_bar_due_to_cus.timestamp, 'contract_id': contract_id, 'timeframe': timeframe_str,
                        'signal_type': "downtrend_start", 'signal_price': forced_dt_bar_due_to_cus.c,
                        'signal_open': forced_dt_bar_due_to_cus.o, 'signal_high': forced_dt_bar_due_to_cus.h,
                        'signal_low': forced_dt_bar_due_to_cus.l, 'signal_close': forced_dt_bar_due_to_cus.c,
                        'signal_volume': forced_dt_bar_due_to_cus.volume,
                        'details': { "confirmed_signal_bar_index": forced_dt_bar_due_to_cus.index,
                                     "triggering_bar_index": current_bar.index, "rule_type": f"ForcedDT_({cus_rule_applied})" }
                    }
                    signals_found.append(signal)
                    # Update state for this forced trend
                    state.last_confirmed_trend_type = 'downtrend' 
                    state.last_confirmed_trend_bar_index = forced_dt_bar_due_to_cus.index
            
            # Main CUS signal
            cus_bar_dt_str = cus_confirmed_on_bar.timestamp.strftime('%Y-%m-%d %H:%M')
            friendly_cus_rule_name = CUS_FRIENDLY_NAMES.get(cus_rule_applied, cus_rule_applied)
            logger.info(f"{log_prefix} 📈 CONFIRMED UPTREND START on {cus_bar_dt_str} (Bar {cus_confirmed_on_bar.index}) by Rule: '{friendly_cus_rule_name}'. Triggered by Bar {current_bar.index} ({current_bar_dt_str}). {current_trend_log_str}")
            signal = {
                'timestamp': cus_confirmed_on_bar.timestamp, 'contract_id': contract_id, 'timeframe': timeframe_str,
                'signal_type': "uptrend_start", 'signal_price': cus_confirmed_on_bar.c,
                'signal_open': cus_confirmed_on_bar.o, 'signal_high': cus_confirmed_on_bar.h,
                'signal_low': cus_confirmed_on_bar.l, 'signal_close': cus_confirmed_on_bar.c,
                'signal_volume': cus_confirmed_on_bar.volume,
                'details': { "confirmed_signal_bar_index": cus_confirmed_on_bar.index,
                             "triggering_bar_index": current_bar.index, "rule_type": cus_rule_applied }
            }
            signals_found.append(signal)
            state.overall_trend_is_up = True 
            state.last_confirmed_trend_type = 'uptrend'
            state.last_confirmed_trend_bar_index = cus_confirmed_on_bar.index
            
            # Clear PUS state
            state.potential_uptrend_signal_bar_index = None; state.potential_uptrend_anchor_low = None
            state.confirmed_uptrend_candidate_low_bar_index = None; state.confirmed_uptrend_candidate_low_low = None
            state.confirmed_uptrend_candidate_low_high = None

            # PDS setting logic after CUS
            made_cus_bar_pds = False
            if cus_confirmed_on_bar:
                pds_trigger_detail = ""
                # Determine the specific trigger for PDS
                if is_SDB(current_bar, cus_confirmed_on_bar):
                    pds_trigger_detail = "SDB trigger"
                elif is_your_custom_pds_rule(current_bar, cus_confirmed_on_bar):
                    pds_trigger_detail = "Custom PDS Rule C trigger"
                elif is_custom_pds_rule_B(current_bar, cus_confirmed_on_bar):
                    pds_trigger_detail = "Custom PDS Rule B trigger"

                if pds_trigger_detail: # This implies is_pds_by_trigger was true based on original logic
                    if state.confirmed_downtrend_candidate_peak_bar_index is None or \
                       cus_confirmed_on_bar.h > state.confirmed_downtrend_candidate_peak_high:
                        state.potential_downtrend_signal_bar_index = cus_confirmed_on_bar.index
                        state.potential_downtrend_anchor_high = cus_confirmed_on_bar.h
                        state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_on_bar.index
                        state.confirmed_downtrend_candidate_peak_high = cus_confirmed_on_bar.h
                        state.confirmed_downtrend_candidate_peak_low = cus_confirmed_on_bar.l
                        made_cus_bar_pds = True
                        if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Uptrend Start: New Potential Downtrend Start on Confirmed Uptrend Start Bar {cus_confirmed_on_bar.index} (High: {cus_confirmed_on_bar.h}) due to {pds_trigger_detail}.")
            
            if not made_cus_bar_pds:
                friendly_cus_rule_name_short = CUS_FRIENDLY_NAMES.get(cus_rule_applied, cus_rule_applied)
                if cus_rule_applied == "CUS_ConfirmedBy_HHLL_DownBar_Trigger": # Specific rule from map
                    state.potential_downtrend_signal_bar_index = current_bar.index
                    state.potential_downtrend_anchor_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                    state.confirmed_downtrend_candidate_peak_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_low = current_bar.l
                    if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Uptrend Start: New Potential Downtrend Start on Current Bar {current_bar.index} (High: {current_bar.h}) due to '{friendly_cus_rule_name_short}' rule.")
                elif cus_rule_applied != "CUS_ConfirmedBy_EngulfingUp_PDSBreak_Trigger": # SDB or REF36
                    if state.confirmed_downtrend_candidate_peak_bar_index is None or \
                       (cus_confirmed_on_bar and cus_confirmed_on_bar.h > state.confirmed_downtrend_candidate_peak_high):
                        if cus_confirmed_on_bar:
                            state.potential_downtrend_signal_bar_index = cus_confirmed_on_bar.index
                            state.potential_downtrend_anchor_high = cus_confirmed_on_bar.h
                            state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_on_bar.index
                            state.confirmed_downtrend_candidate_peak_high = cus_confirmed_on_bar.h
                            state.confirmed_downtrend_candidate_peak_low = cus_confirmed_on_bar.l
                            if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Uptrend Start: New Potential Downtrend Start on Confirmed Uptrend Start Bar {cus_confirmed_on_bar.index} (High: {cus_confirmed_on_bar.h}) due to '{friendly_cus_rule_name_short}' rule.")
        
        # --- Apply Consequences (PRIORITY 2: CDS, only if no CUS in this iteration) ---
        # This block will only execute if CUS was NOT confirmed in the same iteration.
        # (Assuming CUS confirmation takes precedence and might alter state used by CDS)
        # A more robust way might be to evaluate CUS and CDS possibilities independently
        # and then resolve conflicts or decide which signal to take if both occur.
        # For now, let's assume CUS has priority.
        elif can_confirm_cds: # Note the 'elif'
            _cds_triggered_this_iter = True # Set flag
            cds_confirmed_on_bar = initial_pds_candidate_bar_obj # This is the PDS bar being confirmed
            cds_rule_applied = temp_cds_trigger_rule_type

            if state.last_confirmed_trend_type == 'downtrend' and \
               (cds_confirmed_on_bar and state.last_confirmed_trend_bar_index is not None and cds_confirmed_on_bar.index > state.last_confirmed_trend_bar_index):
                forced_ut_bar_due_to_cds = find_intervening_bar(all_bars, state.last_confirmed_trend_bar_index, cds_confirmed_on_bar.index, find_lowest_low=True)
                if forced_ut_bar_due_to_cds:
                    forced_bar_dt_str = forced_ut_bar_due_to_cds.timestamp.strftime('%Y-%m-%d %H:%M')
                    cds_bar_dt_str = cds_confirmed_on_bar.timestamp.strftime('%Y-%m-%d %H:%M')
                    friendly_cds_rule_name = CDS_FRIENDLY_NAMES.get(cds_rule_applied, cds_rule_applied)
                    logger.info(f"{log_prefix} 📈 FORCED UPTREND on {forced_bar_dt_str} (Bar {forced_ut_bar_due_to_cds.index}). Caused by Confirmed Downtrend Start on {cds_bar_dt_str} (Bar {cds_confirmed_on_bar.index}) with rule '{friendly_cds_rule_name}'. Triggered by Bar {current_bar.index}. {current_trend_log_str}")
                    signal = {
                        'timestamp': forced_ut_bar_due_to_cds.timestamp, 'contract_id': contract_id, 'timeframe': timeframe_str,
                        'signal_type': "uptrend_start", 'signal_price': forced_ut_bar_due_to_cds.c,
                        'signal_open': forced_ut_bar_due_to_cds.o, 'signal_high': forced_ut_bar_due_to_cds.h,
                        'signal_low': forced_ut_bar_due_to_cds.l, 'signal_close': forced_ut_bar_due_to_cds.c,
                        'signal_volume': forced_ut_bar_due_to_cds.volume,
                        'details': { "confirmed_signal_bar_index": forced_ut_bar_due_to_cds.index,
                                     "triggering_bar_index": current_bar.index, "rule_type": f"ForcedUT_({cds_rule_applied})" }
                    }
                    signals_found.append(signal)
                    state.last_confirmed_trend_type = 'uptrend'
                    state.last_confirmed_trend_bar_index = forced_ut_bar_due_to_cds.index
            
            # Main CDS Signal
            cds_bar_dt_str = cds_confirmed_on_bar.timestamp.strftime('%Y-%m-%d %H:%M')
            friendly_cds_rule_name = CDS_FRIENDLY_NAMES.get(cds_rule_applied, cds_rule_applied)
            logger.info(f"{log_prefix} 📉 CONFIRMED DOWNTREND START on {cds_bar_dt_str} (Bar {cds_confirmed_on_bar.index}) by Rule: '{friendly_cds_rule_name}'. Triggered by Bar {current_bar.index} ({current_bar_dt_str}). {current_trend_log_str}")
            signal = {
                'timestamp': cds_confirmed_on_bar.timestamp, 'contract_id': contract_id, 'timeframe': timeframe_str,
                'signal_type': "downtrend_start", 'signal_price': cds_confirmed_on_bar.c,
                'signal_open': cds_confirmed_on_bar.o, 'signal_high': cds_confirmed_on_bar.h,
                'signal_low': cds_confirmed_on_bar.l, 'signal_close': cds_confirmed_on_bar.c,
                'signal_volume': cds_confirmed_on_bar.volume,
                'details': { "confirmed_signal_bar_index": cds_confirmed_on_bar.index,
                             "triggering_bar_index": current_bar.index, "rule_type": cds_rule_applied }
            }
            signals_found.append(signal)
            state.overall_trend_is_up = False 
            state.last_confirmed_trend_type = 'downtrend'
            state.last_confirmed_trend_bar_index = cds_confirmed_on_bar.index

            # Clear relevant PUS state
            if state.confirmed_uptrend_candidate_low_bar_index is not None and cds_confirmed_on_bar and \
               state.confirmed_uptrend_candidate_low_bar_index <= cds_confirmed_on_bar.index:
                state.potential_uptrend_signal_bar_index = None; state.potential_uptrend_anchor_low = None
                state.confirmed_uptrend_candidate_low_bar_index = None; state.confirmed_uptrend_candidate_low_low = None
                state.confirmed_uptrend_candidate_low_high = None
            
            # Clear the confirmed PDS state
            if state.confirmed_downtrend_candidate_peak_bar_index == cds_confirmed_on_bar.index :
                state.potential_downtrend_signal_bar_index = None; state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None; state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
            if state.potential_downtrend_signal_bar_index == cds_confirmed_on_bar.index:
                 state.potential_downtrend_signal_bar_index = None; state.potential_downtrend_anchor_high = None


            # PUS setting logic after CDS
            friendly_cds_rule_name_short = CDS_FRIENDLY_NAMES.get(cds_rule_applied, cds_rule_applied)
            if cds_rule_applied == "CDS_ConfirmedBy_BRB_vs_PDSOpen_Trigger":
                state.potential_uptrend_signal_bar_index = current_bar.index; state.potential_uptrend_anchor_low = current_bar.l
                chosen_pus_candidate_bar = current_bar
                if state.confirmed_uptrend_candidate_low_bar_index is not None and state.confirmed_uptrend_candidate_low_low is not None and state.confirmed_uptrend_candidate_low_low < current_bar.l: 
                    chosen_pus_candidate_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index - 1]
                state.confirmed_uptrend_candidate_low_bar_index = chosen_pus_candidate_bar.index
                state.confirmed_uptrend_candidate_low_low = chosen_pus_candidate_bar.l
                state.confirmed_uptrend_candidate_low_high = chosen_pus_candidate_bar.h
                if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Downtrend Start: New Potential Uptrend Start on Bar {chosen_pus_candidate_bar.index} (Low: {chosen_pus_candidate_bar.l}) from '{friendly_cds_rule_name_short}' rule.")
            elif cds_rule_applied in ["CDS_ConfirmedBy_RuleA_PDSLowBreak_Trigger", "CDS_ConfirmedBy_RuleB_PDSHighBreak_Thrust_Trigger", "CDS_ConfirmedBy_RuleF_PDSLowBreak_FailedHigh_Trigger"]:
                temp_pus_candidate_bar = None
                if state.confirmed_uptrend_candidate_low_bar_index is not None:
                    temp_pus_candidate_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index -1]
                
                if temp_pus_candidate_bar:
                    state.potential_uptrend_signal_bar_index = temp_pus_candidate_bar.index; state.potential_uptrend_anchor_low = temp_pus_candidate_bar.l
                    state.confirmed_uptrend_candidate_low_bar_index = temp_pus_candidate_bar.index
                    state.confirmed_uptrend_candidate_low_low = temp_pus_candidate_bar.l
                    state.confirmed_uptrend_candidate_low_high = temp_pus_candidate_bar.h
                    if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Downtrend Start: Retained Potential Uptrend Start on Bar {temp_pus_candidate_bar.index} (Low: {temp_pus_candidate_bar.l}) from '{friendly_cds_rule_name_short}' context.")
            elif cds_rule_applied == "CDS_ConfirmedBy_RuleG_SUB_PostPDSLowBreak_Trigger":
                state.potential_uptrend_signal_bar_index = prev_bar.index; state.potential_uptrend_anchor_low = prev_bar.l
                if state.confirmed_uptrend_candidate_low_bar_index is None or prev_bar.l < state.confirmed_uptrend_candidate_low_low:
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = prev_bar.l
                    state.confirmed_uptrend_candidate_low_high = prev_bar.h
                    if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Downtrend Start: New Potential Uptrend Start on Previous Bar {prev_bar.index} (Low: {prev_bar.l}) from '{friendly_cds_rule_name_short}' rule.")
                if state.potential_downtrend_signal_bar_index is not None: 
                    state.potential_downtrend_signal_bar_index = None; state.potential_downtrend_anchor_high = None
            
            # PDS State update/clear for the confirmed CDS (Rule F and H specific PDS setting)
            if cds_rule_applied == "CDS_ConfirmedBy_RuleF_PDSLowBreak_FailedHigh_Trigger":
                state.potential_downtrend_signal_bar_index = current_bar.index; state.potential_downtrend_anchor_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                state.confirmed_downtrend_candidate_peak_high = current_bar.h; state.confirmed_downtrend_candidate_peak_low = current_bar.l
                if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Downtrend Start: New Potential Downtrend Start on Current Bar {current_bar.index} (High: {current_bar.h}) from '{friendly_cds_rule_name_short}' rule.")
            elif cds_rule_applied == "CDS_ConfirmedBy_RuleH_HHLL_vs_PDS_Trigger":
                state.potential_uptrend_signal_bar_index = current_bar.index; state.potential_uptrend_anchor_low = current_bar.l
                state.confirmed_uptrend_candidate_low_bar_index = current_bar.index; state.confirmed_uptrend_candidate_low_low = current_bar.l
                state.confirmed_uptrend_candidate_low_high = current_bar.h
                state.potential_downtrend_signal_bar_index = current_bar.index; state.potential_downtrend_anchor_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index 
                state.confirmed_downtrend_candidate_peak_high = current_bar.h; state.confirmed_downtrend_candidate_peak_low = current_bar.l
                if logger: logger.info(f"{log_prefix}   ➡️ After Confirmed Downtrend Start: New Potential Uptrend & Downtrend Starts on Current Bar {current_bar.index} from '{friendly_cds_rule_name_short}' rule.")

        # --- Check for New Potential Signals (on prev_bar or current_bar for Rule C) ---
        # This section now correctly guards based on whether CUS or CDS actually fired.
        if not (_cus_triggered_this_iter or _cds_triggered_this_iter):
            new_pds_on_curr_bar_this_iteration = False # Initialize here
            
            # PDS Formation/Update Logic
            pds_rule_C_met = is_your_custom_pds_rule(current_bar, prev_bar) # Rule C: current bar closes below prev_bar.open after prev_bar made a new high
            pds_rule_B_met = is_custom_pds_rule_B(current_bar, prev_bar) # Rule B: current bar's high is less than or equal to previous bar's high

            new_pds_on_prev_bar = False
            if pds_rule_C_met or pds_rule_B_met:
                new_pds_on_prev_bar = True

            if new_pds_on_prev_bar:
                new_pds_high = prev_bar.h
                new_pds_low = prev_bar.l
                log_msg_pds = f"Potential Downtrend Start on {prev_bar_dt_str} (Bar {prev_bar.index}) at High:{new_pds_high} (Low:{new_pds_low}). Triggered by Bar {current_bar.index}."
                
                if initial_pds_candidate_bar_obj is None or new_pds_high > initial_pds_candidate_bar_obj.h:
                    state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                    state.confirmed_downtrend_candidate_peak_high = new_pds_high
                    state.confirmed_downtrend_candidate_peak_low = new_pds_low
                    logger.info(f"{log_prefix}   🔎 {log_msg_pds} New Potential Downtrend Start formed or updated.")
                    if state.in_containment: state.in_containment = False 
                elif new_pds_high == initial_pds_candidate_bar_obj.h and new_pds_low < initial_pds_candidate_bar_obj.l : 
                    state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                    state.confirmed_downtrend_candidate_peak_high = new_pds_high
                    state.confirmed_downtrend_candidate_peak_low = new_pds_low
                    logger.info(f"{log_prefix}   🔎 {log_msg_pds} Potential Downtrend Start updated (same High, lower Low).")
                    if state.in_containment: state.in_containment = False 
                # else:
                #     logger.info(f"  Potential Downtrend Start on Bar {prev_bar.index} not an improvement over existing: Bar {initial_pds_candidate_bar_obj.index if initial_pds_candidate_bar_obj else 'N/A'}")


            # PUS Formation/Update Logic
            pus_rule_C_met = is_your_custom_pus_rule(current_bar, prev_bar) # Rule C: current bar closes above prev_bar.open after prev_bar made a new low
            pus_rule_B_met = is_custom_pus_rule_B(current_bar, prev_bar) # Rule B: current bar's low is greater than or equal to previous bar's low
            
            new_pus_on_prev_bar = False
            if pus_rule_C_met or pus_rule_B_met:
                new_pus_on_prev_bar = True
            
            if new_pus_on_prev_bar:
                new_pus_low = prev_bar.l
                new_pus_high = prev_bar.h
                log_msg_pus = f"Potential Uptrend Start on {prev_bar_dt_str} (Bar {prev_bar.index}) at Low:{new_pus_low} (High:{new_pus_high}). Triggered by Bar {current_bar.index}."

                if initial_pus_candidate_bar_obj is None or new_pus_low < initial_pus_candidate_bar_obj.l:
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = new_pus_low
                    state.confirmed_uptrend_candidate_low_high = new_pus_high
                    logger.info(f"{log_prefix}   🔎 {log_msg_pus} New Potential Uptrend Start formed or updated.")
                    if state.in_containment: state.in_containment = False 
                elif new_pus_low == initial_pus_candidate_bar_obj.l and new_pus_high > initial_pus_candidate_bar_obj.h : 
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = new_pus_low
                    state.confirmed_uptrend_candidate_low_high = new_pus_high
                    logger.info(f"{log_prefix}   🔎 {log_msg_pus} Potential Uptrend Start updated (same Low, higher High).")
                    if state.in_containment: state.in_containment = False
                # else:
                #     logger.info(f"  Potential Uptrend Start on Bar {prev_bar.index} not an improvement over existing: Bar {initial_pus_candidate_bar_obj.index if initial_pus_candidate_bar_obj else 'N/A'}")
            
            # PDS Invalidation Logic
            if state.last_confirmed_trend_type == 'uptrend' and initial_pds_candidate_bar_obj is not None:
                if current_bar.l > initial_pds_candidate_bar_obj.l: 
                    # Construct a local message for invalidation to avoid NameError with log_msg_pds
                    invalidation_log_detail = f"Invalidated Potential Downtrend Start on Bar {initial_pds_candidate_bar_obj.index} (High:{initial_pds_candidate_bar_obj.h}, Low:{initial_pds_candidate_bar_obj.l})"\
                                              f" because Current Bar {current_bar.index} Low ({current_bar.l}) > PDS Low ({initial_pds_candidate_bar_obj.l}) during uptrend."
                    logger.info(f"{log_prefix}   🔎 {invalidation_log_detail}")
                    state.confirmed_downtrend_candidate_peak_bar_index = None
                    state.confirmed_downtrend_candidate_peak_high = None
                    state.confirmed_downtrend_candidate_peak_low = None
                    if state.in_containment and state.containment_ref_bar_index == initial_pds_candidate_bar_obj.index: state.in_containment = False


            # PUS Invalidation Logic
            if state.last_confirmed_trend_type == 'downtrend' and initial_pus_candidate_bar_obj is not None:
                if current_bar.h < initial_pus_candidate_bar_obj.h: 
                    # Construct a local message for invalidation to avoid NameError with log_msg_pus
                    invalidation_log_detail = f"Invalidated Potential Uptrend Start on Bar {initial_pus_candidate_bar_obj.index} (Low:{initial_pus_candidate_bar_obj.l}, High:{initial_pus_candidate_bar_obj.h})"\
                                              f" because Current Bar {current_bar.index} High ({current_bar.h}) < PUS High ({initial_pus_candidate_bar_obj.h}) during downtrend."
                    logger.info(f"{log_prefix}   🔎 {invalidation_log_detail}")
                    state.confirmed_uptrend_candidate_low_bar_index = None
                    state.confirmed_uptrend_candidate_low_low = None
                    state.confirmed_uptrend_candidate_low_high = None
                    if state.in_containment and state.containment_ref_bar_index == initial_pus_candidate_bar_obj.index: state.in_containment = False
        
        # Removed the verbose [AFTER ALL LOGIC] block and End Iteration block
        # The essential state is logged when it changes or leads to a signal.

    for signal in signals_found:
        # Using a tuple of identifiable fields for uniqueness check
        signal_tuple = (signal['timestamp'], signal['signal_type'], signal['signal_price'])
        if signal_tuple not in seen:
            seen.add(signal_tuple)
            unique_signals.append(signal)

    logger.info(f"{log_prefix} Finished processing {len(all_bars)} bars. Generated {len(signals_found)} raw signals. {len(unique_signals)} unique signals after filtering.")
    return unique_signals

if __name__ == '__main__':
    # Example of how to test this function (optional)
    # This part is mostly for standalone testing if this script were run directly.
    # The analyzer_service.py will call generate_trend_starts.
    print(f"{__file__} loaded. Contains generate_trend_starts function using CUS/CDS logic.")
    # Example:
    # sample_data = {
    #     'timestamp': pd.to_datetime(['2023-01-01 10:00:00', '2023-01-01 10:05:00', ...]),
    #     'open': [100, 101, ...], 'high': [102, 103, ...], 'low': [99, 100, ...],
    #     'close': [101, 102, ...], 'volume': [1000, 1200, ...]
    # }
    # sample_df = pd.DataFrame(sample_data)
    # signals = generate_trend_starts(sample_df, "TEST.CON", "5m")
    # print(f"Test signals: {signals}")
    pass 