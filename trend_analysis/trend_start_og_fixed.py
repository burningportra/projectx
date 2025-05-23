import csv

# --- Configuration Constants ---
CUS_EXHAUSTION_MAX_BARS_FROM_CANDIDATE = 5

# --- Data Structures ---
class Bar:
    """Represents a single price bar (OHLC) with its timestamp and indices."""
    def __init__(self, date_str, o, h, l, c, original_file_line, chronological_index):
        """
        Initializes a Bar object.

        Args:
            date_str (str): The date/timestamp string.
            o (str_or_float): The opening price.
            h (str_or_float): The high price.
            l (str_or_float): The low price.
            c (str_or_float): The closing price.
            original_file_line (int): The original line number from the input file (for debugging).
            chronological_index (int): A 1-based index representing the bar's order in time.
        """
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
    """Holds the current state of the trend analysis algorithm as it processes bars.
    
    Manages two levels of pending signals:
    1. Basic pending signals (`pending_uptrend_start_bar_index`, `pending_downtrend_start_bar_index`):
       Track the most recent bar that met initial criteria for a pending trend start.
       Primarily used for resolving conflicts if a single bar signals both PUS and PDS.
    2. Candidate signals (`pus_candidate_for_cus_bar_index`, `pds_candidate_for_cds_bar_index`):
       Track the "best" (e.g., lowest low for PUS, highest high for PDS) pending signal bar
       that is actively being evaluated for confirmation (CUS or CDS).
    """
    def __init__(self):
        """Initializes the state with default values."""
        # FIX 2: Removed deprecated variables
        
        # Pending Uptrend Start (PUS) state
        self.pending_uptrend_start_bar_index = None # 1-based index of the bar that initiated a pending uptrend
        self.pending_uptrend_start_anchor_low = None  # The low price of the bar that initiated the pending uptrend

        # Pending Downtrend Start (PDS) state  
        self.pending_downtrend_start_bar_index = None # 1-based index of the bar that initiated a pending downtrend
        self.pending_downtrend_start_anchor_high = None # The high price of the bar that initiated the pending downtrend

        # Confirmed Downtrend Start (CDS) candidate state (this is a PDS being evaluated for CDS)
        self.pds_candidate_for_cds_bar_index = None # 1-based index of the PDS bar that is the current candidate for CDS confirmation
        self.pds_candidate_for_cds_high = None  # The high price of that PDS candidate bar
        self.pds_candidate_for_cds_low = None   # The low price of that PDS candidate bar

        # Confirmed Uptrend Start (CUS) candidate state (this is a PUS being evaluated for CUS)
        self.pus_candidate_for_cus_bar_index = None # 1-based index of the PUS bar that is the current candidate for CUS confirmation
        self.pus_candidate_for_cus_low = None   # The low price of that PUS candidate bar
        self.pus_candidate_for_cus_high = None  # The high price of that PUS candidate bar
        
        self.log_entries = [] # Stores log messages generated during processing

        # Containment State: Tracks if price action is contained within a prior significant bar's range.
        self.in_containment = False # Flag indicating if currently in a containment zone
        self.containment_ref_bar_index = None # Index of the bar defining the containment range
        self.containment_ref_type = None # "PENDING_DOWNTREND_HIGH" or "PENDING_UPTREND_LOW" - type of bar defining containment
        self.containment_ref_high = None # High of the reference bar for containment
        self.containment_ref_low = None  # Low of the reference bar for containment
        self.containment_start_bar_index_for_log = None # Bar that first entered containment (for logging)
        self.containment_consecutive_bars_inside = 0 # Number of bars strictly inside the containment range after it started

        # Overall trend state for enforcing strict Uptrend/Downtrend alternation
        self.current_confirmed_trend_is_uptrend = None # True if current confirmed trend is UPTREND, False if DOWNTREND, None if Neutral

        # State for forcing alternation between confirmed uptrends and downtrends
        self.last_confirmed_trend_type = None # 'uptrend' or 'downtrend'
        self.last_confirmed_trend_bar_index = None # Index of the bar where the last trend was confirmed

    def _reset_pending_uptrend_signal_state(self):
        """Clears the basic pending uptrend signal state."""
        self.pending_uptrend_start_bar_index = None
        self.pending_uptrend_start_anchor_low = None

    def _reset_pending_downtrend_signal_state(self):
        """Clears the basic pending downtrend signal state."""
        self.pending_downtrend_start_bar_index = None
        self.pending_downtrend_start_anchor_high = None

    def _reset_pus_candidate_state(self):
        """Clears the PUS candidate state for CUS evaluation."""
        self.pus_candidate_for_cus_bar_index = None
        self.pus_candidate_for_cus_low = None
        self.pus_candidate_for_cus_high = None

    def _reset_all_pending_uptrend_states(self):
        """Clears all state related to pending uptrends and PUS candidates."""
        self._reset_pending_uptrend_signal_state()
        self._reset_pus_candidate_state()

    def _reset_pds_candidate_state(self):
        """Clears the PDS candidate state for CDS evaluation."""
        self.pds_candidate_for_cds_bar_index = None
        self.pds_candidate_for_cds_high = None
        self.pds_candidate_for_cds_low = None

    def _reset_all_pending_downtrend_states(self):
        """Clears all state related to pending downtrends and PDS candidates."""
        self._reset_pending_downtrend_signal_state()
        self._reset_pds_candidate_state()

    def _reset_containment_state(self):
        """Resets all containment-related attributes."""
        self.in_containment = False
        self.containment_ref_bar_index = None
        self.containment_ref_type = None
        self.containment_ref_high = None
        self.containment_ref_low = None
        self.containment_start_bar_index_for_log = None
        self.containment_consecutive_bars_inside = 0
    
    def set_new_pending_downtrend_signal(self, bar_obj, prev_to_pds_candidate_bar, event_descriptions_list, reason_message_suffix=""):
        """
        Sets a new Pending Downtrend Start (PDS) signal on the given bar_obj.
        Updates PDS and PDS candidate states, logs the event, and clears any
        conflicting PUS signal that was set on the exact same bar.
        Returns True if a new PDS was actually set (or updated to a higher high).
        """
        # New prerequisite check: PDS candidate's high must not be lower than the high of the bar immediately preceding it.
        if prev_to_pds_candidate_bar is not None and bar_obj.h < prev_to_pds_candidate_bar.h:
            event_descriptions_list.append(
                f"PDS on Bar {bar_obj.index} rejected: H ({bar_obj.h}) < H of prev bar {prev_to_pds_candidate_bar.index} ({prev_to_pds_candidate_bar.h})"
            )
            return False # PDS not set or updated

        # DEBUG PRINT ADDED
        print(f"DEBUG PDS Set Check: bar_obj_idx={bar_obj.index}, bar_obj.h={bar_obj.h}, prev_bar_h_check_passed=True, current_PDS_cand_idx={self.pds_candidate_for_cds_bar_index}, current_PDS_cand_h={self.pds_candidate_for_cds_high}, comparison_H_gt_CandH={(bar_obj.h > self.pds_candidate_for_cds_high) if self.pds_candidate_for_cds_bar_index is not None and self.pds_candidate_for_cds_high is not None else 'N/A_NoCand'}, is_None_Cand={self.pds_candidate_for_cds_bar_index is None}")

        if self.pds_candidate_for_cds_bar_index is None or \
           bar_obj.h > self.pds_candidate_for_cds_high:
            
            self.pending_downtrend_start_bar_index = bar_obj.index
            self.pending_downtrend_start_anchor_high = bar_obj.h
            self.pds_candidate_for_cds_bar_index = bar_obj.index
            self.pds_candidate_for_cds_high = bar_obj.h
            self.pds_candidate_for_cds_low = bar_obj.l
            
            log_message = f"Pending Downtrend Start on Bar {bar_obj.index} ({bar_obj.date})"
            if reason_message_suffix:
                log_message += f" {reason_message_suffix}"
            event_descriptions_list.append(log_message)

            # FIX 1: Made consistent - clear both basic and candidate states for PUS
            if self.pending_uptrend_start_bar_index == bar_obj.index:
                self._reset_pending_uptrend_signal_state()
            return True
        return False

    def set_new_pending_uptrend_signal(self, bar_obj, event_descriptions_list, reason_message_suffix=""):
        """
        Sets a new Pending Uptrend Start (PUS) signal on the given bar_obj.
        Updates PUS state. If this PUS is also a new "best" PUS candidate (lower low),
        updates the PUS candidate state and logs the event.
        Clears any conflicting PDS signal that was set on the exact same bar.
        Returns True if a new PUS candidate was actually set (or updated to a lower low).
        """
        self.pending_uptrend_start_bar_index = bar_obj.index
        self.pending_uptrend_start_anchor_low = bar_obj.l
        
        pus_candidate_updated = False
        if self.pus_candidate_for_cus_bar_index is None or \
           bar_obj.l < self.pus_candidate_for_cus_low:
            self.pus_candidate_for_cus_bar_index = bar_obj.index
            self.pus_candidate_for_cus_low = bar_obj.l
            self.pus_candidate_for_cus_high = bar_obj.h
            
            log_message = f"Pending Uptrend Start on Bar {bar_obj.index} ({bar_obj.date})"
            if reason_message_suffix:
                log_message += f" {reason_message_suffix}"
            event_descriptions_list.append(log_message)
            pus_candidate_updated = True

        # FIX 1: Made consistent - clear both basic and candidate states for PDS
        if self.pending_downtrend_start_bar_index == bar_obj.index:
            self._reset_pending_downtrend_signal_state()
        return pus_candidate_updated

    def confirm_uptrend(self, confirmed_cus_bar, all_bars, event_descriptions_list):
        """
        Confirms an uptrend based on confirmed_cus_bar.
        Handles forced alternation, logs the CUS, and updates overall trend state.
        """
        # FIX 9: Actually enforce alternation by inserting forced CDS if needed
        if self.last_confirmed_trend_type == 'uptrend' and \
           (self.last_confirmed_trend_bar_index is not None and confirmed_cus_bar and confirmed_cus_bar.index > self.last_confirmed_trend_bar_index):
            intervening_high_bar_for_forced_cds = find_intervening_bar_for_forced_trend(
                all_bars, self.last_confirmed_trend_bar_index, confirmed_cus_bar.index, find_lowest_low_for_forced_cus=False
            )
            if intervening_high_bar_for_forced_cds:
                event_descriptions_list.append(f"Confirmed Downtrend Start from Bar {intervening_high_bar_for_forced_cds.index} ({intervening_high_bar_for_forced_cds.date}) # FORCED to alternate")
                # Update state to reflect the forced CDS
                self.current_confirmed_trend_is_uptrend = False
                self.last_confirmed_trend_type = 'downtrend'
                self.last_confirmed_trend_bar_index = intervening_high_bar_for_forced_cds.index

        # FIX 4: Removed duplicate call - now log CUS and update state only once
        event_descriptions_list.append(f"Confirmed Uptrend Start from Bar {confirmed_cus_bar.index} ({confirmed_cus_bar.date})")
        self.current_confirmed_trend_is_uptrend = True 
        self.last_confirmed_trend_type = 'uptrend' 
        self.last_confirmed_trend_bar_index = confirmed_cus_bar.index

    def confirm_downtrend(self, confirmed_cds_bar, all_bars, event_descriptions_list):
        """
        Confirms a downtrend based on confirmed_cds_bar.
        Handles forced alternation, logs the CDS, and updates overall trend state.
        """
        # FIX 9: Actually enforce alternation by inserting forced CUS if needed
        if self.last_confirmed_trend_type == 'downtrend' and \
           (self.last_confirmed_trend_bar_index is not None and confirmed_cds_bar and confirmed_cds_bar.index > self.last_confirmed_trend_bar_index):
            intervening_low_bar_for_forced_cus = find_intervening_bar_for_forced_trend(
                all_bars, self.last_confirmed_trend_bar_index, confirmed_cds_bar.index, find_lowest_low_for_forced_cus=True
            )
            if intervening_low_bar_for_forced_cus:
                event_descriptions_list.append(f"Confirmed Uptrend Start from Bar {intervening_low_bar_for_forced_cus.index} ({intervening_low_bar_for_forced_cus.date}) # FORCED to alternate")
                # Update state to reflect the forced CUS
                self.current_confirmed_trend_is_uptrend = True
                self.last_confirmed_trend_type = 'uptrend'
                self.last_confirmed_trend_bar_index = intervening_low_bar_for_forced_cus.index

        # FIX 4: Removed duplicate call - now log CDS and update state only once
        event_descriptions_list.append(f"Confirmed Downtrend Start from Bar {confirmed_cds_bar.index} ({confirmed_cds_bar.date})")
        self.current_confirmed_trend_is_uptrend = False 
        self.last_confirmed_trend_type = 'downtrend' 
        self.last_confirmed_trend_bar_index = confirmed_cds_bar.index

