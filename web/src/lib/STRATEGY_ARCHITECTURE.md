# Clean Strategy Architecture

## Overview

The trading system has been refactored to follow clean architecture principles with clear separation of concerns. Each component has a single responsibility, making the system more maintainable, testable, and extensible.

## Core Components

### 1. Pure Strategies (`IPureStrategy`)

Pure strategies are responsible ONLY for generating trade ideas from signals. They don't handle execution, position management, or any side effects.

```typescript
// Example: PureTrendStartStrategy
const strategy = new PureTrendStartStrategy({
  minConfidenceThreshold: 0.6,
  stopLossPercent: 2.0,
  takeProfitPercent: 4.0
});

// Generate trade idea
const tradeIdea = strategy.processSignals(
  signals,
  currentBarIndex,
  hasOpenPosition,
  openPositionSide
);
```

**Responsibilities:**
- Process trading signals
- Apply strategy-specific logic
- Generate trade ideas (entry/exit decisions)
- Calculate suggested parameters (stop loss, take profit)

**NOT Responsible for:**
- Submitting orders
- Managing positions
- Tracking P&L
- Handling order fills

### 2. Trade Executor (`TradeExecutor`)

Handles all execution logic - converting trade ideas into actual orders and managing the trade lifecycle.

```typescript
const executor = new TradeExecutor({
  commission: 2.50,
  useMarketOrders: true,
  tickSize: 0.25
});

// Execute a trade idea
const result = executor.executeTradeIdea(tradeIdea, currentBar);
```

**Responsibilities:**
- Execute trade ideas
- Submit orders to OrderManager
- Track executed trades
- Generate execution reports

### 3. Strategy Orchestrator (`StrategyOrchestrator`)

Ties everything together - coordinates between signal identification, strategy decisions, and trade execution.

```typescript
const orchestrator = new StrategyOrchestrator({
  strategyConfig: {
    minConfidenceThreshold: 0.6,
    stopLossPercent: 2.0
  },
  executionConfig: {
    commission: 2.50,
    useMarketOrders: true
  }
});

// Process a bar
const result = await orchestrator.processBar(
  bar, 
  barIndex, 
  allBars, 
  contractId, 
  timeframe
);
```

**Responsibilities:**
- Coordinate between components
- Manage the trading workflow
- Aggregate results
- Provide unified interface

### 4. Order Manager (`OrderManager`)

Low-level order and position management (already existed, enhanced with P&L calculations).

**Responsibilities:**
- Submit and track orders
- Manage positions
- Calculate P&L
- Handle order fills

## Architecture Benefits

### 1. Single Responsibility
Each component has one clear purpose, making the code easier to understand and maintain.

### 2. Easy Testing
Components can be tested in isolation:
```typescript
// Test strategy logic without execution
const signals = [/* test signals */];
const idea = strategy.processSignals(signals, 0, false);
expect(idea.action).toBe('ENTER_LONG');

// Test execution without strategy
const testIdea = { action: 'ENTER_LONG', /* ... */ };
const result = executor.executeTradeIdea(testIdea, bar);
expect(result.executed).toBe(true);
```

### 3. Extensibility
Easy to add new strategies or execution methods:
```typescript
class MyCustomStrategy implements IPureStrategy {
  processSignals(signals, barIndex, hasPosition, side) {
    // Custom logic here
    return customTradeIdea;
  }
}
```

### 4. Reusability
Components can be mixed and matched:
- Use different strategies with the same executor
- Use different executors with the same strategy
- Share components across different trading systems

## Migration Guide

### Using the Adapter
For backward compatibility, use `TrendStartStrategyAdapter`:

```typescript
// Old code still works
const strategy = new TrendStartStrategyAdapter(config);
const result = await strategy.processBar(bar, index, bars);
```

### Direct Usage (Recommended)
For new code, use the orchestrator directly:

```typescript
const orchestrator = new StrategyOrchestrator({
  strategyConfig: { /* ... */ },
  executionConfig: { /* ... */ }
});

const result = await orchestrator.processBar(bar, index, bars);
```

## Component Interactions

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ TrendIdentifier │────▶│  Pure Strategy  │────▶│ Trade Executor  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      │                         │                         │
      │ Signals                 │ Trade Ideas            │ Orders
      ▼                         ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Strategy Orchestrator                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Order Manager  │
                        └─────────────────┘
```

## Example: Creating a New Strategy

```typescript
// 1. Define your strategy
export class MomentumStrategy implements IPureStrategy {
  processSignals(signals, barIndex, hasPosition, side) {
    // Your momentum logic here
    if (shouldEnterLong) {
      return {
        id: `momentum_${Date.now()}`,
        action: 'ENTER_LONG',
        signalType: 'MOMENTUM',
        // ... other fields
      };
    }
    return null;
  }
  
  getConfig() { return this.config; }
  reset() { /* reset logic */ }
}

// 2. Use it with the orchestrator
const orchestrator = new StrategyOrchestrator({
  strategy: new MomentumStrategy(),
  executionConfig: { /* ... */ }
});

// 3. Run backtest or live trading
const results = await orchestrator.backtest(bars);
```

## Best Practices

1. **Keep Strategies Pure**: Don't add execution logic to strategies
2. **Use Type Safety**: Leverage TypeScript interfaces for consistency
3. **Test in Isolation**: Test each component separately
4. **Document Trade Ideas**: Include clear reasons in trade ideas
5. **Handle Errors Gracefully**: Each component should handle its own errors

## Future Enhancements

- Support for multiple strategies running simultaneously
- Advanced risk management as a separate service
- Real-time performance monitoring
- Strategy performance analytics
- Machine learning integration for trade idea evaluation 