import { BacktestEngine } from './BacktestEngine';
import { BacktestEngineAdapter } from './BacktestEngineAdapter';
import { IExecutionEngine } from './IExecutionEngine';
import { StrategyDefinition, StrategyConfig } from './StrategyFramework';
import { BacktestBarData, BacktestResults } from '../types/backtester';
import { DataSource } from './DataSource';
import { IndicatorService } from './IndicatorService';

/**
 * Parameter specification for optimization
 */
export interface ParameterSpec {
  name: string;
  type: 'number' | 'boolean' | 'string' | 'array';
  
  // For number parameters
  min?: number;
  max?: number;
  step?: number;
  
  // For discrete values
  values?: (number | boolean | string)[];
  
  // Description
  description?: string;
}

/**
 * Parameter combination for a single backtest run
 */
export interface ParameterCombination {
  id: string;
  parameters: Record<string, unknown>;
}

/**
 * Result of a single backtest run
 */
export interface BacktestRunResult {
  id: string;
  parameters: Record<string, unknown>;
  results: BacktestResults;
  performance: PerformanceMetrics;
  executionTime: number; // milliseconds
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  
  // Strategy-specific metrics
  strategyMetrics: Record<string, unknown>;
  
  // Additional computed metrics
  computedMetrics: {
    sharpeRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    winRate: number;
    averageWin: number;
    averageLoss: number;
    profitFactor: number;
    recoveryFactor: number;
    totalTrades: number;
  };
}

/**
 * Performance metrics for comparison
 */
export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  calmarRatio: number;
  
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  
  // Risk metrics
  valueAtRisk95: number;
  expectedShortfall: number;
  recoveryFactor: number;
  
  // Consistency metrics
  monthlyReturns: number[];
  positiveMonths: number;
  negativeMonths: number;
  consistencyScore: number;
}

/**
 * Configuration for optimization run
 */
export interface OptimizationConfig {
  // Execution settings
  maxConcurrency?: number;
  timeoutMs?: number;
  retryFailedRuns?: boolean;
  maxRetries?: number;
  
  // Result filtering and ranking
  minTrades?: number;
  minReturnPercent?: number;
  maxDrawdownPercent?: number;
  
  // Ranking criteria
  rankBy?: 'totalReturn' | 'sharpeRatio' | 'calmarRatio' | 'profitFactor' | 'custom';
  customRankingFunction?: (result: BacktestRunResult) => number;
  
  // Output settings
  saveIndividualResults?: boolean;
  saveTopNResults?: number;
  generateReport?: boolean;
  
  // Progress reporting
  onProgress?: (completed: number, total: number, currentRun: BacktestRunResult | null) => void;
  onRunCompleted?: (result: BacktestRunResult) => void;
  onError?: (error: Error, runId: string) => void;
}

/**
 * Optimization summary and results
 */
export interface OptimizationResults {
  // Summary
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  executionTimeMs: number;
  
  // Best results
  bestResult: BacktestRunResult | null;
  topResults: BacktestRunResult[];
  
  // All results (optional, based on config)
  allResults?: BacktestRunResult[];
  
  // Parameter analysis
  parameterAnalysis: {
    [parameterName: string]: {
      bestValue: unknown;
      worstValue: unknown;
      averagePerformance: Record<string, number>;
      correlation: number; // Correlation with performance
    };
  };
  
  // Statistical analysis
  statistics: {
    meanReturn: number;
    medianReturn: number;
    standardDeviation: number;
    skewness: number;
    kurtosis: number;
    
    // Performance distribution
    returnDistribution: {
      min: number;
      max: number;
      quartiles: [number, number, number]; // 25th, 50th, 75th percentiles
    };
  };
  
  // Recommendations
  recommendations: {
    bestParameters: Record<string, unknown>;
    stabilityConcerns: string[];
    overoptimizationWarnings: string[];
  };
}

/**
 * Progress information for ongoing optimization
 */
export interface OptimizationProgress {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  pendingRuns: number;
  
  currentRun: BacktestRunResult | null;
  elapsedTimeMs: number;
  estimatedRemainingTimeMs: number;
  
