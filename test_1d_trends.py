import pandas as pd

def detect_pattern(df, idx, timeframe, lookback=5):
    """
    Unified pattern detection with timeframe-specific adjustments
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False, False
    
    # Get current and previous bars
    current = df.iloc[idx]
    prev1 = df.iloc[idx-1]
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    prev4 = df.iloc[idx-4] if idx > 3 else None
    prev5 = df.iloc[idx-5] if idx > 4 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev1 is None:
        return False, False
    
    # Basic candlestick properties
    is_bullish = current['close'] > current['open']
    is_bearish = current['close'] < current['open']
    bar_range = current['high'] - current['low']
    body_size = abs(current['close'] - current['open'])
    
    # Wick properties
    lower_wick = min(current['open'], current['close']) - current['low']
    upper_wick = current['high'] - max(current['open'], current['close'])
    
    # Price movement properties
    higher_high = current['high'] > prev1['high']
    lower_low = current['low'] < prev1['low']
    price_change_pct = abs(current['close'] - prev1['close']) / prev1['close']
    
    # Set timeframe-specific thresholds
    if timeframe == "1d":
        # Daily timeframe - less sensitive to single patterns
        min_wick_ratio = 0.3
        min_price_change = 0.005  # 0.5%
        score_threshold = 1.0
    elif timeframe == "4h":
        # 4h timeframe - more stringent patterns
        min_wick_ratio = 0.5
        min_price_change = 0.003  # 0.3%
        score_threshold = 1.5
    else:  # 1h and others
        # 1h timeframe - requires strong patterns
        min_wick_ratio = 0.8
        min_price_change = 0.002  # 0.2%
        score_threshold = 2.0
    
    # CALCULATE PATTERN SCORES INSTEAD OF BOOLEAN SIGNALS
    uptrend_score = 0
    downtrend_score = 0
    
    # === UPTREND SIGNALS ===
    
    # 1. Bullish engulfing pattern
    if (is_bullish and prev1['close'] < prev1['open'] and 
        current['open'] <= prev1['close'] and current['close'] >= prev1['open']):
        uptrend_score += 2  # Strong signal
    
    # 2. Hammer pattern (significant lower wick)
    if is_bullish and lower_wick > 0:
        wick_ratio = lower_wick / body_size if body_size > 0 else 0
        if wick_ratio >= 2.0:
            uptrend_score += 2
        elif wick_ratio >= min_wick_ratio:
            uptrend_score += 1
            if timeframe == "1d" and lower_low:  # For daily, add more if it's also a lower low
                uptrend_score += 0.5
    
    # 3. Support level bounce
    if all(p is not None for p in [prev2, prev3, prev4]):
        prior_lows = [p['low'] for p in [prev2, prev3, prev4, prev5] if p is not None]
        min_prior_low = min(prior_lows)
        if abs(current['low'] - min_prior_low) < bar_range * 0.3:
            if is_bullish:
                uptrend_score += 1.5
            elif timeframe == "1d" and lower_wick > 0:  # For daily charts, support bounce is important
                uptrend_score += 1.0
    
    # 4. Morning star pattern
    if prev2 is not None:
        prev2_bearish = prev2['close'] < prev2['open']
        prev1_small_body = abs(prev1['close'] - prev1['open']) < bar_range * 0.3
        if prev2_bearish and prev1_small_body and is_bullish:
            uptrend_score += 2
        elif timeframe == "1d" and prev2_bearish and is_bullish:  # Relaxed for daily
            uptrend_score += 1
    
    # 5. Reversal up after downtrend
    if prev3 is not None:
        # Previous bars showing downtrend
        if all(df.iloc[idx-i]['close'] <= df.iloc[idx-i-1]['close'] for i in range(1, 3) if idx-i-1 >= 0):
            if current['close'] > prev1['close'] and is_bullish:
                uptrend_score += 1.5
            elif timeframe == "1d" and current['close'] > prev1['close']:  # Relaxed for daily
                uptrend_score += 1
    
    # 6. Significant price change
    if is_bullish and price_change_pct > min_price_change:
        uptrend_score += 1
        if timeframe == "1d" and price_change_pct > 0.01:  # 1% move on daily is significant
            uptrend_score += 1
    
    # === DOWNTREND SIGNALS ===
    
    # 1. Bearish engulfing pattern
    if (is_bearish and prev1['close'] > prev1['open'] and 
        current['open'] >= prev1['close'] and current['close'] <= prev1['open']):
        downtrend_score += 2  # Strong signal
    
    # 2. Shooting star pattern (significant upper wick)
    if is_bearish and upper_wick > 0:
        wick_ratio = upper_wick / body_size if body_size > 0 else 0
        if wick_ratio >= 2.0:
            downtrend_score += 2
        elif wick_ratio >= min_wick_ratio:
            downtrend_score += 1
            if timeframe == "1d" and higher_high:  # For daily, add more if it's also a higher high
                downtrend_score += 0.5
    
    # 3. Resistance level rejection
    if all(p is not None for p in [prev2, prev3, prev4]):
        prior_highs = [p['high'] for p in [prev2, prev3, prev4, prev5] if p is not None]
        max_prior_high = max(prior_highs)
        if abs(current['high'] - max_prior_high) < bar_range * 0.3:
            if is_bearish:
                downtrend_score += 1.5
            elif timeframe == "1d" and upper_wick > 0:  # For daily charts, resistance is important
                downtrend_score += 1.0
    
    # 4. Evening star pattern
    if prev2 is not None:
        prev2_bullish = prev2['close'] > prev2['open']
        prev1_small_body = abs(prev1['close'] - prev1['open']) < bar_range * 0.3
        if prev2_bullish and prev1_small_body and is_bearish:
            downtrend_score += 2
        elif timeframe == "1d" and prev2_bullish and is_bearish:  # Relaxed for daily
            downtrend_score += 1
    
    # 5. Reversal down after uptrend
    if prev3 is not None:
        # Previous bars showing uptrend
        if all(df.iloc[idx-i]['close'] >= df.iloc[idx-i-1]['close'] for i in range(1, 3) if idx-i-1 >= 0):
            if current['close'] < prev1['close'] and is_bearish:
                downtrend_score += 1.5
            elif timeframe == "1d" and current['close'] < prev1['close']:  # Relaxed for daily
                downtrend_score += 1
    
    # 6. Significant price change
    if is_bearish and price_change_pct > min_price_change:
        downtrend_score += 1
        if timeframe == "1d" and price_change_pct > 0.01:  # 1% move on daily is significant
            downtrend_score += 1
    
    # Check against threshold for this timeframe
    return uptrend_score >= score_threshold, downtrend_score >= score_threshold

def analyze_with_pattern_detector(df, timeframe):
    """Core algorithm for pure pattern-based trend detection"""
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # No reference data - use pure pattern detection
    last_trend = None
    
    # Process data in chronological order
    for i in range(len(df)):
        # Detect patterns
        can_be_uptrend, can_be_downtrend = detect_pattern(df, i, timeframe)
        
        # Apply alternating pattern rule
        if last_trend != 'uptrend' and can_be_uptrend:
            df.loc[df.index[i], 'uptrendStart'] = True
            last_trend = 'uptrend'
        elif last_trend != 'downtrend' and can_be_downtrend:
            df.loc[df.index[i], 'downtrendStart'] = True
            last_trend = 'downtrend'
    
    return df

def main():
    # Load the OHLC data
    df = pd.read_csv('data/CON.F.US.MES.M25_1d_ohlc.csv')
    
    # Ensure timestamp is in datetime format
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Apply the pattern detector
    result_df = analyze_with_pattern_detector(df, timeframe="1d")
    
    # Display trend starts
    print("\n--- UPTREND STARTS ---")
    for idx, row in result_df[result_df['uptrendStart']].iterrows():
        print(f"{row['timestamp'].strftime('%Y-%m-%d')}: {row['close']}")
    
    print("\n--- DOWNTREND STARTS ---")
    for idx, row in result_df[result_df['downtrendStart']].iterrows():
        print(f"{row['timestamp'].strftime('%Y-%m-%d')}: {row['close']}")
    
    # Print summary
    uptrend_count = result_df['uptrendStart'].sum()
    downtrend_count = result_df['downtrendStart'].sum()
    print(f"\nDetected {uptrend_count} uptrends and {downtrend_count} downtrends in {len(df)} candles")

if __name__ == "__main__":
    main() 