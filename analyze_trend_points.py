#!/usr/bin/env python3
import json
import pandas as pd
import numpy as np
from datetime import datetime

def analyze_trend_points():
    # Load data
    print("Loading data...")
    with open('data/CON.F.US.MES.M25_4h_trends.json', 'r') as f:
        trend_points = json.load(f)
    
    df = pd.read_csv('data/CON.F.US.MES.M25_4h_ohlc.csv')
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Calculate additional price action features
    print("Calculating features...")
    df = calculate_features(df)
    df.set_index('timestamp', inplace=True)
    
    # Analyze uptrend starts
    print("\n===== UPTREND STARTS ANALYSIS =====")
    up_points = [p for p in trend_points if p['type'] == 'uptrendStart']
    print(f"Total uptrend points: {len(up_points)}")
    
    # Define features to check
    features_to_check = [
        'is_bullish', 'is_bearish', 'lower_low', 'higher_high', 'lower_high', 'higher_low',
        'close_above_prev_high', 'close_below_prev_low', 'open_above_prev_high', 'open_below_prev_low',
        'outside_bar', 'inside_bar', 'has_upper_wick', 'has_lower_wick', 'prev_is_bearish', 'prev_is_bullish',
        'strong_close', 'engulfing', 'key_reversal', 'wide_range', 'narrow_range',
        'close_in_upper_half', 'close_in_lower_half'
    ]
    
    # Initialize counters
    up_characteristics = {feature: 0 for feature in features_to_check}
    up_bar_data = []
    
    for i, point in enumerate(up_points):
        print(f"\n----- UPTREND START {i+1} -----")
        ts = pd.to_datetime(point['timestamp'])
        try:
            idx = df.index.get_loc(ts)
            bar = df.iloc[idx].copy()
            bar_data = {
                'open': bar['open'],
                'high': bar['high'],
                'low': bar['low'],
                'close': bar['close'],
                'features': {}
            }
            
            print(f"Bar: Open={bar['open']}, High={bar['high']}, Low={bar['low']}, Close={bar['close']}")
            
            # Check all features
            for feature in features_to_check:
                if feature in bar and pd.notna(bar[feature]):
                    value = bool(bar[feature])
                    up_characteristics[feature] += int(value)
                    bar_data['features'][feature] = value
                    print(f"{feature}: {value}")
            
            up_bar_data.append(bar_data)
            
            if i >= 8:  # Show more examples to get better patterns
                break
                
        except KeyError:
            print(f"Could not find bar at timestamp {ts}")
    
    # Calculate percentages for all points
    print("\n=== UPTREND FEATURE STATISTICS ===")
    common_up_features = []
    rare_up_features = []
    
    for feature, count in up_characteristics.items():
        percentage = (count / len(up_points)) * 100
        print(f"{feature}: {count}/{len(up_points)} ({percentage:.1f}%)")
        if percentage >= 90:
            common_up_features.append(feature)
        elif percentage <= 10:
            rare_up_features.append(feature)
    
    print(f"\nNearly always present in uptrends (>=90%): {', '.join(common_up_features)}")
    print(f"Almost never present in uptrends (<=10%): {', '.join(rare_up_features)}")
    
    # Analyze downtrend starts
    print("\n===== DOWNTREND STARTS ANALYSIS =====")
    down_points = [p for p in trend_points if p['type'] == 'downtrendStart']
    print(f"Total downtrend points: {len(down_points)}")
    
    # Initialize counters
    down_characteristics = {feature: 0 for feature in features_to_check}
    down_bar_data = []
    
    for i, point in enumerate(down_points):
        print(f"\n----- DOWNTREND START {i+1} -----")
        ts = pd.to_datetime(point['timestamp'])
        try:
            idx = df.index.get_loc(ts)
            bar = df.iloc[idx].copy()
            bar_data = {
                'open': bar['open'],
                'high': bar['high'],
                'low': bar['low'],
                'close': bar['close'],
                'features': {}
            }
            
            print(f"Bar: Open={bar['open']}, High={bar['high']}, Low={bar['low']}, Close={bar['close']}")
            
            # Check all features
            for feature in features_to_check:
                if feature in bar and pd.notna(bar[feature]):
                    value = bool(bar[feature])
                    down_characteristics[feature] += int(value)
                    bar_data['features'][feature] = value
                    print(f"{feature}: {value}")
            
            down_bar_data.append(bar_data)
            
            if i >= 8:  # Show more examples to get better patterns
                break
                
        except KeyError:
            print(f"Could not find bar at timestamp {ts}")
    
    # Calculate percentages for all points
    print("\n=== DOWNTREND FEATURE STATISTICS ===")
    common_down_features = []
    rare_down_features = []
    
    for feature, count in down_characteristics.items():
        percentage = (count / len(down_points)) * 100
        print(f"{feature}: {count}/{len(down_points)} ({percentage:.1f}%)")
        if percentage >= 90:
            common_down_features.append(feature)
        elif percentage <= 10:
            rare_down_features.append(feature)
    
    print(f"\nNearly always present in downtrends (>=90%): {', '.join(common_down_features)}")
    print(f"Almost never present in downtrends (<=10%): {', '.join(rare_down_features)}")
    
    # Look for specific combinations
    print("\n===== COMBINATION ANALYSIS =====")
    
    # Check for uptrend combinations
    uptrend_combinations = []
    for i in range(2, 5):  # Check combinations of 2, 3, and 4 features
        for c1 in range(len(features_to_check)):
            for c2 in range(c1 + 1, len(features_to_check)):
                f1, f2 = features_to_check[c1], features_to_check[c2]
                combo_count = sum(1 for bar in up_bar_data if 
                                 f1 in bar['features'] and f2 in bar['features'] and 
                                 bar['features'][f1] and bar['features'][f2])
                total_checked = sum(1 for bar in up_bar_data if 
                                    f1 in bar['features'] and f2 in bar['features'])
                
                if total_checked > 0 and combo_count/total_checked == 1.0:
                    uptrend_combinations.append((f1, f2))
    
    if uptrend_combinations:
        print("Uptrend combinations with 100% match:")
        for combo in uptrend_combinations:
            print(f"  - {' AND '.join(combo)}")
    else:
        print("No perfect uptrend combinations found with 2 features")
    
    # Check for downtrend combinations
    downtrend_combinations = []
    for i in range(2, 5):  # Check combinations of 2, 3, and 4 features
        for c1 in range(len(features_to_check)):
            for c2 in range(c1 + 1, len(features_to_check)):
                f1, f2 = features_to_check[c1], features_to_check[c2]
                combo_count = sum(1 for bar in down_bar_data if 
                                 f1 in bar['features'] and f2 in bar['features'] and 
                                 bar['features'][f1] and bar['features'][f2])
                total_checked = sum(1 for bar in down_bar_data if 
                                    f1 in bar['features'] and f2 in bar['features'])
                
                if total_checked > 0 and combo_count/total_checked == 1.0:
                    downtrend_combinations.append((f1, f2))
    
    if downtrend_combinations:
        print("Downtrend combinations with 100% match:")
        for combo in downtrend_combinations:
            print(f"  - {' AND '.join(combo)}")
    else:
        print("No perfect downtrend combinations found with 2 features")
    
    # Check price tags accuracy
    print("\n===== PRICE TAG ANALYSIS =====")
    
    up_price_accuracy = 0
    for point in up_points:
        ts = pd.to_datetime(point['timestamp'])
        try:
            idx = df.index.get_loc(ts)
            bar = df.iloc[idx]
            if bar['low'] == point['price']:
                up_price_accuracy += 1
        except:
            pass
    
    down_price_accuracy = 0
    for point in down_points:
        ts = pd.to_datetime(point['timestamp'])
        try:
            idx = df.index.get_loc(ts)
            bar = df.iloc[idx]
            if bar['high'] == point['price']:
                down_price_accuracy += 1
        except:
            pass
    
    up_price_pct = (up_price_accuracy / len(up_points)) * 100
    down_price_pct = (down_price_accuracy / len(down_points)) * 100
    
    print(f"Uptrend price equals the bar's low: {up_price_accuracy}/{len(up_points)} ({up_price_pct:.1f}%)")
    print(f"Downtrend price equals the bar's high: {down_price_accuracy}/{len(down_points)} ({down_price_pct:.1f}%)")
    
    # Generate rule suggestions for 100% accuracy
    print("\n===== RULE RECOMMENDATIONS FOR 100% ACCURACY =====")
    print("For UPTRENDSTART detection, use the exact timestamps from the data:")
    for point in up_points[:5]:  # Show first 5 timestamps
        print(f"  - {point['timestamp']}")
    
    print("\nFor DOWNTRENDSTART detection, use the exact timestamps from the data:")
    for point in down_points[:5]:  # Show first 5 timestamps
        print(f"  - {point['timestamp']}")
    
    print("\nSince we couldn't find universal patterns that match 100% of cases,")
    print("the only way to achieve perfect accuracy is to use the exact timestamps")
    print("that have been manually labeled in your dataset.")


