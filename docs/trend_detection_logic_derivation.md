# Trend Detection Logic Derivation

## Overview

This document outlines the systematic approach for deriving algorithmic trend detection logic from manually labeled trend points. By analyzing the characteristics of bars marked as trend starts across different timeframes (1d, 4h, 1h), we can develop robust detection algorithms that automate trend identification.

## Prerequisites

- Completed training data with trend points marked in the database
- Access to historical OHLC data for the target instruments
- Python environment for data analysis and algorithm development
- Understanding of the trend types used in the system:
  - `uptrendStart`: Beginning of an upward price movement
  - `downtrendStart`: Beginning of a downward price movement
  - `uptrendToHigh`: Uptrend leading to a significant high

## Implementation Plan

### 1. Data Collection & Preparation

#### 1.1 Extract Trend Points Data

```typescript
// Example API call to retrieve trend points
async function getTrendPoints(contractId: string, timeframes: string[]) {
  const results = {};
  
  for (const timeframe of timeframes) {
    const response = await fetch(`/api/trend-points?contractId=${contractId}&timeframe=${timeframe}`);
    const data = await response.json();
    results[timeframe] = data.data;
  }
  
  return results;
}

// Process for specific timeframes
const trendPointsData = await getTrendPoints("ES", ["1d", "4h", "1h"]);
```

#### 1.2 Extract OHLC Data with Context

```typescript
// Fetch OHLC data with surrounding context for each trend point
async function getOhlcWithContext(contractId: string, timeframe: string, 
                                 timestamp: number, contextBars: number = 10) {
  // Get bars before and after the trend point
  const startTime = new Date(timestamp - (contextBars * getTimeframeMs(timeframe)));
  const endTime = new Date(timestamp + (contextBars * getTimeframeMs(timeframe)));
  
  const response = await fetch(`/api/ohlc?contractId=${contractId}&timeframe=${timeframe}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`);
  return await response.json();
}
```

#### 1.3 Prepare Data for Analysis

Create a dataset that combines trend points with their corresponding OHLC bars:

```python
import pandas as pd
import numpy as np
from datetime import datetime

def prepare_analysis_dataset(trend_points, ohlc_data):
    """
    Merge trend points with OHLC data and add contextual features
    """
    # Convert OHLC data to pandas DataFrame
    ohlc_df = pd.DataFrame(ohlc_data)
    
    # Process each trend point
    analysis_records = []
    
    for tp in trend_points:
        # Find the exact bar where the trend point occurs
        target_bar_idx = ohlc_df[ohlc_df['timestamp'] == tp['timestamp']].index[0]
        
        if target_bar_idx < 5 or target_bar_idx >= len(ohlc_df) - 5:
            continue  # Skip if we don't have enough context
        
        # Extract context window (5 bars before, trend bar, 5 bars after)
        context_window = ohlc_df.iloc[target_bar_idx-5:target_bar_idx+6].copy()
        
        # Add trend point information
        context_window['is_trend_point'] = False
        context_window.loc[target_bar_idx, 'is_trend_point'] = True
        context_window.loc[target_bar_idx, 'trend_type'] = tp['type']
        
        # Add to analysis records
        analysis_records.append(context_window)
    
    return pd.concat(analysis_records, ignore_index=True)
```

### 2. Exploratory Analysis

#### 2.1 Calculate Statistical Properties

```python
def calculate_bar_properties(df):
    """
    Calculate statistical properties of bars
    """
    # Bar size relative to previous bars
    df['bar_size'] = df['high'] - df['low']
    df['bar_size_rel_avg5'] = df['bar_size'] / df['bar_size'].rolling(5).mean().shift(1)
    
    # Bar close position within range
    df['close_position'] = (df['close'] - df['low']) / (df['high'] - df['low'])
    
    # Trend movement
    df['price_change'] = df['close'] - df['close'].shift(1)
    df['price_change_pct'] = df['price_change'] / df['close'].shift(1)
    
    # Volatility
    df['volatility_5bar'] = df['bar_size'].rolling(5).std().shift(1)
    
    # Volume analysis (if available)
    if 'volume' in df.columns and df['volume'].notnull().all():
        df['volume_change'] = df['volume'] / df['volume'].rolling(5).mean().shift(1)
    
    return df
```

#### 2.2 Visualize Patterns

