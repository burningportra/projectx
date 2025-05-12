"""
Trend Start Indicator

This module implements trend detection logic similar to the TrendStartLibrary in TradingView.
It identifies the start of up and down trends based on price action patterns.
"""

import numpy as np
import pandas as pd
from typing import Tuple, List, Dict, Optional


def is_24hr_market(symbol_type: str) -> bool:
    """
    Determine if the market is likely a 24-hour market.
    
    Args:
        symbol_type: Type of symbol (stock, futures, forex, etc)
        
    Returns:
        bool: True if it's a 24-hour market
    """
    return symbol_type not in ["stock", "fund", "etf"]


def uptrend_start(close: np.ndarray, open_price: np.ndarray, low: np.ndarray, is_24hr: bool = True) -> np.ndarray:
    """
    Identify the start of uptrends.
    
    Args:
        close: Array of close prices
        open_price: Array of open prices
        low: Array of low prices
        is_24hr: Whether this is a 24-hour market
        
    Returns:
        np.ndarray: Boolean array where True indicates an uptrend start
    """
    # Shift arrays to match TradingView's indexing
    close_1 = np.roll(close, 1)
    open_1 = np.roll(open_price, 1)
    low_1 = np.roll(low, 1)
    low_2 = np.roll(low, 2)
    low_3 = np.roll(low, 3)
    close_2 = np.roll(close, 2)
    close_3 = np.roll(close, 3)
    
    # Set the first n elements to False to avoid lookback errors
    close_1[:3] = 0
    open_1[:3] = 0
    low_1[:3] = 0
    low_2[:3] = 0
    low_3[:3] = 0
    close_2[:3] = 0
    close_3[:3] = 0
    
    # Implement the uptrend start conditions
    condition1 = close_1 < open_1  # Previous candle is bearish
    condition2 = ((low_1 < low_2) | (low_1 < close_2) | (low_1 < low_3) | (low_1 < close_3))
    condition3 = ((low_1 < low) | (low_1 < close))
    condition4 = close > close_1
    
    uptrend_start_signal = condition1 & condition2 & condition3 & condition4
    
    # Set first few bars to False to avoid lookback issues
    uptrend_start_signal[:3] = False
    
    return uptrend_start_signal


def downtrend_start(close: np.ndarray, open_price: np.ndarray, high: np.ndarray, is_24hr: bool = True) -> np.ndarray:
    """
    Identify the start of downtrends.
    
    Args:
        close: Array of close prices
        open_price: Array of open prices
        high: Array of high prices
        is_24hr: Whether this is a 24-hour market
        
    Returns:
        np.ndarray: Boolean array where True indicates a downtrend start
    """
    # Shift arrays to match TradingView's indexing
    close_1 = np.roll(close, 1)
    open_1 = np.roll(open_price, 1)
    high_1 = np.roll(high, 1)
    high_2 = np.roll(high, 2)
    high_3 = np.roll(high, 3)
    close_2 = np.roll(close, 2)
    close_3 = np.roll(close, 3)
    
    # Set the first n elements to False to avoid lookback errors
    close_1[:3] = 0
    open_1[:3] = 0
    high_1[:3] = 0
    high_2[:3] = 0
    high_3[:3] = 0
    close_2[:3] = 0
    close_3[:3] = 0
    
    # Implement the downtrend start conditions
    condition1 = close_1 > open_1  # Previous candle is bullish
    condition2 = ((high_1 > high_2) | (high_1 > close_2) | (high_1 > high_3) | (high_1 > close_3))
    condition3 = ((high_1 > high) | (high_1 > close))
    condition4 = close < close_1
    
    downtrend_start_signal = condition1 & condition2 & condition3 & condition4
    
    # Set first few bars to False to avoid lookback issues
    downtrend_start_signal[:3] = False
    
    return downtrend_start_signal


