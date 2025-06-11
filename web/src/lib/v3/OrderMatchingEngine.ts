import { BacktestBarData, Order, OrderType, OrderStatus, OrderSide, UTCTimestamp } from '../types/backtester';

/**
 * Represents a synthetic tick within a bar for realistic order matching
 */
export interface SyntheticTick {
  price: number;
  volume: number;
  timestamp: UTCTimestamp;
  tickType: 'open' | 'high' | 'low' | 'close' | 'synthetic';
  sequenceIndex: number; // Order within the bar (0-based)
}

/**
 * Configuration for order matching behavior
 */
export interface OrderMatchingConfig {
  // Slippage configuration
  enableSlippage: boolean;
  marketOrderSlippage: number; // Basis points (100 = 1%)
  limitOrderSlippage: number;  // Basis points for aggressive fills
  
  // Partial fill configuration
  enablePartialFills: boolean;
  minFillSize: number;         // Minimum fill quantity
  maxFillPercentage: number;   // Max % of order to fill per tick (0-1)
  
  // Volume-based fill simulation
  useVolumeBasedFills: boolean;
  volumeImpactThreshold: number; // Order size as % of bar volume that causes impact
  
  // Latency simulation
  enableLatency: boolean;
  averageLatencyMs: number;    // Average execution latency
  latencyVarianceMs: number;   // Latency variance (+/-)
  
  // Advanced features
  enableGaps: boolean;         // Handle price gaps that skip orders
  enableReversals: boolean;    // Handle orders filled on reversals within bar
  prioritizationMethod: 'time' | 'price' | 'size'; // Order prioritization
}

/**
 * Default configuration for realistic order matching
 */
export const DEFAULT_MATCHING_CONFIG: OrderMatchingConfig = {
  enableSlippage: true,
  marketOrderSlippage: 10,     // 0.1% slippage for market orders
  limitOrderSlippage: 5,       // 0.05% slippage for aggressive limit orders
  
  enablePartialFills: true,
  minFillSize: 1,
  maxFillPercentage: 0.8,      // Fill up to 80% per tick
  
  useVolumeBasedFills: true,
  volumeImpactThreshold: 0.05, // 5% of bar volume
  
  enableLatency: true,
  averageLatencyMs: 50,        // 50ms average latency
  latencyVarianceMs: 30,       // ±30ms variance
  
  enableGaps: true,
  enableReversals: true,
  prioritizationMethod: 'time',
};

/**
 * Fill information for an order
 */
export interface OrderFill {
  orderId: string;
  fillPrice: number;
  fillQuantity: number;
  fillTime: UTCTimestamp;
  fillReason: 'market' | 'limit_hit' | 'stop_triggered' | 'partial' | 'gap_fill';
  slippage: number;            // Actual slippage in basis points
  latency: number;             // Execution latency in milliseconds
  remainingQuantity: number;   // Quantity still unfilled
  isComplete: boolean;         // Whether order is completely filled
}

/**
 * Result of processing a bar through the order matching engine
 */
export interface MatchingResult {
  fills: OrderFill[];
  cancelledOrders: string[];   // Orders cancelled due to conditions
  syntheticTicks: SyntheticTick[];
  processingStats: {
    ticksGenerated: number;
    ordersProcessed: number;
    averageSlippage: number;
    totalLatency: number;
  };
}

/**
 * Synthetic Tick Order Matching Engine
 * 
 * Provides realistic order execution simulation by:
 * 1. Generating synthetic ticks within OHLC bars
 * 2. Processing orders against realistic price movements
 * 3. Handling race conditions between SL/TP orders
 * 4. Modeling slippage and partial fills
 * 5. Simulating execution latency
 */
export class OrderMatchingEngine {
  private config: OrderMatchingConfig;
  private pendingOrders: Map<string, Order> = new Map();
  private fillHistory: OrderFill[] = [];
  private randomSeed = 12345; // For deterministic random numbers

  constructor(config: Partial<OrderMatchingConfig> = {}) {
    this.config = { ...DEFAULT_MATCHING_CONFIG, ...config };
  }

  /**
   * Add an order to the matching engine
   */
  public addOrder(order: Order): void {
    this.pendingOrders.set(order.id, { ...order });
  }

  /**
   * Remove an order from the matching engine
   */
  public removeOrder(orderId: string): boolean {
    return this.pendingOrders.delete(orderId);
  }

