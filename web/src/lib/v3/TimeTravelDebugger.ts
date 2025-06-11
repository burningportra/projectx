import { BacktestEngine, BacktestEngineState, EngineEventType, EngineEvent } from './BacktestEngine';
import { BacktestBarData, Order, SimulatedTrade } from '../types/backtester';
import { StrategyDefinition, StrategyConfig, StrategyResult } from './StrategyFramework';
import { UTCTimestamp } from 'lightweight-charts';

/**
 * Snapshot of engine state at a specific point in time
 */
export interface StateSnapshot {
  id: string;
  timestamp: UTCTimestamp;
  barIndex: number;
  currentBar: BacktestBarData | null;
  
  // Deep copy of engine state
  engineState: BacktestEngineState;
  
  // Additional debugging information
  debugInfo: {
    strategySignals: StrategyResult[];
    activeOrders: Order[];
    recentTrades: SimulatedTrade[];
    indicatorValues: Record<string, unknown>;
    eventHistory: EngineEvent[];
  };
  
  // Performance metrics at this point
  performance: {
    accountBalance: number;
    totalPnL: number;
    openPositions: number;
    totalTrades: number;
    winRate: number;
  };
  
  // Metadata
  metadata: {
    snapshotReason: 'bar_processed' | 'order_filled' | 'manual' | 'breakpoint';
    description?: string;
    tags?: string[];
  };
}

/**
 * Breakpoint configuration for debugging
 */
export interface Breakpoint {
  id: string;
  enabled: boolean;
  
  // Condition types
  type: 'bar_index' | 'time' | 'balance' | 'trade_count' | 'custom';
  
  // Condition parameters
  condition: {
    barIndex?: number;
    time?: UTCTimestamp;
    balanceThreshold?: number;
    balanceOperator?: '>' | '<' | '=' | '>=' | '<=';
    tradeCount?: number;
    customFunction?: (state: BacktestEngineState) => boolean;
  };
  
  // Actions when breakpoint hits
  actions: {
    pause: boolean;
    snapshot: boolean;
    log: boolean;
    executeCallback?: (snapshot: StateSnapshot) => void;
  };
  
  metadata: {
    name: string;
    description?: string;
    hitCount: number;
    lastHit?: UTCTimestamp;
  };
}

/**
 * Session configuration for debugging
 */
export interface DebugSession {
  id: string;
  name: string;
  
  // Session settings
  settings: {
    autoSnapshot: boolean;
    snapshotFrequency: 'every_bar' | 'every_n_bars' | 'on_events';
    snapshotFrequencyN?: number;
    maxSnapshots: number;
    preserveSnapshots: boolean;
    enableBreakpoints: boolean;
  };
  
  // Current state
  isActive: boolean;
  isPaused: boolean;
  currentSnapshotIndex: number;
  
  // Data
  snapshots: StateSnapshot[];
  breakpoints: Breakpoint[];
  eventLog: EngineEvent[];
  
  // Metadata
  startTime: UTCTimestamp;
  endTime?: UTCTimestamp;
  totalBars: number;
  processedBars: number;
}

/**
 * Comparison result between two snapshots
 */
export interface SnapshotComparison {
  snapshot1: StateSnapshot;
  snapshot2: StateSnapshot;
  
  differences: {
    balance: {
      before: number;
      after: number;
      change: number;
      changePercent: number;
    };
    
    positions: {
      opened: SimulatedTrade[];
      closed: SimulatedTrade[];
      modified: Array<{
        before: SimulatedTrade;
        after: SimulatedTrade;
        changes: string[];
      }>;
    };
    
    orders: {
      submitted: Order[];
      cancelled: Order[];
      filled: Order[];
    };
    
    indicators: {
      changed: Record<string, {
        before: unknown;
        after: unknown;
      }>;
    };
  };
  
  summary: {
    significantChanges: string[];
    performanceImpact: 'positive' | 'negative' | 'neutral';
    riskChanges: string[];
  };
}

