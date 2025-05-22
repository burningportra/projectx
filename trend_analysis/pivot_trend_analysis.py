#!/usr/bin/env python3

import pandas as pd
import numpy as np

def load_data():
    """Load OHLC and trend data"""
    ohlc_df = pd.read_csv('trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv')
    ohlc_df['timestamp'] = pd.to_datetime(ohlc_df['timestamp'])
    ohlc_df.reset_index(drop=True, inplace=True)
    ohlc_df['bar_index'] = range(1, len(ohlc_df) + 1)
    
    truth_df = pd.read_csv('trend_analysis/confirmed_trend_starts_4h_truth.csv')
    truth_df.columns = ['trend_type', 'bar_index', 'date']
    truth_df['date'] = pd.to_datetime(truth_df['date'])
    
    current_df = pd.read_csv('trend_analysis/confirmed_trend_starts.csv')
    current_df['date'] = pd.to_datetime(current_df['date'])
    
    return ohlc_df, truth_df, current_df

def find_actual_pivot_points(ohlc_df, lookback=5, lookahead=5):
    """Find actual pivot highs and pivot lows in the data"""
    
    pivot_highs = []  # (bar_index, high_price)
    pivot_lows = []   # (bar_index, low_price)
    
    for i in range(lookback, len(ohlc_df) - lookahead):
        current_bar = ohlc_df.iloc[i]
        
        # Check for pivot high
        is_pivot_high = True
        for j in range(i - lookback, i + lookahead + 1):
            if j != i and ohlc_df.iloc[j]['high'] >= current_bar['high']:
                is_pivot_high = False
                break
        
        if is_pivot_high:
            pivot_highs.append((current_bar['bar_index'], current_bar['high']))
        
        # Check for pivot low
        is_pivot_low = True
        for j in range(i - lookback, i + lookahead + 1):
            if j != i and ohlc_df.iloc[j]['low'] <= current_bar['low']:
                is_pivot_low = False
                break
        
        if is_pivot_low:
            pivot_lows.append((current_bar['bar_index'], current_bar['low']))
    
    return pivot_highs, pivot_lows

