import { 
  BacktestBarData, 
  StrategySignal, 
  StrategySignalType, 
  SimulatedTrade, 
  TradeType, 
  BacktestResults 
} from '@/lib/types/backtester';

export interface TrendStartStrategyConfig {
  commission: number;
  positionSize: number;
  stopLossPercent?: number; // Optional stop loss as percentage
  takeProfitPercent?: number; // Optional take profit as percentage
  minConfirmationBars?: number; // Minimum bars to confirm trend
}

export interface TrendStartSignal {
  type: 'CUS' | 'CDS'; // Change to Uptrend Start / Change to Downtrend Start
  barIndex: number;
  price: number;
  confidence?: number;
  rule?: string; // Rule type from Python analysis
}

export interface TrendIndicators {
  trendDirection: 'UP' | 'DOWN' | 'NONE';
  trendStrength?: number;
  lastSignal?: TrendStartSignal;
}

export class TrendStartStrategy {
  private config: TrendStartStrategyConfig;
  private signals: StrategySignal[] = [];
  private trades: SimulatedTrade[] = [];
  private openTrade: SimulatedTrade | null = null;
  private tradeIdCounter = 1;
  private trendSignals: TrendStartSignal[] = [];
  private currentTrend: 'UP' | 'DOWN' | 'NONE' = 'NONE';
  
  // Forward testing state - process bars one at a time
  private processedBarCount: number = 0;
  private forwardTestingCache: Map<string, TrendStartSignal[]> = new Map();
  
  constructor(config: TrendStartStrategyConfig = {
    commission: 2.50,
    positionSize: 1,
    stopLossPercent: 2.0, // 2% stop loss
    takeProfitPercent: 4.0, // 4% take profit
    minConfirmationBars: 2
  }) {
    this.config = config;
  }

  // Call Python forward testing API for real-time trend detection
  private async detectTrendStartsForwardTesting(
    bars: BacktestBarData[], 
    currentBarIndex: number, 
    contractId: string, 
    timeframe: string
  ): Promise<TrendStartSignal[]> {
    try {
      // Create cache key based on current state
      const cacheKey = `${contractId}-${timeframe}-${currentBarIndex}`;
      
      // Only process if we haven't processed this bar yet
      if (currentBarIndex < this.processedBarCount) {
        // Going backwards - use cached results up to this point
        const cachedResults: TrendStartSignal[] = [];
        for (let i = 0; i <= currentBarIndex; i++) {
          const barKey = `${contractId}-${timeframe}-${i}`;
          const barSignals = this.forwardTestingCache.get(barKey) || [];
          cachedResults.push(...barSignals);
        }
        console.log(`[TrendStartStrategy] Using cached results for backward navigation to bar ${currentBarIndex}: ${cachedResults.length} signals`);
        return cachedResults;
      }

      // Process bars sequentially up to currentBarIndex using forward testing
      const allSignals: TrendStartSignal[] = [];
      
      // Get all signals up to and including current bar from cache first
      for (let i = 0; i < currentBarIndex; i++) {
        const barKey = `${contractId}-${timeframe}-${i}`;
        const cachedBarSignals = this.forwardTestingCache.get(barKey);
        if (cachedBarSignals) {
          allSignals.push(...cachedBarSignals);
        }
      }
      
      // Process only the current bar if we haven't processed it yet
      const currentBarKey = `${contractId}-${timeframe}-${currentBarIndex}`;
      if (!this.forwardTestingCache.has(currentBarKey)) {
        console.log(`[TrendStartStrategy] Processing new bar ${currentBarIndex} via forward testing API`);
        
        // Convert bars up to current index for Python API (forward testing approach)
        const barsUpToCurrent = bars.slice(0, currentBarIndex + 1).map((bar, index) => ({
          index: index + 1, // Python uses 1-based indexing
          timestamp: new Date(bar.time * 1000).toISOString(),
          date: new Date(bar.time * 1000).toISOString(),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume || 0
        }));

        const response = await fetch('/api/trend-analysis/forward', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bars: barsUpToCurrent,
            contract_id: contractId,
            timeframe: timeframe,
            current_bar_index: currentBarIndex + 1, // Python uses 1-based indexing
            debug: false
          })
        });

