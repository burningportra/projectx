import { BacktestBarData, Order, SimulatedTrade, OrderStatus, UTCTimestamp } from './types/backtester';
import { messageBus, MessageType } from './MessageBus';

// Extended interface for positions with additional fields
interface ExtendedSimulatedTrade extends SimulatedTrade {
  symbol?: string;
}

export interface CacheState {
  // Market Data
  bars: Map<string, BacktestBarData[]>; // key: symbol-timeframe
  latestBars: Map<string, BacktestBarData>; // key: symbol
  
  // Orders
  orders: Map<string, Order>; // key: orderId
  ordersByStatus: Map<OrderStatus, Set<string>>; // status -> orderIds
  
  // Positions
  openPositions: Map<string, ExtendedSimulatedTrade>; // key: tradeId
  closedPositions: Map<string, ExtendedSimulatedTrade>; // key: tradeId
  
  // Strategy State
  strategyStates: Map<string, any>; // key: strategyId
  indicators: Map<string, Map<string, number>>; // strategyId -> indicatorName -> value
  
  // Performance
  equity: number[];
  balance: number;
  unrealizedPnL: number;
}

export class Cache {
  private state: CacheState;
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();

  constructor(initialBalance: number = 100000) {
    this.state = {
      bars: new Map(),
      latestBars: new Map(),
      orders: new Map(),
      ordersByStatus: new Map([
        [OrderStatus.PENDING, new Set()],
        [OrderStatus.FILLED, new Set()],
        [OrderStatus.CANCELLED, new Set()],
        [OrderStatus.REJECTED, new Set()],
      ]),
      openPositions: new Map(),
      closedPositions: new Map(),
      strategyStates: new Map(),
      indicators: new Map(),
      equity: [initialBalance],
      balance: initialBalance,
      unrealizedPnL: 0,
    };

    this.setupMessageBusIntegration();
  }

  private setupMessageBusIntegration(): void {
    // Subscribe to order events
    messageBus.subscribe(MessageType.ORDER_SUBMITTED, (msg) => {
      this.addOrder(msg.data.order);
    });

    messageBus.subscribe(MessageType.ORDER_FILLED, (msg) => {
      this.updateOrderStatus(msg.data.orderId, OrderStatus.FILLED, msg.data);
    });

    messageBus.subscribe(MessageType.ORDER_CANCELLED, (msg) => {
      this.updateOrderStatus(msg.data.orderId, OrderStatus.CANCELLED);
    });

    // Subscribe to position events
    messageBus.subscribe(MessageType.POSITION_OPENED, (msg) => {
      this.addOpenPosition(msg.data.position);
    });

    messageBus.subscribe(MessageType.POSITION_CLOSED, (msg) => {
      this.closePosition(msg.data.positionId, msg.data.closePrice, msg.data.closeTime);
    });

    // Subscribe to market data
    messageBus.subscribe(MessageType.BAR_RECEIVED, (msg) => {
      this.addBar(msg.data.symbol, msg.data.timeframe, msg.data.bar);
    });
  }

  // Market Data Methods
  addBar(symbol: string, timeframe: string, bar: BacktestBarData): void {
    const key = `${symbol}-${timeframe}`;
    if (!this.state.bars.has(key)) {
      this.state.bars.set(key, []);
    }
    this.state.bars.get(key)!.push(bar);
    this.state.latestBars.set(symbol, bar);
    
    // Update unrealized P&L when new bar arrives
    this.updateUnrealizedPnL();
    
    this.notifySubscribers('bars', { symbol, timeframe, bar });
  }

  getBars(symbol: string, timeframe: string, limit?: number): BacktestBarData[] {
    const key = `${symbol}-${timeframe}`;
    const bars = this.state.bars.get(key) || [];
    return limit ? bars.slice(-limit) : bars;
  }

  getLatestBar(symbol: string): BacktestBarData | undefined {
    return this.state.latestBars.get(symbol);
  }

  // Order Methods
  addOrder(order: Order): void {
    this.state.orders.set(order.id, order);
    this.state.ordersByStatus.get(order.status)?.add(order.id);
    this.notifySubscribers('orders', order);
  }

  updateOrderStatus(orderId: string, newStatus: OrderStatus, updates?: Partial<Order>): void {
    const order = this.state.orders.get(orderId);
    if (!order) return;

    // Remove from old status set
    this.state.ordersByStatus.get(order.status)?.delete(orderId);
    
    // Update order
    const updatedOrder = { ...order, ...updates, status: newStatus };
    this.state.orders.set(orderId, updatedOrder);
    
    // Add to new status set
    this.state.ordersByStatus.get(newStatus)?.add(orderId);
    
    this.notifySubscribers('orders', updatedOrder);
  }

  getOrder(orderId: string): Order | undefined {
    return this.state.orders.get(orderId);
  }

  getOrdersByStatus(status: OrderStatus): Order[] {
    const orderIds = this.state.ordersByStatus.get(status) || new Set();
    return Array.from(orderIds).map(id => this.state.orders.get(id)!).filter(Boolean);
  }

