import React from 'react';
import { RiskMetrics, PositionSizing } from '@/lib/strategies/RiskManager';

interface RiskDashboardProps {
  riskMetrics: RiskMetrics;
  positionSizing?: PositionSizing;
  className?: string;
}

const RiskDashboard: React.FC<RiskDashboardProps> = ({ 
  riskMetrics, 
  positionSizing,
  className = ""
}) => {
  // Risk level colors
  const getRiskColor = (score: number): string => {
    if (score < 25) return 'text-green-400';
    if (score < 50) return 'text-yellow-400';
    if (score < 75) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRiskBgColor = (score: number): string => {
    if (score < 25) return 'bg-green-500';
    if (score < 50) return 'bg-yellow-500';
    if (score < 75) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <h3 className="text-lg font-semibold text-white">Risk Management</h3>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(riskMetrics.riskScore)}`}>
              Risk: {riskMetrics.riskScore.toFixed(0)}/100
            </div>
            <div className={`w-16 h-2 rounded-full bg-gray-700`}>
              <div 
                className={`h-full rounded-full ${getRiskBgColor(riskMetrics.riskScore)}`}
                style={{ width: `${riskMetrics.riskScore}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Account Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Total Equity</span>
              <span className="text-white font-medium">{formatCurrency(riskMetrics.totalEquity)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Available Margin</span>
              <span className="text-green-400 font-medium">{formatCurrency(riskMetrics.availableMargin)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Used Margin</span>
              <span className="text-yellow-400 font-medium">{formatCurrency(riskMetrics.usedMargin)}</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Margin Level</span>
              <span className={`font-medium ${riskMetrics.marginLevel > 200 ? 'text-green-400' : riskMetrics.marginLevel > 100 ? 'text-yellow-400' : 'text-red-400'}`}>
                {riskMetrics.marginLevel.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Current Drawdown</span>
              <span className={`font-medium ${riskMetrics.drawdown > 10 ? 'text-red-400' : riskMetrics.drawdown > 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                {formatPercentage(riskMetrics.drawdown)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Max Drawdown</span>
              <span className="text-red-400 font-medium">{formatPercentage(riskMetrics.maxDrawdown)}</span>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="border-t border-gray-700 pt-6">
          <h4 className="text-white font-medium mb-4">Performance Metrics</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{formatPercentage(riskMetrics.winRate)}</div>
              <div className="text-gray-400 text-sm">Win Rate</div>
              <div className={`w-full h-1 rounded-full mt-2 ${riskMetrics.winRate > 60 ? 'bg-green-500' : riskMetrics.winRate > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{riskMetrics.profitFactor.toFixed(2)}</div>
              <div className="text-gray-400 text-sm">Profit Factor</div>
              <div className={`w-full h-1 rounded-full mt-2 ${riskMetrics.profitFactor > 1.5 ? 'bg-green-500' : riskMetrics.profitFactor > 1.0 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{riskMetrics.sharpeRatio.toFixed(2)}</div>
              <div className="text-gray-400 text-sm">Sharpe Ratio</div>
              <div className={`w-full h-1 rounded-full mt-2 ${riskMetrics.sharpeRatio > 1.0 ? 'bg-green-500' : riskMetrics.sharpeRatio > 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            </div>
          </div>
        </div>

        {/* Position Sizing (if available) */}
        {positionSizing && (
          <div className="border-t border-gray-700 pt-6">
            <h4 className="text-white font-medium mb-4">Position Sizing</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Recommended Size</span>
                  <span className="text-blue-400 font-medium">{positionSizing.recommendedSize.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Risk Adjusted</span>
                  <span className="text-green-400 font-medium">{positionSizing.riskAdjustedSize.toFixed(0)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Max Position</span>
                  <span className="text-yellow-400 font-medium">{positionSizing.maxPositionSize.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Margin Req.</span>
                  <span className="text-white font-medium">{formatCurrency(positionSizing.marginRequired)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Risk Alerts */}
        <div className="border-t border-gray-700 pt-6">
          <h4 className="text-white font-medium mb-4">Risk Alerts</h4>
          <div className="space-y-2">
            {riskMetrics.marginLevel < 150 && (
              <div className="flex items-center space-x-2 text-red-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>⚠️ Margin level below safe threshold (150%)</span>
              </div>
            )}
            {riskMetrics.drawdown > 8 && (
              <div className="flex items-center space-x-2 text-orange-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span>📉 Drawdown exceeding 8% - Consider reducing risk</span>
              </div>
            )}
            {riskMetrics.riskScore > 70 && (
              <div className="flex items-center space-x-2 text-red-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>🚨 High risk score - Portfolio overexposed</span>
              </div>
            )}
            {riskMetrics.winRate < 35 && (
              <div className="flex items-center space-x-2 text-yellow-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <span>📊 Low win rate - Strategy review recommended</span>
              </div>
            )}
            {riskMetrics.marginLevel > 300 && riskMetrics.drawdown < 3 && riskMetrics.riskScore < 30 && (
              <div className="flex items-center space-x-2 text-green-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>✅ Portfolio in healthy risk range</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-t border-gray-700 pt-6">
          <h4 className="text-white font-medium mb-4">Quick Actions</h4>
          <div className="grid grid-cols-2 gap-3">
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
              📊 Export Report
            </button>
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
              ⚙️ Risk Settings
            </button>
            <button className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors">
              🔄 Rebalance
            </button>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors">
              🛑 Close All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskDashboard; 