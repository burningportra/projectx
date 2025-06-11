/**
 * Declarative Strategy Schema and Types
 * 
 * Enables non-programmers to create sophisticated trading strategies using JSON-like templates.
 * Supports complex conditions, risk management, position sizing, and indicator configurations.
 */

export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '==' | '!=' | 'crosses_above' | 'crosses_below';
export type LogicalOperator = 'AND' | 'OR' | 'NOT';
export type IndicatorType = 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'STOCH' | 'ADX' | 'CCI' | 'ROC';
export type PriceType = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type PositionSide = 'long' | 'short' | 'both';

/**
 * Base value that can be a number, indicator reference, or price reference
 */
export interface ValueReference {
  type: 'number' | 'indicator' | 'price' | 'calculation';
  
  // For number type
  value?: number;
  
  // For indicator type
  indicatorId?: string;
  
  // For price type
  priceType?: PriceType;
  barsBack?: number; // How many bars back to look (0 = current bar)
  
  // For calculation type
  calculation?: {
    operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'percentage';
    left: ValueReference;
    right: ValueReference;
  };
}

/**
 * Condition that can be evaluated against market data
 */
export interface Condition {
  id: string;
  description?: string;
  type: 'comparison' | 'logical' | 'pattern' | 'time' | 'custom';
  
  // For comparison conditions
  comparison?: {
    left: ValueReference;
    operator: ComparisonOperator;
    right: ValueReference;
  };
  
  // For logical conditions (AND, OR, NOT)
  logical?: {
    operator: LogicalOperator;
    conditions: Condition[];
  };
  
  // For pattern conditions
  pattern?: {
    type: 'bullish_engulfing' | 'bearish_engulfing' | 'hammer' | 'doji' | 'shooting_star' | 'inside_bar' | 'outside_bar';
    lookback?: number; // How many bars to look back for pattern
  };
  
  // For time-based conditions
  time?: {
    type: 'time_of_day' | 'day_of_week' | 'session';
    startTime?: string; // HH:MM format
    endTime?: string;
    daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    session?: 'pre_market' | 'market_hours' | 'after_hours';
    timezone?: string;
  };
  
  // For custom JavaScript conditions (advanced users)
  custom?: {
    code: string; // JavaScript code that returns boolean
    context: Record<string, unknown>; // Variables available in code
  };
}

/**
 * Indicator configuration
 */
export interface IndicatorConfig {
  id: string;
  name: string;
  type: IndicatorType;
  
  // Common parameters
  period?: number;
  source?: PriceType;
  
  // SMA/EMA specific
  // (uses period and source)
  
  // RSI specific
  overbought?: number; // Default: 70
  oversold?: number; // Default: 30
  
  // MACD specific
  fastPeriod?: number; // Default: 12
  slowPeriod?: number; // Default: 26
  signalPeriod?: number; // Default: 9
  
  // Bollinger Bands specific
  standardDeviations?: number; // Default: 2
  
  // ATR specific
  // (uses period)
  
  // Stochastic specific
  kPeriod?: number; // Default: 14
  dPeriod?: number; // Default: 3
  smooth?: number; // Default: 3
  
  // ADX specific
  // (uses period)
  
  // CCI specific
  // (uses period)
  
  // ROC specific
  // (uses period)
  
  // Custom parameters for extensibility
  customParams?: Record<string, unknown>;
}

/**
 * Risk management configuration
 */
export interface RiskManagement {
  // Position sizing
  positionSizing: {
    type: 'fixed_amount' | 'fixed_percentage' | 'risk_based' | 'kelly_criterion' | 'optimal_f';
    
    // Fixed amount (e.g., $1000 per trade)
    fixedAmount?: number;
    
    // Fixed percentage of account (e.g., 10% of account)
    fixedPercentage?: number;
    
    // Risk-based sizing (risk X% of account per trade)
    riskPercentage?: number;
    
    // Kelly criterion parameters
    winProbability?: number;
    avgWinLoss?: number;
    
    // Maximum position size limits
    maxPositionSize?: number;
    maxPositionPercentage?: number;
  };
  
  // Stop loss configuration
  stopLoss?: {
    enabled: boolean;
    type: 'fixed_points' | 'fixed_percentage' | 'atr_based' | 'indicator_based' | 'trailing';
    
    // Fixed points (e.g., 50 points)
    fixedPoints?: number;
    
    // Fixed percentage (e.g., 2% from entry)
    fixedPercentage?: number;
    
    // ATR-based (e.g., 2 * ATR)
    atrMultiplier?: number;
    atrPeriod?: number;
    
    // Indicator-based (e.g., below SMA)
    indicatorId?: string;
    
    // Trailing stop
    trailingPoints?: number;
    trailingPercentage?: number;
  };
  
