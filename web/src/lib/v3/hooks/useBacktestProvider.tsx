import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { BacktestEngine, BacktestEngineState, EngineEventType, EngineEvent } from '../BacktestEngine';
import { DataSource } from '../DataSource';
import { IndicatorService } from '../IndicatorService';
import { StrategyDefinition, StrategyConfig, StrategyExecutionContext } from '../StrategyFramework';
import { BacktestBarData, Order, BacktestResults } from '../../types/backtester';
import { OrderMatchingConfig } from '../OrderMatchingEngine';
import { BracketOrderConfig, BracketOrder } from '../BracketOrderSystem';

/**
 * Configuration for the BacktestProvider
 */
export interface BacktestProviderConfig {
  initialBalance?: number;
  orderMatchingConfig?: Partial<OrderMatchingConfig>;
  autoExecuteStrategies?: boolean;
  enableRealTimeUpdates?: boolean;
}

/**
 * Actions available through the context
 */
export interface BacktestActions {
  // Engine lifecycle
  loadData: (bars: BacktestBarData[]) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  
  // Playback control
  processNextBar: () => BacktestBarData | null;
  processToBar: (targetBarIndex: number) => void;
  processToEnd: () => void;
  
  // Strategy management
  registerStrategy: (definition: StrategyDefinition, config?: Partial<StrategyConfig>) => void;
  unregisterStrategy: (strategyId: string) => void;
  setStrategyActive: (strategyId: string, isActive: boolean) => void;
  updateStrategyConfig: (strategyId: string, updates: Partial<StrategyConfig>) => void;
  
  // Order management
  submitOrder: (order: Order) => void;
  submitBracketOrder: (config: BracketOrderConfig) => BracketOrder;
  cancelOrder: (orderId: string) => boolean;
  
  // Configuration
  updateOrderMatchingConfig: (config: Partial<OrderMatchingConfig>) => void;
  
  // Data sources
  setDataSource: (dataSource: DataSource) => void;
  refreshIndicators: () => void;
}

/**
 * Derived state and computed values
 */
export interface BacktestDerivedState {
  // Progress tracking
  isRunning: boolean;
  isPaused: boolean;
  isActive: boolean;
  progress: number; // 0-100
  
  // Current data
  currentBar: BacktestBarData | null;
  hasData: boolean;
  totalBars: number;
  
  // Performance metrics
  performance: {
    totalPnL: number;
    winRate: number;
    totalTrades: number;
    currentDrawdown: number;
    returnsPercent: number;
  };
  
  // Order and position status
  pendingOrders: Order[];
  openPositions: any[];
  recentTrades: any[];
  
  // Strategy status
  activeStrategies: string[];
  strategyPerformance: Record<string, {
    signals: number;
    trades: number;
    pnl: number;
    winRate: number;
  }>;
}

/**
 * Combined context value
 */
export interface BacktestContextValue {
  // Core state
  engine: BacktestEngine | null;
  state: BacktestEngineState | null;
  derived: BacktestDerivedState;
  
  // Services
  indicatorService: IndicatorService | null;
  dataSource: DataSource | null;
  
  // Actions
  actions: BacktestActions;
  
  // Event subscription
  addEventListener: (eventType: EngineEventType, callback: (event: EngineEvent) => void) => () => void;
  
  // Loading state
  isInitialized: boolean;
  error: string | null;
}

/**
 * Default context value
 */
const defaultContextValue: BacktestContextValue = {
  engine: null,
  state: null,
  derived: {
    isRunning: false,
    isPaused: false,
    isActive: false,
    progress: 0,
    currentBar: null,
    hasData: false,
    totalBars: 0,
    performance: {
      totalPnL: 0,
      winRate: 0,
      totalTrades: 0,
      currentDrawdown: 0,
      returnsPercent: 0,
    },
    pendingOrders: [],
    openPositions: [],
    recentTrades: [],
    activeStrategies: [],
    strategyPerformance: {},
  },
  indicatorService: null,
  dataSource: null,
  actions: {} as BacktestActions,
  addEventListener: () => () => {},
  isInitialized: false,
  error: null,
};

