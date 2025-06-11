import { UTCTimestamp } from 'lightweight-charts';
import { BacktestBarData, Order, OrderType, OrderSide } from '../types/backtester';
import { BracketOrderConfig, BracketOrder } from './BracketOrderSystem';
import { StrategyDefinition, StrategyConfig } from './StrategyFramework';

/**
 * Common position interface for both backtesting and live trading
 */
export interface ExecutionPosition {
  id: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  entryTime: UTCTimestamp;
  currentPrice: number;
  unrealizedPnL: number;
  
  // Associated orders (optional)
  stopLossPrice?: number;
  takeProfitPrice?: number;
  hasActiveStopLoss: boolean;
  hasActiveTakeProfit: boolean;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Account information interface
 */
export interface AccountInfo {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel?: number;
  currency: string;
  
  // Risk management
  maxLeverage?: number;
  allowedOrderTypes: OrderType[];
  
  // Metadata
  accountId: string;
  accountType: 'demo' | 'live' | 'backtest';
}

/**
 * Market data interface for current market state
 */
export interface MarketData {
  symbol: string;
  currentBar: BacktestBarData;
  timestamp: UTCTimestamp;
  
  // Spread information
  bid?: number;
  ask?: number;
  spread?: number;
  
  // Market state
  isMarketOpen: boolean;
  tradingSession?: 'pre-market' | 'market' | 'after-hours' | 'closed';
}

/**
 * Order execution result
 */
export interface OrderExecutionResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
  
  // Execution details (if filled immediately)
  fillPrice?: number;
  fillQuantity?: number;
  fillTime?: UTCTimestamp;
  commissions?: number;
  
  // Partial fills
  remainingQuantity?: number;
  averageFillPrice?: number;
}

/**
 * Engine status and state
 */
export interface EngineStatus {
  isActive: boolean;
  isConnected: boolean;
  lastUpdate: UTCTimestamp;
  mode: 'backtest' | 'paper' | 'live';
  
  // Performance
  latency?: number; // Average execution latency in ms
  uptimeSeconds: number;
  
  // Error handling
  lastError?: string;
  errorCount: number;
}

/**
 * Engine configuration interface
 */
export interface EngineConfig {
  // Risk management
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxDrawdown?: number;
  
  // Order management
  defaultTimeInForce?: string;
  enableSlippage?: boolean;
  slippageBasisPoints?: number;
  
  // Execution
  executionMode?: 'aggressive' | 'passive' | 'smart';
  maxOrderRetries?: number;
  
  // Data and connectivity
  dataProvider?: string;
  brokerApi?: string;
  
  // Logging and monitoring
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics?: boolean;
}

/**
 * Event types for engine events
 */
export enum ExecutionEventType {
  // Engine lifecycle
  ENGINE_STARTED = 'ENGINE_STARTED',
  ENGINE_STOPPED = 'ENGINE_STOPPED',
  ENGINE_ERROR = 'ENGINE_ERROR',
  
  // Data events
  DATA_RECEIVED = 'DATA_RECEIVED',
  DATA_ERROR = 'DATA_ERROR',
  
  // Order events
  ORDER_SUBMITTED = 'ORDER_SUBMITTED',
  ORDER_FILLED = 'ORDER_FILLED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  ORDER_MODIFIED = 'ORDER_MODIFIED',
  
  // Position events
  POSITION_OPENED = 'POSITION_OPENED',
  POSITION_CLOSED = 'POSITION_CLOSED',
  POSITION_MODIFIED = 'POSITION_MODIFIED',
  
  // Strategy events
  STRATEGY_SIGNAL = 'STRATEGY_SIGNAL',
  STRATEGY_ERROR = 'STRATEGY_ERROR',
  
  // Risk events
  RISK_LIMIT_EXCEEDED = 'RISK_LIMIT_EXCEEDED',
  MARGIN_CALL = 'MARGIN_CALL',
}

/**
 * Generic event interface
 */
export interface ExecutionEvent {
  type: ExecutionEventType;
  timestamp: UTCTimestamp;
  data: Record<string, unknown>;
  source: string; // Engine identifier
}

/**
 * Event callback function type
 */
export type EventCallback = (event: ExecutionEvent) => void;

/**
 * Common execution engine interface
 * This interface must be implemented by both BacktestEngine and LiveTradingEngine
 */
export interface IExecutionEngine {
  // ===============================
  // Engine Lifecycle Management
  // ===============================
  
  /**
   * Start the execution engine
   */
  start(): Promise<void>;
  
