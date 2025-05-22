def get_unique_sorted_events(descriptions):
    """
    Takes a list of event description strings, removes duplicates, and sorts them.
    This is used to ensure log entries for a single bar are consistent and ordered.

    Args:
        descriptions (list[str]): A list of event description strings.

    Returns:
        list[str]: A sorted list of unique event description strings.
    """
    seen = set() # Use a set for efficient tracking of seen items
    unique_list = []
    # print(f"DEBUG get_unique_sorted_events INPUT: {descriptions}") # Optional: too verbose normally
    for item in descriptions:
        if item not in seen:
            seen.add(item)
            unique_list.append(item)
        # else:
            # print(f"DEBUG get_unique_sorted_events DUPLICATE SKIPPED: {item}") # Optional
    # print(f"DEBUG get_unique_sorted_events unique_list before sort: {unique_list}") # Optional
    # print(f"DEBUG get_unique_sorted_events RETURN: {sorted(unique_list)}") # Optional
    return sorted(unique_list) # Sort the unique list before returning 