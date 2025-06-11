import { OrderType, OrderSide } from '../../types/backtester';
import {
  StrategyDefinition,
  StrategyFunction,
  StrategyContext,
  IndicatorValues,
  StrategyConfig,
  StrategyResult,
  StrategySignals,
  StrategyActions,
  StrategyUtils,
  StrategySignalType,
} from '../StrategyFramework';

/**
 * Configuration for EMA Crossover Strategy
 */
export interface EMACrossoverConfig extends StrategyConfig {
  // EMA periods
  fastPeriod: number;
  slowPeriod: number;
  
  // Position sizing
  positionSize: number;
  riskPercent: number; // Risk per trade as % of account
  
  // Risk management
  stopLossPercent: number;
  takeProfitPercent: number;
  
  // Entry conditions
  requireVolumeConfirmation: boolean;
  minimumVolume: number;
  requireTrendConfirmation: boolean;
  
  // Position management
  allowReversals: boolean; // Allow long->short transitions
  maxPositions: number;
  
  // Filters
  minPriceMove: number; // Minimum price movement to consider signal
  cooldownBars: number; // Bars to wait after a trade before next signal
}

/**
 * Internal state for EMA Crossover Strategy
 */
interface EMACrossoverState {
  lastSignalBar: number;
  lastSignalType: StrategySignalType | null;
  consecitiveBullishBars: number;
  consecitiveBearishBars: number;
  lastEMAFast: number | null;
  lastEMASlow: number | null;
  lastCrossover: 'bullish' | 'bearish' | null;
  entryPrice: number | null;
  tradeCount: number;
  lastTradeBar: number;
}

/**
 * Pure EMA Crossover Strategy Function
 * 
 * This strategy:
 * 1. Uses EMA 12/26 crossover for signals
 * 2. Enters long when fast EMA crosses above slow EMA
 * 3. Enters short when fast EMA crosses below slow EMA
 * 4. Uses bracket orders for automatic risk management
 * 5. Includes various filters and confirmations
 */
