"""
Tests for the rule engine and strategy service.
"""

import os
import sys
import unittest
import asyncio
from datetime import datetime, timedelta, timezone
import uuid
import tempfile
import shutil

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.strategy.rule_engine import (
    Rule, RuleSet, Comparison, PricePoint, PriceReference, 
    ComparisonTarget, ComparisonOperator, TimeWindow, RuleEngine
)
from src.strategy.strategy_service import StrategyService, Strategy, RiskSettings, StrategyStatus
from src.data.models import Bar


# Ensure directories exist
os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'strategies'), exist_ok=True)


class TestRuleEngine(unittest.TestCase):
    """Test cases for the rule engine."""
    
    def setUp(self):
        """Set up test cases."""
        # Create sample bars
        self.bars = [
            # Newest bar (index 0)
            Bar(
                id=1,
                contract_id="CON.F.US.MES.M25",
                t=datetime.now(timezone.utc),
                o=4200.0,
                h=4210.0,
                l=4190.0,
                c=4205.0,
                v=100.0,
                timeframe_unit=2,  # minutes
                timeframe_value=5
            ),
            # Previous bar (index 1)
            Bar(
                id=2,
                contract_id="CON.F.US.MES.M25",
                t=datetime.now(timezone.utc) - timedelta(minutes=5),
                o=4190.0,
                h=4200.0,
                l=4180.0,
                c=4195.0,
                v=90.0,
                timeframe_unit=2,  # minutes
                timeframe_value=5
            ),
            # Even older bar (index 2)
            Bar(
                id=3,
                contract_id="CON.F.US.MES.M25",
                t=datetime.now(timezone.utc) - timedelta(minutes=10),
                o=4180.0,
                h=4190.0,
                l=4170.0,
                c=4185.0,
                v=80.0,
                timeframe_unit=2,  # minutes
                timeframe_value=5
            )
        ]
        
    def test_price_point(self):
        """Test PricePoint."""
        price_point = PricePoint(reference=PriceReference.CLOSE)
        value = price_point.get_value(self.bars)
        self.assertEqual(value, 4205.0)
        
        price_point = PricePoint(reference=PriceReference.OPEN, lookback=1)
        value = price_point.get_value(self.bars)
        self.assertEqual(value, 4190.0)
        
    def test_comparison_target(self):
        """Test ComparisonTarget."""
        # Fixed value
        target = ComparisonTarget(fixed_value=4200.0)
        value = target.get_value(self.bars)
        self.assertEqual(value, 4200.0)
        
        # Price point
        target = ComparisonTarget(price_point=PricePoint(reference=PriceReference.HIGH, lookback=1))
        value = target.get_value(self.bars)
        self.assertEqual(value, 4200.0)
        
    def test_comparison(self):
        """Test Comparison."""
        # Current close > previous high
        comparison = Comparison(
            price_point=PricePoint(reference=PriceReference.CLOSE),
            operator=ComparisonOperator.GREATER_THAN,
            target=ComparisonTarget(price_point=PricePoint(reference=PriceReference.HIGH, lookback=1))
        )
        result = comparison.evaluate(self.bars)
        self.assertTrue(result)
        
        # Current close < fixed value
        comparison = Comparison(
            price_point=PricePoint(reference=PriceReference.CLOSE),
            operator=ComparisonOperator.LESS_THAN,
            target=ComparisonTarget(fixed_value=4300.0)
        )
        result = comparison.evaluate(self.bars)
        self.assertTrue(result)
        
        # Cross above test (current close > 4200, previous close < 4200)
        comparison = Comparison(
            price_point=PricePoint(reference=PriceReference.CLOSE),
            operator=ComparisonOperator.CROSS_ABOVE,
            target=ComparisonTarget(fixed_value=4200.0)
        )
        result = comparison.evaluate(self.bars)
        self.assertTrue(result)
        
    def test_rule(self):
        """Test Rule."""
        # Simple rule: current close > 4200
        rule = Rule(
            id="test_rule_1",
            name="Test Rule 1",
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
        
        # Evaluate rule
        satisfied, info = rule.evaluate(self.bars)
        self.assertTrue(satisfied)
        
        # Rule with multiple comparisons
        rule = Rule(
            id="test_rule_2",
            name="Test Rule 2",
            timeframe="5m",
            contract_id="CON.F.US.MES.M25",
            comparisons=[
                Comparison(
                    price_point=PricePoint(reference=PriceReference.CLOSE),
                    operator=ComparisonOperator.GREATER_THAN,
                    target=ComparisonTarget(fixed_value=4200.0)
                ),
                Comparison(
                    price_point=PricePoint(reference=PriceReference.VOLUME),
                    operator=ComparisonOperator.GREATER_THAN,
                    target=ComparisonTarget(fixed_value=50.0)
                )
            ]
        )
        
        # Evaluate rule
        satisfied, info = rule.evaluate(self.bars)
        self.assertTrue(satisfied)
        
    def test_rule_set(self):
        """Test RuleSet."""
        # Create rule set with two rules
        rule_set = RuleSet(
            id="test_rule_set_1",
            name="Test Rule Set 1",
            rules=[
                Rule(
                    id="test_rule_1",
                    name="Test Rule 1",
                    timeframe="5m",
                    contract_id="CON.F.US.MES.M25",
                    comparisons=[
                        Comparison(
                            price_point=PricePoint(reference=PriceReference.CLOSE),
                            operator=ComparisonOperator.GREATER_THAN,
                            target=ComparisonTarget(fixed_value=4200.0)
                        )
                    ]
                ),
                Rule(
                    id="test_rule_2",
                    name="Test Rule 2",
                    timeframe="5m",
                    contract_id="CON.F.US.MES.M25",
                    comparisons=[
                        Comparison(
                            price_point=PricePoint(reference=PriceReference.VOLUME),
                            operator=ComparisonOperator.GREATER_THAN,
                            target=ComparisonTarget(fixed_value=50.0)
                        )
                    ]
                )
            ]
        )
        
        # Prepare data for evaluation
        bars_dict = {
            "CON.F.US.MES.M25": {
                "5m": self.bars
            }
        }
        
        # Evaluate rule set
        results = rule_set.evaluate(bars_dict)
        
        # Check results
        self.assertTrue(results["test_rule_1"]["satisfied"])
        self.assertTrue(results["test_rule_2"]["satisfied"])
        
    def test_rule_engine(self):
        """Test RuleEngine."""
        # Create rule engine
        engine = RuleEngine()
        
        # Create rule set
        rule_set = RuleSet(
            id="test_rule_set_1",
            name="Test Rule Set 1",
            rules=[
                Rule(
                    id="test_rule_1",
                    name="Test Rule 1",
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
        
        # Add rule set to engine
        engine.add_rule_set(rule_set)
        
        # Add bars to engine
        engine.add_bars("CON.F.US.MES.M25", "5m", self.bars)
        
        # Evaluate all rule sets
        results = engine.evaluate_all_rule_sets()
        
        # Check results
        self.assertTrue(results["test_rule_set_1"]["test_rule_1"]["satisfied"])
        
        # Test adding a new bar
        new_bar = Bar(
            id=4,
            contract_id="CON.F.US.MES.M25",
            t=datetime.now(timezone.utc) + timedelta(minutes=5),
            o=4210.0,
            h=4220.0,
            l=4200.0,
            c=4215.0,
            v=110.0,
            timeframe_unit=2,  # minutes
            timeframe_value=5
        )
        
        engine.update_with_bar(new_bar)
        
        # Evaluate again
        results = engine.evaluate_all_rule_sets()
        
        # Check results
        self.assertTrue(results["test_rule_set_1"]["test_rule_1"]["satisfied"])


class TestStrategyService(unittest.IsolatedAsyncioTestCase):
    """Test cases for the strategy service."""
    
    async def asyncSetUp(self):
        """Set up test cases."""
        # Create temporary directory for strategy data
        self.temp_dir = tempfile.mkdtemp()
        
        # Create strategy service
        self.service = StrategyService(data_dir=self.temp_dir)
        
        # Create sample rule set
        self.rule_set = RuleSet(
            id="test_rule_set_1",
            name="Test Rule Set 1",
            rules=[
                Rule(
                    id="test_rule_1",
                    name="Test Rule 1",
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
        
        # Create sample risk settings
        self.risk_settings = RiskSettings(
            position_size=1.0,
            max_loss=100.0,
            daily_loss_limit=500.0,
            max_positions=5
        )
        
    async def asyncTearDown(self):
        """Clean up after tests."""
        # Remove temporary directory
        shutil.rmtree(self.temp_dir)
        
    async def test_create_strategy(self):
        """Test creating a strategy."""
        # Create strategy
        strategy = await self.service.create_strategy(
            name="Test Strategy",
            description="A test strategy",
            rule_set=self.rule_set,
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=self.risk_settings
        )
        
        # Check strategy
        self.assertEqual(strategy.name, "Test Strategy")
        self.assertEqual(strategy.description, "A test strategy")
        self.assertEqual(strategy.status, StrategyStatus.STOPPED)
        self.assertIn(strategy.id, self.service.strategies)
        
        # Check rule set was saved
        self.assertIn(strategy.rule_set_id, self.service.rule_sets)
        
    async def test_activate_deactivate_strategy(self):
        """Test activating and deactivating a strategy."""
        # Create strategy
        strategy = await self.service.create_strategy(
            name="Test Strategy",
            description="A test strategy",
            rule_set=self.rule_set,
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=self.risk_settings
        )
        
        # Activate strategy
        result = await self.service.activate_strategy(strategy.id)
        self.assertTrue(result)
        
        # Check status
        strategy = await self.service.get_strategy(strategy.id)
        self.assertEqual(strategy.status, StrategyStatus.ACTIVE)
        
        # Deactivate strategy
        result = await self.service.deactivate_strategy(strategy.id)
        self.assertTrue(result)
        
        # Check status
        strategy = await self.service.get_strategy(strategy.id)
        self.assertEqual(strategy.status, StrategyStatus.PAUSED)
        
    async def test_delete_strategy(self):
        """Test deleting a strategy."""
        # Create strategy
        strategy = await self.service.create_strategy(
            name="Test Strategy",
            description="A test strategy",
            rule_set=self.rule_set,
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=self.risk_settings
        )
        
        # Delete strategy
        result = await self.service.delete_strategy(strategy.id)
        self.assertTrue(result)
        
        # Check strategy and rule set were removed
        self.assertNotIn(strategy.id, self.service.strategies)
        self.assertNotIn(strategy.rule_set_id, self.service.rule_sets)
        
        # Check file was removed
        file_path = os.path.join(self.temp_dir, f"{strategy.id}.json")
        self.assertFalse(os.path.exists(file_path))
        
    async def test_emergency_stop(self):
        """Test emergency stopping a strategy."""
        # Create strategy
        strategy = await self.service.create_strategy(
            name="Test Strategy",
            description="A test strategy",
            rule_set=self.rule_set,
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=self.risk_settings
        )
        
        # Activate strategy
        await self.service.activate_strategy(strategy.id)
        
        # Emergency stop
        result = await self.service.emergency_stop(strategy.id)
        self.assertTrue(result)
        
        # Check status
        strategy = await self.service.get_strategy(strategy.id)
        self.assertEqual(strategy.status, StrategyStatus.STOPPED)
        
    async def test_callbacks(self):
        """Test strategy callbacks."""
        # Create strategy
        strategy = await self.service.create_strategy(
            name="Test Strategy",
            description="A test strategy",
            rule_set=self.rule_set,
            contract_ids=["CON.F.US.MES.M25"],
            timeframes=["5m"],
            risk_settings=self.risk_settings
        )
        
        # Callback flags
        activated = False
        deactivated = False
        
        # Define callbacks
        def on_activated(s):
            nonlocal activated
            activated = True
            
        def on_deactivated(s):
            nonlocal deactivated
            deactivated = True
            
        # Register callbacks
        self.service.register_strategy_activated_callback(on_activated)
        self.service.register_strategy_deactivated_callback(on_deactivated)
        
        # Activate strategy
        await self.service.activate_strategy(strategy.id)
        
        # Check activated flag
        self.assertTrue(activated)
        
        # Deactivate strategy
        await self.service.deactivate_strategy(strategy.id)
        
        # Check deactivated flag
        self.assertTrue(deactivated)


if __name__ == "__main__":
    unittest.main() 