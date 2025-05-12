"""
Strategy Management Service

This module provides functionality for managing trading strategies,
including persistence, loading, activation, and deactivation.
"""

import os
import json
import uuid
import logging
import enum
from typing import Dict, List, Any, Optional
from datetime import datetime
import asyncio

from pydantic import BaseModel, Field

from src.strategy.rule_engine import Rule, RuleSet, Comparison, PricePoint, PriceReference, ComparisonTarget, ComparisonOperator, TimeWindow
from src.data.models import Bar

logger = logging.getLogger(__name__)


class StrategyStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"


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
    status: StrategyStatus = StrategyStatus.STOPPED
    rule_set_id: str
    contract_ids: List[str]
    timeframes: List[str]
    risk_settings: RiskSettings
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    updated_at: datetime = Field(default_factory=lambda: datetime.now())
    
    @property
    def is_active(self) -> bool:
        """Check if the strategy is active."""
        return self.status == StrategyStatus.ACTIVE


class StrategyService:
    """
    Service for managing trading strategies.
    """
    def __init__(self, data_dir: str = None):
        """
        Initialize the strategy service.
        
        Args:
            data_dir: Directory to store strategy data
        """
        self.logger = logging.getLogger(__name__)
        self.data_dir = data_dir or os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "strategies")
        os.makedirs(self.data_dir, exist_ok=True)
        
        # In-memory storage
        self.strategies: Dict[str, Strategy] = {}
        self.rule_sets: Dict[str, RuleSet] = {}
        
        # Callbacks
        self.on_strategy_activated_callbacks: List[callable] = []
        self.on_strategy_deactivated_callbacks: List[callable] = []
        
    async def initialize(self):
        """Initialize the service by loading all strategies."""
        await self.load_all_strategies()
        
    async def load_all_strategies(self):
        """Load all strategies from disk."""
        try:
            strategy_files = [f for f in os.listdir(self.data_dir) if f.endswith(".json")]
            
            for file_name in strategy_files:
                try:
                    file_path = os.path.join(self.data_dir, file_name)
                    with open(file_path, "r") as f:
                        data = json.load(f)
                        
                    # Extract strategy and rule set data
                    strategy_data = data["strategy"]
                    rule_set_data = data["rule_set"]
                    
                    # Parse dates
                    strategy_data["created_at"] = datetime.fromisoformat(strategy_data["created_at"])
                    strategy_data["updated_at"] = datetime.fromisoformat(strategy_data["updated_at"])
                    
                    # Create models
                    strategy = Strategy(**strategy_data)
                    rule_set = RuleSet(**rule_set_data)
                    
                    # Store in memory
                    self.strategies[strategy.id] = strategy
                    self.rule_sets[rule_set.id] = rule_set
                    
                    self.logger.info(f"Loaded strategy {strategy.name} ({strategy.id})")
                    
                except Exception as e:
                    self.logger.error(f"Error loading strategy from {file_name}: {str(e)}")
                    
            self.logger.info(f"Loaded {len(self.strategies)} strategies")
            
        except Exception as e:
            self.logger.error(f"Error loading strategies: {str(e)}")
            
    async def save_strategy(self, strategy: Strategy, rule_set: RuleSet):
        """
        Save a strategy and its rule set to disk.
        
        Args:
            strategy: Strategy to save
            rule_set: Associated rule set
        """
        try:
            # Update timestamp
            strategy.updated_at = datetime.now()
            
            # Prepare data for serialization
            data = {
                "strategy": strategy.model_dump(),
                "rule_set": rule_set.model_dump()
            }
            
            # Convert datetime objects to ISO format for JSON serialization
            data["strategy"]["created_at"] = data["strategy"]["created_at"].isoformat()
            data["strategy"]["updated_at"] = data["strategy"]["updated_at"].isoformat()
            
            # Save to disk
            file_path = os.path.join(self.data_dir, f"{strategy.id}.json")
            with open(file_path, "w") as f:
                json.dump(data, f, indent=2)
                
            # Update in-memory storage
            self.strategies[strategy.id] = strategy
            self.rule_sets[rule_set.id] = rule_set
            
            self.logger.info(f"Saved strategy {strategy.name} ({strategy.id})")
            
        except Exception as e:
            self.logger.error(f"Error saving strategy {strategy.id}: {str(e)}")
            raise
            
    async def create_strategy(self, name: str, description: str, rule_set: RuleSet, 
                              contract_ids: List[str], timeframes: List[str], 
                              risk_settings: RiskSettings) -> Strategy:
        """
        Create a new strategy.
        
        Args:
            name: Strategy name
            description: Strategy description
            rule_set: Rule set for the strategy
            contract_ids: Contract IDs to trade
            timeframes: Timeframes to monitor
            risk_settings: Risk settings
            
        Returns:
            Strategy: The created strategy
        """
        try:
            # Generate IDs
            strategy_id = str(uuid.uuid4())
            rule_set_id = str(uuid.uuid4())
            
            # Update rule set with new ID
            rule_set.id = rule_set_id
            
            # Create strategy
            strategy = Strategy(
                id=strategy_id,
                name=name,
                description=description,
                rule_set_id=rule_set_id,
                contract_ids=contract_ids,
                timeframes=timeframes,
                risk_settings=risk_settings
            )
            
            # Save
            await self.save_strategy(strategy, rule_set)
            
            return strategy
            
        except Exception as e:
            self.logger.error(f"Error creating strategy: {str(e)}")
            raise
            
    async def get_strategy(self, strategy_id: str) -> Optional[Strategy]:
        """
        Get a strategy by ID.
        
        Args:
            strategy_id: Strategy ID
            
        Returns:
            Optional[Strategy]: The strategy if found, None otherwise
        """
        return self.strategies.get(strategy_id)
        
    async def get_rule_set(self, rule_set_id: str) -> Optional[RuleSet]:
        """
        Get a rule set by ID.
        
        Args:
            rule_set_id: Rule set ID
            
        Returns:
            Optional[RuleSet]: The rule set if found, None otherwise
        """
        return self.rule_sets.get(rule_set_id)
        
    async def update_strategy(self, strategy_id: str, **kwargs) -> Optional[Strategy]:
        """
        Update a strategy.
        
        Args:
            strategy_id: Strategy ID
            **kwargs: Fields to update
            
        Returns:
            Optional[Strategy]: The updated strategy if found, None otherwise
        """
        strategy = await self.get_strategy(strategy_id)
        if not strategy:
            return None
            
        # Update fields
        for key, value in kwargs.items():
            if hasattr(strategy, key):
                setattr(strategy, key, value)
                
        # Get rule set
        rule_set = await self.get_rule_set(strategy.rule_set_id)
        if not rule_set:
            self.logger.error(f"Rule set {strategy.rule_set_id} not found for strategy {strategy_id}")
            return None
            
        # Save
        await self.save_strategy(strategy, rule_set)
        
        return strategy
        
    async def update_rule_set(self, rule_set_id: str, **kwargs) -> Optional[RuleSet]:
        """
        Update a rule set.
        
        Args:
            rule_set_id: Rule set ID
            **kwargs: Fields to update
            
        Returns:
            Optional[RuleSet]: The updated rule set if found, None otherwise
        """
        rule_set = await self.get_rule_set(rule_set_id)
        if not rule_set:
            return None
            
        # Update fields
        for key, value in kwargs.items():
            if hasattr(rule_set, key):
                setattr(rule_set, key, value)
                
        # Find associated strategy
        strategy = None
        for s in self.strategies.values():
            if s.rule_set_id == rule_set_id:
                strategy = s
                break
                
        if not strategy:
            self.logger.error(f"No strategy found for rule set {rule_set_id}")
            return None
            
        # Save
        await self.save_strategy(strategy, rule_set)
        
        return rule_set
        
    async def delete_strategy(self, strategy_id: str) -> bool:
        """
        Delete a strategy.
        
        Args:
            strategy_id: Strategy ID
            
        Returns:
            bool: True if deleted, False otherwise
        """
        strategy = await self.get_strategy(strategy_id)
        if not strategy:
            return False
            
        # Deactivate if active
        if strategy.status == StrategyStatus.ACTIVE:
            await self.deactivate_strategy(strategy_id)
            
        # Remove from memory
        rule_set_id = strategy.rule_set_id
        if strategy_id in self.strategies:
            del self.strategies[strategy_id]
            
        if rule_set_id in self.rule_sets:
            del self.rule_sets[rule_set_id]
            
        # Remove from disk
        file_path = os.path.join(self.data_dir, f"{strategy_id}.json")
        if os.path.exists(file_path):
            os.remove(file_path)
            
        self.logger.info(f"Deleted strategy {strategy_id}")
        
        return True
        
    async def activate_strategy(self, strategy_id: str) -> bool:
        """
        Activate a strategy.
        
        Args:
            strategy_id: Strategy ID
            
        Returns:
            bool: True if activated, False otherwise
        """
        strategy = await self.get_strategy(strategy_id)
        if not strategy:
            return False
            
        # Update status
        strategy.status = StrategyStatus.ACTIVE
        
        # Get rule set
        rule_set = await self.get_rule_set(strategy.rule_set_id)
        if not rule_set:
            self.logger.error(f"Rule set {strategy.rule_set_id} not found for strategy {strategy_id}")
            return False
            
        # Save
        await self.save_strategy(strategy, rule_set)
        
        # Notify callbacks
        for callback in self.on_strategy_activated_callbacks:
            try:
                callback(strategy)
            except Exception as e:
                self.logger.error(f"Error in strategy activation callback: {str(e)}")
                
        self.logger.info(f"Activated strategy {strategy.name} ({strategy_id})")
        
        return True
        
    async def deactivate_strategy(self, strategy_id: str) -> bool:
        """
        Deactivate a strategy.
        
        Args:
            strategy_id: Strategy ID
            
        Returns:
            bool: True if deactivated, False otherwise
        """
        strategy = await self.get_strategy(strategy_id)
        if not strategy:
            return False
            
        # Update status
        strategy.status = StrategyStatus.PAUSED
        
        # Get rule set
        rule_set = await self.get_rule_set(strategy.rule_set_id)
        if not rule_set:
            self.logger.error(f"Rule set {strategy.rule_set_id} not found for strategy {strategy_id}")
            return False
            
        # Save
        await self.save_strategy(strategy, rule_set)
        
        # Notify callbacks
        for callback in self.on_strategy_deactivated_callbacks:
            try:
                callback(strategy)
            except Exception as e:
                self.logger.error(f"Error in strategy deactivation callback: {str(e)}")
                
        self.logger.info(f"Deactivated strategy {strategy.name} ({strategy_id})")
        
        return True
        
    async def emergency_stop(self, strategy_id: str) -> bool:
        """
        Emergency stop a strategy.
        
        Args:
            strategy_id: Strategy ID
            
        Returns:
            bool: True if stopped, False otherwise
        """
        strategy = await self.get_strategy(strategy_id)
        if not strategy:
            return False
            
        # Update status
        strategy.status = StrategyStatus.STOPPED
        
        # Get rule set
        rule_set = await self.get_rule_set(strategy.rule_set_id)
        if not rule_set:
            self.logger.error(f"Rule set {strategy.rule_set_id} not found for strategy {strategy_id}")
            return False
            
        # Save
        await self.save_strategy(strategy, rule_set)
        
        # Notify callbacks
        for callback in self.on_strategy_deactivated_callbacks:
            try:
                callback(strategy)
            except Exception as e:
                self.logger.error(f"Error in strategy deactivation callback: {str(e)}")
                
        self.logger.info(f"Emergency stopped strategy {strategy.name} ({strategy_id})")
        
        return True
        
    def register_strategy_activated_callback(self, callback: callable):
        """Register a callback for strategy activation."""
        self.on_strategy_activated_callbacks.append(callback)
        
    def register_strategy_deactivated_callback(self, callback: callable):
        """Register a callback for strategy deactivation."""
        self.on_strategy_deactivated_callbacks.append(callback)
        
    async def get_active_strategies(self) -> List[Strategy]:
        """Get all active strategies."""
        return [s for s in self.strategies.values() if s.status == StrategyStatus.ACTIVE]
        
    async def get_all_strategies(self) -> List[Strategy]:
        """Get all strategies."""
        return list(self.strategies.values()) 