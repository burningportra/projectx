'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Layout from "@/components/layout/Layout";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStrategies } from "@/hooks/useData";
import { updateStrategyStatus } from "@/lib/api";

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface Strategy {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'stopped';
  timeframes: {
    primary: TimeFrame;
    secondary?: TimeFrame;
  };
}

export default function StrategiesPage() {
  const router = useRouter();
  const { strategies, isLoading, isError, mutate } = useStrategies();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleActivate = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateStrategyStatus(id, 'active');
      mutate(); // Refresh the data after update
    } catch (error) {
      console.error('Error activating strategy:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePause = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateStrategyStatus(id, 'paused');
      mutate();
    } catch (error) {
      console.error('Error pausing strategy:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStop = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateStrategyStatus(id, 'inactive');
      mutate();
    } catch (error) {
      console.error('Error stopping strategy:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
      case 'paused':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>;
      case 'inactive':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inactive</Badge>;
      default:
        return null;
    }
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Failed to load strategies</h2>
            <p className="text-muted-foreground mb-4">There was an error retrieving strategy data.</p>
            <Button onClick={() => mutate()}>Try Again</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Trading Strategies</h1>
        <Link 
          href="/strategies/new" 
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          New Strategy
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="opacity-70">
              <CardHeader>
                <div className="h-6 w-48 bg-muted rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-muted rounded animate-pulse mb-4"></div>
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse mb-6"></div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="h-3 w-16 bg-muted rounded animate-pulse mb-2"></div>
                    <div className="h-4 w-12 bg-muted rounded animate-pulse"></div>
                  </div>
                  <div>
                    <div className="h-3 w-16 bg-muted rounded animate-pulse mb-2"></div>
                    <div className="h-4 w-12 bg-muted rounded animate-pulse"></div>
                  </div>
                </div>
                <div className="h-16 w-full bg-muted rounded animate-pulse"></div>
              </CardContent>
              <CardFooter>
                <div className="h-9 w-20 bg-muted rounded animate-pulse mr-2"></div>
                <div className="h-9 w-20 bg-muted rounded animate-pulse"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {strategies.map((strategy) => (
            <Card key={strategy.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{strategy.name}</CardTitle>
                  {getStatusBadge(strategy.status)}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{strategy.description}</p>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Contracts</p>
                    <p className="text-sm font-medium">{strategy.contracts.join(', ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Timeframes</p>
                    <p className="text-sm font-medium">{strategy.timeframes.join(', ')}</p>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-md">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                      <p className="text-sm font-medium">{strategy.performance.winRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">P&L</p>
                      <p className={`text-sm font-medium ${strategy.performance.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${Math.abs(strategy.performance.pnl).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Trades</p>
                      <p className="text-sm font-medium">{strategy.performance.trades}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                {strategy.status !== 'active' && (
                  <Button 
                    onClick={() => handleActivate(strategy.id)}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={updatingId === strategy.id}
                  >
                    {updatingId === strategy.id ? 'Activating...' : 'Activate'}
                  </Button>
                )}
                {strategy.status === 'active' && (
                  <Button 
                    onClick={() => handlePause(strategy.id)}
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-600"
                    disabled={updatingId === strategy.id}
                  >
                    {updatingId === strategy.id ? 'Pausing...' : 'Pause'}
                  </Button>
                )}
                {strategy.status !== 'inactive' && (
                  <Button 
                    onClick={() => handleStop(strategy.id)}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700"
                    disabled={updatingId === strategy.id}
                  >
                    {updatingId === strategy.id ? 'Stopping...' : 'Stop'}
                  </Button>
                )}
                <Button size="sm" variant="outline">Edit</Button>
              </CardFooter>
            </Card>
          ))}

          {strategies.length === 0 && !isLoading && (
            <div className="col-span-full flex justify-center items-center h-64">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">No strategies found</h2>
                <p className="text-muted-foreground mb-4">Create your first trading strategy to get started.</p>
                <Button>Create Strategy</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
} 