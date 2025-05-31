import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CandlestickData,
  LineData,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  SeriesMarker,
  Time,
  IPriceLine,
} from 'lightweight-charts';
import { BacktestBarData, SubBarData, BarFormationMode, TimeframeConfig, Order, OrderType, OrderSide, OrderStatus } from '@/lib/types/backtester';

interface TradeMarker {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  size?: number;
}

interface TradeChartProps {
  mainTimeframeBars: BacktestBarData[];
  subTimeframeBars: SubBarData[];
  currentBarIndex: number;
  currentSubBarIndex: number;
  barFormationMode: BarFormationMode;
  timeframeConfig: TimeframeConfig | null;
  tradeMarkers?: TradeMarker[];
  emaData?: {
    fastEma: number[];
    slowEma: number[];
  };
  pendingOrders?: Order[];
  filledOrders?: Order[];
  openPositions?: {
    entryPrice?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }[];
}

const TradeChart: React.FC<TradeChartProps> = React.memo(({ 
  mainTimeframeBars, 
  subTimeframeBars, 
  currentBarIndex, 
  currentSubBarIndex, 
  barFormationMode,
  timeframeConfig,
  tradeMarkers,
  emaData,
  pendingOrders = [],
  filledOrders = [],
  openPositions = []
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema12SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema26SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const lastViewportUpdateRef = useRef<number>(0);
  const userHasInteractedRef = useRef<boolean>(false); // Track if user has manually zoomed/scrolled
  
  // Price line references for dynamic order management
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());

  // console.log('[TradeChart] Rendering. Main bars:', mainTimeframeBars?.length, 'Sub bars:', subTimeframeBars?.length, 'currentBarIndex:', currentBarIndex, 'currentSubBarIndex:', currentSubBarIndex, 'mode:', barFormationMode, 'tradeMarkers:', tradeMarkers?.length || 0, 'pendingOrders:', pendingOrders?.length || 0, 'filledOrders:', filledOrders?.length || 0);

  // Enhanced order visualization using price lines instead of markers
  const updateOrderLines = useCallback(() => {
    if (!candlestickSeriesRef.current) return;

    const series = candlestickSeriesRef.current;
    const currentLines = priceLinesRef.current;

    // Clear existing price lines
    currentLines.forEach((line, key) => {
      series.removePriceLine(line);
    });
    currentLines.clear();

    console.log(`[updateOrderLines] Processing ${openPositions.length} open positions and ${pendingOrders.length} pending orders`);
    if (pendingOrders.length > 0) {
      console.log(`[updateOrderLines] Pending orders:`, pendingOrders.map(o => `${o.id} (${o.type} ${o.side} @ ${o.price || o.stopPrice})`));
    }

    // Create a set of prices that are already shown as pending orders
    const pendingOrderPrices = new Set<number>();
    pendingOrders
      .filter(order => order.status === OrderStatus.PENDING)
      .forEach(order => {
        const price = order.price || order.stopPrice;
        if (price) pendingOrderPrices.add(price);
      });

    // Add price lines for open positions (only entry line if SL/TP are in pending orders)
    openPositions.forEach((position, index) => {
      // console.log(`[updateOrderLines] Position ${index}:`, {
      //   entryPrice: position.entryPrice,
      //   stopLossPrice: position.stopLossPrice,
      //   takeProfitPrice: position.takeProfitPrice
      // });

      // Entry price line (blue, solid) - always show
      if (position.entryPrice) {
        const entryLine = series.createPriceLine({
          price: position.entryPrice,
          color: '#2196F3',
          lineWidth: 2,
          lineStyle: 0, // solid
          title: `Entry: ${position.entryPrice.toFixed(2)}`,
        });
        currentLines.set(`entry_${index}`, entryLine);
        // console.log(`[updateOrderLines] Created entry line at price: ${position.entryPrice}`);
      } else {
        // console.log(`[updateOrderLines] No entry price for position ${index}`);
      }

      // Stop Loss line - only show if not already in pending orders
      if (position.stopLossPrice && !pendingOrderPrices.has(position.stopLossPrice)) {
        const stopLine = series.createPriceLine({
          price: position.stopLossPrice,
          color: '#F44336',
          lineWidth: 2,
          lineStyle: 1, // dashed
          title: `Stop Loss: ${position.stopLossPrice.toFixed(2)}`,
        });
        currentLines.set(`stop_${index}`, stopLine);
      }

      // Take Profit line - only show if not already in pending orders
      if (position.takeProfitPrice && !pendingOrderPrices.has(position.takeProfitPrice)) {
        const tpLine = series.createPriceLine({
          price: position.takeProfitPrice,
          color: '#4CAF50',
          lineWidth: 2,
          lineStyle: 1, // dashed
          title: `Take Profit: ${position.takeProfitPrice.toFixed(2)}`,
        });
        currentLines.set(`tp_${index}`, tpLine);
      }
    });

    // Add price lines for pending orders
    pendingOrders
      .filter(order => order.status === OrderStatus.PENDING)
      .forEach((order, index) => {
        const price = order.price || order.stopPrice;
        if (!price) return;

        let color = '#FF9800'; // orange for pending orders
        let lineStyle = 2; // dotted
        let title = '';

        if (order.type === OrderType.LIMIT) {
          color = order.side === OrderSide.BUY ? '#03A9F4' : '#FF5722';
          title = `${order.side} Limit: $${price.toFixed(2)}`;
        } else if (order.type === OrderType.STOP) {
          color = '#9C27B0'; // purple for stop orders
          title = `${order.side} Stop: $${price.toFixed(2)}`;
        }

        const orderLine = series.createPriceLine({
          price: price,
          color: color,
          lineWidth: 1,
          lineStyle: lineStyle,
          title: title,
        });
        currentLines.set(`order_${order.id}`, orderLine);
      });

    console.log(`[TradeChart] Updated price lines: ${currentLines.size} total lines`);
    console.log(`[TradeChart] Lines created:`, Array.from(currentLines.keys()));
  }, [candlestickSeriesRef, openPositions, pendingOrders, mainTimeframeBars, currentBarIndex]);

  useEffect(() => {
    // console.log('[TradeChart] Data/playback useEffect triggered. Mode:', barFormationMode, 'Main bars:', mainTimeframeBars?.length, 'Sub bars:', subTimeframeBars?.length, 'Current bar:', currentBarIndex, 'Current sub:', currentSubBarIndex);
    if (!candlestickSeriesRef.current || !mainTimeframeBars || mainTimeframeBars.length === 0) {
      // console.log('[TradeChart] No series or main bars available.');
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData([]);
      }
      return;
    }

    if (barFormationMode === BarFormationMode.INSTANT) {
      // Instant mode: show complete bars up to currentBarIndex
      const barsToShow = mainTimeframeBars.slice(0, currentBarIndex + 1);
      // console.log('[TradeChart] Instant mode: Showing', barsToShow.length, 'complete bars');
      
      const chartReadyData: CandlestickData[] = barsToShow.map(bar => ({
        time: bar.time as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));
      
      candlestickSeriesRef.current.setData(chartReadyData);
      // Update price lines immediately after setData to prevent clearing
      updateOrderLines(); // eslint-disable-line react-hooks/exhaustive-deps
    } else if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      // Progressive mode: show completed bars + progressively forming current bar
      const completedBars = mainTimeframeBars.slice(0, currentBarIndex);
      // console.log('[TradeChart] Progressive mode: Showing', completedBars.length, 'completed bars');
      
      // Get sub-bars for the current main bar
      const subBarsForCurrentMain = subTimeframeBars.filter(
        subBar => subBar.parentBarIndex === currentBarIndex
      );
      
      // console.log('[TradeChart] Found', subBarsForCurrentMain.length, 'sub-bars for main bar', currentBarIndex);
      
      if (subBarsForCurrentMain.length > 0) {
        // Calculate the OHLC for the current forming bar using sub-bars up to currentSubBarIndex
        const subBarsToInclude = subBarsForCurrentMain.slice(0, currentSubBarIndex + 1);
        // console.log('[TradeChart] Including', subBarsToInclude.length, 'sub-bars for current forming bar (up to index', currentSubBarIndex, ')');
        
        if (subBarsToInclude.length > 0) {
          const currentMainBar = mainTimeframeBars[currentBarIndex];
          const formingBar = {
            time: currentMainBar.time,
            open: subBarsToInclude[0].open, // Open from first sub-bar
            high: Math.max(...subBarsToInclude.map(sb => sb.high)), // Highest high so far
            low: Math.min(...subBarsToInclude.map(sb => sb.low)),   // Lowest low so far
            close: subBarsToInclude[subBarsToInclude.length - 1].close, // Close from latest sub-bar
          };
          
          const allBarsToShow = [
            ...completedBars.map(bar => ({
              time: bar.time as UTCTimestamp,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            })),
            formingBar
          ];
          
          candlestickSeriesRef.current.setData(allBarsToShow);
          // Update price lines immediately after setData to prevent clearing
          updateOrderLines(); // eslint-disable-line react-hooks/exhaustive-deps
          // console.log('[TradeChart] Progressive: Set data with', allBarsToShow.length, 'bars (forming bar OHLC:', formingBar.open, formingBar.high, formingBar.low, formingBar.close, ')');
        }
      } else {
        // No sub-bars available, fall back to completed bars only
        const chartReadyData: CandlestickData[] = completedBars.map(bar => ({
          time: bar.time as UTCTimestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));
        
        candlestickSeriesRef.current.setData(chartReadyData);
        // Update price lines immediately after setData to prevent clearing
        updateOrderLines(); // eslint-disable-line react-hooks/exhaustive-deps
        // console.log('[TradeChart] Progressive fallback: Set data with', chartReadyData.length, 'completed bars (no sub-bars found)');
      }
    }

    // Update EMA lines if data is available
    if (emaData && ema12SeriesRef.current && ema26SeriesRef.current) {
      const { fastEma, slowEma } = emaData;
      
      // Show EMA data up to current bar index
      const ema12Data: LineData[] = [];
      const ema26Data: LineData[] = [];
      
      for (let i = 0; i <= Math.min(currentBarIndex, fastEma.length - 1, slowEma.length - 1); i++) {
        if (fastEma[i] && slowEma[i] && mainTimeframeBars[i]) {
          ema12Data.push({
            time: mainTimeframeBars[i].time as UTCTimestamp,
            value: fastEma[i],
          });
          ema26Data.push({
            time: mainTimeframeBars[i].time as UTCTimestamp,
            value: slowEma[i],
          });
        }
      }
      
      ema12SeriesRef.current.setData(ema12Data);
      ema26SeriesRef.current.setData(ema26Data);
      // console.log(`[TradeChart] Updated EMA lines: EMA12 (${ema12Data.length} points), EMA26 (${ema26Data.length} points)`);
    }

    // Handle chart scaling and viewport
    if (chartRef.current) {
      // Only fit content on initial load, then maintain user's zoom/scroll
      if (isInitialLoadRef.current && mainTimeframeBars.length > 0) {
        // console.log('[TradeChart] Initial load: fitting content');
        chartRef.current.timeScale().fitContent();
        isInitialLoadRef.current = false;
        lastViewportUpdateRef.current = Date.now();
        userHasInteractedRef.current = false; // Reset on initial load
      } else {
        // Only adjust viewport if:
        // 1. Current bar is completely outside visible range (not just near edge)
        // 2. User hasn't manually interacted recently
        // 3. Enough time has passed since last programmatic update
        const currentTime = mainTimeframeBars[currentBarIndex]?.time;
        const now = Date.now();
        const timeSinceLastUpdate = now - lastViewportUpdateRef.current;
        
        if (currentTime && !userHasInteractedRef.current && timeSinceLastUpdate > 5000) { // Only update every 5+ seconds
          const timeScale = chartRef.current.timeScale();
          const visibleRange = timeScale.getVisibleRange();
          
          // Only adjust if current bar is completely outside the visible range
          if (visibleRange) {
            const rangeFrom = Number(visibleRange.from);
            const rangeTo = Number(visibleRange.to);
            
            // Check if current bar is completely outside the visible range
            if (currentTime > rangeTo || currentTime < rangeFrom) {
              // console.log('[TradeChart] Current bar outside visible range, adjusting viewport');
              // Show bars around the current position
              const barsToShow = Math.min(100, mainTimeframeBars.length);
              const startIndex = Math.max(0, currentBarIndex - Math.floor(barsToShow * 0.8)); // Current bar at ~80% from left
              const endIndex = Math.min(mainTimeframeBars.length - 1, startIndex + barsToShow);
              
              if (startIndex < endIndex) {
                const startTime = mainTimeframeBars[startIndex].time;
                const endTime = mainTimeframeBars[endIndex].time;
                
                chartRef.current.timeScale().setVisibleRange({
                  from: startTime as any,
                  to: endTime as any,
                });
                lastViewportUpdateRef.current = now;
                // Reset user interaction flag after a successful programmatic update
                setTimeout(() => {
                  userHasInteractedRef.current = false;
                  // console.log('[TradeChart] Resetting user interaction flag');
                }, 10000); // Reset after 10 seconds
              }
            }
          }
        }
      }
      
      // Adjust time scale visibility based on timeframe
      if (timeframeConfig && mainTimeframeBars.length > 1) {
        const typicalInterval = mainTimeframeBars[1].time - mainTimeframeBars[0].time;
        const oneMinuteInSeconds = 60;
        chartRef.current.applyOptions({
          timeScale: {
            secondsVisible: typicalInterval < oneMinuteInSeconds * 2,
          }
        });
      }

      // Update trade markers based on current playback position
      if (candlestickSeriesRef.current && tradeMarkers && chartRef.current) {
        // console.log(`[TradeChart] Processing markers. Trade markers: ${tradeMarkers?.length || 0}, mode: ${barFormationMode}`);
        
        let markersToShow: SeriesMarker<Time>[] = [];
        
        // Add trade markers
        if (tradeMarkers) {
          if (barFormationMode === BarFormationMode.INSTANT) {
            // Instant mode: show markers for completed bars (up to and including current bar)
            const currentTime = mainTimeframeBars[currentBarIndex]?.time;
            const tradeMarkersFiltered = tradeMarkers
              .filter(marker => marker.time <= (currentTime || 0))
              .map(marker => ({
                time: marker.time as Time,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
                size: marker.size || 1,
              }));
            markersToShow.push(...tradeMarkersFiltered);
            // console.log(`[TradeChart] Instant mode: Filtered to ${tradeMarkersFiltered.length} trade markers`);
          } else if (barFormationMode === BarFormationMode.PROGRESSIVE) {
            // Progressive mode: show markers only for COMPLETED main bars
            const tradeMarkersFiltered = tradeMarkers
              .filter(marker => {
                const markerMainBarIndex = mainTimeframeBars.findIndex(bar => bar.time === marker.time);
                if (markerMainBarIndex < 0) return false;
                
                const isBarCompleted = markerMainBarIndex < currentBarIndex ||
                  (markerMainBarIndex === currentBarIndex && 
                   subTimeframeBars.length > 0 && 
                   currentSubBarIndex >= subTimeframeBars.filter(sb => sb.parentBarIndex === currentBarIndex).length - 1);
                
                return isBarCompleted;
              })
              .map(marker => ({
                time: marker.time as Time,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
                size: marker.size || 1,
              }));
            markersToShow.push(...tradeMarkersFiltered);
            // console.log(`[TradeChart] Progressive mode: Filtered to ${tradeMarkersFiltered.length} trade markers`);
          }
        }

        // console.log(`[TradeChart] Final visible markers: ${markersToShow.length} trade markers`);

        // Set markers on the series
        try {
          createSeriesMarkers(candlestickSeriesRef.current, markersToShow);
          // console.log(`[TradeChart] Successfully set ${markersToShow.length} markers`);
        } catch (error) {
          console.error('[TradeChart] Failed to set markers:', error);
        }
      } else {
        // console.log(`[TradeChart] Marker conditions not met. Series: ${!!candlestickSeriesRef.current}, Trade Markers: ${!!tradeMarkers}, Chart: ${!!chartRef.current}`);
      }
    }
  }, [mainTimeframeBars, subTimeframeBars, currentBarIndex, currentSubBarIndex, barFormationMode, timeframeConfig, tradeMarkers, emaData, openPositions, pendingOrders]);

  // Update order lines when orders change
  useEffect(() => {
    updateOrderLines();
  }, [pendingOrders, openPositions, updateOrderLines]);

  // Reset initial load flag when new data is loaded
  useEffect(() => {
    if (mainTimeframeBars.length === 0) {
      isInitialLoadRef.current = true;
      userHasInteractedRef.current = false; // Reset user interaction tracking on new data load
    }
  }, [mainTimeframeBars.length]);

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return; 
    // console.log('[TradeChart] Initializing chart and series...');

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { color: '#1e1e1e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(70, 70, 70, 0.5)', style: LineStyle.SparseDotted },
        horzLines: { color: 'rgba(70, 70, 70, 0.5)', style: LineStyle.SparseDotted },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.4)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 50,        // More empty space on the right
        barSpacing: 6,          // Narrower bar spacing to fit more bars
        minBarSpacing: 2,       // Minimum spacing when zoomed in
        fixLeftEdge: false,     // Allow scrolling past the first bar
        fixRightEdge: false,    // Allow scrolling past the last bar
        lockVisibleTimeRangeOnResize: true, // Maintain zoom level on resize
      },
    });
    chartRef.current = chart;

    if (chart) {
        candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
        // console.log('[TradeChart] Candlestick series added.');

        // Add EMA 12 line series (blue)
        ema12SeriesRef.current = chart.addSeries(LineSeries, {
            color: '#2196F3',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'EMA 12',
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });
        // console.log('[TradeChart] EMA 12 series added.');

        // Add EMA 26 line series (red)
        ema26SeriesRef.current = chart.addSeries(LineSeries, {
            color: '#F44336',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'EMA 26',
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });
        // console.log('[TradeChart] EMA 26 series added.');

        // Track user interactions (zoom/scroll) to avoid overriding manual adjustments
        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(() => {
          // Mark that user has interacted if this wasn't a programmatic update
          const now = Date.now();
          if (now - lastViewportUpdateRef.current > 1000) { // If it's been >1s since our last programmatic update
            userHasInteractedRef.current = true;
            // console.log('[TradeChart] User interaction detected - respecting manual zoom/scroll');
          }
        });
    } else {
      // console.error('[TradeChart] Chart creation failed.');
    }

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.resize(chartContainerRef.current.clientWidth, chartContainerRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      // console.log('[TradeChart] Cleaning up chart.');
      window.removeEventListener('resize', handleResize);
      
      // Clean up price lines
      if (candlestickSeriesRef.current && priceLinesRef.current) {
        priceLinesRef.current.forEach((line) => {
          candlestickSeriesRef.current!.removePriceLine(line);
        });
        priceLinesRef.current.clear();
      }
      
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      candlestickSeriesRef.current = null;
      ema12SeriesRef.current = null;
      ema26SeriesRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full bg-gray-800 text-white" />
      
      {/* Simplified Position Status - Price lines now show the actual levels */}
      {(pendingOrders.length > 0 || (openPositions && openPositions.length > 0)) && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-80 text-white p-2 rounded-lg text-xs z-10">
          <div className="font-semibold text-green-400">📊 Live Trading</div>
          
          {openPositions && openPositions.length > 0 && (
            <div className="text-blue-300 mt-1">
              🔵 {openPositions.length} Position{openPositions.length > 1 ? 's' : ''} Open
            </div>
          )}
          
          {pendingOrders.length > 0 && (
            <div className="text-yellow-300 mt-1">
              ⏳ {pendingOrders.length} Pending Order{pendingOrders.length > 1 ? 's' : ''}
            </div>
          )}
          
          <div className="text-gray-400 mt-1 text-xs">
            Lines show entry, SL, TP levels
          </div>
        </div>
      )}
    </div>
  );
});

TradeChart.displayName = 'TradeChart';

export default TradeChart;
