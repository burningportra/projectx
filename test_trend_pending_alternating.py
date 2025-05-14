import pandas as pd
import json
from datetime import datetime

def detect_trends_with_pending_confirmation(ohlc_data, ref_data_path=None):
    """
    Detect trend starts using OHLC comparisons with pending confirmation
    
    Key aspects:
    1. Purely uses OHLC comparisons of current bar to past bars
    2. Maintains "pending" state until trend change is confirmed
    3. Implements alternating trend behavior
    4. Uses chronological processing starting with earliest bar
    
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
    
    # State tracking variables
    state = 'neutral'  # Can be 'neutral', 'pending_uptrend', 'uptrend', 'pending_downtrend', 'downtrend'
    pending_uptrend_idx = None
    pending_downtrend_idx = None
    last_confirmed_trend = None
    confirmed_trends = []
    
    # Process each bar STRICTLY in chronological order
    print("\nProcessing bars chronologically with pending confirmation...")
    
    # Need enough bars for context
    lookback = 3
    
    for i in range(lookback, len(df) - 1):  # End at len-1 to always have a next bar
        current = df.iloc[i]
        next_bar = df.iloc[i+1]
        prev1 = df.iloc[i-1]
        prev2 = df.iloc[i-2]
        prev3 = df.iloc[i-3] if i >= 3 else None
        
        # Calculate OHLC characteristics
        current_bullish = current['close'] > current['open']
        current_bearish = current['close'] < current['open']
        next_bar_bullish = next_bar['close'] > next_bar['open']
        next_bar_bearish = next_bar['close'] < next_bar['open']
        
        # Previous price action context
        prev_trend = "up" if prev1['close'] > prev2['close'] else "down"
        
        # Calculate significant price levels
        recent_high = max(df.iloc[max(0, i-lookback):i]['high'])
        recent_low = min(df.iloc[max(0, i-lookback):i]['low'])
        
        # STATE MACHINE LOGIC
        
        # === STATE: NEUTRAL ===
        if state == 'neutral':
            # Potential UPTREND start criteria:
            # 1. Previous bars were in downtrend
            # 2. Current bar forms near recent low
            # 3. Next bar confirms with bullish movement
            if (prev_trend == "down" and 
                current['low'] <= recent_low * 1.005 and  # Within 0.5% of recent low
                next_bar['close'] > current['close']):  # Confirmation
                
                state = 'pending_uptrend'
                pending_uptrend_idx = i
                print(f"Potential UPTREND start at {current['timestamp']} (bar {i}) - pending confirmation")
            
            # Potential DOWNTREND start criteria:
            # 1. Previous bars were in uptrend
            # 2. Current bar forms near recent high
            # 3. Next bar confirms with bearish movement
            elif (prev_trend == "up" and 
                  current['high'] >= recent_high * 0.995 and  # Within 0.5% of recent high
                  next_bar['close'] < current['close']):  # Confirmation
                
                state = 'pending_downtrend'
                pending_downtrend_idx = i
                print(f"Potential DOWNTREND start at {current['timestamp']} (bar {i}) - pending confirmation")
        
        # === STATE: PENDING UPTREND ===
        elif state == 'pending_uptrend':
            # Criteria to confirm uptrend:
            # 1. Price makes a higher high and higher low
            # 2. Next bar continues upward momentum
            
            # If we're getting stronger signs of uptrend
            if (current['low'] > df.iloc[pending_uptrend_idx]['low'] and  # Higher low
                current['close'] > df.iloc[pending_uptrend_idx]['close'] and  # Higher close
                next_bar['close'] > current['close']):  # Continued momentum
                
                # CONFIRM the uptrend start at the pending index
                df.loc[df.index[pending_uptrend_idx], 'uptrendStart'] = True
                state = 'uptrend'
                last_confirmed_trend = 'uptrend'
                confirmed_trends.append(pending_uptrend_idx)
                print(f"CONFIRMED uptrend start at {df.iloc[pending_uptrend_idx]['timestamp']} (bar {pending_uptrend_idx})")
                pending_uptrend_idx = None
                
            # Cancel pending uptrend if price makes a new low instead
            elif current['low'] < df.iloc[pending_uptrend_idx]['low']:
                print(f"Cancelled pending uptrend at bar {i}")
                state = 'neutral'
                pending_uptrend_idx = None
                
            # Maintain pending state if neither condition met
        
        # === STATE: UPTREND ===
        elif state == 'uptrend':
            # In an uptrend, check for potential downtrend start
            if (current['high'] >= recent_high * 0.995 and  # Near recent high
                current_bearish and  # Bearish bar
                next_bar['close'] < current['close']):  # Confirmation
                
                state = 'pending_downtrend'
                pending_downtrend_idx = i
                print(f"Potential DOWNTREND start at {current['timestamp']} (bar {i}) - pending confirmation")
        
        # === STATE: PENDING DOWNTREND ===
        elif state == 'pending_downtrend':
            # Criteria to confirm downtrend:
            # 1. Price makes a lower low and lower high
            # 2. Next bar continues downward momentum
            
            # If we're getting stronger signs of downtrend
            if (current['high'] < df.iloc[pending_downtrend_idx]['high'] and  # Lower high
                current['close'] < df.iloc[pending_downtrend_idx]['close'] and  # Lower close
                next_bar['close'] < current['close']):  # Continued momentum
                
                # CONFIRM the downtrend start at the pending index
                df.loc[df.index[pending_downtrend_idx], 'downtrendStart'] = True
                state = 'downtrend'
                last_confirmed_trend = 'downtrend'
                confirmed_trends.append(pending_downtrend_idx)
                print(f"CONFIRMED downtrend start at {df.iloc[pending_downtrend_idx]['timestamp']} (bar {pending_downtrend_idx})")
                pending_downtrend_idx = None
                
            # Cancel pending downtrend if price makes a new high instead
            elif current['high'] > df.iloc[pending_downtrend_idx]['high']:
                print(f"Cancelled pending downtrend at bar {i}")
                state = 'neutral'
                pending_downtrend_idx = None
                
            # Maintain pending state if neither condition met
        
        # === STATE: DOWNTREND ===
        elif state == 'downtrend':
            # In a downtrend, check for potential uptrend start
            if (current['low'] <= recent_low * 1.005 and  # Near recent low
                current_bullish and  # Bullish bar
                next_bar['close'] > current['close']):  # Confirmation
                
                state = 'pending_uptrend'
                pending_uptrend_idx = i
                print(f"Potential UPTREND start at {current['timestamp']} (bar {i}) - pending confirmation")
    
    # Count confirmed trend starts
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
    missing_uptrends = set(ref_uptrendStarts) - close_uptrend_matches
    missing_downtrends = set(ref_downtrendStarts) - close_downtrend_matches
    
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
    
    # Run detection with pending confirmation
    result_df = detect_trends_with_pending_confirmation(df, ref_path)
    
    # Save results
    output_file = 'results_4h_pending_alternating.csv'
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