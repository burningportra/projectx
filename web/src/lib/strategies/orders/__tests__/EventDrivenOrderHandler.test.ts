import { EventDrivenOrderHandler } from '../EventDrivenOrderHandler';
import { MessageBus, MessageType } from '@/lib/MessageBus';
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

describe('EventDrivenOrderHandler', () => {
  let handler: EventDrivenOrderHandler;
  let messageBus: MessageBus;
  let orderManager: OrderManager;
  let mockOrder: Order;

  beforeEach(() => {
    messageBus = new MessageBus();
    orderManager = new OrderManager();
    handler = new EventDrivenOrderHandler(messageBus, orderManager);

    // Create a mock order that submitOrder will return
    mockOrder = {
      id: 'test-order-1',
      type: OrderType.MARKET,
      side: OrderSide.BUY,
      quantity: 100,
      status: OrderStatus.PENDING,
      submittedTime: 1000 as UTCTimestamp,
      contractId: 'TEST'
    };

    // Mock submitOrder to return our mock order
    jest.spyOn(orderManager, 'submitOrder').mockReturnValue(mockOrder);
  });

  afterEach(() => {
    handler.stop();
    messageBus.dispose();
    jest.restoreAllMocks();
  });

  describe('Lifecycle Management', () => {
    it('should start and stop correctly', () => {
      expect(handler.isRunning()).toBe(false);
      
      handler.start();
      expect(handler.isRunning()).toBe(true);
      
      handler.stop();
      expect(handler.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      handler.start();
      handler.start(); // Try to start again
      
      expect(consoleSpy).toHaveBeenCalledWith('[EventDrivenOrderHandler] Already started');
      consoleSpy.mockRestore();
    });

    it('should subscribe to all required events on start', () => {
      const subscribeSpy = jest.spyOn(messageBus, 'subscribe');
      
      handler.start();
      
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.SUBMIT_ORDER, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.CANCEL_ORDER, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.MODIFY_ORDER, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.BAR_RECEIVED, expect.any(Function));
    });
  });

  describe('Order Submission', () => {
    it('should handle market order submission', async () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      handler.start();

      // Submit market order
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.BUY,
        quantity: 100,
        type: OrderType.MARKET,
        contractId: 'TEST',
        source: 'TestStrategy'
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify order was submitted
      expect(orderManager.submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderType.MARKET,
          side: OrderSide.BUY,
          quantity: 100,
          contractId: 'TEST'
        })
      );

      // Verify order submitted event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.ORDER_SUBMITTED,
        'EventDrivenOrderHandler',
        expect.objectContaining({
          order: mockOrder,
          strategyId: 'TestStrategy'
        })
      );
    });

    it('should handle limit order submission', async () => {
      handler.start();

      // Submit limit order
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.SELL,
        quantity: 50,
        type: OrderType.LIMIT,
        price: 100.50,
        contractId: 'TEST',
        source: 'TestStrategy'
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify order was submitted with price
      expect(orderManager.submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderType.LIMIT,
          side: OrderSide.SELL,
          quantity: 50,
          price: 100.50
        })
      );
    });

    it('should handle stop order submission', async () => {
      handler.start();

      // Submit stop order
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.SELL,
        quantity: 75,
        type: OrderType.STOP,
        stopPrice: 99.50,
        contractId: 'TEST',
        source: 'TestStrategy',
        isStopLoss: true,
        parentTradeId: 'trade-123'
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify order was submitted with stop price
      expect(orderManager.submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderType.STOP,
          stopPrice: 99.50,
          isStopLoss: true,
          parentTradeId: 'trade-123'
        })
      );
    });

    it('should handle order submission errors', async () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Make submitOrder throw an error
      jest.spyOn(orderManager, 'submitOrder').mockImplementation(() => {
        throw new Error('Insufficient funds');
      });

      handler.start();

      // Submit order that will fail
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.BUY,
        quantity: 1000000,
        type: OrderType.MARKET,
        contractId: 'TEST',
        source: 'TestStrategy'
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventDrivenOrderHandler] Error submitting order:',
        expect.any(Error)
      );

      // Verify rejection event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.ORDER_REJECTED,
        'EventDrivenOrderHandler',
        expect.objectContaining({
          reason: 'Insufficient funds'
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Order Cancellation', () => {
    it('should handle order cancellation by ID', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      jest.spyOn(orderManager, 'cancelOrder').mockReturnValue(true);
      
      handler.start();

      // Cancel specific order
      messageBus.publish(MessageType.CANCEL_ORDER, 'TestStrategy', {
        orderId: 'order-123',
        strategyId: 'TestStrategy'
      });

      // Verify order was cancelled
      expect(orderManager.cancelOrder).toHaveBeenCalledWith('order-123');

      // Verify cancellation event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.ORDER_CANCELLED,
        'EventDrivenOrderHandler',
        expect.objectContaining({
          orderId: 'order-123',
          strategyId: 'TestStrategy'
        })
      );
    });

    it('should handle order cancellation by trade ID', () => {
      jest.spyOn(orderManager, 'cancelOrdersByTradeId').mockImplementation();
      
      handler.start();

      // Cancel orders by trade ID
      messageBus.publish(MessageType.CANCEL_ORDER, 'TestStrategy', {
        tradeId: 'trade-456'
      });

      // Verify orders were cancelled
      expect(orderManager.cancelOrdersByTradeId).toHaveBeenCalledWith('trade-456');
    });
  });

  describe('Order Modification', () => {
    it('should handle order modification', () => {
      const testOrder: Order = {
        id: 'order-789',
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: 100,
        price: 100,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST'
      };

      jest.spyOn(orderManager, 'getAllOrders').mockReturnValue([testOrder]);
      
      handler.start();

      // Modify order
      messageBus.publish(MessageType.MODIFY_ORDER, 'TestStrategy', {
        orderId: 'order-789',
        newPrice: 101,
        newQuantity: 150
      });

      // Verify order was modified
      expect(testOrder.price).toBe(101);
      expect(testOrder.quantity).toBe(150);
    });

    it('should handle modification errors', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(orderManager, 'getAllOrders').mockReturnValue([]);
      
      handler.start();

      // Try to modify non-existent order
      messageBus.publish(MessageType.MODIFY_ORDER, 'TestStrategy', {
        orderId: 'non-existent',
        newPrice: 101
      });

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventDrivenOrderHandler] Error modifying order:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Order Processing', () => {
    it('should process orders on bar updates', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      const filledOrder: Order = {
        ...mockOrder,
        status: OrderStatus.FILLED,
        filledPrice: 100.25,
        filledTime: 1100 as UTCTimestamp
      };

      jest.spyOn(orderManager, 'processBar').mockReturnValue([filledOrder]);
      
      handler.start();

      // Submit order first to create metadata
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.BUY,
        quantity: 100,
        type: OrderType.MARKET,
        contractId: 'TEST',
        source: 'TestStrategy',
        signal: { type: 'CUS' }
      });

      const testBar: BacktestBarData = {
        time: 1100 as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5
      };

      // Process bar
      messageBus.publish(MessageType.BAR_RECEIVED, 'BacktestEngine', {
        bar: testBar,
        barIndex: 10
      });

      // Verify order was processed
      expect(orderManager.processBar).toHaveBeenCalledWith(testBar, undefined, 10);

      // Verify fill event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.ORDER_FILLED,
        'EventDrivenOrderHandler',
        expect.objectContaining({
          order: filledOrder,
          bar: testBar
        })
      );
    });
  });

  describe('Protective Orders', () => {
    it('should create stop loss and take profit orders', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      handler.start();

      const trade: SimulatedTrade = {
        id: 'trade-123',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 100,
        entryOrder: {
          id: 'entry-order',
          contractId: 'TEST',
          type: OrderType.MARKET,
          side: OrderSide.BUY,
          quantity: 100,
          status: OrderStatus.FILLED,
          submittedTime: 1000 as UTCTimestamp
        }
      };

      // Create protective orders
      handler.createProtectiveOrders(trade, 98, 102);

      // Verify stop loss order was submitted
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.SUBMIT_ORDER,
        'Unknown', // No metadata for this order
        expect.objectContaining({
          side: OrderSide.SELL,
          quantity: 100,
          type: OrderType.STOP,
          stopPrice: 98,
          isStopLoss: true,
          parentTradeId: 'trade-123'
        })
      );

      // Verify take profit order was submitted
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.SUBMIT_ORDER,
        'Unknown',
        expect.objectContaining({
          side: OrderSide.SELL,
          quantity: 100,
          type: OrderType.LIMIT,
          price: 102,
          isTakeProfit: true,
          parentTradeId: 'trade-123'
        })
      );
    });
  });

  describe('Statistics and Reset', () => {
    it('should provide accurate statistics', async () => {
      handler.start();

      // Submit an order to create metadata
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.BUY,
        quantity: 100,
        type: OrderType.MARKET,
        contractId: 'TEST',
        source: 'TestStrategy'
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      const stats = handler.getStats();
      expect(stats).toEqual({
        isActive: true,
        pendingOrders: 0, // OrderManager has no real pending orders in test
        metadataCount: 1
      });
    });

    it('should reset metadata', async () => {
      handler.start();

      // Submit an order to create metadata
      messageBus.publish(MessageType.SUBMIT_ORDER, 'TestStrategy', {
        side: OrderSide.BUY,
        quantity: 100,
        type: OrderType.MARKET,
        contractId: 'TEST',
        source: 'TestStrategy'
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      let stats = handler.getStats();
      expect(stats.metadataCount).toBe(1);

      handler.reset();

      stats = handler.getStats();
      expect(stats.metadataCount).toBe(0);
    });
  });
}); 