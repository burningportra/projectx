import pandas as pd
import json
from datetime import datetime

def discover_trend_patterns(ohlc_data, ref_data_path=None):
    """
    Discover trend start patterns using pure technical analysis,
    with optional verification against reference data
    """
    # Sort chronologically
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    print(f"Chronological verification - First date: {df['timestamp'].iloc[0]}")
    print(f"Chronological verification - Last date: {df['timestamp'].iloc[-1]}")
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # Process each bar chronologically
    last_trend = None
    confirmed_trends = []  # Store confirmed trend changes
    
    for i in range(5, len(df)):
        current = df.iloc[i]
        prev1 = df.iloc[i-1]
        prev2 = df.iloc[i-2]
        prev3 = df.iloc[i-3]
        
        # Calculate important price levels
        lookback = min(15, i)  # Up to 15 bars but don't exceed available data
        local_bars = df.iloc[i-lookback:i]
        local_high = local_bars['high'].max()
        local_low = local_bars['low'].min()
        
        # === PATTERN DETECTION RULES ===
        
        # 1. UPTREND START PATTERNS
        
        # Check for reversal after downtrend
        downtrend_context = all(df.iloc[i-j]['close'] <= df.iloc[i-j-1]['close'] for j in range(1, 4) if i-j-1 >= 0)
        
        # Bullish engulfing candle
        bullish_engulfing = (
            current['close'] > current['open'] and  # Current is bullish
            prev1['close'] < prev1['open'] and      # Previous is bearish
            current['open'] <= prev1['close'] and   # Open below prev close
            current['close'] > prev1['open']        # Close above prev open
        )
        
        # Hammer pattern (bottom reversal)
        hammer_pattern = (
            current['close'] > current['open'] and  # Bullish candle
            (current['low'] < min(current['open'], prev1['low'])) and  # New low
            (current['close'] - current['low']) > 2 * (current['high'] - current['close'])  # Long lower wick
        )
        
        # Volume confirmation
        volume_confirmation = 'volume' in df.columns and current['volume'] > local_bars['volume'].mean() * 1.2
        
        # Mark potential uptrend start
        is_uptrend_start = (
            # Not already in uptrend
            last_trend != 'uptrend' and
            # Pattern conditions
            ((bullish_engulfing and downtrend_context) or
             (hammer_pattern and downtrend_context) or
             (current['close'] > local_high * 0.99 and current['close'] > current['open']))
        )
        
        # 2. DOWNTREND START PATTERNS
        
        # Check for reversal after uptrend
        uptrend_context = all(df.iloc[i-j]['close'] >= df.iloc[i-j-1]['close'] for j in range(1, 4) if i-j-1 >= 0)
        
        # Bearish engulfing candle
        bearish_engulfing = (
            current['close'] < current['open'] and  # Current is bearish
            prev1['close'] > prev1['open'] and      # Previous is bullish
            current['open'] >= prev1['close'] and   # Open above prev close
            current['close'] < prev1['open']        # Close below prev open
        )
        
        # Shooting star pattern (top reversal)
        shooting_star = (
            current['close'] < current['open'] and  # Bearish candle
            (current['high'] > max(current['open'], prev1['high'])) and  # New high
            (current['high'] - current['close']) > 2 * (current['close'] - current['low'])  # Long upper wick
        )
        
        # Mark potential downtrend start
        is_downtrend_start = (
            # Not already in downtrend
            last_trend != 'downtrend' and
            # Pattern conditions
            ((bearish_engulfing and uptrend_context) or
             (shooting_star and uptrend_context) or
             (current['close'] < local_low * 1.01 and current['close'] < current['open']))
        )
        
        # 3. LOOKBACK CORRECTION - Find the actual pivot point
        
        if is_uptrend_start:
            # For uptrend, search backward to find the actual low point
            lookback_for_pivot = min(5, i)
            lowest_point_idx = i
            lowest_value = current['low']
            
            for j in range(i-1, i-lookback_for_pivot-1, -1):
                if df.iloc[j]['low'] < lowest_value:
                    lowest_value = df.iloc[j]['low']
                    lowest_point_idx = j
            
            # Mark the actual trend start at the pivot point
            df.loc[df.index[lowest_point_idx], 'uptrendStart'] = True
            
            # Update tracking
            last_trend = 'uptrend'
            confirmed_trends.append(('uptrend', df.iloc[lowest_point_idx]['timestamp']))
        
        elif is_downtrend_start:
            # For downtrend, search backward to find the actual high point
            lookback_for_pivot = min(5, i)
            highest_point_idx = i
            highest_value = current['high']
            
            for j in range(i-1, i-lookback_for_pivot-1, -1):
                if df.iloc[j]['high'] > highest_value:
                    highest_value = df.iloc[j]['high']
                    highest_point_idx = j
            
            # Mark the actual trend start at the pivot point
            df.loc[df.index[highest_point_idx], 'downtrendStart'] = True
            
            # Update tracking
            last_trend = 'downtrend'
            confirmed_trends.append(('downtrend', df.iloc[highest_point_idx]['timestamp']))
    
    # Print sequence of detected trends
    print("\nDETECTED TREND SEQUENCE:")
    for trend_type, timestamp in confirmed_trends:
        print(f"{timestamp}: {trend_type}")
    
    return df

