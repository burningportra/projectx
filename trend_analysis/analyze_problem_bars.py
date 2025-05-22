#!/usr/bin/env python3

import pandas as pd
import numpy as np

def load_data():
    """Load OHLC and trend data"""
    # Load OHLC data
    ohlc_df = pd.read_csv('trend_analysis/data/CON.F.US.MES.M25_4h_ohlc.csv')
    ohlc_df['timestamp'] = pd.to_datetime(ohlc_df['timestamp'])
    ohlc_df.reset_index(drop=True, inplace=True)
    ohlc_df['bar_index'] = range(1, len(ohlc_df) + 1)
    
    # Load current results
    current_df = pd.read_csv('trend_analysis/confirmed_trend_starts.csv')
    current_df['date'] = pd.to_datetime(current_df['date'])
    
    # Load truth data
    truth_df = pd.read_csv('trend_analysis/confirmed_trend_starts_4h_truth.csv')
    truth_df.columns = ['trend_type', 'bar_index', 'date']
    truth_df['date'] = pd.to_datetime(truth_df['date'])
    
    return ohlc_df, current_df, truth_df

def analyze_comprehensive_bar_context(ohlc_df, bar_index, title, context_bars=7):
    """Show comprehensive price context around a specific bar with price analysis"""
    print(f"\n=== {title} - Bar {bar_index} ===")
    
    # Get wider context around this bar
    start_idx = max(0, bar_index - context_bars - 1)
    end_idx = min(len(ohlc_df), bar_index + context_bars)
    
    context = ohlc_df.iloc[start_idx:end_idx].copy()
    context['is_target'] = context['bar_index'] == bar_index
    
    # Add price change calculations
    context['close_change'] = context['close'].diff()
    context['close_change_pct'] = context['close'].pct_change() * 100
    context['high_vs_prev_high'] = context['high'].diff()
    context['low_vs_prev_low'] = context['low'].diff()
    context['range_size'] = context['high'] - context['low']
    
    print("Extended OHLC Context:")
    for i, row in context.iterrows():
        marker = ">>> " if row['is_target'] else "    "
        close_chg = f"{row['close_change']:+6.2f}" if not pd.isna(row['close_change']) else "   ---"
        close_pct = f"({row['close_change_pct']:+5.1f}%)" if not pd.isna(row['close_change_pct']) else "     ---"
        range_sz = f"R:{row['range_size']:5.2f}"
        
        print(f"{marker}Bar {row['bar_index']:3d}: O={row['open']:7.2f} H={row['high']:7.2f} L={row['low']:7.2f} C={row['close']:7.2f} "
              f"| {close_chg} {close_pct} {range_sz} | {row['timestamp']}")
    
    # Additional price relationship analysis for the target bar
    if bar_index <= len(ohlc_df):
        target_bar = context[context['is_target']].iloc[0]
        
        print(f"\nPrice Analysis for Bar {bar_index}:")
        print(f"  Bar Range: {target_bar['range_size']:.2f} points")
        print(f"  Open to Close: {target_bar['close'] - target_bar['open']:+.2f} points")
        print(f"  Close Change: {target_bar['close_change']:+.2f} points ({target_bar['close_change_pct']:+.1f}%)")
        
        if bar_index > 1:
            prev_bar = context[context['bar_index'] == bar_index - 1].iloc[0]
            print(f"  High vs Prev High: {target_bar['high'] - prev_bar['high']:+.2f}")
            print(f"  Low vs Prev Low: {target_bar['low'] - prev_bar['low']:+.2f}")
            print(f"  Close vs Prev Open: {target_bar['close'] - prev_bar['open']:+.2f}")
            print(f"  Close vs Prev Close: {target_bar['close'] - prev_bar['close']:+.2f}")
            
            # Pattern recognition
            patterns = []
            if target_bar['high'] > prev_bar['high'] and target_bar['low'] > prev_bar['low']:
                patterns.append("Higher High & Higher Low")
            elif target_bar['high'] < prev_bar['high'] and target_bar['low'] < prev_bar['low']:
                patterns.append("Lower High & Lower Low")
            elif target_bar['high'] > prev_bar['high'] and target_bar['low'] < prev_bar['low']:
                patterns.append("Outside Bar (Higher High & Lower Low)")
            elif target_bar['high'] < prev_bar['high'] and target_bar['low'] > prev_bar['low']:
                patterns.append("Inside Bar (Lower High & Higher Low)")
            
            if target_bar['close'] > target_bar['open']:
                patterns.append("Bullish Close")
            elif target_bar['close'] < target_bar['open']:
                patterns.append("Bearish Close")
            else:
                patterns.append("Doji")
                
            if patterns:
                print(f"  Pattern: {' + '.join(patterns)}")