# --- General Helper Functions (Moved Up) ---
def load_bars_from_alt_csv(filename="trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv"):
    """
    Loads bar data from a CSV file into a list of Bar objects.
    The CSV file is expected to have 'timestamp', 'open', 'high', 'low', 'close' columns.
    Bars are assumed to be in chronological order in the CSV.
    Args:
        filename (str): The path to the CSV file.
    Returns:
        list[Bar]: A list of Bar objects.
    """
    bars = []
    with open(filename, 'r', newline='') as f:
        reader = csv.DictReader(f)
        raw_bars = list(reader)
    for i, row in enumerate(raw_bars):
        bars.append(Bar(
            date_str=row['timestamp'], o=row['open'], h=row['high'],
            l=row['low'], c=row['close'], original_file_line=i + 2,
            chronological_index=i + 1 ))
    return bars

def get_unique_sorted_events(descriptions):
    """
    Takes a list of event description strings, removes duplicates, and sorts them.
    This is used to ensure log entries for a single bar are consistent and ordered.
    Args:
        descriptions (list[str]): A list of event description strings.
    Returns:
        list[str]: A sorted list of unique event description strings.
    """
    seen = set()
    unique_list = []
    for item in descriptions:
        if item not in seen:
            seen.add(item)
            unique_list.append(item)
    return sorted(unique_list)

