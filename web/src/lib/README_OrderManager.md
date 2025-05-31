# OrderManager

A comprehensive order and position management system for backtesting trading strategies. The OrderManager handles order execution, position tracking, stop loss/take profit orders, and P&L calculations with realistic market simulation.

## Features

- **Order Management**: Market, limit, and stop orders with FIFO execution
- **Position Tracking**: Real-time position management with average entry prices
- **Risk Management**: Automatic stop loss and take profit order handling
- **P&L Calculation**: Real-time unrealized and realized P&L tracking
- **Order Lifecycle**: Complete order state management from submission to execution
- **Multi-Contract Support**: Handle multiple instruments simultaneously

## Core Components

### Order Types

- **MARKET**: Executed immediately at market price (bar open)
- **LIMIT**: Executed when price reaches or betters the limit price
- **STOP**: Converts to market order when stop price is triggered

### Order Status

- **PENDING**: Order submitted but not yet filled
- **FILLED**: Order completely executed
- **PARTIALLY_FILLED**: Order partially executed
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

```typescript
// Process each bar to execute pending orders
const bar = {
  time: (Date.now() / 1000) as UTCTimestamp,
  open: 5650.00,
  high: 5675.00,
  low: 5645.00,
  close: 5670.00,
  volume: 1000
};

const filledOrders = orderManager.processBar(bar, barIndex);
console.log(`${filledOrders.length} orders filled this bar`);
```

## Advanced Features

### Stop Loss and Take Profit Orders

```typescript
// Create stop loss order (2% below entry)
const stopLoss = orderManager.createStopLossOrder(
  OrderSide.BUY,      // Position side
  1,                  // Quantity
  5650.00,           // Entry price
  2.0,               // Stop loss percentage
  bar.time,          // Submission time
  'TRADE_001',       // Parent trade ID
  'ES'               // Contract ID
);

// Create take profit order (4% above entry)
const takeProfit = orderManager.createTakeProfitOrder(
  OrderSide.BUY,      // Position side
  1,                  // Quantity
  5650.00,           // Entry price
  4.0,               // Take profit percentage
  bar.time,          // Submission time
  'TRADE_001',       // Parent trade ID
  'ES'               // Contract ID
);
```

### Position Monitoring

```typescript
// Get open position for a contract
const position = orderManager.getOpenPosition('ES');
if (position) {
  console.log(`Position: ${position.size} @ ${position.averageEntryPrice}`);
  console.log(`Unrealized P&L: ${position.unrealizedPnl.toFixed(2)}`);
  console.log(`Realized P&L: ${position.realizedPnl.toFixed(2)}`);
}

// Get all open positions
const allPositions = orderManager.getAllOpenPositions();
```

### Order Queries

```typescript
// Get pending orders
const pendingOrders = orderManager.getPendingOrders('ES');

// Get filled orders
const filledOrders = orderManager.getFilledOrders('ES');

// Get cancelled orders
const cancelledOrders = orderManager.getCancelledOrders('ES');
```

### Order Cancellation

```typescript
// Cancel specific order
const cancelled = orderManager.cancelOrder('ord_123');

// Cancel all orders for a trade
orderManager.cancelOrdersByTradeId('TRADE_001');

// Cancel all pending orders
orderManager.cancelAllPendingOrders('ES');
```

## P&L Calculations

### Trade P&L

```typescript
// Calculate P&L for a completed trade
const pnl = orderManager.calculateTradePnL(
  5650.00,           // Entry price
  5700.00,           // Exit price
  1,                 // Quantity
  OrderSide.BUY,     // Side
  5.00               // Total commission
);
console.log(`Trade P&L: ${pnl.toFixed(2)}`);
```

### Position P&L

```typescript
// Get complete P&L for a position
const pnlInfo = orderManager.getPositionTotalPnL('ES', 5680.00);
if (pnlInfo) {
  console.log(`Realized: ${pnlInfo.realized.toFixed(2)}`);
  console.log(`Unrealized: ${pnlInfo.unrealized.toFixed(2)}`);
  console.log(`Total: ${pnlInfo.total.toFixed(2)}`);
}
```

### Closed Position Analysis

```typescript
// Analyze a completed trade
const analysis = orderManager.getClosedPositionPnL(
  5650.00,           // Entry price
  5700.00,           // Exit price
  1,                 // Quantity
  OrderSide.BUY,     // Side
  5.00               // Total commission
);

console.log(`Gross P&L: ${analysis.grossPnl.toFixed(2)}`);
console.log(`Net P&L: ${analysis.netPnl.toFixed(2)}`);
console.log(`Return: ${analysis.returnPercent.toFixed(2)}%`);
```

## Order Execution Logic

### Market Orders
- Execute immediately at bar open price
- Always fill (assuming sufficient liquidity)

### Limit Orders
- **Buy Limit**: Fills when bar low ≤ limit price
- **Sell Limit**: Fills when bar high ≥ limit price
- Fills at limit price or better

### Stop Orders
- **Buy Stop**: Triggers when bar high ≥ stop price
- **Sell Stop**: Triggers when bar low ≤ stop price
- Converts to market order upon trigger
- Fills at bar open after trigger

### Stop Loss/Take Profit
- Automatically monitored against open positions
- **Long SL**: Triggers when bar low ≤ stop price
- **Long TP**: Triggers when bar high ≥ target price
- **Short SL**: Triggers when bar high ≥ stop price
- **Short TP**: Triggers when bar low ≤ target price

## State Management

### Complete State Snapshot

```typescript
const currentPrices = new Map([['ES', 5680.00]]);
const state = orderManager.getCompleteState(currentPrices);

console.log('Orders:', state.orders);
console.log('Positions:', state.positions);
```

### Reset Manager

```typescript
// Reset all state (useful for new backtests)
orderManager.reset();
```

## Integration with Strategies

The OrderManager is designed to integrate seamlessly with trading strategies:

```typescript
// In your strategy's processBar method
public processBar(bar: BacktestBarData, barIndex: number): StrategyResult {
  // 1. Process pending orders
  const filledOrders = this.orderManager.processBar(bar, barIndex);
  
  // 2. Handle order fills
  for (const order of filledOrders) {
    this.handleOrderFill(order, bar);
  }
  
  // 3. Generate new signals and submit orders
  const signal = this.generateSignal(bar);
  if (signal) {
    this.submitTradeOrders(signal, bar);
  }
  
  return { signal, filledOrders };
}
```

## Error Handling

- Orders with invalid quantity (≤ 0) are automatically rejected
- Stop loss/take profit orders are cancelled when positions are fully closed
- Partial fills are handled automatically
- Price rounding to tick size prevents invalid prices

## Performance Considerations

- FIFO order processing ensures realistic execution sequence
- Efficient position lookup using Map data structure
- Automatic cleanup of filled/cancelled orders
- Minimal memory footprint with state management

## Best Practices

1. **Always specify parentTradeId** for proper order grouping
2. **Use tick-appropriate prices** (automatically rounded)
3. **Monitor position state** before submitting new orders
4. **Handle order fills** in your strategy logic
5. **Reset state** between backtests for clean results

## Dependencies

- `@/lib/types/backtester`: Type definitions for orders, positions, and market data
- Requires TypeScript for full type safety

## Thread Safety

The OrderManager is designed for single-threaded backtesting environments. For multi-threaded or real-time applications, additional synchronization would be required.