def analyze_consecutive_false_positives(ohlc_df, current_df, truth_df):
    """Analyze the worst consecutive false positive areas with extensive price context"""
    print("\n=== CONSECUTIVE FALSE POSITIVE ANALYSIS ===")
    
    # Problem areas with many consecutive same trends
    problem_areas = [
        (9, 10, "Early consecutive downtrends"),
        (20, 23, "Mid-March consecutive downtrends"),
        (69, 75, "April consecutive downtrends"),
        (95, 99, "April overdetection cluster"),
        (217, 220, "May consecutive downtrends")
    ]
    
    for start_bar, end_bar, description in problem_areas:
        print(f"\n{'='*80}")
        print(f"PROBLEM AREA: {description} (Bars {start_bar}-{end_bar})")
        print(f"{'='*80}")
        
        # Show current vs truth for this range
        range_current = current_df[
            (current_df['bar_index'] >= start_bar) & 
            (current_df['bar_index'] <= end_bar)
        ].sort_values('bar_index')
        
        range_truth = truth_df[
            (truth_df['bar_index'] >= start_bar) & 
            (truth_df['bar_index'] <= end_bar)
        ].sort_values('bar_index')
        
        print("Current algorithm detections:")
        for _, row in range_current.iterrows():
            print(f"  Bar {row['bar_index']}: {row['trend_start_type']}")
        
        print("Truth data detections:")
        if len(range_truth) > 0:
            for _, row in range_truth.iterrows():
                print(f"  Bar {row['bar_index']}: {row['trend_type']}")
        else:
            print("  None - No trend signals in this range")
        
        # Show comprehensive price context for the entire range
        print(f"\nComprehensive Price Analysis for {description}:")
        analyze_comprehensive_bar_context(ohlc_df, start_bar, f"Start of {description}", context_bars=5)
        
        if end_bar != start_bar:
            analyze_comprehensive_bar_context(ohlc_df, end_bar, f"End of {description}", context_bars=5)
        
        # Show the price progression through the problem area
        problem_range = ohlc_df[(ohlc_df['bar_index'] >= start_bar - 3) & 
                               (ohlc_df['bar_index'] <= end_bar + 3)].copy()
        
        print(f"\nPrice progression through problem area:")
        print("Bar | Open    | High    | Low     | Close   | Change  | %Chg   | Pattern")
        print("-" * 80)
        
        prev_close = None
        for idx, (_, row) in enumerate(problem_range.iterrows()):
            if prev_close is not None:
                change = row['close'] - prev_close
                pct_change = (change / prev_close) * 100
                
                # Simple pattern detection
                pattern = ""
                prev_row = problem_range.iloc[idx-1]
                if row['high'] > prev_row['high'] and row['low'] > prev_row['low']:
                    pattern = "HH+HL"
                elif row['high'] < prev_row['high'] and row['low'] < prev_row['low']:
                    pattern = "LH+LL"
                elif row['high'] > prev_row['high'] and row['low'] < prev_row['low']:
                    pattern = "Outside"
                elif row['high'] < prev_row['high'] and row['low'] > prev_row['low']:
                    pattern = "Inside"
                
                marker = "***" if start_bar <= row['bar_index'] <= end_bar else "   "
            else:
                change = 0
                pct_change = 0
                pattern = "Start"
                marker = "   "
            
            print(f"{marker}{row['bar_index']:3d} | {row['open']:7.2f} | {row['high']:7.2f} | "
                  f"{row['low']:7.2f} | {row['close']:7.2f} | {change:+6.2f} | {pct_change:+5.1f}% | {pattern}")
            
            prev_close = row['close']

