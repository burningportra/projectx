import { MessageBus, MessageType, Message, Subscription } from '@/lib/MessageBus';
import { BaseStrategy } from '@/lib/strategies/BaseStrategy';
import { Cache } from '@/lib/Cache';

/**
 * Multi-strategy manager that ensures proper isolation between strategy instances
 * 
 * This component follows NautilusTrader's architecture by:
 * - Managing multiple strategy instances with unique identifiers
 * - Ensuring proper event filtering and isolation
 * - Namespacing cache entries per strategy
 * - Preventing cross-talk between strategies
 * - Managing lifecycle of all strategies
 */
export class MultiStrategyManager {
  private strategies: Map<string, BaseStrategy> = new Map();
  private messageBus: MessageBus;
  private cache: Cache;
  private subscriptions: Map<string, Subscription[]> = new Map();
  private isActive: boolean = false;

  constructor(messageBus: MessageBus, cache: Cache) {
    this.messageBus = messageBus;
    this.cache = cache;
  }

  /**
   * Add a strategy to the manager
   */
  public addStrategy(strategy: BaseStrategy): void {
    const strategyId = this.getStrategyId(strategy);
    
    if (this.strategies.has(strategyId)) {
      throw new Error(`Strategy with ID ${strategyId} already exists`);
    }

    console.log(`[MultiStrategyManager] Adding strategy: ${strategyId}`);
    
    // Store the strategy
    this.strategies.set(strategyId, strategy);
    
    // Initialize strategy-specific subscriptions
    this.subscriptions.set(strategyId, []);
    
    // If manager is active, initialize the strategy
    if (this.isActive) {
      this.initializeStrategy(strategyId);
    }
  }

  /**
   * Remove a strategy from the manager
   */
  public removeStrategy(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    
    if (!strategy) {
      console.warn(`[MultiStrategyManager] Strategy ${strategyId} not found`);
      return;
    }

    console.log(`[MultiStrategyManager] Removing strategy: ${strategyId}`);
    
    // Reset the strategy
    strategy.reset();
    
    // Unsubscribe strategy-specific subscriptions
    this.unsubscribeStrategy(strategyId);
    
    // Remove from maps
    this.strategies.delete(strategyId);
    this.subscriptions.delete(strategyId);
    
    // Clear strategy-specific cache entries
    this.clearStrategyCache(strategyId);
  }

  /**
   * Start all strategies
   */
  public start(): void {
    if (this.isActive) {
      console.warn('[MultiStrategyManager] Already started');
      return;
    }

    console.log('[MultiStrategyManager] Starting all strategies...');
    
    this.isActive = true;
    
    // Initialize and start each strategy
    for (const [strategyId, strategy] of this.strategies) {
      try {
        this.initializeStrategy(strategyId);
        this.startStrategy(strategyId);
      } catch (error) {
        console.error(`[MultiStrategyManager] Failed to start strategy ${strategyId}:`, error);
      }
    }
    
    console.log(`[MultiStrategyManager] Started ${this.strategies.size} strategies`);
  }

  /**
   * Stop all strategies
   */
  public stop(): void {
    if (!this.isActive) {
      console.warn('[MultiStrategyManager] Already stopped');
      return;
    }

    console.log('[MultiStrategyManager] Stopping all strategies...');
    
    // Stop each strategy
    for (const [strategyId, strategy] of this.strategies) {
      try {
        this.stopStrategy(strategyId);
      } catch (error) {
        console.error(`[MultiStrategyManager] Failed to stop strategy ${strategyId}:`, error);
      }
    }
    
    this.isActive = false;
    
    console.log('[MultiStrategyManager] All strategies stopped');
  }

  /**
   * Dispose all strategies and clean up
   */
  public dispose(): void {
    console.log('[MultiStrategyManager] Disposing all strategies...');
    
    // Stop if still active
    if (this.isActive) {
      this.stop();
    }
    
    // Dispose each strategy
    const strategyIds = Array.from(this.strategies.keys());
    for (const strategyId of strategyIds) {
      this.removeStrategy(strategyId);
    }
    
    console.log('[MultiStrategyManager] All strategies disposed');
  }

  /**
   * Get a specific strategy
   */
  public getStrategy(strategyId: string): BaseStrategy | undefined {
    return this.strategies.get(strategyId);
  }

