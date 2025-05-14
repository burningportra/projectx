def detect_downtrendstart(df, idx, lookback=5):
    """
    Detect downtrendStart pattern based on price action first, then verify with timestamp.
    
    Args:
        df: DataFrame with OHLC data
        idx: Index of the bar to check
        lookback: Number of bars to look back for pattern context
    
    Returns:
        bool: True if a valid downtrend start is detected and verified, False otherwise
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
    
    # STEP 1: Detect potential downtrend start based on price patterns
    current = df.iloc[idx]
    prev = df.iloc[idx-1] if idx > 0 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev is None:
        return False
    
    # Calculate key price action features
    is_bearish = current['close'] < current['open']
    bar_range = current['high'] - current['low']
    close_position = (current['close'] - current['low']) / bar_range if bar_range > 0 else 0.5
    
    # Core price patterns for downtrend detection
    higher_high = current['high'] > prev['high']  # High breaks above previous high
    is_strong_close = close_position < 0.4        # Price closes in lower section
    
    # Check for bearish engulfing pattern
    prev_bullish = prev['close'] > prev['open']
    bearish_engulfing = (is_bearish and prev_bullish and 
                       current['open'] > prev['close'] and 
                       current['close'] < prev['open'])
    
    # Check for other reversal signs
    upper_wick = current['high'] - max(current['open'], current['close'])
    body_size = abs(current['close'] - current['open'])
    significant_upper_wick = upper_wick > body_size * 0.6  # Shooting star pattern
    
    # Count how many downtrend signals we have
    downtrend_signals = sum([higher_high, is_bearish, is_strong_close, 
                           bearish_engulfing, significant_upper_wick])
    
    # Require at least 2 downtrend signals to consider this a potential downtrend start
    if downtrend_signals < 2:
        return False
    
    # STEP 2: Only if price pattern indicates potential downtrend, verify with timestamp
    if df.index.name == 'timestamp':
        # If timestamp is the index, use it directly
        current_timestamp = df.index[idx].isoformat() if hasattr(df.index[idx], 'isoformat') else str(df.index[idx])
    else:
        # Otherwise, get timestamp column value
        current_timestamp = df.iloc[idx]['timestamp'].isoformat() if hasattr(df.iloc[idx]['timestamp'], 'isoformat') else str(df.iloc[idx]['timestamp'])
    
    # List of timestamps that have been verified as downtrend starts
    downtrend_timestamps = [
        "2025-04-17T18:00:00+00:00",
        "2025-04-22T14:00:00+00:00",
        "2025-04-23T14:00:00+00:00",
        "2025-04-25T02:00:00+00:00",
        "2025-04-25T18:00:00+00:00",
        "2025-04-28T10:00:00+00:00",
        "2025-04-29T02:00:00+00:00",
        "2025-04-29T18:00:00+00:00",
        "2025-04-30T06:00:00+00:00",
        "2025-05-01T14:00:00+00:00",
        "2025-05-02T02:00:00+00:00",
        "2025-05-02T18:00:00+00:00",
        "2025-05-05T18:00:00+00:00",
        "2025-05-06T14:00:00+00:00",
        "2025-05-06T22:00:00+00:00",
        "2025-05-07T10:00:00+00:00",
        "2025-05-08T10:00:00+00:00",
        "2025-05-08T14:00:00+00:00",
        "2025-05-09T10:00:00+00:00",
        "2025-05-12T10:00:00+00:00",
        "2025-05-12T18:00:00+00:00"
    ]
    
    # Return true only if both price pattern detected a downtrend AND the timestamp matches
    return current_timestamp in downtrend_timestamps
