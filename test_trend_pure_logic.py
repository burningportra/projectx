import pandas as pd
import numpy as np

def detect_trends(ohlc_data):
    """
    Detect trend starts using pure technical analysis principles without weights
    
    Args:
        ohlc_data: DataFrame with OHLC price data
        
    Returns:
        DataFrame with added 'uptrendStart' and 'downtrendStart' columns
    """
    # CRITICAL: Sort by timestamp - oldest record FIRST, newest LAST
    df = ohlc_data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])  # Ensure proper datetime format
    df = df.sort_values('timestamp', ascending=True).reset_index(drop=True)
    
    print(f"Chronological verification - First date: {df['timestamp'].iloc[0]}")
    print(f"Chronological verification - Last date: {df['timestamp'].iloc[-1]}")
    
    # Add columns for trend signals
    df['uptrendStart'] = False
    df['downtrendStart'] = False
    
    # Track market state
    current_trend = None
    last_swing_high = None
    last_swing_low = None
    
    # Process each bar in chronological order (oldest to newest)
    for i in range(len(df)):
        # Get current bar 
        current = df.iloc[i]
        
        # Skip first few bars until we have enough context
        if i < 5:
            # Initialize swing levels from first 5 bars if we're at index 4
            if i == 4:
                initial_bars = df.iloc[0:5]
                last_swing_high = initial_bars['high'].max()
                last_swing_low = initial_bars['low'].min()
            continue
        
        # Get previous bars
        prev1 = df.iloc[i-1]
        prev2 = df.iloc[i-2]
        prev3 = df.iloc[i-3]
        
        # Calculate local context (last 5-10 bars)
        lookback = min(10, i)
        lookback_bars = df.iloc[i-lookback:i]
        local_high = lookback_bars['high'].max()
        local_low = lookback_bars['low'].min()
        
        # Price action properties
        is_bullish = current['close'] > current['open']
        is_bearish = current['close'] < current['open']
        
        # Volume properties (if available)
        has_volume_increase = True
        if 'volume' in df.columns:
            avg_volume = lookback_bars['volume'].mean()
            has_volume_increase = current['volume'] > avg_volume * 1.1
        
        # === UPTREND START CRITERIA ===
        
        # 1. Broke above recent resistance
        breaks_resistance = current['close'] > local_high
        
        # 2. Higher Low formed before breakout
        recent_lows = [df.iloc[i-j]['low'] for j in range(1, min(5, i))]
        forms_higher_low = min(recent_lows) > local_low
        
        # 3. Bullish engulfing pattern
        is_bullish_engulfing = (
            is_bullish and 
            prev1['close'] < prev1['open'] and  # Previous bar is bearish
            current['open'] <= prev1['close'] and  # Open below prev close
            current['close'] > prev1['open']  # Close above prev open
        )
        
        # 4. Reversal from downtrend
        prior_downtrend = (
            prev1['close'] < prev2['close'] < prev3['close'] or
            (current_trend == 'downtrend' and current['low'] > prev1['low'])
        )
        
        # Combined uptrend conditions
        is_uptrend_start = (
            # Must not already be in uptrend
            current_trend != 'uptrend' and
            
            # Technical breakout OR reversal pattern
            (
                (breaks_resistance and forms_higher_low) or
                (is_bullish_engulfing and prior_downtrend and current['close'] > local_high * 0.98) or
                (is_bullish and current['close'] > local_high and current['close'] > prev1['high'] * 1.01)
            ) and
            
            # Confirmation
            has_volume_increase
        )
        
        # === DOWNTREND START CRITERIA ===
        
        # 1. Broke below recent support
        breaks_support = current['close'] < local_low
        
        # 2. Lower High formed before breakdown
        recent_highs = [df.iloc[i-j]['high'] for j in range(1, min(5, i))]
        forms_lower_high = max(recent_highs) < local_high
        
        # 3. Bearish engulfing pattern
        is_bearish_engulfing = (
            is_bearish and 
            prev1['close'] > prev1['open'] and  # Previous bar is bullish
            current['open'] >= prev1['close'] and  # Open above prev close
            current['close'] < prev1['open']  # Close below prev open
        )
        
        # 4. Reversal from uptrend
        prior_uptrend = (
            prev1['close'] > prev2['close'] > prev3['close'] or
            (current_trend == 'uptrend' and current['high'] < prev1['high'])
        )
        
        # Combined downtrend conditions
        is_downtrend_start = (
            # Must not already be in downtrend
            current_trend != 'downtrend' and
            
            # Technical breakdown OR reversal pattern
            (
                (breaks_support and forms_lower_high) or
                (is_bearish_engulfing and prior_uptrend and current['close'] < local_low * 1.02) or
                (is_bearish and current['close'] < local_low and current['close'] < prev1['low'] * 0.99)
            ) and
            
            # Confirmation
            has_volume_increase
        )
        
        # Record signals and update state
        if is_uptrend_start:
            df.loc[df.index[i], 'uptrendStart'] = True
            current_trend = 'uptrend'
            # Update swing points on trend change
            last_swing_low = current['low']
            
        elif is_downtrend_start:
            df.loc[df.index[i], 'downtrendStart'] = True
            current_trend = 'downtrend'
            # Update swing points on trend change
            last_swing_high = current['high']
        
        # Update swing levels as we go
        if current['high'] > last_swing_high:
            last_swing_high = current['high']
        if current['low'] < last_swing_low:
            last_swing_low = current['low']
    
    return df

def main():
    # Load 4h OHLC data
    file_path = 'data/CON.F.US.MES.M25_4h_ohlc.csv'
    df = pd.read_csv(file_path)
    
    # Apply trend detection
    result_df = detect_trends(df)
    
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
    result_df.to_csv('results_4h_pure_logic.csv', index=False)
    print("Results saved to results_4h_pure_logic.csv")

if __name__ == "__main__":
    main() 