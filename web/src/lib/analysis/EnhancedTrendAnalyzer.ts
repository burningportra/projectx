import { BacktestBarData, UTCTimestamp } from '../types/backtester';
import { 
  TrendStart, 
  ITrendIdentifier, 
  EnhancedTrendAnalyzerConfig, 
  TrendMetrics, 
  ExtremeTrendStarts, 
  StrengthenedTrend 
} from '../types/trend';

/**
 * Provides advanced trend analysis capabilities by wrapping a basic TrendIdentifier.
 * It offers methods to get derived, trader-friendly signals and metrics from trends.
 */
export class EnhancedTrendAnalyzer {
  private trendIdentifier: ITrendIdentifier;
  private bars: BacktestBarData[] = [];
  private identifiedTrendStarts: TrendStart[] = [];
  
  private config: EnhancedTrendAnalyzerConfig;

  /**
   * Default configuration for the EnhancedTrendAnalyzer.
   */
  private static readonly defaultConfig: EnhancedTrendAnalyzerConfig = {
    defaultStrengtheningThreshold: 0.1, // Example: average price change per bar
  };

  /**
   * Constructs an EnhancedTrendAnalyzer.
   * @param trendIdentifier An instance of a class that implements ITrendIdentifier.
   * @param initialBars Optional initial set of bars to process.
   * @param config Optional configuration for the analyzer.
   * @throws Error if trendIdentifier is not provided.
   */
  constructor(
    trendIdentifier: ITrendIdentifier,
    initialBars: BacktestBarData[] = [],
    config?: Partial<EnhancedTrendAnalyzerConfig>
  ) {
    if (!trendIdentifier) {
      throw new Error("[EnhancedTrendAnalyzer] TrendIdentifier instance is required.");
    }
    this.trendIdentifier = trendIdentifier;
    this.config = { ...EnhancedTrendAnalyzer.defaultConfig, ...config };
    
    if (initialBars && initialBars.length > 0) {
      this.processNewBars(initialBars);
    }
  }

  /**
   * Processes new bars, updates internal state, and re-identifies trends.
   * This should be called as new data arrives.
   * @param newBars An array of new bar data to append and process.
   */
  public processNewBars(newBars: BacktestBarData[]): void {
    if (!newBars || !Array.isArray(newBars)) {
      // console.warn("[EnhancedTrendAnalyzer.processNewBars] Invalid newBars array provided.");
      return;
    }
    if (newBars.length === 0) {
      return; // Nothing to process
    }
    // Optional: Add validation for each bar in newBars here if necessary
    this.bars.push(...newBars);
    this.identifiedTrendStarts = this.trendIdentifier.identifyTrends(this.bars);
  }

  /**
   * Resets the analyzer's internal state and the underlying TrendIdentifier.
   */
  public reset(): void {
    this.bars = [];
    this.identifiedTrendStarts = [];
    this.trendIdentifier.reset(); 
  }

