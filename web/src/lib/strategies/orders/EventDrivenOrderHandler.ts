import { MessageBus, MessageType, Message, Subscription } from '@/lib/MessageBus';
import { OrderManager } from '@/lib/OrderManager';
import { 
  Order, 
  OrderSide, 
  OrderType, 
  OrderStatus,
  BacktestBarData,
  SimulatedTrade,
  TradeType,
  UTCTimestamp
} from '@/lib/types/backtester';

/**
 * Event-driven order handler that manages order lifecycle through events
 * 
 * This component follows NautilusTrader's event-driven architecture by:
 * - Subscribing to SUBMIT_ORDER events from strategies
 * - Managing order creation and submission through OrderManager
 * - Publishing order status updates to MessageBus
 * - Handling order fills, cancellations, and rejections
 * - Maintaining no direct coupling with strategies
 */
export class EventDrivenOrderHandler {
  private messageBus: MessageBus;
  private orderManager: OrderManager;
  private subscriptions: Subscription[] = [];
  private isActive: boolean = false;
  
  // Track order metadata
  private orderMetadata: Map<string, {
    strategyId: string;
    signal?: any;
    tradeId?: string;
    reason?: string;
    timestamp: number;
  }> = new Map();

  constructor(messageBus: MessageBus, orderManager: OrderManager) {
    this.messageBus = messageBus;
    this.orderManager = orderManager;
  }

