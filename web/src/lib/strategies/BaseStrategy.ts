import {
  IStrategy,
  StrategyResult,
  BaseStrategyConfig
} from '../types/strategy';

import {
  BacktestBarData,
  SubBarData,
  StrategySignal,
  StrategySignalType,
  SimulatedTrade,
  Order,
  StrategyConfig,
  OrderStatus,
  OrderType,
  OrderSide,
  UTCTimestamp,
  BacktestResults,
  TradeType
} from '../types/backtester';
import { OrderManager } from '../OrderManager'; // Corrected path

/**
 * Abstract base class for trading strategies, providing common infrastructure for
 * configuration, state management, order handling (via an injected OrderManager),
 * trade tracking, and backtesting.
 *
 * Derived classes must implement the `processBar` method to define their core logic,
 * as well as `getName`, `getDescription`, and `getVersion`.
 *
 * Key responsibilities of BaseStrategy:
 * - Managing strategy configuration (`BaseStrategyConfig`).
 * - Interfacing with an `OrderManager` for order submission and state.
 * - Tracking conceptual trades (`SimulatedTrade`) and signals (`StrategySignal`).
 * - Providing hooks for customization (e.g., `onReset`, `onConfigUpdated`, `onOrderFilled`).
 * - Offering utility methods for common tasks (e.g., `calculatePositionSize`, `placeProtectiveOrders`).
 * - Storing and providing current values of strategy indicators.
 * - Basic backtesting loop and results calculation.
 *
 * P&L and final trade records are primarily sourced from the `OrderManager` to ensure
 * a single source of truth.
 */
export abstract class BaseStrategy implements IStrategy {
  // Configuration
  protected config: BaseStrategyConfig;

  // State tracking
  protected signals: StrategySignal[] = [];
  // protected trades: SimulatedTrade[] = []; // Removed, OrderManager.getCompletedTrades() is the source
  protected openTrade: SimulatedTrade | null = null;
  protected indicators: Record<string, number | Record<string, number>> = {};
  
  // Order management
  // Local order arrays are being removed as OrderManager will be the source of truth.
  // protected pendingOrders: Order[] = [];
  // protected filledOrders: Order[] = [];
  // protected cancelledOrders: Order[] = [];
  
  // Counter for generating unique IDs
  private nextOrderId = 1;
  private nextTradeId = 1;

  protected orderManager: OrderManager;

  /**
   * Constructs a new BaseStrategy instance.
   * @param orderManagerInstance An instance of `OrderManager` that this strategy will use
   *                             for all order submissions and to query order/trade states.
   * @param config Optional partial configuration for the strategy. Defaults will be
   *               applied for common parameters, and strategy-specific parameters
   *               should be handled by the derived class's `validateStrategySpecificConfig`.
   */
  constructor(orderManagerInstance: OrderManager, config?: Partial<BaseStrategyConfig>) {
    this.orderManager = orderManagerInstance;
    // Set default configuration values
    // Use name, description, version from the passed config object directly,
    // or fallback to calling the abstract methods if not provided in config.
    // The abstract methods should ideally return static default values.
    const initialName = config?.name ?? this.getName();
    const initialDescription = config?.description ?? this.getDescription();
    const initialVersion = config?.version ?? this.getVersion();

    this.config = {
      commission: 0,
      positionSize: 1,
      ...config, // Spread the incoming config first
      name: initialName, // Then ensure these are set, possibly overriding from ...config if they were there
      description: initialDescription,
      version: initialVersion,
    };
    
    // Validate the initial configuration
    this.validateConfig(this.config);
  }

