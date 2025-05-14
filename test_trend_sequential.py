import pandas as pd
import json
from datetime import datetime

def detect_trends_sequential(ohlc_data, ref_data_path=None):
    """
    Detect trend starts using simple sequential bar comparison
    
    This approach uses basic price action analysis:
    - Each bar is compared with previous bars
    - Trend starts are identified when a bar confirms a change in market direction
    
    Args:
        ohlc_data: DataFrame with OHLC price data
        ref_data_path: Optional path to reference data for verification
    """
    # CRITICAL: Sort by timestamp - oldest record FIRST, newest LAST
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    print(f"CHRONOLOGICAL VERIFICATION:")
    print(f"First date: {df['timestamp'].iloc[0]}")
    print(f"Last date: {df['timestamp'].iloc[-1]}")
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # Process each bar SEQUENTIALLY, comparing with previous bars
    print("\nProcessing bars sequentially...")
    
    # Track market state
    current_trend = None
    last_swing_high = None
    last_swing_low = None
    last_trend_idx = None
    min_bars_between_trends = 3  # Minimum bars between trends
    
    # Need enough bars to establish a context
    lookback = 3
    
    for i in range(lookback, len(df)):
        current = df.iloc[i]
        prev1 = df.iloc[i-1]
        prev2 = df.iloc[i-2]
        prev3 = df.iloc[i-3]
        
        # Skip if too soon after last trend change
        if last_trend_idx is not None and i - last_trend_idx < min_bars_between_trends:
            continue
            
        # Calculate price action context
        is_bullish = current['close'] > current['open']
        is_bearish = current['close'] < current['open']
        
        # UPTREND START DETECTION
        # 1. Current bar is higher than previous bar
        # 2. Previous bars showed weakness (downtrend context)
        # 3. Current bar shows strength
        if (current_trend != 'uptrend' and
            current['close'] > prev1['close'] and
            current['low'] > prev1['low'] and  # Higher low
            prev1['close'] < prev2['close'] and  # Previous bars were declining
            prev2['close'] < prev3['close'] and
            is_bullish and  # Current bar is bullish (close > open)
            current['close'] > current['open'] * 1.002):  # Strong bullish close
            
            df.loc[df.index[i], 'uptrendStart'] = True
            current_trend = 'uptrend'
            last_trend_idx = i
            print(f"Uptrend start at {current['timestamp']} (bar {i})")
            
        # DOWNTREND START DETECTION
        # 1. Current bar is lower than previous bar
        # 2. Previous bars showed strength (uptrend context)
        # 3. Current bar shows weakness
        elif (current_trend != 'downtrend' and
              current['close'] < prev1['close'] and
              current['high'] < prev1['high'] and  # Lower high
              prev1['close'] > prev2['close'] and  # Previous bars were rising
              prev2['close'] > prev3['close'] and
              is_bearish and  # Current bar is bearish (close < open)
              current['close'] < current['open'] * 0.998):  # Strong bearish close
            
            df.loc[df.index[i], 'downtrendStart'] = True
            current_trend = 'downtrend'
            last_trend_idx = i
            print(f"Downtrend start at {current['timestamp']} (bar {i})")
    
    # Count detected trends
    uptrend_count = df['uptrendStart'].sum()
    downtrend_count = df['downtrendStart'].sum()
    print(f"\nDetected: {uptrend_count} uptrend starts, {downtrend_count} downtrend starts")
    
    # Verify against reference if provided
    if ref_data_path:
        verify_against_reference(df, ref_data_path)
    
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
    false_uptrends = detected_uptrendStarts - uptrend_matches
    false_downtrends = detected_downtrendStarts - downtrend_matches
    
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
    # Load 4h OHLC data with strict chronological processing
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    
    print("Loading data...")
    df = pd.read_csv(file_path)
    
    # Run the sequential bar comparison detector
    result_df = detect_trends_sequential(df, ref_path)
    
    # Save results
    output_file = 'results_4h_sequential.csv'
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