  // Take profit configuration
  takeProfit?: {
    enabled: boolean;
    type: 'fixed_points' | 'fixed_percentage' | 'risk_reward_ratio' | 'indicator_based' | 'multiple_targets';
    
    // Fixed points/percentage
    fixedPoints?: number;
    fixedPercentage?: number;
    
    // Risk-reward ratio (e.g., 2:1)
    riskRewardRatio?: number;
    
    // Indicator-based
    indicatorId?: string;
    
    // Multiple targets
    targets?: Array<{
      percentage: number; // Percentage of position to close
      points?: number;
      percentage_profit?: number;
      riskRewardRatio?: number;
    }>;
  };
  
  // Account risk limits
  maxDailyLoss?: number;
  maxDailyLossPercentage?: number;
  maxDrawdown?: number;
  maxDrawdownPercentage?: number;
  maxOpenPositions?: number;
  maxConcurrentTrades?: number;
  
  // Time-based risk management
  maxHoldingPeriod?: number; // Hours
  forceCloseTime?: string; // HH:MM format
  
  // Correlation limits
  maxCorrelation?: number; // Maximum correlation between open positions
}

/**
 * Entry signal configuration
 */
export interface EntrySignal {
  id: string;
  name: string;
  description?: string;
  
  // Conditions that must be met for entry
  conditions: Condition[];
  
  // Position direction
  side: PositionSide;
  
  // Order configuration
  orderType: OrderType;
  limitOffset?: number; // For limit orders, offset from current price
  stopOffset?: number; // For stop orders, offset from current price
  
  // Entry timing
  executeOn: 'bar_close' | 'bar_open' | 'immediate';
  
  // Priority (higher number = higher priority if multiple signals)
  priority?: number;
  
  // Cooldown period (bars to wait before next signal)
  cooldownBars?: number;
  
  // Maximum signals per day/week/month
  maxSignalsPerDay?: number;
  maxSignalsPerWeek?: number;
  maxSignalsPerMonth?: number;
}

/**
 * Exit signal configuration
 */
export interface ExitSignal {
  id: string;
  name: string;
  description?: string;
  
  // Conditions for exit
  conditions: Condition[];
  
  // Exit configuration
  exitType: 'market' | 'limit' | 'stop';
  limitOffset?: number;
  stopOffset?: number;
  
  // Partial or full exit
  exitPercentage?: number; // Default: 100%
  
  // Exit timing
  executeOn: 'bar_close' | 'bar_open' | 'immediate';
  
  // Priority for multiple exit signals
  priority?: number;
}

/**
 * Complete declarative strategy definition
 */
export interface DeclarativeStrategy {
  // Strategy metadata
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  created: string; // ISO date string
  updated: string; // ISO date string
  tags?: string[];
  
  // Strategy settings
  settings: {
    timeframe: string; // e.g., '1m', '5m', '1h', '1d'
    markets?: string[]; // e.g., ['EURUSD', 'GBPUSD']
    sessions?: string[]; // e.g., ['London', 'New York']
    
    // Backtesting settings
    initialBalance?: number;
    commission?: number;
    slippage?: number;
    
    // Strategy behavior
    allowShort?: boolean;
    allowLong?: boolean;
    allowMultiplePositions?: boolean;
    allowPyramiding?: boolean;
    pyramidingMaxPositions?: number;
  };
  
  // Required indicators
  indicators: IndicatorConfig[];
  
  // Risk management
  riskManagement: RiskManagement;
  
  // Entry signals
  entrySignals: EntrySignal[];
  
  // Exit signals
  exitSignals: ExitSignal[];
  
  // Strategy filters (additional conditions that must be met)
  filters?: Condition[];
  
  // Schedule (when strategy is active)
  schedule?: {
    startTime?: string; // HH:MM
    endTime?: string; // HH:MM
    daysOfWeek?: number[]; // 0-6
    timezone?: string;
    holidayCalendar?: string;
  };
  
  // Performance targets and alerts
  targets?: {
    dailyProfitTarget?: number;
    dailyLossLimit?: number;
    weeklyProfitTarget?: number;
    weeklyLossLimit?: number;
    monthlyProfitTarget?: number;
    monthlyLossLimit?: number;
    
    // Actions when targets are hit
    onProfitTarget?: 'stop_trading' | 'reduce_size' | 'alert_only';
    onLossLimit?: 'stop_trading' | 'reduce_size' | 'alert_only';
  };
  
