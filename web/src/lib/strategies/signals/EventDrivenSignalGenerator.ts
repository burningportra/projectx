import { MessageBus, MessageType, Message, Subscription } from '@/lib/MessageBus';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';
import { BacktestBarData } from '@/lib/types/backtester';

/**
 * Event-driven signal generator that responds to market updates
 * 
 * This component follows NautilusTrader's event-driven architecture by:
 * - Subscribing to MARKET_UPDATE events from strategies
 * - Processing market data asynchronously
 * - Publishing SIGNAL_GENERATED events when signals are detected
 * - Maintaining no direct coupling with strategies
 */
export class EventDrivenSignalGenerator {
  private messageBus: MessageBus;
  private trendIdentifier: TrendIdentifier;
  private subscriptions: Subscription[] = [];
  private isActive: boolean = false;
  
  // Track processing to avoid duplicates
  private processingCache: Map<string, Set<number>> = new Map();
  private readonly cacheMaxSize = 1000;

  constructor(messageBus: MessageBus, trendIdentifier: TrendIdentifier) {
    this.messageBus = messageBus;
    this.trendIdentifier = trendIdentifier;
  }

  /**
   * Start listening for market updates
   */
  public start(): void {
    if (this.isActive) {
      console.warn('[EventDrivenSignalGenerator] Already started');
      return;
    }

    console.log('[EventDrivenSignalGenerator] Starting signal generator...');
    
    // Subscribe to market updates
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.MARKET_UPDATE, this.onMarketUpdate.bind(this))
    );
    
    this.isActive = true;
    console.log('[EventDrivenSignalGenerator] Signal generator started');
  }

  /**
   * Stop listening for market updates
   */
  public stop(): void {
    if (!this.isActive) {
      console.warn('[EventDrivenSignalGenerator] Already stopped');
      return;
    }

    console.log('[EventDrivenSignalGenerator] Stopping signal generator...');
    
    // Unsubscribe from all events
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    
    // Clear cache
    this.processingCache.clear();
    
    this.isActive = false;
    console.log('[EventDrivenSignalGenerator] Signal generator stopped');
  }

  /**
   * Handle market update events
   */
  private async onMarketUpdate(message: Message): Promise<void> {
    const { contractId, timeframe, bar, barIndex, allBars, strategyId } = message.data;
    
    // Create cache key
    const cacheKey = `${contractId}-${timeframe}`;
    
    // Check if we've already processed this bar
    if (this.hasProcessedBar(cacheKey, barIndex)) {
      return;
    }
    
    // Mark as processed
    this.markBarAsProcessed(cacheKey, barIndex);
    
    try {
      // Generate signals using the trend identifier
      const signals = await this.trendIdentifier.getSignalsForRange(
        allBars,
        barIndex,
        contractId,
        timeframe
      );
      
      // Publish each signal
      signals.forEach(signal => {
        // Create a new signal object that includes the contract and timeframe context
        const enrichedSignal = {
          ...signal,
          contractId,
          timeframe,
        };
        
        this.messageBus.publish(
          MessageType.SIGNAL_GENERATED,
          this.constructor.name,
          { 
            signal: enrichedSignal, // Use the enriched signal
            source: 'EventDrivenSignalGenerator',
            strategyId, // Include strategy ID for filtering
            timestamp: Date.now()
          }
        );
      });
      
      if (signals.length > 0) {
        console.log(`[EventDrivenSignalGenerator] Generated ${signals.length} signals for ${contractId} ${timeframe} at bar ${barIndex}`);
      }
    } catch (error) {
      console.error('[EventDrivenSignalGenerator] Error generating signals:', error);
    }
  }

  /**
   * Check if a bar has already been processed
   */
  private hasProcessedBar(cacheKey: string, barIndex: number): boolean {
    const processedBars = this.processingCache.get(cacheKey);
    return processedBars ? processedBars.has(barIndex) : false;
  }

  /**
   * Mark a bar as processed
   */
  private markBarAsProcessed(cacheKey: string, barIndex: number): void {
    let processedBars = this.processingCache.get(cacheKey);
    
    if (!processedBars) {
      processedBars = new Set<number>();
      this.processingCache.set(cacheKey, processedBars);
    }
    
    processedBars.add(barIndex);
    
    // Limit cache size by removing old entries
    if (processedBars.size > this.cacheMaxSize) {
      const sortedIndices = Array.from(processedBars).sort((a, b) => a - b);
      const toRemove = sortedIndices.slice(0, sortedIndices.length - this.cacheMaxSize);
      toRemove.forEach(index => processedBars!.delete(index));
    }
  }

  /**
   * Reset the trend identifier state
   */
  public reset(): void {
    this.processingCache.clear();
    if (this.trendIdentifier.resetState) {
      this.trendIdentifier.resetState();
    }
  }

  /**
   * Check if the generator is active
   */
  public isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Get processing statistics
   */
  public getStats(): {
    isActive: boolean;
    cachedContracts: number;
    totalProcessedBars: number;
  } {
    let totalBars = 0;
    this.processingCache.forEach(bars => {
      totalBars += bars.size;
    });

    return {
      isActive: this.isActive,
      cachedContracts: this.processingCache.size,
      totalProcessedBars: totalBars
    };
  }
} 