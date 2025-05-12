"""
Caching layer for market data.

This module provides a simple in-memory cache for frequently accessed
OHLC bar data to improve performance.
"""

import logging
from typing import Dict, List, Tuple, Optional, Set
from datetime import datetime, timedelta
import time

from src.data.models import Bar, TimeSeriesData
from src.core.utils import parse_timeframe


logger = logging.getLogger(__name__)


class TimeSeriesCache:
    """
    In-memory cache for time series market data.
    
    This cache stores Bar objects organized by contract ID and timeframe.
    It provides access to the most recent bars for each contract/timeframe
    combination without requiring database lookups.
    
    For simplicity, this implementation uses a simple in-memory dictionary.
    For production with higher load, consider using Redis or similar.
    """
    
    def __init__(self, max_items: int = 1000, ttl_seconds: int = 3600):
        """
        Initialize the time series cache.
        
        Args:
            max_items: Maximum number of contract/timeframe combinations to cache
            ttl_seconds: Time-to-live in seconds for cache entries
        """
        self.max_items = max_items
        self.ttl_seconds = ttl_seconds
        
        # Main cache storage: {(contract_id, timeframe_unit, timeframe_value): TimeSeriesData}
        self.cache: Dict[Tuple[str, int, int], TimeSeriesData] = {}
        
        # Track last access time: {(contract_id, timeframe_unit, timeframe_value): timestamp}
        self.last_access: Dict[Tuple[str, int, int], float] = {}
        
    def get_key(self, contract_id: str, timeframe: str) -> Tuple[str, int, int]:
        """
        Create a cache key from contract_id and timeframe.
        
        Args:
            contract_id: Contract ID
            timeframe: Timeframe string (e.g. "5m", "1h")
            
        Returns:
            Tuple of (contract_id, timeframe_unit, timeframe_value)
        """
        unit, value = parse_timeframe(timeframe)
        return (contract_id, unit, value)
        
    def get_bars(
        self, 
        contract_id: str, 
        timeframe: str, 
        lookback: Optional[int] = None
    ) -> Optional[List[Bar]]:
        """
        Get bars from cache for a specific contract and timeframe.
        
        Args:
            contract_id: Contract ID
            timeframe: Timeframe string (e.g. "5m", "1h")
            lookback: Number of bars to return (None for all available)
            
        Returns:
            List of Bar objects or None if not in cache
        """
        key = self.get_key(contract_id, timeframe)
        
        if key not in self.cache:
            return None
            
        # Update last access time
        self.last_access[key] = time.time()
        
        # Return the requested bars
        return self.cache[key].get_bars(lookback)
        
    def get_latest_bar(self, contract_id: str, timeframe: str) -> Optional[Bar]:
        """
        Get the latest bar for a specific contract and timeframe.
        
        Args:
            contract_id: Contract ID
            timeframe: Timeframe string (e.g. "5m", "1h")
            
        Returns:
            The latest Bar or None if not in cache
        """
        key = self.get_key(contract_id, timeframe)
        
        if key not in self.cache:
            return None
            
        # Update last access time
        self.last_access[key] = time.time()
        
        # Return the latest bar
        return self.cache[key].get_latest_bar()
        
    def add_bars(self, contract_id: str, timeframe: str, bars: List[Bar]) -> None:
        """
        Add bars to the cache.
        
        Args:
            contract_id: Contract ID
            timeframe: Timeframe string (e.g. "5m", "1h")
            bars: List of Bar objects to add
        """
        if not bars:
            return
            
        key = self.get_key(contract_id, timeframe)
        unit, value = parse_timeframe(timeframe)
        
        # Create time series if not exists
        if key not in self.cache:
            # Check if we need to evict something
            if len(self.cache) >= self.max_items:
                self._evict_least_recently_used()
                
            # Create new time series data
            self.cache[key] = TimeSeriesData(
                contract_id=contract_id,
                timeframe_unit=unit,
                timeframe_value=value
            )
            
        # Add each bar to the time series
        for bar in bars:
            # Make sure the bars match the expected contract and timeframe
            if (bar.contract_id != contract_id or 
                bar.timeframe_unit != unit or 
                bar.timeframe_value != value):
                logger.warning(f"Bar does not match cache key: {contract_id}/{timeframe}")
                continue
                
            self.cache[key].add_bar(bar)
            
        # Update last access time
        self.last_access[key] = time.time()
        
    def add_bar(self, bar: Bar) -> None:
        """
        Add a single bar to the cache.
        
        Args:
            bar: Bar object to add
        """
        self.add_bars(
            bar.contract_id,
            f"{bar.timeframe_value}{'smhdwm'[bar.timeframe_unit - 1]}",  # Convert unit/value to string
            [bar]
        )
        
    def clean_expired(self) -> int:
        """
        Remove expired entries from the cache.
        
        Returns:
            Number of entries removed
        """
        now = time.time()
        expired_keys = [
            key for key, last_access in self.last_access.items()
            if now - last_access > self.ttl_seconds
        ]
        
        # Remove expired entries
        for key in expired_keys:
            if key in self.cache:
                del self.cache[key]
            if key in self.last_access:
                del self.last_access[key]
                
        return len(expired_keys)
        
    def _evict_least_recently_used(self) -> bool:
        """
        Evict the least recently used entry from the cache.
        
        Returns:
            True if an entry was evicted, False otherwise
        """
        if not self.last_access:
            return False
            
        # Find the least recently used entry
        lru_key = min(self.last_access, key=self.last_access.get)
        
        # Remove it from cache
        if lru_key in self.cache:
            del self.cache[lru_key]
        if lru_key in self.last_access:
            del self.last_access[lru_key]
            
        return True
        
    def clear(self) -> None:
        """Clear the entire cache."""
        self.cache.clear()
        self.last_access.clear() 