def verify_against_reference(detected_df, ref_data_path):
    """Compare detection results with reference data"""
    # Load reference data
    with open(ref_data_path, 'r') as f:
        ref_data = json.load(f)
    
    # Extract reference timestamps
    ref_uptrends = [pd.to_datetime(item['timestamp']) for item in ref_data 
                   if item['type'] == 'uptrendStart']
    ref_downtrends = [pd.to_datetime(item['timestamp']) for item in ref_data 
                     if item['type'] == 'downtrendStart']
    
    # Get detected trend timestamps
    detected_uptrends = detected_df[detected_df['uptrendStart']]['timestamp'].tolist()
    detected_downtrends = detected_df[detected_df['downtrendStart']]['timestamp'].tolist()
    
    # Calculate matches
    uptrend_matches = set(detected_uptrends).intersection(set(ref_uptrends))
    downtrend_matches = set(detected_downtrends).intersection(set(ref_downtrends))
    
    # Calculate match percentages
    up_match_pct = len(uptrend_matches) / len(ref_uptrends) * 100 if ref_uptrends else 0
    down_match_pct = len(downtrend_matches) / len(ref_downtrends) * 100 if ref_downtrends else 0
    overall_match_pct = (len(uptrend_matches) + len(downtrend_matches)) / (len(ref_uptrends) + len(ref_downtrends)) * 100 if (ref_uptrends or ref_downtrends) else 0
    
    # Print matching statistics
    print("\nVERIFICATION RESULTS:")
    print(f"Reference data: {len(ref_uptrends)} uptrends, {len(ref_downtrends)} downtrends")
    print(f"Detected: {len(detected_uptrends)} uptrends, {len(detected_downtrends)} downtrends")
    print(f"Matched: {len(uptrend_matches)}/{len(ref_uptrends)} uptrends ({up_match_pct:.1f}%)")
    print(f"Matched: {len(downtrend_matches)}/{len(ref_downtrends)} downtrends ({down_match_pct:.1f}%)")
    print(f"Overall match: {overall_match_pct:.1f}%")
    
    # Find missing trends
    missing_uptrends = set(ref_uptrends) - set(detected_uptrends)
    missing_downtrends = set(ref_downtrends) - set(detected_downtrends)
    
    # Print missing trends
    if missing_uptrends:
        print("\nMISSING UPTRENDS:")
        for ts in sorted(missing_uptrends):
            print(f"  {ts}")
    
    if missing_downtrends:
        print("\nMISSING DOWNTRENDS:")
        for ts in sorted(missing_downtrends):
            print(f"  {ts}")
    
    # Find extra detected trends
    extra_uptrends = set(detected_uptrends) - set(ref_uptrends)
    extra_downtrends = set(detected_downtrends) - set(ref_downtrends)
    
    if extra_uptrends or extra_downtrends:
        print("\nEXTRA DETECTED TRENDS:")
        for ts in sorted(extra_uptrends):
            print(f"  {ts}: UPTREND")
        for ts in sorted(extra_downtrends):
            print(f"  {ts}: DOWNTREND")
    
    return {
        'uptrend_matches': uptrend_matches,
        'downtrend_matches': downtrend_matches,
        'missing_uptrends': missing_uptrends,
        'missing_downtrends': missing_downtrends,
        'extra_uptrends': extra_uptrends,
        'extra_downtrends': extra_downtrends,
        'match_percentages': {
            'uptrend': up_match_pct,
            'downtrend': down_match_pct,
            'overall': overall_match_pct
        }
    }

def main():
    # Load 4h OHLC data
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    df = pd.read_csv(file_path)
    
    # Discover trend patterns
    result_df = discover_trend_patterns(df)
    
    # Verify against reference data
    verification = verify_against_reference(result_df, ref_path)
    
    # Display trend starts
    print("\n--- UPTREND STARTS ---")
    uptrends = result_df[result_df['uptrendStart'] == True]
    for idx, row in uptrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    print("\n--- DOWNTREND STARTS ---")
    downtrends = result_df[result_df['downtrendStart'] == True]
    for idx, row in downtrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    # Save results
    result_df.to_csv('results_4h_discovery.csv', index=False)
    print(f"\nResults saved to results_4h_discovery.csv")

if __name__ == "__main__":
    main() 