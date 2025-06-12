/**
 * Simplified chart component for trend analysis
 * Doesn't require BacktestProvider - just displays candlestick data with trend markers
 */

import React, { useRef, useEffect } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi,
  CandlestickData, 
  UTCTimestamp, 
  CandlestickSeries,
  CrosshairMode,
  createSeriesMarkers 
} from 'lightweight-charts';
import { BacktestBarData } from '../../types/backtester';

interface TrendChartProps {
  data: BacktestBarData[];
  signals?: Array<{
    time: UTCTimestamp;
    type: 'CUS' | 'CDS';
    price: number;
  }>;
  height?: number;
}

const CHART_COLORS = {
  background: '#131722',
  textColor: '#D1D5DB',
  gridColor: '#2B2B43',
  borderColor: '#484848',
  bullish: '#00C49F',
  bearish: '#FF8042',
  cusSignal: '#22c55e',
  cdsSignal: '#ef4444',
};

export const TrendChart: React.FC<TrendChartProps> = ({ 
  data, 
  signals = [], 
  height = 500 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesApiRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersApiRef = useRef<any>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart instance
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
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

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (markersApiRef.current) {
        markersApiRef.current.setMarkers([]);
        markersApiRef.current = null;
      }
      chart.remove();
      chartApiRef.current = null;
      seriesApiRef.current = null;
    };
  }, [height]);

  // Update chart data
  useEffect(() => {
    if (!seriesApiRef.current || data.length === 0) return;

    // Convert BacktestBarData to CandlestickData
    const candlestickData: CandlestickData[] = data.map(bar => ({
      time: (typeof bar.time === 'number' ? Math.floor(bar.time / 1000) : 
             Math.floor(new Date(bar.time).getTime() / 1000)) as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })).sort((a, b) => (a.time as number) - (b.time as number));

    seriesApiRef.current.setData(candlestickData);

    // Fit content to show all data
    if (chartApiRef.current) {
      chartApiRef.current.timeScale().fitContent();
    }
  }, [data]);

  // Update markers for signals
  useEffect(() => {
    if (!seriesApiRef.current) return;

    // Clean up existing markers
    if (markersApiRef.current) {
      markersApiRef.current.setMarkers([]);
      markersApiRef.current = null;
    }

    if (signals.length === 0) return;

    try {
      // Create markers using the new v5 API
      const markers = signals.map(signal => ({
        time: signal.time,
        position: signal.type === 'CUS' ? 'belowBar' : 'aboveBar',
        color: signal.type === 'CUS' ? CHART_COLORS.cusSignal : CHART_COLORS.cdsSignal,
        shape: signal.type === 'CUS' ? 'arrowUp' : 'arrowDown',
        text: `${signal.type}`,
      }));

      // Create series markers using the v5 API
      markersApiRef.current = createSeriesMarkers(seriesApiRef.current, markers);
      console.log(`✅ Added ${signals.length} trend signal markers to chart`);
    } catch (err) {
      console.error('Failed to create markers:', err);
    }
  }, [signals]);

  return (
    <div 
      ref={chartContainerRef} 
      style={{ 
        height,
        width: '100%',
        border: '1px solid #333',
      }} 
    />
  );
};

export default TrendChart;