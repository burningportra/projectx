import { OrderManager } from './OrderManager';
import { PositionManager } from './PositionManager';
import {
  OrderRequest,
  OrderType,
  OrderSide,
  TimeInForce,
  Position,
  MarketData,
  Order,
  ExecutionReport,
} from './types';
import { EventEmitter } from 'events';

// Strategy Signal Types
export enum SignalType {
  BUY = 'BUY',
  SELL = 'SELL',
  CLOSE_LONG = 'CLOSE_LONG',
  CLOSE_SHORT = 'CLOSE_SHORT',
  CLOSE_ALL = 'CLOSE_ALL',
  REVERSE = 'REVERSE',
}

export interface StrategySignal {
  type: SignalType;
  symbol: string;
  quantity?: number;
  price?: number;
  stopPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  timeInForce?: TimeInForce;
  metadata?: Record<string, any>;
}

export interface ExecutionConfig {
  defaultQuantity: number;
  maxPositionSize: number;
  useMarketOrders: boolean;
  slippageTolerance?: number;
  allowPartialFills: boolean;
  enableBracketOrders: boolean;
}

export class TradeExecutor extends EventEmitter {
  private orderManager: OrderManager;
  private positionManager: PositionManager;
  private config: ExecutionConfig;
  private pendingSignals: Map<string, StrategySignal[]> = new Map();

  constructor(
    orderManager: OrderManager,
    positionManager: PositionManager,
    config: ExecutionConfig
  ) {
    super();
    this.orderManager = orderManager;
    this.positionManager = positionManager;
    this.config = config;

    // Listen to order events
    this.orderManager.on('orderFilled', this.handleOrderFilled.bind(this));
    this.orderManager.on('orderRejected', this.handleOrderRejected.bind(this));
  }

  // Execute a strategy signal
  async executeSignal(signal: StrategySignal, marketData?: MarketData): Promise<Order[]> {
    const orders: Order[] = [];

    try {
      switch (signal.type) {
        case SignalType.BUY:
          orders.push(...await this.executeBuySignal(signal, marketData));
          break;
        
        case SignalType.SELL:
          orders.push(...await this.executeSellSignal(signal, marketData));
          break;
        
        case SignalType.CLOSE_LONG:
          orders.push(...await this.closePosition(signal.symbol, 'LONG'));
          break;
        
        case SignalType.CLOSE_SHORT:
          orders.push(...await this.closePosition(signal.symbol, 'SHORT'));
          break;
        
        case SignalType.CLOSE_ALL:
          orders.push(...await this.closeAllPositions(signal.symbol));
          break;
        
        case SignalType.REVERSE:
          orders.push(...await this.reversePosition(signal, marketData));
          break;
      }

      this.emit('signalExecuted', signal, orders);
    } catch (error) {
      this.emit('signalError', signal, error);
      throw error;
    }

    return orders;
  }

  // Execute buy signal
  private async executeBuySignal(signal: StrategySignal, marketData?: MarketData): Promise<Order[]> {
    const orders: Order[] = [];
    const position = this.positionManager.getPosition(signal.symbol);
    const quantity = signal.quantity || this.config.defaultQuantity;

    // Check position limits
    if (position && position.side === 'LONG') {
      const newSize = position.quantity + quantity;
      if (newSize > this.config.maxPositionSize) {
        throw new Error(`Position size ${newSize} would exceed maximum ${this.config.maxPositionSize}`);
      }
    }

    // Create main order
    const orderRequest: OrderRequest = {
      symbol: signal.symbol,
      side: OrderSide.BUY,
      type: this.config.useMarketOrders ? OrderType.MARKET : OrderType.LIMIT,
      quantity,
      price: signal.price,
      timeInForce: signal.timeInForce || TimeInForce.GTC,
      metadata: {
        ...signal.metadata,
        signalType: signal.type,
      },
    };

    const mainOrder = await this.orderManager.submitOrder(orderRequest);
    orders.push(mainOrder);

    // Create bracket orders if enabled
    if (this.config.enableBracketOrders && (signal.takeProfit || signal.stopLoss)) {
      orders.push(...await this.createBracketOrders(mainOrder, signal));
    }

    return orders;
  }

  // Execute sell signal
  private async executeSellSignal(signal: StrategySignal, marketData?: MarketData): Promise<Order[]> {
    const orders: Order[] = [];
    const position = this.positionManager.getPosition(signal.symbol);
    const quantity = signal.quantity || this.config.defaultQuantity;

    // Check position limits for short selling
    if (position && position.side === 'SHORT') {
      const newSize = position.quantity + quantity;
      if (newSize > this.config.maxPositionSize) {
        throw new Error(`Position size ${newSize} would exceed maximum ${this.config.maxPositionSize}`);
      }
    }

    // Create main order
    const orderRequest: OrderRequest = {
      symbol: signal.symbol,
      side: OrderSide.SELL,
      type: this.config.useMarketOrders ? OrderType.MARKET : OrderType.LIMIT,
      quantity,
      price: signal.price,
      timeInForce: signal.timeInForce || TimeInForce.GTC,
      metadata: {
        ...signal.metadata,
        signalType: signal.type,
      },
    };

    const mainOrder = await this.orderManager.submitOrder(orderRequest);
    orders.push(mainOrder);

    // Create bracket orders if enabled
    if (this.config.enableBracketOrders && (signal.takeProfit || signal.stopLoss)) {
      orders.push(...await this.createBracketOrders(mainOrder, signal));
    }

    return orders;
  }