  // Current best result
  currentBest: BacktestRunResult | null;
  
  // Performance over time
  progressHistory: Array<{
    timestamp: number;
    completedRuns: number;
    bestReturn: number;
    averageReturn: number;
  }>;
}

/**
 * BacktestRunner class for parameter optimization
 * 
 * Orchestrates multiple backtest runs across parameter grids to find optimal strategy settings.
 * Supports parallel execution, progress reporting, and comprehensive result analysis.
 */
export class BacktestRunner {
  private config: OptimizationConfig;
  private strategyDefinition: StrategyDefinition;
  private historicalData: BacktestBarData[];
  private dataSource?: DataSource;
  private indicatorService: IndicatorService;
  private progress: OptimizationProgress;
  private isRunning = false;
  private abortController?: AbortController;

  constructor(
    strategyDefinition: StrategyDefinition,
    historicalData: BacktestBarData[],
    config: OptimizationConfig = {}
  ) {
    this.strategyDefinition = strategyDefinition;
    this.historicalData = historicalData;
    this.indicatorService = new IndicatorService();
    
    // Set default configuration
    this.config = {
      maxConcurrency: 4,
      timeoutMs: 30000,
      retryFailedRuns: true,
      maxRetries: 2,
      minTrades: 10,
      rankBy: 'sharpeRatio',
      saveTopNResults: 50,
      generateReport: true,
      ...config
    };

    this.progress = this.initializeProgress();
  }

  /**
   * Generate parameter combinations from specifications
   */
  public generateParameterGrid(parameterSpecs: ParameterSpec[]): ParameterCombination[] {
    const combinations: ParameterCombination[] = [];
    
    // Generate all possible parameter values
    const parameterValues = parameterSpecs.map(spec => {
      if (spec.values) {
        return { name: spec.name, values: spec.values };
      }
      
      if (spec.type === 'number' && spec.min !== undefined && spec.max !== undefined && spec.step !== undefined) {
        const values: number[] = [];
        for (let value = spec.min; value <= spec.max; value += spec.step) {
          values.push(Math.round(value * 100) / 100); // Round to 2 decimal places
        }
        return { name: spec.name, values };
      }
      
      throw new Error(`Invalid parameter specification for ${spec.name}`);
    });
    
    // Generate cartesian product
    const generateCombinations = (index: number, current: Record<string, unknown>): void => {
      if (index === parameterValues.length) {
        const id = this.generateCombinationId(current);
        combinations.push({ id, parameters: { ...current } });
        return;
      }
      
      const param = parameterValues[index];
      if (!param) return;
      for (const value of param.values) {
        current[param.name] = value;
        generateCombinations(index + 1, current);
      }
    };
    
    generateCombinations(0, {});
    return combinations;
  }

  /**
   * Run optimization with given parameter combinations
   */
  public async runOptimization(
    parameterCombinations: ParameterCombination[]
  ): Promise<OptimizationResults> {
    if (this.isRunning) {
      throw new Error('Optimization is already running');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      // Initialize progress
      this.progress = this.initializeProgress();
      this.progress.totalRuns = parameterCombinations.length;

      // Initialize results array
      const results: BacktestRunResult[] = parameterCombinations.map(combo => ({
        id: combo.id,
        parameters: combo.parameters,
        results: {} as BacktestResults,
        performance: {} as PerformanceMetrics,
        executionTime: 0,
        status: 'pending',
        strategyMetrics: {},
        computedMetrics: {} as any,
      }));

      // Execute backtests with concurrency control
      await this.executeConcurrentBacktests(results);

      // Filter and rank results
      const validResults = results.filter(r => r.status === 'completed');
      const rankedResults = this.rankResults(validResults);

      // Generate analysis
      const analysis = this.analyzeResults(rankedResults, parameterCombinations[0] ? Object.keys(parameterCombinations[0].parameters) : []);

      const optimizationResults: OptimizationResults = {
        totalRuns: results.length,
        completedRuns: validResults.length,
        failedRuns: results.filter(r => r.status === 'failed').length,
        executionTimeMs: Date.now() - startTime,
        bestResult: rankedResults[0] || null,
        topResults: rankedResults.slice(0, this.config.saveTopNResults || 50),
        allResults: this.config.saveIndividualResults ? results : undefined,
        parameterAnalysis: analysis.parameterAnalysis,
        statistics: analysis.statistics,
        recommendations: analysis.recommendations,
      };

      return optimizationResults;

    } finally {
      this.isRunning = false;
      this.abortController = undefined;
    }
  }