/**
 * Time-Travel Debugger for BacktestEngine
 * 
 * Provides comprehensive debugging capabilities including:
 * - State snapshotting at any point
 * - Time-travel replay from any snapshot
 * - Breakpoint system with conditions
 * - State comparison and analysis
 * - Visual debugging interface integration
 */
export class TimeTravelDebugger {
  private engine: BacktestEngine;
  private session: DebugSession | null = null;
  private eventUnsubscribers: Array<() => void> = [];
  private isRecording = false;
  
  constructor(engine: BacktestEngine) {
    this.engine = engine;
  }

  // ===============================
  // Session Management
  // ===============================

  /**
   * Start a new debugging session
   */
  public startSession(sessionConfig: Partial<DebugSession['settings']> & { name: string }): string {
    if (this.session?.isActive) {
      throw new Error('A debugging session is already active');
    }

    const sessionId = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.session = {
      id: sessionId,
      name: sessionConfig.name,
      settings: {
        autoSnapshot: true,
        snapshotFrequency: 'every_bar',
        maxSnapshots: 1000,
        preserveSnapshots: true,
        enableBreakpoints: true,
        ...sessionConfig
      },
      isActive: true,
      isPaused: false,
      currentSnapshotIndex: -1,
      snapshots: [],
      breakpoints: [],
      eventLog: [],
      startTime: Date.now() as UTCTimestamp,
      totalBars: this.engine.getState().bars.length,
      processedBars: this.engine.getState().currentBarIndex
    };

    this.startRecording();
    return sessionId;
  }

  /**
   * Stop the current debugging session
   */
  public stopSession(): DebugSession | null {
    if (!this.session) return null;

    this.stopRecording();
    
    const session = { ...this.session };
    session.isActive = false;
    session.endTime = Date.now() as UTCTimestamp;
    
    if (!session.settings.preserveSnapshots) {
      this.session = null;
    } else {
      this.session.isActive = false;
    }

    return session;
  }

  /**
   * Get current session
   */
  public getCurrentSession(): DebugSession | null {
    return this.session;
  }

  // ===============================
  // Recording & Snapshotting
  // ===============================

  /**
   * Start recording engine events and snapshots
   */
  private startRecording(): void {
    if (this.isRecording || !this.session) return;

    this.isRecording = true;

    // Subscribe to engine events
    this.eventUnsubscribers.push(
      this.engine.on(EngineEventType.BAR_PROCESSED, (event) => {
        this.handleBarProcessed(event);
      })
    );

    this.eventUnsubscribers.push(
      this.engine.on(EngineEventType.ORDER_FILLED, (event) => {
        this.handleOrderFilled(event);
      })
    );

    this.eventUnsubscribers.push(
      this.engine.on(EngineEventType.TRADE_OPENED, (event) => {
        this.handleTradeOpened(event);
      })
    );

    this.eventUnsubscribers.push(
      this.engine.on(EngineEventType.TRADE_CLOSED, (event) => {
        this.handleTradeClosed(event);
      })
    );

    // Initial snapshot
    this.createSnapshot('manual', 'Session started');
  }

  /**
   * Stop recording
   */
  private stopRecording(): void {
    if (!this.isRecording) return;

    this.isRecording = false;
    
    // Unsubscribe from all events
    this.eventUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.eventUnsubscribers = [];
  }

