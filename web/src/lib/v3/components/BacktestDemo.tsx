import React, { useEffect, useState, useRef } from 'react';
import {
  BacktestProvider,
  useBacktest,
  useBacktestState,
  useBacktestActions,
  useBacktestPerformance,
  useBacktestStrategies,
  useBacktestOrders,
  useBacktestPlayback,
  useBacktestEvents
} from '../BacktestProvider';
import { emaCrossoverStrategyDefinition } from '../strategies/EMACrossoverStrategy';
import { EngineEventType } from '../BacktestEngine';
import { BacktestBarData, OrderSide, OrderType } from '../../types/backtester';
import { loadMarketData, getAvailableContracts, MarketDataQuery } from '../data/DatabaseMarketDataLoader';
import BacktestChart from './BacktestChart';

/**
 * Sample historical data for demo purposes (fallback only)
 */
const generateSampleData = (bars: number = 100): BacktestBarData[] => {
  const data: BacktestBarData[] = [];
  let price = 100;
  const startTime = Date.now() - (bars * 60 * 60 * 1000); // bars hours ago
  
  for (let i = 0; i < bars; i++) {
    const change = (Math.random() - 0.5) * 4; // ±2% max change
    price = Math.max(price + change, 10); // Don't go below $10
    
    const high = price + Math.random() * 2;
    const low = price - Math.random() * 2;
    const open = i === 0 ? price : (data[i - 1]?.close ?? price);
    const close = price;
    const volume = Math.floor(Math.random() * 100000) + 10000;
    
    data.push({
      time: (startTime + (i * 60 * 60 * 1000)) as any, // 1 hour intervals
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume,
    });
  }
  
  return data;
};

/**
 * Playback Controls Component
 */
