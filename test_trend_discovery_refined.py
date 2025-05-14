import pandas as pd
import json
from datetime import datetime

def load_reference_data(ref_data_path):
    """Load reference data for analysis (but not for direct use in detection)"""
    with open(ref_data_path, 'r') as f:
        ref_data = json.load(f)
    
    # Convert to more usable format for analysis
    uptrends = [(pd.to_datetime(item['timestamp']), item['price']) 
               for item in ref_data if item['type'] == 'uptrendStart']
    downtrends = [(pd.to_datetime(item['timestamp']), item['price']) 
                 for item in ref_data if item['type'] == 'downtrendStart']
    
    uptrends.sort()  # Sort by timestamp
    downtrends.sort()
    
    return uptrends, downtrends

def analyze_pattern_features(ohlc_data, ref_data_path):
    """Analyze features of reference trend starts to refine detection"""
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    # Load reference data
    uptrends, downtrends = load_reference_data(ref_data_path)
    
    # Create mapping from timestamp to index
    ts_to_idx = {row['timestamp']: i for i, row in df.iterrows()}
    
    # Extract features of uptrend starts
    print("\nUPTREND START PATTERNS ANALYSIS:")
    uptrend_features = []
    
    for ts, price in uptrends:
        if ts in ts_to_idx:
            idx = ts_to_idx[ts]
            if idx > 5:  # Need enough history
                current = df.iloc[idx]
                prev1 = df.iloc[idx-1]
                prev2 = df.iloc[idx-2]
                prev3 = df.iloc[idx-3]
                
                # Calculate pattern features
                lookback = min(15, idx)
                local_bars = df.iloc[idx-lookback:idx]
                local_high = local_bars['high'].max()
                local_low = local_bars['low'].min()
                
                # Candlestick pattern
                is_bullish = current['close'] > current['open']
                is_bearish = current['close'] < current['open']
                
                # Volume increase
                vol_increase = current['volume'] / local_bars['volume'].mean()
                
                # Price levels
                high_vs_local = current['high'] / local_high
                close_vs_local_high = current['close'] / local_high
                
                # Prior downtrend
                prior_down = prev1['close'] < prev2['close'] < prev3['close']
                
                features = {
                    "timestamp": ts,
                    "is_bullish": is_bullish,
                    "vol_increase": vol_increase,
                    "high_vs_local": high_vs_local,
                    "close_vs_local_high": close_vs_local_high,
                    "prior_down": prior_down
                }
                uptrend_features.append(features)
                print(f"  {ts}: {'Bullish' if is_bullish else 'Bearish'}, Vol:{vol_increase:.1f}x, Close/LocalHigh:{close_vs_local_high:.3f}")
    
    # Extract features of downtrend starts
    print("\nDOWNTREND START PATTERNS ANALYSIS:")
    downtrend_features = []
    
    for ts, price in downtrends:
        if ts in ts_to_idx:
            idx = ts_to_idx[ts]
            if idx > 5:  # Need enough history
                current = df.iloc[idx]
                prev1 = df.iloc[idx-1]
                prev2 = df.iloc[idx-2]
                prev3 = df.iloc[idx-3]
                
                # Calculate pattern features
                lookback = min(15, idx)
                local_bars = df.iloc[idx-lookback:idx]
                local_high = local_bars['high'].max()
                local_low = local_bars['low'].min()
                
                # Candlestick pattern
                is_bullish = current['close'] > current['open']
                is_bearish = current['close'] < current['open']
                
                # Volume increase
                vol_increase = current['volume'] / local_bars['volume'].mean()
                
                # Price levels
                low_vs_local = current['low'] / local_low
                close_vs_local_low = current['close'] / local_low
                
                # Prior uptrend
                prior_up = prev1['close'] > prev2['close'] > prev3['close']
                
                features = {
                    "timestamp": ts,
                    "is_bearish": is_bearish,
                    "vol_increase": vol_increase,
                    "low_vs_local": low_vs_local,
                    "close_vs_local_low": close_vs_local_low,
                    "prior_up": prior_up
                }
                downtrend_features.append(features)
                print(f"  {ts}: {'Bearish' if is_bearish else 'Bullish'}, Vol:{vol_increase:.1f}x, Close/LocalLow:{close_vs_local_low:.3f}")
    
    return uptrend_features, downtrend_features

