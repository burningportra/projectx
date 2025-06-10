import { 
  BacktestBarData, 
  SimulatedTrade, 
  Order,
  UTCTimestamp 
} from '@/lib/types/backtester';
import { TrendStartSignal as TrendLibSignal } from '@/lib/trend-analysis/TrendIdentifier';

// Strategy's internal representation of a trend signal it might act upon
interface StrategyTrendSignal extends TrendLibSignal {}

/**
 * Mutable state container for TrendStartStrategy
 * 
 * This class encapsulates all mutable state that changes during strategy execution.
 * It provides a clear separation from the immutable configuration and offers
 * methods to query and update state in a controlled manner.
 * 
 * Following NautilusTrader patterns:
 * - State is mutable but access is controlled through methods
 * - State changes are tracked for debugging and analysis
 * - Clear separation between different types of state
 */
export class TrendStartStrategyState {
  // Market Data State
  private _currentBar: BacktestBarData | null = null;
  private _lastProcessedBarTime: number | null = null;
  private _allBars: BacktestBarData[] = [];
  private _barCount: number = 0;

  // Signal Tracking State
  private _trackedTrendSignals: StrategyTrendSignal[] = [];
  private _lastSignalTime: UTCTimestamp = 0 as UTCTimestamp;
  private _lastSignalType: 'CUS' | 'CDS' | 'NONE' = 'NONE';
  private _lastSignalRule: string = 'N/A';
  private _signalCount: number = 0;

  // Position State
  private _currentTrendDirection: 'UP' | 'DOWN' | 'NONE' = 'NONE';
  private _openTrade: SimulatedTrade | null = null;
  private _isInPosition: boolean = false;
  private _positionEntryTime: UTCTimestamp | null = null;

  // Performance Tracking
  private _totalSignalsProcessed: number = 0;
  private _totalTradesOpened: number = 0;
  private _totalTradesClosed: number = 0;
  private _lastUpdateTime: number = Date.now();

  // Lifecycle
  private _isReady: boolean = false;

  // State Change Tracking
  private _stateVersion: number = 0;
  private _stateChangeHistory: StateChange[] = [];
  private readonly _maxHistorySize: number = 100;

  // Add tracking for errors, warnings, and events
  private errorCount: number = 0;
  private warningCount: number = 0;
  private eventCount: number = 0;
  private orderCount: number = 0;
  private startTime: number | null = null;
  private hasErrorsFlag: boolean = false;

  constructor() {
    this._recordStateChange('INITIALIZED', {});
  }

  // ========== Market Data State ==========

  /**
   * Update the current bar
   */
  public updateCurrentBar(bar: BacktestBarData): void {
    this._currentBar = bar;
    this._lastProcessedBarTime = bar.time;
    this._barCount++;
    this._lastUpdateTime = Date.now();
    this.eventCount++; // Increment event count
    this._recordStateChange('BAR_UPDATE', { bar });
  }

  /**
   * Get the current bar
   */
  public getCurrentBar(): BacktestBarData | null {
    return this._currentBar;
  }

  /**
   * Update the complete bar history
   */
  public updateAllBars(bars: BacktestBarData[]): void {
    this._allBars = bars;
    this._recordStateChange('BARS_HISTORY_UPDATED', {
      count: bars.length
    });
  }

  /**
   * Get all bars
   */
  public getAllBars(): ReadonlyArray<BacktestBarData> {
    return this._allBars;
  }

  /**
   * Get the last processed bar time
   */
  public getLastProcessedBarTime(): number | null {
    return this._lastProcessedBarTime;
  }

  // ========== Signal State ==========

  /**
   * Track a signal
   */
  public trackSignal(signal: StrategyTrendSignal): boolean {
    // Check if we've already processed this signal
    const signalKey = `${signal.barIndex}-${signal.type}-${signal.rule}`;
    if (this._trackedTrendSignals.some(s => `${s.barIndex}-${s.type}-${s.rule}` === signalKey)) {
      return false;
    }
    
    this._trackedTrendSignals.push(signal);
    this._trackedTrendSignals.sort((a, b) => a.barIndex - b.barIndex);
    this._signalCount++;
    this._totalSignalsProcessed++;
    this._lastSignalTime = this._allBars[signal.barIndex]?.time || (0 as UTCTimestamp);
    this._lastSignalType = signal.type;
    this._lastSignalRule = signal.rule || 'N/A';
    this._currentTrendDirection = signal.type === 'CUS' ? 'UP' : 'DOWN';
    this._lastUpdateTime = Date.now();
    this.eventCount++; // Increment event count
    this._recordStateChange('SIGNAL_TRACKED', { signal });
    
    return true;
  }