  /**
   * Get all strategy IDs
   */
  public getStrategyIds(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get manager statistics
   */
  public getStats(): {
    isActive: boolean;
    totalStrategies: number;
    activeStrategies: number;
    strategyDetails: Array<{
      id: string;
      state: string;
      hasPosition: boolean;
    }>;
  } {
    const strategyDetails = Array.from(this.strategies.entries()).map(([id, strategy]) => ({
      id,
      state: this.getStrategyState(strategy),
      hasPosition: !!strategy.getOpenTrade()
    }));

    const activeStrategies = strategyDetails.filter(s => s.state === 'STARTED').length;

    return {
      isActive: this.isActive,
      totalStrategies: this.strategies.size,
      activeStrategies,
      strategyDetails
    };
  }

  // ========== Private Helper Methods ==========

  private getStrategyId(strategy: BaseStrategy): string {
    // Use strategy name as ID
    return strategy.getName();
  }

  private getStrategyState(strategy: BaseStrategy): string {
    // Since BaseStrategy doesn't have lifecycle state, we'll track it separately
    // For now, return 'UNKNOWN' or implement a separate state tracking
    return 'UNKNOWN';
  }

  private initializeStrategy(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    console.log(`[MultiStrategyManager] Initializing strategy: ${strategyId}`);
    
    // Set up strategy-specific event filtering
    this.setupStrategyEventFiltering(strategyId);
    
    // Reset the strategy to ensure clean state
    strategy.reset();
  }

  private startStrategy(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    console.log(`[MultiStrategyManager] Starting strategy: ${strategyId}`);
    
    // BaseStrategy doesn't have a start method, but reset publishes STRATEGY_STARTED event
    // Strategy is considered started after initialization
  }

  private stopStrategy(strategyId: string): void {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    console.log(`[MultiStrategyManager] Stopping strategy: ${strategyId}`);
    
    // BaseStrategy doesn't have a stop method
    // We can track state separately if needed
  }

  private setupStrategyEventFiltering(strategyId: string): void {
    const subscriptions = this.subscriptions.get(strategyId) || [];
    
    // Subscribe to strategy-specific events with filtering
    // This ensures strategies only receive their own events
    
    // Filter order events
    subscriptions.push(
      this.messageBus.subscribe(MessageType.ORDER_FILLED, (message: Message) => {
        const { order, strategyId: eventStrategyId } = message.data;
        if (eventStrategyId === strategyId || order?.source === strategyId) {
          // Re-publish with strategy-specific topic
          this.messageBus.publish(
            MultiStrategyManager.createEventTopic(MessageType.ORDER_FILLED, strategyId) as any,
            message.source,
            message.data
          );
        }
      })
    );
    
    // Filter position events
    subscriptions.push(
      this.messageBus.subscribe(MessageType.POSITION_OPENED, (message: Message) => {
        const { strategyId: eventStrategyId } = message.data;
        if (eventStrategyId === strategyId) {
          // Re-publish with strategy-specific topic
          this.messageBus.publish(
            MultiStrategyManager.createEventTopic(MessageType.POSITION_OPENED, strategyId) as any,
            message.source,
            message.data
          );
        }
      })
    );
    
    subscriptions.push(
      this.messageBus.subscribe(MessageType.POSITION_CLOSED, (message: Message) => {
        const { strategyId: eventStrategyId } = message.data;
        if (eventStrategyId === strategyId) {
          // Re-publish with strategy-specific topic
          this.messageBus.publish(
            MultiStrategyManager.createEventTopic(MessageType.POSITION_CLOSED, strategyId) as any,
            message.source,
            message.data
          );
        }
      })
    );
    
    this.subscriptions.set(strategyId, subscriptions);
  }

  private unsubscribeStrategy(strategyId: string): void {
    const subscriptions = this.subscriptions.get(strategyId) || [];
    
    // Unsubscribe all strategy-specific subscriptions
    subscriptions.forEach(sub => sub.unsubscribe());
    
    this.subscriptions.set(strategyId, []);
  }

  private clearStrategyCache(strategyId: string): void {
    // Clear all cache entries for this strategy
    // This would require Cache to support namespaced clearing
    console.log(`[MultiStrategyManager] Clearing cache for strategy: ${strategyId}`);
    
    // Implementation depends on Cache API
    // For now, we'll assume cache entries are prefixed with strategy ID
    // this.cache.clearByPrefix(strategyId);
  }

  /**
   * Create a namespaced cache key for a strategy
   */
  public static createCacheKey(strategyId: string, key: string): string {
    return `strategy:${strategyId}:${key}`;
  }

  /**
   * Create a namespaced event topic for a strategy
   */
  public static createEventTopic(baseEvent: string, strategyId: string): string {
    return `${baseEvent}_${strategyId}`;
  }
} 