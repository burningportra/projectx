import { Order, OrderType, OrderSide, OrderStatus, UTCTimestamp } from '../types/backtester';

/**
 * Bracket order configuration
 */
export interface BracketOrderConfig {
  // Entry order details
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryType: OrderType.MARKET | OrderType.LIMIT;
  entryPrice?: number; // Required for LIMIT entry orders
  
  // Stop Loss configuration
  stopLossType: OrderType.STOP | OrderType.STOP_LIMIT;
  stopLossPrice: number; // Stop trigger price
  stopLossLimitPrice?: number; // Required for STOP_LIMIT
  
  // Take Profit configuration
  takeProfitType: OrderType.LIMIT | OrderType.STOP; // Usually LIMIT
  takeProfitPrice: number;
  
  // Order management
  timeInForce?: 'GTC' | 'DAY' | 'IOC' | 'FOK';
  expirationTime?: UTCTimestamp;
  
  // Risk management
  maxSlippage?: number; // Basis points
  allowPartialFills?: boolean;
  
  // Metadata
  clientOrderId?: string;
  tag?: string; // For grouping/tracking
}

/**
 * Bracket order group with linked orders
 */
export interface BracketOrder {
  id: string;
  config: BracketOrderConfig;
  status: BracketOrderStatus;
  createdTime: UTCTimestamp;
  
  // Linked orders
  entryOrder: Order;
  stopLossOrder: Order | null;
  takeProfitOrder: Order | null;
  
  // OCO tracking
  ocoGroupId: string; // Links SL and TP orders
  
  // State tracking
  entryFilled: boolean;
  exitFilled: boolean;
  exitReason?: 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'CANCELLED';
  
  // P&L tracking (updated when entry fills)
  entryFillPrice?: number;
  entryFillQuantity?: number;
  entryFillTime?: UTCTimestamp;
  
  // Exit tracking (updated when exit fills)
  exitFillPrice?: number;
  exitFillQuantity?: number;
  exitFillTime?: UTCTimestamp;
  realizedPnL?: number;
}

/**
 * Bracket order status lifecycle
 */
export enum BracketOrderStatus {
  PENDING_ENTRY = 'PENDING_ENTRY',     // Entry order submitted, waiting for fill
  ENTRY_FILLED = 'ENTRY_FILLED',       // Entry filled, SL/TP orders active
  PARTIALLY_FILLED = 'PARTIALLY_FILLED', // Entry partially filled
  PENDING_EXIT = 'PENDING_EXIT',       // Exit order triggered, waiting for fill
  COMPLETED = 'COMPLETED',             // All orders completed
  CANCELLED = 'CANCELLED',             // Bracket order cancelled
  REJECTED = 'REJECTED',               // Entry order rejected
  EXPIRED = 'EXPIRED',                 // Orders expired
}

/**
 * OCO (One-Cancels-Other) group for managing SL/TP relationships
 */
export interface OCOGroup {
  id: string;
  bracketOrderId: string;
  orderIds: string[]; // Usually [stopLossOrderId, takeProfitOrderId]
  status: 'ACTIVE' | 'TRIGGERED' | 'CANCELLED';
  triggeredOrderId?: string; // Which order in the group was filled
  triggerTime?: UTCTimestamp;
}

/**
 * Event types for bracket order lifecycle
 */
export enum BracketOrderEventType {
  BRACKET_CREATED = 'BRACKET_CREATED',
  ENTRY_FILLED = 'ENTRY_FILLED',
  ENTRY_PARTIAL_FILL = 'ENTRY_PARTIAL_FILL',
  STOP_LOSS_TRIGGERED = 'STOP_LOSS_TRIGGERED',
  TAKE_PROFIT_TRIGGERED = 'TAKE_PROFIT_TRIGGERED',
  BRACKET_COMPLETED = 'BRACKET_COMPLETED',
  BRACKET_CANCELLED = 'BRACKET_CANCELLED',
  OCO_TRIGGERED = 'OCO_TRIGGERED',
}

/**
 * Bracket Order System - Manages complex bracket orders with OCO logic
 * 
 * Features:
 * - Automatic SL/TP order creation when entry fills
 * - OCO logic to cancel opposite orders when one fills
 * - Lifecycle management and P&L tracking
 * - Support for both market and limit entry orders
 * - Risk management and position sizing
 */
export class BracketOrderSystem {
  private bracketOrders = new Map<string, BracketOrder>();
  private ocoGroups = new Map<string, OCOGroup>();
  private orderToBracketMap = new Map<string, string>(); // orderId -> bracketOrderId
  private nextBracketId = 1;
  private nextOCOId = 1;
  
