// StrategyOrchestrator - Orchestrates the flow from signal identification to trade execution
// This demonstrates clean separation of concerns in the trading system

import { TrendIdentifier } from './trend-analysis/TrendIdentifier';
import { PureTrendStartStrategy } from './strategies/PureTrendStartStrategy';
import { TradeExecutor } from './TradeExecutor';
import { OrderManager } from './OrderManager';
import { BacktestBarData, BacktestResults, StrategySignal, OrderSide } from './types/backtester';

export interface OrchestratorConfig {
  // Strategy configuration
  strategyConfig?: {
    minConfidenceThreshold?: number;
    minConfirmationBars?: number;
    defaultPositionSize?: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
  };
  
  // Execution configuration
  executionConfig?: {
    commission?: number;
    useMarketOrders?: boolean;
    limitOrderOffset?: number;
    tickSize?: number;
  };
}

export class StrategyOrchestrator {
  private trendIdentifier: TrendIdentifier;
  private strategy: PureTrendStartStrategy;
  private tradeExecutor: TradeExecutor;
  private signals: StrategySignal[] = [];
  
  constructor(config: OrchestratorConfig = {}) {
    // Initialize components
    this.trendIdentifier = new TrendIdentifier();
    this.strategy = new PureTrendStartStrategy(config.strategyConfig);
    
    const orderManager = new OrderManager(config.executionConfig?.tickSize || 0.25);
    this.tradeExecutor = new TradeExecutor(config.executionConfig, orderManager);
  }

  // Process a single bar - the main orchestration method
  public async processBar(
    bar: BacktestBarData,
    barIndex: number,
    allBars: BacktestBarData[],
    contractId: string = 'UNKNOWN',
    timeframe: string = '1h'
  ): Promise<{
    signal: StrategySignal | null;
    filledOrders: any[];
    tradeIdea: any | null;
  }> {
    // Step 1: Process any pending orders
    const filledOrders = this.tradeExecutor.processBar(bar, barIndex);
    
    // Step 2: Get trend signals from TrendIdentifier
    const trendSignals = await this.trendIdentifier.getSignalsForRange(
      allBars,
      barIndex,
      contractId,
      timeframe
    );
    
    // Step 3: Check current position status
    const orderManager = this.tradeExecutor.getOrderManager();
    const currentPosition = orderManager.getOpenPosition(contractId);
    const hasOpenPosition = !!currentPosition;
    const openPositionSide = currentPosition ? 
      (currentPosition.side === OrderSide.BUY ? 'LONG' : 'SHORT') : undefined;
    
    // Step 4: Set contract ID and generate trade idea from strategy
    this.strategy.setContractId(contractId);
    const tradeIdea = this.strategy.processSignals(
      trendSignals,
      barIndex,
      hasOpenPosition,
      openPositionSide
    );
    
    // Step 5: Execute trade idea if we have one
    let executedSignal: StrategySignal | null = null;
    if (tradeIdea) {
      const executionResult = this.tradeExecutor.executeTradeIdea(tradeIdea, bar);
      if (executionResult.executed && executionResult.signal) {
        executedSignal = executionResult.signal;
        this.signals.push(executedSignal);
      }
    }
    
    return {
      signal: executedSignal,
      filledOrders,
      tradeIdea
    };
  }

  // Run a complete backtest
  public async backtest(
    bars: BacktestBarData[],
    contractId: string = 'UNKNOWN',
    timeframe: string = '1h'
  ): Promise<BacktestResults> {
    // Reset all components
    this.reset();
    
    // Process each bar
    for (let i = 0; i < bars.length; i++) {
      await this.processBar(bars[i], i, bars, contractId, timeframe);
    }
    
    // Calculate results
    return this.calculateResults();
  }

  // Calculate backtest results
  private calculateResults(): BacktestResults {
    const trades = this.tradeExecutor.getExecutedTrades();
    const totalProfitOrLoss = trades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const winningTrades = trades.filter(t => (t.profitOrLoss || 0) > 0);
    const losingTrades = trades.filter(t => (t.profitOrLoss || 0) < 0);
    
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
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
      totalTrades: trades.length,
      maxDrawdown: 0, // TODO: Calculate if needed
      profitFactor,
      sharpeRatio: 0, // TODO: Calculate if needed
      trades,
    };
  }

  // Get all components for advanced use cases
  public getComponents() {
    return {
      trendIdentifier: this.trendIdentifier,
      strategy: this.strategy,
      tradeExecutor: this.tradeExecutor,
      orderManager: this.tradeExecutor.getOrderManager()
    };
  }

  // Reset all components
  public reset(): void {
    this.trendIdentifier.resetState();
    this.strategy.reset();
    this.tradeExecutor.reset();
    this.signals = [];
  }

  // Get all signals
  public getSignals(): StrategySignal[] {
    return this.signals;
  }
} 