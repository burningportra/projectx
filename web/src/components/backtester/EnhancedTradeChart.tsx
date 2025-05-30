import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  LineData,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  Time,
  IPriceLine,
  PriceLineOptions
} from 'lightweight-charts';
import { BacktestBarData, SubBarData, BarFormationMode, TimeframeConfig, Order, OrderSide, OrderStatus, OrderType } from '@/lib/types/backtester';
import { ChartDataManager, ChartDataPoint } from './ChartDataManager';

interface TradeMarker {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  size?: number;
  priority?: number;
}

interface EnhancedTradeChartProps {
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
    id: string;
    entryPrice: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    side: OrderSide;
  }[];
  onPerformanceUpdate?: (stats: any) => void;
}

const createOrderPriceLineOptions = (
  price: number, 
  color: string, 
  lineStyle: LineStyle, 
  axisLabelVisible: boolean = true, 
  title?: string
): PriceLineOptions => {
  return {
    price,
    color,
    lineWidth: 1,
    lineStyle,
    axisLabelVisible,
    title: title || '',
    lineVisible: true,
    axisLabelColor: '',
    axisLabelTextColor: '',
  };
};

const EnhancedTradeChart: React.FC<EnhancedTradeChartProps> = React.memo(({ 
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
  openPositions = [],
  onPerformanceUpdate
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema12SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema26SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const dataManagerRef = useRef<ChartDataManager>(new ChartDataManager());
  const isInitialLoadRef = useRef<boolean>(true);
  const lastViewportUpdateRef = useRef<number>(0);
  const userHasInteractedRef = useRef<boolean>(false);
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const activePriceLineObjectsRef = useRef<Map<string, IPriceLine>>(new Map());

  const performanceRef = useRef({
    lastRenderTime: 0,
    renderCount: 0,
    averageRenderTime: 0,
    markerCount: 0,
    dataPoints: 0
  });

  const updateDimensions = useCallback(() => {
    if (chartContainerRef.current) {
      const { clientWidth, clientHeight } = chartContainerRef.current;
      setChartDimensions({ width: clientWidth, height: clientHeight });
    }
  }, []);

  const optimizedTradeMarkers = useMemo(() => {
    if (!tradeMarkers || tradeMarkers.length === 0) return [];
    const currentTime = mainTimeframeBars[currentBarIndex]?.time || 0;
    const maxTradeMarkers = 50;
    
    return tradeMarkers
      .filter(marker => {
        if (barFormationMode === BarFormationMode.INSTANT) return marker.time <= currentTime;
        const markerBarIndex = mainTimeframeBars.findIndex(bar => bar.time === marker.time);
        if (markerBarIndex < 0) return false;
        return markerBarIndex < currentBarIndex ||
          (markerBarIndex === currentBarIndex && 
           subTimeframeBars.length > 0 && 
           currentSubBarIndex >= subTimeframeBars.filter(sb => sb.parentBarIndex === currentBarIndex).length - 1);
      })
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, maxTradeMarkers)
      .map(marker => ({ ...marker, time: marker.time as Time }));
  }, [tradeMarkers, mainTimeframeBars, currentBarIndex, currentSubBarIndex, barFormationMode, subTimeframeBars]);
  
  const updateOrderPriceLines = useCallback(() => {
    if (!candlestickSeriesRef.current) return;

    const series = candlestickSeriesRef.current;
    const newPriceLineKeys = new Set<string>();

    pendingOrders.forEach(order => {
      if (order.status === OrderStatus.PENDING && (order.type === OrderType.LIMIT || order.type === OrderType.STOP)) {
        const price = order.price || order.stopPrice;
        if (price) {
          const lineKey = `order_${order.id}`;
          newPriceLineKeys.add(lineKey);
          const color = order.side === OrderSide.BUY ? '#2196F3' : '#FF9800';
          const title = `${order.side} ${order.type} @ ${price.toFixed(2)}`;
          const options = createOrderPriceLineOptions(price, color, LineStyle.Dashed, true, title);
          
          if (activePriceLineObjectsRef.current.has(lineKey)) {
            const existingLine = activePriceLineObjectsRef.current.get(lineKey)!;
            if (existingLine.options().price !== price) {
                series.removePriceLine(existingLine);
                const newLine = series.createPriceLine(options);
                activePriceLineObjectsRef.current.set(lineKey, newLine);
            }
          } else {
            const newLine = series.createPriceLine(options);
            activePriceLineObjectsRef.current.set(lineKey, newLine);
          }
        }
      }
    });

    if (openPositions.length > 0) {
      const currentPosition = openPositions[0]; 
      if (currentPosition.stopLossPrice) {
        const slLineKey = `position_${currentPosition.id}_sl`;
        newPriceLineKeys.add(slLineKey);
        const options = createOrderPriceLineOptions(currentPosition.stopLossPrice, '#F44336', LineStyle.Solid, true, `SL @ ${currentPosition.stopLossPrice.toFixed(2)}`);
        if (activePriceLineObjectsRef.current.has(slLineKey)) {
            const existingLine = activePriceLineObjectsRef.current.get(slLineKey)!;
            if (existingLine.options().price !== currentPosition.stopLossPrice) {
                series.removePriceLine(existingLine);
                const newLine = series.createPriceLine(options);
                activePriceLineObjectsRef.current.set(slLineKey, newLine);
            }
        } else {
            const newLine = series.createPriceLine(options);
            activePriceLineObjectsRef.current.set(slLineKey, newLine);
        }
      }
      if (currentPosition.takeProfitPrice) {
        const tpLineKey = `position_${currentPosition.id}_tp`;
        newPriceLineKeys.add(tpLineKey);
        const options = createOrderPriceLineOptions(currentPosition.takeProfitPrice, '#4CAF50', LineStyle.Solid, true, `TP @ ${currentPosition.takeProfitPrice.toFixed(2)}`);
        if (activePriceLineObjectsRef.current.has(tpLineKey)) {
            const existingLine = activePriceLineObjectsRef.current.get(tpLineKey)!;
            if (existingLine.options().price !== currentPosition.takeProfitPrice) {
                series.removePriceLine(existingLine);
                const newLine = series.createPriceLine(options);
                activePriceLineObjectsRef.current.set(tpLineKey, newLine);
            }
        } else {
            const newLine = series.createPriceLine(options);
            activePriceLineObjectsRef.current.set(tpLineKey, newLine);
        }
      }
    }

    activePriceLineObjectsRef.current.forEach((line, key) => {
      if (!newPriceLineKeys.has(key)) {
        try { series.removePriceLine(line); } catch(e) { /* ignore */ }
        activePriceLineObjectsRef.current.delete(key);
      }
    });
  }, [pendingOrders, openPositions]);

  const updateChartData = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    animationFrameRef.current = requestAnimationFrame(() => {
      const startTime = performance.now();
      if (!candlestickSeriesRef.current || !mainTimeframeBars || mainTimeframeBars.length === 0) {
        if (candlestickSeriesRef.current) candlestickSeriesRef.current.setData([]);
        return;
      }

      dataManagerRef.current.setData(mainTimeframeBars);
      let chartData: ChartDataPoint[];
      
      if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
        chartData = dataManagerRef.current.getProgressiveData(currentBarIndex, currentSubBarIndex, subTimeframeBars);
      } else {
        chartData = dataManagerRef.current.getOptimizedFullData(chartDimensions.width, 6);
        if (barFormationMode === BarFormationMode.INSTANT) {
          chartData = chartData.filter(point => point.originalIndex <= currentBarIndex);
        }
      }
      candlestickSeriesRef.current.setData(chartData);

      if (emaData && ema12SeriesRef.current && ema26SeriesRef.current) {
        const { fastEma, slowEma } = emaData;
        const ema12Data: LineData[] = [];
        const ema26Data: LineData[] = [];
        const maxIndex = Math.min(currentBarIndex, fastEma.length - 1, slowEma.length - 1);
        for (let i = 0; i <= maxIndex; i++) {
          if (fastEma[i] && slowEma[i] && mainTimeframeBars[i]) {
            ema12Data.push({ time: mainTimeframeBars[i].time as UTCTimestamp, value: fastEma[i] });
            ema26Data.push({ time: mainTimeframeBars[i].time as UTCTimestamp, value: slowEma[i] });
          }
        }
        ema12SeriesRef.current.setData(ema12Data);
        ema26SeriesRef.current.setData(ema26Data);
      }
      
      if (candlestickSeriesRef.current && optimizedTradeMarkers.length > 0) {
        try {
          (candlestickSeriesRef.current as any).setMarkers(optimizedTradeMarkers);
        } catch (error) {
          console.error('[EnhancedTradeChart] Failed to set trade markers:', error);
        }
      } else if (candlestickSeriesRef.current) {
        (candlestickSeriesRef.current as any).setMarkers([]);
      }

      updateOrderPriceLines();

      const endTime = performance.now();
      const renderTime = endTime - startTime;
      performanceRef.current.lastRenderTime = renderTime;
      performanceRef.current.renderCount++;
      performanceRef.current.averageRenderTime = (performanceRef.current.averageRenderTime * (performanceRef.current.renderCount - 1) + renderTime) / performanceRef.current.renderCount;
      performanceRef.current.markerCount = optimizedTradeMarkers.length;
      performanceRef.current.dataPoints = chartData.length;

      if (onPerformanceUpdate && performanceRef.current.renderCount % 10 === 0) {
        const memoryStats = dataManagerRef.current.getMemoryStats();
        onPerformanceUpdate({ ...performanceRef.current, ...memoryStats, chartDimensions, decimationActive: chartData.some(point => point.isDecimated) });
      }

      if (chartRef.current) {
        if (isInitialLoadRef.current && mainTimeframeBars.length > 0) {
          chartRef.current.timeScale().fitContent();
          isInitialLoadRef.current = false;
          lastViewportUpdateRef.current = Date.now();
          userHasInteractedRef.current = false;
        } else {
          const currentTime = mainTimeframeBars[currentBarIndex]?.time;
          const now = Date.now();
          const timeSinceLastUpdate = now - lastViewportUpdateRef.current;
          if (currentTime && !userHasInteractedRef.current && timeSinceLastUpdate > 5000) {
            const timeScale = chartRef.current.timeScale();
            const visibleRange = timeScale.getVisibleRange();
            if (visibleRange) {
              const rangeFrom = Number(visibleRange.from);
              const rangeTo = Number(visibleRange.to);
              if (currentTime > rangeTo || currentTime < rangeFrom) {
                const barsToShow = Math.min(100, mainTimeframeBars.length);
                const startIndex = Math.max(0, currentBarIndex - Math.floor(barsToShow * 0.8));
                const endIndex = Math.min(mainTimeframeBars.length - 1, startIndex + barsToShow);
                if (startIndex < endIndex) {
                  const st = mainTimeframeBars[startIndex].time;
                  const et = mainTimeframeBars[endIndex].time;
                  chartRef.current.timeScale().setVisibleRange({ from: st as any, to: et as any });
                  lastViewportUpdateRef.current = now;
                  setTimeout(() => { userHasInteractedRef.current = false; }, 10000);
                }
              }
            }
          }
        }
      }
    });
  }, [
    mainTimeframeBars, subTimeframeBars, currentBarIndex, currentSubBarIndex, 
    barFormationMode, timeframeConfig, emaData, optimizedTradeMarkers, 
    chartDimensions, onPerformanceUpdate, updateOrderPriceLines
  ]);

  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible) updateChartData();
  }, [isVisible, updateChartData]);

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: { background: { color: '#1e1e1e' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: 'rgba(70, 70, 70, 0.5)', style: LineStyle.SparseDotted }, horzLines: { color: 'rgba(70, 70, 70, 0.5)', style: LineStyle.SparseDotted } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
      timeScale: { borderColor: 'rgba(197, 203, 206, 0.4)', timeVisible: true, secondsVisible: false, rightOffset: 50, barSpacing: 6, minBarSpacing: 2, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: true },
    });
    chartRef.current = chart;

    candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    ema12SeriesRef.current = chart.addSeries(LineSeries, { color: '#2196F3', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'EMA 12', priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    ema26SeriesRef.current = chart.addSeries(LineSeries, { color: '#F44336', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'EMA 26', priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });

    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleTimeRangeChange(() => {
      const now = Date.now();
      if (now - lastViewportUpdateRef.current > 1000) userHasInteractedRef.current = true;
    });

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(chartContainerRef.current);
    updateDimensions();

    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      candlestickSeriesRef.current = null;
      ema12SeriesRef.current = null;
      ema26SeriesRef.current = null;
      dataManagerRef.current.cleanup();
      activePriceLineObjectsRef.current.clear();
    };
  }, [updateDimensions]);

  useEffect(() => {
    if (mainTimeframeBars.length === 0) {
      isInitialLoadRef.current = true;
      userHasInteractedRef.current = false;
      if (candlestickSeriesRef.current) {
        activePriceLineObjectsRef.current.forEach(line => {
            try { candlestickSeriesRef.current?.removePriceLine(line); } catch(e) {}
        });
        activePriceLineObjectsRef.current.clear();
      }
    }
  }, [mainTimeframeBars.length]);

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full bg-gray-800 text-white" />
      
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-xs text-green-400 p-2 rounded z-10">
          <div>Render: {performanceRef.current.lastRenderTime.toFixed(1)}ms</div>
          <div>Avg: {performanceRef.current.averageRenderTime.toFixed(1)}ms</div>
          <div>Points: {performanceRef.current.dataPoints}</div>
          <div>Markers: {performanceRef.current.markerCount}</div>
        </div>
      )}
    </div>
  );
});

EnhancedTradeChart.displayName = 'EnhancedTradeChart';

export default EnhancedTradeChart; 