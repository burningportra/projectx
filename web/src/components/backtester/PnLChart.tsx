import React, { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  LineData,
  CrosshairMode,
  LineStyle,
  LineSeries,
  SeriesMarker,
  Time,
} from 'lightweight-charts';
import { SimulatedTrade } from '@/lib/types/backtester';

interface PnLChartProps {
  trades: SimulatedTrade[];
  totalPnL: number;
  className?: string;
}

const PnLChart: React.FC<PnLChartProps> = ({ trades, totalPnL, className = '' }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersApiRef = useRef<any | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const lastTradesLengthRef = useRef<number>(0);

  // Debounced update function to prevent excessive updates during rapid playback
  const debouncedUpdateChart = useCallback((tradesToProcess: SimulatedTrade[]) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    const minUpdateInterval = 100; // Minimum 100ms between updates

    const doUpdate = () => {
      if (!lineSeriesRef.current) return;

      // console.log('[PnLChart] Processing trades for equity curve:', tradesToProcess.length);

      if (tradesToProcess.length === 0) {
        // Clear the chart when no trades
        lineSeriesRef.current.setData([]);
        if (markersApiRef.current) {
          markersApiRef.current.setMarkers([]);
        }
        return;
      }

      // Filter and validate trades first
      const validTrades = tradesToProcess
        .filter(trade => {
          // Only include trades with valid exit times and P&L
          const exitTime = trade.exitTime || trade.entryTime; // Fallback to entry time if exit time is missing
          const profitOrLoss = trade.profitOrLoss !== undefined ? trade.profitOrLoss : 0;
          
          const isValid = exitTime && 
                         profitOrLoss !== undefined && 
                         exitTime > 0 && 
                         !isNaN(exitTime) && 
                         !isNaN(profitOrLoss);
          
          if (!isValid) {
            console.warn('[PnLChart] Filtering out invalid trade:', trade);
          }
          return isValid;
        })
        .sort((a, b) => {
          // Use exit time if available, otherwise fall back to entry time
          const timeA = a.exitTime || a.entryTime || 0;
          const timeB = b.exitTime || b.entryTime || 0;
          return timeA - timeB;
        }); // Sort by time ascending

      // Double-check sorting by validating order
      for (let i = 1; i < validTrades.length; i++) {
        if ((validTrades[i].exitTime || 0) < (validTrades[i - 1].exitTime || 0)) {
          console.error('[PnLChart] Trade data is not properly sorted!', {
            current: validTrades[i],
            previous: validTrades[i - 1]
          });
          // Re-sort if we find ordering issues
          validTrades.sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));
          break;
        }
      }

      if (validTrades.length === 0) {
        // console.log('[PnLChart] No valid trades to display');
        lineSeriesRef.current.setData([]);
        if (markersApiRef.current) {
          markersApiRef.current.setMarkers([]);
        }
        return;
      }

      // Calculate cumulative P&L data points
      const equityData: LineData[] = [];
      const tradeMarkers: SeriesMarker<Time>[] = [];
      let cumulativePnL = 0;
      const startingCapital = 10000; // Starting with $10k

      // Add starting point
      const firstTradeTime = validTrades[0].exitTime!;
      equityData.push({
        time: firstTradeTime as UTCTimestamp,
        value: startingCapital,
      });

      // Process each valid trade
      validTrades.forEach((trade, index) => {
        // Use exit time if available, otherwise fall back to entry time
        const exitTime = trade.exitTime || trade.entryTime!;
        const profitOrLoss = trade.profitOrLoss !== undefined ? trade.profitOrLoss : 0;

        cumulativePnL += profitOrLoss;
        const equityValue = startingCapital + cumulativePnL;

        // Validate time ordering before adding
        if (equityData.length > 0) {
          const lastTime = equityData[equityData.length - 1].time as number;
          if (exitTime <= lastTime) {
            // console.warn('[PnLChart] Skipping trade with invalid time ordering:', {
            //   tradeTime: exitTime,
            //   lastTime: lastTime,
            //   trade: trade
            // });
            return; // Skip this trade to maintain time ordering
          }
        }

        equityData.push({
          time: exitTime as UTCTimestamp,
          value: equityValue,
        });

        // Add trade marker
        tradeMarkers.push({
          time: exitTime as UTCTimestamp,
          position: profitOrLoss >= 0 ? 'aboveBar' : 'belowBar',
          color: profitOrLoss >= 0 ? '#16a34a' : '#dc2626',
          shape: 'circle',
          text: `${profitOrLoss >= 0 ? '+' : ''}$${profitOrLoss.toFixed(0)}`,
          size: 1,
        });
      });

      // Final validation of equity data ordering
      for (let i = 1; i < equityData.length; i++) {
        const currentTime = equityData[i].time as number;
        const prevTime = equityData[i - 1].time as number;
        if (currentTime <= prevTime) {
          console.error('[PnLChart] Final data validation failed - data not in ascending order!', {
            index: i,
            currentTime,
            prevTime,
            current: equityData[i],
            previous: equityData[i - 1]
          });
          // Don't set invalid data - just return
          return;
        }
      }

      // console.log('[PnLChart] Generated equity data points:', equityData.length);
      // console.log('[PnLChart] Generated trade markers:', tradeMarkers.length);

      try {
        // Set data and markers with error handling
        lineSeriesRef.current.setData(equityData);
        
        // Use setMarkers for setting markers
        if (markersApiRef.current) {
          markersApiRef.current.setMarkers(tradeMarkers);
        }

        // Fit chart to content if we have data
        if (equityData.length > 0 && chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } catch (error) {
        console.error('[PnLChart] Failed to set chart data:', error);
      }

      lastUpdateRef.current = Date.now();
    };

    if (timeSinceLastUpdate >= minUpdateInterval) {
      // Update immediately if enough time has passed
      doUpdate();
    } else {
      // Schedule update for later
      const delay = minUpdateInterval - timeSinceLastUpdate;
      updateTimeoutRef.current = setTimeout(doUpdate, delay);
    }
  }, []);

  useEffect(() => {
    // Only update if trade count changed or significant time has passed
    const currentLength = trades.length;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    // Skip update if trades haven't changed and recent update occurred
    if (currentLength === lastTradesLengthRef.current && timeSinceLastUpdate < 50) {
      return;
    }
    
    lastTradesLengthRef.current = currentLength;
    debouncedUpdateChart(trades);

    // Cleanup timeout on unmount
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [trades, debouncedUpdateChart]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#cccccc',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#cccccc',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Create line series for equity curve
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#2563eb',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'Equity Curve',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    lineSeriesRef.current = lineSeries;

    if (lineSeriesRef.current) {
      markersApiRef.current = createSeriesMarkers(lineSeriesRef.current, []);
    }

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  return (
    <div className={`w-full ${className}`}>
      <div className="relative">
        <div 
          ref={chartContainerRef} 
          className="w-full h-[300px] bg-white rounded-lg border border-gray-200"
        />
        {trades.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">Load data and run playback to see equity curve</p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 text-sm text-gray-600 flex justify-between">
        <span>Equity Curve: Starting Capital $10,000 | Trades: {trades.length}</span>
        <span className={`font-semibold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          Current: ${(10000 + totalPnL).toLocaleString()}
        </span>
      </div>
      {trades.length > 0 && (
        <div className="mt-1 text-xs text-gray-500 overflow-x-auto">
          <details>
            <summary className="cursor-pointer">Trade Data Debug Info ({trades.length} trades)</summary>
            <div className="mt-2 p-2 bg-gray-50 rounded text-left overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-1 border text-left">ID</th>
                    <th className="p-1 border text-left">Type</th>
                    <th className="p-1 border text-left">Entry Time</th>
                    <th className="p-1 border text-left">Exit Time</th>
                    <th className="p-1 border text-left">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-1 border">{trade.id}</td>
                      <td className="p-1 border">{trade.type}</td>
                      <td className="p-1 border">{trade.entryTime ? new Date(trade.entryTime * 1000).toLocaleString() : 'N/A'}</td>
                      <td className="p-1 border">{trade.exitTime ? new Date(trade.exitTime * 1000).toLocaleString() : 'N/A'}</td>
                      <td className="p-1 border">${trade.profitOrLoss?.toFixed(2) || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default PnLChart;
