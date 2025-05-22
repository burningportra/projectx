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
    
    return ohlc_df, truth_df

def analyze_respect_rejection_types(ohlc_df, bar_index, context_bars=5):
    """Analyze different types of OHLC respect/rejection patterns around a specific bar"""
    
    start_idx = max(0, bar_index - context_bars - 1)
    end_idx = min(len(ohlc_df), bar_index + context_bars)
    context = ohlc_df.iloc[start_idx:end_idx].copy()
    
    target_bar = context[context['bar_index'] == bar_index].iloc[0]
    
    print(f"\n=== OHLC Respect/Rejection Analysis - Bar {bar_index} ===")
    
    # 1. INTRABAR PATTERNS (within the bar itself)
    print("1. INTRABAR PATTERNS:")
    
    # High rejection pattern (bearish reversal)
    high_to_close_rejection = target_bar['high'] - target_bar['close']
    high_rejection_ratio = high_to_close_rejection / (target_bar['high'] - target_bar['low'])
    print(f"   High Rejection: {high_to_close_rejection:.2f} pts ({high_rejection_ratio:.1%} of range)")
    if high_rejection_ratio > 0.7:
        print("   >>> STRONG HIGH REJECTION (bearish reversal signal)")
    elif high_rejection_ratio > 0.4:
        print("   >>> MODERATE HIGH REJECTION")
    
    # Low rejection pattern (bullish reversal) 
    low_to_close_respect = target_bar['close'] - target_bar['low']
    low_respect_ratio = low_to_close_respect / (target_bar['high'] - target_bar['low'])
    print(f"   Low Respect: {low_to_close_respect:.2f} pts ({low_respect_ratio:.1%} of range)")
    if low_respect_ratio > 0.7:
        print("   >>> STRONG LOW RESPECT (bullish reversal signal)")
    elif low_respect_ratio > 0.4:
        print("   >>> MODERATE LOW RESPECT")
    
    # 2. INTERBAR RESPECT/REJECTION (with previous bar)
    if bar_index > 1:
        prev_bar = context[context['bar_index'] == bar_index - 1].iloc[0]
        print(f"\n2. INTERBAR RESPECT/REJECTION vs Bar {bar_index-1}:")
        
        # High respect/rejection analysis
        if target_bar['high'] > prev_bar['high']:
            high_breakout = target_bar['high'] - prev_bar['high']
            close_vs_prev_high = target_bar['close'] - prev_bar['high']
            print(f"   High Breakout: +{high_breakout:.2f} pts")
            if close_vs_prev_high > 0:
                print(f"   >>> HIGH REJECTION: Broke +{high_breakout:.2f} but closed +{close_vs_prev_high:.2f} above")
            else:
                print(f"   >>> HIGH RESPECT: Broke +{high_breakout:.2f} but closed {close_vs_prev_high:.2f} below (failed breakout)")
        else:
            print(f"   High Respect: Stayed {prev_bar['high'] - target_bar['high']:.2f} pts below prev high")
        
        # Low respect/rejection analysis  
        if target_bar['low'] < prev_bar['low']:
            low_breakdown = prev_bar['low'] - target_bar['low']
            close_vs_prev_low = target_bar['close'] - prev_bar['low']
            print(f"   Low Breakdown: -{low_breakdown:.2f} pts")
            if close_vs_prev_low < 0:
                print(f"   >>> LOW REJECTION: Broke -{low_breakdown:.2f} and closed {close_vs_prev_low:.2f} below")
            else:
                print(f"   >>> LOW RESPECT: Broke -{low_breakdown:.2f} but closed +{close_vs_prev_low:.2f} above (failed breakdown)")
        else:
            print(f"   Low Respect: Stayed {target_bar['low'] - prev_bar['low']:.2f} pts above prev low")
            
    # 3. OHLC RELATIONSHIP PATTERNS
    print(f"\n3. OHLC RELATIONSHIP PATTERNS:")
    
    if bar_index > 1:
        # Higher/Lower OHLC analysis
        higher_open = target_bar['open'] > prev_bar['open']
        higher_high = target_bar['high'] > prev_bar['high'] 
        higher_low = target_bar['low'] > prev_bar['low']
        higher_close = target_bar['close'] > prev_bar['close']
        
        ohlc_pattern = ""
        if all([higher_open, higher_high, higher_low, higher_close]):
            ohlc_pattern = "COMPLETE HIGHER OHLC (strong bullish)"
        elif all([not higher_open, not higher_high, not higher_low, not higher_close]):
            ohlc_pattern = "COMPLETE LOWER OHLC (strong bearish)"
        elif higher_high and higher_low:
            ohlc_pattern = "HIGHER HIGH & LOW (upward shift)"
        elif not higher_high and not higher_low:
            ohlc_pattern = "LOWER HIGH & LOW (downward shift)"
        elif higher_high and not higher_low:
            ohlc_pattern = "OUTSIDE BAR (higher high, lower low)"
        elif not higher_high and higher_low:
            ohlc_pattern = "INSIDE BAR (lower high, higher low)"
        
        print(f"   OHLC vs Prev: O{'+' if higher_open else '-'} H{'+' if higher_high else '-'} L{'+' if higher_low else '-'} C{'+' if higher_close else '-'}")
        print(f"   Pattern: {ohlc_pattern}")
        
        # Strength analysis
        if ohlc_pattern.startswith("COMPLETE"):
            body_strength = abs(target_bar['close'] - target_bar['open'])
            range_strength = target_bar['high'] - target_bar['low']
            body_ratio = body_strength / range_strength
            print(f"   Body Strength: {body_ratio:.1%} of range")
            if body_ratio > 0.6:
                print("   >>> STRONG CONVICTION MOVE")
            elif body_ratio < 0.2:
                print("   >>> WEAK/INDECISIVE MOVE")