export const emaCrossoverStrategy: StrategyFunction = (
  context: StrategyContext,
  indicators: IndicatorValues,
  config: StrategyConfig
): StrategyResult => {
  // Cast config to our specific type
  const strategyConfig = config as EMACrossoverConfig;
  // Initialize result
  const result: StrategyResult = {
    signals: [],
    actions: [],
    stateUpdates: {},
    debug: {
      reasoning: '',
      computedValues: {},
      performance: {},
    },
  };

  // Get current state
  const state = context.strategyState as EMACrossoverState;
  const currentBar = context.currentBar;
  const barIndex = context.currentBarIndex;

  // Initialize state if needed
  if (!state.lastSignalBar) {
    result.stateUpdates = {
      lastSignalBar: -1,
      lastSignalType: null,
      consecitiveBullishBars: 0,
      consecitiveBearishBars: 0,
      lastEMAFast: null,
      lastEMASlow: null,
      lastCrossover: null,
      entryPrice: null,
      tradeCount: 0,
      lastTradeBar: -1,
    };
  }

  // Get EMA values
  const emaFast = indicators[`EMA_${strategyConfig.fastPeriod}`] as number;
  const emaSlow = indicators[`EMA_${strategyConfig.slowPeriod}`] as number;

  if (!emaFast || !emaSlow) {
    result.debug!.reasoning = 'Missing EMA indicators';
    return result;
  }

  // Store computed values for debugging
  result.debug!.computedValues = {
    emaFast,
    emaSlow,
    spread: emaFast - emaSlow,
    spreadPercent: ((emaFast - emaSlow) / emaSlow) * 100,
    volume: currentBar.volume || 0,
    price: currentBar.close,
  };

  // Check if we're in cooldown period
  if (state.lastTradeBar >= 0 && barIndex - state.lastTradeBar < strategyConfig.cooldownBars) {
    result.debug!.reasoning = `In cooldown period (${barIndex - state.lastTradeBar}/${strategyConfig.cooldownBars} bars)`;
    return result;
  }

  // Detect crossover
  let crossoverType: 'bullish' | 'bearish' | null = null;
  
  if (state.lastEMAFast && state.lastEMASlow) {
    const previousSpread = state.lastEMAFast - state.lastEMASlow;
    const currentSpread = emaFast - emaSlow;
    
    // Bullish crossover: fast EMA crosses above slow EMA
    if (previousSpread <= 0 && currentSpread > 0) {
      crossoverType = 'bullish';
    }
    // Bearish crossover: fast EMA crosses below slow EMA
    else if (previousSpread >= 0 && currentSpread < 0) {
      crossoverType = 'bearish';
    }
  }

  // Update EMA state
  result.stateUpdates.lastEMAFast = emaFast;
  result.stateUpdates.lastEMASlow = emaSlow;
  
  if (crossoverType) {
    result.stateUpdates.lastCrossover = crossoverType;
  }

  // Apply filters
  let signalValid = crossoverType !== null;
  let filterReasons: string[] = [];

  if (signalValid && crossoverType) {
    // Volume confirmation
    if (strategyConfig.requireVolumeConfirmation) {
      const volume = currentBar.volume || 0;
      if (volume < strategyConfig.minimumVolume) {
        signalValid = false;
        filterReasons.push(`Low volume: ${volume} < ${strategyConfig.minimumVolume}`);
      }
    }

    // Minimum price movement
    const priceChange = Math.abs(currentBar.close - currentBar.open) / currentBar.open * 100;
    if (priceChange < strategyConfig.minPriceMove) {
      signalValid = false;
      filterReasons.push(`Small price move: ${priceChange.toFixed(2)}% < ${strategyConfig.minPriceMove}%`);
    }

    // Trend confirmation
    if (strategyConfig.requireTrendConfirmation) {
      const trend = emaFast > emaSlow ? 'bullish' : 'bearish';
      if (crossoverType !== trend) {
        signalValid = false;
        filterReasons.push(`Trend confirmation failed: crossover=${crossoverType}, trend=${trend}`);
      }
    }
  }

  // Check current positions
  const hasLongPosition = StrategyUtils.hasPosition(context, OrderSide.BUY);
  const hasShortPosition = StrategyUtils.hasPosition(context, OrderSide.SELL);
  const hasAnyPosition = hasLongPosition || hasShortPosition;

  // Generate signals and actions
  if (signalValid && crossoverType) {
    const entryPrice = currentBar.close;
    const stopLossPrice = crossoverType === 'bullish' 
      ? entryPrice * (1 - strategyConfig.stopLossPercent / 100)
      : entryPrice * (1 + strategyConfig.stopLossPercent / 100);
    
    const takeProfitPrice = crossoverType === 'bullish'
      ? entryPrice * (1 + strategyConfig.takeProfitPercent / 100)
      : entryPrice * (1 - strategyConfig.takeProfitPercent / 100);

    // Calculate position size
    let positionSize: number;
    if (strategyConfig.riskPercent > 0) {
      positionSize = StrategyUtils.calculatePositionSize(
        context.accountBalance,
        entryPrice,
        stopLossPrice,
        strategyConfig.riskPercent
      );
    } else {
      positionSize = strategyConfig.positionSize;
    }

    // Ensure we don't exceed maximum positions
    if (!hasAnyPosition || (strategyConfig.allowReversals && hasAnyPosition)) {
      if (crossoverType === 'bullish') {
        // Close short position if we have one and reversals are allowed
        if (hasShortPosition && strategyConfig.allowReversals) {
          result.signals.push(StrategySignals.closeShort(
            entryPrice,
            0.8,
            'EMA bullish crossover - closing short position'
          ));
        }

        // Open long position
        if (!hasLongPosition) {
          result.signals.push(StrategySignals.buy(
            entryPrice,
            0.9,
            `EMA bullish crossover: ${strategyConfig.fastPeriod}/${strategyConfig.slowPeriod}`,
            { crossoverType, emaFast, emaSlow }
          ));

          result.actions.push(StrategyActions.submitBracketOrder(
            OrderSide.BUY,
            positionSize,
            OrderType.MARKET,
            undefined,
            stopLossPrice,
            takeProfitPrice,
            {
              strategy: 'ema_crossover',
              crossoverType,
              entryReason: 'bullish_crossover',
            }
          ));
        }
      } else if (crossoverType === 'bearish') {
        // Close long position if we have one and reversals are allowed
        if (hasLongPosition && strategyConfig.allowReversals) {
          result.signals.push(StrategySignals.closeLong(
            entryPrice,
            0.8,
            'EMA bearish crossover - closing long position'
          ));
        }

        // Open short position
        if (!hasShortPosition) {
          result.signals.push(StrategySignals.sell(
            entryPrice,
            0.9,
            `EMA bearish crossover: ${strategyConfig.fastPeriod}/${strategyConfig.slowPeriod}`,
            { crossoverType, emaFast, emaSlow }
          ));

          result.actions.push(StrategyActions.submitBracketOrder(
            OrderSide.SELL,
            positionSize,
            OrderType.MARKET,
            undefined,
            stopLossPrice,
            takeProfitPrice,
            {
              strategy: 'ema_crossover',
              crossoverType,
              entryReason: 'bearish_crossover',
            }
          ));
        }
      }

      // Update state
      result.stateUpdates.lastSignalBar = barIndex;
      result.stateUpdates.lastSignalType = crossoverType === 'bullish' ? StrategySignalType.BUY : StrategySignalType.SELL;
      result.stateUpdates.lastTradeBar = barIndex;
      result.stateUpdates.tradeCount = (state.tradeCount || 0) + 1;
      result.stateUpdates.entryPrice = entryPrice;

      result.debug!.reasoning = `${crossoverType.toUpperCase()} crossover detected and executed`;
    } else {
      result.debug!.reasoning = `${crossoverType.toUpperCase()} crossover detected but max positions reached`;
    }
  } else if (crossoverType) {
    result.debug!.reasoning = `${crossoverType.toUpperCase()} crossover detected but filtered out: ${filterReasons.join(', ')}`;
  } else {
    result.debug!.reasoning = 'No crossover detected';
  }

  // Add logging action for debugging
  if (crossoverType || hasAnyPosition) {
    result.actions.push(StrategyActions.logMessage(
      'info',
      result.debug!.reasoning,
      {
        barIndex,
        crossoverType,
        hasPosition: hasAnyPosition,
        emaFast,
        emaSlow,
        filters: filterReasons,
      }
    ));
  }

  return result;
};

