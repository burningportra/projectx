#!/usr/bin/env python3
import json
import pandas as pd

# Load and verify trend points JSON
print("Checking trend points file...")
try:
    with open('data/CON.F.US.MES.M25_4h_trends.json', 'r') as f:
        trend_data = json.load(f)
        print(f"Successfully loaded {len(trend_data)} trend points")
        print(f"Sample points:")
        for i, point in enumerate(trend_data[:3]):
            print(f"  {i+1}. {point['timestamp']} - {point['type']} at price {point['price']}")
except Exception as e:
    print(f"Error loading trend points: {e}")

# Load and verify OHLC data
print("\nChecking OHLC data file...")
try:
    ohlc_df = pd.read_csv('data/CON.F.US.MES.M25_4h_ohlc.csv')
    print(f"Successfully loaded {len(ohlc_df)} OHLC bars")
    print(f"OHLC columns: {list(ohlc_df.columns)}")
    print("Sample bars:")
    print(ohlc_df.head(3))
except Exception as e:
    print(f"Error loading OHLC data: {e}")

# Check timeframes
print("\nVerifying timeframes...")
print(f"OHLC timeframe unit values: {ohlc_df['timeframe_unit'].unique()}")
print(f"OHLC timeframe value: {ohlc_df['timeframe_value'].unique()}")

# Check if trend points have matching timestamps in OHLC data
print("\nChecking if trend points match OHLC timestamps...")
if 'trend_data' in locals() and not ohlc_df.empty:
    ohlc_timestamps = set(pd.to_datetime(ohlc_df['timestamp']).dt.strftime('%Y-%m-%dT%H:%M:%S+00:00'))
    trend_timestamps = [point['timestamp'] for point in trend_data]
    
    matching = 0
    for ts in trend_timestamps:
        if ts in ohlc_timestamps:
            matching += 1
    
    print(f"Found {matching} out of {len(trend_data)} trend points with matching timestamps in OHLC data")
    
    if matching < len(trend_data):
        print("\nSample of trend timestamps not found in OHLC data:")
        mismatches = 0
        for ts in trend_timestamps:
            if ts not in ohlc_timestamps and mismatches < 3:
                print(f"  - {ts}")
                mismatches += 1 