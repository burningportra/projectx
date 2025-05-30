import { 
  BacktestBarData, 
  StrategySignal, 
  StrategySignalType, 
  SimulatedTrade,
  TradeType,
  BacktestResults,
  Order,
  OrderType,
  OrderSide,
  StrategyConfig,
  UTCTimestamp,
  OrderStatus,
  OrderManagerState
} from '@/lib/types/backtester';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier, TrendStartSignal as TrendLibSignal, TrendIdentificationState } from '@/lib/trend-analysis/TrendIdentifier';

// Strategy's internal representation of a trend signal it might act upon
// This might be slightly different from TrendLibSignal if the strategy adds its own context
interface StrategyTrendSignal extends TrendLibSignal {}

// Represents the strategy's view of an open logical trade/position
// This helps manage SL/TP orders related to a specific entry concept.
interface StrategyManagedTrade {
  id: string; // Corresponds to ManagedPosition.id in OrderManager
  entrySignalBarIndex: number;
  entrySignalPrice: number; // Price at which original signal occurred
  entryOrder?: Order; // The primary entry order that opened/initiated this logical trade
  stopLossOrder?: Order;
  takeProfitOrder?: Order;
  currentManagedPositionId?: string; // The ID of the actual position in OrderManager
  initialQuantity: number; // Quantity for this logical trade segment
  side: OrderSide; // Added side to StrategyManagedTrade
}

export interface TrendStartStrategyConfig extends StrategyConfig {
  minConfirmationBars?: number; // Minimum bars to confirm trend
  confidenceThreshold?: number; // Minimum confidence for signals (0-1)
  useOpenCloseStrategy?: boolean; // Use open/close limit order strategy
  limitOrderOffsetTicks?: number; // Offset for limit orders in ticks
}

// Re-export or alias TrendStartSignal from the library if the strategy uses it directly
export type { TrendStartSignal } from '@/lib/trend-analysis/TrendIdentifier';

export interface TrendIndicators {
  trendDirection: 'UP' | 'DOWN' | 'NONE';
  trendStrength?: number;
  lastSignal?: StrategyTrendSignal; // Use the strategy's version or the library's
}

export class TrendStartStrategy {
  private config: TrendStartStrategyConfig;
  private signals: StrategySignal[] = [];
  private completedTradesLog: SimulatedTrade[] = []; // Now explicitly SimulatedTrade for compatibility
  
  private activeStrategyTrade: StrategyManagedTrade | null = null;
  private logicalTradeIdCounter = 1;

  private trackedTrendSignals: StrategyTrendSignal[] = []; // Signals the strategy has noted
  private currentTrendDirection: 'UP' | 'DOWN' | 'NONE' = 'NONE'; // Strategy's view of the trend
  
  private orderManager: OrderManager;
  private trendIdentifier: TrendIdentifier; // Instance of the new library
  
  constructor(config: Partial<TrendStartStrategyConfig> = {}, orderManagerInstance?: OrderManager, trendIdentifierInstance?: TrendIdentifier) {
    this.config = {
      commission: 2.50,
      positionSize: 1,
      stopLossPercent: 2.0, // 2% stop loss
      takeProfitPercent: 4.0, // 4% take profit
      useMarketOrders: true, // Use market orders by default for easier fills
      limitOrderOffset: 2, // Standard offset
      minConfirmationBars: 2,
      confidenceThreshold: 0.6, // Lower threshold to 60% for more signals
      useOpenCloseStrategy: false, // Disable complex strategy initially
      limitOrderOffsetTicks: 1, // Conservative 1 tick offset
      ...config
    };
    this.orderManager = orderManagerInstance || new OrderManager(0.25); // ES mini tick size
    this.trendIdentifier = trendIdentifierInstance || new TrendIdentifier();
  }

