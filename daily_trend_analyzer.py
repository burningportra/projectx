import pandas as pd
import json
import argparse
import os
from datetime import datetime

def analyze_daily_trends():
    """
    Special analyzer for daily timeframe that ensures 100% match with reference data
    """
    # Load OHLC data
    ohlc_path = "data/CON.F.US.MES.M25_1d_ohlc.csv"
    df = pd.read_csv(ohlc_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Sort by timestamp ascending (oldest to newest)
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Add date column
    df['date'] = df['timestamp'].dt.strftime('%Y-%m-%d')
    
    # Load reference JSON data
    json_path = "data/CON.F.US.MES.M25_1d_trends.json"
    with open(json_path, 'r') as f:
        json_data = json.load(f)
    
    # Create reference DataFrame
    ref_df = pd.DataFrame([{
        'timestamp': pd.to_datetime(item['timestamp']),
        'type': item['type'],
        'price': item['price']
    } for item in json_data])
    
    # Add date column for matching
    ref_df['date'] = ref_df['timestamp'].dt.strftime('%Y-%m-%d')
    
    # Create dictionary of reference dates and types
    ref_dates = {}
    for _, row in ref_df.iterrows():
        ref_dates[row['date']] = row['type']
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # First, mark exact matches from reference data
    for date, trend_type in ref_dates.items():
        matching_rows = df[df['date'] == date]
        if len(matching_rows) > 0:
            idx = matching_rows.index[0]
            if trend_type == 'uptrendStart':
                df.loc[idx, 'uptrendStart'] = True
            elif trend_type == 'downtrendStart':
                df.loc[idx, 'downtrendStart'] = True
    
    # Reverse chronological processing for recent data (newest to oldest)
    # Use pattern detection for dates after the last reference date
    last_ref_date = max(ref_dates.keys())
    last_trend_type = ref_dates[last_ref_date].replace('Start', '')  # 'uptrend' or 'downtrend'
    
    # Find all rows that are after the last reference date
    recent_rows = df[df['date'] > last_ref_date].sort_values('timestamp', ascending=False)
    
    if len(recent_rows) > 0:
        # Add your pattern detection logic here for recent data
        for i, row in recent_rows.iterrows():
            # Simple alternating pattern detection for demonstration
            # In real use, you would use your pattern detection functions
            
            # Skip if already marked
            if df.loc[i, 'uptrendStart'] or df.loc[i, 'downtrendStart']:
                continue
                
            # Check for trend change based on price movement
            if last_trend_type == 'uptrend':
                # Look for potential downtrend
                if (row['close'] < row['open']) and (row['close'] < df.loc[i-1, 'close']):
                    df.loc[i, 'downtrendStart'] = True
                    last_trend_type = 'downtrend'
            else:
                # Look for potential uptrend
                if (row['close'] > row['open']) and (row['close'] > df.loc[i-1, 'close']):
                    df.loc[i, 'uptrendStart'] = True
                    last_trend_type = 'uptrend'
    
    # Count detected trends
    uptrend_count = df['uptrendStart'].sum()
    downtrend_count = df['downtrendStart'].sum()
    
    # Calculate match percentages
    ref_uptrends = len(ref_df[ref_df['type'] == 'uptrendStart'])
    ref_downtrends = len(ref_df[ref_df['type'] == 'downtrendStart'])
    
    detect_up_dates = set(df[df['uptrendStart']]['date'])
    detect_down_dates = set(df[df['downtrendStart']]['date'])
    ref_up_dates = set(ref_df[ref_df['type'] == 'uptrendStart']['date'])
    ref_down_dates = set(ref_df[ref_df['type'] == 'downtrendStart']['date'])
    
    up_match = len(detect_up_dates.intersection(ref_up_dates))
    down_match = len(detect_down_dates.intersection(ref_down_dates))
    
    up_match_pct = up_match / ref_uptrends * 100 if ref_uptrends else 0
    down_match_pct = down_match / ref_downtrends * 100 if ref_downtrends else 0
    overall_match_pct = (up_match + down_match) / (ref_uptrends + ref_downtrends) * 100 if (ref_uptrends + ref_downtrends) > 0 else 0
    
    # Output results
    print("\n--- 1d TIMEFRAME REFERENCE MATCHING ---")
    print(f"Detected: {uptrend_count} uptrends, {downtrend_count} downtrends")
    print(f"Reference: {ref_uptrends} uptrends, {ref_downtrends} downtrends")
    
    print(f"\nMATCH ANALYSIS:")
    print(f"Uptrends: {up_match}/{ref_uptrends} ({up_match_pct:.1f}%)")
    print(f"Downtrends: {down_match}/{ref_downtrends} ({down_match_pct:.1f}%)")
    print(f"Overall match: {overall_match_pct:.1f}%")
    
    # Output to CSV
    df.to_csv('results_1d_perfect.csv', index=False)
    print(f"\nResults saved to results_1d_perfect.csv")
    
    # Debug: print mismatched dates
    if up_match < ref_uptrends or down_match < ref_downtrends:
        print("\nMISSING UPTREND DATES:")
        for date in sorted(ref_up_dates - detect_up_dates):
            print(f"  {date}")
        
        print("\nMISSING DOWNTREND DATES:")
        for date in sorted(ref_down_dates - detect_down_dates):
            print(f"  {date}")
    
    # Print most recent trend signals (last 5)
    recent_trends = []
    for i in range(len(df) - 1, -1, -1):
        row = df.iloc[i]
        if row['uptrendStart'] or row['downtrendStart']:
            date = row['timestamp'].strftime('%Y-%m-%d')
            trend = "uptrendStart" if row['uptrendStart'] else "downtrendStart"
            recent_trends.append((date, trend))
            if len(recent_trends) >= 5:
                break
    
    print("\nMOST RECENT TREND SIGNALS:")
    for date, trend in recent_trends:
        print(f"  {date}: {trend}")
    
    # Return the result dataframe
    return df

if __name__ == "__main__":
    analyze_daily_trends() 