"""
Strategy models and rule definitions.

This module defines the data models for trading strategies and rules,
including trend-based strategies.
"""

from enum import Enum
from typing import List, Dict, Optional, Union, Any
from datetime import datetime
from pydantic import BaseModel, Field


class RuleType(str, Enum):
    UPTREND_START = "uptrend_start"
    DOWNTREND_START = "downtrend_start"
    UNBROKEN_UPTREND = "unbroken_uptrend"
    HIGHEST_DOWNTREND = "highest_downtrend"
    UPTREND_TO_HIGH = "uptrend_to_high"
    PRICE_CROSS = "price_cross"
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"


class TrendRule(BaseModel):
    """Rule based on trend start signals."""
    id: str
    name: str
    rule_type: RuleType
    timeframe: str
    contracts: List[str]
    lookback_bars: int = Field(default=20, ge=1, le=500)
    

class PriceComparisonOperator(str, Enum):
    GREATER_THAN = ">"
    LESS_THAN = "<"
    EQUAL_TO = "=="
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="


class PriceReference(str, Enum):
    OPEN = "open"
    HIGH = "high"
    LOW = "low"
    CLOSE = "close"


class PricePoint(BaseModel):
    """Price point reference used in comparisons."""
    reference: PriceReference
    lookback: int = Field(default=0, ge=0)
    

class PriceComparisonRule(BaseModel):
    """Rule based on price comparisons."""
    id: str
    name: str
    rule_type: RuleType
    timeframe: str
    contracts: List[str]
    left: PricePoint
    operator: PriceComparisonOperator
    right: Union[PricePoint, float]


class TradeAction(str, Enum):
    BUY = "buy"
    SELL = "sell"
    CLOSE_LONG = "close_long"
    CLOSE_SHORT = "close_short"


class RuleSetType(str, Enum):
    ENTRY = "entry"
    EXIT = "exit"
    

class RuleSet(BaseModel):
    """Set of rules that trigger a trading action."""
    id: str
    name: str
    description: str = ""
    type: RuleSetType
    action: TradeAction
    rules: List[Union[TrendRule, PriceComparisonRule]]
    requires_all: bool = True  # Whether all rules must be satisfied


class TimeWindow(BaseModel):
    """Time window in which rules are active."""
    start_time: str  # Format: "HH:MM" in local market time
    end_time: str    # Format: "HH:MM" in local market time
    days: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])  # 0=Sunday, 6=Saturday
    

class RiskSettings(BaseModel):
    """Risk settings for a strategy."""
    position_size: float
    max_loss: float
    daily_loss_limit: float
    max_positions: int


class Strategy(BaseModel):
    """Trading strategy model."""
    id: str
    name: str
    description: str = ""
    status: str = "stopped"  # active, paused, stopped
    rule_set_id: str
    contract_ids: List[str]
    timeframes: List[str]
    risk_settings: RiskSettings
    time_windows: List[TimeWindow] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    @property
    def is_active(self) -> bool:
        """Check if the strategy is active."""
        return self.status == "active"
    

class StrategyPerformance(BaseModel):
    """Performance metrics for a strategy."""
    strategy_id: str
    trades_count: int = 0
    win_count: int = 0
    loss_count: int = 0
    total_pnl: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    last_updated: datetime = Field(default_factory=datetime.now)
    
    def update_metrics(self, trade_pnl: float, is_win: bool) -> None:
        """Update performance metrics with a new trade."""
        self.trades_count += 1
        self.total_pnl += trade_pnl
        
        if is_win:
            self.win_count += 1
            self.avg_win = ((self.avg_win * (self.win_count - 1)) + trade_pnl) / self.win_count
        else:
            self.loss_count += 1
            self.avg_loss = ((self.avg_loss * (self.loss_count - 1)) + trade_pnl) / self.loss_count
            
        if self.trades_count > 0:
            self.win_rate = self.win_count / self.trades_count
            
        self.last_updated = datetime.now() 