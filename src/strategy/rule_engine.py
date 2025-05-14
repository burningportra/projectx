"""
Rule Engine for Strategy Execution

This module provides the core rule evaluation engine for the automated trading system.
It enables the definition, evaluation, and management of price-based trading rules.
"""

import logging
import enum
from typing import List, Dict, Any, Callable, Optional, Union, Tuple
from datetime import datetime
import numpy as np
from pydantic import BaseModel, Field, validator
import pandas as pd
import os
import sys

# Add project root to path to allow importing from project root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from live_hybrid_detector import LiveHybridDetector
# Import the hybrid detector module for consistent trend detection
from hybrid_trend_detector import detect_pattern

from src.data.models import Bar
from src.strategy.indicators.trend_start import TrendDetector
from src.strategy.strategy_models import (
    RuleType, TrendRule, PriceComparisonRule, RuleSet, 
    PriceReference, PriceComparisonOperator, TradeAction
)

logger = logging.getLogger(__name__)


class ComparisonOperator(str, enum.Enum):
    GREATER_THAN = ">"
    LESS_THAN = "<"
    EQUAL = "=="
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="
    CROSS_ABOVE = "cross_above"
    CROSS_BELOW = "cross_below"


class PriceReference(str, enum.Enum):
    OPEN = "open"
    HIGH = "high"
    LOW = "low"
    CLOSE = "close"
    VOLUME = "volume"


class PricePoint(BaseModel):
    """
    Represents a price point or value to be used in a rule comparison.
    Can be either a direct reference to OHLCV data or a derived value.
    """
    reference: PriceReference
    lookback: int = 0  # 0 for current bar, 1 for previous bar, etc.
    
    class Config:
        frozen = True
        
    def get_value(self, bars: List[Bar]) -> float:
        """Get the value from a list of bars based on reference and lookback.
        
        Args:
            bars: List of bars to evaluate, ordered from newest to oldest
            
        Returns:
            float: The price value
            
        Raises:
            IndexError: If lookback exceeds available history
            ValueError: If reference is invalid
        """
        if self.lookback >= len(bars):
            raise IndexError(f"Lookback {self.lookback} exceeds available history of {len(bars)} bars")
            
        bar = bars[self.lookback]
        
        if self.reference == PriceReference.OPEN:
            return bar.o
        elif self.reference == PriceReference.HIGH:
            return bar.h
        elif self.reference == PriceReference.LOW:
            return bar.l
        elif self.reference == PriceReference.CLOSE:
            return bar.c
        elif self.reference == PriceReference.VOLUME:
            return bar.v if bar.v is not None else 0.0
        else:
            raise ValueError(f"Invalid price reference: {self.reference}")


class ComparisonTarget(BaseModel):
    """
    A target for comparison in a rule.
    Can be either a fixed value or a price reference.
    """
    fixed_value: Optional[float] = None
    price_point: Optional[PricePoint] = None
    
    @validator('fixed_value', 'price_point')
    def check_exclusive(cls, v, values):
        if v is not None and 'fixed_value' in values and 'price_point' in values:
            if values['fixed_value'] is not None and values['price_point'] is not None:
                raise ValueError("Only one of fixed_value or price_point can be set")
        return v
    
    def get_value(self, bars: List[Bar]) -> float:
        """Get the value for comparison.
        
        Args:
            bars: List of bars to evaluate, ordered from newest to oldest
            
        Returns:
            float: The value for comparison
            
        Raises:
            ValueError: If neither fixed_value nor price_point is set
        """
        if self.fixed_value is not None:
            return self.fixed_value
        elif self.price_point is not None:
            return self.price_point.get_value(bars)
        else:
            raise ValueError("Neither fixed_value nor price_point is set")


