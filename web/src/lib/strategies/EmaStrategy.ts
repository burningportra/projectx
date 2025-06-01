import {
  BacktestBarData,
  StrategySignal,
  StrategySignalType,
  TradeType,
  Order,
  OrderType,
  OrderSide,
  OrderStatus,
  SubBarData
  // StrategyResult was here, moved to strategy.ts import
} from '@/lib/types/backtester';
import { BaseStrategyConfig, IStrategy, StrategyResult } from '@/lib/types/strategy'; // Added IStrategy and StrategyResult
import { OrderManager } from '@/lib/OrderManager';
import { BaseStrategy } from './BaseStrategy'; // Import BaseStrategy

// EmaStrategyConfig now extends BaseStrategyConfig
export interface EmaStrategyConfig extends BaseStrategyConfig {
  fastPeriod: number;
  slowPeriod: number;
}

export interface EmaIndicators {
  fastEma: number;
  slowEma: number;
}

// EmaStrategy now extends BaseStrategy
export class EmaStrategy extends BaseStrategy implements IStrategy { // Implement IStrategy for clarity
  // config is inherited from BaseStrategy, but we'll use a typed getter for convenience
  protected get emaConfig(): EmaStrategyConfig {
    return this.config as EmaStrategyConfig;
  }

  private fastEmaValues: number[] = [];
  private slowEmaValues: number[] = [];
  // signals, trades, openTrade, orderManager are inherited or managed by BaseStrategy/OrderManager
  // private tradeIdCounter = 1; // BaseStrategy might handle this or use OrderManager's IDs
  private pendingReversalSignal: StrategySignal | null = null;
  private pendingReversalBar: BacktestBarData | null = null;
  private currentBarIndex: number = 0; // Still useful for EMA strategy's own logic
  private processedOrphanedPositions: Set<string> = new Set(); // Track positions we've already fixed

  constructor(orderManagerInstance: OrderManager, config: Partial<EmaStrategyConfig> = {}) {
    const defaultConfig: Partial<EmaStrategyConfig> = {
      name: 'EMA Crossover Strategy',
      description: 'A simple exponential moving average crossover strategy.',
      version: '1.1.0', // Updated version after refactor
      fastPeriod: 12,
      slowPeriod: 26,
      commission: 2.50,
      positionSize: 1,
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      useMarketOrders: true,
      limitOrderOffset: 2,
      ...config
    };
    super(orderManagerInstance, defaultConfig); // Pass orderManager and merged config to BaseStrategy
  }

  // Implement abstract methods from BaseStrategy
  public getName(): string {
    return this.config.name || 'EMA Crossover Strategy';
  }

  public getDescription(): string {
    return this.config.description || 'A simple exponential moving average crossover strategy.';
  }

  public getVersion(): string {
    return this.config.version || '1.1.0';
  }

  // Override reset to include EMA specific state
  public reset(): void {
    super.reset(); // Call BaseStrategy's reset
    this.fastEmaValues = [];
    this.slowEmaValues = [];
    this.pendingReversalSignal = null;
    this.pendingReversalBar = null;
    this.currentBarIndex = 0;
    this.processedOrphanedPositions.clear(); // Reset tracking
    // orderManager.reset() is called by super.reset() if BaseStrategy's reset calls its onReset hook,
    // or if OrderManager is reset directly by BaseStrategy.
    // For now, assuming BaseStrategy handles OrderManager reset.
  }

  // Calculate EMA for a given period
  private calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const emaValues: number[] = [];

    if (prices.length === 0) return emaValues;
    emaValues[0] = prices[0];

    for (let i = 1; i < prices.length; i++) {
      emaValues[i] = prices[i] * k + emaValues[i - 1] * (1 - k);
    }

