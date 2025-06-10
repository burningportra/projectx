# Backtesting System Architecture

## Overview

This document explains the architecture and flow of the backtesting system, which allows users to test trading strategies against historical market data.

## Core Components

### 1. **OrderManager** (`/lib/OrderManager.ts`)
The central order execution engine that:
- Manages order lifecycle (submit → pending → filled/cancelled)
- Tracks open positions and P&L
- Handles stop loss and take profit orders
- Creates completed trade records for analysis

### 2. **BaseStrategy** (`/lib/strategies/BaseStrategy.ts`)
Abstract base class that all strategies inherit from:
- Provides common functionality (order creation, position management)
- Handles protective order placement
- Calculates backtest results
- Manages strategy state

### 3. **TrendStartStrategyRefactored** (`/lib/strategies/TrendStartStrategyRefactored.ts`)
Example strategy implementation that:
- Places limit BUY orders at Confirmed Uptrend Start (CUS) signals
- Sets stop loss at the CUS bar's low
- Sets take profit at the previous Confirmed Downtrend Start (CDS) open price
- Overrides `placeProtectiveOrders` to use custom SL/TP prices

### 4. **BacktesterPage** (`/app/backtester/page.tsx`)
Main UI component that:
- Manages playback of historical data
- Coordinates strategy execution
- Syncs UI state with OrderManager
- Displays results and charts

## Data Flow

### 1. **Bar Processing Flow**
```
User clicks play/step → BacktesterPage.processStrategyBars() 
→ Strategy.processBar() → OrderManager.processBar() 
→ Orders filled → Strategy.onOrderFilled() → Protective orders placed
```

### 2. **Order Lifecycle**
```
Strategy creates order → OrderManager.submitOrder() 
→ Order queued as PENDING → OrderManager.processBar() checks fill conditions
→ Order FILLED → Position opened/closed → Trade record created
```

### 3. **UI State Synchronization**
```
OrderManager state changes → BacktesterPage syncs state 
→ Updates pendingOrders, filledOrders, openPositions 
→ TradeChart displays price lines → AnalysisPanel shows results
```

## Key Design Patterns

### 1. **Trade Object Custom Properties**
The strategy stores custom stop loss and take profit prices on the trade object:
```typescript
(trade as any).plannedStopLoss = stopLossPrice;
(trade as any).plannedTakeProfit = takeProfitPrice;
```

### 2. **Entry Order Tracking**
The trade's `entryOrder` property must be set for protective orders to be placed:
```typescript
newTrade.entryOrder = order;
```

### 3. **State Management**
- OrderManager maintains source of truth for orders and positions
- Strategy maintains its own state via StrategyState class
- UI syncs with OrderManager after each bar processing

## Common Issues and Solutions

### Issue 1: Protective Orders Not Placing
**Cause**: Trade's `entryOrder` property not set
**Solution**: Set `trade.entryOrder = order` after creating the entry order

### Issue 2: UI Not Showing Results
**Cause**: Backtest results calculated before trades complete
**Solution**: Add `currentBarIndex` to useEffect dependencies to recalculate on bar change

### Issue 3: Chart Lines Not Appearing
**Cause**: Open positions not properly synced to UI
**Solution**: Force state update with new array references to trigger re-render

## What Could Be Better and Simpler

### 1. **Architecture Simplifications**

#### Current Issues:
- **Event-driven vs Direct Calls**: Mixed paradigm with both event bus and direct method calls
- **State Duplication**: State exists in OrderManager, Strategy, and UI
- **Complex Order Matching**: Relies on order IDs and trade IDs matching correctly

#### Improvements:
```typescript
// Single source of truth for all state
class BacktestEngine {
  orders: Order[];
  positions: Position[];
  trades: Trade[];
  
  // All state changes go through the engine
  submitOrder(order: Order): void
  processBar(bar: Bar): ProcessResult
  getState(): BacktestState
}

// Strategies become pure functions
interface Strategy {
  // No internal state, just decision making
  analyze(state: BacktestState, bar: Bar): Signal[]
}
```