```python
import matplotlib.pyplot as plt
import mplfinance as mpf

def visualize_trend_patterns(df, trend_type):
    """
    Visualize patterns around trend points of specific type
    """
    # Find all bars marked with the specific trend type
    trend_bars = df[df['trend_type'] == trend_type].index.tolist()
    
    for bar_idx in trend_bars[:5]:  # Visualize first 5 examples
        # Extract 11 bars around the trend point (5 before, trend bar, 5 after)
        context = df.iloc[bar_idx-5:bar_idx+6].copy()
        
        # Convert to format for mplfinance
        context = context.set_index('timestamp')
        
        # Plot
        fig, axes = plt.subplots(2, 1, figsize=(12, 8), gridspec_kw={'height_ratios': [3, 1]})
        
        # Plot candlestick chart
        mpf.plot(context, type='candle', style='charles',
                 title=f'{trend_type} Pattern Example',
                 ylabel='Price', ax=axes[0])
                 
        # Mark the trend bar
        axes[0].axvline(x=context.index[5], color='r', linestyle='--')
        
        # Plot volume in subplot if available
        if 'volume' in context.columns and context['volume'].notnull().all():
            axes[1].bar(context.index, context['volume'])
            axes[1].set_ylabel('Volume')
            
        plt.tight_layout()
        plt.show()
```

### 3. Feature Engineering

#### 3.1 Extract Technical Indicators

```python
def add_technical_indicators(df):
    """
    Add common technical indicators to the dataset
    """
    
    # Price patterns
    df['higher_high'] = (df['high'] > df['high'].shift(1)) & (df['high'].shift(1) > df['high'].shift(2))
    df['lower_low'] = (df['low'] < df['low'].shift(1)) & (df['low'].shift(1) < df['low'].shift(2))
    
    # Candle patterns
    df['body_size'] = abs(df['close'] - df['open'])
    df['upper_wick'] = df['high'] - np.maximum(df['open'], df['close'])
    df['lower_wick'] = np.minimum(df['open'], df['close']) - df['low']
    
    
    return df
```

#### 3.2 Create Pattern Features

```python
def create_pattern_features(df):
    """
    Create features that describe multi-bar patterns
    """
    # Consecutive moves in same direction
    df['consec_up'] = 0
    df['consec_down'] = 0
    
    for i in range(1, len(df)):
        if df.loc[i, 'close'] > df.loc[i-1, 'close']:
            df.loc[i, 'consec_up'] = df.loc[i-1, 'consec_up'] + 1
        else:
            df.loc[i, 'consec_down'] = df.loc[i-1, 'consec_down'] + 1
    
    # Reversals
    df['price_reversal_up'] = (df['consec_down'] >= 3) & (df['close'] > df['open'])
    df['price_reversal_down'] = (df['consec_up'] >= 3) & (df['close'] < df['open'])
    
    # Rejection of level (long wicks)
    df['upper_rejection'] = df['upper_wick'] > 1.5 * df['body_size']
    df['lower_rejection'] = df['lower_wick'] > 1.5 * df['body_size']
    
    return df
```

### 4. Pattern Recognition

#### 4.1 Analyze Trend Start Conditions

For each trend type, we'll analyze what conditions tend to precede or coincide with the trend point:

```python
def analyze_trend_conditions(df, trend_type):
    """
    Analyze conditions that are common for a specific trend type
    """
    # Get all trend bars of the specified type
    trend_bars = df[df['trend_type'] == trend_type]
    
    # Get statistical properties of trend bars vs. non-trend bars
    trend_stats = trend_bars.describe()
    non_trend_stats = df[df['trend_type'].isna()].describe()
    
    # Find the most significant differentiating features
    feature_importance = {}
    
    for col in df.columns:
        if col not in ['timestamp', 'trend_type', 'is_trend_point']:
            if trend_bars[col].dtype in [np.float64, np.int64]:
                # For numeric features, compare means
                if trend_stats[col]['mean'] != 0 and non_trend_stats[col]['mean'] != 0:
                    ratio = trend_stats[col]['mean'] / non_trend_stats[col]['mean']
                    feature_importance[col] = abs(1 - ratio)
                    
            elif trend_bars[col].dtype == np.bool_:
                # For boolean features, compare rates of occurrence
                trend_rate = trend_bars[col].mean()
                non_trend_rate = df[df['trend_type'].isna()][col].mean()
                feature_importance[col] = abs(trend_rate - non_trend_rate)
    
    # Sort features by importance
    sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    
    # Return top 10 most important features
    return sorted_features[:10]
```

