import { produce, Draft } from 'immer';
import { UTCTimestamp } from 'lightweight-charts';
import { BacktestBarData, Order, SimulatedTrade, BacktestResults, OrderSide, TradeType } from '../types/backtester';
import { OrderMatchingEngine, OrderMatchingConfig, OrderFill, MatchingResult, SyntheticTick } from './OrderMatchingEngine';
import { 
  BracketOrderSystem, 
  BracketOrderConfig, 
  BracketOrder, 
  BracketOrderEventType,
  OCOGroup 
} from './BracketOrderSystem';
import { 
  StrategyExecutor, 
  StrategyContext, 
  StrategyPosition, 
  StrategyResult, 
  StrategyActionType,
  OrderActionPayload,
  BracketOrderActionPayload,
  StateUpdatePayload,
  LogMessagePayload,
  StrategyDefinition,
  StrategyConfig
} from './StrategyFramework';
import { DatabaseMarketDataLoader, MarketDataQuery } from './data/DatabaseMarketDataLoader';

/**
 * Core state structure for the v3 BacktestEngine
 * All state modifications must go through immer to ensure immutability
 */
export interface BacktestEngineState {
  // Time and data state
  currentTime: UTCTimestamp;
  currentBarIndex: number;
  bars: BacktestBarData[];
  
  // Account and portfolio state
  accountBalance: number;
  initialBalance: number;
  
  // Order and position state
  orders: Order[];
  trades: SimulatedTrade[];
  openPositions: Map<string, SimulatedTrade>;
  
  // Execution state
  isRunning: boolean;
  isPaused: boolean;
  
  // Results and metrics
  results: BacktestResults | null;
  
  // Strategy state (extensible for different strategies)
  strategyState: Record<string, any>;
  
  // Indicators cache
  indicators: Record<string, any>;

  // Progressive bar formation state
  formingBar: FormingBar | null;
  progressiveBarConfig: ProgressiveBarConfig | null;
}

/**
 * Interface for bars that are being formed progressively
 */
export interface FormingBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickCount: number;
  isComplete: boolean;
  startTime: UTCTimestamp;
  expectedEndTime: UTCTimestamp;
}

/**
 * Event types that the engine can emit
 */
export enum EngineEventType {
  STATE_CHANGED = 'STATE_CHANGED',
  BAR_PROCESSED = 'BAR_PROCESSED',
  ORDER_SUBMITTED = 'ORDER_SUBMITTED',
  ORDER_FILLED = 'ORDER_FILLED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  TRADE_OPENED = 'TRADE_OPENED',
  TRADE_CLOSED = 'TRADE_CLOSED',
  BACKTEST_STARTED = 'BACKTEST_STARTED',
  BACKTEST_COMPLETED = 'BACKTEST_COMPLETED',
  BACKTEST_PAUSED = 'BACKTEST_PAUSED',
  BACKTEST_RESUMED = 'BACKTEST_RESUMED',
  BAR_FORMING = 'BAR_FORMING',
  BAR_UPDATE = 'BAR_UPDATE',
  BAR_COMPLETED = 'BAR_COMPLETED',
}

/**
 * Event data structure
 */
export interface EngineEvent<T = any> {
  type: EngineEventType;
  timestamp: UTCTimestamp;
  data: T;
}

/**
 * Subscription callback type
 */
export type EngineEventCallback<T = any> = (event: EngineEvent<T>) => void;

/**
 * State change subscription callback
 */
export type StateChangeCallback = (state: BacktestEngineState) => void;

/**
 * Configuration for progressive bar formation using real market data
 */
export interface ProgressiveBarConfig {
  baseTimeframe: string;     // Current chart timeframe (e.g., '1h')
  sourceTimeframe: string;   // Lower timeframe to use for progression (e.g., '1m')
  contract: string;          // Contract symbol (e.g., 'ES')
  useRealData: boolean;      // Use real database data vs synthetic ticks
}

/**
 * v3 BacktestEngine with immutable state management and subscription model
 * 
 * This is the central nervous system of the new architecture. It provides:
 * - Immutable state updates using immer
 * - Event-driven architecture with subscription model
 * - Clean separation of concerns
 * - Type-safe state management
 */
export class BacktestEngine {
  private state: BacktestEngineState;
  private eventSubscribers: Map<EngineEventType, Set<EngineEventCallback>> = new Map();
  private stateChangeSubscribers: Set<StateChangeCallback> = new Set();
  private orderMatchingEngine: OrderMatchingEngine;
  private bracketOrderSystem: BracketOrderSystem;
  private strategyExecutor: StrategyExecutor;
  private marketDataLoader: DatabaseMarketDataLoader;
  private eventId = 0;

  constructor(
    initialBalance: number = 100000,
    orderMatchingConfig?: Partial<OrderMatchingConfig>
  ) {
    // Initialize order matching engine
    this.orderMatchingEngine = new OrderMatchingEngine(orderMatchingConfig);
    
    // Initialize bracket order system
    this.bracketOrderSystem = new BracketOrderSystem();
    
    // Initialize strategy executor
    this.strategyExecutor = new StrategyExecutor();
    
    // Initialize market data loader
    this.marketDataLoader = new DatabaseMarketDataLoader();
    
    // Setup bracket order event handlers
    this.setupBracketOrderEventHandlers();
    
    // Initialize immutable state
    this.state = {
      currentTime: 0 as UTCTimestamp,
      currentBarIndex: 0,
      bars: [],
      accountBalance: initialBalance,
      initialBalance: initialBalance,
      orders: [],
      trades: [],
      openPositions: new Map(),
      isRunning: false,
      isPaused: false,
      results: null,
      strategyState: {},
      indicators: {},
      formingBar: null,
      progressiveBarConfig: null,
    };
  }

