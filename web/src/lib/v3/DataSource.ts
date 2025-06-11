import { BacktestBarData, UTCTimestamp } from '../types/backtester';

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  value: unknown;
  message: string;
  barIndex?: number;
}

/**
 * Validation result containing validated data and any errors
 */
export interface ValidationResult {
  isValid: boolean;
  data: BacktestBarData[];
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Data quality metrics
 */
export interface DataQualityMetrics {
  totalBars: number;
  validBars: number;
  invalidBars: number;
  missingValues: number;
  duplicateTimestamps: number;
  outOfSequenceBars: number;
  gapsInData: number;
  averageSpread: number;
  suspiciousPriceMovements: number;
}

/**
 * Configuration for data validation rules
 */
export interface ValidationConfig {
  // Price validation
  allowNegativePrices: boolean;
  maxPriceChange: number; // Maximum allowed price change between bars (percentage)
  minPrice: number;
  maxPrice: number;
  
  // Volume validation
  allowZeroVolume: boolean;
  maxVolumeChange: number; // Maximum allowed volume change between bars (percentage)
  
  // Time validation
  allowDuplicateTimestamps: boolean;
  allowOutOfSequence: boolean;
  maxTimeGap: number; // Maximum allowed gap between bars (seconds)
  
  // OHLC validation
  strictOHLCValidation: boolean; // Enforce Open <= High, Low <= Close, etc.
  
  // Data completeness
  requiredFields: (keyof BacktestBarData)[];
  
  // Outlier detection
  enableOutlierDetection: boolean;
  outlierThreshold: number; // Z-score threshold for outlier detection
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  allowNegativePrices: false,
  maxPriceChange: 50, // 50% max change between bars
  minPrice: 0.0001,
  maxPrice: 1000000,
  allowZeroVolume: true,
  maxVolumeChange: 1000, // 1000% max volume change
  allowDuplicateTimestamps: false,
  allowOutOfSequence: false,
  maxTimeGap: 3600 * 24 * 7, // 1 week in seconds
  strictOHLCValidation: true,
  requiredFields: ['time', 'open', 'high', 'low', 'close'],
  enableOutlierDetection: true,
  outlierThreshold: 3.0,
};

/**
 * Abstract DataSource interface that all data providers must implement
 * This ensures the engine is decoupled from specific data sources
 */
export abstract class DataSource {
  protected config: ValidationConfig;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  /**
   * Fetch historical data for a given symbol and timeframe
   */
  abstract fetchData(
    symbol: string,
    timeframe: string,
    startTime?: UTCTimestamp,
    endTime?: UTCTimestamp,
    limit?: number
  ): Promise<BacktestBarData[]>;

  /**
   * Get available symbols from this data source
   */
  abstract getAvailableSymbols(): Promise<string[]>;

  /**
   * Get available timeframes for a symbol
   */
  abstract getAvailableTimeframes(symbol: string): Promise<string[]>;

  /**
   * Get data source metadata (name, description, limitations, etc.)
   */
  abstract getMetadata(): {
    name: string;
    description: string;
    supportedTimeframes: string[];
    limitations?: string[];
    rateLimit?: {
      requestsPerSecond: number;
      requestsPerDay: number;
    };
  };

  /**
   * Validate and clean the raw data
   */
  protected validateData(rawData: unknown[]): ValidationResult {
    const validator = new DataValidator(this.config);
    return validator.validate(rawData);
  }
}

/**
 * DataValidator class responsible for validating and cleaning bar data
 */
export class DataValidator {
  private config: ValidationConfig;

  constructor(config: ValidationConfig = DEFAULT_VALIDATION_CONFIG) {
    this.config = config;
  }

