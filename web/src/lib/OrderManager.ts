import { 
  BacktestBarData, 
  Order, 
  OrderType, 
  OrderStatus, 
  OrderSide, 
  OrderManagerState,
  UTCTimestamp 
} from '@/lib/types/backtester';

interface ManagedPosition {
  id: string; // Typically contractId or a strategy-defined ID
  contractId: string;
  size: number;
  averageEntryPrice: number;
  side: OrderSide;
  unrealizedPnl: number;
  realizedPnl: number;
  entryOrders: Order[];
  stopLossOrders: Order[];
  takeProfitOrders: Order[];
  lastUpdateTime: UTCTimestamp;
}

export class OrderManager {
  private orders: Order[] = [];
  private openPositions: Map<string, ManagedPosition> = new Map(); // Key: contractId
  private orderIdCounter = 1;
  private tradeIdCounter = 1; // For linking orders to trades/positions
  private tickSize: number;

  constructor(tickSize: number = 0.25) {
    this.tickSize = tickSize;
  }

  private roundToTickSize(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  submitOrder(orderInput: Partial<Order>): Order {
    const now = (Date.now() / 1000) as UTCTimestamp;
    const order: Order = {
      id: orderInput.id || `ord_${this.orderIdCounter++}`,
      tradeId: orderInput.tradeId || `trade_${this.tradeIdCounter++}`,
      contractId: orderInput.contractId || 'DEFAULT_CONTRACT',
      type: orderInput.type || OrderType.MARKET,
      side: orderInput.side || OrderSide.BUY,
      quantity: orderInput.quantity || 0,
      status: OrderStatus.PENDING,
      submittedTime: orderInput.submittedTime || now,
      price: orderInput.price ? this.roundToTickSize(orderInput.price) : undefined,
      stopPrice: orderInput.stopPrice ? this.roundToTickSize(orderInput.stopPrice) : undefined,
      filledPrice: undefined,
      filledQuantity: 0,
      filledTime: undefined,
      commission: orderInput.commission || 0, // Assume commission is per contract
      message: orderInput.message || '',
      isStopLoss: orderInput.isStopLoss || false,
      isTakeProfit: orderInput.isTakeProfit || false,
      parentTradeId: orderInput.parentTradeId, // Keep parentTradeId if strategy manages trades
    };

    if (order.quantity <= 0) {
      console.warn('[OrderManager] Attempted to submit order with zero or negative quantity:', order);
      order.status = OrderStatus.REJECTED;
      order.message = 'Invalid quantity';
      // Do not add rejected orders to the main queue if they are invalid from the start
      return order;
    }
    
    this.orders.push(order);
    this.orders.sort((a, b) => (a.submittedTime || 0) - (b.submittedTime || 0)); // FIFO
    return order;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.find(o => o.id === orderId && o.status === OrderStatus.PENDING);
    if (order) {
      order.status = OrderStatus.CANCELLED;
      order.message = 'Cancelled by user/strategy';
      // console.log(`[OrderManager] Order ${orderId} cancelled.`);
      // Optionally remove from orders array or filter out later
      this.orders = this.orders.filter(o => o.id !== orderId || o.status !== OrderStatus.CANCELLED);
      return true;
    }
    return false;
  }

  cancelOrdersByTradeId(tradeId: string): void {
    this.orders.forEach(order => {
      if (order.tradeId === tradeId && order.status === OrderStatus.PENDING) {
        this.cancelOrder(order.id);
      }
    });
  }
  
  cancelAllPendingOrders(contractId?: string): void {
    this.orders.forEach(order => {
        if (order.status === OrderStatus.PENDING && (!contractId || order.contractId === contractId)) {
            this.cancelOrder(order.id);
        }
    });
  }

  processBar(bar: BacktestBarData, barIndex: number): Order[] {
    const filledThisBar: Order[] = [];
    const now = bar.time;

    // Trigger Stop Orders first as they can become Market/Limit orders
    for (const order of this.orders) {
      if (order.status === OrderStatus.PENDING && order.type === OrderType.STOP && order.stopPrice) {
        let triggered = false;
        if (order.side === OrderSide.BUY && bar.high >= order.stopPrice) triggered = true;
        if (order.side === OrderSide.SELL && bar.low <= order.stopPrice) triggered = true;

        if (triggered) {
          // console.log(`[OrderManager] Stop order ${order.id} triggered at bar ${barIndex}, price ${order.stopPrice}`);
          order.type = OrderType.MARKET; // Convert to market order upon trigger
          order.message = `${order.message} (Stop Triggered -> Market)`;
          // No price for market order after trigger; it will fill at bar's open/close or simulated price
        }
      }
    }
    
    // Process non-SL/TP Market and Limit orders for entries or regular exits
    // FIFO processing: Iterate over a mutable copy if orders can be removed or status changed mid-loop
    // For now, we assume orders array is stable during this loop pass, or modifications are handled carefully.
    for (const order of [...this.orders]) { // Iterate over a copy
      if (order.status !== OrderStatus.PENDING) continue;
      if (order.isStopLoss || order.isTakeProfit) continue; // SL/TP orders handled separately against position

      let fillPrice: number | undefined = undefined;

      if (order.type === OrderType.MARKET) {
        fillPrice = bar.open; // Simulate market order fill at bar open
      } else if (order.type === OrderType.LIMIT && order.price) {
        if (order.side === OrderSide.BUY && bar.low <= order.price) {
          fillPrice = Math.min(bar.open, order.price); // Fill at order price or better (bar open if gapped down)
        } else if (order.side === OrderSide.SELL && bar.high >= order.price) {
          fillPrice = Math.max(bar.open, order.price); // Fill at order price or better (bar open if gapped up)
        }
      }

      if (fillPrice !== undefined) {
        this.executeFill(order, order.quantity, fillPrice, now, barIndex);
        filledThisBar.push(order);
      }
    }

    // Process SL/TP orders against open positions
    this.openPositions.forEach((position, contractId) => {
        const ordersForPosition = this.orders.filter(o => 
            o.contractId === contractId && 
            o.status === OrderStatus.PENDING &&
            (o.isStopLoss || o.isTakeProfit) &&
            o.parentTradeId === position.id // Ensure SL/TP is for this specific position instance
        );

        for (const order of ordersForPosition) {
            let slTpFillPrice: number | undefined = undefined;
            if (order.isStopLoss && order.stopPrice) {
                if (position.side === OrderSide.BUY && bar.low <= order.stopPrice) { // SL for Long
                    slTpFillPrice = Math.min(bar.open, order.stopPrice); // Fill at stop or worse if gapped
                } else if (position.side === OrderSide.SELL && bar.high >= order.stopPrice) { // SL for Short
                    slTpFillPrice = Math.max(bar.open, order.stopPrice); // Fill at stop or worse if gapped
                }
            } else if (order.isTakeProfit && order.price) {
                 if (position.side === OrderSide.BUY && bar.high >= order.price) { // TP for Long
                    slTpFillPrice = Math.max(bar.open, order.price); 
                } else if (position.side === OrderSide.SELL && bar.low <= order.price) { // TP for Short
                    slTpFillPrice = Math.min(bar.open, order.price);
                }
            }

            if (slTpFillPrice !== undefined) {
                // console.log(`[OrderManager] ${order.isStopLoss ? 'SL' : 'TP'} order ${order.id} hit for position ${position.id} at ${slTpFillPrice}`);
                // Close the portion of the position related to this SL/TP order
                // This assumes SL/TP orders are for the full size of the position segment they protect
                const fillQty = Math.min(order.quantity, position.size); // Cannot fill more than open position size
                if (fillQty > 0) {
                    this.executeFill(order, fillQty, slTpFillPrice, now, barIndex, true); // isClosingTrade = true
                    filledThisBar.push(order);

                    // If SL/TP filled for less than its quantity (due to position size), cancel remainder
                    if (order.quantity > fillQty && order.status === OrderStatus.PENDING) {
                        console.warn(`[OrderManager] SL/TP ${order.id} for ${order.quantity} partially filled for ${fillQty} due to smaller position size. Remainder cancelled.`);
                        this.cancelOrder(order.id); // Cancel if partially filled against a smaller position
                    } else if (order.quantity > fillQty && order.status === OrderStatus.PARTIALLY_FILLED) {
                        // This case should ideally be handled by executeFill reducing order.quantity
                         order.message += ' Remainder cancelled due to smaller position size.';
                         order.status = OrderStatus.CANCELLED; // Effectively
                    }
                }
            }
        }
    });
    
    // Cleanup fully filled or cancelled orders from the main queue
    this.orders = this.orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.PARTIALLY_FILLED);

    // Update unrealized P&L for open positions
    this.openPositions.forEach(pos => {
        if (pos.side === OrderSide.BUY) {
            pos.unrealizedPnl = (bar.close - pos.averageEntryPrice) * pos.size;
        } else {
            pos.unrealizedPnl = (pos.averageEntryPrice - bar.close) * pos.size;
        }
        pos.lastUpdateTime = now;
    });

    return filledThisBar;
  }

