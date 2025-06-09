import { MessageBus, MessageType } from './MessageBus';
import { Cache } from './Cache';
import { EventHandlers } from './EventHandlers';
import { IStrategy, StrategyResult } from './types/strategy';
import { OrderManager } from './OrderManager';
import { 
  BacktestBarData, 
  SubBarData, 
  Order, 
  BacktestResults,
  SimulatedTrade,
  StrategySignalType,
  OrderStatus
} from './types/backtester';

export interface BacktestState {
  openTrade: SimulatedTrade | null;
  pendingOrders: Order[];
  filledOrders: Order[];
  cancelledOrders: Order[];
  backtestResults: BacktestResults | null;
  currentIndicators: Record<string, number | Record<string, number>>;
  tradeMarkers: any[];
}

export class BacktestEngineAdapter {
  private messageBus: MessageBus;
  private cache: Cache;
  private eventHandlers: EventHandlers;
  private stateChangeCallbacks: ((state: BacktestState) => void)[] = [];
  private orderManager: OrderManager;

  constructor(
    orderManager: OrderManager,
    initialBalance: number = 100000
  ) {
    this.orderManager = orderManager;
    this.messageBus = new MessageBus();
    this.cache = new Cache(initialBalance);
    this.eventHandlers = new EventHandlers();
    
    // IMPORTANT: EventHandlers uses singleton messageBus and cache
    // We need to ensure our instances are used instead
    // For now, we'll manually handle the event processing
    
    // Intercept OrderManager events from singleton messageBus
    this.setupOrderManagerInterception();

    // Subscribe to cache changes
    this.cache.subscribe('*', () => {
      this.notifyStateChange();
    });

    // Subscribe to relevant events for UI updates
    this.messageBus.subscribe(MessageType.ORDER_SUBMITTED, (message) => {
      // Store order in cache
      if (message.data.order) {
        this.cache.addOrder(message.data.order);
      }
      this.notifyStateChange();
    });

    this.messageBus.subscribe(MessageType.ORDER_FILLED, (message) => {
      // Update order status in cache
      if (message.data.orderId && message.data.status) {
        this.cache.updateOrderStatus(message.data.orderId, message.data.status, message.data);
      }
      this.notifyStateChange();
    });

    this.messageBus.subscribe(MessageType.ORDER_CANCELLED, () => {
      this.notifyStateChange();
    });

    this.messageBus.subscribe(MessageType.POSITION_OPENED, (message) => {
      // Add position to cache
      if (message.data.position) {
        this.cache.addOpenPosition(message.data.position);
      }
      this.notifyStateChange();
    });

    this.messageBus.subscribe(MessageType.POSITION_CLOSED, (message) => {
      // Close position in cache
      const { positionId, closePrice, closeTime } = message.data;
      if (positionId && closePrice !== undefined && closeTime !== undefined) {
        this.cache.closePosition(positionId, closePrice, closeTime);
      }
      this.notifyStateChange();
    });

    this.messageBus.subscribe(MessageType.SIGNAL_GENERATED, (message) => {
      // Store signal in cache for the strategy
      const { signal, strategyName } = message.data;
      const currentState = this.cache.getStrategyState(strategyName) || { signals: [] };
      currentState.signals.push(signal);
      this.cache.setStrategyState(strategyName, currentState);
      this.notifyStateChange();
    });
  }

  public async processBar(
    strategy: IStrategy,
    mainBar: BacktestBarData,
    subBars: SubBarData[],
    barIndex: number,
    allBars: BacktestBarData[],
    symbol: string = 'DEFAULT',
    timeframe: string = '1m'
  ): Promise<void> {
    // Add bar to cache
    this.cache.addBar(symbol, timeframe, mainBar);

    // Process bar with strategy
    const result = await strategy.processBar(mainBar, subBars, barIndex, allBars);

    // Update indicators in cache
    if (result.indicators) {
      Object.entries(result.indicators).forEach(([name, value]) => {
        if (typeof value === 'number') {
          this.cache.updateIndicator(strategy.getName(), name, value);
        }
      });
    }

    // Handle any signals generated
    if (result.signal) {
      this.messageBus.publish(MessageType.SIGNAL_GENERATED, strategy.getName(), {
        signal: result.signal,
        strategyName: strategy.getName(),
        timestamp: mainBar.time,
        barIndex,
      });
    }
  }

  public reset(strategy: IStrategy): void {
    // Reset all components
    this.cache.reset();
    strategy.reset();
    this.orderManager.reset();
    this.notifyStateChange();
  }

