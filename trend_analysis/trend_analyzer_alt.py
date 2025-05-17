import csv

class Bar:
    def __init__(self, date_str, o, h, l, c, original_file_line, chronological_index):
        self.date = date_str
        self.o = float(o)
        self.h = float(h)
        self.l = float(l)
        self.c = float(c)
        self.original_file_line = original_file_line # For debugging if needed
        self.index = int(chronological_index) # 1-based chronological index

    def __repr__(self):
        return (f"Bar({self.index}, D:{self.date} O:{self.o} H:{self.h} "
                f"L:{self.l} C:{self.c})")

class State:
    def __init__(self):
        self.potential_downtrend_signal_bar_index = None # 1-based index of the bar that initiated a potential downtrend
        self.potential_downtrend_anchor_high = None # The high price of the bar that initiated the potential downtrend

        self.potential_uptrend_signal_bar_index = None # 1-based index of the bar that initiated a potential uptrend
        self.potential_uptrend_anchor_low = None  # The low price of the bar that initiated the potential uptrend

        # For CDS detection
        self.confirmed_downtrend_candidate_peak_bar_index = None # 1-based index of the bar that is the current peak candidate for a downtrend confirmation
        self.confirmed_downtrend_candidate_peak_high = None  # The high price of that peak candidate bar
        self.confirmed_downtrend_candidate_peak_low = None   # The low price of that peak candidate bar

        # For CUS detection
        self.confirmed_uptrend_candidate_low_bar_index = None # 1-based index of the bar that is the current low candidate for an uptrend confirmation
        self.confirmed_uptrend_candidate_low_low = None   # The low price of that low candidate bar
        self.confirmed_uptrend_candidate_low_high = None  # The high price of that low candidate bar (added for symmetry/completeness)
        
        self.log_entries = []

        # Containment State
        self.in_containment = False
        self.containment_ref_bar_index = None
        self.containment_ref_type = None # "PDS_PEAK" or "PUS_LOW"
        self.containment_ref_high = None # High of the reference bar
        self.containment_ref_low = None  # Low of the reference bar
        self.containment_start_bar_index_for_log = None # Bar that first entered containment
        self.containment_consecutive_bars_inside = 0 # Number of bars strictly inside after start

        # Overall trend state for strict U/D alternation
        self.overall_trend_is_up = None # True if current confirmed trend is UP, False if DOWN, None if Neutral

        # For forcing alternation
        self.last_confirmed_trend_type = None
        self.last_confirmed_trend_bar_index = None

# --- Helper Functions for Bar Patterns ---
def is_SDB(current_bar, prev_bar): # Simple Down Bar
  return (current_bar.l < prev_bar.l and \
          current_bar.h < prev_bar.h and \
          current_bar.c < prev_bar.c) # Using close, can be prev_bar.o

def is_SUB(current_bar, prev_bar): # Simple Up Bar
  return (current_bar.l > prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c) # Using close, can be prev_bar.o

