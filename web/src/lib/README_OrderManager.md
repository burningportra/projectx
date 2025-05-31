# OrderManager

A comprehensive order and position management system for backtesting trading strategies. The OrderManager handles order execution, position tracking, stop loss/take profit orders, and P&L calculations with realistic market simulation. It now supports processing against sub-timeframe bars for more precise fill determination.

## Features

- **Order Management**: Market, limit, and stop orders with FIFO execution.
- **Position Tracking**: Real-time position management with average entry prices.
- **Completed Trade Tracking**: Automatic creation of trade records when positions are fully closed.
- **Risk Management**: Automatic stop loss and take profit order handling (OCO).
- **P&L Calculation**: Real-time unrealized and realized P&L tracking.
- **Order Lifecycle**: Complete order state management from submission to execution.
- **Multi-Contract Support**: Handle multiple instruments simultaneously.
- **Sub-Bar Processing**: Optional processing against sub-timeframe bars for higher fidelity execution simulation.
- **P&L Chart Integration**: Provides formatted trade data for equity curve visualization.

## Core Components

### Order Types

- **MARKET**: Executed at the market price (typically the open of the first encountered processing bar).
- **LIMIT**: Executed when price reaches or betters the limit price.
- **STOP**: Triggers when price reaches the stop level and executes at the stop price.

### Order Status

- **PENDING**: Order submitted but not yet filled
- **FILLED**: Order completely executed
- **PARTIALLY_FILLED**: Order partially executed (basic support)
- **CANCELLED**: Order cancelled before execution
- **REJECTED**: Order rejected due to invalid parameters

### Position Management

The OrderManager tracks positions with:
- Position size and average entry price
- Unrealized P&L based on current market price
- Realized P&L from closed portions
- Associated stop loss and take profit orders

## Basic Usage

### Initialization

```typescript
import { OrderManager } from '@/lib/OrderManager';
import { SubBarData } from '@/lib/types/backtester'; // If using sub-bars

// Initialize with tick size (0.25 for ES futures)
const orderManager = new OrderManager(0.25);
```

### Submitting Orders

```typescript
// Market order
const marketOrder = orderManager.submitOrder({
  type: OrderType.MARKET,
  side: OrderSide.BUY,
  quantity: 1,
  contractId: 'ES',
  parentTradeId: 'TRADE_001'
});

// Limit order
const limitOrder = orderManager.submitOrder({
  type: OrderType.LIMIT,
  side: OrderSide.SELL,
  quantity: 1,
  price: 5700.00,
  contractId: 'ES',
  parentTradeId: 'TRADE_001'
});
```

### Processing Market Data

The `processBar` method now accepts an optional array of sub-timeframe bars.

```typescript
// Example main bar
const mainBar = {
  time: (Date.now() / 1000) as UTCTimestamp,
  open: 5650.00,
  high: 5675.00,
  low: 5645.00,
  close: 5670.00,
  volume: 1000
};
const barIndex = 0; // Index of the mainBar

// Example sub-bars (optional)
const subBarsForMainBar: SubBarData[] | undefined = [
  // ... array of SubBarData objects for this mainBar ...
]; // or undefined if not using sub-bar processing

// Process orders against the main bar and its sub-bars (if provided)
const filledOrders = orderManager.processBar(mainBar, subBarsForMainBar, barIndex);
console.log(`${filledOrders.length} orders filled this bar`);
```
If `subBarsForMainBar` is provided and not empty, the OrderManager will iterate through each sub-bar to check for order fills. Otherwise, it will process orders against the `mainBar`'s OHLC data.

## Advanced Features

### Stop Loss and Take Profit Orders

```typescript
// Create stop loss order (2% below entry)
const stopLoss = orderManager.createStopLossOrder(
  OrderSide.BUY,      // Position side
  1,                  // Quantity
  5650.00,           // Entry price
  2.0,               // Stop loss percentage
  mainBar.time,      // Submission time (using mainBar as example)
  'TRADE_001',       // Parent trade ID
  'ES'               // Contract ID
);

// Create take profit order (4% above entry)
const takeProfit = orderManager.createTakeProfitOrder(
  OrderSide.BUY,      // Position side
  1,                  // Quantity
  5650.00,           // Entry price
  4.0,               // Take profit percentage
  mainBar.time,      // Submission time
  'TRADE_001',       // Parent trade ID
  'ES'               // Contract ID
);
```

