import { BacktestBarData, SubBarData, Order, OrderStatus, OrderType, OrderSide } from './types/backtester';
import { IStrategy } from './types/strategy';
import { cache } from './Cache';
import { OrderManager } from './OrderManager';
import { MessageBus, MessageType as MessageBusMessageType } from './MessageBus';
import { Cache } from './Cache';
import { UTCTimestamp } from 'lightweight-charts';

export interface BacktestConfig {
  initialBalance: number;
  commission: number;
  slippage: number;
  symbol: string;
  timeframe: string;
  startDate?: Date;
  endDate?: Date;
}

export interface BacktestState {
  currentBarIndex: number;
  isRunning: boolean;
  isPaused: boolean;
  progress: number;
  startTime?: number;
  endTime?: number;
}

// Event types for the backtest engine
export enum BacktestEventType {
  MARKET_DATA = 'MARKET_DATA',
  SIGNAL = 'SIGNAL',
  ORDER = 'ORDER',
  FILL = 'FILL',
  PROGRESS = 'PROGRESS',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  STOP = 'STOP'
}

// Base event interface
export interface BacktestEvent {
  type: BacktestEventType;
  timestamp: number;
  data: any;
}

// Specific event types
export interface MarketDataEvent extends BacktestEvent {
  type: BacktestEventType.MARKET_DATA;
  data: {
    bar: BacktestBarData;
    subBars?: SubBarData[];
    barIndex: number;
  };
}

export interface ProgressEvent extends BacktestEvent {
  type: BacktestEventType.PROGRESS;
  data: {
    currentBar: number;
    totalBars: number;
    percentComplete: number;
    currentTime: UTCTimestamp;
  };
}

// Engine state
export enum EngineState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR'
}

// Configuration for the backtest engine
export interface BacktestEngineConfig {
  initialCapital: number;
  commission?: number;
  slippage?: number;
  progressUpdateInterval?: number; // How often to emit progress updates (in bars)
}

export class BacktestEngine {
  private config: BacktestConfig;
  private state: BacktestState;
  private strategies: Map<string, IStrategy> = new Map();
  private orderManager: OrderManager;
  private mainBars: BacktestBarData[] = [];
  private subBars: SubBarData[] = [];
  private subscriptions: Array<() => void> = [];
  private messageBus: MessageBus;
  private cache: Cache;
  private eventQueue: BacktestEvent[] = [];
  private currentBarIndex: number = 0;
  private totalBars: number = 0;
  private processInterval: NodeJS.Timeout | null = null;
  private progressUpdateCounter: number = 0;

  constructor(
    messageBus: MessageBus,
    cache: Cache,
    config: BacktestConfig
  ) {
    this.config = config;
    this.state = {
      currentBarIndex: 0,
      isRunning: false,
      isPaused: false,
      progress: 0,
    };
    
    this.orderManager = new OrderManager(config.slippage);
    this.messageBus = messageBus;
    this.cache = cache;
    this.setupMessageBusHandlers();
  }

  private setupMessageBusHandlers(): void {
    // Subscribe to strategy signals
    const signalSub = this.messageBus.subscribe(MessageBusMessageType.SIGNAL_GENERATED, (msg) => {
      this.handleStrategySignal(msg.data);
    });
    this.subscriptions.push(signalSub.unsubscribe);

    // Subscribe to order submissions from strategies
    const orderSub = this.messageBus.subscribe(MessageBusMessageType.SUBMIT_ORDER, (msg) => {
      this.submitOrder(msg.data.order);
    });
    this.subscriptions.push(orderSub.unsubscribe);

    // Subscribe to order cancellations
    const cancelSub = this.messageBus.subscribe(MessageBusMessageType.CANCEL_ORDER, (msg) => {
      this.cancelOrder(msg.data.orderId);
    });
    this.subscriptions.push(cancelSub.unsubscribe);
  }