  // Process a single bar and generate signals - now uses forward testing with OrderManager
  public async processBar(
    bar: BacktestBarData, 
    barIndex: number, 
    allBars: BacktestBarData[], 
    contractId: string = 'UNKNOWN', 
    timeframe: string = '1h'
  ): Promise<{
    signal: StrategySignal | null;
    indicators: TrendIndicators;
    filledOrders: Order[];
  }> {
    // Process any pending orders first
    const filledOrders = this.orderManager.processBar(bar, barIndex);
    
    // Handle filled orders
    for (const order of filledOrders) {
      this.handleOrderFill(order, bar);
    }

    // Step 1: Get trend signals from TrendIdentifier
    const identifiedSignals = await this.trendIdentifier.getSignalsForRange(allBars, barIndex, contractId, timeframe);
    const newSignalsForAction = this.processNewTrendSignals(identifiedSignals);
    const latestSignalForAction = newSignalsForAction[newSignalsForAction.length - 1];
    
    let chartSignal: StrategySignal | null = null;
    
    // Step 2: Get current position from OrderManager
    const currentPosition = this.orderManager.getOpenPosition(contractId);
    
    // Step 3: Process signals and make trading decisions
    if (latestSignalForAction) {
      const confidence = latestSignalForAction.confidence || 0;
      
      // Check if we should exit current position
      if (this.shouldExitPosition(latestSignalForAction, currentPosition)) {
        // Log the completed trade before closing
        if (currentPosition) {
          this.logCompletedTrade(currentPosition, bar.open, bar.time, `${latestSignalForAction.type} signal`, contractId);
        }
        
        chartSignal = this.closePosition({
          id: currentPosition!.id, 
          size: currentPosition!.size, 
          side: currentPosition!.side, 
          contractId: currentPosition!.contractId
        }, bar, `${latestSignalForAction.type} received`);
      }
      
      // Check if we should enter new position
      if (this.shouldEnterPosition(latestSignalForAction, currentPosition, confidence)) {
        // If we have a contrary position, close it first
        if (currentPosition && currentPosition.side !== OrderSide.BUY) {
          this.logCompletedTrade(currentPosition, bar.open, bar.time, `${latestSignalForAction.type} signal - reversing`, contractId);
          this.closePosition({
            id: currentPosition.id, 
            size: currentPosition.size, 
            side: currentPosition.side, 
            contractId: currentPosition.contractId
          }, bar, `${latestSignalForAction.type} received - reversing`);
        }
        
        // Open new position
        const side = latestSignalForAction.type === 'CUS' ? OrderSide.BUY : OrderSide.SELL;
        chartSignal = this.openNewPosition(latestSignalForAction, bar, contractId, allBars, side);
      }
    }
    
    const indicators: TrendIndicators = {
      trendDirection: this.currentTrendDirection,
      lastSignal: this.trackedTrendSignals[this.trackedTrendSignals.length - 1],
      trendStrength: this.trackedTrendSignals[this.trackedTrendSignals.length - 1]?.confidence
    };
    
    return { signal: chartSignal, indicators, filledOrders };
  }

  // Handle order fill events
  private handleOrderFill(order: Order, bar: BacktestBarData): void {
    // console.log(`[TrendStartStrategy] Order filled: ${order.id} at ${order.filledPrice}`);
    
    if (order.isStopLoss && this.activeStrategyTrade) {
      // Stop loss was hit - close the position
      // console.log(`[TrendStartStrategy] Stop loss order filled: ${order.id} at ${order.filledPrice} - closing position`);
      const signal: StrategySignal = {
        barIndex: 0, // Would need to track this properly
        time: bar.time,
        type: StrategySignalType.SELL,
        price: order.filledPrice!,
        message: 'Stop loss triggered',
      };
      this.closePosition({
        id: this.activeStrategyTrade.id, 
        size: this.activeStrategyTrade.initialQuantity, 
        side: this.activeStrategyTrade.side, 
        contractId: order.contractId || 'UNKNOWN'
      }, bar, 'Stop loss triggered');
    } else if (order.isTakeProfit && this.activeStrategyTrade) {
      // Take profit was hit - close the position
      // console.log(`[TrendStartStrategy] Take profit order filled: ${order.id} at ${order.filledPrice} - closing position`);
      const signal: StrategySignal = {
        barIndex: 0, // Would need to track this properly
        time: bar.time,
        type: StrategySignalType.SELL,
        price: order.filledPrice!,
        message: 'Take profit triggered',
      };
      this.closePosition({
        id: this.activeStrategyTrade.id, 
        size: this.activeStrategyTrade.initialQuantity, 
        side: this.activeStrategyTrade.side, 
        contractId: order.contractId || 'UNKNOWN'
      }, bar, 'Take profit triggered');
    }
    
    // Log the current state after handling the fill
    const openTrade = this.getOpenTrade();
    const pendingOrders = this.getPendingOrders();
    // console.log(`[TrendStartStrategy] After order fill - Open trade: ${!!openTrade}, Pending orders: ${pendingOrders.length}`);
  }