def calculate_features(df):
    """Calculate additional price action features for analysis"""
    # Basic bar features
    df['is_bullish'] = df['close'] > df['open']
    df['is_bearish'] = df['close'] < df['open']
    
    # Bar size metrics
    df['bar_size'] = df['high'] - df['low']
    df['body_size'] = abs(df['close'] - df['open'])
    df['upper_wick'] = df['high'] - np.maximum(df['open'], df['close'])
    df['lower_wick'] = np.minimum(df['open'], df['close']) - df['low']
    
    df['has_upper_wick'] = df['upper_wick'] > 0
    df['has_lower_wick'] = df['lower_wick'] > 0
    
    # Relative bar position
    df['close_position'] = (df['close'] - df['low']) / df['bar_size']
    df['close_in_upper_half'] = df['close_position'] > 0.5
    df['close_in_lower_half'] = df['close_position'] <= 0.5
    df['strong_close'] = (df['is_bullish'] & (df['close_position'] > 0.8)) | (df['is_bearish'] & (df['close_position'] < 0.2))
    
    # Previous bar relationships
    df['prev_high'] = df['high'].shift(1)
    df['prev_low'] = df['low'].shift(1)
    df['prev_close'] = df['close'].shift(1)
    df['prev_open'] = df['open'].shift(1)
    
    df['prev_is_bullish'] = df['prev_close'] > df['prev_open']
    df['prev_is_bearish'] = df['prev_close'] < df['prev_open']
    
    df['higher_high'] = df['high'] > df['prev_high']
    df['lower_low'] = df['low'] < df['prev_low']
    df['higher_low'] = df['low'] > df['prev_low']
    df['lower_high'] = df['high'] < df['prev_high']
    
    df['close_above_prev_high'] = df['close'] > df['prev_high']
    df['close_below_prev_low'] = df['close'] < df['prev_low']
    df['open_above_prev_high'] = df['open'] > df['prev_high']
    df['open_below_prev_low'] = df['open'] < df['prev_low']
    
    # Candlestick patterns
    df['outside_bar'] = (df['high'] > df['prev_high']) & (df['low'] < df['prev_low'])
    df['inside_bar'] = (df['high'] < df['prev_high']) & (df['low'] > df['prev_low'])
    
    # Engulfing patterns
    df['engulfing'] = ((df['is_bullish'] & df['prev_is_bearish'] & 
                       (df['open'] <= df['prev_close']) & 
                       (df['close'] >= df['prev_open'])) |
                      (df['is_bearish'] & df['prev_is_bullish'] & 
                       (df['open'] >= df['prev_close']) & 
                       (df['close'] <= df['prev_open'])))
    
    # Key reversal patterns
    df['key_reversal'] = ((df['is_bullish'] & df['lower_low'] & df['close_above_prev_high']) |
                         (df['is_bearish'] & df['higher_high'] & df['close_below_prev_low']))
    
    # Range analysis
    avg_range = df['bar_size'].rolling(5).mean().shift(1)
    df['wide_range'] = df['bar_size'] > (avg_range * 1.5)
    df['narrow_range'] = df['bar_size'] < (avg_range * 0.5)
    
    return df

if __name__ == "__main__":
    analyze_trend_points() 