  /**
   * Execute backtests with controlled concurrency
   */
  private async executeConcurrentBacktests(results: BacktestRunResult[]): Promise<void> {
    const concurrency = this.config.maxConcurrency || 4;
    const semaphore = new Array(concurrency).fill(null);
    
    const executeRun = async (result: BacktestRunResult): Promise<void> => {
      if (this.abortController?.signal.aborted) {
        result.status = 'failed';
        result.error = 'Optimization aborted';
        return;
      }

      result.status = 'running';
      this.progress.runningRuns++;
      this.progress.pendingRuns--;

      const startTime = Date.now();

      try {
        // Create isolated backtest engine
        const engine = new BacktestEngine(100000); // Default initial balance
        const adapter = new BacktestEngineAdapter(engine);
        
        // Load data
        adapter.loadData([...this.historicalData]); // Copy array to avoid mutations
        
        // Register strategy with parameters
        const strategyConfig: StrategyConfig = {
          ...this.strategyDefinition.defaultConfig,
          ...result.parameters
        };
        
        adapter.registerStrategy(this.strategyDefinition, strategyConfig);
        
        // Run backtest
        await adapter.start();
        
        // Process all bars
        while (adapter.getBacktestEngine().isActive()) {
          const bar = adapter.processNextBar();
          if (!bar) break;
          
          // Execute strategies
          adapter.getBacktestEngine().executeStrategies(this.indicatorService);
          
          // Check for abort
          if (this.abortController?.signal.aborted) {
            throw new Error('Optimization aborted');
          }
        }
        
        // Extract results
        const engineState = adapter.getBacktestEngine().getState();
        result.results = this.extractBacktestResults(engineState);
        result.performance = this.calculatePerformanceMetrics(result.results, engineState);
        result.computedMetrics = this.calculateComputedMetrics(result.performance);
        result.status = 'completed';
        result.executionTime = Date.now() - startTime;

        // Update progress
        this.progress.completedRuns++;
        this.progress.runningRuns--;
        
        if (!this.progress.currentBest || this.isResultBetter(result, this.progress.currentBest)) {
          this.progress.currentBest = result;
        }

        // Call progress callback
        if (this.config.onProgress) {
          this.config.onProgress(this.progress.completedRuns, this.progress.totalRuns, result);
        }

        if (this.config.onRunCompleted) {
          this.config.onRunCompleted(result);
        }

      } catch (error) {
        result.status = 'failed';
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.executionTime = Date.now() - startTime;
        
        this.progress.failedRuns++;
        this.progress.runningRuns--;

        if (this.config.onError) {
          this.config.onError(error as Error, result.id);
        }

        // Retry logic
        if (this.config.retryFailedRuns && (result.executionTime < (this.config.timeoutMs || 30000))) {
          // Could implement retry logic here
        }
      }
    };

    // Process all results with concurrency control
    const promises: Promise<void>[] = [];
    
    for (const result of results) {
      const promise = new Promise<void>((resolve) => {
        const tryExecute = async () => {
          await executeRun(result);
          resolve();
        };
        tryExecute();
      });
      
      promises.push(promise);
      
      // Control concurrency
      if (promises.length >= concurrency) {
        await Promise.race(promises);
        // Remove completed promises
        for (let i = promises.length - 1; i >= 0; i--) {
          if (results[i].status !== 'running') {
            promises.splice(i, 1);
          }
        }
      }
    }

    // Wait for all remaining promises
    await Promise.all(promises);
  }