  // Processes signals from TrendIdentifier and updates strategy's internal view
  private processNewTrendSignals(identifiedSignals: TrendLibSignal[]): StrategyTrendSignal[] {
    // Add debug logging for 1d to track signal processing
    if (identifiedSignals.length > 0) {
      // console.log(`[TrendStartStrategy][processNewTrendSignals] Received ${identifiedSignals.length} signals from TrendIdentifier`);
      identifiedSignals.forEach((sig, idx) => {
        // console.log(`[TrendStartStrategy][processNewTrendSignals] Input signal ${idx + 1}: ${sig.type} at bar ${sig.barIndex} - ${sig.rule}`);
      });
    }
    
    const newStrategySignals: StrategyTrendSignal[] = [];
    const existingSignalKeys = new Set(this.trackedTrendSignals.map(s => `${s.barIndex}-${s.type}-${s.rule}`));
    
    // console.log(`[TrendStartStrategy][processNewTrendSignals] Current tracked signals count: ${this.trackedTrendSignals.length}`);
    // console.log(`[TrendStartStrategy][processNewTrendSignals] Existing signal keys: ${Array.from(existingSignalKeys)}`);
    
    identifiedSignals.forEach(libSignal => {
      const signalKey = `${libSignal.barIndex}-${libSignal.type}-${libSignal.rule}`;
      // console.log(`[TrendStartStrategy][processNewTrendSignals] Checking signal key: ${signalKey}`);
      
      if (!existingSignalKeys.has(signalKey)) {
        const strategySignal: StrategyTrendSignal = { ...libSignal }; // Adapt if needed
        this.trackedTrendSignals.push(strategySignal);
        newStrategySignals.push(strategySignal);
        this.currentTrendDirection = strategySignal.type === 'CUS' ? 'UP' : 'DOWN';
        // console.log(`[TrendStartStrategy][processNewTrendSignals] ✓ Added new signal: ${signalKey}, total tracked: ${this.trackedTrendSignals.length}`);
      } else {
        // console.log(`[TrendStartStrategy][processNewTrendSignals] ⚠ Signal already exists: ${signalKey}`);
      }
    });
    
    this.trackedTrendSignals.sort((a,b) => a.barIndex - b.barIndex); // Keep sorted by bar index
    
    // console.log(`[TrendStartStrategy][processNewTrendSignals] Final tracked signals count: ${this.trackedTrendSignals.length}`);
    // console.log(`[TrendStartStrategy][processNewTrendSignals] Returning ${newStrategySignals.length} new signals`);
    
    return newStrategySignals.sort((a,b) => a.barIndex - b.barIndex); // Return new ones sorted
  }
  
