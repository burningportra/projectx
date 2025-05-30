// PureTrendStartStrategy - A pure strategy that only generates trade ideas from trend signals
// No execution logic, just signal processing and trade decision making

import { IPureStrategy, PureStrategyConfig, TradeIdea } from '@/lib/types/strategy';
import { TrendStartSignal as TrendLibSignal } from '@/lib/trend-analysis/TrendIdentifier';
import { UTCTimestamp } from '@/lib/types/backtester';

export interface PureTrendStartConfig extends PureStrategyConfig {
  // Additional trend-specific configuration can go here
}

export class PureTrendStartStrategy implements IPureStrategy {
  private config: PureTrendStartConfig;
  private tradeIdeaCounter = 1;
  private lastProcessedSignalKey: string | null = null;
  private currentContractId: string = 'UNKNOWN';
  
  constructor(config: Partial<PureTrendStartConfig> = {}) {
    this.config = {
      // Signal filtering
      minConfidenceThreshold: 0.6,
      minConfirmationBars: 2,
      
      // Risk parameters (for suggestions)
      defaultPositionSize: 1,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      
      ...config
    };
  }

  // Set the current contract ID (should be called before processing signals)
  public setContractId(contractId: string): void {
    this.currentContractId = contractId;
  }

  // Process trend signals and generate trade ideas
  public processSignals(
    signals: TrendLibSignal[],
    currentBarIndex: number,
    hasOpenPosition: boolean,
    openPositionSide?: 'LONG' | 'SHORT'
  ): TradeIdea | null {
    // Find ALL signals up to current bar, not just those meeting confidence threshold
    // The confidence check will be done when generating the trade idea
    const relevantSignals = signals.filter(s => s.barIndex <= currentBarIndex);
    
    if (relevantSignals.length === 0) {
      return null;
    }
    
    // Process ALL new signals, not just the latest one
    // This ensures we don't miss any trend starts
    for (const signal of relevantSignals) {
      const signalKey = `${signal.barIndex}-${signal.type}-${signal.rule}`;
      
      // Skip if we've already processed this signal
      if (signalKey === this.lastProcessedSignalKey) {
        continue;
      }
      
      // Check confidence threshold here, but still mark as processed
      if ((signal.confidence || 0) >= this.config.minConfidenceThreshold) {
        this.lastProcessedSignalKey = signalKey;
        
        // Generate trade idea based on signal and position state
        const tradeIdea = this.generateTradeIdea(signal, hasOpenPosition, openPositionSide);
        if (tradeIdea) {
          return tradeIdea;
        }
      }
    }
    
    return null;
  }

  // Generate a trade idea from a signal
  private generateTradeIdea(
    signal: TrendLibSignal,
    hasOpenPosition: boolean,
    openPositionSide?: 'LONG' | 'SHORT'
  ): TradeIdea | null {
    let action: TradeIdea['action'];
    let reason: string;
    
    // Determine action based on signal type and current position
    if (signal.type === 'CUS') {
      if (!hasOpenPosition) {
        action = 'ENTER_LONG';
        reason = `Confirmed uptrend start - ${signal.rule}`;
      } else if (openPositionSide === 'SHORT') {
        action = 'EXIT_SHORT';
        reason = `Uptrend signal - close short position`;
      } else {
        // Already long, hold
        return null;
      }
    } else if (signal.type === 'CDS') {
      if (hasOpenPosition && openPositionSide === 'LONG') {
        action = 'EXIT_LONG';
        reason = `Confirmed downtrend start - ${signal.rule}`;
      } else {
        // This strategy doesn't enter shorts on CDS
        return null;
      }
    } else {
      return null;
    }
    
    // Calculate suggested prices
    const suggestedStopLoss = this.calculateStopLoss(signal.price, action);
    const suggestedTakeProfit = this.calculateTakeProfit(signal.price, action);
    
    // Create trade idea
    const tradeIdea: TradeIdea = {
      id: `trend_idea_${this.tradeIdeaCounter++}`,
      strategyName: 'PureTrendStartStrategy',
      contractId: this.currentContractId,
      
      action: action,
      
      signalType: signal.type,
      signalRule: signal.rule || 'UNKNOWN',
      signalBarIndex: signal.barIndex,
      signalPrice: signal.price,
      confidence: signal.confidence || 0,
      
      suggestedEntryPrice: signal.price,
      suggestedStopLoss: suggestedStopLoss,
      suggestedTakeProfit: suggestedTakeProfit,
      suggestedQuantity: this.config.defaultPositionSize,
      
      generatedAt: Date.now() as UTCTimestamp,
      validUntil: (Date.now() + 60000) as UTCTimestamp, // Valid for 1 minute
      
      reason: reason,
      metadata: {
        rule: signal.rule,
        confidence: signal.confidence
      }
    };
    
    return tradeIdea;
  }

  // Calculate stop loss price
  private calculateStopLoss(entryPrice: number, action: TradeIdea['action']): number {
    const stopLossDistance = entryPrice * (this.config.stopLossPercent / 100);
    
    if (action === 'ENTER_LONG') {
      return entryPrice - stopLossDistance;
    } else if (action === 'ENTER_SHORT') {
      return entryPrice + stopLossDistance;
    }
    
    return entryPrice;
  }

  // Calculate take profit price
  private calculateTakeProfit(entryPrice: number, action: TradeIdea['action']): number {
    const takeProfitDistance = entryPrice * (this.config.takeProfitPercent / 100);
    
    if (action === 'ENTER_LONG') {
      return entryPrice + takeProfitDistance;
    } else if (action === 'ENTER_SHORT') {
      return entryPrice - takeProfitDistance;
    }
    
    return entryPrice;
  }

  // Get strategy configuration
  public getConfig(): PureTrendStartConfig {
    return this.config;
  }

  // Reset strategy state
  public reset(): void {
    this.tradeIdeaCounter = 1;
    this.lastProcessedSignalKey = null;
    this.currentContractId = 'UNKNOWN';
  }
} 