  // Position Methods
  addOpenPosition(position: ExtendedSimulatedTrade): void {
    this.state.openPositions.set(position.id, position);
    this.updateUnrealizedPnL();
    this.notifySubscribers('positions', position);
  }

  closePosition(positionId: string, closePrice: number, closeTime: number): void {
    const position = this.state.openPositions.get(positionId);
    if (!position) return;

    const closedPosition: ExtendedSimulatedTrade = {
      ...position,
      exitPrice: closePrice,
      exitTime: closeTime as UTCTimestamp,
      status: 'CLOSED' as const,
      profitOrLoss: this.calculatePnL(position, closePrice),
    };

    this.state.openPositions.delete(positionId);
    this.state.closedPositions.set(positionId, closedPosition);
    
    // Update balance
    this.state.balance += closedPosition.profitOrLoss!;
    this.state.equity.push(this.state.balance + this.state.unrealizedPnL);
    
    this.updateUnrealizedPnL();
    this.notifySubscribers('positions', closedPosition);
  }

  private calculatePnL(position: ExtendedSimulatedTrade, closePrice: number): number {
    const multiplier = position.type === 'BUY' ? 1 : -1;
    return (closePrice - position.entryPrice) * position.size * multiplier;
  }

  private updateUnrealizedPnL(): void {
    let totalUnrealizedPnL = 0;
    
    this.state.openPositions.forEach(position => {
      const latestBar = this.state.latestBars.get(position.symbol || '');
      if (latestBar) {
        totalUnrealizedPnL += this.calculatePnL(position, latestBar.close);
      }
    });
    
    this.state.unrealizedPnL = totalUnrealizedPnL;
  }

  getOpenPositions(): ExtendedSimulatedTrade[] {
    return Array.from(this.state.openPositions.values());
  }

  getClosedPositions(): ExtendedSimulatedTrade[] {
    return Array.from(this.state.closedPositions.values());
  }

  // Strategy State Methods
  setStrategyState(strategyId: string, state: any): void {
    this.state.strategyStates.set(strategyId, state);
    this.notifySubscribers('strategyState', { strategyId, state });
  }

  getStrategyState(strategyId: string): any {
    return this.state.strategyStates.get(strategyId);
  }

  updateIndicator(strategyId: string, indicatorName: string, value: number): void {
    if (!this.state.indicators.has(strategyId)) {
      this.state.indicators.set(strategyId, new Map());
    }
    this.state.indicators.get(strategyId)!.set(indicatorName, value);
    this.notifySubscribers('indicators', { strategyId, indicatorName, value });
  }

  getIndicators(strategyId: string): Map<string, number> | undefined {
    return this.state.indicators.get(strategyId);
  }

  // Performance Methods
  getEquityCurve(): number[] {
    return [...this.state.equity];
  }

  getBalance(): number {
    return this.state.balance;
  }

  getUnrealizedPnL(): number {
    return this.state.unrealizedPnL;
  }

  getTotalEquity(): number {
    return this.state.balance + this.state.unrealizedPnL;
  }

  // Subscription Methods
  subscribe(topic: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(callback);
    
    return () => {
      this.subscribers.get(topic)?.delete(callback);
    };
  }

  private notifySubscribers(topic: string, data: any): void {
    this.subscribers.get(topic)?.forEach(callback => callback(data));
  }

  // Utility Methods
  reset(): void {
    const initialBalance = this.state.equity[0];
    this.state = {
      bars: new Map(),
      latestBars: new Map(),
      orders: new Map(),
      ordersByStatus: new Map([
        [OrderStatus.PENDING, new Set()],
        [OrderStatus.FILLED, new Set()],
        [OrderStatus.CANCELLED, new Set()],
        [OrderStatus.REJECTED, new Set()],
      ]),
      openPositions: new Map(),
      closedPositions: new Map(),
      strategyStates: new Map(),
      indicators: new Map(),
      equity: [initialBalance],
      balance: initialBalance,
      unrealizedPnL: 0,
    };
  }

  getSnapshot(): CacheState {
    // Deep copy the state for debugging/analysis
    return JSON.parse(JSON.stringify({
      bars: Array.from(this.state.bars.entries()),
      latestBars: Array.from(this.state.latestBars.entries()),
      orders: Array.from(this.state.orders.entries()),
      ordersByStatus: Array.from(this.state.ordersByStatus.entries()).map(([status, ids]) => [status, Array.from(ids)]),
      openPositions: Array.from(this.state.openPositions.entries()),
      closedPositions: Array.from(this.state.closedPositions.entries()),
      strategyStates: Array.from(this.state.strategyStates.entries()),
      indicators: Array.from(this.state.indicators.entries()).map(([id, indicators]) => [id, Array.from(indicators.entries())]),
      equity: this.state.equity,
      balance: this.state.balance,
      unrealizedPnL: this.state.unrealizedPnL,
    }));
  }
}

// Singleton instance
export const cache = new Cache(); 