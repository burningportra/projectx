"""
Data models for the automated trading system.

This module defines Pydantic models for OHLC bars, market data, and other
data structures used in the system.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Union, Literal
from pydantic import BaseModel, Field, validator, ConfigDict
import uuid
from decimal import Decimal
from pydantic import conint
from uuid import UUID


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
        arbitrary_types_allowed = True
        extra = 'ignore'


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


class Order(BaseModel):
    order_id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4)
    internal_order_id: str = Field(..., description="Custom unique identifier for the order, can be based on signal or coordination event")
    broker_order_id: Optional[str] = Field(None, description="ID from the broker, can be None initially")
    contract_id: str
    signal_id: Optional[uuid.UUID] = Field(None, description="Optional link to the signal that triggered the order")
    coordinated_signal_id: Optional[str] = Field(None, description="Optional link to a coordinated signal event ID")
    account_id: str = Field(..., description="Account used for the order")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    order_type: Literal["MARKET", "LIMIT", "STOP"]
    direction: Literal["BUY", "SELL"]
    quantity: conint(gt=0) # Must be greater than 0
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    status: Literal[
        "PENDING_SUBMIT", # Order created internally, not yet sent to broker
        "SUBMITTED",      # Order sent to broker, awaiting acknowledgement
        "ACCEPTED",       # Broker acknowledged the order
        "WORKING",        # Order is live in the market (e.g. limit order)
        "FILLED",
        "PARTIALLY_FILLED",
        "CANCELLED",
        "PENDING_CANCEL", # Request to cancel sent
        "REJECTED",
        "EXPIRED",
        "ERROR"           # Error in processing or from broker
    ]
    filled_quantity: Optional[conint(ge=0)] = 0
    average_fill_price: Optional[Decimal] = None
    commission: Optional[Decimal] = None
    details: Optional[Dict[str, Any]] = Field(None, description="Additional order-specific info (e.g., TIF, strategy notes, error messages)")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @validator('limit_price', 'stop_price', 'average_fill_price', 'commission', pre=True, always=True)
    def ensure_decimal(cls, v):
        if v is not None:
            return Decimal(str(v))
        return v

    @validator('order_type', always=True)
    def check_prices_for_order_type(cls, v, values):
        limit_price = values.get('limit_price')
        stop_price = values.get('stop_price')
        if v == "LIMIT" and limit_price is None:
            raise ValueError("limit_price must be set for LIMIT orders")
        if v == "STOP" and stop_price is None:
            raise ValueError("stop_price must be set for STOP orders")
        return v

    model_config = ConfigDict(arbitrary_types_allowed=True, use_enum_values=True)

# Example usage:
# order_data = {
#     "internal_order_id": "signal_cus123_confirm_cds456_trade001",
#     "contract_id": "CON.F.US.MES.M25",
#     "account_id": "mock_account_001",
#     "order_type": "LIMIT",
#     "direction": "BUY",
#     "quantity": 1,
#     "limit_price": 5300.75,
#     "status": "PENDING_SUBMIT",
#     "details": {"strategy_name": "MES_1h_15m_Confluence_CUS_CDS", "note": "Entry based on strong confluence"}
# }
# try:
#     new_order = Order(**order_data)
#     print(new_order.model_dump_json(indent=2))
# except ValidationError as e:
#     print(e.errors()) 