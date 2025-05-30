import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';

interface Trade {
  id: string;
  entryTime: number;
  exitTime?: number;
  profitOrLoss: number;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  size: number;
  commission?: number;
  status: string;
}

interface VirtualizedTradeListProps {
  trades: Trade[];
  height: number;
  onTradeSelect?: (trade: Trade) => void;
  className?: string;
}

interface TradeItemProps extends ListChildComponentProps {
  data: {
    trades: Trade[];
    onTradeSelect?: (trade: Trade) => void;
  };
}

const TradeItem: React.FC<TradeItemProps> = React.memo(({ index, style, data }) => {
  const trade = data.trades[index];
  const isProfit = (trade.profitOrLoss || 0) > 0;
  
  const handleClick = useCallback(() => {
    data.onTradeSelect?.(trade);
  }, [data.onTradeSelect, trade]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div
      style={style}
      className="flex items-center px-4 py-2 border-b border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
      onClick={handleClick}
    >
      <div className="flex-1 grid grid-cols-6 gap-4 text-sm">
        <div className="text-gray-300">{trade.id}</div>
        <div className="text-gray-400">{formatDate(trade.entryTime)}</div>
        <div className={`font-medium ${trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
          {trade.side}
        </div>
        <div className="text-white">{formatCurrency(trade.entryPrice)}</div>
        <div className="text-gray-300">
          {trade.exitPrice ? formatCurrency(trade.exitPrice) : '-'}
        </div>
        <div className={`font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
          {formatCurrency(trade.profitOrLoss || 0)}
        </div>
      </div>
    </div>
  );
});

TradeItem.displayName = 'TradeItem';

const VirtualizedTradeList: React.FC<VirtualizedTradeListProps> = ({
  trades,
  height,
  onTradeSelect,
  className = ""
}) => {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Trade;
    direction: 'asc' | 'desc';
  }>({ key: 'entryTime', direction: 'desc' });
  
  const [filterConfig, setFilterConfig] = useState<{
    side?: 'BUY' | 'SELL';
    profitable?: boolean;
    search?: string;
  }>({});

  // Memoized filtered and sorted trades
  const processedTrades = useMemo(() => {
    let filtered = trades;

    // Apply filters
    if (filterConfig.side) {
      filtered = filtered.filter(trade => trade.side === filterConfig.side);
    }
    
    if (filterConfig.profitable !== undefined) {
      filtered = filtered.filter(trade => 
        filterConfig.profitable ? (trade.profitOrLoss || 0) > 0 : (trade.profitOrLoss || 0) <= 0
      );
    }

    if (filterConfig.search) {
      const search = filterConfig.search.toLowerCase();
      filtered = filtered.filter(trade => 
        trade.id.toLowerCase().includes(search) ||
        trade.side.toLowerCase().includes(search)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      // Handle undefined values
      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [trades, sortConfig, filterConfig]);

  const handleSort = useCallback((key: keyof Trade) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const handleFilter = useCallback((newFilter: Partial<typeof filterConfig>) => {
    setFilterConfig(prev => ({ ...prev, ...newFilter }));
  }, []);

  const itemData = useMemo(() => ({
    trades: processedTrades,
    onTradeSelect
  }), [processedTrades, onTradeSelect]);

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 ${className}`}>
      {/* Header with filters and sorting */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">
            Trades ({processedTrades.length})
          </h3>
          
          <div className="flex items-center space-x-2">
            {/* Quick filters */}
            <button
              onClick={() => handleFilter({ profitable: filterConfig.profitable === true ? undefined : true })}
              className={`px-3 py-1 text-xs rounded ${
                filterConfig.profitable === true
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Profitable
            </button>
            
            <button
              onClick={() => handleFilter({ profitable: filterConfig.profitable === false ? undefined : false })}
              className={`px-3 py-1 text-xs rounded ${
                filterConfig.profitable === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Losses
            </button>

            <select
              value={filterConfig.side || ''}
              onChange={(e) => handleFilter({ side: e.target.value as 'BUY' | 'SELL' || undefined })}
              className="px-3 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600"
            >
              <option value="">All Sides</option>
              <option value="BUY">Buy Only</option>
              <option value="SELL">Sell Only</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search trades..."
          value={filterConfig.search || ''}
          onChange={(e) => handleFilter({ search: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-gray-800 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Column headers */}
      <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="grid grid-cols-6 gap-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <button
            onClick={() => handleSort('id')}
            className="text-left hover:text-white transition-colors"
          >
            ID {sortConfig.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('entryTime')}
            className="text-left hover:text-white transition-colors"
          >
            Date {sortConfig.key === 'entryTime' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('side')}
            className="text-left hover:text-white transition-colors"
          >
            Side {sortConfig.key === 'side' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('entryPrice')}
            className="text-left hover:text-white transition-colors"
          >
            Entry {sortConfig.key === 'entryPrice' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('exitPrice')}
            className="text-left hover:text-white transition-colors"
          >
            Exit {sortConfig.key === 'exitPrice' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('profitOrLoss')}
            className="text-left hover:text-white transition-colors"
          >
            P&L {sortConfig.key === 'profitOrLoss' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </button>
        </div>
      </div>

      {/* Virtualized list */}
      <div className="bg-gray-900">
        {processedTrades.length > 0 ? (
          <List
            height={height - 140} // Account for header and filters
            width="100%"
            itemCount={processedTrades.length}
            itemSize={50}
            itemData={itemData}
          >
            {TradeItem}
          </List>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-400">
            No trades found matching current filters
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualizedTradeList; 