  /**
   * Validate an array of bar data
   */
  public validate(rawData: any[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const validBars: BacktestBarData[] = [];

    if (!Array.isArray(rawData)) {
      return {
        isValid: false,
        data: [],
        errors: [{ field: 'root', value: rawData, message: 'Data must be an array' }],
        warnings: [],
      };
    }

    // Pre-process: Convert and sort data
    const processedData = this.preprocessData(rawData);
    
    // Validate each bar
    processedData.forEach((bar, index) => {
      const barErrors = this.validateBar(bar, index);
      errors.push(...barErrors);

      if (barErrors.length === 0) {
        validBars.push(bar);
      }
    });

    // Validate sequence and relationships
    const sequenceErrors = this.validateSequence(validBars);
    errors.push(...sequenceErrors);

    // Generate warnings for data quality issues
    const qualityWarnings = this.generateQualityWarnings(validBars);
    warnings.push(...qualityWarnings);

    return {
      isValid: errors.length === 0,
      data: validBars,
      errors,
      warnings,
    };
  }

  /**
   * Get data quality metrics
   */
  public getQualityMetrics(data: BacktestBarData[]): DataQualityMetrics {
    const totalBars = data.length;
    let duplicateTimestamps = 0;
    let gapsInData = 0;
    let suspiciousPriceMovements = 0;
    let totalSpread = 0;

    const timestamps = new Set<UTCTimestamp>();
    
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      
      // Check for duplicate timestamps
      if (timestamps.has(bar.time)) {
        duplicateTimestamps++;
      } else {
        timestamps.add(bar.time);
      }

      // Calculate spread
      const spread = (bar.high - bar.low) / bar.low * 100;
      totalSpread += spread;

      // Check for suspicious price movements
      if (i > 0) {
        const prevBar = data[i - 1];
        const priceChange = Math.abs(bar.close - prevBar.close) / prevBar.close * 100;
        
        if (priceChange > this.config.maxPriceChange) {
          suspiciousPriceMovements++;
        }

        // Check for time gaps
        const timeGap = bar.time - prevBar.time;
        if (timeGap > this.config.maxTimeGap) {
          gapsInData++;
        }
      }
    }

    return {
      totalBars,
      validBars: totalBars,
      invalidBars: 0,
      missingValues: 0, // Calculated during validation
      duplicateTimestamps,
      outOfSequenceBars: 0, // Calculated during validation
      gapsInData,
      averageSpread: totalBars > 0 ? totalSpread / totalBars : 0,
      suspiciousPriceMovements,
    };
  }

  /**
   * Preprocess raw data: convert types, sort by time, handle missing fields
   */
  private preprocessData(rawData: any[]): BacktestBarData[] {
    return rawData
      .map((item, index) => this.convertToBarData(item, index))
      .filter(bar => bar !== null)
      .sort((a, b) => a.time - b.time) as BacktestBarData[];
  }

  /**
   * Convert raw data item to BacktestBarData format
   */
  private convertToBarData(item: any, index: number): BacktestBarData | null {
    try {
      // Handle different time formats
      let time: UTCTimestamp;
      if (typeof item.time === 'number') {
        time = item.time as UTCTimestamp;
      } else if (typeof item.time === 'string') {
        time = (new Date(item.time).getTime() / 1000) as UTCTimestamp;
      } else if (item.timestamp) {
        time = (typeof item.timestamp === 'number' 
          ? item.timestamp 
          : new Date(item.timestamp).getTime() / 1000) as UTCTimestamp;
      } else {
        return null;
      }

      return {
        time,
        open: this.parseNumber(item.open),
        high: this.parseNumber(item.high),
        low: this.parseNumber(item.low),
        close: this.parseNumber(item.close),
        volume: item.volume !== undefined ? this.parseNumber(item.volume) : undefined,
        originalIndex: index,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse number from various formats
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value);
    throw new Error(`Cannot parse number from ${typeof value}`);
  }

  /**
   * Validate a single bar
   */
  private validateBar(bar: BacktestBarData, index: number): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required fields
    this.config.requiredFields.forEach(field => {
      if (bar[field] === undefined || bar[field] === null) {
        errors.push({
          field,
          value: bar[field],
          message: `Required field '${field}' is missing`,
          barIndex: index,
        });
      }
    });

    // Validate OHLC relationships
    if (this.config.strictOHLCValidation) {
      if (bar.high < bar.low) {
        errors.push({
          field: 'high',
          value: bar.high,
          message: `High (${bar.high}) cannot be less than Low (${bar.low})`,
          barIndex: index,
        });
      }

      if (bar.high < bar.open || bar.high < bar.close) {
        errors.push({
          field: 'high',
          value: bar.high,
          message: `High (${bar.high}) must be >= Open (${bar.open}) and Close (${bar.close})`,
          barIndex: index,
        });
      }

      if (bar.low > bar.open || bar.low > bar.close) {
        errors.push({
          field: 'low',
          value: bar.low,
          message: `Low (${bar.low}) must be <= Open (${bar.open}) and Close (${bar.close})`,
          barIndex: index,
        });
      }
    }

    // Validate price ranges
    [bar.open, bar.high, bar.low, bar.close].forEach((price, priceIndex) => {
      const fieldName = ['open', 'high', 'low', 'close'][priceIndex];
      
      if (!this.config.allowNegativePrices && price < 0) {
        errors.push({
          field: fieldName,
          value: price,
          message: `${fieldName} cannot be negative`,
          barIndex: index,
        });
      }

      if (price < this.config.minPrice || price > this.config.maxPrice) {
        errors.push({
          field: fieldName,
          value: price,
          message: `${fieldName} (${price}) is outside allowed range [${this.config.minPrice}, ${this.config.maxPrice}]`,
          barIndex: index,
        });
      }
    });

    // Validate volume
    if (bar.volume !== undefined) {
      if (!this.config.allowZeroVolume && bar.volume === 0) {
        errors.push({
          field: 'volume',
          value: bar.volume,
          message: 'Volume cannot be zero',
          barIndex: index,
        });
      }

      if (bar.volume < 0) {
        errors.push({
          field: 'volume',
          value: bar.volume,
          message: 'Volume cannot be negative',
          barIndex: index,
        });
      }
    }

    return errors;
  }

