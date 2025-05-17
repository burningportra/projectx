"""
Helper functions for trend analysis.
"""

import logging

logger = logging.getLogger(__name__)

def get_unique_sorted_events(descriptions):
    """
    Get a sorted list of unique event descriptions.
    
    Args:
        descriptions (list): List of event description strings
        
    Returns:
        list: Sorted list of unique event descriptions
    """
    seen = set()
    unique_list = []
    
    for item in descriptions:
        if item not in seen:
            seen.add(item)
            unique_list.append(item)
    
    return sorted(unique_list)


def find_intervening_bar(all_bars, start_bar_idx_1based, end_bar_idx_1based, find_lowest_low=True):
    """
    Find either the highest high or lowest low bar between two bars.
    
    This function is used for forcing alternation in trend detection, helping
    to identify the reversal point between two confirmed trend signals.
    
    Args:
        all_bars (list): List of all Bar objects
        start_bar_idx_1based (int): 1-based index of the starting bar
        end_bar_idx_1based (int): 1-based index of the ending bar
        find_lowest_low (bool): If True, find lowest low; if False, find highest high
        
    Returns:
        Bar or None: The bar with either the lowest low or highest high, or None if no
                    bars exist between the start and end indices
    """
    logger.debug(f"Finding intervening bar: start_idx={start_bar_idx_1based}, "
               f"end_idx={end_bar_idx_1based}, find_low={find_lowest_low}")
    
    # 1-based indices converted to 0-based for slicing
    start_0idx = start_bar_idx_1based - 1
    end_0idx = end_bar_idx_1based - 1

    if start_0idx < 0 or end_0idx >= len(all_bars) or start_0idx > end_0idx:
        logger.debug("Invalid indices for find_intervening_bar")
        return None
    
    # Ensure the slice is valid and not empty. Slice is inclusive of start_0idx+1, exclusive of end_0idx.
    search_start_0idx = start_0idx + 1 
    search_end_0idx = end_0idx - 1

    if search_start_0idx > search_end_0idx:
        logger.debug("No bars in between start and end")
        return None

    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice:
        logger.debug("Relevant slice is empty")
        return None

    if find_lowest_low:
        chosen_bar = min(relevant_slice, key=lambda bar: bar.l)
        logger.debug(f"Found lowest low bar: {chosen_bar.index} with low: {chosen_bar.l}")
    else:  # find highest_high
        chosen_bar = max(relevant_slice, key=lambda bar: bar.h)
        logger.debug(f"Found highest high bar: {chosen_bar.index} with high: {chosen_bar.h}")
    
    return chosen_bar


def validate_bars(bars):
    """
    Validate that the bar data is suitable for trend analysis.
    
    Args:
        bars (list): List of Bar objects to validate
        
    Returns:
        bool: True if data is valid, False otherwise
        
    Raises:
        ValueError: If the bars do not meet basic requirements
    """
    if not bars:
        raise ValueError("No bar data provided")
    
    if len(bars) < 3:
        raise ValueError("At least 3 bars are required for trend analysis")
    
    # Check for chronological order and valid OHLC values
    for i, bar in enumerate(bars):
        if i > 0:  # Skip first bar
            if bar.index != bars[i-1].index + 1:
                raise ValueError(f"Non-sequential bar indices at position {i}: "
                               f"{bars[i-1].index} followed by {bar.index}")
        
        # Check for valid OHLC values
        if bar.h < bar.l:
            raise ValueError(f"Invalid bar data at index {bar.index}: "
                           f"high ({bar.h}) is less than low ({bar.l})")
        
        if bar.o < 0 or bar.h < 0 or bar.l < 0 or bar.c < 0:
            raise ValueError(f"Negative price value found at index {bar.index}")
    
    return True 