  /**
   * Setup event handlers for bracket order system
   */
  private setupBracketOrderEventHandlers(): void {
    // Handle OCO triggers - cancel opposite orders
    this.bracketOrderSystem.on(BracketOrderEventType.OCO_TRIGGERED, (data) => {
      const { cancelledOrderIds } = data;
      cancelledOrderIds.forEach((orderId: string) => {
        this.orderMatchingEngine.removeOrder(orderId);
      });
    });

    // Forward bracket order events to engine subscribers
    this.bracketOrderSystem.on(BracketOrderEventType.BRACKET_CREATED, (data) => {
      this.emit('BRACKET_CREATED' as any, data);
    });

    this.bracketOrderSystem.on(BracketOrderEventType.ENTRY_FILLED, (data) => {
      this.emit('BRACKET_ENTRY_FILLED' as any, data);
    });

    this.bracketOrderSystem.on(BracketOrderEventType.STOP_LOSS_TRIGGERED, (data) => {
      this.emit('STOP_LOSS_TRIGGERED' as any, data);
    });

    this.bracketOrderSystem.on(BracketOrderEventType.TAKE_PROFIT_TRIGGERED, (data) => {
      this.emit('TAKE_PROFIT_TRIGGERED' as any, data);
    });

    this.bracketOrderSystem.on(BracketOrderEventType.BRACKET_COMPLETED, (data) => {
      this.emit('BRACKET_COMPLETED' as any, data);
    });
  }

  /**
   * Get current immutable state (read-only)
   */
  public getState(): Readonly<BacktestEngineState> {
    return this.state;
  }

  /**
   * Update state using immer producer function
   * This ensures all state changes are immutable
   */
  private updateState(updater: (draft: Draft<BacktestEngineState>) => void): void {
    const newState = produce(this.state, updater);
    const hasChanged = newState !== this.state;
    
    if (hasChanged) {
      this.state = newState;
      this.notifyStateChange();
    }
  }

