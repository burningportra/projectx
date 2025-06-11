/**
 * BacktestChart Component for v3 Backtesting System
 * 
 * Displays market data with real-time playback visualization including:
 * - OHLC candlestick data
 * - Current playback position marker
 * - Trade entry/exit markers
 * - Performance overlay
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickData, 
  UTCTimestamp, 
  SeriesMarker, 
  Time, 
  CandlestickSeries,
  CrosshairMode 
} from 'lightweight-charts';
import { useBacktestState, useBacktestPlayback, useBacktestOrders, useBacktestEvents } from '../BacktestProvider';
import { BacktestBarData } from '../../types/backtester';
import { EngineEventType } from '../BacktestEngine';

interface BacktestChartProps {
  height?: number;
  showTradeMarkers?: boolean;
  showPositionMarkers?: boolean;
  showPerformance?: boolean;
  onTimeframeChange?: (timeframe: string) => void;
  onContractChange?: (contract: string) => void;
  currentTimeframe?: string;
  currentContract?: string;
  availableTimeframes?: Array<{value: string; label: string}>;
  availableContracts?: Array<{id: string; symbol: string; fullName: string}>;
}

// Chart styling constants
const CHART_COLORS = {
  background: '#131722',
  textColor: '#D1D5DB',
  gridColor: '#2B2B43',
  borderColor: '#484848',
  
  // Candlestick colors
  bullish: '#00C49F',
  bearish: '#FF8042',
  
  // Marker colors
  currentPosition: '#FFD700', // Gold
  buyTrade: '#22c55e',      // Green
  sellTrade: '#ef4444',     // Red
  profit: '#16a34a',        // Dark green
  loss: '#dc2626',          // Dark red
};

export const BacktestChart: React.FC<BacktestChartProps> = ({
  height = 400,
  showTradeMarkers = true,
  showPositionMarkers = true,
  showPerformance = true,
  onTimeframeChange,
  onContractChange,
  currentTimeframe = '5m',
  currentContract = 'ES',
  availableTimeframes = [
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
  ],
  availableContracts = [
    { id: 'ES', symbol: 'ES', fullName: 'E-mini S&P 500' },
    { id: 'NQ', symbol: 'NQ', fullName: 'E-mini NASDAQ 100' },
    { id: 'YM', symbol: 'YM', fullName: 'E-mini Dow Jones' },
    { id: 'RTY', symbol: 'RTY', fullName: 'E-mini Russell 2000' },
  ],
}) => {
  // Refs for chart management
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesApiRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  
  // State management
  const { state, isInitialized } = useBacktestState();
  const playback = useBacktestPlayback();
  const orders = useBacktestOrders();
  const [error, setError] = useState<string | null>(null);
  
  // Progressive chart data state - starts empty
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [currentTickData, setCurrentTickData] = useState<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || !isInitialized) return;

    try {
      // Create chart instance
      const containerWidth = chartContainerRef.current.clientWidth || 600; // Fallback width
      const chart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: height,
        layout: {
          background: { color: CHART_COLORS.background },
          textColor: CHART_COLORS.textColor,
        },
        grid: {
          vertLines: { color: CHART_COLORS.gridColor },
          horzLines: { color: CHART_COLORS.gridColor },
        },
        timeScale: {
          borderColor: CHART_COLORS.borderColor,
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: CHART_COLORS.borderColor,
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
        },
      });

      // Add candlestick series
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: CHART_COLORS.bullish,
        downColor: CHART_COLORS.bearish,
        borderVisible: true,
        borderUpColor: CHART_COLORS.bullish,
        borderDownColor: CHART_COLORS.bearish,
        wickUpColor: CHART_COLORS.bullish,
        wickDownColor: CHART_COLORS.bearish,
      });

      chartApiRef.current = chart;
      seriesApiRef.current = candlestickSeries;
      setError(null);

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current) {
          const newWidth = chartContainerRef.current.clientWidth || 600; // Fallback width
          chart.applyOptions({ 
            width: newWidth 
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
        chartApiRef.current = null;
        seriesApiRef.current = null;
      };
    } catch (err) {
      console.error('Failed to initialize chart:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize chart');
    }
  }, [height, isInitialized]);

  // Handle bar processed events for bar-by-bar mode
  const handleBarProcessed = useCallback((event: any) => {
    const { bar, barIndex } = event.data || {};
    console.log('📊 Chart received BAR_PROCESSED event', { bar, barIndex });
    
    if (!bar) return;

    // Convert BacktestBarData to CandlestickData
    const newBarData: CandlestickData = {
      time: (typeof bar.time === 'number' ? Math.floor(bar.time / 1000) : 
             Math.floor(new Date(bar.time).getTime() / 1000)) as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    };

    setChartData(prev => {
      // In bar mode, we build the chart progressively up to the current bar
      const newData = [...prev];
      
      // Make sure we don't duplicate bars
      const existingIndex = newData.findIndex(d => d.time === newBarData.time);
      if (existingIndex >= 0) {
        newData[existingIndex] = newBarData;
      } else {
        newData.push(newBarData);
      }
      
      return newData.sort((a, b) => (a.time as number) - (b.time as number));
    });
  }, []);

  // Handle progressive bar formation events
  const handleBarForming = useCallback((event: any) => {
    const { targetBar, formingBar, expectedTicks } = event.data || {};
    console.log('🔨 Chart received BAR_FORMING event', { targetBar, formingBar, expectedTicks });
    
    if (!formingBar) return;

    // Initialize the forming bar visualization
    const formingBarTime = (typeof formingBar.time === 'number' ? Math.floor(formingBar.time / 1000) : 
                           Math.floor(new Date(formingBar.time).getTime() / 1000)) as UTCTimestamp;
    
    setCurrentTickData({
      time: formingBarTime,
      open: formingBar.open,
      high: formingBar.high,
      low: formingBar.low,
      close: formingBar.close,
    });
  }, []);

  const handleBarUpdate = useCallback((event: any) => {
    const { formingBar, tick, progress } = event.data || {};
    console.log('🔄 Chart received BAR_UPDATE event', { formingBar, tick, progress });
    
    if (!formingBar) return;

    // Update the forming bar with new tick data
    const updatedBarTime = (typeof formingBar.time === 'number' ? Math.floor(formingBar.time / 1000) : 
                           Math.floor(new Date(formingBar.time).getTime() / 1000)) as UTCTimestamp;
    
    setCurrentTickData({
      time: updatedBarTime,
      open: formingBar.open,
      high: formingBar.high,
      low: formingBar.low,
      close: formingBar.close,
    });
  }, []);

  const handleBarCompleted = useCallback((event: any) => {
    const { completedBar, barIndex } = event.data || {};
    console.log('✅ Chart received BAR_COMPLETED event', { completedBar, barIndex });
    
    if (!completedBar) return;

    // Convert completed forming bar to final chart data
    const finalBarData: CandlestickData = {
      time: (typeof completedBar.time === 'number' ? Math.floor(completedBar.time / 1000) : 
             Math.floor(new Date(completedBar.time).getTime() / 1000)) as UTCTimestamp,
      open: completedBar.open,
      high: completedBar.high,
      low: completedBar.low,
      close: completedBar.close,
    };

    setChartData(prev => {
      const newData = [...prev, finalBarData];
      return newData.sort((a, b) => (a.time as number) - (b.time as number));
    });
    
    // Clear the forming bar data since it's now complete
    setCurrentTickData(null);
  }, []);

  // Subscribe to bar events
  useBacktestEvents(EngineEventType.BAR_PROCESSED, handleBarProcessed);
  
  // Subscribe to progressive bar formation events
  useBacktestEvents(EngineEventType.BAR_FORMING, handleBarForming);
  useBacktestEvents(EngineEventType.BAR_UPDATE, handleBarUpdate);
  useBacktestEvents(EngineEventType.BAR_COMPLETED, handleBarCompleted);
  
  // Load initial data when bars are loaded (for immediate visualization)
  useEffect(() => {
    if (!state?.bars || state.bars.length === 0) {
      setChartData([]);
      return;
    }

    // Skip automatic data loading during progressive mode to avoid conflicts
    if (playback.currentMode === 'progressive' && (playback.isRunning || playback.isPaused)) {
      console.log('📈 Skipping automatic chart data load during progressive mode');
      return;
    }

    // Show different data based on playback state
    let barsToShow: BacktestBarData[];
    
    if (playback.isRunning || playback.isPaused) {
      // During playback, show progressive data up to current position
      const currentBarIndex = state.currentBarIndex || 0;
      barsToShow = state.bars.slice(0, Math.max(1, currentBarIndex + 1));
    } else {
      // When stopped/initial load, show all available data for overview
      barsToShow = state.bars;
    }
    
    const formattedData: CandlestickData[] = barsToShow.map(bar => ({
      time: (typeof bar.time === 'number' ? Math.floor(bar.time / 1000) : 
             Math.floor(new Date(bar.time).getTime() / 1000)) as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })).sort((a, b) => (a.time as number) - (b.time as number));

    console.log('📈 Loading initial chart data:', {
      totalBars: state.bars.length,
      barsToShow: barsToShow.length,
      currentBarIndex: state.currentBarIndex,
      isRunning: playback.isRunning,
      currentMode: playback.currentMode,
      formattedData: formattedData.length
    });

    setChartData(formattedData);
  }, [state?.bars, state?.currentBarIndex, playback.isRunning, playback.isPaused, playback.currentMode]);

  // Clear chart data when starting progressive mode for clean slate
  useEffect(() => {
    if (playback.currentMode === 'progressive' && playback.isRunning) {
      console.log('📈 Clearing chart data for progressive mode start');
      setChartData([]);
      setCurrentTickData(null);
    }
  }, [playback.currentMode, playback.isRunning]);

  // Update chart with progressive data
  useEffect(() => {
    if (!seriesApiRef.current) return;

    try {
      let dataToShow = [...chartData];
      
      // Add current tick data if it exists (building bar) but avoid duplicates
      if (currentTickData) {
        // Check if we already have a bar with this timestamp
        const existingIndex = dataToShow.findIndex(d => d.time === currentTickData.time);
        
        if (existingIndex >= 0) {
          // Replace existing bar with current tick data (forming bar update)
          dataToShow[existingIndex] = currentTickData;
        } else {
          // Add new forming bar
          dataToShow.push(currentTickData);
        }
        
        // Ensure data is sorted by time
        dataToShow.sort((a, b) => (a.time as number) - (b.time as number));
      }

      if (dataToShow.length > 0) {
        // Validate data ordering before setting to prevent chart errors
        for (let i = 1; i < dataToShow.length; i++) {
          const prevTime = dataToShow[i - 1]?.time as number;
          const currentTime = dataToShow[i]?.time as number;
          
          if (prevTime >= currentTime) {
            console.error('Chart data ordering error:', {
              index: i,
              prevTime,
              currentTime,
              prevBar: dataToShow[i - 1],
              currentBar: dataToShow[i]
            });
            
            // Remove duplicate or out-of-order entries
            dataToShow = dataToShow.filter((item, index) => {
              if (index === 0) return true;
              const prevItem = dataToShow[index - 1];
              return prevItem ? (item.time as number) > (prevItem.time as number) : true;
            });
            break;
          }
        }
        
        console.log('📈 Setting chart data:', {
          totalBars: dataToShow.length,
          hasCurrentTick: !!currentTickData,
          firstTime: dataToShow[0]?.time,
          lastTime: dataToShow[dataToShow.length - 1]?.time
        });
        
        seriesApiRef.current.setData(dataToShow);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to update chart data:', err);
      setError('Failed to update chart data');
    }
  }, [chartData, currentTickData]);

  // Reset chart data when backtest resets
  useEffect(() => {
    if (state?.currentBarIndex === 0 && playback.progress === 0 && !playback.isRunning) {
      console.log('🔄 Resetting chart data');
      setChartData([]);
      setCurrentTickData(null);
    }
  }, [state?.currentBarIndex, playback.progress, playback.isRunning]);

  // Update markers for trades and current position
  useEffect(() => {
    if (!seriesApiRef.current || !state?.bars) return;

    const markers: SeriesMarker<UTCTimestamp>[] = [];

    try {
      // Add current position marker
      if (showPositionMarkers && playback.currentBar && state.currentBarIndex < state.bars.length) {
        const currentBar = state.bars[state.currentBarIndex];
        if (currentBar) {
          const currentTime = (typeof currentBar.time === 'number' ? Math.floor(currentBar.time / 1000) : 
                              Math.floor(new Date(currentBar.time).getTime() / 1000)) as UTCTimestamp;
          
          markers.push({
            time: currentTime,
            position: 'inBar',
            color: CHART_COLORS.currentPosition,
            shape: 'circle',
            size: 2,
            text: `▶ Bar ${state.currentBarIndex + 1}`,
          });
        }
      }

      // Add trade markers
      if (showTradeMarkers && orders.recentTrades.length > 0) {
        orders.recentTrades.forEach((trade, index) => {
          // Find the corresponding bar for this trade
          const tradeBarIndex = state.currentBarIndex || 0; // Simplified - in real implementation, match by timestamp
          if (tradeBarIndex >= 0 && tradeBarIndex < state.bars.length) {
            const tradeBar = state.bars[tradeBarIndex];
            if (!tradeBar) return; // Skip if bar doesn't exist
            
            const tradeTime = (typeof tradeBar.time === 'number' ? Math.floor(tradeBar.time / 1000) : 
                              Math.floor(new Date(tradeBar.time).getTime() / 1000)) as UTCTimestamp;

            // Entry marker
            markers.push({
              time: tradeTime,
              position: trade.type === 'BUY' ? 'belowBar' : 'aboveBar',
              color: trade.type === 'BUY' ? CHART_COLORS.buyTrade : CHART_COLORS.sellTrade,
              shape: trade.type === 'BUY' ? 'arrowUp' : 'arrowDown',
              text: `${trade.type} @${trade.entryPrice.toFixed(2)}`,
            });

            // Exit marker (if trade is closed)
            if (trade.exitPrice) {
              const isProfitable = (trade.profitOrLoss || 0) > 0;
              markers.push({
                time: tradeTime,
                position: trade.type === 'BUY' ? 'aboveBar' : 'belowBar',
                color: isProfitable ? CHART_COLORS.profit : CHART_COLORS.loss,
                shape: 'square',
                text: `Exit @${trade.exitPrice.toFixed(2)} (${isProfitable ? '+' : ''}${(trade.profitOrLoss || 0).toFixed(2)})`,
              });
            }
          }
        });
      }

      // TODO: Implement markers using LineSeries approach like TrendChart
      // For now, we'll skip markers to get the basic chart working
      console.log(`Would show ${markers.length} markers on chart`);
    } catch (err) {
      console.error('Failed to update chart markers:', err);
    }
  }, [state?.currentBarIndex, state?.bars, orders.recentTrades, playback.currentBar, showTradeMarkers, showPositionMarkers]);

  // Auto-scroll removed - chart now stays fixed for better tick-by-tick observation

  if (!isInitialized) {
    return (
      <div 
        style={{ 
          height, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: CHART_COLORS.background,
          color: CHART_COLORS.textColor,
          border: '1px solid #333',
        }}
      >
        <div>⏳ Initializing chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        style={{ 
          height, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: CHART_COLORS.background,
          color: '#ef4444',
          border: '1px solid #333',
        }}
      >
        <div>❌ Chart Error: {error}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Chart Header with Info */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 10, 
          left: 10, 
          zIndex: 10,
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '8px 12px',
          borderRadius: '4px',
          color: CHART_COLORS.textColor,
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
      >
        <div><strong>Market Replay Chart</strong></div>
        <div>📊 {state?.bars?.length || 0} bars loaded</div>
        <div>▶️ Bar {(state?.currentBarIndex || 0) + 1} of {state?.bars?.length || 0}</div>
        <div>⏱️ Progress: {playback.progress.toFixed(1)}%</div>
        {playback.currentBar && (
          <div>💰 Price: ${playback.currentBar.close.toFixed(2)}</div>
        )}
      </div>

      {/* Timeframe and Contract Selection */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 10, 
          right: 10, 
          zIndex: 10,
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: '8px 12px',
          borderRadius: '4px',
          color: CHART_COLORS.textColor,
          fontSize: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minWidth: '200px',
        }}
      >
        {/* Contract Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', minWidth: '50px' }}>Contract:</label>
          <select
            value={currentContract}
            onChange={(e) => onContractChange?.(e.target.value)}
            disabled={playback.isActive}
            style={{
              backgroundColor: playback.isActive ? '#444' : '#2a2a2a',
              color: playback.isActive ? '#888' : CHART_COLORS.textColor,
              border: '1px solid #555',
              borderRadius: '3px',
              padding: '2px 6px',
              fontSize: '11px',
              flex: 1,
              cursor: playback.isActive ? 'not-allowed' : 'pointer',
            }}
          >
            {availableContracts.map(contract => (
              <option key={contract.id} value={contract.id}>
                {contract.symbol} - {contract.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Timeframe Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: 'bold', minWidth: '50px' }}>Timeframe:</label>
          <select
            value={currentTimeframe}
            onChange={(e) => onTimeframeChange?.(e.target.value)}
            disabled={playback.isActive}
            style={{
              backgroundColor: playback.isActive ? '#444' : '#2a2a2a',
              color: playback.isActive ? '#888' : CHART_COLORS.textColor,
              border: '1px solid #555',
              borderRadius: '3px',
              padding: '2px 6px',
              fontSize: '11px',
              flex: 1,
              cursor: playback.isActive ? 'not-allowed' : 'pointer',
            }}
          >
            {availableTimeframes.map(tf => (
              <option key={tf.value} value={tf.value}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>

        {playback.isActive && (
          <div style={{ fontSize: '10px', color: '#ffa500', fontStyle: 'italic' }}>
            ⚠️ Stop playback to change timeframe/contract
          </div>
        )}
      </div>

      {/* Chart Container */}
      <div 
        ref={chartContainerRef} 
        style={{ 
          height,
          width: '100%',
          minWidth: '400px',
          border: '1px solid #333',
        }} 
      />

      {/* Chart Footer with Controls */}
      {showPerformance && (
        <div 
          style={{
            backgroundColor: CHART_COLORS.background,
            padding: '8px 12px',
            borderLeft: '1px solid #333',
            borderRight: '1px solid #333',
            borderBottom: '1px solid #333',
            color: CHART_COLORS.textColor,
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>📈 Open Positions: {orders.openPositions.length}</span>
            <span>📋 Pending Orders: {orders.pendingOrders.length}</span>
            <span>🎯 Recent Trades: {orders.recentTrades.length}</span>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>💰 Balance: ${state?.accountBalance.toFixed(2) || 'N/A'}</span>
            <span>📊 Status: {playback.isRunning ? '▶️ Running' : playback.isPaused ? '⏸️ Paused' : '⏹️ Stopped'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestChart; 