"""
Data validation for market data.

This module provides validation functions to ensure the integrity
of market data before processing it.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
import pandas as pd
import numpy as np

from src.core.exceptions import ValidationError
from src.data.models import Bar, Trade


logger = logging.getLogger(__name__)


def validate_bar(bar: Bar) -> bool:
    """
    Validate a single OHLC bar for data integrity.
    
    Args:
        bar: The Bar object to validate
        
    Returns:
        True if the bar is valid
        
    Raises:
        ValidationError: If the bar fails validation
    """
    # Check for missing key data
    if any(getattr(bar, field) is None for field in ["t", "o", "h", "l", "c"]):
        raise ValidationError("Bar contains missing OHLC data")
        
    # Validate logical price relationships
    if not (bar.l <= bar.o <= bar.h and bar.l <= bar.c <= bar.h):
        # Try to repair the bar
        new_high = max(bar.o, bar.h, bar.c)
        new_low = min(bar.o, bar.l, bar.c)
        
        # Log the issue
        logger.warning(
            f"Invalid price relationship in bar for {bar.contract_id} at {bar.t}: "
            f"o={bar.o}, h={bar.h}, l={bar.l}, c={bar.c}. "
            f"Repairing to h={new_high}, l={new_low}"
        )
        
        # Fix the bar
        bar.h = new_high
        bar.l = new_low
        
    # Validate volume if provided
    if bar.v is not None and bar.v < 0:
        logger.warning(f"Negative volume in bar for {bar.contract_id} at {bar.t}: {bar.v}. Setting to 0.")
        bar.v = 0
        
    # Check for future timestamp
    now = datetime.now(timezone.utc)
    if bar.t > now:
        logger.warning(f"Bar timestamp in future for {bar.contract_id}: {bar.t} > {now}")
        
    return True
    

def validate_bars(bars: List[Bar]) -> List[Bar]:
    """
    Validate a list of OHLC bars, removing or fixing invalid ones.
    
    Args:
        bars: List of Bar objects to validate
        
    Returns:
        List of valid bars (may be smaller than input)
    """
    valid_bars = []
    invalid_count = 0
    
    for bar in bars:
        try:
            if validate_bar(bar):
                valid_bars.append(bar)
        except ValidationError as e:
            invalid_count += 1
            logger.warning(f"Removed invalid bar for {bar.contract_id} at {bar.t}: {str(e)}")
            
    if invalid_count > 0:
        logger.warning(f"Removed {invalid_count} invalid bars out of {len(bars)}")
        
    return valid_bars
    
    
def validate_trade(trade: Trade) -> bool:
    """
    Validate a trade for data integrity.
    
    Args:
        trade: The Trade object to validate
        
    Returns:
        True if the trade is valid
        
    Raises:
        ValidationError: If the trade fails validation
    """
    # Check for missing key data
    if trade.price is None:
        raise ValidationError("Trade missing price")
        
    if trade.contract_id is None or not trade.contract_id:
        raise ValidationError("Trade missing contract_id")
        
    if trade.timestamp is None:
        raise ValidationError("Trade missing timestamp")
        
    # Check for logical price
    if trade.price <= 0:
        raise ValidationError(f"Invalid price in trade: {trade.price}")
        
    # Check for logical volume if provided
    if trade.volume is not None and trade.volume < 0:
        raise ValidationError(f"Negative volume in trade: {trade.volume}")
        
    # Check for future timestamp
    now = datetime.now(timezone.utc)
    if trade.timestamp > now:
        logger.warning(f"Trade timestamp in future: {trade.timestamp} > {now}")
        
    return True
    
    
def detect_outliers(bars: List[Bar], std_dev_threshold: float = 3.0) -> List[int]:
    """
    Detect outliers in a series of bars using statistical methods.
    
    Args:
        bars: List of bars to check for outliers
        std_dev_threshold: Number of standard deviations for outlier detection
        
    Returns:
        List of indices of bars considered outliers
    """
    if len(bars) < 4:  # Need a minimum number of bars for statistics
        return []
        
    # Extract close prices
    prices = [bar.c for bar in bars]
    
    # Calculate mean and standard deviation
    mean_price = sum(prices) / len(prices)
    std_dev = (sum((p - mean_price) ** 2 for p in prices) / len(prices)) ** 0.5
    
    # Identify outliers using standard deviation method
    outlier_indices = []
    for i, price in enumerate(prices):
        if abs(price - mean_price) > std_dev_threshold * std_dev:
            outlier_indices.append(i)
            logger.warning(
                f"Outlier detected for {bars[i].contract_id} at {bars[i].t}: "
                f"price={price}, mean={mean_price:.2f}, std_dev={std_dev:.2f}"
            )
            
    return outlier_indices


def validate_api_response(response_data: Dict[str, Any]) -> bool:
    """
    Validate an API response from the ProjectX Gateway API.
    
    Args:
        response_data: API response data
        
    Returns:
        True if the response is valid
        
    Raises:
        ValidationError: If the response fails validation
    """
    # Check for API errors
    if not response_data.get("success", False):
        error_code = response_data.get("errorCode")
        error_message = response_data.get("errorMessage", "Unknown error")
        raise ValidationError(f"API error {error_code}: {error_message}")
        
    # Check for missing data
    if "bars" not in response_data:
        raise ValidationError("API response missing 'bars' field")
        
    # Validate individual bars
    for bar_data in response_data.get("bars", []):
        required_fields = ["t", "o", "h", "l", "c"]
        missing_fields = [field for field in required_fields if field not in bar_data]
        if missing_fields:
            logger.warning(f"API returned bar with missing fields: {missing_fields}")
            
    return True 