  /**
   * Subscribe to specific engine events
   */
  public on<T = any>(eventType: EngineEventType, callback: EngineEventCallback<T>): () => void {
    if (!this.eventSubscribers.has(eventType)) {
      this.eventSubscribers.set(eventType, new Set());
    }
    
    this.eventSubscribers.get(eventType)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.eventSubscribers.get(eventType)?.delete(callback);
    };
  }

  /**
   * Subscribe to all state changes
   */
  public onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeSubscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.stateChangeSubscribers.delete(callback);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit<T = any>(eventType: EngineEventType, data: T): void {
    const event: EngineEvent<T> = {
      type: eventType,
      timestamp: this.state.currentTime,
      data,
    };

    const subscribers = this.eventSubscribers.get(eventType);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event callback for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Notify all state change subscribers
   */
  private notifyStateChange(): void {
    this.stateChangeSubscribers.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });

    // Also emit the STATE_CHANGED event
    this.emit(EngineEventType.STATE_CHANGED, this.state);
  }

  /**
   * Load historical data into the engine
   */
  public loadData(bars: BacktestBarData[]): void {
    this.updateState(draft => {
      draft.bars = bars;
      draft.currentBarIndex = 0;
      draft.currentTime = bars.length > 0 && bars[0] ? bars[0].time : 0 as UTCTimestamp;
    });
  }

  /**
   * Start the backtest
   */
  public start(): void {
    this.updateState(draft => {
      draft.isRunning = true;
      draft.isPaused = false;
    });

    this.emit(EngineEventType.BACKTEST_STARTED, { 
      totalBars: this.state.bars.length 
    });
  }

  /**
   * Pause the backtest
   */
  public pause(): void {
    this.updateState(draft => {
      draft.isPaused = true;
    });

    this.emit(EngineEventType.BACKTEST_PAUSED, {
      currentBarIndex: this.state.currentBarIndex
    });
  }

  /**
   * Resume the backtest
   */
  public resume(): void {
    this.updateState(draft => {
      draft.isPaused = false;
    });

    this.emit(EngineEventType.BACKTEST_RESUMED, {
      currentBarIndex: this.state.currentBarIndex
    });
  }

  /**
   * Stop the backtest
   */
  public stop(): void {
    this.updateState(draft => {
      draft.isRunning = false;
      draft.isPaused = false;
    });

    this.emit(EngineEventType.BACKTEST_COMPLETED, {
      results: this.state.results
    });
  }

  /**
   * Reset the engine to initial state
   */
  public reset(): void {
    // Reset order matching engine
    this.orderMatchingEngine.clearFillHistory();
    // Remove all pending orders
    const pendingOrders = this.orderMatchingEngine.getPendingOrders();
    pendingOrders.forEach(order => this.orderMatchingEngine.removeOrder(order.id));

    // Reset bracket order system
    this.bracketOrderSystem.reset();

    this.updateState(draft => {
      draft.currentTime = 0 as UTCTimestamp;
      draft.currentBarIndex = 0;
      draft.accountBalance = draft.initialBalance;
      draft.orders = [];
      draft.trades = [];
      draft.openPositions.clear();
      draft.isRunning = false;
      draft.isPaused = false;
      draft.results = null;
      draft.strategyState = {};
      draft.indicators = {};
      draft.formingBar = null;
      draft.progressiveBarConfig = null;
    });
  }

  /**
   * Process next bar in the sequence
   */
  public processNextBar(): BacktestBarData | null {
    const { bars, currentBarIndex } = this.state;
    
    if (currentBarIndex >= bars.length) {
      this.stop();
      return null;
    }

    const currentBar = bars[currentBarIndex];
    if (!currentBar) {
      console.warn(`No bar found at index ${currentBarIndex}`);
      return null;
    }
    
    // Process orders using the order matching engine
    const matchingResult = this.orderMatchingEngine.processBar(currentBar);
    
    // Update state with bar progression and order fills
    this.updateState(draft => {
      draft.currentBarIndex = currentBarIndex + 1;
      draft.currentTime = currentBar.time;
    });

    // Process order fills and update state
    this.processOrderFills(matchingResult);

    this.emit(EngineEventType.BAR_PROCESSED, {
      bar: currentBar,
      barIndex: currentBarIndex,
      isLastBar: currentBarIndex === bars.length - 1,
      matchingResult
    });

    return currentBar;
  }

  /**
   * Process order fills from the matching engine
   */
  private processOrderFills(matchingResult: MatchingResult): void {
    // Process fills
    for (const fill of matchingResult.fills) {
      this.updateState(draft => {
        // Update order status
        const orderIndex = draft.orders.findIndex(o => o.id === fill.orderId);
        if (orderIndex !== -1) {
          const order = draft.orders[orderIndex];
          if (!order) return;
          
          if (fill.isComplete) {
            // Mark order as filled
            order.status = 'FILLED' as any;
            order.filledTime = fill.fillTime;
            order.filledPrice = fill.fillPrice;
            order.filledQuantity = order.quantity;
          } else {
            // Update partial fill
            order.status = 'PARTIALLY_FILLED' as any;
            order.filledQuantity = (order.filledQuantity || 0) + fill.fillQuantity;
            if (!order.filledTime) order.filledTime = fill.fillTime;
            if (!order.filledPrice) order.filledPrice = fill.fillPrice;
            order.quantity = fill.remainingQuantity;
          }
        }

        // Update account balance based on fill
        const fillValue = fill.fillPrice * fill.fillQuantity;
        if (fill.orderId.includes('BUY')) {
          draft.accountBalance -= fillValue;
        } else {
          draft.accountBalance += fillValue;
        }
      });

      // Notify bracket order system about the fill
      this.bracketOrderSystem.handleOrderFill(
        fill.orderId,
        fill.fillPrice,
        fill.fillQuantity,
        fill.fillTime,
        (order: Order) => this.submitOrder(order)
      );

      this.emit(EngineEventType.ORDER_FILLED, {
        fill,
        updatedBalance: this.state.accountBalance
      });
    }

    // Process cancelled orders
    for (const cancelledOrderId of matchingResult.cancelledOrders) {
      this.updateState(draft => {
        const orderIndex = draft.orders.findIndex(o => o.id === cancelledOrderId);
        if (orderIndex !== -1) {
          const order = draft.orders[orderIndex];
          if (order) {
            order.status = 'CANCELLED' as any;
          }
        }
      });

      this.emit(EngineEventType.ORDER_CANCELLED, {
        orderId: cancelledOrderId
      });
    }
  }

  /**
   * Update strategy-specific state
   */
  public updateStrategyState(strategyId: string, stateUpdate: Record<string, unknown>): void {
    this.updateState(draft => {
      if (!draft.strategyState[strategyId]) {
        draft.strategyState[strategyId] = {};
      }
      Object.assign(draft.strategyState[strategyId], stateUpdate);
    });
  }

  /**
   * Update indicators cache
   */
  public updateIndicators(indicators: Record<string, any>): void {
    this.updateState(draft => {
      Object.assign(draft.indicators, indicators);
    });
  }

  /**
   * Submit an order to the matching engine
   */
  public submitOrder(order: Order): void {
    // Add order to state
    this.updateState(draft => {
      draft.orders.push(order);
    });

    // Add order to matching engine
    this.orderMatchingEngine.addOrder(order);

    this.emit(EngineEventType.ORDER_SUBMITTED, { order });
  }

  /**
   * Submit a bracket order (entry + stop loss + take profit)
   */
  public submitBracketOrder(config: BracketOrderConfig): BracketOrder {
    const bracketOrder = this.bracketOrderSystem.createBracketOrder(
      config,
      this.state.currentTime,
      (order: Order) => this.submitOrder(order)
    );

    return bracketOrder;
  }

  /**
   * Cancel an order
   */
  public cancelOrder(orderId: string): boolean {
    const removed = this.orderMatchingEngine.removeOrder(orderId);
    
    if (removed) {
      this.updateState(draft => {
        const orderIndex = draft.orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
          const order = draft.orders[orderIndex];
          if (order) {
            order.status = 'CANCELLED' as any;
          }
        }
      });

      this.emit(EngineEventType.ORDER_CANCELLED, { orderId });
    }

    return removed;
  }

  /**
   * Get all pending orders from the matching engine
   */
  public getPendingOrders(): Order[] {
    return this.orderMatchingEngine.getPendingOrders();
  }

  /**
   * Get order fill history from the matching engine
   */
  public getOrderFillHistory(): OrderFill[] {
    return this.orderMatchingEngine.getFillHistory();
  }

  /**
   * Update order matching configuration
   */
  public updateOrderMatchingConfig(config: Partial<OrderMatchingConfig>): void {
    this.orderMatchingEngine.updateConfig(config);
  }

  /**
   * Get current order matching configuration
   */
  public getOrderMatchingConfig(): OrderMatchingConfig {
    return this.orderMatchingEngine.getConfig();
  }

  /**
   * Cancel a bracket order
   */
  public cancelBracketOrder(bracketOrderId: string): boolean {
    return this.bracketOrderSystem.cancelBracketOrder(
      bracketOrderId,
      (orderId: string) => this.cancelOrder(orderId)
    );
  }

  /**
   * Get all bracket orders
   */
  public getAllBracketOrders(): BracketOrder[] {
    return this.bracketOrderSystem.getAllBracketOrders();
  }

  /**
   * Get bracket order by ID
   */
  public getBracketOrder(bracketOrderId: string): BracketOrder | undefined {
    return this.bracketOrderSystem.getBracketOrder(bracketOrderId);
  }

  /**
   * Get bracket order by underlying order ID
   */
  public getBracketOrderByOrderId(orderId: string): BracketOrder | undefined {
    return this.bracketOrderSystem.getBracketOrderByOrderId(orderId);
  }

  /**
   * Get active OCO groups
   */
  public getActiveOCOGroups(): OCOGroup[] {
    return this.bracketOrderSystem.getActiveOCOGroups();
  }

  /**
   * Update account balance
   */
  public updateAccountBalance(newBalance: number): void {
    this.updateState(draft => {
      draft.accountBalance = newBalance;
    });
  }

  /**
   * Get current bar
   */
  public getCurrentBar(): BacktestBarData | null {
    const { bars, currentBarIndex } = this.state;
    const targetIndex = currentBarIndex - 1;
    if (targetIndex >= 0 && targetIndex < bars.length) {
      const bar = bars[targetIndex];
      return bar || null;
    }
    return null;
  }

  /**
   * Check if backtest is active
   */
  public isActive(): boolean {
    return this.state.isRunning && !this.state.isPaused;
  }

  /**
   * Get progress as percentage
   */
  public getProgress(): number {
    const { currentBarIndex, bars } = this.state;
    return bars.length > 0 ? (currentBarIndex / bars.length) * 100 : 0;
  }

  // ===============================
  // Progressive Bar Formation Methods
  // ===============================

  private currentTicks: SyntheticTick[] = [];
  private currentTickIndex: number = 0;
  private currentBarBeingProcessed: BacktestBarData | null = null;

  /**
   * Start progressive bar formation from lower timeframe data
   * This builds bars tick-by-tick according to industry standards
   */
  public startProgressiveBarFormation(timeframeMinutes: number = 1): void {
    const { bars, currentBarIndex, formingBar: currentFormingBar } = this.state;
    
    // Don't start if already forming a bar
    if (currentFormingBar && !currentFormingBar.isComplete) {
      console.log('🔨 Already forming a bar, skipping start');
      return;
    }
    
    console.log(`🔨 Starting progressive bar formation: barIndex=${currentBarIndex}, totalBars=${bars.length}`);
    
    if (currentBarIndex >= bars.length) {
      console.log('🔨 No more bars to process, stopping');
      this.stop();
      return;
    }

    // Get the target complete bar that we want to form progressively
    const targetBar = bars[currentBarIndex];
    if (!targetBar) {
      console.log('🔨 No target bar found');
      return;
    }

    console.log(`🔨 Target bar: open=${targetBar.open}, high=${targetBar.high}, low=${targetBar.low}, close=${targetBar.close}`);

    // Auto-configure progressive bar formation if not already configured
    let config = this.state.progressiveBarConfig;
    if (!config || !config.useRealData) {
      console.log('🔨 Auto-configuring progressive bar formation from loaded data...');
      config = this.autoConfigureProgressiveBarFormation();
      
      if (config) {
        this.updateState(draft => {
          draft.progressiveBarConfig = config;
        });
        console.log('🔨 Auto-configuration successful:', config);
      } else {
        console.warn('🔨 Auto-configuration failed, using synthetic fallback');
      }
    }

    // Calculate the timeframe duration in milliseconds
    const timeframeDurationMs = timeframeMinutes * 60 * 1000;
    
    // Initialize forming bar
    const formingBar: FormingBar = {
      time: targetBar.time,
      open: targetBar.open,
      high: targetBar.open, // Start with open price
      low: targetBar.open,  // Start with open price
      close: targetBar.open, // Start with open price
      volume: 0,
      tickCount: 0,
      isComplete: false,
      startTime: targetBar.time,
      expectedEndTime: (targetBar.time + timeframeDurationMs) as UTCTimestamp,
    };

    this.updateState(draft => {
      draft.formingBar = formingBar;
    });

    // Use real data if auto-configured successfully
    if (config && config.useRealData) {
      console.log('🔨 Using auto-detected real market data for progressive formation');
      // Load real market data asynchronously
      this.loadRealMarketDataForProgression(targetBar).then(() => {
        console.log(`🔨 Real data loaded: ${this.currentTicks.length} ticks`);
        // Emit bar formation started event after data is loaded
        this.emit(EngineEventType.BAR_FORMING, {
          targetBar,
          formingBar,
          expectedTicks: this.currentTicks.length,
        });
      }).catch(error => {
        console.error('🔨 Failed to load real data, using synthetic fallback:', error);
        this.generateProgressiveTicks(targetBar, timeframeDurationMs);
        this.emit(EngineEventType.BAR_FORMING, {
          targetBar,
          formingBar,
          expectedTicks: this.currentTicks.length,
        });
      });
    } else {
      console.log('🔨 Using synthetic tick generation (no auto-config or real data disabled)');
      // Generate synthetic ticks synchronously
      this.generateProgressiveTicks(targetBar, timeframeDurationMs);
      
      console.log(`🔨 Generated ${this.currentTicks.length} synthetic ticks`);

      // Emit bar formation started event
      this.emit(EngineEventType.BAR_FORMING, {
        targetBar,
        formingBar,
        expectedTicks: this.currentTicks.length,
      });
    }
  }

  /**
   * Generate progressive ticks that build a bar realistically
   * This follows industry standards for bar formation
   */
  private generateProgressiveTicks(targetBar: BacktestBarData, timeframeDurationMs: number): void {
    const ticks: SyntheticTick[] = [];
    const { open, high, low, close, volume = 1000 } = targetBar;
    
    // Calculate number of ticks based on timeframe and volatility
    const volatility = Math.abs(high - low) / open;
    const baseTickCount = Math.max(10, Math.floor(timeframeDurationMs / 1000)); // 1 tick per second minimum
    const volatilityAdjustment = Math.floor(volatility * 100); // More ticks for volatile periods
    const totalTicks = Math.min(300, baseTickCount + volatilityAdjustment); // Cap at 300 ticks
    
    const tickInterval = Math.max(1000, timeframeDurationMs / totalTicks); // Minimum 1 second between ticks
    const volumePerTick = volume / totalTicks;
    
    // Industry standard: Generate realistic price path
    const priceTargets = this.calculateRealisticPricePath(open, high, low, close);
    
    // Generate ticks that follow the realistic price path with unique timestamps
    let currentTimestamp = targetBar.time as number;
    
    for (let i = 0; i < totalTicks; i++) {
      const progress = i / (totalTicks - 1);
      const targetPrice = this.interpolatePricePath(priceTargets, progress);
      
      // Add some realistic noise around the target price
      const noise = (Math.random() - 0.5) * (high - low) * 0.01; // 1% of range
      const tickPrice = Math.max(low * 0.999, Math.min(high * 1.001, targetPrice + noise));
      
      const tick: SyntheticTick = {
        price: tickPrice,
        volume: volumePerTick * (0.8 + Math.random() * 0.4), // Vary volume ±20%
        timestamp: currentTimestamp as UTCTimestamp,
        tickType: i === 0 ? 'open' : i === totalTicks - 1 ? 'close' : 'synthetic',
        sequenceIndex: i,
      };
      
      ticks.push(tick);
      
      // Increment timestamp to ensure uniqueness
      currentTimestamp = (currentTimestamp + tickInterval) as UTCTimestamp;
    }
    
    // Ensure the final tick matches the target bar's close price exactly
    if (ticks.length > 0) {
      const lastTick = ticks[ticks.length - 1];
      if (lastTick) {
        lastTick.price = close;
        lastTick.tickType = 'close';
      }
    }
    
    console.log(`🔨 Generated ${ticks.length} progressive ticks with timestamps from ${ticks[0]?.timestamp} to ${ticks[ticks.length - 1]?.timestamp}`);
    
    this.currentTicks = ticks;
    this.currentTickIndex = 0;
  }

  /**
   * Calculate realistic price path following industry standards
   * This creates a path that hits high, low, and close in a realistic sequence
   */
  private calculateRealisticPricePath(open: number, high: number, low: number, close: number): number[] {
    const path: number[] = [open];
    
    // Determine the pattern based on price action
    if (close > open) {
      // Bullish bar: often goes down first, then up
      if (low < open * 0.999) {
        // Open -> Low -> High -> Close
        path.push(low, high, close);
      } else {
        // Open -> High -> Close (strong bullish)
        path.push(high, close);
      }
    } else if (close < open) {
      // Bearish bar: often goes up first, then down
      if (high > open * 1.001) {
        // Open -> High -> Low -> Close
        path.push(high, low, close);
      } else {
        // Open -> Low -> Close (strong bearish)
        path.push(low, close);
      }
    } else {
      // Doji/neutral: hit both extremes
      if (Math.random() > 0.5) {
        path.push(high, low, close);
      } else {
        path.push(low, high, close);
      }
    }
    
    return path;
  }

  /**
   * Interpolate along the realistic price path
   */
  private interpolatePricePath(path: number[], progress: number): number {
    if (path.length < 2) return path[0] || 0;
    
    const scaledProgress = progress * (path.length - 1);
    const segmentIndex = Math.floor(scaledProgress);
    const segmentProgress = scaledProgress - segmentIndex;
    
    if (segmentIndex >= path.length - 1) {
      return path[path.length - 1] || 0;
    }
    
    const startPrice = path[segmentIndex];
    const endPrice = path[segmentIndex + 1];
    
    if (startPrice === undefined || endPrice === undefined) {
      return path[0] || 0;
    }
    
    return startPrice + (endPrice - startPrice) * segmentProgress;
  }

  /**
   * Process next progressive tick and update forming bar
   */
  public processNextProgressiveTick(): { tick: SyntheticTick; formingBar: FormingBar; isBarComplete: boolean } | null {
    console.log(`🔨 processNextProgressiveTick: ticks=${this.currentTicks.length}, index=${this.currentTickIndex}`);
    
    if (this.currentTicks.length === 0 || this.currentTickIndex >= this.currentTicks.length) {
      console.log('🔨 No more ticks available');
      return null;
    }

    const tick = this.currentTicks[this.currentTickIndex];
    if (!tick) {
      console.log('🔨 No tick found at current index');
      return null;
    }
    
    console.log(`🔨 Processing tick ${this.currentTickIndex}: price=${tick.price}`);
    this.currentTickIndex++;

    // Update forming bar with new tick
    this.updateState(draft => {
      if (draft.formingBar) {
        draft.formingBar.high = Math.max(draft.formingBar.high, tick.price);
        draft.formingBar.low = Math.min(draft.formingBar.low, tick.price);
        draft.formingBar.close = tick.price;
        draft.formingBar.volume += tick.volume;
        draft.formingBar.tickCount++;
        draft.currentTime = tick.timestamp;
      }
    });

    const formingBar = this.state.formingBar;
    if (!formingBar) {
      console.log('🔨 No forming bar in state');
      return null;
    }

    // Check if bar is complete
    const isBarComplete = this.currentTickIndex >= this.currentTicks.length;
    
    if (isBarComplete) {
      console.log('🔨 Bar formation complete!');
      // Mark forming bar as complete and add to bars
      this.updateState(draft => {
        if (draft.formingBar) {
          draft.formingBar.isComplete = true;
          // Move to next bar
          draft.currentBarIndex++;
          // Reset forming bar state for next bar
          draft.formingBar = null;
        }
      });

      // Clear progressive tick state
      this.currentTicks = [];
      this.currentTickIndex = 0;

      this.emit(EngineEventType.BAR_COMPLETED, {
        completedBar: formingBar,
        barIndex: this.state.currentBarIndex - 1,
      });

      // Automatically start progressive formation for the next bar if available
      const { currentBarIndex, bars } = this.state;
      if (currentBarIndex < bars.length) {
        console.log(`🔨 Auto-starting progressive formation for next bar (${currentBarIndex + 1}/${bars.length})`);
        // Immediately start next bar formation for seamless progression
        this.startProgressiveBarFormation();
      } else {
        console.log('🔨 All bars completed, stopping backtest');
        this.stop();
      }
    } else {
      // Emit bar update event for progressive visualization
      this.emit(EngineEventType.BAR_UPDATE, {
        formingBar,
        tick,
        progress: (this.currentTickIndex / this.currentTicks.length) * 100,
      });
    }

    // Process orders against this tick
    this.processTickOrderFills(tick, {
      time: formingBar.time,
      open: formingBar.open,
      high: formingBar.high,
      low: formingBar.low,
      close: formingBar.close,
      volume: formingBar.volume,
    });

    console.log(`🔨 Returning tick result: isComplete=${isBarComplete}`);
    return { tick, formingBar, isBarComplete };
  }

  /**
   * Get current forming bar state
   */
  public getFormingBar(): FormingBar | null {
    return this.state.formingBar;
  }

  /**
   * Enable/disable progressive bar formation mode
   */
  public setProgressiveBarFormationMode(enabled: boolean): void {
    // Implementation depends on how the UI wants to control this
    // For now, we'll store this in strategy state
    this.updateStrategyState('_engine', { progressiveBarFormation: enabled });
  }

  // ===============================
  // Strategy Management Methods
  // ===============================

  /**
   * Register a strategy for execution
   */
  public registerStrategy(
    definition: StrategyDefinition,
    config?: Partial<StrategyConfig>
  ): void {
    this.strategyExecutor.registerStrategy(definition, config);
  }

  /**
   * Execute all registered strategies for the current bar
   */
  public executeStrategies(indicatorService: any): void {
    const { currentBarIndex, bars, accountBalance, initialBalance } = this.state;
    
    if (currentBarIndex >= bars.length) return;
    
    const currentBar = bars[currentBarIndex];
    if (!currentBar) {
      console.warn(`No current bar found at index ${currentBarIndex}`);
      return;
    }

    // Convert internal positions to strategy positions
    const openPositions: StrategyPosition[] = Array.from(this.state.openPositions.values()).map(trade => ({
      id: trade.id,
      symbol: 'DEFAULT', // Will be set by strategy config
      side: trade.type === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
      quantity: trade.size,
      entryPrice: trade.entryPrice,
      entryTime: trade.entryTime,
      currentPrice: currentBar.close,
      unrealizedPnL: this.calculateUnrealizedPnL(trade, currentBar.close),
      stopLossPrice: undefined, // TODO: Get from bracket order system
      takeProfitPrice: undefined, // TODO: Get from bracket order system
      hasActiveStopLoss: false, // TODO: Check bracket order system
      hasActiveTakeProfit: false, // TODO: Check bracket order system
    }));

    // Calculate performance metrics
    const totalTrades = this.state.trades.length;
    const winningTrades = this.state.trades.filter(t => (t.profitOrLoss || 0) > 0).length;
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const totalPnL = this.state.trades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);

    // Create strategy context
    const context: StrategyContext = {
      currentBar,
      currentBarIndex,
      currentTime: currentBar.time,
      bars: bars as ReadonlyArray<BacktestBarData>,
      accountBalance,
      initialBalance,
      openPositions: openPositions as ReadonlyArray<StrategyPosition>,
      positionValue: this.calculatePositionValue(openPositions, currentBar.close),
      unrealizedPnL: this.calculateTotalUnrealizedPnL(openPositions),
      strategyState: {},
      totalTrades,
      winRate,
      totalPnL,
    };

    // Get indicator values
    const indicatorValues = indicatorService?.getAllIndicators?.(bars.slice(0, currentBarIndex + 1)) || {};

    // Execute all registered strategies
    const registeredStrategies = this.strategyExecutor.getRegisteredStrategies();
    
    for (const strategyContext of registeredStrategies) {
      if (!strategyContext.isActive) continue;

      // Update context with strategy-specific state
      const contextWithState: StrategyContext = {
        ...context,
        strategyState: this.state.strategyState[strategyContext.definition.id] || {},
      };

      // Execute strategy
      const result = this.strategyExecutor.executeStrategy(
        strategyContext.definition.id,
        contextWithState,
        indicatorValues
      );

      if (result) {
        this.processStrategyResult(strategyContext.definition.id, result);
      }
    }
  }

  /**
   * Process the result from strategy execution
   */
  private processStrategyResult(strategyId: string, result: StrategyResult): void {
    // Update strategy state
    if (Object.keys(result.stateUpdates).length > 0) {
      this.updateStrategyState(strategyId, result.stateUpdates);
    }

    // Process actions
    for (const action of result.actions) {
      this.processStrategyAction(strategyId, action);
    }

    // Emit strategy signals event
    if (result.signals.length > 0) {
      this.emit('STRATEGY_SIGNALS' as any, {
        strategyId,
        signals: result.signals,
        barIndex: this.state.currentBarIndex,
      });
    }
  }

  /**
   * Process a single strategy action
   */
  private processStrategyAction(strategyId: string, action: any): void {
    const { type, payload } = action;

    switch (type) {
      case StrategyActionType.SUBMIT_ORDER:
        const orderPayload = payload as OrderActionPayload;
        const order: Order = {
          id: `${strategyId}_${this.eventId++}_${Date.now()}`,
          type: orderPayload.orderType,
          side: orderPayload.side,
          quantity: orderPayload.quantity,
          price: orderPayload.price,
          stopPrice: orderPayload.stopPrice,
          status: 'PENDING' as any,
          submittedTime: this.state.currentTime,
          contractId: orderPayload.symbol,
        };
        this.submitOrder(order);
        break;

      case StrategyActionType.SUBMIT_BRACKET_ORDER:
        const bracketPayload = payload as BracketOrderActionPayload;
        const bracketConfig: BracketOrderConfig = {
          ...bracketPayload,
          symbol: bracketPayload.symbol || 'DEFAULT',
        };
        this.submitBracketOrder(bracketConfig);
        break;

      case StrategyActionType.LOG_MESSAGE:
        const logPayload = payload as LogMessagePayload;
        console[logPayload.level](`[Strategy ${strategyId}] ${logPayload.message}`, logPayload.data);
        break;

      default:
        console.warn(`Unknown strategy action type: ${type}`);
    }
  }

  /**
   * Calculate unrealized P&L for a position
   */
  private calculateUnrealizedPnL(trade: SimulatedTrade, currentPrice: number): number {
    if (trade.type === TradeType.BUY) {
      return (currentPrice - trade.entryPrice) * trade.size;
    } else {
      return (trade.entryPrice - currentPrice) * trade.size;
    }
  }

  /**
   * Calculate total position value
   */
  private calculatePositionValue(positions: StrategyPosition[], currentPrice: number): number {
    return positions.reduce((total, pos) => total + (pos.quantity * currentPrice), 0);
  }

  /**
   * Calculate total unrealized P&L
   */
  private calculateTotalUnrealizedPnL(positions: StrategyPosition[]): number {
    return positions.reduce((total, pos) => total + pos.unrealizedPnL, 0);
  }

  /**
   * Get strategy executor (for testing/debugging)
   */
  public getStrategyExecutor(): StrategyExecutor {
    return this.strategyExecutor;
  }

  /**
   * Activate/deactivate a strategy
   */
  public setStrategyActive(strategyId: string, isActive: boolean): boolean {
    return this.strategyExecutor.setStrategyActive(strategyId, isActive);
  }

  /**
   * Update strategy configuration
   */
  public updateStrategyConfig(
    strategyId: string,
    configUpdates: Partial<StrategyConfig>
  ): boolean {
    return this.strategyExecutor.updateStrategyConfig(strategyId, configUpdates);
  }

  /**
   * Reset all strategies
   */
  public resetStrategies(): void {
    this.strategyExecutor.reset();
  }

  /**
   * Configure progressive bar formation with real market data
   */
  public configureProgressiveBarFormation(config: ProgressiveBarConfig): void {
    this.updateState(draft => {
      draft.progressiveBarConfig = config;
    });
    
    console.log(`🔨 Configured progressive bar formation:`, {
      baseTimeframe: config.baseTimeframe,
      sourceTimeframe: config.sourceTimeframe,
      contract: config.contract,
      useRealData: config.useRealData
    });
  }

  /**
   * Get current progressive bar configuration
   */
  public getProgressiveBarConfig(): ProgressiveBarConfig | null {
    return this.state.progressiveBarConfig;
  }

  /**
   * Load real market data for progressive bar formation
   * This uses actual lower timeframe data from the database
   */
  private async loadRealMarketDataForProgression(targetBar: BacktestBarData): Promise<void> {
    const config = this.state.progressiveBarConfig;
    if (!config || !config.useRealData) {
      console.warn('🔨 No progressive bar config or real data disabled, falling back to synthetic');
      this.generateProgressiveTicks(targetBar, 60 * 60 * 1000); // Default 1 hour
      return;
    }

    try {
      console.log(`🔨 Loading real market data for progressive formation`);
      console.log(`📊 Target bar: time=${new Date(targetBar.time).toISOString()}, OHLC=[${targetBar.open}, ${targetBar.high}, ${targetBar.low}, ${targetBar.close}]`);

      // Calculate the time range for the target bar
      const barStartTime = new Date(targetBar.time);
      const barEndTime = new Date(targetBar.time);
      
      // Determine bar duration based on base timeframe
      const baseTimeframe = config.baseTimeframe;
      if (baseTimeframe.endsWith('h')) {
        const hours = parseInt(baseTimeframe.slice(0, -1));
        barEndTime.setHours(barEndTime.getHours() + hours);
      } else if (baseTimeframe.endsWith('m')) {
        const minutes = parseInt(baseTimeframe.slice(0, -1));
        barEndTime.setMinutes(barEndTime.getMinutes() + minutes);
      } else if (baseTimeframe.endsWith('d')) {
        const days = parseInt(baseTimeframe.slice(0, -1));
        barEndTime.setDate(barEndTime.getDate() + days);
      }

      console.log(`🔨 Fetching ${config.sourceTimeframe} data from ${barStartTime.toISOString()} to ${barEndTime.toISOString()}`);

      // Query lower timeframe data for this time period
      const query: MarketDataQuery = {
        contract: config.contract,
        timeframe: config.sourceTimeframe,
        since: barStartTime.toISOString(),
        limit: 1000, // Should be enough for most timeframe combinations
      };

      const lowerTimeframeBars = await this.marketDataLoader.loadMarketData(query);
      
      // Filter to only bars within our target bar's time range
      const relevantBars = lowerTimeframeBars.filter(bar => {
        const barTime = new Date(bar.time);
        return barTime >= barStartTime && barTime < barEndTime;
      });

      console.log(`🔨 Found ${relevantBars.length} ${config.sourceTimeframe} bars for this ${config.baseTimeframe} period`);

      if (relevantBars.length === 0) {
        console.warn(`🔨 No ${config.sourceTimeframe} data found, trying fallback timeframes...`);
        
        // Try fallback timeframes in order of preference
        const fallbackTimeframes = this.getFallbackTimeframes(config.sourceTimeframe);
        let foundData = false;
        
        for (const fallbackTf of fallbackTimeframes) {
          console.log(`🔨 Trying fallback timeframe: ${fallbackTf}`);
          try {
            const fallbackQuery: MarketDataQuery = {
              ...query,
              timeframe: fallbackTf,
            };
            
            const fallbackBars = await this.marketDataLoader.loadMarketData(fallbackQuery);
            const fallbackRelevant = fallbackBars.filter(bar => {
              const barTime = new Date(bar.time);
              return barTime >= barStartTime && barTime < barEndTime;
            });
            
            if (fallbackRelevant.length > 0) {
              console.log(`🔨 Found ${fallbackRelevant.length} bars with fallback timeframe ${fallbackTf}`);
              this.convertLowerTimeframeBarsToTicks(fallbackRelevant, targetBar);
              foundData = true;
              break;
            }
          } catch (fallbackError) {
            console.warn(`🔨 Fallback timeframe ${fallbackTf} failed:`, fallbackError);
          }
        }
        
        if (!foundData) {
          console.warn('🔨 All fallback timeframes failed, using enhanced synthetic ticks');
          this.generateProgressiveTicks(targetBar, barEndTime.getTime() - barStartTime.getTime());
        }
        return;
      }

      // Convert lower timeframe bars to synthetic ticks for progressive display
      this.convertLowerTimeframeBarsToTicks(relevantBars, targetBar);

    } catch (error) {
      console.error('🔨 Error loading real market data for progression:', error);
      console.log('🔨 Falling back to synthetic tick generation');
      this.generateProgressiveTicks(targetBar, 60 * 60 * 1000); // Default 1 hour fallback
    }
  }

  /**
   * Convert lower timeframe bars to progressive ticks
   */
  private convertLowerTimeframeBarsToTicks(lowerBars: BacktestBarData[], targetBar: BacktestBarData): void {
    const ticks: SyntheticTick[] = [];
    
    console.log(`🔨 Converting ${lowerBars.length} lower timeframe bars to progressive ticks`);
    
    lowerBars.forEach((bar, index) => {
      // Create multiple ticks per lower timeframe bar for smoother progression
      const ticksPerBar = 3; // Open, mid, close for each lower bar
      const barDuration = 1000; // Assume 1 second between ticks within a bar
      
      for (let i = 0; i < ticksPerBar; i++) {
        const progress = i / (ticksPerBar - 1);
        let price: number;
        let tickType: 'open' | 'high' | 'low' | 'close' | 'synthetic';
        
        if (i === 0) {
          price = bar.open;
          tickType = 'open';
        } else if (i === ticksPerBar - 1) {
          price = bar.close;
          tickType = 'close';
        } else {
          // Middle tick - use average of high and low
          price = (bar.high + bar.low) / 2;
          tickType = 'synthetic';
        }
        
        const tick: SyntheticTick = {
          price,
          volume: (bar.volume || 1000) / ticksPerBar,
          timestamp: (bar.time + (i * barDuration)) as UTCTimestamp,
          tickType,
          sequenceIndex: index * ticksPerBar + i,
        };
        
        ticks.push(tick);
      }
    });

    // Ensure the final tick matches the target bar's close price
    if (ticks.length > 0) {
      const lastTick = ticks[ticks.length - 1];
      if (lastTick) {
        lastTick.price = targetBar.close;
        lastTick.tickType = 'close';
      }
    }

    console.log(`🔨 Created ${ticks.length} progressive ticks from real market data`);
    console.log(`📊 Price progression: ${ticks[0]?.price.toFixed(2)} → ${ticks[ticks.length - 1]?.price.toFixed(2)}`);
    
    this.currentTicks = ticks;
    this.currentTickIndex = 0;
  }

  /**
   * Automatically configure progressive bar formation based on loaded data
   */
  private autoConfigureProgressiveBarFormation(): ProgressiveBarConfig | null {
    const { bars } = this.state;
    
    if (!bars || bars.length === 0) {
      console.warn('🔨 No bars loaded, cannot auto-configure progressive formation');
      return null;
    }

    // Try to detect timeframe from loaded data
    const firstBar = bars[0] as any;
    const secondBar = bars[1] as any;
    
    if (!firstBar || !secondBar) {
      console.warn('🔨 Need at least 2 bars to detect timeframe');
      return null;
    }

    // Calculate time difference between bars to detect timeframe
    const timeDiff = Math.abs(secondBar.time - firstBar.time);
    const timeDiffMinutes = timeDiff / (60 * 1000);
    
    let detectedTimeframe: string;
    let sourceTimeframe: string;
    
    // Auto-detect timeframe and choose appropriate source
    // Use more realistic mappings based on commonly available data
    if (timeDiffMinutes <= 1) {
      detectedTimeframe = '1m';
      sourceTimeframe = '1m'; // Fallback to synthetic for 1-minute bars
    } else if (timeDiffMinutes <= 5) {
      detectedTimeframe = '5m';
      sourceTimeframe = '1m'; // Use 1-minute for 5-minute bars
    } else if (timeDiffMinutes <= 15) {
      detectedTimeframe = '15m';
      sourceTimeframe = '5m'; // Use 5-minute for 15-minute bars (more likely to exist)
    } else if (timeDiffMinutes <= 30) {
      detectedTimeframe = '30m';
      sourceTimeframe = '5m'; // Use 5-minute for 30-minute bars
    } else if (timeDiffMinutes <= 60) {
      detectedTimeframe = '1h';
      sourceTimeframe = '15m'; // Use 15-minute for 1-hour bars (more commonly available)
    } else if (timeDiffMinutes <= 240) {
      detectedTimeframe = '4h';
      sourceTimeframe = '1h'; // Use 1-hour for 4-hour bars (more likely to exist)
    } else if (timeDiffMinutes <= 1440) {
      detectedTimeframe = '1d';
      sourceTimeframe = '1h'; // Use 1-hour for daily bars
    } else {
      detectedTimeframe = '1w';
      sourceTimeframe = '1d'; // Use daily for weekly bars
    }

    // Try to detect contract from loaded data
    const detectedContract = firstBar?.contractId || firstBar?.symbol || 'ES';
    
    // Extract just the symbol part if it's a full contract ID
    let contractSymbol = detectedContract;
    if (typeof contractSymbol === 'string' && contractSymbol.includes('.')) {
      // Extract symbol from formats like "CON.F.US.ES" -> "ES"
      const parts = contractSymbol.split('.');
      contractSymbol = parts[parts.length - 1] || 'ES';
    }

    const config: ProgressiveBarConfig = {
      baseTimeframe: detectedTimeframe,
      sourceTimeframe: sourceTimeframe,
      contract: contractSymbol,
      useRealData: true,
    };

    console.log(`🔨 Auto-configured progressive bar formation:`, {
      detectedTimeframe,
      sourceTimeframe,
      contractSymbol,
      timeDiffMinutes: timeDiffMinutes.toFixed(2)
    });

    return config;
  }

  /**
   * Get fallback timeframes to try when preferred timeframe data is not available
   */
  private getFallbackTimeframes(sourceTimeframe: string): string[] {
    const timeframeHierarchy = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    const currentIndex = timeframeHierarchy.indexOf(sourceTimeframe);
    
    if (currentIndex === -1) {
      // Unknown timeframe, return common fallbacks
      return ['5m', '15m', '1h'];
    }
    
    // Return timeframes in order: same level, then higher levels, then lower levels
    const fallbacks: string[] = [];
    
    // Add higher timeframes first (more likely to exist)
    for (let i = currentIndex + 1; i < timeframeHierarchy.length; i++) {
      fallbacks.push(timeframeHierarchy[i]!);
    }
    
    // Add lower timeframes second
    for (let i = currentIndex - 1; i >= 0; i--) {
      fallbacks.push(timeframeHierarchy[i]!);
    }
    
    return fallbacks;
  }

  /**
   * Process order fills for a specific tick (used by progressive mode)
   */
  private processTickOrderFills(tick: SyntheticTick, bar: BacktestBarData): void {
    // Get pending orders
    const pendingOrders = this.orderMatchingEngine.getPendingOrders();
    
    // Process each order against this specific tick
    for (const order of pendingOrders) {
      const fillResult = this.attemptTickOrderFill(order, tick, bar);
      if (fillResult) {
        this.processIndividualOrderFill(fillResult);
      }
    }
  }

  /**
   * Attempt to fill an order against a specific tick
   */
  private attemptTickOrderFill(order: Order, tick: SyntheticTick, bar: BacktestBarData): any | null {
    // Use the order matching engine's logic but for a single tick
    // This is a simplified version - the full logic is in OrderMatchingEngine
    const canFill = this.canOrderFillAtTick(order, tick);
    if (!canFill) return null;

    const fillPrice = tick.price;
    const fillQuantity = order.quantity; // Simplified - full logic would consider partial fills
    
    return {
      orderId: order.id,
      fillPrice,
      fillQuantity,
      fillTime: tick.timestamp,
      fillReason: 'tick_fill',
      slippage: 0,
      latency: 0,
      remainingQuantity: 0,
      isComplete: true,
    };
  }

  /**
   * Check if an order can fill at a specific tick
   */
  private canOrderFillAtTick(order: Order, tick: SyntheticTick): boolean {
    switch (order.type) {
      case 'MARKET' as any:
        return true;
      case 'LIMIT' as any:
        if (order.side === 'BUY' as any) {
          return tick.price <= (order.price || 0);
        } else {
          return tick.price >= (order.price || 0);
        }
      case 'STOP' as any:
        if (order.side === 'BUY' as any) {
          return tick.price >= (order.stopPrice || 0);
        } else {
          return tick.price <= (order.stopPrice || 0);
        }
      default:
        return false;
    }
  }

  /**
   * Process a single order fill
   */
  private processIndividualOrderFill(fill: any): void {
    this.updateState(draft => {
      // Update order status
      const orderIndex = draft.orders.findIndex(o => o.id === fill.orderId);
      if (orderIndex !== -1) {
        const order = draft.orders[orderIndex];
        if (order) {
          order.status = 'FILLED' as any;
          order.filledTime = fill.fillTime;
          order.filledPrice = fill.fillPrice;
          order.filledQuantity = fill.fillQuantity;
        }
      }

      // Update account balance
      const fillValue = fill.fillPrice * fill.fillQuantity;
      if (fill.orderId.includes('BUY')) {
        draft.accountBalance -= fillValue;
      } else {
        draft.accountBalance += fillValue;
      }
    });

    // Remove filled order from matching engine
    this.orderMatchingEngine.removeOrder(fill.orderId);

    // Emit fill event
    this.emit(EngineEventType.ORDER_FILLED, {
      fill,
      updatedBalance: this.state.accountBalance
    });
  }
}