  /**
   * Start listening for order events
   */
  public start(): void {
    if (this.isActive) {
      console.warn('[EventDrivenOrderHandler] Already started');
      return;
    }

    console.log('[EventDrivenOrderHandler] Starting order handler...');
    
    // Subscribe to order submission requests
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.SUBMIT_ORDER, this.onSubmitOrder.bind(this))
    );
    
    // Subscribe to order cancellation requests
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.CANCEL_ORDER, this.onCancelOrder.bind(this))
    );
    
    // Subscribe to order modification requests
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.MODIFY_ORDER, this.onModifyOrder.bind(this))
    );
    
    // Subscribe to bar updates for order processing
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.BAR_RECEIVED, this.onBarReceived.bind(this))
    );
    
    this.isActive = true;
    console.log('[EventDrivenOrderHandler] Order handler started');
  }

  /**
   * Stop listening for order events
   */
  public stop(): void {
    if (!this.isActive) {
      console.warn('[EventDrivenOrderHandler] Already stopped');
      return;
    }

    console.log('[EventDrivenOrderHandler] Stopping order handler...');
    
    // Unsubscribe from all events
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    // Clear metadata
    this.orderMetadata.clear();
    
    this.isActive = false;
    console.log('[EventDrivenOrderHandler] Order handler stopped');
  }

  /**
   * Handle order submission requests
   */
  private async onSubmitOrder(message: Message): Promise<void> {
    const {
      side,
      quantity,
      type,
      contractId,
      source,
      signal,
      tradeId,
      reason,
      bar,
      price,
      stopPrice,
      isStopLoss,
      isTakeProfit,
      parentTradeId,
      isEntry,
      isExit
    } = message.data;

    try {
      // Create order object
      const order: Partial<Order> = {
        type: type || OrderType.MARKET,
        side,
        quantity,
        contractId,
        price,
        stopPrice,
        isStopLoss,
        isTakeProfit,
        parentTradeId,
        tradeId,
        isEntry,
        isExit,
        submittedTime: (Date.now() / 1000) as UTCTimestamp
      };

      console.log(`[EventDrivenOrderHandler] Creating order:`, {
        type: order.type,
        side: order.side,
        quantity: order.quantity,
        price: order.price,
        contractId: order.contractId,
        isEntry: order.isEntry,
        isExit: order.isExit,
        tradeId: order.tradeId
      });

      // Submit order through OrderManager
      const submittedOrder = this.orderManager.submitOrder(order);

      console.log(`[EventDrivenOrderHandler] Order submitted to OrderManager:`, {
        orderId: submittedOrder.id,
        status: submittedOrder.status,
        type: submittedOrder.type,
        price: submittedOrder.price
      });

      // Store metadata including the source strategy
      this.orderMetadata.set(submittedOrder.id, {
        strategyId: source,
        signal,
        tradeId,
        reason,
        timestamp: Date.now()
      });

      // Publish order submitted event
      this.messageBus.publish(
        MessageType.ORDER_SUBMITTED,
        this.constructor.name,
        {
          order: submittedOrder,
          source: 'EventDrivenOrderHandler',
          strategyId: source,
          signal,
          timestamp: Date.now()
        }
      );

      console.log(`[EventDrivenOrderHandler] Order submitted: ${submittedOrder.id} for ${source}`);
    } catch (error) {
      console.error('[EventDrivenOrderHandler] Error submitting order:', error);
      
      // Publish order rejected event
      this.messageBus.publish(
        MessageType.ORDER_REJECTED,
        this.constructor.name,
        {
          reason: error instanceof Error ? error.message : 'Unknown error',
          orderData: message.data,
          source: 'EventDrivenOrderHandler',
          timestamp: Date.now()
        }
      );
    }
  }

  /**
   * Handle order cancellation requests
   */
  private onCancelOrder(message: Message): void {
    const { orderId, tradeId, strategyId } = message.data;

    try {
      if (orderId) {
        // Cancel specific order
        const success = this.orderManager.cancelOrder(orderId);
        
        if (success) {
          console.log(`[EventDrivenOrderHandler] Order cancelled: ${orderId}`);
          
          // Publish cancellation event
          this.messageBus.publish(
            MessageType.ORDER_CANCELLED,
            this.constructor.name,
            {
              orderId,
              strategyId,
              source: 'EventDrivenOrderHandler',
              timestamp: Date.now()
            }
          );
        }
      } else if (tradeId) {
        // Cancel all orders for a trade
        this.orderManager.cancelOrdersByTradeId(tradeId);
        
        console.log(`[EventDrivenOrderHandler] Orders cancelled for trade: ${tradeId}`);
      }
    } catch (error) {
      console.error('[EventDrivenOrderHandler] Error cancelling order:', error);
    }
  }

  /**
   * Handle order modification requests
   */
  private onModifyOrder(message: Message): void {
    const { orderId, newPrice, newQuantity, newStopPrice } = message.data;

    try {
      // Find the order in the OrderManager's orders
      const orders = this.orderManager.getAllOrders();
      const order = orders.find(o => o.id === orderId);
      
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Modify order properties
      if (newPrice !== undefined && order.type === OrderType.LIMIT) {
        order.price = newPrice;
      }
      if (newQuantity !== undefined) {
        order.quantity = newQuantity;
      }
      if (newStopPrice !== undefined && order.type === OrderType.STOP) {
        order.stopPrice = newStopPrice;
      }

      console.log(`[EventDrivenOrderHandler] Order modified: ${orderId}`);
      
      // Note: In a real system, this would communicate with the broker
      // For backtesting, the modification is applied directly
    } catch (error) {
      console.error('[EventDrivenOrderHandler] Error modifying order:', error);
    }
  }

  /**
   * Handle bar updates for order processing
   */
  private onBarReceived(message: Message): void {
    // Don't process orders here - the strategy handles order processing
    // We just need to track the bar for potential future use
    const { bar, barIndex } = message.data;
    console.log(`[EventDrivenOrderHandler] Bar received: ${bar.time}, but order processing delegated to strategy`);
  }

  /**
   * Get handler statistics
   */
  public getStats(): {
    isActive: boolean;
    pendingOrders: number;
    metadataCount: number;
  } {
    return {
      isActive: this.isActive,
      pendingOrders: this.orderManager.getPendingOrders().length,
      metadataCount: this.orderMetadata.size
    };
  }

  /**
   * Reset the handler
   */
  public reset(): void {
    this.orderMetadata.clear();
    // Note: OrderManager reset should be handled externally
  }

  /**
   * Check if the handler is active
   */
  public isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Create stop loss and take profit orders for a trade
   */
  public createProtectiveOrders(
    trade: SimulatedTrade,
    stopLossPrice?: number,
    takeProfitPrice?: number
  ): void {
    // Extract source from metadata or use a default
    const metadata = this.orderMetadata.get(trade.entryOrder?.id || '');
    const source = metadata?.strategyId || 'Unknown';
    const contractId = trade.entryOrder?.contractId || 'DEFAULT_CONTRACT';
    
    // Create stop loss order
    if (stopLossPrice) {
      const stopSide = trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY;
      
      this.messageBus.publish(
        MessageType.SUBMIT_ORDER,
        source,
        {
          side: stopSide,
          quantity: trade.size,
          type: OrderType.STOP,
          stopPrice: stopLossPrice,
          contractId,
          source,
          parentTradeId: trade.id,
          isStopLoss: true,
          reason: 'Stop loss protection'
        }
      );
    }

    // Create take profit order
    if (takeProfitPrice) {
      const profitSide = trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY;
      
      this.messageBus.publish(
        MessageType.SUBMIT_ORDER,
        source,
        {
          side: profitSide,
          quantity: trade.size,
          type: OrderType.LIMIT,
          price: takeProfitPrice,
          contractId,
          source,
          parentTradeId: trade.id,
          isTakeProfit: true,
          reason: 'Take profit target'
        }
      );
    }
  }
} 