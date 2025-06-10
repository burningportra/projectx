import { 
  BacktestBarData, 
  StrategySignal, 
  StrategySignalType, 
  SimulatedTrade,
  TradeType,
  Order,
  OrderType,
  OrderSide,
  UTCTimestamp,
  OrderStatus,
  SubBarData
} from '@/lib/types/backtester';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier, TrendStartSignal as TrendLibSignal } from '@/lib/trend-analysis/TrendIdentifier';
import { BaseStrategy } from './BaseStrategy';
import { BaseStrategyConfig, StrategyResult } from '../types/strategy';
import { MessageBus, MessageType, Message, Subscription } from '@/lib/MessageBus';
import { TrendStartStrategyConfig } from './config/TrendStartStrategyConfig';
import { TrendStartStrategyState } from './state/TrendStartStrategyState';
import { ITrendStartStrategy } from './interfaces/ITrendStartStrategy';

// Strategy's internal representation of a trend signal it might act upon
interface StrategyTrendSignal extends TrendLibSignal {}

// TrendStartStrategy specific configuration - now using the dedicated config class
export { TrendStartStrategyConfig };

// Indicators specific to this strategy
export interface TrendStartStatusIndicators {
  trendDirection: 'UP' | 'DOWN' | 'NONE';
  lastSignalTime: UTCTimestamp;
  lastSignalType: 'CUS' | 'CDS' | 'NONE';
  lastSignalRule: string;
}

/**
 * Refactored TrendStartStrategy focusing on a clear, backtest-driven `processBar` loop.
 * Event-driven lifecycle methods have been removed/stubbed to prevent state conflicts during backtesting.
 */
export class TrendStartStrategyRefactored extends BaseStrategy implements ITrendStartStrategy {
  private trendIdentifier: TrendIdentifier;
  
  private state: TrendStartStrategyState;
  protected readonly config: TrendStartStrategyConfig;

  constructor(
    config: Partial<TrendStartStrategyConfig>,
    orderManager: OrderManager,
    trendIdentifier: TrendIdentifier
  ) {
    const strategyConfig = new TrendStartStrategyConfig(config);
    super(orderManager, strategyConfig);
    this.config = strategyConfig;
    this.trendIdentifier = trendIdentifier;
    this.state = new TrendStartStrategyState();
  }

  // ========== Interface Compliance ==========

  public getConfig(): TrendStartStrategyConfig {
    return this.config;
  }

  public getStrategyId(): string {
    return this.config.strategyId;
  }

  // Stubbed lifecycle methods to satisfy the interface for backtesting context
  public initialize(): void { console.log(`[${this.getName()}] initialize() called (no-op for backtest).`); }
  public dispose(): void { console.log(`[${this.getName()}] dispose() called (no-op for backtest).`); }
  public getLifecycleState(): string { return this.state.isReady() ? 'STARTED' : 'STOPPED'; }
  public isReady(): boolean { return this.state.isReady(); }

  // ========== Core Logic ==========

  private onSignal(signal: TrendLibSignal): void {
    if (!this.state.isReady()) return;
    this._processTrendSignal(signal);
  }

  private _processTrendSignal(signal: TrendLibSignal): void {
    const tracked = this.state.trackSignal(signal);
    if (!tracked) return;
    this._evaluateSignalForTrading(signal);
  }

  private _evaluateSignalForTrading(signal: StrategyTrendSignal): void {
    const isInPosition = this.isInPosition();
    const openTrade = this.getOpenTrade();

    if (openTrade && openTrade.status === 'PENDING') return;

    if (!isInPosition) {
      if (this._shouldEnterPosition(signal, signal.confidence ?? 0)) {
        this._initiatePositionOpen(signal);
      }
    } else {
      if (this._shouldExitPosition(signal, openTrade)) {
        this._initiatePositionClose(openTrade!, signal, 'REVERSAL_SIGNAL');
      }
    }
  }

  private _shouldEnterPosition(signal: StrategyTrendSignal, confidence: number): boolean {
    const isUptrendSignal = signal.type === StrategySignalType.CONFIRMED_UPTREND_START;
    const meetsThreshold = confidence >= this.config.confidenceThreshold;
    return isUptrendSignal && meetsThreshold;
  }

  private _shouldExitPosition(signal: StrategyTrendSignal, currentTrade: SimulatedTrade | null): boolean {
    // For this simplified version, we only exit via SL/TP, not reversal signals.
    return false;
  }

