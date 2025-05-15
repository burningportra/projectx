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
    # Rule for confirming CDS on peak_bar_for_cds when current_bar closes.
    # Conditions based on user description for Ref Log Line 8 (CDS for 2019-05-10 by 2019-05-15 close).
    # 1. current_bar.h > prev_bar.h
    # 2. current_bar.c > prev_bar.c
    # 3. No bar between (peak_bar_for_cds + 1) and (prev_bar) made a high > peak_bar_for_cds.h.
    # 4. current_bar.l < peak_bar_for_cds.l (original peak bar low).
    # 5. NEW: At least one bar between peak_bar_for_cds (exclusive) and current_bar (exclusive, i.e., up to prev_bar)
    #    must have made a low <= peak_bar_for_cds.l.

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
    # Rule for confirming CDS on peak_bar_for_cds when current_bar closes.
    # Conditions based on user description for Ref Log Line 46.
    # 1. current_bar.c > prev_bar.c
    # 2. current_bar.l >= prev_bar.l
    # 3. current_bar.h > peak_bar_for_cds.h
    # 4. No bar between (peak_bar_for_cds + 1) and (prev_bar) made a high > peak_bar_for_cds.h.
    # 5. NEW: At least one bar between peak_bar_for_cds (exclusive) and current_bar (exclusive, i.e., up to prev_bar)
    #    must have made a low <= peak_bar_for_cds.l.

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

def is_custom_pds_rule_B(current_bar, prev_bar):
    # PDS on prev_bar if current_bar does not make a high greater than prev_bar's high.
    # As per user rule for PDS on Bar 33 (06-20) when Bar 34 (06-21) closes.
    # Consider adding current_bar.c < prev_bar.c if this is too loose.
    return current_bar.h <= prev_bar.h

def is_custom_pus_rule_B(current_bar, prev_bar):
    # Symmetrical PUS rule: PUS on prev_bar if current_bar does not make a low lower than prev_bar's low.
    # Consider adding current_bar.c > prev_bar.c if this is too loose.
    return current_bar.l >= prev_bar.l

def check_custom_cus_confirmation_ref36(current_bar, pds_candidate_bar):
    # For CUS of an older PUS candidate, triggered by current_bar's relation to a PDS candidate.
    # e.g., CUS for Bar 28, triggered by Bar 36 undercutting PDS Bar 33's low while respecting its high.
    if pds_candidate_bar is None: # Need a PDS candidate to reference
        return False
    return (current_bar.l < pds_candidate_bar.l and \
            current_bar.h <= pds_candidate_bar.h)

def check_custom_cus_confirmation_HHLL(current_bar, prev_bar):
    # CUS for prior PUS candidate is triggered if:
    # 1. current_bar makes a higher high than prev_bar.
    # 2. current_bar makes a lower low than prev_bar.
    return current_bar.h > prev_bar.h and current_bar.l < prev_bar.l

def load_bars_from_csv(filename="data/MNQ Bar Data(2019-05-06 - 2019-06-28).csv"):
    bars = []
    with open(filename, 'r', newline='') as f:
        reader = csv.DictReader(f)
        raw_bars = list(reader) # Read all bars

    # Data in file is reverse chronological, so reverse it first
    raw_bars.reverse() 

    for i, row in enumerate(raw_bars):
        # Assuming Date,Open,High,Low,Close are the exact column names
        bars.append(Bar(
            date_str=row['Date'],
            o=row['Open'],
            h=row['High'],
            l=row['Low'],
            c=row['Close'],
            original_file_line=len(raw_bars) - i + 1, # Line number from original file (approx)
            chronological_index=i + 1 # 1-based chronological index
        ))
    return bars

