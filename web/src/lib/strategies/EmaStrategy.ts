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
  SubBarData
} from '@/lib/types/backtester';
import { OrderManager } from '@/lib/OrderManager';

export interface EmaStrategyConfig extends StrategyConfig {
  fastPeriod: number;
  slowPeriod: number;
}

export interface EmaIndicators {
  fastEma: number;
  slowEma: number;
}

export class EmaStrategy {
  private config: EmaStrategyConfig;
  private fastEmaValues: number[] = [];
  private slowEmaValues: number[] = [];
  private signals: StrategySignal[] = [];
  private trades: SimulatedTrade[] = [];
  private openTrade: SimulatedTrade | null = null;
  private tradeIdCounter = 1;
  private orderManager: OrderManager;
  private pendingReversalSignal: StrategySignal | null = null;
  private pendingReversalBar: BacktestBarData | null = null;
  private currentBarIndex: number = 0;

  constructor(config: Partial<EmaStrategyConfig> = {}) {
    this.config = {
      fastPeriod: 12,
      slowPeriod: 26,
      commission: 2.50,
      positionSize: 1,
      stopLossPercent: 2.0,      // 2% stop loss
      takeProfitPercent: 4.0,    // 4% take profit
      useMarketOrders: true,     // Use market orders by default
      limitOrderOffset: 2,       // 2 ticks offset for limit orders
      ...config
    };
    this.orderManager = new OrderManager(0.25); // ES mini tick size
  }

  // Reset strategy state
  public reset(): void {
    this.fastEmaValues = [];
    this.slowEmaValues = [];
    this.signals = [];
    this.trades = [];
    this.openTrade = null;
    this.tradeIdCounter = 1;
    this.pendingReversalSignal = null;
    this.pendingReversalBar = null;
    this.orderManager.reset();
  }

  // Calculate EMA for a given period
  private calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const emaValues: number[] = [];
    
