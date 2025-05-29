import { 
  BacktestBarData, 
  StrategySignal, 
  StrategySignalType, 
  SimulatedTrade, 
  TradeType, 
  BacktestResults 
} from '@/lib/types/backtester';

export interface EmaStrategyConfig {
  fastPeriod: number;
  slowPeriod: number;
  commission: number;
  positionSize: number;
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

  constructor(config: EmaStrategyConfig = {
    fastPeriod: 12,
    slowPeriod: 26,
    commission: 2.50,
    positionSize: 1
  }) {
    this.config = config;
  }

  // Calculate Exponential Moving Average
  private calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const emaValues: number[] = [];
    
    if (prices.length === 0) return emaValues;
    
    // First EMA is just the first price
    emaValues[0] = prices[0];
    
    // Calculate subsequent EMAs
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
  } {
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
      return { signal: null, indicators };
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
      
      // Open long position
      this.openTrade = {
        id: `EMA_${this.tradeIdCounter++}`,
        entryTime: bar.time,
        entryPrice: bar.close,
        type: TradeType.BUY,
        size: this.config.positionSize,
        commission: this.config.commission,
        status: 'OPEN',
        signalEntry: signal,
      };
      
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
      
      // Close long position
      const trade = this.openTrade!;
      trade.exitTime = bar.time;
      trade.exitPrice = bar.close;
      trade.status = 'CLOSED';
      trade.signalExit = signal;
      
      // Calculate P&L
      const priceDiff = trade.exitPrice - trade.entryPrice;
      trade.profitOrLoss = (priceDiff * trade.size) - (this.config.commission * 2);
      
      this.trades.push(trade);
      this.openTrade = null;
      
      this.signals.push(signal);
    }
    
    return { signal, indicators };
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
    
    // Process each bar
    for (let i = 0; i < bars.length; i++) {
      this.processBar(bars[i], i, bars);
    }
    
    // Close any open trade at the end
    if (this.openTrade && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      this.openTrade.exitTime = lastBar.time;
      this.openTrade.exitPrice = lastBar.close;
      
      const priceDiff = this.openTrade.exitPrice - this.openTrade.entryPrice;
      this.openTrade.profitOrLoss = (priceDiff * this.openTrade.size) - (this.config.commission * 2);
      
      this.trades.push(this.openTrade);
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