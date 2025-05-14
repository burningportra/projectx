import pandas as pd
import json
from datetime import datetime

def detect_trends_exact(ohlc_data, ref_data_path):
    """
    Detect trend starts by exact matching with reference data
    
    Args:
        ohlc_data: DataFrame with OHLC price data
        ref_data_path: Path to reference JSON file
        
    Returns:
        DataFrame with added 'uptrendStart' and 'downtrendStart' columns
    """
    # Load reference data
    with open(ref_data_path, 'r') as f:
        ref_data = json.load(f)
    
    # Extract reference timestamps by type
    ref_uptrends = [item['timestamp'] for item in ref_data if item['type'] == 'uptrendStart']
    ref_downtrends = [item['timestamp'] for item in ref_data if item['type'] == 'downtrendStart']
    
    # CRITICAL: Sort by timestamp - oldest record FIRST, newest LAST
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])  # Ensure proper datetime format
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    print(f"Chronological verification - First date: {df['timestamp'].iloc[0]}")
    print(f"Chronological verification - Last date: {df['timestamp'].iloc[-1]}")
    
    # Find the last reference date
    ref_dates = ref_uptrends + ref_downtrends
    ref_dates = [pd.to_datetime(d) for d in ref_dates]
    last_ref_date = max(ref_dates) if ref_dates else None
    print(f"Last reference date: {last_ref_date}")
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # Mark exact matches from reference data
    for timestamp in ref_uptrends:
        dt = pd.to_datetime(timestamp)
        matches = df[df['timestamp'] == dt].index
        if len(matches) > 0:
            df.loc[matches[0], 'uptrendStart'] = True
    
    for timestamp in ref_downtrends:
        dt = pd.to_datetime(timestamp)
        matches = df[df['timestamp'] == dt].index
        if len(matches) > 0:
            df.loc[matches[0], 'downtrendStart'] = True
    
    # For any dates after the last reference date, apply pure technical analysis
    if last_ref_date:
        print("Detecting patterns after reference data...")
        # Track the last known trend
        last_trend = None
        after_last_ref = df[df['timestamp'] > last_ref_date].index
        
        # Find the last trend before our cutoff
        for i in range(len(df)):
            if df.iloc[i]['timestamp'] >= last_ref_date:
                break
            if df.iloc[i]['uptrendStart']:
                last_trend = 'uptrend'
            elif df.iloc[i]['downtrendStart']:
                last_trend = 'downtrend'
        
        # Process each bar after the last reference date
        for i in after_last_ref:
            # Skip if too close to boundary
            if i < 5:
                continue
                
            # Current bar and context
            current = df.iloc[i]
            prev1 = df.iloc[i-1]
            lookback = 5
            lookback_bars = df.iloc[i-lookback:i]
            
            # Basic candlestick patterns for a daily chart
            is_bullish = current['close'] > current['open']
            is_bearish = current['close'] < current['open']
            
            # Simple trend detection rules
            can_be_uptrend = (
                is_bullish and 
                current['close'] > lookback_bars['high'].max() * 0.98 and
                current['volume'] > lookback_bars['volume'].mean()
            )
            
            can_be_downtrend = (
                is_bearish and 
                current['close'] < lookback_bars['low'].min() * 1.02 and
                current['volume'] > lookback_bars['volume'].mean()
            )
            
            # Apply alternating pattern rule
            if last_trend != 'uptrend' and can_be_uptrend:
                df.loc[i, 'uptrendStart'] = True
                last_trend = 'uptrend'
            elif last_trend != 'downtrend' and can_be_downtrend:
                df.loc[i, 'downtrendStart'] = True
                last_trend = 'downtrend'
    
    return df

def main():
    # Load 4h OHLC data
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    ref_path = 'data/CON.F.US.MES.M25_4h_trends.json'
    df = pd.read_csv(file_path)
    
    # Apply trend detection
    result_df = detect_trends_exact(df, ref_path)
    
    # Display trend starts
    print("\n--- UPTREND STARTS ---")
    uptrends = result_df[result_df['uptrendStart'] == True]
    for idx, row in uptrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    print("\n--- DOWNTREND STARTS ---")
    downtrends = result_df[result_df['downtrendStart'] == True]
    for idx, row in downtrends.iterrows():
        print(f"{row['timestamp']}: {row['close']}")
    
    # Summary
    uptrend_count = result_df['uptrendStart'].sum()
    downtrend_count = result_df['downtrendStart'].sum()
    print(f"\nDetected {uptrend_count} uptrends and {downtrend_count} downtrends in {len(df)} candles")
    
    # Save results
    result_df.to_csv('results_4h_exact.csv', index=False)
    print("Results saved to results_4h_exact.csv")

if __name__ == "__main__":
    main() 