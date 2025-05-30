import { v4 as uuidv4 } from 'uuid';
import {
  Order,
  OrderRequest,
  OrderStatus,
  OrderType,
  OrderSide,
  TimeInForce,
  OrderFill,
  OrderUpdate,
  ExecutionReport,
  MarketData,
  CommissionStructure,
  SlippageModel,
  RiskLimits,
} from './types';
import { PositionManager } from './PositionManager';
import { EventEmitter } from 'events';

export class OrderManager extends EventEmitter {
  private orders: Map<string, Order> = new Map();
  private pendingOrders: Map<string, Order> = new Map();
  private orderHistory: Order[] = [];
  private positionManager: PositionManager;
  private commissionStructure: CommissionStructure;
  private slippageModel: SlippageModel;
  private riskLimits: RiskLimits;
  private isBacktesting: boolean;

  constructor(
    positionManager: PositionManager,
    commissionStructure: CommissionStructure = { perContract: 5 },
    slippageModel: SlippageModel = { type: 'FIXED', value: 0 },
    riskLimits: RiskLimits = {},
    isBacktesting: boolean = true
  ) {
    super();
    this.positionManager = positionManager;
    this.commissionStructure = commissionStructure;
    this.slippageModel = slippageModel;
    this.riskLimits = riskLimits;
    this.isBacktesting = isBacktesting;
  }

  // Submit a new order
  async submitOrder(request: OrderRequest): Promise<Order> {
    // Validate order request
    this.validateOrderRequest(request);

    // Create order
    const order: Order = {
      id: uuidv4(),
      strategyId: request.strategyId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      price: request.price,
      stopPrice: request.stopPrice,
      timeInForce: request.timeInForce || TimeInForce.GTC,
      status: OrderStatus.PENDING,
      filledQuantity: 0,
      commission: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: request.metadata,
    };

    // Check risk limits
    this.checkRiskLimits(order);

    // Store order
    this.orders.set(order.id, order);
    this.pendingOrders.set(order.id, order);

    // Update status to submitted
    order.status = OrderStatus.SUBMITTED;
    order.submittedAt = new Date();
    order.updatedAt = new Date();

    // Emit order submitted event
    this.emit('orderSubmitted', order);

    return order;
  }

  // Execute order against market data
  async executeOrder(orderId: string, marketData: MarketData): Promise<ExecutionReport | null> {
    const order = this.orders.get(orderId);
    if (!order || order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      return null;
    }

    // Check if order should be executed
    if (!this.shouldExecute(order, marketData)) {
      return null;
    }

    // Calculate execution details
    const executionPrice = this.calculateExecutionPrice(order, marketData);
    const slippage = this.calculateSlippage(order, marketData);
    const finalPrice = executionPrice + (order.side === OrderSide.BUY ? slippage : -slippage);
    
    // Calculate fill quantity (for now, assume full fill)
    const fillQuantity = order.quantity - order.filledQuantity;
    
    // Calculate commission
    const commission = this.calculateCommission(fillQuantity, finalPrice);

    // Create fill
    const fill: OrderFill = {
      orderId: order.id,
      fillId: uuidv4(),
      quantity: fillQuantity,
      price: finalPrice,
      commission,
      timestamp: new Date(),
      slippage,
    };

    // Update order
    order.filledQuantity += fillQuantity;
    order.averageFillPrice = 
      ((order.averageFillPrice || 0) * (order.filledQuantity - fillQuantity) + finalPrice * fillQuantity) / 
      order.filledQuantity;
    order.commission += commission;
    order.status = order.filledQuantity >= order.quantity ? OrderStatus.FILLED : OrderStatus.PARTIAL_FILLED;
    order.updatedAt = new Date();
    
    if (order.status === OrderStatus.FILLED) {
      order.filledAt = new Date();
      this.pendingOrders.delete(order.id);
    }

    // Update position
    await this.positionManager.processOrderFill(order, fill);

    // Create execution report
    const executionReport: ExecutionReport = {
      orderId: order.id,
      fillId: fill.fillId,
      symbol: order.symbol,
      side: order.side,
      quantity: fillQuantity,
      price: finalPrice,
      commission,
      timestamp: new Date(),
      remainingQuantity: order.quantity - order.filledQuantity,
      orderStatus: order.status,
      averageFillPrice: order.averageFillPrice,
      totalFilledQuantity: order.filledQuantity,
    };

    // Emit events
    this.emit('orderFilled', order, fill);
    this.emit('executionReport', executionReport);

    return executionReport;
  }

  // Cancel order
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      return false;
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.updatedAt = new Date();
    this.pendingOrders.delete(orderId);