### Position Monitoring
(No changes to this section's example code)

### Order Queries
(No changes to this section's example code)

### Order Cancellation
(No changes to this section's example code)

## P&L Calculations
(No changes to this section's example code, but fill prices may be more precise due to sub-bar processing)

## Order Execution Logic

If `subBarsForMainBar` are provided to `processBar`, the following logic applies by iterating through each sub-bar sequentially. If sub-bars are not provided or the array is empty, the logic applies to the `mainBar`'s OHLC data. `currentProcessingBar` refers to the sub-bar or main bar being evaluated.

### Market Orders
- Executes at the `open` price of the first encountered `currentProcessingBar` (sub-bar or main bar) where the order is active and pending.
- Always fill (assuming sufficient liquidity).
- Fill timestamp is from the `currentProcessingBar`.

### Limit Orders
- **Buy Limit**: Fills at `order.price` if `currentProcessingBar.low <= order.price`.
- **Sell Limit**: Fills at `order.price` if `currentProcessingBar.high >= order.price`.
- Fill timestamp is from the `currentProcessingBar`.

### Stop Orders (Standalone Entry/Exit)
- **Buy Stop**: Triggers if `currentProcessingBar.high >= order.stopPrice`, fills at `order.stopPrice`.
- **Sell Stop**: Triggers if `currentProcessingBar.low <= order.stopPrice`, fills at `order.stopPrice`.
- Fills occur on the triggering `currentProcessingBar`. Timestamp is from this bar.

### Stop Loss/Take Profit (OCO)
- Automatically monitored against open positions during each `currentProcessingBar`.
- These are typically OCO (One-Cancels-Other).
- **Trigger & Fill (Long Position Example):**
    - SL: If `currentProcessingBar.low <= slOrder.stopPrice`. Fills at `Math.min(currentProcessingBar.open, slOrder.stopPrice)` (accounts for gaps).
    - TP: If `currentProcessingBar.high >= tpOrder.price`. Fills at `tpOrder.price`.
- **Trigger & Fill (Short Position Example):**
    - SL: If `currentProcessingBar.high >= slOrder.stopPrice`. Fills at `Math.max(currentProcessingBar.open, slOrder.stopPrice)`.
    - TP: If `currentProcessingBar.low <= tpOrder.price`. Fills at `tpOrder.price`.
- **OCO Precedence:** If both SL and TP conditions are met by a `currentProcessingBar`'s range:
    - Logic determines which was "hit first" (e.g., if `currentProcessingBar.open` gapped beyond one level).
    - In ambiguous cases (e.g., `currentProcessingBar.open` is between SL and TP, and range covers both), SL takes precedence.
    - The prioritized order fills, and the other (paired SL or TP) is cancelled.
- Fill timestamp is from the triggering `currentProcessingBar`.

## Completed Trade Tracking

The OrderManager automatically tracks completed trades when positions are fully closed. This provides formatted trade data for P&L charts and performance analysis.

```typescript
// Get completed trades for analysis
const completedTrades = orderManager.getCompletedTrades();
console.log(`Total completed trades: ${completedTrades.length}`);

// Each completed trade contains:
// - id: Trade identifier
// - entryTime/exitTime: Timestamps of entry and exit
// - entryPrice/exitPrice: Actual fill prices
// - type: BUY or SELL
// - size: Position size
// - profitOrLoss: Net P&L including commissions
// - exitReason: 'STOP_LOSS', 'TAKE_PROFIT', or 'SIGNAL'
// - status: 'CLOSED'
```

### Integration with Strategy Trade Tracking

Strategies should use OrderManager's completed trades instead of maintaining their own trade lists:

```typescript
// In your strategy class
public getTrades(): SimulatedTrade[] {
  return this.orderManager.getCompletedTrades();
}
```

This ensures the P&L chart and analysis panels receive properly formatted trade data with accurate fill prices and timestamps.

## State Management
(No changes to this section's example code)

## Integration with Strategies

The OrderManager is designed to integrate seamlessly with trading strategies. Strategies should now pass sub-bar data if available.

```typescript
// In your strategy's processBar method
public async processBar(
  mainBar: BacktestBarData,
  subBarsForMainBar: SubBarData[] | undefined, // New parameter
  barIndex: number,
  allMainBars: BacktestBarData[] // Assuming strategy needs all main bars for indicators
): Promise<StrategyResult> { // Example, return type may vary
  
  // 1. Process pending orders using OrderManager
  const filledOrders = this.orderManager.processBar(mainBar, subBarsForMainBar, barIndex);
  
  // 2. Handle order fills
  for (const order of filledOrders) {
    this.handleOrderFill(order, mainBar); // Pass mainBar for context if needed by strategy
  }
  
  // 3. Generate new signals based on mainBar data and submit orders
  const signal = this.generateSignal(mainBar); // Strategy logic typically uses mainBar
  if (signal) {
    this.submitTradeOrders(signal, mainBar); // Pass mainBar for context
  }
  
  // Return strategy result (example)
  return { signal, filledOrders, indicators: {} }; 
}
```

## Error Handling
(No changes to this section)

## Performance Considerations
(No changes to this section, though iterating sub-bars will add some overhead)

## Best Practices
1. **Always specify parentTradeId** for proper order grouping.
2. **Use tick-appropriate prices** (automatically rounded).
3. **Monitor position state** before submitting new orders.
4. **Handle order fills** in your strategy logic.
5. **Reset state** between backtests for clean results.
6. **Provide `subBarsForMainBar`** to `processBar` for higher fidelity fills if available.

## Dependencies
(No changes to this section)

## Thread Safety
(No changes to this section)
