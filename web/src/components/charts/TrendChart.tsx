'use client';

import React, { useState, useEffect, useRef } from "react";
import { OhlcBar } from "@/lib/prisma";

// Extended type for OhlcBar with trend indicators
interface OhlcBarWithTrends extends OhlcBar {
  uptrendStart: boolean;
  downtrendStart: boolean;
  highestDowntrendStart: boolean;
  unbrokenUptrendStart: boolean;
  uptrendToHigh: boolean;
}

interface TrendChartProps {
  data: OhlcBarWithTrends[];
  height?: number;
}

// Colors for chart elements
const BULLISH_COLOR = "#00C49F"; // Green for bullish candles
const BEARISH_COLOR = "#FF8042"; // Red/orange for bearish candles
const CHART_BACKGROUND = "#131722";

// Fixed chart ID to avoid dynamic generation issues
const CHART_ID = "sciChartDiv";

const TrendChart: React.FC<TrendChartProps> = ({ 
  data = [], 
  height = 400 
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let sciChartSurface: any = null;
    
    const createChart = async () => {
      try {
        // First, make sure our chart div exists and clear previous instances
        const chartDiv = document.getElementById(CHART_ID);
        if (!chartDiv) {
          setError("Chart container not found");
          return null;
        }
        
        // Import SciChart
        const SciChart = await import('scichart');
        
        // Load WASM modules
        await SciChart.SciChartSurface.useWasmFromCDN();
        
        // Create the surface using the fixed ID
        const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(CHART_ID);
        sciChartSurface.background = CHART_BACKGROUND;
        
        // Create X axis - use DateTimeAxis for timestamps
        const xAxis = new SciChart.DateTimeNumericAxis(wasmContext);
        xAxis.visibleRangeChangeAnimation = new SciChart.NumberRange(0, 0);
        sciChartSurface.xAxes.add(xAxis);
        
        // Create Y axis - price axis
        const yAxis = new SciChart.NumericAxis(wasmContext);
        yAxis.growBy = new SciChart.NumberRange(0.1, 0.1); // Add padding
        sciChartSurface.yAxes.add(yAxis);
        
        // Create OHLC data series
        const ohlcDataSeries = new SciChart.OhlcDataSeries(wasmContext);
        
        // Add the data points from the props
        if (data && data.length > 0) {
          // Convert data for bulk update (more efficient)
          const timestamps = data.map(bar => new Date(bar.timestamp).getTime());
          const opens = data.map(bar => bar.open);
          const highs = data.map(bar => bar.high);
          const lows = data.map(bar => bar.low);
          const closes = data.map(bar => bar.close);
          
          // Add data in bulk
          ohlcDataSeries.appendRange(timestamps, opens, highs, lows, closes);
          
          // Set the initial visible range to show all data
          const startDate = timestamps[0];
          const endDate = timestamps[timestamps.length - 1];
          xAxis.visibleRange = new SciChart.NumberRange(startDate, endDate);
        }
        
        // Create and configure the candlestick series
        const candlestickSeries = new SciChart.FastCandlestickRenderableSeries(wasmContext);
        
        // Set the data series
        candlestickSeries.dataSeries = ohlcDataSeries;
        
        // Set appearance
        candlestickSeries.dataPointWidth = 0.7;
        candlestickSeries.stroke = "#FFFFFF";
        candlestickSeries.strokeThickness = 1;
        
        // Set colors
        candlestickSeries.fillUp = BULLISH_COLOR;
        candlestickSeries.fillDown = BEARISH_COLOR;
        candlestickSeries.strokeUp = BULLISH_COLOR;
        candlestickSeries.strokeDown = BEARISH_COLOR;
        
        // Add the series to the chart
        sciChartSurface.renderableSeries.add(candlestickSeries);
        
        // Add chart modifiers for interactivity
        sciChartSurface.chartModifiers.add(
          new SciChart.ZoomPanModifier(),
          new SciChart.ZoomExtentsModifier(),
          new SciChart.MouseWheelZoomModifier()
        );
        
        // Auto-zoom to show all data
        sciChartSurface.zoomExtents();
        
        // Return the surface for cleanup
        return sciChartSurface;
      } catch (err) {
        console.error('SciChart creation error:', err);
        setError('Failed to initialize chart');
        return null;
      } finally {
        setIsLoading(false);
      }
    };
    
    // Use setTimeout to ensure DOM is ready
    const timer = setTimeout(() => {
      createChart().then(chart => {
        sciChartSurface = chart;
      });
    }, 100);
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
      
      if (sciChartSurface) {
        try {
          sciChartSurface.delete();
        } catch (err) {
          console.error('Error during chart cleanup:', err);
        }
      }
    };
  }, [data]); // Re-initialize when data changes
  
  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-opacity-50 bg-gray-800 z-10">
          <p className="text-white">Loading chart...</p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-opacity-50 bg-gray-800 z-10">
          <p className="text-red-500">{error}</p>
        </div>
      )}
      
      <div 
        id={CHART_ID}
        style={{ width: "100%", height: `${height}px` }}
        className="bg-gray-900"
      />
      
      <div className="mt-2 text-sm text-center text-gray-500">
        <p>Drag to pan • Use mouse wheel to zoom • Double-click to reset view</p>
        {data && data.length > 0 ? 
          <p className="text-xs mt-1">Showing {data.length} bars</p> : 
          <p className="text-xs mt-1 text-red-500">No data available</p>
        }
      </div>
    </div>
  );
};

export default TrendChart; 