    this.emit('orderCancelled', order);
    return true;
  }

  // Update order
  async updateOrder(update: OrderUpdate): Promise<Order | null> {
    const order = this.orders.get(update.orderId);
    if (!order || order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      return null;
    }

    if (update.quantity !== undefined) order.quantity = update.quantity;
    if (update.price !== undefined) order.price = update.price;
    if (update.stopPrice !== undefined) order.stopPrice = update.stopPrice;
    order.updatedAt = new Date();

    this.emit('orderUpdated', order);
    return order;
  }

  // Process market data update
  async processMarketData(marketData: MarketData): Promise<void> {
    // Execute pending orders
    for (const order of this.pendingOrders.values()) {
      if (order.symbol === marketData.symbol) {
        await this.executeOrder(order.id, marketData);
      }
    }
  }

  // Get order by ID
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  // Get all orders
  getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  // Get pending orders
  getPendingOrders(): Order[] {
    return Array.from(this.pendingOrders.values());
  }

  // Get orders by status
  getOrdersByStatus(status: OrderStatus): Order[] {
    return this.getAllOrders().filter(order => order.status === status);
  }

  // Get orders by symbol
  getOrdersBySymbol(symbol: string): Order[] {
    return this.getAllOrders().filter(order => order.symbol === symbol);
  }

  // Private methods
  private validateOrderRequest(request: OrderRequest): void {
    if (!request.symbol) throw new Error('Symbol is required');
    if (!request.side) throw new Error('Side is required');
    if (!request.type) throw new Error('Type is required');
    if (!request.quantity || request.quantity <= 0) throw new Error('Quantity must be positive');
    
    if (request.type === OrderType.LIMIT && !request.price) {
      throw new Error('Price is required for limit orders');
    }
    
    if ((request.type === OrderType.STOP || request.type === OrderType.STOP_LIMIT) && !request.stopPrice) {
      throw new Error('Stop price is required for stop orders');
    }
  }

  private checkRiskLimits(order: Order): void {
    // Check max order size
    if (this.riskLimits.maxOrderSize && order.quantity > this.riskLimits.maxOrderSize) {
      throw new Error(`Order size ${order.quantity} exceeds maximum ${this.riskLimits.maxOrderSize}`);
    }

    // Check max open orders
    if (this.riskLimits.maxOpenOrders && this.pendingOrders.size >= this.riskLimits.maxOpenOrders) {
      throw new Error(`Maximum open orders limit reached: ${this.riskLimits.maxOpenOrders}`);
    }

    // Check short selling
    if (!this.riskLimits.allowShortSelling && order.side === OrderSide.SELL) {
      const position = this.positionManager.getPosition(order.symbol);
      if (!position || position.quantity < order.quantity) {
        throw new Error('Short selling is not allowed');
      }
    }
  }

  private shouldExecute(order: Order, marketData: MarketData): boolean {
    switch (order.type) {
      case OrderType.MARKET:
        return true;
      
      case OrderType.LIMIT:
        if (order.side === OrderSide.BUY) {
          return marketData.ask <= (order.price || 0);
        } else {
          return marketData.bid >= (order.price || 0);
        }
      
      case OrderType.STOP:
        if (order.side === OrderSide.BUY) {
          return marketData.last >= (order.stopPrice || 0);
        } else {
          return marketData.last <= (order.stopPrice || 0);
        }
      
      case OrderType.STOP_LIMIT:
        // Stop triggered
        const stopTriggered = order.side === OrderSide.BUY
          ? marketData.last >= (order.stopPrice || 0)
          : marketData.last <= (order.stopPrice || 0);
        
        if (!stopTriggered) return false;
        
        // Then check limit
        if (order.side === OrderSide.BUY) {
          return marketData.ask <= (order.price || 0);
        } else {
          return marketData.bid >= (order.price || 0);
        }
      
      default:
        return false;
    }
  }

  private calculateExecutionPrice(order: Order, marketData: MarketData): number {
    if (this.isBacktesting) {
      // In backtesting, use last price for market orders
      if (order.type === OrderType.MARKET || order.type === OrderType.STOP) {
        return marketData.last;
      } else {
        return order.price || marketData.last;
      }
    } else {
      // In live trading, use bid/ask
      if (order.type === OrderType.MARKET || order.type === OrderType.STOP) {
        return order.side === OrderSide.BUY ? marketData.ask : marketData.bid;
      } else {
        return order.price || (order.side === OrderSide.BUY ? marketData.ask : marketData.bid);
      }
    }
  }

  private calculateSlippage(order: Order, marketData: MarketData): number {
    switch (this.slippageModel.type) {
      case 'FIXED':
        return this.slippageModel.value;
      
      case 'PERCENTAGE':
        return marketData.last * (this.slippageModel.value / 100);
      
      case 'VOLUME_BASED':
        // More sophisticated slippage based on order size vs volume
        const volumeImpact = order.quantity / marketData.volume;
        return marketData.last * volumeImpact * this.slippageModel.value;
      
      default:
        return 0;
    }
  }

  private calculateCommission(quantity: number, price: number): number {
    let commission = 0;
    
    if (this.commissionStructure.perContract) {
      commission += quantity * this.commissionStructure.perContract;
    }
    
    if (this.commissionStructure.perTrade) {
      commission += this.commissionStructure.perTrade;
    }
    
    if (this.commissionStructure.percentage) {
      commission += (quantity * price) * (this.commissionStructure.percentage / 100);
    }
    
    if (this.commissionStructure.minimum && commission < this.commissionStructure.minimum) {
      commission = this.commissionStructure.minimum;
    }
    
    if (this.commissionStructure.maximum && commission > this.commissionStructure.maximum) {
      commission = this.commissionStructure.maximum;
    }
    
    return commission;
  }

  // Clear all orders (useful for backtesting reset)
  clearAll(): void {
    this.orders.clear();
    this.pendingOrders.clear();
    this.orderHistory = [];
  }
} 