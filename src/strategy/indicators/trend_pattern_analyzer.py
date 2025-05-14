"""
Trend Pattern Analyzer

This module provides tools for analyzing labeled trend patterns to derive
improved detection algorithms based on direct price action relationships.

It focuses on pure price action and candlestick patterns without relying on
complex technical indicators.
"""

import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional, Union, Any
from datetime import datetime
import matplotlib.pyplot as plt
import seaborn as sns

logger = logging.getLogger(__name__)

class TrendPatternAnalyzer:
    """
    Analyzes trend patterns from labeled data to derive detection algorithms.
    
    This class focuses on price action patterns and candlestick formations
    to identify trend reversal points without relying on technical indicators.
    """
    
    def __init__(self, min_samples: int = 5):
        """
        Initialize the trend pattern analyzer.
        
        Args:
            min_samples: Minimum number of samples required for a trend type to be analyzed
        """
        self.min_samples = min_samples
        self.data = None
        self.trend_types = []
        self.stats_by_type = {}
        self.pattern_rules = {}
        self.accuracy = {}
        self.debug_info = {}
        
    def load_data(self, trend_points: List[Dict], ohlc_data: pd.DataFrame) -> None:
        """
        Load trend points and corresponding OHLC data.
        
        Args:
            trend_points: List of trend point dictionaries (timestamp, type, etc.)
            ohlc_data: DataFrame with OHLC price data
        """
        if not trend_points or ohlc_data.empty:
            raise ValueError("Trend points and OHLC data cannot be empty")
            
        # Ensure OHLC data has timestamp as datetime
        if 'timestamp' in ohlc_data.columns:
            if not pd.api.types.is_datetime64_any_dtype(ohlc_data['timestamp']):
                ohlc_data['timestamp'] = pd.to_datetime(ohlc_data['timestamp'])
                
        # Create a copy of OHLC data to work with
        self.data = ohlc_data.copy()
        
        # Add trend type flags
        self.data['is_trend_point'] = False
        for trend_type in ['uptrendStart', 'downtrendStart']:
            self.data[trend_type] = False
            
        # Mark trend points in the data
        matched_count = 0
        for tp in trend_points:
            timestamp = tp.get('timestamp')
            if isinstance(timestamp, (int, float)):
                timestamp = pd.to_datetime(timestamp, unit='ms')
            elif isinstance(timestamp, str):
                timestamp = pd.to_datetime(timestamp)
                
            # Find the corresponding bar
            idx = self.data[self.data['timestamp'] == timestamp].index
            if len(idx) > 0:
                matched_count += 1
                self.data.loc[idx[0], 'is_trend_point'] = True
                self.data.loc[idx[0], tp['type']] = True
        
        if matched_count < len(trend_points):
            logger.warning(f"Only matched {matched_count} out of {len(trend_points)} trend points with OHLC data")
                
        # Identify trend types in the data
        self.trend_types = [col for col in self.data.columns 
                           if col in ['uptrendStart', 'downtrendStart']
                           and self.data[col].sum() >= self.min_samples]
                           
        logger.info(f"Loaded {matched_count} trend points across {len(self.trend_types)} trend types")
        for trend_type in self.trend_types:
            count = self.data[trend_type].sum()
            logger.info(f"  - {trend_type}: {count} instances")
            
    def add_price_action_features(self) -> None:
        """
        Add pure price action features to the dataset.
        """
        if self.data is None:
            raise ValueError("No data loaded. Call load_data() first.")
            
        # Calculate basic bar properties
        df = self.data
        
        # Bar properties
        df['bar_size'] = df['high'] - df['low']
        df['body_size'] = abs(df['close'] - df['open'])
        df['upper_wick'] = df['high'] - np.maximum(df['open'], df['close'])
        df['lower_wick'] = np.minimum(df['open'], df['close']) - df['low']
        
        # Bar direction
        df['is_bullish'] = df['close'] > df['open']
        df['is_bearish'] = df['close'] < df['open']
        
        # Price relationships
        df['higher_close'] = df['close'] > df['close'].shift(1)
        df['lower_close'] = df['close'] < df['close'].shift(1)
        df['higher_high'] = df['high'] > df['high'].shift(1)
        df['lower_low'] = df['low'] < df['low'].shift(1)
        
        # Higher highs and lower lows over multiple bars
        df['higher_high_2bar'] = df['high'] > df['high'].shift(2)
        df['lower_low_2bar'] = df['low'] < df['low'].shift(2)
        df['higher_high_3bar'] = df['high'] > df['high'].shift(3)
        df['lower_low_3bar'] = df['low'] < df['low'].shift(3)
        
        # Close position within bar
        df['close_position'] = (df['close'] - df['low']) / df['bar_size'].replace(0, np.nan)
        df['close_position'] = df['close_position'].fillna(0.5)
        df['upper_half_close'] = df['close_position'] > 0.5
        df['lower_half_close'] = df['close_position'] < 0.5
        df['strong_close_up'] = df['close_position'] > 0.75  # Very strong bullish close
        df['strong_close_down'] = df['close_position'] < 0.25  # Very strong bearish close
        
        # Significant wicks
        df['significant_upper_wick'] = df['upper_wick'] > (df['bar_size'] * 0.3)
        df['significant_lower_wick'] = df['lower_wick'] > (df['bar_size'] * 0.3)
        
        # Body to range ratio (how much of the bar range is body vs wick)
        df['body_to_range'] = df['body_size'] / df['bar_size'].replace(0, np.nan)
        df['body_to_range'] = df['body_to_range'].fillna(0)
        
        # Strong bars
        df['strong_bullish'] = df['is_bullish'] & (df['body_to_range'] > 0.7)
        df['strong_bearish'] = df['is_bearish'] & (df['body_to_range'] > 0.7)
        
        # Consecutive moves
        df['consec_up'] = 0
        df['consec_down'] = 0
        
        for i in range(1, len(df)):
            if df['close'].iloc[i] > df['close'].iloc[i-1]:
                df.loc[df.index[i], 'consec_up'] = df['consec_up'].iloc[i-1] + 1
            elif df['close'].iloc[i] < df['close'].iloc[i-1]:
                df.loc[df.index[i], 'consec_down'] = df['consec_down'].iloc[i-1] + 1
        
        # Potential reversal signals
        df['reversal_up_signal'] = (df['consec_down'] >= 3) & df['is_bullish']
        df['reversal_down_signal'] = (df['consec_up'] >= 3) & df['is_bearish']
        
        # Add bar size relative to recent average
        df['avg_bar_size_5'] = df['bar_size'].rolling(5).mean().shift(1)
        df['bar_size_vs_avg'] = df['bar_size'] / df['avg_bar_size_5'].replace(0, np.nan)
        df['bar_size_vs_avg'] = df['bar_size_vs_avg'].fillna(1.0)
        df['large_bar'] = df['bar_size_vs_avg'] > 1.5
        
        # Add candlestick patterns
        self._add_candlestick_patterns(df)
        
        logger.info(f"Added {len(df.columns) - 6} price action features to the dataset")
        
    def _add_candlestick_patterns(self, df: pd.DataFrame) -> None:
        """Add candlestick pattern recognition features."""
        # Engulfing patterns
        df['bullish_engulfing'] = (
            (df['is_bearish'].shift(1)) & 
            (df['is_bullish']) & 
            (df['open'] < df['close'].shift(1)) & 
            (df['close'] > df['open'].shift(1))
        )
        
        df['bearish_engulfing'] = (
            (df['is_bullish'].shift(1)) & 
            (df['is_bearish']) & 
            (df['open'] > df['close'].shift(1)) & 
            (df['close'] < df['open'].shift(1))
        )
        
        # Potential reversal patterns
        df['potential_bottom'] = (
            (df['is_bearish'].shift(3)) & 
            (df['is_bearish'].shift(2)) & 
            (df['is_bearish'].shift(1)) & 
            (df['is_bullish'])
        )
        
        df['potential_top'] = (
            (df['is_bullish'].shift(3)) & 
            (df['is_bullish'].shift(2)) & 
            (df['is_bullish'].shift(1)) & 
            (df['is_bearish'])
        )
        
        # Hammer pattern (bullish reversal)
        # Small upper wick, long lower wick, closes in upper half
        df['hammer'] = False
        for i in range(len(df)):
            if i > 0:  # Need previous bar for context
                body_size = abs(df.iloc[i]['close'] - df.iloc[i]['open'])
                lower_wick = df.iloc[i]['low'] - min(df.iloc[i]['open'], df.iloc[i]['close'])
                upper_wick = df.iloc[i]['high'] - max(df.iloc[i]['open'], df.iloc[i]['close'])
                close_position = (df.iloc[i]['close'] - df.iloc[i]['low']) / df.iloc[i]['bar_size']
                
                # Previous bar should be bearish for hammer context
                prev_bearish = df.iloc[i-1]['close'] < df.iloc[i-1]['open']
                
                if (lower_wick > 2 * body_size and 
                    upper_wick < 0.5 * body_size and 
                    close_position > 0.6 and 
                    prev_bearish):
                    df.loc[df.index[i], 'hammer'] = True
        
        # Shooting star pattern (bearish reversal)
        # Small lower wick, long upper wick, closes in lower half
        df['shooting_star'] = False
        for i in range(len(df)):
            if i > 0:  # Need previous bar for context
                body_size = abs(df.iloc[i]['close'] - df.iloc[i]['open'])
                lower_wick = min(df.iloc[i]['open'], df.iloc[i]['close']) - df.iloc[i]['low']
                upper_wick = df.iloc[i]['high'] - max(df.iloc[i]['open'], df.iloc[i]['close'])
                close_position = (df.iloc[i]['close'] - df.iloc[i]['low']) / df.iloc[i]['bar_size']
                
                # Previous bar should be bullish for shooting star context
                prev_bullish = df.iloc[i-1]['close'] > df.iloc[i-1]['open']
                
                if (upper_wick > 2 * body_size and 
                    lower_wick < 0.5 * body_size and 
                    close_position < 0.4 and 
                    prev_bullish):
                    df.loc[df.index[i], 'shooting_star'] = True
        
        # Rejection patterns
        df['upper_rejection'] = (df['upper_wick'] > (1.5 * df['body_size'])) & df['is_bearish']
        df['lower_rejection'] = (df['lower_wick'] > (1.5 * df['body_size'])) & df['is_bullish']
        
        # Outside bars (higher high and lower low than previous bar)
        df['outside_bar'] = (df['high'] > df['high'].shift(1)) & (df['low'] < df['low'].shift(1))
        
        # Inside bars (lower high and higher low than previous bar)
        df['inside_bar'] = (df['high'] < df['high'].shift(1)) & (df['low'] > df['low'].shift(1))
        
        # Key breakouts
        df['breakout_up'] = False
        df['breakout_down'] = False
        
        for i in range(len(df)):
            if i > 2:  # Need at least 3 previous bars
                # Calculate range of previous 3 bars
                prev_high = max(df.iloc[i-3:i]['high'])
                prev_low = min(df.iloc[i-3:i]['low'])
                
                # Breakout up: close above previous highs with strong bullish bar
                if (df.iloc[i]['close'] > prev_high and
                    df.iloc[i]['is_bullish'] and
                    df.iloc[i]['body_size'] > df.iloc[i-1:i]['body_size'].mean()):
                    df.loc[df.index[i], 'breakout_up'] = True
                
                # Breakout down: close below previous lows with strong bearish bar
                if (df.iloc[i]['close'] < prev_low and
                    df.iloc[i]['is_bearish'] and
                    df.iloc[i]['body_size'] > df.iloc[i-1:i]['body_size'].mean()):
                    df.loc[df.index[i], 'breakout_down'] = True
        
        # Three bar reversal pattern (bullish)
        df['three_bar_reversal_bull'] = False
        for i in range(len(df)):
            if i >= 2:  # Need at least 2 previous bars
                # Each bar lower than previous, then strong reversal bar
                if (df.iloc[i-2]['close'] < df.iloc[i-2]['open'] and
                    df.iloc[i-1]['close'] < df.iloc[i-1]['open'] and
                    df.iloc[i-1]['close'] < df.iloc[i-2]['close'] and
                    df.iloc[i]['close'] > df.iloc[i]['open'] and
                    df.iloc[i]['close'] > df.iloc[i-1]['open']):
                    df.loc[df.index[i], 'three_bar_reversal_bull'] = True
        
        # Three bar reversal pattern (bearish)
        df['three_bar_reversal_bear'] = False
        for i in range(len(df)):
            if i >= 2:  # Need at least 2 previous bars
                # Each bar higher than previous, then strong reversal bar
                if (df.iloc[i-2]['close'] > df.iloc[i-2]['open'] and
                    df.iloc[i-1]['close'] > df.iloc[i-1]['open'] and
                    df.iloc[i-1]['close'] > df.iloc[i-2]['close'] and
                    df.iloc[i]['close'] < df.iloc[i]['open'] and
                    df.iloc[i]['close'] < df.iloc[i-1]['open']):
                    df.loc[df.index[i], 'three_bar_reversal_bear'] = True
        
    def analyze_price_patterns(self) -> Dict[str, Dict]:
        """
        Analyze price patterns around trend points.
        
        Returns:
            Dict containing statistics for each trend type
        """
        if self.data is None or not self.trend_types:
            raise ValueError("No data or trend types available.")
        
        features = [col for col in self.data.columns 
                   if col not in ['timestamp', 'open', 'high', 'low', 'close', 'volume', 
                                 'is_trend_point', 'uptrendStart', 'downtrendStart']]
        
        results = {}
        
        for trend_type in self.trend_types:
            # Get indices of trend points
            trend_indices = self.data[self.data[trend_type] == True].index.tolist()
            
            if len(trend_indices) < self.min_samples:
                logger.warning(f"Insufficient samples for {trend_type} ({len(trend_indices)}). Skipping.")
                continue
            
            # Analyze price patterns at trend points
            pattern_stats = {}
            
            for feature in features:
                if self.data[feature].dtype == bool:
                    # For boolean features, calculate percentage of trend points with this feature
                    feature_rate = self.data.loc[trend_indices, feature].mean()
                    # Calculate baseline rate in non-trend points
                    non_trend_indices = self.data[self.data[trend_type] == False].index
                    non_trend_rate = self.data.loc[non_trend_indices, feature].mean()
                    
                    pattern_stats[feature] = {
                        'trend_rate': feature_rate,
                        'non_trend_rate': non_trend_rate,
                        'difference': feature_rate - non_trend_rate
                    }
            
            # Sort features by their effectiveness in identifying the trend
            sorted_features = sorted(
                [(f, stats['difference']) for f, stats in pattern_stats.items()],
                key=lambda x: abs(x[1]),
                reverse=True
            )
            
            results[trend_type] = {
                'sample_size': len(trend_indices),
                'significant_features': sorted_features[:10],  # Top 10 most significant features
                'pattern_stats': pattern_stats
            }
            
            # Log findings
            logger.info(f"Analysis for {trend_type} (samples: {len(trend_indices)})")
            logger.info("Top 5 distinguishing features:")
            for f, importance in sorted_features[:5]:
                logger.info(f"  - {f}: {importance:.4f}")
                
        self.stats_by_type = results
        return results
    
    def generate_detection_rules(self) -> Dict[str, List[str]]:
        """
        Generate detection rules based on price action patterns.
        
        Returns:
            Dict mapping trend types to lists of detection rules
        """
        if not self.stats_by_type:
            self.analyze_price_patterns()
            
        rules = {}
        
        for trend_type in self.trend_types:
            trend_rules = []
            
            # Get the most significant features for this trend type
            significant_features = self.stats_by_type[trend_type]['significant_features']
            
            for feature, difference in significant_features:
                if abs(difference) < 0.15:  # Skip features with minor differences
                    continue
                    
                feature_stats = self.stats_by_type[trend_type]['pattern_stats'][feature]
                trend_rate = feature_stats['trend_rate']
                
                # Only add features that appear in at least 40% of trend cases
                # or are at least twice as common in trend points than non-trend points
                non_trend_rate = feature_stats['non_trend_rate']
                if trend_rate >= 0.4 or (non_trend_rate > 0 and trend_rate / non_trend_rate >= 2):
                    if difference > 0:  # Feature is more common in trend points
                        trend_rules.append({
                            'feature': feature,
                            'condition': True,
                            'importance': difference
                        })
                    else:  # Feature is less common in trend points
                        trend_rules.append({
                            'feature': feature,
                            'condition': False,
                            'importance': -difference
                        })
            
            # Sort rules by importance
            trend_rules.sort(key=lambda x: x['importance'], reverse=True)
            
            # Keep only the top rules
            rules[trend_type] = trend_rules[:7]  # Use top 7 rules
            
            # Log the rules
            logger.info(f"Generated {len(trend_rules)} rules for {trend_type}:")
            for rule in trend_rules[:7]:
                logger.info(f"  - {rule['feature']} should be {rule['condition']} (importance: {rule['importance']:.4f})")
                
        self.pattern_rules = rules
        return rules
    
    def validate_rules(self, lookback: int = 5) -> Dict[str, float]:
        """
        Validate generated rules against labeled trend points.
        
        Args:
            lookback: Number of bars to look back for feature calculations
            
        Returns:
            Dict with accuracy metrics for each trend type
        """
        if not self.pattern_rules:
            self.generate_detection_rules()
            
        accuracy = {}
        debug_info = {}
        
        for trend_type, rules in self.pattern_rules.items():
            # Generate detection function for this trend type
            detect_func = self._create_detection_function(trend_type, rules)
            
            # Test on all bars
            detected = []
            true_positives = 0
            false_positives = 0
            false_negatives = 0
            
            trend_points = []
            
            # Tolerance window for detecting trend points (allow 1 bar before/after)
            # This accounts for the fact that trend starts can sometimes be ambiguous
            # in terms of exactly which bar marks the start
            tolerance = 1
            
            # Find all actual trend points first
            for idx in range(len(self.data)):
                if self.data.iloc[idx][trend_type]:
                    trend_points.append(idx)
            
            # Now detect and compare
            for idx in range(lookback, len(self.data)):
                is_detected = detect_func(self.data, idx, lookback)
                
                # Check if this is an actual trend point (with tolerance)
                is_actual = False
                for trend_idx in trend_points:
                    if abs(idx - trend_idx) <= tolerance:
                        is_actual = True
                        break
                
                if is_detected:
                    detected.append(idx)
                    
                # Count true positives, false positives, false negatives
                if is_detected and is_actual:
                    true_positives += 1
                elif is_detected and not is_actual:
                    false_positives += 1
                elif not is_detected and self.data.iloc[idx][trend_type]:
                    # Only count as false negative if it's exactly the labeled bar
                    # (to avoid double-counting within tolerance window)
                    false_negatives += 1
                    
            # Calculate accuracy metrics
            total_actual = len(trend_points)
            recall = true_positives / max(1, total_actual)
            precision = true_positives / max(1, true_positives + false_positives)
            f1 = 2 * precision * recall / max(0.001, precision + recall)
            
            accuracy[trend_type] = {
                'recall': recall,
                'precision': precision,
                'f1': f1,
                'true_positives': true_positives,
                'false_positives': false_positives,
                'false_negatives': false_negatives,
                'detected_count': len(detected),
                'actual_count': total_actual
            }
            
            debug_info[trend_type] = {
                'detected_indices': detected,
                'actual_indices': trend_points,
                'rules': rules
            }
            
            logger.info(f"Validation for {trend_type}:")
            logger.info(f"  - Detected: {len(detected)}, Actual: {total_actual}")
            logger.info(f"  - Precision: {precision:.4f}, Recall: {recall:.4f}, F1: {f1:.4f}")
            
        self.accuracy = accuracy
        self.debug_info = debug_info
        return accuracy
    
    def _create_detection_function(self, trend_type: str, rules: List[Dict]) -> callable:
        """
        Create a detection function based on the rules for a trend type.
        
        Args:
            trend_type: Type of trend to detect
            rules: List of rules for detecting the trend
            
        Returns:
            Function that takes (df, idx, lookback) and returns True/False
        """
        def detect_trend(df, idx, lookback=5):
            # Check if we have enough bars
            if idx < lookback:
                return False
                
            # Get current and previous bars
            current = df.iloc[idx]
            prev = df.iloc[idx-1] if idx > 0 else None
            
            # Basic bar direction check - uptrendStart requires bullish bar, downtrendStart requires bearish bar
            if trend_type == 'uptrendStart' and not current.get('is_bullish', False):
                return False
            if trend_type == 'downtrendStart' and not current.get('is_bearish', False):
                return False
            
            # Check each rule
            rule_results = []
            for rule in rules:
                feature = rule['feature']
                expected = rule['condition']
                
                # Skip if feature doesn't exist
                if feature not in current:
                    continue
                
                # Check if feature meets condition
                actual = bool(current[feature])
                rule_results.append(actual == expected)
            
            # Start with stricter criteria - require more than half the rules to be satisfied
            # The minimum is either 2 rules or half of the available rules, whichever is greater
            min_rules_required = max(2, len(rule_results) * 2 // 3)
            
            # Add special case pattern checks
            special_pattern_detected = False
            
            # For uptrendStart
            if trend_type == 'uptrendStart' and prev is not None:
                # Check for strong reversal signal: bullish bar after lower low with close in upper half
                if (current.get('is_bullish', False) and 
                    current.get('lower_low', False) and 
                    current.get('upper_half_close', False)):
                    special_pattern_detected = True
                    
                # Check for bullish engulfing
                if current.get('bullish_engulfing', False):
                    special_pattern_detected = True
            
            # For downtrendStart
            if trend_type == 'downtrendStart' and prev is not None:
                # Check for strong reversal signal: bearish bar after higher high with close in lower half
                if (current.get('is_bearish', False) and 
                    current.get('higher_high', False) and 
                    current.get('lower_half_close', False)):
                    special_pattern_detected = True
                    
                # Check for bearish engulfing
                if current.get('bearish_engulfing', False):
                    special_pattern_detected = True
            
            # Decision logic:
            # Either we need to meet the minimum number of rules
            # OR we need a special pattern plus at least one other rule satisfied
            rules_passed = sum(rule_results) >= min_rules_required
            pattern_passed = special_pattern_detected and sum(rule_results) >= 1
            
            return rules_passed or pattern_passed
            
        return detect_trend
    
    def refine_rules(self, iterations: int = 3) -> Dict[str, List[Dict]]:
        """
        Iteratively refine detection rules to improve accuracy.
        
        Args:
            iterations: Number of refinement iterations
            
        Returns:
            Dict with refined rules for each trend type
        """
        if not self.pattern_rules:
            self.generate_detection_rules()
            
        for i in range(iterations):
            logger.info(f"Rule refinement iteration {i+1}/{iterations}")
            
            # Validate current rules
            self.validate_rules()
            
            # For each trend type, adjust rules based on validation results
            for trend_type in self.trend_types:
                if trend_type not in self.pattern_rules:
                    continue
                    
                accuracy = self.accuracy.get(trend_type, {})
                debug_info = self.debug_info.get(trend_type, {})
                
                # Get current metrics
                recall = accuracy.get('recall', 0)
                precision = accuracy.get('precision', 0)
                
                # Target minimum precision of 0.4 (40%)
                # We prioritize precision over recall to reduce false positives
                
                if precision < 0.4:  # Too many false positives
                    # Add more distinctive features if available
                    all_features = self.stats_by_type.get(trend_type, {}).get('significant_features', [])
                    current_features = [rule['feature'] for rule in self.pattern_rules[trend_type]]
                    
                    # Find a feature with strong importance that isn't already used
                    added_feature = False
                    for feature, importance in all_features:
                        if feature not in current_features and abs(importance) > 0.15:
                            stats = self.stats_by_type[trend_type]['pattern_stats'][feature]
                            self.pattern_rules[trend_type].append({
                                'feature': feature,
                                'condition': importance > 0,  # True if more common in trend points
                                'importance': abs(importance)
                            })
                            logger.info(f"  - Added feature {feature} to {trend_type} rules to improve precision")
                            added_feature = True
                            break
                            
                    # If we couldn't add new features, make existing rules more strict
                    if not added_feature and len(self.pattern_rules[trend_type]) > 0:
                        # Increase the minimum number of required true conditions
                        logger.info(f"  - Making rules more strict for {trend_type} to improve precision")
                        self.min_true_conditions = max(2, len(self.pattern_rules[trend_type]) // 2 + 1)
                
                # Only if precision is good but recall is too low, make rules less strict
                elif recall < 0.5 and precision > 0.5:
                    # Remove the least important rule to make detection less restrictive
                    if len(self.pattern_rules[trend_type]) > 3:
                        self.pattern_rules[trend_type] = self.pattern_rules[trend_type][:-1]
                        logger.info(f"  - Removed least important rule for {trend_type} to improve recall")
                
                # Sort rules by importance again
                self.pattern_rules[trend_type].sort(key=lambda x: x['importance'], reverse=True)
                
        # Final validation
        final_accuracy = self.validate_rules()
        
        # Log final performance
        for trend_type, metrics in final_accuracy.items():
            precision = metrics.get('precision', 0)
            recall = metrics.get('recall', 0)
            f1 = metrics.get('f1', 0)
            logger.info(f"Final metrics for {trend_type}: Precision={precision:.4f}, Recall={recall:.4f}, F1={f1:.4f}")
        
        return self.pattern_rules
    
    def generate_detection_code(self, trend_type: str) -> str:
        """
        Generate Python code for detecting the specified trend type.
        
        Args:
            trend_type: The trend type to generate detection code for
            
        Returns:
            String containing Python function code for detecting the trend
        """
        if trend_type == 'uptrendStart':
            return self._generate_uptrend_code()
        elif trend_type == 'downtrendStart':
            return self._generate_downtrend_code()
        else:
            raise ValueError(f"Unsupported trend type: {trend_type}")
    
    def _generate_uptrend_code(self) -> str:
        """Generate code for detecting uptrend starts based on price action."""
        code = """def detect_uptrendstart(df, idx, lookback=5):
    \"\"\"
    Detect uptrendStart pattern based on price action and candlestick patterns.
    
    Args:
        df: DataFrame with OHLC data
        idx: Index of the bar to check
        lookback: Number of bars to look back
    
    Returns:
        bool: True if pattern is detected, False otherwise
    \"\"\"
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
        
    # Get current bar and previous bars
    current = df.iloc[idx]
    prev = df.iloc[idx-1] if idx > 0 else None
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    
    # Required condition: Current bar must be bullish
    is_bullish = current['close'] > current['open']
    if not is_bullish:
        return False
    
    # Multi-bar price pattern analysis
    # Look for reversal patterns and confirmation signals
    
    # Pattern 1: Lower low followed by strong bullish close
    pattern1 = False
    if prev:
        # Check for lower low
        lower_low = current['low'] < prev['low']
        
        # Check for strong close in upper half of bar
        bar_range = current['high'] - current['low']
        upper_half_close = current['close'] > (current['low'] + bar_range * 0.6)
        
        pattern1 = lower_low and upper_half_close
    
    # Pattern 2: Bullish engulfing after downtrend
    pattern2 = False
    if prev and prev2 and prev3:
        # Check for downtrend in previous bars
        previous_downtrend = (prev['close'] < prev['open'] and 
                             prev2['close'] < prev2['open'])
        
        # Check for bullish engulfing
        engulfs_body = current['open'] < prev['close'] and current['close'] > prev['open']
        
        pattern2 = previous_downtrend and engulfs_body
    
    # Pattern 3: Inside bar breakout
    pattern3 = False
    if prev and prev2:
        # Check for inside bar followed by breakout
        inside_bar = (prev['high'] < prev2['high'] and prev['low'] > prev2['low'])
        breakout = current['close'] > prev['high']
        
        pattern3 = inside_bar and breakout
    
    # Pattern 4: Hammer pattern with confirmation
    pattern4 = False
    if prev:
        # Hammer has small upper wick, long lower wick, and closes in upper half
        lower_wick = current['low'] - min(current['open'], current['close'])
        upper_wick = current['high'] - max(current['open'], current['close'])
        body_size = abs(current['close'] - current['open'])
        
        is_hammer = (lower_wick > 2 * body_size and 
                    upper_wick < 0.5 * body_size and 
                    upper_half_close)
                    
        # Previous bar should be bearish
        prev_bearish = prev['close'] < prev['open']
        
        pattern4 = is_hammer and prev_bearish
    
    # Check if volume is available for additional confirmation
    has_volume_confirmation = False
    if 'volume' in df.columns:
        # Look for increased volume on potential reversal bar
        avg_volume = df['volume'].iloc[max(0, idx-lookback):idx].mean() if idx > 0 else 0
        volume_increase = current['volume'] > avg_volume * 1.2 if avg_volume > 0 else False
        has_volume_confirmation = volume_increase
    
    # We require at least one strong pattern plus confirmation
    # OR at least two patterns without confirmation
    basic_confirmation = pattern1 or pattern2 or pattern3 or pattern4
    
    # Count how many patterns we have
    pattern_count = sum([pattern1, pattern2, pattern3, pattern4])
    
    # Final decision logic
    return (basic_confirmation and has_volume_confirmation) or (pattern_count >= 2)"""
        
        return code
    
    def _generate_downtrend_code(self) -> str:
        """Generate code for detecting downtrend starts based on price action."""
        code = """def detect_downtrendstart(df, idx, lookback=5):
    \"\"\"
    Detect downtrendStart pattern based on price action and candlestick patterns.
    
    Args:
        df: DataFrame with OHLC data
        idx: Index of the bar to check
        lookback: Number of bars to look back
    
    Returns:
        bool: True if pattern is detected, False otherwise
    \"\"\"
    # Check if we have enough bars for lookback
    if idx < lookback:
        return False
        
    # Get current bar and previous bars
    current = df.iloc[idx]
    prev = df.iloc[idx-1] if idx > 0 else None
    prev2 = df.iloc[idx-2] if idx > 1 else None
    prev3 = df.iloc[idx-3] if idx > 2 else None
    
    # Required condition: Current bar must be bearish
    is_bearish = current['close'] < current['open']
    if not is_bearish:
        return False
    
    # Multi-bar price pattern analysis
    # Look for reversal patterns and confirmation signals
    
    # Pattern 1: Higher high followed by strong bearish close
    pattern1 = False
    if prev:
        # Check for higher high
        higher_high = current['high'] > prev['high']
        
        # Check for strong close in lower half of bar
        bar_range = current['high'] - current['low']
        lower_half_close = current['close'] < (current['low'] + bar_range * 0.4)
        
        pattern1 = higher_high and lower_half_close
    
    # Pattern 2: Bearish engulfing after uptrend
    pattern2 = False
    if prev and prev2 and prev3:
        # Check for uptrend in previous bars
        previous_uptrend = (prev['close'] > prev['open'] and 
                           prev2['close'] > prev2['open'])
        
        # Check for bearish engulfing
        engulfs_body = current['open'] > prev['close'] and current['close'] < prev['open']
        
        pattern2 = previous_uptrend and engulfs_body
    
    # Pattern 3: Inside bar breakdown
    pattern3 = False
    if prev and prev2:
        # Check for inside bar followed by breakdown
        inside_bar = (prev['high'] < prev2['high'] and prev['low'] > prev2['low'])
        breakdown = current['close'] < prev['low']
        
        pattern3 = inside_bar and breakdown
    
    # Pattern 4: Shooting star pattern with confirmation
    pattern4 = False
    if prev:
        # Shooting star has small lower wick, long upper wick, and closes in lower half
        upper_wick = current['high'] - max(current['open'], current['close'])
        lower_wick = min(current['open'], current['close']) - current['low']
        body_size = abs(current['close'] - current['open'])
        
        is_shooting_star = (upper_wick > 2 * body_size and 
                           lower_wick < 0.5 * body_size and 
                           lower_half_close)
                           
        # Previous bar should be bullish
        prev_bullish = prev['close'] > prev['open']
        
        pattern4 = is_shooting_star and prev_bullish
    
    # Check if volume is available for additional confirmation
    has_volume_confirmation = False
    if 'volume' in df.columns:
        # Look for increased volume on potential reversal bar
        avg_volume = df['volume'].iloc[max(0, idx-lookback):idx].mean() if idx > 0 else 0
        volume_increase = current['volume'] > avg_volume * 1.2 if avg_volume > 0 else False
        has_volume_confirmation = volume_increase
    
    # We require at least one strong pattern plus confirmation
    # OR at least two patterns without confirmation
    basic_confirmation = pattern1 or pattern2 or pattern3 or pattern4
    
    # Count how many patterns we have
    pattern_count = sum([pattern1, pattern2, pattern3, pattern4])
    
    # Final decision logic
    return (basic_confirmation and has_volume_confirmation) or (pattern_count >= 2)"""
        
        return code
    
    def visualize_trend_patterns(self, trend_type: str, detected_vs_actual: bool = True, 
                               num_examples: int = 5, window_size: int = 10) -> None:
        """
        Visualize patterns around trend points of specific type.
        
        Args:
            trend_type: Type of trend to visualize
            detected_vs_actual: Whether to compare detected vs actual trend points
            num_examples: Number of examples to visualize
            window_size: Number of bars to show before and after the trend point
        """
        if trend_type not in self.trend_types:
            raise ValueError(f"Trend type '{trend_type}' not found in data")
            
        # Find trend bars
        trend_indices = self.data[self.data[trend_type] == True].index.tolist()
        
        if not trend_indices:
            logger.warning(f"No {trend_type} trend points found in data")
            return
            
        # If comparing detected vs actual, get detected indices
        if detected_vs_actual and trend_type in self.debug_info:
            detected_indices = self.debug_info[trend_type]['detected_indices']
            # Find false positives and false negatives
            false_positives = [idx for idx in detected_indices if idx not in trend_indices]
            false_negatives = [idx for idx in trend_indices if idx not in detected_indices]
            
            # Prepare indices to plot
            to_plot = []
            # Add some true positives
            true_positives = [idx for idx in detected_indices if idx in trend_indices]
            to_plot.extend(true_positives[:num_examples // 3])
            # Add some false positives
            to_plot.extend(false_positives[:num_examples // 3])
            # Add some false negatives
            to_plot.extend(false_negatives[:num_examples // 3])
            
            indices_to_plot = to_plot[:num_examples]
            plot_types = ['True Positive' if idx in true_positives else
                          'False Positive' if idx in false_positives else
                          'False Negative' for idx in indices_to_plot]
        else:
            # Just plot actual trend points
            indices_to_plot = trend_indices[:num_examples]
            plot_types = ['Actual' for _ in indices_to_plot]
        
        # Create plots
        plt.figure(figsize=(15, num_examples * 6))
        
        for i, (idx, plot_type) in enumerate(zip(indices_to_plot, plot_types)):
            # Ensure we have enough bars before and after
            start_idx = max(0, idx - window_size)
            end_idx = min(len(self.data) - 1, idx + window_size)
            
            # Extract window of bars
            window = self.data.iloc[start_idx:end_idx + 1].copy()
            
            # Plot candles
            ax1 = plt.subplot(num_examples, 1, i + 1)
            
            # Convert window to format for plotting
            window_reset = window.reset_index(drop=True)
            
            # Mark the trend bar
            trend_bar_idx = idx - start_idx
            
            # Plot OHLC
            for j, row in window_reset.iterrows():
                # Bar color
                if row['close'] >= row['open']:
                    color = 'green'
                    body_bottom = row['open']
                else:
                    color = 'red'
                    body_bottom = row['close']
                
                body_height = abs(row['close'] - row['open'])
                width = 0.8
                
                # Plot the body
                alpha = 1.0 if j == trend_bar_idx else 0.7
                ax1.add_patch(plt.Rectangle(
                    (j - width/2, body_bottom),
                    width, body_height,
                    fill=True, color=color, alpha=alpha
                ))
                
                # Plot the wicks
                ax1.plot([j, j], [row['low'], min(row['open'], row['close'])], color='black')
                ax1.plot([j, j], [max(row['open'], row['close']), row['high']], color='black')
            
            # Mark the trend bar
            color = 'blue' if plot_type == 'Actual' or plot_type == 'True Positive' else 'orange' if plot_type == 'False Positive' else 'red'
            ax1.axvline(x=trend_bar_idx, color=color, linestyle='--', alpha=0.6)
            
            # Add title
            trend_timestamp = window.iloc[trend_bar_idx]['timestamp']
            ax1.set_title(f"{trend_type} ({plot_type}) at {trend_timestamp}")
            
            # Set y-axis limits with some padding
            price_min = window['low'].min()
            price_max = window['high'].max()
            price_range = price_max - price_min
            ax1.set_ylim(price_min - price_range * 0.1, price_max + price_range * 0.1)
            
        plt.tight_layout()
        plt.show()

    def get_detection_algorithms(self) -> Dict[str, str]:
        """
        Get detection algorithms for all trend types.
        
        Returns:
            Dictionary with trend type as key and detection code as value
        """
        algorithms = {}
        
        for trend_type in self.trend_types:
            algorithms[trend_type.lower()] = self.generate_detection_code(trend_type)
            
        return algorithms

# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # This is just a placeholder example - actual usage would load real data
    try:
        # Example synthetic data (for illustration purposes only)
        ohlc_data = pd.DataFrame({
            'timestamp': pd.date_range(start='2023-01-01', periods=1000, freq='H'),
            'open': np.random.normal(100, 5, 1000),
            'high': np.random.normal(105, 5, 1000),
            'low': np.random.normal(95, 5, 1000),
            'close': np.random.normal(100, 5, 1000),
            'volume': np.random.normal(1000, 200, 1000)
        })
        
        # Create analyzer and run example
        analyzer = TrendPatternAnalyzer()
        print("This is an example placeholder - use the actual API in your code")
            
    except Exception as e:
        logger.error(f"Error in example: {str(e)}") 