  // Close position
  private async closePosition(symbol: string, side: 'LONG' | 'SHORT'): Promise<Order[]> {
    const position = this.positionManager.getPosition(symbol);
    if (!position || position.side !== side || position.quantity === 0) {
      return [];
    }

    const orderRequest: OrderRequest = {
      symbol,
      side: side === 'LONG' ? OrderSide.SELL : OrderSide.BUY,
      type: this.config.useMarketOrders ? OrderType.MARKET : OrderType.LIMIT,
      quantity: position.quantity,
      timeInForce: TimeInForce.IOC, // Immediate or cancel for closing
      metadata: {
        action: 'CLOSE_POSITION',
        positionSide: side,
      },
    };

    const order = await this.orderManager.submitOrder(orderRequest);
    return [order];
  }

  // Close all positions for a symbol
  private async closeAllPositions(symbol: string): Promise<Order[]> {
    const orders: Order[] = [];
    const position = this.positionManager.getPosition(symbol);
    
    if (!position || position.side === 'FLAT') {
      return orders;
    }

    // Cancel all pending orders first
    const pendingOrders = this.orderManager.getPendingOrders()
      .filter(o => o.symbol === symbol);
    
    for (const order of pendingOrders) {
      await this.orderManager.cancelOrder(order.id);
    }

    // Close the position
    if (position.side === 'LONG') {
      orders.push(...await this.closePosition(symbol, 'LONG'));
    } else if (position.side === 'SHORT') {
      orders.push(...await this.closePosition(symbol, 'SHORT'));
    }

    return orders;
  }

  // Reverse position
  private async reversePosition(signal: StrategySignal, marketData?: MarketData): Promise<Order[]> {
    const orders: Order[] = [];
    const position = this.positionManager.getPosition(signal.symbol);
    
    // First close existing position
    if (position && position.side !== 'FLAT') {
      orders.push(...await this.closeAllPositions(signal.symbol));
    }

    // Then open opposite position
    const quantity = signal.quantity || this.config.defaultQuantity;
    const newSignal: StrategySignal = {
      ...signal,
      type: position?.side === 'LONG' ? SignalType.SELL : SignalType.BUY,
      quantity: quantity * 2, // Double to reverse
    };

    if (newSignal.type === SignalType.BUY) {
      orders.push(...await this.executeBuySignal(newSignal, marketData));
    } else {
      orders.push(...await this.executeSellSignal(newSignal, marketData));
    }

    return orders;
  }

  // Create bracket orders (stop loss and take profit)
  private async createBracketOrders(parentOrder: Order, signal: StrategySignal): Promise<Order[]> {
    const orders: Order[] = [];
    const isLong = parentOrder.side === OrderSide.BUY;

    // Create stop loss order
    if (signal.stopLoss) {
      const stopLossRequest: OrderRequest = {
        symbol: signal.symbol,
        side: isLong ? OrderSide.SELL : OrderSide.BUY,
        type: OrderType.STOP,
        quantity: parentOrder.quantity,
        stopPrice: signal.stopLoss,
        timeInForce: TimeInForce.GTC,
        metadata: {
          parentOrderId: parentOrder.id,
          orderType: 'STOP_LOSS',
        },
      };
      
      const stopLossOrder = await this.orderManager.submitOrder(stopLossRequest);
      orders.push(stopLossOrder);
    }

    // Create take profit order
    if (signal.takeProfit) {
      const takeProfitRequest: OrderRequest = {
        symbol: signal.symbol,
        side: isLong ? OrderSide.SELL : OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: parentOrder.quantity,
        price: signal.takeProfit,
        timeInForce: TimeInForce.GTC,
        metadata: {
          parentOrderId: parentOrder.id,
          orderType: 'TAKE_PROFIT',
        },
      };
      
      const takeProfitOrder = await this.orderManager.submitOrder(takeProfitRequest);
      orders.push(takeProfitOrder);
    }

    return orders;
  }

  // Handle order filled event
  private async handleOrderFilled(order: Order): Promise<void> {
    // Cancel related bracket orders if main order is filled
    if (order.metadata?.orderType === 'STOP_LOSS' || order.metadata?.orderType === 'TAKE_PROFIT') {
      const relatedOrders = this.orderManager.getPendingOrders()
        .filter(o => o.metadata?.parentOrderId === order.metadata?.parentOrderId && o.id !== order.id);
      
      for (const relatedOrder of relatedOrders) {
        await this.orderManager.cancelOrder(relatedOrder.id);
      }
    }

    this.emit('orderFilled', order);
  }

  // Handle order rejected event
  private handleOrderRejected(order: Order): void {
    this.emit('orderRejected', order);
  }

  // Process market data update
  async processMarketData(marketData: MarketData): Promise<void> {
    // Update positions with latest market prices
    this.positionManager.updateUnrealizedPnL(marketData.symbol, marketData.last);
    
    // Process pending orders
    await this.orderManager.processMarketData(marketData);
  }

  // Get execution statistics
  getExecutionStats(): {
    totalSignals: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageSlippage: number;
  } {
    // Implementation would track these metrics
    return {
      totalSignals: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageSlippage: 0,
    };
  }

  // Clear all (useful for backtesting reset)
  clearAll(): void {
    this.pendingSignals.clear();
  }
} 