import { BacktestEngineAdapter } from '../BacktestEngineAdapter';
import { OrderManager } from '../OrderManager';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { BacktestBarData, StrategySignalType, TradeType, OrderStatus, SubBarData } from '../types/backtester';
import { StrategyResult } from '../types/strategy';
import { UTCTimestamp } from 'lightweight-charts';

// Mock strategy for testing
class MockStrategy extends BaseStrategy {
  getName(): string {
    return 'MockStrategy';
  }

  getDescription(): string {
    return 'Mock strategy for testing';
  }

  getVersion(): string {
    return '1.0.0';
  }

  async analyze(
    bar: BacktestBarData,
    barIndex: number,
    allBars: BacktestBarData[]
  ): Promise<void> {
    // Simple strategy: buy on bar 1, sell on bar 3
    if (barIndex === 1) {
      this.recordSignal({
        barIndex,
        time: bar.time,
        type: StrategySignalType.BUY,
        price: bar.close,
        message: 'Test buy signal'
      });
    } else if (barIndex === 3) {
      this.recordSignal({
        barIndex,
        time: bar.time,
        type: StrategySignalType.SELL,
        price: bar.close,
        message: 'Test sell signal'
      });
    }
  }

  async processBar(
    mainBar: BacktestBarData,
    subBars: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> {
    // Call analyze to generate signals
    await this.analyze(mainBar, barIndex, allMainBars);
    
    // Process orders with OrderManager
    const filledOrders = this.orderManager.processBar(mainBar, subBars, barIndex);
    
    // Return result
    const signals = this.getSignals();
    const lastSignal = signals.length > 0 && signals[signals.length - 1].barIndex === barIndex
      ? signals[signals.length - 1]
      : null;
      
    return {
      signal: lastSignal,
      indicators: this.getCurrentIndicators() || {},
      filledOrders
    };
  }
}

describe('BacktestEngineAdapter', () => {
  let adapter: BacktestEngineAdapter;
  let orderManager: OrderManager;
  let strategy: MockStrategy;
  
  const createBar = (time: number, price: number): BacktestBarData => ({
    time: time as UTCTimestamp,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: 1000
  });

  beforeEach(() => {
    orderManager = new OrderManager(0.25);
    adapter = new BacktestEngineAdapter(orderManager, 100000);
    strategy = new MockStrategy(orderManager, {
      commission: 2.5,
      positionSize: 1,
      stopLossPercent: 2,
      takeProfitPercent: 4,
      useMarketOrders: true
    });
  });

  describe('processBar', () => {
    it('should process bars and update cache', async () => {
      const bars = [
        createBar(1000, 100),
        createBar(2000, 101),
        createBar(3000, 102),
        createBar(4000, 103)
      ];

      for (let i = 0; i < bars.length; i++) {
        await adapter.processBar(strategy, bars[i], [], i, bars);
      }

      const state = adapter.getState();
      expect(state.tradeMarkers).toHaveLength(2); // Buy and sell signals
      expect(state.tradeMarkers[0].position).toBe('belowBar'); // Buy signal
      expect(state.tradeMarkers[1].position).toBe('aboveBar'); // Sell signal
    });

    it('should update indicators in cache', async () => {
      const bar = createBar(1000, 100);
      
      // Create a custom strategy that updates indicators
      class IndicatorStrategy extends MockStrategy {
        async processBar(
          mainBar: BacktestBarData,
          subBars: SubBarData[] | undefined,
          barIndex: number,
          allMainBars: BacktestBarData[]
        ): Promise<StrategyResult> {
          // Update indicators using BaseStrategy's method
          this.updateIndicatorValue('sma', 100.5);
          this.updateIndicatorValue('rsi', 65.2);
          
          return {
            signal: null,
            indicators: this.getCurrentIndicators() || {},
            filledOrders: []
          };
        }
      }
      
      const indicatorStrategy = new IndicatorStrategy(orderManager, {
        commission: 2.5,
        positionSize: 1,
        stopLossPercent: 2,
        takeProfitPercent: 4,
        useMarketOrders: true
      });

      await adapter.processBar(indicatorStrategy, bar, [], 0, [bar]);

      const state = adapter.getState();
      expect(state.currentIndicators).toEqual({
        sma: 100.5,
        rsi: 65.2
      });
    });
  });

  describe('getState', () => {
    it('should return correct state structure', () => {
      const state = adapter.getState();
      
      expect(state).toHaveProperty('openTrade');
      expect(state).toHaveProperty('pendingOrders');
      expect(state).toHaveProperty('filledOrders');
      expect(state).toHaveProperty('cancelledOrders');
      expect(state).toHaveProperty('backtestResults');
      expect(state).toHaveProperty('currentIndicators');
      expect(state).toHaveProperty('tradeMarkers');
      
      expect(state.openTrade).toBeNull();
      expect(state.pendingOrders).toEqual([]);
      expect(state.filledOrders).toEqual([]);
      expect(state.cancelledOrders).toEqual([]);
      expect(state.backtestResults).toBeDefined();
      expect(state.backtestResults?.totalTrades).toBe(0);
    });

    it('should calculate backtest results correctly', () => {
      // Add some mock closed positions to cache
      const cache = adapter.getCache();
      cache.addOpenPosition({
        id: 'trade1',
        entryTime: 1000 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      });
      
      cache.closePosition('trade1', 105, 2000);

      const state = adapter.getState();
      expect(state.backtestResults?.totalTrades).toBe(1);
      expect(state.backtestResults?.totalProfitOrLoss).toBe(5); // 105 - 100
      expect(state.backtestResults?.winRate).toBe(100);
    });
  });

  describe('reset', () => {
    it('should reset all components', async () => {
      const bar = createBar(1000, 100);
      await adapter.processBar(strategy, bar, [], 0, [bar]);
      
      adapter.reset(strategy);
      
      const state = adapter.getState();
      expect(state.tradeMarkers).toEqual([]);
      expect(state.currentIndicators).toEqual({});
      expect(state.backtestResults?.totalTrades).toBe(0);
    });
  });

  describe('state change notifications', () => {
    it('should notify subscribers on state changes', (done) => {
      let notificationCount = 0;
      
      adapter.onStateChange((state) => {
        notificationCount++;
        expect(state).toBeDefined();
        
        if (notificationCount === 1) {
          done();
        }
      });

      // Trigger a state change by publishing an event
      const messageBus = adapter.getMessageBus();
      messageBus.publish('ORDER_SUBMITTED' as any, 'test', {
        order: { id: 'test-order', status: OrderStatus.PENDING }
      });
    });
  });

  describe('MessageBus integration', () => {
    it('should handle order events', () => {
      const messageBus = adapter.getMessageBus();
      const cache = adapter.getCache();
      
      const order = {
        id: 'order1',
        type: 'MARKET' as any,
        side: 'BUY' as any,
        quantity: 1,
        status: OrderStatus.PENDING,
        submittedTime: 1000 as UTCTimestamp
      };

      messageBus.publish('ORDER_SUBMITTED' as any, 'test', { order });
      
      // The cache should have the order
      const cachedOrder = cache.getOrder('order1');
      expect(cachedOrder).toBeDefined();
      expect(cachedOrder?.status).toBe(OrderStatus.PENDING);
    });
  });
}); 