# Unified BacktestEngine Class Design

## Overview

The BacktestEngine is a single source of truth for all state management in the backtesting system. It consolidates functionality currently spread across OrderManager, BaseStrategy, and UI components into one cohesive engine.

## Core Principles

1. **Single Source of Truth**: All state lives in the BacktestEngine
2. **Immutable State Updates**: State changes return new state objects
3. **Event Sourcing**: All state changes are recorded as events
4. **Pure Functions**: Strategies become stateless functions
5. **Reactive Updates**: UI automatically updates when state changes

## Architecture

```typescript
// Core BacktestEngine class
class BacktestEngine {
  private state: BacktestState;
  private eventHistory: StateEvent[];
  private subscribers: Set<StateSubscriber>;
  
  // Main processing method
  processBar(bar: BacktestBarData): ProcessResult {
    // 1. Update market data
    // 2. Check order fills
    // 3. Update positions
    // 4. Calculate P&L
    // 5. Notify subscribers
  }
  
  // Order management
  submitOrder(order: OrderRequest): OrderResult;
  submitBracketOrder(bracket: BracketOrderRequest): BracketOrderResult;
  cancelOrder(orderId: string): CancelResult;
  
  // State queries
  getState(): Readonly<BacktestState>;
  getOrders(filter?: OrderFilter): Order[];
  getPositions(filter?: PositionFilter): Position[];
  getTrades(filter?: TradeFilter): Trade[];
  
  // Time travel debugging
  getStateAt(barIndex: number): Readonly<BacktestState>;
  replayFrom(barIndex: number): void;
  
  // Subscriptions
  subscribe(subscriber: StateSubscriber): () => void;
}
```

## State Structure

```typescript
interface BacktestState {
  // Market data
  currentBar: BacktestBarData;
  currentBarIndex: number;
  allBars: BacktestBarData[];
  
  // Orders
  orders: {
    pending: Map<string, Order>;
    filled: Map<string, Order>;
    cancelled: Map<string, Order>;
  };
  
  // Positions
  positions: Map<string, Position>;
  
  // Completed trades
  trades: Trade[];
  
  // Performance metrics
  metrics: {
    totalPnL: number;
    unrealizedPnL: number;
    realizedPnL: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  
  // Debugging
  eventHistory: StateEvent[];
  stateSnapshots: Map<number, BacktestState>; // barIndex -> state
}
```

## Order Management Improvements

### Current Problem
```typescript
// Current: Complex manual linking
const trade = strategy.createTrade(...);
(trade as any).plannedStopLoss = stopLossPrice;
(trade as any).plannedTakeProfit = takeProfitPrice;
const order = strategy.createLimitOrder(...);
trade.entryOrder = order;
// Then manually create SL/TP orders later
```

### New Solution
```typescript
// New: Single atomic operation
const result = engine.submitBracketOrder({
  entry: {
    type: 'LIMIT',
    side: 'BUY',
    price: 5732,
    quantity: 1
  },
  stopLoss: {
    price: 5651,
    type: 'STOP'
  },
  takeProfit: {
    price: 5679,
    type: 'LIMIT'
  }
});

// Result contains all three linked orders
const { entryOrder, stopLossOrder, takeProfitOrder } = result;
```

## Strategy Integration

### Current Problem
```typescript
// Current: Strategies maintain their own state
class TrendStartStrategy extends BaseStrategy {
  private openTrade: SimulatedTrade | null;
  private state: StrategyState;
  
  processBar(bar: BacktestBarData): StrategyResult {
    // Complex state management
    this.state.updateCurrentBar(bar);
    const orders = this.orderManager.processBar(bar);
    // More state updates...
  }
}
```

### New Solution
```typescript
// New: Strategies are pure functions
const trendStartStrategy: Strategy = {
  analyze(state: BacktestState, bar: BacktestBarData): Signal[] {
    // Pure function - no side effects
    const signals = detectSignals(state, bar);
    return signals.map(signal => ({
      type: 'BRACKET_ORDER',
      entry: { price: signal.entryPrice, type: 'LIMIT' },
      stopLoss: { price: signal.stopLoss },
      takeProfit: { price: signal.takeProfit }
    }));
  }
};

// Engine handles all state management
engine.setStrategy(trendStartStrategy);
engine.processBar(bar); // Strategy.analyze() called internally
```

