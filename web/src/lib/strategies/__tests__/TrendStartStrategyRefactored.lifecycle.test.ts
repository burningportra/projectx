import { TrendStartStrategyRefactored, TrendStartStrategyConfig } from '../TrendStartStrategyRefactored';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';
import { MessageBus, MessageType } from '@/lib/MessageBus';
import { 
  BacktestBarData, 
  OrderSide, 
  OrderType, 
  OrderStatus,
  TradeType,
  UTCTimestamp 
} from '@/lib/types/backtester';

describe('TrendStartStrategyRefactored - Lifecycle Management', () => {
  let strategy: TrendStartStrategyRefactored;
  let orderManager: OrderManager;
  let trendIdentifier: TrendIdentifier;
  let messageBus: MessageBus;
  let config: Partial<TrendStartStrategyConfig>;

  beforeEach(() => {
    // Create mocks
    orderManager = {
      placeOrder: jest.fn(),
      cancelOrder: jest.fn(),
      cancelOrdersByTradeId: jest.fn(),
      getOpenOrders: jest.fn().mockReturnValue([]),
      getOpenPositions: jest.fn().mockReturnValue([]),
      processBar: jest.fn().mockReturnValue([]),
    } as any;

    trendIdentifier = {
      processBar: jest.fn(),
      getSignals: jest.fn().mockReturnValue([]),
      getSignalsForRange: jest.fn().mockResolvedValue([]),
      resetState: jest.fn(),
    } as any;

    messageBus = new MessageBus();

    config = {
      name: 'TestStrategy',
      contractId: 'TEST',
      timeframe: '1h',
      minConfirmationBars: 2,
      confidenceThreshold: 0.6,
    };

    // Create strategy
    strategy = new TrendStartStrategyRefactored(
      config,
      orderManager,
      trendIdentifier,
      messageBus
    );
  });

  afterEach(() => {
    messageBus.dispose();
  });

  describe('Lifecycle State Transitions', () => {
    it('should start in UNINITIALIZED state', () => {
      expect(strategy.getLifecycleState()).toBe('UNINITIALIZED');
      expect(strategy.isReady()).toBe(false);
    });

    it('should transition to INITIALIZED on initialize()', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      strategy.initialize();
      
      expect(strategy.getLifecycleState()).toBe('INITIALIZED');
      expect(strategy.isReady()).toBe(false);
      
      // Verify initialization event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.STRATEGY_INITIALIZED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName(),
          config: expect.any(Object),
          timestamp: expect.any(Number)
        })
      );
    });

    it('should transition to STARTED on start()', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      strategy.initialize();
      strategy.start();
      
      expect(strategy.getLifecycleState()).toBe('STARTED');
      expect(strategy.isReady()).toBe(true);
      
      // Verify start event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.STRATEGY_STARTED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName(),
          config: expect.any(Object),
          timestamp: expect.any(Number)
        })
      );
    });

    it('should transition to STOPPED on stop()', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      strategy.initialize();
      strategy.start();
      strategy.stop();
      
      expect(strategy.getLifecycleState()).toBe('STOPPED');
      expect(strategy.isReady()).toBe(false);
      
      // Verify stop event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.STRATEGY_STOPPED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName(),
          hasOpenPosition: false,
          timestamp: expect.any(Number)
        })
      );
    });

    it('should transition to DISPOSED on dispose()', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      strategy.initialize();
      strategy.start();
      strategy.dispose();
      
      expect(strategy.getLifecycleState()).toBe('DISPOSED');
      expect(strategy.isReady()).toBe(false);
      
      // Verify disposal event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.STRATEGY_DISPOSED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName(),
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Invalid State Transitions', () => {
    it('should not allow initialization twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      strategy.initialize();
      strategy.initialize(); // Try to initialize again
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot initialize - current state: INITIALIZED')
      );
      
      consoleSpy.mockRestore();
    });

    it('should not allow start without initialization', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      strategy.start(); // Try to start without init
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot start - current state: UNINITIALIZED')
      );
      expect(strategy.getLifecycleState()).toBe('UNINITIALIZED');
      
      consoleSpy.mockRestore();
    });

    it('should not allow stop without start', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      strategy.initialize();
      strategy.stop(); // Try to stop without start
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot stop - current state: INITIALIZED')
      );
      
      consoleSpy.mockRestore();
    });

    it('should allow restart after stop', () => {
      strategy.initialize();
      strategy.start();
      strategy.stop();
      strategy.start(); // Should be allowed
      
      expect(strategy.getLifecycleState()).toBe('STARTED');
      expect(strategy.isReady()).toBe(true);
    });

    it('should not dispose twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      strategy.initialize();
      strategy.dispose();
      strategy.dispose(); // Try to dispose again
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already disposed')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Resource Management', () => {
    it('should register event handlers on initialization', () => {
      const subscribeSpy = jest.spyOn(messageBus, 'subscribe');
      
      strategy.initialize();
      
      // Verify all event handlers were registered
      expect(subscribeSpy).toHaveBeenCalledTimes(5); // 5 event types
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.BAR_RECEIVED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.ORDER_FILLED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.SIGNAL_GENERATED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.POSITION_OPENED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.POSITION_CLOSED, expect.any(Function));
    });

    it('should unregister event handlers on disposal', () => {
      strategy.initialize();
      
      // Get subscriptions count
      const subscriptions = (strategy as any).subscriptions;
      expect(subscriptions.length).toBe(5);
      
      // Create spies for unsubscribe
      const unsubscribeSpy = jest.fn();
      subscriptions.forEach((sub: any) => {
        sub.unsubscribe = unsubscribeSpy;
      });
      
      strategy.dispose();
      
      // Verify all subscriptions were unsubscribed
      expect(unsubscribeSpy).toHaveBeenCalledTimes(5);
      expect((strategy as any).subscriptions.length).toBe(0);
    });

    it('should reset trend identifier on initialization', () => {
      strategy.initialize();
      
      expect(trendIdentifier.resetState).toHaveBeenCalled();
    });

    it('should clear state on disposal', () => {
      strategy.initialize();
      
      // Set some state
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      (strategy as any).state.updateCurrentBar(testBar);
      
      strategy.dispose();
      
      // Verify state was reset
      expect((strategy as any).state.getCurrentBar()).toBeNull();
    });

    it('should cancel pending orders on stop', () => {
      strategy.initialize();
      strategy.start();
      
      // Set up a mock open trade
      const mockTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        status: 'OPEN',
        size: 1
      };
      (strategy as any).state.setOpenTrade(mockTrade);
      
      strategy.stop();
      
      // Verify orders were cancelled
      expect(orderManager.cancelOrdersByTradeId).toHaveBeenCalledWith('trade1');
    });

    it('should stop running strategy before disposal', () => {
      const stopSpy = jest.spyOn(strategy, 'stop');
      
      strategy.initialize();
      strategy.start();
      strategy.dispose();
      
      // Verify stop was called
      expect(stopSpy).toHaveBeenCalled();
      expect(strategy.getLifecycleState()).toBe('DISPOSED');
    });
  });

  describe('Event Processing Based on Lifecycle State', () => {
    it('should not process bar events when not started', async () => {
      strategy.initialize(); // Only initialized, not started
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Publish bar event
      messageBus.publish(MessageType.BAR_RECEIVED, 'BacktestEngine', {
        bar: testBar,
        barIndex: 0,
        allBars: [testBar]
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify bar was not processed
      expect((strategy as any).state.getCurrentBar()).toBeNull();
    });

    it('should process bar events when started', async () => {
      strategy.initialize();
      strategy.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Publish bar event
      messageBus.publish(MessageType.BAR_RECEIVED, 'BacktestEngine', {
        bar: testBar,
        barIndex: 0,
        allBars: [testBar]
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify bar was processed
      expect((strategy as any).state.getCurrentBar()).toEqual(testBar);
    });

    it('should not process signals when stopped', async () => {
      strategy.initialize();
      strategy.start();
      strategy.stop();
      
      const testSignal = {
        type: 'CUS' as const,
        barIndex: 0,
        price: 100,
        rule: 'TestRule',
        confidence: 0.8,
        contractId: config.contractId,
        timeframe: config.timeframe
      };
      
      // Publish signal event
      messageBus.publish(MessageType.SIGNAL_GENERATED, 'TrendIdentifier', {
        signal: testSignal
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify signal was not tracked
      expect(strategy.getTrendSignals()).toHaveLength(0);
    });

    it('should always process order fills for consistency', async () => {
      strategy.initialize();
      // Not started - but should still process order fills
      
      const mockTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        status: 'OPEN',
        entryOrder: { id: 'order1' },
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp
      };
      
      (strategy as any).state.setOpenTrade(mockTrade);
      
      const filledOrder = {
        id: 'order1',
        side: OrderSide.BUY,
        status: OrderStatus.FILLED,
        filledPrice: 100,
        filledTime: 1000 as UTCTimestamp,
        source: strategy.getName()
      };
      
      // Publish order filled event
      messageBus.publish(MessageType.ORDER_FILLED, strategy.getName(), {
        order: filledOrder,
        bar: { time: 1000 as UTCTimestamp, open: 100, high: 100, low: 100, close: 100 }
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify order was processed
      const openTrade = strategy.getOpenTrade();
      expect(openTrade?.entryOrder?.status).toBe(OrderStatus.FILLED);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors', () => {
      // Mock validation to throw
      jest.spyOn(strategy as any, 'validateStrategySpecificConfig').mockImplementation(() => {
        throw new Error('Invalid configuration');
      });
      
      expect(() => strategy.initialize()).toThrow('Invalid configuration');
      expect(strategy.getLifecycleState()).toBe('UNINITIALIZED');
    });

    it('should handle start errors', () => {
      strategy.initialize();
      
      // Mock onStart to throw
      jest.spyOn(strategy as any, 'onStart').mockImplementation(() => {
        throw new Error('Start failed');
      });
      
      expect(() => strategy.start()).toThrow('Start failed');
      expect(strategy.getLifecycleState()).toBe('INITIALIZED');
    });

    it('should handle stop errors', () => {
      strategy.initialize();
      strategy.start();
      
      // Mock onStop to throw
      jest.spyOn(strategy as any, 'onStop').mockImplementation(() => {
        throw new Error('Stop failed');
      });
      
      expect(() => strategy.stop()).toThrow('Stop failed');
      expect(strategy.getLifecycleState()).toBe('STARTED');
    });

    it('should handle disposal errors gracefully', () => {
      strategy.initialize();
      
      // Mock onDispose to throw
      jest.spyOn(strategy as any, 'onDispose').mockImplementation(() => {
        throw new Error('Disposal failed');
      });
      
      expect(() => strategy.dispose()).toThrow('Disposal failed');
      // State should NOT transition on error
      expect(strategy.getLifecycleState()).toBe('INITIALIZED');
    });
  });
}); 