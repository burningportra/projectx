import React from 'react';

interface ResultsPanelProps {
  profitOrLoss: number;
  winRate: number;
  totalTrades: number;
  // TODO: Add more metrics like max drawdown, trade log data
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ 
  profitOrLoss,
  winRate,
  totalTrades 
}) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md mt-4">
      <h2 className="text-xl font-semibold mb-3 text-gray-700">Backtest Results</h2>
      <div className="space-y-2">
        <div>
          <span className="font-medium text-gray-600">Total P&L:</span> 
          <span className={`ml-2 font-bold ${profitOrLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${profitOrLoss.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="font-medium text-gray-600">Win Rate:</span> 
          <span className="ml-2 text-gray-800">{winRate.toFixed(2)}%</span>
        </div>
        <div>
          <span className="font-medium text-gray-600">Total Trades:</span> 
          <span className="ml-2 text-gray-800">{totalTrades}</span>
        </div>
        {/* TODO: Display more metrics and trade log */}
      </div>
    </div>
  );
};

export default ResultsPanel; 