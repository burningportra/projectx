import pandas as pd
import json
import sys
from datetime import datetime

def verify_trends_against_reference(ohlc_file, ref_file):
    """
    Properly verify trend data against reference data without hardcoding dates.
    
    Args:
        ohlc_file: Path to the OHLC data CSV file
        ref_file: Path to the reference JSON file with trend points
    """
    # Load OHLC data
    print(f"Loading OHLC data from {ohlc_file}...")
    df = pd.read_csv(ohlc_file)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    # Load reference data
    print(f"Loading reference data from {ref_file}...")
    with open(ref_file, 'r') as f:
        ref_data = json.load(f)
    
    # Convert reference timestamps to datetime and format for comparison
    for item in ref_data:
        item['datetime'] = pd.to_datetime(item['timestamp'])
        item['date_str'] = item['datetime'].strftime('%Y-%m-%d %H:%M')
    
    # Add date string column to OHLC data for easier comparison
    df['date_str'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Count reference trend points
    ref_uptrends = [item for item in ref_data if item['type'] == 'uptrendStart']
    ref_downtrends = [item for item in ref_data if item['type'] == 'downtrendStart']
    
    print(f"\nREFERENCE DATA STATISTICS:")
    print(f"Time range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    print(f"Total reference trend points: {len(ref_data)}")
    print(f"  - Uptrend starts: {len(ref_uptrends)}")
    print(f"  - Downtrend starts: {len(ref_downtrends)}")
    
    # Check if all reference timestamps are in the OHLC data
    ref_dates = {item['date_str'] for item in ref_data}
    ohlc_dates = set(df['date_str'])
    
    missing_dates = ref_dates - ohlc_dates
    if missing_dates:
        print(f"\nWARNING: {len(missing_dates)} reference dates are missing from OHLC data:")
        for date in sorted(missing_dates):
            print(f"  - {date}")
    
    # Create a dataframe with all reference trend points for easier visualization
    trend_df = df.copy()
    trend_df['uptrendStart'] = False
    trend_df['downtrendStart'] = False
    
    # Mark reference points in the dataframe
    uptrend_dates = {item['date_str'] for item in ref_uptrends}
    downtrend_dates = {item['date_str'] for item in ref_downtrends}
    
    for i, row in trend_df.iterrows():
        if row['date_str'] in uptrend_dates:
            trend_df.loc[i, 'uptrendStart'] = True
        if row['date_str'] in downtrend_dates:
            trend_df.loc[i, 'downtrendStart'] = True
    
    # Print trend points
    print("\n=== REFERENCE UPTREND STARTS ===")
    uptrends = trend_df[trend_df['uptrendStart']].sort_values('timestamp')
    for _, row in uptrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    print("\n=== REFERENCE DOWNTREND STARTS ===")
    downtrends = trend_df[trend_df['downtrendStart']].sort_values('timestamp')
    for _, row in downtrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    # Special case detection (trend points that happen at the same candle)
    dual_trend_dates = uptrend_dates.intersection(downtrend_dates)
    if dual_trend_dates:
        print("\n=== SPECIAL CASE: DUAL TREND POINTS ===")
        print("These candles mark both uptrend and downtrend starts:")
        for date in sorted(dual_trend_dates):
            print(f"  - {date}")
    
    # Alternating pattern verification
    print("\n=== ALTERNATING PATTERN VERIFICATION ===")
    # Sort all trend points chronologically
    all_trends = []
    for item in ref_data:
        all_trends.append({
            'datetime': pd.to_datetime(item['timestamp']),
            'type': item['type']
        })
    
    all_trends.sort(key=lambda x: x['datetime'])
    
    # Check if trends alternate properly
    alternating_count = 0
    violations = []
    
    for i in range(1, len(all_trends)):
        current = all_trends[i]['type']
        previous = all_trends[i-1]['type']
        
        if current != previous:
            alternating_count += 1
        else:
            violations.append(f"{all_trends[i-1]['datetime'].strftime('%Y-%m-%d %H:%M')} and {all_trends[i]['datetime'].strftime('%Y-%m-%d %H:%M')} - both {current}")
    
    alternating_pct = alternating_count / (len(all_trends) - 1) * 100 if len(all_trends) > 1 else 0
    print(f"Alternating pattern adherence: {alternating_pct:.1f}%")
    
    if violations:
        print(f"Found {len(violations)} alternating pattern violations:")
        for v in violations:
            print(f"  - {v}")
    
    # Save the dataframe with marked trends
    output_file = 'reference_trend_mapping.csv'
    trend_df.to_csv(output_file, index=False)
    print(f"\nSaved reference mapping to {output_file}")
    
    return trend_df

def main():
    # Handle command line arguments
    if len(sys.argv) != 3:
        print("Usage: python test_trend_accurate_verification.py <ohlc_file_path> <reference_json_path>")
        sys.exit(1)
    
    ohlc_file = sys.argv[1]
    ref_file = sys.argv[2]
    
    verify_trends_against_reference(ohlc_file, ref_file)

if __name__ == "__main__":
    main() 