### 2. **Order Management Simplifications**

#### Current Issues:
- **Complex Protective Order Logic**: Custom properties on trade objects
- **Manual Order Linking**: Must manually set entryOrder, parentTradeId, etc.

#### Improvements:
```typescript
// Bracket orders as first-class citizens
interface BracketOrder {
  entry: Order;
  stopLoss: Order;
  takeProfit: Order;
}

// Single method to create all related orders
orderManager.createBracketOrder({
  entryPrice: 5732,
  stopLossPrice: 5651,
  takeProfitPrice: 5679,
  quantity: 1
});
```

### 3. **Strategy Development Simplifications**

#### Current Issues:
- **Boilerplate Code**: Lots of setup for basic strategies
- **State Management**: Complex state tracking in strategies

#### Improvements:
```typescript
// Declarative strategy definition
const trendStrategy: StrategyConfig = {
  signals: {
    entry: 'CUS',
    exit: 'CDS'
  },
  orders: {
    type: 'LIMIT',
    entryOffset: 0,
    stopLoss: 'BAR_LOW',
    takeProfit: 'PREVIOUS_SIGNAL_OPEN'
  }
};

// Framework handles all the implementation details
const strategy = createStrategy(trendStrategy);
```

### 4. **UI/UX Improvements**

#### Current Issues:
- **Manual State Sync**: UI must manually sync with OrderManager
- **Complex Props Drilling**: Many props passed through multiple components

#### Improvements:
```typescript
// Use React Context or state management library
const { orders, positions, trades } = useBacktestState();

// Automatic state synchronization
<BacktestProvider engine={backtestEngine}>
  <TradeChart />
  <OrderPanel />
  <ResultsPanel />
</BacktestProvider>
```

### 5. **Testing and Debugging**

#### Current Issues:
- **Console Log Debugging**: Heavy reliance on console.log
- **No Time Travel**: Can't easily replay specific scenarios

#### Improvements:
```typescript
// Built-in debugging tools
interface BacktestDebugger {
  // Record all state changes
  history: StateChange[];
  
  // Time travel debugging
  goToBar(index: number): void
  goToState(stateId: string): void
  
  // Visual debugging
  showStateAt(barIndex: number): void
}
```

### 6. **Performance Optimizations**

#### Current Issues:
- **Full State Recalculation**: Recalculates everything on each bar
- **Inefficient Order Matching**: Linear search through orders

#### Improvements:
```typescript
// Incremental updates
class IncrementalBacktester {
  // Only process changes since last bar
  processDelta(previousState: State, newBar: Bar): StateDelta
  
  // Indexed data structures
  ordersByPrice: Map<number, Order[]>
  ordersByTime: Map<number, Order[]>
}
```

### 7. **Type Safety Improvements**

#### Current Issues:
- **Any Types**: Using `(trade as any)` for custom properties
- **String Literals**: Signal types as strings in some places

#### Improvements:
```typescript
// Fully typed trade objects
interface TradWithProtectiveOrders extends Trade {
  protective: {
    stopLossPrice: number;
  }
}

// Compile-time signal validation
type SignalType = 'CUS' | 'CDS';
const signals: Record<SignalType, Signal> = {...};
```

## Summary

The current system works but has accumulated complexity from iterative development. The main areas for improvement are:

1. **Unified State Management**: Single source of truth instead of distributed state
2. **Declarative APIs**: Define what you want, not how to do it
3. **First-Class Concepts**: Make bracket orders, P&L tracking, etc. built-in features
4. **Better Developer Experience**: Type safety, debugging tools, less boilerplate
5. **Performance**: Incremental updates, better data structures
6. **Testability**: Pure functions, dependency injection, time-travel debugging

These improvements would make the system more maintainable, easier to understand, and faster to develop new strategies. 