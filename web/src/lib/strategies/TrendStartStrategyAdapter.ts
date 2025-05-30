// TrendStartStrategyAdapter - Provides backward compatibility with the old TrendStartStrategy interface
// while using the new clean architecture underneath

import { StrategyOrchestrator } from '@/lib/StrategyOrchestrator';
import { 
  BacktestBarData, 
  StrategySignal, 
  SimulatedTrade,
  BacktestResults,
  Order,
  OrderSide,
  StrategyConfig,
  UTCTimestamp
} from '@/lib/types/backtester';
import { TrendIndicators, TrendStartStrategyConfig } from './TrendStartStrategy';
import { TrendStartSignal } from '@/lib/trend-analysis/TrendIdentifier';

// This adapter makes the new architecture compatible with the old TrendStartStrategy interface
export class TrendStartStrategyAdapter {
  private orchestrator: StrategyOrchestrator;
  private config: TrendStartStrategyConfig;
  private signals: StrategySignal[] = [];
  private trackedTrendSignals: TrendStartSignal[] = [];
  private currentTrendDirection: 'UP' | 'DOWN' | 'NONE' = 'NONE';
  
  constructor(config: Partial<TrendStartStrategyConfig> = {}) {
    this.config = {
      commission: 2.50,
      positionSize: 1,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      useMarketOrders: true,
      limitOrderOffset: 2,
      minConfirmationBars: 2,
      confidenceThreshold: 0.6,
      useOpenCloseStrategy: false,
      limitOrderOffsetTicks: 1,
      ...config
    };
    
    // Initialize orchestrator with mapped configuration
    this.orchestrator = new StrategyOrchestrator({
      strategyConfig: {
        minConfidenceThreshold: this.config.confidenceThreshold,
        minConfirmationBars: this.config.minConfirmationBars,
        defaultPositionSize: this.config.positionSize,
        stopLossPercent: this.config.stopLossPercent,
        takeProfitPercent: this.config.takeProfitPercent,
      },
      executionConfig: {
        commission: this.config.commission,
        useMarketOrders: this.config.useMarketOrders,
        limitOrderOffset: this.config.limitOrderOffset,
        tickSize: 0.25, // ES mini tick size
      }
    });
  }

  // Process a single bar - maintains the old interface
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
    // IMPORTANT: Get trend signals BEFORE orchestrator processes them
    // This ensures we capture ALL signals as they appear, not just the ones that result in trades
    const { trendIdentifier } = this.orchestrator.getComponents();
    const trendSignals = await trendIdentifier.getSignalsForRange(allBars, barIndex, contractId, timeframe);
    
    // Update tracked signals immediately as they appear
    for (const signal of trendSignals) {
      const signalKey = `${signal.barIndex}-${signal.type}-${signal.rule}`;
      if (!this.trackedTrendSignals.some(s => 
        `${s.barIndex}-${s.type}-${s.rule}` === signalKey
      )) {
        this.trackedTrendSignals.push(signal);
        this.currentTrendDirection = signal.type === 'CUS' ? 'UP' : 'DOWN';
      }
    }
    
    // Now use the orchestrator to process for trading
    const result = await this.orchestrator.processBar(bar, barIndex, allBars, contractId, timeframe);
    
    // Update internal state to match old behavior
    if (result.signal) {
      this.signals.push(result.signal);
    }
    
    const indicators: TrendIndicators = {
      trendDirection: this.currentTrendDirection,
      lastSignal: this.trackedTrendSignals[this.trackedTrendSignals.length - 1],
      trendStrength: this.trackedTrendSignals[this.trackedTrendSignals.length - 1]?.confidence
    };
    
    return {
      signal: result.signal,
      indicators,
      filledOrders: result.filledOrders
    };
  }

  // Run backtest - maintains the old interface
  public async backtest(
    bars: BacktestBarData[], 
    contractId: string = 'UNKNOWN', 
    timeframe: string = '1h'
  ): Promise<BacktestResults> {
    this.reset();
    return await this.orchestrator.backtest(bars, contractId, timeframe);
  }

  // Get current indicators
  public getCurrentIndicators(): TrendIndicators | null {
    return {
      trendDirection: this.currentTrendDirection,
      lastSignal: this.trackedTrendSignals[this.trackedTrendSignals.length - 1]
    };
  }

  // Get all signals
  public getSignals(): StrategySignal[] {
    return this.orchestrator.getSignals();
  }

  // Get all trades
  public getTrades(): SimulatedTrade[] {
    return this.orchestrator.getComponents().tradeExecutor.getExecutedTrades();
  }

  // Get detected trend start signals
  public getTrendSignals(): TrendStartSignal[] {
    return this.trackedTrendSignals;
  }

  // Get current open trade
  public getOpenTrade(): any | null {
    const { orderManager } = this.orchestrator.getComponents();
    const positions = orderManager.getAllOpenPositions();
    return positions.length > 0 ? positions[0] : null;
  }

  // Get pending orders
  public getPendingOrders(): Order[] {
    const { orderManager } = this.orchestrator.getComponents();
    return orderManager.getPendingOrders();
  }

  // Get filled orders
  public getFilledOrders(): Order[] {
    const { orderManager } = this.orchestrator.getComponents();
    return orderManager.getFilledOrders();
  }

  // Get cancelled orders
  public getCancelledOrders(): Order[] {
    const { orderManager } = this.orchestrator.getComponents();
    return orderManager.getCancelledOrders();
  }

  // Reset strategy state
  public resetState(): void {
    this.reset();
  }

  // Reset all components
  public reset(): void {
    this.signals = [];
    this.trackedTrendSignals = [];
    this.currentTrendDirection = 'NONE';
    this.orchestrator.reset();
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
    const { orderManager, tradeExecutor } = this.orchestrator.getComponents();
    
    let totalRealizedPnl = 0;
    let totalUnrealizedPnl = 0;
    const positionsPnl: Array<{
      contractId: string;
      realizedPnl: number;
      unrealizedPnl: number;
      totalPnl: number;
    }> = [];

    // Get P&L for completed trades
    const completedTrades = tradeExecutor.getExecutedTrades();
    for (const trade of completedTrades) {
      totalRealizedPnl += trade.profitOrLoss || 0;
    }

    // Get P&L for open positions
    const openPositions = orderManager.getAllOpenPositions();
    for (const position of openPositions) {
      const currentPrice = currentPrices.get(position.contractId) || position.averageEntryPrice;
      const pnlData = orderManager.getPositionTotalPnL(position.contractId, currentPrice);
      
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

  // Get comprehensive strategy state
  public getStrategyState(currentPrices: Map<string, number> = new Map()): any {
    const { orderManager } = this.orchestrator.getComponents();
    
    return {
      indicators: this.getCurrentIndicators(),
      openTrade: this.getOpenTrade(),
      completedTrades: this.getTrades(),
      pnl: this.getCurrentPnL(currentPrices),
      orderManagerState: orderManager.getCompleteState(currentPrices)
    };
  }
} 