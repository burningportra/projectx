import { BacktestBarData, UTCTimestamp } from './backtester';

export interface TrendStart {
  barIndex: number;
  time: UTCTimestamp;
  price: number;
  direction: 'up' | 'down';
  strength?: number; 
  confirmed?: boolean;
}

export interface ITrendIdentifier {
  identifyTrends(bars: BacktestBarData[]): TrendStart[];
  reset(): void;
  // processBar?(bar: BacktestBarData): TrendStart | null; 
}

export interface EnhancedTrendAnalyzerConfig {
  defaultStrengtheningThreshold?: number;
  // minTrendDurationForMetrics?: number;
  // lookbackPeriodForExtremes?: number;
}

export interface TrendMetrics {
  durationBars: number;
  durationSeconds?: number;
  priceChangeAbsolute: number;
  priceChangePercent: number;
}

export interface ExtremeTrendStarts {
  highestHighTrend: TrendStart | null;
  lowestLowTrend: TrendStart | null;
}

export interface StrengthenedTrend extends TrendStart {
  strengthScore: number;
}