def analyze_critical_missed_bars(ohlc_df, current_df, truth_df):
    """Analyze the most critical missed detections with comprehensive price context"""
    print("\n" + "="*80)
    print("CRITICAL MISSED DETECTIONS ANALYSIS")
    print("="*80)
    
    # Bars that truth has but current missed
    missed_bars = [42, 52, 86, 131, 141, 143, 176, 199, 219]
    
    for bar_idx in missed_bars[:6]:  # Show more bars
        # Get truth entry for this bar
        truth_entry = truth_df[truth_df['bar_index'] == bar_idx]
        if not truth_entry.empty:
            trend_type = truth_entry.iloc[0]['trend_type']
            print(f"\n{'='*60}")
            print(f"MISSED SIGNAL: Bar {bar_idx} should be {trend_type.upper()}")
            print(f"{'='*60}")
            
            # Show comprehensive price context
            analyze_comprehensive_bar_context(ohlc_df, bar_idx, f"Missed {trend_type}", context_bars=8)
            
            # Show what current algorithm detected nearby
            nearby_current = current_df[
                (current_df['bar_index'] >= bar_idx - 5) & 
                (current_df['bar_index'] <= bar_idx + 5)
            ].sort_values('bar_index')
            
            print(f"\nNearby current algorithm detections (±5 bars):")
            if len(nearby_current) > 0:
                for _, row in nearby_current.iterrows():
                    distance = row['bar_index'] - bar_idx
                    print(f"  Bar {row['bar_index']}: {row['trend_start_type']} (distance: {distance:+d})")
            else:
                print("  None - No detections in nearby range")
            
            # Analyze why this signal was missed
            print(f"\nWhy was this {trend_type} signal missed?")
            
            # Get the bar and surrounding context for analysis
            target_bar = ohlc_df[ohlc_df['bar_index'] == bar_idx].iloc[0]
            
            if bar_idx > 1:
                prev_bar = ohlc_df[ohlc_df['bar_index'] == bar_idx - 1].iloc[0]
                
                if trend_type == 'uptrend':
                    print(f"  Expected UPTREND indicators:")
                    print(f"    - High vs Prev: {target_bar['high'] - prev_bar['high']:+.2f} (should be higher)")
                    print(f"    - Low vs Prev: {target_bar['low'] - prev_bar['low']:+.2f} (context dependent)")
                    print(f"    - Close vs Prev: {target_bar['close'] - prev_bar['close']:+.2f} (bullish recovery)")
                    print(f"    - Close vs Open: {target_bar['close'] - target_bar['open']:+.2f} (bar direction)")
                else:  # downtrend
                    print(f"  Expected DOWNTREND indicators:")
                    print(f"    - High vs Prev: {target_bar['high'] - prev_bar['high']:+.2f} (context dependent)")
                    print(f"    - Low vs Prev: {target_bar['low'] - prev_bar['low']:+.2f} (should be lower)")
                    print(f"    - Close vs Prev: {target_bar['close'] - prev_bar['close']:+.2f} (bearish pressure)")
                    print(f"    - Close vs Open: {target_bar['close'] - target_bar['open']:+.2f} (bar direction)")

