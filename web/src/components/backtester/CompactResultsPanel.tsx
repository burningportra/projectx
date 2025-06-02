import React from 'react';

interface CompactResultsPanelProps {
  profitOrLoss: number;
  winRate: number;
  totalTrades: number;
}

// Utility functions for data validation and formatting
const isValidNumber = (value: any): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

const formatCurrency = (value: number): string => {
  if (!isValidNumber(value)) return '$0.00';
  
  try {
    return `${value.toFixed(2)}`;
  } catch (error) {
    console.warn('Error formatting currency:', error);
    return '$0.00';
  }
};

const formatPercentage = (value: number): string => {
  if (!isValidNumber(value)) return '0.0%';
  
  try {
    // Clamp percentage to reasonable range (0-100%)
    const clampedValue = Math.max(0, Math.min(100, value));
    return `${clampedValue.toFixed(1)}%`;
  } catch (error) {
    console.warn('Error formatting percentage:', error);
    return '0.0%';
  }
};

const formatTradeCount = (value: number): string => {
  if (!isValidNumber(value) || value < 0) return '0';
  
  try {
    return Math.floor(value).toString();
  } catch (error) {
    console.warn('Error formatting trade count:', error);
    return '0';
  }
};

const CompactResultsPanel: React.FC<CompactResultsPanelProps> = ({ 
  profitOrLoss,
  winRate,
  totalTrades 
}) => {
  // Validate input data
  const validPnL = isValidNumber(profitOrLoss);
  const validWinRate = isValidNumber(winRate);
  const validTradeCount = isValidNumber(totalTrades);
  
  // Check if any critical data is invalid
  const hasDataIssues = !validPnL || !validWinRate || !validTradeCount;
  
  // Safe values with fallbacks
  const safePnL = validPnL ? profitOrLoss : 0;
  const safeWinRate = validWinRate ? winRate : 0;
  const safeTotalTrades = validTradeCount ? totalTrades : 0;
  
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Results</h3>
        {hasDataIssues && (
          <div className="flex items-center text-yellow-600" title="Some data may be invalid or missing">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">P&L:</span> 
          <span className={`text-xs font-semibold ${
            safePnL >= 0 ? 'text-green-600' : 'text-red-600'
          } ${!validPnL ? 'opacity-60' : ''}`}>
            {formatCurrency(safePnL)}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Win Rate:</span> 
          <span className={`text-xs font-semibold text-gray-800 ${!validWinRate ? 'opacity-60' : ''}`}>
            {formatPercentage(safeWinRate)}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Trades:</span> 
          <span className={`text-xs font-semibold text-gray-800 ${!validTradeCount ? 'opacity-60' : ''}`}>
            {formatTradeCount(safeTotalTrades)}
          </span>
        </div>
        
        {/* Show helpful message when no trades exist */}
        {safeTotalTrades === 0 && validTradeCount && (
          <div className="text-xs text-gray-500 italic mt-2">
            No trades executed yet
          </div>
        )}
        
        {/* Show warning for invalid data */}
        {hasDataIssues && (
          <div className="text-xs text-yellow-600 mt-2 p-1 bg-yellow-50 rounded border">
            ⚠️ Some data appears invalid
          </div>
        )}
      </div>
    </div>
  );
};

export default CompactResultsPanel;
