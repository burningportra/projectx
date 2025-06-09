import { BacktestEngineV2, EngineState, BacktestEventType } from '../BacktestEngineV2';
import { MessageBus, MessageType } from '../MessageBus';
import { Cache } from '../Cache';
import { IStrategy } from '../types/strategy';
import { BacktestBarData, SubBarData, StrategySignalType, TradeType } from '../types/backtester';
import { UTCTimestamp } from 'lightweight-charts';

// Mock strategy for testing
class MockStrategy implements IStrategy {
  private name: string;
  private processBarCalled = 0;
  private resetCalled = 0;
  private config: any = {};

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return 'Mock strategy for testing';
  }

  getVersion(): string {
    return '1.0.0';
  }

  async processBar(
    bar: BacktestBarData,
    subBars: SubBarData[] | undefined,
    barIndex: number,
    allBars: BacktestBarData[]
  ): Promise<any> {
    this.processBarCalled++;
    return { 
      signal: null,
      indicators: { test: 1 },
      filledOrders: []
    };
  }

  reset(): void {
    this.resetCalled++;
  }

  getProcessBarCallCount(): number {
    return this.processBarCalled;
  }

  getResetCallCount(): number {
    return this.resetCalled;
  }

  // Additional required methods for IStrategy
  getSignals(): any[] {
    return [];
  }

  getPendingOrders(): any[] {
    return [];
  }

  getFilledOrders(): any[] {
    return [];
  }

  getCancelledOrders(): any[] {
    return [];
  }

  getOpenTrade(): any {
    return null;
  }

  getCurrentBacktestResults(): any {
    return null;
  }

  getTrades(): any[] {
    return [];
  }

  getCurrentIndicators(): any {
    return { test: 1 };
  }

  updateConfig(config: any): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): any {
    return this.config;
  }
}

