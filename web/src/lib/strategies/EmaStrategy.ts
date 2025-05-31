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
  UTCTimestamp
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
  public processBar(bar: BacktestBarData, barIndex: number, allBars: BacktestBarData[]): {
    signal: StrategySignal | null;
    indicators: EmaIndicators;
    filledOrders: Order[];
  } {
    // Store current bar index for use in order fill handling
    this.currentBarIndex = barIndex;
    
    // Process any pending orders first
    const filledOrders = this.orderManager.processBar(bar, barIndex);
    
    // Handle filled orders and collect any signals they generate
    const orderFillSignals: StrategySignal[] = [];
    for (const order of filledOrders) {
      const fillSignal = this.handleOrderFill(order, bar);
      if (fillSignal) {
        orderFillSignals.push(fillSignal);
      }
    }

    // Get closing prices up to current bar
    const closePrices = allBars.slice(0, barIndex + 1).map(b => b.close);
    
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
          time: bar.time,
          type: StrategySignalType.BUY,
          price: bar.close,
          message: `EMA ${this.config.fastPeriod} crossed above EMA ${this.config.slowPeriod}`,
        };
        
        this.openPosition(bar, signal, OrderSide.BUY);
        this.signals.push(signal);
      } else if (hasOpenPosition && currentPosition.side === OrderSide.SELL) {
        // Close SHORT position and open LONG
        signal = {
          barIndex,
          time: bar.time,
          type: StrategySignalType.BUY,
          price: bar.close,
          message: `EMA ${this.config.fastPeriod} crossed above EMA ${this.config.slowPeriod} - Reverse to LONG`,
        };
        
        this.openPosition(bar, signal, OrderSide.BUY); // This will handle the reversal
        this.signals.push(signal);
      }
    } else if (bearishCrossover) {
      if (!hasOpenPosition && !this.pendingReversalSignal) {
        // Open new SHORT position
        signal = {
          barIndex,
          time: bar.time,
          type: StrategySignalType.SELL,
          price: bar.close,
          message: `EMA ${this.config.fastPeriod} crossed below EMA ${this.config.slowPeriod}`,
        };
        
        this.openPosition(bar, signal, OrderSide.SELL);
        this.signals.push(signal);
      } else if (hasOpenPosition && currentPosition.side === OrderSide.BUY) {
        // Close LONG position and open SHORT
        signal = {
          barIndex,
          time: bar.time,
          type: StrategySignalType.SELL,
          price: bar.close,
          message: `EMA ${this.config.fastPeriod} crossed below EMA ${this.config.slowPeriod} - Reverse to SHORT`,
        };
        
        this.openPosition(bar, signal, OrderSide.SELL); // This will handle the reversal
        this.signals.push(signal);
      }
    }
    
    // Return exit signal if available (prioritize over entry signals)
    const finalSignal = orderFillSignals.length > 0 ? orderFillSignals[0] : signal;
    
    return { signal: finalSignal, indicators, filledOrders };
  }

  // Open a position (long or short) with stop loss and take profit
  private openPosition(bar: BacktestBarData, signal: StrategySignal, side: OrderSide): void {
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
        price: bar.close,
        submittedTime: bar.time,
        parentTradeId: existingPosition.id,
        contractId: 'DEFAULT_CONTRACT',
        message: 'Close short position for reversal',
      });
      
      // Mark that we're waiting for position reversal
      this.pendingReversalSignal = signal;
      this.pendingReversalBar = bar;
      return; // Don't open new position yet
    }
    
    const tradeId = `EMA_${this.tradeIdCounter++}`;
    
    // Create entry order
    let entryOrder: Order;
    if (this.config.useMarketOrders) {
      entryOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: side,
        quantity: this.config.positionSize,
        price: bar.close, // Market price
        submittedTime: bar.time,
        parentTradeId: tradeId,
        contractId: 'DEFAULT_CONTRACT',
        isEntry: true,
        message: `EMA crossover ${side} entry`,
      });
    } else {
      // Use limit order with offset based on side
      const limitPrice = side === OrderSide.BUY 
        ? bar.close - (this.config.limitOrderOffset || 2) * 0.25
        : bar.close + (this.config.limitOrderOffset || 2) * 0.25;
      entryOrder = this.orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: side,
        quantity: this.config.positionSize,
        price: limitPrice,
        submittedTime: bar.time,
        parentTradeId: tradeId,
        contractId: 'DEFAULT_CONTRACT',
        isEntry: true,
        message: `EMA crossover ${side} limit entry`,
      });
    }

    // Create stop loss order if configured
    let stopLossOrder: Order | undefined;
    if (this.config.stopLossPercent) {
      stopLossOrder = this.orderManager.createStopLossOrder(
        side,
        this.config.positionSize,
        bar.close,
        this.config.stopLossPercent,
        bar.time,
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
        bar.close,
        this.config.takeProfitPercent,
        bar.time,
        tradeId,
        'DEFAULT_CONTRACT'
      );
    }

    // Create trade record
    this.openTrade = {
      id: tradeId,
      entryTime: bar.time,
      entryPrice: bar.close,
      type: side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      size: this.config.positionSize,
      commission: this.config.commission,
      status: 'OPEN',
      signalEntry: signal,
      entryOrder,
      stopLossOrder,
      takeProfitOrder,
    };

    console.log(`[EmaStrategy] Opened long position ${tradeId} at ${bar.close}`);
    console.log('[EmaStrategy] Entry order:', entryOrder.id, 'Status:', entryOrder.status, 'parentTradeId:', entryOrder.parentTradeId);
    if (stopLossOrder) {
      console.log('[EmaStrategy] SL order:', stopLossOrder.id, 'parentTradeId:', stopLossOrder.parentTradeId, 'stopPrice:', stopLossOrder.stopPrice);
    }
    if (takeProfitOrder) {
      console.log('[EmaStrategy] TP order:', takeProfitOrder.id, 'parentTradeId:', takeProfitOrder.parentTradeId, 'price:', takeProfitOrder.price);
    }
  }

  // Close the current position
  private closePosition(bar: BacktestBarData, signal: StrategySignal, reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT'): void {
    const currentPosition = this.orderManager.getOpenPosition('DEFAULT_CONTRACT');
    if (!currentPosition || !this.openTrade) return;

    const trade = this.openTrade as SimulatedTrade;
    
    // Cancel any pending stop loss and take profit orders
    this.orderManager.cancelOrdersByTradeId(trade.id);

    // Determine exit side (opposite of position side)
    const exitSide = currentPosition.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;

    // Create exit order
    let exitOrder: Order;
    if (this.config.useMarketOrders) {
      exitOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: exitSide,
        quantity: this.config.positionSize,
        price: bar.close,
        submittedTime: bar.time,
        parentTradeId: trade.id,
        contractId: 'DEFAULT_CONTRACT',
        isExit: true,
        positionId: currentPosition.id,
        message: `Exit: ${reason}`,
      });
    } else {
      // Use limit order with offset based on exit side
      const limitPrice = exitSide === OrderSide.SELL
        ? bar.close + (this.config.limitOrderOffset || 2) * 0.25
        : bar.close - (this.config.limitOrderOffset || 2) * 0.25;
      exitOrder = this.orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: exitSide,
        quantity: this.config.positionSize,
        price: limitPrice,
        submittedTime: bar.time,
        parentTradeId: trade.id,
        contractId: 'DEFAULT_CONTRACT',
        isExit: true,
        positionId: currentPosition.id,
        message: `Exit limit: ${reason}`,
      });
    }

    // Complete the trade
    trade.exitTime = bar.time;
    trade.exitPrice = bar.close;
    trade.status = 'CLOSED';
    trade.signalExit = signal;
    trade.exitOrder = exitOrder;
    trade.exitReason = reason;
    
    // Calculate P&L
    const priceDiff = bar.close - trade.entryPrice;
    trade.profitOrLoss = (priceDiff * trade.size) - (this.config.commission * 2);
    
    this.trades.push(trade);
    this.openTrade = null;
    
    console.log(`[EmaStrategy] Closed position ${trade.id} at ${bar.close}, P&L: ${trade.profitOrLoss.toFixed(2)}`);
  }

  // Handle order fill events
  private handleOrderFill(order: Order, bar: BacktestBarData): StrategySignal | null {
    console.log(`[EmaStrategy] Order filled: ${order.id} at ${order.filledPrice}`);
    
    // Handle entry order fills
    if (order.isEntry && this.openTrade && order.filledPrice) {
      // Update the trade with the actual filled entry price
      this.openTrade.entryPrice = order.filledPrice;
      console.log(`[EmaStrategy] Updated entry price to ${order.filledPrice} for trade ${this.openTrade.id}`);
    }
    
    let exitSignal: StrategySignal | null = null;
    
    if (order.isStopLoss && this.openTrade) {
      // Stop loss was hit - create sell signal
      exitSignal = {
        barIndex: this.currentBarIndex,
        time: bar.time,
        type: StrategySignalType.SELL,
        price: order.filledPrice!,
        message: 'Stop loss triggered',
      };
      this.signals.push(exitSignal);
      this.closePosition(bar, exitSignal, 'STOP_LOSS');
    } else if (order.isTakeProfit && this.openTrade) {
      // Take profit was hit - create sell signal  
      exitSignal = {
        barIndex: this.currentBarIndex,
        time: bar.time,
        type: StrategySignalType.SELL,
        price: order.filledPrice!,
        message: 'Take profit triggered',
      };
      this.signals.push(exitSignal);
      this.closePosition(bar, exitSignal, 'TAKE_PROFIT');
    }
    
    // Check if this was a position closing order and we have a pending reversal
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
    
    return exitSignal;
  }

  // Run backtest on all bars
  public backtest(bars: BacktestBarData[]): BacktestResults {
    // Reset state
    this.fastEmaValues = [];
    this.slowEmaValues = [];
    this.signals = [];
    this.trades = [];
    this.openTrade = null;
    this.tradeIdCounter = 1;
    this.orderManager.reset();
    
    // Process each bar
    for (let i = 0; i < bars.length; i++) {
      this.processBar(bars[i], i, bars);
    }
    
    // Close any open trade at the end
    if (this.openTrade !== null && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const trade: SimulatedTrade = this.openTrade; // Explicit type annotation
      
      trade.exitTime = lastBar.time;
      trade.exitPrice = lastBar.close;
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

  // Get all trades
  public getTrades(): SimulatedTrade[] {
    return this.trades;
  }

  // Get current open trade
  public getOpenTrade(): SimulatedTrade | null {
    return this.openTrade;
  }
}
