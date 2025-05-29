from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any, Union

class TrendType(Enum):
    UPTREND = "uptrend"
    DOWNTREND = "downtrend"

@dataclass
class Bar:
    """Represents a single price bar (OHLC) with its timestamp and indices."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None
    index: Optional[int] = None  # 1-based chronological index
    
    def __post_init__(self):
        # Ensure numeric types
        for attr in ['open', 'high', 'low', 'close']:
            if getattr(self, attr) is not None:
                setattr(self, attr, float(getattr(self, attr)))
        if self.volume is not None:
            self.volume = float(self.volume)
        if self.index is not None:
            self.index = int(self.index)

@dataclass(frozen=True) # Make TrendState immutable
class TrendState:
    """
    Immutable state object representing current trend detection state.
    """
    # PUS/PDS state
    pending_uptrend_bar_index: Optional[int] = None
    pending_uptrend_anchor_low: Optional[float] = None
    pending_downtrend_bar_index: Optional[int] = None
    pending_downtrend_anchor_high: Optional[float] = None
    
    # CUS/CDS candidates
    pus_candidate_bar_index: Optional[int] = None
    pus_candidate_low: Optional[float] = None
    pus_candidate_high: Optional[float] = None
    pds_candidate_bar_index: Optional[int] = None
    pds_candidate_high: Optional[float] = None
    pds_candidate_low: Optional[float] = None
    
    # Containment state
    in_containment: bool = False
    containment_ref_bar_index: Optional[int] = None
    containment_ref_type: Optional[str] = None # e.g., "PENDING_DOWNTREND_HIGH"
    containment_ref_high: Optional[float] = None
    containment_ref_low: Optional[float] = None
    containment_start_bar_index: Optional[int] = None
    containment_consecutive_bars_inside: int = 0
    
    # Overall trend state
    # current_trend: Optional[TrendType] = None # This might be better derived or part of a wrapper if needed
    last_confirmed_trend_type: Optional[str] = None # 'uptrend' or 'downtrend'
    last_confirmed_trend_bar_index: Optional[int] = None
    
    def with_updates(self, **kwargs) -> 'TrendState':
        """Create a new state with updated values."""
        current_values = self.__dict__.copy()
        current_values.update(kwargs)
        return TrendState(**current_values)

@dataclass
class TrendSignal:
    """A detected trend signal."""
    timestamp: datetime
    bar_index: int # The bar that IS the trend start (e.g., PUS bar for CUS)
    signal_type: TrendType 
    price: float # Typically the close of the bar_index bar
    rule_name: str # Name of the rule that confirmed the signal
    triggering_bar_index: int # The bar whose action confirmed the signal
    
    # OHLCV for the signal bar (bar_index)
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None
    
    # Additional metadata that might be useful
    details: Dict[str, Any] = field(default_factory=dict)
