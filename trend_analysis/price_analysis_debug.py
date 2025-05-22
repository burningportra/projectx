#!/usr/bin/env python3

import pandas as pd
import numpy as np

def load_data():
    """Load OHLC data and both trend start files"""
    
    # Load OHLC data
    ohlc_df = pd.read_csv('data/CON.F.US.MES.M25_4h_ohlc.csv')
    ohlc_df['timestamp'] = pd.to_datetime(ohlc_df['timestamp'])
    ohlc_df.reset_index(drop=True, inplace=True)
    ohlc_df['bar_index'] = range(1, len(ohlc_df) + 1)  # 1-indexed to match the algorithm
    
    # Load trend starts
    og_df = pd.read_csv('trend_analysis/confirmed_trend_starts_og.csv')
    og_df.columns = ['trend_type', 'bar_index', 'date']
    og_df['date'] = pd.to_datetime(og_df['date'])
    
    truth_df = pd.read_csv('trend_analysis/confirmed_trend_starts_4h_truth.csv')
    truth_df['date'] = pd.to_datetime(truth_df['date'])
    
    return ohlc_df, og_df, truth_df

def analyze_price_context(ohlc_df, bar_indices, title):
    """Analyze price movements around specific bar indices"""
    print(f"\n=== {title} ===")
    
    for bar_idx in sorted(bar_indices)[:10]:  # Show first 10 for space
        if bar_idx < 1 or bar_idx > len(ohlc_df):
            continue
            
        # Get context around this bar (2 bars before, 2 bars after)
        start_idx = max(0, bar_idx - 3)
        end_idx = min(len(ohlc_df), bar_idx + 2)
        
        context = ohlc_df.iloc[start_idx:end_idx].copy()
        context['is_target'] = context['bar_index'] == bar_idx
        
        print(f"\nBar {bar_idx} context:")
        for _, row in context.iterrows():
            marker = ">>> " if row['is_target'] else "    "
            print(f"{marker}Bar {row['bar_index']:3d}: O={row['open']:7.2f} H={row['high']:7.2f} L={row['low']:7.2f} C={row['close']:7.2f} | {row['timestamp']}")
        
        # Calculate price characteristics at the target bar
        target_row = ohlc_df[ohlc_df['bar_index'] == bar_idx].iloc[0]
        if bar_idx > 1:
            prev_row = ohlc_df[ohlc_df['bar_index'] == bar_idx - 1].iloc[0]
            price_change = target_row['close'] - prev_row['close']
            print(f"    Price change from prev bar: {price_change:+.2f} ({price_change/prev_row['close']*100:+.2f}%)")

def analyze_key_differences(ohlc_df, og_df, truth_df):
    """Focus on the most important differences"""
    
    # Get sets of bar indices
    og_bars = set(og_df['bar_index'].unique())
    truth_bars = set(truth_df['bar_index'].unique())
    
    og_only = og_bars - truth_bars
    truth_only = truth_bars - og_bars
    
    print("=== KEY DIFFERENCE ANALYSIS ===")
    print(f"Over-detected (in original but not truth): {len(og_only)} bars")
    print(f"Missed (in truth but not original): {len(truth_only)} bars")
    
    # Analyze over-detected bars (false positives)
    analyze_price_context(ohlc_df, og_only, "OVER-DETECTED BARS (False Positives)")
    
    # Analyze missed bars (false negatives)
    analyze_price_context(ohlc_df, truth_only, "MISSED BARS (False Negatives)")

def analyze_alternation_pattern(ohlc_df, og_df, truth_df):
    """Check if the algorithm is correctly alternating between up/down trends"""
    print("\n=== ALTERNATION PATTERN ANALYSIS ===")
    
    def check_alternation(df, name):
        df_sorted = df.sort_values('bar_index')
        alternation_errors = []
        
        for i in range(1, len(df_sorted)):
            current = df_sorted.iloc[i]['trend_type']
            previous = df_sorted.iloc[i-1]['trend_type']
            
            if current == previous:
                alternation_errors.append({
                    'bar_index': df_sorted.iloc[i]['bar_index'],
                    'trend_type': current,
                    'date': df_sorted.iloc[i]['date']
                })
        
        print(f"\n{name} - Alternation errors: {len(alternation_errors)}")
        for error in alternation_errors[:5]:  # Show first 5
            print(f"  Bar {error['bar_index']}: Two consecutive {error['trend_type']}s at {error['date']}")
        
        return alternation_errors
    
    og_errors = check_alternation(og_df, "Original")
    truth_errors = check_alternation(truth_df, "Truth")