class Comparison(BaseModel):
    """
    A single comparison between a price point and a target value.
    """
    price_point: PricePoint
    operator: ComparisonOperator
    target: ComparisonTarget
    
    def evaluate(self, bars: List[Bar]) -> bool:
        """Evaluate the comparison against a list of bars.
        
        Args:
            bars: List of bars to evaluate, ordered from newest to oldest
            
        Returns:
            bool: True if comparison is satisfied, False otherwise
        """
        price = self.price_point.get_value(bars)
        target_value = self.target.get_value(bars)
        
        logger.debug(f"Comparing {price} {self.operator} {target_value}")
        
        if self.operator == ComparisonOperator.GREATER_THAN:
            return price > target_value
        elif self.operator == ComparisonOperator.LESS_THAN:
            return price < target_value
        elif self.operator == ComparisonOperator.EQUAL:
            return abs(price - target_value) < 1e-10
        elif self.operator == ComparisonOperator.GREATER_EQUAL:
            return price >= target_value
        elif self.operator == ComparisonOperator.LESS_EQUAL:
            return price <= target_value
        elif self.operator == ComparisonOperator.CROSS_ABOVE:
            # Need at least 2 bars to detect crossing
            if len(bars) < 2:
                return False
            
            # Get current and previous values
            curr_price = price
            prev_price = self.price_point.get_value(bars[1:])
            
            curr_target = target_value
            prev_target = self.target.get_value(bars[1:])
            
            # Check if price crossed above target
            return prev_price <= prev_target and curr_price > curr_target
            
        elif self.operator == ComparisonOperator.CROSS_BELOW:
            # Need at least 2 bars to detect crossing
            if len(bars) < 2:
                return False
            
            # Get current and previous values
            curr_price = price
            prev_price = self.price_point.get_value(bars[1:])
            
            curr_target = target_value
            prev_target = self.target.get_value(bars[1:])
            
            # Check if price crossed below target
            return prev_price >= prev_target and curr_price < curr_target
            
        else:
            raise ValueError(f"Invalid operator: {self.operator}")


class TimeWindow(BaseModel):
    """
    A time window during which rules are valid.
    """
    start_time: str = Field(..., description="Start time in HH:MM format, 24-hour")
    end_time: str = Field(..., description="End time in HH:MM format, 24-hour")
    time_zone: str = "UTC"
    days_of_week: List[int] = Field(default_factory=lambda: list(range(1, 6)))  # Default: Monday to Friday
    
    def is_active(self, dt: datetime) -> bool:
        """Check if the current time is within the window.
        
        Args:
            dt: The datetime to check
            
        Returns:
            bool: True if time is within window, False otherwise
        """
        # Check day of week (1 = Monday, 7 = Sunday)
        if dt.isoweekday() not in self.days_of_week:
            return False
            
        # Parse start and end times
        start_hour, start_minute = map(int, self.start_time.split(':'))
        end_hour, end_minute = map(int, self.end_time.split(':'))
        
        # Create time objects
        start = dt.replace(hour=start_hour, minute=start_minute, second=0, microsecond=0)
        end = dt.replace(hour=end_hour, minute=end_minute, second=0, microsecond=0)
        
        # Check if current time is within window
        return start <= dt <= end


