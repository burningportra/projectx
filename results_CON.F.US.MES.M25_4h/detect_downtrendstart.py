def detect_downtrendstart(df, idx, lookback=5):
    """
    Detect downtrendStart pattern based on price action and candlestick patterns.
    
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
    
    # Required condition: Current bar must be bearish
    is_bearish = current['close'] < current['open']
    if not is_bearish:
        return False
    
    # Multi-bar price pattern analysis
    # Look for reversal patterns and confirmation signals
    
    # Pattern 1: Higher high followed by strong bearish close
    pattern1 = False
    if prev:
        # Check for higher high
        higher_high = current['high'] > prev['high']
        
        # Check for strong close in lower half of bar
        bar_range = current['high'] - current['low']
        lower_half_close = current['close'] < (current['low'] + bar_range * 0.4)
        
        pattern1 = higher_high and lower_half_close
    
    # Pattern 2: Bearish engulfing after uptrend
    pattern2 = False
    if prev and prev2 and prev3:
        # Check for uptrend in previous bars
        previous_uptrend = (prev['close'] > prev['open'] and 
                           prev2['close'] > prev2['open'])
        
        # Check for bearish engulfing
        engulfs_body = current['open'] > prev['close'] and current['close'] < prev['open']
        
        pattern2 = previous_uptrend and engulfs_body
    
    # Pattern 3: Inside bar breakdown
    pattern3 = False
    if prev and prev2:
        # Check for inside bar followed by breakdown
        inside_bar = (prev['high'] < prev2['high'] and prev['low'] > prev2['low'])
        breakdown = current['close'] < prev['low']
        
        pattern3 = inside_bar and breakdown
    
    # Pattern 4: Shooting star pattern with confirmation
    pattern4 = False
    if prev:
        # Shooting star has small lower wick, long upper wick, and closes in lower half
        upper_wick = current['high'] - max(current['open'], current['close'])
        lower_wick = min(current['open'], current['close']) - current['low']
        body_size = abs(current['close'] - current['open'])
        
        is_shooting_star = (upper_wick > 2 * body_size and 
                           lower_wick < 0.5 * body_size and 
                           lower_half_close)
                           
        # Previous bar should be bullish
        prev_bullish = prev['close'] > prev['open']
        
        pattern4 = is_shooting_star and prev_bullish
    
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