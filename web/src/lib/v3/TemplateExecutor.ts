import {
  DeclarativeStrategy,
  StrategyExecutionContext,
  StrategyExecutionResult,
  EntrySignal,
  ExitSignal,
  RiskManagement,
  StrategyValidationResult
} from './DeclarativeStrategy';
import ConditionEvaluator, { ConditionEvaluationResult } from './ConditionEvaluator';
import { StrategyDefinition, StrategyConfig, StrategyResult, StrategyContext } from './StrategyFramework';
import { IExecutionEngine } from './IExecutionEngine';
import { IndicatorService } from './IndicatorService';

/**
 * Template execution statistics
 */
export interface TemplateExecutionStats {
  // Signal statistics
  totalEntrySignalsEvaluated: number;
  totalExitSignalsEvaluated: number;
  successfulEntrySignals: number;
  successfulExitSignals: number;
  
  // Condition statistics
  totalConditionsEvaluated: number;
  conditionSuccessRate: number;
  
  // Risk management statistics
  riskChecksPerformed: number;
  riskCheckFailures: number;
  positionSizeAdjustments: number;
  
  // Performance metrics
  averageExecutionTimeMs: number;
  cacheHitRate: number;
  
  // Error tracking
  evaluationErrors: string[];
  riskManagementErrors: string[];
  executionErrors: string[];
}

/**
 * Position sizing calculation result
 */
interface PositionSizeResult {
  size: number;
  reasoning: string;
  adjustments: string[];
  riskAmount: number;
  riskPercentage: number;
}

/**
 * Risk check result
 */
interface RiskCheckResult {
  passed: boolean;
  reason: string;
  blockingFactors: string[];
  recommendations: string[];
}

/**
 * Template Executor - Runs declarative strategies
 * 
 * This is the bridge between declarative JSON strategy definitions and the actual
 * backtesting engine. It evaluates conditions, manages risk, and executes trades
 * based on the template configuration.
 */
export class TemplateExecutor {
  private conditionEvaluator: ConditionEvaluator;
  private stats: TemplateExecutionStats;
  private strategy: DeclarativeStrategy;
  private lastSignalTimes: Map<string, number> = new Map();
  private dailySignalCounts: Map<string, { date: string; count: number }> = new Map();

  constructor(strategy: DeclarativeStrategy) {
    this.conditionEvaluator = new ConditionEvaluator();
    this.strategy = strategy;
    this.stats = this.initializeStats();
  }

  /**
   * Convert declarative strategy to StrategyDefinition for framework integration
   */
  public toStrategyDefinition(): StrategyDefinition {
    const self = this;
    
    return {
      id: this.strategy.id,
      name: this.strategy.name,
      description: this.strategy.description || 'Declarative strategy',
      version: this.strategy.version,
      
      defaultConfig: {
        // Convert strategy settings to config
        timeframe: this.strategy.settings.timeframe,
        markets: this.strategy.settings.markets,
        allowShort: this.strategy.settings.allowShort ?? true,
        allowLong: this.strategy.settings.allowLong ?? true,
        initialBalance: this.strategy.settings.initialBalance ?? 100000,
        commission: this.strategy.settings.commission ?? 0.001,
        slippage: this.strategy.settings.slippage ?? 0.001
      },

      requiredIndicators: this.strategy.indicators.map(ind => ({
        id: ind.id,
        type: ind.type,
        config: {
          period: ind.period,
          source: ind.source,
          ...ind.customParams
        }
      })),

      // The main strategy function
      execute: async (context: StrategyContext): Promise<StrategyResult> => {
        return await self.executeStrategy(context);
      }
    };
  }

