from ..utils.forced_trend_helper import find_intervening_bar_for_forced_trend

class State:
    """Holds the current state of the trend analysis algorithm as it processes bars."""
    def __init__(self):
        """Initializes the state with default values."""
        # Pending Downtrend Start (PDS) state
        self.pending_downtrend_start_bar_index = None # DEPRECATED: Merged with PDS candidate
        self.pending_downtrend_start_anchor_high = None # DEPRECATED: Merged with PDS candidate

        # Pending Uptrend Start (PUS) state
        self.pending_uptrend_start_bar_index = None # 1-based index of the bar that initiated a pending uptrend
        self.pending_uptrend_start_anchor_low = None  # The low price of the bar that initiated the pending uptrend

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
    
    def set_new_pending_downtrend_signal(self, bar_obj, event_descriptions_list, reason_message_suffix=""):
        """
        Sets a new Pending Downtrend Start (PDS) signal on the given bar_obj.
        Updates PDS and PDS candidate states, logs the event, and clears any
        conflicting PUS signal that was set on the exact same bar.
        Returns True if a new PDS was actually set (or updated to a higher high).
        """
        # PDS is only set if the new PDS is at a higher high than an existing one, or if no PDS exists.
        # This method now also takes over being the primary PDS "candidate" setter too.
        if self.pds_candidate_for_cds_bar_index is None or \
           bar_obj.h > self.pds_candidate_for_cds_high:
            
            self.pending_downtrend_start_bar_index = bar_obj.index
            self.pending_downtrend_start_anchor_high = bar_obj.h
            self.pds_candidate_for_cds_bar_index = bar_obj.index
            self.pds_candidate_for_cds_high = bar_obj.h
            self.pds_candidate_for_cds_low = bar_obj.l
            
            log_message = f"⏳D Pending Downtrend Start on Bar {bar_obj.index} ({bar_obj.date})"
            if reason_message_suffix:
                log_message += f" {reason_message_suffix}"
            event_descriptions_list.append(log_message)

            # If a PUS was set on this *same* bar, it's invalidated by this new PDS.
            if self.pending_uptrend_start_bar_index == bar_obj.index:
                self._reset_pending_uptrend_signal_state()
            if self.pus_candidate_for_cus_bar_index == bar_obj.index:
                self._reset_pus_candidate_state()
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
            
            log_message = f"⏳U Pending Uptrend Start on Bar {bar_obj.index} ({bar_obj.date})"
            if reason_message_suffix:
                log_message += f" {reason_message_suffix}"
            event_descriptions_list.append(log_message)
            pus_candidate_updated = True

        # If a PDS was set on this *same* bar, it's invalidated by this new PUS.
        # This handles cases where a bar might ambiguously signal both.
        if self.pds_candidate_for_cds_bar_index == bar_obj.index:
            self._reset_pds_candidate_state()
        return pus_candidate_updated

    def confirm_uptrend(self, confirmed_cus_bar, all_bars, event_descriptions_list, trigger_rule_type=None):
        """
        Confirms an uptrend based on confirmed_cus_bar.
        Handles forced alternation, logs the CUS, and updates overall trend state.
        """
        # --- Forced Alternation Logic for CUS ---
        if self.last_confirmed_trend_type == 'uptrend' and \
           (self.last_confirmed_trend_bar_index is not None and confirmed_cus_bar and confirmed_cus_bar.index > self.last_confirmed_trend_bar_index):
            intervening_high_bar_for_forced_cds = find_intervening_bar_for_forced_trend(
                all_bars, self.last_confirmed_trend_bar_index, confirmed_cus_bar.index, find_lowest_low_for_forced_cus=False
            )
            if intervening_high_bar_for_forced_cds:
                event_descriptions_list.append(f"⚠️📉 Forced Downtrend: Bar {intervening_high_bar_for_forced_cds.index} ({intervening_high_bar_for_forced_cds.date}) due to consecutive uptrends.")
                # Note: This forced CDS doesn't change the primary CUS being confirmed now,
                # but it acknowledges a trend that should have been there.
                # We could potentially also update last_confirmed_trend_type/bar_index here if the forced CDS should take precedence immediately,
                # but current logic is to log it and proceed with CUS confirmation.

        # --- Log CUS and Update State --- 
        log_message = f"📈 Confirmed Uptrend Start from Bar {confirmed_cus_bar.index} ({confirmed_cus_bar.date})"
        if trigger_rule_type:
            log_message += f" by Rule: {trigger_rule_type}"
        event_descriptions_list.append(log_message)
        self.current_confirmed_trend_is_uptrend = True 
        self.last_confirmed_trend_type = 'uptrend' 
        self.last_confirmed_trend_bar_index = confirmed_cus_bar.index

    def confirm_downtrend(self, confirmed_cds_bar, all_bars, event_descriptions_list, trigger_rule_type=None):
        """
        Confirms a downtrend based on confirmed_cds_bar.
        Handles forced alternation, logs the CDS, and updates overall trend state.
        """
        # --- Forced Alternation Logic for CDS ---
        if self.last_confirmed_trend_type == 'downtrend' and \
           (self.last_confirmed_trend_bar_index is not None and confirmed_cds_bar and confirmed_cds_bar.index > self.last_confirmed_trend_bar_index):
            intervening_low_bar_for_forced_cus = find_intervening_bar_for_forced_trend(
                all_bars, self.last_confirmed_trend_bar_index, confirmed_cds_bar.index, find_lowest_low_for_forced_cus=True
            )
            if intervening_low_bar_for_forced_cus:
                event_descriptions_list.append(f"⚠️📈 Forced Uptrend: Bar {intervening_low_bar_for_forced_cus.index} ({intervening_low_bar_for_forced_cus.date}) due to consecutive downtrends.")
                # Similar to CUS, this forced CUS is logged but doesn't override the current CDS confirmation immediately.

        # --- Log CDS and Update State --- 
        log_message = f"📉 Confirmed Downtrend Start from Bar {confirmed_cds_bar.index} ({confirmed_cds_bar.date})"
        if trigger_rule_type:
            log_message += f" by Rule: {trigger_rule_type}"
        event_descriptions_list.append(log_message)
        self.current_confirmed_trend_is_uptrend = False 
        self.last_confirmed_trend_type = 'downtrend' 
        self.last_confirmed_trend_bar_index = confirmed_cds_bar.index 