const PlaybackControls: React.FC = () => {
  const playback = useBacktestPlayback();
  
  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="bg-gray-700 rounded-lg p-3">
        <div className="flex flex-col space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Status:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              playback.isRunning ? 'bg-green-100 text-green-800' : 
              playback.isPaused ? 'bg-yellow-100 text-yellow-800' : 
              'bg-red-100 text-red-800'
            }`}>
              {playback.isRunning ? '▶️ Running' : playback.isPaused ? '⏸️ Paused' : '⏹️ Stopped'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Progress:</span>
            <span className="text-white font-medium">{playback.progress.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Current Price:</span>
            <span className="text-white font-medium">
              {playback.currentBar ? `$${playback.currentBar.close.toFixed(2)}` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Primary Control Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button 
          onClick={playback.actions.start}
          disabled={!playback.hasData || playback.isRunning}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            (!playback.hasData || playback.isRunning) 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          ▶️ Start
        </button>
        <button 
          onClick={playback.actions.pause}
          disabled={!playback.isRunning}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            !playback.isRunning 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-yellow-600 hover:bg-yellow-700 text-white'
          }`}
        >
          ⏸️ Pause
        </button>
        <button 
          onClick={playback.actions.stop}
          disabled={!playback.isActive}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            !playback.isActive 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          ⏹️ Stop
        </button>
        <button 
          onClick={playback.actions.reset}
          className="px-3 py-2 rounded text-sm font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors"
        >
          🔄 Reset
        </button>
      </div>

      {/* Secondary Controls */}
      <div className="flex gap-2">
        <button 
          onClick={playback.actions.processNext}
          disabled={playback.isRunning || !playback.hasData}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            (playback.isRunning || !playback.hasData) 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          ⏭️ Next
        </button>
        <button 
          onClick={playback.actions.processToEnd}
          disabled={playback.isRunning || !playback.hasData}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            (playback.isRunning || !playback.hasData) 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
        >
          ⏩ End
        </button>
      </div>
      
      {/* Speed Control - Simplified */}
      <div className="bg-gray-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Speed</span>
          <span className="text-sm text-white font-medium">{playback.currentSpeed}x</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 4, 8].map(speed => (
            <button
              key={speed}
              onClick={() => playback.actions.setSpeed?.(speed)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                playback.currentSpeed === speed 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Performance Metrics Component
 */
const PerformanceMetrics: React.FC = () => {
  const performance = useBacktestPerformance();
  
  return (
    <div className="space-y-3">
      {/* Key Metrics */}
      <div className="bg-gray-700 rounded-lg p-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            ${performance.totalPnL.toFixed(2)}
          </div>
          <div className={`text-sm font-medium ${
            performance.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            Total P&L ({performance.returnsPercent.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-300">Win Rate</div>
          <div className="text-white font-medium">{performance.winRate.toFixed(1)}%</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-300">Trades</div>
          <div className="text-white font-medium">{performance.totalTrades}</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-300">Drawdown</div>
          <div className={`font-medium ${
            performance.currentDrawdown <= -5 ? 'text-red-400' : 'text-white'
          }`}>
            {performance.currentDrawdown.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-gray-300">Sharpe</div>
          <div className="text-white font-medium">
            {performance.sharpeRatio ? performance.sharpeRatio.toFixed(2) : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Strategy Management Component
 */
const StrategyManagement: React.FC = () => {
  const strategies = useBacktestStrategies();
  
  return (
    <div className="strategy-management" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
      <h3>Strategy Management</h3>
      
      {strategies.strategies.length === 0 ? (
        <div>
          <p>No strategies registered.</p>
          <button 
            onClick={() => strategies.actions.register(emaCrossoverStrategyDefinition, {
              fastPeriod: 12,
              slowPeriod: 26,
              riskPercent: 2.0,
            })}
          >
            Register EMA Crossover Strategy
          </button>
        </div>
      ) : (
        <div>
          <h4>Registered Strategies:</h4>
          {strategies.strategies.map(strategy => (
            <div key={strategy.definition.id} style={{ marginBottom: '10px', padding: '5px', background: '#f5f5f5' }}>
              <div>
                <strong>{strategy.definition.name}</strong> (ID: {strategy.definition.id})
              </div>
              <div>
                Status: {strategy.isActive ? '✅ Active' : '❌ Inactive'} | 
                Signals: {strategy.signals.length} | 
                Executions: {strategy.totalExecutions}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <button 
                  onClick={() => strategies.actions.setActive(strategy.definition.id, !strategy.isActive)}
                >
                  {strategy.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button 
                  onClick={() => strategies.actions.updateConfig(strategy.definition.id, {
                    fastPeriod: Math.floor(Math.random() * 20) + 5,
                  })}
                >
                  Randomize Fast Period
                </button>
                <button 
                  onClick={() => strategies.actions.unregister(strategy.definition.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Orders and Positions Component
 */
const OrdersAndPositions: React.FC = () => {
  const orders = useBacktestOrders();
  
  return (
    <div className="orders-positions" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
      <h3>Orders & Positions</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <h4>Pending Orders ({orders.pendingOrders.length})</h4>
        {orders.pendingOrders.length === 0 ? (
          <p>No pending orders</p>
        ) : (
          <div>
            {orders.pendingOrders.map(order => (
              <div key={order.id} style={{ marginBottom: '5px', padding: '5px', background: '#fff3cd' }}>
                {order.side} {order.quantity} @ ${order.price?.toFixed(2) || 'Market'} ({order.type})
                <button 
                  onClick={() => orders.actions.cancel(order.id)}
                  style={{ marginLeft: '10px', fontSize: '12px' }}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <h4>Open Positions ({orders.openPositions.length})</h4>
        {orders.openPositions.length === 0 ? (
          <p>No open positions</p>
        ) : (
          <div>
            {orders.openPositions.map((position, index) => (
              <div key={index} style={{ marginBottom: '5px', padding: '5px', background: '#d1ecf1' }}>
                Position {index + 1}: {position.size} shares @ ${position.entryPrice.toFixed(2)}
                (P&L: ${(position.profitOrLoss || 0).toFixed(2)})
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div>
        <h4>Recent Trades ({orders.recentTrades.length})</h4>
        {orders.recentTrades.length === 0 ? (
          <p>No trades yet</p>
        ) : (
          <div>
            {orders.recentTrades.map((trade, index) => (
              <div key={trade.id} style={{ marginBottom: '5px', padding: '5px', background: '#d4edda' }}>
                Trade {index + 1}: {trade.type} {trade.size} @ ${trade.entryPrice.toFixed(2)}
                {trade.exitPrice && ` → ${trade.exitPrice.toFixed(2)}`}
                (P&L: ${(trade.profitOrLoss || 0).toFixed(2)})
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '15px' }}>
        <h4>Manual Order Entry</h4>
        <button 
          onClick={() => {
            const { state } = useBacktestState();
            if (state?.bars.length) {
              const currentPrice = state.bars[state.currentBarIndex || 0]?.close || 100;
              orders.actions.submit({
                id: `manual_${Date.now()}`,
                type: OrderType.LIMIT,
                side: OrderSide.BUY,
                quantity: 100,
                price: currentPrice * 0.99, // 1% below current price
                status: 'PENDING' as any,
                submittedTime: Date.now() as any,
              });
            }
          }}
        >
          Submit Test Buy Order
        </button>
        
        <button 
          onClick={() => {
            const { state } = useBacktestState();
            if (state?.bars.length) {
              const currentPrice = state.bars[state.currentBarIndex || 0]?.close || 100;
              orders.actions.submitBracket({
                symbol: 'TEST',
                side: OrderSide.BUY,
                quantity: 100,
                entryType: OrderType.MARKET,
                stopLossType: OrderType.STOP,
                stopLossPrice: currentPrice * 0.95, // 5% stop loss
                takeProfitType: OrderType.LIMIT,
                takeProfitPrice: currentPrice * 1.10, // 10% take profit
              });
            }
          }}
          style={{ marginLeft: '10px' }}
        >
          Submit Test Bracket Order
        </button>
      </div>
    </div>
  );
};

/**
 * Event Log Component
 */
const EventLog: React.FC = () => {
  const [events, setEvents] = React.useState<string[]>([]);
  
  // Subscribe to various events
  useBacktestEvents(EngineEventType.BAR_PROCESSED, (event) => {
    setEvents(prev => [...prev.slice(-9), `Bar processed: ${event.data.barIndex}`]);
  });
  
  useBacktestEvents(EngineEventType.ORDER_SUBMITTED, (event) => {
    setEvents(prev => [...prev.slice(-9), `Order submitted: ${event.data.order.id}`]);
  });
  
  useBacktestEvents(EngineEventType.ORDER_FILLED, (event) => {
    setEvents(prev => [...prev.slice(-9), `Order filled: ${event.data.fill.orderId} @ $${event.data.fill.fillPrice.toFixed(2)}`]);
  });
  
  useBacktestEvents(EngineEventType.BACKTEST_STARTED, () => {
    setEvents(prev => [...prev.slice(-9), 'Backtest started']);
  });
  
  useBacktestEvents(EngineEventType.BACKTEST_COMPLETED, () => {
    setEvents(prev => [...prev.slice(-9), 'Backtest completed']);
  });
  
  return (
    <div className="event-log" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
      <h3>Event Log (Last 10 events)</h3>
      {events.length === 0 ? (
        <p>No events yet</p>
      ) : (
        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {events.map((event, index) => (
            <div key={index} style={{ marginBottom: '2px' }}>
              {new Date().toLocaleTimeString()}: {event}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Data Management Component - Simplified for YouTube-style UI
 */
const DataManagement: React.FC = () => {
  const actions = useBacktestActions();
  const { state } = useBacktestState();
  const [isLoading, setIsLoading] = useState(false);
  
  const handleLoadSampleData = () => {
    const sampleData = generateSampleData(100);
    actions.loadData(sampleData);
  };

  return (
    <div className="space-y-3 text-sm">
      {/* Current Data Status */}
      <div className="bg-gray-700 rounded p-3">
        <div className="text-gray-300 mb-1">Current Dataset</div>
        <div className="text-white font-medium">
          {state?.bars?.length || 0} bars loaded
        </div>
        {state?.bars?.[0] && (
          <div className="text-xs text-gray-400 mt-1">
            {(state.bars[0] as any)?.contractId || 'Unknown'} - {(state.bars[0] as any)?.timeframe || 'Unknown'}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-2">
        <button 
          onClick={handleLoadSampleData}
          disabled={isLoading}
          className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
            isLoading 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isLoading ? '⏳ Loading...' : '📝 Load Sample Data'}
        </button>
        
        <button 
          onClick={() => actions.refreshIndicators()}
          disabled={isLoading}
          className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
            isLoading 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          🔄 Refresh Indicators
        </button>
      </div>
    </div>
  );
};

/**
 * Engine Status Component
 */
const EngineStatus: React.FC = () => {
  const { state, derived, isInitialized, error } = useBacktestState();
  
  return (
    <div className="space-y-3 text-sm">
      {/* Status Grid */}
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-gray-700 rounded p-2 flex items-center justify-between">
          <span className="text-gray-300">Status</span>
          <span className={`font-medium ${isInitialized ? 'text-green-400' : 'text-red-400'}`}>
            {isInitialized ? '✅ Ready' : '❌ Not Ready'}
          </span>
        </div>
        
        {error && (
          <div className="bg-red-900 border border-red-700 rounded p-2">
            <span className="text-red-300 font-medium">Error:</span>
            <span className="text-red-200 ml-2">{error}</span>
          </div>
        )}
        
        <div className="bg-gray-700 rounded p-2 flex items-center justify-between">
          <span className="text-gray-300">Balance</span>
          <span className="text-white font-medium">
            ${state?.accountBalance.toFixed(2) || 'N/A'}
          </span>
        </div>
        
        <div className="bg-gray-700 rounded p-2 flex items-center justify-between">
          <span className="text-gray-300">P&L</span>
          <span className={`font-medium ${
            (state?.accountBalance || 0) >= (state?.initialBalance || 0) 
              ? 'text-green-400' 
              : 'text-red-400'
          }`}>
            {state?.accountBalance && state?.initialBalance 
              ? `$${(state.accountBalance - state.initialBalance).toFixed(2)}`
              : 'N/A'
            }
          </span>
        </div>
        
        <div className="bg-gray-700 rounded p-2 flex items-center justify-between">
          <span className="text-gray-300">Bar</span>
          <span className="text-white font-medium">
            {state?.currentBarIndex || 0}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Main Demo Component Content
 */
const BacktestDemoContent: React.FC = () => {
  const actions = useBacktestActions();
  const { state, isInitialized } = useBacktestState();
  const hasLoadedInitialDataRef = useRef(false);
  
  // State for chart timeframe and contract selection
  const [chartTimeframe, setChartTimeframe] = useState('1d');
  const [chartContract, setChartContract] = useState('ES');
  const [availableContracts, setAvailableContracts] = useState<Array<{id: string; symbol: string; fullName: string}>>([]);
  
  // UI state for advanced controls
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Available timeframes for chart
  const availableTimeframes = [
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
  ];
  
  // Load available contracts for chart
  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const contracts = await getAvailableContracts();
        setAvailableContracts(contracts);
        
        // Set default contract to first available if ES not found
        if (contracts.length > 0) {
          const hasES = contracts.some(c => c.symbol === 'ES');
          if (!hasES && contracts[0]) {
            setChartContract(contracts[0].symbol);
          }
        }
      } catch (error) {
        console.error('Failed to fetch contracts for chart:', error);
      }
    };
    
    fetchContracts();
  }, []);
  
  // Handle chart timeframe change
  const handleChartTimeframeChange = async (timeframe: string) => {
    setChartTimeframe(timeframe);
    try {
      console.log(`📊 Chart timeframe changed to ${timeframe}`);
      const marketData = await loadMarketData({ 
        contract: chartContract, 
        timeframe: timeframe, 
        limit: 1000 
      });
      actions.loadData(marketData);
      console.log(`✅ Loaded ${marketData.length} bars of ${chartContract} ${timeframe} data for chart`);
    } catch (error) {
      console.error('❌ Failed to load data for timeframe change:', error);
    }
  };
  
  // Handle chart contract change
  const handleChartContractChange = async (contract: string) => {
    setChartContract(contract);
    try {
      console.log(`📊 Chart contract changed to ${contract}`);
      const marketData = await loadMarketData({ 
        contract: contract, 
        timeframe: chartTimeframe, 
        limit: 1000 
      });
      actions.loadData(marketData);
      console.log(`✅ Loaded ${marketData.length} bars of ${contract} ${chartTimeframe} data for chart`);
    } catch (error) {
      console.error('❌ Failed to load data for contract change:', error);
    }
  };
  
  // Load real market data only once when engine is initialized
  useEffect(() => {
    if (!isInitialized || hasLoadedInitialDataRef.current) {
      return; // Not ready yet, or already loaded data
    }

    // Check if data is already loaded
    if (state?.bars && state.bars.length > 0) {
      hasLoadedInitialDataRef.current = true;
      return;
    }

    // Small delay to ensure actions are fully initialized
    const timeoutId = setTimeout(() => {
      // Ensure actions.loadData exists before calling it
      if (!actions.loadData) {
        console.warn('⚠️ actions.loadData not available yet');
        return;
      }

      const loadInitialData = async () => {
        if (hasLoadedInitialDataRef.current) return; // Double-check to prevent race conditions
        
        try {
          console.log('🚀 Loading initial market data from database...');
          hasLoadedInitialDataRef.current = true; // Set flag immediately to prevent duplicate calls
          
          // First try to get available contracts to use the first one
          const contracts = await getAvailableContracts();
          const contractToUse = (contracts.length > 0 && contracts[0]) ? contracts[0].symbol : 'ES';
          
          // Update chart states to match loaded data
          setChartContract(contractToUse);
          setChartTimeframe('1d');
          
          const marketData = await loadMarketData({ 
            contract: contractToUse, 
            timeframe: '1d', 
            limit: 1000  // Get full available range with 1d timeframe
          });
          actions.loadData(marketData);
          console.log(`✅ Loaded ${marketData.length} bars of ${contractToUse} 1d data for market replay`);
        } catch (error) {
          console.warn('⚠️ Failed to load database data, falling back to sample data:', error);
          // Fallback to sample data if database fails
          const sampleData = generateSampleData(200); // More sample data for better visualization
          actions.loadData(sampleData);
        }
      };
      
      loadInitialData();
    }, 10); // Small delay to ensure actions are ready

    return () => clearTimeout(timeoutId);
  }, [isInitialized]); // Only depend on isInitialized
  
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Main Content Area - YouTube-style */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h1 className="text-2xl font-bold text-white">Strategy Backtesting</h1>
            <p className="text-gray-400 text-sm">Professional backtesting with real market data simulation</p>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            {showAdvanced ? '🔧 Hide Advanced' : '⚙️ Show Advanced'}
          </button>
        </div>

        {/* Main Chart Area */}
        <div className="flex-1 p-4">
          <BacktestChart 
            height={window.innerHeight - 200} // Dynamic height
            showTradeMarkers={true}
            showPositionMarkers={true}
            showPerformance={true}
            onTimeframeChange={handleChartTimeframeChange}
            onContractChange={handleChartContractChange}
            currentTimeframe={chartTimeframe}
            currentContract={chartContract}
            availableTimeframes={availableTimeframes}
            availableContracts={availableContracts}
          />
        </div>
      </div>

      {/* Sidebar - Essential Controls */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
        {/* Playback Controls - Always Visible */}
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-white">📊 Market Replay</h3>
          <PlaybackControls />
        </div>

        {/* Performance Summary - Always Visible */}
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold mb-4 text-white">📈 Performance</h3>
          <PerformanceMetrics />
        </div>

        {/* Advanced Controls - Collapsible */}
        {showAdvanced && (
          <>
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-white">🔧 Engine Status</h3>
              <EngineStatus />
            </div>

            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-white">💾 Data Management</h3>
              <DataManagement />
            </div>

            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-white">🎯 Strategies</h3>
              <StrategyManagement />
            </div>

            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-white">📋 Orders & Positions</h3>
              <OrdersAndPositions />
            </div>

            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4 text-white">📝 Event Log</h3>
              <EventLog />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Complete Demo Component with Provider
 */
const BacktestDemo: React.FC = () => {
  return (
    <BacktestProvider
      config={{
        initialBalance: 100000,
        autoExecuteStrategies: true,
        enableRealTimeUpdates: true,
        orderMatchingConfig: {
          enableSlippage: true,
          marketOrderSlippage: 10, // 10 basis points
          enablePartialFills: true,
        },
      }}
    >
      <BacktestDemoContent />
    </BacktestProvider>
  );
};

export default BacktestDemo; 