  /**
   * Execute the strategy against current market context
   */
  public async executeStrategy(context: StrategyContext): Promise<StrategyResult> {
    const startTime = Date.now();
    const executionContext = this.buildExecutionContext(context);
    
    try {
      // Validate strategy can execute
      const validation = await this.validateExecution(executionContext);
      if (!validation.passed) {
        return {
          signals: [],
          diagnostics: {
            warnings: validation.blockingFactors,
            errors: [],
            metrics: {}
          }
        };
      }

      // Check strategy filters
      if (this.strategy.filters) {
        const filtersPass = await this.evaluateFilters(executionContext);
        if (!filtersPass) {
          return {
            signals: [],
            diagnostics: {
              warnings: ['Strategy filters not met'],
              errors: [],
              metrics: {}
            }
          };
        }
      }

      // Check schedule
      if (!this.isWithinSchedule(executionContext)) {
        return {
          signals: [],
          diagnostics: {
            warnings: ['Outside trading schedule'],
            errors: [],
            metrics: {}
          }
        };
      }

      // Execute strategy logic
      const result = await this.executeStrategyLogic(executionContext);
      
      // Update statistics
      this.updateStats(Date.now() - startTime);
      
      return result;

    } catch (error) {
      this.stats.executionErrors.push(error instanceof Error ? error.message : 'Unknown error');
      
      return {
        signals: [],
        diagnostics: {
          errors: [`Strategy execution error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          warnings: [],
          metrics: {}
        }
      };
    }
  }

  /**
   * Core strategy execution logic
   */
  private async executeStrategyLogic(context: StrategyExecutionContext): Promise<StrategyResult> {
    const signals: StrategyResult['signals'] = [];
    const diagnostics: StrategyResult['diagnostics'] = {
      warnings: [],
      errors: [],
      metrics: {}
    };

    // Evaluate entry signals
    for (const entrySignal of this.strategy.entrySignals) {
      if (await this.shouldEvaluateEntrySignal(entrySignal, context)) {
        const result = await this.evaluateEntrySignal(entrySignal, context);
        if (result.shouldEnter) {
          signals.push(...result.signals);
          diagnostics.warnings.push(...result.warnings);
        }
      }
    }

    // Evaluate exit signals for existing positions
    if (context.positions.length > 0) {
      for (const exitSignal of this.strategy.exitSignals) {
        const result = await this.evaluateExitSignal(exitSignal, context);
        if (result.shouldExit) {
          signals.push(...result.signals);
          diagnostics.warnings.push(...result.warnings);
        }
      }
    }

    // Apply risk management
    const riskAdjustedSignals = await this.applyRiskManagement(signals, context);
    
    return {
      signals: riskAdjustedSignals,
      diagnostics
    };
  }

  /**
   * Evaluate entry signal
   */
  private async evaluateEntrySignal(
    signal: EntrySignal, 
    context: StrategyExecutionContext
  ): Promise<{
    shouldEnter: boolean;
    signals: StrategyResult['signals'];
    warnings: string[];
  }> {
    this.stats.totalEntrySignalsEvaluated++;
    const warnings: string[] = [];

    // Evaluate all conditions
    let allConditionsMet = true;
    for (const condition of signal.conditions) {
      const result = await this.conditionEvaluator.evaluateCondition(condition, context);
      this.stats.totalConditionsEvaluated++;
      
      if (!result.result) {
        allConditionsMet = false;
        break;
      }
    }

    if (!allConditionsMet) {
      return { shouldEnter: false, signals: [], warnings };
    }

    // Check signal limits (daily/weekly/monthly)
    if (!this.checkSignalLimits(signal, context)) {
      warnings.push(`Signal ${signal.id} has reached its frequency limit`);
      return { shouldEnter: false, signals: [], warnings };
    }

    // Calculate position size
    const positionSize = await this.calculatePositionSize(signal, context);
    if (positionSize.size <= 0) {
      warnings.push(`Invalid position size calculated: ${positionSize.reasoning}`);
      return { shouldEnter: false, signals: [], warnings };
    }

    // Create entry signal
    const entrySignal: StrategyResult['signals'][0] = {
      type: 'enter',
      side: signal.side === 'long' ? 'long' : 'short',
      size: positionSize.size,
      orderType: signal.orderType,
      price: signal.orderType === 'limit' ? this.calculateLimitPrice(signal, context) : undefined,
      stopLoss: await this.calculateStopLoss(context, positionSize.size),
      takeProfit: await this.calculateTakeProfit(context, positionSize.size),
      metadata: {
        signalId: signal.id,
        reasoning: `Entry signal ${signal.name} triggered`,
        positionSizing: positionSize,
        riskAmount: positionSize.riskAmount
      }
    };

    // Update signal tracking
    this.updateSignalTracking(signal, context);
    this.stats.successfulEntrySignals++;

    return {
      shouldEnter: true,
      signals: [entrySignal],
      warnings
    };
  }

  /**
   * Evaluate exit signal
   */
  private async evaluateExitSignal(
    signal: ExitSignal,
    context: StrategyExecutionContext
  ): Promise<{
    shouldExit: boolean;
    signals: StrategyResult['signals'];
    warnings: string[];
  }> {
    this.stats.totalExitSignalsEvaluated++;
    const warnings: string[] = [];

    // Evaluate conditions
    let allConditionsMet = true;
    for (const condition of signal.conditions) {
      const result = await this.conditionEvaluator.evaluateCondition(condition, context);
      this.stats.totalConditionsEvaluated++;
      
      if (!result.result) {
        allConditionsMet = false;
        break;
      }
    }

    if (!allConditionsMet) {
      return { shouldExit: false, signals: [], warnings };
    }

    // Generate exit signals for all open positions
    const exitSignals: StrategyResult['signals'] = context.positions.map(position => ({
      type: 'exit' as const,
      positionId: position.id,
      size: signal.exitPercentage ? position.size * (signal.exitPercentage / 100) : position.size,
      orderType: signal.exitType,
      price: signal.exitType === 'limit' ? this.calculateLimitPrice(signal, context) : undefined,
      metadata: {
        signalId: signal.id,
        reasoning: `Exit signal ${signal.name} triggered`,
        exitPercentage: signal.exitPercentage || 100
      }
    }));

    this.stats.successfulExitSignals++;

    return {
      shouldExit: true,
      signals: exitSignals,
      warnings
    };
  }

  /**
   * Apply risk management to signals
   */
  private async applyRiskManagement(
    signals: StrategyResult['signals'],
    context: StrategyExecutionContext
  ): Promise<StrategyResult['signals']> {
    const riskAdjustedSignals: StrategyResult['signals'] = [];

    for (const signal of signals) {
      this.stats.riskChecksPerformed++;
      
      // Check account-level risk limits
      const riskCheck = await this.performRiskChecks(signal, context);
      if (!riskCheck.passed) {
        this.stats.riskCheckFailures++;
        continue; // Skip this signal
      }

      // Apply position size limits
      if (signal.type === 'enter') {
        const adjustedSignal = await this.applyPositionSizeLimits(signal, context);
        riskAdjustedSignals.push(adjustedSignal);
      } else {
        riskAdjustedSignals.push(signal);
      }
    }

    return riskAdjustedSignals;
  }

  /**
   * Perform comprehensive risk checks
   */
  private async performRiskChecks(
    signal: StrategyResult['signals'][0],
    context: StrategyExecutionContext
  ): Promise<RiskCheckResult> {
    const blockingFactors: string[] = [];
    const recommendations: string[] = [];
    const rm = this.strategy.riskManagement;

    // Check maximum open positions
    if (rm.maxOpenPositions && context.positions.length >= rm.maxOpenPositions) {
      blockingFactors.push(`Maximum open positions (${rm.maxOpenPositions}) reached`);
    }

    // Check maximum concurrent trades
    if (rm.maxConcurrentTrades && context.positions.length >= rm.maxConcurrentTrades) {
      blockingFactors.push(`Maximum concurrent trades (${rm.maxConcurrentTrades}) reached`);
    }

    // Check daily loss limits
    if (rm.maxDailyLoss || rm.maxDailyLossPercentage) {
      const dailyPnL = this.calculateDailyPnL(context);
      
      if (rm.maxDailyLoss && dailyPnL <= -rm.maxDailyLoss) {
        blockingFactors.push(`Daily loss limit ($${rm.maxDailyLoss}) exceeded`);
      }
      
      if (rm.maxDailyLossPercentage) {
        const dailyLossPercent = (dailyPnL / context.account.balance) * 100;
        if (dailyLossPercent <= -rm.maxDailyLossPercentage) {
          blockingFactors.push(`Daily loss percentage limit (${rm.maxDailyLossPercentage}%) exceeded`);
        }
      }
    }

    // Check drawdown limits
    if (rm.maxDrawdown || rm.maxDrawdownPercentage) {
      const currentDrawdown = this.calculateCurrentDrawdown(context);
      
      if (rm.maxDrawdown && currentDrawdown >= rm.maxDrawdown) {
        blockingFactors.push(`Maximum drawdown ($${rm.maxDrawdown}) exceeded`);
      }
      
      if (rm.maxDrawdownPercentage && currentDrawdown >= rm.maxDrawdownPercentage) {
        blockingFactors.push(`Maximum drawdown percentage (${rm.maxDrawdownPercentage}%) exceeded`);
      }
    }

    return {
      passed: blockingFactors.length === 0,
      reason: blockingFactors.length > 0 ? blockingFactors[0] : 'Risk checks passed',
      blockingFactors,
      recommendations
    };
  }

  /**
   * Calculate position size based on risk management rules
   */
  private async calculatePositionSize(
    signal: EntrySignal,
    context: StrategyExecutionContext
  ): Promise<PositionSizeResult> {
    const rm = this.strategy.riskManagement.positionSizing;
    const adjustments: string[] = [];
    let size = 0;
    let reasoning = '';
    let riskAmount = 0;
    let riskPercentage = 0;

    switch (rm.type) {
      case 'fixed_amount':
        size = rm.fixedAmount || 1000;
        reasoning = `Fixed amount: $${size}`;
        riskAmount = size;
        break;

      case 'fixed_percentage':
        const fixedPercent = rm.fixedPercentage || 10;
        size = (context.account.balance * fixedPercent) / 100;
        reasoning = `Fixed percentage: ${fixedPercent}% of balance`;
        riskAmount = size;
        riskPercentage = fixedPercent;
        break;

      case 'risk_based':
        const riskPercent = rm.riskPercentage || 2;
        const stopLossDistance = await this.calculateStopLossDistance(context);
        if (stopLossDistance > 0) {
          riskAmount = (context.account.balance * riskPercent) / 100;
          size = riskAmount / stopLossDistance;
          reasoning = `Risk-based: Risk ${riskPercent}% ($${riskAmount}) with SL distance ${stopLossDistance}`;
          riskPercentage = riskPercent;
        } else {
          reasoning = 'Cannot calculate risk-based size: invalid stop loss distance';
        }
        break;

      case 'kelly_criterion':
        if (rm.winProbability && rm.avgWinLoss) {
          const kellyFraction = rm.winProbability - ((1 - rm.winProbability) / rm.avgWinLoss);
          const kellySize = Math.max(0, context.account.balance * kellyFraction * 0.25); // Conservative Kelly
          size = kellySize;
          reasoning = `Kelly criterion: ${(kellyFraction * 100).toFixed(2)}% (conservative)`;
          riskAmount = kellySize;
        } else {
          reasoning = 'Kelly criterion requires win probability and average win/loss ratio';
        }
        break;

      default:
        size = 1000; // Default fallback
        reasoning = 'Default position size (missing configuration)';
        adjustments.push('Using default size due to missing configuration');
    }

    // Apply maximum position size limits
    if (rm.maxPositionSize && size > rm.maxPositionSize) {
      adjustments.push(`Reduced from $${size} to max size $${rm.maxPositionSize}`);
      size = rm.maxPositionSize;
    }

    if (rm.maxPositionPercentage) {
      const maxSizeByPercent = (context.account.balance * rm.maxPositionPercentage) / 100;
      if (size > maxSizeByPercent) {
        adjustments.push(`Reduced from $${size} to max percentage $${maxSizeByPercent}`);
        size = maxSizeByPercent;
      }
    }

    return {
      size: Math.max(0, size),
      reasoning,
      adjustments,
      riskAmount,
      riskPercentage
    };
  }

  /**
   * Build execution context from strategy context
   */
  private buildExecutionContext(context: StrategyContext): StrategyExecutionContext {
    return {
      currentBar: {
        open: context.currentBar.open,
        high: context.currentBar.high,
        low: context.currentBar.low,
        close: context.currentBar.close,
        volume: context.currentBar.volume,
        timestamp: context.currentBar.time
      },
      previousBars: context.previousBars.map(bar => ({
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        timestamp: bar.time
      })),
      indicators: context.indicators,
      account: {
        balance: context.account.balance,
        equity: context.account.equity,
        margin: context.account.margin || 0,
        freeMargin: context.account.freeMargin || context.account.balance
      },
      positions: context.positions.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        size: pos.size,
        entryPrice: pos.entryPrice,
        currentPrice: pos.currentPrice,
        unrealizedPnL: pos.unrealizedPnL,
        entryTime: pos.entryTime
      })),
      orders: [], // Would need to be populated from engine state
      market: {
        symbol: context.symbol,
        bid: context.currentBar.close, // Simplified
        ask: context.currentBar.close,
        spread: 0.0001, // Default spread
        isMarketOpen: true, // Simplified
        session: 'market_hours'
      },
      time: {
        current: context.currentBar.time,
        timezone: 'UTC',
        isHoliday: false,
        dayOfWeek: new Date(context.currentBar.time * 1000).getUTCDay(),
        hourOfDay: new Date(context.currentBar.time * 1000).getUTCHours(),
        minuteOfHour: new Date(context.currentBar.time * 1000).getUTCMinutes()
      }
    };
  }

  // Utility methods (abbreviated for space)
  private async validateExecution(context: StrategyExecutionContext): Promise<RiskCheckResult> {
    return { passed: true, reason: 'Validation passed', blockingFactors: [], recommendations: [] };
  }

  private async evaluateFilters(context: StrategyExecutionContext): Promise<boolean> {
    if (!this.strategy.filters) return true;
    
    for (const filter of this.strategy.filters) {
      const result = await this.conditionEvaluator.evaluateCondition(filter, context);
      if (!result.result) return false;
    }
    return true;
  }

  private isWithinSchedule(context: StrategyExecutionContext): boolean {
    if (!this.strategy.schedule) return true;
    
    const { startTime, endTime, daysOfWeek } = this.strategy.schedule;
    const { hourOfDay, minuteOfHour, dayOfWeek } = context.time;
    
    // Check day of week
    if (daysOfWeek && !daysOfWeek.includes(dayOfWeek)) return false;
    
    // Check time of day
    if (startTime && endTime) {
      const parseTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      
      const currentMinutes = hourOfDay * 60 + minuteOfHour;
      const startMinutes = parseTime(startTime);
      const endMinutes = parseTime(endTime);
      
      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    }
    
    return true;
  }

  private async shouldEvaluateEntrySignal(signal: EntrySignal, context: StrategyExecutionContext): Promise<boolean> {
    // Check cooldown
    if (signal.cooldownBars) {
      const lastSignalTime = this.lastSignalTimes.get(signal.id);
      if (lastSignalTime && (context.previousBars.length - lastSignalTime) < signal.cooldownBars) {
        return false;
      }
    }
    
    return true;
  }

  private checkSignalLimits(signal: EntrySignal, context: StrategyExecutionContext): boolean {
    const today = new Date(context.currentBar.timestamp * 1000).toDateString();
    const signalCount = this.dailySignalCounts.get(signal.id);
    
    if (signal.maxSignalsPerDay) {
      if (signalCount && signalCount.date === today && signalCount.count >= signal.maxSignalsPerDay) {
        return false;
      }
    }
    
    // Weekly/monthly limits would need more complex tracking
    return true;
  }

  private updateSignalTracking(signal: EntrySignal, context: StrategyExecutionContext): void {
    const today = new Date(context.currentBar.timestamp * 1000).toDateString();
    const signalCount = this.dailySignalCounts.get(signal.id);
    
    if (signalCount && signalCount.date === today) {
      signalCount.count++;
    } else {
      this.dailySignalCounts.set(signal.id, { date: today, count: 1 });
    }
    
    this.lastSignalTimes.set(signal.id, context.previousBars.length);
  }

  private calculateLimitPrice(signal: EntrySignal | ExitSignal, context: StrategyExecutionContext): number {
    const currentPrice = context.currentBar.close;
    const offset = 'limitOffset' in signal ? signal.limitOffset || 0 : 0;
    return currentPrice + offset;
  }

  private async calculateStopLoss(context: StrategyExecutionContext, positionSize: number): Promise<number | undefined> {
    const sl = this.strategy.riskManagement.stopLoss;
    if (!sl || !sl.enabled) return undefined;
    
    const currentPrice = context.currentBar.close;
    
    switch (sl.type) {
      case 'fixed_points':
        return sl.fixedPoints ? currentPrice - sl.fixedPoints : undefined;
      case 'fixed_percentage':
        return sl.fixedPercentage ? currentPrice * (1 - sl.fixedPercentage / 100) : undefined;
      default:
        return undefined;
    }
  }

  private async calculateTakeProfit(context: StrategyExecutionContext, positionSize: number): Promise<number | undefined> {
    const tp = this.strategy.riskManagement.takeProfit;
    if (!tp || !tp.enabled) return undefined;
    
    const currentPrice = context.currentBar.close;
    
    switch (tp.type) {
      case 'fixed_points':
        return tp.fixedPoints ? currentPrice + tp.fixedPoints : undefined;
      case 'fixed_percentage':
        return tp.fixedPercentage ? currentPrice * (1 + tp.fixedPercentage / 100) : undefined;
      default:
        return undefined;
    }
  }

  private async calculateStopLossDistance(context: StrategyExecutionContext): Promise<number> {
    const sl = this.strategy.riskManagement.stopLoss;
    if (!sl || !sl.enabled) return 0;
    
    switch (sl.type) {
      case 'fixed_points':
        return sl.fixedPoints || 0;
      case 'fixed_percentage':
        return sl.fixedPercentage ? (context.currentBar.close * sl.fixedPercentage / 100) : 0;
      default:
        return 0;
    }
  }

  private async applyPositionSizeLimits(
    signal: StrategyResult['signals'][0],
    context: StrategyExecutionContext
  ): Promise<StrategyResult['signals'][0]> {
    // Apply any additional position size limits
    return signal;
  }

  private calculateDailyPnL(context: StrategyExecutionContext): number {
    // Simplified - would need proper daily P&L calculation
    return context.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
  }

  private calculateCurrentDrawdown(context: StrategyExecutionContext): number {
    // Simplified - would need proper drawdown calculation
    return 0;
  }

  private initializeStats(): TemplateExecutionStats {
    return {
      totalEntrySignalsEvaluated: 0,
      totalExitSignalsEvaluated: 0,
      successfulEntrySignals: 0,
      successfulExitSignals: 0,
      totalConditionsEvaluated: 0,
      conditionSuccessRate: 0,
      riskChecksPerformed: 0,
      riskCheckFailures: 0,
      positionSizeAdjustments: 0,
      averageExecutionTimeMs: 0,
      cacheHitRate: 0,
      evaluationErrors: [],
      riskManagementErrors: [],
      executionErrors: []
    };
  }

  private updateStats(executionTimeMs: number): void {
    // Update average execution time
    const totalExecutions = this.stats.totalEntrySignalsEvaluated + this.stats.totalExitSignalsEvaluated;
    this.stats.averageExecutionTimeMs = 
      (this.stats.averageExecutionTimeMs * (totalExecutions - 1) + executionTimeMs) / totalExecutions;
    
    // Update condition success rate
    if (this.stats.totalConditionsEvaluated > 0) {
      const successfulConditions = this.stats.successfulEntrySignals + this.stats.successfulExitSignals;
      this.stats.conditionSuccessRate = successfulConditions / this.stats.totalConditionsEvaluated;
    }
  }

  /**
   * Get execution statistics
   */
  public getStats(): TemplateExecutionStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * Validate strategy configuration
   */
  public static validateStrategy(strategy: DeclarativeStrategy): StrategyValidationResult {
    const errors: StrategyValidationResult['errors'] = [];
    const warnings: StrategyValidationResult['warnings'] = [];

    // Validate required fields
    if (!strategy.id) errors.push({ path: 'id', message: 'Strategy ID is required', severity: 'error' });
    if (!strategy.name) errors.push({ path: 'name', message: 'Strategy name is required', severity: 'error' });
    if (!strategy.version) errors.push({ path: 'version', message: 'Strategy version is required', severity: 'error' });

    // Validate entry signals
    if (!strategy.entrySignals || strategy.entrySignals.length === 0) {
      errors.push({ path: 'entrySignals', message: 'At least one entry signal is required', severity: 'error' });
    }

    // Validate indicators
    strategy.entrySignals.forEach((signal, idx) => {
      if (!signal.conditions || signal.conditions.length === 0) {
        errors.push({ 
          path: `entrySignals.${idx}.conditions`, 
          message: 'Entry signal must have at least one condition', 
          severity: 'error' 
        });
      }
    });

    // Calculate completeness score
    const requiredFields = ['id', 'name', 'version', 'entrySignals', 'riskManagement'];
    const presentFields = requiredFields.filter(field => Boolean(strategy[field as keyof DeclarativeStrategy]));
    const completenessScore = presentFields.length / requiredFields.length;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      completeness: {
        score: completenessScore,
        missingRequired: requiredFields.filter(field => !Boolean(strategy[field as keyof DeclarativeStrategy])),
        recommendations: [
          'Add exit signals for better position management',
          'Configure stop loss and take profit rules',
          'Add strategy filters for market condition filtering'
        ]
      }
    };
  }
}

export default TemplateExecutor;
