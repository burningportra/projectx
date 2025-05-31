import { 
  BacktestBarData, 
  Order, 
  OrderType, 
  OrderStatus, 
  OrderSide, 
  OrderManagerState,
  UTCTimestamp,
  SubBarData,
  SimulatedTrade,
  TradeType
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
  private completedTrades: SimulatedTrade[] = []; // Track completed trades for P&L chart
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
    console.log('[OrderManager] submitOrder called with:', {
      type: orderInput.type,
      side: orderInput.side,
      quantity: orderInput.quantity,
      parentTradeId: orderInput.parentTradeId,
      isStopLoss: orderInput.isStopLoss,
      isTakeProfit: orderInput.isTakeProfit
    });
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
      // Cancel orders that match either tradeId or parentTradeId
      if ((order.tradeId === tradeId || order.parentTradeId === tradeId) && order.status === OrderStatus.PENDING) {
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

  processBar(mainBar: BacktestBarData, subBarsForMainBar: SubBarData[] | undefined, barIndex: number): Order[] {
    const filledThisBar: Order[] = [];
    const useSubBars = subBarsForMainBar && subBarsForMainBar.length > 0;
    const barsToProcess = useSubBars ? subBarsForMainBar : [mainBar as SubBarData]; // Treat mainBar as a SubBarData for uniform processing

    for (const currentProcessingBar of barsToProcess) {
      const currentBarTime = currentProcessingBar.time;

      // Process pending orders against the currentProcessingBar (which is either a sub-bar or the mainBar)
      // Note: The order of processing (Stops, then Market/Limit, then SL/TP against positions) is important.
      // We might need to iterate multiple times or refine this order for sub-bar precision.
      // For now, this structure attempts to adapt the existing flow.

      // 1. Trigger Standalone Stop Orders (fill directly at stopPrice)
      // These should ideally be checked first within each sub-bar.
      // Iterate over a copy for safe modification/removal if an order fills
      for (const order of [...this.orders]) { 
        if (order.status === OrderStatus.PENDING && order.type === OrderType.STOP && order.stopPrice && !order.isStopLoss && !order.isTakeProfit) {
          let triggered = false;
          let fillPriceAtStop: number | undefined = undefined;

          if (order.side === OrderSide.BUY && currentProcessingBar.high >= order.stopPrice) {
            triggered = true;
            fillPriceAtStop = order.stopPrice; // Fill at stop price
          } else if (order.side === OrderSide.SELL && currentProcessingBar.low <= order.stopPrice) {
            triggered = true;
            fillPriceAtStop = order.stopPrice; // Fill at stop price
          }

          if (triggered && fillPriceAtStop !== undefined) {
            console.log(`[OrderManager] Standalone Stop order ${order.id} triggered & filled at sub/bar ${barIndex} (time: ${currentBarTime}), price ${fillPriceAtStop}`);
            this.executeFill(order, order.quantity, fillPriceAtStop, currentBarTime, barIndex);
            filledThisBar.push(order);
            // No longer need to convert to market, it's filled directly.
          }
        }
      }

      // 2. Process Market and Limit Orders (non-SL/TP)
      // Ensure already filled stop orders are not re-processed here
      for (const order of [...this.orders]) { 
        if (order.status !== OrderStatus.PENDING) continue; // Skip if not pending (e.g. filled by stop logic above)
        if (order.isStopLoss || order.isTakeProfit) continue; 
        // If it was a STOP order that got filled above, its status is now FILLED.
        // If it was a STOP order that converted to MARKET (old logic, now removed for standalone stops), it would be handled below.
        // We only care about original MARKET or LIMIT orders here, or STOP orders that were NOT standalone entry/exit stops.
        if (order.type === OrderType.STOP) continue; // Standalone stops are handled above.

        let fillPrice: number | undefined = undefined;

        if (order.type === OrderType.MARKET) {
          // Market orders fill at the open of the current processing bar (sub-bar or first main bar)
          // This assumes market orders are placed based on previous bar's close and execute at next open.
          // If it's a converted stop, it should fill based on that trigger.
          fillPrice = currentProcessingBar.open;
        } else if (order.type === OrderType.LIMIT && order.price) {
          if (order.side === OrderSide.BUY && currentProcessingBar.low <= order.price) {
            fillPrice = order.price; // Fill at limit price as per PRD
          } else if (order.side === OrderSide.SELL && currentProcessingBar.high >= order.price) {
            fillPrice = order.price; // Fill at limit price as per PRD
          }
        }

        if (fillPrice !== undefined) {
          console.log(`[OrderManager] Filling order ${order.id} (${order.type} ${order.side}) at ${fillPrice} (time: ${currentBarTime})`);
          this.executeFill(order, order.quantity, fillPrice, currentBarTime, barIndex);
          filledThisBar.push(order);
        }
      }

      // 3. Process SL/TP orders against open positions
      // This needs to be done for each sub-bar as well.
      this.openPositions.forEach((position, contractId) => {
        const ordersForPosition = this.orders.filter(o =>
          o.contractId === contractId &&
          o.status === OrderStatus.PENDING &&
          (o.isStopLoss || o.isTakeProfit) &&
          o.parentTradeId === position.id
        );

        const slOrder = ordersForPosition.find(o => o.isStopLoss && o.status === OrderStatus.PENDING);
        const tpOrder = ordersForPosition.find(o => o.isTakeProfit && o.status === OrderStatus.PENDING);

        let slTriggered = false;
        let tpTriggered = false;

        if (slOrder && slOrder.stopPrice) {
          if (position.side === OrderSide.BUY && currentProcessingBar.low <= slOrder.stopPrice) {
            slTriggered = true;
          } else if (position.side === OrderSide.SELL && currentProcessingBar.high >= slOrder.stopPrice) {
            slTriggered = true;
          }
        }

        if (tpOrder && tpOrder.price) {
          if (position.side === OrderSide.BUY && currentProcessingBar.high >= tpOrder.price) {
            tpTriggered = true;
          } else if (position.side === OrderSide.SELL && currentProcessingBar.low <= tpOrder.price) {
            tpTriggered = true;
          }
        }

        let orderToFill: Order | undefined;
        let fillPriceForOco: number | undefined;
        let cancelledOrder: Order | undefined;

        if (slTriggered && tpTriggered) {
          console.log(`[OrderManager] Ambiguous SL/TP trigger for position ${position.id} on sub-bar time ${currentBarTime}`);
          if (position.side === OrderSide.BUY) {
            if (currentProcessingBar.open <= slOrder!.stopPrice!) {
              orderToFill = slOrder;
              cancelledOrder = tpOrder;
              console.log(`[OrderManager] -> SL gapped at open for long. Filling SL.`);
            } else if (currentProcessingBar.open >= tpOrder!.price!) {
              orderToFill = tpOrder;
              cancelledOrder = slOrder;
              console.log(`[OrderManager] -> TP gapped at open for long. Filling TP.`);
            } else { // Open is between SL and TP. PRD: SL takes precedence.
              orderToFill = slOrder;
              cancelledOrder = tpOrder;
              console.log(`[OrderManager] -> Open between SL & TP for long. Prioritizing SL.`);
            }
          } else { // Short Position
            if (currentProcessingBar.open >= slOrder!.stopPrice!) {
              orderToFill = slOrder;
              cancelledOrder = tpOrder;
              console.log(`[OrderManager] -> SL gapped at open for short. Filling SL.`);
            } else if (currentProcessingBar.open <= tpOrder!.price!) {
              orderToFill = tpOrder;
              cancelledOrder = slOrder;
              console.log(`[OrderManager] -> TP gapped at open for short. Filling TP.`);
            } else { // Open is between SL and TP. PRD: SL takes precedence.
              orderToFill = slOrder;
              cancelledOrder = tpOrder;
              console.log(`[OrderManager] -> Open between SL & TP for short. Prioritizing SL.`);
            }
          }
        } else if (slTriggered) {
          orderToFill = slOrder;
          cancelledOrder = tpOrder;
        } else if (tpTriggered) {
          orderToFill = tpOrder;
          cancelledOrder = slOrder;
        }

        if (orderToFill) {
          if (orderToFill.isStopLoss && orderToFill.stopPrice !== undefined) {
            fillPriceForOco = orderToFill.stopPrice;
          } else if (orderToFill.isTakeProfit && orderToFill.price !== undefined) {
            fillPriceForOco = orderToFill.price;
          }

          if (fillPriceForOco !== undefined) {
            console.log(`[OrderManager] ${orderToFill.isStopLoss ? 'SL' : 'TP'} order ${orderToFill.id} hit for pos ${position.id} at ${fillPriceForOco} (time: ${currentBarTime})`);
            const fillQty = Math.min(orderToFill.quantity, position.size);
            if (fillQty > 0) {
              this.executeFill(orderToFill, fillQty, fillPriceForOco, currentBarTime, barIndex, true);
              filledThisBar.push(orderToFill);
              if (cancelledOrder && cancelledOrder.status === OrderStatus.PENDING) {
                this.cancelOrder(cancelledOrder.id);
                console.log(`[OrderManager] OCO: Cancelled ${cancelledOrder.isStopLoss ? 'SL' : 'TP'} order ${cancelledOrder.id} for trade ${orderToFill.parentTradeId}`);
              }
            }
          }
        }
      });
    } // End of loop over barsToProcess (sub-bars or mainBar)
    
    // Cleanup fully filled or cancelled orders from the main queue
    this.orders = this.orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.PARTIALLY_FILLED);

    // Update unrealized P&L for open positions using the mainBar's close at the end of all processing for this mainBar
    this.openPositions.forEach(pos => {
        if (pos.side === OrderSide.BUY) {
            pos.unrealizedPnl = (mainBar.close - pos.averageEntryPrice) * pos.size;
        } else {
            pos.unrealizedPnl = (pos.averageEntryPrice - mainBar.close) * pos.size;
        }
        pos.lastUpdateTime = mainBar.time; // Use mainBar's time for the EOD unrealized PnL
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

    // Determine if this order should close a position
    const shouldClosePosition = isClosingTrade || order.isExit || order.isStopLoss || order.isTakeProfit || 
                               (position && position.side !== order.side);

    if (shouldClosePosition) {
        // This fill is closing or reducing an existing position
        if (position) {
            const pnlPerShare = (order.side === OrderSide.SELL) ? (price - position.averageEntryPrice) : (position.averageEntryPrice - price);
            const realizedPnlForFill = pnlPerShare * quantity - (order.commission || 0) * quantity; // Commission per contract filled
            
            position.realizedPnl += realizedPnlForFill;
            position.size -= quantity;
            
            // console.log(`[OrderManager] Closing/Reducing position ${position.id}. Filled: ${quantity}. New Size: ${position.size}. Realized PnL for fill: ${realizedPnlForFill.toFixed(2)}`);

            if (position.size <= 0) {
                console.log(`[OrderManager] Position ${position.id} fully closed. Total Realized PnL: ${position.realizedPnl.toFixed(2)}`);
                
                // Create completed trade record for P&L chart
                this.createCompletedTrade(position, order, time);
                
                this.openPositions.delete(contractId);
                console.log(`[OrderManager] Total open positions after deletion: ${this.openPositions.size}`);
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
            console.log(`[OrderManager] Opened new position ${position.id}. Size: ${position.size}, Avg Entry: ${position.averageEntryPrice.toFixed(2)}, ContractId: ${contractId}`);
            console.log(`[OrderManager] Total open positions after creation: ${this.openPositions.size}`);
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
    this.completedTrades = [];
    this.orderIdCounter = 1;
    this.tradeIdCounter = 1;
    // console.log("[OrderManager] State reset.");
  }

  // Create a completed trade record when a position is fully closed
  private createCompletedTrade(position: ManagedPosition, exitOrder: Order, exitTime: UTCTimestamp): void {
    // Find the entry order(s) for this position
    const entryOrders = this.getFilledOrders(position.contractId).filter(o => 
      o.parentTradeId === position.id && (o.isEntry || (!o.isStopLoss && !o.isTakeProfit && !o.isExit))
    );
    
    // Use the first entry order for timing, or fallback to position data
    const entryOrder = entryOrders[0];
    const entryTime = entryOrder?.filledTime || position.lastUpdateTime;
    const entryPrice = position.averageEntryPrice; // Use the calculated average entry price
    const exitPrice = exitOrder.filledPrice || exitOrder.price || position.averageEntryPrice;
    
    // Determine exit reason
    let exitReason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'REVERSAL_EXIT' = 'SIGNAL';
    if (exitOrder.isStopLoss) {
      exitReason = 'STOP_LOSS';
    } else if (exitOrder.isTakeProfit) {
      exitReason = 'TAKE_PROFIT';
    }
    
    const completedTrade: SimulatedTrade = {
      id: position.id,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      type: position.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      size: position.size + (exitOrder.filledQuantity || exitOrder.quantity), // Original position size
      commission: Math.abs(position.realizedPnl + ((exitPrice - entryPrice) * position.size * (position.side === OrderSide.BUY ? 1 : -1))), // Derive commission from difference
      profitOrLoss: position.realizedPnl, // This includes commission already
      status: 'CLOSED',
      exitReason: exitReason,
    };
    
    this.completedTrades.push(completedTrade);
    console.log(`[OrderManager] Created completed trade record: ${completedTrade.id}, P&L: ${completedTrade.profitOrLoss?.toFixed(2)}`);
  }
  
  // Get completed trades for P&L chart
  getCompletedTrades(): SimulatedTrade[] {
    return [...this.completedTrades]; // Return a copy
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