def is_BRB(current_bar, prev_bar): # Bullish Reversal Bar
  return (current_bar.l < prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_BeRB(current_bar, prev_bar): # Bearish Reversal Bar
  return (current_bar.h > prev_bar.h and \
          current_bar.l < prev_bar.l and \
          current_bar.c < prev_bar.c)

def is_your_custom_pds_rule(current_bar, prev_bar):
    # For PDS on prev_bar when current_bar closes:
    # 1. current_bar did NOT make a higher high than prev_bar's high
    # 2. current_bar closed BELOW prev_bar's open
    return (current_bar.h <= prev_bar.h and 
            current_bar.c < prev_bar.o)

def is_your_custom_pus_rule(current_bar, prev_bar):
    # For PUS on prev_bar when current_bar closes:
    # 1. current_bar did NOT make a lower low than prev_bar's low
    # 2. current_bar closed ABOVE prev_bar's open
    return (current_bar.l >= prev_bar.l and
            current_bar.c > prev_bar.o)

# --- New function for Custom CDS Confirmation Rule A ---
def check_custom_cds_confirmation_A(current_bar, prev_bar, peak_bar_for_cds, all_bars):
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

def check_custom_cds_confirmation_B(current_bar, prev_bar, peak_bar_for_cds, all_bars):
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

def check_custom_cds_confirmation_F(current_bar, prev_bar, peak_bar_for_cds, all_bars):
    # Rule for confirming CDS on peak_bar_for_cds when current_bar closes.
    # Based on Ref Log Line 17 (MES.M25 data) - refined to be more specific.
    # 1. no_higher_high_intermediate: No bar between peak (excl) and prev_bar (incl) made H > peak.H.
    # 2. prev_bar.l < peak_bar_for_cds.l: prev_bar made a new low below the peak's low.
    # 3. current_bar.h > prev_bar.h: current bar attempts to rally above previous bar's high.
    # 4. current_bar.c < prev_bar.c: current bar closes lower than previous (fails rally).
    # 5. current_bar.c < current_bar.o: current bar is a down-closing bar.

    # Condition 1: no_higher_high_intermediate
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False
                break
    if not no_higher_high_intermediate:
        return False

    # Condition 2: prev_bar.l < peak_bar_for_cds.l
    cond2_prev_low_break = prev_bar.l < peak_bar_for_cds.l
    if not cond2_prev_low_break:
        return False

    # Condition 3: current_bar.h > prev_bar.h
    cond3_curr_higher_high_attempt = current_bar.h > prev_bar.h
    if not cond3_curr_higher_high_attempt:
        return False

    # Condition 4: current_bar.c < prev_bar.c
    cond4_curr_closes_lower_than_prev = current_bar.c < prev_bar.c
    if not cond4_curr_closes_lower_than_prev:
        return False

    # Condition 5: current_bar.c < current_bar.o
    cond5_curr_down_close = current_bar.c < current_bar.o
    
    return cond5_curr_down_close # If all prior conditions passed

def check_custom_cds_confirmation_G(current_bar, prev_bar, peak_bar_for_cds, all_bars):
    # Rule for confirming CDS on peak_bar_for_cds when current_bar closes and forms a SUB with prev_bar.
    # Based on Ref Log Line 26 (MES.M25 data): CDS Bar 19, PUS Bar 25 (triggered by Bar 26 close).
    # 1. is_SUB(current_bar, prev_bar) is TRUE (this implies prev_bar becomes PUS).
    # 2. prev_bar.l < peak_bar_for_cds.l (the PUS bar made a low below the old PDS peak's low).
    # 3. no_higher_high_intermediate: No bar between peak (excl) and prev_bar (incl) made H > peak.H.

    if not is_SUB(current_bar, prev_bar):
        return False

    # Condition 3: no_higher_high_intermediate (check for peak_bar_for_cds up to prev_bar)
    no_higher_high_intermediate = True
    if peak_bar_for_cds.index < prev_bar.index: 
        for j_1based_idx in range(peak_bar_for_cds.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar_for_cds.h:
                no_higher_high_intermediate = False
                break
    if not no_higher_high_intermediate:
        return False

    # Condition 2: prev_bar.l < peak_bar_for_cds.l
    cond2_prev_low_break = prev_bar.l < peak_bar_for_cds.l
    
    return cond2_prev_low_break

def check_custom_cds_confirmation_H(current_bar, prev_bar_is_peak):
    # Rule for CDS when current_bar is an outside bar of prev_bar (which is the peak).
    # Based on Ref Log Line 34 (MES data): CDS Bar 33 by Bar 34 (outside bar).
    # 1. current_bar.h > prev_bar_is_peak.h
    # 2. current_bar.l < prev_bar_is_peak.l
    # (Optional: current_bar.c > prev_bar_is_peak.c for bullish engulfing, but here for CDS implies reversal)
    cond_higher_high = current_bar.h > prev_bar_is_peak.h
    cond_lower_low = current_bar.l < prev_bar_is_peak.l
    # We might also require current_bar.c > prev_bar_is_peak.c to confirm the reversal for PUS generation
    cond_closes_stronger = current_bar.c > prev_bar_is_peak.c 
    return cond_higher_high and cond_lower_low and cond_closes_stronger # Added closes_stronger for PUS logic

def is_custom_pds_rule_B(current_bar, prev_bar):
    return current_bar.h <= prev_bar.h

def is_custom_pus_rule_B(current_bar, prev_bar):
    return current_bar.l >= prev_bar.l

def check_custom_cus_confirmation_ref36(current_bar, prev_bar, pds_candidate_bar):
    if current_bar.index == 55 and prev_bar.index == 53: # Original bar indices
        print(f"DEBUG REF36 CUS Check for UT52 by Bar55/53:")
        print(f"  current_bar (Bar55): L={current_bar.l}, H={current_bar.h}, C={current_bar.c}")
        print(f"  prev_bar (Bar53): C={prev_bar.c}")
        if pds_candidate_bar:
            print(f"  pds_candidate_bar (Bar{pds_candidate_bar.index}): L={pds_candidate_bar.l}, H={pds_candidate_bar.h}")
        else:
            print(f"  pds_candidate_bar is None")

    if pds_candidate_bar is None:
        if current_bar.index == 55 and prev_bar.index == 53: print("  REF36 Fail: pds_candidate_bar is None")
        return False
    
    original_cond_low_undercut = current_bar.l < pds_candidate_bar.l
    original_cond_high_respect = current_bar.h <= pds_candidate_bar.h
    new_cond_closes_stronger = current_bar.c > prev_bar.c
    
    if current_bar.index == 55 and prev_bar.index == 53:
        print(f"  Cond1 (curr.L < pds.L): {original_cond_low_undercut} ({current_bar.l} < {pds_candidate_bar.l})")
        print(f"  Cond2 (curr.H <= pds.H): {original_cond_high_respect} ({current_bar.h} <= {pds_candidate_bar.h})")
        print(f"  Cond3 (curr.C > prev.C): {new_cond_closes_stronger} ({current_bar.c} > {prev_bar.c})")
        print(f"  REF36 Result: {original_cond_low_undercut and original_cond_high_respect and new_cond_closes_stronger}")

    return original_cond_low_undercut and original_cond_high_respect and new_cond_closes_stronger

def check_custom_cus_confirmation_HHLL(current_bar, prev_bar):
    # CUS for prior PUS candidate is triggered if:
    # 1. current_bar makes a higher high than prev_bar.
    # 2. current_bar makes a lower low than prev_bar.
    # 3. NEW: current_bar closes below its open (is a down bar).
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o
    return cond1_higher_high and cond2_lower_low and cond3_down_close

def check_custom_cus_EngulfingUp(current_bar, prev_bar, initial_pds_candidate_bar_obj_for_context):
    # CUS for prior PUS candidate if current_bar is an engulfing up bar relative to prev_bar.
    # 1. current_bar.h > prev_bar.h
    # 2. current_bar.l < prev_bar.l
    # 3. current_bar.c > prev_bar.c
    # 4. current_bar.c > current_bar.o (current bar is an UP bar)
    # 5. NEW: current_bar.l < initial_pds_candidate_bar_obj.l (must also break below a relevant PDS low)
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l 
    cond3_closes_higher_than_prev_close = current_bar.c > prev_bar.c
    cond4_up_bar = current_bar.c > current_bar.o
    
    cond5_break_pds_low = False # Default to FALSE if no PDS context
    pds_context_details = "None (Cond5 default False)"
    if initial_pds_candidate_bar_obj_for_context is not None:
        cond5_break_pds_low = current_bar.l < initial_pds_candidate_bar_obj_for_context.l
        pds_context_details = f"PDS_Cand_Idx: {initial_pds_candidate_bar_obj_for_context.index}, PDS_Cand_L: {initial_pds_candidate_bar_obj_for_context.l}"
        
    final_result = cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low

    # Diagnostic print, especially for target line 32 (curr=32, prev=31)
    if current_bar.index == 32 and prev_bar.index == 31: 
        print(f"DEBUG EngulfingUp: Curr={current_bar.index}, Prev={prev_bar.index}, PUS_Cand_being_checked (not passed to func but from calling context)")
        print(f"  PDS Context Obj Passed: {'Exists' if initial_pds_candidate_bar_obj_for_context else 'None'}")
        print(f"  PDS Context Details: {pds_context_details}, Curr.L: {current_bar.l}")
        print(f"  Cond1(curr.h>prev.h): {cond1_higher_high} ({current_bar.h} > {prev_bar.h})")
        print(f"  Cond2(curr.l<prev.l): {cond2_lower_low} ({current_bar.l} < {prev_bar.l})")
        print(f"  Cond3(curr.c>prev.c): {cond3_closes_higher_than_prev_close} ({current_bar.c} > {prev_bar.c})")
        print(f"  Cond4(curr.c>curr.o): {cond4_up_bar} ({current_bar.c} > {current_bar.o})")
        print(f"  Cond5(curr.l<pds_low if pds else False): {cond5_break_pds_low}")
        print(f"  Final Result: {final_result}")
        
    return final_result

def load_bars_from_alt_csv(filename="trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv"):
    bars = []
    with open(filename, 'r', newline='') as f:
        reader = csv.DictReader(f)
        raw_bars = list(reader)

    # Data in file is chronological, so no need to reverse
    for i, row in enumerate(raw_bars):
        bars.append(Bar(
            date_str=row['timestamp'],
            o=row['open'],
            h=row['high'],
            l=row['low'],
            c=row['close'],
            original_file_line=i + 2, # +2 to account for header and 0-index
            chronological_index=i + 1 # 1-based chronological index
        ))
    return bars

# Helper function to get unique sorted events manually
def get_unique_sorted_events(descriptions):
    seen = set()
    unique_list = []
    # print(f"DEBUG get_unique_sorted_events INPUT: {descriptions}") # Optional: too verbose normally
    for item in descriptions:
        if item not in seen:
            seen.add(item)
            unique_list.append(item)
        # else:
            # print(f"DEBUG get_unique_sorted_events DUPLICATE SKIPPED: {item}") # Optional
    # print(f"DEBUG get_unique_sorted_events unique_list before sort: {unique_list}") # Optional
    # print(f"DEBUG get_unique_sorted_events RETURN: {sorted(unique_list)}") # Optional
    return sorted(unique_list)

def process_trend_logic(all_bars):
    if not all_bars:
        return []

    state = State()
    for k in range(len(all_bars)):
        log_index_for_this_entry = k + 1
        current_bar_event_descriptions = []
        if k == 0:
            state.log_entries.append(f"{log_index_for_this_entry}. Nothing")
            continue
        
        current_bar = all_bars[k]
        prev_bar = all_bars[k-1]
        
        # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
        if 57 <= log_index_for_this_entry <= 71:
            print(f"\\n--- DEBUG START: Processing Log Entry {log_index_for_this_entry} (CurrentBar: {current_bar.index}) ---")
            print(f"  PrevBar: {prev_bar.index if prev_bar else 'N/A'}")
            print(f"  State BEFORE CUS/CDS Eval:")
            print(f"    PUS Candidate Index: {state.confirmed_uptrend_candidate_low_bar_index}, Low: {state.confirmed_uptrend_candidate_low_low}")
            print(f"    PDS Candidate Index: {state.confirmed_downtrend_candidate_peak_bar_index}, High: {state.confirmed_downtrend_candidate_peak_high}")
            print(f"    Last Confirmed Trend: {state.last_confirmed_trend_type}, Bar Index: {state.last_confirmed_trend_bar_index}")
            print(f"    Overall Trend Is Up: {state.overall_trend_is_up}")
        # <<< END DETAILED DEBUGGING >>>
        
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
                pass # Handled by initial log when containment started
            elif current_bar.h <= state.containment_ref_high and \
                 current_bar.l >= state.containment_ref_low:
                state.containment_consecutive_bars_inside += 1
                current_bar_event_descriptions.append(
                    f"Containment: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                    f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low}) "
                    f"for {state.containment_consecutive_bars_inside} bars."
                )
            else: # Broke out of containment
                break_type = "moves outside"
                if current_bar.c > state.containment_ref_high: break_type = "BREAKOUT above"
                elif current_bar.c < state.containment_ref_low: break_type = "BREAKDOWN below"
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
            elif initial_pus_candidate_bar_obj: # Only if no PDS candidate
                chosen_candidate_ref_bar = initial_pus_candidate_bar_obj
                ref_type_for_log = "PUS_LOW"
            
            if chosen_candidate_ref_bar and chosen_candidate_ref_bar.index != current_bar.index:
                if current_bar.h <= chosen_candidate_ref_bar.h and \
                   current_bar.l >= chosen_candidate_ref_bar.l:
                    state.in_containment = True
                    state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                    state.containment_ref_type = ref_type_for_log
                    state.containment_ref_high = chosen_candidate_ref_bar.h
                    state.containment_ref_low = chosen_candidate_ref_bar.l
                    state.containment_start_bar_index_for_log = current_bar.index
                    state.containment_consecutive_bars_inside = 1 # current_bar is the first bar inside
                    current_bar_event_descriptions.append(
                        f"Containment START: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                        f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low})."
                    )
        # --- END CONTAINMENT LOGIC ---

        # --- Evaluate CUS Possibility (based on initial PUS candidate) ---
        can_confirm_cus = False
        cus_trigger_rule_type = None # e.g., "SDB", "REF36", "HHLL"
        
        if initial_pus_candidate_bar_obj is not None:
            sdb_triggers_cus = is_SDB(current_bar, prev_bar)
            
            sdb_cus_valid_context = True # Restored: sdb_cus_valid_context logic
            if sdb_triggers_cus and initial_pds_candidate_bar_obj is not None: 
                if current_bar.l < initial_pds_candidate_bar_obj.l:
                    sdb_cus_valid_context = False
            
            # Context for REF36 CUS rule
            ref36_pds_context_for_check = initial_pds_candidate_bar_obj 
            if not ref36_pds_context_for_check and state.confirmed_downtrend_candidate_peak_bar_index is not None:
                 ref36_pds_context_for_check = all_bars[state.confirmed_downtrend_candidate_peak_bar_index -1]
            ref36_triggers_cus = check_custom_cus_confirmation_ref36(current_bar, prev_bar, ref36_pds_context_for_check)

            hhll_triggers_cus = check_custom_cus_confirmation_HHLL(current_bar, prev_bar)
            engulfing_up_triggers_cus = check_custom_cus_EngulfingUp(current_bar, prev_bar, initial_pds_candidate_bar_obj)

            if log_index_for_this_entry == 54: # k=53, current_bar is original Bar 55
                print(f"DEBUG LOG 54 CUS TRIGGERS: sdb={sdb_triggers_cus}, sdb_valid={sdb_cus_valid_context}, ref36={ref36_triggers_cus}, hhll={hhll_triggers_cus}, engulf={engulfing_up_triggers_cus}")

            if sdb_triggers_cus and sdb_cus_valid_context: can_confirm_cus = True; cus_trigger_rule_type = "SDB" # Restored sdb_cus_valid_context usage
            elif ref36_triggers_cus: can_confirm_cus = True; cus_trigger_rule_type = "REF36"
            elif hhll_triggers_cus: can_confirm_cus = True; cus_trigger_rule_type = "HHLL"
            elif engulfing_up_triggers_cus: can_confirm_cus = True; cus_trigger_rule_type = "EngulfingUp"

        # --- Evaluate CDS Possibility (based on initial PDS candidate) ---
        can_confirm_cds = False
        cds_trigger_rule_type = None # e.g., "BRB", "A", "B", "F"
        
        if initial_pds_candidate_bar_obj is not None:
            # For BRB, 'no_higher_high_for_brb_path' needs initial_pds_candidate_bar_obj
            no_higher_high_for_brb_path = True
            if initial_pds_candidate_bar_obj.index < prev_bar.index:
                for j_1based_idx in range(initial_pds_candidate_bar_obj.index + 1, prev_bar.index + 1):
                    if all_bars[j_1based_idx - 1].h > initial_pds_candidate_bar_obj.h:
                        no_higher_high_for_brb_path = False; break
            
            # Original BRB rule was: is_BRB(current_bar, prev_bar) and current_bar.l < initial_pds_candidate_bar_obj.l and no_higher_high_for_brb_path
            # RelaxedLow was: is_BRB(current_bar, prev_bar) and no_higher_high_for_brb_path
            # New user rule: current_bar.l < initial_pds_candidate_bar_obj.o (Open of PDS bar)
            if is_BRB(current_bar, prev_bar) and no_higher_high_for_brb_path and \
               current_bar.l < initial_pds_candidate_bar_obj.o: 
                can_confirm_cds = True; cds_trigger_rule_type = "BRB_vs_PDSOpen"
            elif check_custom_cds_confirmation_A(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; cds_trigger_rule_type = "A"
            elif check_custom_cds_confirmation_B(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; cds_trigger_rule_type = "B"
            elif check_custom_cds_confirmation_F(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; cds_trigger_rule_type = "F"
            elif check_custom_cds_confirmation_G(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True; cds_trigger_rule_type = "G"
            # Check for Rule H if prev_bar was the peak PDS candidate
            elif initial_pds_candidate_bar_obj == prev_bar and \
                 check_custom_cds_confirmation_H(current_bar, prev_bar): # prev_bar is initial_pds_candidate_bar_obj
                can_confirm_cds = True; cds_trigger_rule_type = "H"

        # --- Apply Consequences (PRIORITY 1: CUS) ---
        if can_confirm_cus:
            confirmed_uptrend_this_iteration = True
            confirmed_bar_for_this_cus = initial_pus_candidate_bar_obj

            # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
            if 57 <= log_index_for_this_entry <= 71:
                print(f"  CUS TRIGGERED for PUS Bar {confirmed_bar_for_this_cus.index} by CurrentBar {current_bar.index}")
                print(f"    Rule: {cus_trigger_rule_type}")
                print(f"    Initial PDS for context (if used by rule): {initial_pds_candidate_bar_obj.index if initial_pds_candidate_bar_obj else 'None'}")
            # <<< END DETAILED DEBUGGING >>>

            if state.last_confirmed_trend_type == 'uptrend' and \
               confirmed_bar_for_this_cus.index > state.last_confirmed_trend_bar_index:
                if log_index_for_this_entry == 70: # ADDED DEBUG
                    print(f"    LOG_70_DEBUG_FORCED_DT: ENTERING forced DT block. Last Confirmed: {state.last_confirmed_trend_type} @ {state.last_confirmed_trend_bar_index}. Current CUS for Bar: {confirmed_bar_for_this_cus.index}")

                intervening_high_bar_for_dt = find_intervening_bar(all_bars, state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cus.index, find_lowest_low=False)
                
                if log_index_for_this_entry == 70: # ADDED DEBUG
                    print(f"    LOG_70_DEBUG_FORCED_DT: find_intervening_bar returned: {intervening_high_bar_for_dt.index if intervening_high_bar_for_dt else 'None'}")

                if intervening_high_bar_for_dt:
                    current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {intervening_high_bar_for_dt.index} ({intervening_high_bar_for_dt.date}) # FORCED to alternate")
                    if log_index_for_this_entry == 70: # ADDED DEBUG
                        print(f"    LOG_70_DEBUG_FORCED_DT: APPENDED 'Downtrend Start Confirmed for Bar {intervening_high_bar_for_dt.index}'. current_bar_event_descriptions is now: {current_bar_event_descriptions}")
                    
                    # Update state for this forced trend
                    state.last_confirmed_trend_type = 'downtrend'
                    state.last_confirmed_trend_bar_index = intervening_high_bar_for_dt.index
            
            current_bar_event_descriptions.append(f"Uptrend Start Confirmed for Bar {confirmed_bar_for_this_cus.index} ({confirmed_bar_for_this_cus.date})")
            state.overall_trend_is_up = True 
            state.last_confirmed_trend_type = 'uptrend' # This is the actual confirmed trend
            state.last_confirmed_trend_bar_index = confirmed_bar_for_this_cus.index
            
            cus_confirmed_bar = confirmed_bar_for_this_cus
            cus_triggering_bar = current_bar

            # Clear ALL PUS state as it's now confirmed.
            state.potential_uptrend_signal_bar_index = None
            state.potential_uptrend_anchor_low = None
            state.confirmed_uptrend_candidate_low_bar_index = None
            state.confirmed_uptrend_candidate_low_low = None
            state.confirmed_uptrend_candidate_low_high = None

            # Overall trend is now UP. Only PUS states that were part of this CUS are cleared.
            # PDS candidates remain active, allowing for a subsequent CDS if pattern forms.
            # state.potential_downtrend_signal_bar_index = None # DO NOT CLEAR
            # state.potential_downtrend_anchor_high = None      # DO NOT CLEAR
            # state.confirmed_downtrend_candidate_peak_bar_index = None # DO NOT CLEAR
            # state.confirmed_downtrend_candidate_peak_high = None    # DO NOT CLEAR
            # state.confirmed_downtrend_candidate_peak_low = None     # DO NOT CLEAR

            made_cus_bar_pds = False
            if cus_confirmed_bar and cus_triggering_bar: # Redundant check, but safe
                is_pds_by_trigger = False
                if is_SDB(cus_triggering_bar, cus_confirmed_bar) or \
                   is_your_custom_pds_rule(cus_triggering_bar, cus_confirmed_bar) or \
                   is_custom_pds_rule_B(cus_triggering_bar, cus_confirmed_bar):
                    is_pds_by_trigger = True
                
                if is_pds_by_trigger:
                    # Only set PDS on CUS bar if it's a new peak or no PDS exists
                    if state.confirmed_downtrend_candidate_peak_bar_index is None or \
                       cus_confirmed_bar.h > state.confirmed_downtrend_candidate_peak_high:
                        current_bar_event_descriptions.append(f"Potential Downtrend Signal on CUS Bar {cus_confirmed_bar.index} (due to trigger by {cus_triggering_bar.index})")
                        state.potential_downtrend_signal_bar_index = cus_confirmed_bar.index
                        state.potential_downtrend_anchor_high = cus_confirmed_bar.h
                        state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_bar.index
                        state.confirmed_downtrend_candidate_peak_high = cus_confirmed_bar.h
                        state.confirmed_downtrend_candidate_peak_low = cus_confirmed_bar.l
                        made_cus_bar_pds = True
                    # If not higher, we don't set it as PDS, and made_cus_bar_pds remains False,
                    # allowing original CUS PDS logic (like for HHLL) to run if applicable.

            if not made_cus_bar_pds: # Only apply original PDS logic if the above didn't set PDS
                if cus_trigger_rule_type == "HHLL":
                    current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})")
                    state.potential_downtrend_signal_bar_index = current_bar.index
                    state.potential_downtrend_anchor_high = current_bar.h
                    # This PDS becomes the new candidate
                    state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                    state.confirmed_downtrend_candidate_peak_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_low = current_bar.l
                elif cus_trigger_rule_type == "EngulfingUp":
                    # EngulfingUp CUS doesn't make PDS itself, let other PDS rules handle it if needed
                    pass
                else: # SDB or REF36 CUS (or EngulfingUp if it doesn't have specific PDS consequence)
                    # cus_bar_object (which is initial_pus_candidate_bar_obj) might become PDS
                    if cus_trigger_rule_type != "EngulfingUp": # Assuming EngulfingUp CUS doesn't make PDS itself
                        if state.confirmed_downtrend_candidate_peak_bar_index is None or \
                           cus_confirmed_bar.h > state.confirmed_downtrend_candidate_peak_high:
                            current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {cus_confirmed_bar.index} ({cus_confirmed_bar.date})")
                            state.potential_downtrend_signal_bar_index = cus_confirmed_bar.index
                            state.potential_downtrend_anchor_high = cus_confirmed_bar.h
                            state.confirmed_downtrend_candidate_peak_bar_index = cus_confirmed_bar.index
                            state.confirmed_downtrend_candidate_peak_high = cus_confirmed_bar.h
                            state.confirmed_downtrend_candidate_peak_low = cus_confirmed_bar.l
        
        # --- Apply Consequences (PRIORITY 2: CDS) ---
        if can_confirm_cds:
            confirmed_downtrend_this_iteration = True
            confirmed_bar_for_this_cds = initial_pds_candidate_bar_obj

            # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
            if 57 <= log_index_for_this_entry <= 71:
                print(f"  CDS TRIGGERED for PDS Bar {confirmed_bar_for_this_cds.index} by CurrentBar {current_bar.index}")
                print(f"    Rule: {cds_trigger_rule_type}")
                print(f"    Initial PUS for context (if used by rule): {initial_pus_candidate_bar_obj.index if initial_pus_candidate_bar_obj else 'None'}")
            # <<< END DETAILED DEBUGGING >>>

            if state.last_confirmed_trend_type == 'downtrend' and \
               confirmed_bar_for_this_cds.index > state.last_confirmed_trend_bar_index:
                intervening_low_bar_for_ut = find_intervening_bar(all_bars, state.last_confirmed_trend_bar_index, confirmed_bar_for_this_cds.index, find_lowest_low=True)
                if intervening_low_bar_for_ut:
                    current_bar_event_descriptions.append(f"Uptrend Start Confirmed for Bar {intervening_low_bar_for_ut.index} ({intervening_low_bar_for_ut.date}) # FORCED to alternate")
                    state.last_confirmed_trend_type = 'uptrend' 
                    state.last_confirmed_trend_bar_index = intervening_low_bar_for_ut.index
            
            current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {confirmed_bar_for_this_cds.index} ({confirmed_bar_for_this_cds.date})")
            state.overall_trend_is_up = False 
            state.last_confirmed_trend_type = 'downtrend'
            state.last_confirmed_trend_bar_index = confirmed_bar_for_this_cds.index

            cds_confirmed_bar = confirmed_bar_for_this_cds # Use the consistently named variable

            # NEW LOGIC: Invalidate/clear any PUS candidate that occurred at or before this confirmed CDS bar
            if state.confirmed_uptrend_candidate_low_bar_index is not None and \
               state.confirmed_uptrend_candidate_low_bar_index <= initial_pds_candidate_bar_obj.index:
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None
                state.confirmed_uptrend_candidate_low_bar_index = None
                state.confirmed_uptrend_candidate_low_low = None
                state.confirmed_uptrend_candidate_low_high = None
            
            # Overall trend is now DOWN. Only PDS states part of this CDS are cleared by CDS consequence.
            # PUS candidates remain active, allowing for a subsequent CUS.
            # state.potential_uptrend_signal_bar_index = None # DO NOT CLEAR
            # state.potential_uptrend_anchor_low = None     # DO NOT CLEAR
            # state.confirmed_uptrend_candidate_low_bar_index = None # DO NOT CLEAR
            # state.confirmed_uptrend_candidate_low_low = None    # DO NOT CLEAR
            # state.confirmed_uptrend_candidate_low_high = None   # DO NOT CLEAR

            # PDS state that was confirmed (initial_pds_candidate_bar_obj) IS cleared by its own CDS consequence later
            # The lines below ensure any *other* PDS states are NOT cleared by this overall trend change.
            # The actual PDS that was confirmed (initial_pds_candidate_bar_obj) will be cleared by its specific CDS consequence. 
            # Here, we only ensure that if a *different* PDS was somehow active, it doesn't get cleared by this generic sweep.
            # This block needs to be more precise about what PDS to clear vs keep
            # For now, the main idea is: DO NOT BLINDLY CLEAR ALL PDS ON CDS.
            # The confirmed PDS (initial_pds_candidate_bar_obj) gets its state handled by the cds_trigger_rule_type consequences.

            # The original PDS clearing logic from the very first version of this alternation:
            if state.confirmed_downtrend_candidate_peak_bar_index == cds_confirmed_bar.index:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None
                state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
            if state.potential_downtrend_signal_bar_index == cds_confirmed_bar.index:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None

            # PUS setting logic (now operates with potentially cleared PUS state)
            if cds_trigger_rule_type == "BRB_vs_PDSOpen": # Updated from BRB_RelaxedLow
                current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {current_bar.index} ({current_bar.date})")
                state.potential_uptrend_signal_bar_index = current_bar.index
                state.potential_uptrend_anchor_low = current_bar.l
                
                # Intelligent CUS candidate update for BRB
                chosen_pus_candidate_bar = current_bar
                if state.confirmed_uptrend_candidate_low_bar_index is not None and \
                   state.confirmed_uptrend_candidate_low_low is not None and \
                   state.confirmed_uptrend_candidate_low_low < current_bar.l: 
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
                    temp_pus_candidate_bar = all_bars[state.confirmed_uptrend_candidate_low_bar_index -1]
                else: # Find lowest_low
                    lowest_low_bar_search = None; min_l_val = float('inf')
                    s_start_0idx = initial_pds_candidate_bar_obj.index 
                    s_end_0idx = current_bar.index - 2 
                    if s_start_0idx <= s_end_0idx:
                        for i_0based in range(s_start_0idx, s_end_0idx + 1):
                            bar_in_range = all_bars[i_0based]
                            if bar_in_range.l < min_l_val: min_l_val = bar_in_range.l; lowest_low_bar_search = bar_in_range
                    if lowest_low_bar_search is not None:
                        temp_pus_candidate_bar = lowest_low_bar_search
                
                if temp_pus_candidate_bar is not None:
                    current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {temp_pus_candidate_bar.index} ({temp_pus_candidate_bar.date})")
                    state.potential_uptrend_signal_bar_index = temp_pus_candidate_bar.index
                    state.potential_uptrend_anchor_low = temp_pus_candidate_bar.l
                    state.confirmed_uptrend_candidate_low_bar_index = temp_pus_candidate_bar.index
                    state.confirmed_uptrend_candidate_low_low = temp_pus_candidate_bar.l
                    state.confirmed_uptrend_candidate_low_high = temp_pus_candidate_bar.h

            elif cds_trigger_rule_type == "G":
                # PUS for Rule G is prev_bar (which formed PUS due to current_bar SUB)
                # This PUS will also be picked up by the general PDS/PUS logic later,
                # but setting candidate state here is good.
                current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
                state.potential_uptrend_signal_bar_index = prev_bar.index
                state.potential_uptrend_anchor_low = prev_bar.l
                # Only update confirmed candidate if prev_bar is better or none exists
                if state.confirmed_uptrend_candidate_low_bar_index is None or \
                   prev_bar.l < state.confirmed_uptrend_candidate_low_low:
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = prev_bar.l
                    state.confirmed_uptrend_candidate_low_high = prev_bar.h
                    current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
                    # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
                    if 57 <= log_index_for_this_entry <= 71:
                        print(f"    PUS Candidate updated/set on prev_bar {prev_bar.index} to {prev_bar.index}, Low: {prev_bar.l}")
                    # <<< END DETAILED DEBUGGING >>>
                if state.potential_downtrend_signal_bar_index is not None:
                    state.potential_downtrend_signal_bar_index = None
                    state.potential_downtrend_anchor_high = None

            # PDS State update/clear for the confirmed CDS
            if cds_trigger_rule_type == "F": # Rule F specific PDS on current_bar
                current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})")
                state.potential_downtrend_signal_bar_index = current_bar.index
                state.potential_downtrend_anchor_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index # New PDS candidate
                state.confirmed_downtrend_candidate_peak_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_low = current_bar.l
            elif cds_trigger_rule_type == "H":
                # CDS for prev_bar (initial_pds_candidate_bar_obj) confirmed.
                # PUS on current_bar
                current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {current_bar.index} ({current_bar.date})")
                state.potential_uptrend_signal_bar_index = current_bar.index
                state.potential_uptrend_anchor_low = current_bar.l
                state.confirmed_uptrend_candidate_low_bar_index = current_bar.index
                state.confirmed_uptrend_candidate_low_low = current_bar.l
                state.confirmed_uptrend_candidate_low_high = current_bar.h
                # PDS on current_bar
                current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})")
                state.potential_downtrend_signal_bar_index = current_bar.index
                state.potential_downtrend_anchor_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index 
                state.confirmed_downtrend_candidate_peak_high = current_bar.h
                state.confirmed_downtrend_candidate_peak_low = current_bar.l
            
            # Clear the PDS states of the *just confirmed* initial_pds_candidate_bar_obj
            # Only if it wasn't immediately replaced by current_bar (e.g. by Rule F or CUS's HHLL)
            # This needs to be careful not to clear a new PDS set on current_bar if initial_pds == current_bar (not possible here)
            # Or if new PDS from CUS is different from initial_pds_candidate_bar_obj.
            # Simpler: If the current PDS candidate IS the one we just confirmed (initial_pds_candidate_bar_obj), it means no newer PDS took precedence.
            if state.confirmed_downtrend_candidate_peak_bar_index == initial_pds_candidate_bar_obj.index:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None
                state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
            # Also ensure active PDS signal for initial_pds_candidate_bar_obj is cleared if it was that one.
            if state.potential_downtrend_signal_bar_index == initial_pds_candidate_bar_obj.index:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None

        # --- Check for New Potential Signals (on prev_bar) ---
        # PDS Rule C (Failed Rally PDS on current_bar) is checked first
        new_pds_on_curr_bar_this_iteration = False 
        if current_bar.h > prev_bar.h and current_bar.c < current_bar.o: # Outer if for PDS Rule C
            # Always set current_bar as PDS candidate if Rule C conditions are met,
            # potentially overriding an older, higher PDS if this is a fresh failed rally.
            # (Original check was: if state.confirmed_downtrend_candidate_peak_bar_index is None or 
            # current_bar.h > state.confirmed_downtrend_candidate_peak_high:)
            current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date}) by Rule C")
            state.potential_downtrend_signal_bar_index = current_bar.index
            state.potential_downtrend_anchor_high = current_bar.h
            state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
            state.confirmed_downtrend_candidate_peak_high = current_bar.h
            state.confirmed_downtrend_candidate_peak_low = current_bar.l
            new_pds_on_curr_bar_this_iteration = True
            
            # This following 'if' should be at the same indentation level as the 'inner if' above,
            # still inside the 'outer if for PDS Rule C'
            if state.potential_uptrend_signal_bar_index == current_bar.index:
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None

        # Check for PDS on prev_bar, allow if no CDS confirmed for a *different* peak this iteration
        # And PDS Rule C didn't just fire for current_bar (to avoid double PDS setting if curr becomes prev)
        if not confirmed_downtrend_this_iteration and not new_pds_on_curr_bar_this_iteration:
            # This 'if' starts the PDS-on-prev-bar logic
            if is_SDB(current_bar, prev_bar) or \
               is_your_custom_pds_rule(current_bar, prev_bar) or \
               is_custom_pds_rule_B(current_bar, prev_bar): 
                
                # --- Modified PDS Candidate Update Logic ---
                old_pds_idx = state.confirmed_downtrend_candidate_peak_bar_index
                old_pds_high = state.confirmed_downtrend_candidate_peak_high
                STALE_THRESHOLD = 3 # Define how many bars make a PDS candidate "stale"

                can_set_pds_on_prev_bar = False
                if old_pds_idx is None or \
                   prev_bar.h > old_pds_high: # Only allow replacement if prev_bar (new PDS) has a higher high
                    can_set_pds_on_prev_bar = True
                
                if can_set_pds_on_prev_bar:
                    state.potential_downtrend_signal_bar_index = prev_bar.index
                    state.potential_downtrend_anchor_high = prev_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                    state.confirmed_downtrend_candidate_peak_high = prev_bar.h
                    state.confirmed_downtrend_candidate_peak_low = prev_bar.l
                    current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
                    
                    # If PDS is set on prev_bar, and PUS was also potentially on prev_bar, clear PUS.
                    # This check ensures PDS takes precedence if both could form on prev_bar from current_bar's action.
                    if state.potential_uptrend_signal_bar_index == prev_bar.index:
                        state.potential_uptrend_signal_bar_index = None
                        state.potential_uptrend_anchor_low = None
                    if state.confirmed_uptrend_candidate_low_bar_index == prev_bar.index:
                        # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
                        if 57 <= log_index_for_this_entry <= 71 and state.confirmed_uptrend_candidate_low_bar_index is not None :
                            print(f"    Clearing PUS candidate {state.confirmed_uptrend_candidate_low_bar_index} because PDS set on prev_bar {prev_bar.index}")
                        # <<< END DETAILED DEBUGGING >>>
                        state.confirmed_uptrend_candidate_low_bar_index = None
                        state.confirmed_uptrend_candidate_low_low = None
                        state.confirmed_uptrend_candidate_low_high = None
                # --- End of Modified PDS Candidate Update Logic ---

                # The original code for clearing PUS if PDS was set on prev_bar was effectively moved into the 'if can_set_pds_on_prev_bar' block.
                # Original PUS clearing logic (now integrated above if PDS is actually set):
                # if state.potential_uptrend_signal_bar_index is not None: # This was too broad
                # state.potential_uptrend_signal_bar_index = None
                # state.potential_uptrend_anchor_low = None
        
        # Check for PUS on prev_bar, allow if no CUS confirmed for a *different* trough this iteration
        # And PDS Rule C didn't just fire for current_bar (as that's a bearish signal)
        if not confirmed_uptrend_this_iteration and not new_pds_on_curr_bar_this_iteration:
            # This 'if' starts the PUS-on-prev-bar logic
            if is_SUB(current_bar, prev_bar) or \
                 is_your_custom_pus_rule(current_bar, prev_bar) or \
                 is_custom_pus_rule_B(current_bar, prev_bar): 
                state.potential_uptrend_signal_bar_index = prev_bar.index
                state.potential_uptrend_anchor_low = prev_bar.l
                if state.confirmed_uptrend_candidate_low_bar_index is None or \
                   prev_bar.l < state.confirmed_uptrend_candidate_low_low:
                    state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                    state.confirmed_uptrend_candidate_low_low = prev_bar.l
                    state.confirmed_uptrend_candidate_low_high = prev_bar.h
                    current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
                    # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
                    if 57 <= log_index_for_this_entry <= 71:
                        print(f"    PUS Candidate updated/set on prev_bar {prev_bar.index} to {prev_bar.index}, Low: {prev_bar.l}")
                    # <<< END DETAILED DEBUGGING >>>
                if state.potential_downtrend_signal_bar_index is not None:
                    state.potential_downtrend_signal_bar_index = None
                    state.potential_downtrend_anchor_high = None

        if not current_bar_event_descriptions:
            final_log_text = "Neutral"
        else:
            if log_index_for_this_entry == 70: # ADDED DEBUG
                print(f"    LOG_70_DEBUG_EVENTS_BEFORE_MANUAL_UNIQUE: current_bar_event_descriptions = {current_bar_event_descriptions}")
            
            unique_events = get_unique_sorted_events(current_bar_event_descriptions) # NEW WAY
            
            if log_index_for_this_entry == 70: # ADDED DEBUG
                print(f"    LOG_70_DEBUG_EVENTS_AFTER_MANUAL_UNIQUE: unique_events = {unique_events}")

            final_log_text = "; ".join(unique_events)
        
        # <<< DETAILED DEBUGGING FOR BARS 57-71 >>>
        if 57 <= log_index_for_this_entry <= 71:
            print(f"  State AFTER CUS/CDS and PDS/PUS updates:")
            print(f"    PUS Candidate Index: {state.confirmed_uptrend_candidate_low_bar_index}, Low: {state.confirmed_uptrend_candidate_low_low}")
            print(f"    PDS Candidate Index: {state.confirmed_downtrend_candidate_peak_bar_index}, High: {state.confirmed_downtrend_candidate_peak_high}")
            print(f"    Last Confirmed Trend: {state.last_confirmed_trend_type}, Bar Index: {state.last_confirmed_trend_bar_index}")
            print(f"    Overall Trend Is Up: {state.overall_trend_is_up}")
            print(f"  LOGGED FOR {log_index_for_this_entry}: {final_log_text}")
            print(f"--- DEBUG END: Processing Log Entry {log_index_for_this_entry} ---")
        # <<< END DETAILED DEBUGGING >>>

        state.log_entries.append(f"{log_index_for_this_entry}. {final_log_text}")
    return state.log_entries