  /**
   * Validate sequence and time relationships
   */
  private validateSequence(bars: BacktestBarData[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (let i = 1; i < bars.length; i++) {
      const currentBar = bars[i];
      const prevBar = bars[i - 1];

      // Check time sequence
      if (!this.config.allowOutOfSequence && currentBar.time <= prevBar.time) {
        errors.push({
          field: 'time',
          value: currentBar.time,
          message: `Bar at index ${i} has timestamp ${currentBar.time} which is not greater than previous bar timestamp ${prevBar.time}`,
          barIndex: i,
        });
      }

      // Check for duplicate timestamps
      if (!this.config.allowDuplicateTimestamps && currentBar.time === prevBar.time) {
        errors.push({
          field: 'time',
          value: currentBar.time,
          message: `Duplicate timestamp ${currentBar.time} at index ${i}`,
          barIndex: i,
        });
      }

      // Check for excessive price changes
      const priceChange = Math.abs(currentBar.close - prevBar.close) / prevBar.close * 100;
      if (priceChange > this.config.maxPriceChange) {
        errors.push({
          field: 'close',
          value: currentBar.close,
          message: `Excessive price change: ${priceChange.toFixed(2)}% from ${prevBar.close} to ${currentBar.close}`,
          barIndex: i,
        });
      }

      // Check for excessive volume changes
      if (currentBar.volume !== undefined && prevBar.volume !== undefined && prevBar.volume > 0) {
        const volumeChange = Math.abs(currentBar.volume - prevBar.volume) / prevBar.volume * 100;
        if (volumeChange > this.config.maxVolumeChange) {
          errors.push({
            field: 'volume',
            value: currentBar.volume,
            message: `Excessive volume change: ${volumeChange.toFixed(2)}% from ${prevBar.volume} to ${currentBar.volume}`,
            barIndex: i,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Generate quality warnings
   */
  private generateQualityWarnings(bars: BacktestBarData[]): string[] {
    const warnings: string[] = [];

    if (bars.length === 0) {
      warnings.push('No valid bars found in data');
      return warnings;
    }

    // Check for data gaps
    let gapCount = 0;
    for (let i = 1; i < bars.length; i++) {
      const timeGap = bars[i].time - bars[i - 1].time;
      if (timeGap > this.config.maxTimeGap) {
        gapCount++;
      }
    }

    if (gapCount > 0) {
      warnings.push(`Found ${gapCount} time gaps larger than ${this.config.maxTimeGap} seconds`);
    }

    // Check for low volume periods
    const volumeBars = bars.filter(bar => bar.volume !== undefined && bar.volume > 0);
    if (volumeBars.length < bars.length * 0.5) {
      warnings.push('More than 50% of bars have zero or missing volume data');
    }

    return warnings;
  }
}

/**
 * API-based data source implementation
 * This can be extended for specific API providers
 */
export class APIDataSource extends DataSource {
  private baseUrl: string;
  private apiKey?: string;
  private headers: Record<string, string>;

  constructor(
    baseUrl: string, 
    apiKey?: string, 
    config: Partial<ValidationConfig> = {}
  ) {
    super(config);
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    };
  }

  async fetchData(
    symbol: string,
    timeframe: string,
    startTime?: UTCTimestamp,
    endTime?: UTCTimestamp,
    limit?: number
  ): Promise<BacktestBarData[]> {
    const params = new URLSearchParams({
      symbol,
      timeframe,
      ...(startTime && { startTime: startTime.toString() }),
      ...(endTime && { endTime: endTime.toString() }),
      ...(limit && { limit: limit.toString() }),
    });

    const response = await fetch(`${this.baseUrl}/bars?${params}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    const validationResult = this.validateData(rawData.data || rawData);

    if (!validationResult.isValid) {
      throw new Error(`Data validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    return validationResult.data;
  }

  async getAvailableSymbols(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/symbols`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch symbols: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.symbols || [];
  }

  async getAvailableTimeframes(symbol: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/timeframes?symbol=${symbol}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch timeframes: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.timeframes || ['1m', '5m', '15m', '1h', '4h', '1d'];
  }

  getMetadata() {
    return {
      name: 'API Data Source',
      description: 'Generic API-based historical data provider',
      supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
      limitations: [
        'Rate limited by API provider',
        'Historical data availability varies by symbol',
        'Real-time data may have delays',
      ],
      rateLimit: {
        requestsPerSecond: 10,
        requestsPerDay: 1000,
      },
    };
  }
} 