'use client';

import Link from "next/link";
import { useState } from 'react';
import Layout from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePositions, useOrders } from "@/hooks/useData";
import { closePosition } from "@/lib/api";

export default function PositionsPage() {
  const { positions, isLoading: positionsLoading, isError: positionsError, mutate: mutatePositions } = usePositions();
  const { orders, isLoading: ordersLoading, isError: ordersError } = useOrders();
  const [closingId, setClosingId] = useState<string | null>(null);

  const handleClosePosition = async (id: string) => {
    setClosingId(id);
    try {
      await closePosition(id);
      mutatePositions(); // Refresh positions after closing
    } catch (error) {
      console.error('Error closing position:', error);
    } finally {
      setClosingId(null);
    }
  };

  const renderPositionsContent = () => {
    if (positionsError) {
      return (
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">Failed to load positions</p>
          <Button onClick={() => mutatePositions()}>Try Again</Button>
        </div>
      );
    }

    if (positionsLoading) {
      return (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Entry Price</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>Open Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i} className="opacity-70">
                  <TableCell><div className="h-5 w-32 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-20 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-20 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-10 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-28 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell className="text-right"><div className="h-9 w-32 bg-muted rounded animate-pulse ml-auto"></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Entry Price</TableHead>
              <TableHead>Current Price</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>P&L</TableHead>
              <TableHead>Open Time</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-medium">{position.strategyName}</TableCell>
                <TableCell>{position.contract}</TableCell>
                <TableCell>
                  <Badge 
                    variant="outline"
                    className={position.side === 'long' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                  >
                    {position.side.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>{position.entryPrice.toFixed(2)}</TableCell>
                <TableCell>{position.currentPrice.toFixed(2)}</TableCell>
                <TableCell>{position.size}</TableCell>
                <TableCell className={position.pnl >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  ${Math.abs(position.pnl).toFixed(2)}
                </TableCell>
                <TableCell>{new Date(position.openTime).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button 
                    onClick={() => handleClosePosition(position.id)}
                    variant="destructive" 
                    size="sm"
                    className="mr-1"
                    disabled={closingId === position.id}
                  >
                    {closingId === position.id ? 'Closing...' : 'Close'}
                  </Button>
                  <Button variant="outline" size="sm">Modify</Button>
                </TableCell>
              </TableRow>
            ))}
            {positions.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center">No open positions</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderOrdersContent = () => {
    if (ordersError) {
      return (
        <div className="text-center py-8">
          <p className="text-red-500 mb-2">Failed to load order history</p>
        </div>
      );
    }

    if (ordersLoading) {
      return (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i} className="opacity-70">
                  <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-32 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-20 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-10 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-28 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-20 bg-muted rounded animate-pulse"></div></TableCell>
                  <TableCell><div className="h-5 w-20 bg-muted rounded animate-pulse"></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.id}</TableCell>
                <TableCell className="font-medium">{order.strategyName}</TableCell>
                <TableCell>{order.contract}</TableCell>
                <TableCell>
                  <Badge 
                    variant="outline"
                    className={order.side === 'buy' || order.side === 'long' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                  >
                    {order.side.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>{order.price.toFixed(2)}</TableCell>
                <TableCell>{order.size}</TableCell>
                <TableCell>{new Date(order.time).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge 
                    variant="outline"
                    className={
                      order.status === 'filled' ? 'bg-green-100 text-green-800' : 
                      order.status === 'submitted' ? 'bg-blue-100 text-blue-800' : 
                      order.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }
                  >
                    {order.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>{order.type.toUpperCase()}</TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center">No order history found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Position Management</h1>
      </div>

      <Tabs defaultValue="positions" className="w-full">
        <TabsList>
          <TabsTrigger value="positions">Open Positions</TabsTrigger>
          <TabsTrigger value="orders">Order History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="positions">
          {renderPositionsContent()}
        </TabsContent>
        
        <TabsContent value="orders">
          {renderOrdersContent()}
        </TabsContent>
      </Tabs>
    </Layout>
  );
} 