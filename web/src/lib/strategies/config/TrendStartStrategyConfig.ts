import { BaseStrategyConfig } from '@/lib/types/strategy';

// Interface for configuration data (without methods)
interface TrendStartStrategyConfigData {
  // Base strategy configuration
  name: string;
  description: string;
  version: string;
  commission: number;
  positionSize: number;
  stopLossPercent: number;
  stopLossTicks?: number;
  takeProfitPercent: number;
  takeProfitTicks?: number;
  useMarketOrders: boolean;
  limitOrderOffset?: number;
  orderTimeoutBars?: number;

  // TrendStartStrategy specific configuration
  minConfirmationBars: number;
  confidenceThreshold: number;
  limitOrderOffsetTicks?: number;
  contractId: string;
  timeframe: string;
  allowShorting: boolean;
  maxOpenPositions: number;
  useResearchMode: boolean;
  signalExpiryBars: number;

  // Strategy instance identification
  strategyId: string;
  orderIdTag: string;
}

/**
 * Configuration for TrendStartStrategy following NautilusTrader patterns
 * 
 * This configuration is immutable after initialization to prevent runtime
 * modifications that could lead to inconsistent behavior.
 */
export class TrendStartStrategyConfig implements BaseStrategyConfig {
  // Base strategy configuration
  readonly name!: string;
  readonly description!: string;
  readonly version!: string;
  readonly commission!: number;
  readonly positionSize!: number;
  readonly stopLossPercent!: number;
  readonly stopLossTicks?: number;
  readonly takeProfitPercent!: number;
  readonly takeProfitTicks?: number;
  readonly useMarketOrders!: boolean;
  readonly limitOrderOffset?: number;
  readonly orderTimeoutBars?: number;

  // TrendStartStrategy specific configuration
  readonly minConfirmationBars!: number;
  readonly confidenceThreshold!: number;
  readonly limitOrderOffsetTicks?: number;
  readonly contractId!: string;
  readonly timeframe!: string;
  readonly allowShorting!: boolean;
  readonly maxOpenPositions!: number;
  readonly useResearchMode!: boolean;
  readonly signalExpiryBars!: number;

  // Strategy instance identification
  readonly strategyId!: string;
  readonly orderIdTag!: string;

  constructor(config: Partial<TrendStartStrategyConfigData> = {}) {
    // Set defaults
    const defaults: TrendStartStrategyConfigData = {
      // Base configuration defaults
      name: 'TrendStartStrategy',
      description: 'Event-driven strategy trading on trend start signals.',
      version: '2.0.0',
      commission: 2.50,
      positionSize: 1,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      useMarketOrders: true,
      limitOrderOffset: 0,
      orderTimeoutBars: 10,

      // Strategy specific defaults
      minConfirmationBars: 2,
      confidenceThreshold: 0.6,
      limitOrderOffsetTicks: 2,
      contractId: 'DEFAULT_CONTRACT',
      timeframe: '1h',
      allowShorting: true,
      maxOpenPositions: 1,
      useResearchMode: false,
      signalExpiryBars: 5,

      // Instance identification
      strategyId: '',
      orderIdTag: '001',
    };

    // Merge with provided config
    const merged = { ...defaults, ...config };

    // Generate strategy ID if not provided
    if (!merged.strategyId) {
      merged.strategyId = `${merged.name}-${merged.contractId}-${merged.timeframe}-${merged.orderIdTag}`;
    }

    // Validate configuration
    this.validateConfig(merged);

    // Assign all data properties (making them readonly)
    this.name = merged.name;
    this.description = merged.description;
    this.version = merged.version;
    this.commission = merged.commission;
    this.positionSize = merged.positionSize;
    this.stopLossPercent = merged.stopLossPercent;
    this.stopLossTicks = merged.stopLossTicks;
    this.takeProfitPercent = merged.takeProfitPercent;
    this.takeProfitTicks = merged.takeProfitTicks;
    this.useMarketOrders = merged.useMarketOrders;
    this.limitOrderOffset = merged.limitOrderOffset;
    this.orderTimeoutBars = merged.orderTimeoutBars;
    this.minConfirmationBars = merged.minConfirmationBars;
    this.confidenceThreshold = merged.confidenceThreshold;
    this.limitOrderOffsetTicks = merged.limitOrderOffsetTicks;
    this.contractId = merged.contractId;
    this.timeframe = merged.timeframe;
    this.allowShorting = merged.allowShorting;
    this.maxOpenPositions = merged.maxOpenPositions;
    this.useResearchMode = merged.useResearchMode;
    this.signalExpiryBars = merged.signalExpiryBars;
    this.strategyId = merged.strategyId;
    this.orderIdTag = merged.orderIdTag;

    // Freeze the configuration to ensure immutability
    Object.freeze(this);
  }

