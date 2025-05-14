import pandas as pd
import json
from datetime import datetime

def detect_trends_chronological(ohlc_data, ref_data_path=None):
    """
    Detect trend starts using pure technical analysis with strict chronological processing
    
    Args:
        ohlc_data: DataFrame with OHLC price data
        ref_data_path: Optional path to reference data for verification only
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
    
    # Track the current trend state
    current_trend = None
    
    # Process each bar STRICTLY in chronological order
    print("\nProcessing bars chronologically...")
    
    for i in range(5, len(df)):  # Start at bar 5 to have enough lookback
        # Only use information available at this point in time
        current_bar = df.iloc[i]
        
        # Get a window of recent bars (only what would be known at this point)
        lookback = min(10, i)  # Look back at most 10 bars
        recent_bars = df.iloc[i-lookback:i+1]  # Include current bar
        
        # Calculate key metrics
        prior_high = recent_bars['high'].iloc[:-1].max()  # Highest high before current bar
        prior_low = recent_bars['low'].iloc[:-1].min()    # Lowest low before current bar
        
        # Determine if we're at a significant turning point
        # UPTREND START - Must meet ALL of these criteria
        if (
            # Not already in an uptrend
            current_trend != 'uptrend' and
            
            # 1. Current close higher than previous bar
            current_bar['close'] > df.iloc[i-1]['close'] and
            
            # 2. Current bar is bullish (close > open)
            current_bar['close'] > current_bar['open'] and
            
            # 3. Previous bar low created a significant low point 
            # (either lowest in lookback window or within small percentage)
            (df.iloc[i-1]['low'] <= prior_low * 1.005) and
            
            # 4. Current bar shows strong momentum
            (current_bar['close'] > df.iloc[i-1]['high']) and
            
            # 5. Current high is breaking out above prior resistance
            (current_bar['high'] > prior_high * 0.998)
        ):
            # Mark the PREVIOUS bar as the trend start (pivot point)
            df.loc[df.index[i-1], 'uptrendStart'] = True
            current_trend = 'uptrend'
            print(f"Uptrend start at {df.iloc[i-1]['timestamp']} (bar {i-1})")
        
        # DOWNTREND START - Must meet ALL of these criteria
        elif (
            # Not already in a downtrend
            current_trend != 'downtrend' and
            
            # 1. Current close lower than previous bar
            current_bar['close'] < df.iloc[i-1]['close'] and
            
            # 2. Current bar is bearish (close < open)
            current_bar['close'] < current_bar['open'] and
            
            # 3. Previous bar high created a significant high point
            # (either highest in lookback window or within small percentage)
            (df.iloc[i-1]['high'] >= prior_high * 0.995) and
            
            # 4. Current bar shows strong momentum
            (current_bar['close'] < df.iloc[i-1]['low']) and
            
            # 5. Current low is breaking down below prior support
            (current_bar['low'] < prior_low * 1.002)
        ):
            # Mark the PREVIOUS bar as the trend start (pivot point)
            df.loc[df.index[i-1], 'downtrendStart'] = True
            current_trend = 'downtrend'
            print(f"Downtrend start at {df.iloc[i-1]['timestamp']} (bar {i-1})")
    
    # Count detected trends
    uptrend_count = df['uptrendStart'].sum()
    downtrend_count = df['downtrendStart'].sum()
    print(f"\nDetected: {uptrend_count} uptrends, {downtrend_count} downtrends")
    
    # Verify against reference if provided
    if ref_data_path:
        verify_against_reference(df, ref_data_path)
    
    return df

def verify_against_reference(detected_df, ref_data_path):
    """Verify detection results against reference data"""
    # Load reference data
    with open(ref_data_path, 'r') as f:
        ref_data = json.load(f)
    
    # Convert to date strings for easier comparison
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
    print(f"Matched: {len(uptrend_matches)}/{len(ref_uptrendStarts)} uptrends ({len(uptrend_matches)/len(ref_uptrendStarts)*100:.1f}% match)")
    print(f"Matched: {len(downtrend_matches)}/{len(ref_downtrendStarts)} downtrends ({len(downtrend_matches)/len(ref_downtrendStarts)*100:.1f}% match)")
    
    # Find missing dates
    missing_uptrends = ref_uptrendStarts - detected_uptrendStarts
    missing_downtrends = ref_downtrendStarts - detected_downtrendStarts
    
    # Print missing dates
    if missing_uptrends:
        print("\nMISSING UPTREND STARTS:")
        for date in sorted(missing_uptrends):
            print(f"  {date}")
    
    if missing_downtrends:
        print("\nMISSING DOWNTREND STARTS:")
        for date in sorted(missing_downtrends):
            print(f"  {date}")
    
    # Print false positives
    false_uptrends = detected_uptrendStarts - ref_uptrendStarts
    false_downtrends = detected_downtrendStarts - ref_downtrendStarts
    
    if false_uptrends or false_downtrends:
        print("\nFALSE DETECTIONS:")
        for date in sorted(false_uptrends):
            print(f"  {date}: Uptrend")
        for date in sorted(false_downtrends):
            print(f"  {date}: Downtrend")

def main():
    # Load 4h OHLC data with strict chronological processing
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    
    print("Loading data...")
    df = pd.read_csv(file_path)
    
    # Run the chronological detector
    result_df = detect_trends_chronological(df, ref_path)
    
    # Save results
    output_file = 'results_4h_pure_logic.csv'
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