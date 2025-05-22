#!/usr/bin/env python3

import pandas as pd
import numpy as np

def load_comparison_data():
    """Load both datasets for detailed comparison"""
    
    # Load OHLC data
    ohlc_df = pd.read_csv('trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv')
    ohlc_df['timestamp'] = pd.to_datetime(ohlc_df['timestamp'])
    ohlc_df.reset_index(drop=True, inplace=True)
    ohlc_df['bar_index'] = range(1, len(ohlc_df) + 1)
    
    # Load sophisticated results
    sophisticated_df = pd.read_csv('trend_analysis/confirmed_trend_starts_og.csv')
    sophisticated_df.columns = ['trend_type', 'bar_index', 'date']
    sophisticated_df['date'] = pd.to_datetime(sophisticated_df['date'])
    
    # Load truth data
    truth_df = pd.read_csv('trend_analysis/confirmed_trend_starts_4h_truth.csv')
    truth_df.columns = ['trend_type', 'bar_index', 'date']
    truth_df['date'] = pd.to_datetime(truth_df['date'])
    
    # Truncate sophisticated to match truth timeframe
    truth_max_date = truth_df['date'].max()
    sophisticated_truncated = sophisticated_df[sophisticated_df['date'] <= truth_max_date].copy()
    
    return ohlc_df, sophisticated_truncated, truth_df

def identify_over_detection_patterns(sophisticated_df, truth_df):
    """Identify patterns causing over-detection in sophisticated algorithm"""
    
    print("=== OVER-DETECTION ANALYSIS ===")
    
    # Find signals in sophisticated but not in truth (within 2 bars tolerance)
    over_detected = []
    
    for _, soph_signal in sophisticated_df.iterrows():
        soph_bar = soph_signal['bar_index']
        soph_type = soph_signal['trend_type']
        
        # Look for matching signal in truth within ±2 bars
        tolerance = 2
        matching_truth = truth_df[
            (truth_df['trend_type'] == soph_type) & 
            (abs(truth_df['bar_index'] - soph_bar) <= tolerance)
        ]
        
        if len(matching_truth) == 0:
            over_detected.append(soph_signal)
    
    print(f"Over-detected signals: {len(over_detected)}")
    
    if len(over_detected) > 0:
        print("\nPatterns in over-detected signals:")
        
        # Analyze gaps between consecutive over-detected signals
        over_detected_df = pd.DataFrame(over_detected)
        over_detected_df = over_detected_df.sort_values('bar_index')
        
        gaps = over_detected_df['bar_index'].diff().dropna()
        short_gaps = gaps[gaps <= 3]
        
        print(f"  - {len(short_gaps)} over-detected signals have ≤3 bar gaps (rapid-fire detection)")
        print(f"  - Average gap: {gaps.mean():.1f} bars")
        
        # Check for consecutive same-trend over-detections
        consecutive_same = 0
        for i in range(1, len(over_detected_df)):
            if over_detected_df.iloc[i]['trend_type'] == over_detected_df.iloc[i-1]['trend_type']:
                consecutive_same += 1
        
        print(f"  - {consecutive_same} consecutive same-trend over-detections")
        
    return over_detected

def identify_alternation_failures(sophisticated_df):
    """Identify where trend alternation fails"""
    
    print("\n=== ALTERNATION FAILURE ANALYSIS ===")
    
    failures = []
    
    for i in range(1, len(sophisticated_df)):
        current = sophisticated_df.iloc[i]
        previous = sophisticated_df.iloc[i-1]
        
        if current['trend_type'] == previous['trend_type']:
            failures.append({
                'prev_bar': previous['bar_index'],
                'curr_bar': current['bar_index'],
                'trend_type': current['trend_type'],
                'gap': current['bar_index'] - previous['bar_index']
            })
    
    print(f"Alternation failures: {len(failures)}")
    
    if len(failures) > 0:
        failure_df = pd.DataFrame(failures)
        
        print(f"\nFailure patterns:")
        print(f"  - Average gap between consecutive same trends: {failure_df['gap'].mean():.1f} bars")
        print(f"  - Shortest gap: {failure_df['gap'].min()} bars")
        print(f"  - Longest gap: {failure_df['gap'].max()} bars")
        
        # Group by trend type
        for trend_type in failure_df['trend_type'].unique():
            count = len(failure_df[failure_df['trend_type'] == trend_type])
            print(f"  - {trend_type} consecutive failures: {count}")
    
    return failures

