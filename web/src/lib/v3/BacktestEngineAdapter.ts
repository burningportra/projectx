import { BacktestEngine } from './BacktestEngine';
import { 
  IExecutionEngine, 
  BaseExecutionEngine,
  ExecutionPosition,
  AccountInfo,
  MarketData,
  OrderExecutionResult,
  EngineConfig,
  ExecutionEventType
} from './IExecutionEngine';
import { BacktestBarData, Order, OrderType, OrderSide } from '../types/backtester';
import { BracketOrderConfig, BracketOrder } from './BracketOrderSystem';
import { StrategyDefinition, StrategyConfig } from './StrategyFramework';

/**
 * Adapter that wraps the existing BacktestEngine to implement IExecutionEngine
 * This demonstrates how to make strategies portable between engines
 */
export class BacktestEngineAdapter extends BaseExecutionEngine implements IExecutionEngine {
  private engine: BacktestEngine;

  constructor(engine: BacktestEngine, config: EngineConfig = {}) {
    super(config);
    this.engine = engine;
    
    // Forward engine events to the common interface
    this.setupEventForwarding();
    
    // Initialize status
    this.updateStatus({
      isActive: engine.isActive(),
      isConnected: true,
      mode: 'backtest'
    });
  }

  /**
   * Setup event forwarding from BacktestEngine to IExecutionEngine events
   */
  private setupEventForwarding(): void {
    // Map backtest events to execution events
    this.engine.on('BACKTEST_STARTED' as any, () => {
      this.emit(ExecutionEventType.ENGINE_STARTED, {});
    });

    this.engine.on('BACKTEST_COMPLETED' as any, () => {
      this.emit(ExecutionEventType.ENGINE_STOPPED, {});
    });

    this.engine.on('ORDER_SUBMITTED' as any, (event) => {
      this.emit(ExecutionEventType.ORDER_SUBMITTED, event.data);
    });

    this.engine.on('ORDER_FILLED' as any, (event) => {
      this.emit(ExecutionEventType.ORDER_FILLED, event.data);
    });

    this.engine.on('ORDER_CANCELLED' as any, (event) => {
      this.emit(ExecutionEventType.ORDER_CANCELLED, event.data);
    });

    this.engine.on('BAR_PROCESSED' as any, (event) => {
      this.emit(ExecutionEventType.DATA_RECEIVED, event.data);
    });
  }

  // ===============================
  // IExecutionEngine Implementation
  // ===============================

  getEngineType(): 'backtest' | 'paper' | 'live' {
    return 'backtest';
  }

  async start(): Promise<void> {
    this.engine.start();
    this.updateStatus({ isActive: true, isConnected: true });
  }

  async stop(): Promise<void> {
    this.engine.stop();
    this.updateStatus({ isActive: false });
  }

  async reset(): Promise<void> {
    this.engine.reset();
    this.updateStatus({ isActive: false });
  }

  // ===============================
  // Order Management
  // ===============================