def analyze_multi_bar_trend_after_point(ohlc_df, bar_index, direction, confirm_bars=8):
    """Analyze if there's actual multi-bar trend movement after a potential pivot point"""
    
    if bar_index + confirm_bars > len(ohlc_df):
        return False, "Not enough data"
    
    start_idx = bar_index - 1  # Convert to 0-indexed
    confirmation_sequence = ohlc_df.iloc[start_idx:start_idx + confirm_bars + 1]
    
    if direction == "uptrend":
        # For uptrend start: need higher highs and higher lows progression
        pivot_bar = confirmation_sequence.iloc[0]
        
        print(f"   Checking UPTREND confirmation after Bar {bar_index} (Low: {pivot_bar['low']:.2f}):")
        
        higher_highs = 0
        higher_lows = 0
        breaks_above_pivot_high = 0
        stays_above_pivot_low = 0
        
        for i in range(1, len(confirmation_sequence)):
            curr_bar = confirmation_sequence.iloc[i]
            prev_bar = confirmation_sequence.iloc[i-1]
            
            # Track progression
            if curr_bar['high'] > prev_bar['high']:
                higher_highs += 1
            if curr_bar['low'] > prev_bar['low']:
                higher_lows += 1
            
            # Track pivot respect
            if curr_bar['high'] > pivot_bar['high']:
                breaks_above_pivot_high += 1
            if curr_bar['low'] >= pivot_bar['low']:
                stays_above_pivot_low += 1
                
            print(f"     Bar {curr_bar['bar_index']}: H={curr_bar['high']:.2f} L={curr_bar['low']:.2f} "
                  f"(vs prev: H{'+' if curr_bar['high'] > prev_bar['high'] else '-'} "
                  f"L{'+' if curr_bar['low'] > prev_bar['low'] else '-'})")
        
        total_bars = len(confirmation_sequence) - 1
        
        print(f"   >>> Higher Highs: {higher_highs}/{total_bars} ({higher_highs/total_bars:.1%})")
        print(f"   >>> Higher Lows: {higher_lows}/{total_bars} ({higher_lows/total_bars:.1%})")
        print(f"   >>> Breaks above pivot high: {breaks_above_pivot_high}/{total_bars}")
        print(f"   >>> Stays above pivot low: {stays_above_pivot_low}/{total_bars}")
        
        # Criteria for valid uptrend
        strong_uptrend = (higher_highs >= total_bars * 0.6 and 
                         breaks_above_pivot_high >= 1 and
                         stays_above_pivot_low >= total_bars * 0.8)
        
        return strong_uptrend, f"HH:{higher_highs}/{total_bars}, HL:{higher_lows}/{total_bars}, Above:{stays_above_pivot_low}/{total_bars}"
    
    elif direction == "downtrend":
        # For downtrend start: need lower highs and lower lows progression
        pivot_bar = confirmation_sequence.iloc[0]
        
        print(f"   Checking DOWNTREND confirmation after Bar {bar_index} (High: {pivot_bar['high']:.2f}):")
        
        lower_highs = 0
        lower_lows = 0
        breaks_below_pivot_low = 0
        stays_below_pivot_high = 0
        
        for i in range(1, len(confirmation_sequence)):
            curr_bar = confirmation_sequence.iloc[i]
            prev_bar = confirmation_sequence.iloc[i-1]
            
            # Track progression
            if curr_bar['high'] < prev_bar['high']:
                lower_highs += 1
            if curr_bar['low'] < prev_bar['low']:
                lower_lows += 1
            
            # Track pivot respect
            if curr_bar['low'] < pivot_bar['low']:
                breaks_below_pivot_low += 1
            if curr_bar['high'] <= pivot_bar['high']:
                stays_below_pivot_high += 1
                
            print(f"     Bar {curr_bar['bar_index']}: H={curr_bar['high']:.2f} L={curr_bar['low']:.2f} "
                  f"(vs prev: H{'+' if curr_bar['high'] > prev_bar['high'] else '-'} "
                  f"L{'+' if curr_bar['low'] > prev_bar['low'] else '-'})")
        
        total_bars = len(confirmation_sequence) - 1
        
        print(f"   >>> Lower Highs: {lower_highs}/{total_bars} ({lower_highs/total_bars:.1%})")
        print(f"   >>> Lower Lows: {lower_lows}/{total_bars} ({lower_lows/total_bars:.1%})")
        print(f"   >>> Breaks below pivot low: {breaks_below_pivot_low}/{total_bars}")
        print(f"   >>> Stays below pivot high: {stays_below_pivot_high}/{total_bars}")
        
        # Criteria for valid downtrend
        strong_downtrend = (lower_lows >= total_bars * 0.6 and 
                           breaks_below_pivot_low >= 1 and
                           stays_below_pivot_high >= total_bars * 0.8)
        
        return strong_downtrend, f"LH:{lower_highs}/{total_bars}, LL:{lower_lows}/{total_bars}, Below:{stays_below_pivot_high}/{total_bars}"

def reverse_engineer_truth_signals(ohlc_df, truth_df):
    """Reverse engineer what makes the truth signals valid pivot points"""
    
    print("\n" + "="*80)
    print("REVERSE ENGINEERING TRUTH SIGNALS AS PIVOT POINTS")
    print("="*80)
    
    # Analyze each truth signal
    for _, row in truth_df.iterrows():
        bar_index = row['bar_index']
        trend_type = row['trend_type']
        
        if bar_index > len(ohlc_df):
            continue
            
        target_bar = ohlc_df[ohlc_df['bar_index'] == bar_index].iloc[0]
        
        print(f"\n{'='*60}")
        print(f"TRUTH SIGNAL: Bar {bar_index} - {trend_type.upper()} START")
        print(f"{'='*60}")
        
        if trend_type == 'uptrend':
            print(f"UPTREND START - Pivot Low: {target_bar['low']:.2f} at Bar {bar_index}")
            
            # Check if this is actually the lowest low before upward movement
            confirmed, details = analyze_multi_bar_trend_after_point(ohlc_df, bar_index, "uptrend")
            
            print(f"   Multi-bar uptrend confirmation: {'✓ VALID' if confirmed else '✗ INVALID'}")
            print(f"   Details: {details}")
            
            # Check recent lows to see if this is truly the pivot
            recent_lows = []
            for i in range(max(1, bar_index - 10), min(len(ohlc_df) + 1, bar_index + 5)):
                if i != bar_index:
                    check_bar = ohlc_df[ohlc_df['bar_index'] == i].iloc[0]
                    recent_lows.append((i, check_bar['low']))
            
            lower_lows_before = [x for x in recent_lows if x[0] < bar_index and x[1] < target_bar['low']]
            lower_lows_after = [x for x in recent_lows if x[0] > bar_index and x[1] < target_bar['low']]
            
            print(f"   Lower lows before: {len(lower_lows_before)} bars {lower_lows_before}")
            print(f"   Lower lows after: {len(lower_lows_after)} bars {lower_lows_after}")
            
        elif trend_type == 'downtrend':
            print(f"DOWNTREND START - Pivot High: {target_bar['high']:.2f} at Bar {bar_index}")
            
            # Check if this is actually the highest high before downward movement
            confirmed, details = analyze_multi_bar_trend_after_point(ohlc_df, bar_index, "downtrend")
            
            print(f"   Multi-bar downtrend confirmation: {'✓ VALID' if confirmed else '✗ INVALID'}")
            print(f"   Details: {details}")
            
            # Check recent highs to see if this is truly the pivot
            recent_highs = []
            for i in range(max(1, bar_index - 10), min(len(ohlc_df) + 1, bar_index + 5)):
                if i != bar_index:
                    check_bar = ohlc_df[ohlc_df['bar_index'] == i].iloc[0]
                    recent_highs.append((i, check_bar['high']))
            
            higher_highs_before = [x for x in recent_highs if x[0] < bar_index and x[1] > target_bar['high']]
            higher_highs_after = [x for x in recent_highs if x[0] > bar_index and x[1] > target_bar['high']]
            
            print(f"   Higher highs before: {len(higher_highs_before)} bars {higher_highs_before}")
            print(f"   Higher highs after: {len(higher_highs_after)} bars {higher_highs_after}")

