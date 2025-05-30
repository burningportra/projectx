// Types for pure strategy pattern - strategies only generate trade ideas
// Execution is handled by separate services

import { UTCTimestamp } from './backtester';

// Represents a trading idea/decision from a strategy
export interface TradeIdea {
  // Identification
  id: string;
  strategyName: string;
  contractId: string;
  
  // Trade decision
  action: 'ENTER_LONG' | 'ENTER_SHORT' | 'EXIT_LONG' | 'EXIT_SHORT' | 'HOLD';
  
  // Signal context
  signalType: string; // e.g., 'CUS', 'CDS'
  signalRule: string; // e.g., 'BWPB_W'
  signalBarIndex: number;
  signalPrice: number;
  confidence: number;
  
  // Trade parameters (suggestions from strategy)
  suggestedEntryPrice?: number;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  suggestedQuantity?: number;
  
  // Timing
  generatedAt: UTCTimestamp;
  validUntil?: UTCTimestamp;
  
  // Additional context
  reason: string;
  metadata?: Record<string, any>;
}

// Configuration for pure strategies
export interface PureStrategyConfig {
  // Signal filtering
  minConfidenceThreshold: number;
  minConfirmationBars: number;
  
  // Risk parameters (for calculating suggestions)
  defaultPositionSize: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  
  // Strategy-specific parameters
  [key: string]: any;
}

// Interface that all pure strategies must implement
export interface IPureStrategy {
  // Core method - process signals and generate trade ideas
  processSignals(
    signals: any[], // Strategy-specific signal type
    currentBarIndex: number,
    hasOpenPosition: boolean,
    openPositionSide?: 'LONG' | 'SHORT'
  ): TradeIdea | null;
  
  // Get strategy configuration
  getConfig(): PureStrategyConfig;
  
  // Reset strategy state
  reset(): void;
}

// Result from analyzing a trade idea
export interface TradeIdeaAnalysis {
  tradeIdea: TradeIdea;
  shouldExecute: boolean;
  executionPlan?: {
    orderType: 'MARKET' | 'LIMIT';
    entryPrice: number;
    quantity: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  };
  rejectionReason?: string;
} 