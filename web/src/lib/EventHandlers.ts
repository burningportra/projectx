import { Message, MessageType, messageBus } from './MessageBus';
import { cache } from './Cache';
import { Order, OrderStatus, SimulatedTrade, OrderSide } from './types/backtester';

/**
 * Event handler registry for backtesting system events
 */
export class EventHandlers {
  private subscriptions: Array<{ unsubscribe: () => void }> = [];

  /**
   * Register all event handlers with the message bus
   */
  registerAll(): void {
    // Order events
    this.subscriptions.push(
      messageBus.subscribe(MessageType.ORDER_SUBMITTED, this.handleOrderSubmitted.bind(this))
    );
    this.subscriptions.push(
      messageBus.subscribe(MessageType.ORDER_FILLED, this.handleOrderFilled.bind(this))
    );
    this.subscriptions.push(
      messageBus.subscribe(MessageType.ORDER_CANCELLED, this.handleOrderCancelled.bind(this))
    );
    this.subscriptions.push(
      messageBus.subscribe(MessageType.ORDER_REJECTED, this.handleOrderRejected.bind(this))
    );

    // Position events
    this.subscriptions.push(
      messageBus.subscribe(MessageType.POSITION_OPENED, this.handlePositionOpened.bind(this))
    );
    this.subscriptions.push(
      messageBus.subscribe(MessageType.POSITION_CLOSED, this.handlePositionClosed.bind(this))
    );

    // Strategy events
    this.subscriptions.push(
      messageBus.subscribe(MessageType.SIGNAL_GENERATED, this.handleSignalGenerated.bind(this))
    );
    this.subscriptions.push(
      messageBus.subscribe(MessageType.STRATEGY_STARTED, this.handleStrategyStarted.bind(this))
    );
    this.subscriptions.push(
      messageBus.subscribe(MessageType.STRATEGY_STOPPED, this.handleStrategyStopped.bind(this))
    );

    // Market data events
    this.subscriptions.push(
      messageBus.subscribe(MessageType.BAR_RECEIVED, this.handleBarReceived.bind(this))
    );
  }

  /**
   * Unregister all event handlers
   */
  unregisterAll(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  // Order Event Handlers

  private handleOrderSubmitted(message: Message): void {
    const { order, timestamp } = message.data;
    
    // Update cache with new order
    cache.addOrder(order);
    
    // Log for debugging
    console.log(`[EventHandlers] Order submitted: ${order.id} at ${timestamp}`);
    
    // Additional business logic can be added here
    // For example: risk checks, position sizing validation, etc.
  }

  private handleOrderFilled(message: Message): void {
    const { orderId, order, filledPrice, filledQuantity, filledTime, barIndex, status } = message.data;
    
    // Update order in cache
    cache.updateOrderStatus(orderId, status, {
      filledPrice,
      filledQuantity: order.filledQuantity + filledQuantity,
      filledTime
    });
    
    // Update performance metrics
    if (order.parentTradeId) {
      // This fill is part of a trade, update trade metrics
      const openPositions = cache.getOpenPositions();
      const position = openPositions.find(p => p.id === order.parentTradeId);
      if (position) {
        // Position metrics are updated via cache state updates
        // The cache will handle equity updates automatically
      }
    }
    
    console.log(`[EventHandlers] Order filled: ${orderId} at ${filledPrice}, quantity: ${filledQuantity}`);
  }

  private handleOrderCancelled(message: Message): void {
    const { orderId, order, timestamp } = message.data;
    
    // Update order status in cache
    cache.updateOrderStatus(orderId, OrderStatus.CANCELLED);
    
    console.log(`[EventHandlers] Order cancelled: ${orderId} at ${timestamp}`);
  }

  private handleOrderRejected(message: Message): void {
    const { order, reason } = message.data;
    
    // Log rejection for analysis
    console.warn(`[EventHandlers] Order rejected: ${order.id}, reason: ${reason}`);
    
    // Could trigger alerts or notifications here
  }

  // Position Event Handlers

  private handlePositionOpened(message: Message): void {
    const { positionId, position, entryPrice, entryTime, size, side } = message.data;
    
    // Add position to cache
    cache.addOpenPosition({
      ...position,
      id: positionId,
      entryPrice,
      entryTime,
      size,
      side,
      unrealizedPnL: 0,
      realizedPnL: 0
    });
    
    // Equity is tracked automatically by the cache
    
    console.log(`[EventHandlers] Position opened: ${positionId}, ${side} ${size} @ ${entryPrice}`);
  }

  private handlePositionClosed(message: Message): void {
    const { positionId, position, closePrice, closeTime, realizedPnl, exitReason } = message.data;
    
    // The cache.closePosition method expects 3 parameters
    cache.closePosition(positionId, closePrice, closeTime);
    
    // Balance and equity are updated automatically by the cache
    
    console.log(`[EventHandlers] Position closed: ${positionId}, P&L: ${realizedPnl}, reason: ${exitReason}`);
  }

  // Strategy Event Handlers

  private handleSignalGenerated(message: Message): void {
    const { signal, strategyName, timestamp } = message.data;
    
    // Store signal in strategy state
    const currentState = cache.getStrategyState(strategyName) || { signals: [] };
    currentState.signals.push({
      ...signal,
      strategyName,
      timestamp
    });
    cache.setStrategyState(strategyName, currentState);
    
    console.log(`[EventHandlers] Signal generated by ${strategyName}: ${signal.type} at ${signal.price}`);
  }

  private handleStrategyStarted(message: Message): void {
    const { strategyName, config, timestamp } = message.data;
    
    // Update strategy state in cache
    cache.setStrategyState(strategyName, {
      status: 'RUNNING',
      config,
      startTime: timestamp,
      signals: []
    });
    
    console.log(`[EventHandlers] Strategy started: ${strategyName}`);
  }

  private handleStrategyStopped(message: Message): void {
    const { strategyName, timestamp } = message.data;
    
    // Update strategy state
    const currentState = cache.getStrategyState(strategyName) || {};
    cache.setStrategyState(strategyName, {
      ...currentState,
      status: 'STOPPED',
      stopTime: timestamp
    });
    
    console.log(`[EventHandlers] Strategy stopped: ${strategyName}`);
  }

  // Market Data Event Handlers

  private handleBarReceived(message: Message): void {
    const { bar, symbol, timeframe } = message.data;
    
    // Store bar in history
    cache.addBar(symbol, timeframe, bar);
    
    // Update unrealized P&L for open positions
    const openPositions = cache.getOpenPositions();
    openPositions.forEach((position: any) => {
      if (position.symbol === symbol) {
        const unrealizedPnL = position.side === OrderSide.BUY
          ? (bar.close - position.entryPrice) * position.size
          : (position.entryPrice - bar.close) * position.size;
        
        // The cache automatically updates unrealized P&L when bars are added
      }
    });
    
    // Total equity is calculated automatically by the cache
  }
}

// Singleton instance
export const eventHandlers = new EventHandlers(); 