        if (!response.ok) {
          console.error('[TrendStartStrategy] Forward testing API call failed:', response.status, response.statusText);
          // Cache empty result to avoid repeated failed calls
          this.forwardTestingCache.set(currentBarKey, []);
          return allSignals;
        }

        const result = await response.json();
        console.log(`[TrendStartStrategy] Forward testing API returned ${result.signals?.length || 0} new signals for bar ${currentBarIndex}`);

        // Convert new Python signals to our format
        const newSignals: TrendStartSignal[] = (result.new_signals || []).map((pythonSignal: any) => {
          let signalType: 'CUS' | 'CDS';
          if (pythonSignal.signal_type === 'uptrend_start') {
            signalType = 'CUS';
          } else if (pythonSignal.signal_type === 'downtrend_start') {
            signalType = 'CDS';
          } else {
            signalType = pythonSignal.signal_type === 'CUS' ? 'CUS' : 'CDS';
          }

          const barIndex = (pythonSignal.details?.confirmed_signal_bar_index || pythonSignal.bar_index || 1) - 1; // Convert to 0-based
          const price = pythonSignal.signal_price || pythonSignal.price || 0;
          const rule = pythonSignal.details?.rule_type || 'Unknown';

          return {
            type: signalType,
            barIndex: barIndex,
            price: price,
            confidence: pythonSignal.confidence || 0.95, // High confidence for Python signals
            rule: rule
          };
        });

        // Cache the new signals for this specific bar
        this.forwardTestingCache.set(currentBarKey, newSignals);
        allSignals.push(...newSignals);
        
