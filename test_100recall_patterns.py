import pandas as pd
import sys
import json

# Load OHLC data
df = pd.read_csv('data/CON.F.US.MES.M25_4h_ohlc.csv')
df['timestamp'] = pd.to_datetime(df['timestamp'])

# Pattern detection functions from 100recall, but modified to not do timestamp verification
def detect_pattern_uptrend(df, idx, lookback=5):
    """
    Detect uptrend patterns WITHOUT timestamp verification
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
    
    # Get current and previous bars
    current = df.iloc[idx]
    prev1 = df.iloc[idx-1]
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    prev4 = df.iloc[idx-4] if idx > 3 else None
    prev5 = df.iloc[idx-5] if idx > 4 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev1 is None:
        return False
    
    # Basic candlestick properties
    is_bullish = current['close'] > current['open']
    bar_range = current['high'] - current['low']
    body_size = abs(current['close'] - current['open'])
    close_position = (current['close'] - current['low']) / bar_range if bar_range > 0 else 0.5
    lower_wick = min(current['open'], current['close']) - current['low']
    
    # ---------- Pattern Detection Logic ----------
    # 1. Lower low pattern (price making new lows)
    lower_low = current['low'] < prev1['low']
    
    # 2. Bullish engulfing pattern
    prev_bearish = prev1['close'] < prev1['open']
    bullish_engulfing = (is_bullish and prev_bearish and 
                       current['open'] <= prev1['close'] and 
                       current['close'] >= prev1['open'])
    
    # 3. Hammer pattern (long lower wick)
    significant_lower_wick = lower_wick > body_size * 0.5
    
    # 4. Previous trend detection (bearish into bullish)
    prev_bars_bearish = False
    if prev2 is not None and prev3 is not None:
        prev_bearish_count = sum([
            1 if prev1['close'] < prev1['open'] else 0,
            1 if prev2['close'] < prev2['open'] else 0,
            1 if prev3['close'] < prev3['open'] else 0
        ])
        prev_bars_bearish = prev_bearish_count >= 2
    
    # 5. Morning star pattern
    doji = prev1 is not None and abs(prev1['close'] - prev1['open']) < bar_range * 0.3
    morning_star = (prev2 is not None and prev2['close'] < prev2['open'] and 
                  doji and is_bullish)
    
    # 6. Support level test
    prior_support_level = False
    if all(p is not None for p in [prev2, prev3, prev4, prev5]):
        # Look for prior low points that could act as support
        prior_lows = [p['low'] for p in [prev2, prev3, prev4, prev5]]
        current_price_near_prior_low = any(abs(current['low'] - low) < bar_range * 0.3 for low in prior_lows)
        prior_support_level = current_price_near_prior_low and is_bullish
    
    # 7. RSI-like condition (oversold bounce)
    oversold_bounce = False
    if prev3 is not None:
        recent_down_moves = sum([1 for i in range(1, 4) if df.iloc[idx-i]['close'] < df.iloc[idx-i]['open']])
        recent_bounce = current['close'] > current['open'] and current['low'] < prev1['low']
        oversold_bounce = recent_down_moves >= 2 and recent_bounce
    
    # 8. Price momentum change
    momentum_shift = False
    if prev3 is not None:
        down_momentum = all(df.iloc[idx-i]['close'] <= df.iloc[idx-i-1]['close'] for i in range(1, 3))
        up_now = current['close'] > prev1['close']
        momentum_shift = down_momentum and up_now
    
    # ---------- Decision Logic ----------
    # Only need ONE signal for potential uptrend
    uptrend_signals = [
        lower_low and is_bullish,  # Lower low with bullish close
        bullish_engulfing,         # Engulfing pattern
        significant_lower_wick and is_bullish and prev_bearish,  # Hammer-like after bearish
        morning_star,              # Morning star pattern
        prior_support_level,       # Price bouncing from support
        oversold_bounce,           # Oversold bounce
        momentum_shift and is_bullish,  # Momentum change to bullish
        is_bullish and prev_bars_bearish  # Bullish bar after bearish trend
    ]
    
    # Potential trend if any signal is true
    return any(uptrend_signals)

def detect_pattern_downtrend(df, idx, lookback=5):
    """
    Detect downtrend patterns WITHOUT timestamp verification
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
        
    # Get current and previous bars
    current = df.iloc[idx]
    prev1 = df.iloc[idx-1]
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    prev4 = df.iloc[idx-4] if idx > 3 else None
    prev5 = df.iloc[idx-5] if idx > 4 else None
    
    # Skip if no previous bar (need context for pattern detection)
    if prev1 is None:
        return False
    
    # Basic candlestick properties
    is_bearish = current['close'] < current['open']
    bar_range = current['high'] - current['low']
    body_size = abs(current['close'] - current['open'])
    close_position = (current['close'] - current['low']) / bar_range if bar_range > 0 else 0.5
    upper_wick = current['high'] - max(current['open'], current['close'])
    
    # ---------- Pattern Detection Logic ----------
    # 1. Higher high pattern (price making new highs)
    higher_high = current['high'] > prev1['high']
    
    # 2. Bearish engulfing pattern
    prev_bullish = prev1['close'] > prev1['open']
    bearish_engulfing = (is_bearish and prev_bullish and 
                       current['open'] >= prev1['close'] and 
                       current['close'] <= prev1['open'])
    
    # 3. Shooting star pattern (long upper wick)
    significant_upper_wick = upper_wick > body_size * 0.5
    
    # 4. Previous trend detection (bullish into bearish)
    prev_bars_bullish = False
    if prev2 is not None and prev3 is not None:
        prev_bullish_count = sum([
            1 if prev1['close'] > prev1['open'] else 0,
            1 if prev2['close'] > prev2['open'] else 0,
            1 if prev3['close'] > prev3['open'] else 0
        ])
        prev_bars_bullish = prev_bullish_count >= 2
    
    # 5. Evening star pattern
    doji = prev1 is not None and abs(prev1['close'] - prev1['open']) < bar_range * 0.3
    evening_star = (prev2 is not None and prev2['close'] > prev2['open'] and 
                  doji and is_bearish)
    
    # 6. Resistance level test
    prior_resistance_level = False
    if all(p is not None for p in [prev2, prev3, prev4, prev5]):
        # Look for prior high points that could act as resistance
        prior_highs = [p['high'] for p in [prev2, prev3, prev4, prev5]]
        current_price_near_prior_high = any(abs(current['high'] - high) < bar_range * 0.3 for high in prior_highs)
        prior_resistance_level = current_price_near_prior_high and is_bearish
    
    # 7. RSI-like condition (overbought reversal)
    overbought_reversal = False
    if prev3 is not None:
        recent_up_moves = sum([1 for i in range(1, 4) if df.iloc[idx-i]['close'] > df.iloc[idx-i]['open']])
        recent_reversal = current['close'] < current['open'] and current['high'] > prev1['high']
        overbought_reversal = recent_up_moves >= 2 and recent_reversal
    
    # 8. Price momentum change
    momentum_shift = False
    if prev3 is not None:
        up_momentum = all(df.iloc[idx-i]['close'] >= df.iloc[idx-i-1]['close'] for i in range(1, 3))
        down_now = current['close'] < prev1['close']
        momentum_shift = up_momentum and down_now
    
    # ---------- Decision Logic ----------
    # Only need ONE signal for potential downtrend
    downtrend_signals = [
        higher_high and is_bearish,  # Higher high with bearish close
        bearish_engulfing,           # Engulfing pattern
        significant_upper_wick and is_bearish and prev_bullish,  # Shooting star-like after bullish
        evening_star,                # Evening star pattern
        prior_resistance_level,      # Price rejecting at resistance
        overbought_reversal,         # Overbought reversal
        momentum_shift and is_bearish,  # Momentum change to bearish
        is_bearish and prev_bars_bullish  # Bearish bar after bullish trend
    ]
    
    # Potential trend if any signal is true
    return any(downtrend_signals)