  private executeFill(
    order: Order, 
    quantity: number, 
    price: number, 
    time: UTCTimestamp, 
    barIndex: number,
    isClosingTrade: boolean = false // Indicates if this fill is part of closing a position (e.g. SL/TP)
  ): void {
    order.filledQuantity = (order.filledQuantity || 0) + quantity;
    order.filledPrice = price; // For simplicity, last fill price. Averaging could be more complex.
    order.filledTime = time;
    
    if (order.filledQuantity >= order.quantity) {
      order.status = OrderStatus.FILLED;
      order.message = `${order.message} (Filled @ ${price} on bar ${barIndex})`;
    } else {
      order.status = OrderStatus.PARTIALLY_FILLED;
      order.message = `${order.message} (Partially Filled ${order.filledQuantity}/${order.quantity} @ ${price} on bar ${barIndex})`;
    }
    // console.log(`[OrderManager] Order ${order.id} filled: ${order.status} ${order.filledQuantity}/${order.quantity} @ ${price}`);

    // Update or Create Position
    const contractId = order.contractId || 'DEFAULT_CONTRACT';
    let position = this.openPositions.get(contractId);

    if (isClosingTrade || (position && position.side !== order.side)) {
        // This fill is closing or reducing an existing position
        if (position) {
            const pnlPerShare = (order.side === OrderSide.SELL) ? (price - position.averageEntryPrice) : (position.averageEntryPrice - price);
            const realizedPnlForFill = pnlPerShare * quantity - (order.commission || 0) * quantity; // Commission per contract filled
            
            position.realizedPnl += realizedPnlForFill;
            position.size -= quantity;
            
            // console.log(`[OrderManager] Closing/Reducing position ${position.id}. Filled: ${quantity}. New Size: ${position.size}. Realized PnL for fill: ${realizedPnlForFill.toFixed(2)}`);

            if (position.size <= 0) {
                // console.log(`[OrderManager] Position ${position.id} fully closed. Total Realized PnL: ${position.realizedPnl.toFixed(2)}`);
                this.openPositions.delete(contractId);
                // Cancel any remaining SL/TP orders for this fully closed position
                this.orders.forEach(o => {
                    if (o.parentTradeId === position!.id && (o.isStopLoss || o.isTakeProfit) && o.status === OrderStatus.PENDING) {
                        this.cancelOrder(o.id);
                    }
                });
            } else {
                 // Position partially closed, SL/TP orders might need adjustment by strategy
                 // For now, we assume strategy will manage this if it submits new SL/TPs
            }
        }
    } else {
        // This fill is opening or adding to a position
        if (position) { // Adding to existing position
            const totalValueOld = position.averageEntryPrice * position.size;
            const totalValueNew = price * quantity;
            position.averageEntryPrice = (totalValueOld + totalValueNew) / (position.size + quantity);
            position.size += quantity;
            position.realizedPnl -= (order.commission || 0) * quantity; // Commission for new contracts
            // console.log(`[OrderManager] Added to position ${position.id}. New Size: ${position.size}, Avg Entry: ${position.averageEntryPrice.toFixed(2)}`);
        } else { // Opening new position
            position = {
                id: order.parentTradeId || order.tradeId || `pos_${this.tradeIdCounter++}`, // Use parentTradeId from strategy if available
                contractId: contractId,
                size: quantity,
                averageEntryPrice: price,
                side: order.side,
                unrealizedPnl: 0,
                realizedPnl: -(order.commission || 0) * quantity, // Commission for new contracts
                entryOrders: [], // Strategy might populate these
                stopLossOrders: [],
                takeProfitOrders: [],
                lastUpdateTime: time,
            };
            this.openPositions.set(contractId, position);
            // console.log(`[OrderManager] Opened new position ${position.id}. Size: ${position.size}, Avg Entry: ${position.averageEntryPrice.toFixed(2)}`);
        }
         // Strategy is responsible for placing SL/TP for new/modified positions.
         // If order.isStopLoss or isTakeProfit were true here, it implies they were *entry* orders that also act as SL/TP,
         // which is unusual but possible. For now, we assume SL/TP flags are mainly for orders placed against existing positions.
    }
  }