        console.log(`[TrendStartStrategy] Processed bar ${currentBarIndex}, found ${newSignals.length} new signals. Total signals: ${allSignals.length}`);
      } else {
        // Use cached signals for current bar
        const cachedCurrentBarSignals = this.forwardTestingCache.get(currentBarKey) || [];
        allSignals.push(...cachedCurrentBarSignals);
        console.log(`[TrendStartStrategy] Using cached signals for bar ${currentBarIndex}: ${cachedCurrentBarSignals.length} signals`);
      }

      // Update processed bar count
      this.processedBarCount = Math.max(this.processedBarCount, currentBarIndex + 1);
      
      return allSignals;

    } catch (error) {
      console.error('[TrendStartStrategy] Error calling forward testing API:', error);
      // Fallback to simplified detection if API fails
      return this.detectTrendStartSimplified(bars, currentBarIndex);
    }
  }

  // Simplified fallback detection (original logic)
  private detectTrendStartSimplified(bars: BacktestBarData[], currentIndex: number): TrendStartSignal[] {
    if (currentIndex < 3) return [];
    
    const currentBar = bars[currentIndex];
    const prevBar = bars[currentIndex - 1];
    const prevBar2 = bars[currentIndex - 2];
    
    const signals: TrendStartSignal[] = [];
    
    // Simplified CUS detection
    const isHigherLow = currentBar.low > prevBar.low && prevBar.low > prevBar2.low;
    const breaksPrevHigh = currentBar.high > prevBar.high && currentBar.close > prevBar.high;
    
    if (isHigherLow && breaksPrevHigh && this.currentTrend !== 'UP') {
      signals.push({
        type: 'CUS',
        barIndex: currentIndex,
        price: currentBar.close,
        confidence: 0.6, // Lower confidence for simplified detection
        rule: 'SimplifiedCUS'
      });
    }
    
    // Simplified CDS detection
    const isLowerHigh = currentBar.high < prevBar.high && prevBar.high < prevBar2.high;
    const breaksPrevLow = currentBar.low < prevBar.low && currentBar.close < prevBar.low;
    
    if (isLowerHigh && breaksPrevLow && this.currentTrend !== 'DOWN') {
      signals.push({
        type: 'CDS',
        barIndex: currentIndex,
        price: currentBar.close,
        confidence: 0.6,
        rule: 'SimplifiedCDS'
      });
    }
    
    return signals;
  }

  // Check stop loss and take profit conditions
  private checkExitConditions(bar: BacktestBarData): boolean {
    if (!this.openTrade) return false;
    
    const entryPrice = this.openTrade.entryPrice;
    const currentPrice = bar.close;
    
    if (this.openTrade.type === TradeType.BUY) {
      // Check stop loss
      if (this.config.stopLossPercent) {
        const stopLossPrice = entryPrice * (1 - this.config.stopLossPercent / 100);
        if (currentPrice <= stopLossPrice) {
          return true;
        }
      }
      
      // Check take profit
      if (this.config.takeProfitPercent) {
        const takeProfitPrice = entryPrice * (1 + this.config.takeProfitPercent / 100);
        if (currentPrice >= takeProfitPrice) {
          return true;
        }
      }
    }
    
    return false;
  }

  // Process a single bar and generate signals - now uses forward testing
  public async processBar(
    bar: BacktestBarData, 
    barIndex: number, 
    allBars: BacktestBarData[], 
    contractId: string = 'UNKNOWN', 
    timeframe: string = '1h'
  ): Promise<{
    signal: StrategySignal | null;
    indicators: TrendIndicators;
  }> {
    console.log(`[TrendStartStrategy] Processing bar ${barIndex} (${new Date(bar.time * 1000).toISOString()}) using forward testing`);
    
    // Get trend signals up to current bar using forward testing approach
    const availableSignals = await this.detectTrendStartsForwardTesting(allBars, barIndex, contractId, timeframe);
    
    // Find new signals that we haven't processed yet (for trade decisions)
    const existingSignalKeys = new Set(this.trendSignals.map(s => `${s.barIndex}-${s.type}`));
    const newSignalsThisProcessing = availableSignals.filter(signal => 
      !existingSignalKeys.has(`${signal.barIndex}-${signal.type}`)
    );
    
    // Find specifically new signals for this bar (for logging)
    const newSignalsForThisBar = newSignalsThisProcessing.filter(signal => signal.barIndex === barIndex);
    
    console.log(`[TrendStartStrategy] Bar ${barIndex}: Found ${newSignalsForThisBar.length} new signals for this specific bar from forward testing:`, newSignalsForThisBar);
    console.log(`[TrendStartStrategy] Bar ${barIndex}: Found ${newSignalsThisProcessing.length} total new signals (all bars) from forward testing:`, newSignalsThisProcessing);
    
    // Add ALL new signals to our tracking (not just for current bar)
    this.trendSignals.push(...newSignalsThisProcessing);
    
    // Update current trend based on latest signal from any bar
    const latestNewSignal = newSignalsThisProcessing[newSignalsThisProcessing.length - 1];
    if (latestNewSignal) {
      this.currentTrend = latestNewSignal.type === 'CUS' ? 'UP' : 'DOWN';
      console.log(`[TrendStartStrategy] New ${latestNewSignal.type} signal at bar ${latestNewSignal.barIndex}, rule: ${latestNewSignal.rule}, confidence: ${latestNewSignal.confidence}`);
    }
    
    const indicators: TrendIndicators = {
      trendDirection: this.currentTrend,
      lastSignal: latestNewSignal
    };
    
    let signal: StrategySignal | null = null;
    
    // Check for exit conditions first
    if (this.openTrade && this.checkExitConditions(bar)) {
      signal = {
        barIndex,
        time: bar.time,
        type: StrategySignalType.SELL,
        price: bar.close,
        message: 'Stop loss or take profit triggered',
      };
      
      console.log(`[TrendStartStrategy] Exit signal generated at bar ${barIndex}`);
      this.closePosition(bar, signal);
    }
    // Process new trend signals (only for the current bar for trade timing)
    else if (newSignalsForThisBar.length > 0) {
      const currentBarSignal = newSignalsForThisBar[newSignalsForThisBar.length - 1];
      if (currentBarSignal.type === 'CUS' && !this.openTrade) {
        // Generate BUY signal for Change to Uptrend Start
        signal = {
          barIndex,
          time: bar.time,
          type: StrategySignalType.BUY,
          price: bar.close,
          message: `CUS detected: ${currentBarSignal.rule} (confidence: ${((currentBarSignal.confidence || 0) * 100).toFixed(1)}%)`,
        };
        
        console.log(`[TrendStartStrategy] BUY signal generated at bar ${barIndex} for CUS with rule: ${currentBarSignal.rule}`);
        this.openPosition(bar, signal, TradeType.BUY);
      } 
      else if (currentBarSignal.type === 'CDS' && this.openTrade) {
        // Generate SELL signal for Change to Downtrend Start
        signal = {
          barIndex,
          time: bar.time,
          type: StrategySignalType.SELL,
          price: bar.close,
          message: `CDS detected: ${currentBarSignal.rule} (confidence: ${((currentBarSignal.confidence || 0) * 100).toFixed(1)}%)`,
        };
        
        console.log(`[TrendStartStrategy] SELL signal generated at bar ${barIndex} for CDS with rule: ${currentBarSignal.rule}`);
        this.closePosition(bar, signal);
      } else {
        console.log(`[TrendStartStrategy] Signal ${currentBarSignal.type} at bar ${barIndex} - no trade action (openTrade: ${!!this.openTrade}, rule: ${currentBarSignal.rule})`);
      }
    } else if (newSignalsThisProcessing.length > 0) {
      // Handle signals from previous bars that were just detected
      console.log(`[TrendStartStrategy] Found ${newSignalsThisProcessing.length} new signals from previous bars, but no trade action for bar ${barIndex}`);
    }
    
    return { signal, indicators };
  }

  private openPosition(bar: BacktestBarData, signal: StrategySignal, type: TradeType): void {
    this.openTrade = {
      id: `TREND_${this.tradeIdCounter++}`,
      entryTime: bar.time,
      entryPrice: bar.close,
      type: type,
      size: this.config.positionSize,
      commission: this.config.commission,
      status: 'OPEN',
      signalEntry: signal,
    };
    
    this.signals.push(signal);
  }

  private closePosition(bar: BacktestBarData, signal: StrategySignal): void {
    if (!this.openTrade) return;
    
    const trade = this.openTrade;
    trade.exitTime = bar.time;
    trade.exitPrice = bar.close;
    trade.status = 'CLOSED';
    trade.signalExit = signal;
    
    // Calculate P&L
    const priceDiff = trade.exitPrice! - trade.entryPrice;
    trade.profitOrLoss = (priceDiff * trade.size) - (this.config.commission * 2);
    
    this.trades.push(trade);
    this.openTrade = null;
    
    this.signals.push(signal);
  }

  // Run backtest on all bars - now uses forward testing approach
  public async backtest(bars: BacktestBarData[], contractId: string = 'UNKNOWN', timeframe: string = '1h'): Promise<BacktestResults> {
    // Reset state
    this.signals = [];
    this.trades = [];
    this.openTrade = null;
    this.tradeIdCounter = 1;
    this.trendSignals = [];
    this.currentTrend = 'NONE';
    
    console.log(`[TrendStartStrategy] Starting forward testing backtest with ${bars.length} bars for ${contractId} ${timeframe}`);
    
    // Process each bar sequentially using forward testing
    for (let i = 0; i < bars.length; i++) {
      await this.processBar(bars[i], i, bars, contractId, timeframe);
    }
    
    // Close any open trade at the end
    if (this.openTrade && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const trade = this.openTrade as SimulatedTrade;
      trade.exitTime = lastBar.time;
      trade.exitPrice = lastBar.close;
      
      const priceDiff = trade.exitPrice! - trade.entryPrice;
      trade.profitOrLoss = (priceDiff * trade.size) - (this.config.commission * 2);
      
      this.trades.push(trade);
      this.openTrade = null;
    }
    
    const results = this.calculateResults();
    console.log(`[TrendStartStrategy] Forward testing backtest completed. ${results.totalTrades} trades, P&L: ${results.totalProfitOrLoss.toFixed(2)}`);
    return results;
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
  public getCurrentIndicators(): TrendIndicators | null {
    return {
      trendDirection: this.currentTrend,
      lastSignal: this.trendSignals[this.trendSignals.length - 1]
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

  // Get detected trend start signals
  public getTrendSignals(): TrendStartSignal[] {
    return this.trendSignals;
  }

  // Get current open trade
  public getOpenTrade(): SimulatedTrade | null {
    return this.openTrade;
  }

  // Get current trade ID counter
  public getTradeIdCounter(): number {
    return this.tradeIdCounter;
  }

  // Reset strategy state (useful when loading new data) - now clears forward testing cache
  public resetState(): void {
    this.signals = [];
    this.trades = [];
    this.openTrade = null;
    this.tradeIdCounter = 1;
    this.trendSignals = [];
    this.currentTrend = 'NONE';
    this.processedBarCount = 0;
    this.forwardTestingCache.clear(); // Clear the forward testing cache
    console.log('[TrendStartStrategy] State reset - forward testing cache cleared');
  }
} 