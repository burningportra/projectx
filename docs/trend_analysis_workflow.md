# Trend Pattern Analysis Workflow

This document explains how to use the trend pattern analysis workflow to derive improved trend detection algorithms from your manually labeled trend data. By analyzing the statistical patterns and characteristics of labeled trend points, we can create more accurate trend detection algorithms.

## Overview

The trend pattern analysis workflow consists of the following steps:

1. **Data Collection**: Gathering OHLC price data and manually labeled trend points
2. **Feature Generation**: Calculating technical indicators and pattern recognition features
3. **Pattern Analysis**: Analyzing statistical differences between trend bars and regular bars
4. **Rule Generation**: Deriving detection rules based on the most significant patterns
5. **Model Training**: Training machine learning models for pattern recognition (optional)
6. **Performance Evaluation**: Comparing the improved detector against the original

## Prerequisites

Before starting, make sure you have:

- Python 3.8+ with required packages (pandas, numpy, matplotlib, scikit-learn)
- OHLC price data in CSV, parquet, or feather format
- Labeled trend points (from your manual training sessions)

## Getting Started

### Installation

Clone the repository and install the required dependencies:

```bash
git clone https://github.com/yourusername/projectx.git
cd projectx
pip install -r requirements.txt
```

### Data Requirements

#### OHLC Data

Your OHLC data should include at least the following columns:
- `timestamp`: Date and time of the bar
- `open`: Opening price
- `high`: Highest price
- `low`: Lowest price
- `close`: Closing price
- `volume` (optional): Trading volume
- `timeframe` (optional): Timeframe identifier (e.g., "1h", "1d")

#### Trend Points

Your trend points data should include:
- `timestamp`: Date and time of the trend point
- `type`: Type of trend (e.g., "uptrendStart", "downtrendStart")
- `price`: Price level of the trend point
- `timeframe` (optional): Timeframe identifier 
- `contractId` (optional): Symbol or contract identifier

## Running the Analysis

Use the `run_trend_pattern_analysis.py` script to analyze your data and generate improved trend detection algorithms:

```bash
python src/run_trend_pattern_analysis.py --ohlc data/ohlcdata.csv --trends data/trendpoints.json --timeframe 1h --output results
```

### Command-Line Arguments

- `--ohlc`: Path to OHLC data file (required)
- `--trends`: Path to trend points file (optional if API access is configured)
- `--timeframe`: Timeframe to analyze (default: "1h")
- `--contract`: Contract symbol/ID (default: "ES")
- `--sensitivity`: Sensitivity for trend detection (0.0-1.0, default: 0.5)
- `--output`: Output directory for results (default: "trend_analysis_results")
- `--visualize`: Visualize trends and patterns
- `--compare`: Compare with original trend detector

### Output

The script generates several output files in your specified output directory:

- **Detection Code**: Python functions for each trend type (`detect_uptrendstart.py`, etc.)
- **Visualization**: Charts showing detected patterns (if `--visualize` is specified)
- **Analysis Results**: Serialized analysis data for future reference (`trend_analysis.pkl`)
- **Comparison Metrics**: Performance comparison between detectors (if `--compare` is specified)

## Understanding the Results

### Detection Rules

For each trend type, the workflow generates detection rules based on the most statistically significant features that differentiate trend bars from non-trend bars. These rules are converted into Python functions that you can integrate into your trading system.

Example rule for `uptrendStart`:

```python
def detect_uptrendstart(df, idx, lookback=5):
    """
    Detect uptrendStart pattern based on statistical analysis.
    
    Args:
        df: DataFrame with OHLC data and calculated features
        idx: Index of the bar to check
        lookback: Number of bars to look back
        
    Returns:
        bool: True if pattern is detected, False otherwise
    """
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
        
    # Get current bar and previous bars
    current = df.iloc[idx]
    prev_bars = df.iloc[idx-lookback:idx]
    
    # Calculate required features if they don't exist
    if 'close_position' not in df.columns:
        df['close_position'] = (df['close'] - df['low']) / (df['high'] - df['low']).replace(0, np.nan)
        df['close_position'] = df['close_position'].fillna(0.5)
    
    # Check conditions
    c1 = current['close_position'] > 0.7
    c2 = current['lower_wick'] > 1.2 * current['body_size']
    c3 = current['bar_size_rel_avg5'] > 1.3
    
    # Combine all conditions
    return c1 and c2 and c3
```

