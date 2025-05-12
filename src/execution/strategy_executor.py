"""
Strategy Executor

This module connects the rule engine with position management.
It converts rule triggers into actual trades based on strategy settings.
"""

import logging
import asyncio
from typing import Dict, List, Optional, Set, Any
from datetime import datetime, timezone

from src.strategy.rule_engine import RuleEngine, RuleSet, Rule
from src.strategy.strategy_service import StrategyService, Strategy
from src.execution.position_manager import (
    PositionManager, Position, Order, 
    OrderSide, OrderType, PositionSide, OrderStatus
)


logger = logging.getLogger(__name__)


class StrategyExecutor:
    """
    Executes strategies by converting rule triggers into positions and orders.
    """
    def __init__(self, 
                 strategy_service: StrategyService, 
                 rule_engine: RuleEngine,
                 position_manager: PositionManager):
        """
        Initialize the strategy executor.
        
        Args:
            strategy_service: The strategy service to get strategies from
            rule_engine: The rule engine to evaluate rules
            position_manager: The position manager to create and manage positions
        """
        self.strategy_service = strategy_service
        self.rule_engine = rule_engine
        self.position_manager = position_manager
        self.logger = logging.getLogger(__name__)
        
        # Track which rules have been triggered to avoid duplicate executions
        self.triggered_rules: Set[str] = set()
        
        # Track active positions by strategy and contract
        self.active_positions: Dict[str, Dict[str, str]] = {}  # {strategy_id: {contract_id: position_id}}
        
        # Register callbacks
        self.position_manager.register_position_closed_callback(self._on_position_closed)
        
    async def initialize(self):
        """Initialize the strategy executor."""
        self.logger.info("Initializing strategy executor")
        
        # Register with strategy service
        self.strategy_service.register_strategy_activated_callback(self._on_strategy_activated)
        self.strategy_service.register_strategy_deactivated_callback(self._on_strategy_deactivated)
        
    async def evaluate_strategies(self):
        """
        Evaluate all active strategies and execute trades if rules are triggered.
        
        This should be called whenever new market data is received or on a regular interval.
        """
        # Get active strategies
        active_strategies = await self.strategy_service.get_active_strategies()
        
        if not active_strategies:
            return
            
        # Evaluate rule engine for all rule sets
        rule_results = self.rule_engine.evaluate_all_rule_sets()
        
        # Process results and execute trades
        for strategy in active_strategies:
            rule_set_id = strategy.rule_set_id
            
            # Skip if rule set not found or no results
            if rule_set_id not in rule_results:
                continue
                
            # Get rule results for this strategy's rule set
            strategy_results = rule_results[rule_set_id]
            
            # Check if any rules were triggered
            await self._process_rule_results(strategy, strategy_results)
            
    async def _process_rule_results(self, strategy: Strategy, rule_results: Dict[str, Any]):
        """
        Process rule evaluation results and execute trades if needed.
        
        Args:
            strategy: The strategy being evaluated
            rule_results: Results from rule evaluation
        """
        # Get the rule set
        rule_set = await self.strategy_service.get_rule_set(strategy.rule_set_id)
        if not rule_set:
            self.logger.error(f"Rule set {strategy.rule_set_id} not found for strategy {strategy.id}")
            return
            
        # Dictionary to track triggered rule groups
        triggered_rules = {}
        
        # Check each rule result
        for rule_id, result in rule_results.items():
            # Skip if rule had an error or wasn't satisfied
            if "error" in result or not result.get("satisfied", False):
                continue
                
            # Find the rule in the rule set
            rule = next((r for r in rule_set.rules if r.id == rule_id), None)
            if not rule:
                self.logger.warning(f"Rule {rule_id} not found in rule set {rule_set.id}")
                continue
                
            # Check if this rule has already been triggered recently
            composite_id = f"{strategy.id}_{rule_id}"
            if composite_id in self.triggered_rules:
                continue
                
            # Add to triggered rules
            self.triggered_rules.add(composite_id)
            triggered_rules[rule_id] = rule
            
            self.logger.info(f"Rule {rule.name} ({rule_id}) triggered for strategy {strategy.name}")
            
        # If no rules were triggered, nothing to do
        if not triggered_rules:
            return
            
        # Execute strategy based on triggered rules
        await self._execute_strategy_rules(strategy, triggered_rules)
        
    async def _execute_strategy_rules(self, strategy: Strategy, triggered_rules: Dict[str, Rule]):
        """
        Execute a strategy based on triggered rules.
        
        Args:
            strategy: The strategy to execute
            triggered_rules: Dictionary of triggered rules
        """
        # Implement strategy-specific logic for each rule trigger
        for rule_id, rule in triggered_rules.items():
            contract_id = rule.contract_id
            
            # Initialize active positions dictionary for this strategy if needed
            if strategy.id not in self.active_positions:
                self.active_positions[strategy.id] = {}
                
            # Check if we already have an active position for this contract
            if contract_id in self.active_positions[strategy.id]:
                position_id = self.active_positions[strategy.id][contract_id]
                position = self.position_manager.get_position(position_id)
                
                # If position exists and is open, skip (don't open multiple positions)
                if position and position.is_open:
                    self.logger.info(
                        f"Skip creating position for {contract_id} - already have position {position_id}"
                    )
                    continue
                    
            # Determine position side based on the rule
            # This is a simplified example - in a real system, you would have more complex logic
            # to determine position side, size, etc. based on the specific rule and strategy
            position_side = self._determine_position_side(rule)
            
            # Get position size from risk settings
            position_size = strategy.risk_settings.position_size
            
            # Create position
            position = self.position_manager.create_position(
                strategy_id=strategy.id,
                contract_id=contract_id,
                side=position_side,
                quantity=position_size
            )
            
            # Track position
            self.active_positions[strategy.id][contract_id] = position.id
            
            # Create order to open position
            order_side = OrderSide.BUY if position_side == PositionSide.LONG else OrderSide.SELL
            
            order = self.position_manager.create_order(
                strategy_id=strategy.id,
                contract_id=contract_id,
                side=order_side,
                order_type=OrderType.MARKET,  # Market order for simplicity
                quantity=position_size,
                position_id=position.id
            )
            
            self.logger.info(
                f"Created {position_side.value} position {position.id} for strategy {strategy.name} "
                f"with order {order.id}"
            )
            
            # In a real system, you would submit this order to a broker/exchange
            # For now, we'll simulate a filled order
            await self._simulate_order_filled(order)
            
    def _determine_position_side(self, rule: Rule) -> PositionSide:
        """
        Determine the position side (long/short) based on the rule.
        
        This is a simplified example - in a real system, you would have more complex logic
        based on the specific rule type, comparisons, etc.
        
        Args:
            rule: The triggered rule
            
        Returns:
            The position side to open
        """
        # Simple logic: if rule name contains "above" or "breakout", go long
        # if it contains "below" or "breakdown", go short
        rule_name_lower = rule.name.lower()
        
        if "above" in rule_name_lower or "breakout" in rule_name_lower:
            return PositionSide.LONG
        elif "below" in rule_name_lower or "breakdown" in rule_name_lower:
            return PositionSide.SHORT
            
        # Default to long
        return PositionSide.LONG
        
    async def _simulate_order_filled(self, order: Order, delay_seconds: float = 1.0):
        """
        Simulate an order being filled.
        
        In a real system, this would be replaced with actual order submission
        and handling of fill events from the broker/exchange.
        
        Args:
            order: The order to simulate
            delay_seconds: Delay before filling the order (to simulate latency)
        """
        # Delay to simulate network latency and processing time
        await asyncio.sleep(delay_seconds)
        
        # Update order status to submitted
        self.position_manager.update_order_status(
            order_id=order.id,
            status=OrderStatus.SUBMITTED,
            external_order_id=f"sim-{order.id[:8]}"
        )
        
        # Short delay to simulate fill
        await asyncio.sleep(delay_seconds)
        
        # Get current price (in a real system, this would be from market data)
        # For simulation, we'll use a dummy price
        current_price = 4200.0
        
        # Update order status to filled
        self.position_manager.update_order_status(
            order_id=order.id,
            status=OrderStatus.FILLED,
            filled_quantity=order.quantity,
            average_fill_price=current_price
        )
        
    def _on_position_closed(self, position: Position):
        """
        Callback when a position is closed.
        
        Args:
            position: The closed position
        """
        # Remove from active positions
        strategy_id = position.strategy_id
        contract_id = position.contract_id
        
        if (strategy_id in self.active_positions and 
            contract_id in self.active_positions[strategy_id]):
            # Only remove if this is the tracked position
            if self.active_positions[strategy_id][contract_id] == position.id:
                del self.active_positions[strategy_id][contract_id]
                
        # Remove from triggered rules to allow new positions
        # Find all rules for this strategy and contract
        for rule_id in list(self.triggered_rules):
            if rule_id.startswith(f"{strategy_id}_"):
                self.triggered_rules.remove(rule_id)
                
    async def _on_strategy_activated(self, strategy: Strategy):
        """
        Callback when a strategy is activated.
        
        Args:
            strategy: The activated strategy
        """
        self.logger.info(f"Strategy activated: {strategy.name} ({strategy.id})")
        
        # Initialize active positions for this strategy
        if strategy.id not in self.active_positions:
            self.active_positions[strategy.id] = {}
            
    async def _on_strategy_deactivated(self, strategy: Strategy):
        """
        Callback when a strategy is deactivated.
        
        Args:
            strategy: The deactivated strategy
        """
        self.logger.info(f"Strategy deactivated: {strategy.name} ({strategy.id})")
        
        # Close all open positions for this strategy
        if strategy.id in self.active_positions:
            for contract_id, position_id in self.active_positions[strategy.id].items():
                position = self.position_manager.get_position(position_id)
                if position and position.is_open:
                    self.logger.info(f"Closing position {position_id} due to strategy deactivation")
                    self.position_manager.close_position(position_id)
                    
            # Clear active positions for this strategy
            self.active_positions[strategy.id] = {}
            
        # Clear triggered rules for this strategy
        for rule_id in list(self.triggered_rules):
            if rule_id.startswith(f"{strategy.id}_"):
                self.triggered_rules.remove(rule_id) 