  /**
   * Stop the execution engine
   */
  stop(): Promise<void>;
  
  /**
   * Pause the engine (if supported)
   */
  pause?(): void;
  
  /**
   * Resume the engine (if supported)
   */
  resume?(): void;
  
  /**
   * Reset the engine to initial state
   */
  reset(): Promise<void>;
  
  /**
   * Get current engine status
   */
  getStatus(): EngineStatus;
  
  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<EngineConfig>): void;
  
  // ===============================
  // Order Management
  // ===============================
  
  /**
   * Submit a single order
   */
  submitOrder(order: Order): Promise<OrderExecutionResult>;
  
  /**
   * Submit a bracket order (entry + stop loss + take profit)
   */
  submitBracketOrder(config: BracketOrderConfig): Promise<BracketOrder>;
  
  /**
   * Cancel an existing order
   */
  cancelOrder(orderId: string): Promise<boolean>;
  
  /**
   * Modify an existing order
   */
  modifyOrder(orderId: string, updates: Partial<Order>): Promise<boolean>;
  
  /**
   * Get all pending orders
   */
  getPendingOrders(): Order[];
  
  /**
   * Get order by ID
   */
  getOrder(orderId: string): Order | null;
  
  // ===============================
  // Position Management
  // ===============================
  
  /**
   * Get all open positions
   */
  getOpenPositions(): ExecutionPosition[];
  
  /**
   * Get position by symbol
   */
  getPosition(symbol: string): ExecutionPosition | null;
  
  /**
   * Close a specific position
   */
  closePosition(positionId: string): Promise<OrderExecutionResult>;
  
  /**
   * Close all positions (emergency stop)
   */
  closeAllPositions(): Promise<OrderExecutionResult[]>;
  
  /**
   * Get position value for a symbol
   */
  getPositionValue(symbol?: string): number;
  
  /**
   * Get unrealized P&L for all positions
   */
  getUnrealizedPnL(): number;
  
  // ===============================
  // Account Information
  // ===============================
  
  /**
   * Get current account information
   */
  getAccountInfo(): AccountInfo;
  
  /**
   * Get account balance
   */
  getAccountBalance(): number;
  
  /**
   * Get available buying power
   */
  getBuyingPower(): number;
  
  /**
   * Check if an order is valid and can be executed
   */
  validateOrder(order: Order): Promise<{ isValid: boolean; reason?: string }>;
  
  // ===============================
  // Market Data
  // ===============================
  
  /**
   * Get current market data for a symbol
   */
  getMarketData(symbol: string): MarketData | null;
  
  /**
   * Get current price for a symbol
   */
  getCurrentPrice(symbol: string): number | null;
  
  /**
   * Check if market is open for trading
   */
  isMarketOpen(symbol?: string): boolean;
  
  /**
   * Get historical data (if supported)
   */
  getHistoricalData?(
    symbol: string,
    timeframe: string,
    startTime?: UTCTimestamp,
    endTime?: UTCTimestamp,
    limit?: number
  ): Promise<BacktestBarData[]>;
  
  // ===============================
  // Strategy Management
  // ===============================
  
  /**
   * Register a strategy for execution
   */
  registerStrategy(definition: StrategyDefinition, config?: Partial<StrategyConfig>): void;
  
  /**
   * Unregister a strategy
   */
  unregisterStrategy(strategyId: string): void;
  
  /**
   * Enable/disable a strategy
   */
  setStrategyActive(strategyId: string, isActive: boolean): void;
  
  /**
   * Update strategy configuration
   */
  updateStrategyConfig(strategyId: string, updates: Partial<StrategyConfig>): void;
  
  /**
   * Get all registered strategies
   */
  getStrategies(): Array<{
    definition: StrategyDefinition;
    config: StrategyConfig;
    isActive: boolean;
  }>;
  
  // ===============================
  // Event Management
  // ===============================
  
  /**
   * Subscribe to engine events
   */
  on(eventType: ExecutionEventType, callback: EventCallback): () => void;
  
  /**
   * Unsubscribe from engine events
   */
  off(eventType: ExecutionEventType, callback: EventCallback): void;
  
  /**
   * Emit an event
   */
  emit(eventType: ExecutionEventType, data: Record<string, unknown>): void;
  
  // ===============================
  // Utility Methods
  // ===============================
  
  /**
   * Get engine type identifier
   */
  getEngineType(): 'backtest' | 'paper' | 'live';
  
  /**
   * Get supported symbols
   */
  getSupportedSymbols(): string[];
  
  /**
   * Get supported order types
   */
  getSupportedOrderTypes(): OrderType[];
  
  /**
   * Get engine capabilities
   */
  getCapabilities(): {
    supportsHistoricalData: boolean;
    supportsRealTimeData: boolean;
    supportsBracketOrders: boolean;
    supportsModifyOrders: boolean;
    supportsPartialFills: boolean;
    supportsMultipleSymbols: boolean;
    supportsShortSelling: boolean;
    supportsMarginTrading: boolean;
  };
  
  /**
   * Health check for the engine
   */
  healthCheck(): Promise<{
    isHealthy: boolean;
    issues: string[];
    lastCheck: UTCTimestamp;
  }>;
}