def export_confirmed_trend_starts(log_entries, output_csv="trend_analysis/confirmed_trend_starts.csv"):
    import re
    rows = []
    # Regex to match trend start lines
    downtrend_re = re.compile(r"Downtrend Start Confirmed for Bar (\d+) \(([^)]+)\)")
    uptrend_re = re.compile(r"Uptrend Start Confirmed for Bar (\d+) \(([^)]+)\)")
    
    processed_entries = set() # To store unique (trend_type, bar_index, date) tuples

    for entry_idx, entry in enumerate(log_entries):
        if (entry_idx + 1) == 57: # Specific debug for entry 57 (was 70)
            print(f"DEBUG EXPORT Line 57 raw entry: {repr(entry)}")

        print(f"\nExporting log entry {entry_idx + 1}: {entry}") # Log the entry being processed
        m_down = downtrend_re.search(entry)
        if m_down:
            bar_idx = int(m_down.group(1))
            date_str = m_down.group(2)
            trend_key = ('downtrend', bar_idx, date_str)
            print(f"  Matched DT: key={trend_key}")
            if trend_key not in processed_entries:
                rows.append({
                    'trend_type': 'downtrend',
                    'bar_index': bar_idx, 
                    'date': date_str
                })
                processed_entries.add(trend_key)
                print(f"    Added DT: {trend_key}")
            else:
                print(f"    Skipped DT (duplicate): {trend_key}")
        
        m_up = uptrend_re.search(entry)
        if m_up:
            bar_idx = int(m_up.group(1))
            date_str = m_up.group(2)
            trend_key = ('uptrend', bar_idx, date_str)
            print(f"  Matched UT: key={trend_key}")
            if trend_key not in processed_entries:
                rows.append({
                    'trend_type': 'uptrend',
                    'bar_index': bar_idx, 
                    'date': date_str
                })
                processed_entries.add(trend_key)
                print(f"    Added UT: {trend_key}")
            else:
                print(f"    Skipped UT (duplicate): {trend_key}")
        
        if not m_down and not m_up:
            print(f"  No trend confirmation found in entry.")

    print(f"\nTotal trends extracted before sort: {len(rows)}")

    # Sort rows by bar_index, then by trend_type if bar_index is same (e.g. for bar 232)
    rows.sort(key=lambda x: (x['bar_index'], x['trend_type']))
    print(f"Total trends after sort (should be same): {len(rows)}")
    
    # Write to CSV (using raw de-duplicated rows)
    with open(output_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['trend_type', 'bar_index', 'date'])
        writer.writeheader()
        writer.writerows(rows) # Write the original de-duplicated and sorted rows
    print(f"Exported {len(rows)} confirmed trend starts to {output_csv}") # Print count of raw rows

