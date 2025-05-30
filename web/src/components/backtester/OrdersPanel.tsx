import React from 'react';
import { Order, Position, OrderStatus, OrderSide } from '@/lib/trading/orders/types';

interface OrdersPanelProps {
  orders: Order[];
  positions: Position[];
  className?: string;
}

export default function OrdersPanel({ orders, positions, className = '' }: OrdersPanelProps) {
  // Format currency helper
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Sort orders by creation time (newest first)
  const sortedOrders = [...orders].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Get pending orders only
  const pendingOrders = sortedOrders.filter(o => 
    o.status === OrderStatus.PENDING || 
    o.status === OrderStatus.SUBMITTED || 
    o.status === OrderStatus.PARTIAL_FILLED
  );

  // Get recent filled orders (last 10)
  const recentFilledOrders = sortedOrders
    .filter(o => o.status === OrderStatus.FILLED)
    .slice(0, 10);

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.FILLED:
        return 'text-green-600';
      case OrderStatus.CANCELLED:
      case OrderStatus.REJECTED:
        return 'text-red-600';
      case OrderStatus.PARTIAL_FILLED:
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getSideColor = (side: OrderSide) => {
    return side === OrderSide.BUY ? 'text-green-600' : 'text-red-600';
  };

  const getPositionColor = (side: 'LONG' | 'SHORT' | 'FLAT') => {
    switch (side) {
      case 'LONG':
        return 'text-green-600';
      case 'SHORT':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className={`flex flex-col space-y-4 ${className}`}>
      {/* Open Positions */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Open Positions</h3>
        {positions.filter(p => p.side !== 'FLAT').length > 0 ? (
          <div className="space-y-2">
            {positions.filter(p => p.side !== 'FLAT').map((position, idx) => (
              <div key={idx} className="border rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{position.symbol}</span>
                      <span className={`font-medium ${getPositionColor(position.side)}`}>
                        {position.side}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Qty: {position.quantity} @ ${position.averageEntryPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(position.unrealizedPnL)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Realized: {formatCurrency(position.realizedPnL)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No open positions</p>
        )}
      </div>

      {/* Pending Orders */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Pending Orders</h3>
        {pendingOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 text-left">Symbol</th>
                  <th className="py-2 text-left">Side</th>
                  <th className="py-2 text-left">Type</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingOrders.map((order) => (
                  <tr key={order.id} className="text-sm">
                    <td className="py-2">{order.symbol}</td>
                    <td className={`py-2 ${getSideColor(order.side)}`}>{order.side}</td>
                    <td className="py-2">{order.type}</td>
                    <td className="py-2 text-right">{order.quantity}</td>
                    <td className="py-2 text-right">
                      {order.price ? `$${order.price.toFixed(2)}` : 'Market'}
                    </td>
                    <td className={`py-2 ${getStatusColor(order.status)}`}>
                      {order.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No pending orders</p>
        )}
      </div>

      {/* Recent Filled Orders */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Orders</h3>
        {recentFilledOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 text-left">Time</th>
                  <th className="py-2 text-left">Symbol</th>
                  <th className="py-2 text-left">Side</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Fill Price</th>
                  <th className="py-2 text-right">Comm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentFilledOrders.map((order) => (
                  <tr key={order.id} className="text-sm">
                    <td className="py-2 text-xs">
                      {order.filledAt ? new Date(order.filledAt).toLocaleTimeString() : '-'}
                    </td>
                    <td className="py-2">{order.symbol}</td>
                    <td className={`py-2 ${getSideColor(order.side)}`}>{order.side}</td>
                    <td className="py-2 text-right">{order.filledQuantity}</td>
                    <td className="py-2 text-right">
                      ${order.averageFillPrice?.toFixed(2) || '-'}
                    </td>
                    <td className="py-2 text-right">${order.commission.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No recent orders</p>
        )}
      </div>
    </div>
  );
} 