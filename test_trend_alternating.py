import pandas as pd
import json
from datetime import datetime

def detect_trends_alternating(ohlc_data, ref_data_path=None):
    """
    Detect trend starts using rules extracted from reference data
    
    Key rules:
    1. Almost perfect alternating pattern (95.1%)
    2. Uptrend starts occur after downward movement (71.4%)
    3. Downtrend starts occur after upward movement (81.0%)
    4. Uptrend starts often form a local low (61.9%)
    5. Downtrend starts almost always form a local high (81.0%)
    
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
    
    # Process each bar chronologically and implement alternating pattern rule
    print("\nProcessing bars with alternating pattern rule...")
    
    # Track market state
    current_trend = None
    lookback = 5  # Bars to analyze for local high/low
    
    # First pass: detect potential trend start points
    potential_trend_starts = []
    
    for i in range(lookback, len(df)):
        current = df.iloc[i]
        prev1 = df.iloc[i-1]
        prev2 = df.iloc[i-2]
        
        # Calculate local high/low
        local_bars = df.iloc[i-lookback:i]
        local_high = local_bars['high'].max()
        local_low = local_bars['low'].min()
        
        # Calculate movement direction
        prev_trend = "up" if prev1['close'] > prev2['close'] else "down"
        
        # POTENTIAL UPTREND START
        # - Forms near local low (<=1% above local low)
        # - Previous bar was moving down
        if (current['low'] <= local_low * 1.01 and 
            prev_trend == "down"):
            potential_trend_starts.append((i, 'uptrend', current['timestamp']))
        
        # POTENTIAL DOWNTREND START
        # - Forms near local high (>=0.5% below local high)
        # - Previous bar was moving up
        elif (current['high'] >= local_high * 0.995 and 
              prev_trend == "up"):
            potential_trend_starts.append((i, 'downtrend', current['timestamp']))
    
    # Second pass: Apply alternating pattern rule
    print("\nApplying alternating pattern rule...")
    
    confirmed_trends = []
    last_trend_type = None
    
    for idx, trend_type, timestamp in potential_trend_starts:
        # First trend can be any type
        if last_trend_type is None:
            if trend_type == 'uptrend':
                df.loc[df.index[idx], 'uptrendStart'] = True
            else:
                df.loc[df.index[idx], 'downtrendStart'] = True
                
            last_trend_type = trend_type
            confirmed_trends.append((timestamp, trend_type))
            print(f"{trend_type.capitalize()} start at {timestamp} (bar {idx})")
            
        # Subsequent trends must alternate
        elif trend_type != last_trend_type:
            if trend_type == 'uptrend':
                df.loc[df.index[idx], 'uptrendStart'] = True
            else:
                df.loc[df.index[idx], 'downtrendStart'] = True
                
            last_trend_type = trend_type
            confirmed_trends.append((timestamp, trend_type))
            print(f"{trend_type.capitalize()} start at {timestamp} (bar {idx})")
    
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
    
    # Find missing dates - allow for 1-bar difference (4 hours)
    # Since trend detection might identify a pivot 1 bar before or after the reference
    close_uptrend_matches = set()
    close_downtrend_matches = set()
    
    # Convert to datetime for comparing close timestamps
    ref_up_dates = [datetime.strptime(d, '%Y-%m-%d %H:%M') for d in ref_uptrendStarts]
    ref_down_dates = [datetime.strptime(d, '%Y-%m-%d %H:%M') for d in ref_downtrendStarts]
    detected_up_dates = [datetime.strptime(d, '%Y-%m-%d %H:%M') for d in detected_uptrendStarts]
    detected_down_dates = [datetime.strptime(d, '%Y-%m-%d %H:%M') for d in detected_downtrendStarts]
    
    # Find close matches (within 1 bar = 4 hours)
    for ref_date in ref_up_dates:
        for detected_date in detected_up_dates:
            if abs((ref_date - detected_date).total_seconds()) <= 14400:  # 4 hours in seconds
                close_uptrend_matches.add(ref_date.strftime('%Y-%m-%d %H:%M'))
                break
                
    for ref_date in ref_down_dates:
        for detected_date in detected_down_dates:
            if abs((ref_date - detected_date).total_seconds()) <= 14400:  # 4 hours in seconds
                close_downtrend_matches.add(ref_date.strftime('%Y-%m-%d %H:%M'))
                break
    
    # Print close match results
    print(f"\nMATCHES WITHIN 1 BAR (4 HOURS):")
    print(f"Close matches: {len(close_uptrend_matches)}/{len(ref_uptrendStarts)} uptrends ({len(close_uptrend_matches)/len(ref_uptrendStarts)*100:.1f}% match)")
    print(f"Close matches: {len(close_downtrend_matches)}/{len(ref_downtrendStarts)} downtrends ({len(close_downtrend_matches)/len(ref_downtrendStarts)*100:.1f}% match)")
    print(f"Overall close match rate: {(len(close_uptrend_matches) + len(close_downtrend_matches)) / (len(ref_uptrendStarts) + len(ref_downtrendStarts)) * 100:.1f}%")
    
    # Find missing dates (even with 1-bar tolerance)
    missing_uptrends = set(ref_uptrendStarts) - set(close_uptrend_matches)
    missing_downtrends = set(ref_downtrendStarts) - set(close_downtrend_matches)
    
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
    
    # Calculate false positives
    false_uptrends = detected_uptrendStarts - uptrend_matches
    false_downtrends = detected_downtrendStarts - downtrend_matches
    
    # Account for close matches in false positives
    for date_str in close_uptrend_matches:
        for detected in detected_uptrendStarts:
            if abs((datetime.strptime(date_str, '%Y-%m-%d %H:%M') - datetime.strptime(detected, '%Y-%m-%d %H:%M')).total_seconds()) <= 14400:
                if detected in false_uptrends:
                    false_uptrends.remove(detected)
                    
    for date_str in close_downtrend_matches:
        for detected in detected_downtrendStarts:
            if abs((datetime.strptime(date_str, '%Y-%m-%d %H:%M') - datetime.strptime(detected, '%Y-%m-%d %H:%M')).total_seconds()) <= 14400:
                if detected in false_downtrends:
                    false_downtrends.remove(detected)
    
    # Print false positives
    if false_uptrends or false_downtrends:
        print("\nFALSE DETECTIONS (accounting for close matches):")
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
        'overall_match_rate': (len(uptrend_matches) + len(downtrend_matches)) / (len(ref_uptrendStarts) + len(ref_downtrendStarts)) * 100 if (ref_uptrendStarts or ref_downtrendStarts) else 0,
        'close_match_rate': (len(close_uptrend_matches) + len(close_downtrend_matches)) / (len(ref_uptrendStarts) + len(ref_downtrendStarts)) * 100 if (ref_uptrendStarts or ref_downtrendStarts) else 0
    }

def main():
    # Load 4h OHLC data
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    
    print("Loading data...")
    df = pd.read_csv(file_path)
    
    # Run the alternating trend detector with rules extracted from reference data
    result_df = detect_trends_alternating(df, ref_path)
    
    # Save results
    output_file = 'results_4h_alternating.csv'
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