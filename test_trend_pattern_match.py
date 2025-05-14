import pandas as pd
import json
import numpy as np

def reverse_engineer_trend_logic(ohlc_data, ref_data_path):
    """
    Analyzes reference data to identify the exact price patterns that trigger trend starts
    """
    # Load data and reference points
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    # Load reference data
    with open(ref_data_path, 'r') as f:
        ref_data = json.load(f)
    
    # Extract timestamps and convert to pandas datetime
    ref_uptrends = [(pd.to_datetime(item['timestamp']), item['price']) 
                   for item in ref_data if item['type'] == 'uptrendStart']
    ref_downtrends = [(pd.to_datetime(item['timestamp']), item['price']) 
                     for item in ref_data if item['type'] == 'downtrendStart']
    
    # Create timestamp lookup for fast indexing
    ts_to_idx = {row['timestamp']: i for i, row in df.iterrows()}
    
    # Analyze what makes a trend start point special
    print("\nANALYZING UPTREND START PATTERNS:")
    uptrend_patterns = []
    for ts, price in ref_uptrends:
        if ts in ts_to_idx:
            idx = ts_to_idx[ts]
            if idx >= 5:  # Need enough history
                # Analyze the bar and surrounding context
                current = df.iloc[idx]
                prev1 = df.iloc[idx-1]
                prev2 = df.iloc[idx-2]
                next1 = df.iloc[idx+1] if idx+1 < len(df) else None
                
                # Calculate price action metrics
                lookback = min(10, idx)
                recent_bars = df.iloc[idx-lookback:idx]
                local_high = recent_bars['high'].max()
                local_low = recent_bars['low'].min()
                
                # Record key characteristics
                pattern = {
                    'timestamp': ts,
                    'price': price,
                    'bar_type': 'bullish' if current['close'] > current['open'] else 'bearish',
                    'close_vs_prev_close': current['close'] / prev1['close'],
                    'low_vs_local_low': current['low'] / local_low,
                    'close_vs_prev_high': current['close'] / prev1['high'] if prev1['high'] > 0 else 0,
                    'next_bar_direction': 'up' if next1 is not None and next1['close'] > current['close'] else 'down' if next1 is not None else None,
                    'volume_vs_avg': current['volume'] / recent_bars['volume'].mean() if 'volume' in df.columns else 0
                }
                uptrend_patterns.append(pattern)
                print(f"  {ts}: {pattern['bar_type']}, Close/PrevClose: {pattern['close_vs_prev_close']:.3f}, Low/LocalLow: {pattern['low_vs_local_low']:.3f}")
    
    print("\nANALYZING DOWNTREND START PATTERNS:")
    downtrend_patterns = []
    for ts, price in ref_downtrends:
        if ts in ts_to_idx:
            idx = ts_to_idx[ts]
            if idx >= 5:  # Need enough history
                # Analyze the bar and surrounding context
                current = df.iloc[idx]
                prev1 = df.iloc[idx-1]
                prev2 = df.iloc[idx-2]
                next1 = df.iloc[idx+1] if idx+1 < len(df) else None
                
                # Calculate price action metrics
                lookback = min(10, idx)
                recent_bars = df.iloc[idx-lookback:idx]
                local_high = recent_bars['high'].max()
                local_low = recent_bars['low'].min()
                
                # Record key characteristics
                pattern = {
                    'timestamp': ts,
                    'price': price,
                    'bar_type': 'bullish' if current['close'] > current['open'] else 'bearish',
                    'close_vs_prev_close': current['close'] / prev1['close'],
                    'high_vs_local_high': current['high'] / local_high,
                    'close_vs_prev_low': current['close'] / prev1['low'] if prev1['low'] > 0 else 0,
                    'next_bar_direction': 'up' if next1 is not None and next1['close'] > current['close'] else 'down' if next1 is not None else None,
                    'volume_vs_avg': current['volume'] / recent_bars['volume'].mean() if 'volume' in df.columns else 0
                }
                downtrend_patterns.append(pattern)
                print(f"  {ts}: {pattern['bar_type']}, Close/PrevClose: {pattern['close_vs_prev_close']:.3f}, High/LocalHigh: {pattern['high_vs_local_high']:.3f}")
    
    # Extract pattern insights
    extract_pattern_insights(uptrend_patterns, downtrend_patterns)
    
    return uptrend_patterns, downtrend_patterns