  /**
   * Get all pending orders
   */
  public getPendingOrders(): Order[] {
    return Array.from(this.pendingOrders.values());
  }

  /**
   * Process a bar and return order fills
   */
  public processBar(bar: BacktestBarData): MatchingResult {
    const syntheticTicks = this.generateSyntheticTicks(bar);
    const fills: OrderFill[] = [];
    const cancelledOrders: string[] = [];
    let totalSlippage = 0;
    let totalLatency = 0;
    let ordersProcessed = 0;

    // Sort orders by priority
    const sortedOrders = this.prioritizeOrders(Array.from(this.pendingOrders.values()));

    // Process each synthetic tick
    for (const tick of syntheticTicks) {
      // Create a copy of orders to avoid modification during iteration
      const ordersToProcess = [...sortedOrders];

      for (const order of ordersToProcess) {
        if (!this.pendingOrders.has(order.id)) continue; // Order may have been filled/cancelled

        const fillResult = this.attemptOrderFill(order, tick, bar);
        if (fillResult) {
          fills.push(fillResult);
          totalSlippage += fillResult.slippage;
          totalLatency += fillResult.latency;
          ordersProcessed++;

          // Update or remove order based on fill
          if (fillResult.isComplete) {
            this.pendingOrders.delete(order.id);
          } else {
            // Update order with remaining quantity
            const updatedOrder = { ...order, quantity: fillResult.remainingQuantity };
            this.pendingOrders.set(order.id, updatedOrder);
          }
        }
      }

      // Handle order cancellations (e.g., OCO logic will be added in Phase 2.2)
      // For now, we handle basic order expiration and conditions
      this.processCancellations(tick, cancelledOrders);
    }

    // Store fill history
    this.fillHistory.push(...fills);

    return {
      fills,
      cancelledOrders,
      syntheticTicks,
      processingStats: {
        ticksGenerated: syntheticTicks.length,
        ordersProcessed,
        averageSlippage: ordersProcessed > 0 ? totalSlippage / ordersProcessed : 0,
        totalLatency,
      },
    };
  }

  /**
   * Generate synthetic ticks within a bar using OHLC model
   */
  private generateSyntheticTicks(bar: BacktestBarData): SyntheticTick[] {
    const ticks: SyntheticTick[] = [];
    const { open, high, low, close, time, volume = 1000 } = bar;

    // Determine the price movement pattern within the bar
    const pattern = this.determinePricePattern(open, high, low, close);
    const tickInterval = 1000; // 1 second between ticks (can be configurable)
    const tickCount = Math.min(60, Math.max(4, Math.floor(volume / 100))); // 4-60 ticks per bar
    const volumePerTick = volume / tickCount;

    let sequenceIndex = 0;

    // Generate ticks based on the determined pattern
    switch (pattern) {
      case 'up-trend':
        ticks.push(...this.generateUpTrendTicks(open, high, low, close, time, volumePerTick, tickCount, sequenceIndex));
        break;
      case 'down-trend':
        ticks.push(...this.generateDownTrendTicks(open, high, low, close, time, volumePerTick, tickCount, sequenceIndex));
        break;
      case 'reversal-up':
        ticks.push(...this.generateReversalUpTicks(open, high, low, close, time, volumePerTick, tickCount, sequenceIndex));
        break;
      case 'reversal-down':
        ticks.push(...this.generateReversalDownTicks(open, high, low, close, time, volumePerTick, tickCount, sequenceIndex));
        break;
      case 'consolidation':
        ticks.push(...this.generateConsolidationTicks(open, high, low, close, time, volumePerTick, tickCount, sequenceIndex));
        break;
    }

    return ticks.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  }

  /**
   * Determine the price movement pattern within the bar
   */
  private determinePricePattern(open: number, high: number, low: number, close: number): string {
    const midPoint = (high + low) / 2;
    const openToClose = close - open;
    const bodySize = Math.abs(openToClose);
    const wickSize = (high - low) - bodySize;

    // If close is significantly higher than open
    if (openToClose > bodySize * 0.6) {
      return open < midPoint && close > midPoint ? 'up-trend' : 'reversal-up';
    }
    
    // If close is significantly lower than open
    if (openToClose < -bodySize * 0.6) {
      return open > midPoint && close < midPoint ? 'down-trend' : 'reversal-down';
    }

    // Otherwise, it's consolidation
    return 'consolidation';
  }

