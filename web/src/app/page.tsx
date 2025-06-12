'use client';

import Link from "next/link";
import { useState } from 'react';
import Layout from "@/components/layout/Layout";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStrategies, usePositions } from "@/hooks/useData";

export default function Home() {
  const { strategies, isLoading: strategiesLoading } = useStrategies();
  const { positions, isLoading: positionsLoading } = usePositions();

  // Ensure positions is an array
  const positionsArray = Array.isArray(positions) ? positions : [];
  
  // Filter active strategies
  const activeStrategies = strategies.filter(s => s.status === 'active');
  
  // Calculate total P&L
  const totalPnl = positionsArray.reduce((sum, pos) => sum + pos.pnl, 0);
  
  // Calculate win rate (could be from API in real implementation)
  const winRate = 68;
  
  // Calculate average trade profit
  const avgTradeProfit = positionsArray.length > 0 
    ? totalPnl / positionsArray.length 
    : 42.11; // Default value if no positions

  return (
    <Layout>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active Strategies */}
        <Card>
          <CardHeader>
            <CardTitle>Active Strategies</CardTitle>
          </CardHeader>
          <CardContent>
            {strategiesLoading ? (
              <div className="space-y-4">
                <div className="border-t border-gray-200 dark:border-gray-700 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-5 w-32 bg-muted rounded animate-pulse mb-2"></div>
                      <div className="h-3 w-24 bg-muted rounded animate-pulse"></div>
                    </div>
                    <div className="h-6 w-16 bg-muted rounded animate-pulse"></div>
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-5 w-40 bg-muted rounded animate-pulse mb-2"></div>
                      <div className="h-3 w-24 bg-muted rounded animate-pulse"></div>
                    </div>
                    <div className="h-6 w-16 bg-muted rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {activeStrategies.map(strategy => (
                  <div key={strategy.id} className="border-t border-gray-200 dark:border-gray-700 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">{strategy.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {strategy.contracts.join(', ')}, {strategy.timeframes.join(', ')} timeframe
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                    </div>
                  </div>
                ))}
                {activeStrategies.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>No active strategies</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href="/strategies" className="text-sm font-medium text-primary hover:underline">
              View all strategies &rarr;
            </Link>
          </CardFooter>
        </Card>

        {/* Open Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {positionsLoading ? (
              <div className="border-t border-gray-200 dark:border-gray-700 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-5 w-24 bg-muted rounded animate-pulse mb-2"></div>
                    <div className="h-3 w-40 bg-muted rounded animate-pulse"></div>
                  </div>
                  <div className="h-6 w-16 bg-muted rounded animate-pulse"></div>
                </div>
              </div>
            ) : (
              <>
                {positionsArray.map(position => (
                  <div key={position.id} className="border-t border-gray-200 dark:border-gray-700 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">
                          {position.contract} - {position.side.toUpperCase()}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Entry: {position.entryPrice.toFixed(2)} - Current: {position.currentPrice.toFixed(2)}
                        </p>
                      </div>
                      <Badge variant="outline" className={position.pnl >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {position.pnl >= 0 ? "+" : ""}{position.pnl.toFixed(2)}
                      </Badge>
                    </div>
                  </div>
                ))}
                {positionsArray.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>No open positions</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
          <CardFooter>
            <Link href="/positions" className="text-sm font-medium text-primary hover:underline">
              View all positions &rarr;
            </Link>
          </CardFooter>
        </Card>

        {/* Performance Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Today's P&L</p>
                <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold text-green-600">+$842.25</p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">{winRate}%</p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Avg. Trade</p>
                <p className={`text-2xl font-bold ${avgTradeProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {avgTradeProfit >= 0 ? '+' : ''}{avgTradeProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
              View detailed performance &rarr;
            </Link>
          </CardFooter>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <div className="border-t border-gray-200 dark:border-gray-700 py-4">
                <div>
                  <h3 className="text-sm font-medium">Position Closed</h3>
                  <p className="text-xs text-muted-foreground">MES - Short - P&L: +$32.50</p>
                  <p className="text-xs text-muted-foreground">Today, 2:45 PM</p>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 py-4">
                <div>
                  <h3 className="text-sm font-medium">Strategy Activated</h3>
                  <p className="text-xs text-muted-foreground">Breakout Strategy</p>
                  <p className="text-xs text-muted-foreground">Today, 9:15 AM</p>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 py-4">
                <div>
                  <h3 className="text-sm font-medium">Position Opened</h3>
                  <p className="text-xs text-muted-foreground">MES - Long - Entry: 4,212.50</p>
                  <p className="text-xs text-muted-foreground">Today, 10:30 AM</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
