import { OrderManager } from '../OrderManager';
import { BaseStrategy } from './BaseStrategy';
import { BaseStrategyConfig, IStrategy, StrategyResult } from '../types/strategy';
import { 
  BacktestBarData, 
  SimulatedTrade, 
  OrderSide, 
  StrategySignal, 
  StrategySignalType,
  Order,
  OrderStatus,
  TradeType,
  SubBarData // Added SubBarData import
  // Add other necessary types from backtester, e.g., OrderType
} from '../types/backtester';
import { IIndicator } from '../types/indicator'; // Import IIndicator

// --- Stage Interfaces for Fluent Builder ---

/**
 * Initial stage for providing the strategy name.
 */
interface INameStage {
  /**
   * Sets the name for the strategy.
   * @param name - The name of the strategy.
   * @returns The next stage in the builder for setting the description.
   */
  withName(name: string): IDescriptionStage;
}

/**
 * Stage for providing the strategy description.
 */
interface IDescriptionStage {
  /**
   * Sets the description for the strategy.
   * @param description - A brief description of the strategy.
   * @returns The next stage in the builder for setting the version.
   */
  withDescription(description: string): IVersionStage;
}

/**
 * Stage for providing the strategy version.
 */
interface IVersionStage {
  /**
   * Sets the version for the strategy.
   * @param version - The version string (e.g., "1.0.0").
   * @returns The next stage, allowing for indicator addition or proceeding to entry conditions.
   */
  withVersion(version: string): IOptionalIndicatorStage;
}

/**
 * Stage for optionally adding indicators or defining the entry condition.
 * Allows chaining multiple `addIndicator` calls or moving to `withEntryCondition`.
 */
interface IOptionalIndicatorStage {
  /**
   * Adds an indicator to the strategy.
   * @param name - A unique name for this indicator instance within the strategy.
   * @param indicatorClass - The constructor of the indicator class.
   * @param params - An object containing parameters for the indicator's constructor.
   * @returns The same stage, allowing for more indicators to be added.
   */
  addIndicator(name: string, indicatorClass: new (...args: any[]) => IIndicator, params: Record<string, any>): IOptionalIndicatorStage;
  /**
   * Defines the entry condition for the strategy.
   * @param condition - A function that takes current indicator values and bar data, returning true to signal entry.
   * @returns The next stage for defining the exit condition.
   */
  withEntryCondition(condition: (indicators: Record<string, any>, bar: BacktestBarData) => boolean): IExitConditionStage;
}

/**
 * Stage for defining the strategy's entry condition.
 * This stage is typically reached after `addIndicator` or directly from `withVersion`.
 */
interface IEntryConditionStage {
  /**
   * Defines the entry condition for the strategy.
   * @param condition - A function that takes current indicator values and bar data, returning true to signal entry.
   * @returns The next stage for defining the exit condition.
   */
   withEntryCondition(condition: (indicators: Record<string, any>, bar: BacktestBarData) => boolean): IExitConditionStage;
}

/**
 * Stage for defining the strategy's exit condition.
 */
interface IExitConditionStage {
  /**
   * Defines the exit condition for the strategy.
   * @param condition - A function that takes current indicator values, bar data, and the current open trade (if any), returning true to signal exit.
   * @returns The next stage for optionally defining risk management parameters or building the strategy.
   */
  withExitCondition(condition: (indicators: Record<string, any>, bar: BacktestBarData, openTrade: SimulatedTrade | null) => boolean): IOptionalRiskStage;
}

/**
 * Stage for optionally defining risk management parameters (stop-loss, take-profit, position sizing)
 * and for finally building the strategy.
 * Allows chaining multiple risk parameter methods or calling `build`.
 */
interface IOptionalRiskStage {
  /**
   * Sets stop-loss parameters for the strategy.
   * @param params - An object specifying stop-loss by percentage or ticks.
   * @returns The same stage, allowing for more risk parameters or building.
   */
  withStopLoss(params: { percent?: number; ticks?: number }): IOptionalRiskStage;
  /**
   * Sets take-profit parameters for the strategy.
   * @param params - An object specifying take-profit by percentage or ticks.
   * @returns The same stage, allowing for more risk parameters or building.
   */
  withTakeProfit(params: { percent?: number; ticks?: number }): IOptionalRiskStage;
  /**
   * Sets position sizing parameters for the strategy.
   * @param params - An object specifying position sizing (e.g., fixed size).
   * @returns The same stage, allowing for more risk parameters or building.
   */
  withPositionSizing(params: { fixedSize?: number; /* TODO: add other sizing options like percentOfEquity */ }): IOptionalRiskStage;
  /**
   * Builds and returns the configured strategy instance.
   * This method should only be callable when all mandatory configuration steps are complete.
   * @returns An instance of `IStrategy`.
   * @throws Error if mandatory configuration is missing.
   */
  build(): IStrategy;
}

// --- Internal Indicator Configuration Store ---
interface IndicatorConfig {
  name: string;
  indicatorClass: new (...args: any[]) => IIndicator; // Use IIndicator type
  params: Record<string, any>;
}