  /**
   * Generate uptrend ticks: Open -> Low -> High -> Close
   */
  private generateUpTrendTicks(
    open: number, high: number, low: number, close: number,
    time: UTCTimestamp, volumePerTick: number, tickCount: number, startIndex: number
  ): SyntheticTick[] {
    const ticks: SyntheticTick[] = [];
    const interval = 1000; // 1 second

    // Open tick
    ticks.push({
      price: open,
      volume: volumePerTick,
      timestamp: time as UTCTimestamp,
      tickType: 'open',
      sequenceIndex: startIndex,
    });

    // Move to low first (if different from open)
    if (low < open * 0.999) {
      const lowTicks = Math.floor(tickCount * 0.2); // 20% of ticks for move to low
      for (let i = 1; i <= lowTicks; i++) {
        const price = open - ((open - low) * (i / lowTicks));
        ticks.push({
          price,
          volume: volumePerTick,
          timestamp: (time + (i * interval)) as UTCTimestamp,
          tickType: 'synthetic',
          sequenceIndex: startIndex + i,
        });
      }
    }

    // Move from low to high
    const highTicks = Math.floor(tickCount * 0.6); // 60% of ticks for main move
    const startPrice = Math.min(low, open);
    for (let i = 1; i <= highTicks; i++) {
      const price = startPrice + ((high - startPrice) * (i / highTicks));
      ticks.push({
        price,
        volume: volumePerTick * 1.5, // Higher volume during main move
        timestamp: (time + ((ticks.length + i) * interval)) as UTCTimestamp,
        tickType: i === highTicks ? 'high' : 'synthetic',
        sequenceIndex: startIndex + ticks.length + i,
      });
    }

    // Move from high to close
    const closeTicks = tickCount - ticks.length;
    for (let i = 1; i <= closeTicks; i++) {
      const price = high - ((high - close) * (i / closeTicks));
      ticks.push({
        price: i === closeTicks ? close : price,
        volume: volumePerTick,
        timestamp: (time + ((ticks.length + i) * interval)) as UTCTimestamp,
        tickType: i === closeTicks ? 'close' : 'synthetic',
        sequenceIndex: startIndex + ticks.length + i,
      });
    }

    return ticks;
  }

  /**
   * Generate downtrend ticks: Open -> High -> Low -> Close
   */
  private generateDownTrendTicks(
    open: number, high: number, low: number, close: number,
    time: UTCTimestamp, volumePerTick: number, tickCount: number, startIndex: number
  ): SyntheticTick[] {
    const ticks: SyntheticTick[] = [];
    const interval = 1000;

    // Open tick
    ticks.push({
      price: open,
      volume: volumePerTick,
      timestamp: time as UTCTimestamp,
      tickType: 'open',
      sequenceIndex: startIndex,
    });

    // Move to high first (if different from open)
    if (high > open * 1.001) {
      const highTicks = Math.floor(tickCount * 0.2);
      for (let i = 1; i <= highTicks; i++) {
        const price = open + ((high - open) * (i / highTicks));
        ticks.push({
          price,
          volume: volumePerTick,
          timestamp: (time + (i * interval)) as UTCTimestamp,
          tickType: 'synthetic',
          sequenceIndex: startIndex + i,
        });
      }
    }

    // Move from high to low
    const lowTicks = Math.floor(tickCount * 0.6);
    const startPrice = Math.max(high, open);
    for (let i = 1; i <= lowTicks; i++) {
      const price = startPrice - ((startPrice - low) * (i / lowTicks));
      ticks.push({
        price,
        volume: volumePerTick * 1.5, // Higher volume during main move
        timestamp: (time + ((ticks.length + i) * interval)) as UTCTimestamp,
        tickType: i === lowTicks ? 'low' : 'synthetic',
        sequenceIndex: startIndex + ticks.length + i,
      });
    }

    // Move from low to close
    const closeTicks = tickCount - ticks.length;
    for (let i = 1; i <= closeTicks; i++) {
      const price = low + ((close - low) * (i / closeTicks));
      ticks.push({
        price: i === closeTicks ? close : price,
        volume: volumePerTick,
        timestamp: (time + ((ticks.length + i) * interval)) as UTCTimestamp,
        tickType: i === closeTicks ? 'close' : 'synthetic',
        sequenceIndex: startIndex + ticks.length + i,
      });
    }

    return ticks;
  }

