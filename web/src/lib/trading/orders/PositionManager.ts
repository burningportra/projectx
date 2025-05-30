import { Position, Trade, Order, OrderFill, OrderSide } from './types';
import { EventEmitter } from 'events';

export class PositionManager extends EventEmitter {
  private positions: Map<string, Position> = new Map();
  private trades: Map<string, Trade[]> = new Map();
  private tradeIdCounter: number = 0;

  constructor() {
    super();
  }

  // Process an order fill and update positions
  async processOrderFill(order: Order, fill: OrderFill): Promise<Position> {
    const symbol = order.symbol;
    let position = this.positions.get(symbol);

    if (!position) {
      position = this.createEmptyPosition(symbol);
      this.positions.set(symbol, position);
    }

    // Create trade from fill
    const trade: Trade = {
      id: `T${++this.tradeIdCounter}`,
      orderId: order.id,
      symbol: symbol,
      side: order.side === OrderSide.BUY ? 'BUY' : 'SELL',
      quantity: fill.quantity,
      remainingQuantity: fill.quantity,
      entryPrice: fill.price,
      entryTime: fill.timestamp,
      commission: fill.commission,
      isOpen: true,
    };

    // Process the trade using FIFO
    if (order.side === OrderSide.BUY) {
      this.processBuyTrade(position, trade);
    } else {
      this.processSellTrade(position, trade);
    }

    // Update position market value (using latest fill price as market price)
    position.marketValue = position.quantity * fill.price;
    position.lastUpdateTime = new Date();

    // Emit position update event
    this.emit('positionUpdated', position);

    return position;
  }

  // Process a buy trade
  private processBuyTrade(position: Position, trade: Trade): void {
    if (position.side === 'SHORT') {
      // Closing short position (FIFO)
      this.closePositionFIFO(position, trade, 'SHORT');
    }

    // If trade has remaining quantity, it's opening a long position
    if (trade.remainingQuantity > 0) {
      position.openTrades.push(trade);
      this.updatePositionAfterTrade(position);
    }
  }

  // Process a sell trade
  private processSellTrade(position: Position, trade: Trade): void {
    if (position.side === 'LONG') {
      // Closing long position (FIFO)
      this.closePositionFIFO(position, trade, 'LONG');
    }

    // If trade has remaining quantity, it's opening a short position
    if (trade.remainingQuantity > 0) {
      trade.entryPrice = -trade.entryPrice; // Negative price for short positions
      position.openTrades.push(trade);
      this.updatePositionAfterTrade(position);
    }
  }

  // Close position using FIFO
  private closePositionFIFO(position: Position, closingTrade: Trade, positionSide: 'LONG' | 'SHORT'): void {
    let remainingCloseQuantity = closingTrade.quantity;

    // Process open trades in FIFO order
    const newOpenTrades: Trade[] = [];
    
    for (const openTrade of position.openTrades) {
      if (remainingCloseQuantity === 0) {
        newOpenTrades.push(openTrade);
        continue;
      }

      const closeQuantity = Math.min(openTrade.remainingQuantity, remainingCloseQuantity);
      
      // Calculate realized P&L
      const entryPrice = Math.abs(openTrade.entryPrice);
      const exitPrice = Math.abs(closingTrade.entryPrice);
      
      let realizedPnL: number;
      if (positionSide === 'LONG') {
        realizedPnL = (exitPrice - entryPrice) * closeQuantity;
      } else {
        realizedPnL = (entryPrice - exitPrice) * closeQuantity;
      }
      
      // Subtract commissions
      const proportionalEntryCommission = (closeQuantity / openTrade.quantity) * openTrade.commission;
      const proportionalExitCommission = (closeQuantity / closingTrade.quantity) * closingTrade.commission;
      realizedPnL -= (proportionalEntryCommission + proportionalExitCommission);

      // Update realized P&L
      position.realizedPnL += realizedPnL;
      position.totalCommission += proportionalExitCommission;

      // Create closed trade record
      const closedTrade: Trade = {
        ...openTrade,
        remainingQuantity: 0,
        exitPrice: exitPrice,
        exitTime: closingTrade.entryTime,
        realizedPnL: realizedPnL,
        isOpen: false,
      };
      position.closedTrades.push(closedTrade);

      // Update open trade
      openTrade.remainingQuantity -= closeQuantity;
      if (openTrade.remainingQuantity > 0) {
        newOpenTrades.push(openTrade);
      }

      // Update closing trade
      remainingCloseQuantity -= closeQuantity;
      closingTrade.remainingQuantity -= closeQuantity;
    }

    position.openTrades = newOpenTrades;
  }