  getPendingOrders(contractId?: string): Order[] {
    return this.orders.filter(o => o.status === OrderStatus.PENDING && (!contractId || o.contractId === contractId));
  }
  
  getFilledOrders(contractId?: string): Order[] {
    return this.orders.filter(o => (o.status === OrderStatus.FILLED || o.status === OrderStatus.PARTIALLY_FILLED) && (!contractId || o.contractId === contractId));
  }

  getCancelledOrders(contractId?: string): Order[] {
    return this.orders.filter(o => o.status === OrderStatus.CANCELLED && (!contractId || o.contractId === contractId));
  }
  
  getAllOrders(contractId?: string): Order[] {
    if (!contractId) return this.orders;
    return this.orders.filter(o => o.contractId === contractId);
  }

  getOpenPosition(contractId: string): ManagedPosition | undefined {
    return this.openPositions.get(contractId);
  }
  
  getAllOpenPositions(): ManagedPosition[] {
    return Array.from(this.openPositions.values());
  }

  reset(): void {
    this.orders = [];
    this.openPositions.clear();
    this.orderIdCounter = 1;
    this.tradeIdCounter = 1;
    // console.log("[OrderManager] State reset.");
  }

  // P&L Calculation Methods
  calculateTradePnL(
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    side: OrderSide,
    commission?: number
  ): number {
    const priceDiff = side === OrderSide.BUY 
      ? (exitPrice - entryPrice) 
      : (entryPrice - exitPrice);
    const grossPnl = priceDiff * quantity;
    const totalCommission = commission || 0;
    return grossPnl - totalCommission;
  }

