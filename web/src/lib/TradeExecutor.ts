// TradeExecutor - Handles execution of trade ideas from strategies
// This service manages orders, positions, and trade lifecycle

import { OrderManager } from './OrderManager';
import { TradeIdea, TradeIdeaAnalysis } from './types/strategy';
import {
  BacktestBarData,
  Order,
  OrderType,
  OrderSide,
  StrategySignal,
  StrategySignalType,
  SimulatedTrade,
  TradeType,
  UTCTimestamp
} from './types/backtester';

export interface TradeExecutorConfig {
  commission: number;
  useMarketOrders: boolean;
  limitOrderOffset: number;
  tickSize: number;
}

export interface ExecutionResult {
  executed: boolean;
  orders: Order[];
  signal?: StrategySignal;
  message: string;
}

export class TradeExecutor {
  private config: TradeExecutorConfig;
  private orderManager: OrderManager;
  private executedTrades: SimulatedTrade[] = [];
  private activeTradeIdeas: Map<string, TradeIdea> = new Map();
  
  constructor(config: Partial<TradeExecutorConfig> = {}, orderManager?: OrderManager) {
    this.config = {
      commission: 2.50,
      useMarketOrders: true,
      limitOrderOffset: 2,
      tickSize: 0.25,
      ...config
    };
    this.orderManager = orderManager || new OrderManager(this.config.tickSize);
  }

  // Main method - execute a trade idea
  public executeTradeIdea(
    tradeIdea: TradeIdea,
    currentBar: BacktestBarData
  ): ExecutionResult {
    // Analyze the trade idea
    const analysis = this.analyzeTradeIdea(tradeIdea, currentBar);
    
    if (!analysis.shouldExecute || !analysis.executionPlan) {
      return {
        executed: false,
        orders: [],
        message: analysis.rejectionReason || 'Trade idea rejected'
      };
    }

    // Execute based on action
    switch (tradeIdea.action) {
      case 'ENTER_LONG':
      case 'ENTER_SHORT':
        return this.executeEntry(tradeIdea, analysis.executionPlan, currentBar);
      
      case 'EXIT_LONG':
      case 'EXIT_SHORT':
        return this.executeExit(tradeIdea, currentBar);
      
      case 'HOLD':
        return {
          executed: false,
          orders: [],
          message: 'Hold - no action taken'
        };
      
      default:
        return {
          executed: false,
          orders: [],
          message: 'Unknown action type'
        };
    }
  }

  // Process bar and handle order fills
  public processBar(bar: BacktestBarData, barIndex: number): Order[] {
    return this.orderManager.processBar(bar, barIndex);
  }

  // Analyze if trade idea should be executed
  private analyzeTradeIdea(
    tradeIdea: TradeIdea,
    currentBar: BacktestBarData
  ): TradeIdeaAnalysis {
    const currentPosition = this.orderManager.getOpenPosition(tradeIdea.contractId);
    
    // Check if we're trying to enter when we already have a position
    if ((tradeIdea.action === 'ENTER_LONG' || tradeIdea.action === 'ENTER_SHORT') && currentPosition) {
      return {
        tradeIdea,
        shouldExecute: false,
        rejectionReason: 'Already have an open position'
      };
    }

    // Check if we're trying to exit when we don't have a position
    if ((tradeIdea.action === 'EXIT_LONG' || tradeIdea.action === 'EXIT_SHORT') && !currentPosition) {
      return {
        tradeIdea,
        shouldExecute: false,
        rejectionReason: 'No open position to exit'
      };
    }

    // Determine execution plan
    const executionPlan = {
      orderType: (this.config.useMarketOrders ? 'MARKET' : 'LIMIT') as 'MARKET' | 'LIMIT',
      entryPrice: tradeIdea.suggestedEntryPrice || currentBar.open,
      quantity: tradeIdea.suggestedQuantity || 1,
      stopLossPrice: tradeIdea.suggestedStopLoss,
      takeProfitPrice: tradeIdea.suggestedTakeProfit
    };

    return {
      tradeIdea,
      shouldExecute: true,
      executionPlan
    };
  }