  /**
   * Validates configuration parameters to ensure they meet requirements
   * @param config - Configuration to validate
   * @throws Error if configuration is invalid
   */
  protected validateConfig(config: BaseStrategyConfig): void {
    // Validate required fields
    if (!config.name) {
      throw new Error('Strategy configuration error: name is required');
    }
    
    if (!config.description) {
      throw new Error('Strategy configuration error: description is required');
    }
    
    if (!config.version) {
      throw new Error('Strategy configuration error: version is required');
    }
    
    // Validate numeric values
    if (typeof config.commission !== 'number') {
      throw new Error('Strategy configuration error: commission must be a number');
    }
    
    if (config.commission < 0) {
      throw new Error(`Strategy configuration error: commission must be >= 0, got ${config.commission}`);
    }
    
    if (typeof config.positionSize !== 'number') {
      throw new Error('Strategy configuration error: positionSize must be a number');
    }
    
    if (config.positionSize <= 0) {
      throw new Error(`Strategy configuration error: positionSize must be > 0, got ${config.positionSize}`);
    }
    
    // Validate optional numeric parameters if present
    if (config.stopLossPercent !== undefined) {
      if (typeof config.stopLossPercent !== 'number') {
        throw new Error('Strategy configuration error: stopLossPercent must be a number');
      }
      if (config.stopLossPercent <= 0) {
        throw new Error(`Strategy configuration error: stopLossPercent must be > 0, got ${config.stopLossPercent}`);
      }
    }
    
    if (config.stopLossTicks !== undefined) {
      if (typeof config.stopLossTicks !== 'number') {
        throw new Error('Strategy configuration error: stopLossTicks must be a number');
      }
      if (config.stopLossTicks <= 0) {
        throw new Error(`Strategy configuration error: stopLossTicks must be > 0, got ${config.stopLossTicks}`);
      }
    }
    
    if (config.takeProfitPercent !== undefined) {
      if (typeof config.takeProfitPercent !== 'number') {
        throw new Error('Strategy configuration error: takeProfitPercent must be a number');
      }
      if (config.takeProfitPercent <= 0) {
        throw new Error(`Strategy configuration error: takeProfitPercent must be > 0, got ${config.takeProfitPercent}`);
      }
    }
    
    if (config.takeProfitTicks !== undefined) {
      if (typeof config.takeProfitTicks !== 'number') {
        throw new Error('Strategy configuration error: takeProfitTicks must be a number');
      }
      if (config.takeProfitTicks <= 0) {
        throw new Error(`Strategy configuration error: takeProfitTicks must be > 0, got ${config.takeProfitTicks}`);
      }
    }
    
    if (config.limitOrderOffset !== undefined) {
      if (typeof config.limitOrderOffset !== 'number') {
        throw new Error('Strategy configuration error: limitOrderOffset must be a number');
      }
    }
    
    if (config.orderTimeoutBars !== undefined) {
      if (typeof config.orderTimeoutBars !== 'number') {
        throw new Error('Strategy configuration error: orderTimeoutBars must be a number');
      }
      if (config.orderTimeoutBars < 0) {
        throw new Error(`Strategy configuration error: orderTimeoutBars must be >= 0, got ${config.orderTimeoutBars}`);
      }
    }
    
    // Validate boolean parameters if present
    if (config.useMarketOrders !== undefined && typeof config.useMarketOrders !== 'boolean') {
      throw new Error('Strategy configuration error: useMarketOrders must be a boolean');
    }
    
    // Strategy-specific validation can be implemented in derived classes
    this.validateStrategySpecificConfig(config);
  }
  
  /**
   * Hook for strategy-specific configuration validation
   * Override this method in derived classes to add custom validation rules
   * @param config - Configuration to validate
   */
  protected validateStrategySpecificConfig(config: BaseStrategyConfig): void {
    // Default implementation does nothing
    // Derived classes should override to add specific validation
  }

  /**
   * Reset strategy state to initial conditions
   */
  reset(): void {
    this.signals = [];
    // this.trades = []; // Removed
    this.openTrade = null;
    this.indicators = {}; // Clears all indicator values
    // this.pendingOrders = []; // Removed
    // this.filledOrders = []; // Removed
    // this.cancelledOrders = []; // Removed
    this.nextOrderId = 1;
    this.nextTradeId = 1;
    
    // Call strategy-specific reset implementation
    this.onReset();
  }

  /**
   * Hook for strategy-specific reset logic
   * Override this method in derived classes to reset strategy-specific state
   */
  protected onReset(): void {
    // Default implementation does nothing
  }