  /**
   * Generate reversal up ticks: Open -> Low -> High -> Close (but close > open)
   */
  private generateReversalUpTicks(
    open: number, high: number, low: number, close: number,
    time: UTCTimestamp, volumePerTick: number, tickCount: number, startIndex: number
  ): SyntheticTick[] {
    // Similar to downtrend but with recovery to close above open
    return this.generateDownTrendTicks(open, high, low, close, time, volumePerTick, tickCount, startIndex);
  }

  /**
   * Generate reversal down ticks: Open -> High -> Low -> Close (but close < open)
   */
  private generateReversalDownTicks(
    open: number, high: number, low: number, close: number,
    time: UTCTimestamp, volumePerTick: number, tickCount: number, startIndex: number
  ): SyntheticTick[] {
    // Similar to uptrend but with decline to close below open
    return this.generateUpTrendTicks(open, high, low, close, time, volumePerTick, tickCount, startIndex);
  }

  /**
   * Generate consolidation ticks: Random walk between high and low
   */
  private generateConsolidationTicks(
    open: number, high: number, low: number, close: number,
    time: UTCTimestamp, volumePerTick: number, tickCount: number, startIndex: number
  ): SyntheticTick[] {
    const ticks: SyntheticTick[] = [];
    const interval = 1000;
    let currentPrice = open;

    for (let i = 0; i < tickCount; i++) {
      if (i === 0) {
        currentPrice = open;
      } else if (i === tickCount - 1) {
        currentPrice = close;
      } else {
        // Random walk within range
        const range = high - low;
        const maxMove = range * 0.1; // Max 10% of range per tick
        const randomMove = (this.seededRandom() - 0.5) * 2 * maxMove;
        currentPrice = Math.max(low, Math.min(high, currentPrice + randomMove));
      }

      ticks.push({
        price: currentPrice,
        volume: volumePerTick,
        timestamp: (time + (i * interval)) as UTCTimestamp,
        tickType: i === 0 ? 'open' : i === tickCount - 1 ? 'close' : 'synthetic',
        sequenceIndex: startIndex + i,
      });
    }

    return ticks;
  }

  /**
   * Attempt to fill an order against a synthetic tick
   */
  private attemptOrderFill(order: Order, tick: SyntheticTick, bar: BacktestBarData): OrderFill | null {
    const canFill = this.canOrderFill(order, tick);
    if (!canFill) return null;

    const fillPrice = this.calculateFillPrice(order, tick);
    const slippage = this.calculateSlippage(order, tick, fillPrice);
    const finalPrice = this.applySlippage(fillPrice, slippage, order.side);
    const latency = this.calculateLatency();
    
    const maxFillQuantity = this.config.enablePartialFills 
      ? Math.floor(order.quantity * this.config.maxFillPercentage)
      : order.quantity;
    
    const fillQuantity = Math.max(
      this.config.minFillSize,
      Math.min(maxFillQuantity, this.calculateFillQuantity(order, tick, bar))
    );

    const remainingQuantity = order.quantity - fillQuantity;
    const isComplete = remainingQuantity <= 0;

    return {
      orderId: order.id,
      fillPrice: finalPrice,
      fillQuantity,
      fillTime: (tick.timestamp + latency) as UTCTimestamp,
      fillReason: this.determineFillReason(order, tick),
      slippage,
      latency,
      remainingQuantity: Math.max(0, remainingQuantity),
      isComplete,
    };
  }

  /**
   * Check if an order can be filled at the current tick
   */
  private canOrderFill(order: Order, tick: SyntheticTick): boolean {
    switch (order.type) {
      case OrderType.MARKET:
        return true; // Market orders always fill
        
      case OrderType.LIMIT:
        if (order.side === OrderSide.BUY) {
          return tick.price <= (order.price || 0);
        } else {
          return tick.price >= (order.price || 0);
        }
        
      case OrderType.STOP:
        if (order.side === OrderSide.BUY) {
          return tick.price >= (order.stopPrice || 0);
        } else {
          return tick.price <= (order.stopPrice || 0);
        }
        
      case OrderType.STOP_LIMIT:
        // First check if stop is triggered
        const stopTriggered = order.side === OrderSide.BUY 
          ? tick.price >= (order.stopPrice || 0)
          : tick.price <= (order.stopPrice || 0);
          
        if (!stopTriggered) return false;
        
        // Then check limit condition
        if (order.side === OrderSide.BUY) {
          return tick.price <= (order.price || 0);
        } else {
          return tick.price >= (order.price || 0);
        }
        
      default:
        return false;
    }
  }

