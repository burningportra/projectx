import { ISeriesApi, IPriceLine, LineStyle, LineWidth } from 'lightweight-charts';
import { Order, Position, OrderSide, OrderType, OrderStatus } from '../orders/types';

export interface OrderLineConfig {
  color: string;
  lineStyle: LineStyle;
  lineWidth: LineWidth;
  title: string;
}

export class OrderLineManager {
  private orderLines: Map<string, IPriceLine> = new Map();
  private positionLines: Map<string, IPriceLine> = new Map();
  private series: ISeriesApi<any> | null = null;

  constructor(series?: ISeriesApi<any>) {
    if (series) {
      this.series = series;
    }
  }

  setSeries(series: ISeriesApi<any>) {
    this.series = series;
    this.clearAllLines();
  }

  // Order line management
  addOrderLine(order: Order): void {
    if (!this.series) return;

    // Get the price to display (price for limit orders, stopPrice for stop orders)
    const displayPrice = order.type === OrderType.STOP || order.type === OrderType.STOP_LIMIT 
      ? order.stopPrice 
      : order.price;
    
    // Market orders don't have a price, so we shouldn't display them as lines
    if (!displayPrice && order.type === OrderType.MARKET) {
      return;
    }
    
    if (!displayPrice) {
      return;
    }

    const config = this.getOrderLineConfig(order);
    
    const line = this.series.createPriceLine({
      price: displayPrice,
      color: config.color,
      lineStyle: config.lineStyle,
      lineWidth: config.lineWidth,
      axisLabelVisible: true,
      title: config.title,
    });

    this.orderLines.set(order.id, line);
  }

  updateOrderLine(order: Order): void {
    if (!this.series) return;

    // Get the price to display
    const displayPrice = order.type === OrderType.STOP || order.type === OrderType.STOP_LIMIT 
      ? order.stopPrice 
      : order.price;
      
    if (!displayPrice) return;

    const existingLine = this.orderLines.get(order.id);
    if (existingLine) {
      const config = this.getOrderLineConfig(order);
      existingLine.applyOptions({
        price: displayPrice,
        color: config.color,
        title: config.title,
      });
    } else {
      this.addOrderLine(order);
    }
  }

  removeOrderLine(orderId: string): void {
    if (!this.series) return;

    const line = this.orderLines.get(orderId);
    if (line) {
      this.series.removePriceLine(line);
      this.orderLines.delete(orderId);
    }
  }

  // Position line management
  addPositionLine(position: Position): void {
    if (!this.series || position.side === 'FLAT') return;

    const config = this.getPositionLineConfig(position);
    
    const line = this.series.createPriceLine({
      price: position.averageEntryPrice,
      color: config.color,
      lineStyle: config.lineStyle,
      lineWidth: config.lineWidth,
      axisLabelVisible: true,
      title: config.title,
      id: `position-${position.symbol}`,
    });

    this.positionLines.set(position.symbol, line);
  }

  updatePositionLine(position: Position): void {
    if (!this.series) return;

    if (position.side === 'FLAT') {
      this.removePositionLine(position.symbol);
      return;
    }

    const existingLine = this.positionLines.get(position.symbol);
    if (existingLine) {
      const config = this.getPositionLineConfig(position);
      existingLine.applyOptions({
        price: position.averageEntryPrice,
        color: config.color,
        title: config.title,
      });
    } else {
      this.addPositionLine(position);
    }
  }

  removePositionLine(symbol: string): void {
    if (!this.series) return;

    const line = this.positionLines.get(symbol);
    if (line) {
      this.series.removePriceLine(line);
      this.positionLines.delete(symbol);
    }
  }

  // Clear all lines
  clearAllLines(): void {
    if (!this.series) return;

    // Remove all order lines
    for (const line of this.orderLines.values()) {
      this.series.removePriceLine(line);
    }
    this.orderLines.clear();

    // Remove all position lines
    for (const line of this.positionLines.values()) {
      this.series.removePriceLine(line);
    }
    this.positionLines.clear();
  }

  // Configuration helpers
  private getOrderLineConfig(order: Order): OrderLineConfig {
    const isBuy = order.side === OrderSide.BUY;
    const baseColor = isBuy ? '#2196F3' : '#f44336'; // Blue for buy, red for sell
    
    // Get display price
    const displayPrice = order.type === OrderType.STOP || order.type === OrderType.STOP_LIMIT 
      ? order.stopPrice 
      : order.price;
    
    let lineStyle: LineStyle;
    let title: string;
    
    switch (order.type) {
      case OrderType.LIMIT:
        lineStyle = LineStyle.Dashed;
        title = `${order.side} LIMIT @ $${displayPrice?.toFixed(2)} (${order.quantity})`;
        break;
      case OrderType.STOP:
        lineStyle = LineStyle.Dotted;
        title = `${order.side} STOP @ $${displayPrice?.toFixed(2)} (${order.quantity})`;
        break;
      case OrderType.STOP_LIMIT:
        lineStyle = LineStyle.Dotted;
        title = `${order.side} STOP-LIMIT @ $${displayPrice?.toFixed(2)} (${order.quantity})`;
        break;
      default:
        lineStyle = LineStyle.Solid;
        title = `${order.side} MARKET (${order.quantity})`;
        break;
    }

    // Dim color for cancelled/rejected orders
    const color = order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED 
      ? '#9e9e9e' 
      : baseColor;

    return {
      color,
      lineStyle,
      lineWidth: 1 as LineWidth,
      title,
    };
  }

  private getPositionLineConfig(position: Position): OrderLineConfig {
    const isLong = position.side === 'LONG';
    const baseColor = isLong ? '#4caf50' : '#f44336'; // Green for long, red for short
    
    const pnl = position.unrealizedPnL;
    const pnlText = pnl >= 0 ? `+$${pnl.toFixed(0)}` : `-$${Math.abs(pnl).toFixed(0)}`;
    
    const title = `${position.side} ${position.quantity} @ $${position.averageEntryPrice.toFixed(2)} (${pnlText})`;

    return {
      color: baseColor,
      lineStyle: LineStyle.Solid,
      lineWidth: 2 as LineWidth,
      title,
    };
  }

  // Utility methods
  getOrderLineCount(): number {
    return this.orderLines.size;
  }

  getPositionLineCount(): number {
    return this.positionLines.size;
  }

  hasOrderLine(orderId: string): boolean {
    return this.orderLines.has(orderId);
  }

  hasPositionLine(symbol: string): boolean {
    return this.positionLines.has(symbol);
  }

  getAllOrderLineIds(): string[] {
    return Array.from(this.orderLines.keys());
  }

  getAllPositionLineSymbols(): string[] {
    return Array.from(this.positionLines.keys());
  }

  removeOrderLinesNotIn(orderIds: string[]): void {
    const orderIdsSet = new Set(orderIds);
    const currentOrderIds = this.getAllOrderLineIds();
    
    currentOrderIds.forEach(orderId => {
      if (!orderIdsSet.has(orderId)) {
        this.removeOrderLine(orderId);
      }
    });
  }

  removePositionLinesNotIn(symbols: string[]): void {
    const symbolsSet = new Set(symbols);
    const currentSymbols = this.getAllPositionLineSymbols();
    
    currentSymbols.forEach(symbol => {
      if (!symbolsSet.has(symbol)) {
        this.removePositionLine(symbol);
      }
    });
  }
} 