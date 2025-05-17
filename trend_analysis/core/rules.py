"""
Rules for confirming trend signals in price data.
"""

import logging

logger = logging.getLogger(__name__)

def check_custom_cds_confirmation_A(current_bar, prev_bar, peak_bar_for_cds, all_bars):
    """
    Rule A for confirming a downtrend start (CDS) on a previous peak bar.
    
    Conditions:
    1. current_bar.h > prev_bar.h (current bar makes higher high than previous)
    2. current_bar.c > prev_bar.c (current bar closes higher than previous)
    3. No bar between peak and prev_bar made a higher high than peak
    4. current_bar.l < peak_bar_for_cds.l (current bar makes lower low than peak)
    5. At least one bar between peak and prev_bar made a low <= peak's low
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        peak_bar_for_cds: The peak bar being evaluated for CDS
        all_bars: List of all bars for context checking
        
    Returns:
        bool: True if conditions for CDS confirmation are met
    """
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
        if start_1based_intermediate <= end_1based_intermediate:
             for j_1based_idx in range(start_1based_intermediate, end_1based_intermediate + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar_for_cds.l:
                    found_deep_enough_pullback = True
                    break
    
    return found_deep_enough_pullback and cond1_orig and cond2_orig and no_higher_high_intermediate and cond4_orig


def check_custom_cds_confirmation_B(current_bar, prev_bar, peak_bar_for_cds, all_bars):
    """
    Rule B for confirming a downtrend start (CDS) on a previous peak bar.
    
    Conditions:
    1. current_bar.c > prev_bar.c (current bar closes higher than previous)
    2. current_bar.l >= prev_bar.l (current bar's low respects previous bar's low)
    3. current_bar.h > peak_bar_for_cds.h (current bar makes higher high than peak)
    4. No bar between peak and prev_bar made a higher high than peak
    5. At least one bar between peak and prev_bar made a low <= peak's low
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        peak_bar_for_cds: The peak bar being evaluated for CDS
        all_bars: List of all bars for context checking
        
    Returns:
        bool: True if conditions for CDS confirmation are met
    """
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
        if start_1based_intermediate <= end_1based_intermediate:
             for j_1based_idx in range(start_1based_intermediate, end_1based_intermediate + 1):
                if all_bars[j_1based_idx - 1].l <= peak_bar_for_cds.l:
                    found_deep_enough_pullback = True
                    break
    
    return found_deep_enough_pullback and cond1_orig and cond2_orig and cond3_orig and no_higher_high_intermediate


def check_custom_cds_confirmation_F(current_bar, prev_bar, peak_bar_for_cds, all_bars):
    """
    Rule F for confirming a downtrend start (CDS) on a previous peak bar.
    
    Conditions:
    1. No bar between peak and prev_bar made a higher high than peak
    2. prev_bar.l < peak_bar_for_cds.l (previous bar made a new low below peak's low)
    3. current_bar.h > prev_bar.h (current bar attempts to rally above previous bar's high)
    4. current_bar.c < prev_bar.c (current bar closes lower than previous - fails rally)
    5. current_bar.c < current_bar.o (current bar is a down-closing bar)
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        peak_bar_for_cds: The peak bar being evaluated for CDS
        all_bars: List of all bars for context checking
        
    Returns:
        bool: True if conditions for CDS confirmation are met
    """
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
    
    return cond5_curr_down_close  # If all prior conditions passed


def check_custom_cds_confirmation_G(current_bar, prev_bar, peak_bar_for_cds, all_bars):
    """
    Rule G for confirming a downtrend start (CDS) on a previous peak when current bar forms a SUB with prev_bar.
    
    Conditions:
    1. is_SUB(current_bar, prev_bar) is TRUE (this implies prev_bar becomes PUS)
    2. prev_bar.l < peak_bar_for_cds.l (the PUS bar made a low below the old PDS peak's low)
    3. No bar between peak and prev_bar made a higher high than peak
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        peak_bar_for_cds: The peak bar being evaluated for CDS
        all_bars: List of all bars for context checking
        
    Returns:
        bool: True if conditions for CDS confirmation are met
    """
    from trend_analysis.core.patterns import is_SUB
    
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
    """
    Rule H for confirming a downtrend start (CDS) when current_bar is an outside bar of prev_bar (which is the peak).
    
    Conditions:
    1. current_bar.h > prev_bar_is_peak.h (current bar makes higher high than peak)
    2. current_bar.l < prev_bar_is_peak.l (current bar makes lower low than peak)
    3. current_bar.c > prev_bar_is_peak.c (current bar closes higher than peak)
    
    Args:
        current_bar: The current bar being processed
        prev_bar_is_peak: The previous bar which is also the peak being evaluated
        
    Returns:
        bool: True if conditions for CDS confirmation are met
    """
    cond_higher_high = current_bar.h > prev_bar_is_peak.h
    cond_lower_low = current_bar.l < prev_bar_is_peak.l
    # We might also require current_bar.c > prev_bar_is_peak.c to confirm the reversal for PUS generation
    cond_closes_stronger = current_bar.c > prev_bar_is_peak.c 
    return cond_higher_high and cond_lower_low and cond_closes_stronger  # Added closes_stronger for PUS logic


def check_custom_cus_confirmation_ref36(current_bar, prev_bar, pds_candidate_bar):
    """
    Special reference rule for confirming an uptrend start (CUS).
    
    Conditions:
    1. current_bar.l < pds_candidate_bar.l (current bar makes lower low than PDS candidate)
    2. current_bar.h <= pds_candidate_bar.h (current bar's high respects the PDS candidate's high)
    3. current_bar.c > prev_bar.c (current bar closes higher than previous bar)
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        pds_candidate_bar: A PDS candidate bar for context
        
    Returns:
        bool: True if conditions for CUS confirmation are met
    """
    if pds_candidate_bar is None:
        return False
    
    original_cond_low_undercut = current_bar.l < pds_candidate_bar.l
    original_cond_high_respect = current_bar.h <= pds_candidate_bar.h
    new_cond_closes_stronger = current_bar.c > prev_bar.c
    
    return original_cond_low_undercut and original_cond_high_respect and new_cond_closes_stronger


def check_custom_cus_confirmation_HHLL(current_bar, prev_bar):
    """
    HHLL rule for confirming an uptrend start (CUS).
    
    Conditions:
    1. current_bar.h > prev_bar.h (current bar makes higher high than previous)
    2. current_bar.l < prev_bar.l (current bar makes lower low than previous)
    3. current_bar.c < current_bar.o (current bar closes below its open - down bar)
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        
    Returns:
        bool: True if conditions for CUS confirmation are met
    """
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l
    cond3_down_close = current_bar.c < current_bar.o
    return cond1_higher_high and cond2_lower_low and cond3_down_close


def check_custom_cus_EngulfingUp(current_bar, prev_bar, initial_pds_candidate_bar_obj_for_context):
    """
    Engulfing Up rule for confirming an uptrend start (CUS).
    
    Conditions:
    1. current_bar.h > prev_bar.h (current bar makes higher high than previous)
    2. current_bar.l < prev_bar.l (current bar makes lower low than previous)
    3. current_bar.c > prev_bar.c (current bar closes higher than previous)
    4. current_bar.c > current_bar.o (current bar is an UP bar)
    5. current_bar.l < initial_pds_candidate_bar_obj.l (current bar breaks below a relevant PDS low)
    
    Args:
        current_bar: The current bar being processed
        prev_bar: The previous bar
        initial_pds_candidate_bar_obj_for_context: A PDS candidate bar for context
        
    Returns:
        bool: True if conditions for CUS confirmation are met
    """
    cond1_higher_high = current_bar.h > prev_bar.h
    cond2_lower_low = current_bar.l < prev_bar.l 
    cond3_closes_higher_than_prev_close = current_bar.c > prev_bar.c
    cond4_up_bar = current_bar.c > current_bar.o
    
    cond5_break_pds_low = False  # Default to FALSE if no PDS context
    if initial_pds_candidate_bar_obj_for_context is not None:
        cond5_break_pds_low = current_bar.l < initial_pds_candidate_bar_obj_for_context.l
        
    return cond1_higher_high and cond2_lower_low and cond3_closes_higher_than_prev_close and cond4_up_bar and cond5_break_pds_low 