import { 
  BacktestBarData, 
  StrategySignal, 
  StrategySignalType, 
  SimulatedTrade,
  TradeType,
  Order,
  OrderType,
  OrderSide,
  UTCTimestamp,
  OrderStatus,
  SubBarData
} from '@/lib/types/backtester';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier, TrendStartSignal as TrendLibSignal } from '@/lib/trend-analysis/TrendIdentifier';
import { BaseStrategy } from './BaseStrategy';
import { BaseStrategyConfig, StrategyResult } from '../types/strategy';

// Strategy's internal representation of a trend signal it might act upon
interface StrategyTrendSignal extends TrendLibSignal {}

// TrendStartStrategy specific configuration
export interface TrendStartStrategyConfig extends BaseStrategyConfig {
  minConfirmationBars: number;
  confidenceThreshold: number;
  limitOrderOffsetTicks?: number; 
  contractId?: string; 
  timeframe?: string; 
}

// Indicators specific to this strategy, to be reported via BaseStrategy.updateIndicatorValue
// These are now string-based status indicators, managed internally or via a custom getter.
// Numerical indicators (like strength) can still use BaseStrategy.updateIndicatorValue.
export interface TrendStartStatusIndicators {
  trendDirection: 'UP' | 'DOWN' | 'NONE';
  lastSignalTime: UTCTimestamp;
  lastSignalType: 'CUS' | 'CDS' | 'NONE'; // 'NONE' if no signal yet
  lastSignalRule: string;
}

export class TrendStartStrategy extends BaseStrategy {
  // config is inherited from BaseStrategy. We will cast it to TrendStartStrategyConfig when needed.
  
  private trendIdentifier: TrendIdentifier;
  private trackedTrendSignals: StrategyTrendSignal[] = [];

  // Internal state for string/status indicators
  private _currentTrendDirection: 'UP' | 'DOWN' | 'NONE' = 'NONE';
  private _lastSignalTime: UTCTimestamp = 0 as UTCTimestamp; // Ensure proper type initialization
  private _lastSignalType: 'CUS' | 'CDS' | 'NONE' = 'NONE';
  private _lastSignalRule: string = 'N/A';

  constructor(
    orderManagerInstance: OrderManager, 
    trendIdentifierInstance: TrendIdentifier,
    config: Partial<TrendStartStrategyConfig> = {}
  ) {
    const defaultConfig: TrendStartStrategyConfig = {
      name: 'TrendStartStrategy', // This name will be used by BaseStrategy constructor
      description: 'Trades on confirmed trend start signals from TrendIdentifier.', // This desc
      version: '1.1.0', // This version
      commission: 2.50, 
      positionSize: 1,   
      stopLossPercent: 2.0,
      takeProfitPercent: 4.0,
      useMarketOrders: true, 
      limitOrderOffsetTicks: 2, 
      minConfirmationBars: 2, 
      confidenceThreshold: 0.6, 
      contractId: 'DEFAULT_CONTRACT',
      timeframe: '1h'
    };
    
    super(orderManagerInstance, { ...defaultConfig, ...config });
    // this.config is already initialized by super() and is of type BaseStrategyConfig.
    // We need to ensure it's treated as TrendStartStrategyConfig within this class.
    // The `protected config: TrendStartStrategyConfig;` declaration handles this for `this` context.
    // The assignment below is redundant if BaseStrategy correctly initializes this.config.
    // this.config = this.getConfig() as TrendStartStrategyConfig; 
    // Let's rely on the inherited this.config and cast when accessing specific fields if needed,
    // or use a typed getter. For simplicity, we'll cast where TrendStartStrategyConfig specific props are used.
    
    if (!trendIdentifierInstance) {
        throw new Error("[TrendStartStrategy] TrendIdentifier instance is required.");
    }
    this.trendIdentifier = trendIdentifierInstance;
    this._initializeStatusIndicators();
  }

  private _initializeStatusIndicators(): void {
    this._currentTrendDirection = 'NONE';
    this._lastSignalTime = 0 as UTCTimestamp;
    this._lastSignalType = 'NONE';
    this._lastSignalRule = 'N/A';
    this.updateIndicatorValue('trendStrength', 0);
  }

  // Return static values to avoid issues with `this.config` during BaseStrategy construction
  public getName(): string { return 'TrendStartStrategy'; }
  public getDescription(): string { return 'Trades on confirmed trend start signals from TrendIdentifier.'; }
  public getVersion(): string { return '1.1.0'; }