# Helper function for forcing alternation
def find_intervening_bar(all_bars, start_bar_idx_1based, end_bar_idx_1based, find_lowest_low=True):
    print(f"DEBUG find_intervening_bar CALLED: start_idx={start_bar_idx_1based}, end_idx={end_bar_idx_1based}, find_low={find_lowest_low}") # ADDED
    # 1-based indices converted to 0-based for slicing
    start_0idx = start_bar_idx_1based -1
    end_0idx = end_bar_idx_1based -1 # slice goes up to, but not including, end_0idx+1

    if start_0idx < 0 or end_0idx >= len(all_bars) or start_0idx > end_0idx:
        return None
    
    # Ensure the slice is valid and not empty. Slice is inclusive of start_0idx, exclusive of end_0idx for intervening.
    # For [A, B, C, D], if A is last_confirmed (idx_A) and D is current_confirmed (idx_D),
    # we search B, C. So range is (idx_A+1) to (idx_D-1).
    # So search_start_0idx = start_0idx + 1, search_end_0idx = end_0idx -1 (for list slicing: search_end_0idx + 1)
    
    search_start_0idx = start_0idx + 1 
    search_end_0idx = end_0idx - 1

    if search_start_0idx > search_end_0idx: # No bars in between
        return None

    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice:
        print(f"DEBUG find_intervening_bar RETURNING None: relevant_slice is empty") # ADDED
        return None

    if find_lowest_low:
        chosen_bar =  min(relevant_slice, key=lambda bar: bar.l)
    else: # find highest_high
        chosen_bar = max(relevant_slice, key=lambda bar: bar.h)
    print(f"DEBUG find_intervening_bar RETURNING: {chosen_bar.index if chosen_bar else 'None'}. Slice_indices: {search_start_0idx}-{search_end_0idx}. Range: {start_bar_idx_1based}-{end_bar_idx_1based}, FindLow={find_lowest_low}.") # MODIFIED EXISTING PRINT
    return chosen_bar

if __name__ == "__main__":
    try:
        # Corrected path assuming script is run from workspace root
        csv_file_path = "data/CON.F.US.MES.M25_4h_ohlc.csv" 
        all_bars_chronological = load_bars_from_alt_csv(filename=csv_file_path)
        if not all_bars_chronological:
            print(f"No bars were loaded. Check CSV file path '{csv_file_path}' and format.")
        else:
            print(f"Loaded {len(all_bars_chronological)} bars.")
            output_log = process_trend_logic(all_bars_chronological)
            print("\n--- Generated Trend Log ---")
            for entry in output_log:
                print(entry)
            # Export confirmed trend starts
            export_confirmed_trend_starts(output_log, output_csv="trend_analysis/confirmed_trend_starts.csv")
    except FileNotFoundError:
        print(f"Error: The CSV data file '{csv_file_path}' was not found. Make sure it's in the correct directory, or update the path.")
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc() 