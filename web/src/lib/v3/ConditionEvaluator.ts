import {
  Condition,
  ValueReference,
  ComparisonOperator,
  LogicalOperator,
  StrategyExecutionContext,
  PriceType
} from './DeclarativeStrategy';

/**
 * Evaluation result for a condition
 */
export interface ConditionEvaluationResult {
  result: boolean;
  details: string;
  confidence?: number; // 0-1 confidence in the result
  metadata?: Record<string, unknown>;
}

/**
 * Evaluation cache to optimize repeated evaluations
 */
interface EvaluationCache {
  [key: string]: {
    result: ConditionEvaluationResult;
    timestamp: number;
    barIndex: number;
  };
}

/**
 * Pattern detection utilities
 */
interface CandlestickPattern {
  name: string;
  detector: (bars: StrategyExecutionContext['previousBars'], currentBar: StrategyExecutionContext['currentBar']) => boolean;
  description: string;
}

/**
 * ConditionEvaluator - Evaluates strategy conditions against market data
 * 
 * Handles all types of conditions:
 * - Comparison conditions (value A > value B)
 * - Logical conditions (AND, OR, NOT)
 * - Pattern conditions (candlestick patterns, chart patterns)
 * - Time-based conditions (time of day, day of week, sessions)
 * - Custom JavaScript conditions
 */
export class ConditionEvaluator {
  private cache: EvaluationCache = {};
  private cacheTimeout = 60000; // Cache for 1 minute
  private patterns: Map<string, CandlestickPattern>;

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Evaluate a condition against execution context
   */
  public async evaluateCondition(
    condition: Condition,
    context: StrategyExecutionContext
  ): Promise<ConditionEvaluationResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(condition, context);
    const cached = this.cache[cacheKey];
    
    if (cached && this.isCacheValid(cached, context)) {
      return cached.result;
    }

    let result: ConditionEvaluationResult;

