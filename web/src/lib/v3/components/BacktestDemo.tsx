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
    <div className="playback-controls" style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '4px' }}>
      <h3>📊 Market Replay Controls</h3>
      
      <div style={{ marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Status:</strong> 
            <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '3px', fontSize: '12px', 
                           backgroundColor: playback.isRunning ? '#d4edda' : playback.isPaused ? '#fff3cd' : '#f8d7da',
                           color: playback.isRunning ? '#155724' : playback.isPaused ? '#856404' : '#721c24' }}>
              {playback.isRunning ? '▶️ Running' : playback.isPaused ? '⏸️ Paused' : '⏹️ Stopped'}
            </span>
          </div>
          <div>
            <strong>Progress:</strong> {playback.progress.toFixed(1)}%
          </div>
          <div>
            <strong>Current Price:</strong> {playback.currentBar ? `$${playback.currentBar.close.toFixed(2)}` : 'N/A'}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <button 
          onClick={playback.actions.start}
          disabled={!playback.hasData || playback.isRunning}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: (!playback.hasData || playback.isRunning) ? 'not-allowed' : 'pointer',
            opacity: (!playback.hasData || playback.isRunning) ? 0.6 : 1,
            fontSize: '14px'
          }}
        >
          ▶️ Start
        </button>
        <button 
          onClick={playback.actions.pause}
          disabled={!playback.isRunning}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#ffc107', 
            color: '#212529', 
            border: 'none', 
            borderRadius: '4px',
            cursor: !playback.isRunning ? 'not-allowed' : 'pointer',
            opacity: !playback.isRunning ? 0.6 : 1,
            fontSize: '14px'
          }}
        >
          ⏸️ Pause
        </button>
        <button 
          onClick={playback.actions.resume}
          disabled={!playback.isPaused}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#17a2b8', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: !playback.isPaused ? 'not-allowed' : 'pointer',
            opacity: !playback.isPaused ? 0.6 : 1,
            fontSize: '14px'
          }}
        >
          ⏯️ Resume
        </button>
        <button 
          onClick={playback.actions.stop}
          disabled={!playback.isActive}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#dc3545', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: !playback.isActive ? 'not-allowed' : 'pointer',
            opacity: !playback.isActive ? 0.6 : 1,
            fontSize: '14px'
          }}
        >
          ⏹️ Stop
        </button>
        <button 
          onClick={playback.actions.reset}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🔄 Reset
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button 
          onClick={playback.actions.processNext}
          disabled={playback.isRunning || !playback.hasData}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#e9ecef', 
            color: '#495057', 
            border: '1px solid #ced4da', 
            borderRadius: '4px',
            cursor: (playback.isRunning || !playback.hasData) ? 'not-allowed' : 'pointer',
            opacity: (playback.isRunning || !playback.hasData) ? 0.6 : 1,
            fontSize: '12px'
          }}
        >
          ⏭️ Next Bar
        </button>
        <button 
          onClick={() => playback.actions.processTo?.(50)}
          disabled={playback.isRunning || !playback.hasData}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#e9ecef', 
            color: '#495057', 
            border: '1px solid #ced4da', 
            borderRadius: '4px',
            cursor: (playback.isRunning || !playback.hasData) ? 'not-allowed' : 'pointer',
            opacity: (playback.isRunning || !playback.hasData) ? 0.6 : 1,
            fontSize: '12px'
          }}
        >
          🎯 Jump to Bar 50
        </button>
        <button 
          onClick={playback.actions.processToEnd}
          disabled={playback.isRunning || !playback.hasData}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#e9ecef', 
            color: '#495057', 
            border: '1px solid #ced4da', 
            borderRadius: '4px',
            cursor: (playback.isRunning || !playback.hasData) ? 'not-allowed' : 'pointer',
            opacity: (playback.isRunning || !playback.hasData) ? 0.6 : 1,
            fontSize: '12px'
          }}
        >
          ⏩ Process to End
        </button>
      </div>
      
      {/* Playback Mode Controls */}
      <div style={{ marginTop: '10px', padding: '8px', background: '#e9ecef', borderRadius: '4px' }}>
        <strong style={{ fontSize: '12px', color: '#495057' }}>Replay Mode:</strong>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => {
              console.log('📊 Bar mode button clicked');
              playback.actions.setPlaybackMode?.('bar');
            }}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: playback.currentMode === 'bar' || !playback.currentMode ? '#155724' : '#28a745',
              color: 'white',
              border: playback.currentMode === 'bar' || !playback.currentMode ? '2px solid #0d4419' : 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontWeight: playback.currentMode === 'bar' || !playback.currentMode ? 'bold' : 'normal'
            }}
          >
            📊 Bar Mode {(playback.currentMode === 'bar' || !playback.currentMode) ? '(Active)' : ''}
          </button>
          
          <button
            onClick={() => {
              console.log('🔨 Progressive mode button clicked');
              playback.actions.setPlaybackMode?.('progressive');
            }}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: playback.currentMode === 'progressive' ? '#155724' : '#28a745',
              color: 'white',
              border: playback.currentMode === 'progressive' ? '2px solid #0d4419' : 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontWeight: playback.currentMode === 'progressive' ? 'bold' : 'normal'
            }}
          >
            🔨 Auto-Progressive Formation {playback.currentMode === 'progressive' ? '(Active)' : ''}
          </button>
        </div>

        <div style={{ marginTop: '6px', fontSize: '10px', color: '#6c757d' }}>
          💡 Current mode: <strong>{(playback.currentMode || 'bar').toUpperCase()}</strong> - 
          {playback.currentMode === 'progressive' && ' Automatically uses lower timeframe data from your database for realistic bar formation'}
          {(playback.currentMode === 'bar' || !playback.currentMode) && ' Traditional complete bar progression mode'}
        </div>
      </div>

      {/* Speed Controls */}
      <div style={{ marginTop: '10px', padding: '8px', background: '#e9ecef', borderRadius: '4px' }}>
        <strong style={{ fontSize: '12px', color: '#495057' }}>Playback Speed:</strong>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
          {[1, 2, 4, 8, 16, 32, 64].map(speed => (
            <button
              key={speed}
              onClick={() => {
                console.log(`⚡ Setting speed to ${speed}x${playback.isActive ? ' (live change)' : ''}`);
                playback.actions.setSpeed?.(speed);
              }}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                backgroundColor: playback.currentSpeed === speed ? '#004085' : '#007bff',
                color: 'white',
                border: playback.currentSpeed === speed ? '2px solid #002752' : 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: playback.currentSpeed === speed ? 'bold' : 'normal',
                minWidth: '35px'
              }}
            >
              {speed}x {playback.currentSpeed === speed ? '✓' : ''}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '4px', fontSize: '9px', color: '#6c757d' }}>
          ⚡ Current speed: <strong>{playback.currentSpeed}x</strong> - 
          {playback.isActive ? ' Can change live during playback!' : ' Higher speeds process data faster'}
          {playback.isActive && <span style={{ color: '#28a745', fontWeight: 'bold' }}> 🔄 LIVE</span>}
        </div>
      </div>

      {/* Progressive Configuration */}
      {playback.currentMode === 'progressive' && (
        <div style={{ marginTop: '10px', padding: '8px', background: '#fff3cd', borderRadius: '4px' }}>
          <strong style={{ fontSize: '12px', color: '#856404' }}>🔨 Progressive Bar Formation Settings:</strong>
          <div style={{ marginTop: '6px', fontSize: '10px', color: '#856404' }}>
            <div><strong>Auto-Detection:</strong> Enabled - System automatically selects best lower timeframe data</div>
            <div><strong>Fallback Order:</strong> Primary timeframe → Higher timeframes → Synthetic ticks</div>
            <div><strong>Enhanced Features:</strong> Realistic price paths, volume distribution, tick-by-tick order fills</div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#495057' }}>
            💡 <strong>Tip:</strong> If you don't see progressive formation, ensure your database has lower timeframe data available.
            The system will automatically fall back to synthetic ticks if real data isn't found.
          </div>
        </div>
      )}

      <div style={{ marginTop: '15px', padding: '8px', background: '#f8f9f9', borderRadius: '4px', fontSize: '14px' }}>
        <strong>📊 Data Status:</strong> {playback.hasData ? `${playback.totalBars} bars loaded and ready for progressive market replay` : '⚠️ No data loaded - please load market data first'}
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
    <div className="performance-metrics" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
      <h3>Performance Metrics</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div>
          <strong>Total P&L:</strong> ${performance.totalPnL.toFixed(2)}
        </div>
        <div>
          <strong>Win Rate:</strong> {performance.winRate.toFixed(1)}%
        </div>
        <div>
          <strong>Total Trades:</strong> {performance.totalTrades}
        </div>
        <div>
          <strong>Returns:</strong> {performance.returnsPercent.toFixed(2)}%
        </div>
        <div>
          <strong>Max Drawdown:</strong> {performance.currentDrawdown.toFixed(2)}%
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
 * Data Management Component
 */
