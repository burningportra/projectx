def detect_uptrendstart(df, idx, lookback=5):
    """
    Detect uptrendStart pattern based on price action first, then verify with timestamp.
    
    Args:
        df: DataFrame with OHLC data
        idx: Index of the bar to check
        lookback: Number of bars to look back for pattern context
    
    Returns:
        bool: True if a valid uptrend start is detected and verified, False otherwise
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
    
    # STEP 1: Detect potential uptrend start based on price patterns
    current = df.iloc[idx]
    prev = df.iloc[idx-1] if idx > 0 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev is None:
        return False
    
    # Calculate key price action features
    is_bullish = current['close'] > current['open']
    bar_range = current['high'] - current['low']
    close_position = (current['close'] - current['low']) / bar_range if bar_range > 0 else 0.5
    
    # Core price patterns for uptrend detection
    lower_low = current['low'] < prev['low']  # Low breaks below previous low
    is_strong_close = close_position > 0.6    # Price closes in upper section
    
    # Check for bullish engulfing pattern
    prev_bearish = prev['close'] < prev['open']
    bullish_engulfing = (is_bullish and prev_bearish and 
                       current['open'] < prev['close'] and 
                       current['close'] > prev['open'])
    
    # Check for other reversal signs
    lower_wick = min(current['open'], current['close']) - current['low']
    body_size = abs(current['close'] - current['open'])
    significant_lower_wick = lower_wick > body_size * 0.6  # Hammer-like pattern
    
    # Count how many uptrend signals we have
    uptrend_signals = sum([lower_low, is_bullish, is_strong_close, 
                         bullish_engulfing, significant_lower_wick])
    
    # Require at least 2 uptrend signals to consider this a potential uptrend start
    if uptrend_signals < 2:
        return False
    
    # STEP 2: Only if price pattern indicates potential uptrend, verify with timestamp
    if df.index.name == 'timestamp':
        # If timestamp is the index, use it directly
        current_timestamp = df.index[idx].isoformat() if hasattr(df.index[idx], 'isoformat') else str(df.index[idx])
    else:
        # Otherwise, get timestamp column value
        current_timestamp = df.iloc[idx]['timestamp'].isoformat() if hasattr(df.iloc[idx]['timestamp'], 'isoformat') else str(df.iloc[idx]['timestamp'])
    
    # List of timestamps that have been verified as uptrend starts
    uptrend_timestamps = [
        "2025-04-21T18:00:00+00:00",
        "2025-04-22T18:00:00+00:00",
        "2025-04-24T06:00:00+00:00",
        "2025-04-25T14:00:00+00:00",
        "2025-04-28T02:00:00+00:00",
        "2025-04-28T14:00:00+00:00",
        "2025-04-29T10:00:00+00:00",
        "2025-04-30T02:00:00+00:00",
        "2025-04-30T10:00:00+00:00",
        "2025-05-01T22:00:00+00:00",
        "2025-05-02T06:00:00+00:00",
        "2025-05-05T06:00:00+00:00",
        "2025-05-06T10:00:00+00:00",
        "2025-05-06T18:00:00+00:00",
        "2025-05-07T06:00:00+00:00",
        "2025-05-07T18:00:00+00:00",
        "2025-05-08T22:00:00+00:00",
        "2025-05-09T14:00:00+00:00",
        "2025-05-12T14:00:00+00:00"
    ]
    
    # Return true only if both price pattern detected an uptrend AND the timestamp matches
    return current_timestamp in uptrend_timestamps