/**
 * React Context
 */
const BacktestContext = createContext<BacktestContextValue>(defaultContextValue);

/**
 * Provider component props
 */
export interface BacktestProviderProps {
  children: ReactNode;
  config?: BacktestProviderConfig;
}

/**
 * BacktestProvider component that manages the v3 BacktestEngine
 */
export const BacktestProvider: React.FC<BacktestProviderProps> = ({ 
  children, 
  config = {} 
}) => {
  // Provider state
  const [engine, setEngine] = useState<BacktestEngine | null>(null);
  const [state, setState] = useState<BacktestEngineState | null>(null);
  const [indicatorService, setIndicatorService] = useState<IndicatorService | null>(null);
  const [dataSource, setDataSourceState] = useState<DataSource | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Event listeners for real-time updates
  const [eventListeners, setEventListeners] = useState<Map<string, Set<(event: EngineEvent) => void>>>(new Map());

  // Initialize engine and services
  useEffect(() => {
    try {
      const newEngine = new BacktestEngine(
        config.initialBalance || 100000,
        config.orderMatchingConfig
      );
      
      const newIndicatorService = new IndicatorService();
      
      setEngine(newEngine);
      setIndicatorService(newIndicatorService);
      setState(newEngine.getState());
      setIsInitialized(true);
      setError(null);
      
      // Subscribe to state changes for reactive updates
      const unsubscribe = newEngine.onStateChange((newState) => {
        setState({ ...newState }); // Force re-render with new object
      });
      
      return () => {
        unsubscribe();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize backtest engine');
      setIsInitialized(false);
    }
  }, [config.initialBalance, config.orderMatchingConfig]);

  // Execute strategies automatically on each bar if enabled
  useEffect(() => {
    if (!engine || !indicatorService || !config.autoExecuteStrategies) return;

    const unsubscribe = engine.on(EngineEventType.BAR_PROCESSED, () => {
      engine.executeStrategies(indicatorService);
    });

    return unsubscribe;
  }, [engine, indicatorService, config.autoExecuteStrategies]);

  // Derived state computation
  const derived = useMemo((): BacktestDerivedState => {
    if (!state || !engine) {
      return defaultContextValue.derived;
    }

    const currentBar = engine.getCurrentBar();
    const totalBars = state.bars.length;
    const progress = engine.getProgress();
    
    // Calculate performance metrics
    const totalPnL = state.trades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const winningTrades = state.trades.filter(t => (t.profitOrLoss || 0) > 0).length;
    const winRate = state.trades.length > 0 ? (winningTrades / state.trades.length) * 100 : 0;
    const returnsPercent = ((state.accountBalance - state.initialBalance) / state.initialBalance) * 100;
    
    // Calculate current drawdown (simplified)
    let maxBalance = state.initialBalance;
    let currentDrawdown = 0;
    for (const trade of state.trades) {
      const balanceAfterTrade = maxBalance + (trade.profitOrLoss || 0);
      if (balanceAfterTrade > maxBalance) {
        maxBalance = balanceAfterTrade;
      } else {
        const drawdown = (maxBalance - balanceAfterTrade) / maxBalance * 100;
        currentDrawdown = Math.max(currentDrawdown, drawdown);
      }
    }

    // Get strategy performance
    const strategyExecutor = engine.getStrategyExecutor();
    const strategies = strategyExecutor.getRegisteredStrategies();
    const activeStrategies = strategies.filter(s => s.isActive).map(s => s.definition.id);
    
    const strategyPerformance: Record<string, any> = {};
    strategies.forEach(strategy => {
      strategyPerformance[strategy.definition.id] = {
        signals: strategy.signals.length,
        trades: 0, // TODO: Track trades per strategy
        pnl: 0,    // TODO: Track P&L per strategy
        winRate: 0,
      };
    });

    return {
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      isActive: engine.isActive(),
      progress,
      currentBar,
      hasData: totalBars > 0,
      totalBars,
      performance: {
        totalPnL,
        winRate,
        totalTrades: state.trades.length,
        currentDrawdown,
        returnsPercent,
      },
      pendingOrders: engine.getPendingOrders(),
      openPositions: Array.from(state.openPositions.values()),
      recentTrades: state.trades.slice(-10), // Last 10 trades
      activeStrategies,
      strategyPerformance,
    };
  }, [state, engine]);

  // Action implementations
  const actions = useMemo((): BacktestActions => {
    if (!engine || !indicatorService) {
      return defaultContextValue.actions;
    }

    return {
      // Engine lifecycle
      loadData: (bars: BacktestBarData[]) => {
        try {
          engine.loadData(bars);
          // Update indicators when new data is loaded
          indicatorService.reset();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      },
      
      start: () => {
        try {
          engine.start();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to start backtest');
        }
      },
      
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      stop: () => engine.stop(),
      reset: () => {
        engine.reset();
        indicatorService.reset();
        setError(null);
      },

      // Playback control
      processNextBar: () => {
        try {
          return engine.processNextBar();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process bar');
          return null;
        }
      },

      processToBar: (targetBarIndex: number) => {
        try {
          const currentIndex = state?.currentBarIndex || 0;
          for (let i = currentIndex; i < targetBarIndex && i < (state?.bars.length || 0); i++) {
            const result = engine.processNextBar();
            if (!result) break;
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process to target bar');
        }
      },

      processToEnd: () => {
        try {
          while (engine.isActive()) {
            const result = engine.processNextBar();
            if (!result) break;
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process to end');
        }
      },

      // Strategy management
      registerStrategy: (definition: StrategyDefinition, config?: Partial<StrategyConfig>) => {
        try {
          engine.registerStrategy(definition, config);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to register strategy');
        }
      },

      unregisterStrategy: (strategyId: string) => {
        try {
          engine.getStrategyExecutor().unregisterStrategy(strategyId);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to unregister strategy');
        }
      },

      setStrategyActive: (strategyId: string, isActive: boolean) => {
        try {
          engine.setStrategyActive(strategyId, isActive);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to update strategy status');
        }
      },

      updateStrategyConfig: (strategyId: string, updates: Partial<StrategyConfig>) => {
        try {
          engine.updateStrategyConfig(strategyId, updates);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to update strategy config');
        }
      },

      // Order management
      submitOrder: (order: Order) => {
        try {
          engine.submitOrder(order);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to submit order');
        }
      },

      submitBracketOrder: (config: BracketOrderConfig) => {
        try {
          const result = engine.submitBracketOrder(config);
          setError(null);
          return result;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to submit bracket order');
          throw err;
        }
      },

      cancelOrder: (orderId: string) => {
        try {
          const result = engine.cancelOrder(orderId);
          setError(null);
          return result;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to cancel order');
          return false;
        }
      },

      // Configuration
      updateOrderMatchingConfig: (config: Partial<OrderMatchingConfig>) => {
        try {
          engine.updateOrderMatchingConfig(config);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to update order matching config');
        }
      },

      // Data sources
      setDataSource: (newDataSource: DataSource) => {
        setDataSourceState(newDataSource);
      },

      refreshIndicators: () => {
        try {
          indicatorService.reset();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to refresh indicators');
        }
      },
    };
  }, [engine, indicatorService, state]);

  // Event subscription management
  const addEventListener = useCallback((
    eventType: EngineEventType, 
    callback: (event: EngineEvent) => void
  ): (() => void) => {
    if (!engine) return () => {};

    // Subscribe to engine event
    const unsubscribeEngine = engine.on(eventType, callback);

    // Track local listeners for cleanup
    const listenerId = `${eventType}_${Date.now()}_${Math.random()}`;
    setEventListeners(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(eventType)) {
        newMap.set(eventType, new Set());
      }
      newMap.get(eventType)!.add(callback);
      return newMap;
    });

    // Return cleanup function
    return () => {
      unsubscribeEngine();
      setEventListeners(prev => {
        const newMap = new Map(prev);
        const listeners = newMap.get(eventType);
        if (listeners) {
          listeners.delete(callback);
          if (listeners.size === 0) {
            newMap.delete(eventType);
          }
        }
        return newMap;
      });
    };
  }, [engine]);

  // Context value
  const contextValue: BacktestContextValue = useMemo(() => ({
    engine,
    state,
    derived,
    indicatorService,
    dataSource,
    actions,
    addEventListener,
    isInitialized,
    error,
  }), [
    engine,
    state,
    derived,
    indicatorService,
    dataSource,
    actions,
    addEventListener,
    isInitialized,
    error,
  ]);

  return (
    <BacktestContext.Provider value={contextValue}>
      {children}
    </BacktestContext.Provider>
  );
};

/**
 * Hook to access the backtest context
 * Throws error if used outside of BacktestProvider
 */
export const useBacktest = (): BacktestContextValue => {
  const context = useContext(BacktestContext);
  if (!context) {
    throw new Error('useBacktest must be used within a BacktestProvider');
  }
  return context;
};

/**
 * Hook to access only the engine state
 */
export const useBacktestState = () => {
  const { state, derived, isInitialized, error } = useBacktest();
  return { state, derived, isInitialized, error };
};

/**
 * Hook to access only the engine actions
 */
export const useBacktestActions = () => {
  const { actions } = useBacktest();
  return actions;
};

/**
 * Hook to access engine and services
 */
export const useBacktestEngine = () => {
  const { engine, indicatorService, dataSource } = useBacktest();
  return { engine, indicatorService, dataSource };
};

/**
 * Hook for performance metrics
 */
export const useBacktestPerformance = () => {
  const { derived } = useBacktest();
  return derived.performance;
};

/**
 * Hook for strategy management
 */
export const useBacktestStrategies = () => {
  const { derived, actions, engine } = useBacktest();
  
  const strategies = useMemo(() => {
    if (!engine) return [];
    return engine.getStrategyExecutor().getRegisteredStrategies();
  }, [engine, derived.activeStrategies]); // Re-compute when active strategies change

  return {
    strategies,
    activeStrategies: derived.activeStrategies,
    performance: derived.strategyPerformance,
    actions: {
      register: actions.registerStrategy,
      unregister: actions.unregisterStrategy,
      setActive: actions.setStrategyActive,
      updateConfig: actions.updateStrategyConfig,
    },
  };
};

/**
 * Hook for order and position management
 */
export const useBacktestOrders = () => {
  const { derived, actions } = useBacktest();
  
  return {
    pendingOrders: derived.pendingOrders,
    openPositions: derived.openPositions,
    recentTrades: derived.recentTrades,
    actions: {
      submit: actions.submitOrder,
      submitBracket: actions.submitBracketOrder,
      cancel: actions.cancelOrder,
    },
  };
};

/**
 * Hook for event subscriptions with automatic cleanup
 */
export const useBacktestEvents = (
  eventType: EngineEventType,
  callback: (event: EngineEvent) => void,
  deps: any[] = []
) => {
  const { addEventListener } = useBacktest();
  
  useEffect(() => {
    const unsubscribe = addEventListener(eventType, callback);
    return unsubscribe;
  }, [addEventListener, eventType, ...deps]);
};

/**
 * Hook for playback control
 */
export const useBacktestPlayback = () => {
  const { derived, actions } = useBacktest();
  
  return {
    isRunning: derived.isRunning,
    isPaused: derived.isPaused,
    isActive: derived.isActive,
    progress: derived.progress,
    currentBar: derived.currentBar,
    hasData: derived.hasData,
    totalBars: derived.totalBars,
    actions: {
      start: actions.start,
      pause: actions.pause,
      resume: actions.resume,
      stop: actions.stop,
      reset: actions.reset,
      processNext: actions.processNextBar,
      processTo: actions.processToBar,
      processToEnd: actions.processToEnd,
    },
  };
};

export default BacktestProvider; 