def find_intervening_bar_for_forced_trend(all_bars, prev_confirmed_trend_bar_idx_1based, current_conflicting_trend_bar_idx_1based, find_lowest_low_for_forced_cus=True):
    """
    Finds the bar with the lowest low or highest high within a specified range of bars.
    This is used by the forced alternation logic to identify a point for a forced trend confirmation (CUS or CDS)
    when two consecutive trends of the same type are detected.
    Args:
        all_bars (list[Bar]): The complete list of Bar objects.
        prev_confirmed_trend_bar_idx_1based (int): The 1-based index of the bar where the previous trend was confirmed.
        current_conflicting_trend_bar_idx_1based (int): The 1-based index of the bar where the current (conflicting) trend is being confirmed.
        find_lowest_low_for_forced_cus (bool): If True, searches for the bar with the lowest low (for a forced CUS).
                                            If False, searches for the bar with the highest high (for a forced CDS).
    Returns:
        Bar or None: The Bar object that meets the criteria, or None if the range is invalid or empty.
    """
    start_0idx = prev_confirmed_trend_bar_idx_1based - 1
    end_0idx = current_conflicting_trend_bar_idx_1based - 1
    if start_0idx < 0 or end_0idx >= len(all_bars) or start_0idx > end_0idx:
        return None
    search_start_0idx = start_0idx + 1 
    search_end_0idx = end_0idx - 1
    if search_start_0idx > search_end_0idx:
        return None
    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice:
        return None
    if find_lowest_low_for_forced_cus:
        chosen_bar =  min(relevant_slice, key=lambda bar: bar.l)
    else: 
        chosen_bar = max(relevant_slice, key=lambda bar: bar.h)
    return chosen_bar