## React Integration

```typescript
// BacktestContext.tsx
const BacktestContext = React.createContext<BacktestEngine>(null);

export const BacktestProvider: React.FC = ({ children }) => {
  const engine = useMemo(() => new BacktestEngine(), []);
  
  return (
    <BacktestContext.Provider value={engine}>
      {children}
    </BacktestContext.Provider>
  );
};

// Custom hooks for accessing state
export const useBacktestState = () => {
  const engine = useContext(BacktestContext);
  const [state, setState] = useState(engine.getState());
  
  useEffect(() => {
    return engine.subscribe((newState) => setState(newState));
  }, [engine]);
  
  return state;
};

export const useOrders = () => {
  const state = useBacktestState();
  return state.orders;
};

export const usePositions = () => {
  const state = useBacktestState();
  return state.positions;
};
```

## Implementation Plan

### Phase 1: Core Engine
1. Create BacktestState interface
2. Implement state management with immutability
3. Add event recording for all state changes
4. Implement subscription system

### Phase 2: Order Processing
1. Port OrderManager logic into engine
2. Implement bracket order support
3. Add order matching with indexed lookups
4. Handle position tracking

### Phase 3: Strategy Integration
1. Define Strategy interface for pure functions
2. Create strategy adapter for existing strategies
3. Refactor TrendStartStrategy as example
4. Remove state from BaseStrategy

### Phase 4: React Integration
1. Create BacktestProvider component
2. Implement custom hooks
3. Remove manual state sync from components
4. Update TradeChart and other components

### Phase 5: Debugging Tools
1. Implement state snapshots at each bar
2. Add time-travel debugging API
3. Create debugging UI components
4. Add performance profiling

## Benefits

1. **Simplified Mental Model**: One place for all state
2. **Easier Testing**: Pure functions and immutable state
3. **Better Performance**: Indexed lookups and incremental updates
4. **Enhanced Debugging**: Time travel and state inspection
5. **Cleaner Code**: No more `(trade as any)` or manual linking
6. **Reactive UI**: Automatic updates without manual sync

## Migration Strategy

```typescript
// Adapter for existing strategies
class StrategyAdapter implements Strategy {
  constructor(private legacyStrategy: BaseStrategy) {}
  
  analyze(state: BacktestState, bar: BacktestBarData): Signal[] {
    // Convert BacktestState to legacy format
    const legacyState = this.convertState(state);
    
    // Call legacy strategy
    const result = this.legacyStrategy.processBar(bar);
    
    // Convert results to signals
    return this.convertResults(result);
  }
}

// Gradual migration
const engine = new BacktestEngine();
const adaptedStrategy = new StrategyAdapter(existingStrategy);
engine.setStrategy(adaptedStrategy);
```

## Example Usage

```typescript
// Initialize engine
const engine = new BacktestEngine({
  tickSize: 0.25,
  commission: 2.5
});

// Set strategy
engine.setStrategy(trendStartStrategy);

// Process bars
for (const bar of historicalData) {
  const result = engine.processBar(bar);
  
  // Result contains everything that happened
  console.log({
    filledOrders: result.filledOrders,
    newPositions: result.newPositions,
    closedTrades: result.closedTrades,
    currentPnL: result.metrics.totalPnL
  });
}

// Time travel debugging
const stateAtBar50 = engine.getStateAt(50);
engine.replayFrom(45); // Replay from bar 45

// Get final results
const finalState = engine.getState();
console.log({
  totalTrades: finalState.trades.length,
  totalPnL: finalState.metrics.totalPnL,
  winRate: finalState.metrics.winRate
});
```

## Performance Optimizations

1. **Indexed Orders**: Orders indexed by price for O(1) lookup
2. **Incremental P&L**: Only recalculate changed positions
3. **Lazy Snapshots**: Only snapshot state when accessed
4. **Event Batching**: Batch multiple state changes
5. **Memoized Queries**: Cache expensive calculations

## Summary

The Unified BacktestEngine consolidates all state management into a single, well-designed class that:
- Eliminates state duplication and synchronization issues
- Provides a clean API for order management
- Makes strategies simpler by removing state management
- Enables powerful debugging with time travel
- Improves performance with better data structures
- Integrates seamlessly with React for reactive UI updates

This forms the foundation for all other improvements in the backtesting system refactor. 