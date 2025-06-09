import { messageBus, MessageType, Message } from '../MessageBus';
import { OrderManager } from '../OrderManager';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { 
  BacktestBarData, 
  SubBarData, 
  StrategySignal, 
  StrategySignalType,
  UTCTimestamp,
  OrderSide 
} from '../types/backtester';
import { StrategyResult, BaseStrategyConfig } from '../types/strategy';

// Create a concrete test strategy
class TestStrategy extends BaseStrategy {
  getName(): string {
    return 'TestStrategy';
  }

  getDescription(): string {
    return 'A test strategy for MessageBus integration';
  }

  getVersion(): string {
    return '1.0.0';
  }

  processBar(
    mainBar: BacktestBarData,
    subBars: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): StrategyResult {
    // Simple test logic - generate a signal on every bar
    const signal: StrategySignal = {
      type: barIndex % 2 === 0 ? StrategySignalType.BUY : StrategySignalType.SELL,
      barIndex,
      time: mainBar.time,
      price: mainBar.close
    };
    
    this.recordSignal(signal);
    
    return {
      signal: signal,
      filledOrders: [],
      indicators: { testIndicator: mainBar.close }
    };
  }
}

describe('BaseStrategy MessageBus Integration', () => {
  let strategy: TestStrategy;
  let orderManager: OrderManager;
  let receivedMessages: { [key: string]: Message[] };

  beforeEach(() => {
    orderManager = new OrderManager(0.25);
    strategy = new TestStrategy(orderManager, {
      commission: 2.5,
      positionSize: 100
    });
    
    receivedMessages = {};
    
    // Subscribe to all relevant message types
    const messageTypes = [
      MessageType.SIGNAL_GENERATED,
      MessageType.STRATEGY_STARTED,
      MessageType.STRATEGY_STOPPED
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
    strategy.reset();
  });

  describe('Strategy Lifecycle Events', () => {
    it('should publish STRATEGY_STARTED and STRATEGY_STOPPED events on reset', () => {
      // Reset triggers both stopped and started events
      strategy.reset();

      expect(receivedMessages[MessageType.STRATEGY_STOPPED]).toHaveLength(1);
      expect(receivedMessages[MessageType.STRATEGY_STARTED]).toHaveLength(1);

      const stoppedMessage = receivedMessages[MessageType.STRATEGY_STOPPED][0];
      expect(stoppedMessage.source).toBe('Strategy-TestStrategy');
      expect(stoppedMessage.data.strategyName).toBe('TestStrategy');

      const startedMessage = receivedMessages[MessageType.STRATEGY_STARTED][0];
      expect(startedMessage.source).toBe('Strategy-TestStrategy');
      expect(startedMessage.data.strategyName).toBe('TestStrategy');
      expect(startedMessage.data.config).toBeDefined();
      expect(startedMessage.data.config.positionSize).toBe(100);
    });
  });

  describe('Signal Generation Events', () => {
    it('should publish SIGNAL_GENERATED event when recording a signal', () => {
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      // Process bar will generate and record a signal
      strategy.processBar(bar, undefined, 0, [bar]);

      expect(receivedMessages[MessageType.SIGNAL_GENERATED]).toHaveLength(1);
      
      const message = receivedMessages[MessageType.SIGNAL_GENERATED][0];
      expect(message.source).toBe('Strategy-TestStrategy');
      expect(message.data.strategyName).toBe('TestStrategy');
      expect(message.data.signal).toBeDefined();
      expect(message.data.signal.type).toBe(StrategySignalType.BUY); // Even bar index
      expect(message.data.signal.price).toBe(102);
    });

    it('should publish multiple SIGNAL_GENERATED events for multiple signals', () => {
      const bars: BacktestBarData[] = [
        { time: 1000 as UTCTimestamp, open: 100, high: 105, low: 95, close: 102 },
        { time: 2000 as UTCTimestamp, open: 102, high: 108, low: 101, close: 106 },
        { time: 3000 as UTCTimestamp, open: 106, high: 110, low: 104, close: 108 }
      ];

      // Process multiple bars
      bars.forEach((bar, index) => {
        strategy.processBar(bar, undefined, index, bars);
      });

      expect(receivedMessages[MessageType.SIGNAL_GENERATED]).toHaveLength(3);
      
      // Verify signal types alternate between BUY and SELL
      expect(receivedMessages[MessageType.SIGNAL_GENERATED][0].data.signal.type).toBe(StrategySignalType.BUY);
      expect(receivedMessages[MessageType.SIGNAL_GENERATED][1].data.signal.type).toBe(StrategySignalType.SELL);
      expect(receivedMessages[MessageType.SIGNAL_GENERATED][2].data.signal.type).toBe(StrategySignalType.BUY);
    });
  });

  describe('Integration with OrderManager Events', () => {
    it('should work alongside OrderManager events', () => {
      // Subscribe to OrderManager events too
      receivedMessages[MessageType.ORDER_SUBMITTED] = [];
      messageBus.subscribe(MessageType.ORDER_SUBMITTED, (message: Message) => {
        receivedMessages[MessageType.ORDER_SUBMITTED].push(message);
      });

      // Create a strategy that submits orders
      class TradingTestStrategy extends TestStrategy {
        processBar(
          mainBar: BacktestBarData,
          subBars: SubBarData[] | undefined,
          barIndex: number,
          allMainBars: BacktestBarData[]
        ): StrategyResult {
          // Generate signal
          const result = super.processBar(mainBar, subBars, barIndex, allMainBars);
          
          // Submit an order
          this.createMarketOrder(
            barIndex % 2 === 0 ? OrderSide.BUY : OrderSide.SELL,
            100,
            mainBar
          );
          
          return result;
        }
      }

      const tradingStrategy = new TradingTestStrategy(orderManager);
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };

      tradingStrategy.processBar(bar, undefined, 0, [bar]);

      // Should have both strategy signal and order submission events
      expect(receivedMessages[MessageType.SIGNAL_GENERATED]).toHaveLength(1);
      expect(receivedMessages[MessageType.ORDER_SUBMITTED]).toHaveLength(1);
      
      // Verify they come from different sources
      expect(receivedMessages[MessageType.SIGNAL_GENERATED][0].source).toBe('Strategy-TestStrategy');
      expect(receivedMessages[MessageType.ORDER_SUBMITTED][0].source).toBe('OrderManager');
    });
  });

  describe('Event Timing and Order', () => {
    it('should publish events in the correct order during strategy lifecycle', () => {
      const allMessages: Message[] = [];
      
      // Subscribe to wildcard to capture all events
      messageBus.subscribe('*', (message: Message) => {
        allMessages.push(message);
      });

      // Reset strategy (triggers stopped then started)
      strategy.reset();
      
      // Process a bar (triggers signal)
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      strategy.processBar(bar, undefined, 0, [bar]);

      // Verify event order
      expect(allMessages.length).toBeGreaterThanOrEqual(3);
      expect(allMessages[0].type).toBe(MessageType.STRATEGY_STOPPED);
      expect(allMessages[1].type).toBe(MessageType.STRATEGY_STARTED);
      expect(allMessages[2].type).toBe(MessageType.SIGNAL_GENERATED);
    });
  });
}); 