  /**
   * Validate configuration parameters
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: TrendStartStrategyConfigData): void {
    // Base validations
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Strategy name is required');
    }

    if (config.commission < 0) {
      throw new Error('Commission must be non-negative');
    }

    if (config.positionSize <= 0) {
      throw new Error('Position size must be positive');
    }

    if (config.stopLossPercent < 0 || config.stopLossPercent > 100) {
      throw new Error('Stop loss percent must be between 0 and 100');
    }

    if (config.takeProfitPercent < 0 || config.takeProfitPercent > 1000) {
      throw new Error('Take profit percent must be between 0 and 1000');
    }

    // Strategy specific validations
    if (config.minConfirmationBars < 0) {
      throw new Error('minConfirmationBars must be non-negative');
    }

    if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
      throw new Error('confidenceThreshold must be between 0 and 1');
    }

    if (config.limitOrderOffsetTicks !== undefined && config.limitOrderOffsetTicks < 0) {
      throw new Error('limitOrderOffsetTicks must be non-negative');
    }

    if (!config.contractId || config.contractId.trim().length === 0) {
      throw new Error('contractId is required');
    }

    if (!config.timeframe || config.timeframe.trim().length === 0) {
      throw new Error('timeframe is required');
    }

    if (config.maxOpenPositions < 1) {
      throw new Error('maxOpenPositions must be at least 1');
    }

    if (config.signalExpiryBars < 0) {
      throw new Error('signalExpiryBars must be non-negative');
    }

    if (!config.orderIdTag || config.orderIdTag.trim().length === 0) {
      throw new Error('orderIdTag is required for strategy identification');
    }

    // Validate timeframe format
    const timeframeRegex = /^\d+[smhdw]$/;
    if (!timeframeRegex.test(config.timeframe)) {
      throw new Error('Invalid timeframe format. Expected format: <number><unit> (e.g., 1h, 5m, 1d)');
    }
  }

  /**
   * Create a copy of the configuration with updated values
   * This creates a new immutable configuration object
   */
  public withUpdates(updates: Partial<TrendStartStrategyConfigData>): TrendStartStrategyConfig {
    return new TrendStartStrategyConfig({
      ...this.toObject(),
      ...updates
    });
  }

  /**
   * Convert configuration to plain object
   */
  public toObject(): Record<string, any> {
    return { ...this };
  }

  /**
   * Get a formatted string representation of the configuration
   */
  public toString(): string {
    return `TrendStartStrategyConfig(${this.strategyId})`;
  }

  /**
   * Check if this configuration is compatible with another
   * Useful for strategy migration or comparison
   */
  public isCompatibleWith(other: TrendStartStrategyConfig): boolean {
    return (
      this.contractId === other.contractId &&
      this.timeframe === other.timeframe &&
      this.version === other.version
    );
  }

  /**
   * Get risk parameters as a separate object
   */
  public getRiskParameters(): {
    stopLossPercent: number;
    takeProfitPercent: number;
    maxOpenPositions: number;
    positionSize: number;
  } {
    return {
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.takeProfitPercent,
      maxOpenPositions: this.maxOpenPositions,
      positionSize: this.positionSize
    };
  }

  /**
   * Get execution parameters as a separate object
   */
  public getExecutionParameters(): {
    useMarketOrders: boolean;
    limitOrderOffsetTicks?: number;
    orderTimeoutBars?: number;
    commission: number;
  } {
    return {
      useMarketOrders: this.useMarketOrders,
      limitOrderOffsetTicks: this.limitOrderOffsetTicks,
      orderTimeoutBars: this.orderTimeoutBars,
      commission: this.commission
    };
  }

  /**
   * Get signal parameters as a separate object
   */
  public getSignalParameters(): {
    minConfirmationBars: number;
    confidenceThreshold: number;
    signalExpiryBars: number;
    useResearchMode: boolean;
  } {
    return {
      minConfirmationBars: this.minConfirmationBars,
      confidenceThreshold: this.confidenceThreshold,
      signalExpiryBars: this.signalExpiryBars,
      useResearchMode: this.useResearchMode
    };
  }
} 