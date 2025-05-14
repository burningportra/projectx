import pandas as pd
import json
import argparse
import os
from datetime import datetime

def detect_pattern_for_all(df, idx, lookback=5):
    """
    Unified pattern detection using daily logic for all timeframes
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False, False
    
    # Get current and previous bars
    current = df.iloc[idx]
    prev1 = df.iloc[idx-1]
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    prev4 = df.iloc[idx-4] if idx > 3 else None
    prev5 = df.iloc[idx-5] if idx > 4 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev1 is None:
        return False, False
    
    # Basic candlestick properties
    is_bullish = current['close'] > current['open']
    is_bearish = current['close'] < current['open']
    bar_range = current['high'] - current['low']
    body_size = abs(current['close'] - current['open'])
    
    # Wick properties
    lower_wick = min(current['open'], current['close']) - current['low']
    upper_wick = current['high'] - max(current['open'], current['close'])
    
    # Price movement properties
    higher_high = current['high'] > prev1['high']
    lower_low = current['low'] < prev1['low']
    
    # Pattern detection - using relaxed daily rules
    
    # UPTREND SIGNALS
    uptrend_signals = [
        # Any lower wick with bullish close
        lower_wick > 0 and is_bullish,
        
        # Any lower wick with lower low
        lower_wick > 0 and lower_low,
        
        # Price bounce from prior lows
        any(abs(current['low'] - p['low']) < bar_range * 0.5 for p in [prev2, prev3, prev4, prev5] if p is not None) and is_bullish,
        
        # Significant price change (0.5% minimum)
        is_bullish and abs(current['close'] - prev1['close']) / prev1['close'] > 0.005,
        
        # Momentum change from down to up
        all(df.iloc[idx-i]['close'] <= df.iloc[idx-i-1]['close'] for i in range(1, 3) if idx-i-1 >= 0) and current['close'] > prev1['close'],
        
        # Bullish engulfing
        is_bullish and prev1['close'] < prev1['open'] and current['open'] <= prev1['close'] and current['close'] >= prev1['open']
    ]
    
    # DOWNTREND SIGNALS
    downtrend_signals = [
        # Any upper wick with bearish close
        upper_wick > 0 and is_bearish,
        
        # Any upper wick with higher high
        upper_wick > 0 and higher_high,
        
        # Price rejection from prior highs
        any(abs(current['high'] - p['high']) < bar_range * 0.5 for p in [prev2, prev3, prev4, prev5] if p is not None) and is_bearish,
        
        # Significant price change (0.5% minimum)
        is_bearish and abs(current['close'] - prev1['close']) / prev1['close'] > 0.005,
        
        # Momentum change from up to down
        all(df.iloc[idx-i]['close'] >= df.iloc[idx-i-1]['close'] for i in range(1, 3) if idx-i-1 >= 0) and current['close'] < prev1['close'],
        
        # Bearish engulfing
        is_bearish and prev1['close'] > prev1['open'] and current['open'] >= prev1['close'] and current['close'] <= prev1['open']
    ]
    
    return any(uptrend_signals), any(downtrend_signals)

def analyze_timeframe(ohlc_path, json_path=None, timeframe=""):
    """
    Analyze a specific timeframe using daily pattern logic
    """
    # Load OHLC data
    df = pd.read_csv(ohlc_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Sort by timestamp ascending (oldest to newest)
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Add date column
    if timeframe == "1d":
        df['date'] = df['timestamp'].dt.strftime('%Y-%m-%d')
    else:
        # For hourly and other data, include time in the date string for exact matching
        df['date'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # Detect reference data if available for comparison
    ref_df = None
    if json_path and os.path.exists(json_path):
        with open(json_path, 'r') as f:
            json_data = json.load(f)
        
        # Create reference DataFrame
        ref_df = pd.DataFrame([{
            'timestamp': pd.to_datetime(item['timestamp']),
            'type': item['type'],
            'price': item['price']
        } for item in json_data])
        
        # Add date column for matching
        if timeframe == "1d":
            ref_df['date'] = ref_df['timestamp'].dt.strftime('%Y-%m-%d')
        else:
            ref_df['date'] = ref_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Process in reverse chronological order (newest to oldest)
    # This enhances recency bias in detection
    last_trend = None
    
    for i in range(len(df) - 1, -1, -1):
        # Skip if we've already marked this row (could happen with reference data)
        if df.iloc[i]['uptrendStart'] or df.iloc[i]['downtrendStart']:
            continue
        
        # Detect patterns using daily logic
        can_be_uptrend, can_be_downtrend = detect_pattern_for_all(df, i)
        
        # Apply alternating pattern rule
        if last_trend != 'uptrend' and can_be_uptrend:
            df.loc[df.index[i], 'uptrendStart'] = True
            last_trend = 'uptrend'
        elif last_trend != 'downtrend' and can_be_downtrend:
            df.loc[df.index[i], 'downtrendStart'] = True
            last_trend = 'downtrend'
    
    # Count detected trends
    uptrend_count = df['uptrendStart'].sum()
    downtrend_count = df['downtrendStart'].sum()
    
    print(f"\n--- {timeframe} TIMEFRAME WITH DAILY DETECTION LOGIC ---")
    print(f"Detected: {uptrend_count} uptrends, {downtrend_count} downtrends")
    
    # If we have reference data, compare with it
    if ref_df is not None:
        ref_up_dates = set(ref_df[ref_df['type'] == 'uptrendStart']['date'])
        ref_down_dates = set(ref_df[ref_df['type'] == 'downtrendStart']['date'])
        detect_up_dates = set(df[df['uptrendStart']]['date'])
        detect_down_dates = set(df[df['downtrendStart']]['date'])
        
        up_match = len(detect_up_dates.intersection(ref_up_dates))
        down_match = len(detect_down_dates.intersection(ref_down_dates))
        
        # Calculate match percentages
        ref_uptrends = len(ref_up_dates)
        ref_downtrends = len(ref_down_dates)
        up_match_pct = up_match / ref_uptrends * 100 if ref_uptrends else 0
        down_match_pct = down_match / ref_downtrends * 100 if ref_downtrends else 0
        overall_match_pct = (up_match + down_match) / (ref_uptrends + ref_downtrends) * 100 if (ref_uptrends + ref_downtrends) > 0 else 0
        
        print(f"\nMATCH ANALYSIS:")
        print(f"Reference: {ref_uptrends} uptrends, {ref_downtrends} downtrends")
        print(f"Uptrends: {up_match}/{ref_uptrends} ({up_match_pct:.1f}%)")
        print(f"Downtrends: {down_match}/{ref_downtrends} ({down_match_pct:.1f}%)")
        print(f"Overall match: {overall_match_pct:.1f}%")
        
        # Debug: print mismatched dates
        if up_match < ref_uptrends or down_match < ref_downtrends:
            print("\nMISSING UPTREND DATES:")
            for date in sorted(ref_up_dates - detect_up_dates):
                print(f"  {date}")
            
            print("\nMISSING DOWNTREND DATES:")
            for date in sorted(ref_down_dates - detect_down_dates):
                print(f"  {date}")
        
        # Check for false positives
        false_uptrends = detect_up_dates - ref_up_dates
        false_downtrends = detect_down_dates - ref_down_dates
        
        if false_uptrends or false_downtrends:
            print("\nFALSE POSITIVE TRENDS:")
            print(f"False uptrends: {len(false_uptrends)}")
            print(f"False downtrends: {len(false_downtrends)}")
            
            # Calculate false positive rate
            total_detected = len(detect_up_dates) + len(detect_down_dates)
            total_false = len(false_uptrends) + len(false_downtrends)
            if total_detected > 0:
                false_pos_rate = total_false / total_detected * 100
                print(f"False positive rate: {false_pos_rate:.1f}%")
    
    # Output results to CSV
    output_file = f"results_{timeframe}_daily_logic.csv"
    df.to_csv(output_file, index=False)
    print(f"\nResults saved to {output_file}")
    
    # Print most recent trend signals (last 5)
    recent_trends = []
    for i in range(len(df) - 1, -1, -1):
        row = df.iloc[i]
        if row['uptrendStart'] or row['downtrendStart']:
            date = row['date']
            trend = "uptrendStart" if row['uptrendStart'] else "downtrendStart"
            recent_trends.append((date, trend))
            if len(recent_trends) >= 5:
                break
    
    print("\nMOST RECENT TREND SIGNALS:")
    for date, trend in recent_trends:
        print(f"  {date}: {trend}")
    
    return df

def main():
    parser = argparse.ArgumentParser(description='Analyze all timeframes using daily pattern detection logic')
    parser.add_argument('--timeframes', nargs='+', default=['1d', '4h', '1h'], 
                        help='Timeframes to analyze (default: 1d 4h 1h)')
    args = parser.parse_args()
    
    for tf in args.timeframes:
        ohlc_path = f"data/CON.F.US.MES.M25_{tf}_ohlc.csv"
        json_path = f"data/CON.F.US.MES.M25_{tf}_trends.json"
        
        if not os.path.exists(ohlc_path):
            print(f"Warning: {ohlc_path} not found, skipping {tf} timeframe")
            continue
        
        analyze_timeframe(ohlc_path, json_path, tf)

if __name__ == "__main__":
    main() 