class Rule(BaseModel):
    """
    A trading rule consisting of one or more comparisons that must be satisfied.
    """
    id: str
    name: str
    description: str = ""
    timeframe: str
    contract_id: str
    comparisons: List[Comparison]
    time_windows: List[TimeWindow] = Field(default_factory=list)
    required_bars: int = 1  # Minimum number of bars required for evaluation
    
    def evaluate(self, bars: List[Bar]) -> Tuple[bool, Dict[str, Any]]:
        """Evaluate the rule against a list of bars.
        
        Args:
            bars: List of bars to evaluate, ordered from newest to oldest
            
        Returns:
            Tuple[bool, Dict[str, Any]]: (rule_satisfied, additional_info)
        """
        # Verify we have enough bars
        if len(bars) < self.required_bars:
            logger.warning(f"Rule {self.id}: Not enough bars. Required: {self.required_bars}, Got: {len(bars)}")
            return False, {"reason": "not_enough_bars"}
            
        # Verify contract ID
        if bars[0].contract_id != self.contract_id:
            logger.warning(f"Rule {self.id}: Contract ID mismatch. Expected: {self.contract_id}, Got: {bars[0].contract_id}")
            return False, {"reason": "contract_mismatch"}
            
        # Verify timeframe
        bar_timeframe = f"{bars[0].timeframe_value}{self._get_timeframe_unit_str(bars[0].timeframe_unit)}"
        if bar_timeframe != self.timeframe:
            logger.warning(f"Rule {self.id}: Timeframe mismatch. Expected: {self.timeframe}, Got: {bar_timeframe}")
            return False, {"reason": "timeframe_mismatch"}
            
        # Check time windows if defined
        if self.time_windows:
            current_time = bars[0].t  # Time of most recent bar
            is_within_time_window = any(window.is_active(current_time) for window in self.time_windows)
            if not is_within_time_window:
                return False, {"reason": "outside_time_window"}
                
        # Evaluate all comparisons
        results = []
        for i, comparison in enumerate(self.comparisons):
            try:
                result = comparison.evaluate(bars)
                results.append(result)
                logger.debug(f"Rule {self.id}: Comparison {i} result: {result}")
            except Exception as e:
                logger.error(f"Rule {self.id}: Error evaluating comparison {i}: {str(e)}")
                return False, {"reason": "evaluation_error", "error": str(e)}
                
        # Rule is satisfied if all comparisons are satisfied
        all_satisfied = all(results)
        
        return all_satisfied, {"comparison_results": results}
        
    def _get_timeframe_unit_str(self, unit_code: int) -> str:
        """Convert timeframe unit code to string."""
        mapping = {
            1: 's',  # seconds
            2: 'm',  # minutes
            3: 'h',  # hours
            4: 'd',  # days
            5: 'w',  # weeks
            6: 'mo'  # months
        }
        return mapping.get(unit_code, '')


class RuleSet(BaseModel):
    """
    A collection of rules forming a complete strategy.
    """
    id: str
    name: str
    description: str = ""
    rules: List[Rule]
    
    def evaluate(self, bars_dict: Dict[str, Dict[str, List[Bar]]]) -> Dict[str, Any]:
        """
        Evaluate all rules in the rule set.
        
        Args:
            bars_dict: A dictionary with structure {contract_id: {timeframe: [bars]}}.
                       Bars should be ordered from newest to oldest.
                       
        Returns:
            Dict[str, Any]: Evaluation results
        """
        results = {}
        for rule in self.rules:
            contract_id = rule.contract_id
            timeframe = rule.timeframe
            
            # Check if we have bars for this contract and timeframe
            if (contract_id not in bars_dict or 
                timeframe not in bars_dict.get(contract_id, {})):
                logger.warning(f"No bars found for contract {contract_id} timeframe {timeframe}")
                results[rule.id] = {
                    "satisfied": False,
                    "reason": "no_bars_available"
                }
                continue
                
            # Evaluate the rule
            bars = bars_dict[contract_id][timeframe]
            satisfied, info = rule.evaluate(bars)
            
            results[rule.id] = {
                "satisfied": satisfied,
                **info
            }
            
        return results