  /**
   * Process a single bar and generate trading signals/actions
   * This is the main method that strategies must implement
   */
  abstract processBar(
    mainBar: BacktestBarData,
    subBars: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> | StrategyResult;

  /**
   * Get all completed trades.
   * Retrieves trade records from the OrderManager, which is the source of truth for
   * finalized P&L and trade details.
   * @returns An array of `SimulatedTrade` objects.
   */
  getTrades(): SimulatedTrade[] {
    // OrderManager is now the source of truth for completed trades with P&L
    return this.orderManager.getCompletedTrades();
  }

  /**
   * Get the currently open conceptual trade being managed by the strategy.
   * Note: The authoritative position state resides within the OrderManager.
   * @returns The open `SimulatedTrade` object or `null` if no trade is open.
   */
  getOpenTrade(): SimulatedTrade | null {
    return this.openTrade;
  }

  /**
   * Get all signals generated and recorded by the strategy.
   * @returns An array of `StrategySignal` objects.
   */
  getSignals(): StrategySignal[] {
    return this.signals;
  }

  /**
   * Get current values of all indicators tracked by the strategy.
   * Values are updated by derived strategies calling `updateIndicatorValue`.
   * @returns A record of indicator names to their current values, or `null` if no indicators.
   */
  getCurrentIndicators(): Record<string, number | Record<string, number>> | null {
    return Object.keys(this.indicators).length > 0 ? { ...this.indicators } : null;
  }

  /**
   * Protected method for derived strategies to update the value of a specific indicator.
   * This allows BaseStrategy to store and provide current indicator values without
   * needing to manage the indicator objects themselves.
   * @param name - The name of the indicator.
   * @param value - The new value of the indicator (can be a single number or a record for multi-value indicators).
   */
  protected updateIndicatorValue(name: string, value: number | Record<string, number>): void {
    this.indicators[name] = value;
  }

  /**
   * Get all pending orders from the OrderManager.
   * @param contractId - Optional contract ID to filter orders.
   * @returns An array of pending `Order` objects.
   */
  getPendingOrders(contractId?: string): Order[] {
    return this.orderManager.getPendingOrders(contractId);
  }

  /**
   * Get all filled orders from the OrderManager.
   * @param contractId - Optional contract ID to filter orders.
   * @returns An array of filled `Order` objects.
   */
  getFilledOrders(contractId?: string): Order[] {
    return this.orderManager.getFilledOrders(contractId);
  }

  /**
   * Get all cancelled orders from the OrderManager.
   * @param contractId - Optional contract ID to filter orders.
   * @returns An array of cancelled `Order` objects.
   */
  getCancelledOrders(contractId?: string): Order[] {
    return this.orderManager.getCancelledOrders(contractId);
  }

  /**
   * Update strategy configuration
   * @param config - Partial configuration to merge with current config
   * @throws Error if resulting configuration is invalid
   */
  updateConfig(config: Partial<StrategyConfig>): void {
    // Store the previous configuration for comparison
    const previousConfig = { ...this.config };
    
    // Create the new configuration by merging
    const newConfig = {
      ...this.config,
      ...config
    };
    
    // Validate the new configuration
    this.validateConfig(newConfig as BaseStrategyConfig);
    
    // Apply the validated configuration
    this.config = newConfig as BaseStrategyConfig;
    
    // Calculate what changed for the hook
    const changedKeys = Object.keys(config);
    
    // Allow derived classes to react to configuration changes
    this.onConfigUpdated(changedKeys, previousConfig);
  }

  /**
   * Hook for strategy-specific configuration update logic
   * Override this method in derived classes to handle configuration changes
   * @param changedKeys - Array of keys that were updated
   * @param previousConfig - Previous configuration before update
   */
  protected onConfigUpdated(changedKeys: string[] = [], previousConfig: BaseStrategyConfig = {} as BaseStrategyConfig): void {
    // Default implementation does nothing
  }

  /**
   * Get current strategy configuration
   */
  getConfig(): StrategyConfig {
    return this.config;
  }

  /**
   * Get strategy name - abstract method that must be implemented by subclasses
   */
  abstract getName(): string;

  /**
   * Get strategy description - abstract method that must be implemented by subclasses
   */
  abstract getDescription(): string;

  /**
   * Get strategy version - abstract method that must be implemented by subclasses
   */
  abstract getVersion(): string;

  /**
   * Run a complete backtest on historical data
   * Default implementation processes bars sequentially
   */
  backtest(mainBars: BacktestBarData[], subBars?: SubBarData[]): BacktestResults {
    // Reset strategy state before starting backtest
    this.reset();
    
    // Map to organize sub-bars by parent bar index if provided
    const subBarsByParentIndex: Map<number, SubBarData[]> = new Map();
    
    if (subBars && subBars.length > 0) {
      // Group sub-bars by parent bar index
      subBars.forEach(subBar => {
        const parentIndex = subBar.parentBarIndex;
        if (!subBarsByParentIndex.has(parentIndex)) {
          subBarsByParentIndex.set(parentIndex, []);
        }
        subBarsByParentIndex.get(parentIndex)?.push(subBar);
      });
    }
    
    // Process each bar in sequence
    for (let i = 0; i < mainBars.length; i++) {
      const currentSubBars = subBarsByParentIndex.get(i);
      this.processBar(mainBars[i], currentSubBars, i, mainBars);
    }
    
    // Calculate backtest results
    return this.calculateBacktestResults();
  }

  /**
   * Gets the current backtest results based on the trades processed so far
   * by the associated OrderManager, without re-running the backtest.
   * @returns A `BacktestResults` object.
   */
  public getCurrentBacktestResults(): BacktestResults {
    return this.calculateBacktestResults();
  }

  /**
   * Calculate backtest performance metrics based on trades from OrderManager.
   * Metrics include total P&L, win rate, total trades, max drawdown, and profit factor.
   * @returns A `BacktestResults` object.
   */
  protected calculateBacktestResults(): BacktestResults {
    const closedTrades = this.orderManager.getCompletedTrades().filter(trade => trade.status === 'CLOSED');
    
    if (closedTrades.length === 0) {
      return {
        totalProfitOrLoss: 0,
        winRate: 0,
        totalTrades: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        trades: [],
        averageWin: 0,
        averageLoss: 0,
        averageTrade: 0,
        sharpeRatio: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        averageTradeDuration: 0,
        returnOnMaxDrawdown: 0,
        winningTrades: 0,
        losingTrades: 0,
        largestWin: 0,
        largestLoss: 0,
        expectancy: 0,
        kellyPercentage: 0
      };
    }
    
    // Separate winning and losing trades
    const winningTrades = closedTrades.filter(trade => (trade.profitOrLoss || 0) > 0);
    const losingTrades = closedTrades.filter(trade => (trade.profitOrLoss || 0) < 0);
    
    // Calculate total profit/loss
    const totalProfitOrLoss = closedTrades.reduce(
      (sum, trade) => sum + (trade.profitOrLoss || 0),
      0
    );
    
    // Calculate win rate
    const winRate = (winningTrades.length / closedTrades.length) * 100;
    
    // Calculate average trade metrics
    const totalWinnings = winningTrades.reduce(
      (sum, trade) => sum + (trade.profitOrLoss || 0),
      0
    );
    
    const totalLosses = Math.abs(losingTrades.reduce(
      (sum, trade) => sum + (trade.profitOrLoss || 0),
      0
    ));
    
    const averageWin = winningTrades.length > 0 ? totalWinnings / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    const averageTrade = totalProfitOrLoss / closedTrades.length;
    
    // Calculate profit factor
    const profitFactor = totalLosses > 0 ? totalWinnings / totalLosses : totalWinnings > 0 ? Infinity : 0;
    
    // Calculate max drawdown and equity curve for advanced metrics
    let maxDrawdown = 0;
    let peak = 0;
    let runningTotal = 0;
    const returns: number[] = [];
    let previousEquity = 0;
    
    closedTrades.forEach(trade => {
      runningTotal += (trade.profitOrLoss || 0);
      
      // Calculate return as percentage change in equity
      if (previousEquity !== 0) {
        const returnPct = (runningTotal - previousEquity) / Math.abs(previousEquity);
        returns.push(returnPct);
      } else if (runningTotal !== 0) {
        // First trade return calculation
        const firstTradeAbs = Math.abs(trade.profitOrLoss || 1);
        returns.push((trade.profitOrLoss || 0) / firstTradeAbs);
      }
      previousEquity = runningTotal;
      
      // Update peak and calculate drawdown
      if (runningTotal > peak) {
        peak = runningTotal;
      }
      const drawdown = peak - runningTotal;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });
    
    // Calculate Sharpe ratio (simplified version)
    let sharpeRatio = 0;
    if (returns.length > 1) {
      const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      
      if (stdDev > 0) {
        // Simplified annualized Sharpe ratio
        const annualizedReturn = meanReturn * Math.sqrt(252); // Assuming daily-like frequency
        const annualizedStdDev = stdDev * Math.sqrt(252);
        sharpeRatio = annualizedReturn / annualizedStdDev;
      }
    }
    
    // Calculate consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    
    closedTrades.forEach(trade => {
      const pnl = trade.profitOrLoss || 0;
      if (pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else if (pnl < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      } else {
        currentWinStreak = 0;
        currentLossStreak = 0;
      }
    });
    
    // Calculate average trade duration (in minutes)
    let averageTradeDuration = 0;
    const tradesWithDuration = closedTrades.filter(trade => trade.entryTime && trade.exitTime);
    if (tradesWithDuration.length > 0) {
      const totalDuration = tradesWithDuration.reduce((sum, trade) => {
        const durationSeconds = (trade.exitTime! - trade.entryTime!);
        return sum + (durationSeconds / 60); // Convert to minutes
      }, 0);
      averageTradeDuration = totalDuration / tradesWithDuration.length;
    }
    
    // Calculate return on max drawdown
    const returnOnMaxDrawdown = maxDrawdown > 0 ? (totalProfitOrLoss / maxDrawdown) : 0;
    
    // Find largest win and loss
    const largestWin = winningTrades.length > 0 
      ? Math.max(...winningTrades.map(t => t.profitOrLoss || 0))
      : 0;
    const largestLoss = losingTrades.length > 0 
      ? Math.min(...losingTrades.map(t => t.profitOrLoss || 0))
      : 0;
    
    // Calculate expectancy (average expected value per trade)
    const winProbability = winningTrades.length / closedTrades.length;
    const loseProbability = losingTrades.length / closedTrades.length;
    const expectancy = (winProbability * averageWin) - (loseProbability * averageLoss);
    
    // Calculate Kelly percentage (optimal bet size)
    let kellyPercentage = 0;
    if (averageLoss > 0) {
      const winLossRatio = averageWin / averageLoss;
      kellyPercentage = ((winLossRatio * winProbability) - loseProbability) / winLossRatio;
      kellyPercentage = Math.max(0, Math.min(1, kellyPercentage)); // Clamp between 0 and 1
    }
    
    return {
      totalProfitOrLoss,
      winRate,
      totalTrades: closedTrades.length,
      maxDrawdown,
      profitFactor,
      trades: [...closedTrades],
      averageWin,
      averageLoss,
      averageTrade,
      sharpeRatio,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      averageTradeDuration,
      returnOnMaxDrawdown,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      largestWin,
      largestLoss,
      expectancy,
      kellyPercentage
    };
  }

  /**
   * Create a new market order
   * @param side - Buy or sell
   * @param quantity - Number of contracts/shares
   * @param bar - Current price bar
   * @param tradeId - Optional trade ID to associate with this order
   * @param contractId - Optional contract ID
   * @param isEntry - Whether this is an entry order (triggers protective orders when filled)
   * @param isExit - Whether this is an exit order
   * @returns The created order
   */
  protected createMarketOrder(
    side: OrderSide,
    quantity: number,
    bar: BacktestBarData,
    tradeId?: string,
    contractId?: string,
    isEntry: boolean = false,
    isExit: boolean = false
  ): Order {
    const order: Partial<Order> = { // Use Partial<Order> as submitOrder in OM takes Partial
      id: this.generateOrderId(), // BaseStrategy still generates ID for its conceptual order
      type: OrderType.MARKET,
      side,
      quantity,
      price: bar.close, // Set expected market price for display and OrderManager logic
      status: OrderStatus.PENDING,
      submittedTime: bar.time,
      parentTradeId: tradeId, // Changed from tradeId to parentTradeId
      contractId,
      isEntry,
      isExit,
      message: isEntry ? "Market entry order created" : isExit ? "Market exit order created" : "Market order created"
    };
    
    // this.pendingOrders.push(order); // OrderManager now handles this
    return this.orderManager.submitOrder(order);
  }

  /**
   * Create a new limit order
   * @param side - Buy or sell
   * @param quantity - Number of contracts/shares
   * @param price - Limit price
   * @param bar - Current price bar
   * @param tradeId - Optional trade ID to associate with this order
   * @param contractId - Optional contract ID
   * @param isEntry - Whether this is an entry order (triggers protective orders when filled)
   * @param isExit - Whether this is an exit order
   * @returns The created order
   */
  protected createLimitOrder(
    side: OrderSide,
    quantity: number,
    price: number,
    bar: BacktestBarData,
    tradeId?: string,
    contractId?: string,
    isEntry: boolean = false,
    isExit: boolean = false
  ): Order {
    const order: Partial<Order> = {
      id: this.generateOrderId(),
      type: OrderType.LIMIT,
      side,
      quantity,
      price,
      status: OrderStatus.PENDING,
      submittedTime: bar.time,
      parentTradeId: tradeId, // Changed from tradeId to parentTradeId
      contractId,
      isEntry,
      isExit,
      message: isEntry ? "Limit entry order created" : isExit ? "Limit exit order created" : "Limit order created"
    };
    
    // this.pendingOrders.push(order); // OrderManager now handles this
    return this.orderManager.submitOrder(order);
  }

  /**
   * Create a new stop order
   * @param side - Buy or sell
   * @param quantity - Number of contracts/shares
   * @param stopPrice - Stop price to trigger order
   * @param bar - Current price bar
   * @param tradeId - Optional trade ID to associate with this order
   * @param contractId - Optional contract ID
   * @param isStopLoss - Whether this is a stop loss order
   * @returns The created order
   */
  protected createStopOrder(
    side: OrderSide,
    quantity: number,
    stopPrice: number,
    bar: BacktestBarData,
    tradeId?: string,
    contractId?: string,
    isStopLoss: boolean = false
  ): Order {
    const order: Partial<Order> = {
      id: this.generateOrderId(),
      type: OrderType.STOP,
      side,
      quantity,
      stopPrice,
      status: OrderStatus.PENDING,
      submittedTime: bar.time,
      parentTradeId: tradeId, // Changed from tradeId to parentTradeId
      contractId,
      isStopLoss,
      message: isStopLoss ? "Stop loss order created" : "Stop order created"
    };
    
    // this.pendingOrders.push(order); // OrderManager now handles this
    return this.orderManager.submitOrder(order);
  }

  /**
   * Create a new take profit order (limit order)
   * @param side - Buy or sell
   * @param quantity - Number of contracts/shares
   * @param price - Take profit price
   * @param bar - Current price bar
   * @param tradeId - Optional trade ID to associate with this order
   * @param contractId - Optional contract ID
   * @returns The created order
   */
  protected createTakeProfitOrder(
    side: OrderSide,
    quantity: number,
    price: number,
    bar: BacktestBarData,
    tradeId?: string,
    contractId?: string
  ): Order {
    const order: Partial<Order> = {
      id: this.generateOrderId(),
      type: OrderType.LIMIT,
      side,
      quantity,
      price,
      status: OrderStatus.PENDING,
      submittedTime: bar.time,
      parentTradeId: tradeId, // Changed from tradeId to parentTradeId
      contractId,
      isTakeProfit: true,
      message: "Take profit order created"
    };
    
    // this.pendingOrders.push(order); // OrderManager now handles this
    return this.orderManager.submitOrder(order);
  }

  /**
   * Mark an order as filled
   * @param order - The order to fill
   * @param fillPrice - Price at which the order was filled
   * @param fillTime - Time when the order was filled
   * @returns The filled order
   */
  protected fillOrder(
    order: Order,
    fillPrice: number,
    fillTime: UTCTimestamp
  ): Order {
    // This method's role changes. It might now be called by the strategy
    // after OrderManager reports a fill, to update BaseStrategy's internal
    // concept of filled orders if still needed, or it might be deprecated.
    // This method's role is significantly reduced or potentially deprecated now that
    // OrderManager is the source of truth for order states and BaseStrategy's
    // getFilledOrders() proxies to OrderManager.
    // A strategy's processBar should react to fills returned by orderManager.processBar().
    // This method might only be relevant if BaseStrategy needs to perform some specific
    // action upon receiving confirmation of a fill that OrderManager itself doesn't handle
    // in the context of the strategy's conceptual trades (e.g. updating this.openTrade).

    // For now, let's simplify its body. If derived strategies need to react to a fill,
    // they should do so based on the output of orderManager.processBar().
    // The `order` parameter here would be the order object *as known by the strategy*
    // before it was processed and potentially filled by OrderManager.
    // The actual filled order details should come from OrderManager.

    // console.warn("[BaseStrategy.fillOrder] This method's utility should be re-evaluated. OrderManager handles fills.");

    // Update the passed-in order object if it's a direct reference used by the strategy.
    // However, the canonical filled order is in OrderManager.
    order.filledPrice = fillPrice;
    order.filledTime = fillTime;
    order.filledQuantity = order.quantity;
    order.message = "Order filled";
    
    // Calculate commission if configured
    if (this.config.commission) {
      order.commission = fillPrice * order.quantity * this.config.commission / 100;
    }
    
    // Add to filled orders
    // this.filledOrders.push(order); // Removed as OM is source of truth
    return order; // Return the (potentially updated) order reference
  }

  /**
   * Cancel an order via the OrderManager.
   * @param orderId - The ID of the order to cancel.
   * @param reason - Reason for cancellation (optional, OrderManager might handle messaging).
   * @returns True if cancellation was accepted by OrderManager, false otherwise.
   */
  protected cancelOrder(orderId: string, reason?: string): boolean {
    // BaseStrategy no longer manages its own pending/cancelled lists directly for this.
    // It relies on OrderManager.
    return this.orderManager.cancelOrder(orderId);
    // If a strategy needs to react to a cancellation, it should check the status
    // of orders obtained from orderManager.get[Pending/Cancelled]Orders() or results from orderManager.processBar().
  }

  /**
   * Create a new trade
   * @param type - Buy or sell
   * @param entryPrice - Entry price
   * @param size - Position size
   * @param entryTime - Entry time
   * @param entryOrder - Order that opened the trade
   * @param entrySignal - Signal that triggered the entry
   * @returns The created trade
   */
  protected createTrade(
    type: TradeType,
    initialEntryPriceGuess: number, // e.g., bar.close for market, or order.price for limit
    size: number,
    entryTime: UTCTimestamp,
    entryOrder?: Order, // The order that, when filled, will open this trade
    entrySignal?: StrategySignal
  ): SimulatedTrade {
    let actualEntryPrice = initialEntryPriceGuess;
    // If an entryOrder is provided and it's a LIMIT order with a price,
    // that's a better initial guess for the conceptual trade's entry price.
    // The final entry price will be set by the fill.
    if (entryOrder && entryOrder.type === OrderType.LIMIT && typeof entryOrder.price === 'number') {
      actualEntryPrice = entryOrder.price;
    }

    const trade: SimulatedTrade = {
      id: this.generateTradeId(),
      entryTime,
      entryPrice: actualEntryPrice,
      type,
      size,
      status: 'OPEN',
      entryOrder,
      signalEntry: entrySignal
    };
    
    // Store as open trade
    this.openTrade = trade;
    
    return trade;
  }

  /**
   * Close an existing trade
   * @param trade - The trade to close
   * @param exitPrice - Exit price
   * @param exitTime - Exit time
   * @param exitOrder - Order that closed the trade
   * @param exitSignal - Signal that triggered the exit
   * @param exitReason - Reason for closing the trade
   * @returns The closed trade
   */
  protected closeTrade(
    trade: SimulatedTrade,
    exitPrice: number,
    exitTime: UTCTimestamp,
    exitOrder?: Order,
    exitSignal?: StrategySignal,
    exitReason?: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'REVERSAL_EXIT'
  ): SimulatedTrade {
    // Update trade details
    trade.exitPrice = exitPrice;
    trade.exitTime = exitTime;
    trade.status = 'CLOSED';
    trade.exitOrder = exitOrder;
    trade.signalExit = exitSignal;
    trade.exitReason = exitReason;

    // P&L is now handled by OrderManager. BaseStrategy's SimulatedTrade
    // should reflect the P&L from the corresponding trade record in OrderManager.
    // This method's responsibility shifts to primarily managing the strategy's
    // concept of an open trade and associating exit orders/signals.

    // Find the completed trade record from OrderManager to get the authoritative P&L
    const completedTradeFromOM = this.orderManager.getCompletedTrades().find(t => t.id === trade.id || (t.exitOrder && exitOrder && t.exitOrder.id === exitOrder.id));
    
    if (completedTradeFromOM) {
      trade.profitOrLoss = completedTradeFromOM.profitOrLoss;
      trade.commission = completedTradeFromOM.commission; // Ensure commission is also sourced from OM's record
    } else {
      // Fallback or error: If OM doesn't have this trade, P&L might be missing or stale.
      // For now, we'll clear it to indicate it should come from OM.
      // This situation implies a mismatch that needs debugging in how trades are correlated.
      console.warn(`[BaseStrategy.closeTrade] Could not find completed trade ${trade.id} in OrderManager. P&L might be inaccurate.`);
      trade.profitOrLoss = undefined; // Or 0, or handle as an error
    }
        
    // If this is the currently open trade, clear it
    if (this.openTrade && this.openTrade.id === trade.id) {
      this.openTrade = null;
    }
    
    // BaseStrategy no longer maintains its own primary list of completed trades.    
    return trade;
  }

  /**
   * Hook called when an order submitted by this strategy is filled.
   * Derived strategies can override this to implement logic that should occur
   * immediately after an entry order is filled, such as placing stop-loss or
   * take-profit orders.
   * @param filledOrder - The order that was filled.
   * @param currentConceptualTrade - The strategy's current conceptual open trade, if any.
   */
  protected onOrderFilled(filledOrder: Order, currentConceptualTrade?: SimulatedTrade): void {
    console.log(`[BaseStrategy.onOrderFilled] Processing filled order:`, {
      orderId: filledOrder.id,
      isEntry: filledOrder.isEntry,
      isExit: filledOrder.isExit,
      isStopLoss: filledOrder.isStopLoss,
      isTakeProfit: filledOrder.isTakeProfit,
      side: filledOrder.side,
      quantity: filledOrder.quantity,
      filledPrice: filledOrder.filledPrice,
      currentTradeId: currentConceptualTrade?.id,
      currentTradeStatus: currentConceptualTrade?.status,
      entryOrderId: currentConceptualTrade?.entryOrder?.id
    });

    // Scenario 1: The filled order is the designated entry for the current conceptual trade.
    // Place protective orders.
    if (currentConceptualTrade && currentConceptualTrade.status === 'OPEN' &&
        currentConceptualTrade.entryOrder?.id === filledOrder.id &&
        filledOrder.isEntry === true) { // Explicitly check the isEntry flag

        console.log(`[BaseStrategy.onOrderFilled] ✅ Entry fill detected for conceptual trade ${currentConceptualTrade.id}. Placing protective orders.`);
        this.placeProtectiveOrders(currentConceptualTrade, filledOrder);
    }
    // Scenario 2: The filled order is an exit for the current conceptual trade.
    // Close the conceptual trade.
    else if (currentConceptualTrade && currentConceptualTrade.status === 'OPEN' &&
             (filledOrder.isExit === true || filledOrder.isStopLoss === true || filledOrder.isTakeProfit === true) && // Order flags indicate it's an exit
             filledOrder.parentTradeId === currentConceptualTrade.id) { // And it belongs to this conceptual trade

        console.log(`[BaseStrategy.onOrderFilled] Exit fill for conceptual trade ${currentConceptualTrade.id}. Closing conceptual trade.`);
        let exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SIGNAL' | 'MANUAL' | 'REVERSAL_EXIT' = 'SIGNAL'; // Default
        if (filledOrder.isStopLoss) {
            exitReason = 'STOP_LOSS';
        } else if (filledOrder.isTakeProfit) {
            exitReason = 'TAKE_PROFIT';
        } else if (filledOrder.message?.toLowerCase().includes('reversal: closing')) { // Heuristic for reversal's explicit close
            exitReason = 'REVERSAL_EXIT';
        }
        // If isExit is true but not SL/TP/Reversal, it's likely a strategy-signaled exit.
        // The original signal that led to this exit order might be in the strategy,
        // but the filledOrder itself is the direct cause of closing the trade here.

        this.closeTrade(
            currentConceptualTrade,
            filledOrder.filledPrice!, // Assume filledPrice is present on a filled order
            filledOrder.filledTime!,   // Assume filledTime is present on a filled order
            filledOrder,
            undefined, // No new strategy signal directly caused this SL/TP/ReversalClose fill
            exitReason
        );
    }
    // Other scenarios:
    // - Fill is for an order not related to currentConceptualTrade (e.g., orphaned, or OrderManager internal).
    // - currentConceptualTrade is null (no open conceptual trade from strategy's POV).
    // These are ignored by this default onOrderFilled. Derived strategies could add more logic if needed.
  }

  /**
   * Calculate the position size for a new trade.
   * Derived strategies can override this for custom position sizing logic.
   * @param bar - The current bar data, which might be used for volatility-based sizing etc.
   * @returns The number of contracts/shares to trade.
   */
  protected calculatePositionSize(bar: BacktestBarData): number {
    // Default implementation uses fixed position size from config.
    // Derived classes can use bar data, account info (if available via OrderManager), etc.
    return this.config.positionSize;
  }

  /**
   * Places stop-loss and/or take-profit orders if configured.
   * This is a helper method that can be called by derived strategies after a trade entry is confirmed.
   * @param trade - The trade that was just entered.
   * @param entryFill - The order fill that opened the trade.
   */
  protected placeProtectiveOrders(trade: SimulatedTrade, entryFill: Order): void {
    console.log(`[BaseStrategy.placeProtectiveOrders] 🚨 CALLED for trade ${trade.id}:`, {
      config: {
        stopLossPercent: this.config.stopLossPercent,
        stopLossTicks: this.config.stopLossTicks,
        takeProfitPercent: this.config.takeProfitPercent,
        takeProfitTicks: this.config.takeProfitTicks
      },
      trade: {
        id: trade.id,
        type: trade.type,
        size: trade.size,
        entryPrice: trade.entryPrice
      },
      entryFill: {
        id: entryFill.id,
        filledPrice: entryFill.filledPrice,
        filledQuantity: entryFill.filledQuantity,
        contractId: entryFill.contractId,
        isEntry: entryFill.isEntry
      },
      callStack: new Error().stack
    });
    
    // Check if protective orders already exist for this trade
    const existingPendingOrders = this.getPendingOrders(entryFill.contractId);
    const existingSL = existingPendingOrders.filter(o => o.isStopLoss && o.parentTradeId === trade.id);
    const existingTP = existingPendingOrders.filter(o => o.isTakeProfit && o.parentTradeId === trade.id);
    
    if (existingSL.length > 0 || existingTP.length > 0) {
      console.log(`[BaseStrategy.placeProtectiveOrders] ⚠️ DUPLICATE DETECTED! Protective orders already exist for trade ${trade.id}:`, {
        existingSL: existingSL.length,
        existingTP: existingTP.length,
        existingSlIds: existingSL.map(o => o.id),
        existingTpIds: existingTP.map(o => o.id)
      });
      return; // Don't create duplicates
    }

    const { stopLossPercent, stopLossTicks, takeProfitPercent, takeProfitTicks } = this.config;
    const entryPrice = entryFill.filledPrice;

    if (!entryPrice) {
      console.warn(`[BaseStrategy.placeProtectiveOrders] Entry fill for trade ${trade.id} has no fill price. Cannot place protective orders.`);
      return;
    }

    const quantity = entryFill.filledQuantity || trade.size; // Use filled quantity from the entry order

    // Place Stop Loss
    if (stopLossPercent || stopLossTicks) {
      let slPrice: number;
      if (stopLossTicks) {
        slPrice = trade.type === TradeType.BUY 
          ? entryPrice - stopLossTicks * this.orderManager.getTickSize() // Assuming OrderManager has getTickSize()
          : entryPrice + stopLossTicks * this.orderManager.getTickSize();
      } else if (stopLossPercent) { // stopLossPercent takes precedence if both are defined, or use as fallback
        slPrice = trade.type === TradeType.BUY
          ? entryPrice * (1 - stopLossPercent / 100)
          : entryPrice * (1 + stopLossPercent / 100);
      } else {
        return; // Should not happen if logic is correct
      }
      
      this.createStopOrder(
        trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY,
        quantity,
        slPrice,
        { time: entryFill.filledTime || entryFill.submittedTime } as BacktestBarData, // Use fill time for SL/TP submission time
        trade.id,
        entryFill.contractId,
        true // isStopLoss
      );
    }

    // Place Take Profit
    if (takeProfitPercent || takeProfitTicks) {
      let tpPrice: number;
      if (takeProfitTicks) {
        tpPrice = trade.type === TradeType.BUY
          ? entryPrice + takeProfitTicks * this.orderManager.getTickSize()
          : entryPrice - takeProfitTicks * this.orderManager.getTickSize();
      } else if (takeProfitPercent) { // takeProfitPercent takes precedence
        tpPrice = trade.type === TradeType.BUY
          ? entryPrice * (1 + takeProfitPercent / 100)
          : entryPrice * (1 - takeProfitPercent / 100);
      } else {
        return; // Should not happen
      }

      this.createTakeProfitOrder(
        trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY,
        quantity,
        tpPrice,
        { time: entryFill.filledTime || entryFill.submittedTime } as BacktestBarData, // Use fill time
        trade.id,
        entryFill.contractId
      );
    }
  }

  /**
   * Record a signal generated by the strategy
   * @param signal - The signal to record
   * @returns The recorded signal
   */
  protected recordSignal(signal: StrategySignal): StrategySignal {
    this.signals.push(signal);
    return signal;
  }

  /**
   * Generate a unique order ID
   */
  private generateOrderId(): string {
    return `ord-${this.getName().toLowerCase()}-${this.nextOrderId++}`;
  }

  /**
   * Generate a unique trade ID
   */
  private generateTradeId(): string {
    return `trade-${this.getName().toLowerCase()}-${this.nextTradeId++}`;
  }

  protected generateStopOrderSignals(filledOrders: Order[], barIndex: number): void {
    // Generate SELL signals for stop loss and take profit orders that were filled
    const stopOrderFills = filledOrders.filter(order => 
      order.isStopLoss || order.isTakeProfit
    );
    
    stopOrderFills.forEach(order => {
      const signalType = StrategySignalType.SELL; // Always SELL for stop/take profit
      const signal: StrategySignal = {
        type: signalType,
        barIndex: barIndex,
        time: order.filledTime || order.submittedTime || 0 as UTCTimestamp,
        price: order.filledPrice || order.price || 0
      };
      
      this.signals.push(signal);
      console.log(`[BaseStrategy] Generated ${order.isStopLoss ? 'stop loss' : 'take profit'} SELL signal at bar ${barIndex}, price ${signal.price}`);
    });
  }
}