### Performance Metrics

If you use the `--compare` flag, the workflow generates performance metrics comparing the original trend detector with the improved version:

- **Precision**: What percentage of detected trend points were actually trend points
- **Recall**: What percentage of actual trend points were detected
- **F1 Score**: Harmonic mean of precision and recall

Example comparison output:

```
Performance comparison:
  uptrendStart:
    Original: F1=0.6500, P=0.6000, R=0.7500
    Improved: F1=0.7800, P=0.7500, R=0.8400
    Difference: +13.00%
```

## Using the Improved Detector

After analyzing your data, you can use the `ImprovedTrendDetector` class in your trading system:

```python
from src.strategy.indicators.improved_trend_detector import ImprovedTrendDetector

# Initialize the detector
detector = ImprovedTrendDetector(
    symbol_type="futures",  # or "stocks"
    sensitivity=0.6         # Higher values detect more trends but may increase false positives
)

# Detect trends in your OHLC data
trend_data = detector.detect_trends(ohlc_df)

# Access trend indicators
uptrends = trend_data[trend_data['uptrendStart']]
downtrends = trend_data[trend_data['downtrendStart']]

# Generate statistics
stats = detector.generate_trend_statistics(trend_data)
```

## Advanced Usage

### Custom Feature Engineering

If you want to add custom features to the analysis, you can extend the `TrendPatternAnalyzer` class:

```python
from src.strategy.indicators.trend_pattern_analyzer import TrendPatternAnalyzer

class ExtendedAnalyzer(TrendPatternAnalyzer):
    def _add_custom_features(self):
        df = self.data
        
        # Add your custom indicators
        df['custom_indicator'] = ...
        
    def add_features(self):
        super().add_features()
        self._add_custom_features()
```

### Optimizing Detector Sensitivity

You can find the optimal sensitivity settings by running the analysis multiple times with different sensitivity values:

```bash
for s in 0.3 0.4 0.5 0.6 0.7; do
    python src/run_trend_pattern_analysis.py --ohlc data/ohlcdata.csv --trends data/trendpoints.json \
    --sensitivity $s --output "results_sens_$s" --compare
done
```

Then compare the F1 scores to find the optimal sensitivity setting for your specific data.

## Troubleshooting

### No Trend Points Detected

If the analysis doesn't find any trend points:

1. Ensure your trend points data format matches the expected format
2. Check that the timestamps in trend points and OHLC data use the same format
3. Try running with a different timeframe that has more labeled points

### Poor Detection Performance

If the detector performance is poor:

1. Add more labeled examples, particularly in diverse market conditions
2. Try different sensitivity settings
3. Consider adding more specialized features for your specific market

### Memory Issues

If you encounter memory issues with large datasets:

1. Filter your OHLC data to only include the necessary time range
2. Process one timeframe at a time
3. Use more memory-efficient data formats like parquet or feather

## Best Practices

1. **Label Diverse Patterns**: Include trend starts in different market conditions
2. **Consistent Labeling**: Be consistent in how you label trends
3. **Separate Validation**: Keep some labeled data separate for validation
4. **Regular Retraining**: Update your detection algorithms periodically as markets evolve

## Next Steps

After implementing the improved trend detector, you can:

1. Integrate it into your trading strategy
2. Create a feedback loop where new trading data can be labeled and fed back into the analysis
3. Develop specific detectors for different market regimes or timeframes

## References

- See `docs/trend_detection_logic_derivation.md` for the theoretical background
- Review the `ImprovedTrendDetector` class documentation for implementation details 