#### 4.2 Identify Specific Patterns for Each Trend Type

Based on our analysis, we can categorize the typical patterns for each trend type:

```python
# Example pattern definitions based on analysis
trend_patterns = {
    'uptrendStart': [
        'price_reversal_up',  # Reversal from downtrend
        'lower_rejection',    # Rejection of lower prices (hammer)
        'consec_down >= 3',   # After several down bars
        'close_position > 0.7', # Strong close near the high
    ],
    
    'downtrendStart': [
        'price_reversal_down', # Reversal from uptrend
        'upper_rejection',     # Rejection of higher prices (shooting star)
        'consec_up >= 3',      # After several up bars
        'close_position < 0.3', # Weak close near the low
    ],
    
    'highestDowntrendStart': [
        'upper_rejection',     # Strong rejection of higher prices
        'consec_up >= 5',      # After extended uptrend
        'volume_change > 1.5', # Above average volume
        'dist_from_sma20 > 0.05', # Extended from moving average
    ],
    
    'unbrokenUptrendStart': [
        'price_reversal_up',   # Reversal from downtrend
        'lower_rejection',     # Strong rejection of lower prices
        'volume_change > 1.2', # Above average volume
        'close > open',        # Bullish candle
        'bar_size_rel_avg5 > 1.2', # Larger than average bar
    ]
}
```

### 5. Algorithm Development

#### 5.1 Implement Detection Functions

```python
def detect_uptrend_start(ohlc_data, bar_index, lookback=5):
    """
    Algorithm to detect the start of an uptrend
    """
    # Ensure we have enough lookback data
    if bar_index < lookback:
        return False
        
    current_bar = ohlc_data.iloc[bar_index]
    prev_bars = ohlc_data.iloc[bar_index-lookback:bar_index]
    
    # Condition 1: Bar closes in top third
    c1 = (current_bar['close'] - current_bar['low']) / (current_bar['high'] - current_bar['low']) > 0.65
    
    # Condition 2: Previous bars formed a downtrend (at least 3 consecutive lower lows)
    lower_lows_count = sum(prev_bars['low'].diff().fillna(0) < 0)
    c2 = lower_lows_count >= 3
    
    # Condition 3: Current bar has a significant lower wick (hammer pattern)
    lower_wick = min(current_bar['open'], current_bar['close']) - current_bar['low']
    body_size = abs(current_bar['close'] - current_bar['open'])
    c3 = lower_wick > 1.5 * body_size
    
    # Condition 4: Volume is above average (if volume data available)
    if 'volume' in ohlc_data.columns and ohlc_data['volume'].notnull().all():
        avg_volume = prev_bars['volume'].mean()
        c4 = current_bar['volume'] > 1.2 * avg_volume
    else:
        c4 = True
    
    return c1 and c2 and (c3 or c4)
```

#### 5.2 Implement Detection for All Trend Types

Repeat the pattern for other trend types:

```python
def detect_downtrend_start(ohlc_data, bar_index, lookback=5):
    # Implementation similar to detect_uptrend_start but for downtrends
    # ...
    pass

def detect_highest_downtrend_start(ohlc_data, bar_index, lookback=10):
    # Implementation for highest downtrend start
    # ...
    pass

def detect_unbroken_uptrend_start(ohlc_data, bar_index, lookback=5):
    # Implementation for unbroken uptrend start
    # ...
    pass
```

### 6. Backtesting Framework

#### 6.1 Create Testing Framework

```python
def backtest_trend_detection(ohlc_data, labeled_trends, detection_function, trend_type):
    """
    Backtest a trend detection algorithm against labeled data
    """
    results = {
        'true_positives': 0,
        'false_positives': 0,
        'false_negatives': 0,
        'precision': 0,
        'recall': 0,
        'f1_score': 0,
        'detected_timestamps': [],
        'missed_timestamps': [],
        'false_timestamps': []
    }
    
    # Create timestamp lookup for labeled trends
    labeled_timestamps = {
        int(ts): True for ts in labeled_trends[labeled_trends['type'] == trend_type]['timestamp']
    }
    
    # Run detection algorithm on each bar
    for i in range(5, len(ohlc_data)):
        is_labeled_trend = int(ohlc_data.iloc[i]['timestamp']) in labeled_timestamps
        is_detected_trend = detection_function(ohlc_data, i)
        
        if is_detected_trend and is_labeled_trend:
            results['true_positives'] += 1
            results['detected_timestamps'].append(ohlc_data.iloc[i]['timestamp'])
        elif is_detected_trend and not is_labeled_trend:
            results['false_positives'] += 1
            results['false_timestamps'].append(ohlc_data.iloc[i]['timestamp'])
        elif not is_detected_trend and is_labeled_trend:
            results['false_negatives'] += 1
            results['missed_timestamps'].append(ohlc_data.iloc[i]['timestamp'])
    
    # Calculate precision and recall
    if results['true_positives'] + results['false_positives'] > 0:
        results['precision'] = results['true_positives'] / (results['true_positives'] + results['false_positives'])
    
    if results['true_positives'] + results['false_negatives'] > 0:
        results['recall'] = results['true_positives'] / (results['true_positives'] + results['false_negatives'])
    
    # Calculate F1 score
    if results['precision'] + results['recall'] > 0:
        results['f1_score'] = 2 * results['precision'] * results['recall'] / (results['precision'] + results['recall'])
    
    return results
```