/**
 * EMA Crossover Strategy Definition
 */
export const emaCrossoverStrategyDefinition: StrategyDefinition = {
  id: 'ema_crossover',
  name: 'EMA Crossover Strategy',
  description: 'A classic trend-following strategy using exponential moving average crossovers with automatic risk management',
  version: '1.0.0',
  author: 'Backtester v3',

  execute: emaCrossoverStrategy,

  requiredIndicators: ['EMA_12', 'EMA_26'],

  configSchema: {
    fastPeriod: {
      type: 'number',
      default: 12,
      description: 'Fast EMA period',
      min: 1,
      max: 100,
    },
    slowPeriod: {
      type: 'number',
      default: 26,
      description: 'Slow EMA period',
      min: 2,
      max: 200,
    },
    positionSize: {
      type: 'number',
      default: 100,
      description: 'Fixed position size (shares)',
      min: 1,
      max: 10000,
    },
    riskPercent: {
      type: 'number',
      default: 2.0,
      description: 'Risk per trade as % of account (0 = use fixed size)',
      min: 0,
      max: 10,
    },
    stopLossPercent: {
      type: 'number',
      default: 2.0,
      description: 'Stop loss as % of entry price',
      min: 0.1,
      max: 20,
    },
    takeProfitPercent: {
      type: 'number',
      default: 4.0,
      description: 'Take profit as % of entry price',
      min: 0.1,
      max: 50,
    },
    requireVolumeConfirmation: {
      type: 'boolean',
      default: true,
      description: 'Require minimum volume for signal confirmation',
    },
    minimumVolume: {
      type: 'number',
      default: 10000,
      description: 'Minimum volume required for signals',
      min: 0,
    },
    requireTrendConfirmation: {
      type: 'boolean',
      default: false,
      description: 'Require trend to match crossover direction',
    },
    allowReversals: {
      type: 'boolean',
      default: true,
      description: 'Allow position reversals (long to short)',
    },
    maxPositions: {
      type: 'number',
      default: 1,
      description: 'Maximum number of concurrent positions',
      min: 1,
      max: 10,
    },
    minPriceMove: {
      type: 'number',
      default: 0.5,
      description: 'Minimum price movement % to consider signal',
      min: 0,
      max: 10,
    },
    cooldownBars: {
      type: 'number',
      default: 3,
      description: 'Bars to wait after trade before next signal',
      min: 0,
      max: 50,
    },
  },

  defaultConfig: {
    fastPeriod: 12,
    slowPeriod: 26,
    positionSize: 100,
    riskPercent: 2.0,
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    requireVolumeConfirmation: true,
    minimumVolume: 10000,
    requireTrendConfirmation: false,
    allowReversals: true,
    maxPositions: 1,
    minPriceMove: 0.5,
    cooldownBars: 3,
  },

  defaultRiskManagement: {
    maxPositionSize: 1000,
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    maxDrawdown: 10.0,
  },
}; 