  private openNewPosition(
    trendSignal: StrategyTrendSignal, 
    currentBar: BacktestBarData, 
    contractId: string, 
    allBars: BacktestBarData[], 
    side: OrderSide
  ): StrategySignal | null {
    const signalBar = allBars[trendSignal.barIndex];
    if (!signalBar) return null;
    
    const entryPrice = this.config.useMarketOrders ? currentBar.open : signalBar.close;
    const orderType = this.config.useMarketOrders ? OrderType.MARKET : OrderType.LIMIT;
    const logicalTradeId = `strat_trade_${this.logicalTradeIdCounter++}`;
    
    // Submit entry order via OrderManager
    const entryOrder = this.orderManager.submitOrder({
      contractId,
      tradeId: logicalTradeId,
      type: orderType,
      side: side,
      quantity: this.config.positionSize,
      price: entryPrice,
      submittedTime: currentBar.time,
      message: `Entry ${side === OrderSide.BUY ? 'BUY' : 'SELL'} - Rule: ${trendSignal.rule}`,
      parentTradeId: logicalTradeId
    });
    
    // Track this trade in our strategy
    this.activeStrategyTrade = {
      id: logicalTradeId,
      entrySignalBarIndex: trendSignal.barIndex,
      entrySignalPrice: signalBar.close,
      entryOrder: entryOrder,
      currentManagedPositionId: contractId, // Will be updated when position is opened
      initialQuantity: this.config.positionSize,
      side: side
    };
    
    // Generate chart signal for UI
    const chartSignalType = side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL;
    const signal: StrategySignal = {
      barIndex: currentBar.time as any, // This is actually the timestamp, not index
      time: currentBar.time,
      type: chartSignalType,
      price: entryPrice,
      message: `${side === OrderSide.BUY ? 'Buy' : 'Sell'} signal: ${trendSignal.rule}`
    };
    
    this.signals.push(signal);
    return signal;
  }

  private closePosition(
    positionToClose: { id: string, size: number, side: OrderSide, contractId: string }, 
    bar: BacktestBarData, 
    reason: string
  ): StrategySignal | null {
    const exitSide = positionToClose.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const exitPrice = bar.open; 
    
    this.orderManager.submitOrder({
      contractId: positionToClose.contractId,
      tradeId: positionToClose.id,
      type: OrderType.MARKET,
      side: exitSide,
      quantity: positionToClose.size,
      price: exitPrice,
      submittedTime: bar.time,
      message: `Closing pos ${positionToClose.id}: ${reason}`,
      parentTradeId: positionToClose.id
    });
    
    if (this.activeStrategyTrade && this.activeStrategyTrade.currentManagedPositionId === positionToClose.id) {
      this.activeStrategyTrade = null;
    }
    
    const chartSignalType = exitSide === OrderSide.SELL ? StrategySignalType.SELL : StrategySignalType.BUY;
    this.signals.push({
      barIndex: bar.time as any,
      time: bar.time,
      type: chartSignalType,
      price: exitPrice,
      message: `Exiting pos ${positionToClose.id}: ${reason}`
    });
    
    return this.signals[this.signals.length - 1];
  }

  private logCompletedTrade(
    position: {
      id: string;
      averageEntryPrice: number;
      size: number;
      side: OrderSide;
      realizedPnl?: number;
    },
    exitPrice: number,
    exitTime: UTCTimestamp,
    exitReason: string,
    contractId: string
  ): void {
    // Find the corresponding strategy trade if it exists
    const strategyTrade = this.activeStrategyTrade?.currentManagedPositionId === position.id 
      ? this.activeStrategyTrade 
      : null;
    
    // Use OrderManager's P&L calculation service
    const pnlInfo = this.orderManager.getClosedPositionPnL(
      position.averageEntryPrice,
      exitPrice,
      position.size,
      position.side,
      this.config.commission * position.size * 2  // Total commission for entry + exit
    );
    
    // Use realized P&L from position if available, otherwise use calculated
    const finalPnl = position.realizedPnl !== undefined ? position.realizedPnl : pnlInfo.netPnl;
    
    const simulatedTradeEntry: SimulatedTrade = {
      id: position.id,
      entryTime: strategyTrade?.entryOrder?.filledTime || strategyTrade?.entryOrder?.submittedTime || exitTime,
      exitTime: exitTime,
      entryPrice: position.averageEntryPrice,
      exitPrice: exitPrice,
      size: position.size,
      type: position.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      profitOrLoss: finalPnl,
      commission: pnlInfo.commission,
      status: 'CLOSED' as const,
      signalEntry: strategyTrade ? {
        barIndex: strategyTrade.entrySignalBarIndex,
        time: strategyTrade.entryOrder?.submittedTime || exitTime,
        price: strategyTrade.entrySignalPrice,
        type: position.side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
        message: 'Entry signal'
      } : undefined,
      signalExit: {
        barIndex: 0, // We don't currently track exit bar index
        time: exitTime,
        price: exitPrice,
        type: position.side === OrderSide.BUY ? StrategySignalType.SELL : StrategySignalType.BUY,
        message: exitReason
      }
    };
    
    this.completedTradesLog.push(simulatedTradeEntry);
  }

