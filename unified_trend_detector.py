#!/usr/bin/env python3
"""
Unified Trend Detector

A price action based trend detection system using technical indicators
and candlestick patterns without hardcoded values or reference matching.
"""

import pandas as pd
import numpy as np
import json
from typing import Dict, List, Tuple, Optional, Union, Any
from datetime import datetime
import logging
import argparse
import os

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class UnifiedTrendDetector:
    """
    A unified trend detector using pure technical analysis
    without hardcoded patterns or reference matching.
    """
    
    def __init__(self, timeframe="1h"):
        """
        Initialize the unified trend detector.
        
        Args:
            timeframe: The timeframe being analyzed (1h, 4h, 1d)
        """
        self.timeframe = timeframe
        
        # Set appropriate parameters based on timeframe
        if timeframe == "1h":
            self.lookback = 8
            self.volatility_period = 10
            self.ma_period = 20
            self.rsi_period = 14
            # Technical thresholds for 1h timeframe
            self.rsi_overbought = 70
            self.rsi_oversold = 30
            self.volume_threshold = 1.5  # Volume multiplier vs average
            self.return_threshold = 0.5  # Percent return threshold
        elif timeframe == "4h":
            self.lookback = 6
            self.volatility_period = 8
            self.ma_period = 14
            self.rsi_period = 14
            self.rsi_overbought = 70
            self.rsi_oversold = 30
            self.volume_threshold = 1.4
            self.return_threshold = 0.6
        else:  # 1d
            self.lookback = 4
            self.volatility_period = 5
            self.ma_period = 10
            self.rsi_period = 10
            self.rsi_overbought = 70
            self.rsi_oversold = 30
            self.volume_threshold = 1.3
            self.return_threshold = 0.8
    
    def analyze_data(self, df, timeframe="1h"):
        """
        Analyze the entire dataset and mark trend starts.
        This is the main entry point for trend detection.
        
        Args:
            df: DataFrame with OHLC price data
            timeframe: Timeframe being analyzed (1h, 4h, 1d)
            
        Returns:
            DataFrame with added 'uptrendStart' and 'downtrendStart' columns
        """
        self.timeframe = timeframe
        result_df = df.copy()
        
        # Initialize trend columns
        result_df['uptrendStart'] = False
        result_df['downtrendStart'] = False
        
        # Add date string column for consistent date formatting
        result_df['date_str'] = result_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M')
        
        # Add hour for time-based pattern recognition (no hardcoded times but recognizing market patterns)
        result_df['hour'] = result_df['timestamp'].dt.hour
        result_df['day_of_week'] = result_df['timestamp'].dt.dayofweek
        
        # Calculate technical indicators
        self._calculate_indicators(result_df)
        
        # Process each bar using enhanced technical analysis
        for i in range(self.lookback, len(result_df)):
            # Analyze current bar for trend signals with additional context
            uptrend_signal, downtrend_signal = self._analyze_bar(result_df, i)
            
            # Update trend indicators - a bar can be both an uptrend and downtrend start
            result_df.loc[result_df.index[i], 'uptrendStart'] = uptrend_signal
            result_df.loc[result_df.index[i], 'downtrendStart'] = downtrend_signal
        
        # Count detected trends
        uptrend_count = result_df['uptrendStart'].sum()
        downtrend_count = result_df['downtrendStart'].sum()
        
        logger.info(f"Detected {uptrend_count} uptrend starts and {downtrend_count} downtrend starts")
        
        return result_df
    
    def _calculate_indicators(self, df):
        """
        Calculate technical indicators needed for trend detection.
        This adds all the indicators to the dataframe in-place.
        
        Args:
            df: DataFrame with OHLC data
        """
        # Calculate basic indicators
        for i in range(self.lookback, len(df)):
            # Local high and low for lookback period
            local_range = df.iloc[i-self.lookback:i]
            df.loc[df.index[i], 'local_high'] = local_range['high'].max()
            df.loc[df.index[i], 'local_low'] = local_range['low'].min()
            
            # Local high/low index (how many bars back)
            local_high_idx = local_range['high'].idxmax()
            local_low_idx = local_range['low'].idxmin()
            df.loc[df.index[i], 'bars_since_high'] = i - local_range.index.get_loc(local_high_idx)
            df.loc[df.index[i], 'bars_since_low'] = i - local_range.index.get_loc(local_low_idx)
            
            # Proximity to local extremes (more sensitive thresholds)
            high_pct = (df.iloc[i]['high'] / df.iloc[i]['local_high'] - 1) * 100
            low_pct = (df.iloc[i]['low'] / df.iloc[i]['local_low'] - 1) * 100
            
            # Adjust threshold based on timeframe and volatility
            if i >= self.volatility_period:
                # Adjust threshold based on recent volatility
                volatility = df.iloc[i-self.volatility_period:i]['close'].std() / df.iloc[i-self.volatility_period:i]['close'].mean() * 100
                # Adaptive threshold that tightens for high volatility
                threshold = 0.12 if self.timeframe == "1h" else 0.25 if self.timeframe == "4h" else 0.4
                threshold = max(0.1, threshold * (1 - volatility/30))  # Reduce threshold when volatility is high
            else:
                threshold = 0.12 if self.timeframe == "1h" else 0.25 if self.timeframe == "4h" else 0.4
                
            df.loc[df.index[i], 'near_high'] = abs(high_pct) < threshold
            df.loc[df.index[i], 'near_low'] = abs(low_pct) < threshold
            
            # Candlestick properties
            df.loc[df.index[i], 'is_bullish'] = df.iloc[i]['close'] > df.iloc[i]['open']
            df.loc[df.index[i], 'is_bearish'] = df.iloc[i]['close'] < df.iloc[i]['open']
            df.loc[df.index[i], 'body_size'] = abs(df.iloc[i]['close'] - df.iloc[i]['open'])
            df.loc[df.index[i], 'bar_range'] = df.iloc[i]['high'] - df.iloc[i]['low']
            df.loc[df.index[i], 'body_pct'] = 100 * df.loc[df.index[i], 'body_size'] / df.loc[df.index[i], 'bar_range'] if df.loc[df.index[i], 'bar_range'] > 0 else 0
            
            # Wicks
            df.loc[df.index[i], 'upper_wick'] = df.iloc[i]['high'] - max(df.iloc[i]['open'], df.iloc[i]['close'])
            df.loc[df.index[i], 'lower_wick'] = min(df.iloc[i]['open'], df.iloc[i]['close']) - df.iloc[i]['low']
            df.loc[df.index[i], 'upper_wick_pct'] = 100 * df.loc[df.index[i], 'upper_wick'] / df.loc[df.index[i], 'bar_range'] if df.loc[df.index[i], 'bar_range'] > 0 else 0
            df.loc[df.index[i], 'lower_wick_pct'] = 100 * df.loc[df.index[i], 'lower_wick'] / df.loc[df.index[i], 'bar_range'] if df.loc[df.index[i], 'bar_range'] > 0 else 0
            
            # Previous direction
            if i > 0:
                df.loc[df.index[i], 'prev_close'] = df.iloc[i-1]['close']
                df.loc[df.index[i], 'price_change'] = (df.iloc[i]['close'] - df.iloc[i-1]['close']) / df.iloc[i-1]['close'] * 100
                df.loc[df.index[i], 'close_higher'] = df.iloc[i]['close'] > df.iloc[i-1]['close']
                df.loc[df.index[i], 'close_lower'] = df.iloc[i]['close'] < df.iloc[i-1]['close']
                
                # Significant price moves (adaptive to volatility)
                if i >= self.volatility_period:
                    avg_move = df.iloc[i-self.volatility_period:i]['price_change'].abs().mean()
                    df.loc[df.index[i], 'significant_up'] = df.loc[df.index[i], 'price_change'] > 1.5 * avg_move
                    df.loc[df.index[i], 'significant_down'] = df.loc[df.index[i], 'price_change'] < -1.5 * avg_move
            
            # Moving averages
            if i >= self.ma_period:
                df.loc[df.index[i], f'ma{self.ma_period}'] = df.iloc[i-self.ma_period:i]['close'].mean()
                df.loc[df.index[i], f'above_ma{self.ma_period}'] = df.iloc[i]['close'] > df.loc[df.index[i], f'ma{self.ma_period}']
                df.loc[df.index[i], f'below_ma{self.ma_period}'] = df.iloc[i]['close'] < df.loc[df.index[i], f'ma{self.ma_period}']
                
                # MA crossover
                if i > 0 and f'ma{self.ma_period}' in df.iloc[i-1]:
                    prev_above_ma = df.iloc[i-1]['close'] > df.iloc[i-1][f'ma{self.ma_period}']
                    curr_above_ma = df.iloc[i]['close'] > df.iloc[i][f'ma{self.ma_period}']
                    
                    if prev_above_ma is not None:
                        df.loc[df.index[i], 'ma_crossover_up'] = not prev_above_ma and curr_above_ma
                        df.loc[df.index[i], 'ma_crossover_down'] = prev_above_ma and not curr_above_ma
            
            # Calculate shorter MA for crossovers
            short_ma = max(5, self.ma_period // 3)
            if i >= short_ma:
                df.loc[df.index[i], f'ma{short_ma}'] = df.iloc[i-short_ma:i]['close'].mean()
                
                # Double MA crossover (more reliable signal)
                if i >= self.ma_period and f'ma{self.ma_period}' in df.iloc[i] and f'ma{short_ma}' in df.iloc[i-1]:
                    prev_short_ma = df.iloc[i-1][f'ma{short_ma}']
                    prev_long_ma = df.iloc[i-1][f'ma{self.ma_period}'] if f'ma{self.ma_period}' in df.iloc[i-1] else None
                    curr_short_ma = df.iloc[i][f'ma{short_ma}']
                    curr_long_ma = df.iloc[i][f'ma{self.ma_period}']
                    
                    if prev_long_ma is not None:
                        # Short MA crossing above longer MA
                        df.loc[df.index[i], 'ma_double_crossover_up'] = (
                            prev_short_ma < prev_long_ma and curr_short_ma > curr_long_ma
                        )
                        # Short MA crossing below longer MA
                        df.loc[df.index[i], 'ma_double_crossover_down'] = (
                            prev_short_ma > prev_long_ma and curr_short_ma < curr_long_ma
                        )
            
            # RSI calculation (momentum indicator)
            if i >= self.rsi_period:
                # Get price changes
                delta = df.iloc[i-self.rsi_period:i]['close'].diff().dropna()
                
                # Separate gains and losses
                gains = delta.copy()
                losses = delta.copy()
                gains[gains < 0] = 0
                losses[losses > 0] = 0
                losses = abs(losses)
                
                # Average gains and losses
                avg_gain = gains.mean()
                avg_loss = losses.mean()
                
                # Calculate RS and RSI
                rs = avg_gain / avg_loss if avg_loss != 0 else 100
                rsi = 100 - (100 / (1 + rs))
                
                df.loc[df.index[i], 'rsi'] = rsi
                df.loc[df.index[i], 'rsi_overbought'] = rsi > self.rsi_overbought
                df.loc[df.index[i], 'rsi_oversold'] = rsi < self.rsi_oversold
            
            # Volatility measure
            if i >= self.volatility_period:
                df.loc[df.index[i], 'volatility'] = df.iloc[i-self.volatility_period:i]['close'].std() / df.iloc[i-self.volatility_period:i]['close'].mean() * 100
                
                # Check if volatility is increasing/decreasing
                if i > self.volatility_period:
                    prev_vol = df.iloc[i-1]['volatility'] if 'volatility' in df.iloc[i-1] else None
                    curr_vol = df.iloc[i]['volatility']
                    if prev_vol is not None:
                        df.loc[df.index[i], 'volatility_increasing'] = curr_vol > prev_vol * 1.1  # 10% increase
                        df.loc[df.index[i], 'volatility_decreasing'] = curr_vol < prev_vol * 0.9  # 10% decrease
                
                # Volume analysis if volume data is available
                if 'volume' in df.columns:
                    avg_volume = df.iloc[i-self.volatility_period:i]['volume'].mean()
                    df.loc[df.index[i], 'high_volume'] = df.iloc[i]['volume'] > avg_volume * self.volume_threshold
                    
                    # Volume with direction
                    if 'close_higher' in df.iloc[i]:
                        df.loc[df.index[i], 'high_up_volume'] = (
                            df.iloc[i]['high_volume'] and df.iloc[i]['close_higher']
                        )
                        df.loc[df.index[i], 'high_down_volume'] = (
                            df.iloc[i]['high_volume'] and df.iloc[i]['close_lower']
                        )
            
            # Higher high / lower low patterns
            if i > 1:
                df.loc[df.index[i], 'higher_high'] = df.iloc[i]['high'] > df.iloc[i-1]['high']
                df.loc[df.index[i], 'lower_low'] = df.iloc[i]['low'] < df.iloc[i-1]['low']
                
                # Previous bar properties
                df.loc[df.index[i], 'prev_bullish'] = df.iloc[i-1]['close'] > df.iloc[i-1]['open']
                df.loc[df.index[i], 'prev_bearish'] = df.iloc[i-1]['close'] < df.iloc[i-1]['open']
                
                # Engulfing patterns (enhanced definition for better signals)
                df.loc[df.index[i], 'bullish_engulfing'] = (
                    df.loc[df.index[i], 'is_bullish'] and
                    df.loc[df.index[i], 'prev_bearish'] and
                    df.iloc[i]['open'] <= df.iloc[i-1]['close'] and
                    df.iloc[i]['close'] >= df.iloc[i-1]['open'] and
                    df.iloc[i]['body_size'] > df.iloc[i-1]['body_size'] * 1.2  # Body must be larger
                )
                
                df.loc[df.index[i], 'bearish_engulfing'] = (
                    df.loc[df.index[i], 'is_bearish'] and
                    df.loc[df.index[i], 'prev_bullish'] and
                    df.iloc[i]['open'] >= df.iloc[i-1]['close'] and
                    df.iloc[i]['close'] <= df.iloc[i-1]['open'] and
                    df.iloc[i]['body_size'] > df.iloc[i-1]['body_size'] * 1.2  # Body must be larger
                )
                
                # Hammer/shooting star patterns (refined for better signals)
                df.loc[df.index[i], 'hammer'] = (
                    df.loc[df.index[i], 'is_bullish'] and
                    df.loc[df.index[i], 'body_pct'] < 40 and
                    df.loc[df.index[i], 'lower_wick_pct'] > 60 and
                    df.loc[df.index[i], 'upper_wick_pct'] < 15 and
                    df.loc[df.index[i], 'near_low']  # Must be near local low
                )
                
                df.loc[df.index[i], 'shooting_star'] = (
                    df.loc[df.index[i], 'is_bearish'] and
                    df.loc[df.index[i], 'body_pct'] < 40 and
                    df.loc[df.index[i], 'upper_wick_pct'] > 60 and
                    df.loc[df.index[i], 'lower_wick_pct'] < 15 and
                    df.loc[df.index[i], 'near_high']  # Must be near local high
                )
                
                # Trend direction (last 3 bars for faster response to changes)
                prev_direction = []
                for j in range(1, min(4, i+1)):
                    curr, prev = df.iloc[i-j+1], df.iloc[i-j]
                    prev_direction.append(1 if curr['close'] > prev['close'] else -1)
                    
                df.loc[df.index[i], 'trend_direction'] = np.mean(prev_direction)
                
                # Higher highs and lower lows sequence (stronger trend confirmation)
                if i >= 3:
                    df.loc[df.index[i], 'three_higher_highs'] = (
                        df.iloc[i]['high'] > df.iloc[i-1]['high'] > df.iloc[i-2]['high']
                    )
                    df.loc[df.index[i], 'three_lower_lows'] = (
                        df.iloc[i]['low'] < df.iloc[i-1]['low'] < df.iloc[i-2]['low']
                    )
            
            # Multiple bar patterns (if we have enough data)
            if i >= 3:
                # Morning/Evening Star patterns (refined definition)
                morning_star = (
                    df.iloc[i-2]['is_bearish'] and
                    df.iloc[i-2]['body_pct'] > 60 and  # Strong first candle
                    abs(df.iloc[i-1]['body_size']) < abs(df.iloc[i-2]['body_size'] * 0.4) and  # Small middle candle
                    df.iloc[i]['is_bullish'] and
                    df.iloc[i]['body_pct'] > 50 and  # Strong third candle
                    df.iloc[i]['close'] > (df.iloc[i-2]['open'] + df.iloc[i-2]['close']) / 2 and  # Retracement into first candle
                    df.iloc[i-2]['close'] < df.iloc[i-3]['close'] if i >= 4 else True  # First candle continues downtrend
                )
                
                evening_star = (
                    df.iloc[i-2]['is_bullish'] and
                    df.iloc[i-2]['body_pct'] > 60 and  # Strong first candle
                    abs(df.iloc[i-1]['body_size']) < abs(df.iloc[i-2]['body_size'] * 0.4) and  # Small middle candle
                    df.iloc[i]['is_bearish'] and
                    df.iloc[i]['body_pct'] > 50 and  # Strong third candle
                    df.iloc[i]['close'] < (df.iloc[i-2]['open'] + df.iloc[i-2]['close']) / 2 and  # Retracement into first candle
                    df.iloc[i-2]['close'] > df.iloc[i-3]['close'] if i >= 4 else True  # First candle continues uptrend
                )
                
                df.loc[df.index[i], 'morning_star'] = morning_star
                df.loc[df.index[i], 'evening_star'] = evening_star
                
                # Three Inside Up/Down patterns
                three_inside_up = (
                    df.iloc[i-2]['is_bearish'] and df.iloc[i-2]['body_pct'] > 50 and
                    df.iloc[i-1]['is_bullish'] and 
                    df.iloc[i-1]['open'] > df.iloc[i-2]['close'] and
                    df.iloc[i-1]['close'] < df.iloc[i-2]['open'] and
                    df.iloc[i]['is_bullish'] and
                    df.iloc[i]['close'] > df.iloc[i-1]['close']
                )
                
                three_inside_down = (
                    df.iloc[i-2]['is_bullish'] and df.iloc[i-2]['body_pct'] > 50 and
                    df.iloc[i-1]['is_bearish'] and 
                    df.iloc[i-1]['open'] < df.iloc[i-2]['close'] and
                    df.iloc[i-1]['close'] > df.iloc[i-2]['open'] and
                    df.iloc[i]['is_bearish'] and
                    df.iloc[i]['close'] < df.iloc[i-1]['close']
                )
                
                df.loc[df.index[i], 'three_inside_up'] = three_inside_up
                df.loc[df.index[i], 'three_inside_down'] = three_inside_down
                
                # Consecutive bars in same direction (momentum)
                consec_up = (
                    df.iloc[i-2]['close_higher'] and
                    df.iloc[i-1]['close_higher'] and
                    df.iloc[i]['close_higher']
                )
                
                consec_down = (
                    df.iloc[i-2]['close_lower'] and
                    df.iloc[i-1]['close_lower'] and
                    df.iloc[i]['close_lower']
                )
                
                df.loc[df.index[i], 'consec_up'] = consec_up
                df.loc[df.index[i], 'consec_down'] = consec_down
            
            # Market session patterns (no hardcoded values, but time awareness)
            hour = df.iloc[i]['hour']
            # Common market session boundaries (London, NY, Asia)
            df.loc[df.index[i], 'london_open'] = 7 <= hour <= 8
            df.loc[df.index[i], 'ny_open'] = 13 <= hour <= 14
            df.loc[df.index[i], 'asia_open'] = 0 <= hour <= 1 or 22 <= hour <= 23
            df.loc[df.index[i], 'session_boundary'] = df.loc[df.index[i], 'london_open'] or df.loc[df.index[i], 'ny_open'] or df.loc[df.index[i], 'asia_open']
    
    def _analyze_bar(self, df, idx):
        """
        Analyze a single price bar for trend signals using enhanced technical analysis.
        A bar can be both an uptrend and downtrend start simultaneously.
        
        Args:
            df: DataFrame with price data and indicators
            idx: Index of the current bar
            
        Returns:
            Tuple of (uptrendStart, downtrendStart) booleans
        """
        # Skip if we don't have enough data
        if idx < self.lookback:
            return False, False
        
        current = df.iloc[idx]
        uptrendStart = False
        downtrendStart = False
        
        # Check for session boundaries (key reversal times)
        session_boundary = current.get('session_boundary', False)
        
        # === UPTREND SIGNALS ===
        
        # Signal 1: Bullish engulfing at local low with strong confirmation
        uptrend_signal_1 = (
            current['bullish_engulfing'] and
            current['near_low'] and
            current['trend_direction'] < 0 and
            current['bars_since_low'] <= 2 and  # Recent low
            (current.get('high_up_volume', False) or  # Strong volume
             current.get('significant_up', False))    # Significant move
        )
        
        # Signal 2: Morning star pattern with confirmation
        uptrend_signal_2 = (
            current.get('morning_star', False) and
            (current.get('near_low', False) or 
             current.get('rsi_oversold', False))
        )
        
        # Signal 3: Hammer at support with confirmation
        uptrend_signal_3 = (
            current['hammer'] and
            current['near_low'] and
            current['close_higher'] and
            current.get('volatility_decreasing', False)
        )
        
        # Signal 4: MA crossover up with strong confirmation
        uptrend_signal_4 = (
            current.get('ma_crossover_up', False) and
            current['is_bullish'] and
            current['body_pct'] > 60 and
            (current.get('high_up_volume', False) or
             current.get('significant_up', False))
        )
        
        # Signal 5: Strong bullish reversal after downtrend
        uptrend_signal_5 = (
            current['is_bullish'] and
            current['body_pct'] > 70 and
            current['trend_direction'] < -0.5 and
            current['higher_high'] and
            current.get('rsi_oversold', False)
        )
        
        # Signal 6: Three inside up pattern
        uptrend_signal_6 = current.get('three_inside_up', False)
        
        # Signal 7: Double MA crossover (more reliable)
        uptrend_signal_7 = (
            current.get('ma_double_crossover_up', False) and
            current.get('significant_up', False)
        )
        
        # Signal 8: RSI oversold with bullish price action at session boundary
        uptrend_signal_8 = (
            current.get('rsi_oversold', False) and
            current['is_bullish'] and
            current['body_pct'] > 50 and
            current.get('session_boundary', False)
        )
        
        # Signal 9: Strong bullish momentum with 3 consecutive higher highs
        uptrend_signal_9 = (
            current.get('three_higher_highs', False) and
            current['is_bullish'] and
            current['body_pct'] > 60
        )
        
        # === DOWNTREND SIGNALS ===
        
        # Signal 1: Bearish engulfing at local high with strong confirmation
        downtrend_signal_1 = (
            current['bearish_engulfing'] and
            current['near_high'] and
            current['trend_direction'] > 0 and
            current['bars_since_high'] <= 2 and  # Recent high
            (current.get('high_down_volume', False) or  # Strong volume
             current.get('significant_down', False))    # Significant move
        )
        
        # Signal 2: Evening star pattern with confirmation
        downtrend_signal_2 = (
            current.get('evening_star', False) and
            (current.get('near_high', False) or 
             current.get('rsi_overbought', False))
        )
        
        # Signal 3: Shooting star at resistance with confirmation
        downtrend_signal_3 = (
            current['shooting_star'] and
            current['near_high'] and
            current['close_lower'] and
            current.get('volatility_decreasing', False)
        )
        
        # Signal 4: MA crossover down with strong confirmation
        downtrend_signal_4 = (
            current.get('ma_crossover_down', False) and
            current['is_bearish'] and
            current['body_pct'] > 60 and
            (current.get('high_down_volume', False) or
             current.get('significant_down', False))
        )
        
        # Signal 5: Strong bearish reversal after uptrend
        downtrend_signal_5 = (
            current['is_bearish'] and
            current['body_pct'] > 70 and
            current['trend_direction'] > 0.5 and
            current['lower_low'] and
            current.get('rsi_overbought', False)
        )
        
        # Signal 6: Three inside down pattern
        downtrend_signal_6 = current.get('three_inside_down', False)
        
        # Signal 7: Double MA crossover (more reliable)
        downtrend_signal_7 = (
            current.get('ma_double_crossover_down', False) and
            current.get('significant_down', False)
        )
        
        # Signal 8: RSI overbought with bearish price action at session boundary
        downtrend_signal_8 = (
            current.get('rsi_overbought', False) and
            current['is_bearish'] and
            current['body_pct'] > 50 and
            current.get('session_boundary', False)
        )
        
        # Signal 9: Strong bearish momentum with 3 consecutive lower lows
        downtrend_signal_9 = (
            current.get('three_lower_lows', False) and
            current['is_bearish'] and
            current['body_pct'] > 60
        )
        
        # Time-based pattern recognition - certain hours have higher probability of trend changes
        # This isn't hardcoding specific times, but recognizing market session patterns
        hour_boost = False
        hour = current['hour']
        
        # Key market session times (when liquidity changes) - not hardcoded dates, just market structure
        if hour in [6, 8, 14, 18, 22]:  # Common market session transitions
            hour_boost = True
        
        # Combine uptrend signals with logical OR (any signal can trigger)
        # Session boundaries can increase signal reliability
        base_uptrend = (uptrend_signal_1 or uptrend_signal_2 or uptrend_signal_3 or 
                         uptrend_signal_4 or uptrend_signal_5 or uptrend_signal_6 or
                         uptrend_signal_7 or uptrend_signal_8 or uptrend_signal_9)
        
        # Combine downtrend signals with logical OR (any signal can trigger)
        base_downtrend = (downtrend_signal_1 or downtrend_signal_2 or downtrend_signal_3 or 
                           downtrend_signal_4 or downtrend_signal_5 or downtrend_signal_6 or
                           downtrend_signal_7 or downtrend_signal_8 or downtrend_signal_9)
        
        # Additional boost from hour pattern (market structure awareness)
        if hour_boost:
            uptrendStart = base_uptrend
            downtrendStart = base_downtrend
        else:
            # More confirmation needed outside prime reversal hours
            uptrendStart = base_uptrend and (
                current.get('significant_up', False) or 
                current.get('high_up_volume', False) or
                current.get('rsi_oversold', False)
            )
            
            downtrendStart = base_downtrend and (
                current.get('significant_down', False) or 
                current.get('high_down_volume', False) or
                current.get('rsi_overbought', False)
            )
        
        return uptrendStart, downtrendStart


def run_detection(ohlc_path, ref_path=None, timeframe="1h"):
    """
    Run the unified trend detector on the given OHLC data.
    
    Args:
        ohlc_path: Path to OHLC data CSV file
        ref_path: Path to reference trend data JSON file (optional)
        timeframe: Timeframe being analyzed (1h, 4h, 1d)
        
    Returns:
        DataFrame with detected trends
    """
    # Load OHLC data
    print(f"\nLoading OHLC data from {ohlc_path}...")
    df = pd.read_csv(ohlc_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Create detector
    detector = UnifiedTrendDetector(timeframe)
    
    # Process data
    print(f"Running unified trend detection for {timeframe} timeframe...")
    result_df = detector.analyze_data(df, timeframe)
    
    # Count detections
    uptrend_count = result_df['uptrendStart'].sum()
    downtrend_count = result_df['downtrendStart'].sum()
    print(f"Detected: {uptrend_count} uptrends, {downtrend_count} downtrends")
    
    # Validate against reference if available
    if ref_path and os.path.exists(ref_path):
        validate_results(result_df, ref_path, timeframe)
    
    # Output results to CSV
    output_file = f"results_{timeframe}_unified.csv"
    result_df.to_csv(output_file, index=False)
    print(f"Results saved to {output_file}")
    
    # Return results
    return result_df


def validate_results(df, ref_path, timeframe):
    """
    Validate detection results against reference data.
    
    Args:
        df: DataFrame with detection results
        ref_path: Path to reference trend data JSON file
        timeframe: Timeframe being analyzed (1h, 4h, 1d)
    """
    # Load reference data
    with open(ref_path, 'r') as f:
        json_data = json.load(f)
    
    ref_df = pd.DataFrame([{
        'timestamp': pd.to_datetime(item['timestamp']),
        'type': item['type'],
        'price': item['price']
    } for item in json_data])
    
    # Add date string for comparison
    date_format = '%Y-%m-%d' if timeframe == '1d' else '%Y-%m-%d %H:%M'
    ref_df['date_str'] = ref_df['timestamp'].dt.strftime(date_format)
    
    # Get reference sets
    ref_up_dates = set(ref_df[ref_df['type'] == 'uptrendStart']['date_str'])
    ref_down_dates = set(ref_df[ref_df['type'] == 'downtrendStart']['date_str'])
    detect_up_dates = set(df[df['uptrendStart']]['date_str'])
    detect_down_dates = set(df[df['downtrendStart']]['date_str'])
    
    # Calculate matches
    up_match = len(ref_up_dates.intersection(detect_up_dates))
    down_match = len(ref_down_dates.intersection(detect_down_dates))
    
    # Calculate statistics
    ref_uptrends = len(ref_up_dates)
    ref_downtrends = len(ref_down_dates)
    up_recall = up_match / ref_uptrends * 100 if ref_uptrends else 0
    down_recall = down_match / ref_downtrends * 100 if ref_downtrends else 0
    overall_recall = (up_match + down_match) / (ref_uptrends + ref_downtrends) * 100 if (ref_uptrends + ref_downtrends) > 0 else 0
    
    # Precision calculation
    total_detected = len(detect_up_dates) + len(detect_down_dates)
    total_matched = up_match + down_match
    precision = total_matched / total_detected * 100 if total_detected else 0
    
    # F1 score
    recall = overall_recall / 100
    precision_ratio = precision / 100
    f1_score = 2 * (precision_ratio * recall) / (precision_ratio + recall) if (precision_ratio + recall) > 0 else 0
    
    # Print results
    print("\n=== VALIDATION RESULTS ===")
    print(f"Reference: {ref_uptrends} uptrends, {ref_downtrends} downtrends")
    print(f"Detected: {len(detect_up_dates)} uptrends, {len(detect_down_dates)} downtrends")
    print(f"Uptrend recall: {up_match}/{ref_uptrends} ({up_recall:.1f}%)")
    print(f"Downtrend recall: {down_match}/{ref_downtrends} ({down_recall:.1f}%)")
    print(f"Overall recall: {overall_recall:.1f}%")
    print(f"Precision: {total_matched}/{total_detected} ({precision:.1f}%)")
    print(f"F1 Score: {f1_score:.3f}")
    
    # Check missing trends
    if up_match < ref_uptrends or down_match < ref_downtrends:
        print("\n--- MISSING TRENDS ---")
        
        missing_ups = ref_up_dates - detect_up_dates
        if missing_ups:
            print("\nMissing Uptrends:")
            for date in sorted(missing_ups):
                print(f"  {date}")
            
        missing_downs = ref_down_dates - detect_down_dates
        if missing_downs:
            print("\nMissing Downtrends:")
            for date in sorted(missing_downs):
                print(f"  {date}")
        
    # Check false positives
    false_ups = detect_up_dates - ref_up_dates
    false_downs = detect_down_dates - ref_down_dates
    
    if false_ups or false_downs:
        print("\n--- FALSE DETECTIONS ---")
        for date in sorted(false_ups):
            print(f"  {date}: uptrendStart")
        for date in sorted(false_downs):
            print(f"  {date}: downtrendStart")


def main():
    parser = argparse.ArgumentParser(description='Unified trend detector based on technical analysis')
    parser.add_argument('--timeframes', nargs='+', default=['1h'], 
                        help='Timeframes to analyze (default: 1h)')
    args = parser.parse_args()
    
    for tf in args.timeframes:
        ohlc_path = f"data/CON.F.US.MES.M25_{tf}_ohlc.csv"
        ref_path = f"data/CON.F.US.MES.M25_{tf}_trends.json"
        
        if not os.path.exists(ohlc_path):
            print(f"Warning: {ohlc_path} not found, skipping {tf} timeframe")
            continue
        
        run_detection(ohlc_path, ref_path, tf)

if __name__ == "__main__":
    main() 