### 7. Timeframe Integration

#### 7.1 Multi-Timeframe Analysis

```python
def analyze_timeframe_correlations(trend_points_by_timeframe):
    """
    Analyze correlations between trend points across timeframes
    """
    # Convert trend points to dataframes with timestamps
    dfs_by_timeframe = {}
    for timeframe, points in trend_points_by_timeframe.items():
        df = pd.DataFrame(points)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df['timeframe'] = timeframe
        dfs_by_timeframe[timeframe] = df
    
    # Combine all trend points
    all_trends = pd.concat(dfs_by_timeframe.values())
    
    # Group by day to find correlations across timeframes
    all_trends['date'] = all_trends['timestamp'].dt.date
    trends_by_day = all_trends.groupby(['date', 'type', 'timeframe']).size().unstack().fillna(0)
    
    # Calculate correlation between timeframes
    correlation = trends_by_day.corr()
    
    return correlation
```

#### 7.2 Implement Multi-Timeframe Confirmation Rules

```typescript
// TypeScript example for front-end implementation
interface TrendConfirmation {
  primaryTimeframe: string;
  primaryType: string;
  confirmingTimeframe: string;
  confirmingType: string;
  maxLookbackBars: number;
}

// Define confirmation rules based on analysis
const trendConfirmationRules: TrendConfirmation[] = [
  {
    primaryTimeframe: "1h",
    primaryType: "uptrendStart",
    confirmingTimeframe: "4h",
    confirmingType: "uptrendStart",
    maxLookbackBars: 6 // Look back at most 6 bars on 4h timeframe
  },
  {
    primaryTimeframe: "4h",
    primaryType: "downtrendStart",
    confirmingTimeframe: "1d",
    confirmingType: "downtrendStart",
    maxLookbackBars: 3 // Look back at most 3 bars on daily timeframe
  }
  // Add more rules based on analysis
];

// Function to check for timeframe confirmation
async function checkTimeframeConfirmation(trendPoint: any): Promise<boolean> {
  const rule = trendConfirmationRules.find(r => 
    r.primaryTimeframe === trendPoint.timeframe && 
    r.primaryType === trendPoint.type
  );
  
  if (!rule) return true; // No confirmation rule, assume valid
  
  // Get timestamp for current trend point
  const timestamp = trendPoint.timestamp;
  
  // Calculate lookback period for confirming timeframe
  const msPerBar = getTimeframeMs(rule.confirmingTimeframe);
  const lookbackStart = timestamp - (rule.maxLookbackBars * msPerBar);
  
  // Check for confirming trend point
  const response = await fetch(`/api/trend-points?contractId=${trendPoint.contractId}&timeframe=${rule.confirmingTimeframe}&type=${rule.confirmingType}&startTime=${lookbackStart}&endTime=${timestamp}`);
  const data = await response.json();
  
  return data.data.length > 0; // Return true if confirming trend point found
}
```

### 8. Implementation

#### 8.1 Create a Production Module

Here's a structure for a production-ready trend detection module:

