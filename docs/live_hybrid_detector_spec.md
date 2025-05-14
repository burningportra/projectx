# Live Hybrid Trend Detector Specification

## Overview
The Live Hybrid Trend Detector is a real-time trend detection system that combines pattern recognition with market structure analysis to identify trend changes in price action. It is designed to work across multiple timeframes and can process streaming market data to provide immediate trend signals.

## Purpose
This module addresses the need for accurate real-time trend detection without requiring post-processing or timestamp verification. It enables automated trading systems to respond to trend changes as they occur.

## Components

### LiveHybridDetector Class
The core component that implements the trend detection logic.

#### Initialization Parameters
- `lookback_window`: Number of bars to maintain in history (default: 100)
- `timeframe`: The timeframe of the data being analyzed (1d, 4h, 1h, etc.)

#### Key State Variables
- `data`: DataFrame storing OHLC price history
- `last_trend`: The most recently identified trend ('uptrend' or 'downtrend')
- `last_trend_price`: Price level at the last trend change
- `last_trend_date`: Timestamp of the last trend change

## Algorithm Logic

### Trend Detection Process
1. Load initial historical data to establish context
2. For each new price bar:
   - Apply pattern recognition algorithms
   - Calculate trend strength scores
   - Apply alternating trend rule (trends must alternate)
   - Return trend status and metadata

### Pattern Recognition
The detector analyzes each price bar for specific candlestick patterns and price action signals:

#### Uptrend Signals
1. **Bullish Engulfing Pattern**: Current bar opens below and closes above previous bar's range
2. **Hammer Pattern**: Bullish bar with significant lower wick
3. **Support Level Bounce**: Price bounces off historical support level
4. **Morning Star Pattern**: Three-bar reversal pattern
5. **Reversal After Downtrend**: Price turns up after sustained downtrend
6. **Significant Price Change**: Large positive price movement

#### Downtrend Signals
1. **Bearish Engulfing Pattern**: Current bar opens above and closes below previous bar's range
2. **Shooting Star Pattern**: Bearish bar with significant upper wick
3. **Resistance Level Rejection**: Price rejects at historical resistance level
4. **Evening Star Pattern**: Three-bar reversal pattern
5. **Reversal After Uptrend**: Price turns down after sustained uptrend
6. **Significant Price Change**: Large negative price movement

### Trend Start Formation

#### Detailed Criteria for Trend Detection

1. **Pattern Scoring Mechanism**
   - Each pattern is evaluated independently and contributes to a cumulative score
   - Pattern weights are assigned based on reliability and significance:
     - Strong signals (e.g., engulfing patterns): 2.0 points
     - Moderate signals (e.g., support/resistance tests): 1.5 points
     - Weak signals (e.g., small price changes): 1.0 points
   - Additional bonus points (0.5-1.0) are awarded for timeframe-specific conditions

2. **Score Thresholds by Timeframe**
   - Daily (1d): Score must reach 1.0 or higher
   - 4-Hour (4h): Score must reach 1.5 or higher
   - Hourly (1h): Score must reach 2.0 or higher

3. **Trend Start Decision Algorithm**
   ```
   For each new price bar:
     1. Calculate uptrend_score and downtrend_score by summing pattern contributions
     2. Compare each score against the timeframe-specific threshold
     3. If uptrend_score >= threshold, then can_be_uptrend = True
     4. If downtrend_score >= threshold, then can_be_downtrend = True
     5. Apply alternating rule:
        - If last_trend != "uptrend" AND can_be_uptrend = True, then declare uptrend start
        - If last_trend != "downtrend" AND can_be_downtrend = True, then declare downtrend start
     6. On trend start, update last_trend, last_trend_price, and last_trend_date
   ```

4. **Exact Uptrend Start Conditions**
   - An uptrend start is declared when ALL of the following are true:
     - The uptrend score meets or exceeds the timeframe threshold
     - The previous trend was NOT an uptrend (it was either a downtrend or null)
     - Only ONE trend can be active at a time (uptrend or downtrend)

