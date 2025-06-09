import { MessageBus, MessageType } from '../MessageBus';
import { Cache } from '../Cache';
import { EventHandlers } from '../EventHandlers';
import { OrderManager } from '../OrderManager';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { BacktestEngineAdapter } from '../BacktestEngineAdapter';
import { 
  BacktestBarData, 
  StrategySignalType, 
  OrderStatus, 
  OrderType,
  OrderSide,
  SubBarData 
} from '../types/backtester';
import { StrategyResult } from '../types/strategy';
import { UTCTimestamp } from 'lightweight-charts';

// Test strategy for integration testing
class TestStrategy extends BaseStrategy {
  getName(): string { return 'TestStrategy'; }
  getDescription(): string { return 'Test strategy for integration testing'; }
  getVersion(): string { return '1.0.0'; }

  async analyze(bar: BacktestBarData, barIndex: number): Promise<void> {
    if (barIndex === 1) {
      this.recordSignal({
        barIndex,
        time: bar.time,
        type: StrategySignalType.BUY,
        price: bar.close,
        message: 'Buy signal'
      });
    }
  }

  async processBar(
    mainBar: BacktestBarData,
    subBars: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> {
    await this.analyze(mainBar, barIndex);
    const filledOrders = this.orderManager.processBar(mainBar, subBars, barIndex);
    const signals = this.getSignals();
    const lastSignal = signals.find(s => s.barIndex === barIndex) || null;
    
    return {
      signal: lastSignal,
      indicators: this.getCurrentIndicators() || {},
      filledOrders
    };
  }
}

describe('MessageBus Integration Tests', () => {
  let messageBus: MessageBus;
  let cache: Cache;
  let orderManager: OrderManager;
  let adapter: BacktestEngineAdapter;
  
  const createBar = (time: number, price: number): BacktestBarData => ({
    time: time as UTCTimestamp,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: 1000
  });

  beforeEach(() => {
    // Create new instances for isolation
    orderManager = new OrderManager(0.25);
    adapter = new BacktestEngineAdapter(orderManager);
    
    // Get references to the adapter's instances
    messageBus = adapter.getMessageBus();
    cache = adapter.getCache();
  });

  afterEach(() => {
    // Clean up
    cache.reset();
  });

  describe('End-to-End Event Flow', () => {
    it('should handle complete order lifecycle through events', async () => {
      const events: string[] = [];
      
      // Subscribe to all events to track flow
      messageBus.subscribe('*', (message) => {
        events.push(message.type);
      });

      // Submit an order
      const order = {
        id: 'test-order-1',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
        price: 100,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp,
        contractId: 'TEST'
      };

      // Publish order submission
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'test', { order });

      // Simulate order fill
      messageBus.publish(MessageType.ORDER_FILLED, 'test', {
        orderId: order.id,
        order,
        filledPrice: 100.5,
        filledQuantity: 1,
        filledTime: 1001 as UTCTimestamp,
        status: OrderStatus.FILLED
      });

      // Verify events were published
      expect(events).toContain(MessageType.ORDER_SUBMITTED);
      expect(events).toContain(MessageType.ORDER_FILLED);

      // Verify cache was updated
      const cachedOrder = cache.getOrder(order.id);
      expect(cachedOrder).toBeDefined();
      expect(cachedOrder?.status).toBe(OrderStatus.FILLED);
    });

    it('should handle position lifecycle through events', async () => {
      const positionId = 'position-1';
      
      // Open position
      messageBus.publish(MessageType.POSITION_OPENED, 'test', {
        positionId,
        position: {
          id: positionId,
          entryPrice: 100,
          entryTime: 1000 as UTCTimestamp,
          size: 1,
          side: OrderSide.BUY,
          type: 'BUY' as any
        },
        entryPrice: 100,
        entryTime: 1000,
        size: 1,
        side: OrderSide.BUY
      });

      // Verify position was opened
      let openPositions = cache.getOpenPositions();
      expect(openPositions).toHaveLength(1);
      expect(openPositions[0].id).toBe(positionId);

      // Close position
      messageBus.publish(MessageType.POSITION_CLOSED, 'test', {
        positionId,
        position: openPositions[0],
        closePrice: 105,
        closeTime: 2000,
        realizedPnl: 5,
        exitReason: 'SIGNAL'
      });

      // Verify position was closed
      openPositions = cache.getOpenPositions();
      expect(openPositions).toHaveLength(0);
      
      const closedPositions = cache.getClosedPositions();
      expect(closedPositions).toHaveLength(1);
      expect(closedPositions[0].id).toBe(positionId);
      expect(closedPositions[0].profitOrLoss).toBe(5);
    });

    it('should handle strategy signals through events', async () => {
      const strategy = new TestStrategy(orderManager, {
        commission: 2.5,
        positionSize: 1,
        stopLossPercent: 2,
        takeProfitPercent: 4,
        useMarketOrders: true
      });

      const bars = [
        createBar(1000, 100),
        createBar(2000, 101), // Buy signal here
        createBar(3000, 102)
      ];

      // Process bars through adapter
      for (let i = 0; i < bars.length; i++) {
        await adapter.processBar(strategy, bars[i], [], i, bars);
      }

      // Get state and verify signal was captured
      const state = adapter.getState();
      expect(state.tradeMarkers).toHaveLength(1);
      expect(state.tradeMarkers[0].position).toBe('belowBar'); // Buy signal
    });
  });

  describe('Event Handler Order and Consistency', () => {
    it('should invoke handlers in registration order', (done) => {
      const callOrder: number[] = [];
      
      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        callOrder.push(1);
      });
      
      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        callOrder.push(2);
      });
      
      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        callOrder.push(3);
        expect(callOrder).toEqual([1, 2, 3]);
        done();
      });

      messageBus.publish(MessageType.ORDER_SUBMITTED, 'test', { order: {} });
    });

    it('should handle errors in one handler without affecting others', () => {
      let handler2Called = false;
      let handler3Called = false;

      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        throw new Error('Handler 1 error');
      });

      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        handler2Called = true;
      });

      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        handler3Called = true;
      });

      // Should not throw
      expect(() => {
        messageBus.publish(MessageType.ORDER_SUBMITTED, 'test', { order: {} });
      }).not.toThrow();

      expect(handler2Called).toBe(true);
      expect(handler3Called).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should support direct OrderManager method calls alongside events', () => {
      // Subscribe to events before submitting orders
      let eventCount = 0;
      messageBus.subscribe(MessageType.ORDER_SUBMITTED, () => {
        eventCount++;
      });

      const order = {
        id: 'direct-order',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp
      };

      // Direct method call
      const submittedOrder = orderManager.submitOrder(order);
      expect(submittedOrder.id).toBeDefined();
      
      // Verify order is in OrderManager
      const pendingOrders = orderManager.getPendingOrders();
      expect(pendingOrders).toHaveLength(1);

      // Submit another order
      orderManager.submitOrder({ ...order, id: 'direct-order-2' });
      
      // Verify both orders triggered events
      expect(eventCount).toBe(2);
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle high volume of events without loss', () => {
      const receivedEvents: string[] = [];
      const totalEvents = 1000;

      messageBus.subscribe(MessageType.ORDER_SUBMITTED, (message) => {
        receivedEvents.push(message.data.orderId);
      });

      // Publish many events rapidly
      for (let i = 0; i < totalEvents; i++) {
        messageBus.publish(MessageType.ORDER_SUBMITTED, 'test', {
          orderId: `order-${i}`,
          order: { id: `order-${i}` }
        });
      }

      expect(receivedEvents).toHaveLength(totalEvents);
      expect(new Set(receivedEvents).size).toBe(totalEvents); // No duplicates
    });

    it('should maintain message history within limits', () => {
      const historyLimit = 10000; // MessageBus default
      
      // Publish more than the limit
      for (let i = 0; i < historyLimit + 100; i++) {
        messageBus.publish(MessageType.ORDER_SUBMITTED, 'test', {
          orderId: `order-${i}`
        });
      }

      const history = messageBus.getHistory();
      expect(history.length).toBeLessThanOrEqual(historyLimit);
    });
  });

  describe('Race Conditions and Concurrency', () => {
    it('should handle concurrent event publishing', async () => {
      const results: number[] = [];
      
      messageBus.subscribe(MessageType.ORDER_FILLED, (message) => {
        results.push(message.data.value);
      });

      // Simulate concurrent publishing
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              messageBus.publish(MessageType.ORDER_FILLED, 'test', { value: i });
              resolve();
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      // All events should be received
      expect(results).toHaveLength(100);
      expect(new Set(results).size).toBe(100); // All unique values received
    });
  });

  describe('Full Backtest Workflow', () => {
    it('should complete a full backtest using only event-driven communication', async () => {
      const strategy = new TestStrategy(orderManager, {
        commission: 2.5,
        positionSize: 1,
        stopLossPercent: 2,
        takeProfitPercent: 4,
        useMarketOrders: true
      });

      const bars = [
        createBar(1000, 100),
        createBar(2000, 101), // Buy signal
        createBar(3000, 102),
        createBar(4000, 103),
        createBar(5000, 104)
      ];

      // Track all events
      const eventLog: { type: string; timestamp: number }[] = [];
      messageBus.subscribe('*', (message) => {
        eventLog.push({
          type: message.type,
          timestamp: message.timestamp
        });
      });

      // Run backtest
      for (let i = 0; i < bars.length; i++) {
        await adapter.processBar(strategy, bars[i], [], i, bars);
      }

      // Verify events were generated
      const eventTypes = eventLog.map(e => e.type);
      expect(eventTypes).toContain(MessageType.SIGNAL_GENERATED);
      
      // Verify final state
      const finalState = adapter.getState();
      expect(finalState.tradeMarkers).toHaveLength(1);
      expect(finalState.backtestResults).toBeDefined();
      
      // Verify events are in chronological order
      for (let i = 1; i < eventLog.length; i++) {
        expect(eventLog[i].timestamp).toBeGreaterThanOrEqual(eventLog[i - 1].timestamp);
      }
    });
  });
}); 