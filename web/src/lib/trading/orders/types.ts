// Order Types
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP = 'STOP',
  STOP_LIMIT = 'STOP_LIMIT',
}

// Order Side
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

// Order Status
export enum OrderStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  PARTIAL_FILLED = 'PARTIAL_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

// Time in Force
export enum TimeInForce {
  DAY = 'DAY',
  GTC = 'GTC', // Good Till Cancelled
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
}

// Order Interface
export interface Order {
  id: string;
  strategyId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number; // For limit orders
  stopPrice?: number; // For stop orders
  timeInForce: TimeInForce;
  status: OrderStatus;
  filledQuantity: number;
  averageFillPrice?: number;
  commission: number;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  filledAt?: Date;
  cancelledAt?: Date;
  rejectedAt?: Date;
  rejectReason?: string;
  parentOrderId?: string; // For bracket orders
  linkedOrderIds?: string[]; // For OCO orders
  metadata?: Record<string, any>;
}

// Order Fill
export interface OrderFill {
  orderId: string;
  fillId: string;
  quantity: number;
  price: number;
  commission: number;
  timestamp: Date;
  slippage: number;
}

// Position Interface
export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'FLAT';
  quantity: number;
  averageEntryPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalCommission: number;
  openTrades: Trade[];
  closedTrades: Trade[];
  lastUpdateTime: Date;
}

// Trade Interface (FIFO tracking)
export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  remainingQuantity: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: Date;
  exitTime?: Date;
  realizedPnL?: number;
  commission: number;
  isOpen: boolean;
}

// Order Request
export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
  strategyId?: string;
  metadata?: Record<string, any>;
}

// Order Update
export interface OrderUpdate {
  orderId: string;
  quantity?: number;
  price?: number;
  stopPrice?: number;
}

// Execution Report
export interface ExecutionReport {
  orderId: string;
  fillId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  commission: number;
  timestamp: Date;
  remainingQuantity: number;
  orderStatus: OrderStatus;
  averageFillPrice: number;
  totalFilledQuantity: number;
}

// Order Book Entry
export interface OrderBookEntry {
  price: number;
  quantity: number;
  orders: number;
}

// Market Data for Execution
export interface MarketData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: Date;
}

// Commission Structure
export interface CommissionStructure {
  perTrade?: number;
  perContract?: number;
  percentage?: number;
  minimum?: number;
  maximum?: number;
}

// Slippage Model
export interface SlippageModel {
  type: 'FIXED' | 'PERCENTAGE' | 'VOLUME_BASED';
  value: number;
  maxSlippage?: number;
}

// Risk Limits
export interface RiskLimits {
  maxPositionSize?: number;
  maxOrderSize?: number;
  maxDailyLoss?: number;
  maxOpenOrders?: number;
  allowShortSelling?: boolean;
} 