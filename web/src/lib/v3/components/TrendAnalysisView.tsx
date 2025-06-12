import React, { useEffect, useState } from 'react';
import { BacktestBarData } from '../../types/backtester';
import { loadMarketData, getAvailableContracts } from '../data/DatabaseMarketDataLoader';
import TrendChart from './TrendChart';
import { UTCTimestamp } from 'lightweight-charts';

// Trend signal interface matching Python output
export interface TrendSignal {
  type: 'CUS' | 'CDS';
  timestamp: string;
  barIndex: number;
  price: number;
  contractId: string;
  timeframe: string;
}

interface TrendAnalysisViewProps {
  className?: string;
}

/**
 * Focused trend analysis view showing CUS/CDS signals
 * Auto-loads data and runs trend analysis on mount
 */
const TrendAnalysisView: React.FC<TrendAnalysisViewProps> = ({ className = '' }) => {
  const [signals, setSignals] = useState<TrendSignal[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Market data state
  const [marketData, setMarketData] = useState<BacktestBarData[]>([]);
  const [selectedContract, setSelectedContract] = useState('M25');
  const [selectedTimeframe, setSelectedTimeframe] = useState('15m');
  const [availableContracts, setAvailableContracts] = useState<Array<{id: string; symbol: string; fullName: string}>>([]);

  // Available timeframes
  const timeframes = [
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '30m', label: '30m' },
    { value: '1h', label: '1h' },
    { value: '4h', label: '4h' },
    { value: '1d', label: '1d' },
  ];

  // Load available contracts on mount
  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const contracts = await getAvailableContracts();
        setAvailableContracts(contracts);
        
        // Use first available contract if M25 not found
        if (contracts.length > 0) {
          const hasM25 = contracts.some(c => c.symbol === 'M25');
          if (!hasM25 && contracts[0]) {
            setSelectedContract(contracts[0].symbol);
          }
        }
      } catch (error) {
        console.error('Failed to fetch contracts:', error);
      }
    };
    
    fetchContracts();
  }, []);

  // Auto-load data and analyze when contract/timeframe changes
  useEffect(() => {
    if (!selectedContract) return;
    
    const loadAndAnalyze = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Load market data
        const data = await loadMarketData({
          contract: selectedContract,
          timeframe: selectedTimeframe,
          limit: 500
        });
        
        setMarketData(data);
        
        // Auto-run trend analysis
        await runTrendAnalysis(data);
        
      } catch (error) {
        console.error('Failed to load data:', error);
        setError('Failed to load market data');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAndAnalyze();
  }, [selectedContract, selectedTimeframe]);

  // Run trend analysis using Python service
  const runTrendAnalysis = async (bars: BacktestBarData[]) => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/analyze/trend-starts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bars: bars.map(bar => ({
            timestamp: new Date(bar.time).toISOString(),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume || 0
          })),
          contract_id: selectedContract,
          timeframe: selectedTimeframe,
          debug: false
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to analyze trends');
      }
      
      const result = await response.json();
      setSignals(result.signals || []);
      
    } catch (error) {
      console.error('Trend analysis failed:', error);
      setError('Failed to analyze trends');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Calculate signal statistics
  const cusSignals = signals.filter(s => s.type === 'CUS');
  const cdsSignals = signals.filter(s => s.type === 'CDS');

  return (
    <div className={`flex flex-col h-full bg-gray-900 text-white ${className}`}>
      {/* Header */}
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Trend Start Analysis</h2>
          
          <div className="flex items-center gap-4">
            {/* Contract selector */}
            <select
              value={selectedContract}
              onChange={(e) => setSelectedContract(e.target.value)}
              className="bg-gray-700 text-white px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              disabled={isLoading || availableContracts.length === 0}
            >
              {availableContracts.map(contract => (
                <option key={contract.id} value={contract.symbol}>
                  {contract.symbol}
                </option>
              ))}
            </select>
            
            {/* Timeframe buttons */}
            <div className="flex gap-1">
              {timeframes.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setSelectedTimeframe(tf.value)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    selectedTimeframe === tf.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  disabled={isLoading}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            
            {/* Refresh button */}
            <button
              onClick={() => runTrendAnalysis(marketData)}
              disabled={isAnalyzing || isLoading || marketData.length === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm transition-colors"
            >
              {isAnalyzing ? '⏳ Analyzing...' : '🔄 Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-400 text-center">
            <div className="text-2xl mb-2">⚠️</div>
            <div>{error}</div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400 text-center">
            <div className="text-2xl mb-2 animate-spin">⏳</div>
            <div>Loading market data...</div>
          </div>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="flex-1 p-4">
            <TrendChart
              data={marketData}
              signals={signals.map(signal => ({
                time: Math.floor(new Date(signal.timestamp).getTime() / 1000) as UTCTimestamp,
                type: signal.type,
                price: signal.price
              }))}
              height={500}
            />
          </div>

          {/* Results section */}
          <div className="h-64 bg-gray-800 border-t border-gray-700 p-4 overflow-y-auto">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-700 rounded p-3 text-center">
                <div className="text-2xl font-bold">{signals.length}</div>
                <div className="text-sm text-gray-400">Total Signals</div>
              </div>
              <div className="bg-gray-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{cusSignals.length} 🟢</div>
                <div className="text-sm text-gray-400">Uptrend (CUS)</div>
              </div>
              <div className="bg-gray-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{cdsSignals.length} 🔴</div>
                <div className="text-sm text-gray-400">Downtrend (CDS)</div>
              </div>
            </div>

            {/* Recent signals list */}
            {signals.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-gray-400">Recent Signals:</h3>
                <div className="space-y-1">
                  {signals.slice(-10).reverse().map((signal, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 px-2 bg-gray-700 rounded text-sm">
                      <div className="flex items-center gap-3">
                        <span className={signal.type === 'CUS' ? 'text-green-400' : 'text-red-400'}>
                          {signal.type === 'CUS' ? '🟢' : '🔴'} {signal.type}
                        </span>
                        <span className="text-gray-300">
                          {new Date(signal.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">${signal.price.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">Bar #{signal.barIndex}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {signals.length === 0 && !isAnalyzing && (
              <div className="text-center text-gray-500 mt-8">
                No trend signals found in this data
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TrendAnalysisView;