  private eventCallbacks = new Map<BracketOrderEventType, Set<(data: any) => void>>();

  /**
   * Subscribe to bracket order events
   */
  public on(eventType: BracketOrderEventType, callback: (data: any) => void): () => void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, new Set());
    }
    
    this.eventCallbacks.get(eventType)!.add(callback);
    
    return () => {
      this.eventCallbacks.get(eventType)?.delete(callback);
    };
  }

  /**
   * Emit an event to subscribers
   */
  private emit(eventType: BracketOrderEventType, data: any): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in bracket order event callback for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Create a bracket order
   */
  public createBracketOrder(
    config: BracketOrderConfig,
    currentTime: UTCTimestamp,
    orderSubmitter: (order: Order) => void
  ): BracketOrder {
    const bracketOrderId = `BRACKET_${this.nextBracketId++}`;
    const ocoGroupId = `OCO_${this.nextOCOId++}`;

    // Create entry order
    const entryOrder = this.createEntryOrder(config, bracketOrderId, currentTime);
    
    // Create bracket order structure
    const bracketOrder: BracketOrder = {
      id: bracketOrderId,
      config,
      status: BracketOrderStatus.PENDING_ENTRY,
      createdTime: currentTime,
      entryOrder,
      stopLossOrder: null,
      takeProfitOrder: null,
      ocoGroupId,
      entryFilled: false,
      exitFilled: false,
    };

    // Store mappings
    this.bracketOrders.set(bracketOrderId, bracketOrder);
    this.orderToBracketMap.set(entryOrder.id, bracketOrderId);

    // Submit entry order
    orderSubmitter(entryOrder);

    this.emit(BracketOrderEventType.BRACKET_CREATED, {
      bracketOrder,
      entryOrderId: entryOrder.id,
    });

    return bracketOrder;
  }

  /**
   * Handle order fill events from the matching engine
   */
  public handleOrderFill(orderId: string, fillPrice: number, fillQuantity: number, fillTime: UTCTimestamp, orderSubmitter: (order: Order) => void): void {
    const bracketOrderId = this.orderToBracketMap.get(orderId);
    if (!bracketOrderId) return; // Not a bracket order

    const bracketOrder = this.bracketOrders.get(bracketOrderId);
    if (!bracketOrder) return;

    // Check if this is the entry order
    if (bracketOrder.entryOrder.id === orderId) {
      this.handleEntryFill(bracketOrder, fillPrice, fillQuantity, fillTime, orderSubmitter);
    } else {
      // This is an exit order (SL or TP)
      this.handleExitFill(bracketOrder, orderId, fillPrice, fillQuantity, fillTime);
    }
  }

  /**
   * Handle entry order fill
   */
  private handleEntryFill(
    bracketOrder: BracketOrder,
    fillPrice: number,
    fillQuantity: number,
    fillTime: UTCTimestamp,
    orderSubmitter: (order: Order) => void
  ): void {
    const wasPartiallyFilled = bracketOrder.entryFilled;
    const remainingQuantity = bracketOrder.entryOrder.quantity - (bracketOrder.entryFillQuantity || 0) - fillQuantity;
    
    // Update bracket order with fill information
    bracketOrder.entryFillPrice = fillPrice;
    bracketOrder.entryFillQuantity = (bracketOrder.entryFillQuantity || 0) + fillQuantity;
    bracketOrder.entryFillTime = fillTime;
    bracketOrder.entryFilled = remainingQuantity <= 0;

    if (remainingQuantity <= 0) {
      // Entry completely filled - create SL/TP orders
      bracketOrder.status = BracketOrderStatus.ENTRY_FILLED;
      this.createExitOrders(bracketOrder, orderSubmitter);

      this.emit(BracketOrderEventType.ENTRY_FILLED, {
        bracketOrderId: bracketOrder.id,
        fillPrice,
        fillQuantity: bracketOrder.entryFillQuantity,
        fillTime,
      });
    } else {
      // Partial fill
      bracketOrder.status = BracketOrderStatus.PARTIALLY_FILLED;

      this.emit(BracketOrderEventType.ENTRY_PARTIAL_FILL, {
        bracketOrderId: bracketOrder.id,
        fillPrice,
        fillQuantity,
        totalFilled: bracketOrder.entryFillQuantity,
        remainingQuantity,
      });
    }
  }

  /**
   * Handle exit order fill (SL or TP)
   */
  private handleExitFill(
    bracketOrder: BracketOrder,
    orderId: string,
    fillPrice: number,
    fillQuantity: number,
    fillTime: UTCTimestamp
  ): void {
    // Determine which exit order was filled
    const isStopLoss = bracketOrder.stopLossOrder?.id === orderId;
    const isTakeProfit = bracketOrder.takeProfitOrder?.id === orderId;

    if (!isStopLoss && !isTakeProfit) return;

    // Update bracket order
    bracketOrder.exitFilled = true;
    bracketOrder.exitFillPrice = fillPrice;
    bracketOrder.exitFillQuantity = fillQuantity;
    bracketOrder.exitFillTime = fillTime;
    bracketOrder.status = BracketOrderStatus.COMPLETED;
    bracketOrder.exitReason = isStopLoss ? 'STOP_LOSS' : 'TAKE_PROFIT';

    // Calculate P&L
    if (bracketOrder.entryFillPrice && bracketOrder.entryFillQuantity) {
      const entryValue = bracketOrder.entryFillPrice * bracketOrder.entryFillQuantity;
      const exitValue = fillPrice * fillQuantity;
      
      if (bracketOrder.config.side === OrderSide.BUY) {
        bracketOrder.realizedPnL = exitValue - entryValue;
      } else {
        bracketOrder.realizedPnL = entryValue - exitValue;
      }
    }

    // Trigger OCO logic - cancel the other exit order
    this.triggerOCO(bracketOrder.ocoGroupId, orderId, fillTime);

    const eventType = isStopLoss 
      ? BracketOrderEventType.STOP_LOSS_TRIGGERED 
      : BracketOrderEventType.TAKE_PROFIT_TRIGGERED;

    this.emit(eventType, {
      bracketOrderId: bracketOrder.id,
      fillPrice,
      fillQuantity,
      fillTime,
      realizedPnL: bracketOrder.realizedPnL,
    });

    this.emit(BracketOrderEventType.BRACKET_COMPLETED, {
      bracketOrder,
      exitReason: bracketOrder.exitReason,
    });
  }

  /**
   * Create entry order
   */
  private createEntryOrder(config: BracketOrderConfig, bracketOrderId: string, currentTime: UTCTimestamp): Order {
    const orderId = `${bracketOrderId}_ENTRY`;

    return {
      id: orderId,
      type: config.entryType,
      side: config.side,
      quantity: config.quantity,
      price: config.entryPrice,
      status: OrderStatus.PENDING,
      submittedTime: currentTime,
      contractId: config.symbol,
      isEntry: true,
      tradeId: bracketOrderId,
      message: `Entry order for bracket ${bracketOrderId}`,
    };
  }

  /**
   * Create exit orders (SL and TP) after entry fill
   */
  private createExitOrders(bracketOrder: BracketOrder, orderSubmitter: (order: Order) => void): void {
    const config = bracketOrder.config;
    const exitSide = config.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const fillQuantity = bracketOrder.entryFillQuantity || config.quantity;

    // Create Stop Loss order
    const stopLossOrder: Order = {
      id: `${bracketOrder.id}_SL`,
      type: config.stopLossType,
      side: exitSide,
      quantity: fillQuantity,
      stopPrice: config.stopLossPrice,
      price: config.stopLossLimitPrice, // For STOP_LIMIT orders
      status: OrderStatus.PENDING,
      submittedTime: bracketOrder.entryFillTime || bracketOrder.createdTime,
      contractId: config.symbol,
      isStopLoss: true,
      isExit: true,
      tradeId: bracketOrder.id,
      message: `Stop Loss for bracket ${bracketOrder.id}`,
    };

    // Create Take Profit order
    const takeProfitOrder: Order = {
      id: `${bracketOrder.id}_TP`,
      type: config.takeProfitType,
      side: exitSide,
      quantity: fillQuantity,
      price: config.takeProfitPrice,
      stopPrice: config.takeProfitType === OrderType.STOP ? config.takeProfitPrice : undefined,
      status: OrderStatus.PENDING,
      submittedTime: bracketOrder.entryFillTime || bracketOrder.createdTime,
      contractId: config.symbol,
      isTakeProfit: true,
      isExit: true,
      tradeId: bracketOrder.id,
      message: `Take Profit for bracket ${bracketOrder.id}`,
    };

    // Update bracket order
    bracketOrder.stopLossOrder = stopLossOrder;
    bracketOrder.takeProfitOrder = takeProfitOrder;

    // Create OCO group
    const ocoGroup: OCOGroup = {
      id: bracketOrder.ocoGroupId,
      bracketOrderId: bracketOrder.id,
      orderIds: [stopLossOrder.id, takeProfitOrder.id],
      status: 'ACTIVE',
    };

    this.ocoGroups.set(bracketOrder.ocoGroupId, ocoGroup);

    // Map orders to bracket
    this.orderToBracketMap.set(stopLossOrder.id, bracketOrder.id);
    this.orderToBracketMap.set(takeProfitOrder.id, bracketOrder.id);

    // Submit exit orders
    orderSubmitter(stopLossOrder);
    orderSubmitter(takeProfitOrder);
  }

  /**
   * Handle OCO logic - cancel other orders when one fills
   */
  private triggerOCO(ocoGroupId: string, triggeredOrderId: string, triggerTime: UTCTimestamp): void {
    const ocoGroup = this.ocoGroups.get(ocoGroupId);
    if (!ocoGroup || ocoGroup.status !== 'ACTIVE') return;

    // Mark OCO as triggered
    ocoGroup.status = 'TRIGGERED';
    ocoGroup.triggeredOrderId = triggeredOrderId;
    ocoGroup.triggerTime = triggerTime;

    // Find orders to cancel (all except the triggered one)
    const ordersToCancelIds = ocoGroup.orderIds.filter(id => id !== triggeredOrderId);

    this.emit(BracketOrderEventType.OCO_TRIGGERED, {
      ocoGroupId,
      triggeredOrderId,
      cancelledOrderIds: ordersToCancelIds,
      triggerTime,
    });

    // Note: The actual order cancellation should be handled by the caller
    // who has access to the order matching engine
  }

  /**
   * Cancel a bracket order
   */
  public cancelBracketOrder(bracketOrderId: string, orderCanceller: (orderId: string) => boolean): boolean {
    const bracketOrder = this.bracketOrders.get(bracketOrderId);
    if (!bracketOrder) return false;

    let cancelledAny = false;

    // Cancel entry order if still pending
    if (bracketOrder.entryOrder.status === OrderStatus.PENDING) {
      if (orderCanceller(bracketOrder.entryOrder.id)) {
        cancelledAny = true;
      }
    }

    // Cancel exit orders if they exist
    if (bracketOrder.stopLossOrder?.status === OrderStatus.PENDING) {
      if (orderCanceller(bracketOrder.stopLossOrder.id)) {
        cancelledAny = true;
      }
    }

    if (bracketOrder.takeProfitOrder?.status === OrderStatus.PENDING) {
      if (orderCanceller(bracketOrder.takeProfitOrder.id)) {
        cancelledAny = true;
      }
    }

    if (cancelledAny) {
      bracketOrder.status = BracketOrderStatus.CANCELLED;
      
      // Cancel OCO group
      const ocoGroup = this.ocoGroups.get(bracketOrder.ocoGroupId);
      if (ocoGroup) {
        ocoGroup.status = 'CANCELLED';
      }

      this.emit(BracketOrderEventType.BRACKET_CANCELLED, {
        bracketOrderId,
      });
    }

    return cancelledAny;
  }

  /**
   * Get all bracket orders
   */
  public getAllBracketOrders(): BracketOrder[] {
    return Array.from(this.bracketOrders.values());
  }

  /**
   * Get bracket order by ID
   */
  public getBracketOrder(bracketOrderId: string): BracketOrder | undefined {
    return this.bracketOrders.get(bracketOrderId);
  }

  /**
   * Get bracket order by underlying order ID
   */
  public getBracketOrderByOrderId(orderId: string): BracketOrder | undefined {
    const bracketOrderId = this.orderToBracketMap.get(orderId);
    return bracketOrderId ? this.bracketOrders.get(bracketOrderId) : undefined;
  }

  /**
   * Get active OCO groups
   */
  public getActiveOCOGroups(): OCOGroup[] {
    return Array.from(this.ocoGroups.values()).filter(group => group.status === 'ACTIVE');
  }

  /**
   * Get OCO group for a bracket order
   */
  public getOCOGroup(ocoGroupId: string): OCOGroup | undefined {
    return this.ocoGroups.get(ocoGroupId);
  }

  /**
   * Reset the system
   */
  public reset(): void {
    this.bracketOrders.clear();
    this.ocoGroups.clear();
    this.orderToBracketMap.clear();
    this.nextBracketId = 1;
    this.nextOCOId = 1;
  }

  /**
   * Get orders that should be cancelled due to OCO trigger
   */
  public getOrdersToCancelForOCO(triggeredOrderId: string): string[] {
    // Find the OCO group containing this order
    for (const ocoGroup of this.ocoGroups.values()) {
      if (ocoGroup.orderIds.includes(triggeredOrderId) && ocoGroup.status === 'ACTIVE') {
        return ocoGroup.orderIds.filter(id => id !== triggeredOrderId);
      }
    }
    return [];
  }
} 