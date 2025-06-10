import { TrendStartStrategyConfig } from '../config/TrendStartStrategyConfig';
import { TrendStartStrategyState } from '../state/TrendStartStrategyState';
import { BacktestBarData, SimulatedTrade } from '@/lib/types/backtester';
import { TrendStartSignal as TrendLibSignal } from '@/lib/trend-analysis/TrendIdentifier';

/**
 * Public interface for TrendStartStrategy
 * 
 * This interface follows NautilusTrader's architecture by:
 * - Exposing only necessary methods for external interaction
 * - Hiding implementation details and internal state
 * - Providing clear lifecycle management methods
 * - Supporting monitoring and observability
 * - Maintaining loose coupling with other components
 */
export interface ITrendStartStrategy {
  // ========== Identification ==========
  
  /**
   * Get the unique strategy identifier
   */
  getStrategyId(): string;
  
  /**
   * Get the strategy name
   */
  getName(): string;
  
  /**
   * Get the strategy description
   */
  getDescription(): string;
  
  /**
   * Get the strategy version
   */
  getVersion(): string;

  // ========== Lifecycle Management ==========
  
  /**
   * Initialize the strategy
   * Sets up event handlers and prepares internal state
   * @throws Error if initialization fails
   */
  initialize(): void;
  
  /**
   * Start the strategy
   * Begins processing events and generating signals
   * @throws Error if not initialized or start fails
   */
  start(): void;
  
  /**
   * Stop the strategy
   * Pauses processing while maintaining state
   * @throws Error if not started or stop fails
   */
  stop(): void;
  
  /**
   * Dispose of the strategy
   * Cleans up all resources and unregisters handlers
   * @throws Error if disposal fails
   */
  dispose(): void;
  
  /**
   * Get the current lifecycle state
   */
  getLifecycleState(): string;
  
  /**
   * Check if the strategy is ready to process events
   */
  isReady(): boolean;

  // ========== Configuration ==========
  
  /**
   * Get the strategy configuration
   * Returns an immutable copy of the configuration
   */
  getConfig(): Readonly<TrendStartStrategyConfig>;

  // ========== State Access (Read-Only) ==========
  
  /**
   * Get a snapshot of the current strategy state
   * Returns an immutable copy for monitoring/debugging
   */
  getStateSnapshot(): Readonly<{
    marketData: {
      currentBar: BacktestBarData | null;
      barCount: number;
      lastUpdateTime: number | null;
    };
    signals: {
      lastSignal: TrendLibSignal | null;
      signalCount: number;
      lastSignalTime: number | null;
    };
    position: {
      isInPosition: boolean;
      openTrade: SimulatedTrade | null;
      tradeCount: number;
    };
    performance: {
      totalPnL: number;
      winRate: number;
      totalTrades: number;
    };
  }>;
  
  /**
   * Get the currently open trade, if any
   */
  getOpenTrade(): SimulatedTrade | null;
  
  /**
   * Check if the strategy has an open position
   */
  isInPosition(): boolean;
  
  /**
   * Get all trend signals received by the strategy
   */
  getTrendSignals(): ReadonlyArray<TrendLibSignal>;

  // ========== Monitoring & Observability ==========
  
  /**
   * Get strategy performance metrics
   */
  getPerformanceMetrics(): {
    totalPnL: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    averageWin: number;
    averageLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  
  /**
   * Get strategy health status
   */
  getHealthStatus(): {
    isHealthy: boolean;
    lastActivityTime: number | null;
    errorCount: number;
    warningCount: number;
    uptime: number;
  };
  
  /**
   * Get strategy statistics
   */
  getStatistics(): {
    eventsProcessed: number;
    signalsGenerated: number;
    ordersSubmitted: number;
    tradesCompleted: number;
    lastUpdateTime: number | null;
  };
}

/**
 * Factory function type for creating strategy instances
 */
export type TrendStartStrategyFactory = (
  config: Partial<TrendStartStrategyConfig>
) => ITrendStartStrategy; 