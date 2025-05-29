import React from 'react';

interface CompactResultsPanelProps {
  profitOrLoss: number;
  winRate: number;
  totalTrades: number;
}

const CompactResultsPanel: React.FC<CompactResultsPanelProps> = ({ 
  profitOrLoss,
  winRate,
  totalTrades 
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Results</h3>
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">P&L:</span> 
          <span className={`text-xs font-semibold ${profitOrLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${profitOrLoss.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Win Rate:</span> 
          <span className="text-xs font-semibold text-gray-800">{winRate.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Trades:</span> 
          <span className="text-xs font-semibold text-gray-800">{totalTrades}</span>
        </div>
      </div>
    </div>
  );
};

export default CompactResultsPanel; 