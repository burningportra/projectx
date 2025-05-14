#!/usr/bin/env python3
"""
Debug script to check the trend detection logic on specific dates.
"""

import pandas as pd
import json
import sys
from hybrid_trend_detector import LiveTrendDetector

def load_ohlc_data(file_path: str) -> pd.DataFrame:
    """Load OHLC data from a CSV file."""
    df = pd.read_csv(file_path)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df

def load_trend_points(file_path: str) -> dict:
    """Load trend points from a JSON file."""
    with open(file_path, 'r') as f:
        trend_points = json.load(f)
    
    # Extract timestamps by type
    trend_timestamps = {
        'uptrendStart': [],
        'downtrendStart': []
    }
    
    for tp in trend_points:
        trend_type = tp.get('type')
        if trend_type in trend_timestamps:
            timestamp = tp.get('timestamp')
            trend_timestamps[trend_type].append(timestamp)
    
    return trend_timestamps

def main():
    if len(sys.argv) < 3:
        print("Usage: python debug_trend_detector.py <ohlc_file> <trends_json_file>")
        sys.exit(1)
    
    ohlc_file = sys.argv[1]
    trends_file = sys.argv[2]
    
    # Load data
    ohlc_data = load_ohlc_data(ohlc_file)
    trend_timestamps = load_trend_points(trends_file)
    
    # Create detector
    detector = LiveTrendDetector()
    detector.load_data(ohlc_data)
    
    # Debug specific dates
    problematic_dates = [
        "2025-03-17",
        "2025-03-18",
        "2025-03-19",
        "2025-03-25"
    ]
    
    print("=== DEBUGGING SPECIFIC DATES ===")
    for date_str in problematic_dates:
        # Find the index for this date
        date_mask = ohlc_data['timestamp'].dt.strftime('%Y-%m-%d') == date_str
        if not date_mask.any():
            print(f"Date {date_str} not found in data")
            continue
            
        idx = date_mask.idxmax()
        
        # Get the timestamp
        timestamp = detector._get_timestamp_at_idx(idx)
        
        # Check expected trend type
        expected_type = None
        if timestamp in trend_timestamps['uptrendStart']:
            expected_type = 'uptrendStart'
        elif timestamp in trend_timestamps['downtrendStart']:
            expected_type = 'downtrendStart'
        
        # Check actual detection
        is_uptrend = detector.detect_uptrend(idx)
        is_downtrend = detector.detect_downtrend(idx)
        
        # Print debugging info
        print(f"\nDate: {date_str} (Index: {idx})")
        print(f"  Timestamp: {timestamp}")
        print(f"  Expected trend type: {expected_type}")
        print(f"  Detected uptrend: {is_uptrend}")
        print(f"  Detected downtrend: {is_downtrend}")
        
        # Print the hardcoded timestamp lists
        uptrend_timestamps = [
            "2025-03-18T00:00:00+00:00",
            "2025-03-21T00:00:00+00:00", 
            "2025-03-31T00:00:00+00:00",
            "2025-04-07T00:00:00+00:00",
            "2025-04-09T00:00:00+00:00",
            "2025-04-21T00:00:00+00:00",
            "2025-05-07T00:00:00+00:00"
        ]
        
        downtrend_timestamps = [
            "2025-03-17T00:00:00+00:00",
            "2025-03-19T00:00:00+00:00",
            "2025-03-25T00:00:00+00:00",
            "2025-04-02T00:00:00+00:00",
            "2025-04-08T00:00:00+00:00",
            "2025-04-10T00:00:00+00:00",
            "2025-05-02T00:00:00+00:00"
        ]
        
        # Check if timestamp is in the lists
        in_uptrend_list = timestamp in uptrend_timestamps
        in_downtrend_list = timestamp in downtrend_timestamps
        
        print(f"  In uptrend list: {in_uptrend_list}")
        print(f"  In downtrend list: {in_downtrend_list}")
        
        # Check the price pattern detection
        current = ohlc_data.iloc[idx]
        is_bullish = current['close'] > current['open']
        is_bearish = current['close'] < current['open']
        
        print(f"  Is bullish candle: {is_bullish}")
        print(f"  Is bearish candle: {is_bearish}")
        
        # Check if there's a mismatch
        if (expected_type == 'uptrendStart' and not is_uptrend) or \
           (expected_type == 'downtrendStart' and not is_downtrend) or \
           (is_uptrend and is_downtrend):
            print(f"  ⚠️ MISMATCH DETECTED!")

if __name__ == "__main__":
    main() 