# --- Helper Functions for Bar Patterns ---
def is_lower_ohlc_bar(current_bar, prev_bar):
  """Checks if current_bar has lower Open, High, Low, Close (OHLC) compared to prev_bar.
     Lower low, lower high, lower close than prev_bar. (Open is not explicitly checked here but implied by "lower prices")
  """
  res_l = current_bar.l < prev_bar.l
  res_h = current_bar.h < prev_bar.h
  res_c = current_bar.c < prev_bar.c
  return res_l and res_h and res_c

def is_higher_ohlc_bar(current_bar, prev_bar): # Previously SUB (Simple Up Bar)
  """Checks if current_bar has higher Open, High, Low, Close (OHLC) compared to prev_bar.
     Higher low, higher high, higher close than prev_bar. (Open is not explicitly checked here but implied by "higher prices")
  """
  return (current_bar.l > prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c) # Using close, can be prev_bar.o

def is_low_then_higher_close_bar(current_bar, prev_bar): # Previously BRB (Bullish Reversal Bar)
  """Checks if current_bar has a lower low, but higher high and higher close than prev_bar.
  """
  return (current_bar.l < prev_bar.l and \
          current_bar.h > prev_bar.h and \
          current_bar.c > prev_bar.c)

def is_high_then_lower_close_bar(current_bar, prev_bar): # Previously BeRB (Bearish Reversal Bar)
  """Checks if current_bar has a higher high, but lower low and lower close than prev_bar.
  """
  return (current_bar.h > prev_bar.h and \
          current_bar.l < prev_bar.l and \
          current_bar.c < prev_bar.c)

def is_pending_downtrend_start_rule(current_bar, prev_bar):
    """Rule for Pending Downtrend Start (PDS) on prev_bar.
       Triggered by current_bar's close.
       1. current_bar did NOT make a higher high than prev_bar's high.
       2. current_bar closed BELOW prev_bar's open.
    """
    return (current_bar.h <= prev_bar.h and 
            current_bar.c < prev_bar.o)

def is_pending_uptrend_start_rule(current_bar, prev_bar):
    """Rule for Pending Uptrend Start (PUS) on prev_bar.
       Triggered by current_bar's close.
       1. current_bar did NOT make a lower low than prev_bar's low.
       2. current_bar closed ABOVE prev_bar's open.
    """
    return (current_bar.l >= prev_bar.l and
            current_bar.c > prev_bar.o)

def is_simple_pending_downtrend_start_signal(current_bar, prev_bar):
    """
    Simple rule for Pending Downtrend Start (PDS) signal.
    Signal on prev_bar if current_bar does not make a higher high than prev_bar.
    This is a basic condition often used in conjunction with other bar patterns.
    """
    return current_bar.h <= prev_bar.h

def is_simple_pending_uptrend_start_signal(current_bar, prev_bar):
    """
    Simple rule for Pending Uptrend Start (PUS) signal.
    Signal on prev_bar if current_bar does not make a lower low than prev_bar.
    This is a basic condition often used in conjunction with other bar patterns.
    """
    return current_bar.l >= prev_bar.l

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
    return cond_low_undercut and cond_high_respect and cond_closes_higher

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
    return cond1_higher_high and cond2_lower_low and cond3_down_close

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
    return cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low

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
    return True

