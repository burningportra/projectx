from .models.state import State
from .models.bar import Bar
from .rules.cus_rules import _evaluate_cus_rules
from .rules.cds_rules import _evaluate_cds_rules
from .patterns.bar_patterns import (
    is_lower_ohlc_bar, is_pending_downtrend_start_rule, is_simple_pending_downtrend_start_signal,
    is_higher_ohlc_bar, is_pending_uptrend_start_rule, is_simple_pending_uptrend_start_signal
)
from .utils.log_utils import get_unique_sorted_events

class TrendAnalyzer:
    def __init__(self):
        self.state = State()

    def _apply_cus_confirmation(self, current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, all_bars, current_bar_event_descriptions):
        """
        Applies the consequences of a Confirmed Uptrend Start (CUS).
        Updates state, logs events, and handles PDS generation after CUS.
        """
        # --- Forced Alternation Logic for CUS --- 
        self.state.confirm_uptrend(confirmed_bar_for_this_cus, all_bars, current_bar_event_descriptions, trigger_rule_type=cus_trigger_rule_type)
        
        # Clear all PUS (Pending Uptrend Start) states as this PUS candidate is now confirmed.
        self.state._reset_all_pending_uptrend_states()

        # --- PDS Generation/Update after CUS --- 
        made_cus_bar_pds = False 
        cus_triggering_bar = current_bar # The bar whose action triggered this CUS
        if confirmed_bar_for_this_cus and cus_triggering_bar: 
            is_pds_by_trigger = False
            if is_lower_ohlc_bar(cus_triggering_bar, confirmed_bar_for_this_cus) or \
               is_pending_downtrend_start_rule(cus_triggering_bar, confirmed_bar_for_this_cus) or \
               is_simple_pending_downtrend_start_signal(cus_triggering_bar, confirmed_bar_for_this_cus):
                is_pds_by_trigger = True
            
            if is_pds_by_trigger:
                if self.state.pds_candidate_for_cds_bar_index is None or \
                   confirmed_bar_for_this_cus.h > self.state.pds_candidate_for_cds_high:
                    current_bar_event_descriptions.append(f"Pending Downtrend Start on Bar {confirmed_bar_for_this_cus.index} (due to trigger by {cus_triggering_bar.index})")
                    self.state.set_new_pending_downtrend_signal(confirmed_bar_for_this_cus, current_bar_event_descriptions, reason_message_suffix=f"(Post-CUS of {confirmed_bar_for_this_cus.index} by rule {cus_trigger_rule_type}, trigger by {cus_triggering_bar.index})")
                    made_cus_bar_pds = True
        
        if not made_cus_bar_pds: 
            if cus_trigger_rule_type == "HigherHighLowerLowDownClose":
                current_bar_event_descriptions.append(f"Pending Downtrend Start on Bar {current_bar.index} ({current_bar.date})")
                self.state.set_new_pending_downtrend_signal(current_bar, current_bar_event_descriptions, reason_message_suffix=f"(Post-CUS of {confirmed_bar_for_this_cus.index} by rule {cus_trigger_rule_type})")
            elif cus_trigger_rule_type == "EngulfingUpPDSLowBreak":
                pass 
            else: 
                if cus_trigger_rule_type != "EngulfingUpPDSLowBreak": 
                    if self.state.pds_candidate_for_cds_bar_index is None or \
                       confirmed_bar_for_this_cus.h > self.state.pds_candidate_for_cds_high:
                        current_bar_event_descriptions.append(f"Pending Downtrend Start on Bar {confirmed_bar_for_this_cus.index} ({confirmed_bar_for_this_cus.date})")
                        self.state.set_new_pending_downtrend_signal(confirmed_bar_for_this_cus, current_bar_event_descriptions, reason_message_suffix=f"(Post-CUS of {confirmed_bar_for_this_cus.index} by rule {cus_trigger_rule_type})")

    def _apply_cds_confirmation(self, confirmed_bar_for_this_cds, cds_trigger_rule_type, all_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions):
        """
        Applies the consequences of a Confirmed Downtrend Start (CDS).
        Updates state, logs events, and handles PUS invalidation.
        """
        # --- Forced Alternation Logic for CDS ---
        self.state.confirm_downtrend(confirmed_bar_for_this_cds, all_bars, current_bar_event_descriptions, trigger_rule_type=cds_trigger_rule_type)
        
        # Invalidate/clear any PUS candidate that occurred at or before this confirmed CDS bar.
        if self.state.pus_candidate_for_cus_bar_index is not None and \
           initial_pus_candidate_bar_obj is not None and \
           self.state.pus_candidate_for_cus_bar_index <= initial_pus_candidate_bar_obj.index: 
            self.state._reset_all_pending_uptrend_states()
        
        # Clear the PDS state that was just confirmed by this CDS.
        if self.state.pds_candidate_for_cds_bar_index == confirmed_bar_for_this_cds.index:
            self.state._reset_all_pending_downtrend_states()

    def _handle_containment_logic(self, current_bar, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions):
        """
        Manages logic for entering, exiting, and tracking price containment.
        Modifies state.in_containment and related fields, and appends to current_bar_event_descriptions.
        """
        if self.state.in_containment:
            if current_bar.index == self.state.containment_start_bar_index_for_log:
                pass 
            elif current_bar.h <= self.state.containment_ref_high and \
                 current_bar.l >= self.state.containment_ref_low:
                self.state.containment_consecutive_bars_inside += 1
                current_bar_event_descriptions.append(
                    f"🧱 Containment: Bar {current_bar.index} inside Bar {self.state.containment_ref_bar_index} "
                    f"({self.state.containment_ref_type} H:{self.state.containment_ref_high}, L:{self.state.containment_ref_low}) "
                    f"for {self.state.containment_consecutive_bars_inside} bars."
                )
            else: # current bar is outside the containment range
                break_type = "moves outside"
                if current_bar.c > self.state.containment_ref_high: break_type = "💨 BREAKOUT above"
                elif current_bar.c < self.state.containment_ref_low: break_type = "💨 BREAKDOWN below"
                current_bar_event_descriptions.append(
                    f"Containment ENDED: Bar {current_bar.index} {break_type} Bar {self.state.containment_ref_bar_index} range "
                    f"(was {self.state.containment_consecutive_bars_inside} bar(s) inside)."
                )
                self.state._reset_containment_state()
            
        # Check for new containment if not currently in one
        if not self.state.in_containment:
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
                    self.state.in_containment = True
                    self.state.containment_ref_bar_index = chosen_candidate_ref_bar.index
                    self.state.containment_ref_type = ref_type_for_log
                    self.state.containment_ref_high = chosen_candidate_ref_bar.h
                    self.state.containment_ref_low = chosen_candidate_ref_bar.l
                    self.state.containment_start_bar_index_for_log = current_bar.index
                    self.state.containment_consecutive_bars_inside = 1 # First bar inside
                    current_bar_event_descriptions.append(
                        f"🧱 Containment START: Bar {current_bar.index} inside Bar {self.state.containment_ref_bar_index} "
                        f"({self.state.containment_ref_type} H:{self.state.containment_ref_high}, L:{self.state.containment_ref_low})."
                    )

    def _check_and_set_new_pending_signals(self, current_bar, prev_bar, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions):
        """
        Checks for and sets new Pending Downtrend Start (PDS) or Pending Uptrend Start (PUS) signals.
        This includes PDS Rule C and general PDS/PUS generation on prev_bar.
        Modifies state for pending signals and appends to current_bar_event_descriptions.
        """
        new_pds_on_curr_bar_this_iteration = False
        if current_bar.h > prev_bar.h and current_bar.c < current_bar.o: 
            current_bar_event_descriptions.append(f"Pending Downtrend Start on Bar {current_bar.index} ({current_bar.date}) by Rule C")
            self.state.set_new_pending_downtrend_signal(current_bar, current_bar_event_descriptions, reason_message_suffix="(by Rule C: HH & Down Close)")
            new_pds_on_curr_bar_this_iteration = True
            
        if not cds_confirmed_this_iteration and not new_pds_on_curr_bar_this_iteration:
            # Check for general PDS on prev_bar
            if is_lower_ohlc_bar(current_bar, prev_bar) or \
               is_pending_downtrend_start_rule(current_bar, prev_bar) or \
               is_simple_pending_downtrend_start_signal(current_bar, prev_bar):
                # Only attempt to set prev_bar as PDS if it offers a higher high than current PDS, or if no PDS exists
                if self.state.pds_candidate_for_cds_bar_index is None or \
                   prev_bar.h > self.state.pds_candidate_for_cds_high:
                    current_bar_event_descriptions.append(f"Signal for Pending Downtrend Start on Bar {prev_bar.index} (general PDS rule on prev_bar)")
                    self.state.set_new_pending_downtrend_signal(prev_bar, current_bar_event_descriptions, reason_message_suffix="(general PDS rule on prev_bar)")
                else:
                    if self.state.pds_candidate_for_cds_bar_index is not None:
                        current_bar_event_descriptions.append(
                            f"Info: prev_bar {prev_bar.index} (H:{prev_bar.h}) not set as PDS. "
                            f"Existing PDS is {self.state.pds_candidate_for_cds_bar_index} (H:{self.state.pds_candidate_for_cds_high}). "
                            f"prev_bar.h is not > existing PDS.H."
                        )
            
        # Check for new PUS on prev_bar
        # Allow PUS to form on prev_bar even if a CUS for a *different* PUS candidate was confirmed in this iteration.
        # Still prevent PUS on prev_bar if current_bar itself formed a strong PDS (like Rule C by HH & Down Close), as that's contradictory.
        if not new_pds_on_curr_bar_this_iteration: # Check if current bar itself became a PDS by Rule C
            if is_higher_ohlc_bar(current_bar, prev_bar) or \
                 is_pending_uptrend_start_rule(current_bar, prev_bar) or \
                 is_simple_pending_uptrend_start_signal(current_bar, prev_bar):
                self.state.set_new_pending_uptrend_signal(prev_bar, current_bar_event_descriptions, reason_message_suffix="(general PUS rule on prev_bar)")

    def analyze(self, all_bars):
        """
        Main logic for processing bars to identify price direction signals and confirmations.

        Args:
            all_bars (list[Bar]): A list of Bar objects, in chronological order.

        Returns:
            list[str]: A list of log entries describing the events at each bar.
        """
        if not all_bars:
            return []

        self.state = State() # Initialize the state machine

        # Iterate through each bar to process its impact on the trend state
        for k in range(len(all_bars)):
            log_index_for_this_entry = k + 1 # 1-based index for logging clarity
            current_bar_event_descriptions = [] # Collect all event descriptions for the current bar

            # --- INITIALIZATION FOR THE CURRENT BAR --- 
            # The first bar cannot be compared to a previous one, so log "Nothing" and continue.
            if k == 0:
                self.state.log_entries.append(f"{log_index_for_this_entry}. Nothing")
                continue
            
            current_bar = all_bars[k]
            prev_bar = all_bars[k-1]
            
            # Flags to track if a CUS or CDS was confirmed in this iteration
            cus_confirmed_this_iteration = False
            cds_confirmed_this_iteration = False

            # --- Store initial PUS/PDS candidates for this iteration's evaluation --- 
            # These are the candidates *before* the current_bar is fully processed.
            initial_pus_candidate_idx = self.state.pus_candidate_for_cus_bar_index
            initial_pus_candidate_bar_obj = None
            if initial_pus_candidate_idx is not None:
                initial_pus_candidate_bar_obj = all_bars[initial_pus_candidate_idx - 1]

            initial_pds_candidate_idx = self.state.pds_candidate_for_cds_bar_index
            initial_pds_candidate_bar_obj = None
            if initial_pds_candidate_idx is not None:
                initial_pds_candidate_bar_obj = all_bars[initial_pds_candidate_idx - 1]

            # --- SECTION 1: CONTAINMENT LOGIC --- 
            self._handle_containment_logic(current_bar, initial_pds_candidate_bar_obj, initial_pus_candidate_bar_obj, current_bar_event_descriptions)

            # --- SECTION 2: CUS (CONFIRMED UPTREND START) EVALUATION --- 
            can_confirm_cus, cus_trigger_rule_type = _evaluate_cus_rules(
                current_bar, prev_bar, initial_pus_candidate_bar_obj, initial_pds_candidate_bar_obj, self.state, all_bars
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
                self._apply_cus_confirmation(current_bar, confirmed_bar_for_this_cus, cus_trigger_rule_type, all_bars, current_bar_event_descriptions)
            
            # --- 4.2: CDS Consequences --- 
            # This section is processed if CUS was NOT confirmed in this iteration, OR if CDS confirmation is independent.
            # However, if CUS was confirmed, `cus_confirmed_this_iteration` is true, which affects subsequent PDS/PUS generation logic.
            if can_confirm_cds: # `can_confirm_cds` was determined in Section 3
                cds_confirmed_this_iteration = True # Mark that a CDS was confirmed
                confirmed_bar_for_this_cds = initial_pds_candidate_bar_obj # The bar that was confirmed as CDS
                self._apply_cds_confirmation(confirmed_bar_for_this_cds, cds_trigger_rule_type, all_bars, initial_pus_candidate_bar_obj, current_bar_event_descriptions)

            # --- SECTION 5: CHECK FOR NEW PENDING SIGNALS (PDS/PUS on prev_bar or current_bar) ---
            self._check_and_set_new_pending_signals(current_bar, prev_bar, cds_confirmed_this_iteration, cus_confirmed_this_iteration, current_bar_event_descriptions)

            # --- SECTION 6: FINALIZE LOG ENTRY FOR THE CURRENT BAR ---
            if not current_bar_event_descriptions:
                final_log_text = "➖ Neutral" # Default if no specific events occurred
            else:
                unique_events = get_unique_sorted_events(current_bar_event_descriptions) 
                final_log_text = "; ".join(unique_events)
            
            self.state.log_entries.append(f"{log_index_for_this_entry}. {final_log_text}")
        return self.state.log_entries 