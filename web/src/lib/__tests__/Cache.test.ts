import { Cache } from '../Cache';
import { 
  BacktestBarData, 
  Order, 
  OrderStatus, 
  OrderType, 
  OrderSide,
  TradeType 
} from '../types/backtester';
import { UTCTimestamp } from 'lightweight-charts';

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache(100000); // Initial balance
  });

  describe('Market Data Management', () => {
    it('should store and retrieve bars', () => {
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000
      };

      cache.addBar('DEFAULT', '1m', bar);
      
      const bars = cache.getBars('DEFAULT', '1m');
      expect(bars).toHaveLength(1);
      expect(bars[0]).toEqual(bar);
    });

    it('should store bars by symbol and timeframe', () => {
      const bar1: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000
      };

      const bar2: BacktestBarData = {
        time: 2000 as UTCTimestamp,
        open: 101,
        high: 102,
        low: 100,
        close: 101.5,
        volume: 1100
      };

      cache.addBar('AAPL', '1m', bar1);
      cache.addBar('AAPL', '5m', bar2);

      const bars1m = cache.getBars('AAPL', '1m');
      const bars5m = cache.getBars('AAPL', '5m');

      expect(bars1m).toHaveLength(1);
      expect(bars5m).toHaveLength(1);
      expect(bars1m[0]).toEqual(bar1);
      expect(bars5m[0]).toEqual(bar2);
    });
  });

  describe('Order Management', () => {
    const createOrder = (id: string, status: OrderStatus): Order => ({
      id,
      type: OrderType.MARKET,
      side: OrderSide.BUY,
      quantity: 1,
      status,
      submittedTime: 1000 as UTCTimestamp
    });

    it('should add and retrieve orders', () => {
      const order = createOrder('order1', OrderStatus.PENDING);
      
      cache.addOrder(order);
      
      const retrievedOrder = cache.getOrder('order1');
      expect(retrievedOrder).toEqual(order);
    });

    it('should get orders by status', () => {
      const pendingOrder = createOrder('order1', OrderStatus.PENDING);
      const filledOrder = createOrder('order2', OrderStatus.FILLED);
      const cancelledOrder = createOrder('order3', OrderStatus.CANCELLED);

      cache.addOrder(pendingOrder);
      cache.addOrder(filledOrder);
      cache.addOrder(cancelledOrder);

      expect(cache.getOrdersByStatus(OrderStatus.PENDING)).toHaveLength(1);
      expect(cache.getOrdersByStatus(OrderStatus.FILLED)).toHaveLength(1);
      expect(cache.getOrdersByStatus(OrderStatus.CANCELLED)).toHaveLength(1);
    });

    it('should update order status', () => {
      const order = createOrder('order1', OrderStatus.PENDING);
      cache.addOrder(order);

      cache.updateOrderStatus('order1', OrderStatus.FILLED, {
        filledPrice: 100.5,
        filledQuantity: 1,
        filledTime: 2000 as UTCTimestamp
      });

      const updatedOrder = cache.getOrder('order1');
      expect(updatedOrder?.status).toBe(OrderStatus.FILLED);
      expect(updatedOrder?.filledPrice).toBe(100.5);
    });
  });

  describe('Position Management', () => {
    it('should add and retrieve open positions', () => {
      const position = {
        id: 'pos1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN' as const
      };

      cache.addOpenPosition(position);
      
      const openPositions = cache.getOpenPositions();
      expect(openPositions).toHaveLength(1);
      expect(openPositions[0]).toEqual(position);
    });

    it('should close positions and calculate P&L', () => {
      const position = {
        id: 'pos1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN' as const
      };

      cache.addOpenPosition(position);
      cache.closePosition('pos1', 105, 2000);

      const openPositions = cache.getOpenPositions();
      const closedPositions = cache.getClosedPositions();

      expect(openPositions).toHaveLength(0);
      expect(closedPositions).toHaveLength(1);
      expect(closedPositions[0].exitPrice).toBe(105);
      expect(closedPositions[0].profitOrLoss).toBe(5); // 105 - 100
    });

    it('should calculate unrealized P&L on bar updates', () => {
      const position = {
        id: 'pos1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 2,
        status: 'OPEN' as const,
        symbol: 'DEFAULT' // Add symbol to match the bar
      };

      cache.addOpenPosition(position);

      // Add a bar with higher price
      cache.addBar('DEFAULT', '1m', {
        time: 2000 as UTCTimestamp,
        open: 102,
        high: 103,
        low: 101,
        close: 102,
        volume: 1000
      });

      const unrealizedPnL = cache.getUnrealizedPnL();
      expect(unrealizedPnL).toBe(4); // (102 - 100) * 2
    });
  });

  describe('Strategy State Management', () => {
    it('should store and retrieve strategy states', () => {
      const strategyState = {
        signals: [{ type: 'BUY', price: 100 }],
        indicators: { sma: 99.5, rsi: 65 }
      };

      cache.setStrategyState('TestStrategy', strategyState);
      
      const retrieved = cache.getStrategyState('TestStrategy');
      expect(retrieved).toEqual(strategyState);
    });
  });

  describe('Indicator Management', () => {
    it('should store and retrieve indicators', () => {
      cache.updateIndicator('TestStrategy', 'sma', 100.5);
      cache.updateIndicator('TestStrategy', 'rsi', 65.2);

      const indicators = cache.getIndicators('TestStrategy');
      expect(indicators?.get('sma')).toBe(100.5);
      expect(indicators?.get('rsi')).toBe(65.2);
    });
  });

  describe('Performance Tracking', () => {
    it('should track balance changes', () => {
      const initialBalance = cache.getBalance();
      expect(initialBalance).toBe(100000);

      // Simulate a winning trade
      cache.addOpenPosition({
        id: 'pos1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      });
      cache.closePosition('pos1', 105, 2000);

      const newBalance = cache.getBalance();
      expect(newBalance).toBe(100005); // Initial + 5 profit
    });

    it('should maintain equity curve', () => {
      const initialEquity = cache.getEquityCurve();
      expect(initialEquity).toHaveLength(1);
      expect(initialEquity[0]).toBe(100000);

      // Add a position and close it to update equity curve
      cache.addOpenPosition({
        id: 'pos1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      });

      // Close position with profit
      cache.closePosition('pos1', 102, 2000);

      const equityCurve = cache.getEquityCurve();
      expect(equityCurve).toHaveLength(2);
      expect(equityCurve[1]).toBe(100002); // Balance + profit
    });
  });

  describe('Subscription Mechanism', () => {
    it('should notify subscribers on data changes', (done) => {
      let notificationCount = 0;
      
      cache.subscribe('orders', (data) => {
        notificationCount++;
        expect(data).toBeDefined();
        
        if (notificationCount === 1) {
          done();
        }
      });

      // Trigger a change
      cache.addOrder({
        id: 'order1',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp
      });
    });

    it('should support wildcard subscriptions', () => {
      let notificationCount = 0;
      const notifications: string[] = [];
      
      cache.subscribe('orders', (data) => {
        notificationCount++;
        notifications.push('orders');
      });

      cache.subscribe('bars', (data) => {
        notificationCount++;
        notifications.push('bars');
      });

      cache.addOrder({
        id: 'order1',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp
      });

      cache.addBar('DEFAULT', '1m', {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000
      });

      expect(notificationCount).toBe(2);
      expect(notifications).toContain('orders');
      expect(notifications).toContain('bars');
    });

    it('should allow unsubscribing', () => {
      let notificationCount = 0;
      
      const unsubscribe = cache.subscribe('orders', () => {
        notificationCount++;
      });

      cache.addOrder({
        id: 'order1',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp
      });

      expect(notificationCount).toBe(1);

      unsubscribe();

      cache.addOrder({
        id: 'order2',
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 2000 as UTCTimestamp
      });

      expect(notificationCount).toBe(1); // Should not increase
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all data to initial state', () => {
      // Add some data
      cache.addBar('DEFAULT', '1m', {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000
      });

      cache.addOrder({
        id: 'order1',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp
      });

      cache.addOpenPosition({
        id: 'pos1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      });

      cache.setStrategyState('TestStrategy', { data: 'test' });
      cache.updateIndicator('TestStrategy', 'sma', 100);

      // Reset
      cache.reset();

      // Verify everything is cleared
      expect(cache.getBars('DEFAULT', '1m')).toHaveLength(0);
      expect(cache.getOrdersByStatus(OrderStatus.PENDING)).toHaveLength(0);
      expect(cache.getOpenPositions()).toHaveLength(0);
      expect(cache.getClosedPositions()).toHaveLength(0);
      expect(cache.getStrategyState('TestStrategy')).toBeUndefined();
      expect(cache.getIndicators('TestStrategy')).toBeUndefined();
      expect(cache.getBalance()).toBe(100000);
      expect(cache.getUnrealizedPnL()).toBe(0);
    });
  });

  describe('Thread Safety and Performance', () => {
    it('should handle high-frequency updates', () => {
      const startTime = Date.now();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        cache.addBar('DEFAULT', '1m', {
          time: i as UTCTimestamp,
          open: 100 + Math.random(),
          high: 101 + Math.random(),
          low: 99 + Math.random(),
          close: 100 + Math.random(),
          volume: 1000 + Math.random() * 100
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(cache.getBars('DEFAULT', '1m')).toHaveLength(iterations);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should maintain data consistency under concurrent-like operations', () => {
      // Simulate rapid concurrent-like operations
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(() => {
          cache.addOrder({
            id: `order${i}`,
            type: OrderType.MARKET,
            side: i % 2 === 0 ? OrderSide.BUY : OrderSide.SELL,
            quantity: 1,
            status: OrderStatus.PENDING,
            submittedTime: i as UTCTimestamp
          });
        });

        operations.push(() => {
          if (i > 0) {
            cache.updateOrderStatus(`order${i - 1}`, OrderStatus.FILLED);
          }
        });
      }

      // Execute all operations
      operations.forEach(op => op());

      // Verify data consistency
      const allOrders = cache.getOrdersByStatus(OrderStatus.PENDING).concat(
        cache.getOrdersByStatus(OrderStatus.FILLED)
      );
      expect(allOrders).toHaveLength(100);
      
      const filledOrders = cache.getOrdersByStatus(OrderStatus.FILLED);
      expect(filledOrders).toHaveLength(99); // All except the last one
    });
  });
}); 