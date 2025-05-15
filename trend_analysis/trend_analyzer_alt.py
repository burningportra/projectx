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

def is_custom_pds_rule_B(current_bar, prev_bar):
    return current_bar.h <= prev_bar.h

def is_custom_pus_rule_B(current_bar, prev_bar):
    return current_bar.l >= prev_bar.l

def check_custom_cus_confirmation_ref36(current_bar, pds_candidate_bar):
    if pds_candidate_bar is None:
        return False
    return (current_bar.l < pds_candidate_bar.l and \
            current_bar.h <= pds_candidate_bar.h)

def check_custom_cus_confirmation_HHLL(current_bar, prev_bar):
    return current_bar.h > prev_bar.h and current_bar.l < prev_bar.l

def load_bars_from_alt_csv(filename="trend_analysis/data/CON.F.US.MES.M25_1d_ohlc.csv"):
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
        confirmed_downtrend_this_iteration = False
        confirmed_uptrend_this_iteration = False
        if state.confirmed_downtrend_candidate_peak_bar_index is not None:
            peak_bar_for_confirmed_downtrend = all_bars[state.confirmed_downtrend_candidate_peak_bar_index - 1]
            no_higher_high_for_brb_path = True
            if state.confirmed_downtrend_candidate_peak_bar_index < prev_bar.index:
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
            elif not confirmed_downtrend_this_iteration and \
                 check_custom_cds_confirmation_A(current_bar, prev_bar, peak_bar_for_confirmed_downtrend, all_bars):
                current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {peak_bar_for_confirmed_downtrend.index} ({peak_bar_for_confirmed_downtrend.date})")
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
            elif not confirmed_downtrend_this_iteration and \
                 check_custom_cds_confirmation_B(current_bar, prev_bar, peak_bar_for_confirmed_downtrend, all_bars):
                current_bar_event_descriptions.append(f"Downtrend Start Confirmed for Bar {peak_bar_for_confirmed_downtrend.index} ({peak_bar_for_confirmed_downtrend.date})")
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
        if not confirmed_downtrend_this_iteration and \
           state.confirmed_uptrend_candidate_low_bar_index is not None:
            standard_sdb_trigger = is_SDB(current_bar, prev_bar)
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
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None
                state.confirmed_uptrend_candidate_low_bar_index = None
                state.confirmed_uptrend_candidate_low_low = None
                state.confirmed_uptrend_candidate_low_high = None
                if hhll_cus_trigger:
                    current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {current_bar.index} ({current_bar.date})")
                    state.potential_downtrend_signal_bar_index = current_bar.index
                    state.potential_downtrend_anchor_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_bar_index = current_bar.index
                    state.confirmed_downtrend_candidate_peak_high = current_bar.h
                    state.confirmed_downtrend_candidate_peak_low = current_bar.l
                else:
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
        if is_SDB(current_bar, prev_bar) or \
           is_your_custom_pds_rule(current_bar, prev_bar) or \
           is_custom_pds_rule_B(current_bar, prev_bar): 
            state.potential_downtrend_signal_bar_index = prev_bar.index
            state.potential_downtrend_anchor_high = prev_bar.h
            if state.confirmed_downtrend_candidate_peak_bar_index is None or \
               prev_bar.h > state.confirmed_downtrend_candidate_peak_high:
                state.confirmed_downtrend_candidate_peak_bar_index = prev_bar.index
                state.confirmed_downtrend_candidate_peak_high = prev_bar.h
                state.confirmed_downtrend_candidate_peak_low = prev_bar.l
                current_bar_event_descriptions.append(f"Potential Downtrend Signal on Bar {prev_bar.index} ({prev_bar.date})")
            if state.potential_uptrend_signal_bar_index is not None:
                state.potential_uptrend_signal_bar_index = None
                state.potential_uptrend_anchor_low = None
        elif is_SUB(current_bar, prev_bar) or \
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
            if state.potential_downtrend_signal_bar_index is not None:
                state.potential_downtrend_signal_bar_index = None
                state.potential_downtrend_anchor_high = None
        if not current_bar_event_descriptions:
            final_log_text = "Neutral"
        else:
            unique_events = sorted(list(set(current_bar_event_descriptions)))
            final_log_text = "; ".join(unique_events)
        state.log_entries.append(f"{log_index_for_this_entry}. {final_log_text}")
    return state.log_entries

def export_confirmed_trend_starts(log_entries, output_csv="confirmed_trend_starts.csv"):
    import re
    rows = []
    # Regex to match trend start lines
    downtrend_re = re.compile(r"Downtrend Start Confirmed for Bar (\d+) \(([^)]+)\)")
    uptrend_re = re.compile(r"Uptrend Start Confirmed for Bar (\d+) \(([^)]+)\)")
    for entry in log_entries:
        m = downtrend_re.search(entry)
        if m:
            rows.append({
                'trend_type': 'downtrend',
                'bar_index': m.group(1),
                'date': m.group(2)
            })
        m = uptrend_re.search(entry)
        if m:
            rows.append({
                'trend_type': 'uptrend',
                'bar_index': m.group(1),
                'date': m.group(2)
            })
    # Write to CSV
    with open(output_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['trend_type', 'bar_index', 'date'])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Exported {len(rows)} confirmed trend starts to {output_csv}")

if __name__ == "__main__":
    try:
        csv_file_path = "data/CON.F.US.MES.M25_1d_ohlc.csv"
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
            export_confirmed_trend_starts(output_log, output_csv="confirmed_trend_starts.csv")
    except FileNotFoundError:
        print(f"Error: The CSV data file '{csv_file_path}' was not found. Make sure it's in the correct directory, or update the path.")
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc() 