  /**
   * Calculate the fill price for an order
   */
  private calculateFillPrice(order: Order, tick: SyntheticTick): number {
    switch (order.type) {
      case OrderType.MARKET:
        return tick.price;
        
      case OrderType.LIMIT:
        return order.price || tick.price;
        
      case OrderType.STOP:
        return tick.price; // Stop becomes market order
        
      case OrderType.STOP_LIMIT:
        return order.price || tick.price;
        
      default:
        return tick.price;
    }
  }

  /**
   * Calculate slippage for an order fill
   */
  private calculateSlippage(order: Order, tick: SyntheticTick, fillPrice: number): number {
    if (!this.config.enableSlippage) return 0;

    const baseSlippage = order.type === OrderType.MARKET 
      ? this.config.marketOrderSlippage 
      : this.config.limitOrderSlippage;

    // Add random variance (±50% of base slippage)
    const variance = (this.seededRandom() - 0.5) * baseSlippage;
    return Math.max(0, baseSlippage + variance);
  }

  /**
   * Apply slippage to fill price
   */
  private applySlippage(fillPrice: number, slippageBP: number, side: OrderSide): number {
    const slippageMultiplier = slippageBP / 10000; // Convert basis points to decimal
    
    if (side === OrderSide.BUY) {
      return fillPrice * (1 + slippageMultiplier); // Pay more when buying
    } else {
      return fillPrice * (1 - slippageMultiplier); // Receive less when selling
    }
  }

  /**
   * Calculate execution latency
   */
  private calculateLatency(): number {
    if (!this.config.enableLatency) return 0;

    const variance = (this.seededRandom() - 0.5) * 2 * this.config.latencyVarianceMs;
    return Math.max(0, this.config.averageLatencyMs + variance);
  }

  /**
   * Calculate fill quantity based on volume and order size
   */
  private calculateFillQuantity(order: Order, tick: SyntheticTick, bar: BacktestBarData): number {
    if (!this.config.useVolumeBasedFills) return order.quantity;

    const barVolume = bar.volume || 1000;
    const orderAsPercentOfVolume = order.quantity / barVolume;

    // If order is small relative to volume, fill completely
    if (orderAsPercentOfVolume <= this.config.volumeImpactThreshold) {
      return order.quantity;
    }

    // For large orders, fill based on available volume in this tick
    const availableVolume = tick.volume;
    return Math.min(order.quantity, Math.floor(availableVolume * 0.8)); // Use 80% of tick volume
  }

  /**
   * Determine the reason for the fill
   */
  private determineFillReason(order: Order, tick: SyntheticTick): OrderFill['fillReason'] {
    switch (order.type) {
      case OrderType.MARKET:
        return 'market';
      case OrderType.LIMIT:
        return 'limit_hit';
      case OrderType.STOP:
      case OrderType.STOP_LIMIT:
        return 'stop_triggered';
      default:
        return 'market';
    }
  }

  /**
   * Process order cancellations
   */
  private processCancellations(tick: SyntheticTick, cancelledOrders: string[]): void {
    // This will be expanded in Phase 2.2 for OCO logic
    // For now, just handle basic timeout cancellations
    
    for (const [orderId, order] of this.pendingOrders) {
      // Example: Cancel orders that have been pending too long
      if (order.submittedTime && tick.timestamp - order.submittedTime > 3600) { // 1 hour timeout
        this.pendingOrders.delete(orderId);
        cancelledOrders.push(orderId);
      }
    }
  }

  /**
   * Prioritize orders for processing
   */
  private prioritizeOrders(orders: Order[]): Order[] {
    switch (this.config.prioritizationMethod) {
      case 'time':
        return orders.sort((a, b) => a.submittedTime - b.submittedTime);
      case 'price':
        return orders.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'size':
        return orders.sort((a, b) => b.quantity - a.quantity);
      default:
        return orders;
    }
  }

  /**
   * Seeded random number generator for deterministic behavior
   */
  private seededRandom(): number {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }

  /**
   * Get fill history
   */
  public getFillHistory(): OrderFill[] {
    return [...this.fillHistory];
  }

  /**
   * Clear fill history
   */
  public clearFillHistory(): void {
    this.fillHistory = [];
  }

  /**
   * Get matching configuration
   */
  public getConfig(): OrderMatchingConfig {
    return { ...this.config };
  }

  /**
   * Update matching configuration
   */
  public updateConfig(newConfig: Partial<OrderMatchingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
} 