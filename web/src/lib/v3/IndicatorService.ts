import { BacktestBarData, UTCTimestamp } from '../types/backtester';

/**
 * Configuration for indicator calculation
 */
export interface IndicatorConfig {
  period: number;
  source?: 'open' | 'high' | 'low' | 'close' | 'volume';
  [key: string]: any; // Allow custom parameters
}

/**
 * Common indicator configurations
 */
export interface EMAConfig extends IndicatorConfig {
  smoothing?: number; // Default 2
}

export interface RSIConfig extends IndicatorConfig {
  overbought?: number; // Default 70
  oversold?: number; // Default 30
}

export interface MACDConfig {
  fastPeriod: number; // Default 12
  slowPeriod: number; // Default 26
  signalPeriod: number; // Default 9
  source?: 'open' | 'high' | 'low' | 'close';
}

export interface BollingerBandsConfig extends IndicatorConfig {
  multiplier: number; // Default 2
}

export interface StochasticConfig {
  kPeriod: number; // Default 14
  dPeriod: number; // Default 3
  slowing: number; // Default 3
}

/**
 * Indicator result types
 */
export interface IndicatorValue {
  timestamp: UTCTimestamp;
  value: number;
  barIndex: number;
}

export interface MACDValue {
  timestamp: UTCTimestamp;
  macd: number;
  signal: number;
  histogram: number;
  barIndex: number;
}

export interface BollingerBandsValue {
  timestamp: UTCTimestamp;
  upper: number;
  middle: number;
  lower: number;
  barIndex: number;
}

export interface StochasticValue {
  timestamp: UTCTimestamp;
  k: number;
  d: number;
  barIndex: number;
}

/**
 * Cache key structure for memoization
 */
interface CacheKey {
  indicatorType: string;
  config: string; // JSON stringified config
  dataHash: string; // Hash of input data
  barIndex: number;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<T = any> {
  key: CacheKey;
  value: T;
  timestamp: number;
  hitCount: number;
  computationTime: number;
}

/**
 * Cache statistics for monitoring performance
 */
export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRatio: number;
  averageComputationTime: number;
  memoryUsage: number; // Estimated memory usage in bytes
}

/**
 * Memoized IndicatorService for efficient technical indicator calculations
 * 
 * Features:
 * - Intelligent caching with automatic invalidation
 * - Support for common technical indicators
 * - Memory-efficient storage with LRU eviction
 * - Performance monitoring and statistics
 * - Seamless integration with BacktestEngine
 */
export class IndicatorService {
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 10000; // Maximum number of cached entries
  private stats = {
    hitCount: 0,
    missCount: 0,
    totalComputationTime: 0,
  };

