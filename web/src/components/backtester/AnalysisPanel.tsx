import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SimulatedTrade } from '@/lib/types/backtester';

interface AnalysisPanelProps {
  trades: SimulatedTrade[];
  totalPnL: number;
  winRate: number;
  totalTrades: number;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  trades,
  totalPnL,
  winRate,
  totalTrades
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  // Calculate metrics
  const winningTrades = trades.filter(t => (t.profitOrLoss || 0) > 0);
  const losingTrades = trades.filter(t => (t.profitOrLoss || 0) < 0);
  const averageWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0) / winningTrades.length 
    : 0;
  const averageLoss = losingTrades.length > 0 
    ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitOrLoss || 0), 0) / losingTrades.length)
    : 0;
  const profitFactor = averageLoss > 0 ? averageWin / averageLoss : 0;
  const maxDrawdown = 0; // TODO: Calculate actual drawdown
  const sharpeRatio = 0; // TODO: Calculate actual Sharpe ratio

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-50 rounded-t-lg rounded-b-none">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="analysis">Trade Analysis</TabsTrigger>
          <TabsTrigger value="trades">List of Trades</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total P&L</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalPnL)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Win Rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{winRate.toFixed(1)}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Trades</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTrades}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Profit Factor</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{profitFactor.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          {/* P&L Chart Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>P&L Chart</CardTitle>
              <CardDescription>Cumulative profit and loss over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                <p className="text-gray-500">P&L Chart will be implemented here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Return Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Return:</span>
                  <span className={`font-semibold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalPnL)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Average Win:</span>
                  <span className="font-semibold text-green-600">{formatCurrency(averageWin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Average Loss:</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(averageLoss)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Profit Factor:</span>
                  <span className="font-semibold">{profitFactor.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Max Drawdown:</span>
                  <span className="font-semibold text-red-600">{formatCurrency(maxDrawdown)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Sharpe Ratio:</span>
                  <span className="font-semibold">{sharpeRatio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Win Rate:</span>
                  <span className="font-semibold">{winRate.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trade Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Winning Trades:</span>
                  <span className="font-semibold text-green-600">{winningTrades.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Losing Trades:</span>
                  <span className="font-semibold text-red-600">{losingTrades.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Trades:</span>
                  <span className="font-semibold">{totalTrades}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trade Analysis Tab */}
        <TabsContent value="analysis" className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Trade Duration Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
                  <p className="text-gray-500">Trade duration chart will be implemented here</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>P&L Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
                  <p className="text-gray-500">P&L distribution histogram will be implemented here</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
                  <p className="text-gray-500">Monthly performance heatmap will be implemented here</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Drawdown Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
                  <p className="text-gray-500">Drawdown chart will be implemented here</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* List of Trades Tab */}
        <TabsContent value="trades" className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
              <CardDescription>Complete list of all executed trades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4 font-medium text-gray-600">ID</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Type</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Entry Time</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Exit Time</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Entry Price</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Exit Price</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Quantity</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">P&L</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length > 0 ? (
                      trades.map((trade) => (
                        <tr key={trade.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-4 text-sm">{trade.id}</td>
                          <td className="py-2 px-4 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              trade.type === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-sm">{formatDate(trade.entryTime)}</td>
                          <td className="py-2 px-4 text-sm">
                            {trade.exitTime ? formatDate(trade.exitTime) : '-'}
                          </td>
                          <td className="py-2 px-4 text-sm">{formatCurrency(trade.entryPrice)}</td>
                          <td className="py-2 px-4 text-sm">
                            {trade.exitPrice ? formatCurrency(trade.exitPrice) : '-'}
                          </td>
                          <td className="py-2 px-4 text-sm">{trade.size}</td>
                          <td className="py-2 px-4 text-sm">
                            <span className={`font-medium ${
                              (trade.profitOrLoss || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(trade.profitOrLoss || 0)}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              (trade.exitTime ? 'CLOSED' : 'OPEN') === 'OPEN' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {trade.exitTime ? 'CLOSED' : 'OPEN'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-gray-500">
                          No trades executed yet. Run a backtest to see results.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalysisPanel; 