  async submitOrder(order: Order): Promise<OrderExecutionResult> {
    try {
      this.engine.submitOrder(order);
      return {
        success: true,
        orderId: order.id,
        message: 'Order submitted to backtest engine'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async submitBracketOrder(config: BracketOrderConfig): Promise<BracketOrder> {
    return this.engine.submitBracketOrder(config);
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    return this.engine.cancelOrder(orderId);
  }

  async modifyOrder(orderId: string, updates: Partial<Order>): Promise<boolean> {
    // BacktestEngine doesn't support order modification directly
    // This would need to be implemented as cancel + resubmit
    return false;
  }

  getPendingOrders(): Order[] {
    return this.engine.getPendingOrders();
  }

  getOrder(orderId: string): Order | null {
    const orders = this.engine.getPendingOrders();
    return orders.find(order => order.id === orderId) || null;
  }

  // ===============================
  // Position Management
  // ===============================

  getOpenPositions(): ExecutionPosition[] {
    const state = this.engine.getState();
    const positions: ExecutionPosition[] = [];
    
    for (const [positionId, trade] of state.openPositions) {
      const currentBar = this.engine.getCurrentBar();
      const currentPrice = currentBar?.close || trade.entryPrice;
      
      positions.push({
        id: positionId,
        symbol: 'DEFAULT', // BacktestEngine doesn't track symbols separately
        side: trade.type === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        quantity: trade.size,
        entryPrice: trade.entryPrice,
        entryTime: trade.entryTime,
        currentPrice,
        unrealizedPnL: trade.profitOrLoss || 0,
        hasActiveStopLoss: false, // Would need bracket order integration
        hasActiveTakeProfit: false,
      });
    }
    
    return positions;
  }

  getPosition(symbol: string): ExecutionPosition | null {
    // Since BacktestEngine doesn't track symbols, return first position
    const positions = this.getOpenPositions();
    return positions.length > 0 ? positions[0] : null;
  }

  async closePosition(positionId: string): Promise<OrderExecutionResult> {
    // Would need to create a closing order
    return {
      success: false,
      error: 'Position closing not implemented in adapter'
    };
  }

  async closeAllPositions(): Promise<OrderExecutionResult[]> {
    return [];
  }

  getPositionValue(symbol?: string): number {
    const state = this.engine.getState();
    const currentBar = this.engine.getCurrentBar();
    if (!currentBar) return 0;
    
    let totalValue = 0;
    for (const trade of state.openPositions.values()) {
      totalValue += trade.size * currentBar.close;
    }
    
    return totalValue;
  }

  getUnrealizedPnL(): number {
    const state = this.engine.getState();
    let totalPnL = 0;
    
    for (const trade of state.openPositions.values()) {
      totalPnL += trade.profitOrLoss || 0;
    }
    
    return totalPnL;
  }

  // ===============================
  // Account Information
  // ===============================

  getAccountInfo(): AccountInfo {
    const state = this.engine.getState();
    
    return {
      balance: state.accountBalance,
      equity: state.accountBalance + this.getUnrealizedPnL(),
      usedMargin: this.getPositionValue(),
      freeMargin: state.accountBalance - this.getPositionValue(),
      currency: 'USD',
      accountId: 'backtest',
      accountType: 'backtest',
      allowedOrderTypes: [OrderType.MARKET, OrderType.LIMIT, OrderType.STOP]
    };
  }

  getAccountBalance(): number {
    return this.engine.getState().accountBalance;
  }

  getBuyingPower(): number {
    return this.getAccountBalance(); // Simplified for backtest
  }

  async validateOrder(order: Order): Promise<{ isValid: boolean; reason?: string }> {
    // Basic validation
    if (order.quantity <= 0) {
      return { isValid: false, reason: 'Quantity must be positive' };
    }
    
    if (order.price && order.price <= 0) {
      return { isValid: false, reason: 'Price must be positive' };
    }
    
    // Check buying power for buy orders
    if (order.side === OrderSide.BUY && order.price) {
      const cost = order.quantity * order.price;
      if (cost > this.getBuyingPower()) {
        return { isValid: false, reason: 'Insufficient buying power' };
      }
    }
    
    return { isValid: true };
  }

  // ===============================
  // Market Data
  // ===============================

  getMarketData(symbol: string): MarketData | null {
    const currentBar = this.engine.getCurrentBar();
    if (!currentBar) return null;
    
    return {
      symbol,
      currentBar,
      timestamp: currentBar.time,
      isMarketOpen: true, // Always open in backtest
      tradingSession: 'market'
    };
  }

  getCurrentPrice(symbol: string): number | null {
    const currentBar = this.engine.getCurrentBar();
    return currentBar?.close || null;
  }

  isMarketOpen(symbol?: string): boolean {
    return this.engine.isActive(); // Market is "open" when backtest is running
  }

  async getHistoricalData(
    symbol: string,
    timeframe: string,
    startTime?: any,
    endTime?: any,
    limit?: number
  ): Promise<BacktestBarData[]> {
    // Return the loaded backtest data
    const state = this.engine.getState();
    let data = state.bars;
    
    if (startTime) {
      data = data.filter(bar => bar.time >= startTime);
    }
    
    if (endTime) {
      data = data.filter(bar => bar.time <= endTime);
    }
    
    if (limit) {
      data = data.slice(0, limit);
    }
    
    return data;
  }

  // ===============================
  // Strategy Management
  // ===============================

  registerStrategy(definition: StrategyDefinition, config?: Partial<StrategyConfig>): void {
    this.engine.registerStrategy(definition, config);
  }

  unregisterStrategy(strategyId: string): void {
    this.engine.getStrategyExecutor().unregisterStrategy(strategyId);
  }

  setStrategyActive(strategyId: string, isActive: boolean): void {
    this.engine.setStrategyActive(strategyId, isActive);
  }

  updateStrategyConfig(strategyId: string, updates: Partial<StrategyConfig>): void {
    this.engine.updateStrategyConfig(strategyId, updates);
  }

  getStrategies(): Array<{
    definition: StrategyDefinition;
    config: StrategyConfig;
    isActive: boolean;
  }> {
    const executor = this.engine.getStrategyExecutor();
    return executor.getRegisteredStrategies().map(context => ({
      definition: context.definition,
      config: context.config,
      isActive: context.isActive
    }));
  }

  // ===============================
  // Utility Methods
  // ===============================

  getSupportedSymbols(): string[] {
    return ['DEFAULT']; // BacktestEngine uses default symbol
  }

  getSupportedOrderTypes(): OrderType[] {
    return [OrderType.MARKET, OrderType.LIMIT, OrderType.STOP];
  }

  getCapabilities() {
    return {
      supportsHistoricalData: true,
      supportsRealTimeData: false,
      supportsBracketOrders: true,
      supportsModifyOrders: false,
      supportsPartialFills: true,
      supportsMultipleSymbols: false,
      supportsShortSelling: true,
      supportsMarginTrading: false,
    };
  }

  // ===============================
  // Additional BacktestEngine Methods
  // ===============================

  /**
   * Load data into the backtest engine
   */
  loadData(bars: BacktestBarData[]): void {
    this.engine.loadData(bars);
  }

  /**
   * Process next bar in backtest
   */
  processNextBar(): BacktestBarData | null {
    return this.engine.processNextBar();
  }

  /**
   * Get backtest progress
   */
  getProgress(): number {
    return this.engine.getProgress();
  }

  /**
   * Get the underlying BacktestEngine
   */
  getBacktestEngine(): BacktestEngine {
    return this.engine;
  }
}

/**
 * Factory function to create a BacktestEngineAdapter
 */
export function createBacktestEngineAdapter(
  initialBalance: number = 100000,
  config: EngineConfig = {}
): BacktestEngineAdapter {
  const engine = new BacktestEngine(initialBalance);
  return new BacktestEngineAdapter(engine, config);
}

export default BacktestEngineAdapter; 