5. **Exact Downtrend Start Conditions**
   - A downtrend start is declared when ALL of the following are true:
     - The downtrend score meets or exceeds the timeframe threshold
     - The previous trend was NOT a downtrend (it was either an uptrend or null)
     - Only ONE trend can be active at a time (uptrend or downtrend)

6. **Pattern Weight Examples**
   - Bullish Engulfing in an existing downtrend: +2.0 to uptrend score
   - Hammer with wick ratio ≥ 2.0: +2.0 to uptrend score
   - Hammer with wick ratio between min_wick_ratio and 2.0: +1.0 to uptrend score
   - Support bounce with bullish candle: +1.5 to uptrend score
   - Simple price reversal after downtrend: +1.5 to uptrend score
   - Significant price change: +1.0 to uptrend score (daily timeframe: +2.0 if >1%)

7. **Timeframe-Specific Pattern Adjustments**
   - Daily timeframes get bonus points for:
     - Lower lows with hammer pattern: +0.5
     - Higher highs with shooting star pattern: +0.5
     - Price changes >1%: +1.0
   - Smaller timeframes require more stringent pattern confirmation

8. **Initial Trend Determination**
   - When loading initial historical data, trends are determined by processing bars in reverse chronological order
   - First qualified trend pattern encountered becomes the current trend
   - This establishes the baseline for subsequent real-time analysis

### Detailed Pseudocode Formula