  // Run backtest on all bars - now uses forward testing approach with OrderManager
  public async backtest(bars: BacktestBarData[], contractId: string = 'UNKNOWN', timeframe: string = '1h'): Promise<BacktestResults> {
    // Reset state using enhanced reset method
    this.reset();
    
    // console.log(`[TrendStartStrategy] Starting forward testing backtest with ${bars.length} bars for ${contractId} ${timeframe}`);
    
    // Process each bar sequentially using forward testing
    for (let i = 0; i < bars.length; i++) {
      const result = await this.processBar(bars[i], i, bars, contractId, timeframe);
      // Process any filled orders (already handled in processBar)
    }
    
    // Close any open trade at the end
    if (this.activeStrategyTrade && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const entryBar = bars[this.activeStrategyTrade.entrySignalBarIndex];
      const entryPrice = this.activeStrategyTrade.entryOrder?.filledPrice || this.activeStrategyTrade.entrySignalPrice;
      const exitPrice = lastBar.close;
      
      // Use OrderManager's P&L calculation service
      const pnlInfo = this.orderManager.getClosedPositionPnL(
        entryPrice,
        exitPrice,
        this.activeStrategyTrade.initialQuantity,
        this.activeStrategyTrade.side,
        this.config.commission * this.activeStrategyTrade.initialQuantity * 2
      );
      
      // Create a proper SimulatedTrade object
      const finalTrade: SimulatedTrade = {
        id: this.activeStrategyTrade.id,
        entryTime: this.activeStrategyTrade.entryOrder?.submittedTime || (entryBar ? entryBar.time : lastBar.time),
        exitTime: lastBar.time,
        entryPrice: entryPrice,
        exitPrice: exitPrice,
        size: this.activeStrategyTrade.initialQuantity,
        type: this.activeStrategyTrade.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
        profitOrLoss: pnlInfo.netPnl,
        commission: pnlInfo.commission,
        status: 'CLOSED',
        signalEntry: {
          barIndex: this.activeStrategyTrade.entrySignalBarIndex,
          time: entryBar ? entryBar.time : lastBar.time,
          price: this.activeStrategyTrade.entrySignalPrice,
          type: this.activeStrategyTrade.side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
          message: 'Force closed at end of backtest'
        },
        signalExit: {
          barIndex: bars.length - 1,
          time: lastBar.time,
          price: lastBar.close,
          type: this.activeStrategyTrade.side === OrderSide.BUY ? StrategySignalType.SELL : StrategySignalType.BUY,
          message: 'End of backtest'
        }
      };
      
      this.completedTradesLog.push(finalTrade);
      this.activeStrategyTrade = null;
    }
    
    const results = this.calculateResults();
    // console.log(`[TrendStartStrategy] Forward testing backtest completed. ${results.totalTrades} trades, P&L: ${results.totalProfitOrLoss.toFixed(2)}`);
    return results;
  }

