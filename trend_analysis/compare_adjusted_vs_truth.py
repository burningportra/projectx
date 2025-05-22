#!/usr/bin/env python3

import pandas as pd
import numpy as np

def load_and_truncate_data():
    """Load and compare adjusted results with truth data"""
    
    # Load adjusted results
    adjusted_df = pd.read_csv('trend_analysis/confirmed_trend_starts_adjusted.csv')
    # Normalize column names
    if 'trend_start_type' in adjusted_df.columns:
        adjusted_df = adjusted_df.rename(columns={'trend_start_type': 'trend_type'})
    adjusted_df['date'] = pd.to_datetime(adjusted_df['date'])
    
    # Load truth data
    truth_df = pd.read_csv('trend_analysis/confirmed_trend_starts_4h_truth.csv')
    truth_df.columns = ['trend_type', 'bar_index', 'date']  # Normalize column names
    truth_df['date'] = pd.to_datetime(truth_df['date'])
    
    # Truncate to truth timeframe
    truth_max_date = truth_df['date'].max()
    adjusted_truncated = adjusted_df[adjusted_df['date'] <= truth_max_date].copy()
    
    print(f"COMPARISON RESULTS:")
    print(f"Truth data: {len(truth_df)} signals up to {truth_max_date}")
    print(f"Adjusted algorithm: {len(adjusted_truncated)} signals up to {truth_max_date}")
    print(f"Original algorithm (for reference): 101 signals")
    
    return adjusted_truncated, truth_df

def analyze_alternation(signals_df, name):
    """Analyze trend alternation quality"""
    
    print(f"\n=== {name.upper()} ALTERNATION ANALYSIS ===")
    
    if len(signals_df) < 2:
        print("Not enough signals to analyze alternation")
        return 100.0
    
    proper_alternations = 0
    improper_alternations = 0
    
    signals_sorted = signals_df.sort_values('bar_index')
    
    for i in range(1, len(signals_sorted)):
        current_trend = signals_sorted.iloc[i]['trend_type']
        previous_trend = signals_sorted.iloc[i-1]['trend_type']
        
        if current_trend != previous_trend:
            proper_alternations += 1
        else:
            improper_alternations += 1
            current_bar = signals_sorted.iloc[i]['bar_index']
            prev_bar = signals_sorted.iloc[i-1]['bar_index']
            print(f"  Same trend consecutive: {current_trend} at bars {prev_bar} → {current_bar}")
    
    total_transitions = len(signals_sorted) - 1
    alternation_rate = (proper_alternations / total_transitions) * 100 if total_transitions > 0 else 0
    
    print(f"Proper alternations: {proper_alternations}/{total_transitions} ({alternation_rate:.1f}%)")
    print(f"Improper alternations: {improper_alternations}/{total_transitions} ({100-alternation_rate:.1f}%)")
    
    return alternation_rate

def find_matching_signals(adjusted_df, truth_df, tolerance=2):
    """Find signals that match between adjusted and truth within tolerance"""
    
    matches = []
    adjusted_unmatched = []
    truth_unmatched = []
    
    # Find matches
    for _, adj_signal in adjusted_df.iterrows():
        adj_bar = adj_signal['bar_index']
        adj_type = adj_signal['trend_type']
        
        # Look for matching signal in truth within tolerance
        matching_truth = truth_df[
            (truth_df['trend_type'] == adj_type) & 
            (abs(truth_df['bar_index'] - adj_bar) <= tolerance)
        ]
        
        if len(matching_truth) > 0:
            closest_match = matching_truth.iloc[0]  # Take first match
            matches.append({
                'adjusted_bar': adj_bar,
                'truth_bar': closest_match['bar_index'],
                'trend_type': adj_type,
                'difference': abs(adj_bar - closest_match['bar_index'])
            })
        else:
            adjusted_unmatched.append(adj_signal)
    
    # Find truth signals that weren't matched
    matched_truth_bars = [m['truth_bar'] for m in matches]
    for _, truth_signal in truth_df.iterrows():
        if truth_signal['bar_index'] not in matched_truth_bars:
            truth_unmatched.append(truth_signal)
    
    return matches, adjusted_unmatched, truth_unmatched