  public getState(): BacktestState {
    // Get all orders
    const allOrders: Order[] = [];
    [OrderStatus.PENDING, OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED].forEach(status => {
      allOrders.push(...this.cache.getOrdersByStatus(status));
    });
    
    const openPositions = this.cache.getOpenPositions();
    const openPosition = openPositions.length > 0 ? openPositions[0] : null;
    
    // Build trade markers from signals stored by strategy
    const strategyStates = Array.from(this.cache['state'].strategyStates.values());
    const allSignals: any[] = [];
    
    // Collect signals from all strategies
    strategyStates.forEach(state => {
      if (state && state.signals) {
        allSignals.push(...state.signals);
      }
    });
    
    const tradeMarkers = allSignals.map((signal: any) => {
      return {
        time: signal.timestamp || signal.time,
        position: signal.type === StrategySignalType.BUY || signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: signal.type === StrategySignalType.BUY || signal.type === 'BUY' ? '#26a69a' : '#ef5350',
        shape: signal.type === StrategySignalType.BUY || signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: '',
        size: 1,
      };
    }).filter(Boolean);

    // Calculate backtest results
    const closedPositions = this.cache.getClosedPositions();
    const totalPnL = closedPositions.reduce((sum: number, p: any) => sum + (p.profitOrLoss || 0), 0);
    const winningTrades = closedPositions.filter((p: any) => (p.profitOrLoss || 0) > 0);
    const winRate = closedPositions.length > 0 
      ? (winningTrades.length / closedPositions.length) * 100 
      : 0;

    const backtestResults: BacktestResults = {
      trades: closedPositions.map((p: any) => ({
        id: p.id,
        entryTime: p.entryTime!,
        exitTime: p.exitTime!,
        entryPrice: p.entryPrice,
        exitPrice: p.exitPrice!,
        type: p.type,
        size: p.size,
        profitOrLoss: p.profitOrLoss || 0,
        commission: 0, // TODO: Track commission
        status: 'CLOSED' as const,
      })),
      totalProfitOrLoss: totalPnL,
      winRate,
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: closedPositions.length - winningTrades.length,
      maxDrawdown: 0, // TODO: Calculate
      sharpeRatio: 0, // TODO: Calculate
      profitFactor: 0, // TODO: Calculate
    };

    return {
      openTrade: openPosition ? {
        id: openPosition.id,
        entryPrice: openPosition.entryPrice,
        entryTime: openPosition.entryTime!,
        type: openPosition.type,
        size: openPosition.size,
        status: 'OPEN' as const,
        stopLossOrder: allOrders.find((o: Order) => 
          o.parentTradeId === openPosition.id && 
          o.isStopLoss === true &&
          o.status === OrderStatus.PENDING
        ),
        takeProfitOrder: allOrders.find((o: Order) => 
          o.parentTradeId === openPosition.id && 
          o.isTakeProfit === true &&
          o.status === OrderStatus.PENDING
        ),
      } : null,
      pendingOrders: allOrders.filter((o: Order) => o.status === OrderStatus.PENDING),
      filledOrders: allOrders.filter((o: Order) => o.status === OrderStatus.FILLED),
      cancelledOrders: allOrders.filter((o: Order) => o.status === OrderStatus.CANCELLED),
      backtestResults,
      currentIndicators: (() => {
        // Get indicators from all strategies
        const allIndicators: Record<string, number | Record<string, number>> = {};
        const indicatorMaps = this.cache['state'].indicators;
        
        indicatorMaps.forEach((indicatorMap, strategyId) => {
          indicatorMap.forEach((value, key) => {
            allIndicators[key] = value;
          });
        });
        
        return allIndicators;
      })(),
      tradeMarkers,
    };
  }

  public onStateChange(callback: (state: BacktestState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  private notifyStateChange(): void {
    const state = this.getState();
    this.stateChangeCallbacks.forEach(cb => cb(state));
  }

  public getMessageBus(): MessageBus {
    return this.messageBus;
  }

  public getCache(): Cache {
    return this.cache;
  }

  private setupOrderManagerInterception(): void {
    // Import singleton messageBus to intercept OrderManager events
    const { messageBus: singletonBus } = require('./MessageBus');
    
    // Forward OrderManager events from singleton to our instance
    singletonBus.subscribe(MessageType.ORDER_SUBMITTED, (message: any) => {
      if (message.source === 'OrderManager') {
        this.messageBus.publish(MessageType.ORDER_SUBMITTED, message.source, message.data);
      }
    });
    
    singletonBus.subscribe(MessageType.ORDER_FILLED, (message: any) => {
      if (message.source === 'OrderManager') {
        this.messageBus.publish(MessageType.ORDER_FILLED, message.source, message.data);
      }
    });
    
    singletonBus.subscribe(MessageType.ORDER_CANCELLED, (message: any) => {
      if (message.source === 'OrderManager') {
        this.messageBus.publish(MessageType.ORDER_CANCELLED, message.source, message.data);
      }
    });
    
    singletonBus.subscribe(MessageType.POSITION_OPENED, (message: any) => {
      if (message.source === 'OrderManager') {
        this.messageBus.publish(MessageType.POSITION_OPENED, message.source, message.data);
      }
    });
    
    singletonBus.subscribe(MessageType.POSITION_CLOSED, (message: any) => {
      if (message.source === 'OrderManager') {
        this.messageBus.publish(MessageType.POSITION_CLOSED, message.source, message.data);
      }
    });
  }
} 