  // Execute entry order
  private executeEntry(
    tradeIdea: TradeIdea,
    executionPlan: NonNullable<TradeIdeaAnalysis['executionPlan']>,
    currentBar: BacktestBarData
  ): ExecutionResult {
    const side = tradeIdea.action === 'ENTER_LONG' ? OrderSide.BUY : OrderSide.SELL;
    
    // Submit entry order
    const entryOrder = this.orderManager.submitOrder({
      contractId: tradeIdea.contractId,
      tradeId: tradeIdea.id,
      type: executionPlan.orderType as OrderType,
      side: side,
      quantity: executionPlan.quantity,
      price: executionPlan.entryPrice,
      submittedTime: currentBar.time,
      message: `${tradeIdea.action} - ${tradeIdea.reason}`,
      parentTradeId: tradeIdea.id
    });

    // Store the trade idea for tracking
    this.activeTradeIdeas.set(tradeIdea.id, tradeIdea);

    // Create chart signal
    const signal: StrategySignal = {
      barIndex: currentBar.time as any,
      time: currentBar.time,
      type: side === OrderSide.BUY ? StrategySignalType.BUY : StrategySignalType.SELL,
      price: executionPlan.entryPrice,
      message: tradeIdea.reason
    };

    return {
      executed: true,
      orders: [entryOrder],
      signal,
      message: `Executed ${tradeIdea.action} order`
    };
  }

  // Execute exit order
  private executeExit(
    tradeIdea: TradeIdea,
    currentBar: BacktestBarData
  ): ExecutionResult {
    const position = this.orderManager.getOpenPosition(tradeIdea.contractId);
    if (!position) {
      return {
        executed: false,
        orders: [],
        message: 'No position to exit'
      };
    }

    const exitSide = position.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const exitPrice = currentBar.open;

    // Submit exit order
    const exitOrder = this.orderManager.submitOrder({
      contractId: tradeIdea.contractId,
      tradeId: position.id,
      type: OrderType.MARKET,
      side: exitSide,
      quantity: position.size,
      price: exitPrice,
      submittedTime: currentBar.time,
      message: `${tradeIdea.action} - ${tradeIdea.reason}`,
      parentTradeId: position.id
    });

    // Log the completed trade
    this.logCompletedTrade(position, exitPrice, currentBar.time, tradeIdea.reason);

    // Create chart signal
    const signal: StrategySignal = {
      barIndex: currentBar.time as any,
      time: currentBar.time,
      type: exitSide === OrderSide.SELL ? StrategySignalType.SELL : StrategySignalType.BUY,
      price: exitPrice,
      message: tradeIdea.reason
    };

    return {
      executed: true,
      orders: [exitOrder],
      signal,
      message: `Executed ${tradeIdea.action} order`
    };
  }

  // Log completed trade
  private logCompletedTrade(
    position: any,
    exitPrice: number,
    exitTime: UTCTimestamp,
    exitReason: string
  ): void {
    const pnlInfo = this.orderManager.getClosedPositionPnL(
      position.averageEntryPrice,
      exitPrice,
      position.size,
      position.side,
      this.config.commission * position.size * 2
    );

    const trade: SimulatedTrade = {
      id: position.id,
      entryTime: position.entryTime || exitTime,
      exitTime: exitTime,
      entryPrice: position.averageEntryPrice,
      exitPrice: exitPrice,
      size: position.size,
      type: position.side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      profitOrLoss: pnlInfo.netPnl,
      commission: pnlInfo.commission,
      status: 'CLOSED'
    };

    this.executedTrades.push(trade);
  }

  // Get all executed trades
  public getExecutedTrades(): SimulatedTrade[] {
    return this.executedTrades;
  }

  // Get order manager instance
  public getOrderManager(): OrderManager {
    return this.orderManager;
  }

  // Reset executor state
  public reset(): void {
    this.executedTrades = [];
    this.activeTradeIdeas.clear();
    this.orderManager.reset();
  }
} 