const DataManagement: React.FC = () => {
  const actions = useBacktestActions();
  const { state } = useBacktestState();
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableContracts, setAvailableContracts] = useState<Array<{id: string; symbol: string; fullName: string}>>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState('ES');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1d'); // Default to 1-day for full market view
  const [selectedLimit, setSelectedLimit] = useState(1000); // Larger limit for daily data to get full range

  const timeframes = [
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
  ];

  // Fetch available contracts on mount
  useEffect(() => {
    const fetchContracts = async () => {
      setContractsLoading(true);
      try {
        const contracts = await getAvailableContracts();
        setAvailableContracts(contracts);
        console.log(`📋 Found ${contracts.length} available contracts in database:`, contracts.map(c => c.symbol));
        
        // Set default contract to first available if ES not found
        if (contracts.length > 0) {
          const hasES = contracts.some(c => c.symbol === 'ES');
          if (!hasES && contracts[0]) {
            setSelectedContract(contracts[0].symbol);
          }
        }
      } catch (error) {
        console.error('❌ Failed to fetch available contracts:', error);
        setLoadError('Failed to fetch available contracts from database');
      } finally {
        setContractsLoading(false);
      }
    };

    fetchContracts();
  }, []);

  const handleLoadDatabaseData = async (query: MarketDataQuery) => {
    setIsLoading(true);
    setLoadError(null);
    
    try {
      console.log('🔄 Loading market data from database...', query);
      const marketData = await loadMarketData(query);
      actions.loadData(marketData);
      console.log(`✅ Successfully loaded ${marketData.length} bars from database`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to load market data';
      setLoadError(errorMsg);
      console.error('❌ Error loading market data:', error);
      
      // Fall back to sample data
      console.log('📝 Falling back to sample data...');
      const sampleData = generateSampleData(100);
      actions.loadData(sampleData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSelectedData = () => {
    handleLoadDatabaseData({
      contract: selectedContract,
      timeframe: selectedTimeframe,
      limit: selectedLimit
    });
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    // Auto-reload data when timeframe changes
    handleLoadDatabaseData({
      contract: selectedContract,
      timeframe: timeframe,
      limit: selectedLimit
    });
  };

  const handleContractChange = (contract: string) => {
    setSelectedContract(contract);
    // Auto-reload data when contract changes
    handleLoadDatabaseData({
      contract: contract,
      timeframe: selectedTimeframe,
      limit: selectedLimit
    });
  };
  
  return (
    <div className="data-management" style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '4px' }}>
      <h3>📊 Data Management</h3>
      
      {/* Current Data Info */}
      <div style={{ marginBottom: '15px', padding: '8px', background: '#f9f9f9', borderRadius: '4px' }}>
        <strong>Current Data:</strong> {state?.bars?.length || 0} bars loaded
        {(() => {
          const firstBar = state?.bars?.[0];
          if (!firstBar) return null;
          const barData = firstBar as any;
          return (
            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
              ({barData?.contractId || 'Unknown Contract'} - {barData?.timeframe || 'Unknown Timeframe'})
            </span>
          );
        })()}
      </div>
      
      {/* Error Display */}
      {loadError && (
        <div style={{ marginBottom: '15px', padding: '8px', background: '#fee', border: '1px solid #fcc', color: '#c33', borderRadius: '4px' }}>
          <strong>Error:</strong> {loadError}
        </div>
      )}

      {/* Contract Selection */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>📋 Select Market Data</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          {/* Contract Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Contract:</label>
            {contractsLoading ? (
              <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>⏳ Loading contracts...</div>
            ) : (
              <select 
                value={selectedContract} 
                onChange={(e) => setSelectedContract(e.target.value)}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                disabled={isLoading}
              >
                {availableContracts.map(contract => (
                  <option key={contract.id} value={contract.symbol}>
                    {contract.symbol} ({contract.fullName})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Timeframe Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Timeframe:</label>
            <select 
              value={selectedTimeframe} 
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
              disabled={isLoading}
            >
              {timeframes.map(tf => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>

          {/* Limit Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Bars Count:</label>
            <select 
              value={selectedLimit} 
              onChange={(e) => setSelectedLimit(parseInt(e.target.value))}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
              disabled={isLoading}
            >
              <option value={50}>50 bars</option>
              <option value={100}>100 bars</option>
              <option value={200}>200 bars</option>
              <option value={500}>500 bars</option>
              <option value={1000}>1000 bars</option>
            </select>
          </div>
        </div>

        {/* Load Button */}
        <button 
          onClick={handleLoadSelectedData}
          disabled={isLoading || contractsLoading || availableContracts.length === 0}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {isLoading ? '⏳ Loading Data...' : `📊 Load ${selectedContract} ${selectedTimeframe} (${selectedLimit} bars)`}
        </button>
      </div>

      {/* Available Contracts Info */}
      {!contractsLoading && availableContracts.length > 0 && (
        <div style={{ marginBottom: '15px', padding: '8px', background: '#f0f8ff', borderRadius: '4px', fontSize: '12px' }}>
          <strong>Available Contracts in Database:</strong> {availableContracts.map(c => c.symbol).join(', ')} ({availableContracts.length} total)
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => {
            const sampleData = generateSampleData(100);
            actions.loadData(sampleData);
          }}
          disabled={isLoading}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            fontSize: '12px'
          }}
        >
          📝 Load Sample Data (Fallback)
        </button>
        <button 
          onClick={() => actions.refreshIndicators()}
          disabled={isLoading}
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            fontSize: '12px'
          }}
        >
          🔄 Refresh Indicators
        </button>
      </div>
      
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
        💡 Market data is loaded directly from your database. Use the dropdowns above to select any available contract and timeframe.
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
    <div className="engine-status" style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
      <h3>Engine Status</h3>
      <div>
        <strong>Initialized:</strong> {isInitialized ? '✅ Yes' : '❌ No'}
      </div>
      {error && (
        <div style={{ color: 'red' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      <div>
        <strong>Current Balance:</strong> ${state?.accountBalance.toFixed(2) || 'N/A'}
      </div>
      <div>
        <strong>Initial Balance:</strong> ${state?.initialBalance.toFixed(2) || 'N/A'}
      </div>
      <div>
        <strong>Current Bar Index:</strong> {state?.currentBarIndex || 0}
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
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Backtest Engine v3 Demo</h1>
      <p>This demo showcases the React Context Provider and custom hooks for the v3 BacktestEngine using <strong>real market data from your database</strong>.</p>
      
      <EngineStatus />
      <DataManagement />
      
      {/* Market Replay Chart */}
      <div style={{ marginBottom: '20px' }}>
        <h2>📈 Market Replay Chart</h2>
        <BacktestChart 
          height={500}
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
      
      <PlaybackControls />
      <PerformanceMetrics />
      <StrategyManagement />
      <OrdersAndPositions />
      <EventLog />
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