def process_trend_logic(all_bars):
    if not all_bars:
        return []

    state = State()
    
    # Log entries will correspond to the state *after* processing the bar at that index.
    # The loop processes each bar (0-indexed `k`) to determine the log entry for `k+1`.

    for k in range(len(all_bars)):
        log_index_for_this_entry = k + 1 # Log is 1-based
        current_bar_event_descriptions = []

        if k == 0: # Processing the first bar (Bar 1)
            # According to your log "1. Nothing"
            state.log_entries.append(f"{log_index_for_this_entry}. Nothing")
            continue # Move to the next iteration, which will use Bar 1 as prev_bar

        # For k > 0, we have a current_bar and prev_bar
        current_bar = all_bars[k] # Bar at index k (e.g., all_bars[1] is Bar 2)
        prev_bar = all_bars[k-1]  # Bar at index k-1 (e.g., all_bars[0] is Bar 1)
        
        confirmed_downtrend_this_iteration = False
        confirmed_uptrend_this_iteration = False

        # --- CDS Confirmation ---
        # A PDS (represented by confirmed_downtrend_candidate_peak_bar_index) must exist.
        # This rule is evaluated when current_bar closes.
        # The CDS is for the confirmed_downtrend_candidate_peak_bar_index.
        # The PUS is for current_bar (if BRB) or prev_bar (if SUB, though this was removed from PDS section).
        if state.confirmed_downtrend_candidate_peak_bar_index is not None:
            peak_bar_for_confirmed_downtrend = all_bars[state.confirmed_downtrend_candidate_peak_bar_index - 1] # Get the actual Bar object of the candidate peak

            # --- Standard CDS Confirmation (using BRB) ---
            # Check no higher high between (peak_bar + 1) and prev_bar (inclusive)
            # This logic is now part of check_custom_cds_confirmation_A and also needed for BRB path
            no_higher_high_for_brb_path = True
            if state.confirmed_downtrend_candidate_peak_bar_index < prev_bar.index: # Check intermediate bars up to prev_bar
                for j_1based_idx in range(state.confirmed_downtrend_candidate_peak_bar_index + 1, prev_bar.index + 1):
                    if all_bars[j_1based_idx - 1].h > peak_bar_for_confirmed_downtrend.h:
                        no_higher_high_for_brb_path = False
                        break
            
            if is_BRB(current_bar, prev_bar) and \
               current_bar.l < peak_bar_for_confirmed_downtrend.l and \
               no_higher_high_for_brb_path:
                
                current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {peak_bar_for_confirmed_downtrend.index} ({peak_bar_for_confirmed_downtrend.date})")
                current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {current_bar.index} ({current_bar.date})")
                state.potential_uptrend_signal_bar_index = current_bar.index
                state.potential_uptrend_anchor_low = current_bar.l
                state.confirmed_uptrend_candidate_low_bar_index = current_bar.index
                state.confirmed_uptrend_candidate_low_low = current_bar.l
                state.confirmed_uptrend_candidate_low_high = current_bar.h
                
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None
                state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
                confirmed_downtrend_this_iteration = True
            
            # --- Custom CDS Confirmation Rule A ---
            elif not confirmed_downtrend_this_iteration and \
                 check_custom_cds_confirmation_A(current_bar, prev_bar, peak_bar_for_confirmed_downtrend, all_bars):
                
                current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {peak_bar_for_confirmed_downtrend.index} ({peak_bar_for_confirmed_downtrend.date})")
                
                # Determine PUS after CDS: Prioritize existing PUS candidate
                if state.confirmed_uptrend_candidate_low_bar_index is not None:
                    pus_candidate_idx = state.confirmed_uptrend_candidate_low_bar_index
                    pus_bar_object_for_log = all_bars[pus_candidate_idx - 1]
                    current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {pus_candidate_idx} ({pus_bar_object_for_log.date})")
                    state.potential_uptrend_signal_bar_index = pus_candidate_idx
                    state.potential_uptrend_anchor_low = pus_bar_object_for_log.l
                    # The existing candidate remains the candidate
                else: # No existing PUS candidate.
                    # New rule: Find the lowest low bar AFTER the confirmed peak (peak_bar_for_confirmed_downtrend)
                    # and strictly BEFORE the current_bar (trigger bar). This bar becomes the PUS.
                    # The search range is (peak_bar_for_confirmed_downtrend.index + 1) to (current_bar.index - 1).
                    lowest_low_bar_for_pus = None
                    min_low_val = float('inf')
                    
                    # peak_bar_for_confirmed_downtrend.index is 1-based. current_bar.index is 1-based.
                    # Start search from the bar immediately after the peak.
                    search_start_0idx = peak_bar_for_confirmed_downtrend.index # 0-based index for (peak.index + 1)th bar
                    # End search at the bar immediately before the current_bar (trigger bar).
                    search_end_0idx = current_bar.index - 2 # 0-based index for (current_bar.index - 1)th bar

                    if search_start_0idx <= search_end_0idx:
                        for i_0based in range(search_start_0idx, search_end_0idx + 1):
                            bar_in_range = all_bars[i_0based]
                            if bar_in_range.l < min_low_val:
                                min_low_val = bar_in_range.l
                                lowest_low_bar_for_pus = bar_in_range
                    
                    if lowest_low_bar_for_pus is not None:
                        current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {lowest_low_bar_for_pus.index} ({lowest_low_bar_for_pus.date})")
                        state.potential_uptrend_signal_bar_index = lowest_low_bar_for_pus.index
                        state.potential_uptrend_anchor_low = lowest_low_bar_for_pus.l
                        state.confirmed_uptrend_candidate_low_bar_index = lowest_low_bar_for_pus.index 
                        state.confirmed_uptrend_candidate_low_low = lowest_low_bar_for_pus.l
                        state.confirmed_uptrend_candidate_low_high = lowest_low_bar_for_pus.h
                    # else:
                        # If no such bar is found (e.g., if current_bar is peak_bar + 1), then no PUS is set by this specific logic.
                        # This implies the conditions for check_custom_cds_confirmation_A might inherently require some separation.
                        # Or, another PUS formation rule might take precedence in such edge cases.
                        # For the scenario (Bar 33 CDS, Bar 36 PUS, Bar 39 Trigger), lowest_low_bar_for_pus should be found.
                        # print(f"Debug: No lowest_low_bar_for_pus found for CDS {peak_bar_for_confirmed_downtrend.index} trigger {current_bar.index}")

                # Clear the confirmed PDS state
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None
                state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
                confirmed_downtrend_this_iteration = True
            
            # --- Custom CDS Confirmation Rule B ---
            elif not confirmed_downtrend_this_iteration and \
                 check_custom_cds_confirmation_B(current_bar, prev_bar, peak_bar_for_confirmed_downtrend, all_bars):
                
                current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {peak_bar_for_confirmed_downtrend.index} ({peak_bar_for_confirmed_downtrend.date})")
                
                # PUS Selection: lowest low after peak, before current (same as Rule A's PUS logic)
                # Prioritize existing PUS candidate if one somehow formed through other means (unlikely for this path)
                if state.confirmed_uptrend_candidate_low_bar_index is not None:
                    pus_candidate_idx = state.confirmed_uptrend_candidate_low_bar_index
                    pus_bar_object_for_log = all_bars[pus_candidate_idx - 1]
                    current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {pus_candidate_idx} ({pus_bar_object_for_log.date})")
                    state.potential_uptrend_signal_bar_index = pus_candidate_idx
                    state.potential_uptrend_anchor_low = pus_bar_object_for_log.l
                else: 
                    lowest_low_bar_for_pus = None
                    min_low_val = float('inf')
                    search_start_0idx = peak_bar_for_confirmed_downtrend.index 
                    search_end_0idx = current_bar.index - 2 

                    if search_start_0idx <= search_end_0idx:
                        for i_0based in range(search_start_0idx, search_end_0idx + 1):
                            bar_in_range = all_bars[i_0based]
                            if bar_in_range.l < min_low_val:
                                min_low_val = bar_in_range.l
                                lowest_low_bar_for_pus = bar_in_range
                    
                    if lowest_low_bar_for_pus is not None:
                        current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {lowest_low_bar_for_pus.index} ({lowest_low_bar_for_pus.date})")
                        state.potential_uptrend_signal_bar_index = lowest_low_bar_for_pus.index
                        state.potential_uptrend_anchor_low = lowest_low_bar_for_pus.l
                        state.confirmed_uptrend_candidate_low_bar_index = lowest_low_bar_for_pus.index 
                        state.confirmed_uptrend_candidate_low_low = lowest_low_bar_for_pus.l
                        state.confirmed_uptrend_candidate_low_high = lowest_low_bar_for_pus.h
                
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                state.confirmed_downtrend_candidate_peak_bar_index = None
                state.confirmed_downtrend_candidate_peak_high = None
                state.confirmed_downtrend_candidate_peak_low = None
                confirmed_downtrend_this_iteration = True
        
        # --- Check for Confirmed Uptrend Start (CUS) ---
        # This rule is evaluated when current_bar closes.
        # Confirmation is for the state.confirmed_uptrend_candidate_low_bar_index.
        # The trigger is if current_bar is an SDB relative to prev_bar OR custom rule ref36.
        if not confirmed_downtrend_this_iteration and \
           state.confirmed_uptrend_candidate_low_bar_index is not None:
            
            standard_sdb_trigger = is_SDB(current_bar, prev_bar)
            # standard_sub_trigger = is_SUB(current_bar, prev_bar) # REVERTED - Removing general SUB trigger for CUS
            
            custom_ref36_trigger = False
            if state.confirmed_downtrend_candidate_peak_bar_index is not None:
                pds_candidate_for_ref36_check = all_bars[state.confirmed_downtrend_candidate_peak_bar_index - 1]
                if check_custom_cus_confirmation_ref36(current_bar, pds_candidate_for_ref36_check):
                    custom_ref36_trigger = True
            
            hhll_cus_trigger = check_custom_cus_confirmation_HHLL(current_bar, prev_bar)

            if standard_sdb_trigger or custom_ref36_trigger or hhll_cus_trigger:
                cus_candidate_bar_index = state.confirmed_uptrend_candidate_low_bar_index
                cus_bar_object = all_bars[cus_candidate_bar_index - 1]
                
                current_bar_event_descriptions.append(f"Uptrend Start Confirmed for Bar {cus_candidate_bar_index} ({cus_bar_object.date})")
                
                # Clear ALL PUS state as it's now confirmed.
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None
                state.confirmed_uptrend_candidate_low_bar_index = None
                state.confirmed_uptrend_candidate_low_low = None
                state.confirmed_uptrend_candidate_low_high = None

                if hhll_cus_trigger:
                    # HHLL CUS Trigger: PDS is on current_bar, it becomes the new peak candidate.
                    current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})")
                    state.potential_downtrend_signal_bar_index = current_bar.index
                    state.potential_downtrend_anchor_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                    state.confirmed_downtrend_candidate_peak_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_low = current_bar.l
                else:
                    # Standard SDB/Ref36 CUS Trigger: PDS logic is based on cus_bar_object
                    became_cds_candidate = False
                    if state.confirmed_downtrend_candidate_peak_bar_index is None or \
                       cus_bar_object.h > state.confirmed_downtrend_candidate_peak_high:
                        state.confirmed_downtrend_candidate_peak_bar_index = cus_candidate_bar_index 
                        state.confirmed_downtrend_candidate_peak_high = cus_bar_object.h
                        state.confirmed_downtrend_candidate_peak_low = cus_bar_object.l
                        became_cds_candidate = True
                    
                    if became_cds_candidate:
                        current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {cus_candidate_bar_index} ({cus_bar_object.date})")
                        state.potential_downtrend_signal_bar_index = cus_candidate_bar_index
                        state.potential_downtrend_anchor_high = cus_bar_object.h

                confirmed_uptrend_this_iteration = True
        
        # --- Check for New Potential Signals ---
        # This block will now run in every iteration, regardless of whether a CUS/CDS was confirmed above.
        # This allows a single bar\'s close to both confirm an old trend and initiate a new potential signal.
        # if not confirmed_downtrend_this_iteration and not confirmed_uptrend_this_iteration: # This condition is REMOVED
        
        # Check for a new Potential Downtrend Signal (PDS) based on current_bar and prev_bar
        # This can be a Simple Down Bar OR your custom PDS rule A OR custom PDS rule B
        if is_SDB(current_bar, prev_bar) or \
           is_your_custom_pds_rule(current_bar, prev_bar) or \
           is_custom_pds_rule_B(current_bar, prev_bar): 
            # Internally, prev_bar is now showing a potential downtrend signal start
            state.potential_downtrend_signal_bar_index = prev_bar.index
            state.potential_downtrend_anchor_high = prev_bar.h
            
            # Update the main candidate for a confirmed downtrend start
            # if this prev_bar represents a more significant peak (higher high)
            # or if no candidate currently exists.
            if state.confirmed_downtrend_candidate_peak_bar_index is None or \
               prev_bar.h > state.confirmed_downtrend_candidate_peak_high:
                state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                state.confirmed_downtrend_candidate_peak_high = prev_bar.h
                state.confirmed_downtrend_candidate_peak_low = prev_bar.l
                # Only log it if it becomes the primary candidate
                current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
            
            # If a new PDS forms, clear the *active* PUS signal
            if state.potential_uptrend_signal_bar_index is not None:
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None
                # Previously, we also cleared: state.confirmed_uptrend_candidate_low_bar_index, low_low, low_high

        # Check for a new Potential Uptrend Signal (PUS) based on current_bar and prev_bar
        # This can be a Simple Up Bar OR your custom PUS rule A OR custom PUS rule B
        elif is_SUB(current_bar, prev_bar) or \
             is_your_custom_pus_rule(current_bar, prev_bar) or \
             is_custom_pus_rule_B(current_bar, prev_bar): 
            # Internally, prev_bar is now showing a potential uptrend signal start
            state.potential_uptrend_signal_bar_index = prev_bar.index
            state.potential_uptrend_anchor_low = prev_bar.l
            
            # Update the main candidate for a confirmed uptrend start
            # if this prev_bar represents a more significant trough (lower low)
            # or if no candidate currently exists.
            if state.confirmed_uptrend_candidate_low_bar_index is None or \
               prev_bar.l < state.confirmed_uptrend_candidate_low_low:
                state.confirmed_uptrend_candidate_low_bar_index = prev_bar.index
                state.confirmed_uptrend_candidate_low_low = prev_bar.l
                state.confirmed_uptrend_candidate_low_high = prev_bar.h # Store its high too
                # Only log it if it becomes the primary candidate
                current_bar_event_descriptions.append(f"Potential Uptrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
            
            # If a new PUS forms, clear the *active* PDS signal
            if state.potential_downtrend_signal_bar_index is not None:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
                # Previously, we also cleared: state.confirmed_downtrend_candidate_peak_bar_index, peak_high, peak_low
        
        # --- Construct final log entry for this bar\'s index ---
        if not current_bar_event_descriptions:
            final_log_text = "Neutral"
        else:
            # Convert to set to remove exact duplicate event strings,
            # then convert back to a list and sort for consistent output order.
            unique_events = sorted(list(set(current_bar_event_descriptions)))
            final_log_text = "; ".join(unique_events)
        
        state.log_entries.append(f"{log_index_for_this_entry}. {final_log_text}") # Add the composed log string
        
    return state.log_entries # Return all collected log entries


if __name__ == "__main__":
    try:
        # Ensure 'data' directory exists or adjust path
        csv_file_path = "data/MNQ Bar Data(2019-05-06-2019-8-14).csv"
        all_bars_chronological = load_bars_from_csv(filename=csv_file_path)
        
        if not all_bars_chronological:
            print(f"No bars were loaded. Check CSV file path '{csv_file_path}' and format.")
        else:
            print(f"Loaded {len(all_bars_chronological)} bars.")
            output_log = process_trend_logic(all_bars_chronological)
            
            print("\n--- Generated Trend Log ---")
            for entry in output_log:
                print(entry)

    except FileNotFoundError:
        print(f"Error: The CSV data file '{csv_file_path}' was not found. Make sure it's in a 'data' subdirectory relative to the script, or update the path.")
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc() 