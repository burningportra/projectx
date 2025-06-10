import { TrendStartStrategyState, TrendStartStrategyStateSnapshot } from '../TrendStartStrategyState';
import { 
  BacktestBarData, 
  SimulatedTrade, 
  TradeType,
  UTCTimestamp 
} from '@/lib/types/backtester';
import { TrendStartSignal as TrendLibSignal } from '@/lib/trend-analysis/TrendIdentifier';

describe('TrendStartStrategyState', () => {
  let state: TrendStartStrategyState;
  
  beforeEach(() => {
    state = new TrendStartStrategyState();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(state.getCurrentBar()).toBeNull();
      expect(state.getLastProcessedBarTime()).toBeNull();
      expect(state.getAllBars()).toHaveLength(0);
      expect(state.getTrackedSignals()).toHaveLength(0);
      expect(state.getOpenTrade()).toBeNull();
      expect(state.isInPosition()).toBe(false);
      
      const indicators = state.getSignalIndicators();
      expect(indicators.trendDirection).toBe('NONE');
      expect(indicators.lastSignalType).toBe('NONE');
      expect(indicators.lastSignalRule).toBe('N/A');
      expect(indicators.signalCount).toBe(0);
      
      const metrics = state.getPerformanceMetrics();
      expect(metrics.totalSignalsProcessed).toBe(0);
      expect(metrics.totalTradesOpened).toBe(0);
      expect(metrics.totalTradesClosed).toBe(0);
      expect(metrics.barsProcessed).toBe(0);
      expect(metrics.currentStateVersion).toBe(1); // Initialized
    });

    it('should record initialization in state history', () => {
      const history = state.getStateChangeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('INITIALIZED');
    });
  });

  describe('Market Data State', () => {
    it('should update current bar', () => {
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      state.updateCurrentBar(bar);
      
      expect(state.getCurrentBar()).toEqual(bar);
      expect(state.getLastProcessedBarTime()).toBe(1000);
      
      const metrics = state.getPerformanceMetrics();
      expect(metrics.barsProcessed).toBe(1);
    });

    it('should track bar updates in history', () => {
      const bar1: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      const bar2: BacktestBarData = {
        time: 2000 as UTCTimestamp,
        open: 102,
        high: 107,
        low: 101,
        close: 106
      };
      
      state.updateCurrentBar(bar1);
      state.updateCurrentBar(bar2);
      
      const history = state.getStateChangeHistory();
      const barUpdates = history.filter(h => h.type === 'BAR_UPDATED');
      expect(barUpdates).toHaveLength(2);
      expect(barUpdates[1].details.previousTime).toBe(1000);
      expect(barUpdates[1].details.newTime).toBe(2000);
      expect(barUpdates[1].details.barCount).toBe(2);
    });

    it('should update all bars history', () => {
      const bars: BacktestBarData[] = [
        { time: 1000 as UTCTimestamp, open: 100, high: 105, low: 95, close: 102 },
        { time: 2000 as UTCTimestamp, open: 102, high: 107, low: 101, close: 106 }
      ];
      
      state.updateAllBars(bars);
      
      expect(state.getAllBars()).toEqual(bars);
      
      const history = state.getStateChangeHistory();
      const update = history.find(h => h.type === 'BARS_HISTORY_UPDATED');
      expect(update).toBeDefined();
      expect(update?.details.count).toBe(2);
    });
  });

  describe('Signal State', () => {
    beforeEach(() => {
      // Set up bars for signal tracking
      const bars: BacktestBarData[] = [
        { time: 1000 as UTCTimestamp, open: 100, high: 105, low: 95, close: 102 },
        { time: 2000 as UTCTimestamp, open: 102, high: 107, low: 101, close: 106 }
      ];
      state.updateAllBars(bars);
    });

    it('should track new signals', () => {
      const signal: TrendLibSignal = {
        type: 'CUS',
        barIndex: 0,
        confidence: 0.8,
        rule: 'Rule1',
        price: 102
      };
      
      const tracked = state.trackSignal(signal);
      
      expect(tracked).toBe(true);
      expect(state.getTrackedSignals()).toHaveLength(1);
      expect(state.getTrackedSignals()[0]).toEqual(signal);
      
      const indicators = state.getSignalIndicators();
      expect(indicators.trendDirection).toBe('UP');
      expect(indicators.lastSignalType).toBe('CUS');
      expect(indicators.lastSignalRule).toBe('Rule1');
      expect(indicators.signalCount).toBe(1);
      expect(indicators.lastSignalTime).toBe(1000);
    });

    it('should not track duplicate signals', () => {
      const signal: TrendLibSignal = {
        type: 'CUS',
        barIndex: 0,
        confidence: 0.8,
        rule: 'Rule1',
        price: 102
      };
      
      state.trackSignal(signal);
      const tracked = state.trackSignal(signal); // Try to track same signal
      
      expect(tracked).toBe(false);
      expect(state.getTrackedSignals()).toHaveLength(1);
      expect(state.getSignalIndicators().signalCount).toBe(1);
    });

    it('should sort signals by bar index', () => {
      const signal1: TrendLibSignal = {
        type: 'CUS',
        barIndex: 1,
        confidence: 0.8,
        rule: 'Rule1',
        price: 106
      };
      
      const signal2: TrendLibSignal = {
        type: 'CDS',
        barIndex: 0,
        confidence: 0.7,
        rule: 'Rule2',
        price: 102
      };
      
      state.trackSignal(signal1);
      state.trackSignal(signal2);
      
      const signals = state.getTrackedSignals();
      expect(signals[0].barIndex).toBe(0);
      expect(signals[1].barIndex).toBe(1);
    });

    it('should update trend direction based on signal type', () => {
      const cusSignal: TrendLibSignal = {
        type: 'CUS',
        barIndex: 0,
        confidence: 0.8,
        rule: 'Rule1',
        price: 102
      };
      
      state.trackSignal(cusSignal);
      expect(state.getSignalIndicators().trendDirection).toBe('UP');
      
      const cdsSignal: TrendLibSignal = {
        type: 'CDS',
        barIndex: 1,
        confidence: 0.7,
        rule: 'Rule2',
        price: 106
      };
      
      state.trackSignal(cdsSignal);
      expect(state.getSignalIndicators().trendDirection).toBe('DOWN');
    });
  });

  describe('Position State', () => {
    it('should track position opening', () => {
      const trade: SimulatedTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        status: 'OPEN'
      };
      
      state.setOpenTrade(trade);
      
      expect(state.getOpenTrade()).toEqual(trade);
      expect(state.isInPosition()).toBe(true);
      expect(state.getPositionEntryTime()).toBe(1000);
      
      const metrics = state.getPerformanceMetrics();
      expect(metrics.totalTradesOpened).toBe(1);
      expect(metrics.totalTradesClosed).toBe(0);
    });

    it('should track position closing', () => {
      const trade: SimulatedTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        status: 'OPEN'
      };
      
      state.setOpenTrade(trade);
      state.setOpenTrade(null);
      
      expect(state.getOpenTrade()).toBeNull();
      expect(state.isInPosition()).toBe(false);
      expect(state.getPositionEntryTime()).toBeNull();
      
      const metrics = state.getPerformanceMetrics();
      expect(metrics.totalTradesOpened).toBe(1);
      expect(metrics.totalTradesClosed).toBe(1);
    });

    it('should record position changes in history', () => {
      const trade: SimulatedTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        status: 'OPEN'
      };
      
      state.setOpenTrade(trade);
      state.setOpenTrade(null);
      
      const history = state.getStateChangeHistory();
      const openEvent = history.find(h => h.type === 'POSITION_OPENED');
      const closeEvent = history.find(h => h.type === 'POSITION_CLOSED');
      
      expect(openEvent).toBeDefined();
      expect(openEvent?.details.tradeId).toBe('trade1');
      expect(openEvent?.details.type).toBe(TradeType.BUY);
      
      expect(closeEvent).toBeDefined();
      expect(closeEvent?.details.totalTradesOpened).toBe(1);
      expect(closeEvent?.details.totalTradesClosed).toBe(1);
    });
  });

  describe('State Management', () => {
    it('should reset all state', () => {
      // Set up some state
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      const signal: TrendLibSignal = {
        type: 'CUS',
        barIndex: 0,
        confidence: 0.8,
        rule: 'Rule1',
        price: 102
      };
      
      const trade: SimulatedTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        status: 'OPEN'
      };
      
      state.updateCurrentBar(bar);
      state.updateAllBars([bar]);
      state.trackSignal(signal);
      state.setOpenTrade(trade);
      
      // Reset
      state.reset();
      
      // Verify everything is reset
      expect(state.getCurrentBar()).toBeNull();
      expect(state.getAllBars()).toHaveLength(0);
      expect(state.getTrackedSignals()).toHaveLength(0);
      expect(state.getOpenTrade()).toBeNull();
      expect(state.isInPosition()).toBe(false);
      
      const indicators = state.getSignalIndicators();
      expect(indicators.trendDirection).toBe('NONE');
      expect(indicators.signalCount).toBe(0);
      
      const metrics = state.getPerformanceMetrics();
      expect(metrics.totalSignalsProcessed).toBe(0);
      expect(metrics.totalTradesOpened).toBe(0);
      expect(metrics.barsProcessed).toBe(0);
      expect(metrics.currentStateVersion).toBe(1); // Reset event
      
      // Check history was cleared
      const history = state.getStateChangeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('RESET');
    });

    it('should provide complete state snapshot', () => {
      // Set up state
      const bar: BacktestBarData = {
        time: 1000 as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      };
      
      const signal: TrendLibSignal = {
        type: 'CUS',
        barIndex: 0,
        confidence: 0.8,
        rule: 'Rule1',
        price: 102
      };
      
      state.updateAllBars([bar]);
      state.updateCurrentBar(bar);
      state.trackSignal(signal);
      
      const snapshot = state.getSnapshot();
      
      expect(snapshot.version).toBeGreaterThan(0);
      expect(snapshot.timestamp).toBeGreaterThan(0);
      
      expect(snapshot.marketData.currentBar).toEqual(bar);
      expect(snapshot.marketData.barCount).toBe(1);
      
      expect(snapshot.signals.trackedSignals).toHaveLength(1);
      expect(snapshot.signals.currentTrendDirection).toBe('UP');
      expect(snapshot.signals.signalCount).toBe(1);
      
      expect(snapshot.position.isInPosition).toBe(false);
      
      expect(snapshot.performance.totalSignalsProcessed).toBe(1);
      expect(snapshot.marketData.barCount).toBe(1);
    });

    it('should limit state change history size', () => {
      // Generate more than maxHistorySize changes
      for (let i = 0; i < 150; i++) {
        const bar: BacktestBarData = {
          time: (i * 1000) as UTCTimestamp,
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 102 + i
        };
        state.updateCurrentBar(bar);
      }
      
      const history = state.getStateChangeHistory();
      expect(history.length).toBeLessThanOrEqual(100); // maxHistorySize
      
      // Verify oldest entries were removed
      const oldestEntry = history[0];
      expect(oldestEntry.details.barCount).toBeGreaterThan(50);
    });
  });

  describe('Performance Metrics', () => {
    it('should track cumulative performance metrics', () => {
      // Process multiple bars
      for (let i = 0; i < 5; i++) {
        const bar: BacktestBarData = {
          time: (i * 1000) as UTCTimestamp,
          open: 100,
          high: 105,
          low: 95,
          close: 102
        };
        state.updateCurrentBar(bar);
      }
      
      // Track signals
      state.updateAllBars(Array(5).fill(null).map((_, i) => ({
        time: (i * 1000) as UTCTimestamp,
        open: 100,
        high: 105,
        low: 95,
        close: 102
      })));
      
      state.trackSignal({ type: 'CUS', barIndex: 0, confidence: 0.8, price: 102 });
      state.trackSignal({ type: 'CDS', barIndex: 1, confidence: 0.7, price: 106 });
      
      // Open and close trades
      const trade1: SimulatedTrade = {
        id: 'trade1',
        type: TradeType.BUY,
        size: 1,
        entryPrice: 100,
        entryTime: 1000 as UTCTimestamp,
        status: 'OPEN'
      };
      
      state.setOpenTrade(trade1);
      state.setOpenTrade(null);
      
      const metrics = state.getPerformanceMetrics();
      expect(metrics.barsProcessed).toBe(5);
      expect(metrics.totalSignalsProcessed).toBe(2);
      expect(metrics.totalTradesOpened).toBe(1);
      expect(metrics.totalTradesClosed).toBe(1);
      expect(metrics.currentStateVersion).toBeGreaterThan(5);
    });
  });
}); 