  private _initiatePositionOpen(signal: StrategyTrendSignal): void {
    const existingTrade = this.state.getOpenTrade();
    if (existingTrade && existingTrade.status === 'PENDING') {
      this.orderManager.cancelOrdersByTradeId(existingTrade.id);
      this.state.setOpenTrade(null);
      this.openTrade = null;
    }

    const signalBarIndex = signal.barIndex;
    const allBars = this.state.getAllBars();
    const signalBar = allBars[signalBarIndex];
    const currentBar = this.state.getCurrentBar();
    if (!signalBar || !currentBar) return;

    const quantity = this.calculatePositionSize(currentBar);
    if (quantity <= 0) return;

    const trackedSignals = this.state.getTrackedSignals();
    const previousCDS = trackedSignals
      .filter(s => s.type === StrategySignalType.CONFIRMED_DOWNTREND_START && s.barIndex < signalBarIndex)
      .sort((a, b) => b.barIndex - a.barIndex)[0];

    const limitPrice = signalBar.open;
    const stopLossPrice = signalBar.low;
    const takeProfitPrice = previousCDS ? allBars[previousCDS.barIndex].open : signalBar.open * 1.02;

    console.log(`[${this.getName()}] Initiating position open:`, {
      signal,
      signalBar,
      limitPrice,
      stopLossPrice,
      takeProfitPrice,
      previousCDS
    });

    const newTrade = this.createTrade(TradeType.BUY, limitPrice, quantity, currentBar.time);
    
    // Store custom prices on the trade object AND on the base class's openTrade
    (newTrade as any).plannedStopLoss = stopLossPrice;
    (newTrade as any).plannedTakeProfit = takeProfitPrice;
    if (this.openTrade) {
      (this.openTrade as any).plannedStopLoss = stopLossPrice;
      (this.openTrade as any).plannedTakeProfit = takeProfitPrice;
    }
    
    console.log(`[${this.getName()}] Setting custom prices on trade ${newTrade.id}:`, {
      plannedStopLoss: stopLossPrice,
      plannedTakeProfit: takeProfitPrice,
      signalBar,
      previousCDS,
      tradeReferences: {
        newTrade: newTrade,
        openTrade: this.openTrade,
        stateOpenTrade: this.state.getOpenTrade()
      }
    });

    const order = this.createLimitOrder(
      OrderSide.BUY,
      quantity,
      limitPrice, // Use original price
      currentBar,
      newTrade.id,
      this.config.contractId,
      true // isEntry
    );

    // Set the entry order on the trade so onOrderFilled can match it
    newTrade.entryOrder = order;
    if (this.openTrade) {
      this.openTrade.entryOrder = order;
    }
    const stateTrade = this.state.getOpenTrade();
    if (stateTrade) {
      stateTrade.entryOrder = order;
    }

    console.log(`[${this.getName()}] Creating limit order for trade ${newTrade.id} at price ${limitPrice}`);
    console.log(`[${this.getName()}] Created order ${order.id} for trade ${newTrade.id}, set as entryOrder`);
  }

  private _initiatePositionClose(trade: SimulatedTrade, signal: StrategyTrendSignal, reason: string): void {
    const currentBar = this.state.getCurrentBar();
    if (!currentBar) return;
    const exitSide = trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY;
    this.orderManager.cancelOrdersByTradeId(trade.id);
    const order = this.createMarketOrder(exitSide, trade.size, currentBar, trade.id, this.config.contractId, false, true);
    // Note: createMarketOrder already calls orderManager.submitOrder internally
  }