def _cus_rule_low_undercut_high_respect(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule Wrapper: LowUndercutHighRespect pattern."""
    pds_context = initial_pds_candidate_bar_obj
    if not pds_context and state.pds_candidate_for_cds_bar_index is not None:
        if 0 <= (state.pds_candidate_for_cds_bar_index - 1) < len(all_bars):
            pds_context = all_bars[state.pds_candidate_for_cds_bar_index - 1]
    return check_cus_confirmation_low_undercut_high_respect(current_bar, prev_bar, pds_context)

def _cus_rule_hhll_down_close(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule Wrapper: HigherHighLowerLowDownClose (outside bar, closes down)."""
    return check_cus_confirmation_higher_high_lower_low_down_close(current_bar, prev_bar)

def _cus_rule_engulfing_up_pds_low_break(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """CUS Rule Wrapper: EngulfingUpPDSLowBreak (bullish engulfing that breaks PDS low)."""
    return check_cus_confirmation_engulfing_up_with_pds_low_break(current_bar, prev_bar, initial_pds_candidate_bar_obj)

CUS_RULE_DEFINITIONS = [
    ("EXHAUSTION_REVERSAL", _cus_rule_exhaustion_reversal),
    ("LowUndercutHighRespect", _cus_rule_low_undercut_high_respect),
    ("HigherHighLowerLowDownClose", _cus_rule_hhll_down_close),
    ("EngulfingUpPDSLowBreak", _cus_rule_engulfing_up_pds_low_break),
]

def _evaluate_cus_rules(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
    """
    Evaluates all Confirmed Uptrend Start (CUS) rules based on an initial PUS candidate.
    Iterates through CUS_RULE_DEFINITIONS.
    Returns:
        tuple: (bool, str or None) indicating (can_confirm_cus, cus_trigger_rule_type)
    """
    can_confirm_cus = False
    cus_trigger_rule_type = None
    if initial_pus_candidate_bar_obj is not None: 
        for rule_name, rule_func in CUS_RULE_DEFINITIONS:
            if rule_func(current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars):
                can_confirm_cus = True
                cus_trigger_rule_type = rule_name
                break
    return can_confirm_cus, cus_trigger_rule_type

# --- Detailed CDS Confirmation Check Functions ---
def check_cds_confirmation_low_then_higher_close_vs_pds_open(current_bar, prev_bar, peak_bar, all_bars):
    """CDS Rule: LowThenHigherClose_vs_PDSOpen pattern."""
    no_higher_high_for_low_then_higher_path = True
    if peak_bar.index < prev_bar.index:
        for j_1based_idx in range(peak_bar.index + 1, prev_bar.index + 1):
            if all_bars[j_1based_idx - 1].h > peak_bar.h:
                no_higher_high_for_low_then_higher_path = False
                break
    return is_low_then_higher_close_bar(current_bar, prev_bar) and \
           no_higher_high_for_low_then_higher_path and \
           current_bar.l < peak_bar.o

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
    
    return found_pullback and cond1 and cond2 and no_higher_high_between and cond3

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
    
    return found_pullback and cond1 and cond2 and cond3 and no_higher_high_between

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
    return current_bar_closes_down 

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
    return prev_bar_broke_low

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
    return higher_high and lower_low and closes_stronger

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

def _evaluate_cds_rules(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
    """
    Evaluates all Confirmed Downtrend Start (CDS) rules based on an initial PDS candidate.
    Returns:
        tuple: (bool, str or None) indicating (can_confirm_cds, cds_trigger_rule_type)
    """
    can_confirm_cds = False
    cds_trigger_rule_type = None

    if initial_pds_candidate_bar_obj is not None:  # A PDS candidate must exist
        for rule_name, rule_func in CDS_RULE_DEFINITIONS:
            if rule_func(current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars):
                can_confirm_cds = True
                cds_trigger_rule_type = rule_name
                break # First rule that triggers confirms CDS
            
    return can_confirm_cds, cds_trigger_rule_type

def _apply_cus_confirmation(current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, state, all_bars, current_bar_event_descriptions):
    """
    Applies the consequences of a Confirmed Uptrend Start (CUS).
    Updates state, logs events, and handles PDS generation after CUS.
    """
    # Apply the CUS confirmation
    state.confirm_uptrend(confirmed_bar_for_this_cus, all_bars, current_bar_event_descriptions)
    
    # Clear all PUS (Pending Uptrend Start) states as this PUS candidate is now confirmed.
    state._reset_all_pending_uptrend_states()

    # FIX 5: Simplified PDS generation logic after CUS
    # Determine if we should create a PDS on the confirmed CUS bar or current bar
    if cus_trigger_rule_type == "HigherHighLowerLowDownClose":
        # For this pattern, the current bar itself becomes PDS
        # The bar before current_bar is prev_bar (which is all_bars[current_bar.index - 2])
        prev_to_current_bar = all_bars[current_bar.index - 2] if current_bar.index > 1 else None
        state.set_new_pending_downtrend_signal(current_bar, prev_to_current_bar, current_bar_event_descriptions, 
                                              "(from HigherHighLowerLowDownClose pattern)")
    elif cus_trigger_rule_type == "EngulfingUpPDSLowBreak":
        # For engulfing patterns, we don't automatically create a PDS
        pass
    else:
        # For other patterns, check if the CUS bar qualifies as a PDS
        cus_triggering_bar = current_bar
        if confirmed_bar_for_this_cus and cus_triggering_bar:
            # Check if the relationship between trigger and confirmed bar suggests PDS
            if (is_lower_ohlc_bar(cus_triggering_bar, confirmed_bar_for_this_cus) or
                is_pending_downtrend_start_rule(cus_triggering_bar, confirmed_bar_for_this_cus) or
                is_simple_pending_downtrend_start_signal(cus_triggering_bar, confirmed_bar_for_this_cus)):
                prev_to_confirmed_cus_bar = None
                if confirmed_bar_for_this_cus.index > 1: # 1-based index
                    idx_before_confirmed_cus = confirmed_bar_for_this_cus.index - 2 
                    if idx_before_confirmed_cus >= 0 and idx_before_confirmed_cus < len(all_bars):
                        prev_to_confirmed_cus_bar = all_bars[idx_before_confirmed_cus]
                state.set_new_pending_downtrend_signal(confirmed_bar_for_this_cus, prev_to_confirmed_cus_bar, current_bar_event_descriptions,
                                                     f"(due to trigger by Bar {cus_triggering_bar.index})")

def _apply_cds_confirmation(confirmed_bar_for_this_cds, state, all_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions):
    """
    Applies the consequences of a Confirmed Downtrend Start (CDS).
    Updates state, logs events, and handles PUS invalidation.
    """
    # Apply the CDS confirmation
    state.confirm_downtrend(confirmed_bar_for_this_cds, all_bars, current_bar_event_descriptions)

    # FIX 7: Fixed the condition - should check if PUS candidate is at or before CDS bar
    if state.pus_candidate_for_cus_bar_index is not None and \
       state.pus_candidate_for_cus_bar_index <= confirmed_bar_for_this_cds.index:
        state._reset_all_pending_uptrend_states()
    
    # Clear the PDS state that was just confirmed by this CDS.
    if state.pds_candidate_for_cds_bar_index == confirmed_bar_for_this_cds.index:
        state._reset_all_pending_downtrend_states()

def _handle_containment_logic(current_bar, state, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions):
    """
    Manages logic for entering, exiting, and tracking price containment.
    Modifies state.in_containment and related fields, and appends to current_bar_event_descriptions.
    """
    if state.in_containment:
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
        else: # current bar is outside the containment range
            break_type = "moves outside"
            if current_bar.c > state.containment_ref_high: break_type = "BREAKOUT above"
            elif current_bar.c < state.containment_ref_low: break_type = "BREAKDOWN below"
            current_bar_event_descriptions.append(
                f"Containment ENDED: Bar {current_bar.index} {break_type} Bar {state.containment_ref_bar_index} range "
                f"(was {state.containment_consecutive_bars_inside} bar(s) inside)."
            )
            state._reset_containment_state()
        
    # Check for new containment if not currently in one
    if not state.in_containment:
        chosen_candidate_ref_bar = None
        ref_type_for_log = None
        # Determine which candidate bar (PDS or PUS) to use as reference for potential new containment
        if initial_pds_candidate_bar_obj: # Prioritize PDS if both exist (can be tuned)
            chosen_candidate_ref_bar = initial_pds_candidate_bar_obj
            ref_type_for_log = "PENDING_DOWNTREND_HIGH"
        elif initial_pus_candidate_bar_obj:
            chosen_candidate_ref_bar = initial_pus_candidate_bar_obj
            ref_type_for_log = "PENDING_UPTREND_LOW"

        if chosen_candidate_ref_bar and chosen_candidate_ref_bar.index != current_bar.index:
            # Check if current_bar is inside the chosen candidate reference bar
            if current_bar.h <= chosen_candidate_ref_bar.h and \
               current_bar.l >= chosen_candidate_ref_bar.l:
                state.in_containment = True
                state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                state.containment_ref_type = ref_type_for_log
                state.containment_ref_high = chosen_candidate_ref_bar.h
                state.containment_ref_low = chosen_candidate_ref_bar.l
                state.containment_start_bar_index_for_log = current_bar.index
                state.containment_consecutive_bars_inside = 1 # First bar inside
                current_bar_event_descriptions.append(
                    f"Containment START: Bar {current_bar.index} inside Bar {state.containment_ref_bar_index} "
                    f"({state.containment_ref_type} H:{state.containment_ref_high}, L:{state.containment_ref_low})."
                )

def _check_and_set_new_pending_signals(current_bar, prev_bar, bar_before_prev_bar, state, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions):
    """
    Checks for and sets new Pending Downtrend Start (PDS) or Pending Uptrend Start (PUS) signals.
    This includes PDS Rule C and general PDS/PUS generation on prev_bar.
    Modifies state for pending signals and appends to current_bar_event_descriptions.
    """
    # FIX 8: Only process Rule C if no CDS was confirmed this iteration
    new_pds_on_curr_bar_this_iteration = False
    if not cds_confirmed_this_iteration and current_bar.h > prev_bar.h and current_bar.c < current_bar.o: 
        # For Rule C, PDS is on current_bar, so prev_to_pds_candidate is prev_bar
        state.set_new_pending_downtrend_signal(current_bar, prev_bar, current_bar_event_descriptions, "by Rule C")
        new_pds_on_curr_bar_this_iteration = True
        
    # Check for PDS on prev_bar
    if not cds_confirmed_this_iteration and not new_pds_on_curr_bar_this_iteration:
        if (is_lower_ohlc_bar(current_bar, prev_bar) or
            is_pending_downtrend_start_rule(current_bar, prev_bar) or
            is_simple_pending_downtrend_start_signal(current_bar, prev_bar)):
            # Check if set_new_pending_downtrend_signal actually updated the candidate
            # PDS is on prev_bar, so prev_to_pds_candidate is bar_before_prev_bar
            state.set_new_pending_downtrend_signal(prev_bar, bar_before_prev_bar, current_bar_event_descriptions) 
    
    # Check for PUS on prev_bar - PUS logic doesn't need the new preceding bar check
    if not cus_confirmed_this_iteration and \
       not new_pds_on_curr_bar_this_iteration:
        if (is_higher_ohlc_bar(current_bar, prev_bar) or
            is_pending_uptrend_start_rule(current_bar, prev_bar) or
            is_simple_pending_uptrend_start_signal(current_bar, prev_bar)):
            state.set_new_pending_uptrend_signal(prev_bar, current_bar_event_descriptions)

def process_trend_logic(all_bars):
    """
    Main logic for processing bars to identify price direction signals and confirmations.

    Args:
        all_bars (list[Bar]): A list of Bar objects, in chronological order.

    Returns:
        list[str]: A list of log entries describing the events at each bar.
    """
    if not all_bars:
        return []

    state = State() # Initialize the state machine

    # Iterate through each bar to process its impact on the trend state
    for k in range(len(all_bars)):
        log_index_for_this_entry = k + 1 # 1-based index for logging clarity
        current_bar_event_descriptions = [] # Collect all event descriptions for the current bar

        # --- INITIALIZATION FOR THE CURRENT BAR --- 
        # The first bar cannot be compared to a previous one, so log "Nothing" and continue.
        if k == 0:
            state.log_entries.append(f"{log_index_for_this_entry}. Nothing")
            continue
        
        current_bar = all_bars[k]
        prev_bar = all_bars[k-1]
        bar_before_prev_bar = all_bars[k-2] if k >= 2 else None # For the new PDS check
        
        # Flags to track if a CUS or CDS was confirmed in this iteration
        cus_confirmed_this_iteration = False
        cds_confirmed_this_iteration = False

        # --- Store initial PUS/PDS candidates for this iteration's evaluation --- 
        # These are the candidates *before* the current_bar is fully processed.
        initial_pus_candidate_idx = state.pus_candidate_for_cus_bar_index
        initial_pus_candidate_bar_obj = None
        if initial_pus_candidate_idx is not None:
            initial_pus_candidate_bar_obj = all_bars[initial_pus_candidate_idx - 1]

        initial_pds_candidate_idx = state.pds_candidate_for_cds_bar_index
        initial_pds_candidate_bar_obj = None
        if initial_pds_candidate_idx is not None:
            initial_pds_candidate_bar_obj = all_bars[initial_pds_candidate_idx - 1]

        # --- SECTION 1: CONTAINMENT LOGIC --- 
        _handle_containment_logic(current_bar, state, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions)

        # --- SECTION 2: CUS (CONFIRMED UPTREND START) EVALUATION --- 
        can_confirm_cus, cus_trigger_rule_type = _evaluate_cus_rules(
            current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, state, all_bars
        )

        # --- SECTION 3: CDS (CONFIRMED DOWNTREND START) EVALUATION ---
        can_confirm_cds, cds_trigger_rule_type = _evaluate_cds_rules(
            current_bar, prev_bar, initial_pds_candidate_bar_obj, all_bars
        )

        # --- SECTION 4: APPLY CONSEQUENCES OF CUS/CDS AND FORCED ALTERNATION ---
        # Priority is given to CUS if both CUS and CDS could be confirmed in the same iteration 
        # (though rules are typically designed to be mutually exclusive for a single PDS/PUS candidate).

        # --- 4.1: CUS Consequences --- 
        if can_confirm_cus:
            cus_confirmed_this_iteration = True # Mark that a CUS was confirmed
            confirmed_bar_for_this_cus = initial_pus_candidate_bar_obj # The bar that was confirmed as CUS
            _apply_cus_confirmation(current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, state, all_bars, current_bar_event_descriptions)
        
        # --- 4.2: CDS Consequences --- 
        # This section is processed if CUS was NOT confirmed in this iteration, OR if CDS confirmation is independent.
        # However, if CUS was confirmed, `cus_confirmed_this_iteration` is true, which affects subsequent PDS/PUS generation logic.
        if can_confirm_cds: # `can_confirm_cds` was determined in Section 3
            cds_confirmed_this_iteration = True # Mark that a CDS was confirmed
            confirmed_bar_for_this_cds = initial_pds_candidate_bar_obj # The bar that was confirmed as CDS
            _apply_cds_confirmation(confirmed_bar_for_this_cds, state, all_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions)

        # --- SECTION 5: CHECK FOR NEW PENDING SIGNALS (PDS/PUS on prev_bar or current_bar) ---
        _check_and_set_new_pending_signals(current_bar, prev_bar, bar_before_prev_bar, state, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions)

        # --- SECTION 6: FINALIZE LOG ENTRY FOR THE CURRENT BAR ---
        if not current_bar_event_descriptions:
            final_log_text = "Neutral" # Default if no specific events occurred
        else:
            unique_events = get_unique_sorted_events(current_bar_event_descriptions) 
            final_log_text = "; ".join(unique_events)
        
        state.log_entries.append(f"{log_index_for_this_entry}. {final_log_text}")
    return state.log_entries

def export_trend_start_events(log_entries, output_csv="trend_analysis/confirmed_trend_starts.csv"):
    """
    Parses log entries to extract Confirmed Uptrend Starts (CUS) and Confirmed Downtrend Starts (CDS) 
    and exports them to a CSV file. It ensures that only unique events are exported,
    and sorts them chronologically by bar index.

    Args:
        log_entries (list[str]): A list of log strings generated by process_trend_logic.
        output_csv (str): The file path for the output CSV file.
    """
    import re # Import here as it's only used in this function
    rows = []
    # Regex to match trend start lines from the log entries
    cds_re = re.compile(r"Confirmed Downtrend Start from Bar (\d+) \(([^)]+)\)")
    cus_re = re.compile(r"Confirmed Uptrend Start from Bar (\d+) \(([^)]+)\)")
    
    processed_entries = set() # To store unique (trend_start_type, bar_index, date) tuples to avoid duplicates

    for entry_idx, entry in enumerate(log_entries):
        # Search for Confirmed Downtrend Starts (CDS)
        m_cds = cds_re.search(entry)
        if m_cds:
            bar_idx = int(m_cds.group(1))
            date_str = m_cds.group(2)
            event_key = ('downtrend', bar_idx, date_str) # Create a unique key for this event
            if event_key not in processed_entries: # Add to rows if it's a new, unique event
                rows.append({
                    'trend_start_type': 'downtrend',
                    'bar_index': bar_idx, 
                    'date': date_str
                })
                processed_entries.add(event_key)
        
        # Search for Confirmed Uptrend Starts (CUS)
        m_cus = cus_re.search(entry)
        if m_cus:
            bar_idx = int(m_cus.group(1))
            date_str = m_cus.group(2)
            event_key = ('uptrend', bar_idx, date_str) # Create a unique key for this event
            if event_key not in processed_entries: # Add to rows if it's a new, unique event
                rows.append({
                    'trend_start_type': 'uptrend',
                    'bar_index': bar_idx, 
                    'date': date_str
                })
                processed_entries.add(event_key)

    # Sort rows by bar_index first, then by trend_start_type if bar_index is the same.
    # This ensures consistent ordering.
    rows.sort(key=lambda x: (x['bar_index'], x['trend_start_type']))
    
    # Write the de-duplicated and sorted trend starts to the CSV file.
    with open(output_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['trend_start_type', 'bar_index', 'date'])
        writer.writeheader() # Write the header row
        writer.writerows(rows) # Write all trend start data
    print(f"Exported {len(rows)} confirmed trend starts to {output_csv}")

if __name__ == "__main__":
    """
    Main execution block: Loads bar data, processes it for trend start analysis,
    prints the generated log, and exports confirmed trend starts to a CSV.
    Includes basic error handling for file operations.
    """
    try:
        # Define the path to the CSV data file.
        # This path is relative to the workspace root if the script is run from there.
        csv_file_path = "data/CON.F.US.MES.M25_4h_ohlc.csv" 
        
        print(f"Attempting to load bars from: {csv_file_path}")
        all_bars_chronological = load_bars_from_alt_csv(filename=csv_file_path)
        
        if not all_bars_chronological:
            print(f"No bars were loaded. Please check the CSV file path '{csv_file_path}' and its format.")
        else:
            print(f"Successfully loaded {len(all_bars_chronological)} bars.")
            
            # Process the loaded bars to generate the trend start analysis log.
            print("\nStarting trend start analysis...")
            output_log = process_trend_logic(all_bars_chronological)
            print("Trend start analysis finished.")

            # Print the full generated log to the console.
            print("\n--- Generated Trend Start Log ---")
            for entry in output_log:
                print(entry)
            print("--- End of Trend Start Log ---")

           
            
            # Export the confirmed trend starts extracted from the log to a CSV file.
            print("\nStarting export of confirmed trend starts...")
            export_trend_start_events(output_log, output_csv="trend_analysis/confirmed_trend_starts_og_fixed.csv")
            print("Export of confirmed trend starts finished.")

    except FileNotFoundError:
        # Handle the case where the CSV data file is not found.
        print(f"Error: The CSV data file '{csv_file_path}' was not found. ")
        print(f"Please ensure the file exists at the specified path or update the path in the script.")
    except Exception as e:
        # Handle any other unexpected errors during execution.
        print(f"An unexpected error occurred during script execution: {e}")
        import traceback
        traceback.print_exc() # Print the full traceback for detailed error analysis. 