  // Validation and constraints
  validation?: {
    minBarsRequired?: number; // Minimum bars needed before strategy can trade
    requiredMarketConditions?: Condition[]; // Market must meet these conditions
    maxSlippage?: number;
    maxSpread?: number;
  };
}

/**
 * Strategy template for common patterns
 */
export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'trend_following' | 'mean_reversion' | 'breakout' | 'scalping' | 'swing' | 'custom';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  
  // Template content
  template: Partial<DeclarativeStrategy>;
  
  // Required user inputs
  requiredInputs: Array<{
    key: string; // Path to the value in template (e.g., 'indicators.0.period')
    name: string; // User-friendly name
    description: string;
    type: 'number' | 'string' | 'boolean' | 'select';
    default?: unknown;
    min?: number;
    max?: number;
    options?: Array<{ value: unknown; label: string }>; // For select type
    validation?: {
      required?: boolean;
      pattern?: string; // Regex pattern
      custom?: string; // Custom validation code
    };
  }>;
  
  // Example configurations
  examples?: Array<{
    name: string;
    description: string;
    inputs: Record<string, unknown>;
  }>;
}

/**
 * Strategy execution context
 */
export interface StrategyExecutionContext {
  currentBar: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
  };
  
  previousBars: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
  }>;
  
  indicators: Record<string, {
    current: number | { [key: string]: number };
    previous: Array<number | { [key: string]: number }>;
  }>;
  
  account: {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
  };
  
  positions: Array<{
    id: string;
    symbol: string;
    side: 'long' | 'short';
    size: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    entryTime: number;
  }>;
  
  orders: Array<{
    id: string;
    symbol: string;
    type: OrderType;
    side: 'buy' | 'sell';
    size: number;
    price?: number;
    stopPrice?: number;
    status: 'pending' | 'filled' | 'cancelled';
    createTime: number;
  }>;
  
  // Market context
  market: {
    symbol: string;
    bid: number;
    ask: number;
    spread: number;
    isMarketOpen: boolean;
    session: 'pre_market' | 'market_hours' | 'after_hours';
  };
  
  // Time context
  time: {
    current: number; // Unix timestamp
    timezone: string;
    isHoliday: boolean;
    dayOfWeek: number; // 0-6
    hourOfDay: number; // 0-23
    minuteOfHour: number; // 0-59
  };
}

/**
 * Strategy execution result
 */
export interface StrategyExecutionResult {
  // Actions to take
  actions: Array<{
    type: 'enter_position' | 'exit_position' | 'modify_position' | 'cancel_order' | 'modify_order';
    
    // For position actions
    side?: 'long' | 'short';
    size?: number;
    orderType?: OrderType;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    
    // For modification actions
    positionId?: string;
    orderId?: string;
    newStopLoss?: number;
    newTakeProfit?: number;
    newPrice?: number;
    
    // Metadata
    reason: string; // Human-readable reason for action
    signalId: string; // ID of signal that triggered action
    confidence?: number; // 0-1 confidence score
  }>;
  
  // Diagnostic information
  diagnostics: {
    evaluatedConditions: Array<{
      conditionId: string;
      result: boolean;
      details: string;
    }>;
    
    triggeredSignals: Array<{
      signalId: string;
      type: 'entry' | 'exit';
      conditions: string[];
    }>;
    
    riskChecks: Array<{
      check: string;
      passed: boolean;
      details: string;
    }>;
    
    warnings: string[];
    errors: string[];
  };
  
  // Performance metrics
  metrics?: {
    signalStrength: number; // 0-1
    riskScore: number; // 0-1
    confidenceScore: number; // 0-1
    expectedReturn: number;
    expectedRisk: number;
  };
}

/**
 * Validation result for strategy schema
 */
export interface StrategyValidationResult {
  isValid: boolean;
  errors: Array<{
    path: string; // JSON path to error (e.g., 'entrySignals.0.conditions.1')
    message: string;
    severity: 'error' | 'warning' | 'info';
    code?: string; // Error code for programmatic handling
  }>;
  warnings: Array<{
    path: string;
    message: string;
    suggestion?: string;
  }>;
  
  // Completeness check
  completeness: {
    score: number; // 0-1
    missingRequired: string[];
    recommendations: string[];
  };
  
  // Performance estimates
  estimates?: {
    memoryUsage: number; // Estimated memory usage in MB
    cpuComplexity: number; // 1-10 complexity score
    executionTimeMs: number; // Estimated execution time per bar
    requiredBars: number; // Minimum bars needed for indicators
  };
}

export default DeclarativeStrategy;