def analyze_key_level_interactions(ohlc_df, bar_index, lookback=10):
    """Analyze how price interacts with key levels (previous highs/lows)"""
    
    print(f"\n4. KEY LEVEL INTERACTIONS (Bar {bar_index}):")
    
    # Get recent context
    start_idx = max(0, bar_index - lookback - 1)
    context = ohlc_df.iloc[start_idx:bar_index].copy()
    target_bar = ohlc_df.iloc[bar_index - 1]  # Convert to 0-indexed
    
    # Find recent significant highs and lows
    recent_highs = []
    recent_lows = []
    
    for i in range(len(context) - 2):  # Skip last bar (current)
        bar = context.iloc[i]
        prev_bar = context.iloc[i-1] if i > 0 else None
        next_bar = context.iloc[i+1] if i < len(context)-1 else None
        
        # Local high detection
        if prev_bar is not None and next_bar is not None:
            if bar['high'] > prev_bar['high'] and bar['high'] > next_bar['high']:
                recent_highs.append((bar['bar_index'], bar['high']))
        
        # Local low detection  
        if prev_bar is not None and next_bar is not None:
            if bar['low'] < prev_bar['low'] and bar['low'] < next_bar['low']:
                recent_lows.append((bar['bar_index'], bar['low']))
    
    # Analyze interactions with recent highs
    print(f"   Recent Significant Highs: {[f'Bar {idx}: {price:.2f}' for idx, price in recent_highs[-3:]]}")
    for high_bar_idx, high_price in recent_highs[-3:]:  # Last 3 highs
        distance_to_high = target_bar['high'] - high_price
        close_to_high = target_bar['close'] - high_price
        
        if abs(distance_to_high) < 5.0:  # Within 5 points
            if distance_to_high > 0:
                if close_to_high > 0:
                    print(f"   >>> HIGH REJECTION: Broke Bar {high_bar_idx} high (+{distance_to_high:.2f}) and held (+{close_to_high:.2f})")
                else:
                    print(f"   >>> HIGH RESPECT: Touched Bar {high_bar_idx} high (+{distance_to_high:.2f}) but closed below ({close_to_high:.2f})")
            else:
                print(f"   >>> HIGH RESPECT: Stayed {distance_to_high:.2f} below Bar {high_bar_idx} high")
    
    # Analyze interactions with recent lows
    print(f"   Recent Significant Lows: {[f'Bar {idx}: {price:.2f}' for idx, price in recent_lows[-3:]]}")
    for low_bar_idx, low_price in recent_lows[-3:]:  # Last 3 lows
        distance_to_low = target_bar['low'] - low_price
        close_to_low = target_bar['close'] - low_price
        
        if abs(distance_to_low) < 5.0:  # Within 5 points
            if distance_to_low < 0:
                if close_to_low < 0:
                    print(f"   >>> LOW REJECTION: Broke Bar {low_bar_idx} low ({distance_to_low:.2f}) and held ({close_to_low:.2f})")
                else:
                    print(f"   >>> LOW RESPECT: Touched Bar {low_bar_idx} low ({distance_to_low:.2f}) but closed above (+{close_to_low:.2f})")
            else:
                print(f"   >>> LOW RESPECT: Stayed +{distance_to_low:.2f} above Bar {low_bar_idx} low")