def analyze_early_trend_changes(ohlc_df, og_df, truth_df):
    """Look for cases where trends change too quickly"""
    print("\n=== EARLY TREND CHANGE ANALYSIS ===")
    
    def find_quick_changes(df, name):
        df_sorted = df.sort_values('bar_index')
        quick_changes = []
        
        for i in range(1, len(df_sorted)):
            current_bar = df_sorted.iloc[i]['bar_index']
            prev_bar = df_sorted.iloc[i-1]['bar_index']
            gap = current_bar - prev_bar
            
            if gap <= 2:  # Very quick trend change
                quick_changes.append({
                    'from_bar': prev_bar,
                    'to_bar': current_bar,
                    'gap': gap,
                    'from_trend': df_sorted.iloc[i-1]['trend_type'],
                    'to_trend': df_sorted.iloc[i]['trend_type']
                })
        
        print(f"\n{name} - Quick trend changes (≤2 bars): {len(quick_changes)}")
        for change in quick_changes[:10]:  # Show first 10
            print(f"  Bars {change['from_bar']}->{change['to_bar']} (gap={change['gap']}): {change['from_trend']} -> {change['to_trend']}")
        
        return quick_changes
    
    og_quick = find_quick_changes(og_df, "Original")
    truth_quick = find_quick_changes(truth_df, "Truth")

def compare_specific_problem_areas(ohlc_df, og_df, truth_df):
    """Look at specific problem areas identified in the comparison"""
    print("\n=== SPECIFIC PROBLEM AREAS ===")
    
    # Early bars - Bar 1 is missed in original
    print("\nEarly detection (Bars 1-20):")
    early_og = og_df[og_df['bar_index'] <= 20].sort_values('bar_index')
    early_truth = truth_df[truth_df['bar_index'] <= 20].sort_values('bar_index')
    
    print("Original early trends:")
    for _, row in early_og.iterrows():
        print(f"  Bar {row['bar_index']}: {row['trend_type']} at {row['date']}")
    
    print("Truth early trends:")
    for _, row in early_truth.iterrows():
        print(f"  Bar {row['bar_index']}: {row['trend_type']} at {row['date']}")
    
    # Bar 18 has complex behavior
    print(f"\nBar 18 analysis (complex case):")
    bar18_og = og_df[og_df['bar_index'] == 18]
    bar18_truth = truth_df[truth_df['bar_index'] == 18]
    
    print("Original Bar 18:")
    for _, row in bar18_og.iterrows():
        print(f"  {row['trend_type']} at {row['date']}")
    
    print("Truth Bar 18:")
    for _, row in bar18_truth.iterrows():
        print(f"  {row['trend_type']} at {row['date']}")
    
    # Show price action for Bar 18
    analyze_price_context(ohlc_df, [18], "BAR 18 PRICE CONTEXT")

def main():
    print("=== PRICE ANALYSIS DEBUG ===")
    
    # Load all data
    ohlc_df, og_df, truth_df = load_data()
    
    print(f"Loaded {len(ohlc_df)} OHLC bars")
    print(f"Original trend starts: {len(og_df)}")
    print(f"Truth trend starts: {len(truth_df)}")
    
    # Analyze key differences
    analyze_key_differences(ohlc_df, og_df, truth_df)
    
    # Check alternation patterns
    analyze_alternation_pattern(ohlc_df, og_df, truth_df)
    
    # Look for quick trend changes
    analyze_early_trend_changes(ohlc_df, og_df, truth_df)
    
    # Examine specific problem areas
    compare_specific_problem_areas(ohlc_df, og_df, truth_df)

if __name__ == "__main__":
    main() 