  async submitOrder(order: Partial<Order>): Promise<Order> {
    console.log('[OrderManager] submitOrder called with:', order);
    
    const fullOrder: Order = {
      id: this.generateOrderId(),
      status: OrderStatus.PENDING,
      submittedTime: Date.now(),
      ...order
    } as Order;

    console.log('[OrderManager] Created full order:', fullOrder);

    this.orders.set(fullOrder.id, fullOrder);
    
    // Simulate order submission delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Update status to submitted
    fullOrder.status = OrderStatus.SUBMITTED;
    
    // Publish order submitted event
    this.messageBus.publish(
      MessageType.ORDER_SUBMITTED,
      this.constructor.name,
      { order: fullOrder }
    );

    console.log('[OrderManager] Published ORDER_SUBMITTED event');
    
    // For backtesting, immediately fill market orders
    if (this.mode === 'backtest' && fullOrder.type === OrderType.MARKET) {
      console.log('[OrderManager] Backtesting mode - auto-filling market order');
      await this.fillOrder(fullOrder.id, fullOrder.price || 0);
    }
    
    return fullOrder;
  } 