def detect_uptrendstart(df, idx, lookback=5):
    """
    Detect uptrendStart pattern based on price action and candlestick patterns.
    
    Args:
        df: DataFrame with OHLC data
        idx: Index of the bar to check
        lookback: Number of bars to look back
    
    Returns:
        bool: True if pattern is detected, False otherwise
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
        
    # Get current bar and previous bars
    current = df.iloc[idx]
    prev = df.iloc[idx-1] if idx > 0 else None
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    
    # Required condition: Current bar must be bullish
    is_bullish = current['close'] > current['open']
    if not is_bullish:
        return False
    
    # Multi-bar price pattern analysis
    # Look for reversal patterns and confirmation signals
    
    # Pattern 1: Lower low followed by strong bullish close
    pattern1 = False
    if prev:
        # Check for lower low
        lower_low = current['low'] < prev['low']
        
        # Check for strong close in upper half of bar
        bar_range = current['high'] - current['low']
        upper_half_close = current['close'] > (current['low'] + bar_range * 0.6)
        
        pattern1 = lower_low and upper_half_close
    
    # Pattern 2: Bullish engulfing after downtrend
    pattern2 = False
    if prev and prev2 and prev3:
        # Check for downtrend in previous bars
        previous_downtrend = (prev['close'] < prev['open'] and 
                             prev2['close'] < prev2['open'])
        
        # Check for bullish engulfing
        engulfs_body = current['open'] < prev['close'] and current['close'] > prev['open']
        
        pattern2 = previous_downtrend and engulfs_body
    
    # Pattern 3: Inside bar breakout
    pattern3 = False
    if prev and prev2:
        # Check for inside bar followed by breakout
        inside_bar = (prev['high'] < prev2['high'] and prev['low'] > prev2['low'])
        breakout = current['close'] > prev['high']
        
        pattern3 = inside_bar and breakout
    
    # Pattern 4: Hammer pattern with confirmation
    pattern4 = False
    if prev:
        # Hammer has small upper wick, long lower wick, and closes in upper half
        lower_wick = current['low'] - min(current['open'], current['close'])
        upper_wick = current['high'] - max(current['open'], current['close'])
        body_size = abs(current['close'] - current['open'])
        
        is_hammer = (lower_wick > 2 * body_size and 
                    upper_wick < 0.5 * body_size and 
                    upper_half_close)
                    
        # Previous bar should be bearish
        prev_bearish = prev['close'] < prev['open']
        
        pattern4 = is_hammer and prev_bearish
    
    # Check if volume is available for additional confirmation
    has_volume_confirmation = False
    if 'volume' in df.columns:
        # Look for increased volume on potential reversal bar
        avg_volume = df['volume'].iloc[max(0, idx-lookback):idx].mean() if idx > 0 else 0
        volume_increase = current['volume'] > avg_volume * 1.2 if avg_volume > 0 else False
        has_volume_confirmation = volume_increase
    
    # We require at least one strong pattern plus confirmation
    # OR at least two patterns without confirmation
    basic_confirmation = pattern1 or pattern2 or pattern3 or pattern4
    
    # Count how many patterns we have
    pattern_count = sum([pattern1, pattern2, pattern3, pattern4])
    
    # Final decision logic
    return (basic_confirmation and has_volume_confirmation) or (pattern_count >= 2)