  public async processBar(
    mainBar: BacktestBarData,
    subBarsForMainBar: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> {
    this.state.updateCurrentBar(mainBar);
    this.state.updateAllBars(allMainBars);
    this.state.setReady();

    console.log(`[${this.getName()}] Processing bar ${barIndex}:`, {
      time: mainBar.time,
      open: mainBar.open,
      high: mainBar.high,
      low: mainBar.low,
      close: mainBar.close,
      pendingOrders: this.orderManager.getPendingOrders().map(o => ({
        id: o.id,
        type: o.type,
        side: o.side,
        price: o.price,
        canFill: o.type === 'LIMIT' && o.side === 'BUY' ? mainBar.low <= (o.price || 0) : false
      }))
    });

    const filledOrders = this.orderManager.processBar(mainBar, subBarsForMainBar, barIndex);
    
    console.log(`[${this.getName()}] After processBar:`, {
      filledOrdersCount: filledOrders.length,
      filledOrderIds: filledOrders.map(o => o.id),
      completedTradesCount: this.orderManager.getCompletedTrades().length,
      completedTrades: this.orderManager.getCompletedTrades().map(t => ({
        id: t.id,
        status: t.status,
        pnl: t.profitOrLoss
      }))
    });
    
    filledOrders.forEach(order => {
      const openTrade = this.getOpenTrade();
      console.log(`[${this.getName()}] Before onOrderFilled - Trade state:`, {
        orderId: order.id,
        tradeId: openTrade?.id,
        hasPlannedStopLoss: openTrade ? (openTrade as any).plannedStopLoss !== undefined : false,
        plannedStopLoss: openTrade ? (openTrade as any).plannedStopLoss : undefined,
        hasPlannedTakeProfit: openTrade ? (openTrade as any).plannedTakeProfit !== undefined : false,
        plannedTakeProfit: openTrade ? (openTrade as any).plannedTakeProfit : undefined
      });
      this.onOrderFilled(order, openTrade || undefined);
    });

    const signals = await this.trendIdentifier.getSignalsForRange(allMainBars, barIndex, this.config.contractId, this.config.timeframe);
    
    // Debug: Log signals to check for duplicates
    if (signals.length > 0) {
      console.log(`[${this.getName()}] Signals from TrendIdentifier at bar ${barIndex}:`, signals.map(s => ({
        type: s.type,
        barIndex: s.barIndex,
        confidence: s.confidence,
        rule: s.rule
      })));
    }
    
    // Process each signal only once
    const processedSignals = new Set<string>();
    signals.forEach((signal: TrendLibSignal) => {
      const signalKey = `${signal.type}-${signal.barIndex}`;
      if (!processedSignals.has(signalKey)) {
        processedSignals.add(signalKey);
        this.onSignal(signal);
      } else {
        console.warn(`[${this.getName()}] Duplicate signal detected and skipped:`, signalKey);
      }
    });

    return { 
      signal: null,
      indicators: this.getCurrentIndicators() || {}, 
      filledOrders
    };
  }

  protected validateStrategySpecificConfig(config: BaseStrategyConfig): void {
    super.validateStrategySpecificConfig(config); 
    const specificConfig = config as TrendStartStrategyConfig;
    if (specificConfig.confidenceThreshold < 0 || specificConfig.confidenceThreshold > 1) {
      throw new Error("confidenceThreshold must be between 0 and 1.");
    }
  }
  
  protected onReset(): void {
    super.onReset(); 
    this.state.reset();
    this.trendIdentifier.resetState(); 
  }

  protected createTrade(type: TradeType, initialEntryPriceGuess: number, size: number, entryTime: UTCTimestamp, entryOrder?: Order, entrySignal?: StrategySignal): SimulatedTrade {
    const trade = super.createTrade(type, initialEntryPriceGuess, size, entryTime, entryOrder, entrySignal);
    this.state.setOpenTrade(trade);
    this.openTrade = trade;
    
    // Don't log here as custom properties haven't been set yet
    
    return trade;
  }

  public isInPosition(): boolean {
    return this.state.isInPosition();
  }

  protected placeProtectiveOrders(trade: SimulatedTrade, entryFill: Order): void {
    console.log(`[${this.getName()}] placeProtectiveOrders called for trade ${trade.id}`);
    
    const plannedStopLoss = (trade as any).plannedStopLoss;
    const plannedTakeProfit = (trade as any).plannedTakeProfit;
    
    console.log(`[${this.getName()}] Reading custom prices from trade object:`, {
      tradeId: trade.id,
      plannedStopLoss,
      plannedTakeProfit,
      tradeObject: trade,
      customProps: {
        plannedStopLoss: (trade as any).plannedStopLoss,
        plannedTakeProfit: (trade as any).plannedTakeProfit
      }
    });
    
    if (!plannedStopLoss) {
      console.warn(`[${this.getName()}] No planned stop loss for trade ${trade.id}, skipping protective orders`);
      return;
    }

    const quantity = entryFill.filledQuantity || trade.size;
    const currentBar = this.state.getCurrentBar();
    if (!currentBar) {
      console.warn(`[${this.getName()}] No current bar available, cannot place protective orders`);
      return;
    }

    console.log(`[${this.getName()}] Creating stop loss order at ${plannedStopLoss} for quantity ${quantity}`);
    const slOrder = this.createStopOrder(OrderSide.SELL, quantity, plannedStopLoss, currentBar, trade.id, entryFill.contractId, true);
    trade.stopLossOrder = slOrder; // createStopOrder already submits to orderManager
    console.log(`[${this.getName()}] Stop loss order created: ${slOrder.id}`);

    if (plannedTakeProfit) {
      console.log(`[${this.getName()}] Creating take profit order at ${plannedTakeProfit} for quantity ${quantity}`);
      const tpOrder = this.createTakeProfitOrder(OrderSide.SELL, quantity, plannedTakeProfit, currentBar, trade.id, entryFill.contractId);
      trade.takeProfitOrder = tpOrder; // createTakeProfitOrder already submits to orderManager
      console.log(`[${this.getName()}] Take profit order created: ${tpOrder.id}`);
    } else {
      console.log(`[${this.getName()}] No take profit price set for trade ${trade.id}`);
    }
  }
  
  // Override onOrderFilled to ensure state is properly managed
  protected onOrderFilled(filledOrder: Order, currentConceptualTrade?: SimulatedTrade): void {
    console.log(`[${this.getName()}] onOrderFilled called:`, {
      orderId: filledOrder.id,
      isEntry: filledOrder.isEntry,
      tradeId: currentConceptualTrade?.id,
      tradeEntryOrderId: currentConceptualTrade?.entryOrder?.id,
      matchesEntryOrder: filledOrder.id === currentConceptualTrade?.entryOrder?.id,
      customPrices: currentConceptualTrade ? {
        plannedStopLoss: (currentConceptualTrade as any).plannedStopLoss,
        plannedTakeProfit: (currentConceptualTrade as any).plannedTakeProfit
      } : null
    });
    
    // Call base class implementation
    super.onOrderFilled(filledOrder, currentConceptualTrade);
    
    // If this was an exit order, ensure our state is cleared
    if (filledOrder.isExit || filledOrder.isStopLoss || filledOrder.isTakeProfit) {
      if (currentConceptualTrade && (
        (currentConceptualTrade.stopLossOrder && filledOrder.id === currentConceptualTrade.stopLossOrder.id) ||
        (currentConceptualTrade.takeProfitOrder && filledOrder.id === currentConceptualTrade.takeProfitOrder.id)
      )) {
        console.log(`[${this.getName()}] Clearing state after exit order fill`);
        this.state.setOpenTrade(null);
      }
    }
  }
  
  // Method stubs and getters to satisfy interface and provide read-only access
  public getName(): string { return this.config.name || 'TrendStartStrategyRefactored'; }
  public getDescription(): string { return 'Event-driven strategy trading on trend start signals.'; }
  public getVersion(): string { return '2.1.0-simplified'; }
  public getTrendSignals(): ReadonlyArray<TrendLibSignal> { return this.state.getTrackedSignals(); }
  public getOpenTrade(): SimulatedTrade | null { return this.state.getOpenTrade(); }
  public getStateSnapshot() {
    const snapshot = this.state.getSnapshot();
    const lastSignal = snapshot.signals.trackedSignals.length > 0
      ? snapshot.signals.trackedSignals[snapshot.signals.trackedSignals.length - 1]
      : null;
      
    return {
      marketData: snapshot.marketData,
      signals: {
        lastSignal: lastSignal,
        signalCount: snapshot.signals.signalCount,
        lastSignalTime: snapshot.signals.lastSignalTime || null,
      },
      position: snapshot.position,
      performance: snapshot.performance,
    };
  }
  public getPerformanceMetrics() {
    const trades = this.getTrades();
    const winningTrades = trades.filter(t => (t.profitOrLoss || 0) > 0);
    const losingTrades = trades.filter(t => (t.profitOrLoss || 0) < 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0));
    const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? Infinity : 0);

    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;
    trades.forEach(trade => {
      runningPnL += trade.profitOrLoss || 0;
      if (runningPnL > peak) peak = runningPnL;
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    const returns = trades.map(t => t.profitOrLoss || 0);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    return {
      totalPnL: runningPnL,
      winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
    };
  }
  public getHealthStatus() { return { isHealthy: true, lastActivityTime: null, errorCount: 0, warningCount: 0, uptime: 0 }; }
  public getStatistics() { return { eventsProcessed: 0, signalsGenerated: 0, ordersSubmitted: 0, tradesCompleted: 0, lastUpdateTime: null }; }
} 