    if (prices.length === 0) return emaValues;
    emaValues[0] = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      emaValues[i] = prices[i] * k + emaValues[i - 1] * (1 - k);
    }
    
    return emaValues;
  }

  // Get the most recent EMA value for a given period
  private getCurrentEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    
    const recentPrices = prices.slice(-period * 2); // Use more data for accuracy
    const emaValues = this.calculateEMA(recentPrices, period);
    return emaValues[emaValues.length - 1];
  }

  // Process a single bar and generate signals
  public processBar(
    mainBar: BacktestBarData, 
    subBarsForMainBar: SubBarData[] | undefined, 
    barIndex: number, 
    allMainBars: BacktestBarData[]
  ): {
    signal: StrategySignal | null;
    indicators: EmaIndicators;
    filledOrders: Order[];
  } {
    // Store current bar index for use in order fill handling
    this.currentBarIndex = barIndex;
    
    // Process any pending orders first
    const filledOrders = this.orderManager.processBar(mainBar, subBarsForMainBar, barIndex); 
    
    // Handle filled orders and collect any signals they generate
    const orderFillSignals: StrategySignal[] = [];
    for (const order of filledOrders) {
      const fillSignal = this.handleOrderFill(order, mainBar); // Changed bar to mainBar
      if (fillSignal) {
        orderFillSignals.push(fillSignal);
      }
    }

    // Get closing prices up to current bar
    const closePrices = allMainBars.slice(0, barIndex + 1).map(b => b.close);
    
    // Calculate current EMAs
    const fastEma = this.getCurrentEMA(closePrices, this.config.fastPeriod);
    const slowEma = this.getCurrentEMA(closePrices, this.config.slowPeriod);
    
    // Store EMA values for trend analysis
    this.fastEmaValues.push(fastEma);
    this.slowEmaValues.push(slowEma);
    
    const indicators: EmaIndicators = { fastEma, slowEma };
    
    // Need at least 2 bars to detect crossovers
    if (barIndex < 1) {
      return { signal: null, indicators, filledOrders };
    }
    
    const prevFastEma = this.fastEmaValues[barIndex - 1];
    const prevSlowEma = this.slowEmaValues[barIndex - 1];
    
    // Detect crossovers
    const bullishCrossover = prevFastEma <= prevSlowEma && fastEma > slowEma;
    const bearishCrossover = prevFastEma >= prevSlowEma && fastEma < slowEma;
    
    // Check actual position state from OrderManager
    const currentPosition = this.orderManager.getOpenPosition('DEFAULT_CONTRACT');
    const hasOpenPosition = currentPosition !== undefined;
    
    let signal: StrategySignal | null = null;
    
    if (bullishCrossover) {
      if (!hasOpenPosition && !this.pendingReversalSignal) {
        // Open new LONG position
        signal = {
          barIndex,
          time: mainBar.time,
          type: StrategySignalType.BUY,
          price: mainBar.close,
          message: `EMA ${this.config.fastPeriod} crossed above EMA ${this.config.slowPeriod}`,
        };
        
        this.openPosition(mainBar, signal, OrderSide.BUY);
        this.signals.push(signal);
      } else if (hasOpenPosition && currentPosition.side === OrderSide.SELL) {
        // Close SHORT position and open LONG
        signal = {
          barIndex,
          time: mainBar.time,
          type: StrategySignalType.BUY,
          price: mainBar.close,
          message: `EMA ${this.config.fastPeriod} crossed above EMA ${this.config.slowPeriod} - Reverse to LONG`,
        };
        
        this.openPosition(mainBar, signal, OrderSide.BUY); // This will handle the reversal
        this.signals.push(signal);
      }
    } else if (bearishCrossover) {
      if (!hasOpenPosition && !this.pendingReversalSignal) {
        // Open new SHORT position
        signal = {
          barIndex,
          time: mainBar.time,
          type: StrategySignalType.SELL,
          price: mainBar.close,
          message: `EMA ${this.config.fastPeriod} crossed below EMA ${this.config.slowPeriod}`,
        };
        
        this.openPosition(mainBar, signal, OrderSide.SELL);
        this.signals.push(signal);
      } else if (hasOpenPosition && currentPosition.side === OrderSide.BUY) {
        // Close LONG position and open SHORT
        signal = {
          barIndex,
          time: mainBar.time,
          type: StrategySignalType.SELL,
          price: mainBar.close,
          message: `EMA ${this.config.fastPeriod} crossed below EMA ${this.config.slowPeriod} - Reverse to SHORT`,
        };
        
        this.openPosition(mainBar, signal, OrderSide.SELL); // This will handle the reversal
        this.signals.push(signal);
      }
    }
    
    // Return exit signal if available (prioritize over entry signals)
    const finalSignal = orderFillSignals.length > 0 ? orderFillSignals[0] : signal;
    
    return { signal: finalSignal, indicators, filledOrders };
  }

  // Open a position (long or short) with stop loss and take profit
  private openPosition(mainBar: BacktestBarData, signal: StrategySignal, side: OrderSide): void { // Changed bar to mainBar
    // Check if there's an existing position that needs to be closed first
    const existingPosition = this.orderManager.getOpenPosition('DEFAULT_CONTRACT');
    
    if (existingPosition && existingPosition.side === OrderSide.SELL) {
      // We have a short position that needs to be closed before opening long
      console.log(`[EmaStrategy] Closing existing short position ${existingPosition.id} before opening long`);
      
      // Cancel any existing SL/TP orders for the short position
      this.orderManager.cancelOrdersByTradeId(existingPosition.id);
      
      // Create a market order to close the short position
      const closeOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: existingPosition.size,
        price: mainBar.close, // Changed bar to mainBar
        submittedTime: mainBar.time, // Changed bar to mainBar
        parentTradeId: existingPosition.id,
        contractId: 'DEFAULT_CONTRACT',
        message: 'Close short position for reversal',
      });
      
      // Mark that we're waiting for position reversal
      this.pendingReversalSignal = signal;
      this.pendingReversalBar = mainBar; // Changed bar to mainBar
      return; // Don't open new position yet
    }
    
    const tradeId = `EMA_${this.tradeIdCounter++}`;
    
    // Create entry order
    let entryOrder: Order;
    const perContractCommission = this.config.positionSize > 0 ? (this.config.commission || 0) / this.config.positionSize : 0;

    if (this.config.useMarketOrders) {
      entryOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: side,
        quantity: this.config.positionSize,
        price: mainBar.close, // Market price
        submittedTime: mainBar.time,
        parentTradeId: tradeId,
        contractId: 'DEFAULT_CONTRACT',
        isEntry: true,
        message: `EMA crossover ${side} entry`,
        commission: perContractCommission,
      });
    } else {
      // Use limit order with offset based on side
      const limitPrice = side === OrderSide.BUY 
        ? mainBar.close - (this.config.limitOrderOffset || 2) * 0.25
        : mainBar.close + (this.config.limitOrderOffset || 2) * 0.25;
      entryOrder = this.orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: side,
        quantity: this.config.positionSize,
        price: limitPrice,
        submittedTime: mainBar.time,
        parentTradeId: tradeId,
        contractId: 'DEFAULT_CONTRACT',
        isEntry: true,
        message: `EMA crossover ${side} limit entry`,
        commission: perContractCommission,
      });
    }

    // Create stop loss order if configured
    let stopLossOrder: Order | undefined;
    if (this.config.stopLossPercent) {
      stopLossOrder = this.orderManager.createStopLossOrder(
        side,
        this.config.positionSize,
        mainBar.close, // Changed bar to mainBar
        this.config.stopLossPercent,
        mainBar.time, // Changed bar to mainBar
        tradeId,
        'DEFAULT_CONTRACT'
      );
    }

    // Create take profit order if configured
    let takeProfitOrder: Order | undefined;
    if (this.config.takeProfitPercent) {
      takeProfitOrder = this.orderManager.createTakeProfitOrder(
        side,
        this.config.positionSize,
        mainBar.close, // Changed bar to mainBar
        this.config.takeProfitPercent,
        mainBar.time, // Changed bar to mainBar
        tradeId,
        'DEFAULT_CONTRACT'
      );
    }

    // Create trade record
    this.openTrade = {
      id: tradeId,
      entryTime: mainBar.time, // Changed bar to mainBar
      entryPrice: mainBar.close, // Changed bar to mainBar
      type: side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      size: this.config.positionSize,
      commission: this.config.commission,
      status: 'OPEN',
      signalEntry: signal,
      entryOrder,
      stopLossOrder,
      takeProfitOrder,
    };

    console.log(`[EmaStrategy] Opened long position ${tradeId} at ${mainBar.close}`); // Changed bar to mainBar
    console.log('[EmaStrategy] Entry order:', entryOrder.id, 'Status:', entryOrder.status, 'parentTradeId:', entryOrder.parentTradeId);
    if (stopLossOrder) {
      console.log('[EmaStrategy] SL order:', stopLossOrder.id, 'parentTradeId:', stopLossOrder.parentTradeId, 'stopPrice:', stopLossOrder.stopPrice);
    }
    if (takeProfitOrder) {
      console.log('[EmaStrategy] TP order:', takeProfitOrder.id, 'parentTradeId:', takeProfitOrder.parentTradeId, 'price:', takeProfitOrder.price);
    }
  }

  // Close the current position based on a strategy signal (not SL/TP hit)
  private closePosition(mainBar: BacktestBarData, signal: StrategySignal, reason: 'SIGNAL'): void {
    const currentPosition = this.orderManager.getOpenPosition('DEFAULT_CONTRACT');
    if (!currentPosition || !this.openTrade || reason !== 'SIGNAL') {
      // Only proceed if called for a 'SIGNAL' reason and there's an open trade/position
      return;
    }

    const trade = this.openTrade as SimulatedTrade;
    
    // Cancel any pending stop loss and take profit orders associated with this trade
    // This is important because we are now initiating a new exit based on strategy signal
    if (trade.stopLossOrder) this.orderManager.cancelOrder(trade.stopLossOrder.id);
    if (trade.takeProfitOrder) this.orderManager.cancelOrder(trade.takeProfitOrder.id);
    // Or, more broadly if OrderManager associates SL/TPs with parentTradeId:
    // this.orderManager.cancelOrdersByTradeId(trade.id); // This might be too broad if trade.id is used for multiple things

    const exitSide = currentPosition.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const perContractCommission = this.config.positionSize > 0 ? (this.config.commission || 0) / this.config.positionSize : 0;

    let exitOrder: Order;
    if (this.config.useMarketOrders) {
      exitOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: exitSide,
        quantity: currentPosition.size, // Use actual position size
        price: mainBar.close,
        submittedTime: mainBar.time,
        parentTradeId: trade.id,
        contractId: 'DEFAULT_CONTRACT',
        isExit: true, // Mark this as a strategy-initiated exit
        message: `Exit signal: ${signal.message}`,
        commission: perContractCommission,
      });
    } else {
      const limitPrice = exitSide === OrderSide.SELL
        ? mainBar.close + (this.config.limitOrderOffset || 2) * 0.25
        : mainBar.close - (this.config.limitOrderOffset || 2) * 0.25;
      exitOrder = this.orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: exitSide,
        quantity: currentPosition.size, // Use actual position size
        price: limitPrice,
        submittedTime: mainBar.time,
        parentTradeId: trade.id,
        contractId: 'DEFAULT_CONTRACT',
        isExit: true, // Mark this as a strategy-initiated exit
        message: `Exit limit signal: ${signal.message}`,
        commission: perContractCommission,
      });
    }
    
    // Store the submitted exit order in the openTrade.
    // The trade will be finalized (P&L, status, moved to this.trades) 
    // by handleOrderFill when this exitOrder is confirmed filled.
    this.openTrade.exitOrder = exitOrder;
    this.openTrade.signalExit = signal; // Store the signal that initiated this exit attempt
    this.openTrade.exitReason = 'SIGNAL'; // Mark reason
    // DO NOT finalize trade here (P&L, status, push to this.trades, set this.openTrade = null)
    
    console.log(`[EmaStrategy] Submitted exit order ${exitOrder.id} for trade ${trade.id} due to signal.`);
  }

  // Handle order fill events
  private handleOrderFill(order: Order, mainBar: BacktestBarData): StrategySignal | null {
    console.log(`[EmaStrategy] Order filled: ${order.id} (${order.side} ${order.type}) at ${order.filledPrice} qty ${order.filledQuantity}`);

    let generatedSignal: StrategySignal | null = null;

    if (this.openTrade && order.parentTradeId === this.openTrade.id) {
      // This fill belongs to the current openTrade
      if (order.isEntry && order.filledPrice && order.filledTime) {
        this.openTrade.entryPrice = order.filledPrice;
        this.openTrade.entryTime = order.filledTime;
        this.openTrade.entryOrder = { ...order }; // Store a copy of the filled entry order
        console.log(`[EmaStrategy] Confirmed entry for trade ${this.openTrade.id} at ${order.filledPrice}`);
      } else if ((order.isStopLoss || order.isTakeProfit || order.isExit) && order.filledPrice && order.filledTime) {
        // This is an exit fill (SL, TP, or strategy-initiated exit order from closePosition)
        
        // Ensure this fill corresponds to an expected exit mechanism for the open trade
        const isValidExitFill = 
            (order.isStopLoss && this.openTrade.stopLossOrder?.id === order.id) ||
            (order.isTakeProfit && this.openTrade.takeProfitOrder?.id === order.id) ||
            (order.isExit && this.openTrade.exitOrder?.id === order.id);

        if (!isValidExitFill && order.isExit) {
             // This might be a fill for a reversal's closing leg, not for this.openTrade.
             // Or an exit order not properly linked. For now, we assume if isExit, it's for openTrade.
             console.warn(`[EmaStrategy] Exit order ${order.id} filled for trade ${this.openTrade.id}, but was not the explicitly stored exitOrder. Proceeding with closure.`);
        } else if (!isValidExitFill && (order.isStopLoss || order.isTakeProfit)) {
            console.warn(`[EmaStrategy] SL/TP order ${order.id} filled for trade ${this.openTrade.id}, but was not the one stored in openTrade. Proceeding with closure.`);
        }


        this.openTrade.exitPrice = order.filledPrice;
        this.openTrade.exitTime = order.filledTime;
        // If it's an SL/TP fill, order is already the SL/TP order.
        // If it's a strategy exit, this.openTrade.exitOrder was set by closePosition.
        // We should store the actual filled order here.
        this.openTrade.exitOrder = { ...order }; 
        this.openTrade.status = 'CLOSED';
        this.openTrade.exitReason = order.isStopLoss ? 'STOP_LOSS' : (order.isTakeProfit ? 'TAKE_PROFIT' : (this.openTrade.exitReason || 'SIGNAL')); // Preserve 'SIGNAL' if set by closePosition

        // Calculate P&L based on actual fills and order commissions
        const entryOrderCommissionRate = this.openTrade.entryOrder?.commission || 0; // Per contract
        const exitOrderCommissionRate = this.openTrade.exitOrder?.commission || 0;   // Per contract
        const totalCommission = (entryOrderCommissionRate + exitOrderCommissionRate) * this.openTrade.size;
        
        const sideMultiplier = this.openTrade.type === TradeType.BUY ? 1 : -1;
        if (this.openTrade.entryPrice === undefined) { // Should have been set by entry fill
            console.error("[EmaStrategy] Cannot calculate P&L: entryPrice is undefined for trade", this.openTrade.id);
            this.openTrade.profitOrLoss = 0; 
        } else {
            this.openTrade.profitOrLoss = 
                (this.openTrade.exitPrice - this.openTrade.entryPrice) * this.openTrade.size * sideMultiplier - totalCommission;
        }
        
        console.log(`[EmaStrategy] Closed trade ${this.openTrade.id}. Entry: ${this.openTrade.entryPrice}, Exit: ${this.openTrade.exitPrice}, P&L: ${this.openTrade.profitOrLoss?.toFixed(2)}`);
        
        this.trades.push({ ...this.openTrade });
        
        generatedSignal = {
          barIndex: this.currentBarIndex,
          time: order.filledTime,
          type: this.openTrade.type === TradeType.BUY ? StrategySignalType.SELL : StrategySignalType.BUY,
          price: order.filledPrice,
          message: `${this.openTrade.exitReason} triggered for ${this.openTrade.type} trade ${this.openTrade.id}`,
        };
        this.signals.push(generatedSignal);
        
        this.openTrade = null; // Clear the open trade
      }
    } else if (order.isEntry && !this.openTrade) {
        // This case might occur if an entry order for a new trade (e.g. reversal) is filled.
        // The openPosition method should have already created this.openTrade.
        // If this.openTrade is null here, it implies a logic gap or a fill for an unmanaged/unexpected entry.
        console.warn(`[EmaStrategy] Entry order ${order.id} filled, but no corresponding this.openTrade found. This might be part of a reversal not yet fully set up.`);
        // Potentially, if pendingReversalSignal exists, this fill could be for the closing leg of the reversal.
        // The logic for setting up the new leg of the reversal after the close is confirmed needs to be robust.
    }


    // Check if this was a position closing order (from OrderManager's perspective)
    // and we have a pending reversal signal.
    const currentPosition = this.orderManager.getOpenPosition('DEFAULT_CONTRACT');
    if (!currentPosition && this.pendingReversalSignal && this.pendingReversalBar) {
      console.log('[EmaStrategy] Position closed, executing pending reversal');
      const signal = this.pendingReversalSignal;
      const reversalBar = this.pendingReversalBar;
      
      // Clear pending reversal
      this.pendingReversalSignal = null;
      this.pendingReversalBar = null;
      
      // Now open the new position
      this.openPosition(reversalBar, signal, OrderSide.BUY);
    }
    
    return generatedSignal;
  }

  // Run backtest on all bars
  public backtest(mainBars: BacktestBarData[], allSubBars?: SubBarData[]): BacktestResults { // Added allSubBars
    // Reset state
    this.fastEmaValues = [];
    this.slowEmaValues = [];
    this.signals = [];
    this.trades = [];
    this.openTrade = null;
    this.tradeIdCounter = 1;
    this.orderManager.reset();
    
    // Process each bar
    for (let i = 0; i < mainBars.length; i++) {
      const currentMainBar = mainBars[i];
      const relevantSubBars = allSubBars?.filter(sb => sb.parentBarIndex === i);
      this.processBar(currentMainBar, relevantSubBars, i, mainBars);
    }
    
    // Close any open trade at the end
    if (this.openTrade !== null && mainBars.length > 0) {
      const lastMainBar = mainBars[mainBars.length - 1];
      const trade: SimulatedTrade = this.openTrade; // Explicit type annotation
      
      trade.exitTime = lastMainBar.time;
      trade.exitPrice = lastMainBar.close;
      trade.status = 'CLOSED';
      
      const priceDiff = trade.exitPrice - trade.entryPrice;
      trade.profitOrLoss = (priceDiff * trade.size) - (this.config.commission * 2);
      
      this.trades.push(trade);
      this.openTrade = null;
    }
    
    // Calculate results
    return this.calculateResults();
  }

  private calculateResults(): BacktestResults {
    const totalProfitOrLoss = this.trades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const winningTrades = this.trades.filter(t => (t.profitOrLoss || 0) > 0);
    const losingTrades = this.trades.filter(t => (t.profitOrLoss || 0) < 0);
    
    const winRate = this.trades.length > 0 ? (winningTrades.length / this.trades.length) * 100 : 0;
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
      totalTrades: this.trades.length,
      maxDrawdown: 0, // TODO: Calculate actual drawdown
      profitFactor,
      sharpeRatio: 0, // TODO: Calculate if needed
      trades: this.trades,
    };
  }

  // Get current indicators (for real-time display)
  public getCurrentIndicators(): EmaIndicators | null {
    if (this.fastEmaValues.length === 0 || this.slowEmaValues.length === 0) {
      return null;
    }
    
    return {
      fastEma: this.fastEmaValues[this.fastEmaValues.length - 1],
      slowEma: this.slowEmaValues[this.slowEmaValues.length - 1],
    };
  }

  // Get all signals
  public getSignals(): StrategySignal[] {
    return this.signals;
  }

  // Get all trades from OrderManager
  public getTrades(): SimulatedTrade[] {
    return this.orderManager.getCompletedTrades();
  }

  // Get current open trade
  public getOpenTrade(): SimulatedTrade | null {
    return this.openTrade;
  }
}
