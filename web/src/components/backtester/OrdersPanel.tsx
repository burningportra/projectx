"use client";

import React from 'react';
import { Order, OrderStatus, OrderType, OrderSide } from '@/lib/types/backtester';

interface OrdersPanelProps {
  pendingOrders: Order[];
  filledOrders: Order[];
  cancelledOrders: Order[];
  onCancelOrder?: (orderId: string) => void;
}

const OrdersPanel: React.FC<OrdersPanelProps> = ({
  pendingOrders,
  filledOrders,
  cancelledOrders,
  onCancelOrder,
}) => {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const formatPrice = (price: number | undefined) => {
    return price ? `$${price.toFixed(2)}` : 'N/A';
  };

  const getOrderTypeIcon = (type: OrderType) => {
    switch (type) {
      case OrderType.MARKET:
        return '⚡';
      case OrderType.LIMIT:
        return '🎯';
      case OrderType.STOP:
        return '🛑';
      case OrderType.STOP_LIMIT:
        return '🔄';
      default:
        return '📝';
    }
  };

  const getOrderSideColor = (side: OrderSide) => {
    return side === OrderSide.BUY ? 'text-green-600' : 'text-red-600';
  };

  const getStatusBadge = (status: OrderStatus) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case OrderStatus.PENDING:
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case OrderStatus.FILLED:
        return `${baseClasses} bg-green-100 text-green-800`;
      case OrderStatus.CANCELLED:
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case OrderStatus.REJECTED:
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-blue-100 text-blue-800`;
    }
  };

  const OrderTable: React.FC<{ orders: Order[]; showCancel?: boolean }> = ({ orders, showCancel = false }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Side
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Qty
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Price
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Stop
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Filled
            </th>
            {showCancel && (
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                {formatTime(order.submittedTime)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                <span className="mr-1">{getOrderTypeIcon(order.type)}</span>
                {order.type}
              </td>
              <td className={`px-3 py-2 whitespace-nowrap text-sm font-medium ${getOrderSideColor(order.side)}`}>
                {order.side}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                {order.quantity}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                {formatPrice(order.price)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                {formatPrice(order.stopPrice)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={getStatusBadge(order.status)}>
                  {order.status}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                {order.filledPrice ? formatPrice(order.filledPrice) : '-'}
              </td>
              {showCancel && (
                <td className="px-3 py-2 whitespace-nowrap text-sm">
                  {order.status === OrderStatus.PENDING && onCancelOrder && (
                    <button
                      onClick={() => onCancelOrder(order.id)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Pending Orders */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 bg-yellow-50">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <span className="mr-2">⏳</span>
            Pending Orders
            <span className="ml-2 text-sm bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">
              {pendingOrders.length}
            </span>
          </h3>
        </div>
        <div className="p-4">
          {pendingOrders.length > 0 ? (
            <OrderTable orders={pendingOrders} showCancel={true} />
          ) : (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl mb-2 block">📭</span>
              No pending orders
            </div>
          )}
        </div>
      </div>

      {/* Filled Orders */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 bg-green-50">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <span className="mr-2">✅</span>
            Filled Orders
            <span className="ml-2 text-sm bg-green-200 text-green-800 px-2 py-1 rounded-full">
              {filledOrders.length}
            </span>
          </h3>
        </div>
        <div className="p-4">
          {filledOrders.length > 0 ? (
            <OrderTable orders={filledOrders} />
          ) : (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl mb-2 block">📈</span>
              No filled orders yet
            </div>
          )}
        </div>
      </div>

      {/* Cancelled Orders */}
      {cancelledOrders.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <span className="mr-2">❌</span>
              Cancelled Orders
              <span className="ml-2 text-sm bg-gray-200 text-gray-800 px-2 py-1 rounded-full">
                {cancelledOrders.length}
              </span>
            </h3>
          </div>
          <div className="p-4">
            <OrderTable orders={cancelledOrders} />
          </div>
        </div>
      )}

      {/* Order Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Order Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{pendingOrders.length}</div>
            <div className="text-sm text-gray-500">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{filledOrders.length}</div>
            <div className="text-sm text-gray-500">Filled</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{cancelledOrders.length}</div>
            <div className="text-sm text-gray-500">Cancelled</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {pendingOrders.length + filledOrders.length + cancelledOrders.length}
            </div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Order Type Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div className="flex items-center">
            <span className="mr-2">⚡</span>
            <span>Market</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">🎯</span>
            <span>Limit</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">🛑</span>
            <span>Stop</span>
          </div>
          <div className="flex items-center">
            <span className="mr-2">🔄</span>
            <span>Stop-Limit</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrdersPanel; 