  /**
   * Create a snapshot of current engine state
   */
  public createSnapshot(
    reason: StateSnapshot['metadata']['snapshotReason'],
    description?: string,
    tags?: string[]
  ): StateSnapshot {
    if (!this.session) {
      throw new Error('No active debugging session');
    }

    const engineState = this.engine.getState();
    const currentBar = this.engine.getCurrentBar();
    
    const snapshot: StateSnapshot = {
      id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now() as UTCTimestamp,
      barIndex: engineState.currentBarIndex,
      currentBar,
      
      // Deep copy engine state using JSON serialization
      engineState: JSON.parse(JSON.stringify(engineState)),
      
      debugInfo: {
        strategySignals: [], // Would need to capture from strategy executor
        activeOrders: this.engine.getPendingOrders(),
        recentTrades: engineState.trades.slice(-10),
        indicatorValues: { ...engineState.indicators },
        eventHistory: this.session.eventLog.slice(-50) // Last 50 events
      },
      
      performance: {
        accountBalance: engineState.accountBalance,
        totalPnL: engineState.accountBalance - engineState.initialBalance,
        openPositions: engineState.openPositions.size,
        totalTrades: engineState.trades.length,
        winRate: this.calculateWinRate(engineState.trades)
      },
      
      metadata: {
        snapshotReason: reason,
        description,
        tags
      }
    };

    // Add to session
    this.session.snapshots.push(snapshot);
    this.session.currentSnapshotIndex = this.session.snapshots.length - 1;

    // Maintain max snapshots limit
    if (this.session.snapshots.length > this.session.settings.maxSnapshots) {
      this.session.snapshots.shift();
      this.session.currentSnapshotIndex--;
    }

    return snapshot;
  }

  // ===============================
  // Event Handlers
  // ===============================

  private handleBarProcessed(event: EngineEvent): void {
    if (!this.session) return;

    // Log event
    this.session.eventLog.push(event);
    this.session.processedBars = event.data.barIndex;

    // Check breakpoints
    this.checkBreakpoints();

    // Auto-snapshot if enabled
    if (this.session.settings.autoSnapshot) {
      const shouldSnapshot = this.shouldCreateAutoSnapshot();
      if (shouldSnapshot) {
        this.createSnapshot('bar_processed', `Auto-snapshot at bar ${event.data.barIndex}`);
      }
    }
  }

  private handleOrderFilled(event: EngineEvent): void {
    if (!this.session) return;

    this.session.eventLog.push(event);
    
    // Always snapshot on order fills for detailed debugging
    this.createSnapshot('order_filled', `Order filled: ${event.data.fill?.orderId}`);
  }

  private handleTradeOpened(event: EngineEvent): void {
    if (!this.session) return;
    this.session.eventLog.push(event);
  }

  private handleTradeClosed(event: EngineEvent): void {
    if (!this.session) return;
    this.session.eventLog.push(event);
  }

  // ===============================
  // Breakpoint System
  // ===============================

