import React, { useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Trade {
  entryTime: number;
  exitTime?: number;
  profitOrLoss: number;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  duration?: number;
}

interface PerformanceAnalyticsProps {
  trades: Trade[];
  initialBalance: number;
  className?: string;
}

interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  calmarRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  expectancy: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  tradingDays: number;
  tradesPerDay: number;
  volatility: number;
}

const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({
  trades,
  initialBalance,
  className = ""
}) => {
  // Calculate comprehensive performance metrics
  const metrics = useMemo((): PerformanceMetrics => {
    if (trades.length === 0) {
      return {
        totalReturn: 0, totalReturnPercent: 0, sharpeRatio: 0, calmarRatio: 0,
        sortinoRatio: 0, maxDrawdown: 0, maxDrawdownDuration: 0, winRate: 0,
        profitFactor: 0, avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
        expectancy: 0, consecutiveWins: 0, consecutiveLosses: 0, tradingDays: 0,
        tradesPerDay: 0, volatility: 0
      };
    }

    const winningTrades = trades.filter(t => t.profitOrLoss > 0);
    const losingTrades = trades.filter(t => t.profitOrLoss < 0);
    
    const totalPnL = trades.reduce((sum, t) => sum + t.profitOrLoss, 0);
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profitOrLoss, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profitOrLoss, 0));
    
    // Calculate equity curve
    let equity = initialBalance;
    let highWaterMark = initialBalance;
    let maxDrawdown = 0;
    let currentDrawdownStart: number | null = null;
    let maxDrawdownDuration = 0;
    const equityCurve = [initialBalance];
    const returns: number[] = [];
    
    trades.forEach(trade => {
      equity += trade.profitOrLoss;
      equityCurve.push(equity);
      
      const returnPct = trade.profitOrLoss / (equity - trade.profitOrLoss);
      returns.push(returnPct);
      
      if (equity > highWaterMark) {
        highWaterMark = equity;
        currentDrawdownStart = null;
      } else {
        if (currentDrawdownStart === null) {
          currentDrawdownStart = trade.entryTime;
        }
        
        const drawdown = (highWaterMark - equity) / highWaterMark;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          if (currentDrawdownStart !== null && trade.exitTime) {
            maxDrawdownDuration = Math.max(maxDrawdownDuration, trade.exitTime - currentDrawdownStart);
          }
        }
      }
    });

    // Calculate Sharpe ratio
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const returnVariance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(returnVariance);
    const sharpeRatio = volatility > 0 ? (avgReturn / volatility) * Math.sqrt(252) : 0;

    // Calculate Sortino ratio (downside deviation)
    const negativeReturns = returns.filter(r => r < 0);
    const downsideVariance = negativeReturns.length > 0 
      ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;

    // Calculate Calmar ratio
    const annualizedReturn = (Math.pow(equity / initialBalance, 252 / trades.length) - 1);
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    // Calculate consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    trades.forEach(trade => {
      if (trade.profitOrLoss > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      }
    });

    // Calculate trading period
    const firstTrade = Math.min(...trades.map(t => t.entryTime));
    const lastTrade = Math.max(...trades.map(t => t.exitTime || t.entryTime));
    const tradingDays = Math.max(1, (lastTrade - firstTrade) / (24 * 60 * 60 * 1000));

    return {
      totalReturn: totalPnL,
      totalReturnPercent: (totalPnL / initialBalance) * 100,
      sharpeRatio,
      calmarRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      maxDrawdownDuration: maxDrawdownDuration / (24 * 60 * 60 * 1000), // Convert to days
      winRate: (winningTrades.length / trades.length) * 100,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 1,
      avgWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profitOrLoss)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profitOrLoss)) : 0,
      expectancy: trades.length > 0 ? totalPnL / trades.length : 0,
      consecutiveWins: maxConsecutiveWins,
      consecutiveLosses: maxConsecutiveLosses,
      tradingDays,
      tradesPerDay: tradingDays > 0 ? trades.length / tradingDays : 0,
      volatility: volatility * 100
    };
  }, [trades, initialBalance]);

  // Equity curve chart data
  const equityChartData = useMemo(() => {
    let runningBalance = initialBalance;
    const equityData = [initialBalance];
    const labels = ['Start'];
    
    trades.forEach((trade, index) => {
      runningBalance += trade.profitOrLoss;
      equityData.push(runningBalance);
      labels.push(`Trade ${index + 1}`);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Equity Curve',
          data: equityData,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.1,
        }
      ]
    };
  }, [trades, initialBalance]);

  // Monthly returns chart data
  const monthlyReturnsData = useMemo(() => {
    const monthlyReturns = new Map<string, number>();
    
    trades.forEach(trade => {
      const date = new Date(trade.entryTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      monthlyReturns.set(monthKey, (monthlyReturns.get(monthKey) || 0) + trade.profitOrLoss);
    });

    const sortedMonths = Array.from(monthlyReturns.keys()).sort();
    const returns = sortedMonths.map(month => monthlyReturns.get(month) || 0);

    return {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Monthly P&L',
          data: returns,
          backgroundColor: returns.map(r => r >= 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
          borderColor: returns.map(r => r >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'),
          borderWidth: 1,
        }
      ]
    };
  }, [trades]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number) => `${value.toFixed(2)}%`;

  const getRatingColor = (value: number, thresholds: [number, number]) => {
    if (value >= thresholds[1]) return 'text-green-400';
    if (value >= thresholds[0]) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Performance Analytics</h3>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">{trades.length} Trades</span>
            <span className="text-sm text-gray-400">{metrics.tradingDays.toFixed(0)} Days</span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Key Performance Indicators */}
        <div className="grid grid-cols-4 gap-6">
          <div className="text-center">
            <div className={`text-3xl font-bold ${metrics.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(metrics.totalReturn)}
            </div>
            <div className="text-gray-400 text-sm">Total Return</div>
            <div className={`text-lg font-medium ${metrics.totalReturnPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercentage(metrics.totalReturnPercent)}
            </div>
          </div>
          
          <div className="text-center">
            <div className={`text-3xl font-bold ${getRatingColor(metrics.sharpeRatio, [1.0, 2.0])}`}>
              {metrics.sharpeRatio.toFixed(2)}
            </div>
            <div className="text-gray-400 text-sm">Sharpe Ratio</div>
            <div className="text-sm text-gray-500">Risk-Adj. Return</div>
          </div>
          
          <div className="text-center">
            <div className={`text-3xl font-bold ${getRatingColor(metrics.maxDrawdown, [-15, -5])}`}>
              {formatPercentage(metrics.maxDrawdown)}
            </div>
            <div className="text-gray-400 text-sm">Max Drawdown</div>
            <div className="text-sm text-gray-500">{metrics.maxDrawdownDuration.toFixed(0)} days</div>
          </div>
          
          <div className="text-center">
            <div className={`text-3xl font-bold ${getRatingColor(metrics.profitFactor, [1.2, 2.0])}`}>
              {metrics.profitFactor.toFixed(2)}
            </div>
            <div className="text-gray-400 text-sm">Profit Factor</div>
            <div className="text-sm text-gray-500">Gross Profit/Loss</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-6">
          {/* Equity Curve */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-4">Equity Curve</h4>
            <div className="h-64">
              <Line 
                data={equityChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                  },
                  scales: {
                    x: { display: false },
                    y: { 
                      grid: { color: 'rgba(75, 85, 99, 0.3)' },
                      ticks: { color: 'rgb(156, 163, 175)' }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Monthly Returns */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-4">Monthly Returns</h4>
            <div className="h-64">
              <Bar 
                data={monthlyReturnsData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                  },
                  scales: {
                    x: { 
                      ticks: { color: 'rgb(156, 163, 175)', maxRotation: 45 },
                      grid: { display: false }
                    },
                    y: { 
                      grid: { color: 'rgba(75, 85, 99, 0.3)' },
                      ticks: { color: 'rgb(156, 163, 175)' }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-3 gap-6">
          {/* Return Metrics */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-4">Return Metrics</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Calmar Ratio</span>
                <span className={`font-medium ${getRatingColor(metrics.calmarRatio, [0.3, 0.7])}`}>
                  {metrics.calmarRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sortino Ratio</span>
                <span className={`font-medium ${getRatingColor(metrics.sortinoRatio, [1.2, 2.5])}`}>
                  {metrics.sortinoRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Volatility</span>
                <span className="text-white font-medium">{formatPercentage(metrics.volatility)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Expectancy</span>
                <span className={`font-medium ${metrics.expectancy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(metrics.expectancy)}
                </span>
              </div>
            </div>
          </div>

          {/* Trade Metrics */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-4">Trade Metrics</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Win Rate</span>
                <span className={`font-medium ${getRatingColor(metrics.winRate, [50, 65])}`}>
                  {formatPercentage(metrics.winRate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg Win</span>
                <span className="text-green-400 font-medium">{formatCurrency(metrics.avgWin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg Loss</span>
                <span className="text-red-400 font-medium">{formatCurrency(metrics.avgLoss)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Trades/Day</span>
                <span className="text-white font-medium">{metrics.tradesPerDay.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Extremes & Streaks */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-4">Extremes & Streaks</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Largest Win</span>
                <span className="text-green-400 font-medium">{formatCurrency(metrics.largestWin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Largest Loss</span>
                <span className="text-red-400 font-medium">{formatCurrency(metrics.largestLoss)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Max Win Streak</span>
                <span className="text-green-400 font-medium">{metrics.consecutiveWins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Max Loss Streak</span>
                <span className="text-red-400 font-medium">{metrics.consecutiveLosses}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceAnalytics; 