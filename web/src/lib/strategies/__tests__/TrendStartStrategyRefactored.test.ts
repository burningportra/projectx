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

describe('TrendStartStrategyRefactored - Event Handler Architecture', () => {
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
      getOpenOrders: jest.fn().mockReturnValue([]),
      getOpenPositions: jest.fn().mockReturnValue([]),
      processBar: jest.fn().mockReturnValue([]),
    } as any;

    trendIdentifier = {
      processBar: jest.fn(),
      getSignals: jest.fn().mockReturnValue([]),
      getSignalsForRange: jest.fn().mockResolvedValue([]),
    } as any;

    messageBus = new MessageBus();

    config = {
      name: 'TestStrategy',
      contractId: 'TEST',
      timeframe: '1h',
      minConfirmationBars: 2,
      confidenceThreshold: 0.6,
    };

    // Create strategy with new constructor signature
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

  describe('Event Handler Registration', () => {
    it('should register event handlers on initialization', () => {
      // Spy on messageBus.subscribe
      const subscribeSpy = jest.spyOn(messageBus, 'subscribe');
      
      // Call initialize (which registers handlers)
      strategy.initialize();
      
      // Verify all required event types are subscribed
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.BAR_RECEIVED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.ORDER_FILLED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.SIGNAL_GENERATED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.POSITION_OPENED, expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith(MessageType.POSITION_CLOSED, expect.any(Function));
    });

    it('should unregister event handlers on disposal', () => {
      // Initialize to register handlers
      strategy.initialize();
      
      // Get subscriptions count
      const subscriptionsCount = (strategy as any).subscriptions.length;
      expect(subscriptionsCount).toBeGreaterThan(0);
      
      // Dispose
      strategy.dispose();
      
      // Verify subscriptions are cleared
      expect((strategy as any).subscriptions.length).toBe(0);
    });
  });

  describe('Bar Event Handling', () => {
    it('should process bar events and request trend signals', async () => {
      // Initialize and start the strategy
      strategy.initialize();
      strategy.start();
      
      // Mock trend identifier method
      const getSignalsSpy = jest.spyOn(trendIdentifier, 'getSignalsForRange')
        .mockResolvedValue([]);
      
      // Create test bar
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Call processBar which will publish the BAR_RECEIVED event
      await strategy.processBar(testBar, undefined, 0, [testBar]);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get the actual config from the strategy
      const actualConfig = strategy.getConfig();
      
      // Verify trend signals were requested with actual config values
      expect(getSignalsSpy).toHaveBeenCalledWith(
        [testBar],
        0,
        actualConfig.contractId,
        actualConfig.timeframe
      );
    });

    it('should publish ORDER_FILLED events for filled orders', async () => {
      // Initialize and start strategy
      strategy.initialize();
      strategy.start();
      
      // Mock orderManager to return a filled order
      const mockOrder = {
        id: 'order1',
        side: OrderSide.BUY,
        status: OrderStatus.FILLED,
        filledPrice: 100,
        filledTime: 1000 as UTCTimestamp
      };
      
      jest.spyOn(orderManager, 'processBar').mockReturnValue([mockOrder as any]);
      
      // Spy on publish
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      // Create test bar
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
      
      // Verify ORDER_FILLED was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.ORDER_FILLED,
        strategy.getName(),
        expect.objectContaining({ order: mockOrder })
      );
    });
  });

  describe('Signal Event Handling', () => {
    it('should process relevant trend signals', async () => {
      // Initialize and start strategy
      strategy.initialize();
      strategy.start();
      
      // Create test signal
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
      
      // Verify signal was tracked
      const trackedSignals = strategy.getTrendSignals();
      expect(trackedSignals).toHaveLength(1);
      expect(trackedSignals[0]).toMatchObject(testSignal);
    });

    it('should ignore signals for different contracts', async () => {
      // Initialize and start strategy
      strategy.initialize();
      strategy.start();
      
      // Create signal for different contract
      const testSignal = {
        type: 'CUS' as const,
        barIndex: 0,
        price: 100,
        rule: 'TestRule',
        confidence: 0.8,
        contractId: 'DIFFERENT_CONTRACT',
        timeframe: config.timeframe
      };
      
      // Publish signal event
      messageBus.publish(MessageType.SIGNAL_GENERATED, 'TrendIdentifier', {
        signal: testSignal
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify signal was NOT tracked
      const trackedSignals = strategy.getTrendSignals();
      expect(trackedSignals).toHaveLength(0);
    });

    it('should initiate position open on valid entry signal', async () => {
      // Initialize and start strategy
      strategy.initialize();
      strategy.start();
      
      // Set up bar data in state
      const testBar = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Update state with current bar
      (strategy as any).state.updateCurrentBar(testBar);
      (strategy as any).state.updateAllBars([testBar]);
      
      // Spy on publish
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      // Create entry signal
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
      
      // Verify SUBMIT_ORDER was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.SUBMIT_ORDER,
        strategy.getName(),
        expect.objectContaining({
          side: OrderSide.BUY,
          quantity: expect.any(Number),
          type: OrderType.MARKET,
          contractId: config.contractId,
          source: strategy.getName()
        })
      );
      
      // Verify POSITION_OPENED was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.POSITION_OPENED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName(),
          signal: testSignal
        })
      );
    });
  });

  describe('Order Event Handling', () => {
    it('should handle order filled events correctly', async () => {
      // Initialize strategy
      (strategy as any).onInit();
      
      // Create a mock open trade
      const mockTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        status: 'OPEN',
        entryOrder: { id: 'order1' },
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp
      };
      
      // Set the trade in state
      (strategy as any).state.setOpenTrade(mockTrade);
      
      // Create filled order
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
      
      // Verify trade was updated
      const openTrade = strategy.getOpenTrade();
      expect(openTrade?.entryOrder).toMatchObject({
        id: 'order1',
        side: OrderSide.BUY,
        status: OrderStatus.FILLED,
        filledPrice: 100,
        filledTime: 1000,
        source: strategy.getName()
      });
    });

    it('should ignore orders from other strategies', async () => {
      // Initialize strategy
      (strategy as any).onInit();
      
      // Spy on _handleFilledOrder
      const handleSpy = jest.spyOn(strategy as any, '_handleFilledOrder');
      
      // Create order from different strategy
      const filledOrder = {
        id: 'order1',
        side: OrderSide.BUY,
        status: OrderStatus.FILLED,
        filledPrice: 100,
        filledTime: 1000 as UTCTimestamp,
        source: 'DifferentStrategy'
      };
      
      // Publish order filled event
      messageBus.publish(MessageType.ORDER_FILLED, 'DifferentStrategy', {
        order: filledOrder
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(handleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Lifecycle Management', () => {
    it('should publish STRATEGY_STARTED on start', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      // Call onStart
      (strategy as any).onStart();
      
      // Verify event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.STRATEGY_STARTED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName(),
          config: expect.any(Object)
        })
      );
    });

    it('should publish STRATEGY_STOPPED on stop', () => {
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      // Call onStop
      (strategy as any).onStop();
      
      // Verify event was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.STRATEGY_STOPPED,
        strategy.getName(),
        expect.objectContaining({
          strategyId: strategy.getName()
        })
      );
    });
  });

  describe('processBar Compatibility', () => {
    it('should maintain backward compatibility with processBar', async () => {
      // Initialize strategy
      (strategy as any).onInit();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Spy on publish
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      // Call processBar
      const result = await strategy.processBar(testBar, undefined, 0, [testBar]);
      
      // Verify BAR_RECEIVED was published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.BAR_RECEIVED,
        'BacktestEngine',
        expect.objectContaining({
          bar: testBar,
          barIndex: 0,
          allBars: [testBar]
        })
      );
      
      // Verify result structure
      expect(result).toHaveProperty('signal', null);
      expect(result).toHaveProperty('indicators');
      expect(result).toHaveProperty('filledOrders', []);
    });
  });
}); 