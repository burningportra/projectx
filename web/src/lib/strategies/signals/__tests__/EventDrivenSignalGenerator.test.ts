import { EventDrivenSignalGenerator } from '../EventDrivenSignalGenerator';
import { MessageBus, MessageType } from '@/lib/MessageBus';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';
import { BacktestBarData, UTCTimestamp } from '@/lib/types/backtester';

describe('EventDrivenSignalGenerator', () => {
  let generator: EventDrivenSignalGenerator;
  let messageBus: MessageBus;
  let trendIdentifier: TrendIdentifier;

  beforeEach(() => {
    messageBus = new MessageBus();
    
    trendIdentifier = {
      processBar: jest.fn(),
      getSignals: jest.fn().mockReturnValue([]),
      getSignalsForRange: jest.fn().mockResolvedValue([]),
      resetState: jest.fn(),
    } as any;

    generator = new EventDrivenSignalGenerator(messageBus, trendIdentifier);
  });

  afterEach(() => {
    generator.stop();
    messageBus.dispose();
  });

  describe('Lifecycle Management', () => {
    it('should start and stop correctly', () => {
      expect(generator.isRunning()).toBe(false);
      
      generator.start();
      expect(generator.isRunning()).toBe(true);
      
      generator.stop();
      expect(generator.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      generator.start();
      generator.start(); // Try to start again
      
      expect(consoleSpy).toHaveBeenCalledWith('[EventDrivenSignalGenerator] Already started');
      consoleSpy.mockRestore();
    });

    it('should not stop twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      generator.start();
      generator.stop();
      generator.stop(); // Try to stop again
      
      expect(consoleSpy).toHaveBeenCalledWith('[EventDrivenSignalGenerator] Already stopped');
      consoleSpy.mockRestore();
    });

    it('should subscribe to MARKET_UPDATE events on start', () => {
      const subscribeSpy = jest.spyOn(messageBus, 'subscribe');
      
      generator.start();
      
      expect(subscribeSpy).toHaveBeenCalledWith(
        MessageType.MARKET_UPDATE,
        expect.any(Function)
      );
    });

    it('should unsubscribe from events on stop', () => {
      generator.start();
      
      const unsubscribeSpy = jest.fn();
      (generator as any).subscriptions = [{ unsubscribe: unsubscribeSpy }];
      
      generator.stop();
      
      expect(unsubscribeSpy).toHaveBeenCalled();
      expect((generator as any).subscriptions).toHaveLength(0);
    });
  });

  describe('Market Update Processing', () => {
    it('should process market updates and generate signals', async () => {
      const testSignals = [
        {
          type: 'CUS' as const,
          barIndex: 0,
          price: 100,
          rule: 'TestRule',
          confidence: 0.8
        }
      ];
      
      jest.spyOn(trendIdentifier, 'getSignalsForRange').mockResolvedValue(testSignals);
      const publishSpy = jest.spyOn(messageBus, 'publish');
      
      generator.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Publish market update
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', {
        contractId: 'TEST',
        timeframe: '1h',
        bar: testBar,
        barIndex: 0,
        allBars: [testBar],
        strategyId: 'TestStrategy'
      });
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify signals were generated
      expect(trendIdentifier.getSignalsForRange).toHaveBeenCalledWith(
        [testBar],
        0,
        'TEST',
        '1h'
      );
      
      // Verify signals were published
      expect(publishSpy).toHaveBeenCalledWith(
        MessageType.SIGNAL_GENERATED,
        'EventDrivenSignalGenerator',
        expect.objectContaining({
          signal: testSignals[0],
          source: 'EventDrivenSignalGenerator',
          strategyId: 'TestStrategy',
          timestamp: expect.any(Number)
        })
      );
    });

    it('should not process the same bar twice', async () => {
      generator.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      const marketUpdate = {
        contractId: 'TEST',
        timeframe: '1h',
        bar: testBar,
        barIndex: 0,
        allBars: [testBar],
        strategyId: 'TestStrategy'
      };
      
      // Publish same market update twice
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', marketUpdate);
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', marketUpdate);
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Verify signal generation was only called once
      expect(trendIdentifier.getSignalsForRange).toHaveBeenCalledTimes(1);
    });

    it('should handle different contracts and timeframes separately', async () => {
      generator.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Publish updates for different contracts/timeframes
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', {
        contractId: 'TEST1',
        timeframe: '1h',
        bar: testBar,
        barIndex: 0,
        allBars: [testBar],
        strategyId: 'TestStrategy'
      });
      
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', {
        contractId: 'TEST2',
        timeframe: '1h',
        bar: testBar,
        barIndex: 0,
        allBars: [testBar],
        strategyId: 'TestStrategy'
      });
      
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', {
        contractId: 'TEST1',
        timeframe: '5m',
        bar: testBar,
        barIndex: 0,
        allBars: [testBar],
        strategyId: 'TestStrategy'
      });
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 30));
      
      // Verify all three were processed
      expect(trendIdentifier.getSignalsForRange).toHaveBeenCalledTimes(3);
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(trendIdentifier, 'getSignalsForRange').mockRejectedValue(new Error('Test error'));
      
      generator.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Publish market update that will cause error
      messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', {
        contractId: 'TEST',
        timeframe: '1h',
        bar: testBar,
        barIndex: 0,
        allBars: [testBar],
        strategyId: 'TestStrategy'
      });
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[EventDrivenSignalGenerator] Error generating signals:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cache Management', () => {
    it('should limit cache size', async () => {
      generator.start();
      
      const testBar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      // Generate more bars than cache limit
      for (let i = 0; i < 1100; i++) {
        messageBus.publish(MessageType.MARKET_UPDATE, 'TestStrategy', {
          contractId: 'TEST',
          timeframe: '1h',
          bar: testBar,
          barIndex: i,
          allBars: [testBar],
          strategyId: 'TestStrategy'
        });
      }
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = generator.getStats();
      expect(stats.totalProcessedBars).toBeLessThanOrEqual(1000);
    });

    it('should clear cache on stop', () => {
      generator.start();
      
      // Mark some bars as processed
      (generator as any).markBarAsProcessed('TEST-1h', 0);
      (generator as any).markBarAsProcessed('TEST-1h', 1);
      
      let stats = generator.getStats();
      expect(stats.totalProcessedBars).toBe(2);
      
      generator.stop();
      
      stats = generator.getStats();
      expect(stats.totalProcessedBars).toBe(0);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset cache and trend identifier', () => {
      generator.start();
      
      // Mark some bars as processed
      (generator as any).markBarAsProcessed('TEST-1h', 0);
      
      let stats = generator.getStats();
      expect(stats.totalProcessedBars).toBe(1);
      
      generator.reset();
      
      stats = generator.getStats();
      expect(stats.totalProcessedBars).toBe(0);
      expect(trendIdentifier.resetState).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      let stats = generator.getStats();
      expect(stats).toEqual({
        isActive: false,
        cachedContracts: 0,
        totalProcessedBars: 0
      });
      
      generator.start();
      
      // Mark some bars as processed
      (generator as any).markBarAsProcessed('TEST1-1h', 0);
      (generator as any).markBarAsProcessed('TEST1-1h', 1);
      (generator as any).markBarAsProcessed('TEST2-1h', 0);
      
      stats = generator.getStats();
      expect(stats).toEqual({
        isActive: true,
        cachedContracts: 2,
        totalProcessedBars: 3
      });
    });
  });
}); 