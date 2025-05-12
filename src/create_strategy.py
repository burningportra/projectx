"""
Create Strategy Example

This script demonstrates how to create and save a trading strategy using the strategy service.
"""

import asyncio
import logging
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.strategy.rule_engine import (
    Rule, RuleSet, Comparison, PricePoint, PriceReference, 
    ComparisonTarget, ComparisonOperator, TimeWindow
)
from src.strategy.strategy_service import StrategyService, Strategy, RiskSettings, StrategyStatus


# Setup logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def create_example_strategy():
    """Create an example strategy and save it."""
    
    # Initialize strategy service
    service = StrategyService()
    await service.initialize()
    
    # Create time window for trading hours (9:30 AM to 4:00 PM, Monday-Friday)
    time_window = TimeWindow(
        start_time="09:30",
        end_time="16:00",
        time_zone="America/New_York",
        days_of_week=[1, 2, 3, 4, 5]  # Monday to Friday
    )
    
    # Create a simple breakout rule (close crosses above 4200)
    breakout_rule = Rule(
        id="breakout_rule_1", 
        name="S&P 500 Breakout Above 4200",
        description="Triggers when S&P 500 closes above 4200",
        timeframe="5m",
        contract_id="CON.F.US.MES.M25",
        comparisons=[
            Comparison(
                price_point=PricePoint(reference=PriceReference.CLOSE),
                operator=ComparisonOperator.CROSS_ABOVE,
                target=ComparisonTarget(fixed_value=4200.0)
            )
        ],
        time_windows=[time_window],
        required_bars=5  # Require at least 5 bars of history
    )
    
    # Create a pullback rule (close crosses below previous high)
    pullback_rule = Rule(
        id="pullback_rule_1", 
        name="S&P 500 Pullback",
        description="Triggers when S&P 500 pulls back below the previous bar's high",
        timeframe="5m",
        contract_id="CON.F.US.MES.M25",
        comparisons=[
            Comparison(
                price_point=PricePoint(reference=PriceReference.CLOSE),
                operator=ComparisonOperator.CROSS_BELOW,
                target=ComparisonTarget(price_point=PricePoint(
                    reference=PriceReference.HIGH,
                    lookback=1
                ))
            )
        ],
        time_windows=[time_window],
        required_bars=5
    )
    
    # Create a volume rule (volume above average)
    volume_rule = Rule(
        id="volume_rule_1", 
        name="High Volume",
        description="Triggers when volume is higher than previous bar",
        timeframe="5m",
        contract_id="CON.F.US.MES.M25",
        comparisons=[
            Comparison(
                price_point=PricePoint(reference=PriceReference.VOLUME),
                operator=ComparisonOperator.GREATER_THAN,
                target=ComparisonTarget(price_point=PricePoint(
                    reference=PriceReference.VOLUME,
                    lookback=1
                ))
            )
        ],
        time_windows=[time_window],
        required_bars=5
    )
    
    # Create a rule set with all three rules
    rule_set = RuleSet(
        id="strategy_1_ruleset",
        name="S&P 500 Breakout Strategy Ruleset",
        description="Rules for S&P 500 breakout strategy",
        rules=[breakout_rule, pullback_rule, volume_rule]
    )
    
    # Create risk settings
    risk_settings = RiskSettings(
        position_size=1.0,  # 1 contract
        max_loss=100.0,     # $100 max loss per trade
        daily_loss_limit=500.0,  # $500 daily loss limit
        max_positions=2  # Maximum 2 concurrent positions
    )
    
    # Create the strategy
    strategy = await service.create_strategy(
        name="S&P 500 Breakout Strategy",
        description="A breakout strategy for S&P 500 micro futures",
        rule_set=rule_set,
        contract_ids=["CON.F.US.MES.M25"],
        timeframes=["5m"],
        risk_settings=risk_settings
    )
    
    logger.info(f"Created strategy: {strategy.name} ({strategy.id})")
    logger.info(f"Rule set ID: {strategy.rule_set_id}")
    logger.info(f"Status: {strategy.status}")
    
    # Return the strategy and service for further operations
    return strategy, service


async def main():
    """Main function."""
    try:
        strategy, service = await create_example_strategy()
        
        # Activate the strategy
        logger.info(f"Activating strategy {strategy.name}...")
        await service.activate_strategy(strategy.id)
        
        # Get strategy to verify status
        updated_strategy = await service.get_strategy(strategy.id)
        logger.info(f"Strategy status: {updated_strategy.status}")
        
        # Get all strategies
        all_strategies = await service.get_all_strategies()
        logger.info(f"Number of strategies: {len(all_strategies)}")
        
        # Get active strategies
        active_strategies = await service.get_active_strategies()
        logger.info(f"Number of active strategies: {len(active_strategies)}")
        
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main()) 