  /**
   * Get all tracked signals
   */
  public getTrackedSignals(): ReadonlyArray<StrategyTrendSignal> {
    return [...this._trackedTrendSignals];
  }

  /**
   * Get signal state indicators
   */
  public getSignalIndicators(): {
    trendDirection: 'UP' | 'DOWN' | 'NONE';
    lastSignalTime: UTCTimestamp;
    lastSignalType: 'CUS' | 'CDS' | 'NONE';
    lastSignalRule: string;
    signalCount: number;
  } {
    return {
      trendDirection: this._currentTrendDirection,
      lastSignalTime: this._lastSignalTime,
      lastSignalType: this._lastSignalType,
      lastSignalRule: this._lastSignalRule,
      signalCount: this._signalCount
    };
  }

  // ========== Position State ==========

  /**
   * Set the open trade
   */
  public setOpenTrade(trade: SimulatedTrade | null): void {
    const wasInPosition = this._isInPosition;
    this._openTrade = trade;
    this._isInPosition = !!trade;
    
    if (trade && !wasInPosition) {
      this._totalTradesOpened++;
      this._positionEntryTime = trade.entryTime;
      this.orderCount++; // Increment order count
    } else if (!trade && wasInPosition) {
      this._totalTradesClosed++;
      this._positionEntryTime = null;
    }
    
    this._lastUpdateTime = Date.now();
    this._recordStateChange('TRADE_UPDATE', { trade });
  }

  /**
   * Get the current open trade
   */
  public getOpenTrade(): SimulatedTrade | null {
    return this._openTrade;
  }

  /**
   * Check if currently in a position
   */
  public isInPosition(): boolean {
    return this._isInPosition;
  }

  /**
   * Get position entry time
   */
  public getPositionEntryTime(): UTCTimestamp | null {
    return this._positionEntryTime;
  }

  // ========== Lifecycle State ==========
  
  /**
   * Marks the state as ready to process signals and trades.
   */
  public setReady(): void {
    this._isReady = true;
  }
  
  /**
   * Checks if the state is ready.
   */
  public isReady(): boolean {
    return this._isReady;
  }