class TrendDetector:
    """
    TrendDetector identifies and tracks trends in price data.
    """
    
    def __init__(self, symbol_type: str = "futures"):
        """
        Initialize the trend detector.
        
        Args:
            symbol_type: Type of symbol (stock, futures, forex, etc)
        """
        self.is_24hr = is_24hr_market(symbol_type)
        self.completed_trends = []
        self.completed_trend_bars = []
        self.completed_trend_candles = []
        self.prev_trend_bar = None
        self.prev_trend_price = None
        self.prev_trend_is_up = None
        
    def detect_trends(self, 
                     df: pd.DataFrame, 
                     max_lookback: int = 1000) -> pd.DataFrame:
        """
        Detect trends in price data.
        
        Args:
            df: DataFrame with OHLC data
            max_lookback: Maximum number of bars to look back
            
        Returns:
            DataFrame with added trend signals
        """
        # Ensure required columns exist
        required_columns = ['open', 'high', 'low', 'close']
        for col in required_columns:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Calculate trend start signals
        df['uptrend_start'] = uptrend_start(
            df['close'].values, 
            df['open'].values, 
            df['low'].values, 
            self.is_24hr
        )
        
        df['downtrend_start'] = downtrend_start(
            df['close'].values, 
            df['open'].values, 
            df['high'].values, 
            self.is_24hr
        )
        
        # Process trends
        self._process_trends(df)
        
        # Identify important trend points
        if len(self.completed_trends) > 0:
            df = self._identify_key_levels(df)
            
        return df
    
    def _process_trends(self, df: pd.DataFrame) -> None:
        """
        Process trend signals and build trend lines.
        
        Args:
            df: DataFrame with OHLC and trend signals
        """
        # Reset trend tracking for new data
        self.completed_trends = []
        self.completed_trend_bars = []
        self.completed_trend_candles = []
        
        for i in range(len(df)):
            if df['uptrend_start'].iloc[i] or df['downtrend_start'].iloc[i]:
                current_bar = i
                
                # Determine trend price (low for uptrend, high for downtrend)
                if df['uptrend_start'].iloc[i]:
                    current_price = df['low'].iloc[i]
                    current_is_up = True
                else:
                    current_price = df['high'].iloc[i]
                    current_is_up = False
                
                # Check for consecutive uptrends
                consecutive_uptrend = (self.prev_trend_is_up and current_is_up)
                
                # If we have a previous trend, complete it
                if self.prev_trend_price is not None and not consecutive_uptrend:
                    self.completed_trends.append((self.prev_trend_price, current_price))
                    self.completed_trend_bars.append((self.prev_trend_bar, current_bar))
                    candle_data = {
                        'high': df['high'].iloc[i],
                        'low': df['low'].iloc[i],
                        'open': df['open'].iloc[i],
                        'close': df['close'].iloc[i]
                    }
                    self.completed_trend_candles.append(candle_data)
                
                # Only update previous trend if not consecutive uptrends
                if not consecutive_uptrend:
                    self.prev_trend_bar = current_bar
                    self.prev_trend_price = current_price
                    self.prev_trend_is_up = current_is_up
    
    def _identify_key_levels(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Identify key trend levels.
        
        Args:
            df: DataFrame with OHLC and trend signals
            
        Returns:
            DataFrame with added key levels
        """
        # Initialize columns for key levels
        df['highest_downtrend_start'] = False
        df['unbroken_uptrend_start'] = False
        df['uptrend_to_high'] = False
        
        if len(self.completed_trends) < 2:
            return df
            
        # Find highest downtrend start
        highest_downtrend_start_price = -float('inf')
        highest_downtrend_start_index = -1
        
        # Find lowest unbroken uptrend start
        lowest_unbroken_uptrend_price = float('inf') 
        unbroken_uptrend_start_index = -1
        
        # Find uptrend with highest end price
        highest_end_price = -float('inf')
        highest_end_uptrend_index = -1
        
        # Process completed trends to find key levels
        for i, ((start_price, end_price), (start_bar, end_bar)) in enumerate(
            zip(self.completed_trends, self.completed_trend_bars)
        ):
            is_uptrend = start_price < end_price
            
            # Find highest downtrend start
            if not is_uptrend and start_price > highest_downtrend_start_price:
                highest_downtrend_start_price = start_price
                highest_downtrend_start_index = start_bar
            
            # Find uptrend with highest end price
            if is_uptrend and end_price > highest_end_price:
                highest_end_price = end_price
                highest_end_uptrend_index = start_bar
                
            # Check for unbroken uptrend
            if (i < len(self.completed_trends) - 1 and is_uptrend 
                and start_price < lowest_unbroken_uptrend_price
                and end_price > self.completed_trends[i+1][0]):
                lowest_unbroken_uptrend_price = start_price
                unbroken_uptrend_start_index = start_bar
        
        # Mark key levels in the DataFrame
        if highest_downtrend_start_index >= 0:
            df.loc[highest_downtrend_start_index, 'highest_downtrend_start'] = True
            
        if unbroken_uptrend_start_index >= 0:
            df.loc[unbroken_uptrend_start_index, 'unbroken_uptrend_start'] = True
            
        if highest_end_uptrend_index >= 0:
            df.loc[highest_end_uptrend_index, 'uptrend_to_high'] = True
        
        return df
    
    def get_trend_lines(self) -> List[Dict]:
        """
        Get trend lines for visualization.
        
        Returns:
            List of dicts with trend line data
        """
        trend_lines = []
        
        for i, ((start_price, end_price), (start_bar, end_bar)) in enumerate(
            zip(self.completed_trends, self.completed_trend_bars)
        ):
            is_uptrend = start_price < end_price
            color = 'green' if is_uptrend else 'red'
            
            # Check for consecutive uptrends
            if i > 0:
                prev_is_uptrend = self.completed_trends[i-1][0] < self.completed_trends[i-1][1]
                if is_uptrend and prev_is_uptrend:
                    color = 'blue'  # Consecutive uptrend
            
            trend_lines.append({
                'start_bar': start_bar,
                'end_bar': end_bar,
                'start_price': start_price,
                'end_price': end_price,
                'is_uptrend': is_uptrend,
                'color': color
            })
            
        return trend_lines 