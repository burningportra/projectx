import { MessageBus, MessageType } from './MessageBus';
import { Cache } from './Cache';
import { IStrategy } from './types/strategy';
import { BacktestBarData, SubBarData, BacktestResults } from './types/backtester';
import { UTCTimestamp } from 'lightweight-charts';

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

export class BacktestEngineV2 {
  private messageBus: MessageBus;
  private cache: Cache;
  private strategies: Map<string, IStrategy> = new Map();
  private state: EngineState = EngineState.IDLE;
  private eventQueue: BacktestEvent[] = [];
  private currentBarIndex: number = 0;
  private totalBars: number = 0;
  private config: BacktestEngineConfig;
  private processInterval: NodeJS.Timeout | null = null;
  private progressUpdateCounter: number = 0;

  constructor(
    messageBus: MessageBus,
    cache: Cache,
    config: BacktestEngineConfig
  ) {
    this.messageBus = messageBus;
    this.cache = cache;
    this.config = {
      progressUpdateInterval: 10, // Default: update progress every 10 bars
      ...config
    };
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Subscribe to relevant MessageBus events
    this.messageBus.subscribe(MessageType.SIGNAL_GENERATED, (message) => {
      this.enqueueEvent({
        type: BacktestEventType.SIGNAL,
        timestamp: Date.now(),
        data: message.data
      });
    });

    this.messageBus.subscribe(MessageType.ORDER_SUBMITTED, (message) => {
      this.enqueueEvent({
        type: BacktestEventType.ORDER,
        timestamp: Date.now(),
        data: message.data
      });
    });

    this.messageBus.subscribe(MessageType.ORDER_FILLED, (message) => {
      this.enqueueEvent({
        type: BacktestEventType.FILL,
        timestamp: Date.now(),
        data: message.data
      });
    });
  }

  // Public API methods
  public addStrategy(id: string, strategy: IStrategy): void {
    if (this.state !== EngineState.IDLE) {
      throw new Error('Cannot add strategies while engine is running');
    }
    this.strategies.set(id, strategy);
    this.messageBus.publish(MessageType.STRATEGY_STARTED, 'BacktestEngine', {
      strategyId: id,
      strategyName: strategy.getName()
    });
  }

  public removeStrategy(id: string): void {
    if (this.state !== EngineState.IDLE) {
      throw new Error('Cannot remove strategies while engine is running');
    }
    const strategy = this.strategies.get(id);
    if (strategy) {
      this.strategies.delete(id);
      this.messageBus.publish(MessageType.STRATEGY_STOPPED, 'BacktestEngine', {
        strategyId: id,
        strategyName: strategy.getName()
      });
    }
  }

  public async loadData(bars: BacktestBarData[], subBars?: SubBarData[]): Promise<void> {
    if (this.state !== EngineState.IDLE) {
      throw new Error('Cannot load data while engine is running');
    }

    // Store bars in cache
    bars.forEach(bar => {
      this.cache.addBar('DEFAULT', '1m', bar);
    });

    if (subBars) {
      // Store sub-bars with appropriate timeframe
      subBars.forEach(subBar => {
        this.cache.addBar('DEFAULT', 'sub', subBar);
      });
    }

    this.totalBars = bars.length;
    this.currentBarIndex = 0;
  }

  public async start(): Promise<void> {
    if (this.state !== EngineState.IDLE && this.state !== EngineState.PAUSED) {
      throw new Error(`Cannot start engine from state: ${this.state}`);
    }

    if (this.strategies.size === 0) {
      throw new Error('No strategies added to engine');
    }

    if (this.totalBars === 0) {
      throw new Error('No data loaded');
    }

    this.state = EngineState.RUNNING;
    this.startEventLoop();
  }

  public pause(): void {
    if (this.state !== EngineState.RUNNING) {
      throw new Error('Can only pause when running');
    }
    this.state = EngineState.PAUSED;
    this.stopEventLoop();
    
    this.enqueueEvent({
      type: BacktestEventType.PAUSE,
      timestamp: Date.now(),
      data: { barIndex: this.currentBarIndex }
    });
  }

  public resume(): void {
    if (this.state !== EngineState.PAUSED) {
      throw new Error('Can only resume when paused');
    }
    this.state = EngineState.RUNNING;
    this.startEventLoop();
    
    this.enqueueEvent({
      type: BacktestEventType.RESUME,
      timestamp: Date.now(),
      data: { barIndex: this.currentBarIndex }
    });
  }

  public stop(): void {
    if (this.state === EngineState.IDLE || this.state === EngineState.STOPPED) {
      return;
    }
    
    this.state = EngineState.STOPPED;
    this.stopEventLoop();
    
    this.enqueueEvent({
      type: BacktestEventType.STOP,
      timestamp: Date.now(),
      data: { barIndex: this.currentBarIndex }
    });
    
    // Reset strategies
    this.strategies.forEach(strategy => strategy.reset());
    
    // Clear event queue
    this.eventQueue = [];
    this.currentBarIndex = 0;
  }

  public getState(): EngineState {
    return this.state;
  }

  public getProgress(): { current: number; total: number; percent: number } {
    const percent = this.totalBars > 0 ? (this.currentBarIndex / this.totalBars) * 100 : 0;
    return {
      current: this.currentBarIndex,
      total: this.totalBars,
      percent: Math.round(percent * 100) / 100
    };
  }

