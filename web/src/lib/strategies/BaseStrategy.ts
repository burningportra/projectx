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
import { messageBus, MessageType, Subscription } from '../MessageBus';

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

  // New subscription management
  protected subscriptions: Subscription[] = [];

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
    
    // Publish strategy stopped event before reset
    messageBus.publish(MessageType.STRATEGY_STOPPED, `Strategy-${this.getName()}`, {
      strategyName: this.getName(),
      timestamp: Date.now() / 1000
    });
    
    // Call strategy-specific reset implementation
    this.onReset();
    
    // Publish strategy started event after reset
    messageBus.publish(MessageType.STRATEGY_STARTED, `Strategy-${this.getName()}`, {
      strategyName: this.getName(),
      config: this.config,
      timestamp: Date.now() / 1000
    });
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
   * Get current backtest results including live state
   */
  public getCurrentBacktestResults(): BacktestResults {
    const results = this.calculateBacktestResults();
    console.log(`[${this.getName()}] getCurrentBacktestResults called:`, {
      totalTrades: results.totalTrades,
      totalPnL: results.totalProfitOrLoss,
      completedTradesCount: this.orderManager.getCompletedTrades().length
    });
    return results;
  }

  /**
   * Calculate backtest performance metrics based on trades from OrderManager.
   * Metrics include total P&L, win rate, total trades, max drawdown, and profit factor.
   * @returns A `BacktestResults` object.
   */
  protected calculateBacktestResults(): BacktestResults {
    const allCompletedTrades = this.orderManager.getCompletedTrades();
    console.log(`[${this.getName()}] calculateBacktestResults:`, {
      allCompletedTradesCount: allCompletedTrades.length,
      allCompletedTrades: allCompletedTrades.map(t => ({
        id: t.id,
        status: t.status,
        pnl: t.profitOrLoss,
        exitReason: t.exitReason
      }))
    });
    
    const closedTrades = allCompletedTrades.filter(trade => trade.status === 'CLOSED');
    console.log(`[${this.getName()}] Filtered closed trades:`, {
      closedTradesCount: closedTrades.length,
      closedTrades: closedTrades.map(t => ({
        id: t.id,
        pnl: t.profitOrLoss
      }))
    });
    
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter(trade => (trade.profitOrLoss || 0) > 0);
    const losingTrades = closedTrades.filter(trade => (trade.profitOrLoss || 0) < 0);
    
    const totalProfitOrLoss = closedTrades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;
    
    closedTrades.forEach(trade => {
      runningPnL += trade.profitOrLoss || 0;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });
    
    // Calculate profit factor
    const totalWins = winningTrades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    
    const results: BacktestResults = {
      totalProfitOrLoss,
      winRate,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      maxDrawdown,
      profitFactor,
      trades: closedTrades
    };
    
    console.log(`[${this.getName()}] Backtest results calculated:`, {
      totalTrades: results.totalTrades,
      totalPnL: results.totalProfitOrLoss,
      winRate: results.winRate
    });
    
    return results;
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

    const newTrade: SimulatedTrade = {
      id: this.generateTradeId(),
      type,
      status: 'PENDING', // Conceptual trade is pending until entry order is filled
      entryTime: 0 as UTCTimestamp, // Will be set upon fill
      entryPrice: 0, // Will be set upon fill
      entryOrder: entryOrder,
      signalEntry: entrySignal,
      size: size,
      profitOrLoss: 0,
    };
    
    this.openTrade = newTrade; // Strategy now holds a pending conceptual trade
    
    return newTrade;
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
    console.log(`[${this.getName()}.onOrderFilled] Processing filled order:`, {
      orderId: filledOrder.id,
      isEntry: filledOrder.isEntry,
      isExit: filledOrder.isExit,
      isStopLoss: filledOrder.isStopLoss,
      isTakeProfit: filledOrder.isTakeProfit,
      openTradeId: currentConceptualTrade?.id,
    });

    if (!currentConceptualTrade) {
      console.warn(`[${this.getName()}] onOrderFilled received for ${filledOrder.id} but no open conceptual trade was found. Ignoring.`);
      return;
    }

    // Is this the entry order being filled?
    if (filledOrder.isEntry && filledOrder.id === currentConceptualTrade.entryOrder?.id) {
      console.log(`[${this.getName()}] ✅ Entry fill detected for conceptual trade ${currentConceptualTrade.id}. Placing protective orders.`);
      currentConceptualTrade.status = 'OPEN';
      currentConceptualTrade.entryPrice = filledOrder.filledPrice!;
      currentConceptualTrade.entryTime = filledOrder.filledTime!;
      
        this.placeProtectiveOrders(currentConceptualTrade, filledOrder);
      
      messageBus.publish(MessageType.POSITION_OPENED, this.getName(), { trade: currentConceptualTrade });
    }
    // Is this an exit order being filled?
    else if (filledOrder.isExit || filledOrder.isStopLoss || filledOrder.isTakeProfit) {
      if (
        (currentConceptualTrade.stopLossOrder && filledOrder.id === currentConceptualTrade.stopLossOrder.id) ||
        (currentConceptualTrade.takeProfitOrder && filledOrder.id === currentConceptualTrade.takeProfitOrder.id)
      ) {
        console.log(`[${this.getName()}] ⛔️ Exit fill detected for trade ${currentConceptualTrade.id}. Closing position.`);
        this._closePosition(currentConceptualTrade, filledOrder);
      } else {
        console.warn(`[${this.getName()}] Received an exit-type order fill for ${filledOrder.id}, but it did not match the known SL/TP orders for trade ${currentConceptualTrade.id}.`);
      }
    }
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
      
      const slOrder = this.createStopOrder(
        trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY,
        quantity,
        slPrice,
        { time: entryFill.filledTime || entryFill.submittedTime } as BacktestBarData, // Use fill time for SL/TP submission time
        trade.id,
        entryFill.contractId,
        true // isStopLoss
      );
      
      // Attach the stop loss order to the trade
      trade.stopLossOrder = slOrder;
      console.log(`[BaseStrategy.placeProtectiveOrders] Stop loss order created and attached to trade ${trade.id}:`, slOrder);
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

      const tpOrder = this.createTakeProfitOrder(
        trade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY,
        quantity,
        tpPrice,
        { time: entryFill.filledTime || entryFill.submittedTime } as BacktestBarData, // Use fill time
        trade.id,
        entryFill.contractId
      );
      
      // Attach the take profit order to the trade
      trade.takeProfitOrder = tpOrder;
      console.log(`[BaseStrategy.placeProtectiveOrders] Take profit order created and attached to trade ${trade.id}:`, tpOrder);
    }
  }

  /**
   * Record a signal generated by the strategy
   * @param signal - The signal to record
   * @returns The recorded signal
   */
  protected recordSignal(signal: StrategySignal): StrategySignal {
    this.signals.push(signal);
    
    // Publish signal generated event
    messageBus.publish(MessageType.SIGNAL_GENERATED, `Strategy-${this.getName()}`, {
      signal,
      strategyName: this.getName(),
      timestamp: Date.now() / 1000
    });
    
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

  /**
   * Conceptually closes a trade within the strategy's state.
   * Note: The authoritative closing is handled by the OrderManager. This method
   * primarily cleans up the strategy's internal state (`this.openTrade`).
   *
   * @param trade - The trade to close conceptually.
   * @param exitOrder - The order that triggered the closure.
   */
  private _closePosition(trade: SimulatedTrade, exitOrder: Order): void {
    if (!trade) {
      console.warn(`[${this.getName()}] _closePosition called but there was no open trade.`);
      return;
    }

    console.log(`[${this.getName()}] Closing position for trade ${trade.id} due to order ${exitOrder.id}`);
    
    // The completed trade details will be sourced from the OrderManager,
    // but we clear the strategy's open trade placeholder.
    this.openTrade = null;

    // Publish an event to notify that the position is conceptually closed from the strategy's perspective
    messageBus.publish(MessageType.POSITION_CLOSED, `Strategy-${this.getName()}`, {
      strategyName: this.getName(),
      tradeId: trade.id,
      orderId: exitOrder.id,
      reason: exitOrder.isStopLoss ? 'STOP_LOSS' : exitOrder.isTakeProfit ? 'TAKE_PROFIT' : 'EXIT_SIGNAL',
      timestamp: exitOrder.filledTime,
      pnl: trade.profitOrLoss, // Note: PnL here might be stale; OM has the final value.
    });
  }

  /**
   * Starts the strategy. Base implementation can be extended by child classes.
   */
  public start(): void {
    console.log(`[${this.getName()}] Strategy starting...`);
    // Child classes should call super.start() and then initialize their specific subscriptions.
  }

  /**
   * Stops the strategy by unsubscribing from all events.
   */
  public stop(): void {
    console.log(`[${this.getName()}] Strategy stopping...`);
    this.unsubscribeAll();
  }
  
  /**
   * Unsubscribes from all message bus subscriptions.
   */
  public unsubscribeAll(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    console.log(`[${this.getName()}] All subscriptions cleared.`);
  }
}