  constructor(maxCacheSize = 10000) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Calculate Simple Moving Average (SMA)
   */
  public calculateSMA(
    data: BacktestBarData[], 
    config: IndicatorConfig,
    endIndex?: number
  ): IndicatorValue[] {
    return this.memoizedCalculate(
      'SMA',
      config,
      data,
      endIndex,
      (bars, cfg, end) => this.computeSMA(bars, cfg, end)
    );
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   */
  public calculateEMA(
    data: BacktestBarData[], 
    config: EMAConfig,
    endIndex?: number
  ): IndicatorValue[] {
    return this.memoizedCalculate(
      'EMA',
      config,
      data,
      endIndex,
      (bars, cfg, end) => this.computeEMA(bars, cfg as EMAConfig, end)
    );
  }

  /**
   * Calculate Relative Strength Index (RSI)
   */
  public calculateRSI(
    data: BacktestBarData[], 
    config: RSIConfig,
    endIndex?: number
  ): IndicatorValue[] {
    return this.memoizedCalculate(
      'RSI',
      config,
      data,
      endIndex,
      (bars, cfg, end) => this.computeRSI(bars, cfg as RSIConfig, end)
    );
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  public calculateMACD(
    data: BacktestBarData[], 
    config: MACDConfig,
    endIndex?: number
  ): MACDValue[] {
    return this.memoizedCalculate(
      'MACD',
      config,
      data,
      endIndex,
      (bars, cfg, end) => this.computeMACD(bars, cfg as MACDConfig, end)
    );
  }

  /**
   * Calculate Bollinger Bands
   */
  public calculateBollingerBands(
    data: BacktestBarData[], 
    config: BollingerBandsConfig,
    endIndex?: number
  ): BollingerBandsValue[] {
    return this.memoizedCalculate(
      'BB',
      config,
      data,
      endIndex,
      (bars, cfg, end) => this.computeBollingerBands(bars, cfg as BollingerBandsConfig, end)
    );
  }

  /**
   * Calculate Stochastic Oscillator
   */
  public calculateStochastic(
    data: BacktestBarData[], 
    config: StochasticConfig,
    endIndex?: number
  ): StochasticValue[] {
    return this.memoizedCalculate(
      'STOCH',
      config,
      data,
      endIndex,
      (bars, cfg, end) => this.computeStochastic(bars, cfg as StochasticConfig, end)
    );
  }

  /**
   * Get the latest value for an indicator
   */
  public getLatestSMA(data: BacktestBarData[], config: IndicatorConfig): number | null {
    const values = this.calculateSMA(data, config);
    return values.length > 0 ? values[values.length - 1].value : null;
  }

  public getLatestEMA(data: BacktestBarData[], config: EMAConfig): number | null {
    const values = this.calculateEMA(data, config);
    return values.length > 0 ? values[values.length - 1].value : null;
  }

  public getLatestRSI(data: BacktestBarData[], config: RSIConfig): number | null {
    const values = this.calculateRSI(data, config);
    return values.length > 0 ? values[values.length - 1].value : null;
  }

  /**
   * Clear cache (useful when data changes significantly)
   */
  public clearCache(): void {
    this.cache.clear();
    this.stats = { hitCount: 0, missCount: 0, totalComputationTime: 0 };
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): CacheStats {
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    const hitRatio = totalRequests > 0 ? this.stats.hitCount / totalRequests : 0;
    const avgComputationTime = this.stats.missCount > 0 
      ? this.stats.totalComputationTime / this.stats.missCount 
      : 0;

    // Estimate memory usage
    const memoryUsage = this.cache.size * 200; // Rough estimate: 200 bytes per entry

    return {
      totalEntries: this.cache.size,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRatio,
      averageComputationTime: avgComputationTime,
      memoryUsage,
    };
  }

  /**
   * Get all indicators for strategy execution
   * Returns commonly used indicators with default configurations
   */
  public getAllIndicators(data?: BacktestBarData[]): Record<string, any> {
    if (!data || data.length === 0) {
      return {};
    }

    try {
      // Calculate common indicators with standard configurations
      const indicators: Record<string, any> = {};

      // Moving averages
      if (data.length >= 20) {
        const sma20 = this.getLatestSMA(data, { period: 20 });
        const ema20 = this.getLatestEMA(data, { period: 20 });
        if (sma20 !== null) indicators.sma20 = sma20;
        if (ema20 !== null) indicators.ema20 = ema20;
      }

      if (data.length >= 50) {
        const sma50 = this.getLatestSMA(data, { period: 50 });
        const ema50 = this.getLatestEMA(data, { period: 50 });
        if (sma50 !== null) indicators.sma50 = sma50;
        if (ema50 !== null) indicators.ema50 = ema50;
      }

      // RSI
      if (data.length >= 14) {
        const rsi = this.getLatestRSI(data, { period: 14 });
        if (rsi !== null) indicators.rsi = rsi;
      }

      // MACD
      if (data.length >= 26) {
        const macdValues = this.calculateMACD(data, { 
          fastPeriod: 12, 
          slowPeriod: 26, 
          signalPeriod: 9 
        });
        if (macdValues.length > 0) {
          const latest = macdValues[macdValues.length - 1];
          if (latest) {
            indicators.macd = latest.macd;
            indicators.macdSignal = latest.signal;
            indicators.macdHistogram = latest.histogram;
          }
        }
      }

      // Bollinger Bands
      if (data.length >= 20) {
        const bbValues = this.calculateBollingerBands(data, { 
          period: 20, 
          multiplier: 2 
        });
        if (bbValues.length > 0) {
          const latest = bbValues[bbValues.length - 1];
          if (latest) {
            indicators.bbUpper = latest.upper;
            indicators.bbMiddle = latest.middle;
            indicators.bbLower = latest.lower;
          }
        }
      }

      return indicators;
    } catch (error) {
      console.warn('Error calculating indicators:', error);
      return {};
    }
  }

  /**
   * Memoized calculation wrapper
   */
  private memoizedCalculate<T>(
    indicatorType: string,
    config: any,
    data: BacktestBarData[],
    endIndex: number | undefined,
    computeFn: (data: BacktestBarData[], config: any, endIndex?: number) => T
  ): T {
    const effectiveEndIndex = endIndex ?? data.length - 1;
    const cacheKey = this.createCacheKey(indicatorType, config, data, effectiveEndIndex);
    const cacheKeyStr = this.cacheKeyToString(cacheKey);

    // Check cache first
    const cached = this.cache.get(cacheKeyStr);
    if (cached) {
      cached.hitCount++;
      this.stats.hitCount++;
      return cached.value;
    }

    // Cache miss - compute the indicator
    this.stats.missCount++;
    const startTime = performance.now();
    
    const result = computeFn(data, config, endIndex);
    
    const computationTime = performance.now() - startTime;
    this.stats.totalComputationTime += computationTime;

    // Store in cache
    this.setCacheEntry(cacheKeyStr, {
      key: cacheKey,
      value: result,
      timestamp: Date.now(),
      hitCount: 0,
      computationTime,
    });

    return result;
  }

  /**
   * Create cache key for memoization
   */
  private createCacheKey(
    indicatorType: string,
    config: any,
    data: BacktestBarData[],
    endIndex: number
  ): CacheKey {
    // Create a simple hash of the data up to endIndex
    const relevantData = data.slice(0, endIndex + 1);
    const dataHash = this.hashData(relevantData);

    return {
      indicatorType,
      config: JSON.stringify(config),
      dataHash,
      barIndex: endIndex,
    };
  }

  /**
   * Convert cache key to string
   */
  private cacheKeyToString(key: CacheKey): string {
    return `${key.indicatorType}:${key.config}:${key.dataHash}:${key.barIndex}`;
  }

  /**
   * Simple data hashing function
   */
  private hashData(data: BacktestBarData[]): string {
    if (data.length === 0) return '0';
    
    // Use first, last, and length for a simple hash
    const first = data[0];
    const last = data[data.length - 1];
    
    if (!first || !last) return '0';
    
    return `${data.length}:${first.time}:${first.close}:${last.time}:${last.close}`;
  }

  /**
   * Set cache entry with LRU eviction
   */
  private setCacheEntry<T>(key: string, entry: CacheEntry<T>): void {
    // If cache is full, remove least recently used entries
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
  }

  /**
   * Evict least recently used cache entries
   */
  private evictLRU(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by hit count and timestamp (LRU)
    entries.sort((a, b) => {
      const hitDiff = a[1].hitCount - b[1].hitCount;
      if (hitDiff !== 0) return hitDiff;
      return a[1].timestamp - b[1].timestamp;
    });

    // Remove oldest 25% of entries
    const removeCount = Math.floor(this.maxCacheSize * 0.25);
    for (let i = 0; i < removeCount && entries.length > 0; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Extract price values from bars
   */
  private extractValues(
    data: BacktestBarData[], 
    source: 'open' | 'high' | 'low' | 'close' | 'volume' = 'close'
  ): number[] {
    return data.map(bar => {
      switch (source) {
        case 'open': return bar.open;
        case 'high': return bar.high;
        case 'low': return bar.low;
        case 'close': return bar.close;
        case 'volume': return bar.volume || 0;
        default: return bar.close;
      }
    });
  }

  /**
   * Compute Simple Moving Average
   */
  private computeSMA(
    data: BacktestBarData[], 
    config: IndicatorConfig,
    endIndex?: number
  ): IndicatorValue[] {
    const { period, source = 'close' } = config;
    const values = this.extractValues(data, source);
    const end = endIndex ?? values.length - 1;
    const result: IndicatorValue[] = [];

    for (let i = period - 1; i <= end; i++) {
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      const sma = sum / period;
      
      result.push({
        timestamp: data[i].time,
        value: sma,
        barIndex: i,
      });
    }

    return result;
  }

  /**
   * Compute Exponential Moving Average
   */
  private computeEMA(
    data: BacktestBarData[], 
    config: EMAConfig,
    endIndex?: number
  ): IndicatorValue[] {
    const { period, source = 'close', smoothing = 2 } = config;
    const values = this.extractValues(data, source);
    const end = endIndex ?? values.length - 1;
    const result: IndicatorValue[] = [];
    
    if (end < period - 1) return result;

    // Calculate smoothing factor
    const multiplier = smoothing / (period + 1);

    // Start with SMA for the first period
    const initialSum = values.slice(0, period).reduce((a, b) => a + b, 0);
    let ema = initialSum / period;

    result.push({
      timestamp: data[period - 1].time,
      value: ema,
      barIndex: period - 1,
    });

    // Calculate EMA for remaining periods
    for (let i = period; i <= end; i++) {
      ema = (values[i] * multiplier) + (ema * (1 - multiplier));
      result.push({
        timestamp: data[i].time,
        value: ema,
        barIndex: i,
      });
    }

    return result;
  }

  /**
   * Compute Relative Strength Index
   */
  private computeRSI(
    data: BacktestBarData[], 
    config: RSIConfig,
    endIndex?: number
  ): IndicatorValue[] {
    const { period, source = 'close' } = config;
    const values = this.extractValues(data, source);
    const end = endIndex ?? values.length - 1;
    const result: IndicatorValue[] = [];

    if (end < period) return result;

    const changes = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(values[i] - values[i - 1]);
    }

    let avgGain = 0;
    let avgLoss = 0;

    // Calculate initial averages
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i];
      } else {
        avgLoss += Math.abs(changes[i]);
      }
    }

    avgGain /= period;
    avgLoss /= period;

    // Calculate RSI
    for (let i = period; i <= end; i++) {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));

