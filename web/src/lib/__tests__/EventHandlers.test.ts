import { eventHandlers } from '../EventHandlers';
import { messageBus, MessageType } from '../MessageBus';
import { cache } from '../Cache';
import { 
  OrderType, 
  OrderStatus, 
  OrderSide, 
  StrategySignalType,
  UTCTimestamp,
  TradeType 
} from '../types/backtester';

describe('EventHandlers', () => {
  beforeEach(() => {
    // Reset cache and register handlers
    cache.reset();
    eventHandlers.registerAll();
  });

  afterEach(() => {
    // Cleanup
    eventHandlers.unregisterAll();
    messageBus.dispose();
  });

  describe('Order Event Handling', () => {
    it('should handle ORDER_SUBMITTED event', () => {
      const order = {
        id: 'test-order-1',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST',
        filledQuantity: 0
      };

      messageBus.publish(MessageType.ORDER_SUBMITTED, 'OrderManager', {
        order,
        timestamp: 1000
      });

      // Verify order was added to cache
      const cachedOrder = cache.getOrder('test-order-1');
      expect(cachedOrder).toBeDefined();
      expect(cachedOrder?.id).toBe('test-order-1');
      expect(cachedOrder?.status).toBe(OrderStatus.PENDING);
    });

    it('should handle ORDER_FILLED event', () => {
      // First submit an order
      const order = {
        id: 'test-order-2',
        type: OrderType.LIMIT,
        side: OrderSide.SELL,
        quantity: 50,
        price: 100,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST',
        filledQuantity: 0
      };

      cache.addOrder(order);

      // Publish fill event
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', {
        orderId: 'test-order-2',
        order,
        filledPrice: 100,
        filledQuantity: 50,
        filledTime: 2000 as UTCTimestamp,
        barIndex: 1,
        status: OrderStatus.FILLED
      });

      // Verify order was updated
      const filledOrders = cache.getOrdersByStatus(OrderStatus.FILLED);
      expect(filledOrders).toHaveLength(1);
      expect(filledOrders[0].id).toBe('test-order-2');
    });

    it('should handle ORDER_CANCELLED event', () => {
      // First submit an order
      const order = {
        id: 'test-order-3',
        type: OrderType.STOP,
        side: OrderSide.BUY,
        quantity: 25,
        stopPrice: 95,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST',
        filledQuantity: 0
      };

      cache.addOrder(order);

      // Publish cancel event
      messageBus.publish(MessageType.ORDER_CANCELLED, 'OrderManager', {
        orderId: 'test-order-3',
        order,
        timestamp: 1500
      });

      // Verify order was cancelled
      const cancelledOrders = cache.getOrdersByStatus(OrderStatus.CANCELLED);
      expect(cancelledOrders).toHaveLength(1);
      expect(cancelledOrders[0].id).toBe('test-order-3');
    });

    it('should handle ORDER_REJECTED event', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

      const order = {
        id: 'test-order-4',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 0, // Invalid
        status: OrderStatus.REJECTED,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST',
        filledQuantity: 0
      };

      messageBus.publish(MessageType.ORDER_REJECTED, 'OrderManager', {
        order,
        reason: 'Invalid quantity'
      });

      expect(consoleWarn).toHaveBeenCalledWith(
        '[EventHandlers] Order rejected: test-order-4, reason: Invalid quantity'
      );

      consoleWarn.mockRestore();
    });
  });

  describe('Position Event Handling', () => {
    it('should handle POSITION_OPENED event', () => {
      const position = {
        id: 'pos-1',
        type: 'BUY' as const,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        size: 100,
        status: 'OPEN' as const
      };

      messageBus.publish(MessageType.POSITION_OPENED, 'OrderManager', {
        positionId: 'pos-1',
        position,
        entryPrice: 100,
        entryTime: 1000,
        size: 100,
        side: OrderSide.BUY
      });

      // Verify position was added
      const openPositions = cache.getOpenPositions();
      expect(openPositions).toHaveLength(1);
      expect(openPositions[0].id).toBe('pos-1');
      expect(openPositions[0].entryPrice).toBe(100);
    });

    it('should handle POSITION_CLOSED event', () => {
      // First open a position
      const position = {
        id: 'pos-2',
        type: TradeType.SELL,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        size: 50,
        status: 'OPEN' as const,
        symbol: 'TEST'
      };

      cache.addOpenPosition(position);

      // Publish close event
      messageBus.publish(MessageType.POSITION_CLOSED, 'OrderManager', {
        positionId: 'pos-2',
        position,
        closePrice: 95,
        closeTime: 2000,
        realizedPnl: 250, // 5 points * 50 size
        exitReason: 'SIGNAL'
      });

      // Verify position was closed
      const openPositions = cache.getOpenPositions();
      const closedPositions = cache.getClosedPositions();
      
      expect(openPositions).toHaveLength(0);
      expect(closedPositions).toHaveLength(1);
      expect(closedPositions[0].id).toBe('pos-2');
      expect(closedPositions[0].exitPrice).toBe(95);
    });
  });

  describe('Strategy Event Handling', () => {
    it('should handle SIGNAL_GENERATED event', () => {
      const signal = {
        type: StrategySignalType.BUY,
        barIndex: 10,
        time: 1000 as UTCTimestamp,
        price: 100
      };

      messageBus.publish(MessageType.SIGNAL_GENERATED, 'TestStrategy', {
        signal,
        strategyName: 'TestStrategy',
        timestamp: 1000
      });

      // Verify signal was stored in strategy state
      const strategyState = cache.getStrategyState('TestStrategy');
      expect(strategyState).toBeDefined();
      expect(strategyState.signals).toHaveLength(1);
      expect(strategyState.signals[0].type).toBe(StrategySignalType.BUY);
    });

    it('should handle STRATEGY_STARTED event', () => {
      const config = {
        name: 'TestStrategy',
        positionSize: 100,
        commission: 2.5
      };

      messageBus.publish(MessageType.STRATEGY_STARTED, 'TestStrategy', {
        strategyName: 'TestStrategy',
        config,
        timestamp: 1000
      });

      // Verify strategy state was initialized
      const strategyState = cache.getStrategyState('TestStrategy');
      expect(strategyState).toBeDefined();
      expect(strategyState.status).toBe('RUNNING');
      expect(strategyState.config).toEqual(config);
      expect(strategyState.startTime).toBe(1000);
    });

    it('should handle STRATEGY_STOPPED event', () => {
      // First start the strategy
      cache.setStrategyState('TestStrategy', {
        status: 'RUNNING',
        startTime: 1000,
        signals: []
      });

      messageBus.publish(MessageType.STRATEGY_STOPPED, 'TestStrategy', {
        strategyName: 'TestStrategy',
        timestamp: 2000
      });

      // Verify strategy state was updated
      const strategyState = cache.getStrategyState('TestStrategy');
      expect(strategyState.status).toBe('STOPPED');
      expect(strategyState.stopTime).toBe(2000);
    });
  });

  describe('Market Data Event Handling', () => {
    it('should handle BAR_RECEIVED event', () => {
      const bar = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      messageBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', {
        bar,
        symbol: 'TEST',
        timeframe: '1m'
      });

      // Verify bar was stored
      const bars = cache.getBars('TEST', '1m');
      expect(bars).toHaveLength(1);
      expect(bars[0]).toEqual(bar);
      
      // Verify latest bar
      const latestBar = cache.getLatestBar('TEST');
      expect(latestBar).toEqual(bar);
    });

    it('should update unrealized P&L when bar is received', () => {
      // First open a position
      const position = {
        id: 'pos-3',
        type: TradeType.BUY,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        size: 100,
        status: 'OPEN' as const,
        symbol: 'TEST'
      };

      cache.addOpenPosition(position);

      // Publish bar with higher price
      const bar = {
        time: 2000 as UTCTimestamp,
        open: 102,
        high: 105,
        low: 101,
        close: 104
      };

      messageBus.publish(MessageType.BAR_RECEIVED, 'DataFeed', {
        bar,
        symbol: 'TEST',
        timeframe: '1m'
      });

      // The cache automatically calculates unrealized P&L
      const unrealizedPnL = cache.getUnrealizedPnL();
      expect(unrealizedPnL).toBe(400); // (104 - 100) * 100
    });
  });

  describe('Integration', () => {
    it('should handle complete order lifecycle', () => {
      // Submit order
      const order = {
        id: 'lifecycle-order',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 100,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST',
        filledQuantity: 0,
        parentTradeId: 'trade-1'
      };

      messageBus.publish(MessageType.ORDER_SUBMITTED, 'OrderManager', {
        order,
        timestamp: 1000
      });

      // Fill order
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', {
        orderId: 'lifecycle-order',
        order,
        filledPrice: 100,
        filledQuantity: 100,
        filledTime: 1100 as UTCTimestamp,
        barIndex: 1,
        status: OrderStatus.FILLED
      });

      // Open position
      messageBus.publish(MessageType.POSITION_OPENED, 'OrderManager', {
        positionId: 'trade-1',
        position: {
          id: 'trade-1',
          type: 'BUY' as const,
          entryPrice: 100,
          entryTime: 1100 as UTCTimestamp,
          size: 100,
          status: 'OPEN' as const
        },
        entryPrice: 100,
        entryTime: 1100,
        size: 100,
        side: OrderSide.BUY
      });

      // Verify state
      const filledOrders = cache.getOrdersByStatus(OrderStatus.FILLED);
      const openPositions = cache.getOpenPositions();
      
      expect(filledOrders).toHaveLength(1);
      expect(openPositions).toHaveLength(1);
      expect(openPositions[0].id).toBe('trade-1');
    });
  });
}); 