  // ========== Performance Metrics ==========

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): {
    totalPnL: number;
    winRate: number;
    totalTrades: number;
  } {
    // This would need to be calculated from actual trade history
    // For now, return placeholder values
    return {
      totalPnL: 0,
      winRate: 0,
      totalTrades: this._totalTradesClosed
    };
  }

  // ========== State Management ==========

  /**
   * Reset all state to initial values
   */
  public reset(): void {
    console.log(`[TrendStartStrategyState] RESETTING STATE. Current openTrade: ${this._openTrade?.id}, isInPosition: ${this._isInPosition}`);
    
    // Market data state
    this._currentBar = null;
    this._lastProcessedBarTime = null;
    this._allBars = [];
    this._barCount = 0;
    
    // Signal state
    this._trackedTrendSignals = [];
    this._lastSignalTime = 0 as UTCTimestamp;
    this._lastSignalType = 'NONE';
    this._lastSignalRule = 'N/A';
    this._signalCount = 0;
    this._currentTrendDirection = 'NONE';
    
    // Position state
    this._openTrade = null;
    this._isInPosition = false;
    this._positionEntryTime = null;

    // Lifecycle
    this._isReady = false;
    
    // Performance state
    this._totalSignalsProcessed = 0;
    this._totalTradesOpened = 0;
    this._totalTradesClosed = 0;
    
    // State tracking
    this._stateVersion = 0;
    this._stateChangeHistory = [];
    this._lastUpdateTime = Date.now();
    
    // Reset counters
    this.errorCount = 0;
    this.warningCount = 0;
    this.eventCount = 0;
    this.orderCount = 0;
    this.hasErrorsFlag = false;
    // Don't reset startTime on reset
    
    this._recordStateChange('RESET', {});
    console.log(`[TrendStartStrategyState] STATE RESET COMPLETE. isInPosition is now: ${this._isInPosition}`);
  }

  /**
   * Get a snapshot of the current state
   */
  public getSnapshot(): TrendStartStrategyStateSnapshot {
    const lastUpdateTime = this._lastProcessedBarTime;
    
    return {
      version: this._stateVersion,
      timestamp: this._lastUpdateTime,
      marketData: {
        currentBar: this._currentBar,
        lastProcessedBarTime: this._lastProcessedBarTime,
        barCount: this._barCount,
        lastUpdateTime
      },
      signals: {
        trackedSignals: [...this._trackedTrendSignals],
        lastSignalTime: this._lastSignalTime,
        lastSignalType: this._lastSignalType,
        lastSignalRule: this._lastSignalRule,
        signalCount: this._signalCount,
        currentTrendDirection: this._currentTrendDirection
      },
      position: {
        openTrade: this._openTrade,
        isInPosition: this._isInPosition,
        positionEntryTime: this._positionEntryTime,
        tradeCount: this._totalTradesClosed
      },
      performance: {
        totalSignalsProcessed: this._totalSignalsProcessed,
        totalTradesOpened: this._totalTradesOpened,
        totalTradesClosed: this._totalTradesClosed,
        barsProcessed: this._barCount,
        currentStateVersion: this._stateVersion,
        totalPnL: 0, // Would need to calculate from trades
        winRate: 0, // Would need to calculate from trades
        totalTrades: this._totalTradesClosed
      }
    };
  }

  /**
   * Get state change history
   */
  public getStateChangeHistory(): ReadonlyArray<StateChange> {
    return [...this._stateChangeHistory];
  }

  /**
   * Get the start time
   */
  public getStartTime(): number | null {
    return this.startTime;
  }

  /**
   * Set the start time
   */
  public setStartTime(time: number): void {
    this.startTime = time;
  }

  /**
   * Check if there are errors
   */
  public hasErrors(): boolean {
    return this.hasErrorsFlag;
  }

  /**
   * Get error count
   */
  public getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Increment error count
   */
  public incrementErrorCount(): void {
    this.errorCount++;
    this.hasErrorsFlag = true;
  }

  /**
   * Get warning count
   */
  public getWarningCount(): number {
    return this.warningCount;
  }

  /**
   * Increment warning count
   */
  public incrementWarningCount(): void {
    this.warningCount++;
  }

  /**
   * Get event count
   */
  public getEventCount(): number {
    return this.eventCount;
  }

  /**
   * Get order count
   */
  public getOrderCount(): number {
    return this.orderCount;
  }

  /**
   * Increment order count
   */
  public incrementOrderCount(): void {
    this.orderCount++;
  }

  // ========== Private Methods ==========

  /**
   * Record a state change for debugging and analysis
   */
  private _recordStateChange(type: StateChangeType, details: Record<string, any>): void {
    this._stateVersion++;
    this._lastUpdateTime = Date.now();
    
    const change: StateChange = {
      version: this._stateVersion,
      timestamp: this._lastUpdateTime,
      type,
      details
    };
    
    this._stateChangeHistory.push(change);
    
    // Limit history size
    if (this._stateChangeHistory.length > this._maxHistorySize) {
      this._stateChangeHistory.shift();
    }
  }
}

// ========== Type Definitions ==========

/**
 * Types of state changes that can occur
 */
type StateChangeType = 
  | 'INITIALIZED'
  | 'RESET'
  | 'BAR_UPDATE'
  | 'BARS_HISTORY_UPDATED'
  | 'SIGNAL_TRACKED'
  | 'TRADE_UPDATE'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED';

/**
 * Record of a state change
 */
interface StateChange {
  version: number;
  timestamp: number;
  type: StateChangeType;
  details: Record<string, any>;
}

/**
 * Complete snapshot of strategy state
 */
export interface TrendStartStrategyStateSnapshot {
  version: number;
  timestamp: number;
  marketData: {
    currentBar: BacktestBarData | null;
    lastProcessedBarTime: number | null;
    barCount: number;
    lastUpdateTime: number | null;
  };
  signals: {
    trackedSignals: StrategyTrendSignal[];
    lastSignalTime: UTCTimestamp;
    lastSignalType: 'CUS' | 'CDS' | 'NONE';
    lastSignalRule: string;
    signalCount: number;
    currentTrendDirection: 'UP' | 'DOWN' | 'NONE';
  };
  position: {
    openTrade: SimulatedTrade | null;
    isInPosition: boolean;
    positionEntryTime: UTCTimestamp | null;
    tradeCount: number;
  };
  performance: {
    totalSignalsProcessed: number;
    totalTradesOpened: number;
    totalTradesClosed: number;
    barsProcessed: number;
    currentStateVersion: number;
    totalPnL: number;
    winRate: number;
    totalTrades: number;
  };
} 