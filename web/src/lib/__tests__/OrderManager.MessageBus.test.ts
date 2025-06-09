import { OrderManager } from '../OrderManager';
import { messageBus, MessageType, Message } from '../MessageBus';
import { 
  OrderType, 
  OrderStatus, 
  OrderSide, 
  BacktestBarData,
  UTCTimestamp 
} from '../types/backtester';

describe('OrderManager MessageBus Integration', () => {
  let orderManager: OrderManager;
  let receivedMessages: { [key: string]: Message[] };

  beforeEach(() => {
    orderManager = new OrderManager(0.25);
    receivedMessages = {};
    
    // Subscribe to all relevant message types
    const messageTypes = [
      MessageType.ORDER_SUBMITTED,
      MessageType.ORDER_FILLED,
      MessageType.ORDER_CANCELLED,
      MessageType.ORDER_REJECTED,
      MessageType.POSITION_OPENED,
      MessageType.POSITION_CLOSED
    ];

    messageTypes.forEach(type => {
      receivedMessages[type] = [];
      messageBus.subscribe(type, (message: Message) => {
        receivedMessages[type].push(message);
      });
    });
  });

  afterEach(() => {
    messageBus.dispose();
    orderManager.reset();
  });

  describe('Order Submission Events', () => {
    it('should publish ORDER_SUBMITTED event when order is submitted', () => {
      const order = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        contractId: 'TEST_CONTRACT'
      });

      expect(receivedMessages[MessageType.ORDER_SUBMITTED]).toHaveLength(1);
      const message = receivedMessages[MessageType.ORDER_SUBMITTED][0];
      expect(message.source).toBe('OrderManager');
      expect(message.data.order.id).toBe(order.id);
      expect(message.data.order.status).toBe(OrderStatus.PENDING);
    });

    it('should publish ORDER_REJECTED event for invalid orders', () => {
      const order = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 0, // Invalid quantity
        contractId: 'TEST_CONTRACT'
      });

      expect(receivedMessages[MessageType.ORDER_REJECTED]).toHaveLength(1);
      const message = receivedMessages[MessageType.ORDER_REJECTED][0];
      expect(message.source).toBe('OrderManager');
      expect(message.data.reason).toBe('Invalid quantity');
      expect(message.data.order.status).toBe(OrderStatus.REJECTED);
    });
  });

  describe('Order Cancellation Events', () => {
    it('should publish ORDER_CANCELLED event when order is cancelled', () => {
      const order = orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: 100,
        price: 100,
        contractId: 'TEST_CONTRACT'
      });

      const cancelled = orderManager.cancelOrder(order.id);
      expect(cancelled).toBe(true);

      expect(receivedMessages[MessageType.ORDER_CANCELLED]).toHaveLength(1);
      const message = receivedMessages[MessageType.ORDER_CANCELLED][0];
      expect(message.source).toBe('OrderManager');
      expect(message.data.orderId).toBe(order.id);
      expect(message.data.order.status).toBe(OrderStatus.CANCELLED);
    });
  });

  describe('Order Fill Events', () => {
    it('should publish ORDER_FILLED event when market order fills', () => {
      const order = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        contractId: 'TEST_CONTRACT'
      });

      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      const filledOrders = orderManager.processBar(bar, undefined, 0);

      expect(filledOrders).toHaveLength(1);
      expect(receivedMessages[MessageType.ORDER_FILLED]).toHaveLength(1);
      
      const message = receivedMessages[MessageType.ORDER_FILLED][0];
      expect(message.source).toBe('OrderManager');
      expect(message.data.orderId).toBe(order.id);
      expect(message.data.filledPrice).toBe(100); // Market order fills at open
      expect(message.data.filledQuantity).toBe(100);
      expect(message.data.status).toBe(OrderStatus.FILLED);
    });

    it('should publish ORDER_FILLED event when limit order fills', () => {
      const order = orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: 50,
        price: 98,
        contractId: 'TEST_CONTRACT'
      });

      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95, // Low touches our limit price
        close: 102
      };

      const filledOrders = orderManager.processBar(bar, undefined, 0);

      expect(filledOrders).toHaveLength(1);
      expect(receivedMessages[MessageType.ORDER_FILLED]).toHaveLength(1);
      
      const message = receivedMessages[MessageType.ORDER_FILLED][0];
      expect(message.data.filledPrice).toBe(98); // Limit order fills at limit price
    });
  });

  describe('Position Events', () => {
    it('should publish POSITION_OPENED event when new position is created', () => {
      const order = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        contractId: 'TEST_CONTRACT',
        parentTradeId: 'TRADE_123'
      });

      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      orderManager.processBar(bar, undefined, 0);

      expect(receivedMessages[MessageType.POSITION_OPENED]).toHaveLength(1);
      
      const message = receivedMessages[MessageType.POSITION_OPENED][0];
      expect(message.source).toBe('OrderManager');
      expect(message.data.position.size).toBe(100);
      expect(message.data.entryPrice).toBe(100);
      expect(message.data.side).toBe(OrderSide.BUY);
    });

    it('should publish POSITION_CLOSED event when position is fully closed', () => {
      // Open a position
      const entryOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        contractId: 'TEST_CONTRACT',
        parentTradeId: 'TRADE_123'
      });

      const bar1: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      orderManager.processBar(bar1, undefined, 0);

      // Close the position
      const exitOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        quantity: 100,
        contractId: 'TEST_CONTRACT',
        parentTradeId: 'TRADE_123',
        isExit: true
      });

      const bar2: BacktestBarData = {
        time: 2000 as UTCTimestamp,
        open: 105,
        high: 110,
        low: 104,
        close: 108
      };

      orderManager.processBar(bar2, undefined, 1);

      expect(receivedMessages[MessageType.POSITION_CLOSED]).toHaveLength(1);
      
      const message = receivedMessages[MessageType.POSITION_CLOSED][0];
      expect(message.source).toBe('OrderManager');
      expect(message.data.closePrice).toBe(105);
      expect(message.data.realizedPnl).toBeDefined();
      expect(message.data.exitReason).toBe('SIGNAL');
    });

    it('should publish POSITION_CLOSED with STOP_LOSS reason when stop loss hits', () => {
      // Open a position
      const entryOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        contractId: 'TEST_CONTRACT',
        parentTradeId: 'TRADE_123'
      });

      const bar1: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      orderManager.processBar(bar1, undefined, 0);

      // Add stop loss order
      const slOrder = orderManager.submitOrder({
        type: OrderType.STOP,
        side: OrderSide.SELL,
        quantity: 100,
        stopPrice: 95,
        contractId: 'TEST_CONTRACT',
        parentTradeId: 'TRADE_123',
        isStopLoss: true
      });

      const bar2: BacktestBarData = {
        time: 2000 as UTCTimestamp,
        open: 98,
        high: 99,
        low: 94, // Triggers stop loss
        close: 96
      };

      orderManager.processBar(bar2, undefined, 1);

      const closedMessage = receivedMessages[MessageType.POSITION_CLOSED][0];
      expect(closedMessage.data.exitReason).toBe('STOP_LOSS');
      expect(closedMessage.data.closePrice).toBe(95);
    });
  });

  describe('Multiple Events in Sequence', () => {
    it('should publish events in correct order for complete trade lifecycle', () => {
      // Submit entry order
      const entryOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        contractId: 'TEST_CONTRACT'
      });

      expect(receivedMessages[MessageType.ORDER_SUBMITTED]).toHaveLength(1);

      // Process bar to fill entry
      const bar1: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      orderManager.processBar(bar1, undefined, 0);

      expect(receivedMessages[MessageType.ORDER_FILLED]).toHaveLength(1);
      expect(receivedMessages[MessageType.POSITION_OPENED]).toHaveLength(1);

      // Submit exit order
      const exitOrder = orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        quantity: 100,
        contractId: 'TEST_CONTRACT',
        isExit: true
      });

      expect(receivedMessages[MessageType.ORDER_SUBMITTED]).toHaveLength(2);

      // Process bar to fill exit
      const bar2: BacktestBarData = {
        time: 2000 as UTCTimestamp,
        open: 105,
        high: 110,
        low: 104,
        close: 108
      };

      orderManager.processBar(bar2, undefined, 1);

      expect(receivedMessages[MessageType.ORDER_FILLED]).toHaveLength(2);
      expect(receivedMessages[MessageType.POSITION_CLOSED]).toHaveLength(1);

      // Verify event sequence
      const allEvents = Object.entries(receivedMessages)
        .flatMap(([type, messages]) => messages)
        .sort((a, b) => a.timestamp - b.timestamp);

      expect(allEvents.map(e => e.type)).toEqual([
        MessageType.ORDER_SUBMITTED,  // Entry order
        MessageType.ORDER_FILLED,      // Entry fill
        MessageType.POSITION_OPENED,   // Position opened
        MessageType.ORDER_SUBMITTED,   // Exit order
        MessageType.ORDER_FILLED,      // Exit fill
        MessageType.POSITION_CLOSED    // Position closed
      ]);
    });
  });
}); 