def analyze_trend_type_conflicts(ohlc_df, current_df, truth_df):
    """Analyze bars where trend types don't match with detailed price context"""
    print("\n" + "="*80)
    print("TREND TYPE CONFLICTS ANALYSIS")
    print("="*80)
    
    # Known conflicts from previous analysis
    conflicts = [
        (18, "Current=downtrend, Truth=uptrend+downtrend"),
        (71, "Current=downtrend, Truth=uptrend"),
        (119, "Current=downtrend, Truth=uptrend"),
        (190, "Current=downtrend, Truth=uptrend"),
        (227, "Current=downtrend, Truth=uptrend+downtrend")
    ]
    
    for bar_idx, description in conflicts[:4]:  # Show more conflicts
        print(f"\n{'='*60}")
        print(f"CONFLICT: Bar {bar_idx} - {description}")
        print(f"{'='*60}")
        
        # Show comprehensive price context
        analyze_comprehensive_bar_context(ohlc_df, bar_idx, f"Conflict at Bar {bar_idx}", context_bars=8)
        
        # Show current detection
        current_entries = current_df[current_df['bar_index'] == bar_idx]
        print(f"\nCurrent algorithm detections:")
        for _, row in current_entries.iterrows():
            print(f"  {row['trend_start_type']}")
        
        # Show truth detection
        truth_entries = truth_df[truth_df['bar_index'] == bar_idx]
        print(f"Truth data detections:")
        for _, row in truth_entries.iterrows():
            print(f"  {row['trend_type']}")
        
        # Analyze the conflict
        print(f"\nConflict Analysis:")
        target_bar = ohlc_df[ohlc_df['bar_index'] == bar_idx].iloc[0]
        
        if bar_idx > 1:
            prev_bar = ohlc_df[ohlc_df['bar_index'] == bar_idx - 1].iloc[0]
            
            print(f"  Price evidence for UPTREND:")
            print(f"    - Recovery pattern: Close ({target_bar['close']:.2f}) vs Low ({target_bar['low']:.2f}) = {target_bar['close'] - target_bar['low']:+.2f}")
            print(f"    - Strength: High ({target_bar['high']:.2f}) vs Prev High ({prev_bar['high']:.2f}) = {target_bar['high'] - prev_bar['high']:+.2f}")
            print(f"    - Momentum: Close vs Prev Close = {target_bar['close'] - prev_bar['close']:+.2f}")
            
            print(f"  Price evidence for DOWNTREND:")
            print(f"    - Rejection pattern: High ({target_bar['high']:.2f}) vs Close ({target_bar['close']:.2f}) = {target_bar['high'] - target_bar['close']:+.2f}")
            print(f"    - Weakness: Low ({target_bar['low']:.2f}) vs Prev Low ({prev_bar['low']:.2f}) = {target_bar['low'] - prev_bar['low']:+.2f}")
            print(f"    - Bearish close: Open ({target_bar['open']:.2f}) vs Close ({target_bar['close']:.2f}) = {target_bar['open'] - target_bar['close']:+.2f}")

def analyze_early_detection_issues(ohlc_df, current_df, truth_df):
    """Focus on early bars where patterns diverge with comprehensive analysis"""
    print("\n" + "="*80)
    print("EARLY DETECTION ISSUES ANALYSIS")
    print("="*80)
    
    # Compare first 30 bars
    early_range = range(1, 31)
    
    differences_found = 0
    for bar_idx in early_range:
        current_entries = current_df[current_df['bar_index'] == bar_idx]
        truth_entries = truth_df[truth_df['bar_index'] == bar_idx]
        
        current_trends = [row['trend_start_type'] for _, row in current_entries.iterrows()]
        truth_trends = [row['trend_type'] for _, row in truth_entries.iterrows()]
        
        if set(current_trends) != set(truth_trends):
            differences_found += 1
            print(f"\nEarly Difference #{differences_found} - Bar {bar_idx}:")
            print(f"  Current: {current_trends}")
            print(f"  Truth:   {truth_trends}")
            
            # Show comprehensive price action for significant differences
            if len(current_trends) != len(truth_trends) or (current_trends and truth_trends and current_trends[0] != truth_trends[0]):
                analyze_comprehensive_bar_context(ohlc_df, bar_idx, f"Early difference at Bar {bar_idx}", context_bars=6)
                
            if differences_found >= 3:  # Show first 3 major differences
                break

def main():
    print("="*80)
    print("ENHANCED PROBLEM BAR ANALYSIS WITH COMPREHENSIVE PRICE CONTEXT")
    print("="*80)
    
    # Load data
    ohlc_df, current_df, truth_df = load_data()
    
    print(f"Loaded {len(ohlc_df)} OHLC bars")
    print(f"Current algorithm detected {len(current_df)} trend signals")
    print(f"Truth data has {len(truth_df)} trend signals")
    
    # Analyze different types of problems with enhanced context
    analyze_consecutive_false_positives(ohlc_df, current_df, truth_df)
    analyze_critical_missed_bars(ohlc_df, current_df, truth_df)
    analyze_trend_type_conflicts(ohlc_df, current_df, truth_df)
    analyze_early_detection_issues(ohlc_df, current_df, truth_df)
    
    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main() 