/**
 * Implements a fluent builder pattern for creating trading strategies.
 * This class guides the user through a series of steps to configure and build
 * a strategy instance that extends `BaseStrategy`.
 * 
 * Usage:
 * ```typescript
 * const orderManager = new OrderManager(); // Assuming OrderManager is set up
 * const myStrategy = StrategyFluentBuilder.create(orderManager)
 *   .withName("MyCoolStrategy")
 *   .withDescription("Description of my strategy")
 *   .withVersion("1.0.0")
 *   .addIndicator("emaSlow", EMACalculator, { period: 50 })
 *   .addIndicator("emaFast", EMACalculator, { period: 20 })
 *   .withEntryCondition((inds, bar) => inds.emaFast > inds.emaSlow)
 *   .withExitCondition((inds, bar, trade) => inds.emaFast < inds.emaSlow)
 *   .withStopLoss({ percent: 2 })
 *   .withPositionSizing({ fixedSize: 100 })
 *   .build();
 * ```
 */
export class StrategyFluentBuilder implements 
  INameStage, IDescriptionStage, IVersionStage, 
  IOptionalIndicatorStage, IEntryConditionStage, IExitConditionStage, 
  IOptionalRiskStage {

  private config: Partial<BaseStrategyConfig & { contractId?: string }> = {};
  private indicatorConfigs: IndicatorConfig[] = [];
  private entryLogic?: (indicators: Record<string, any>, bar: BacktestBarData) => boolean;
  private exitLogic?: (indicators: Record<string, any>, bar: BacktestBarData, openTrade: SimulatedTrade | null) => boolean;
  
  private orderManager: OrderManager;

  private constructor(orderManager: OrderManager) {
    this.orderManager = orderManager;
  }

  /**
   * Static factory method to begin the builder chain.
   * @param orderManager - An instance of OrderManager to be used by the built strategy.
   * @returns The first stage of the builder (`INameStage`).
   */
  public static create(orderManager: OrderManager): INameStage {
    return new StrategyFluentBuilder(orderManager);
  }

  /** Implements {@link INameStage.withName} */
  withName(name: string): IDescriptionStage {
    this.config.name = name;
    return this;
  }

  /** Implements {@link IDescriptionStage.withDescription} */
  withDescription(description: string): IVersionStage {
    this.config.description = description;
    return this;
  }

  /** Implements {@link IVersionStage.withVersion} */
  withVersion(version: string): IOptionalIndicatorStage {
    this.config.version = version;
    return this;
  }

  /** Implements {@link IOptionalIndicatorStage.addIndicator} */
  addIndicator(name: string, indicatorClass: new (...args: any[]) => IIndicator, params: Record<string, any>): IOptionalIndicatorStage {
    this.indicatorConfigs.push({ name, indicatorClass, params });
    return this;
  }

  /** Implements {@link IOptionalIndicatorStage.withEntryCondition} and {@link IEntryConditionStage.withEntryCondition} */
  withEntryCondition(condition: (indicators: Record<string, any>, bar: BacktestBarData) => boolean): IExitConditionStage {
    if (!condition) throw new Error("Entry condition logic must be provided.");
    this.entryLogic = condition;
    return this;
  }

  /** Implements {@link IExitConditionStage.withExitCondition} */
  withExitCondition(condition: (indicators: Record<string, any>, bar: BacktestBarData, openTrade: SimulatedTrade | null) => boolean): IOptionalRiskStage {
    if (!condition) throw new Error("Exit condition logic must be provided.");
    this.exitLogic = condition;
    return this;
  }

  /** Implements {@link IOptionalRiskStage.withStopLoss} */
  withStopLoss(params: { percent?: number; ticks?: number }): IOptionalRiskStage {
    if (params.percent !== undefined) this.config.stopLossPercent = params.percent;
    if (params.ticks !== undefined) this.config.stopLossTicks = params.ticks;
    return this;
  }

  /** Implements {@link IOptionalRiskStage.withTakeProfit} */
  withTakeProfit(params: { percent?: number; ticks?: number }): IOptionalRiskStage {
    if (params.percent !== undefined) this.config.takeProfitPercent = params.percent;
    if (params.ticks !== undefined) this.config.takeProfitTicks = params.ticks;
    return this;
  }
  
  /** Implements {@link IOptionalRiskStage.withPositionSizing} */
  withPositionSizing(params: { fixedSize?: number }): IOptionalRiskStage {
    if (params.fixedSize !== undefined) {
        this.config.positionSize = params.fixedSize;
    }
    return this;
  }

  /** Implements {@link IOptionalRiskStage.build} */
  build(): IStrategy {
    if (!this.config.name || !this.config.description || !this.config.version) {
      throw new Error("Strategy name, description, and version are required.");
    }
    if (!this.entryLogic) {
        throw new Error("Entry condition logic is required.");
    }
    if (!this.exitLogic) {
        throw new Error("Exit condition logic is required.");
    }

    // Ensure default commission and positionSize if not set by risk/sizing methods
    this.config.commission = this.config.commission ?? 0;
    this.config.positionSize = this.config.positionSize ?? 1;


    const finalConfig = this.config as BaseStrategyConfig;
    const om = this.orderManager; // Capture for closure
    const indConfigs = [...this.indicatorConfigs]; // Capture for closure
    const entryL = this.entryLogic!; // Capture for closure
    const exitL = this.exitLogic!; // Capture for closure
    
    const DynamicStrategy = class extends BaseStrategy {
      private localIndicators: Record<string, IIndicator> = {}; // Use IIndicator type

      constructor() {
        super(om, finalConfig); // Pass captured OrderManager and config
        indConfigs.forEach(ic => {
          // This assumes indicator constructors take parameters as a spread array.
          // A more robust way might be to pass params as an object if constructors support it,
          // or have a convention.
          this.localIndicators[ic.name] = new ic.indicatorClass(...Object.values(ic.params));
        });
      }

      getName(): string { return finalConfig.name!; }
      getDescription(): string { return finalConfig.description!; }
      getVersion(): string { return finalConfig.version!; }

      protected onReset(): void {
        super.onReset(); // Call base reset
        for (const key in this.localIndicators) {
          if (typeof this.localIndicators[key].reset === 'function') {
            this.localIndicators[key].reset();
          }
        }
      }
      
      processBar(mainBar: BacktestBarData, subBars: SubBarData[] | undefined, barIndex: number, allMainBars: BacktestBarData[]): StrategyResult {
        const currentIndicatorValues: Record<string, any> = {};
        for (const key in this.localIndicators) {
          this.localIndicators[key].update(mainBar); 
          const value = this.localIndicators[key].getValue();
          currentIndicatorValues[key] = value;
          this.updateIndicatorValue(key, value); 
        }
        
        let signal: StrategySignal | null = null;
        const filledOrdersThisBar: Order[] = [];

        const omFills = this.orderManager.processBar(mainBar, subBars, barIndex);
        omFills.forEach(fill => {
            filledOrdersThisBar.push(fill);
            const currentOpenTrade = this.getOpenTrade();
            if (currentOpenTrade && currentOpenTrade.entryOrder?.id === fill.id && fill.status === OrderStatus.FILLED) {
                this.onOrderFilled(fill, currentOpenTrade);
            }
            if (currentOpenTrade && currentOpenTrade.status === 'OPEN') {
                 // An exit fill will be on the opposite side of the trade's entry type
                 const isOppositeSide = (currentOpenTrade.type === TradeType.BUY && fill.side === OrderSide.SELL) ||
                                      (currentOpenTrade.type === TradeType.SELL && fill.side === OrderSide.BUY);
                 const isExitFillForThisTrade = (fill.parentTradeId === currentOpenTrade.id || fill.tradeId === currentOpenTrade.id) && isOppositeSide;

                if (isExitFillForThisTrade && (fill.status === OrderStatus.FILLED || fill.status === OrderStatus.PARTIALLY_FILLED)) {
                    // Check if this fill closes the trade (or part of it)
                    // The actual P&L is determined by OrderManager. BaseStrategy.closeTrade updates the conceptual trade.
                    this.closeTrade(currentOpenTrade, fill.filledPrice!, fill.filledTime!, fill, undefined, 
                                    fill.isStopLoss ? 'STOP_LOSS' : fill.isTakeProfit ? 'TAKE_PROFIT' : 'SIGNAL');
                }
            }
        });

        const openTrade = this.getOpenTrade(); // Re-fetch in case it was closed by SL/TP

        if (!openTrade && entryL(currentIndicatorValues, mainBar)) {
          const quantity = this.calculatePositionSize(mainBar);
          const contractId = finalConfig.contractId || 'DEFAULT_CONTRACT';
          const entryOrder = this.createMarketOrder(OrderSide.BUY, quantity, mainBar, undefined, contractId);
          signal = { type: StrategySignalType.BUY, price: mainBar.close, barIndex, time: mainBar.time };
          this.recordSignal(signal);
          const newTrade = this.createTrade(TradeType.BUY, mainBar.close, quantity, mainBar.time, entryOrder, signal);
          // Call onOrderFilled if the entry order was filled immediately by OrderManager in the same bar.
          // This requires checking if entryOrder is in filledOrdersThisBar.
          const entryFill = filledOrdersThisBar.find(f => f.id === entryOrder.id && f.status === OrderStatus.FILLED);
          if (entryFill) {
            this.onOrderFilled(entryFill, newTrade);
          }
        } else if (openTrade && exitL(currentIndicatorValues, mainBar, openTrade)) {
          const contractId = openTrade.entryOrder?.contractId || 'DEFAULT_CONTRACT';
          this.createMarketOrder(
            openTrade.type === TradeType.BUY ? OrderSide.SELL : OrderSide.BUY, 
            openTrade.size, 
            mainBar, 
            openTrade.id, 
            contractId
          );
          signal = { type: StrategySignalType.SELL, price: mainBar.close, barIndex, time: mainBar.time };
          this.recordSignal(signal);
        }

        return {
          signal,
          indicators: this.getCurrentIndicators() || {},
          filledOrders: filledOrdersThisBar
        };
      }
    };

    return new DynamicStrategy();
  }
}