def discover_trend_patterns_refined(ohlc_data):
    """
    Refined trend start detection based on analysis of reference patterns
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
    last_trend_time = None
    min_bars_between_trends = 2  # Minimum bars between trends
    
    for i in range(5, len(df)):
        current = df.iloc[i]
        prev1 = df.iloc[i-1] 
        prev2 = df.iloc[i-2]
        
        # Skip if too soon after last trend change
        if last_trend_time is not None:
            bars_since_last = i - last_trend_time
            if bars_since_last < min_bars_between_trends:
                continue
        
        # Calculate important price levels
        lookback = min(15, i)
        local_bars = df.iloc[i-lookback:i]
        local_high = local_bars['high'].max()
        local_low = local_bars['low'].min()
        
        # === PATTERN DETECTION - REFINED BASED ON REFERENCE DATA ===
        
        # Check conditions common to both trend types
        is_bullish = current['close'] > current['open']
        is_bearish = current['close'] < current['open']
        volume_surge = current['volume'] > local_bars['volume'].mean() * 1.2
        
        # UPTREND START conditions (refined from analysis)
        # 1. Key reversal bar (significant bullish bar after downtrend)
        key_reversal_up = (
            is_bullish and
            current['close'] > prev1['high'] and  # Close above previous high
            (current['close'] - current['open']) / (current['high'] - current['low']) > 0.5  # Strong bullish close
        )
        
        # 2. Breakout above recent resistance
        breaks_above_resistance = current['close'] > local_high * 0.99
        
        # 3. Spring pattern (false breakdown followed by recovery)
        spring_pattern = (
            is_bullish and
            current['low'] < local_low and  # Temporarily broke support
            current['close'] > prev1['close'] and  # Recovered
            volume_surge  # With increased volume
        )
        
        # 4. Volume climax bottom
        volume_climax_bottom = (
            is_bullish and
            current['volume'] > local_bars['volume'].max() * 0.9 and
            current['low'] < local_low * 1.01 and
            current['close'] > (current['high'] + current['low']) / 2  # Closed in upper half
        )
        
        # Combined uptrend start conditions
        is_uptrend_start = (
            last_trend != 'uptrend' and  # Not already in uptrend
            (key_reversal_up or breaks_above_resistance or spring_pattern or volume_climax_bottom)
        )
        
        # DOWNTREND START conditions (refined from analysis)
        # 1. Key reversal bar (significant bearish bar after uptrend)
        key_reversal_down = (
            is_bearish and
            current['close'] < prev1['low'] and  # Close below previous low
            (current['open'] - current['close']) / (current['high'] - current['low']) > 0.5  # Strong bearish close
        )
        
        # 2. Breakdown below recent support
        breaks_below_support = current['close'] < local_low * 1.01
        
        # 3. Upthrust pattern (false breakout followed by reversal)
        upthrust_pattern = (
            is_bearish and
            current['high'] > local_high and  # Temporarily broke resistance
            current['close'] < prev1['close'] and  # Failed
            volume_surge  # With increased volume
        )
        
        # 4. Volume climax top
        volume_climax_top = (
            is_bearish and
            current['volume'] > local_bars['volume'].max() * 0.9 and
            current['high'] > local_high * 0.99 and
            current['close'] < (current['high'] + current['low']) / 2  # Closed in lower half
        )
        
        # Combined downtrend start conditions
        is_downtrend_start = (
            last_trend != 'downtrend' and  # Not already in downtrend
            (key_reversal_down or breaks_below_support or upthrust_pattern or volume_climax_top)
        )
        
        # === RECORD TREND STARTS ===
        
        if is_uptrend_start:
            df.loc[df.index[i], 'uptrendStart'] = True
            last_trend = 'uptrend'
            last_trend_time = i
            
        elif is_downtrend_start:
            df.loc[df.index[i], 'downtrendStart'] = True
            last_trend = 'downtrend'
            last_trend_time = i
    
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
    
    # Calculate matches - EXACT timestamp matching
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
    print(f"Exact matches: {len(uptrend_matches)}/{len(ref_uptrends)} uptrends ({up_match_pct:.1f}%)")
    print(f"Exact matches: {len(downtrend_matches)}/{len(ref_downtrends)} downtrends ({down_match_pct:.1f}%)")
    print(f"Overall exact match: {overall_match_pct:.1f}%")
    
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
    
    # Analyze reference patterns (but don't use them directly in detection)
    analyze_pattern_features(df, ref_path)
    
    # Discover trend patterns using refined approach
    result_df = discover_trend_patterns_refined(df)
    
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
    result_df.to_csv('results_4h_discovery_refined.csv', index=False)
    print(f"\nResults saved to results_4h_discovery_refined.csv")

if __name__ == "__main__":
    main() 