describe('BacktestEngineV2', () => {
  let messageBus: MessageBus;
  let cache: Cache;
  let engine: BacktestEngineV2;

  beforeEach(() => {
    messageBus = new MessageBus();
    cache = new Cache(10000);
    engine = new BacktestEngineV2(messageBus, cache, {
      initialCapital: 10000,
      commission: 2.5,
      progressUpdateInterval: 2
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('Lifecycle Management', () => {
    it('should initialize in IDLE state', () => {
      expect(engine.getState()).toBe(EngineState.IDLE);
    });

    it('should add and remove strategies only when idle', () => {
      const strategy = new MockStrategy('TestStrategy');
      
      // Should add strategy when idle
      engine.addStrategy('test', strategy);
      
      // Should throw when trying to add during running state
      engine.loadData([{ time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 }]);
      engine.start();
      
      expect(() => engine.addStrategy('test2', strategy)).toThrow('Cannot add strategies while engine is running');
      expect(() => engine.removeStrategy('test')).toThrow('Cannot remove strategies while engine is running');
    });

    it('should transition through states correctly', async () => {
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      // Load data
      const bars: BacktestBarData[] = [
        { time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 },
        { time: 60 as UTCTimestamp, open: 100, high: 102, low: 99, close: 101 }
      ];
      await engine.loadData(bars);
      
      // Start
      await engine.start();
      expect(engine.getState()).toBe(EngineState.RUNNING);
      
      // Pause
      engine.pause();
      expect(engine.getState()).toBe(EngineState.PAUSED);
      
      // Resume
      engine.resume();
      expect(engine.getState()).toBe(EngineState.RUNNING);
      
      // Stop
      engine.stop();
      expect(engine.getState()).toBe(EngineState.STOPPED);
    });

    it('should throw appropriate errors for invalid state transitions', async () => {
      await expect(engine.start()).rejects.toThrow('No strategies added to engine');
      
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      await expect(engine.start()).rejects.toThrow('No data loaded');
      
      await engine.loadData([{ time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 }]);
      await engine.start();
      
      await expect(engine.start()).rejects.toThrow('Cannot start engine from state: RUNNING');
      expect(() => engine.resume()).toThrow('Can only resume when paused');
      
      engine.pause();
      expect(() => engine.pause()).toThrow('Can only pause when running');
    });
  });

  describe('Data Loading', () => {
    it('should load main bars into cache', async () => {
      const bars: BacktestBarData[] = [
        { time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 },
        { time: 60 as UTCTimestamp, open: 100, high: 102, low: 99, close: 101 }
      ];
      
      await engine.loadData(bars);
      
      const cachedBars = cache.getBars('DEFAULT', '1m');
      expect(cachedBars).toHaveLength(2);
      expect(cachedBars[0]).toEqual(bars[0]);
    });

    it('should load sub-bars into cache', async () => {
      const mainBars: BacktestBarData[] = [
        { time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 }
      ];
      
      const subBars: SubBarData[] = [
        { time: 0 as UTCTimestamp, open: 100, high: 100.5, low: 99.5, close: 100.2, parentBarIndex: 0 },
        { time: 15 as UTCTimestamp, open: 100.2, high: 100.7, low: 100, close: 100.5, parentBarIndex: 0 }
      ];
      
      await engine.loadData(mainBars, subBars);
      
      const cachedSubBars = cache.getBars('DEFAULT', 'sub');
      expect(cachedSubBars).toHaveLength(2);
      expect(cachedSubBars[0]).toEqual(subBars[0]);
    });

    it('should throw error when loading data while running', async () => {
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      await engine.loadData([{ time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 }]);
      await engine.start();
      
      await expect(engine.loadData([])).rejects.toThrow('Cannot load data while engine is running');
    });
  });

  describe('Event Processing', () => {
    it('should process bars and emit events', async () => {
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      const bars: BacktestBarData[] = [
        { time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 },
        { time: 60 as UTCTimestamp, open: 100, high: 102, low: 99, close: 101 }
      ];
      
      const barReceivedEvents: any[] = [];
      messageBus.subscribe(MessageType.BAR_RECEIVED, (msg) => {
        barReceivedEvents.push(msg.data);
      });
      
      await engine.loadData(bars);
      await engine.start();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      engine.stop();
      
      expect(barReceivedEvents.length).toBeGreaterThan(0);
      expect(strategy.getProcessBarCallCount()).toBeGreaterThan(0);
    });

    it('should emit progress updates', async () => {
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      const bars: BacktestBarData[] = Array.from({ length: 10 }, (_, i) => ({
        time: (i * 60) as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100
      }));
      
      const progressEvents: any[] = [];
      messageBus.subscribe('BACKTEST_PROGRESS' as any, (msg) => {
        progressEvents.push(msg.data);
      });
      
      await engine.loadData(bars);
      await engine.start();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      engine.stop();
      
      expect(progressEvents.length).toBeGreaterThan(0);
      const lastProgress = progressEvents[progressEvents.length - 1];
      expect(lastProgress.percentComplete).toBeGreaterThan(0);
    });

    it('should handle strategy errors gracefully', async () => {
      const errorStrategy = new MockStrategy('ErrorStrategy');
      // Override processBar to throw error
      errorStrategy.processBar = async () => {
        throw new Error('Strategy error');
      };
      
      engine.addStrategy('error', errorStrategy);
      
      const bars: BacktestBarData[] = [
        { time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 },
        { time: 60 as UTCTimestamp, open: 100, high: 102, low: 99, close: 101 },
        { time: 120 as UTCTimestamp, open: 101, high: 103, low: 100, close: 102 }
      ];
      
      await engine.loadData(bars);
      await engine.start();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Engine should continue running despite error (unless it completed all bars)
      const state = engine.getState();
      expect(state === EngineState.RUNNING || state === EngineState.STOPPED).toBe(true);
      
      engine.stop();
    });
  });

  describe('Progress Tracking', () => {
    it('should track progress correctly', async () => {
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      const bars: BacktestBarData[] = Array.from({ length: 10 }, (_, i) => ({
        time: (i * 60) as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100
      }));
      
      await engine.loadData(bars);
      
      const initialProgress = engine.getProgress();
      expect(initialProgress).toEqual({
        current: 0,
        total: 10,
        percent: 0
      });
      
      await engine.start();
      
      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const midProgress = engine.getProgress();
      expect(midProgress.current).toBeGreaterThan(0);
      expect(midProgress.percent).toBeGreaterThan(0);
      
      engine.stop();
    });
  });

  describe('Results Calculation', () => {
    it('should calculate results from cache', () => {
      // Add some mock positions to cache
      cache.addOpenPosition({
        id: '1',
        entryTime: 0 as UTCTimestamp,
        entryPrice: 100,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      });
      
      // Close the position to add it to closed positions
      cache.closePosition('1', 150, 60);
      
      cache.addOpenPosition({
        id: '2',
        entryTime: 60 as UTCTimestamp,
        entryPrice: 101,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      });
      
      // Close the position with a loss
      cache.closePosition('2', 81, 120);
      
      const results = engine.getResults();
      
      expect(results.totalTrades).toBe(2);
      expect(results.winningTrades).toBe(1);
      expect(results.losingTrades).toBe(1);
      expect(results.totalProfitOrLoss).toBe(30);
      expect(results.winRate).toBe(50);
      expect(results.averageWin).toBe(50);
      expect(results.averageLoss).toBe(20);
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on dispose', async () => {
      const strategy = new MockStrategy('TestStrategy');
      engine.addStrategy('test', strategy);
      
      await engine.loadData([{ time: 0 as UTCTimestamp, open: 100, high: 101, low: 99, close: 100 }]);
      await engine.start();
      
      engine.dispose();
      
      expect(engine.getState()).toBe(EngineState.STOPPED);
      expect(strategy.getResetCallCount()).toBeGreaterThan(0);
    });
  });

  describe('MessageBus Integration', () => {
    it('should subscribe to and handle MessageBus events', () => {
      const signalEvents: any[] = [];
      const orderEvents: any[] = [];
      
      // Spy on engine's event queue
      const enqueueEventSpy = jest.spyOn(engine as any, 'enqueueEvent');
      
      // Publish events
      messageBus.publish(MessageType.SIGNAL_GENERATED, 'test', {
        signal: { type: StrategySignalType.BUY }
      });
      
      messageBus.publish(MessageType.ORDER_SUBMITTED, 'test', {
        orderId: '123'
      });
      
      messageBus.publish(MessageType.ORDER_FILLED, 'test', {
        orderId: '123',
        price: 100
      });
      
      expect(enqueueEventSpy).toHaveBeenCalledTimes(3);
      expect(enqueueEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: BacktestEventType.SIGNAL
        })
      );
    });
  });
}); 