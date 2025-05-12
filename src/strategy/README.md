# Strategy Management System

This directory contains the strategy management system for the ProjectX automated trading platform. The system is responsible for defining, evaluating, and managing trading strategies based on price rules.

## Components

### Rule Engine

The `rule_engine.py` file implements the core rule evaluation engine:

- **Rule Definition**: Rules are defined using price comparisons (e.g., close > 4200, volume crosses above 100)
- **Multiple Timeframes**: Support for evaluating rules across different timeframes
- **Cross-Timeframe Logic**: Rules can reference different timeframes for complex conditions
- **Time Windows**: Trading hours can be defined to restrict when rules are active
- **Efficient Processing**: Optimized for real-time evaluation with minimal latency

### Strategy Service

The `strategy_service.py` file provides functionality for managing trading strategies:

- **Strategy Persistence**: Strategies are stored in JSON files for persistence across restarts
- **Activation/Deactivation**: Strategies can be activated, deactivated, or emergency stopped
- **Risk Management**: Includes risk settings for position sizing and loss limits
- **Callback System**: Notifies when strategies are activated or deactivated

## Data Models

### Rule Components

- **PricePoint**: References a specific price value (open, high, low, close, volume) with optional lookback
- **ComparisonTarget**: Specifies a target value (fixed or another price point)
- **Comparison**: Combines a price point, operator, and target (e.g., close > high[1])
- **Rule**: A named rule with contract, timeframe, and one or more comparisons
- **RuleSet**: A collection of rules forming a complete strategy

### Strategy

- **Strategy**: Contains metadata, risk settings, and reference to a rule set
- **RiskSettings**: Position size, max loss, daily loss limit, and max positions

## Usage Example

```python
# Create a simple price crossover rule (close crosses above 4200)
rule = Rule(
    id="simple_crossover_1", 
    name="Close crosses above 4200",
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

# Create risk settings
risk_settings = RiskSettings(
    position_size=1.0,
    max_loss=100.0,
    daily_loss_limit=500.0,
    max_positions=5
)

# Create strategy
strategy = await strategy_service.create_strategy(
    name="S&P 500 Breakout Strategy",
    description="A simple breakout strategy for S&P 500 micro futures",
    rule_set=rule_set,
    contract_ids=["CON.F.US.MES.M25"],
    timeframes=["5m"],
    risk_settings=risk_settings
)

# Activate strategy
await strategy_service.activate_strategy(strategy.id)
```

## Development Roadmap

- [x] Basic price comparison rules
- [x] Strategy persistence
- [x] Strategy activation/deactivation
- [ ] Advanced indicators (moving averages, RSI, etc.)
- [ ] Position management and order execution
- [ ] Risk management enforcement
- [ ] Backtesting capabilities 
- [ ] Custom strategy scripting
- [ ] Strategy optimization 