  public getResults(): BacktestResults {
    // Aggregate results from cache
    const closedPositions = this.cache.getClosedPositions();
    const totalPnL = closedPositions.reduce((sum, pos) => sum + (pos.profitOrLoss || 0), 0);
    const winningTrades = closedPositions.filter(pos => (pos.profitOrLoss || 0) > 0);
    const losingTrades = closedPositions.filter(pos => (pos.profitOrLoss || 0) < 0);
    
    return {
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalProfitOrLoss: totalPnL,
      winRate: closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0,
      averageWin: winningTrades.length > 0 ? 
        winningTrades.reduce((sum, pos) => sum + (pos.profitOrLoss || 0), 0) / winningTrades.length : 0,
      averageLoss: losingTrades.length > 0 ?
        Math.abs(losingTrades.reduce((sum, pos) => sum + (pos.profitOrLoss || 0), 0) / losingTrades.length) : 0,
      profitFactor: 0, // TODO: Calculate
      maxDrawdown: 0, // TODO: Calculate
      sharpeRatio: 0, // TODO: Calculate
      trades: closedPositions
    };
  }

  // Event processing
  private enqueueEvent(event: BacktestEvent): void {
    this.eventQueue.push(event);
  }

  private startEventLoop(): void {
    if (this.processInterval) {
      return;
    }

    this.processInterval = setInterval(() => {
      if (this.state === EngineState.RUNNING) {
        this.processNextBar();
      }
    }, 0); // Process as fast as possible
  }

  private stopEventLoop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  private async processNextBar(): Promise<void> {
    if (this.currentBarIndex >= this.totalBars) {
      this.complete();
      return;
    }

    // Get current bar from cache
    const bars = this.cache.getBars('DEFAULT', '1m');
    const currentBar = bars[this.currentBarIndex];
    
    if (!currentBar) {
      console.error(`No bar found at index ${this.currentBarIndex}`);
      this.currentBarIndex++;
      return;
    }

    // Get sub-bars if available
    const subBars = this.cache.getBars('DEFAULT', 'sub')
      .filter((bar: any) => bar.parentBarIndex === this.currentBarIndex) as SubBarData[];

    // Create market data event
    const marketEvent: MarketDataEvent = {
      type: BacktestEventType.MARKET_DATA,
      timestamp: Date.now(),
      data: {
        bar: currentBar,
        subBars: subBars.length > 0 ? subBars : undefined,
        barIndex: this.currentBarIndex
      }
    };

    // Process the market data event
    await this.processMarketDataEvent(marketEvent);

    // Process any queued events
    while (this.eventQueue.length > 0 && this.state === EngineState.RUNNING) {
      const event = this.eventQueue.shift()!;
      await this.processEvent(event);
    }

    // Update progress
    this.progressUpdateCounter++;
    if (this.progressUpdateCounter >= this.config.progressUpdateInterval!) {
      this.emitProgress();
      this.progressUpdateCounter = 0;
    }

    this.currentBarIndex++;
  }

  private async processMarketDataEvent(event: MarketDataEvent): Promise<void> {
    const { bar, subBars, barIndex } = event.data;

    // Publish bar received event
    this.messageBus.publish(MessageType.BAR_RECEIVED, 'BacktestEngine', {
      symbol: 'DEFAULT',
      timeframe: '1m',
      bar,
      barIndex
    });

    // Process bar with each strategy
    const allBars = this.cache.getBars('DEFAULT', '1m');
    
    for (const [strategyId, strategy] of this.strategies) {
      try {
        await strategy.processBar(bar, subBars, barIndex, allBars);
      } catch (error) {
        console.error(`Error processing bar for strategy ${strategyId}:`, error);
        this.enqueueEvent({
          type: BacktestEventType.ERROR,
          timestamp: Date.now(),
          data: {
            strategyId,
            error: error instanceof Error ? error.message : 'Unknown error',
            barIndex
          }
        });
      }
    }
  }

  private async processEvent(event: BacktestEvent): Promise<void> {
    switch (event.type) {
      case BacktestEventType.SIGNAL:
        // Signals are already handled by strategies and OrderManager
        break;
      
      case BacktestEventType.ORDER:
        // Orders are already handled by OrderManager
        break;
      
      case BacktestEventType.FILL:
        // Fills are already handled by OrderManager
        break;
      
      case BacktestEventType.ERROR:
        console.error('Backtest error:', event.data);
        break;
      
      default:
        console.warn('Unknown event type:', event.type);
    }
  }

  private emitProgress(): void {
    const progress = this.getProgress();
    const bars = this.cache.getBars('DEFAULT', '1m');
    const currentBar = bars[this.currentBarIndex];
    
    const progressEvent: ProgressEvent = {
      type: BacktestEventType.PROGRESS,
      timestamp: Date.now(),
      data: {
        currentBar: this.currentBarIndex,
        totalBars: this.totalBars,
        percentComplete: progress.percent,
        currentTime: currentBar?.time || 0 as UTCTimestamp
      }
    };

    // Publish progress update
    this.messageBus.publish('BACKTEST_PROGRESS' as any, 'BacktestEngine', progressEvent.data);
  }

  private complete(): void {
    this.state = EngineState.STOPPED;
    this.stopEventLoop();

    // Calculate final results
    const results = this.getResults();

    // Publish completion event
    this.messageBus.publish('BACKTEST_COMPLETE' as any, 'BacktestEngine', {
      results,
      totalBars: this.totalBars,
      strategies: Array.from(this.strategies.keys())
    });

    this.enqueueEvent({
      type: BacktestEventType.COMPLETE,
      timestamp: Date.now(),
      data: { results }
    });
  }

  // Cleanup
  public dispose(): void {
    this.stop();
    this.strategies.clear();
    this.eventQueue = [];
  }
} 