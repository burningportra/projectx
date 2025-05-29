import datetime # Add this import

from . import trend_utils # For log_debug and find_intervening_bar_for_forced_trend

class Bar:
    """Represents a single price bar (OHLC) with its timestamp and indices."""
    def __init__(self, timestamp: datetime.datetime, o: float, h: float, l: float, c: float, volume: float, index: int, original_file_line: int = None): # Modified signature
        """
        Initializes a Bar object.

        Args:
            timestamp (datetime.datetime): The timestamp of the bar.
            o (float): The opening price.
            h (float): The high price.
            l (float): The low price.
            c (float): The closing price.
            volume (float): The volume.
            index (int): A 1-based chronological index representing the bar's order in time.
            original_file_line (int, optional): The original line number from an input file (for debugging).
        """
        self.timestamp = timestamp # Changed from date_str
        self.date = timestamp.isoformat() # Keep original date string form if needed by other parts, like logging
        self.o = float(o)
        self.h = float(h)
        self.l = float(l)
        self.c = float(c)
        self.volume = float(volume) # Added volume
        self.original_file_line = original_file_line 
        self.index = int(index) 

    def __repr__(self):
        return (f"Bar({self.index}, T:{self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else 'NoTime'}, " # Use timestamp
                f"O:{self.o} H:{self.h} L:{self.l} C:{self.c} V:{self.volume})")

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
        trend_utils.log_debug(0, "Initial State: No PUS/PDS candidates. last_confirmed_trend=None. Not in containment.") # Initial debug log for state

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

        # DEBUG PRINT ADDED - Retaining for now, can be replaced/enhanced by new trend_utils.log_debug calls
        print(f"DEBUG PDS Set Check: bar_obj_idx={bar_obj.index}, bar_obj.h={bar_obj.h}, prev_bar_h_check_passed=True, current_PDS_cand_idx={self.pds_candidate_for_cds_bar_index}, current_PDS_cand_h={self.pds_candidate_for_cds_high}, comparison_H_gt_CandH={(bar_obj.h > self.pds_candidate_for_cds_high) if self.pds_candidate_for_cds_bar_index is not None and self.pds_candidate_for_cds_high is not None else 'N/A_NoCand'}, is_None_Cand={self.pds_candidate_for_cds_bar_index is None}")
        trend_utils.log_debug(bar_obj.index, f"Attempting to set PDS on Bar {bar_obj.index}. Current PDS cand: {self.pds_candidate_for_cds_bar_index} (H:{self.pds_candidate_for_cds_high}). Prev bar H check passed.")

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
            # MODIFICATION: Allow a bar to be a PDS candidate even if it's also a PUS candidate.
            # if self.pus_candidate_for_cus_bar_index == bar_obj.index:
            #     self._reset_pus_candidate_state()
            trend_utils.log_debug(bar_obj.index, f"PDS set/updated on Bar {bar_obj.index} (H:{bar_obj.h}, L:{bar_obj.l}). Cleared PUS on same bar if present.")
            return True
        trend_utils.log_debug(bar_obj.index, f"PDS on Bar {bar_obj.index} not set/updated (existing cand Bar {self.pds_candidate_for_cds_bar_index} has H:{self.pds_candidate_for_cds_high}).")
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
        trend_utils.log_debug(bar_obj.index, f"Attempting to set PUS on Bar {bar_obj.index}. Current PUS cand: {self.pus_candidate_for_cus_bar_index} (L:{self.pus_candidate_for_cus_low}).")
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
            trend_utils.log_debug(bar_obj.index, f"PUS set/updated on Bar {bar_obj.index} (L:{bar_obj.l}, H:{bar_obj.h}). Cleared PDS on same bar if present.")
        else:
            trend_utils.log_debug(bar_obj.index, f"PUS on Bar {bar_obj.index} not set/updated (existing cand Bar {self.pus_candidate_for_cus_bar_index} has L:{self.pus_candidate_for_cus_low}).")

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
            intervening_high_bar_for_forced_cds = trend_utils.find_intervening_bar_for_forced_trend(
                all_bars, self.last_confirmed_trend_bar_index, confirmed_cus_bar.index, find_lowest_low_for_forced_cus=False
            )
            if intervening_high_bar_for_forced_cds:
                event_descriptions_list.append(f"Confirmed Downtrend Start from Bar {intervening_high_bar_for_forced_cds.index} ({intervening_high_bar_for_forced_cds.date}) # FORCED to alternate")
                # Update state to reflect the forced CDS
                self.current_confirmed_trend_is_uptrend = False
                self.last_confirmed_trend_type = 'downtrend'
                self.last_confirmed_trend_bar_index = intervening_high_bar_for_forced_cds.index
                trend_utils.log_debug(confirmed_cus_bar.index if confirmed_cus_bar else 0, f"FORCED CDS from Bar {intervening_high_bar_for_forced_cds.index} due to CUS at {confirmed_cus_bar.index if confirmed_cus_bar else 'N/A'}. Last confirmed: DOWNTREND at {self.last_confirmed_trend_bar_index}")

        # FIX 4: Removed duplicate call - now log CUS and update state only once
        event_descriptions_list.append(f"Confirmed Uptrend Start from Bar {confirmed_cus_bar.index} ({confirmed_cus_bar.date})")
        self.current_confirmed_trend_is_uptrend = True 
        self.last_confirmed_trend_type = 'uptrend' 
        self.last_confirmed_trend_bar_index = confirmed_cus_bar.index
        trend_utils.log_debug(confirmed_cus_bar.index, f"CUS Confirmed from Bar {confirmed_cus_bar.index}. Last confirmed: UPTREND at {self.last_confirmed_trend_bar_index}")

    def confirm_downtrend(self, confirmed_cds_bar, all_bars, event_descriptions_list):
        """
        Confirms a downtrend based on confirmed_cds_bar.
        Handles forced alternation, logs the CDS, and updates overall trend state.
        """
        # FIX 9: Actually enforce alternation by inserting forced CUS if needed
        if self.last_confirmed_trend_type == 'downtrend' and \
           (self.last_confirmed_trend_bar_index is not None and confirmed_cds_bar and confirmed_cds_bar.index > self.last_confirmed_trend_bar_index):
            intervening_low_bar_for_forced_cus = trend_utils.find_intervening_bar_for_forced_trend(
                all_bars, self.last_confirmed_trend_bar_index, confirmed_cds_bar.index, find_lowest_low_for_forced_cus=True
            )
            if intervening_low_bar_for_forced_cus:
                event_descriptions_list.append(f"Confirmed Uptrend Start from Bar {intervening_low_bar_for_forced_cus.index} ({intervening_low_bar_for_forced_cus.date}) # FORCED to alternate")
                # Update state to reflect the forced CUS
                self.current_confirmed_trend_is_uptrend = True
                self.last_confirmed_trend_type = 'uptrend'
                self.last_confirmed_trend_bar_index = intervening_low_bar_for_forced_cus.index
                trend_utils.log_debug(confirmed_cds_bar.index if confirmed_cds_bar else 0, f"FORCED CUS from Bar {intervening_low_bar_for_forced_cus.index} due to CDS at {confirmed_cds_bar.index if confirmed_cds_bar else 'N/A'}. Last confirmed: UPTREND at {self.last_confirmed_trend_bar_index}")

        # FIX 4: Removed duplicate call - now log CDS and update state only once
        event_descriptions_list.append(f"Confirmed Downtrend Start from Bar {confirmed_cds_bar.index} ({confirmed_cds_bar.date})")
        self.current_confirmed_trend_is_uptrend = False 
        self.last_confirmed_trend_type = 'downtrend' 
        self.last_confirmed_trend_bar_index = confirmed_cds_bar.index
        trend_utils.log_debug(confirmed_cds_bar.index, f"CDS Confirmed from Bar {confirmed_cds_bar.index}. Last confirmed: DOWNTREND at {self.last_confirmed_trend_bar_index}") 