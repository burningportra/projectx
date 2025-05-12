'use client';

import React, { useState, useEffect, useRef } from "react";
import { OhlcBar } from "@/lib/prisma";
import {
  SciChartSurface,
  NumericAxis,
  CategoryAxis,
  FastCandlestickRenderableSeries,
  OhlcDataSeries,
  ZoomPanModifier,
  ZoomExtentsModifier,
  MouseWheelZoomModifier,
  LegendModifier,
  ELegendPlacement,
  ELegendOrientation,
  RolloverModifier,
  XyScatterRenderableSeries,
  TrianglePointMarker,
  SquarePointMarker,
  EllipsePointMarker,
  XyDataSeries
} from "scichart";

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
const TEXT_COLOR = "#D9D9D9";

// Initialize license token - using free Community license
const initSciChart = async () => {
  try {
    // Use SciChart's free Community Key
    await SciChartSurface.useWasmFromCDN();
  } catch (e) {
    console.error("Error initializing SciChart:", e);
  }
};

const TrendChart: React.FC<TrendChartProps> = ({ 
  data, 
  height = 400 
}) => {
  const sciChartSurfaceRef = useRef<SciChartSurface | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Initialize SciChart
  useEffect(() => {
    (async () => {
      await initSciChart();
      setIsInitialized(true);
    })();
  }, []);

  // Create and update chart when data changes or after initialization
  useEffect(() => {
    if (!isInitialized || !containerRef.current) return;
    
    // Clean up any existing chart
    if (sciChartSurfaceRef.current) {
      sciChartSurfaceRef.current.delete();
      sciChartSurfaceRef.current = undefined;
    }
    
    // Initialize chart
    const initChart = async () => {
      try {
        // Create the SciChartSurface
        const divElement = containerRef.current;
        if (!divElement) return;
        
        const { sciChartSurface, wasmContext } = await SciChartSurface.create(divElement);
        sciChartSurfaceRef.current = sciChartSurface;
        
        // Set chart background color
        sciChartSurface.background = CHART_BACKGROUND;
        
        // Create X axis with category labels for time
        const xAxis = new CategoryAxis(wasmContext);
        xAxis.labelStyle = { color: TEXT_COLOR };
        sciChartSurface.xAxes.add(xAxis);
        
        // Create Y axis for price data
        const yAxis = new NumericAxis(wasmContext);
        yAxis.labelStyle = { color: TEXT_COLOR };
        // Configure decimal places
        yAxis.labelProvider.formatLabel = (dataValue) => dataValue.toFixed(2);
        sciChartSurface.yAxes.add(yAxis);
        
        // Prepare OHLC data series
        const ohlcDataSeries = new OhlcDataSeries(wasmContext);
        
        // Add data points
        data.forEach((bar, index) => {
          ohlcDataSeries.append(
            index,            // X value (index)
            bar.open,         // Open
            bar.high,         // High
            bar.low,          // Low
            bar.close         // Close
          );
        });
        
        // Create candlestick series
        const candlestickSeries = new FastCandlestickRenderableSeries(wasmContext, {
          dataSeries: ohlcDataSeries,
          strokeThickness: 1,
          dataPointWidth: 0.7
        });
        
        // Set colors (using setters instead of direct properties)
        candlestickSeries.strokeUp = BULLISH_COLOR;
        candlestickSeries.strokeDown = BEARISH_COLOR;
        // Use brushes for fill color
        candlestickSeries.style.fillUpBrush = BULLISH_COLOR;
        candlestickSeries.style.fillDownBrush = BEARISH_COLOR;
        
        // Create trend indicators as scatter series
        
        // Uptrend starts
        const createTrendSeries = (
          trendProperty: keyof OhlcBarWithTrends, 
          name: string, 
          color: string, 
          markerType: "triangle" | "square" | "ellipse",
          priceFactor: number
        ) => {
          // Only create if we have data points
          if (!data.some(bar => bar[trendProperty])) return;
          
          // Create data series
          const trendSeries = new XyDataSeries(wasmContext);
          trendSeries.dataSeriesName = name;
          
          // Add data points
          data.forEach((bar, index) => {
            if (bar[trendProperty]) {
              // For uptrend indicators, position below the price bar
              // For downtrend indicators, position above the price bar
              const yValue = priceFactor < 1 ? bar.low * priceFactor : bar.high * priceFactor;
              trendSeries.append(index, yValue);
            }
          });
          
          // Create point marker
          let pointMarker;
          if (markerType === "triangle") {
            pointMarker = new TrianglePointMarker(wasmContext, {
              width: 7,
              height: 7,
              strokeThickness: 2,
              fill: color,
              stroke: color
            });
          } else if (markerType === "square") {
            pointMarker = new SquarePointMarker(wasmContext, {
              width: 10,
              height: 10,
              strokeThickness: 2,
              fill: color,
              stroke: color
            });
          } else {
            pointMarker = new EllipsePointMarker(wasmContext, {
              width: 8,
              height: 8,
              strokeThickness: 2,
              fill: color,
              stroke: color
            });
          }
          
          // Create scatter series with the marker
          const scatterSeries = new XyScatterRenderableSeries(wasmContext, {
            dataSeries: trendSeries,
            pointMarker
          });
          
          // Add to chart
          sciChartSurface.renderableSeries.add(scatterSeries);
        };
        
        // Create trend indicators
        createTrendSeries("uptrendStart", "Uptrend Start", BULLISH_COLOR, "triangle", 0.999);
        createTrendSeries("downtrendStart", "Downtrend Start", BEARISH_COLOR, "triangle", 1.001);
        createTrendSeries("highestDowntrendStart", "Highest Downtrend", "#FF0000", "square", 1.002);
        createTrendSeries("unbrokenUptrendStart", "Unbroken Uptrend", "#00FF00", "square", 0.998);
        createTrendSeries("uptrendToHigh", "Key Level", "#0088FE", "ellipse", 1.003);
        
        // Add candlestick series to chart
        sciChartSurface.renderableSeries.add(candlestickSeries);
        
        // Add interactive modifiers
        sciChartSurface.chartModifiers.add(
          new ZoomPanModifier(),
          new ZoomExtentsModifier(),
          new MouseWheelZoomModifier(),
          new LegendModifier({
            placement: ELegendPlacement.TopRight,
            orientation: ELegendOrientation.Vertical
          }),
          new RolloverModifier()
        );
      } catch (error) {
        console.error("Error creating SciChart:", error);
      }
    };
    
    initChart();
    
    // Cleanup
    return () => {
      if (sciChartSurfaceRef.current) {
        sciChartSurfaceRef.current.delete();
      }
    };
  }, [data, isInitialized]);

  return (
    <div className="relative">
      <div 
        ref={containerRef} 
        style={{ width: "100%", height: `${height}px` }}
      />
      
      <div className="mt-2 text-sm text-center text-gray-500">
        <p>Drag to pan • Use mouse wheel to zoom • Double-click to reset view</p>
      </div>
    </div>
  );
};

export default TrendChart; 