    try {
      switch (condition.type) {
        case 'comparison':
          result = await this.evaluateComparison(condition, context);
          break;
        case 'logical':
          result = await this.evaluateLogical(condition, context);
          break;
        case 'pattern':
          result = await this.evaluatePattern(condition, context);
          break;
        case 'time':
          result = await this.evaluateTime(condition, context);
          break;
        case 'custom':
          result = await this.evaluateCustom(condition, context);
          break;
        default:
          result = {
            result: false,
            details: `Unknown condition type: ${condition.type}`
          };
      }
    } catch (error) {
      result = {
        result: false,
        details: `Error evaluating condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    // Cache the result
    this.cache[cacheKey] = {
      result,
      timestamp: Date.now(),
      barIndex: context.previousBars.length
    };

    return result;
  }

  /**
   * Evaluate comparison condition (A > B, A crosses above B, etc.)
   */
  private async evaluateComparison(
    condition: Condition,
    context: StrategyExecutionContext
  ): Promise<ConditionEvaluationResult> {
    if (!condition.comparison) {
      return { result: false, details: 'Missing comparison configuration' };
    }

    const { left, operator, right } = condition.comparison;

    // Resolve values
    const leftValue = await this.resolveValue(left, context);
    const rightValue = await this.resolveValue(right, context);

    if (leftValue === null || rightValue === null) {
      return { 
        result: false, 
        details: `Unable to resolve values: left=${leftValue}, right=${rightValue}` 
      };
    }

    let result: boolean;
    let details: string;

    switch (operator) {
      case '>':
        result = leftValue > rightValue;
        details = `${leftValue} > ${rightValue} = ${result}`;
        break;
      case '<':
        result = leftValue < rightValue;
        details = `${leftValue} < ${rightValue} = ${result}`;
        break;
      case '>=':
        result = leftValue >= rightValue;
        details = `${leftValue} >= ${rightValue} = ${result}`;
        break;
      case '<=':
        result = leftValue <= rightValue;
        details = `${leftValue} <= ${rightValue} = ${result}`;
        break;
      case '==':
        result = Math.abs(leftValue - rightValue) < 0.000001; // Handle floating point comparison
        details = `${leftValue} == ${rightValue} = ${result}`;
        break;
      case '!=':
        result = Math.abs(leftValue - rightValue) >= 0.000001;
        details = `${leftValue} != ${rightValue} = ${result}`;
        break;
      case 'crosses_above':
        result = this.checkCrossesAbove(left, right, context);
        details = `${this.getValueDescription(left)} crosses above ${this.getValueDescription(right)} = ${result}`;
        break;
      case 'crosses_below':
        result = this.checkCrossesBelow(left, right, context);
        details = `${this.getValueDescription(left)} crosses below ${this.getValueDescription(right)} = ${result}`;
        break;
      default:
        return { result: false, details: `Unknown comparison operator: ${operator}` };
    }

    return { result, details };
  }

  /**
   * Evaluate logical condition (AND, OR, NOT)
   */
  private async evaluateLogical(
    condition: Condition,
    context: StrategyExecutionContext
  ): Promise<ConditionEvaluationResult> {
    if (!condition.logical) {
      return { result: false, details: 'Missing logical configuration' };
    }

    const { operator, conditions } = condition.logical;

    switch (operator) {
      case 'AND':
        for (const subCondition of conditions) {
          const result = await this.evaluateCondition(subCondition, context);
          if (!result.result) {
            return {
              result: false,
              details: `AND failed on condition ${subCondition.id}: ${result.details}`
            };
          }
        }
        return { result: true, details: `All ${conditions.length} AND conditions passed` };

      case 'OR':
        const orResults: string[] = [];
        for (const subCondition of conditions) {
          const result = await this.evaluateCondition(subCondition, context);
          orResults.push(`${subCondition.id}: ${result.result}`);
          if (result.result) {
            return {
              result: true,
              details: `OR passed on condition ${subCondition.id}: ${result.details}`
            };
          }
        }
        return {
          result: false,
          details: `All ${conditions.length} OR conditions failed: ${orResults.join(', ')}`
        };

      case 'NOT':
        if (conditions.length !== 1) {
          return { result: false, details: 'NOT operator requires exactly one condition' };
        }
        const notResult = await this.evaluateCondition(conditions[0], context);
        return {
          result: !notResult.result,
          details: `NOT condition ${conditions[0].id}: ${!notResult.result} (inverted from ${notResult.result})`
        };

      default:
        return { result: false, details: `Unknown logical operator: ${operator}` };
    }
  }

  /**
   * Evaluate pattern condition (candlestick patterns, chart patterns)
   */
  private async evaluatePattern(
    condition: Condition,
    context: StrategyExecutionContext
  ): Promise<ConditionEvaluationResult> {
    if (!condition.pattern) {
      return { result: false, details: 'Missing pattern configuration' };
    }

    const { type, lookback = 5 } = condition.pattern;
    const pattern = this.patterns.get(type);

    if (!pattern) {
      return { result: false, details: `Unknown pattern type: ${type}` };
    }

    // Get the required number of bars for pattern detection
    const requiredBars = Math.max(lookback, 2);
    if (context.previousBars.length < requiredBars - 1) {
      return {
        result: false,
        details: `Insufficient bars for pattern detection: need ${requiredBars}, have ${context.previousBars.length + 1}`
      };
    }

    const result = pattern.detector(context.previousBars, context.currentBar);

    return {
      result,
      details: `Pattern ${type} detection: ${result}`,
      metadata: {
        patternName: pattern.name,
        description: pattern.description,
        barsAnalyzed: requiredBars
      }
    };
  }

  /**
   * Evaluate time-based condition
   */
  private async evaluateTime(
    condition: Condition,
    context: StrategyExecutionContext
  ): Promise<ConditionEvaluationResult> {
    if (!condition.time) {
      return { result: false, details: 'Missing time configuration' };
    }

    const { type, startTime, endTime, daysOfWeek, session } = condition.time;
    const { time } = context;

    switch (type) {
      case 'time_of_day':
        if (!startTime || !endTime) {
          return { result: false, details: 'Missing start or end time for time_of_day condition' };
        }
        return this.checkTimeOfDay(startTime, endTime, time.hourOfDay, time.minuteOfHour);

      case 'day_of_week':
        if (!daysOfWeek || daysOfWeek.length === 0) {
          return { result: false, details: 'Missing days of week for day_of_week condition' };
        }
        const result = daysOfWeek.includes(time.dayOfWeek);
        return {
          result,
          details: `Day of week ${time.dayOfWeek} in allowed days [${daysOfWeek.join(', ')}]: ${result}`
        };

      case 'session':
        if (!session) {
          return { result: false, details: 'Missing session for session condition' };
        }
        const sessionMatch = context.market.session === session;
        return {
          result: sessionMatch,
          details: `Current session ${context.market.session} matches ${session}: ${sessionMatch}`
        };

      default:
        return { result: false, details: `Unknown time condition type: ${type}` };
    }
  }

  /**
   * Evaluate custom JavaScript condition
   */
  private async evaluateCustom(
    condition: Condition,
    context: StrategyExecutionContext
  ): Promise<ConditionEvaluationResult> {
    if (!condition.custom) {
      return { result: false, details: 'Missing custom configuration' };
    }

    const { code, context: customContext } = condition.custom;

    try {
      // Create a safe execution environment
      const safeContext = {
        ...customContext,
        context,
        Math,
        Date,
        // Add helper functions
        getValue: (ref: ValueReference) => this.resolveValue(ref, context),
        log: console.log // Allow logging for debugging
      };

      // Execute the custom code in a controlled environment
      // Note: In production, this should use a proper sandboxing solution
      const func = new Function(...Object.keys(safeContext), `return (${code})`);
      const result = func(...Object.values(safeContext));

      return {
        result: Boolean(result),
        details: `Custom condition executed: ${Boolean(result)}`,
        metadata: { customCode: code.substring(0, 100) + (code.length > 100 ? '...' : '') }
      };
    } catch (error) {
      return {
        result: false,
        details: `Custom condition error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Resolve a value reference to an actual number
   */
  private async resolveValue(ref: ValueReference, context: StrategyExecutionContext): Promise<number | null> {
    switch (ref.type) {
      case 'number':
        return ref.value ?? null;

      case 'price':
        return this.resolvePriceValue(ref, context);

      case 'indicator':
        return this.resolveIndicatorValue(ref, context);

      case 'calculation':
        return this.resolveCalculationValue(ref, context);

      default:
        return null;
    }
  }

  /**
   * Resolve price value (open, high, low, close, etc.)
   */
  private resolvePriceValue(ref: ValueReference, context: StrategyExecutionContext): number | null {
    if (!ref.priceType) return null;

    const barsBack = ref.barsBack ?? 0;
    let bar: typeof context.currentBar;

    if (barsBack === 0) {
      bar = context.currentBar;
    } else {
      const index = context.previousBars.length - barsBack;
      if (index < 0) return null;
      bar = context.previousBars[index];
    }

    switch (ref.priceType) {
      case 'open': return bar.open;
      case 'high': return bar.high;
      case 'low': return bar.low;
      case 'close': return bar.close;
      case 'hl2': return (bar.high + bar.low) / 2;
      case 'hlc3': return (bar.high + bar.low + bar.close) / 3;
      case 'ohlc4': return (bar.open + bar.high + bar.low + bar.close) / 4;
      default: return null;
    }
  }

  /**
   * Resolve indicator value
   */
  private resolveIndicatorValue(ref: ValueReference, context: StrategyExecutionContext): number | null {
    if (!ref.indicatorId) return null;

    const indicator = context.indicators[ref.indicatorId];
    if (!indicator) return null;

    const barsBack = ref.barsBack ?? 0;

    if (barsBack === 0) {
      return typeof indicator.current === 'number' ? indicator.current : null;
    } else {
      const index = indicator.previous.length - barsBack;
      if (index < 0) return null;
      const value = indicator.previous[index];
      return typeof value === 'number' ? value : null;
    }
  }

  /**
   * Resolve calculation value (mathematical operations)
   */
  private async resolveCalculationValue(ref: ValueReference, context: StrategyExecutionContext): Promise<number | null> {
    if (!ref.calculation) return null;

    const { operation, left, right } = ref.calculation;
    const leftValue = await this.resolveValue(left, context);
    const rightValue = await this.resolveValue(right, context);

    if (leftValue === null || rightValue === null) return null;

    switch (operation) {
      case 'add': return leftValue + rightValue;
      case 'subtract': return leftValue - rightValue;
      case 'multiply': return leftValue * rightValue;
      case 'divide': return rightValue !== 0 ? leftValue / rightValue : null;
      case 'percentage': return (leftValue / rightValue) * 100;
      default: return null;
    }
  }

  /**
   * Check if value A crosses above value B
   */
  private checkCrossesAbove(left: ValueReference, right: ValueReference, context: StrategyExecutionContext): boolean {
    // Need at least 2 bars to check crossing
    if (context.previousBars.length === 0) return false;

    // Get current values
    const currentLeft = this.resolveValue(left, context);
    const currentRight = this.resolveValue(right, context);

    // Get previous values
    const prevLeftRef = { ...left, barsBack: (left.barsBack ?? 0) + 1 };
    const prevRightRef = { ...right, barsBack: (right.barsBack ?? 0) + 1 };
    const prevLeft = this.resolveValue(prevLeftRef, context);
    const prevRight = this.resolveValue(prevRightRef, context);

    if (currentLeft === null || currentRight === null || prevLeft === null || prevRight === null) {
      return false;
    }

    // Crosses above: was below or equal, now above
    return prevLeft <= prevRight && currentLeft > currentRight;
  }

  /**
   * Check if value A crosses below value B
   */
  private checkCrossesBelow(left: ValueReference, right: ValueReference, context: StrategyExecutionContext): boolean {
    // Need at least 2 bars to check crossing
    if (context.previousBars.length === 0) return false;

    // Get current values
    const currentLeft = this.resolveValue(left, context);
    const currentRight = this.resolveValue(right, context);

    // Get previous values
    const prevLeftRef = { ...left, barsBack: (left.barsBack ?? 0) + 1 };
    const prevRightRef = { ...right, barsBack: (right.barsBack ?? 0) + 1 };
    const prevLeft = this.resolveValue(prevLeftRef, context);
    const prevRight = this.resolveValue(prevRightRef, context);

    if (currentLeft === null || currentRight === null || prevLeft === null || prevRight === null) {
      return false;
    }

    // Crosses below: was above or equal, now below
    return prevLeft >= prevRight && currentLeft < currentRight;
  }

  /**
   * Check time of day condition
   */
  private checkTimeOfDay(
    startTime: string,
    endTime: string,
    hourOfDay: number,
    minuteOfHour: number
  ): ConditionEvaluationResult {
    const parseTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const currentMinutes = hourOfDay * 60 + minuteOfHour;
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);

    let result: boolean;

    if (startMinutes <= endMinutes) {
      // Same day (e.g., 09:00 to 17:00)
      result = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Crosses midnight (e.g., 22:00 to 06:00)
      result = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    return {
      result,
      details: `Time ${hourOfDay.toString().padStart(2, '0')}:${minuteOfHour.toString().padStart(2, '0')} within ${startTime}-${endTime}: ${result}`
    };
  }

  /**
   * Get human-readable description of a value reference
   */
  private getValueDescription(ref: ValueReference): string {
    switch (ref.type) {
      case 'number':
        return ref.value?.toString() ?? 'null';
      case 'price':
        const barsBackStr = ref.barsBack ? `[${ref.barsBack}]` : '';
        return `${ref.priceType}${barsBackStr}`;
      case 'indicator':
        const indBarsBackStr = ref.barsBack ? `[${ref.barsBack}]` : '';
        return `${ref.indicatorId}${indBarsBackStr}`;
      case 'calculation':
        return `calculation`;
      default:
        return 'unknown';
    }
  }

  /**
   * Initialize candlestick patterns
   */
  private initializePatterns(): Map<string, CandlestickPattern> {
    const patterns = new Map<string, CandlestickPattern>();

    patterns.set('bullish_engulfing', {
      name: 'Bullish Engulfing',
      description: 'Bullish reversal pattern where current candle engulfs previous bearish candle',
      detector: (previousBars, currentBar) => {
        if (previousBars.length === 0) return false;
        const prevBar = previousBars[previousBars.length - 1];
        
        // Previous bar is bearish
        const prevBearish = prevBar.close < prevBar.open;
        
        // Current bar is bullish
        const currentBullish = currentBar.close > currentBar.open;
        
        // Current bar engulfs previous bar
        const engulfs = currentBar.open < prevBar.close && currentBar.close > prevBar.open;
        
        return prevBearish && currentBullish && engulfs;
      }
    });

    patterns.set('bearish_engulfing', {
      name: 'Bearish Engulfing',
      description: 'Bearish reversal pattern where current candle engulfs previous bullish candle',
      detector: (previousBars, currentBar) => {
        if (previousBars.length === 0) return false;
        const prevBar = previousBars[previousBars.length - 1];
        
        // Previous bar is bullish
        const prevBullish = prevBar.close > prevBar.open;
        
        // Current bar is bearish
        const currentBearish = currentBar.close < currentBar.open;
        
        // Current bar engulfs previous bar
        const engulfs = currentBar.open > prevBar.close && currentBar.close < prevBar.open;
        
        return prevBullish && currentBearish && engulfs;
      }
    });

    patterns.set('hammer', {
      name: 'Hammer',
      description: 'Bullish reversal pattern with small body and long lower shadow',
      detector: (previousBars, currentBar) => {
        const bodySize = Math.abs(currentBar.close - currentBar.open);
        const totalRange = currentBar.high - currentBar.low;
        const lowerShadow = Math.min(currentBar.open, currentBar.close) - currentBar.low;
        const upperShadow = currentBar.high - Math.max(currentBar.open, currentBar.close);
        
        // Small body (less than 30% of total range)
        const smallBody = bodySize < totalRange * 0.3;
        
        // Long lower shadow (at least 2x the body size)
        const longLowerShadow = lowerShadow >= bodySize * 2;
        
        // Short upper shadow (less than body size)
        const shortUpperShadow = upperShadow <= bodySize;
        
        return smallBody && longLowerShadow && shortUpperShadow;
      }
    });

    patterns.set('doji', {
      name: 'Doji',
      description: 'Indecision pattern with very small body',
      detector: (previousBars, currentBar) => {
        const bodySize = Math.abs(currentBar.close - currentBar.open);
        const totalRange = currentBar.high - currentBar.low;
        
        // Very small body (less than 5% of total range)
        return totalRange > 0 && bodySize < totalRange * 0.05;
      }
    });

    patterns.set('shooting_star', {
      name: 'Shooting Star',
      description: 'Bearish reversal pattern with small body and long upper shadow',
      detector: (previousBars, currentBar) => {
        const bodySize = Math.abs(currentBar.close - currentBar.open);
        const totalRange = currentBar.high - currentBar.low;
        const upperShadow = currentBar.high - Math.max(currentBar.open, currentBar.close);
        const lowerShadow = Math.min(currentBar.open, currentBar.close) - currentBar.low;
        
        // Small body (less than 30% of total range)
        const smallBody = bodySize < totalRange * 0.3;
        
        // Long upper shadow (at least 2x the body size)
        const longUpperShadow = upperShadow >= bodySize * 2;
        
        // Short lower shadow (less than body size)
        const shortLowerShadow = lowerShadow <= bodySize;
        
        return smallBody && longUpperShadow && shortLowerShadow;
      }
    });

    patterns.set('inside_bar', {
      name: 'Inside Bar',
      description: 'Current bar is completely within the range of the previous bar',
      detector: (previousBars, currentBar) => {
        if (previousBars.length === 0) return false;
        const prevBar = previousBars[previousBars.length - 1];
        
        return currentBar.high <= prevBar.high && currentBar.low >= prevBar.low;
      }
    });

    patterns.set('outside_bar', {
      name: 'Outside Bar',
      description: 'Current bar completely encompasses the previous bar',
      detector: (previousBars, currentBar) => {
        if (previousBars.length === 0) return false;
        const prevBar = previousBars[previousBars.length - 1];
        
        return currentBar.high >= prevBar.high && currentBar.low <= prevBar.low;
      }
    });

    return patterns;
  }

  /**
   * Generate cache key for condition and context
   */
  private generateCacheKey(condition: Condition, context: StrategyExecutionContext): string {
    // Create a hash of the condition and relevant context
    const contextKey = `${context.currentBar.timestamp}_${context.previousBars.length}`;
    return `${condition.id}_${contextKey}`;
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(cached: EvaluationCache[string], context: StrategyExecutionContext): boolean {
    const now = Date.now();
    const isTimedOut = now - cached.timestamp > this.cacheTimeout;
    const isStale = cached.barIndex !== context.previousBars.length;
    
    return !isTimedOut && !isStale;
  }

  /**
   * Clear evaluation cache
   */
  public clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; hitRate: number } {
    const size = Object.keys(this.cache).length;
    // Hit rate would need to be tracked separately
    return { size, hitRate: 0 };
  }
}

export default ConditionEvaluator;
