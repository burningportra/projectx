import { TrendStartStrategyConfig } from '../config/TrendStartStrategyConfig';
import { TrendStartStrategyRefactored } from '../TrendStartStrategyRefactored';
import { ITrendStartStrategy, TrendStartStrategyFactory } from '../interfaces/ITrendStartStrategy';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';
import { MessageBus } from '@/lib/MessageBus';

/**
 * Factory for creating TrendStartStrategy instances
 * 
 * This factory follows NautilusTrader's architecture by:
 * - Providing a clean way to create strategy instances
 * - Handling dependency injection
 * - Ensuring proper initialization
 * - Supporting configuration validation
 * - Enabling easy testing with mock dependencies
 */
export class TrendStartStrategyFactoryImpl {
  private orderManager: OrderManager;
  private trendIdentifier: TrendIdentifier;
  private messageBus: MessageBus;

  constructor(
    orderManager: OrderManager,
    trendIdentifier: TrendIdentifier,
    messageBus: MessageBus
  ) {
    this.orderManager = orderManager;
    this.trendIdentifier = trendIdentifier;
    this.messageBus = messageBus;
  }

  /**
   * Create a new TrendStartStrategy instance
   */
  public create(config: Partial<TrendStartStrategyConfig>): ITrendStartStrategy {
    // Create the strategy instance
    const strategy = new TrendStartStrategyRefactored(
      config,
      this.orderManager,
      this.trendIdentifier,
      this.messageBus
    );

    return strategy;
  }

  /**
   * Create and initialize a strategy instance
   */
  public createAndInitialize(config: Partial<TrendStartStrategyConfig>): ITrendStartStrategy {
    const strategy = this.create(config);
    strategy.initialize();
    return strategy;
  }

  /**
   * Create, initialize, and start a strategy instance
   */
  public createAndStart(config: Partial<TrendStartStrategyConfig>): ITrendStartStrategy {
    const strategy = this.createAndInitialize(config);
    strategy.start();
    return strategy;
  }
}

/**
 * Create a factory function with bound dependencies
 */
export function createTrendStartStrategyFactory(
  orderManager: OrderManager,
  trendIdentifier: TrendIdentifier,
  messageBus: MessageBus
): TrendStartStrategyFactory {
  const factory = new TrendStartStrategyFactoryImpl(
    orderManager,
    trendIdentifier,
    messageBus
  );

  return (config: Partial<TrendStartStrategyConfig>) => factory.create(config);
} 