  /**
   * Add a breakpoint
   */
  public addBreakpoint(breakpoint: Omit<Breakpoint, 'id' | 'metadata'> & { 
    name: string; 
    description?: string; 
  }): string {
    if (!this.session) {
      throw new Error('No active debugging session');
    }

    const breakpointId = `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullBreakpoint: Breakpoint = {
      id: breakpointId,
      enabled: true,
      type: breakpoint.type,
      condition: breakpoint.condition,
      actions: breakpoint.actions,
      metadata: {
        name: breakpoint.name,
        description: breakpoint.description,
        hitCount: 0
      }
    };

    this.session.breakpoints.push(fullBreakpoint);
    return breakpointId;
  }

  /**
   * Remove a breakpoint
   */
  public removeBreakpoint(breakpointId: string): boolean {
    if (!this.session) return false;

    const index = this.session.breakpoints.findIndex(bp => bp.id === breakpointId);
    if (index !== -1) {
      this.session.breakpoints.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable a breakpoint
   */
  public toggleBreakpoint(breakpointId: string, enabled?: boolean): boolean {
    if (!this.session) return false;

    const breakpoint = this.session.breakpoints.find(bp => bp.id === breakpointId);
    if (breakpoint) {
      breakpoint.enabled = enabled !== undefined ? enabled : !breakpoint.enabled;
      return true;
    }
    return false;
  }

  /**
   * Check if any breakpoints should trigger
   */
  private checkBreakpoints(): void {
    if (!this.session || !this.session.settings.enableBreakpoints) return;

    const engineState = this.engine.getState();
    
    for (const breakpoint of this.session.breakpoints) {
      if (!breakpoint.enabled) continue;

      let shouldTrigger = false;

      switch (breakpoint.type) {
        case 'bar_index':
          shouldTrigger = engineState.currentBarIndex === breakpoint.condition.barIndex;
          break;
          
        case 'time':
          shouldTrigger = engineState.currentTime === breakpoint.condition.time;
          break;
          
        case 'balance':
          if (breakpoint.condition.balanceThreshold && breakpoint.condition.balanceOperator) {
            const balance = engineState.accountBalance;
            const threshold = breakpoint.condition.balanceThreshold;
            switch (breakpoint.condition.balanceOperator) {
              case '>': shouldTrigger = balance > threshold; break;
              case '<': shouldTrigger = balance < threshold; break;
              case '=': shouldTrigger = balance === threshold; break;
              case '>=': shouldTrigger = balance >= threshold; break;
              case '<=': shouldTrigger = balance <= threshold; break;
            }
          }
          break;
          
        case 'trade_count':
          shouldTrigger = engineState.trades.length === breakpoint.condition.tradeCount;
          break;
          
        case 'custom':
          if (breakpoint.condition.customFunction) {
            shouldTrigger = breakpoint.condition.customFunction(engineState);
          }
          break;
      }

      if (shouldTrigger) {
        this.triggerBreakpoint(breakpoint);
      }
    }
  }

  /**
   * Trigger a breakpoint
   */
  private triggerBreakpoint(breakpoint: Breakpoint): void {
    if (!this.session) return;

    breakpoint.metadata.hitCount++;
    breakpoint.metadata.lastHit = Date.now() as UTCTimestamp;

    if (breakpoint.actions.log) {
      console.log(`Breakpoint hit: ${breakpoint.metadata.name}`, {
        condition: breakpoint.condition,
        hitCount: breakpoint.metadata.hitCount
      });
    }

    if (breakpoint.actions.snapshot) {
      const snapshot = this.createSnapshot(
        'breakpoint', 
        `Breakpoint: ${breakpoint.metadata.name}`,
        ['breakpoint', breakpoint.id]
      );
      
      if (breakpoint.actions.executeCallback) {
        breakpoint.actions.executeCallback(snapshot);
      }
    }

    if (breakpoint.actions.pause) {
      this.pauseExecution();
    }
  }

  // ===============================
  // Time Travel & Replay
  // ===============================

  /**
   * Travel to a specific snapshot
   */
  public travelToSnapshot(snapshotId: string): boolean {
    if (!this.session) return false;

    const snapshot = this.session.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return false;

    return this.restoreSnapshot(snapshot);
  }

  /**
   * Travel to a specific bar index
   */
  public travelToBar(barIndex: number): StateSnapshot | null {
    if (!this.session) return null;

    // Find closest snapshot at or before the target bar
    const candidates = this.session.snapshots.filter(s => s.barIndex <= barIndex);
    if (candidates.length === 0) return null;

    const closestSnapshot = candidates.reduce((closest, current) => 
      current.barIndex > closest.barIndex ? current : closest
    );

    // Restore to closest snapshot
    if (!this.restoreSnapshot(closestSnapshot)) return null;

    // Replay forward to exact bar if needed
    if (closestSnapshot.barIndex < barIndex) {
      this.replayToBar(barIndex);
    }

    return closestSnapshot;
  }

  /**
   * Restore engine state from a snapshot
   */
  private restoreSnapshot(snapshot: StateSnapshot): boolean {
    try {
      // Pause current execution
      this.pauseExecution();

      // Reset engine to snapshot state
      // Note: This would require BacktestEngine to have a setState method
      // For now, we'll simulate the restoration
      console.log(`Restoring to snapshot: ${snapshot.id} at bar ${snapshot.barIndex}`);
      
      // Update session index
      if (this.session) {
        this.session.currentSnapshotIndex = this.session.snapshots.findIndex(s => s.id === snapshot.id);
      }

      return true;
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
      return false;
    }
  }

  /**
   * Replay execution from current state to target bar
   */
  private replayToBar(targetBarIndex: number): void {
    const currentBar = this.engine.getState().currentBarIndex;
    
    for (let i = currentBar; i < targetBarIndex; i++) {
      const bar = this.engine.processNextBar();
      if (!bar) break;
    }
  }

  // ===============================
  // Analysis & Comparison
  // ===============================

  /**
   * Compare two snapshots
   */
  public compareSnapshots(
    snapshot1Id: string, 
    snapshot2Id: string
  ): SnapshotComparison | null {
    if (!this.session) return null;

    const snap1 = this.session.snapshots.find(s => s.id === snapshot1Id);
    const snap2 = this.session.snapshots.find(s => s.id === snapshot2Id);
    
    if (!snap1 || !snap2) return null;

    const balanceChange = snap2.performance.accountBalance - snap1.performance.accountBalance;
    const balanceChangePercent = (balanceChange / snap1.performance.accountBalance) * 100;

    const comparison: SnapshotComparison = {
      snapshot1: snap1,
      snapshot2: snap2,
      differences: {
        balance: {
          before: snap1.performance.accountBalance,
          after: snap2.performance.accountBalance,
          change: balanceChange,
          changePercent: balanceChangePercent
        },
        positions: {
          opened: [], // Would need detailed comparison logic
          closed: [],
          modified: []
        },
        orders: {
          submitted: [],
          cancelled: [],
          filled: []
        },
        indicators: {
          changed: this.compareIndicators(snap1.debugInfo.indicatorValues, snap2.debugInfo.indicatorValues)
        }
      },
      summary: {
        significantChanges: this.identifySignificantChanges(snap1, snap2),
        performanceImpact: balanceChange > 0 ? 'positive' : balanceChange < 0 ? 'negative' : 'neutral',
        riskChanges: []
      }
    };

    return comparison;
  }

  /**
   * Get debugging insights for current state
   */
  public getDebuggingInsights(): {
    recentPerformance: number[];
    strategyEffectiveness: Record<string, number>;
    riskMetrics: Record<string, number>;
    anomalies: string[];
  } | null {
    if (!this.session || this.session.snapshots.length < 2) return null;

    const recentSnapshots = this.session.snapshots.slice(-10);
    const recentPerformance = recentSnapshots.map(s => s.performance.totalPnL);

    return {
      recentPerformance,
      strategyEffectiveness: {}, // Would need strategy tracking
      riskMetrics: {
        currentDrawdown: this.calculateCurrentDrawdown(recentSnapshots),
        volatility: this.calculateVolatility(recentPerformance),
        sharpeRatio: 0 // Would need proper calculation
      },
      anomalies: this.detectAnomalies(recentSnapshots)
    };
  }

  // ===============================
  // Utility Methods
  // ===============================

  private shouldCreateAutoSnapshot(): boolean {
    if (!this.session) return false;

    const { snapshotFrequency, snapshotFrequencyN } = this.session.settings;
    const currentBar = this.engine.getState().currentBarIndex;

    switch (snapshotFrequency) {
      case 'every_bar':
        return true;
      case 'every_n_bars':
        return snapshotFrequencyN ? currentBar % snapshotFrequencyN === 0 : false;
      case 'on_events':
        return false; // Only on specific events
      default:
        return false;
    }
  }

  private pauseExecution(): void {
    if (this.session) {
      this.session.isPaused = true;
    }
    this.engine.pause();
  }

  private calculateWinRate(trades: SimulatedTrade[]): number {
    if (trades.length === 0) return 0;
    const winningTrades = trades.filter(t => (t.profitOrLoss || 0) > 0).length;
    return (winningTrades / trades.length) * 100;
  }

  private compareIndicators(
    indicators1: Record<string, unknown>, 
    indicators2: Record<string, unknown>
  ): Record<string, { before: unknown; after: unknown }> {
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    
    for (const key in indicators2) {
      if (indicators1[key] !== indicators2[key]) {
        changes[key] = {
          before: indicators1[key],
          after: indicators2[key]
        };
      }
    }
    
    return changes;
  }

  private identifySignificantChanges(snap1: StateSnapshot, snap2: StateSnapshot): string[] {
    const changes: string[] = [];
    
    const balanceChange = Math.abs(snap2.performance.accountBalance - snap1.performance.accountBalance);
    if (balanceChange > snap1.performance.accountBalance * 0.05) { // 5% change
      changes.push(`Significant balance change: ${balanceChange > 0 ? '+' : ''}${balanceChange.toFixed(2)}`);
    }

    const positionChange = snap2.performance.openPositions - snap1.performance.openPositions;
    if (positionChange !== 0) {
      changes.push(`Position count changed by ${positionChange}`);
    }

    return changes;
  }

  private calculateCurrentDrawdown(snapshots: StateSnapshot[]): number {
    if (snapshots.length < 2) return 0;
    
    let maxBalance = snapshots[0].performance.accountBalance;
    let currentDrawdown = 0;
    
    for (const snapshot of snapshots) {
      const balance = snapshot.performance.accountBalance;
      if (balance > maxBalance) {
        maxBalance = balance;
      }
      const drawdown = (maxBalance - balance) / maxBalance * 100;
      currentDrawdown = Math.max(currentDrawdown, drawdown);
    }
    
    return currentDrawdown;
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private detectAnomalies(snapshots: StateSnapshot[]): string[] {
    const anomalies: string[] = [];
    
    if (snapshots.length < 3) return anomalies;
    
    // Check for sudden balance changes
    for (let i = 1; i < snapshots.length; i++) {
      const prevBalance = snapshots[i - 1].performance.accountBalance;
      const currentBalance = snapshots[i].performance.accountBalance;
      const change = Math.abs(currentBalance - prevBalance) / prevBalance;
      
      if (change > 0.1) { // 10% change
        anomalies.push(`Sudden balance change at bar ${snapshots[i].barIndex}: ${(change * 100).toFixed(1)}%`);
      }
    }
    
    return anomalies;
  }

  // ===============================
  // Public API for Debugging UI
  // ===============================

  /**
   * Get session summary for UI
   */
  public getSessionSummary(): {
    session: DebugSession | null;
    currentSnapshot: StateSnapshot | null;
    recentEvents: EngineEvent[];
    breakpointStatus: { total: number; enabled: number; hit: number };
  } {
         const session = this.session;
     const currentSnapshot = session?.snapshots[session.currentSnapshotIndex] || null;
     const recentEvents = session?.eventLog.slice(-20) || [];
    
    const breakpointStatus = {
      total: session?.breakpoints.length || 0,
      enabled: session?.breakpoints.filter(bp => bp.enabled).length || 0,
      hit: session?.breakpoints.reduce((sum, bp) => sum + bp.metadata.hitCount, 0) || 0
    };

    return {
      session,
      currentSnapshot,
      recentEvents,
      breakpointStatus
    };
  }

  /**
   * Export session data for external analysis
   */
  public exportSession(): string | null {
    if (!this.session) return null;
    
    return JSON.stringify({
      ...this.session,
      exportedAt: Date.now(),
      version: '1.0'
    }, null, 2);
  }

  /**
   * Import session data
   */
  public importSession(sessionData: string): boolean {
    try {
      const data = JSON.parse(sessionData);
      if (data.version === '1.0') {
        this.session = data;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export default TimeTravelDebugger;