def analyze_false_positive_pivot_failures(ohlc_df, current_df, truth_df):
    """Analyze why current algorithm's signals are NOT valid pivot points"""
    
    print("\n" + "="*80)
    print("ANALYZING FALSE POSITIVE PIVOT FAILURES")
    print("="*80)
    
    # Get false positives (current signals not in truth)
    truth_bars = set(truth_df['bar_index'].tolist())
    false_positives = []
    
    for _, row in current_df.iterrows():
        if row['bar_index'] not in truth_bars and row['bar_index'] <= 120:  # Focus on early data
            false_positives.append((row['bar_index'], row['trend_start_type']))
    
    # Analyze first several false positives
    for bar_index, trend_type in false_positives[:6]:
        target_bar = ohlc_df[ohlc_df['bar_index'] == bar_index].iloc[0]
        
        print(f"\n--- FALSE POSITIVE: Bar {bar_index} ({trend_type}) ---")
        
        if trend_type == 'uptrend':
            print(f"Claims UPTREND START - Low: {target_bar['low']:.2f}")
            confirmed, details = analyze_multi_bar_trend_after_point(ohlc_df, bar_index, "uptrend")
            print(f"Multi-bar confirmation: {'✓' if confirmed else '✗ FAILED'} - {details}")
            
        elif trend_type == 'downtrend':
            print(f"Claims DOWNTREND START - High: {target_bar['high']:.2f}")
            confirmed, details = analyze_multi_bar_trend_after_point(ohlc_df, bar_index, "downtrend")
            print(f"Multi-bar confirmation: {'✓' if confirmed else '✗ FAILED'} - {details}")