def main():
    """Main comparison function"""
    
    print("COMPARING ADJUSTED ALGORITHM VS TRUTH DATA")
    print("=" * 60)
    
    adjusted_df, truth_df = load_and_truncate_data()
    
    # Analyze alternation quality
    adj_alternation = analyze_alternation(adjusted_df, "adjusted")
    truth_alternation = analyze_alternation(truth_df, "truth")
    
    # Find matching signals
    matches, adj_unmatched, truth_unmatched = find_matching_signals(adjusted_df, truth_df)
    
    print(f"\n=== SIGNAL MATCHING ANALYSIS ===")
    print(f"Matched signals: {len(matches)}")
    print(f"Adjusted unmatched (false positives): {len(adj_unmatched)}")
    print(f"Truth unmatched (missed signals): {len(truth_unmatched)}")
    
    if len(matches) > 0:
        match_df = pd.DataFrame(matches)
        avg_timing_diff = match_df['difference'].mean()
        print(f"Average timing difference for matches: {avg_timing_diff:.1f} bars")
    
    # Calculate metrics
    precision = len(matches) / len(adjusted_df) * 100 if len(adjusted_df) > 0 else 0
    recall = len(matches) / len(truth_df) * 100 if len(truth_df) > 0 else 0
    
    print(f"\n=== PERFORMANCE METRICS ===")
    print(f"Precision: {precision:.1f}% ({len(matches)}/{len(adjusted_df)} signals correct)")
    print(f"Recall: {recall:.1f}% ({len(matches)}/{len(truth_df)} truth signals found)")
    
    print(f"\n=== QUALITY COMPARISON ===")
    print(f"Alternation Quality:")
    print(f"  Adjusted: {adj_alternation:.1f}%")
    print(f"  Truth:    {truth_alternation:.1f}%")
    
    print(f"\nSignal Count (in truth timeframe):")
    print(f"  Adjusted: {len(adjusted_df)}")
    print(f"  Truth:    {len(truth_df)}")
    print(f"  Original: 101 (for reference)")
    
    # Calculate improvement
    original_over_detection = 101 - len(truth_df)
    adjusted_over_detection = len(adjusted_df) - len(truth_df)
    improvement = original_over_detection - adjusted_over_detection
    
    print(f"\n=== IMPROVEMENT ANALYSIS ===")
    print(f"Over-detection reduction: {improvement} signals")
    print(f"Original over-detection: {original_over_detection} signals")
    print(f"Adjusted over-detection: {adjusted_over_detection} signals")
    
    if len(adj_unmatched) > 0:
        print(f"\nAdjusted False Positives (bars): {[s['bar_index'] for s in adj_unmatched[:10]]}")
    
    if len(truth_unmatched) > 0:
        print(f"Missed Truth Signals (bars): {[s['bar_index'] for s in truth_unmatched[:10]]}")
    
    # Overall assessment
    print(f"\n{'='*60}")
    print("OVERALL ASSESSMENT")
    print(f"{'='*60}")
    
    if adj_alternation >= 95 and precision >= 80 and recall >= 70:
        print("🎯 EXCELLENT: Adjusted algorithm shows excellent performance!")
    elif adj_alternation >= 90 and precision >= 70 and recall >= 60:
        print("✅ GOOD: Adjusted algorithm shows significant improvement!")
    elif abs(len(adjusted_df) - len(truth_df)) < 20:
        print("📈 IMPROVED: Adjusted algorithm is much closer to truth data!")
    else:
        print("⚠️  NEEDS WORK: Further adjustments needed")
    
    print(f"\nKey Improvements:")
    print(f"• Reduced signals from 101 to {len(adjusted_df)} (closer to truth: {len(truth_df)})")
    print(f"• Alternation quality: {adj_alternation:.1f}%")
    print(f"• Precision: {precision:.1f}%")
    print(f"• Recall: {recall:.1f}%")

if __name__ == "__main__":
    main() 