  /**
   * Rank results based on configuration
   */
  private rankResults(results: BacktestRunResult[]): BacktestRunResult[] {
    // Filter based on criteria
    let filteredResults = results.filter(result => {
      if (this.config.minTrades && result.computedMetrics.totalTrades < this.config.minTrades) {
        return false;
      }
      
      if (this.config.minReturnPercent && result.performance.totalReturnPercent < this.config.minReturnPercent) {
        return false;
      }
      
      if (this.config.maxDrawdownPercent && result.performance.maxDrawdownPercent > this.config.maxDrawdownPercent) {
        return false;
      }
      
      return true;
    });

    // Sort based on ranking criteria
    filteredResults.sort((a, b) => {
      let scoreA: number, scoreB: number;
      
      if (this.config.customRankingFunction) {
        scoreA = this.config.customRankingFunction(a);
        scoreB = this.config.customRankingFunction(b);
      } else {
        switch (this.config.rankBy) {
          case 'totalReturn':
            scoreA = a.performance.totalReturn;
            scoreB = b.performance.totalReturn;
            break;
          case 'sharpeRatio':
            scoreA = a.performance.sharpeRatio;
            scoreB = b.performance.sharpeRatio;
            break;
          case 'calmarRatio':
            scoreA = a.performance.calmarRatio;
            scoreB = b.performance.calmarRatio;
            break;
          case 'profitFactor':
            scoreA = a.computedMetrics.profitFactor;
            scoreB = b.computedMetrics.profitFactor;
            break;
          default:
            scoreA = a.performance.sharpeRatio;
            scoreB = b.performance.sharpeRatio;
        }
      }
      
      return scoreB - scoreA; // Descending order (higher is better)
    });

    return filteredResults;
  }

  /**
   * Analyze results and generate insights
   */
  private analyzeResults(
    results: BacktestRunResult[], 
    parameterNames: string[]
  ): {
    parameterAnalysis: OptimizationResults['parameterAnalysis'];
    statistics: OptimizationResults['statistics'];
    recommendations: OptimizationResults['recommendations'];
  } {
    if (results.length === 0) {
      return {
        parameterAnalysis: {},
        statistics: {
          meanReturn: 0,
          medianReturn: 0,
          standardDeviation: 0,
          skewness: 0,
          kurtosis: 0,
          returnDistribution: { min: 0, max: 0, quartiles: [0, 0, 0] }
        },
        recommendations: {
          bestParameters: {},
          stabilityConcerns: ['No valid results to analyze'],
          overoptimizationWarnings: []
        }
      };
    }

    // Parameter analysis
    const parameterAnalysis: OptimizationResults['parameterAnalysis'] = {};
    
    for (const paramName of parameterNames) {
      const valuePerformance = new Map<unknown, number[]>();
      
      for (const result of results) {
        const value = result.parameters[paramName];
        const performance = result.performance.totalReturnPercent;
        
        if (!valuePerformance.has(value)) {
          valuePerformance.set(value, []);
        }
        valuePerformance.get(value)!.push(performance);
      }
      
      // Calculate averages and find best/worst
      const averagePerformance: Record<string, number> = {};
      let bestValue: unknown = null;
      let worstValue: unknown = null;
      let bestPerformance = -Infinity;
      let worstPerformance = Infinity;
      
      for (const [value, performances] of valuePerformance) {
        const avg = performances.reduce((sum, p) => sum + p, 0) / performances.length;
        averagePerformance[String(value)] = avg;
        
        if (avg > bestPerformance) {
          bestPerformance = avg;
          bestValue = value;
        }
        
        if (avg < worstPerformance) {
          worstPerformance = avg;
          worstValue = value;
        }
      }
      
      // Calculate correlation (simplified)
      const correlation = this.calculateParameterCorrelation(results, paramName);
      
      parameterAnalysis[paramName] = {
        bestValue,
        worstValue,
        averagePerformance,
        correlation
      };
    }

    // Statistical analysis
    const returns = results.map(r => r.performance.totalReturnPercent);
    returns.sort((a, b) => a - b);
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const medianReturn = returns[Math.floor(returns.length / 2)] || 0;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Skewness and kurtosis (simplified calculations)
    const skewness = this.calculateSkewness(returns, meanReturn, standardDeviation);
    const kurtosis = this.calculateKurtosis(returns, meanReturn, standardDeviation);
    
    const statistics = {
      meanReturn,
      medianReturn,
      standardDeviation,
      skewness,
      kurtosis,
      returnDistribution: {
        min: returns[0] || 0,
        max: returns[returns.length - 1] || 0,
        quartiles: [
          returns[Math.floor(returns.length * 0.25)] || 0,
          returns[Math.floor(returns.length * 0.5)] || 0,
          returns[Math.floor(returns.length * 0.75)] || 0
        ] as [number, number, number]
      }
    };

    // Recommendations
    const bestParameters = results[0]?.parameters || {};
    const stabilityConcerns: string[] = [];
    const overoptimizationWarnings: string[] = [];
    
    // Check for stability concerns
    if (standardDeviation > meanReturn * 0.5) {
      stabilityConcerns.push('High variability in results suggests parameter sensitivity');
    }
    
    if (results.length > 100 && results[0].performance.totalReturnPercent > meanReturn + 2 * standardDeviation) {
      overoptimizationWarnings.push('Best result may be an outlier - consider robustness testing');
    }
    
    return {
      parameterAnalysis,
      statistics,
      recommendations: {
        bestParameters,
        stabilityConcerns,
        overoptimizationWarnings
      }
    };
  }