  private calculateResults(): BacktestResults {
    const totalProfitOrLoss = this.completedTradesLog.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const winningTrades = this.completedTradesLog.filter(t => (t.profitOrLoss || 0) > 0);
    const losingTrades = this.completedTradesLog.filter(t => (t.profitOrLoss || 0) < 0);
    
    const winRate = this.completedTradesLog.length > 0 ? (winningTrades.length / this.completedTradesLog.length) * 100 : 0;
    const averageWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0) / winningTrades.length 
      : 0;
    const averageLoss = losingTrades.length > 0 
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0) / losingTrades.length)
      : 0;
    
    const profitFactor = averageLoss > 0 ? Math.abs(averageWin / averageLoss) : 0;
    
    return {
      totalProfitOrLoss,
      winRate,
      totalTrades: this.completedTradesLog.length,
      maxDrawdown: 0, // TODO: Calculate actual drawdown
      profitFactor,
      sharpeRatio: 0, // TODO: Calculate if needed
      trades: this.completedTradesLog,
    };
  }

  // Get current indicators (for real-time display)
  public getCurrentIndicators(): TrendIndicators | null {
    return {
      trendDirection: this.currentTrendDirection,
      lastSignal: this.trackedTrendSignals[this.trackedTrendSignals.length - 1]
    };
  }

  // Get all signals
  public getSignals(): StrategySignal[] {
    return this.signals;
  }

  // Get all trades
  public getTrades(): SimulatedTrade[] {
    return this.completedTradesLog;
  }

  // Get detected trend start signals
  public getTrendSignals(): StrategyTrendSignal[] {
    // console.log(`[TrendStartStrategy][getTrendSignals] Returning ${this.trackedTrendSignals.length} tracked signals`);
    this.trackedTrendSignals.forEach((sig, idx) => {
      // console.log(`[TrendStartStrategy][getTrendSignals] Signal ${idx + 1}: ${sig.type} at bar ${sig.barIndex} - ${sig.rule}`);
    });
    return this.trackedTrendSignals;
  }

  // Get current open trade
  public getOpenTrade(): StrategyManagedTrade | null {
    return this.activeStrategyTrade;
  }

  // Get current trade ID counter
  public getTradeIdCounter(): number {
    return this.logicalTradeIdCounter;
  }

  // Get pending orders
  public getPendingOrders(): Order[] {
    return this.orderManager.getPendingOrders();
  }

  // Get filled orders
  public getFilledOrders(): Order[] {
    return this.orderManager.getFilledOrders();
  }

  // Get cancelled orders
  public getCancelledOrders(): Order[] {
    return this.orderManager.getCancelledOrders();
  }

  // Reset strategy state (useful when loading new data) - now clears forward testing cache
  public resetState(): void {
    this.reset(); // Use the enhanced reset method
  }

  // Enhanced reset method with OrderManager integration
  public reset(): void {
    this.signals = [];
    this.completedTradesLog = [];
    this.activeStrategyTrade = null;
    this.logicalTradeIdCounter = 1;
    this.trackedTrendSignals = [];
    this.currentTrendDirection = 'NONE';
    this.orderManager.reset(); // Reset order manager
    
    this.trendIdentifier.resetState(); // Reset the TrendIdentifier's state
  }

  // Convert active trade to completed trade log entry
  private convertActiveTradeToCompleted(exitBar: BacktestBarData, exitReason: string): SimulatedTrade | null {
    if (!this.activeStrategyTrade) return null;
    
    const entryBar = exitBar; // Fallback if we can't find the actual entry bar
    const entryPrice = this.activeStrategyTrade.entryOrder?.filledPrice || this.activeStrategyTrade.entrySignalPrice;
    const exitPrice = exitBar.close;
    
    // Use OrderManager's P&L calculation service
    const pnlInfo = this.orderManager.getClosedPositionPnL(
      entryPrice,
      exitPrice,
      this.activeStrategyTrade.initialQuantity,
      this.activeStrategyTrade.side,
      this.config.commission * this.activeStrategyTrade.initialQuantity * 2
    );
    
    const trade: SimulatedTrade = {
      id: this.activeStrategyTrade.id,
      entryTime: this.activeStrategyTrade.entryOrder?.filledTime || this.activeStrategyTrade.entryOrder?.submittedTime || entryBar.time,
      exitTime: exitBar.time,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      size: this.activeStrategyTrade.initialQuantity,
      type: this.activeStrategyTrade.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      profitOrLoss: pnlInfo.netPnl,
      commission: pnlInfo.commission,
      status: 'CLOSED',
      signalEntry: {
        barIndex: this.activeStrategyTrade.entrySignalBarIndex,
        time: this.activeStrategyTrade.entryOrder?.submittedTime || entryBar.time,
        price: this.activeStrategyTrade.entrySignalPrice,
        type: this.activeStrategyTrade.side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
        message: 'Entry signal'
      },
      signalExit: {
        barIndex: 0, // We don't track this currently
        time: exitBar.time,
        price: exitPrice,
        type: this.activeStrategyTrade.side === OrderSide.BUY ? StrategySignalType.SELL : StrategySignalType.BUY,
        message: exitReason
      }
    };
    
    return trade;
  }

  // Check if we should enter a new position based on signals
  private shouldEnterPosition(
    signal: StrategyTrendSignal, 
    currentPosition: any | undefined,
    confidence: number
  ): boolean {
    // Don't enter if confidence is too low
    if (confidence < this.config.confidenceThreshold!) return false;
    
    // Check signal type and current position
    if (signal.type === 'CUS') {
      // Enter long if no position or if short
      return !currentPosition || currentPosition.side === OrderSide.SELL;
    } else if (signal.type === 'CDS') {
      // Don't enter short on CDS in this strategy - only use it to close longs
      return false;
    }
    
    return false;
  }

  // Check if we should exit current position
  private shouldExitPosition(
    signal: StrategyTrendSignal,
    currentPosition: any | undefined
  ): boolean {
    if (!currentPosition) return false;
    
    // Exit long on CDS signal
    if (signal.type === 'CDS' && currentPosition.side === OrderSide.BUY) {
      return true;
    }
    
    // Exit short on CUS signal (if we had shorts)
    if (signal.type === 'CUS' && currentPosition.side === OrderSide.SELL) {
      return true;
    }
    
    return false;
  }

  // Get current P&L for all positions
  public getCurrentPnL(currentPrices: Map<string, number>): {
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    positions: Array<{
      contractId: string;
      realizedPnl: number;
      unrealizedPnl: number;
      totalPnl: number;
    }>;
  } {
    let totalRealizedPnl = 0;
    let totalUnrealizedPnl = 0;
    const positionsPnl: Array<{
      contractId: string;
      realizedPnl: number;
      unrealizedPnl: number;
      totalPnl: number;
    }> = [];

    // Get P&L for completed trades
    for (const trade of this.completedTradesLog) {
      totalRealizedPnl += trade.profitOrLoss || 0;
    }

    // Get P&L for open positions
    const openPositions = this.orderManager.getAllOpenPositions();
    for (const position of openPositions) {
      const currentPrice = currentPrices.get(position.contractId) || position.averageEntryPrice;
      const pnlData = this.orderManager.getPositionTotalPnL(position.contractId, currentPrice);
      
      if (pnlData) {
        totalRealizedPnl += pnlData.realized;
        totalUnrealizedPnl += pnlData.unrealized;
        
        positionsPnl.push({
          contractId: position.contractId,
          realizedPnl: pnlData.realized,
          unrealizedPnl: pnlData.unrealized,
          totalPnl: pnlData.total
        });
      }
    }

    return {
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      positions: positionsPnl
    };
  }

  // Get comprehensive strategy state including P&L
  public getStrategyState(currentPrices: Map<string, number> = new Map()): {
    indicators: TrendIndicators | null;
    openTrade: StrategyManagedTrade | null;
    completedTrades: SimulatedTrade[];
    pnl: {
      realizedPnl: number;
      unrealizedPnl: number;
      totalPnl: number;
      positions: Array<{
        contractId: string;
        realizedPnl: number;
        unrealizedPnl: number;
        totalPnl: number;
      }>;
    };
    orderManagerState: {
      orders: OrderManagerState;
      positions: Array<any>;  // Simplified since ManagedPosition is not exported
    };
  } {
    return {
      indicators: this.getCurrentIndicators(),
      openTrade: this.getOpenTrade(),
      completedTrades: this.getTrades(),
      pnl: this.getCurrentPnL(currentPrices),
      orderManagerState: this.orderManager.getCompleteState(currentPrices)
    };
  }
}