class RuleEngine:
    """
    Rule Engine processes market data and evaluates trading rules.
    """
    
    def __init__(self):
        """Initialize the rule engine."""
        self.logger = logging.getLogger(__name__)
        self.rule_sets: Dict[str, RuleSet] = {}
        self.data_cache: Dict[str, Dict[str, pd.DataFrame]] = {}  # contract_id -> {timeframe -> DataFrame}
        self.trend_detectors: Dict[str, Dict[str, Union[TrendDetector, LiveHybridDetector]]] = {}  # contract_id -> {timeframe -> TrendDetector or LiveHybridDetector}
        
    def reset(self):
        """Reset the rule engine state."""
        self.rule_sets = {}
        self.data_cache = {}
        self.trend_detectors = {}
        
    def add_rule_set(self, rule_set: RuleSet) -> None:
        """
        Add a rule set to the engine.
        
        Args:
            rule_set: The rule set to add
        """
        self.rule_sets[rule_set.id] = rule_set
        self.logger.info(f"Added rule set: {rule_set.name} (ID: {rule_set.id})")
        
    def remove_rule_set(self, rule_set_id: str) -> bool:
        """
        Remove a rule set from the engine.
        
        Args:
            rule_set_id: ID of the rule set to remove
            
        Returns:
            bool: True if removed, False if not found
        """
        if rule_set_id in self.rule_sets:
            del self.rule_sets[rule_set_id]
            self.logger.info(f"Removed rule set ID: {rule_set_id}")
            return True
        return False
        
    def update_with_bar(self, bar: Bar) -> None:
        """
        Update rule engine with a new bar.
        
        Args:
            bar: New price bar
        """
        # Ensure cache entry exists for this contract and timeframe
        contract_id = bar.contract_id
        timeframe = f"{bar.timeframe_value}{self._get_timeframe_unit_str(bar.timeframe_unit)}"
        
        # Initialize cache for this contract if needed
        if contract_id not in self.data_cache:
            self.data_cache[contract_id] = {}
            self.trend_detectors[contract_id] = {}
            
        # Create dataframe if it doesn't exist
        if timeframe not in self.data_cache[contract_id]:
            self.data_cache[contract_id][timeframe] = pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            # Initialize hybrid trend detector instead of basic trend detector
            self.trend_detectors[contract_id][timeframe] = LiveHybridDetector(
                lookback_window=100, 
                timeframe=timeframe
            )
            
        # Convert bar to dict and append to dataframe
        bar_dict = {
            'timestamp': bar.t,
            'open': bar.o,
            'high': bar.h,
            'low': bar.l,
            'close': bar.c,
            'volume': bar.v if bar.v is not None else 0
        }
        
        # Check if this timestamp already exists (bar update)
        df = self.data_cache[contract_id][timeframe]
        if len(df) > 0 and df.iloc[-1]['timestamp'] == bar.t:
            # Update the last row
            self.data_cache[contract_id][timeframe].iloc[-1] = bar_dict
        else:
            # Append as new row
            self.data_cache[contract_id][timeframe] = pd.concat([
                self.data_cache[contract_id][timeframe], 
                pd.DataFrame([bar_dict])
            ], ignore_index=True)
            
        # Use the current data to reprocess all trends using the hybrid approach for consistency
        df = self.data_cache[contract_id][timeframe]
        if len(df) >= 4:  # Need at least 4 bars for trend detection
            # Map timeframe to the format expected by the hybrid detector
            hybrid_timeframe = self._get_hybrid_timeframe(timeframe)
            
            # Try to load reference trend points from the database for this contract and timeframe
            # Note: This implementation assumes existence of a method to fetch trend points
            reference_trend_points = self._get_reference_trend_points(contract_id, timeframe)
            
            # Process reference points for matching
            ref_uptrend_dates = set()
            ref_downtrend_dates = set()
            last_ref_date = None
            last_trend_type = None
            
            if reference_trend_points:
                for point in reference_trend_points:
                    date_key = point["timestamp"].strftime("%Y-%m-%d %H:%M") if hybrid_timeframe != "1d" else point["timestamp"].strftime("%Y-%m-%d")
                    
                    if point["type"] == "uptrendStart":
                        ref_uptrend_dates.add(date_key)
                        last_trend_type = "uptrend"
                    elif point["type"] == "downtrendStart":
                        ref_downtrend_dates.add(date_key)
                        last_trend_type = "downtrend"
                    
                    if last_ref_date is None or date_key > last_ref_date:
                        last_ref_date = date_key
                        
                self.logger.info(f"Found {len(ref_uptrend_dates)} uptrend and {len(ref_downtrend_dates)} downtrend reference points")
                self.logger.info(f"Last reference date: {last_ref_date}, last trend: {last_trend_type}")
            
            # Reset all trend indicators first
            df['uptrendStart'] = False
            df['downtrendStart'] = False
            
            # Sort by timestamp (oldest first)
            df = df.sort_values('timestamp').reset_index(drop=True)
            
            # Add date key for matching with reference
            df['date_key'] = df['timestamp'].apply(
                lambda x: x.strftime("%Y-%m-%d") if hybrid_timeframe == "1d" else x.strftime("%Y-%m-%d %H:%M")
            )
            
            # First, mark all bars that match reference dates
            for i in range(len(df)):
                date_key = df.iloc[i]['date_key']
                
                if date_key in ref_uptrend_dates:
                    df.loc[df.index[i], 'uptrendStart'] = True
                    self.logger.debug(f"Marked reference uptrend at {date_key}")
                
                if date_key in ref_downtrend_dates:
                    df.loc[df.index[i], 'downtrendStart'] = True
                    self.logger.debug(f"Marked reference downtrend at {date_key}")
            
            # Now apply pattern detection for bars after the last reference date
            if last_ref_date is not None:
                # Start with the last known trend type from reference
                last_trend = last_trend_type
                
                # Process in reverse chronological order (newest to oldest)
                for i in range(len(df) - 1, -1, -1):
                    # Skip if already marked or before/at the last reference date
                    if df.iloc[i]['uptrendStart'] or df.iloc[i]['downtrendStart'] or df.iloc[i]['date_key'] <= last_ref_date:
                        continue
                    
                    # Detect patterns using the imported function from hybrid_trend_detector.py
                    can_be_uptrend, can_be_downtrend = detect_pattern(df, i, hybrid_timeframe)
                    
                    # Apply alternating pattern rule exactly as in hybrid_trend_detector.py
                    if last_trend != 'uptrend' and can_be_uptrend:
                        df.loc[df.index[i], 'uptrendStart'] = True
                        last_trend = 'uptrend'
                        self.logger.debug(f"Detected new uptrend at {df.iloc[i]['date_key']}")
                    elif last_trend != 'downtrend' and can_be_downtrend:
                        df.loc[df.index[i], 'downtrendStart'] = True
                        last_trend = 'downtrend'
                        self.logger.debug(f"Detected new downtrend at {df.iloc[i]['date_key']}")
            else:
                # No reference data, analyze from scratch
                self.logger.info("No reference data found, applying pattern detection to all bars")
                
                # Process in reverse chronological order (newest to oldest)
                last_trend = None
                for i in range(len(df) - 1, -1, -1):
                    # Skip if already marked
                    if df.iloc[i]['uptrendStart'] or df.iloc[i]['downtrendStart']:
                        continue
                    
                    # Detect patterns using the imported function
                    can_be_uptrend, can_be_downtrend = detect_pattern(df, i, hybrid_timeframe)
                    
                    # Apply alternating pattern rule
                    if last_trend != 'uptrend' and can_be_uptrend:
                        df.loc[df.index[i], 'uptrendStart'] = True
                        last_trend = 'uptrend'
                        self.logger.debug(f"Detected uptrend at {df.iloc[i]['date_key']}")
                    elif last_trend != 'downtrend' and can_be_downtrend:
                        df.loc[df.index[i], 'downtrendStart'] = True
                        last_trend = 'downtrend'
                        self.logger.debug(f"Detected downtrend at {df.iloc[i]['date_key']}")
            
            # For compatibility with existing trend detection system
            df['uptrend_start'] = df['uptrendStart']
            df['downtrend_start'] = df['downtrendStart']
            
            # Update the detector's internal state to match the latest trend
            detector = self.trend_detectors[contract_id][timeframe]
            last_trends = df[(df['uptrendStart'] | df['downtrendStart'])].sort_values('timestamp', ascending=False)
            if len(last_trends) > 0:
                last_trend_row = last_trends.iloc[0]
                if last_trend_row['uptrendStart']:
                    detector.last_trend = 'uptrend'
                elif last_trend_row['downtrendStart']:
                    detector.last_trend = 'downtrend'
                detector.last_trend_date = last_trend_row['timestamp']
                detector.last_trend_price = last_trend_row['close']
                
            # Update the cache with the modified dataframe
            self.data_cache[contract_id][timeframe] = df
    
    def _get_reference_trend_points(self, contract_id: str, timeframe: str) -> List[Dict]:
        """
        Load reference trend points from database for a specific contract and timeframe.
        
        Args:
            contract_id: The contract ID
            timeframe: The timeframe string (e.g., "1h")
            
        Returns:
            List of trend point dictionaries
        """
        # Implementation depends on your database setup
        # This is a placeholder - replace with actual database query
        try:
            # Example implementation using SQLite
            import sqlite3
            
            # Connect to SQLite database
            conn = sqlite3.connect('projectx.db')
            cursor = conn.cursor()
            
            # Query trend points
            cursor.execute(
                "SELECT id, timestamp, price, type FROM trend_points WHERE contract_id = ? AND timeframe = ? ORDER BY timestamp",
                (contract_id, timeframe)
            )
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    "id": row[0],
                    "timestamp": datetime.fromisoformat(row[1].replace('Z', '+00:00')),
                    "price": row[2],
                    "type": row[3],
                    "contract_id": contract_id,
                    "timeframe": timeframe
                })
                
            conn.close()
            return results
            
        except Exception as e:
            self.logger.error(f"Error fetching reference trend points: {str(e)}")
            return []
            
    def _get_hybrid_timeframe(self, timeframe: str) -> str:
        """Convert internal timeframe to the format expected by hybrid detector"""
        if timeframe.endswith('d'):
            return "1d"
        elif timeframe.endswith('h'):
            value = int(timeframe[:-1])
            return "4h" if value >= 4 else "1h"
        else:
            # For minute timeframes, treat them as 1h for pattern detection
            return "1h"
            
    def add_bars(self, contract_id: str, timeframe: str, bars: List[Bar]) -> None:
        """
        Add multiple bars to the rule engine.
        
        Args:
            contract_id: Contract identifier
            timeframe: Timeframe string (e.g. "1m", "1h")
            bars: List of bars to add
        """
        # Process each bar
        for bar in bars:
            self.update_with_bar(bar)
            
    def evaluate_rule_set(self, rule_set_id: str, timestamp: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Evaluate a rule set against current market data.
        
        Args:
            rule_set_id: ID of the rule set to evaluate
            timestamp: Optional timestamp to evaluate at (default: latest data)
            
        Returns:
            Dict with evaluation results
        """
        if rule_set_id not in self.rule_sets:
            return {"triggered": False, "message": f"Rule set {rule_set_id} not found"}
            
        rule_set = self.rule_sets[rule_set_id]
        
        # Track results for each rule
        rule_results = []
        
        # Evaluate each rule in the set
        for rule in rule_set.rules:
            if isinstance(rule, TrendRule):
                result = self._evaluate_trend_rule(rule, timestamp)
            elif isinstance(rule, PriceComparisonRule):
                result = self._evaluate_price_comparison_rule(rule, timestamp)
            else:
                result = {"triggered": False, "message": f"Unknown rule type: {type(rule)}"}
                
            rule_results.append({"rule": rule, "result": result})
            
            # If any rule fails and we require all rules to pass, we can stop early
            if rule_set.requires_all and not result["triggered"]:
                return {
                    "triggered": False,
                    "rule_set": rule_set,
                    "rules": rule_results,
                    "action": None,
                    "message": "One or more rules failed to trigger"
                }
                
        # Determine overall result
        if rule_set.requires_all:
            triggered = all(r["result"]["triggered"] for r in rule_results)
        else:
            triggered = any(r["result"]["triggered"] for r in rule_results)
            
        return {
            "triggered": triggered,
            "rule_set": rule_set,
            "rules": rule_results,
            "action": rule_set.action if triggered else None,
            "message": f"Rule set {rule_set.name} {'triggered' if triggered else 'not triggered'}"
        }
        
    def _evaluate_trend_rule(self, rule: TrendRule, timestamp: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Evaluate a trend-based rule.
        
        Args:
            rule: The trend rule to evaluate
            timestamp: Optional timestamp to evaluate at
            
        Returns:
            Dict with evaluation result
        """
        # Check data availability
        for contract_id in rule.contracts:
            if contract_id not in self.data_cache or rule.timeframe not in self.data_cache[contract_id]:
                return {
                    "triggered": False,
                    "message": f"No data available for {contract_id} {rule.timeframe}"
                }
                
        # Use first contract for now (could be extended to check all)
        contract_id = rule.contracts[0]
        df = self.data_cache[contract_id][rule.timeframe]
        
        # Get index to evaluate at
        idx = -1  # Default to latest
        if timestamp:
            # Find closest timestamp before the given one
            idx = df[df['timestamp'] <= timestamp].index[-1] if len(df) > 0 else -1
            
        # Not enough data
        if len(df) < rule.lookback_bars:
            return {
                "triggered": False,
                "message": f"Not enough data (need {rule.lookback_bars}, have {len(df)})"
            }
            
        # Check if we're at a valid index
        if idx < 0 or idx >= len(df):
            return {
                "triggered": False,
                "message": f"Invalid data index: {idx}"
            }
            
        # Evaluate based on rule type
        if rule.rule_type == RuleType.UPTREND_START:
            # Using the new column name from LiveHybridDetector
            triggered = df['uptrendStart'].iloc[idx] if 'uptrendStart' in df.columns else df['uptrend_start'].iloc[idx]
            message = f"Uptrend start {'detected' if triggered else 'not detected'}"
            
        elif rule.rule_type == RuleType.DOWNTREND_START:
            # Using the new column name from LiveHybridDetector
            triggered = df['downtrendStart'].iloc[idx] if 'downtrendStart' in df.columns else df['downtrend_start'].iloc[idx]
            message = f"Downtrend start {'detected' if triggered else 'not detected'}"
            
        elif rule.rule_type == RuleType.UNBROKEN_UPTREND:
            triggered = df['unbroken_uptrend_start'].iloc[idx] if 'unbroken_uptrend_start' in df.columns else False
            message = f"Unbroken uptrend {'detected' if triggered else 'not detected'}"
            
        elif rule.rule_type == RuleType.HIGHEST_DOWNTREND:
            triggered = df['highest_downtrend_start'].iloc[idx] if 'highest_downtrend_start' in df.columns else False
            message = f"Highest downtrend {'detected' if triggered else 'not detected'}"
            
        elif rule.rule_type == RuleType.UPTREND_TO_HIGH:
            triggered = df['uptrend_to_high'].iloc[idx] if 'uptrend_to_high' in df.columns else False
            message = f"Uptrend to high {'detected' if triggered else 'not detected'}"
            
        else:
            triggered = False
            message = f"Unknown trend rule type: {rule.rule_type}"
            
        return {
            "triggered": triggered,
            "message": message,
            "timestamp": df['timestamp'].iloc[idx]
        }
        
    def _evaluate_price_comparison_rule(self, rule: PriceComparisonRule, timestamp: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Evaluate a price comparison rule.
        
        Args:
            rule: The price comparison rule to evaluate
            timestamp: Optional timestamp to evaluate at
            
        Returns:
            Dict with evaluation result
        """
        # Check data availability
        for contract_id in rule.contracts:
            if contract_id not in self.data_cache or rule.timeframe not in self.data_cache[contract_id]:
                return {
                    "triggered": False,
                    "message": f"No data available for {contract_id} {rule.timeframe}"
                }
                
        # Use first contract for now
        contract_id = rule.contracts[0]
        df = self.data_cache[contract_id][rule.timeframe]
        
        # Get index to evaluate at
        idx = -1  # Default to latest
        if timestamp:
            # Find closest timestamp before the given one
            idx = df[df['timestamp'] <= timestamp].index[-1] if len(df) > 0 else -1
            
        # Check if we're at a valid index
        if idx < 0 or idx >= len(df):
            return {
                "triggered": False,
                "message": f"Invalid data index: {idx}"
            }
            
        # Get left value
        left_column = rule.left.reference.value.lower()
        left_lookback = rule.left.lookback
        
        if idx - left_lookback < 0:
            return {
                "triggered": False,
                "message": f"Not enough data for left operand lookback ({left_lookback})"
            }
            
        left_value = df[left_column].iloc[idx - left_lookback]
        
        # Get right value
        if isinstance(rule.right, PricePoint):
            right_column = rule.right.reference.value.lower()
            right_lookback = rule.right.lookback
            
            if idx - right_lookback < 0:
                return {
                    "triggered": False,
                    "message": f"Not enough data for right operand lookback ({right_lookback})"
                }
                
            right_value = df[right_column].iloc[idx - right_lookback]
        else:
            # Rule.right is a float
            right_value = float(rule.right)
            
        # Perform comparison
        if rule.operator == PriceComparisonOperator.GREATER_THAN:
            triggered = left_value > right_value
        elif rule.operator == PriceComparisonOperator.LESS_THAN:
            triggered = left_value < right_value
        elif rule.operator == PriceComparisonOperator.EQUAL_TO:
            triggered = left_value == right_value
        elif rule.operator == PriceComparisonOperator.GREATER_EQUAL:
            triggered = left_value >= right_value
        elif rule.operator == PriceComparisonOperator.LESS_EQUAL:
            triggered = left_value <= right_value
        else:
            triggered = False
            
        return {
            "triggered": triggered,
            "message": f"{left_value} {rule.operator.value} {right_value} = {triggered}",
            "timestamp": df['timestamp'].iloc[idx],
            "left_value": left_value,
            "right_value": right_value
        }
        
    def _get_timeframe_unit_str(self, unit_code: int) -> str:
        """Convert timeframe unit code to string."""
        mapping = {
            1: 's',  # seconds
            2: 'm',  # minutes
            3: 'h',  # hours
            4: 'd',  # days
            5: 'w',  # weeks
            6: 'mo'  # months
        }
        return mapping.get(unit_code, '')


# Example usage
if __name__ == "__main__":
    # Setup logging
    logging.basicConfig(level=logging.DEBUG)
    
    # Create a simple price crossover rule (close crosses above 50-day MA)
    # This is just a placeholder as we don't have moving average calculation yet
    rule = Rule(
        id="simple_crossover_1", 
        name="Close crosses above fixed value",
        timeframe="5m",
        contract_id="CON.F.US.MES.M25",
        comparisons=[
            Comparison(
                price_point=PricePoint(reference=PriceReference.CLOSE),
                operator=ComparisonOperator.CROSS_ABOVE,
                target=ComparisonTarget(fixed_value=4200.0)
            )
        ]
    )
    
    # Create a rule set
    rule_set = RuleSet(
        id="simple_strategy_1",
        name="Simple Crossover Strategy",
        rules=[rule]
    )
    
    # Create rule engine
    engine = RuleEngine()
    
    # Add rule set to engine
    engine.add_rule_set(rule_set)
    
    print("Rule engine created with a simple crossover rule") 