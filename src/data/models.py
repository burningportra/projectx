"""
Data models for the automated trading system.

This module defines Pydantic models for OHLC bars, market data, and other
data structures used in the system.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, validator
import uuid


class Bar(BaseModel):
    """
    Model representing an OHLC (Open, High, Low, Close) bar.
    
    Fields match the ProjectX API response format, with additional metadata.
    """
    t: datetime = Field(..., description="Timestamp (start of the bar)")
    o: float = Field(..., description="Open price")
    h: float = Field(..., description="High price")
    l: float = Field(..., description="Low price")
    c: float = Field(..., description="Close price")
    v: Optional[float] = Field(0, description="Volume (if available)")
    
    # Additional metadata not in the API response
    id: Optional[int] = Field(None, description="Database ID (optional)")
    contract_id: str = Field(..., description="Contract ID this bar belongs to")
    timeframe_unit: int = Field(..., description="Timeframe unit (1=s, 2=m, 3=h, 4=d, 5=w, 6=mo)")
    timeframe_value: int = Field(..., description="Number of units in timeframe")
    
    @validator('t')
    def ensure_timezone(cls, v):
        """Ensure timestamp has timezone info."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v
    
    @validator('l')
    def validate_low_price(cls, v, values):
        """Validate that low price is less than or equal to high price."""
        if 'h' in values and v > values['h']:
            raise ValueError("Low price cannot be greater than high price")
        return v
    
    @validator('o', 'c')
    def validate_price_range(cls, v, values):
        """Validate that open and close are within high-low range."""
        if 'h' in values and 'l' in values:
            if v > values['h']:
                raise ValueError("Price cannot be greater than high price")
            if v < values['l']:
                raise ValueError("Price cannot be less than low price")
        return v
    
    class Config:
        """Pydantic model configuration."""
        validate_assignment = True


class InProgressBar(Bar):
    """
    Model representing an in-progress (incomplete) OHLC bar.
    
    This extends the Bar model with methods to update the bar with new trades.
    """
    is_first_update: bool = Field(True, description="Whether this is the first update")
    
    def update(self, price: float, volume: Optional[float] = 0) -> None:
        """
        Update this in-progress bar with a new trade.
        
        Args:
            price: The price of the trade
            volume: The volume of the trade (if available)
        """
        if self.is_first_update:
            self.o = price
            self.h = price
            self.l = price
            self.is_first_update = False
        else:
            self.h = max(self.h, price)
            self.l = min(self.l, price)
        
        self.c = price
        self.v += volume if volume is not None else 0
    
    def to_bar(self) -> Bar:
        """Convert this in-progress bar to a finalized Bar."""
        return Bar(
            t=self.t,
            o=self.o,
            h=self.h,
            l=self.l,
            c=self.c,
            v=self.v,
            contract_id=self.contract_id,
            timeframe_unit=self.timeframe_unit,
            timeframe_value=self.timeframe_value
        )


class Trade(BaseModel):
    """
    Model representing a market trade from ProjectX Gateway Trade API.
    """
    contract_id: str = Field(..., description="Contract ID")
    timestamp: datetime = Field(..., description="Trade timestamp")
    price: float = Field(..., description="Trade price")
    volume: Optional[float] = Field(None, description="Trade volume")
    
    @validator('timestamp')
    def ensure_timezone(cls, v):
        """Ensure timestamp has timezone info."""
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class TimeSeriesData(BaseModel):
    """
    Model representing time series data for analysis.
    
    This can be used to store a series of bars for a specific contract and timeframe.
    """
    contract_id: str
    timeframe_unit: int
    timeframe_value: int
    bars: List[Bar] = Field(default_factory=list)
    
    def add_bar(self, bar: Bar) -> None:
        """Add a bar to the time series."""
        # Ensure the bar has the correct contract and timeframe
        if (bar.contract_id != self.contract_id or 
            bar.timeframe_unit != self.timeframe_unit or 
            bar.timeframe_value != self.timeframe_value):
            raise ValueError("Bar does not match this time series")
        
        self.bars.append(bar)
        
        # Sort by timestamp to ensure order
        self.bars.sort(key=lambda x: x.t)
    
    def get_latest_bar(self) -> Optional[Bar]:
        """Get the latest bar in the time series."""
        if not self.bars:
            return None
        return self.bars[-1]
    
    def get_bars(self, lookback: int = None) -> List[Bar]:
        """
        Get bars from the time series.
        
        Args:
            lookback: Number of bars to look back. If None, returns all bars.
            
        Returns:
            List of bars, with most recent last
        """
        if lookback is None or lookback >= len(self.bars):
            return self.bars
        return self.bars[-lookback:]
    
    def get_open(self, lookback: int = 1) -> List[float]:
        """Get open prices for the last N bars."""
        return [bar.o for bar in self.get_bars(lookback)]
    
    def get_high(self, lookback: int = 1) -> List[float]:
        """Get high prices for the last N bars."""
        return [bar.h for bar in self.get_bars(lookback)]
    
    def get_low(self, lookback: int = 1) -> List[float]:
        """Get low prices for the last N bars."""
        return [bar.l for bar in self.get_bars(lookback)]
    
    def get_close(self, lookback: int = 1) -> List[float]:
        """Get close prices for the last N bars."""
        return [bar.c for bar in self.get_bars(lookback)] 