```pseudocode
FUNCTION DetectTrend(bar, prev_bars, timeframe, last_trend)
    // Set timeframe-specific parameters
    IF timeframe == "1d" THEN
        min_wick_ratio = 0.3
        min_price_change = 0.005  // 0.5%
        score_threshold = 1.0
    ELSE IF timeframe == "4h" THEN
        min_wick_ratio = 0.5
        min_price_change = 0.003  // 0.3%
        score_threshold = 1.5
    ELSE  // 1h and others
        min_wick_ratio = 0.8
        min_price_change = 0.002  // 0.2%
        score_threshold = 2.0
    END IF

    // Initialize scores
    uptrend_score = 0
    downtrend_score = 0

    // Get current and previous bars
    current = bar
    prev1 = prev_bars[0]
    prev2 = prev_bars[1] if available else NULL
    prev3 = prev_bars[2] if available else NULL
    prev4 = prev_bars[3] if available else NULL
    prev5 = prev_bars[4] if available else NULL

    // Basic candlestick properties
    is_bullish = current.close > current.open
    is_bearish = current.close < current.open
    bar_range = current.high - current.low
    body_size = |current.close - current.open|
    lower_wick = min(current.open, current.close) - current.low
    upper_wick = current.high - max(current.open, current.close)
    higher_high = current.high > prev1.high
    lower_low = current.low < prev1.low
    price_change_pct = |current.close - prev1.close| / prev1.close

    // === CALCULATE UPTREND SIGNALS ===

    // 1. Bullish engulfing pattern
    IF is_bullish AND prev1.close < prev1.open AND 
       current.open <= prev1.close AND current.close >= prev1.open THEN
        uptrend_score += 2.0
    END IF

    // 2. Hammer pattern (significant lower wick)
    IF is_bullish AND lower_wick > 0 THEN
        wick_ratio = lower_wick / body_size if body_size > 0 else 0
        IF wick_ratio >= 2.0 THEN
            uptrend_score += 2.0
        ELSE IF wick_ratio >= min_wick_ratio THEN
            uptrend_score += 1.0
            IF timeframe == "1d" AND lower_low THEN
                uptrend_score += 0.5
            END IF
        END IF
    END IF

    // 3. Support level bounce
    IF prev2 != NULL AND prev3 != NULL AND prev4 != NULL THEN
        prior_lows = [prev2.low, prev3.low, prev4.low]
        IF prev5 != NULL THEN
            prior_lows.append(prev5.low)
        END IF
        min_prior_low = MIN(prior_lows)
        IF |current.low - min_prior_low| < bar_range * 0.3 THEN
            IF is_bullish THEN
                uptrend_score += 1.5
            ELSE IF timeframe == "1d" AND lower_wick > 0 THEN
                uptrend_score += 1.0
            END IF
        END IF
    END IF

    // 4. Morning star pattern
    IF prev2 != NULL THEN
        prev2_bearish = prev2.close < prev2.open
        prev1_small_body = |prev1.close - prev1.open| < bar_range * 0.3
        IF prev2_bearish AND prev1_small_body AND is_bullish THEN
            uptrend_score += 2.0
        ELSE IF timeframe == "1d" AND prev2_bearish AND is_bullish THEN
            uptrend_score += 1.0
        END IF
    END IF

    // 5. Reversal up after downtrend
    IF prev3 != NULL THEN
        downtrend_present = TRUE
        FOR i = 1 TO 3 DO
            IF prev_bars[i-1].close > prev_bars[i].close THEN
                downtrend_present = FALSE
                BREAK
            END IF
        END FOR
        IF downtrend_present THEN
            IF current.close > prev1.close AND is_bullish THEN
                uptrend_score += 1.5
            ELSE IF timeframe == "1d" AND current.close > prev1.close THEN
                uptrend_score += 1.0
            END IF
        END IF
    END IF

    // 6. Significant price change
    IF is_bullish AND price_change_pct > min_price_change THEN
        uptrend_score += 1.0
        IF timeframe == "1d" AND price_change_pct > 0.01 THEN // 1%
            uptrend_score += 1.0
        END IF
    END IF

    // === CALCULATE DOWNTREND SIGNALS ===

    // 1. Bearish engulfing pattern
    IF is_bearish AND prev1.close > prev1.open AND 
       current.open >= prev1.close AND current.close <= prev1.open THEN
        downtrend_score += 2.0
    END IF

    // 2. Shooting star pattern (significant upper wick)
    IF is_bearish AND upper_wick > 0 THEN
        wick_ratio = upper_wick / body_size if body_size > 0 else 0
        IF wick_ratio >= 2.0 THEN
            downtrend_score += 2.0
        ELSE IF wick_ratio >= min_wick_ratio THEN
            downtrend_score += 1.0
            IF timeframe == "1d" AND higher_high THEN
                downtrend_score += 0.5
            END IF
        END IF
    END IF

    // 3. Resistance level rejection
    IF prev2 != NULL AND prev3 != NULL AND prev4 != NULL THEN
        prior_highs = [prev2.high, prev3.high, prev4.high]
        IF prev5 != NULL THEN
            prior_highs.append(prev5.high)
        END IF
        max_prior_high = MAX(prior_highs)
        IF |current.high - max_prior_high| < bar_range * 0.3 THEN
            IF is_bearish THEN
                downtrend_score += 1.5
            ELSE IF timeframe == "1d" AND upper_wick > 0 THEN
                downtrend_score += 1.0
            END IF
        END IF
    END IF

    // 4. Evening star pattern
    IF prev2 != NULL THEN
        prev2_bullish = prev2.close > prev2.open
        prev1_small_body = |prev1.close - prev1.open| < bar_range * 0.3
        IF prev2_bullish AND prev1_small_body AND is_bearish THEN
            downtrend_score += 2.0
        ELSE IF timeframe == "1d" AND prev2_bullish AND is_bearish THEN
            downtrend_score += 1.0
        END IF
    END IF

    // 5. Reversal down after uptrend
    IF prev3 != NULL THEN
        uptrend_present = TRUE
        FOR i = 1 TO 3 DO
            IF prev_bars[i-1].close < prev_bars[i].close THEN
                uptrend_present = FALSE
                BREAK
            END IF
        END FOR
        IF uptrend_present THEN
            IF current.close < prev1.close AND is_bearish THEN
                downtrend_score += 1.5
            ELSE IF timeframe == "1d" AND current.close < prev1.close THEN
                downtrend_score += 1.0
            END IF
        END IF
    END IF

    // 6. Significant price change
    IF is_bearish AND price_change_pct > min_price_change THEN
        downtrend_score += 1.0
        IF timeframe == "1d" AND price_change_pct > 0.01 THEN // 1%
            downtrend_score += 1.0
        END IF
    END IF

    // Determine if pattern scores meet thresholds
    can_be_uptrend = uptrend_score >= score_threshold
    can_be_downtrend = downtrend_score >= score_threshold

    // Apply alternating trend rule
    is_uptrend_start = FALSE
    is_downtrend_start = FALSE

    IF last_trend != "uptrend" AND can_be_uptrend THEN
        is_uptrend_start = TRUE
        new_trend = "uptrend"
    ELSE IF last_trend != "downtrend" AND can_be_downtrend THEN
        is_downtrend_start = TRUE
        new_trend = "downtrend"
    ELSE
        new_trend = last_trend
    END IF

    // Return trend detection results
    RETURN {
        is_uptrend_start: is_uptrend_start,
        is_downtrend_start: is_downtrend_start,
        new_trend: new_trend,
        uptrend_score: uptrend_score,
        downtrend_score: downtrend_score,
        can_be_uptrend: can_be_uptrend,
        can_be_downtrend: can_be_downtrend
    }
END FUNCTION

FUNCTION ProcessNewBar(new_bar, prev_bars, timeframe, last_trend)
    // Detect trend patterns
    trend_result = DetectTrend(new_bar, prev_bars, timeframe, last_trend)
    
    // Update trend state
    IF trend_result.is_uptrend_start THEN
        current_trend = "uptrend"
    ELSE IF trend_result.is_downtrend_start THEN
        current_trend = "downtrend"
    ELSE
        current_trend = last_trend
    END IF
    
    // Return comprehensive results
    RETURN {
        uptrendStart: trend_result.is_uptrend_start,
        downtrendStart: trend_result.is_downtrend_start,
        currentTrend: current_trend,
        timestamp: new_bar.timestamp,
        price: new_bar.close,
        patternStrength: {
            uptrend: trend_result.can_be_uptrend,
            downtrend: trend_result.can_be_downtrend
        }
    }
END FUNCTION

### Scoring System
- Each pattern contributes to an uptrend or downtrend score
- Different timeframes have different threshold requirements:
  - Daily (1d): Less sensitive, threshold = 1.0
  - 4-Hour (4h): Medium sensitivity, threshold = 1.5
  - Hourly (1h): More stringent, threshold = 2.0
- Timeframe-specific adjustments modify the pattern weights

### Alternating Trend Rule
- New uptrend can only start after a downtrend
- New downtrend can only start after an uptrend
- This prevents false signals and ensures trends have meaningful duration

## Input/Output Specifications

### Input Data Format
- OHLC data with columns: timestamp, open, high, low, close, volume
- Timestamp must be convertible to datetime format

### Output Format
```json
{
    "uptrendStart": boolean,
    "downtrendStart": boolean,
    "currentTrend": "uptrend" | "downtrend" | null,
    "timestamp": datetime,
    "price": float,
    "patternStrength": {
        "uptrend": boolean,
        "downtrend": boolean
    }
}
```

## Usage

### Initialization
```python
detector = LiveHybridDetector(lookback_window=100, timeframe="1d")
detector.load_initial_data(historical_data)
```

### Processing New Data
```python
result = detector.process_new_bar({
    "timestamp": datetime_object,
    "open": float_value,
    "high": float_value,
    "low": float_value,
    "close": float_value,
    "volume": float_value
})
```

## Timeframe-Specific Configurations

### Daily Timeframe (1d)
- Minimum wick ratio: 0.3
- Minimum price change: 0.5%
- Score threshold: 1.0
- Focus on strong patterns and significant price moves

### 4-Hour Timeframe (4h)
- Minimum wick ratio: 0.5
- Minimum price change: 0.3%
- Score threshold: 1.5
- Balance between sensitivity and reliability

### Hourly Timeframe (1h)
- Minimum wick ratio: 0.8
- Minimum price change: 0.2%
- Score threshold: 2.0
- Requires stronger pattern confirmation to reduce noise

## Performance Considerations
- Maintains a fixed-size lookback window to limit memory usage
- Pattern detection algorithm is O(1) for each new bar
- Initial trend identification is O(n) where n is the lookback window size

## Integration
This detector is designed to be integrated with:
- Real-time market data feeds
- Automated trading systems
- Trading signal notification systems
- Strategy backtesting frameworks

## Implementation Notes
- Implemented in Python using Pandas for data handling
- Provides built-in logging for trend detection events
- Includes demo functionality for testing with historical data 