def extract_pattern_insights(uptrend_patterns, downtrend_patterns):
    """Extract key insights from the analyzed patterns"""
    # Analyze uptrend patterns
    bullish_count = sum(1 for p in uptrend_patterns if p['bar_type'] == 'bullish')
    bullish_pct = bullish_count / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    
    close_above_prev = sum(1 for p in uptrend_patterns if p['close_vs_prev_close'] > 1)
    close_above_prev_pct = close_above_prev / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    
    # Analyze downtrend patterns
    bearish_count = sum(1 for p in downtrend_patterns if p['bar_type'] == 'bearish')
    bearish_pct = bearish_count / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    
    close_below_prev = sum(1 for p in downtrend_patterns if p['close_vs_prev_close'] < 1)
    close_below_prev_pct = close_below_prev / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    
    # Print insights
    print("\nPATTERN INSIGHTS:")
    print(f"Uptrend starts: {bullish_pct:.1f}% are bullish bars, {close_above_prev_pct:.1f}% close above previous close")
    print(f"Downtrend starts: {bearish_pct:.1f}% are bearish bars, {close_below_prev_pct:.1f}% close below previous close")

def detect_trends_by_patterns(ohlc_data):
    """
    Detect trend starts using pure price action analysis
    """
    # Sort chronologically - CRITICAL
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    print(f"CHRONOLOGICAL VERIFICATION:")
    print(f"First date: {df['timestamp'].iloc[0]}")
    print(f"Last date: {df['timestamp'].iloc[-1]}")
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # Process each bar in CHRONOLOGICAL order
    print("\nProcessing bars from earliest to latest...")
    
    # Keep track of trend state
    current_trend = None
    min_bars_between_trends = 3
    last_trend_idx = -min_bars_between_trends
    
    for i in range(5, len(df)):  # Start after the first few bars to have enough history
        if i - last_trend_idx < min_bars_between_trends:
            continue  # Skip if too soon after last trend
            
        current = df.iloc[i]
        prev1 = df.iloc[i-1]
        prev2 = df.iloc[i-2] if i > 1 else None
        
        # Calculate important price levels
        lookback = min(10, i)
        recent_bars = df.iloc[i-lookback:i]
        local_high = recent_bars['high'].max()
        local_low = recent_bars['low'].min()
        
        # === UPTREND START DETECTION ===
        
        # Pattern criteria based on analysis
        # Must be a significant pivot/reversal point
        is_bullish = current['close'] > current['open']
        breaks_above_resistance = current['high'] > local_high * 0.998
        forms_higher_low = current['low'] > prev1['low'] and prev1['low'] > prev2['low'] if prev2 is not None else False
        momentum_breakout = current['close'] > prev1['high'] * 1.001
        
        # Combined criteria for uptrend start
        uptrend_start = (
            current_trend != 'uptrend' and  # Not already in an uptrend
            is_bullish and
            (
                # Main pattern: bullish breakout with momentum
                (breaks_above_resistance and momentum_breakout) or
                
                # Alternative pattern: reversal with strong momentum
                (current['low'] <= local_low * 1.01 and current['close'] > current['open'] * 1.005)
            )
        )
        
        # === DOWNTREND START DETECTION ===
        
        # Pattern criteria based on analysis
        is_bearish = current['close'] < current['open']
        breaks_below_support = current['low'] < local_low * 1.002
        forms_lower_high = current['high'] < prev1['high'] and prev1['high'] < prev2['high'] if prev2 is not None else False
        momentum_breakdown = current['close'] < prev1['low'] * 0.999
        
        # Combined criteria for downtrend start
        downtrend_start = (
            current_trend != 'downtrend' and  # Not already in a downtrend
            is_bearish and
            (
                # Main pattern: bearish breakdown with momentum
                (breaks_below_support and momentum_breakdown) or
                
                # Alternative pattern: reversal with strong momentum
                (current['high'] >= local_high * 0.99 and current['close'] < current['open'] * 0.995)
            )
        )
        
        # Apply the detected patterns
        if uptrend_start:
            df.loc[df.index[i], 'uptrendStart'] = True
            current_trend = 'uptrend'
            last_trend_idx = i
            print(f"Uptrend start at {current['timestamp']} (bar {i})")
            
        elif downtrend_start:
            df.loc[df.index[i], 'downtrendStart'] = True
            current_trend = 'downtrend'
            last_trend_idx = i
            print(f"Downtrend start at {current['timestamp']} (bar {i})")
    
    return df