  calculatePositionUnrealizedPnL(
    position: ManagedPosition,
    currentPrice: number
  ): number {
    const priceDiff = position.side === OrderSide.BUY 
      ? (currentPrice - position.averageEntryPrice) 
      : (position.averageEntryPrice - currentPrice);
    return priceDiff * position.size;
  }

  getPositionTotalPnL(
    contractId: string,
    currentPrice: number
  ): { realized: number; unrealized: number; total: number } | null {
    const position = this.openPositions.get(contractId);
    if (!position) return null;

    const unrealized = this.calculatePositionUnrealizedPnL(position, currentPrice);
    return {
      realized: position.realizedPnl,
      unrealized: unrealized,
      total: position.realizedPnl + unrealized
    };
  }

  // Get closed position P&L info (useful for completed trades)
  getClosedPositionPnL(
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    side: OrderSide,
    totalCommission: number = 0
  ): {
    grossPnl: number;
    netPnl: number;
    commission: number;
    returnPercent: number;
  } {
    const priceDiff = side === OrderSide.BUY 
      ? (exitPrice - entryPrice) 
      : (entryPrice - exitPrice);
    const grossPnl = priceDiff * quantity;
    const netPnl = grossPnl - totalCommission;
    const returnPercent = (priceDiff / entryPrice) * 100;

    return {
      grossPnl,
      netPnl,
      commission: totalCommission,
      returnPercent
    };
  }

