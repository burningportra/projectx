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
    // Process any pending orders first
    const filledOrders = this.orderManager.processBar(bar, barIndex);
    
    // Handle filled orders
    for (const order of filledOrders) {
      this.handleOrderFill(order, bar);
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
    
    let signal: StrategySignal | null = null;
    
    if (bullishCrossover && !this.openTrade) {
      // Generate BUY signal
      signal = {
        barIndex,
        time: bar.time,
        type: StrategySignalType.BUY,
        price: bar.close,
        message: `EMA ${this.config.fastPeriod} crossed above EMA ${this.config.slowPeriod}`,
      };
      
      this.openLongPosition(bar, signal);
      this.signals.push(signal);
    } else if (bearishCrossover && this.openTrade !== null) {
      // Generate SELL signal
      signal = {
        barIndex,
        time: bar.time,
        type: StrategySignalType.SELL,
        price: bar.close,
        message: `EMA ${this.config.fastPeriod} crossed below EMA ${this.config.slowPeriod}`,
      };
      
      this.closePosition(bar, signal, 'SIGNAL');
      this.signals.push(signal);
    }
    
    return { signal, indicators, filledOrders };
  }

  // Open a long position with stop loss and take profit
  private openLongPosition(bar: BacktestBarData, signal: StrategySignal): void {
    const tradeId = `EMA_${this.tradeIdCounter++}`;
    
    // Create entry order
    let entryOrder: Order;
    if (this.config.useMarketOrders) {
      entryOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        quantity: this.config.positionSize,
        price: bar.close, // Market price
        submittedTime: bar.time,
        parentTradeId: tradeId,
        contractId: 'DEFAULT_CONTRACT',
        message: 'EMA crossover entry',
      });
    } else {
      // Use limit order slightly below market
      const limitPrice = bar.close - (this.config.limitOrderOffset || 2) * 0.25;
      entryOrder = this.orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        quantity: this.config.positionSize,
        price: limitPrice,
        submittedTime: bar.time,
        parentTradeId: tradeId,
        contractId: 'DEFAULT_CONTRACT',
        message: 'EMA crossover limit entry',
      });
    }

    // Create stop loss order if configured
    let stopLossOrder: Order | undefined;
    if (this.config.stopLossPercent) {
      stopLossOrder = this.orderManager.createStopLossOrder(
        OrderSide.BUY,
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
        OrderSide.BUY,
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
      type: TradeType.BUY,
      size: this.config.positionSize,
      commission: this.config.commission,
      status: 'OPEN',
      signalEntry: signal,
      entryOrder,
      stopLossOrder,
      takeProfitOrder,
    };

    console.log(`[EmaStrategy] Opened long position ${tradeId} at ${bar.close}`);
  }

  // Close the current position
  private closePosition(bar: BacktestBarData, signal: StrategySignal, reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT'): void {
    if (!this.openTrade) return;

    const trade = this.openTrade as SimulatedTrade; // Type assertion since we know it's not null
    
    // Cancel any pending stop loss and take profit orders
    this.orderManager.cancelOrdersByTradeId(trade.id);

    // Create exit order
    let exitOrder: Order;
    if (this.config.useMarketOrders) {
      exitOrder = this.orderManager.submitOrder({
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        quantity: this.config.positionSize,
        price: bar.close,
        submittedTime: bar.time,
        parentTradeId: trade.id,
        contractId: 'DEFAULT_CONTRACT',
        message: `Exit: ${reason}`,
      });
    } else {
      // Use limit order slightly above market for sells
      const limitPrice = bar.close + (this.config.limitOrderOffset || 2) * 0.25;
      exitOrder = this.orderManager.submitOrder({
        type: OrderType.LIMIT,
        side: OrderSide.SELL,
        quantity: this.config.positionSize,
        price: limitPrice,
        submittedTime: bar.time,
        parentTradeId: trade.id,
        contractId: 'DEFAULT_CONTRACT',
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
  private handleOrderFill(order: Order, bar: BacktestBarData): void {
    console.log(`[EmaStrategy] Order filled: ${order.id} at ${order.filledPrice}`);
    
    if (order.isStopLoss && this.openTrade) {
      // Stop loss was hit
      const signal: StrategySignal = {
        barIndex: 0, // Would need to track this properly
        time: bar.time,
        type: StrategySignalType.SELL,
        price: order.filledPrice!,
        message: 'Stop loss triggered',
      };
      this.closePosition(bar, signal, 'STOP_LOSS');
    } else if (order.isTakeProfit && this.openTrade) {
      // Take profit was hit
      const signal: StrategySignal = {
        barIndex: 0, // Would need to track this properly
        time: bar.time,
        type: StrategySignalType.SELL,
        price: order.filledPrice!,
        message: 'Take profit triggered',
      };
      this.closePosition(bar, signal, 'TAKE_PROFIT');
    }
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
} 