def verify_against_reference(detected_df, ref_data_path):
    """Verify detection results against reference data"""
    # Load reference data
    with open(ref_data_path, 'r') as f:
        ref_data = json.load(f)
    
    # Convert to date strings for easier comparison (ignoring seconds)
    detected_df['date'] = detected_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Get reference dates
    ref_uptrendStarts = {item['timestamp'].split('T')[0] + ' ' + item['timestamp'].split('T')[1].split('+')[0].split(':')[0] + ':' + item['timestamp'].split('T')[1].split('+')[0].split(':')[1]
                         for item in ref_data if item['type'] == 'uptrendStart'}
    ref_downtrendStarts = {item['timestamp'].split('T')[0] + ' ' + item['timestamp'].split('T')[1].split('+')[0].split(':')[0] + ':' + item['timestamp'].split('T')[1].split('+')[0].split(':')[1]
                           for item in ref_data if item['type'] == 'downtrendStart'}
    
    # Get detected dates
    detected_uptrendStarts = set(detected_df[detected_df['uptrendStart']]['date'])
    detected_downtrendStarts = set(detected_df[detected_df['downtrendStart']]['date'])
    
    # Calculate matches
    uptrend_matches = ref_uptrendStarts.intersection(detected_uptrendStarts)
    downtrend_matches = ref_downtrendStarts.intersection(detected_downtrendStarts)
    
    # Print results
    print("\nVERIFICATION AGAINST REFERENCE DATA:")
    print(f"Reference: {len(ref_uptrendStarts)} uptrends, {len(ref_downtrendStarts)} downtrends")
    print(f"Detected: {len(detected_uptrendStarts)} uptrends, {len(detected_downtrendStarts)} downtrends")
    print(f"Matched: {len(uptrend_matches)}/{len(ref_uptrendStarts)} uptrends ({len(uptrend_matches)/len(ref_uptrendStarts)*100:.1f}% match)")
    print(f"Matched: {len(downtrend_matches)}/{len(ref_downtrendStarts)} downtrends ({len(downtrend_matches)/len(ref_downtrendStarts)*100:.1f}% match)")
    print(f"Overall match rate: {(len(uptrend_matches) + len(downtrend_matches)) / (len(ref_uptrendStarts) + len(ref_downtrendStarts)) * 100:.1f}%")
    
    # Find missing dates
    missing_uptrends = ref_uptrendStarts - detected_uptrendStarts
    missing_downtrends = ref_downtrendStarts - detected_downtrendStarts
    
    # Print missing dates (limited to 5 for brevity)
    if missing_uptrends:
        print(f"\nMISSING UPTREND STARTS ({len(missing_uptrends)}):")
        for date in sorted(list(missing_uptrends)[:5]):  # Show at most 5
            print(f"  {date}")
        if len(missing_uptrends) > 5:
            print(f"  ... and {len(missing_uptrends) - 5} more")
    
    if missing_downtrends:
        print(f"\nMISSING DOWNTREND STARTS ({len(missing_downtrends)}):")
        for date in sorted(list(missing_downtrends)[:5]):  # Show at most 5
            print(f"  {date}")
        if len(missing_downtrends) > 5:
            print(f"  ... and {len(missing_downtrends) - 5} more")
    
    # Find false positives
    false_uptrends = detected_uptrendStarts - ref_uptrendStarts
    false_downtrends = detected_downtrendStarts - ref_downtrendStarts
    
    if false_uptrends or false_downtrends:
        print("\nFALSE DETECTIONS:")
        for date in sorted(list(false_uptrends)[:5]):
            print(f"  {date}: Uptrend")
        if len(false_uptrends) > 5:
            print(f"  ... and {len(false_uptrends) - 5} more uptrends")
            
        for date in sorted(list(false_downtrends)[:5]):
            print(f"  {date}: Downtrend")
        if len(false_downtrends) > 5:
            print(f"  ... and {len(false_downtrends) - 5} more downtrends")
    
    return {
        'uptrend_match_rate': len(uptrend_matches)/len(ref_uptrendStarts)*100 if ref_uptrendStarts else 0,
        'downtrend_match_rate': len(downtrend_matches)/len(ref_downtrendStarts)*100 if ref_downtrendStarts else 0,
        'overall_match_rate': (len(uptrend_matches) + len(downtrend_matches)) / (len(ref_uptrendStarts) + len(ref_downtrendStarts)) * 100 if (ref_uptrendStarts or ref_downtrendStarts) else 0
    }

def main():
    # Load OHLC data
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    
    print("Loading data...")
    df = pd.read_csv(file_path)
    
    # Analyze reference patterns (for learning purposes)
    uptrend_patterns, downtrend_patterns = reverse_engineer_trend_logic(df, ref_path)
    
    # Apply pattern detection
    result_df = detect_trends_by_patterns(df)
    
    # Verify against reference
    verify_against_reference(result_df, ref_path)
    
    # Save results
    output_file = 'results_4h_pattern_first.csv'
    result_df.to_csv(output_file, index=False)
    print(f"\nResults saved to {output_file}")
    
    # Display trend starts
    print("\n=== DETECTED UPTREND STARTS ===")
    uptrends = result_df[result_df['uptrendStart']].sort_values('timestamp')
    for _, row in uptrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    print("\n=== DETECTED DOWNTREND STARTS ===")
    downtrends = result_df[result_df['downtrendStart']].sort_values('timestamp')
    for _, row in downtrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")

if __name__ == "__main__":
    main() 