/**
 * Abstract base class that provides common functionality
 * Both BacktestEngine and LiveTradingEngine can extend this
 */
export abstract class BaseExecutionEngine implements IExecutionEngine {
  protected config: EngineConfig;
  protected status: EngineStatus;
  protected eventCallbacks: Map<ExecutionEventType, Set<EventCallback>> = new Map();
  
  constructor(config: EngineConfig = {}) {
    this.config = config;
    this.status = {
      isActive: false,
      isConnected: false,
      lastUpdate: Date.now() as UTCTimestamp,
      mode: this.getEngineType(),
      uptimeSeconds: 0,
      errorCount: 0,
    };
  }
  
  // ===============================
  // Event Management Implementation
  // ===============================
  
  public on(eventType: ExecutionEventType, callback: EventCallback): () => void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, new Set());
    }
    this.eventCallbacks.get(eventType)!.add(callback);
    
    // Return unsubscribe function
    return () => this.off(eventType, callback);
  }
  
  public off(eventType: ExecutionEventType, callback: EventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.eventCallbacks.delete(eventType);
      }
    }
  }
  
  public emit(eventType: ExecutionEventType, data: Record<string, unknown>): void {
    const event: ExecutionEvent = {
      type: eventType,
      timestamp: Date.now() as UTCTimestamp,
      data,
      source: this.getEngineType(),
    };
    
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event callback for ${eventType}:`, error);
        }
      });
    }
  }
  
  // ===============================
  // Common Utility Methods
  // ===============================
  
  public getStatus(): EngineStatus {
    return { ...this.status };
  }
  
  public updateConfig(config: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  protected updateStatus(updates: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...updates, lastUpdate: Date.now() as UTCTimestamp };
  }
  
  public async healthCheck(): Promise<{
    isHealthy: boolean;
    issues: string[];
    lastCheck: UTCTimestamp;
  }> {
    const issues: string[] = [];
    
    // Basic health checks
    if (!this.status.isActive) {
      issues.push('Engine is not active');
    }
    
    if (!this.status.isConnected) {
      issues.push('Engine is not connected');
    }
    
    if (this.status.errorCount > 10) {
      issues.push(`High error count: ${this.status.errorCount}`);
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
      lastCheck: Date.now() as UTCTimestamp,
    };
  }
  
  // ===============================
  // Abstract Methods (Must be implemented by subclasses)
  // ===============================
  
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract reset(): Promise<void>;
  abstract getEngineType(): 'backtest' | 'paper' | 'live';
  
  // Order management
  abstract submitOrder(order: Order): Promise<OrderExecutionResult>;
  abstract submitBracketOrder(config: BracketOrderConfig): Promise<BracketOrder>;
  abstract cancelOrder(orderId: string): Promise<boolean>;
  abstract modifyOrder(orderId: string, updates: Partial<Order>): Promise<boolean>;
  abstract getPendingOrders(): Order[];
  abstract getOrder(orderId: string): Order | null;
  
  // Position management
  abstract getOpenPositions(): ExecutionPosition[];
  abstract getPosition(symbol: string): ExecutionPosition | null;
  abstract closePosition(positionId: string): Promise<OrderExecutionResult>;
  abstract closeAllPositions(): Promise<OrderExecutionResult[]>;
  abstract getPositionValue(symbol?: string): number;
  abstract getUnrealizedPnL(): number;
  
  // Account information
  abstract getAccountInfo(): AccountInfo;
  abstract getAccountBalance(): number;
  abstract getBuyingPower(): number;
  abstract validateOrder(order: Order): Promise<{ isValid: boolean; reason?: string }>;
  
  // Market data
  abstract getMarketData(symbol: string): MarketData | null;
  abstract getCurrentPrice(symbol: string): number | null;
  abstract isMarketOpen(symbol?: string): boolean;
  
  // Strategy management
  abstract registerStrategy(definition: StrategyDefinition, config?: Partial<StrategyConfig>): void;
  abstract unregisterStrategy(strategyId: string): void;
  abstract setStrategyActive(strategyId: string, isActive: boolean): void;
  abstract updateStrategyConfig(strategyId: string, updates: Partial<StrategyConfig>): void;
  abstract getStrategies(): Array<{
    definition: StrategyDefinition;
    config: StrategyConfig;
    isActive: boolean;
  }>;
  
  // Utility methods
  abstract getSupportedSymbols(): string[];
  abstract getSupportedOrderTypes(): OrderType[];
  abstract getCapabilities(): {
    supportsHistoricalData: boolean;
    supportsRealTimeData: boolean;
    supportsBracketOrders: boolean;
    supportsModifyOrders: boolean;
    supportsPartialFills: boolean;
    supportsMultipleSymbols: boolean;
    supportsShortSelling: boolean;
    supportsMarginTrading: boolean;
  };
}

/**
 * Helper function to check if an engine implements the full interface
 */
export function isExecutionEngine(engine: unknown): engine is IExecutionEngine {
  if (!engine || typeof engine !== 'object') return false;
  
  const requiredMethods = [
    'start', 'stop', 'reset', 'getStatus',
    'submitOrder', 'submitBracketOrder', 'cancelOrder',
    'getOpenPositions', 'getAccountBalance',
    'getMarketData', 'getCurrentPrice',
    'on', 'off', 'emit'
  ];
  
  return requiredMethods.every(method => 
    method in engine && typeof (engine as Record<string, unknown>)[method] === 'function'
  );
}

/**
 * Factory function to create engine adapters for testing
 */
export function createMockExecutionEngine(): IExecutionEngine {
  return new (class extends BaseExecutionEngine {
    getEngineType(): 'backtest' | 'paper' | 'live' { return 'paper'; }
    async start(): Promise<void> { this.updateStatus({ isActive: true, isConnected: true }); }
    async stop(): Promise<void> { this.updateStatus({ isActive: false, isConnected: false }); }
    async reset(): Promise<void> { this.updateStatus({ isActive: false, isConnected: false }); }
    
    async submitOrder(): Promise<OrderExecutionResult> { return { success: true }; }
    async submitBracketOrder(): Promise<BracketOrder> { return {} as BracketOrder; }
    async cancelOrder(): Promise<boolean> { return true; }
    async modifyOrder(): Promise<boolean> { return true; }
    getPendingOrders(): Order[] { return []; }
    getOrder(): Order | null { return null; }
    
    getOpenPositions(): ExecutionPosition[] { return []; }
    getPosition(): ExecutionPosition | null { return null; }
    async closePosition(): Promise<OrderExecutionResult> { return { success: true }; }
    async closeAllPositions(): Promise<OrderExecutionResult[]> { return []; }
    getPositionValue(): number { return 0; }
    getUnrealizedPnL(): number { return 0; }
    
    getAccountInfo(): AccountInfo { 
      return {
        balance: 100000,
        equity: 100000,
        usedMargin: 0,
        freeMargin: 100000,
        currency: 'USD',
        accountId: 'mock',
        accountType: 'demo',
        allowedOrderTypes: [OrderType.MARKET, OrderType.LIMIT]
      };
    }
    getAccountBalance(): number { return 100000; }
    getBuyingPower(): number { return 100000; }
    async validateOrder(): Promise<{ isValid: boolean; reason?: string }> { return { isValid: true }; }
    
    getMarketData(): MarketData | null { return null; }
    getCurrentPrice(): number | null { return null; }
    isMarketOpen(): boolean { return true; }
    
    registerStrategy(): void {}
    unregisterStrategy(): void {}
    setStrategyActive(): void {}
    updateStrategyConfig(): void {}
    getStrategies(): Array<{ definition: StrategyDefinition; config: StrategyConfig; isActive: boolean }> { return []; }
    
    getSupportedSymbols(): string[] { return ['MOCK']; }
    getSupportedOrderTypes(): OrderType[] { return [OrderType.MARKET, OrderType.LIMIT]; }
    getCapabilities() {
      return {
        supportsHistoricalData: false,
        supportsRealTimeData: true,
        supportsBracketOrders: true,
        supportsModifyOrders: true,
        supportsPartialFills: false,
        supportsMultipleSymbols: false,
        supportsShortSelling: false,
        supportsMarginTrading: false,
      };
    }
  })();
}

export default IExecutionEngine; 