  // Enhanced state getter that includes P&L calculations
  getOrderManagerState(currentPrices: Map<string, number>): OrderManagerState {
    return {
      pendingOrders: this.getPendingOrders(),
      filledOrders: this.getFilledOrders(),
      cancelledOrders: this.getCancelledOrders(),
      orderIdCounter: this.orderIdCounter
    };
  }

  // Get complete state with positions and P&L calculations
  getCompleteState(currentPrices: Map<string, number> = new Map()): {
    orders: OrderManagerState;
    positions: Array<ManagedPosition & { 
      unrealizedPnl: number; 
      totalPnl: number; 
      currentPrice: number 
    }>;
  } {
    const positions: Array<ManagedPosition & { 
      unrealizedPnl: number; 
      totalPnl: number; 
      currentPrice: number 
    }> = [];
    
    this.openPositions.forEach((position, contractId) => {
      const currentPrice = currentPrices.get(contractId) || position.averageEntryPrice;
      const unrealizedPnl = this.calculatePositionUnrealizedPnL(position, currentPrice);
      
      positions.push({
        ...position,
        unrealizedPnl,
        totalPnl: position.realizedPnl + unrealizedPnl,
        currentPrice
      });
    });

    return {
      orders: this.getOrderManagerState(currentPrices),
      positions
    };
  }

  // Helper method to create stop loss orders
  createStopLossOrder(
    positionSide: OrderSide,
    quantity: number,
    entryPrice: number,
    stopLossPercent: number,
    submittedTime: UTCTimestamp,
    parentTradeId: string,
    contractId: string = 'DEFAULT_CONTRACT'
  ): Order {
    // Calculate stop price based on position side and stop loss percentage
    let stopPrice: number;
    if (positionSide === OrderSide.BUY) {
      // For long positions, stop loss is below entry price
      stopPrice = entryPrice * (1 - stopLossPercent / 100);
    } else {
      // For short positions, stop loss is above entry price  
      stopPrice = entryPrice * (1 + stopLossPercent / 100);
    }

    const order = this.submitOrder({
      type: OrderType.STOP,
      side: positionSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY, // Opposite side to close position
      quantity: quantity,
      stopPrice: this.roundToTickSize(stopPrice),
      submittedTime: submittedTime,
      parentTradeId: parentTradeId,
      contractId: contractId,
      isStopLoss: true,
      message: `Stop Loss @ ${stopPrice.toFixed(2)} (${stopLossPercent}%)`
    });

    return order;
  }

  // Helper method to create take profit orders
  createTakeProfitOrder(
    positionSide: OrderSide,
    quantity: number,
    entryPrice: number,
    takeProfitPercent: number,
    submittedTime: UTCTimestamp,
    parentTradeId: string,
    contractId: string = 'DEFAULT_CONTRACT'
  ): Order {
    // Calculate take profit price based on position side and take profit percentage
    let takeProfitPrice: number;
    if (positionSide === OrderSide.BUY) {
      // For long positions, take profit is above entry price
      takeProfitPrice = entryPrice * (1 + takeProfitPercent / 100);
    } else {
      // For short positions, take profit is below entry price
      takeProfitPrice = entryPrice * (1 - takeProfitPercent / 100);
    }

    const order = this.submitOrder({
      type: OrderType.LIMIT,
      side: positionSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY, // Opposite side to close position
      quantity: quantity,
      price: this.roundToTickSize(takeProfitPrice),
      submittedTime: submittedTime,
      parentTradeId: parentTradeId,
      contractId: contractId,
      isTakeProfit: true,
      message: `Take Profit @ ${takeProfitPrice.toFixed(2)} (${takeProfitPercent}%)`
    });

    return order;
  }
} 