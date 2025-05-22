from ..utils.forced_trend_helper import find_intervening_bar_for_forced_trend
import inspect # Add this at the top of state.py if not already there

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

        # Confirmed Downtrend Start (CDS) candidate state (this is a PDS being evaluated for confirmation)
        self.pds_candidate_for_cds_bar_index = None
        self.pds_candidate_for_cds_high = None
        self.pds_candidate_origin_bar_index_in_current_containment = None # Stores PDS origin if set during current old-style containment

        # Confirmed Uptrend Start (CUS) candidate state (this is a PUS being evaluated for confirmation)
        self.pus_candidate_for_cus_bar_index = None
        self.pus_candidate_for_cus_low = None
        self.pus_candidate_for_cus_high = None # Added high for CUS candidate
        self.pus_candidate_origin_bar_index_in_current_containment = None # Stores PUS origin if set during current old-style containment
        
        # General trend state
        self.last_confirmed_trend_type = None # 'uptrend' or 'downtrend'
        self.last_confirmed_trend_bar_index = None # Index of the bar that was confirmed as the start of the last trend
        self.last_confirmed_trend_anchor_high = None # High of the bar that started the last confirmed trend
        self.last_confirmed_trend_anchor_low = None  # Low of the bar that started the last confirmed trend

        # Old Containment state (based on PENDING candidates - to be deprecated by confirmed containment)
        self.in_containment = False # This flag is still used by rules, but its meaning will change
        self.containment_ref_bar_index = None
        self.containment_ref_type = "None" # 'PENDING_DOWNTREND_HIGH' or 'PENDING_UPTREND_LOW'
        self.containment_ref_high = None
        self.containment_ref_low = None
        self.containment_consecutive_bars_inside = 0
        self.containment_start_bar_index_for_log = None # For logging when containment started

        # New Confirmed Containment State (based on CONFIRMED CUS/CDS)
        self.last_confirmed_cus_bar_index: int | None = None
        self.last_confirmed_cus_bar_low: float | None = None
        self.last_confirmed_cus_bar_high: float | None = None # Added for symmetry, might be useful
        self.last_confirmed_cds_bar_index: int | None = None
        self.last_confirmed_cds_bar_high: float | None = None
        self.last_confirmed_cds_bar_low: float | None = None # Added for symmetry

        self.confirmed_containment_active: bool = False
        self.confirmed_containment_ref_high: float | None = None
        self.confirmed_containment_ref_low: float | None = None
        self.confirmed_containment_defined_by_cus_idx: int | None = None
        self.confirmed_containment_defined_by_cds_idx: int | None = None
        self.confirmed_containment_consecutive_bars_inside: int = 0 # For new confirmed containment
        self.confirmed_containment_start_bar_index_for_log: int | None = None # For new confirmed containment

        self.log_entries = []

    def _reset_pending_uptrend_signal_state(self):
        """Clears the basic pending uptrend signal state."""
        self.pending_uptrend_start_bar_index = None
        self.pending_uptrend_start_anchor_low = None

    def _reset_pus_candidate_state(self, event_descriptions_list=None, reason=None):
        msg = f"DEBUG: Resetting PUS candidate (was {self.pus_candidate_for_cus_bar_index})"
        if reason:
            msg += f" due to {reason}"
        if event_descriptions_list is not None:
            event_descriptions_list.append(msg)
        else:
            print(msg)
        self.pus_candidate_for_cus_bar_index = None
        self.pus_candidate_for_cus_low = None
        self.pus_candidate_for_cus_high = None

    def _reset_all_pending_uptrend_states(self):
        """Clears all state related to pending uptrends and PUS candidates."""
        self._reset_pending_uptrend_signal_state()
        self._reset_pus_candidate_state()

    def _reset_pds_candidate_state(self, event_descriptions_list=None, reason=None):
        msg = f"DEBUG: Resetting PDS candidate (was {self.pds_candidate_for_cds_bar_index})"
        if reason:
            msg += f" due to {reason}"
        if event_descriptions_list is not None:
            event_descriptions_list.append(msg)
        else:
            print(msg)
        self.pds_candidate_for_cds_bar_index = None
        self.pds_candidate_for_cds_high = None
        self.pds_candidate_for_cds_low = None

    def _reset_all_pending_downtrend_states(self):
        """Clears all state related to pending downtrends and PDS candidates."""
        self._reset_pds_candidate_state() # This will now also log its call

    def _reset_containment_state(self, event_descriptions_list=None):
        """Resets all OLD STYLE containment-related attributes (based on PENDING candidates).
        Also invalidates PUS/PDS candidates if they originated during the PENDING containment period that just ended,
        UNLESS the candidate's origin bar is the same as the containment reference bar (the bar that started containment).
        THIS METHOD WILL BE PHASED OUT OR REPURPOSED FOR CONFIRMED CONTAINMENT.
        """
        log_prefix = "DEBUG PENDING_CONT_RESET:"
        # Check and invalidate PUS candidate if it originated in the ending *pending* containment
        if self.pus_candidate_origin_bar_index_in_current_containment is not None and \
           self.pus_candidate_for_cus_bar_index == self.pus_candidate_origin_bar_index_in_current_containment and \
           self.pus_candidate_for_cus_bar_index != self.containment_ref_bar_index: # Don't invalidate if it IS the ref bar
            if event_descriptions_list is not None:
                event_descriptions_list.append(f"{log_prefix} Invalidating PUS cand {self.pus_candidate_for_cus_bar_index} (originated in ended pending cont.)")
            self._reset_pus_candidate_state(event_descriptions_list, reason="Pending containment ended, PUS candidate originated within")
        
        # Check and invalidate PDS candidate if it originated in the ending *pending* containment
        if self.pds_candidate_origin_bar_index_in_current_containment is not None and \
           self.pds_candidate_for_cds_bar_index == self.pds_candidate_origin_bar_index_in_current_containment and \
           self.pds_candidate_for_cds_bar_index != self.containment_ref_bar_index: # Don't invalidate if it IS the ref bar
            if event_descriptions_list is not None:
                event_descriptions_list.append(f"{log_prefix} Invalidating PDS cand {self.pds_candidate_for_cds_bar_index} (originated in ended pending cont.)")
            self._reset_pds_candidate_state(event_descriptions_list, reason="Pending containment ended, PDS candidate originated within")

        # Reset old containment state variables
        self.in_containment = False # This will be controlled by confirmed_containment_active logic
        self.containment_ref_bar_index = None
        self.containment_ref_type = "None"
        self.containment_ref_high = None
        self.containment_ref_low = None
        self.containment_consecutive_bars_inside = 0
        self.containment_start_bar_index_for_log = None
        self.pus_candidate_origin_bar_index_in_current_containment = None
        self.pds_candidate_origin_bar_index_in_current_containment = None
        if event_descriptions_list is not None:
            event_descriptions_list.append(f"{log_prefix} Old pending-style containment attributes reset.")

    def _reset_confirmed_containment_state_and_invalidate_candidates(self, event_descriptions_list=None):
        """
        Resets confirmed containment attributes and invalidates PUS/PDS candidates
        that originated *strictly between* the CUS and CDS that defined the ended containment.
        """
        log_prefix = "DEBUG CONF_CONT_RESET:"
        cus_def_idx = self.confirmed_containment_defined_by_cus_idx
        cds_def_idx = self.confirmed_containment_defined_by_cds_idx

        if cus_def_idx is not None and cds_def_idx is not None:
            # Determine the range of bars strictly within the containment
            # These are 1-based indices
            start_range_idx = min(cus_def_idx, cds_def_idx)
            end_range_idx = max(cus_def_idx, cds_def_idx)

            # Invalidate PUS candidate if it originated strictly within the ended confirmed containment
            if self.pus_candidate_for_cus_bar_index is not None and \
               start_range_idx < self.pus_candidate_for_cus_bar_index < end_range_idx:
                if event_descriptions_list is not None:
                    event_descriptions_list.append(
                        f"{log_prefix} Invalidating PUS cand {self.pus_candidate_for_cus_bar_index} "
                        f"(originated within ended confirmed cont. {start_range_idx}-{end_range_idx})."
                    )
                self._reset_pus_candidate_state(event_descriptions_list, reason="Confirmed containment ended, PUS originated within")

            # Invalidate PDS candidate if it originated strictly within the ended confirmed containment
            if self.pds_candidate_for_cds_bar_index is not None and \
               start_range_idx < self.pds_candidate_for_cds_bar_index < end_range_idx:
                if event_descriptions_list is not None:
                    event_descriptions_list.append(
                        f"{log_prefix} Invalidating PDS cand {self.pds_candidate_for_cds_bar_index} "
                        f"(originated within ended confirmed cont. {start_range_idx}-{end_range_idx})."
                    )
                self._reset_pds_candidate_state(event_descriptions_list, reason="Confirmed containment ended, PDS originated within")
        
        if event_descriptions_list is not None:
            event_descriptions_list.append(
                f"{log_prefix} Confirmed containment (was {cus_def_idx} L:{self.confirmed_containment_ref_low} / "
                f"{cds_def_idx} H:{self.confirmed_containment_ref_high}) ended."
            )

        self.confirmed_containment_active = False
        self.confirmed_containment_ref_high = None
        self.confirmed_containment_ref_low = None
        self.confirmed_containment_defined_by_cus_idx = None
        self.confirmed_containment_defined_by_cds_idx = None
        self.confirmed_containment_consecutive_bars_inside = 0
        self.confirmed_containment_start_bar_index_for_log = None
        # The 'in_containment' flag (used by rules) will be set to False by the analyzer when confirmed_containment_active becomes False.

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
            
            if self.in_containment: # Check if currently in containment
                # If this PDS is new or updates the existing PDS candidate during containment
                if self.pds_candidate_origin_bar_index_in_current_containment is None or \
                   bar_obj.index == self.pds_candidate_for_cds_bar_index:
                    self.pds_candidate_origin_bar_index_in_current_containment = bar_obj.index
            
            log_message = f"⏳D Pending Downtrend Start on Bar {bar_obj.index} ({bar_obj.date})"
            if reason_message_suffix:
                log_message += f" {reason_message_suffix}"
            event_descriptions_list.append(log_message)

            # Allow PUS and PDS to coexist on the same bar.
            # The following lines were removed/commented out:
            # if self.pending_uptrend_start_bar_index == bar_obj.index:
            #     self._reset_pending_uptrend_signal_state()
            # if self.pus_candidate_for_cus_bar_index == bar_obj.index:
            #     self._reset_pus_candidate_state(event_descriptions_list, reason=f"PDS also set on same bar {bar_obj.index}")
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
            
            if self.in_containment: # Check if currently in containment
                # If this PUS is new or updates the existing PUS candidate during containment
                if self.pus_candidate_origin_bar_index_in_current_containment is None or \
                   bar_obj.index == self.pus_candidate_for_cus_bar_index:
                    self.pus_candidate_origin_bar_index_in_current_containment = bar_obj.index
            
            log_message = f"⏳U Pending Uptrend Start on Bar {bar_obj.index} ({bar_obj.date})"
            if reason_message_suffix:
                log_message += f" {reason_message_suffix}"
            event_descriptions_list.append(log_message)
            pus_candidate_updated = True

        # If a PDS was set on this *same* bar, it's invalidated by this new PUS.
        # This handles cases where a bar might ambiguously signal both.
        # Allow PUS and PDS to coexist on the same bar.
        # The following lines were removed/commented out:
        # if self.pds_candidate_for_cds_bar_index == bar_obj.index:
        #     self._reset_pds_candidate_state(event_descriptions_list, reason=f"PUS also set on same bar {bar_obj.index}")
        return pus_candidate_updated

    def confirm_uptrend(self, confirmed_cus_bar, all_bars, event_descriptions_list, trigger_rule_type=None):
        """
        Confirms an uptrend, updates state including last confirmed trend, 
        and establishes new confirmed containment if applicable.
        """
        cus_bar_index = confirmed_cus_bar.index
        event_descriptions_list.append(f"DEBUG: Confirmed CUS at Bar {cus_bar_index}")
        self.last_confirmed_trend_type = "uptrend"
        self.last_confirmed_trend_bar_index = cus_bar_index
        self.last_confirmed_trend_anchor_low = confirmed_cus_bar.l
        self.last_confirmed_trend_anchor_high = confirmed_cus_bar.h # Store high as well

        self.last_confirmed_cus_bar_index = cus_bar_index
        self.last_confirmed_cus_bar_low = confirmed_cus_bar.l
        self.last_confirmed_cus_bar_high = confirmed_cus_bar.h
        
        # Check for and establish new confirmed containment
        if self.last_confirmed_cds_bar_index is not None:
            # Ensure CUS is after CDS to form a valid range, or CDS is after CUS
            # The key is they are two *opposing* confirmed signals.
            # The order doesn't strictly matter for defining the H/L range, but for logging/understanding it might.
            # We assume the analyzer ensures trends alternate for this to make sense.
            
            # A CUS has just been confirmed. If there's a prior CDS, they form containment.
            self.confirmed_containment_active = True
            self.confirmed_containment_defined_by_cus_idx = cus_bar_index
            self.confirmed_containment_defined_by_cds_idx = self.last_confirmed_cds_bar_index
            
            # Containment Low is CUS low, Containment High is CDS high
            self.confirmed_containment_ref_low = self.last_confirmed_cus_bar_low
            self.confirmed_containment_ref_high = self.last_confirmed_cds_bar_high # From the existing CDS

            # Reset consecutive inside bars counter for this new confirmed containment
            self.confirmed_containment_consecutive_bars_inside = 0 
            # Log start of this containment from the perspective of the CUS/CDS that formed it (this will be handled by analyzer)

            event_descriptions_list.append(
                f"DEBUG: New CONFIRMED CONTAINMENT established by CUS {cus_bar_index} (L:{self.confirmed_containment_ref_low}) "
                f"and prior CDS {self.last_confirmed_cds_bar_index} (H:{self.confirmed_containment_ref_high}). Active: {self.confirmed_containment_active}"
            )
            # The 'in_containment' flag for rules will be set by the analyzer based on confirmed_containment_active
        else:
            event_descriptions_list.append(
                 f"DEBUG: CUS {cus_bar_index} confirmed, but no prior CDS to form confirmed containment."
            )

        event_message_suffix = f" (Rule: {trigger_rule_type})" if trigger_rule_type else ""
        event_descriptions_list.append(f"📈 Confirmed Uptrend Start from Bar {confirmed_cus_bar.index} ({confirmed_cus_bar.date}){event_message_suffix}")

    def confirm_downtrend(self, confirmed_cds_bar, all_bars, event_descriptions_list, trigger_rule_type=None):
        """
        Confirms a downtrend, updates state including last confirmed trend,
        and establishes new confirmed containment if applicable.
        """
        cds_bar_index = confirmed_cds_bar.index
        event_descriptions_list.append(f"DEBUG: Confirmed CDS at Bar {cds_bar_index}")
        self.last_confirmed_trend_type = "downtrend"
        self.last_confirmed_trend_bar_index = cds_bar_index
        self.last_confirmed_trend_anchor_high = confirmed_cds_bar.h
        self.last_confirmed_trend_anchor_low = confirmed_cds_bar.l # Store low as well

        self.last_confirmed_cds_bar_index = cds_bar_index
        self.last_confirmed_cds_bar_high = confirmed_cds_bar.h
        self.last_confirmed_cds_bar_low = confirmed_cds_bar.l

        # Check for and establish new confirmed containment
        if self.last_confirmed_cus_bar_index is not None:
            # A CDS has just been confirmed. If there's a prior CUS, they form containment.
            self.confirmed_containment_active = True
            self.confirmed_containment_defined_by_cds_idx = cds_bar_index
            self.confirmed_containment_defined_by_cus_idx = self.last_confirmed_cus_bar_index

            # Containment High is CDS high, Containment Low is CUS low
            self.confirmed_containment_ref_high = self.last_confirmed_cds_bar_high
            self.confirmed_containment_ref_low = self.last_confirmed_cus_bar_low # From the existing CUS
            
            # Reset consecutive inside bars counter for this new confirmed containment
            self.confirmed_containment_consecutive_bars_inside = 0
            # Log start of this containment (this will be handled by analyzer)

            event_descriptions_list.append(
                f"DEBUG: New CONFIRMED CONTAINMENT established by CDS {cds_bar_index} (H:{self.confirmed_containment_ref_high}) "
                f"and prior CUS {self.last_confirmed_cus_bar_index} (L:{self.confirmed_containment_ref_low}). Active: {self.confirmed_containment_active}"
            )
            # The 'in_containment' flag for rules will be set by the analyzer based on confirmed_containment_active
        else:
            event_descriptions_list.append(
                f"DEBUG: CDS {cds_bar_index} confirmed, but no prior CUS to form confirmed containment."
            )

        event_message_suffix = f" (Rule: {trigger_rule_type})" if trigger_rule_type else ""
        event_descriptions_list.append(f"📉 Confirmed Downtrend Start from Bar {confirmed_cds_bar.index} ({confirmed_cds_bar.date}){event_message_suffix}") 