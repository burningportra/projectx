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
  OrderManagerState,
  SubBarData
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
  exitOrder?: Order; // The strategy-initiated exit order
  stopLossOrder?: Order;
  takeProfitOrder?: Order;
  currentManagedPositionId?: string; // The ID of the actual position in OrderManager
  initialQuantity: number; // Quantity for this logical trade segment
  side: OrderSide; // Added side to StrategyManagedTrade
  signalExit?: StrategyTrendSignal; // Signal that triggered a pending exit
  exitReason?: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'REVERSAL_EXIT'; // Reason for pending/actual exit
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
    mainBar: BacktestBarData,
    subBarsForMainBar: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[],
    contractId: string = 'UNKNOWN',
    timeframe: string = '1h'
  ): Promise<{
    signal: StrategySignal | null;
    indicators: TrendIndicators;
    filledOrders: Order[];
  }> {
    // Process any pending orders first
    const filledOrders = this.orderManager.processBar(mainBar, subBarsForMainBar, barIndex);
    
    // Handle filled orders
    for (const order of filledOrders) {
      this.handleOrderFill(order, mainBar);
    }

    // Step 1: Get trend signals from TrendIdentifier
    const identifiedSignals = await this.trendIdentifier.getSignalsForRange(allMainBars, barIndex, contractId, timeframe);
    const newSignalsForAction = this.processNewTrendSignals(identifiedSignals);
    const latestSignalForAction = newSignalsForAction[newSignalsForAction.length - 1];
    
    let chartSignal: StrategySignal | null = null;
    
    // Step 2: Get current position from OrderManager
    const currentPosition = this.orderManager.getOpenPosition(contractId);
    
    // Step 3: Process signals and make trading decisions
    if (latestSignalForAction) {
      const confidence = latestSignalForAction.confidence || 0;
      
      // Check if we should exit current position
      if (this.activeStrategyTrade && this.shouldExitPosition(latestSignalForAction, currentPosition)) {
        // If currentPosition matches activeStrategyTrade, then proceed to close.
        // The actual P&L logging and moving to completedTradesLog happens in handleOrderFill.
        if (currentPosition && this.activeStrategyTrade.currentManagedPositionId === currentPosition.id) {
            chartSignal = this.closePosition(this.activeStrategyTrade, mainBar, latestSignalForAction, `${latestSignalForAction.type} signal to exit`);
        }
      }
      
      // Check if we should enter new position
      if (this.shouldEnterPosition(latestSignalForAction, currentPosition, confidence)) {
        // If we have a contrary position (managed by OrderManager), close it first.
        // The closing of this OrderManager position will be handled, and its P&L logged by handleOrderFill if it matches an activeStrategyTrade.
        // If it's just an OrderManager position without a corresponding activeStrategyTrade, its closure won't affect strategy P&L directly here.
        if (currentPosition && 
            ((latestSignalForAction.type === 'CUS' && currentPosition.side === OrderSide.SELL) ||
             (latestSignalForAction.type === 'CDS' && currentPosition.side === OrderSide.BUY))) { // CDS is not used for entry in this strategy, but for completion
          
          console.log(`[TrendStartStrategy] Signal to reverse. Closing existing OrderManager position ${currentPosition.id}`);
          // Submit order to close OrderManager's position.
          // The P&L for this old position (if it was part of an activeStrategyTrade) will be handled by handleOrderFill.
          this.orderManager.submitOrder({
            contractId: currentPosition.contractId,
            tradeId: currentPosition.id, // Use OrderManager's position ID as tradeId for this closing order
            type: OrderType.MARKET,
            side: currentPosition.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY,
            quantity: currentPosition.size,
            price: mainBar.open, // Or appropriate market price
            submittedTime: mainBar.time,
            message: `Closing position ${currentPosition.id} for reversal due to ${latestSignalForAction.type}`,
            isExit: true
          });
          // If this closed position was this.activeStrategyTrade, handleOrderFill will finalize it.
          // Then, the logic below will open a new activeStrategyTrade.
        }
        
        // Open new position only if no current position or if current position is being reversed (and will be closed by above order)
        // The actual check for !currentPosition before calling openNewPosition is inside shouldEnterPosition or implicitly by flow.
        const side = latestSignalForAction.type === 'CUS' ? OrderSide.BUY : OrderSide.SELL;
        chartSignal = this.openNewPosition(latestSignalForAction, mainBar, contractId, allMainBars, side);
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
  private handleOrderFill(order: Order, mainBar: BacktestBarData): void {
    // console.log(`[TrendStartStrategy] Order filled: ${order.id} (${order.side} ${order.type}) at ${order.filledPrice} qty ${order.filledQuantity}`);

    if (!this.activeStrategyTrade || order.parentTradeId !== this.activeStrategyTrade.id) {
      // This fill is not for the current active strategy trade, or no active trade.
      // Could be a lingering order from a previous trade or unmanaged.
      // console.warn(`[TrendStartStrategy] Filled order ${order.id} does not match active strategy trade ${this.activeStrategyTrade?.id}. Ignoring for strategy trade state.`);
      return;
    }

    if (order.isEntry && order.id === this.activeStrategyTrade.entryOrder?.id && order.filledPrice && order.filledTime) {
      // Entry order filled, update the activeStrategyTrade's entryOrder with fill details
      this.activeStrategyTrade.entryOrder = { ...order }; // Capture all fill details
      this.activeStrategyTrade.currentManagedPositionId = order.contractId; // Assuming position ID might be contract ID or derived
      console.log(`[TrendStartStrategy] Confirmed entry for active trade ${this.activeStrategyTrade.id} at ${order.filledPrice}`);
    
    } else if ((order.isStopLoss || order.isTakeProfit || order.isExit) && order.filledPrice && order.filledTime) {
      // An exit order (SL, TP, or strategy-initiated) for the active trade has been filled.
      // This fill closes the activeStrategyTrade.
      
      const entryOrder = this.activeStrategyTrade.entryOrder;
      if (!entryOrder || entryOrder.filledPrice === undefined || entryOrder.filledTime === undefined) {
        console.error(`[TrendStartStrategy] Cannot finalize trade ${this.activeStrategyTrade.id}: Entry order details are missing or not filled.`);
        this.activeStrategyTrade = null; // Clear inconsistent trade
        return;
      }

      const exitReason = order.isStopLoss ? 'STOP_LOSS' : (order.isTakeProfit ? 'TAKE_PROFIT' : (this.activeStrategyTrade.entryOrder?.message?.includes("reversing") ? 'REVERSAL_EXIT' : 'SIGNAL'));
      
      const entryCommRate = entryOrder.commission || 0; // Per contract
      const exitCommRate = order.commission || 0;     // Per contract
      const totalCommission = (entryCommRate + exitCommRate) * this.activeStrategyTrade.initialQuantity;
      const sideMultiplier = this.activeStrategyTrade.side === OrderSide.BUY ? 1 : -1;

      const pnl = (order.filledPrice - entryOrder.filledPrice) * this.activeStrategyTrade.initialQuantity * sideMultiplier - totalCommission;

      const completedTrade: SimulatedTrade = {
        id: this.activeStrategyTrade.id,
        entryTime: entryOrder.filledTime,
        entryPrice: entryOrder.filledPrice,
        exitTime: order.filledTime,
        exitPrice: order.filledPrice,
        type: this.activeStrategyTrade.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
        size: this.activeStrategyTrade.initialQuantity,
        profitOrLoss: pnl,
        commission: totalCommission, // Store total commission for the trade
        status: 'CLOSED',
        signalEntry: this.activeStrategyTrade.entryOrder ? { // Assuming entryOrder message contains signal info
            barIndex: this.activeStrategyTrade.entrySignalBarIndex,
            time: entryOrder.submittedTime, // Signal time is submission time
            price: this.activeStrategyTrade.entrySignalPrice, // Signal price
            type: this.activeStrategyTrade.side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
            message: this.activeStrategyTrade.entryOrder.message || 'Entry signal'
        } : undefined,
        exitOrder: { ...order },
        stopLossOrder: this.activeStrategyTrade.stopLossOrder, // Keep record of original SL/TP orders
        takeProfitOrder: this.activeStrategyTrade.takeProfitOrder,
        exitReason: exitReason,
      };
      
      this.completedTradesLog.push(completedTrade);
      console.log(`[TrendStartStrategy] Closed trade ${completedTrade.id}. Entry: ${completedTrade.entryPrice}, Exit: ${completedTrade.exitPrice}, P&L: ${completedTrade.profitOrLoss?.toFixed(2)}`);
      
      // Generate a chart signal for the exit
      const chartSignalType = completedTrade.type === TradeType.BUY ? StrategySignalType.SELL : StrategySignalType.BUY;
      this.signals.push({
        barIndex: mainBar.originalIndex !== undefined ? mainBar.originalIndex : 0, // Use originalIndex if available
        time: order.filledTime,
        type: chartSignalType,
        price: order.filledPrice,
        message: `Exit (${exitReason}) for trade ${completedTrade.id}`
      });

      this.activeStrategyTrade = null;
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
    currentMainBar: BacktestBarData, // Changed currentBar to currentMainBar
    contractId: string, 
    allMainBars: BacktestBarData[], // Changed allBars to allMainBars
    side: OrderSide
  ): StrategySignal | null {
    const signalBar = allMainBars[trendSignal.barIndex]; // Changed allBars to allMainBars
    if (!signalBar) return null;
    
    const entryPrice = this.config.useMarketOrders ? currentMainBar.open : signalBar.close; 
    const orderType = this.config.useMarketOrders ? OrderType.MARKET : OrderType.LIMIT;
    const logicalTradeId = `strat_trade_${this.logicalTradeIdCounter++}`;
    const perContractCommission = this.config.positionSize > 0 ? (this.config.commission || 0) / this.config.positionSize : 0;
    
    // Submit entry order via OrderManager
    const entryOrder = this.orderManager.submitOrder({
      contractId,
      tradeId: logicalTradeId,
      type: orderType,
      side: side,
      quantity: this.config.positionSize,
      price: entryPrice,
      submittedTime: currentMainBar.time,
      message: `Entry ${side === OrderSide.BUY ? 'BUY' : 'SELL'} - Rule: ${trendSignal.rule}`,
      parentTradeId: logicalTradeId,
      commission: perContractCommission,
      isEntry: true // Mark as entry order
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
      barIndex: currentMainBar.time as any, // This is actually the timestamp, not index // Changed currentBar to currentMainBar
      time: currentMainBar.time, // Changed currentBar to currentMainBar
      type: chartSignalType,
      price: entryPrice,
      message: `${side === OrderSide.BUY ? 'Buy' : 'Sell'} signal: ${trendSignal.rule}`
    };
    
    this.signals.push(signal);
    return signal;
  }

  private closePosition(
    strategyTradeToClose: StrategyManagedTrade, 
    mainBar: BacktestBarData,
    signal: StrategyTrendSignal, // The strategy signal causing the closure
    reason: string
  ): StrategySignal | null {
    if (!this.activeStrategyTrade || this.activeStrategyTrade.id !== strategyTradeToClose.id) {
      console.warn(`[TrendStartStrategy] closePosition called for a trade ${strategyTradeToClose.id} that is not the active one, or no active trade.`);
      return null;
    }

    const exitSide = strategyTradeToClose.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const exitPrice = mainBar.open; // For market order submission
    const perContractCommission = this.config.positionSize > 0 ? (this.config.commission || 0) / this.config.positionSize : 0;
    
    // Cancel any existing SL/TP for this activeStrategyTrade
    if (this.activeStrategyTrade.stopLossOrder) this.orderManager.cancelOrder(this.activeStrategyTrade.stopLossOrder.id);
    if (this.activeStrategyTrade.takeProfitOrder) this.orderManager.cancelOrder(this.activeStrategyTrade.takeProfitOrder.id);

    const exitOrder = this.orderManager.submitOrder({
      contractId: strategyTradeToClose.currentManagedPositionId || 'UNKNOWN', // Use contractId from active trade
      tradeId: strategyTradeToClose.id, // Link to strategy's logical trade ID
      type: OrderType.MARKET, // Assuming market orders for signal-based exits for now
      side: exitSide,
      quantity: strategyTradeToClose.initialQuantity, // Use initial quantity of the logical trade
      price: exitPrice,
      submittedTime: mainBar.time,
      message: `Closing trade ${strategyTradeToClose.id}: ${reason}`,
      parentTradeId: strategyTradeToClose.id, // Link back to the strategy's logical trade
      isExit: true,
      commission: perContractCommission
    });
    
    // Store the submitted exit order in the activeStrategyTrade.
    // The trade will be finalized by handleOrderFill when this exitOrder is confirmed filled.
    this.activeStrategyTrade.exitOrder = exitOrder;
    this.activeStrategyTrade.signalExit = signal; // Store the signal that initiated this exit attempt
    this.activeStrategyTrade.exitReason = 'SIGNAL'; // Mark reason as SIGNAL
    
    console.log(`[TrendStartStrategy] Submitted signal-based exit order ${exitOrder.id} for trade ${strategyTradeToClose.id}`);
    
    const chartSignalType = exitSide === OrderSide.SELL ? StrategySignalType.SELL : StrategySignalType.BUY;
    const chartSignal: StrategySignal = {
      barIndex: mainBar.originalIndex !== undefined ? mainBar.originalIndex : 0,
      time: mainBar.time,
      type: chartSignalType,
      price: exitPrice,
      message: `Exiting pos ${strategyTradeToClose.id}: ${reason}`
    };
    this.signals.push(chartSignal);
    return chartSignal;
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
  public async backtest(mainBars: BacktestBarData[], allSubBars?: SubBarData[], contractId: string = 'UNKNOWN', timeframe: string = '1h'): Promise<BacktestResults> { // Added allSubBars and changed bars to mainBars
    // Reset state using enhanced reset method
    this.reset();
    
    // console.log(`[TrendStartStrategy] Starting forward testing backtest with ${mainBars.length} bars for ${contractId} ${timeframe}`);
    
    // Process each bar sequentially using forward testing
    for (let i = 0; i < mainBars.length; i++) {
      const currentMainBar = mainBars[i];
      const relevantSubBars = allSubBars?.filter(sb => sb.parentBarIndex === i);
      const result = await this.processBar(currentMainBar, relevantSubBars, i, mainBars, contractId, timeframe);
      // Process any filled orders (already handled in processBar)
    }
    
    // Close any open trade at the end
    if (this.activeStrategyTrade && mainBars.length > 0) { // Changed bars to mainBars
      const lastMainBar = mainBars[mainBars.length - 1]; // Changed lastBar to lastMainBar, bars to mainBars
      const entryBar = mainBars[this.activeStrategyTrade.entrySignalBarIndex]; // Changed bars to mainBars
      const entryPrice = this.activeStrategyTrade.entryOrder?.filledPrice || this.activeStrategyTrade.entrySignalPrice;
      const exitPrice = lastMainBar.close; // Corrected lastBar to lastMainBar
      
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
        entryTime: this.activeStrategyTrade.entryOrder?.submittedTime || (entryBar ? entryBar.time : lastMainBar.time),
        exitTime: lastMainBar.time,
        entryPrice: entryPrice,
        exitPrice: exitPrice, 
        size: this.activeStrategyTrade.initialQuantity,
        type: this.activeStrategyTrade.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
        profitOrLoss: pnlInfo.netPnl,
        commission: pnlInfo.commission,
        status: 'CLOSED',
        signalEntry: {
          barIndex: this.activeStrategyTrade.entrySignalBarIndex,
          time: entryBar ? entryBar.time : lastMainBar.time, // Corrected lastBar.time
          price: this.activeStrategyTrade.entrySignalPrice,
          type: this.activeStrategyTrade.side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
          message: 'Force closed at end of backtest'
        },
        signalExit: {
          barIndex: mainBars.length - 1,
          time: lastMainBar.time,
          price: lastMainBar.close,
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