  protected validateStrategySpecificConfig(config: BaseStrategyConfig): void {
    super.validateStrategySpecificConfig(config); 
    const specificConfig = config as TrendStartStrategyConfig; // Cast to access specific fields
    if (specificConfig.minConfirmationBars < 0) {
      throw new Error("minConfirmationBars must be non-negative.");
    }
    if (specificConfig.confidenceThreshold < 0 || specificConfig.confidenceThreshold > 1) {
      throw new Error("confidenceThreshold must be between 0 and 1.");
    }
    if (specificConfig.limitOrderOffsetTicks !== undefined && typeof specificConfig.limitOrderOffsetTicks !== 'number') {
        throw new Error("limitOrderOffsetTicks must be a number if provided.");
    }
  }
  
  protected onReset(): void {
    super.onReset(); 
    this.trackedTrendSignals = [];
    this.trendIdentifier.resetState(); 
    this._initializeStatusIndicators();
    this.updateIndicatorValue('lastSignalTime', 0 as UTCTimestamp);
  }

  public async processBar(
    mainBar: BacktestBarData,
    subBarsForMainBar: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> {
    
    const filledOrders = this.orderManager.processBar(mainBar, subBarsForMainBar, barIndex);

    // Generate signals for any stop loss/take profit orders that were filled
    this.generateStopOrderSignals(filledOrders, barIndex);
    
    for (const filledOrder of filledOrders) {
      this._handleFilledOrder(filledOrder, mainBar);
    }

    // Use a typed getter for config to access TrendStartStrategyConfig specific properties
    const currentConfig = this.config as TrendStartStrategyConfig;
    const contractId = currentConfig.contractId!; 
    const timeframe = currentConfig.timeframe!;

    const identifiedSignals = await this.trendIdentifier.getSignalsForRange(allMainBars, barIndex, contractId, timeframe);
    
    // DEBUG: Log identified signals
    if (barIndex % 50 === 0 || identifiedSignals.length > 0) { // Log periodically or if signals found
      console.log(`[TrendStartStrategy] Bar ${barIndex} (Time: ${new Date(mainBar.time * 1000).toISOString()}) - Received ${identifiedSignals.length} signals from TrendIdentifier.`);
      if (identifiedSignals.length > 0) {
        identifiedSignals.forEach((sig, idx) => {
          console.log(`  Signal ${idx + 1}: type=${sig.type}, barIndex=${sig.barIndex}, price=${sig.price}, rule=${sig.rule}, confidence=${sig.confidence}`);
        });
      }
    }

    const newSignalsForAction = this._processNewTrendSignals(identifiedSignals);
    const latestSignalForAction = newSignalsForAction.length > 0 ? newSignalsForAction[newSignalsForAction.length - 1] : null;
    
    let uiSignal: StrategySignal | null = null; 
    const currentOpenTrade = this.getOpenTrade(); 
    
    if (latestSignalForAction) {
      const confidence = latestSignalForAction.confidence || 0;
      
      if (currentOpenTrade && this._shouldExitPosition(latestSignalForAction, currentOpenTrade)) {
         uiSignal = this._closeConceptualPosition(currentOpenTrade, mainBar, latestSignalForAction, `${latestSignalForAction.type} signal to exit`);
      }
      
      const isClosingSignalForOpenTrade = uiSignal && currentOpenTrade && 
        ((currentOpenTrade.type === TradeType.BUY && uiSignal.type === StrategySignalType.SELL) ||
         (currentOpenTrade.type === TradeType.SELL && uiSignal.type === StrategySignalType.BUY));

      if ((!currentOpenTrade || isClosingSignalForOpenTrade) && 
          this._shouldEnterPosition(latestSignalForAction, confidence)) {
        
        const side = latestSignalForAction.type === 'CUS' ? OrderSide.BUY : OrderSide.SELL;
        // Example: Add a config check for allowing shorting
        // if (latestSignalForAction.type === 'CUS' || (latestSignalForAction.type === 'CDS' && currentConfig.allowShorting)) {
        if (latestSignalForAction.type === 'CUS' || latestSignalForAction.type === 'CDS') { // Assuming shorting is allowed for CDS
             uiSignal = this._openConceptualPosition(latestSignalForAction, mainBar, contractId, side, allMainBars);
        }
      }
    }
    
    const lastTrackedSignal = this.trackedTrendSignals.length > 0 ? this.trackedTrendSignals[this.trackedTrendSignals.length - 1] : null;
    if (lastTrackedSignal) {
        this._currentTrendDirection = lastTrackedSignal.type === 'CUS' ? 'UP' : 'DOWN';
        this.updateIndicatorValue('trendStrength', lastTrackedSignal.confidence || 0);
        this._lastSignalTime = allMainBars[lastTrackedSignal.barIndex]?.time || (0 as UTCTimestamp);
        this._lastSignalType = lastTrackedSignal.type;
        this._lastSignalRule = lastTrackedSignal.rule || 'N/A';
    } else {
        this._currentTrendDirection = 'NONE';
        this.updateIndicatorValue('trendStrength', 0);
        this._lastSignalTime = 0 as UTCTimestamp;
        this._lastSignalType = 'NONE';
        this._lastSignalRule = 'N/A';
    }
    this.updateIndicatorValue('lastSignalTimestamp', this._lastSignalTime);

    return { 
      signal: uiSignal, 
      indicators: this.getCurrentIndicators() || {}, 
      filledOrders 
    };
  }

  private _handleFilledOrder(order: Order, mainBar: BacktestBarData): void {
    const openTrade = this.getOpenTrade(); // This is SimulatedTrade | null from BaseStrategy

    if (openTrade && openTrade.entryOrder?.id === order.id && order.status === OrderStatus.FILLED) {
      // Entry order filled
      this.onOrderFilled(order, openTrade); // Call BaseStrategy's hook (places SL/TP)
      // Update our conceptual trade with actual fill details
      openTrade.entryOrder = {...order}; // Store a copy of the filled order
      openTrade.entryPrice = order.filledPrice!; 
      openTrade.entryTime = order.filledTime!;   
    } else if (openTrade && openTrade.status === 'OPEN' &&
               (order.parentTradeId === openTrade.id || order.tradeId === openTrade.id)) {
      // An order related to our open conceptual trade has been filled
      const isExitOrderSide = (openTrade.type === TradeType.BUY && order.side === OrderSide.SELL) ||
                              (openTrade.type === TradeType.SELL && order.side === OrderSide.BUY);
      
      if (isExitOrderSide && (order.status === OrderStatus.FILLED || order.status === OrderStatus.PARTIALLY_FILLED )) {
        // This is an exit fill (SL, TP, or strategy-initiated exit)
        this.closeTrade( // BaseStrategy's method to finalize the conceptual trade
            openTrade, 
            order.filledPrice!, 
            order.filledTime!, 
            order, // The filled exit order
            undefined, // No new strategy signal triggered this exit directly (it was an order fill)
            order.isStopLoss ? 'STOP_LOSS' : order.isTakeProfit ? 'TAKE_PROFIT' : 'SIGNAL' // Determine reason
        );
      }
    }
  }

  private _processNewTrendSignals(identifiedSignals: TrendLibSignal[]): StrategyTrendSignal[] {
    const newStrategySignals: StrategyTrendSignal[] = [];
    const existingSignalKeys = new Set(this.trackedTrendSignals.map(s => `${s.barIndex}-${s.type}-${s.rule}`));
    
    identifiedSignals.forEach(libSignal => {
      const signalKey = `${libSignal.barIndex}-${libSignal.type}-${libSignal.rule}`;
      if (!existingSignalKeys.has(signalKey)) {
        const strategySignal: StrategyTrendSignal = { ...libSignal };
        this.trackedTrendSignals.push(strategySignal);
        newStrategySignals.push(strategySignal);
      }
    });
    this.trackedTrendSignals.sort((a,b) => a.barIndex - b.barIndex);
    return newStrategySignals.sort((a,b) => a.barIndex - b.barIndex);
  }
  
  private _openConceptualPosition(
    trendSignal: StrategyTrendSignal, 
    currentMainBar: BacktestBarData,
    contractId: string,
    side: OrderSide,
    allMainBars: BacktestBarData[]
  ): StrategySignal | null {
    const signalBar = allMainBars[trendSignal.barIndex]; 
    if (!signalBar) {
        console.warn(`[TrendStartStrategy] Signal bar not found for trend signal at index ${trendSignal.barIndex}`);
        return null;
    }
    
    const currentConfig = this.config as TrendStartStrategyConfig;
    const conceptualEntryPrice = currentConfig.useMarketOrders ? currentMainBar.open : signalBar.close; 
    const orderType = currentConfig.useMarketOrders ? OrderType.MARKET : OrderType.LIMIT;
    
    const quantity = this.calculatePositionSize(currentMainBar); 
    if (quantity <= 0) return null;

    // Create the conceptual trade first to get its ID
    const conceptualTrade = this.createTrade( 
      side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      conceptualEntryPrice, 
      quantity,
      currentMainBar.time, 
      undefined, // Placeholder for entryOrder, will be set below
      { type: side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL, barIndex: trendSignal.barIndex, time: signalBar.time, price: trendSignal.price, message: trendSignal.rule }
    );
    const conceptualTradeId = conceptualTrade.id;

    let entryOrder: Order;
    if (orderType === OrderType.MARKET) {
      // Pass conceptualTradeId as the tradeId argument, which BaseStrategy helpers will use as parentTradeId
      entryOrder = this.createMarketOrder(side, quantity, currentMainBar, conceptualTradeId, contractId, true, false); // isEntry: true, isExit: false
    } else { 
      let limitPrice = conceptualEntryPrice;
      if (currentConfig.limitOrderOffsetTicks) {
        const tickSize = this.orderManager.getTickSize();
        limitPrice = side === OrderSide.BUY 
          ? conceptualEntryPrice - (currentConfig.limitOrderOffsetTicks * tickSize)
          : conceptualEntryPrice + (currentConfig.limitOrderOffsetTicks * tickSize);
      }
      entryOrder = this.createLimitOrder(side, quantity, limitPrice, currentMainBar, conceptualTradeId, contractId, true, false); // isEntry: true, isExit: false
    }
    entryOrder.message = `Entry ${side === OrderSide.BUY ? 'BUY' : 'SELL'} - Rule: ${trendSignal.rule}`;
        
    // Link the actual submitted order to the conceptual trade
    if (this.openTrade && this.openTrade.id === conceptualTradeId) {
      this.openTrade.entryOrder = entryOrder;
      if (entryOrder.type === OrderType.LIMIT && entryOrder.price) {
        this.openTrade.entryPrice = entryOrder.price;
      }
    }
    
    const uiSignal: StrategySignal = {
      barIndex: currentMainBar.originalIndex !== undefined ? currentMainBar.originalIndex : trendSignal.barIndex,
      time: currentMainBar.time,
      type: side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
      price: conceptualEntryPrice, 
      message: `Entry ${side === OrderSide.BUY ? 'BUY' : 'SELL'} signal: ${trendSignal.rule}`
    };
    this.recordSignal(uiSignal); 
    return uiSignal;
  }

  private _closeConceptualPosition(
    tradeToClose: SimulatedTrade, 
    mainBar: BacktestBarData,
    triggeringSignal: StrategyTrendSignal, 
    reason: string
  ): StrategySignal | null {
    if (!tradeToClose || tradeToClose.status !== 'OPEN') {
      return null;
    }

    const exitSide = tradeToClose.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY;
    const conceptualExitPrice = mainBar.open; 
    const contractId = tradeToClose.entryOrder?.contractId || (this.config as TrendStartStrategyConfig).contractId || 'DEFAULT_CONTRACT';

    // Cancel any existing SL/TP orders associated with this conceptual trade
    this.orderManager.cancelOrdersByTradeId(tradeToClose.id); 

    // Submit a market order to exit the position
    const exitOrder = this.createMarketOrder( 
      exitSide,
      tradeToClose.size, 
      mainBar,
      tradeToClose.id, // Link this exit order to the conceptual trade ID
      contractId,
      false, // isEntry: false
      true   // isExit: true
    );
    exitOrder.message = `Closing trade ${tradeToClose.id}: ${reason}`;
    // The actual closing (P&L calculation, etc.) will happen in _handleFilledOrder 
    // when this market order is filled. BaseStrategy.closeTrade will be called there.
        
    const uiSignal: StrategySignal = {
      barIndex: mainBar.originalIndex !== undefined ? mainBar.originalIndex : triggeringSignal.barIndex,
      time: mainBar.time,
      type: exitSide === OrderSide.SELL ? StrategySignalType.SELL : StrategySignalType.BUY,
      price: conceptualExitPrice,
      message: `Exit ${exitSide} signal: ${reason}`
    };
    this.recordSignal(uiSignal);
    return uiSignal;
  }

  public getTrendSignals(): StrategyTrendSignal[] {
    return this.trackedTrendSignals;
  }

  public getStatusIndicators(): TrendStartStatusIndicators {
      return {
          trendDirection: this._currentTrendDirection,
          lastSignalTime: this._lastSignalTime,
          lastSignalType: this._lastSignalType,
          lastSignalRule: this._lastSignalRule,
      };
  }

  private _shouldEnterPosition(
    signal: StrategyTrendSignal, 
    confidence: number
  ): boolean {
    const currentConfig = this.config as TrendStartStrategyConfig;
    if (!currentConfig.confidenceThreshold || confidence < currentConfig.confidenceThreshold) return false;
    
    // Only enter if no open trade or if the signal is for the opposite direction of a just-closed trade (reversal)
    if (signal.type === 'CUS') { 
      return !this.getOpenTrade(); 
    }
    // Example: Allow shorting on CDS if configured
    // if (signal.type === 'CDS' && currentConfig.allowShorting) {
    //   return !this.getOpenTrade();
    // }
    if (signal.type === 'CDS') { // Basic shorting on CDS
        return !this.getOpenTrade();
    }
    return false;
  }

  private _shouldExitPosition(
    signal: StrategyTrendSignal,
    currentConceptualTrade: SimulatedTrade | null
  ): boolean {
    if (!currentConceptualTrade || currentConceptualTrade.status !== 'OPEN') return false;
    
    // Exit long if CDS signal
    if (signal.type === 'CDS' && currentConceptualTrade.type === TradeType.BUY) {
      return true;
    }
    // Exit short if CUS signal
    if (signal.type === 'CUS' && currentConceptualTrade.type === TradeType.SELL) {
      return true; 
    }
    return false;
  }
}