      result.push({
        timestamp: data[i].time,
        value: rsi,
        barIndex: i,
      });

      // Update averages for next iteration
      if (i < end) {
        const change = changes[i];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      }
    }

    return result;
  }

  /**
   * Compute MACD
   */
  private computeMACD(
    data: BacktestBarData[], 
    config: MACDConfig,
    endIndex?: number
  ): MACDValue[] {
    const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9, source = 'close' } = config;
    const end = endIndex ?? data.length - 1;

    // Calculate EMAs
    const fastEMA = this.computeEMA(data, { period: fastPeriod, source }, end);
    const slowEMA = this.computeEMA(data, { period: slowPeriod, source }, end);

    if (fastEMA.length === 0 || slowEMA.length === 0) return [];

    // Calculate MACD line
    const macdValues: { timestamp: UTCTimestamp; value: number; barIndex: number }[] = [];
    const minLength = Math.min(fastEMA.length, slowEMA.length);

    for (let i = 0; i < minLength; i++) {
      const fastIndex = fastEMA.length - minLength + i;
      const slowIndex = slowEMA.length - minLength + i;
      
      if (fastEMA[fastIndex] && slowEMA[slowIndex]) {
        macdValues.push({
          timestamp: fastEMA[fastIndex].timestamp,
          value: fastEMA[fastIndex].value - slowEMA[slowIndex].value,
          barIndex: fastEMA[fastIndex].barIndex,
        });
      }
    }

    // Calculate signal line (EMA of MACD)
    const signalEMA = this.calculateEMAFromValues(macdValues, signalPeriod);

    // Combine into MACD result
    const result: MACDValue[] = [];
    const minSignalLength = Math.min(macdValues.length, signalEMA.length);

    for (let i = 0; i < minSignalLength; i++) {
      const macdIndex = macdValues.length - minSignalLength + i;
      const signalIndex = signalEMA.length - minSignalLength + i;

      if (macdValues[macdIndex] && signalEMA[signalIndex]) {
        const macd = macdValues[macdIndex].value;
        const signal = signalEMA[signalIndex].value;

        result.push({
          timestamp: macdValues[macdIndex].timestamp,
          macd,
          signal,
          histogram: macd - signal,
          barIndex: macdValues[macdIndex].barIndex,
        });
      }
    }

    return result;
  }

  /**
   * Compute Bollinger Bands
   */
  private computeBollingerBands(
    data: BacktestBarData[], 
    config: BollingerBandsConfig,
    endIndex?: number
  ): BollingerBandsValue[] {
    const { period, source = 'close', multiplier } = config;
    const values = this.extractValues(data, source);
    const end = endIndex ?? values.length - 1;
    const result: BollingerBandsValue[] = [];

    for (let i = period - 1; i <= end; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      
      // Calculate standard deviation
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      result.push({
        timestamp: data[i].time,
        upper: sma + (multiplier * stdDev),
        middle: sma,
        lower: sma - (multiplier * stdDev),
        barIndex: i,
      });
    }

    return result;
  }

  /**
   * Compute Stochastic Oscillator
   */
  private computeStochastic(
    data: BacktestBarData[], 
    config: StochasticConfig,
    endIndex?: number
  ): StochasticValue[] {
    const { kPeriod, dPeriod, slowing } = config;
    const end = endIndex ?? data.length - 1;
    const result: StochasticValue[] = [];

    if (end < kPeriod - 1) return result;

    // Calculate %K
    const kValues = [];
    for (let i = kPeriod - 1; i <= end; i++) {
      const slice = data.slice(i - kPeriod + 1, i + 1);
      const highest = Math.max(...slice.map(bar => bar.high));
      const lowest = Math.min(...slice.map(bar => bar.low));
      const current = data[i].close;

      const k = ((current - lowest) / (highest - lowest)) * 100;
      kValues.push({ timestamp: data[i].time, value: k, barIndex: i });
    }

    // Apply slowing to %K if specified
    let smoothedK = kValues;
    if (slowing > 1) {
      smoothedK = this.calculateSMAFromValues(kValues, slowing);
    }

    // Calculate %D (SMA of %K)
    const dValues = this.calculateSMAFromValues(smoothedK, dPeriod);

    // Combine results
    const minLength = Math.min(smoothedK.length, dValues.length);
    for (let i = 0; i < minLength; i++) {
      const kIndex = smoothedK.length - minLength + i;
      const dIndex = dValues.length - minLength + i;

      result.push({
        timestamp: smoothedK[kIndex].timestamp,
        k: smoothedK[kIndex].value,
        d: dValues[dIndex].value,
        barIndex: smoothedK[kIndex].barIndex,
      });
    }

    return result;
  }

  /**
   * Helper: Calculate EMA from pre-computed values
   */
  private calculateEMAFromValues(
    values: { value: number; timestamp: UTCTimestamp; barIndex: number }[],
    period: number,
    smoothing = 2
  ): { value: number; timestamp: UTCTimestamp; barIndex: number }[] {
    if (values.length < period) return [];

    const result = [];
    const multiplier = smoothing / (period + 1);

    // Start with SMA
    const initialSum = values.slice(0, period).reduce((sum, item) => sum + item.value, 0);
    let ema = initialSum / period;

    result.push({
      value: ema,
      timestamp: values[period - 1].timestamp,
      barIndex: values[period - 1].barIndex,
    });

    // Calculate EMA for remaining values
    for (let i = period; i < values.length; i++) {
      ema = (values[i].value * multiplier) + (ema * (1 - multiplier));
      result.push({
        value: ema,
        timestamp: values[i].timestamp,
        barIndex: values[i].barIndex,
      });
    }

    return result;
  }

  /**
   * Helper: Calculate SMA from pre-computed values
   */
  private calculateSMAFromValues(
    values: { value: number; timestamp: UTCTimestamp; barIndex: number }[],
    period: number
  ): { value: number; timestamp: UTCTimestamp; barIndex: number }[] {
    if (values.length < period) return [];

    const result = [];
    
    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const sma = slice.reduce((sum, item) => sum + item.value, 0) / period;
      
      result.push({
        value: sma,
        timestamp: values[i].timestamp,
        barIndex: values[i].barIndex,
      });
    }

    return result;
  }
} 