  /**
   * Calculate correlation between parameter and performance
   */
  private calculateParameterCorrelation(results: BacktestRunResult[], parameterName: string): number {
    const values: number[] = [];
    const performances: number[] = [];
    
    for (const result of results) {
      const paramValue = result.parameters[parameterName];
      if (typeof paramValue === 'number') {
        values.push(paramValue);
        performances.push(result.performance.totalReturnPercent);
      }
    }
    
    if (values.length < 2) return 0;
    
    const meanValue = values.reduce((sum, v) => sum + v, 0) / values.length;
    const meanPerf = performances.reduce((sum, p) => sum + p, 0) / performances.length;
    
    let numerator = 0;
    let denomValueSq = 0;
    let denomPerfSq = 0;
    
    for (let i = 0; i < values.length; i++) {
      const valueDiff = values[i] - meanValue;
      const perfDiff = performances[i] - meanPerf;
      
      numerator += valueDiff * perfDiff;
      denomValueSq += valueDiff * valueDiff;
      denomPerfSq += perfDiff * perfDiff;
    }
    
    const denominator = Math.sqrt(denomValueSq * denomPerfSq);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate skewness
   */
  private calculateSkewness(values: number[], mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    
    const sum = values.reduce((sum, value) => {
      return sum + Math.pow((value - mean) / stdDev, 3);
    }, 0);
    
    return sum / values.length;
  }

  /**
   * Calculate kurtosis
   */
  private calculateKurtosis(values: number[], mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    
    const sum = values.reduce((sum, value) => {
      return sum + Math.pow((value - mean) / stdDev, 4);
    }, 0);
    
    return (sum / values.length) - 3; // Excess kurtosis
  }

  /**
   * Helper methods for result processing
   */
  private initializeProgress(): OptimizationProgress {
    return {
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      runningRuns: 0,
      pendingRuns: 0,
      currentRun: null,
      elapsedTimeMs: 0,
      estimatedRemainingTimeMs: 0,
      currentBest: null,
      progressHistory: []
    };
  }

  private generateCombinationId(parameters: Record<string, unknown>): string {
    const keys = Object.keys(parameters).sort();
    const parts = keys.map(key => `${key}=${parameters[key]}`);
    return parts.join('_');
  }

  private isResultBetter(a: BacktestRunResult, b: BacktestRunResult): boolean {
    if (this.config.customRankingFunction) {
      return this.config.customRankingFunction(a) > this.config.customRankingFunction(b);
    }
    
    switch (this.config.rankBy) {
      case 'totalReturn':
        return a.performance.totalReturn > b.performance.totalReturn;
      case 'sharpeRatio':
        return a.performance.sharpeRatio > b.performance.sharpeRatio;
      case 'calmarRatio':
        return a.performance.calmarRatio > b.performance.calmarRatio;
      case 'profitFactor':
        return a.computedMetrics.profitFactor > b.computedMetrics.profitFactor;
      default:
        return a.performance.sharpeRatio > b.performance.sharpeRatio;
    }
  }

  private extractBacktestResults(engineState: any): BacktestResults {
    // Extract results from engine state
    // This would need to be implemented based on the actual BacktestResults interface
    return {
      totalReturn: engineState.accountBalance - engineState.initialBalance,
      totalReturnPercent: ((engineState.accountBalance - engineState.initialBalance) / engineState.initialBalance) * 100,
      totalTrades: engineState.trades.length,
      winningTrades: engineState.trades.filter((t: any) => (t.profitOrLoss || 0) > 0).length,
      losingTrades: engineState.trades.filter((t: any) => (t.profitOrLoss || 0) < 0).length,
      maxDrawdown: 0, // Would need proper calculation
      maxDrawdownPercent: 0,
      sharpeRatio: 0, // Would need proper calculation
      trades: engineState.trades
    } as BacktestResults;
  }

  private calculatePerformanceMetrics(results: BacktestResults, engineState: any): PerformanceMetrics {
    const totalReturn = results.totalReturn;
    const totalReturnPercent = results.totalReturnPercent;
    const totalTrades = results.totalTrades;
    const winningTrades = results.winningTrades;
    const losingTrades = results.losingTrades;
    
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const averageWin = winningTrades > 0 ? engineState.trades
      .filter((t: any) => (t.profitOrLoss || 0) > 0)
      .reduce((sum: number, t: any) => sum + (t.profitOrLoss || 0), 0) / winningTrades : 0;
    
    const averageLoss = losingTrades > 0 ? engineState.trades
      .filter((t: any) => (t.profitOrLoss || 0) < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.profitOrLoss || 0), 0) / losingTrades : 0;

    const profitFactor = averageLoss > 0 ? (averageWin * winningTrades) / (averageLoss * losingTrades) : 0;

    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn: totalReturnPercent, // Simplified
      volatility: 0, // Would need proper calculation
      sharpeRatio: 0, // Would need proper calculation
      maxDrawdown: results.maxDrawdown,
      maxDrawdownPercent: results.maxDrawdownPercent,
      calmarRatio: 0, // Would need proper calculation
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      averageWin,
      averageLoss,
      largestWin: 0, // Would need calculation
      largestLoss: 0, // Would need calculation
      profitFactor,
      valueAtRisk95: 0, // Would need calculation
      expectedShortfall: 0, // Would need calculation
      recoveryFactor: 0, // Would need calculation
      monthlyReturns: [], // Would need calculation
      positiveMonths: 0,
      negativeMonths: 0,
      consistencyScore: 0
    };
  }

  private calculateComputedMetrics(performance: PerformanceMetrics): BacktestRunResult['computedMetrics'] {
    return {
      sharpeRatio: performance.sharpeRatio,
      maxDrawdown: performance.maxDrawdown,
      calmarRatio: performance.calmarRatio,
      winRate: performance.winRate,
      averageWin: performance.averageWin,
      averageLoss: performance.averageLoss,
      profitFactor: performance.profitFactor,
      recoveryFactor: performance.recoveryFactor,
      totalTrades: performance.totalTrades
    };
  }

  /**
   * Abort running optimization
   */
  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Get current progress
   */
  public getProgress(): OptimizationProgress {
    return { ...this.progress };
  }

  /**
   * Check if optimization is running
   */
  public isOptimizationRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Helper function to create common parameter specifications
 */
export class ParameterSpecBuilder {
  static numberRange(name: string, min: number, max: number, step: number, description?: string): ParameterSpec {
    return { name, type: 'number', min, max, step, description };
  }

  static discreteValues(name: string, values: (number | boolean | string)[], description?: string): ParameterSpec {
    return { name, type: values[0] ? typeof values[0] as any : 'string', values, description };
  }

  static booleanChoice(name: string, description?: string): ParameterSpec {
    return { name, type: 'boolean', values: [true, false], description };
  }
}

export default BacktestRunner; 