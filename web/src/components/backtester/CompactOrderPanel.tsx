"use client";

import React from 'react';
import { Order, OrderStatus, OrderType, OrderSide } from '@/lib/types/backtester';

interface CompactOrderPanelProps {
  pendingOrders: Order[];
  filledOrders: Order[];
  openPositions?: {
    entryPrice?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }[];
  onCancelOrder?: (orderId: string) => void;
}

const CompactOrderPanel: React.FC<CompactOrderPanelProps> = ({
  pendingOrders,
  filledOrders,
  openPositions = [],
  onCancelOrder,
}) => {
  const formatPrice = (price: number | undefined) => {
    return price ? `$${price.toFixed(2)}` : 'N/A';
  };

  const getOrderIcon = (type: OrderType) => {
    switch (type) {
      case OrderType.MARKET: return '⚡';
      case OrderType.LIMIT: return '🎯';
      case OrderType.STOP: return '🛑';
      case OrderType.STOP_LIMIT: return '🔄';
      default: return '📝';
    }
  };

  const getSideIcon = (side: OrderSide) => {
    return side === OrderSide.BUY ? '🔵' : '🟠';
  };

  // Show active orders (pending + recent filled)
  const recentFilledOrders = filledOrders.slice(-3); // Last 3 filled orders

  return (
    <div className="bg-gray-900 text-white p-4 rounded-lg space-y-4 min-w-[300px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 pb-2">
        <h3 className="text-lg font-semibold text-green-400">📊 Order Manager</h3>
        <div className="text-xs text-gray-400">
          {pendingOrders.length} pending • {filledOrders.length} filled
        </div>
      </div>

      {/* Open Positions */}
      {openPositions.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-blue-400 border-b border-blue-800 pb-1">
            🏛️ Open Positions ({openPositions.length})
          </div>
          {openPositions.map((position, index) => (
            <div key={index} className="bg-blue-900/30 p-2 rounded border-l-2 border-blue-400">
              <div className="text-blue-300 font-medium text-sm">Position #{index + 1}</div>
              <div className="grid grid-cols-3 gap-2 text-xs mt-1">
                {position.entryPrice && (
                  <div className="text-blue-300">🔵 Entry: {formatPrice(position.entryPrice)}</div>
                )}
                {position.stopLossPrice && (
                  <div className="text-red-300">🛑 SL: {formatPrice(position.stopLossPrice)}</div>
                )}
                {position.takeProfitPrice && (
                  <div className="text-green-300">🎯 TP: {formatPrice(position.takeProfitPrice)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-yellow-400 border-b border-yellow-800 pb-1">
            ⏳ Pending Orders ({pendingOrders.length})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {pendingOrders.map((order) => {
              const price = order.price || order.stopPrice || 0;
              const sideColor = order.side === OrderSide.BUY ? 'text-green-300' : 'text-red-300';
              return (
                <div key={order.id} className="bg-yellow-900/20 p-2 rounded flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span>{getSideIcon(order.side)}</span>
                    <span>{getOrderIcon(order.type)}</span>
                    <span className={`text-xs ${sideColor} font-medium`}>
                      {order.side} {order.type}
                    </span>
                    <span className="text-xs text-gray-300">{formatPrice(price)}</span>
                  </div>
                  {onCancelOrder && (
                    <button
                      onClick={() => onCancelOrder(order.id)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Filled Orders */}
      {recentFilledOrders.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-green-400 border-b border-green-800 pb-1">
            ✅ Recent Fills ({recentFilledOrders.length})
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {recentFilledOrders.map((order) => {
              const price = order.filledPrice || order.price || order.stopPrice || 0;
              const sideColor = order.side === OrderSide.BUY ? 'text-green-300' : 'text-red-300';
              return (
                <div key={order.id} className="bg-green-900/20 p-2 rounded flex items-center space-x-2">
                  <span>{getSideIcon(order.side)}</span>
                  <span>{getOrderIcon(order.type)}</span>
                  <span className={`text-xs ${sideColor} font-medium`}>
                    {order.side} {order.type}
                  </span>
                  <span className="text-xs text-gray-300">{formatPrice(price)}</span>
                  <span className="text-xs text-green-400">✓ FILLED</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {pendingOrders.length === 0 && openPositions.length === 0 && filledOrders.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📭</div>
          <div className="text-sm">No active orders or positions</div>
          <div className="text-xs text-gray-600 mt-1">Orders will appear here during trading</div>
        </div>
      )}
    </div>
  );
};

export default CompactOrderPanel; 