  /**
   * Gets the most recent 'count' identified trend starts.
   * @param count The number of recent trend starts to retrieve. Must be a non-negative integer.
   * @returns An array of `TrendStart` objects, or an empty array if count is invalid or no trends.
   */
  public getRecentTrendStarts(count: number): TrendStart[] {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      // console.warn(`[EnhancedTrendAnalyzer.getRecentTrendStarts] Invalid count: ${count}. Must be a non-negative integer.`);
      return [];
    }
    if (count === 0) return [];
    return this.identifiedTrendStarts.slice(-count);
  }

  /**
   * Calculates the duration of a given trend up to the specified currentBar.
   * @param trendStart The `TrendStart` object representing the beginning of the trend.
   * @param currentBar The `BacktestBarData` representing the current point in time to measure duration up to.
   * @returns An object containing `bars` (duration in number of bars) and optionally `seconds` (duration in seconds).
   *          Returns `{ bars: 0 }` if inputs are invalid or duration cannot be calculated.
   */
  public calculateTrendDuration(trendStart: TrendStart, currentBar: BacktestBarData): { bars: number; seconds?: number } {
    if (!trendStart || !currentBar || typeof trendStart.barIndex !== 'number' || !trendStart.time || !currentBar.time) {
      // console.warn("[EnhancedTrendAnalyzer.calculateTrendDuration] Invalid trendStart or currentBar input.");
      return { bars: 0 };
    }
    
    let startIndex = -1;
    // Prioritize barIndex if it's valid and matches the time for robustness
    if (trendStart.barIndex >= 0 && trendStart.barIndex < this.bars.length && this.bars[trendStart.barIndex].time === trendStart.time) {
        startIndex = trendStart.barIndex;
    } else {
        // Fallback to finding by time if barIndex is not reliable
        startIndex = this.bars.findIndex(b => b.time === trendStart.time);
    }
    
    const currentIndex = this.bars.findIndex(b => b.time === currentBar.time);

    if (startIndex === -1 || currentIndex === -1 || currentIndex < startIndex) {
      return { bars: 0 };
    }
    const durationBars = currentIndex - startIndex + 1;
    const durationSeconds = currentBar.time - trendStart.time;
    return { bars: durationBars, seconds: durationSeconds };
  }

  /**
   * Calculates the magnitude of a given trend from its start to the currentBar.
   * For an uptrend, this is `currentBar.high - trendStart.price`.
   * For a downtrend, this is `trendStart.price - currentBar.low`.
   * @param trendStart The `TrendStart` object.
   * @param currentBar The `BacktestBarData` to measure magnitude up to.
   * @returns The calculated price magnitude, or 0 if inputs are invalid.
   */
  public calculateTrendMagnitude(trendStart: TrendStart, currentBar: BacktestBarData): number {
    if (!trendStart || !currentBar || typeof trendStart.price !== 'number' || currentBar.high === undefined || currentBar.low === undefined ) {
      // console.warn("[EnhancedTrendAnalyzer.calculateTrendMagnitude] Invalid trendStart or currentBar input.");
      return 0;
    }
    if (trendStart.direction === 'up') {
      return currentBar.high - trendStart.price;
    } else {
      return trendStart.price - currentBar.low;
    }
  }
  
  /**
   * Calculates various metrics for a given trend up to the currentBar.
   * @param trendStart The `TrendStart` object.
   * @param currentBar The `BacktestBarData` to calculate metrics up to.
   * @returns A `TrendMetrics` object containing duration and magnitude information.
   */
  public getTrendMetrics(trendStart: TrendStart, currentBar: BacktestBarData): TrendMetrics {
    const durationInfo = this.calculateTrendDuration(trendStart, currentBar);
    const priceChangeAbsolute = this.calculateTrendMagnitude(trendStart, currentBar);
    const priceChangePercent = trendStart.price !== 0 ? (priceChangeAbsolute / trendStart.price) * 100 : 0;
    
    return {
      durationBars: durationInfo.bars,
      durationSeconds: durationInfo.seconds,
      priceChangeAbsolute,
      priceChangePercent,
    };
  }

  /**
   * Identifies trends that led to the overall highest high and lowest low in the processed bar history.
   * @returns An `ExtremeTrendStarts` object containing the trends (or null) that achieved these extremes.
   */
  public findExtremeTrendStarts(): ExtremeTrendStarts {
    if (this.bars.length === 0 || this.identifiedTrendStarts.length === 0) {
      return { highestHighTrend: null, lowestLowTrend: null };
    }

    let overallHighestHigh = -Infinity;
    let overallLowestLow = Infinity;
    let highestHighBarIndex = -1;
    let lowestLowBarIndex = -1;

    this.bars.forEach((bar, index) => {
      if (bar.high > overallHighestHigh) {
        overallHighestHigh = bar.high;
        highestHighBarIndex = index;
      }
      if (bar.low < overallLowestLow) {
        overallLowestLow = bar.low;
        lowestLowBarIndex = index;
      }
    });

    if (highestHighBarIndex === -1 && lowestLowBarIndex === -1) { 
        return { highestHighTrend: null, lowestLowTrend: null };
    }
    
    let trendLeadingToHighestHigh: TrendStart | null = null;
    if (highestHighBarIndex !== -1) {
        for (const trend of [...this.identifiedTrendStarts].reverse()) { 
            if (trend.direction === 'up' && typeof trend.barIndex === 'number' && trend.barIndex <= highestHighBarIndex) {
                const barsDuringOrAfterTrendStart = this.bars.slice(trend.barIndex);
                let maxHighInThisTrendScope = trend.price; // Initialize with trend start price
                let foundExactMatch = false;
                for(let i = 0; i < barsDuringOrAfterTrendStart.length; i++) {
                    const currentBarInScope = barsDuringOrAfterTrendStart[i];
                    const currentBarOriginalIndex = trend.barIndex + i;

                    if (currentBarInScope.high > maxHighInThisTrendScope) {
                        maxHighInThisTrendScope = currentBarInScope.high;
                    }
                    if (currentBarOriginalIndex === highestHighBarIndex && currentBarInScope.high === overallHighestHigh) {
                        trendLeadingToHighestHigh = trend;
                        foundExactMatch = true;
                        break; 
                    }
                    if (currentBarOriginalIndex > highestHighBarIndex) break; 
                }
                if (foundExactMatch) break;
                if (maxHighInThisTrendScope === overallHighestHigh && !trendLeadingToHighestHigh) {
                    trendLeadingToHighestHigh = trend;
                }
            }
        }
    }

    let trendLeadingToLowestLow: TrendStart | null = null;
    if (lowestLowBarIndex !== -1) {
        for (const trend of [...this.identifiedTrendStarts].reverse()) {
            if (trend.direction === 'down' && typeof trend.barIndex === 'number' && trend.barIndex <= lowestLowBarIndex) {
                const barsDuringOrAfterTrendStart = this.bars.slice(trend.barIndex);
                let minLowInThisTrendScope = trend.price; // Initialize with trend start price
                let foundExactMatch = false;
                for(let i = 0; i < barsDuringOrAfterTrendStart.length; i++) {
                    const currentBarInScope = barsDuringOrAfterTrendStart[i];
                    const currentBarOriginalIndex = trend.barIndex + i;

                    if (currentBarInScope.low < minLowInThisTrendScope) {
                        minLowInThisTrendScope = currentBarInScope.low;
                    }
                    if (currentBarOriginalIndex === lowestLowBarIndex && currentBarInScope.low === overallLowestLow) {
                        trendLeadingToLowestLow = trend;
                        foundExactMatch = true;
                        break;
                    }
                    if (currentBarOriginalIndex > lowestLowBarIndex) break;
                }
                if (foundExactMatch) break;
                if (minLowInThisTrendScope === overallLowestLow && !trendLeadingToLowestLow) {
                    trendLeadingToLowestLow = trend;
                }
            }
        }
    }
    
    return { highestHighTrend: trendLeadingToHighestHigh, lowestLowTrend: trendLeadingToLowestLow };
  }

  // --- Private Helper Methods ---
  
  /**
   * Helper method to determine if a trend is currently strengthening.
   * @param trend The `TrendStart` to evaluate.
   * @param currentBar The current bar for context.
   * @param lookback The number of recent bars within the trend to consider for strengthening.
   * @param threshold The minimum average rate of change for the trend to be considered strengthening.
   * @returns True if the trend is strengthening, false otherwise.
   */
  private isStrengthening(trend: TrendStart, currentBar: BacktestBarData, lookback: number, threshold: number): boolean {
    const trendEndIndex = this.bars.findIndex(b => b.time === currentBar.time);
    if (trendEndIndex === -1 || typeof trend.barIndex !== 'number' || trend.barIndex > trendEndIndex) return false;

    const trendActualBars = this.bars.slice(trend.barIndex, trendEndIndex + 1);
    if (trendActualBars.length < lookback) return false; 

    const recentBarsInTrend = trendActualBars.slice(-lookback);
    if (recentBarsInTrend.length < 2) return false; 

    const priceChangeRecent = recentBarsInTrend[recentBarsInTrend.length - 1].close - recentBarsInTrend[0].open;
    const priceChangeTotal = currentBar.close - trend.price; 
    const averageRateOfChangeRecent = priceChangeRecent / lookback; 

    if (trend.direction === 'up') {
      return priceChangeTotal > 0 && averageRateOfChangeRecent > threshold;
    } else { 
      return priceChangeTotal < 0 && averageRateOfChangeRecent < -threshold; 
    }
  }

  /**
   * Identifies trends from the `identifiedTrendStarts` list that are currently strengthening.
   * A trend is considered strengthening if its recent rate of change exceeds a threshold.
   * @param threshold Optional threshold for the average rate of change. Uses config default if not provided.
   * @param lookback Optional number of recent bars within a trend to assess its strength. Defaults to 3.
   * @returns An array of `StrengthenedTrend` objects.
   */
  public identifyStrengtheningTrends(threshold?: number, lookback: number = 3): StrengthenedTrend[] {
    if (typeof lookback !== 'number' || !Number.isInteger(lookback) || lookback <= 0) {
      // console.warn(`[EnhancedTrendAnalyzer.identifyStrengtheningTrends] Invalid lookback: ${lookback}. Must be a positive integer.`);
      return [];
    }
    if (threshold !== undefined && typeof threshold !== 'number') {
      // console.warn(`[EnhancedTrendAnalyzer.identifyStrengtheningTrends] Invalid threshold: ${threshold}. Must be a number.`);
      return [];
    }

    const strengthThreshold = threshold ?? this.config.defaultStrengtheningThreshold ?? 0.1; 
    if (this.bars.length < lookback) return []; 
    
    const currentBar = this.bars[this.bars.length - 1];
    const strengtheningTrends: StrengthenedTrend[] = [];
  
    for (const trend of this.identifiedTrendStarts) {
      if (trend.time > currentBar.time) continue; 

      if (this.isStrengthening(trend, currentBar, lookback, strengthThreshold)) {
        const trendEndIndex = this.bars.findIndex(b => b.time === currentBar.time);
        if (typeof trend.barIndex !== 'number' || trend.barIndex < 0 || trend.barIndex > trendEndIndex) continue;
        
        const trendBars = this.bars.slice(trend.barIndex, trendEndIndex + 1);
        const recentSegment = trendBars.slice(-lookback);
        let score = 0;
        if (recentSegment.length >= 2) {
            score = (recentSegment[recentSegment.length-1].close - recentSegment[0].open) / recentSegment.length;
        }
        strengtheningTrends.push({ ...trend, strengthScore: Math.abs(score) }); 
      }
    }
    return strengtheningTrends;
  }
}