def identify_timing_differences(sophisticated_df, truth_df):
    """Identify systematic timing differences"""
    
    print("\n=== TIMING DIFFERENCE ANALYSIS ===")
    
    timing_diffs = []
    
    # For each truth signal, find closest sophisticated signal of same type
    for _, truth_signal in truth_df.iterrows():
        truth_bar = truth_signal['bar_index']
        truth_type = truth_signal['trend_type']
        
        # Find closest sophisticated signal of same type within ±5 bars
        same_type_soph = sophisticated_df[sophisticated_df['trend_type'] == truth_type]
        
        if len(same_type_soph) > 0:
            distances = abs(same_type_soph['bar_index'] - truth_bar)
            closest_idx = distances.idxmin()
            closest_soph = same_type_soph.loc[closest_idx]
            
            if distances.loc[closest_idx] <= 5:  # Within 5 bars
                timing_diff = closest_soph['bar_index'] - truth_bar
                timing_diffs.append({
                    'truth_bar': truth_bar,
                    'soph_bar': closest_soph['bar_index'],
                    'difference': timing_diff,
                    'trend_type': truth_type
                })
    
    if len(timing_diffs) > 0:
        timing_df = pd.DataFrame(timing_diffs)
        
        print(f"Timing matches found: {len(timing_diffs)}")
        print(f"Average timing difference: {timing_df['difference'].mean():.1f} bars")
        print(f"  - Sophisticated leads by: {abs(timing_df[timing_df['difference'] < 0]['difference'].mean()):.1f} bars on average")
        print(f"  - Sophisticated lags by: {timing_df[timing_df['difference'] > 0]['difference'].mean():.1f} bars on average")
        
        # Check for systematic bias
        early_signals = len(timing_df[timing_df['difference'] < 0])
        late_signals = len(timing_df[timing_df['difference'] > 0])
        on_time = len(timing_df[timing_df['difference'] == 0])
        
        print(f"\nTiming distribution:")
        print(f"  - Early signals: {early_signals}")
        print(f"  - On-time signals: {on_time}")
        print(f"  - Late signals: {late_signals}")
    
    return timing_diffs

def generate_adjustment_recommendations(over_detected, failures, timing_diffs):
    """Generate specific recommendations for adjusting trend_start_og.py"""
    
    print("\n" + "=" * 60)
    print("ADJUSTMENT RECOMMENDATIONS FOR trend_start_og.py")
    print("=" * 60)
    
    print("\n1. REDUCE OVER-DETECTION:")
    if len(over_detected) > 10:
        print("   - Increase confirmation requirements")
        print("   - Add stronger containment validation")
        print("   - Require larger breakout/breakdown moves")
        print("   - Increase minimum gap between signals")
    
    print("\n2. IMPROVE TREND ALTERNATION:")
    if len(failures) > 0:
        print("   - Strengthen forced alternation logic")
        print("   - Prevent same-trend signals within 3-4 bars")
        print("   - Add trend direction memory to state")
        print("   - Require stronger opposing signal to override")
    
    print("\n3. ADJUST TIMING:")
    if len(timing_diffs) > 0:
        timing_df = pd.DataFrame(timing_diffs)
        avg_diff = timing_df['difference'].mean()
        
        if avg_diff > 0.5:
            print("   - Sophisticated algorithm is systematically late")
            print("   - Reduce confirmation delay")
            print("   - Make pattern recognition more aggressive")
        elif avg_diff < -0.5:
            print("   - Sophisticated algorithm is systematically early") 
            print("   - Add more confirmation steps")
            print("   - Increase pattern validation requirements")
        else:
            print("   - Timing is generally good")
    
    print("\n4. SPECIFIC CODE CHANGES NEEDED:")
    print("   a) In containment logic:")
    print("      - Increase minimum containment duration")
    print("      - Require stronger breakout confirmation")
    
    print("   b) In forced alternation:")
    print("      - Make alternation enforcement more strict")
    print("      - Add cooldown period between same-trend signals")
    
    print("   c) In confirmation logic:")
    print("      - Adjust pending → confirmed transition criteria")
    print("      - Add trend strength validation")
    
    print("\n5. PARAMETER ADJUSTMENTS:")
    print("   - Minimum bars between signals: increase from current to 3-4")
    print("   - Containment confirmation: require 2-3 bars minimum")
    print("   - Breakout threshold: increase validation strength")

def main():
    """Main analysis function"""
    
    print("IDENTIFYING ADJUSTMENTS NEEDED FOR trend_start_og.py")
    print("=" * 60)
    
    ohlc_df, sophisticated_df, truth_df = load_comparison_data()
    
    print(f"Analysis period: {truth_df['date'].min()} to {truth_df['date'].max()}")
    print(f"Sophisticated signals: {len(sophisticated_df)}")
    print(f"Truth signals: {len(truth_df)}")
    print(f"Over-detection: {len(sophisticated_df) - len(truth_df)} signals")
    
    # Perform detailed analysis
    over_detected = identify_over_detection_patterns(sophisticated_df, truth_df)
    failures = identify_alternation_failures(sophisticated_df)
    timing_diffs = identify_timing_differences(sophisticated_df, truth_df)
    
    # Generate recommendations
    generate_adjustment_recommendations(over_detected, failures, timing_diffs)

if __name__ == "__main__":
    main() 