  /**
   * Add a strategy to the backtest
   */
  addStrategy(strategyId: string, strategy: IStrategy): void {
    if (this.state.isRunning) {
      throw new Error('Cannot add strategy while backtest is running');
    }
    
    this.strategies.set(strategyId, strategy);
    
    // Initialize strategy state in cache
    cache.setStrategyState(strategyId, {
      id: strategyId,
      name: strategy.getName(),
      status: 'INITIALIZED',
    });
    
    this.messageBus.publish(MessageBusMessageType.STRATEGY_STARTED, 'BacktestEngine', {
      strategyId,
      strategyName: strategy.getName(),
    });
  }

  /**
   * Remove a strategy from the backtest
   */
  removeStrategy(strategyId: string): void {
    if (this.state.isRunning) {
      throw new Error('Cannot remove strategy while backtest is running');
    }
    
    const strategy = this.strategies.get(strategyId);
    if (strategy) {
      strategy.reset();
      this.strategies.delete(strategyId);
      
      this.messageBus.publish(MessageBusMessageType.STRATEGY_STOPPED, 'BacktestEngine', {
        strategyId,
        strategyName: strategy.getName(),
      });
    }
  }

  /**
   * Load market data for backtesting
   */
  async loadData(mainBars: BacktestBarData[], subBars?: SubBarData[]): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Cannot load data while backtest is running');
    }
    
    this.mainBars = mainBars;
    this.subBars = subBars || [];
    
    // Store initial bars in cache
    mainBars.forEach(bar => {
      cache.addBar(this.config.symbol, this.config.timeframe, bar);
    });

    this.totalBars = mainBars.length;
    this.currentBarIndex = 0;
  }

  /**
   * Run the backtest
   */
  async run(): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Backtest is already running');
    }
    
    if (this.mainBars.length === 0) {
      throw new Error('No data loaded for backtest');
    }
    
    this.state.isRunning = true;
    this.state.startTime = Date.now();
    
    try {
      // Reset all components
      this.reset();
      
      // Process each bar
      for (let i = 0; i < this.mainBars.length; i++) {
        if (!this.state.isRunning || this.state.isPaused) {
          break;
        }
        
        this.state.currentBarIndex = i;
        this.state.progress = (i + 1) / this.mainBars.length * 100;
        
        await this.processBar(i);
      }
      
      // Finalize backtest
      this.finalize();
      
    } finally {
      this.state.isRunning = false;
      this.state.endTime = Date.now();
    }
  }

  /**
   * Process a single bar
   */
  private async processBar(barIndex: number): Promise<void> {
    const mainBar = this.mainBars[barIndex];
    const relevantSubBars = this.subBars.filter(sb => sb.parentBarIndex === barIndex);
    
    // Publish bar data to message bus
    this.messageBus.publish(MessageBusMessageType.BAR_RECEIVED, 'BacktestEngine', {
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      bar: mainBar,
      barIndex,
    });
    
    // Process orders with OrderManager
    const filledOrders = this.orderManager.processBar(mainBar, relevantSubBars, barIndex);
    
    // Publish filled orders
    filledOrders.forEach(order => {
      this.messageBus.publish(MessageBusMessageType.ORDER_FILLED, 'BacktestEngine', {
        orderId: order.id,
        filledPrice: order.filledPrice,
        filledTime: order.filledTime,
        filledQuantity: order.filledQuantity,
        commission: order.commission,
      });
    });
    
    // Process each strategy
    for (const [strategyId, strategy] of this.strategies) {
      try {
        const result = await strategy.processBar(mainBar, relevantSubBars, barIndex, this.mainBars);
        
        // Update indicators in cache
        if (result.indicators) {
          Object.entries(result.indicators).forEach(([name, value]) => {
            if (typeof value === 'number') {
              cache.updateIndicator(strategyId, name, value);
            }
          });
        }
        
        // Handle any signals generated
        if (result.signal) {
          this.messageBus.publish(MessageBusMessageType.SIGNAL_GENERATED, strategyId, {
            strategyId,
            signal: result.signal,
            barIndex,
          });
        }
      } catch (error) {
        console.error(`Error processing bar for strategy ${strategyId}:`, error);
      }
    }
  }

  /**
   * Handle strategy signals
   */
  private handleStrategySignal(data: any): void {
    // This is where you could implement additional signal processing
    // For now, strategies handle their own order generation
  }

  /**
   * Submit an order
   */
  private submitOrder(order: Order): void {
    // Add order to OrderManager
    this.orderManager.submitOrder(order);
    
    // Update cache
    cache.addOrder(order);
    
    // Publish order submitted event
    this.messageBus.publish(MessageBusMessageType.ORDER_SUBMITTED, 'BacktestEngine', {
      order,
    });
  }

  /**
   * Cancel an order
   */
  private cancelOrder(orderId: string): void {
    const order = cache.getOrder(orderId);
    if (order && order.status === OrderStatus.PENDING) {
      // Cancel in OrderManager
      this.orderManager.cancelOrder(orderId);
      
      // Update cache
      cache.updateOrderStatus(orderId, OrderStatus.CANCELLED);
      
      // Publish cancellation event
      this.messageBus.publish(MessageBusMessageType.ORDER_CANCELLED, 'BacktestEngine', {
        orderId,
      });
    }
  }

  /**
   * Pause the backtest
   */
  pause(): void {
    this.state.isPaused = true;
  }

  /**
   * Resume the backtest
   */
  resume(): void {
    this.state.isPaused = false;
  }

  /**
   * Stop the backtest
   */
  stop(): void {
    this.state.isRunning = false;
  }

  /**
   * Reset the backtest engine
   */
  private reset(): void {
    // Reset cache
    cache.reset();
    
    // Reset order manager
    this.orderManager.reset();
    
    // Reset all strategies
    this.strategies.forEach(strategy => strategy.reset());
    
    // Reset state
    this.state.currentBarIndex = 0;
    this.state.progress = 0;
  }

  /**
   * Finalize the backtest
   */
  private finalize(): void {
    // Close any open positions
    const openPositions = cache.getOpenPositions();
    if (openPositions.length > 0 && this.mainBars.length > 0) {
      const lastBar = this.mainBars[this.mainBars.length - 1];
      
      openPositions.forEach(position => {
        this.messageBus.publish(MessageBusMessageType.POSITION_CLOSED, 'BacktestEngine', {
          positionId: position.id,
          closePrice: lastBar.close,
          closeTime: lastBar.time,
          reason: 'BACKTEST_END',
        });
      });
    }
    
    // Calculate final metrics
    const results = this.calculateResults();
    
    // Store results in cache
    cache.setStrategyState('BACKTEST_RESULTS', results);
  }

  /**
   * Calculate backtest results
   */
  private calculateResults(): any {
    const trades = cache.getClosedPositions();
    const equityCurve = cache.getEquityCurve();
    
    // Calculate metrics
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.profitOrLoss || 0) > 0).length;
    const losingTrades = trades.filter(t => (t.profitOrLoss || 0) < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    const totalPnL = trades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0);
    const avgWin = winningTrades > 0 
      ? trades.filter(t => (t.profitOrLoss || 0) > 0).reduce((sum, t) => sum + (t.profitOrLoss || 0), 0) / winningTrades 
      : 0;
    const avgLoss = losingTrades > 0 
      ? trades.filter(t => (t.profitOrLoss || 0) < 0).reduce((sum, t) => sum + (t.profitOrLoss || 0), 0) / losingTrades 
      : 0;
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = equityCurve[0];
    for (const equity of equityCurve) {
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnL,
      avgWin,
      avgLoss,
      maxDrawdown,
      profitFactor: Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 0,
      expectancy: totalTrades > 0 ? totalPnL / totalTrades : 0,
      equityCurve,
      finalBalance: cache.getBalance(),
      totalEquity: cache.getTotalEquity(),
      executionTime: this.state.endTime ? this.state.endTime - this.state.startTime! : 0,
    };
  }

  /**
   * Get current state
   */
  getState(): BacktestState {
    return { ...this.state };
  }

  /**
   * Get backtest results
   */
  getResults(): any {
    return cache.getStrategyState('BACKTEST_RESULTS');
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Unsubscribe from all message bus events
    this.subscriptions.forEach(unsub => unsub());
    this.subscriptions = [];
    
    // Stop all strategies
    this.strategies.forEach((strategy, id) => {
      this.removeStrategy(id);
    });
    
    // Clear data
    this.mainBars = [];
    this.subBars = [];
  }
} 