# Add columns for trend starts
df['uptrendStart'] = False
df['downtrendStart'] = False

# Track last trend to ensure alternating patterns
last_trend = None

# Detect trends
for i in range(len(df)):
    # Check uptrend if last trend wasn't uptrend
    if last_trend != 'uptrend':
        if detect_pattern_uptrend(df, i):
            df.loc[df.index[i], 'uptrendStart'] = True
            last_trend = 'uptrend'
            continue
    
    # Check downtrend if last trend wasn't downtrend
    if last_trend != 'downtrend':
        if detect_pattern_downtrend(df, i):
            df.loc[df.index[i], 'downtrendStart'] = True
            last_trend = 'downtrend'
            continue

# Count detected trends
uptrend_count = df['uptrendStart'].sum()
downtrend_count = df['downtrendStart'].sum()

print(f"100recall pattern-only mode - Detected {uptrend_count} uptrend starts and {downtrend_count} downtrend starts")

# Load reference data
ref = pd.read_csv('reference_results.csv')
ref['date'] = pd.to_datetime(ref['timestamp']).dt.strftime('%Y-%m-%d')
df['date'] = pd.to_datetime(df['timestamp']).dt.strftime('%Y-%m-%d')

# Find matching days
ref_up = set(ref[ref['uptrendStart']]['date'])
ref_down = set(ref[ref['downtrendStart']]['date'])
detect_up = set(df[df['uptrendStart']]['date'])
detect_down = set(df[df['downtrendStart']]['date'])

up_match = len(detect_up.intersection(ref_up))
down_match = len(detect_down.intersection(ref_down))

print(f"MATCH RATE - Uptrends: {up_match}/{len(ref_up)} ({up_match/len(ref_up)*100:.1f}%)")
print(f"MATCH RATE - Downtrends: {down_match}/{len(ref_down)} ({down_match/len(ref_down)*100:.1f}%)")
print(f"OVERALL MATCH: {(up_match+down_match)/(len(ref_up)+len(ref_down))*100:.1f}%")

print("MATCHING UPTRENDS:", sorted(detect_up.intersection(ref_up)))
print("MATCHING DOWNTRENDS:", sorted(detect_down.intersection(ref_down)))

# Save results
df.to_csv('100recall_pattern_results.csv', index=False) 