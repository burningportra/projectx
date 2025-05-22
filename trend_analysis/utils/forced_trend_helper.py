from ..models.bar import Bar

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
    # Convert 1-based indices from arguments to 0-based for list slicing and access.
    start_0idx = prev_confirmed_trend_bar_idx_1based - 1
    end_0idx = current_conflicting_trend_bar_idx_1based - 1

    # Validate indices: ensure they are within bounds and start_0idx is not after end_0idx.
    if start_0idx < 0 or end_0idx >= len(all_bars) or start_0idx > end_0idx:
        return None
    
    # Determine the slice for searching: it should be *between* the start and end bars.
    # Example: If CUS1 at Bar A, CUS2 (conflicting) at Bar D. Search for intervening point (potential CDS high) in B, C.
    # Slice start is (start_0idx + 1), slice end is (end_0idx - 1), inclusive for Python slicing [start:end+1].
    search_start_0idx = start_0idx + 1 
    search_end_0idx = end_0idx - 1

    # If the search range is empty or invalid (e.g., start_idx is adjacent to end_idx, or worse), return None.
    if search_start_0idx > search_end_0idx:
        return None

    # Extract the slice of bars to search within.
    relevant_slice = all_bars[search_start_0idx : search_end_0idx + 1]
    if not relevant_slice: # Should be caught by above check, but good for robustness.
        return None

    # Find the bar based on the specified criteria (lowest low or highest high).
    if find_lowest_low_for_forced_cus:
        chosen_bar =  min(relevant_slice, key=lambda bar: bar.l) # For forced CUS, find lowest low
    else: # find highest_high for forced CDS
        chosen_bar = max(relevant_slice, key=lambda bar: bar.h) # For forced CDS, find highest high
    
    return chosen_bar 