    return emaValues;
  }

  // Get the most recent EMA value for a given period
  private getCurrentEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;

    // Use more data for accuracy, ensure this doesn't cause issues with very short price arrays
    const recentPrices = prices.slice(-Math.max(period * 2, prices.length)); 
    const emaValues = this.calculateEMA(recentPrices, period);
    return emaValues[emaValues.length - 1];
  }

  // Process a single bar and generate signals
  public async processBar(
    mainBar: BacktestBarData,
    subBarsForMainBar: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> {
    this.currentBarIndex = barIndex;

    const contractId = this.emaConfig.contractId || 'DEFAULT_CONTRACT';
    
    // OrderManager processes the bar for SL/TP hits, etc.
    // This returns orders that were filled *during this bar's processing by OrderManager*.
    const filledOrdersThisBar = this.orderManager.processBar(mainBar, subBarsForMainBar, barIndex);

    // Generate signals for any stop loss/take profit orders that were filled
    this.generateStopOrderSignals(filledOrdersThisBar, barIndex);

    // DEBUG: Log current state
    const openPosition = this.orderManager.getOpenPosition(contractId);
    const pendingOrders = this.orderManager.getPendingOrders(contractId);
    console.log(`[EmaStrategy] Bar ${barIndex} - OM State:`, {
      openPosition: openPosition ? { id: openPosition.id, side: openPosition.side, size: openPosition.size } : null,
      pendingOrdersCount: pendingOrders.length,
      filledThisBarCount: filledOrdersThisBar.length,
      conceptualTrade: this.openTrade ? { id: this.openTrade.id, status: this.openTrade.status } : null
    });

    // Process these fills using BaseStrategy's hook, which might update this.openTrade
    // and place protective orders if an entry was filled.
    for (const filledOrder of filledOrdersThisBar) {
      console.log(`[EmaStrategy] Processing filled order ${filledOrder.id} with isEntry: ${filledOrder.isEntry}`);
      super.onOrderFilled(filledOrder, this.openTrade || undefined);
    }
    
    // CRITICAL FIX: Check for positions without protective orders
    // Case 1: Position exists but no conceptual trade (orphaned position)
    // Case 2: Position AND conceptual trade exist but no protective orders (entry filled but protection not placed)
    // Only trigger if NO SL/TP orders exist for this specific position
    const slOrders = pendingOrders.filter(o => o.isStopLoss && o.parentTradeId === openPosition?.id);
    const tpOrders = pendingOrders.filter(o => o.isTakeProfit && o.parentTradeId === openPosition?.id);
    const hasProtectiveOrders = slOrders.length > 0 || tpOrders.length > 0;
    
    // DEBUG: Log the protective order detection
    if (openPosition) {
      console.log(`[EmaStrategy] Protective order detection for ${openPosition.id}:`, {
        totalPendingOrders: pendingOrders.length,
        pendingOrdersForPosition: pendingOrders.filter(o => o.parentTradeId === openPosition.id).length,
        slOrdersFound: slOrders.length,
        tpOrdersFound: tpOrders.length,
        hasProtectiveOrders,
        orderFlags: pendingOrders.map(o => ({
          id: o.id,
          parentTradeId: o.parentTradeId,
          isStopLoss: o.isStopLoss,
          isTakeProfit: o.isTakeProfit,
          type: o.type,
          message: o.message
        }))
      });
    }
    
    if (openPosition && !hasProtectiveOrders && !this.processedOrphanedPositions.has(openPosition.id)) {
      console.log(`[EmaStrategy] 🚨 DETECTED POSITION WITHOUT PROTECTIVE ORDERS!`);
      console.log(`[EmaStrategy] Position details:`, {
        id: openPosition.id,
        side: openPosition.side,
        size: openPosition.size,
        averageEntryPrice: openPosition.averageEntryPrice
      });
      console.log(`[EmaStrategy] Conceptual trade exists:`, !!this.openTrade);
      
      // Mark this position as processed to prevent repeated executions
      this.processedOrphanedPositions.add(openPosition.id);
      
      // Get or create conceptual trade
      let conceptualTrade = this.openTrade;
      if (!conceptualTrade) {
        // Case 1: Create missing conceptual trade
        console.log(`[EmaStrategy] Creating missing conceptual trade for orphaned position`);
        conceptualTrade = this.createTrade(
          openPosition.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
          openPosition.averageEntryPrice,
          openPosition.size,
          mainBar.time, // Use current time as approximation
          undefined, // No entry order reference since it's already filled
          undefined  // No entry signal reference
        );
      } else {
        // Case 2: Conceptual trade exists but no protective orders
        console.log(`[EmaStrategy] Conceptual trade exists but missing protective orders`);
      }
      
      // Create a mock filled entry order to trigger protective order placement
      const mockEntryOrder: Order = {
        id: `mock-entry-${openPosition.id}`,
        tradeId: conceptualTrade.id,
        contractId: contractId,
        type: OrderType.MARKET,
        side: openPosition.side,
        quantity: openPosition.size,
        status: OrderStatus.FILLED,
        submittedTime: mainBar.time,
        filledPrice: openPosition.averageEntryPrice,
        filledQuantity: openPosition.size,
        filledTime: mainBar.time,
        commission: 0,
        message: 'Reconstructed entry order for position missing protective orders',
        isEntry: true,
        parentTradeId: conceptualTrade.id
      };
      
      console.log(`[EmaStrategy] Placing protective orders for position using mock entry order`);
      this.placeProtectiveOrders(conceptualTrade, mockEntryOrder);
    }
    
    // EMA Calculation
    const closePrices = allMainBars.slice(0, barIndex + 1).map(b => b.close);
    const fastEma = this.getCurrentEMA(closePrices, this.emaConfig.fastPeriod);
    const slowEma = this.getCurrentEMA(closePrices, this.emaConfig.slowPeriod);

    // CRITICAL FIX: Get previous EMA values BEFORE pushing current ones
    // The old logic used barIndex which doesn't match the incremental EMA arrays
    const prevFastEma = this.fastEmaValues.length > 0 ? 
        this.fastEmaValues[this.fastEmaValues.length - 1] : fastEma;
    const prevSlowEma = this.slowEmaValues.length > 0 ? 
        this.slowEmaValues[this.slowEmaValues.length - 1] : slowEma;

    // Now push current values to arrays for next iteration
    this.fastEmaValues.push(fastEma);
    this.slowEmaValues.push(slowEma);

    this.updateIndicatorValue('fastEma', fastEma); // Store in BaseStrategy's indicators
    this.updateIndicatorValue('slowEma', slowEma);

    // Debug logging to verify EMA calculations and crossover detection
    console.log(`[EmaStrategy] Bar ${barIndex}: FastEMA=${fastEma.toFixed(4)}, SlowEMA=${slowEma.toFixed(4)}, PrevFast=${prevFastEma.toFixed(4)}, PrevSlow=${prevSlowEma.toFixed(4)}`);

    if (this.fastEmaValues.length < 2) { // Need at least 2 EMA values for crossover
      console.log(`[EmaStrategy] Bar ${barIndex}: Not enough EMA history for crossover detection (${this.fastEmaValues.length} values)`);
      return { signal: null, indicators: this.indicators, filledOrders: filledOrdersThisBar };
    }
    const bullishCrossover = prevFastEma <= prevSlowEma && fastEma > slowEma;
    const bearishCrossover = prevFastEma >= prevSlowEma && fastEma < slowEma;

    // Debug crossover detection
    if (bullishCrossover) {
      console.log(`[EmaStrategy] Bar ${barIndex}: 🟢 BULLISH CROSSOVER detected! Fast crossed above Slow`);
    }
    if (bearishCrossover) {
      console.log(`[EmaStrategy] Bar ${barIndex}: 🔴 BEARISH CROSSOVER detected! Fast crossed below Slow`);
    }
    if (!bullishCrossover && !bearishCrossover) {
      console.log(`[EmaStrategy] Bar ${barIndex}: No crossover detected`);
    }

    const currentManagedPosition = this.orderManager.getOpenPosition(contractId); // This is ManagedPosition | undefined
    const hasOpenPosition = currentManagedPosition !== undefined;
    let strategyGeneratedSignal: StrategySignal | null = null;

    // Handle pending reversal first: if a reversal was initiated and the closing leg filled.
    // This means currentManagedPosition should be undefined.
    if (this.pendingReversalSignal && this.pendingReversalBar && !hasOpenPosition) {
      console.log('[EmaStrategy] Reversal closing leg filled. Opening new leg.');
      const signalForNewLeg = this.pendingReversalSignal;
      const barForNewLeg = this.pendingReversalBar;
      this.pendingReversalSignal = null;
      this.pendingReversalBar = null;
      
      // This call will create a new this.openTrade (SimulatedTrade) via BaseStrategy.createTrade
      this.executeEntry(barForNewLeg, signalForNewLeg, signalForNewLeg.type === StrategySignalType.BUY ? OrderSide.BUY : OrderSide.SELL, contractId);
      strategyGeneratedSignal = signalForNewLeg; // The signal for the new entry
    }
    // Main Crossover Logic
    else if (bullishCrossover) {
      if (!hasOpenPosition) { // No position, potential new entry
        strategyGeneratedSignal = {
          barIndex, time: mainBar.time, type: StrategySignalType.BUY, price: mainBar.close,
          message: `EMA ${this.emaConfig.fastPeriod} > EMA ${this.emaConfig.slowPeriod}`,
        };
        this.executeEntry(mainBar, strategyGeneratedSignal, OrderSide.BUY, contractId);
      } else if (currentManagedPosition!.side === OrderSide.SELL) { // Opposite position (SELL), potential reversal to BUY
        strategyGeneratedSignal = {
          barIndex, time: mainBar.time, type: StrategySignalType.BUY, price: mainBar.close,
          message: `EMA Crossover - Reverse to LONG from SHORT`,
        };
        // Pass currentManagedPosition to executeReversal
        this.executeReversal(mainBar, strategyGeneratedSignal, OrderSide.BUY, contractId, currentManagedPosition!);
      }
    } else if (bearishCrossover) {
      if (!hasOpenPosition) { // No position, potential new entry
        strategyGeneratedSignal = {
          barIndex, time: mainBar.time, type: StrategySignalType.SELL, price: mainBar.close,
          message: `EMA ${this.emaConfig.fastPeriod} < EMA ${this.emaConfig.slowPeriod}`,
        };
        this.executeEntry(mainBar, strategyGeneratedSignal, OrderSide.SELL, contractId);
      } else if (currentManagedPosition!.side === OrderSide.BUY) { // Opposite position (BUY), potential reversal to SELL
        strategyGeneratedSignal = {
          barIndex, time: mainBar.time, type: StrategySignalType.SELL, price: mainBar.close,
          message: `EMA Crossover - Reverse to SHORT from LONG`,
        };
        // Pass currentManagedPosition to executeReversal
        this.executeReversal(mainBar, strategyGeneratedSignal, OrderSide.SELL, contractId, currentManagedPosition!);
      }
    }

    if (strategyGeneratedSignal) {
      this.recordSignal(strategyGeneratedSignal);
    }
    
    // The final signal for StrategyResult should ideally be the most "impactful" one from this bar.
    // If an exit (SL/TP) occurred, that's usually primary. Then strategy-generated exits/entries.
    // For now, let's prioritize strategy-generated signals if any, then fills.
    // This part might need refinement based on how signals are consumed by UI.
    // Filled orders already processed by onOrderFilled.
    // The `signal` in StrategyResult is for new signals generated *by the strategy logic itself* this bar.
    return { signal: strategyGeneratedSignal, indicators: this.indicators, filledOrders: filledOrdersThisBar };
  }

  private executeEntry(bar: BacktestBarData, signal: StrategySignal, side: OrderSide, contractId: string): void {
    const positionSize = this.calculatePositionSize(bar); // From BaseStrategy
    const perContractCommission = positionSize > 0 ? (this.emaConfig.commission || 0) / positionSize : 0;
    
    // Generate the ID for the conceptual trade first.
    // BaseStrategy.createTrade will use its internal generateTradeId(), but we need it *before* submitting the order.
    // So, we'll create the conceptual trade, get its ID, then submit the order with that ID as parentTradeId.
    
    // Create the conceptual trade using BaseStrategy's method. This sets this.openTrade.
    // We pass a placeholder entryOrder initially, then update it.
    const conceptualTrade = this.createTrade(
      side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      bar.close, // Initial price, will be updated by fill if limit order
      positionSize,
      bar.time,
      undefined, // Placeholder for entryOrder
      signal
    );
    const conceptualTradeId = conceptualTrade.id; // This is the ID generated by BaseStrategy.generateTradeId()

    let entryOrder: Order;
    if (this.emaConfig.useMarketOrders) {
      entryOrder = this.createMarketOrder(side, positionSize, bar, conceptualTradeId, contractId);
    } else {
      const offset = (this.emaConfig.limitOrderOffset || 2) * this.orderManager.getTickSize();
      const limitPrice = side === OrderSide.BUY ? bar.close - offset : bar.close + offset;
      entryOrder = this.createLimitOrder(side, positionSize, limitPrice, bar, conceptualTradeId, contractId);
    }
    
    // CRITICAL: Ensure entry order is properly flagged
    entryOrder.isEntry = true;
    entryOrder.isExit = false;
    entryOrder.message = signal.message;
    
    console.log(`[EmaStrategy] Created entry order ${entryOrder.id} with isEntry: ${entryOrder.isEntry}`);

    // Now link the actual submitted order to the conceptual trade
    if (this.openTrade && this.openTrade.id === conceptualTradeId) {
      this.openTrade.entryOrder = entryOrder;
      // If it's a limit order, the entryPrice of the conceptual trade might need to be updated
      // once the order is filled. BaseStrategy.onOrderFilled should handle this if the
      // conceptual trade's entryPrice is updated based on the fill.
      // For now, BaseStrategy.createTrade uses the bar.close or entryOrder.price.
      // Let's ensure the conceptual trade's entryPrice reflects the order's price for limit orders.
      if (entryOrder.type === OrderType.LIMIT && entryOrder.price) {
        this.openTrade.entryPrice = entryOrder.price;
      }
    }
    
    console.log(`[EmaStrategy] Submitted entry order ${entryOrder.id} for conceptual trade ${this.openTrade?.id} (parentTradeId: ${entryOrder.parentTradeId})`);
    // BaseStrategy.onOrderFilled will handle SL/TP placement when this entryOrder is filled.
  }

  // existingPosition here is ManagedPosition from OrderManager
  private executeReversal(bar: BacktestBarData, signalForNewTrade: StrategySignal, newSide: OrderSide, contractId: string, existingManagedPosition: ReturnType<OrderManager['getOpenPosition']> ): void {
    if (!existingManagedPosition) return; // Should not happen if called correctly

    console.log(`[EmaStrategy] Initiating reversal from ${existingManagedPosition.side} to ${newSide} for position ID ${existingManagedPosition.id}`);
    
    // 1. Cancel any existing SL/TP orders for the current position.
    // OrderManager associates SL/TP orders with the parentTradeId, which is the ID of the ManagedPosition.
    this.orderManager.cancelOrdersByTradeId(existingManagedPosition.id);

    // 2. Submit market order to close the current position
    const closeSide = existingManagedPosition.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const positionSize = existingManagedPosition.size; 
    const perContractCommission = positionSize > 0 ? (this.emaConfig.commission || 0) / positionSize : 0;

    const closeOrder = this.createMarketOrder(
      closeSide,
      positionSize,
      bar,
      existingManagedPosition.id, // This is crucial: links the close order to the ManagedPosition
      contractId,
      false, // isEntry: false
      true   // isExit: true
    );
    closeOrder.message = `Reversal: Closing ${existingManagedPosition.side} leg. Signal: ${signalForNewTrade.message}`;
    console.log(`[EmaStrategy] Submitted market order ${closeOrder.id} to close existing ${existingManagedPosition.side} position ${existingManagedPosition.id}`);

    // 3. Set up pending reversal: The new position will be opened AFTER the close order is confirmed filled
    // (which means existingManagedPosition will no longer be open).
    // The `signalForNewTrade` is for the *new* position.
    this.pendingReversalSignal = signalForNewTrade;
    this.pendingReversalBar = bar; // Store the bar context for the new entry
    
    // The actual opening of the new leg (e.g., calling executeEntry for the new side)
    // will happen in processBar when it detects that the `existingPosition` is no longer open
    // (i.e., `currentPosition` from OrderManager becomes undefined) AND `pendingReversalSignal` is set.
  }
  
  // Removed handleOrderFillInternal as BaseStrategy.onOrderFilled should be primary.
  // EMA-specific reactions to fills (like initiating the second leg of a reversal)
  // are now handled within processBar after checking OrderManager's state.

  // getCurrentIndicators is provided by BaseStrategy, using values from updateIndicatorValue
  // getSignals is provided by BaseStrategy
  // getTrades is provided by BaseStrategy (from OrderManager)
  // getOpenTrade is provided by BaseStrategy
  // getPendingOrders, getFilledOrders, getCancelledOrders are from BaseStrategy (from OrderManager)
  // updateConfig, getConfig are from BaseStrategy
  // backtest, calculateResults, getCurrentBacktestResults are from BaseStrategy

  // Strategy-specific config validation
  protected validateStrategySpecificConfig(config: BaseStrategyConfig): void {
    const emaConfig = config as EmaStrategyConfig;
    if (typeof emaConfig.fastPeriod !== 'number' || emaConfig.fastPeriod <= 0) {
      throw new Error('EMA Strategy: fastPeriod must be a positive number.');
    }
    if (typeof emaConfig.slowPeriod !== 'number' || emaConfig.slowPeriod <= 0) {
      throw new Error('EMA Strategy: slowPeriod must be a positive number.');
    }
    if (emaConfig.fastPeriod >= emaConfig.slowPeriod) {
      throw new Error('EMA Strategy: fastPeriod must be less than slowPeriod.');
    }
  }

  // Hook for config updates
  protected onConfigUpdated(changedKeys: string[] = [], previousConfig: BaseStrategyConfig = {} as BaseStrategyConfig): void {
    super.onConfigUpdated(changedKeys, previousConfig); // Call super's hook
    // If EMA periods changed, might need to reset EMA values or re-evaluate state
    if (changedKeys.includes('fastPeriod') || changedKeys.includes('slowPeriod')) {
      console.log('[EmaStrategy] EMA periods changed. Consider if state needs reset.');
      // For a live strategy, you might re-initialize indicators.
      // For backtesting, a full reset usually happens if config changes mid-test.
      this.fastEmaValues = [];
      this.slowEmaValues = [];
      // Potentially call this.reset() or a more targeted reset if applicable.
    }
  }
}
