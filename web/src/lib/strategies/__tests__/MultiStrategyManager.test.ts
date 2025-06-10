import { MultiStrategyManager } from '../MultiStrategyManager';
import { MessageBus, MessageType } from '@/lib/MessageBus';
import { Cache } from '@/lib/Cache';
import { BaseStrategy } from '@/lib/strategies/BaseStrategy';
import { OrderManager } from '@/lib/OrderManager';
import { BacktestBarData, UTCTimestamp } from '@/lib/types/backtester';
import { StrategyResult } from '@/lib/types/strategy';

// Mock strategy for testing
class MockStrategy extends BaseStrategy {
  constructor(
    private name: string,
    orderManager: OrderManager,
    config?: any
  ) {
    super(orderManager, { ...config, name });
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return `Mock strategy ${this.name}`;
  }

  getVersion(): string {
    return '1.0.0';
  }

  processBar(
    mainBar: BacktestBarData,
    subBars: any,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): StrategyResult {
    return {
      signal: null,
      indicators: {},
      filledOrders: []
    };
  }
}

describe('MultiStrategyManager', () => {
  let manager: MultiStrategyManager;
  let messageBus: MessageBus;
  let cache: Cache;
  let orderManager: OrderManager;

  beforeEach(() => {
    messageBus = new MessageBus();
    cache = new Cache();
    orderManager = new OrderManager();
    manager = new MultiStrategyManager(messageBus, cache);
  });

  afterEach(() => {
    manager.dispose();
    messageBus.dispose();
  });

  describe('Strategy Management', () => {
    it('should add strategies successfully', () => {
      const strategy1 = new MockStrategy('Strategy1', orderManager);
      const strategy2 = new MockStrategy('Strategy2', orderManager);

      manager.addStrategy(strategy1);
      manager.addStrategy(strategy2);

      expect(manager.getStrategyIds()).toEqual(['Strategy1', 'Strategy2']);
    });

    it('should prevent adding duplicate strategies', () => {
      const strategy1 = new MockStrategy('Strategy1', orderManager);
      const strategy2 = new MockStrategy('Strategy1', orderManager); // Same name

      manager.addStrategy(strategy1);
      
      expect(() => manager.addStrategy(strategy2)).toThrow(
        'Strategy with ID Strategy1 already exists'
      );
    });

    it('should remove strategies successfully', () => {
      const strategy = new MockStrategy('Strategy1', orderManager);
      const resetSpy = jest.spyOn(strategy, 'reset');

      manager.addStrategy(strategy);
      manager.removeStrategy('Strategy1');

      expect(manager.getStrategyIds()).toEqual([]);
      expect(resetSpy).toHaveBeenCalled();
    });

    it('should handle removing non-existent strategy', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      manager.removeStrategy('NonExistent');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MultiStrategyManager] Strategy NonExistent not found'
      );
      
      consoleSpy.mockRestore();
    });

    it('should get specific strategy', () => {
      const strategy = new MockStrategy('Strategy1', orderManager);
      
      manager.addStrategy(strategy);
      
      expect(manager.getStrategy('Strategy1')).toBe(strategy);
      expect(manager.getStrategy('NonExistent')).toBeUndefined();
    });
  });

  describe('Lifecycle Management', () => {
    it('should start all strategies', () => {
      const strategy1 = new MockStrategy('Strategy1', orderManager);
      const strategy2 = new MockStrategy('Strategy2', orderManager);
      const reset1Spy = jest.spyOn(strategy1, 'reset');
      const reset2Spy = jest.spyOn(strategy2, 'reset');

      manager.addStrategy(strategy1);
      manager.addStrategy(strategy2);
      
      manager.start();

      expect(reset1Spy).toHaveBeenCalled();
      expect(reset2Spy).toHaveBeenCalled();
      
      const stats = manager.getStats();
      expect(stats.isActive).toBe(true);
      expect(stats.totalStrategies).toBe(2);
    });

    it('should not start twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      manager.start();
      manager.start(); // Try to start again
      
      expect(consoleSpy).toHaveBeenCalledWith('[MultiStrategyManager] Already started');
      
      consoleSpy.mockRestore();
    });

    it('should stop all strategies', () => {
      const strategy = new MockStrategy('Strategy1', orderManager);
      
      manager.addStrategy(strategy);
      manager.start();
      manager.stop();

      const stats = manager.getStats();
      expect(stats.isActive).toBe(false);
    });

    it('should handle strategy initialization errors', () => {
      const strategy = new MockStrategy('Strategy1', orderManager);
      const originalReset = strategy.reset.bind(strategy);
      let callCount = 0;
      
      // Mock reset to throw error only on first call (during start)
      jest.spyOn(strategy, 'reset').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Init error');
        }
        // Subsequent calls (during dispose) should work normally
        return originalReset();
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      manager.addStrategy(strategy);
      manager.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MultiStrategyManager] Failed to start strategy Strategy1:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should dispose all strategies', () => {
      const strategy1 = new MockStrategy('Strategy1', orderManager);
      const strategy2 = new MockStrategy('Strategy2', orderManager);
      const reset1Spy = jest.spyOn(strategy1, 'reset');
      const reset2Spy = jest.spyOn(strategy2, 'reset');

      manager.addStrategy(strategy1);
      manager.addStrategy(strategy2);
      manager.start();
      
      manager.dispose();

      expect(reset1Spy).toHaveBeenCalled();
      expect(reset2Spy).toHaveBeenCalled();
      expect(manager.getStrategyIds()).toEqual([]);
    });
  });

  describe('Event Filtering', () => {
    it('should filter order events by strategy', () => {
      const strategy1 = new MockStrategy('Strategy1', orderManager);
      const strategy2 = new MockStrategy('Strategy2', orderManager);
      const publishSpy = jest.spyOn(messageBus, 'publish');

      manager.addStrategy(strategy1);
      manager.addStrategy(strategy2);
      manager.start();

      // Publish order filled event for Strategy1
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', {
        order: { source: 'Strategy1' },
        strategyId: 'Strategy1'
      });

      // Should republish with strategy-specific topic
      expect(publishSpy).toHaveBeenCalledWith(
        'ORDER_FILLED_Strategy1',
        expect.any(String),
        expect.objectContaining({
          strategyId: 'Strategy1'
        })
      );
    });

    it('should filter position events by strategy', () => {
      const strategy = new MockStrategy('Strategy1', orderManager);
      const publishSpy = jest.spyOn(messageBus, 'publish');

      manager.addStrategy(strategy);
      manager.start();

      // Publish position opened event
      messageBus.publish(MessageType.POSITION_OPENED, 'Strategy1', {
        strategyId: 'Strategy1',
        position: { id: 'pos1' }
      });

      // Should republish with strategy-specific topic
      expect(publishSpy).toHaveBeenCalledWith(
        'POSITION_OPENED_Strategy1',
        expect.any(String),
        expect.objectContaining({
          strategyId: 'Strategy1'
        })
      );
    });

    it('should not forward events from other strategies', () => {
      const strategy = new MockStrategy('Strategy1', orderManager);
      const publishSpy = jest.spyOn(messageBus, 'publish');

      manager.addStrategy(strategy);
      manager.start();

      // Clear initial calls
      publishSpy.mockClear();

      // Publish event for different strategy
      messageBus.publish(MessageType.ORDER_FILLED, 'OrderManager', {
        order: { source: 'Strategy2' },
        strategyId: 'Strategy2'
      });

      // Should not republish for Strategy1
      expect(publishSpy).not.toHaveBeenCalledWith(
        'ORDER_FILLED_Strategy1',
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      const strategy1 = new MockStrategy('Strategy1', orderManager);
      const strategy2 = new MockStrategy('Strategy2', orderManager);

      manager.addStrategy(strategy1);
      manager.addStrategy(strategy2);

      let stats = manager.getStats();
      expect(stats).toEqual({
        isActive: false,
        totalStrategies: 2,
        activeStrategies: 0,
        strategyDetails: [
          { id: 'Strategy1', state: 'UNKNOWN', hasPosition: false },
          { id: 'Strategy2', state: 'UNKNOWN', hasPosition: false }
        ]
      });

      manager.start();

      stats = manager.getStats();
      expect(stats.isActive).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    it('should create namespaced cache keys', () => {
      const key = MultiStrategyManager.createCacheKey('Strategy1', 'positions');
      expect(key).toBe('strategy:Strategy1:positions');
    });

    it('should create namespaced event topics', () => {
      const topic = MultiStrategyManager.createEventTopic('ORDER_FILLED', 'Strategy1');
      expect(topic).toBe('ORDER_FILLED_Strategy1');
    });
  });

  describe('Auto-initialization', () => {
    it('should auto-initialize strategies added after start', () => {
      manager.start();

      const strategy = new MockStrategy('Strategy1', orderManager);
      const resetSpy = jest.spyOn(strategy, 'reset');

      manager.addStrategy(strategy);

      expect(resetSpy).toHaveBeenCalled();
    });
  });
}); 