def compare_algorithm_vs_actual_pivots(ohlc_df, truth_df, current_df):
    """Compare what the algorithm detects vs actual pivot points"""
    
    print("\n" + "="*80)
    print("ALGORITHM vs ACTUAL PIVOT COMPARISON")
    print("="*80)
    
    # Find actual pivot points in the data
    pivot_highs, pivot_lows = find_actual_pivot_points(ohlc_df, lookback=3, lookahead=3)
    
    print("ACTUAL PIVOT POINTS IN DATA:")
    print(f"Pivot Highs: {pivot_highs[:10]}")  # First 10
    print(f"Pivot Lows: {pivot_lows[:10]}")   # First 10
    
    # Compare with truth signals
    print("\nTRUTH SIGNALS vs ACTUAL PIVOTS:")
    truth_uptrends = truth_df[truth_df['trend_type'] == 'uptrend']['bar_index'].tolist()
    truth_downtrends = truth_df[truth_df['trend_type'] == 'downtrend']['bar_index'].tolist()
    
    actual_pivot_high_bars = [x[0] for x in pivot_highs]
    actual_pivot_low_bars = [x[0] for x in pivot_lows]
    
    print(f"Truth uptrends: {truth_uptrends[:8]}")
    print(f"Actual pivot lows: {actual_pivot_low_bars[:8]}")
    print(f"Truth downtrends: {truth_downtrends[:8]}")
    print(f"Actual pivot highs: {actual_pivot_high_bars[:8]}")
    
    # Check alignment
    uptrend_matches = set(truth_uptrends) & set(actual_pivot_low_bars)
    downtrend_matches = set(truth_downtrends) & set(actual_pivot_high_bars)
    
    print(f"\nUPTREND MATCHES (truth signals at actual pivot lows): {sorted(uptrend_matches)}")
    print(f"DOWNTREND MATCHES (truth signals at actual pivot highs): {sorted(downtrend_matches)}")
    
    # Compare with current algorithm
    print("\nCURRENT ALGORITHM vs ACTUAL PIVOTS:")
    current_uptrends = current_df[current_df['trend_start_type'] == 'uptrend']['bar_index'].tolist()
    current_downtrends = current_df[current_df['trend_start_type'] == 'downtrend']['bar_index'].tolist()
    
    algo_uptrend_matches = set(current_uptrends) & set(actual_pivot_low_bars)
    algo_downtrend_matches = set(current_downtrends) & set(actual_pivot_high_bars)
    
    print(f"Algorithm uptrend matches: {len(algo_uptrend_matches)}/{len(current_uptrends)} = {len(algo_uptrend_matches)/len(current_uptrends):.1%}")
    print(f"Algorithm downtrend matches: {len(algo_downtrend_matches)}/{len(current_downtrends)} = {len(algo_downtrend_matches)/len(current_downtrends):.1%}")

def identify_missing_pivot_points(ohlc_df, truth_df, current_df):
    """Identify actual pivot points that both algorithms are missing"""
    
    print("\n" + "="*80)
    print("MISSING PIVOT POINTS ANALYSIS")
    print("="*80)
    
    # Find significant pivot points
    pivot_highs, pivot_lows = find_actual_pivot_points(ohlc_df, lookback=4, lookahead=4)
    
    # Get all detected signals
    truth_bars = set(truth_df['bar_index'].tolist())
    current_bars = set(current_df['bar_index'].tolist())
    all_detected = truth_bars | current_bars
    
    # Find missed pivots
    pivot_high_bars = set([x[0] for x in pivot_highs if x[0] <= 150])  # First 150 bars
    pivot_low_bars = set([x[0] for x in pivot_lows if x[0] <= 150])
    
    missed_pivot_highs = pivot_high_bars - all_detected
    missed_pivot_lows = pivot_low_bars - all_detected
    
    print(f"MISSED PIVOT HIGHS: {sorted(missed_pivot_highs)[:8]}")
    print(f"MISSED PIVOT LOWS: {sorted(missed_pivot_lows)[:8]}")
    
    # Analyze a few missed pivots
    for bar_index in sorted(missed_pivot_highs)[:3]:
        target_bar = ohlc_df[ohlc_df['bar_index'] == bar_index].iloc[0]
        print(f"\nMISSED PIVOT HIGH - Bar {bar_index}: {target_bar['high']:.2f}")
        confirmed, details = analyze_multi_bar_trend_after_point(ohlc_df, bar_index, "downtrend")
        print(f"Would be valid downtrend start: {'YES' if confirmed else 'NO'} - {details}")
    
    for bar_index in sorted(missed_pivot_lows)[:3]:
        target_bar = ohlc_df[ohlc_df['bar_index'] == bar_index].iloc[0]
        print(f"\nMISSED PIVOT LOW - Bar {bar_index}: {target_bar['low']:.2f}")
        confirmed, details = analyze_multi_bar_trend_after_point(ohlc_df, bar_index, "uptrend")
        print(f"Would be valid uptrend start: {'YES' if confirmed else 'NO'} - {details}")

def main():
    print("="*80)
    print("PIVOT POINT & MULTI-BAR TREND ANALYSIS")
    print("="*80)
    
    ohlc_df, truth_df, current_df = load_data()
    
    # Reverse engineer truth signals to understand the pivot concept
    reverse_engineer_truth_signals(ohlc_df, truth_df)
    
    # Analyze why false positives fail as pivot points
    analyze_false_positive_pivot_failures(ohlc_df, current_df, truth_df)
    
    # Compare algorithms vs actual pivots
    compare_algorithm_vs_actual_pivots(ohlc_df, truth_df, current_df)
    
    # Find missed opportunities
    identify_missing_pivot_points(ohlc_df, truth_df, current_df)
    
    print("\n" + "="*80)
    print("PIVOT ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main() 