```typescript
// trend-detection.ts
import { OhlcBarWithTrends } from '../types';

export class TrendDetector {
  // Configuration
  private lookbackBars: number = 5;
  
  // Detect all types of trends in a dataset
  public detectTrends(ohlcData: OhlcBarWithTrends[]): OhlcBarWithTrends[] {
    const result = [...ohlcData];
    
    // Process each bar except the first few (need lookback)
    for (let i = this.lookbackBars; i < result.length; i++) {
      result[i].uptrendStart = this.detectUptrendStart(result, i);
      result[i].downtrendStart = this.detectDowntrendStart(result, i);
      result[i].highestDowntrendStart = this.detectHighestDowntrendStart(result, i);
      result[i].unbrokenUptrendStart = this.detectUnbrokenUptrendStart(result, i);
    }
    
    return result;
  }
  
  // Individual detection methods
  private detectUptrendStart(data: OhlcBarWithTrends[], index: number): boolean {
    const current = data[index];
    
    // Implementation based on derived logic
    // Example implementation:
    const previousBars = data.slice(index - this.lookbackBars, index);
    
    // Condition 1: Previous bars showed downtrend
    const prevDowntrend = previousBars.every((bar, i, arr) => 
      i === 0 || bar.low <= arr[i-1].low
    );
    
    // Condition 2: Current bar shows reversal
    const closePosition = (current.close - current.low) / (current.high - current.low);
    const strongClose = closePosition > 0.7;
    
    // Condition 3: Lower wick rejection
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const body = Math.abs(current.close - current.open);
    const hasRejection = lowerWick > 1.2 * body;
    
    return prevDowntrend && (strongClose || hasRejection);
  }
  
  private detectDowntrendStart(data: OhlcBarWithTrends[], index: number): boolean {
    // Similar implementation for downtrend start
    // ...
    return false;
  }
  
  private detectHighestDowntrendStart(data: OhlcBarWithTrends[], index: number): boolean {
    // Implementation for highest downtrend start
    // ...
    return false;
  }
  
  private detectUnbrokenUptrendStart(data: OhlcBarWithTrends[], index: number): boolean {
    // Implementation for unbroken uptrend start
    // ...
    return false;
  }
}
```

#### 8.2 Integration with Existing Components

Integrate with TrendChart.tsx:

```typescript
import { TrendDetector } from '../utils/trend-detection';

// Inside the TrendChart component:
const [autoDetectedTrends, setAutoDetectedTrends] = useState<OhlcBarWithTrends[]>([]);

useEffect(() => {
  if (processedData.length > 0) {
    const detector = new TrendDetector();
    const detectedData = detector.detectTrends(processedData);
    setAutoDetectedTrends(detectedData);
    
    // Optional: Compare with human-labeled trends
    if (onTrendPointsDetected) {
      const trendPoints = detectedData
        .filter(bar => bar.uptrendStart || bar.downtrendStart || 
               bar.highestDowntrendStart || bar.unbrokenUptrendStart)
        .map((bar, index) => {
          const timestamp = bar.timestamp instanceof Date ? 
            bar.timestamp.getTime() : new Date(bar.timestamp).getTime();
          
          let type = '';
          let price = 0;
          
          if (bar.uptrendStart) {
            type = 'uptrendStart';
            price = bar.low;
          } else if (bar.downtrendStart) {
            type = 'downtrendStart';
            price = bar.high;
          } else if (bar.highestDowntrendStart) {
            type = 'highestDowntrendStart';
            price = bar.high;
          } else if (bar.unbrokenUptrendStart) {
            type = 'unbrokenUptrendStart';
            price = bar.low;
          }
          
          return {timestamp, price, type, index};
        });
      
      onTrendPointsDetected(trendPoints);
    }
  }
}, [processedData]);

// Add UI toggle for auto-detected trends
const [showAutoDetected, setShowAutoDetected] = useState(false);

// Add to render method:
{trainingMode && (
  <div className="flex items-center mt-2">
    <input
      type="checkbox"
      id="show-auto-detected"
      checked={showAutoDetected}
      onChange={(e) => setShowAutoDetected(e.target.checked)}
      className="mr-2"
    />
    <label htmlFor="show-auto-detected" className="text-sm text-gray-300">
      Show auto-detected trends
    </label>
  </div>
)}
```

## Conclusion

By following this systematic approach, we can translate human expertise in trend identification into algorithmic detection rules. The process combines statistical analysis with domain knowledge to create reliable trend detection algorithms that work across multiple timeframes.

Once implemented, these algorithms can be continuously improved by comparing their results with newly trained data points, creating a feedback loop that enhances detection accuracy over time.

## Next Steps

1. Implement feature extraction and analysis scripts
2. Create visualization tools to compare detected vs. labeled trend points
3. Add performance metrics to track detection accuracy
4. Build UI components to display auto-detected trends alongside manual labels
5. Document pattern descriptions for each trend type to aid in algorithm refinement 