  // Update position metrics after trade
  private updatePositionAfterTrade(position: Position): void {
    // Calculate total quantity and average price
    let totalQuantity = 0;
    let totalCost = 0;

    for (const trade of position.openTrades) {
      const quantity = trade.remainingQuantity;
      const price = Math.abs(trade.entryPrice);
      totalQuantity += quantity;
      totalCost += quantity * price;
    }

    position.quantity = totalQuantity;
    position.averageEntryPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // Update position side
    if (totalQuantity === 0) {
      position.side = 'FLAT';
    } else if (position.openTrades.length > 0 && position.openTrades[0].entryPrice < 0) {
      position.side = 'SHORT';
    } else {
      position.side = 'LONG';
    }
  }

  // Calculate unrealized P&L
  updateUnrealizedPnL(symbol: string, marketPrice: number): void {
    const position = this.positions.get(symbol);
    if (!position || position.side === 'FLAT') return;

    let unrealizedPnL = 0;
    for (const trade of position.openTrades) {
      const entryPrice = Math.abs(trade.entryPrice);
      const quantity = trade.remainingQuantity;
      
      if (position.side === 'LONG') {
        unrealizedPnL += (marketPrice - entryPrice) * quantity;
      } else {
        unrealizedPnL += (entryPrice - marketPrice) * quantity;
      }
    }

    position.unrealizedPnL = unrealizedPnL;
    position.marketValue = position.quantity * marketPrice;
    position.lastUpdateTime = new Date();

    this.emit('positionUpdated', position);
  }

  // Get position for a symbol
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  // Get all positions
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  // Get open positions
  getOpenPositions(): Position[] {
    return this.getAllPositions().filter(p => p.side !== 'FLAT');
  }

  // Get total portfolio value
  getPortfolioValue(): { totalValue: number; realizedPnL: number; unrealizedPnL: number } {
    let totalValue = 0;
    let realizedPnL = 0;
    let unrealizedPnL = 0;

    for (const position of this.positions.values()) {
      totalValue += position.marketValue;
      realizedPnL += position.realizedPnL;
      unrealizedPnL += position.unrealizedPnL;
    }

    return { totalValue, realizedPnL, unrealizedPnL };
  }

  // Get trade history
  getTradeHistory(symbol?: string): Trade[] {
    if (symbol) {
      const position = this.positions.get(symbol);
      return position ? [...position.closedTrades, ...position.openTrades] : [];
    }

    const allTrades: Trade[] = [];
    for (const position of this.positions.values()) {
      allTrades.push(...position.closedTrades, ...position.openTrades);
    }
    return allTrades.sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  }

  // Create empty position
  private createEmptyPosition(symbol: string): Position {
    return {
      symbol,
      side: 'FLAT',
      quantity: 0,
      averageEntryPrice: 0,
      marketValue: 0,
      unrealizedPnL: 0,
      realizedPnL: 0,
      totalCommission: 0,
      openTrades: [],
      closedTrades: [],
      lastUpdateTime: new Date(),
    };
  }

  // Clear all positions (useful for backtesting reset)
  clearAll(): void {
    this.positions.clear();
    this.trades.clear();
    this.tradeIdCounter = 0;
  }

  // Get position summary
  getPositionSummary(): {
    totalPositions: number;
    openPositions: number;
    totalRealizedPnL: number;
    totalUnrealizedPnL: number;
    totalCommission: number;
  } {
    const positions = this.getAllPositions();
    const openPositions = this.getOpenPositions();
    
    let totalRealizedPnL = 0;
    let totalUnrealizedPnL = 0;
    let totalCommission = 0;

    for (const position of positions) {
      totalRealizedPnL += position.realizedPnL;
      totalUnrealizedPnL += position.unrealizedPnL;
      totalCommission += position.totalCommission;
    }

    return {
      totalPositions: positions.length,
      openPositions: openPositions.length,
      totalRealizedPnL,
      totalUnrealizedPnL,
      totalCommission,
    };
  }
} 