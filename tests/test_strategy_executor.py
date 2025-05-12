"""
Tests for the strategy executor.
"""

import os
import sys
import unittest
import asyncio
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.execution.strategy_executor import StrategyExecutor
from src.execution.position_manager import (
    PositionManager, Position, Order, 
    OrderSide, OrderType, PositionSide, OrderStatus, PositionStatus
)
from src.strategy.rule_engine import (
    RuleEngine, RuleSet, Rule, Comparison, PricePoint, 
    PriceReference, ComparisonTarget, ComparisonOperator
)
from src.strategy.strategy_service import StrategyService, Strategy, RiskSettings, StrategyStatus
from src.data.models import Bar


class TestStrategyExecutor(unittest.IsolatedAsyncioTestCase):
    """Test cases for the strategy executor."""
    
    async def asyncSetUp(self):
        """Set up test cases."""
        # Create mocks
        self.strategy_service = AsyncMock(spec=StrategyService)
        self.rule_engine = Mock(spec=RuleEngine)
        self.position_manager = Mock(spec=PositionManager)
        
        # Mock the callback registration methods
        self.strategy_service.register_strategy_activated_callback = Mock()
        self.strategy_service.register_strategy_deactivated_callback = Mock()
        self.position_manager.register_position_closed_callback = Mock()
        
        # Create executor
        self.executor = StrategyExecutor(
            strategy_service=self.strategy_service,
            rule_engine=self.rule_engine,
            position_manager=self.position_manager
        )
        
        # Initialize executor
        await self.executor.initialize()
        
        # Verify callbacks were registered
        self.position_manager.register_position_closed_callback.assert_called_once()
        self.strategy_service.register_strategy_activated_callback.assert_called_once()
        self.strategy_service.register_strategy_deactivated_callback.assert_called_once()
        
    async def test_evaluate_no_active_strategies(self):
        """Test evaluating when there are no active strategies."""
        # Setup mock to return no active strategies
        self.strategy_service.get_active_strategies.return_value = []
        
        # Call evaluate
        await self.executor.evaluate_strategies()
        
        # Verify rule engine was not called
        self.rule_engine.evaluate_all_rule_sets.assert_not_called()
        
    async def test_evaluate_active_strategies(self):
        """Test evaluating active strategies."""
        # Create strategy and rule set
        strategy = Strategy(
            id="strategy_1",
            name="Test Strategy",
            status=StrategyStatus.ACTIVE,
            rule_set_id="rule_set_1",
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=RiskSettings(
                position_size=1.0,
                max_loss=100.0,
                daily_loss_limit=500.0,
                max_positions=5
            )
        )
        
        rule_set = RuleSet(
            id="rule_set_1",
            name="Test Rule Set",
            rules=[
                Rule(
                    id="rule_1",
                    name="Test Breakout Rule",
                    timeframe="5m",
                    contract_id="CON.F.US.MES.M25",
                    comparisons=[
                        Comparison(
                            price_point=PricePoint(reference=PriceReference.CLOSE),
                            operator=ComparisonOperator.GREATER_THAN,
                            target=ComparisonTarget(fixed_value=4200.0)
                        )
                    ]
                )
            ]
        )
        
        # Setup mocks
        self.strategy_service.get_active_strategies.return_value = [strategy]
        self.rule_engine.evaluate_all_rule_sets.return_value = {
            "rule_set_1": {
                "rule_1": {
                    "satisfied": True,
                    "comparison_results": [True]
                }
            }
        }
        self.strategy_service.get_rule_set.return_value = rule_set
        
        # Mock position_manager methods
        position = Position(
            id="position_1",
            strategy_id=strategy.id,
            contract_id="CON.F.US.MES.M25",
            side=PositionSide.LONG,
            quantity=1.0
        )
        
        order = Order(
            id="order_1",
            strategy_id=strategy.id,
            contract_id="CON.F.US.MES.M25",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=1.0
        )
        
        self.position_manager.create_position.return_value = position
        self.position_manager.create_order.return_value = order
        self.position_manager.get_position.return_value = None
        
        # Patch the _simulate_order_filled method to avoid actual sleep
        with patch.object(self.executor, '_simulate_order_filled', AsyncMock()):
            # Call evaluate
            await self.executor.evaluate_strategies()
            
            # Verify rule engine was called
            self.rule_engine.evaluate_all_rule_sets.assert_called_once()
            
            # Verify rule set was fetched
            self.strategy_service.get_rule_set.assert_called_once_with("rule_set_1")
            
            # Verify position was created
            self.position_manager.create_position.assert_called_once()
            create_position_call = self.position_manager.create_position.call_args[1]
            self.assertEqual(create_position_call["strategy_id"], strategy.id)
            self.assertEqual(create_position_call["contract_id"], "CON.F.US.MES.M25")
            self.assertEqual(create_position_call["side"], PositionSide.LONG)
            self.assertEqual(create_position_call["quantity"], 1.0)
            
            # Verify order was created
            self.position_manager.create_order.assert_called_once()
            create_order_call = self.position_manager.create_order.call_args[1]
            self.assertEqual(create_order_call["strategy_id"], strategy.id)
            self.assertEqual(create_order_call["contract_id"], "CON.F.US.MES.M25")
            self.assertEqual(create_order_call["side"], OrderSide.BUY)
            self.assertEqual(create_order_call["order_type"], OrderType.MARKET)
            self.assertEqual(create_order_call["quantity"], 1.0)
            
            # Verify _simulate_order_filled was called
            self.executor._simulate_order_filled.assert_called_once_with(order)
        
    async def test_no_duplicate_positions(self):
        """Test that duplicate positions are not created."""
        # Create strategy and rule set
        strategy = Strategy(
            id="strategy_1",
            name="Test Strategy",
            status=StrategyStatus.ACTIVE,
            rule_set_id="rule_set_1",
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=RiskSettings(
                position_size=1.0,
                max_loss=100.0,
                daily_loss_limit=500.0,
                max_positions=5
            )
        )
        
        rule_set = RuleSet(
            id="rule_set_1",
            name="Test Rule Set",
            rules=[
                Rule(
                    id="rule_1",
                    name="Test Breakout Rule",
                    timeframe="5m",
                    contract_id="CON.F.US.MES.M25",
                    comparisons=[
                        Comparison(
                            price_point=PricePoint(reference=PriceReference.CLOSE),
                            operator=ComparisonOperator.GREATER_THAN,
                            target=ComparisonTarget(fixed_value=4200.0)
                        )
                    ]
                )
            ]
        )
        
        # Setup mocks
        self.strategy_service.get_active_strategies.return_value = [strategy]
        self.rule_engine.evaluate_all_rule_sets.return_value = {
            "rule_set_1": {
                "rule_1": {
                    "satisfied": True,
                    "comparison_results": [True]
                }
            }
        }
        self.strategy_service.get_rule_set.return_value = rule_set
        
        # Setup active position
        existing_position = Position(
            id="position_1",
            strategy_id=strategy.id,
            contract_id="CON.F.US.MES.M25",
            side=PositionSide.LONG,
            quantity=1.0,
            status=PositionStatus.OPEN
        )
        
        # Make executor think there's already an active position
        self.executor.active_positions = {
            strategy.id: {
                "CON.F.US.MES.M25": "position_1"
            }
        }
        
        self.position_manager.get_position.return_value = existing_position
        
        # Call evaluate
        await self.executor.evaluate_strategies()
        
        # Verify position was not created
        self.position_manager.create_position.assert_not_called()
        
    async def test_strategy_deactivation(self):
        """Test strategy deactivation closes positions."""
        # Create strategy
        strategy = Strategy(
            id="strategy_1",
            name="Test Strategy",
            status=StrategyStatus.PAUSED,
            rule_set_id="rule_set_1",
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=RiskSettings(
                position_size=1.0,
                max_loss=100.0,
                daily_loss_limit=500.0,
                max_positions=5
            )
        )
        
        # Setup active position
        existing_position = Position(
            id="position_1",
            strategy_id=strategy.id,
            contract_id="CON.F.US.MES.M25",
            side=PositionSide.LONG,
            quantity=1.0,
            status=PositionStatus.OPEN
        )
        
        # Make executor think there's already an active position
        self.executor.active_positions = {
            strategy.id: {
                "CON.F.US.MES.M25": "position_1"
            }
        }
        
        self.position_manager.get_position.return_value = existing_position
        
        # Call deactivation callback
        await self.executor._on_strategy_deactivated(strategy)
        
        # Verify position was closed
        self.position_manager.close_position.assert_called_once_with("position_1")
        
        # Verify active positions was cleared
        self.assertEqual(self.executor.active_positions[strategy.id], {})
        
    def test_determine_position_side(self):
        """Test determining position side from rule name."""
        # Test "above" rule
        rule_above = Rule(
            id="rule_1",
            name="Price above MA",
            timeframe="5m",
            contract_id="CON.F.US.MES.M25",
            comparisons=[]
        )
        self.assertEqual(self.executor._determine_position_side(rule_above), PositionSide.LONG)
        
        # Test "breakout" rule
        rule_breakout = Rule(
            id="rule_2",
            name="Breakout Strategy",
            timeframe="5m",
            contract_id="CON.F.US.MES.M25",
            comparisons=[]
        )
        self.assertEqual(self.executor._determine_position_side(rule_breakout), PositionSide.LONG)
        
        # Test "below" rule
        rule_below = Rule(
            id="rule_3",
            name="Price below MA",
            timeframe="5m",
            contract_id="CON.F.US.MES.M25",
            comparisons=[]
        )
        self.assertEqual(self.executor._determine_position_side(rule_below), PositionSide.SHORT)
        
        # Test "breakdown" rule
        rule_breakdown = Rule(
            id="rule_4",
            name="Breakdown Strategy",
            timeframe="5m",
            contract_id="CON.F.US.MES.M25",
            comparisons=[]
        )
        self.assertEqual(self.executor._determine_position_side(rule_breakdown), PositionSide.SHORT)
        
        # Test default
        rule_other = Rule(
            id="rule_5",
            name="Other Strategy",
            timeframe="5m",
            contract_id="CON.F.US.MES.M25",
            comparisons=[]
        )
        self.assertEqual(self.executor._determine_position_side(rule_other), PositionSide.LONG)
        
    def test_on_position_closed(self):
        """Test position closed callback."""
        # Create position
        position = Position(
            id="position_1",
            strategy_id="strategy_1",
            contract_id="CON.F.US.MES.M25",
            side=PositionSide.LONG,
            quantity=1.0,
            status=PositionStatus.CLOSED
        )
        
        # Setup triggered rules
        self.executor.triggered_rules = {"strategy_1_rule_1", "strategy_1_rule_2", "strategy_2_rule_1"}
        
        # Setup active positions
        self.executor.active_positions = {
            "strategy_1": {
                "CON.F.US.MES.M25": "position_1"
            }
        }
        
        # Call callback
        self.executor._on_position_closed(position)
        
        # Verify position was removed
        self.assertEqual(self.executor.active_positions["strategy_1"], {})
        
        # Verify triggered rules were removed for this strategy
        self.assertEqual(self.executor.triggered_rules, {"strategy_2_rule_1"})


if __name__ == "__main__":
    unittest.main() 