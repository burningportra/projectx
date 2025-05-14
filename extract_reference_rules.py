import pandas as pd
import json
import numpy as np
from datetime import datetime
import matplotlib.pyplot as plt
from collections import defaultdict

def analyze_reference_trend_rules(ohlc_path, ref_path):
    """
    Analyze reference trend starts to extract exact rules used
    
    Args:
        ohlc_path: Path to OHLC data
        ref_path: Path to reference trend points
    """
    # Load OHLC data
    df = pd.read_csv(ohlc_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    # Load reference data
    with open(ref_path, 'r') as f:
        ref_data = json.load(f)
    
    # Create timestamp lookup for efficient indexing
    ts_to_idx = {row['timestamp']: i for i, row in df.iterrows()}
    
    # Extract reference timestamps
    ref_uptrends = [(pd.to_datetime(item['timestamp']), item['price']) 
                   for item in ref_data if item['type'] == 'uptrendStart']
    ref_downtrends = [(pd.to_datetime(item['timestamp']), item['price']) 
                     for item in ref_data if item['type'] == 'downtrendStart']
    
    # Sort by timestamp
    ref_uptrends.sort()
    ref_downtrends.sort()
    
    print(f"Found {len(ref_uptrends)} reference uptrend starts")
    print(f"Found {len(ref_downtrends)} reference downtrend starts")
    
    # Collect patterns at each reference point
    uptrend_patterns = []
    downtrend_patterns = []
    
    # Analysis lookback
    lookback = 5  # Bars to look back
    lookforward = 2  # Bars to look forward
    
    print("\nANALYZING UPTREND START PATTERNS...")
    for ts, price in ref_uptrends:
        # Find the index of this timestamp in the dataframe
        reference_idx = None
        for i, row in df.iterrows():
            if abs((row['timestamp'] - ts).total_seconds()) < 10:  # Allow slight timing differences
                reference_idx = i
                break
        
        if reference_idx is None:
            print(f"Couldn't find matching index for uptrend start at {ts}")
            continue
            
        if reference_idx < lookback or reference_idx + lookforward >= len(df):
            print(f"Not enough context for uptrend start at {ts}")
            continue
        
        # Get context bars
        context = {
            'timestamp': ts,
            'pre_bars': df.iloc[reference_idx-lookback:reference_idx].to_dict('records'),
            'current': df.iloc[reference_idx].to_dict(),
            'post_bars': df.iloc[reference_idx+1:reference_idx+lookforward+1].to_dict('records')
        }
        uptrend_patterns.append(context)
        
        # Print key characteristics
        current = df.iloc[reference_idx]
        prev1 = df.iloc[reference_idx-1]
        prev2 = df.iloc[reference_idx-2]
        
        # Bar properties
        is_bullish = current['close'] > current['open']
        body_size = abs(current['close'] - current['open'])
        range_size = current['high'] - current['low']
        body_percent = body_size / range_size if range_size > 0 else 0
        
        # Movement from previous bars
        close_vs_prev_close = current['close'] / prev1['close']
        low_vs_prev_low = current['low'] / prev1['low'] 
        high_vs_prev_high = current['high'] / prev1['high']
        
        # Previous bars' movement
        prev_trend = "up" if prev1['close'] > prev2['close'] else "down"
        
        print(f"{ts}: Bar={current['open']:.2f}->{current['close']:.2f}, {'Bullish' if is_bullish else 'Bearish'}, Body%={body_percent:.2f}, CloseRatio={close_vs_prev_close:.4f}, PrevTrend={prev_trend}")
    
    print("\nANALYZING DOWNTREND START PATTERNS...")
    for ts, price in ref_downtrends:
        # Find the index of this timestamp in the dataframe
        reference_idx = None
        for i, row in df.iterrows():
            if abs((row['timestamp'] - ts).total_seconds()) < 10:  # Allow slight timing differences
                reference_idx = i
                break
        
        if reference_idx is None:
            print(f"Couldn't find matching index for downtrend start at {ts}")
            continue
            
        if reference_idx < lookback or reference_idx + lookforward >= len(df):
            print(f"Not enough context for downtrend start at {ts}")
            continue
        
        # Get context bars
        context = {
            'timestamp': ts,
            'pre_bars': df.iloc[reference_idx-lookback:reference_idx].to_dict('records'),
            'current': df.iloc[reference_idx].to_dict(),
            'post_bars': df.iloc[reference_idx+1:reference_idx+lookforward+1].to_dict('records')
        }
        downtrend_patterns.append(context)
        
        # Print key characteristics
        current = df.iloc[reference_idx]
        prev1 = df.iloc[reference_idx-1]
        prev2 = df.iloc[reference_idx-2]
        
        # Bar properties
        is_bearish = current['close'] < current['open']
        body_size = abs(current['close'] - current['open'])
        range_size = current['high'] - current['low']
        body_percent = body_size / range_size if range_size > 0 else 0
        
        # Movement from previous bars
        close_vs_prev_close = current['close'] / prev1['close']
        low_vs_prev_low = current['low'] / prev1['low'] 
        high_vs_prev_high = current['high'] / prev1['high']
        
        # Previous bars' movement
        prev_trend = "up" if prev1['close'] > prev2['close'] else "down"
        
        print(f"{ts}: Bar={current['open']:.2f}->{current['close']:.2f}, {'Bearish' if is_bearish else 'Bullish'}, Body%={body_percent:.2f}, CloseRatio={close_vs_prev_close:.4f}, PrevTrend={prev_trend}")
    
    # Compute statistics about the patterns
    print("\nPATTERN STATISTICS:")
    
    # Uptrend starts
    up_bullish_count = sum(1 for p in uptrend_patterns if p['current']['close'] > p['current']['open'])
    up_bullish_pct = up_bullish_count / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    
    up_close_higher = sum(1 for p in uptrend_patterns if p['current']['close'] > p['pre_bars'][-1]['close'])
    up_close_higher_pct = up_close_higher / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    
    print(f"Uptrend starts: {up_bullish_pct:.1f}% are bullish, {up_close_higher_pct:.1f}% close higher than previous")
    
    # Downtrend starts
    down_bearish_count = sum(1 for p in downtrend_patterns if p['current']['close'] < p['current']['open'])
    down_bearish_pct = down_bearish_count / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    
    down_close_lower = sum(1 for p in downtrend_patterns if p['current']['close'] < p['pre_bars'][-1]['close'])
    down_close_lower_pct = down_close_lower / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    
    print(f"Downtrend starts: {down_bearish_pct:.1f}% are bearish, {down_close_lower_pct:.1f}% close lower than previous")
    
    # Analyze the relationship between trend starts and previous trend
    up_after_down = sum(1 for p in uptrend_patterns if 
                       p['pre_bars'][-1]['close'] < p['pre_bars'][-2]['close'])
    up_after_down_pct = up_after_down / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    
    down_after_up = sum(1 for p in downtrend_patterns if 
                       p['pre_bars'][-1]['close'] > p['pre_bars'][-2]['close'])
    down_after_up_pct = down_after_up / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    
    print(f"Uptrend starts: {up_after_down_pct:.1f}% occur after downward movement")
    print(f"Downtrend starts: {down_after_up_pct:.1f}% occur after upward movement")
    
    # Look for alternating pattern in trend starts
    print("\nANALYZING TREND SEQUENCE:")
    
    # Combine all trend points and sort by timestamp
    all_trends = [(ts, 'uptrend') for ts, _ in ref_uptrends] + [(ts, 'downtrend') for ts, _ in ref_downtrends]
    all_trends.sort()
    
    # Count transitions
    transitions = {'uptrend->uptrend': 0, 'uptrend->downtrend': 0, 
                  'downtrend->uptrend': 0, 'downtrend->downtrend': 0}
    
    alternating_count = 0
    for i in range(1, len(all_trends)):
        prev_type = all_trends[i-1][1]
        current_type = all_trends[i][1]
        transition_key = f"{prev_type}->{current_type}"
        transitions[transition_key] += 1
        
        # Alternating pattern is when types are different
        if prev_type != current_type:
            alternating_count += 1
    
    alternating_pct = alternating_count / (len(all_trends) - 1) * 100 if len(all_trends) > 1 else 0
    print(f"Alternating pattern: {alternating_pct:.1f}% of transitions")
    
    for transition, count in transitions.items():
        transition_pct = count / (len(all_trends) - 1) * 100 if len(all_trends) > 1 else 0
        print(f"{transition}: {count} occurrences ({transition_pct:.1f}%)")
    
    # Extract key price action rules
    print("\nEXTRACTED PRICE ACTION RULES:")
    
    # For uptrend starts
    print("UPTREND START RULES:")
    # Check if local low is formed at uptrend start
    up_local_low = sum(1 for p in uptrend_patterns if 
                      all(p['current']['low'] <= bar['low'] for bar in p['pre_bars'][-3:]))
    up_local_low_pct = up_local_low / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    print(f"1. Forms a local low: {up_local_low_pct:.1f}%")
    
    # Check if moving average cross happens at uptrend start (simple approximation)
    up_ma_cross = sum(1 for p in uptrend_patterns if 
                     np.mean([bar['close'] for bar in p['pre_bars']]) < p['current']['close'])
    up_ma_cross_pct = up_ma_cross / len(uptrend_patterns) * 100 if uptrend_patterns else 0
    print(f"2. Crosses above short-term average: {up_ma_cross_pct:.1f}%")
    
    # For downtrend starts
    print("\nDOWNTREND START RULES:")
    # Check if local high is formed at downtrend start
    down_local_high = sum(1 for p in downtrend_patterns if 
                         all(p['current']['high'] >= bar['high'] for bar in p['pre_bars'][-3:]))
    down_local_high_pct = down_local_high / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    print(f"1. Forms a local high: {down_local_high_pct:.1f}%")
    
    # Check if moving average cross happens at downtrend start (simple approximation)
    down_ma_cross = sum(1 for p in downtrend_patterns if 
                       np.mean([bar['close'] for bar in p['pre_bars']]) > p['current']['close'])
    down_ma_cross_pct = down_ma_cross / len(downtrend_patterns) * 100 if downtrend_patterns else 0
    print(f"2. Crosses below short-term average: {down_ma_cross_pct:.1f}%")
    
    return uptrend_patterns, downtrend_patterns

def main():
    # Analyze reference trend rules
    ohlc_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    
    print("Analyzing reference trend rules...")
    uptrend_patterns, downtrend_patterns = analyze_reference_trend_rules(ohlc_path, ref_path)
    
    print("\nAnalysis complete. See above for extracted rules.")

if __name__ == "__main__":
    main() 