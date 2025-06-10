import { TrendStartStrategyRefactored } from '../TrendStartStrategyRefactored';
import { ITrendStartStrategy } from '../interfaces/ITrendStartStrategy';
import { TrendStartStrategyConfig } from '../config/TrendStartStrategyConfig';
import { createTrendStartStrategyFactory } from '../factories/TrendStartStrategyFactory';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';
import { MessageBus, MessageType } from '@/lib/MessageBus';
import { BacktestBarData, UTCTimestamp } from '@/lib/types/backtester';

describe('TrendStartStrategy Public Interface', () => {
  let strategy: ITrendStartStrategy;
  let orderManager: OrderManager;
  let trendIdentifier: TrendIdentifier;
  let messageBus: MessageBus;
  let factory: ReturnType<typeof createTrendStartStrategyFactory>;

  beforeEach(() => {
    orderManager = new OrderManager();
    trendIdentifier = {
      processBar: jest.fn(),
      getSignals: jest.fn().mockReturnValue([]),
      getSignalsForRange: jest.fn().mockResolvedValue([]),
      resetState: jest.fn(),
    } as any;
    messageBus = new MessageBus();
    
    // Create factory
    factory = createTrendStartStrategyFactory(
      orderManager,
      trendIdentifier,
      messageBus
    );
    
    // Create strategy using factory
    strategy = factory({
      strategyId: 'test-strategy-1',
      contractId: 'TEST',
      timeframe: '1h'
    });
  });

  afterEach(() => {
    if (strategy.getLifecycleState() !== 'DISPOSED') {
      strategy.dispose();
    }
    messageBus.dispose();
  });

  describe('Identification Methods', () => {
    it('should return correct strategy ID', () => {
      expect(strategy.getStrategyId()).toBe('test-strategy-1');
    });

    it('should return correct name', () => {
      expect(strategy.getName()).toBe('TrendStartStrategy');
    });

    it('should return description', () => {
      expect(strategy.getDescription()).toContain('trend');
    });

    it('should return version', () => {
      expect(strategy.getVersion()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Lifecycle Management', () => {
    it('should follow proper lifecycle transitions', () => {
      // Initial state
      expect(strategy.getLifecycleState()).toBe('UNINITIALIZED');
      expect(strategy.isReady()).toBe(false);

      // Initialize
      strategy.initialize();
      expect(strategy.getLifecycleState()).toBe('INITIALIZED');
      expect(strategy.isReady()).toBe(false);

      // Start
      strategy.start();
      expect(strategy.getLifecycleState()).toBe('STARTED');
      expect(strategy.isReady()).toBe(true);

      // Stop
      strategy.stop();
      expect(strategy.getLifecycleState()).toBe('STOPPED');
      expect(strategy.isReady()).toBe(false);

      // Dispose
      strategy.dispose();
      expect(strategy.getLifecycleState()).toBe('DISPOSED');
      expect(strategy.isReady()).toBe(false);
    });

    it('should handle invalid lifecycle transitions gracefully', () => {
      // Try to start without initialization
      strategy.start();
      expect(strategy.getLifecycleState()).toBe('UNINITIALIZED');

      // Initialize first
      strategy.initialize();
      
      // Try to initialize again
      strategy.initialize();
      expect(strategy.getLifecycleState()).toBe('INITIALIZED');

      // Start and try to start again
      strategy.start();
      strategy.start();
      expect(strategy.getLifecycleState()).toBe('STARTED');
    });
  });

  describe('Configuration Access', () => {
    it('should return immutable configuration', () => {
      strategy.initialize();
      
      const config = strategy.getConfig();
      expect(config.strategyId).toBe('test-strategy-1');
      expect(config.contractId).toBe('TEST');
      expect(config.timeframe).toBe('1h');
      
      // Verify immutability
      expect(() => {
        (config as any).strategyId = 'modified';
      }).toThrow();
    });
  });

  describe('State Access', () => {
    it('should provide state snapshot', () => {
      strategy.initialize();
      strategy.start();
      
      const snapshot = strategy.getStateSnapshot();
      
      expect(snapshot).toHaveProperty('marketData');
      expect(snapshot).toHaveProperty('signals');
      expect(snapshot).toHaveProperty('position');
      expect(snapshot).toHaveProperty('performance');
      
      // Verify initial state
      expect(snapshot.marketData.currentBar).toBeNull();
      expect(snapshot.marketData.barCount).toBe(0);
      expect(snapshot.signals.signalCount).toBe(0);
      expect(snapshot.position.isInPosition).toBe(false);
    });

    it('should track position state', () => {
      strategy.initialize();
      strategy.start();
      
      expect(strategy.isInPosition()).toBe(false);
      expect(strategy.getOpenTrade()).toBeNull();
    });

    it('should return empty trend signals initially', () => {
      strategy.initialize();
      
      const signals = strategy.getTrendSignals();
      expect(signals).toEqual([]);
    });
  });

  describe('Performance Metrics', () => {
    it('should provide performance metrics', () => {
      strategy.initialize();
      strategy.start();
      
      const metrics = strategy.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('totalPnL');
      expect(metrics).toHaveProperty('winRate');
      expect(metrics).toHaveProperty('totalTrades');
      expect(metrics).toHaveProperty('winningTrades');
      expect(metrics).toHaveProperty('losingTrades');
      expect(metrics).toHaveProperty('averageWin');
      expect(metrics).toHaveProperty('averageLoss');
      expect(metrics).toHaveProperty('profitFactor');
      expect(metrics).toHaveProperty('maxDrawdown');
      expect(metrics).toHaveProperty('sharpeRatio');
      
      // Verify initial values
      expect(metrics.totalPnL).toBe(0);
      expect(metrics.totalTrades).toBe(0);
    });
  });

  describe('Health Status', () => {
    it('should provide health status', () => {
      strategy.initialize();
      strategy.start();
      
      const health = strategy.getHealthStatus();
      
      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('lastActivityTime');
      expect(health).toHaveProperty('errorCount');
      expect(health).toHaveProperty('warningCount');
      expect(health).toHaveProperty('uptime');
      
      // Verify initial health
      expect(health.isHealthy).toBe(true);
      expect(health.errorCount).toBe(0);
      expect(health.warningCount).toBe(0);
      expect(health.uptime).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should provide statistics', () => {
      strategy.initialize();
      strategy.start();
      
      const stats = strategy.getStatistics();
      
      expect(stats).toHaveProperty('eventsProcessed');
      expect(stats).toHaveProperty('signalsGenerated');
      expect(stats).toHaveProperty('ordersSubmitted');
      expect(stats).toHaveProperty('tradesCompleted');
      expect(stats).toHaveProperty('lastUpdateTime');
      
      // Verify initial statistics
      expect(stats.eventsProcessed).toBe(0);
      expect(stats.signalsGenerated).toBe(0);
      expect(stats.ordersSubmitted).toBe(0);
      expect(stats.tradesCompleted).toBe(0);
    });

    it('should update statistics on bar processing', () => {
      strategy.initialize();
      strategy.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5
      };
      
      // Process a bar
      messageBus.publish(MessageType.BAR_RECEIVED, 'BacktestEngine', {
        bar: testBar,
        barIndex: 0
      });
      
      const stats = strategy.getStatistics();
      expect(stats.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe('Factory Pattern', () => {
    it('should create strategies with factory', () => {
      const newStrategy = factory({
        strategyId: 'factory-strategy',
        contractId: 'FACTORY',
        timeframe: '5m'
      });
      
      expect(newStrategy.getStrategyId()).toBe('factory-strategy');
      expect(newStrategy.getConfig().contractId).toBe('FACTORY');
      
      newStrategy.dispose();
    });
  });
}); 