def analyze_sequence_patterns(ohlc_df, bar_index, sequence_length=5):
    """Analyze respect/rejection patterns over a sequence of bars"""
    
    print(f"\n5. SEQUENCE RESPECT/REJECTION PATTERNS:")
    
    start_idx = max(0, bar_index - sequence_length)
    end_idx = min(len(ohlc_df), bar_index + 1)
    sequence = ohlc_df.iloc[start_idx:end_idx].copy()
    
    # Trend consistency analysis
    higher_highs = 0
    lower_lows = 0
    higher_closes = 0
    lower_closes = 0
    
    for i in range(1, len(sequence)):
        curr = sequence.iloc[i]
        prev = sequence.iloc[i-1]
        
        if curr['high'] > prev['high']:
            higher_highs += 1
        if curr['low'] < prev['low']:
            lower_lows += 1
        if curr['close'] > prev['close']:
            higher_closes += 1
        else:
            lower_closes += 1
    
    total_bars = len(sequence) - 1
    
    print(f"   Sequence Analysis (last {total_bars} bars):")
    print(f"   Higher Highs: {higher_highs}/{total_bars} ({higher_highs/total_bars:.1%})")
    print(f"   Lower Lows: {lower_lows}/{total_bars} ({lower_lows/total_bars:.1%})")
    print(f"   Higher Closes: {higher_closes}/{total_bars} ({higher_closes/total_bars:.1%})")
    
    # Pattern classification
    if higher_highs >= total_bars * 0.8 and higher_closes >= total_bars * 0.7:
        print("   >>> STRONG UPTREND SEQUENCE (respecting upward momentum)")
    elif lower_lows >= total_bars * 0.8 and lower_closes >= total_bars * 0.7:
        print("   >>> STRONG DOWNTREND SEQUENCE (respecting downward momentum)")
    elif higher_highs == 0 and lower_lows == 0:
        print("   >>> CONSOLIDATION SEQUENCE (respecting range bounds)")
    else:
        print("   >>> MIXED/CHOPPY SEQUENCE (conflicting respect/rejection)")

def analyze_truth_signals_ohlc_patterns(ohlc_df, truth_df):
    """Analyze what OHLC patterns characterize the truth signals"""
    
    print("\n" + "="*80)
    print("TRUTH SIGNAL OHLC PATTERN ANALYSIS")
    print("="*80)
    
    # Analyze first few truth signals in detail
    truth_bars = truth_df['bar_index'].tolist()[:8]  # First 8 truth signals
    
    for bar_idx in truth_bars:
        trend_type = truth_df[truth_df['bar_index'] == bar_idx]['trend_type'].iloc[0]
        
        print(f"\n{'='*60}")
        print(f"TRUTH SIGNAL: Bar {bar_idx} - {trend_type.upper()}")
        print(f"{'='*60}")
        
        # Full respect/rejection analysis
        analyze_respect_rejection_types(ohlc_df, bar_idx, context_bars=3)
        analyze_key_level_interactions(ohlc_df, bar_idx, lookback=8)
        analyze_sequence_patterns(ohlc_df, bar_idx, sequence_length=4)

def compare_true_vs_false_signals(ohlc_df, truth_df):
    """Compare OHLC patterns of true signals vs common false positives"""
    
    print("\n" + "="*80)
    print("TRUE vs FALSE SIGNAL OHLC COMPARISON")
    print("="*80)
    
    # Common false positive bars from our previous analysis
    false_positives = [9, 10, 18, 20, 36, 51, 69, 71]
    true_signals = truth_df['bar_index'].tolist()[:4]
    
    print("ANALYZING FALSE POSITIVES:")
    for bar_idx in false_positives[:3]:
        print(f"\n--- FALSE POSITIVE: Bar {bar_idx} ---")
        analyze_respect_rejection_types(ohlc_df, bar_idx, context_bars=2)
    
    print("\nANALYZING TRUE SIGNALS:")  
    for bar_idx in true_signals[:3]:
        trend_type = truth_df[truth_df['bar_index'] == bar_idx]['trend_type'].iloc[0]
        print(f"\n--- TRUE SIGNAL: Bar {bar_idx} ({trend_type}) ---")
        analyze_respect_rejection_types(ohlc_df, bar_idx, context_bars=2)

def main():
    print("="*80)
    print("COMPREHENSIVE OHLC RESPECT/REJECTION ANALYSIS")
    print("="*80)
    
    ohlc_df, truth_df = load_data()
    
    # Analyze truth signals to understand correct patterns
    analyze_truth_signals_ohlc_patterns(ohlc_df, truth_df)
    
    # Compare true vs false patterns
    compare_true_vs_false_signals(ohlc_df, truth_df)
    
    print("\n" + "="*80)
    print("ANALYSIS COMPLETE - KEY OHLC RESPECT/REJECTION INSIGHTS")
    print("="*80)

if __name__ == "__main__":
    main() 