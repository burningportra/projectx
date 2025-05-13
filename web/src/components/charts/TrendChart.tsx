'use client';

import React, { useState, useEffect, useRef, useId, useCallback, FC, ReactNode } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, SeriesMarker, Time, LineStyle, CrosshairMode, SeriesType } from 'lightweight-charts';

// Define OhlcBar type here instead of importing from prisma
interface OhlcBar {
  id: number;
  contractId: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  timeframeUnit: number;
  timeframeValue: number;
}

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
  // removeGaps?: boolean; // Lightweight Charts handles gaps differently
  onTrendPointsDetected?: (points: {timestamp: number; price: number; type: string; index: number}[]) => void;
  enableTraining?: boolean;
  onTrendConfirmed?: (point: {timestamp: number; price: number; type: string; index: number; timeframe?: string}) => Promise<any>;
  onTrendRemoved?: (point: {timestamp: number; type: string; index: number; timeframe?: string}) => Promise<any>;
  timeframe?: string;
  timeframes?: string[]; // Available timeframes for filtering
}

// Colors for chart elements
const BULLISH_COLOR = "#00C49F"; // Green for bullish candles
const BEARISH_COLOR = "#FF8042"; // Red/orange for bearish candles
const CHART_BACKGROUND = "#131722"; // Dark background for the chart
const TEXT_COLOR = "#D1D5DB"; // Light gray for text

// Trend marker colors - these will be used for price lines or custom markers
const UPTREND_START_COLOR = "#22c55e"; // Green
const DOWNTREND_START_COLOR = "#f97316"; // Orange
const HIGHEST_DOWNTREND_COLOR = "#ef4444"; // Red
const UNBROKEN_UPTREND_COLOR = "#16a34a"; // Dark green
const KEY_LEVEL_COLOR = "#3b82f6"; // Blue

// Helper function to convert UTC to Eastern Time (EST/EDT) - may still be needed for display
const convertToEasternTime = (date: Date): Date => {
  // Create a new date object to avoid modifying the original
  const estDate = new Date(date);
  
  // Get the timezone offset for Eastern Time (either EST or EDT)
  // This properly handles DST transitions
  const etOffsetHours = date.getTimezoneOffset() / 60;
  
  // Apply the timezone offset to get correct Eastern Time
  estDate.setHours(date.getHours() + etOffsetHours);
  
  return estDate;
};

// The compressTimeGaps function is removed as Lightweight Charts handles gaps.
// We will rely on its built-in functionality or explore its options if specific gap handling is needed.

// Define TrendTrainingTableProps here if it's not defined elsewhere and used by TrendTrainingTable
interface TrendTrainingTableProps {
  data: OhlcBarWithTrends[];
  selectedCandle: any | null;
  setSelectedCandle: (candle: any | null) => void;
  onConfirmTrend: (trendType: string) => Promise<void>;
  onRemoveTrend: (bar: OhlcBarWithTrends, trendType: string) => Promise<void>;
  timeframe: string;
  timeframes?: string[];
  isUpdating: boolean;
  formatTimestampToEastern: (timestamp: number) => string;
  debugTimestamp: (timestamp: any) => string;
}

// Placeholder for TrendTrainingTable - replace with actual implementation
const TrendTrainingTable: FC<TrendTrainingTableProps> = (props) => {
    return (
    <div className="trend-training-table-placeholder">
      <p>Trend Training Table (Placeholder)</p>
      {props.data && <p>Bars: {props.data.length}</p>}
      {props.selectedCandle && <p>Selected: {JSON.stringify(props.selectedCandle)}</p>}
    </div>
  );
};

// Add a utility function to normalize dates for daily timeframes
const normalizeDateForDaily = (date: Date | string | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);
  // Format as YYYY-MM-DD
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Deduplicate data function
const deduplicateOhlcData = (data: OhlcBarWithTrends[], isDaily: boolean): OhlcBarWithTrends[] => {
  if (!data || data.length === 0) return data;
  
  console.log(`Deduplicating ${data.length} bars (isDaily: ${isDaily})...`);
  
  const uniqueBars: OhlcBarWithTrends[] = [];
  const datesSeen = new Set<string>();
  
  // Process in chronological order to ensure we keep earliest bars when duplicates exist
  const sortedBars = [...data].sort((a, b) => {
    const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime(); 
    return aTime - bTime;
  });
  
  sortedBars.forEach(bar => {
    const timestamp = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
    // For daily, key is YYYY-MM-DD. For intraday, key is full ISO string to preserve uniqueness.
    const dateKey = isDaily ? normalizeDateForDaily(timestamp) : timestamp.toISOString(); 
    
    if (!datesSeen.has(dateKey)) {
      uniqueBars.push(bar);
      datesSeen.add(dateKey);
    } else {
      // console.warn(`Duplicate entry skipped for key: ${dateKey}`);
    }
  });
  
  if (data.length !== uniqueBars.length) {
    console.log(`Removed ${data.length - uniqueBars.length} duplicate bars`);
  }
  
  return uniqueBars;
};


const TrendChart: React.FC<TrendChartProps> = ({ 
  data = [], 
  height = 400,
  // removeGaps = true, // Prop removed
  onTrendPointsDetected,
  enableTraining = false,
  onTrendConfirmed,
  onTrendRemoved,
  timeframe = "5m", // e.g., "5m", "1h", "1d"
  timeframes = ["1m", "5m", "15m", "1h", "1d"]
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null); // Renamed for clarity
  const seriesApiRef = useRef<ISeriesApi<"Candlestick"> | null>(null); // Renamed for clarity
  
  const uniqueId = useId(); // Still useful for unique IDs if needed elsewhere
  
  const [isLoading, setIsLoading] = useState(true); // Retain loading state
  const [error, setError] = useState<string | null>(null); // Retain error state
  
  // Training mode state - largely unchanged for now
  const [selectedCandle, setSelectedCandle] = useState<any>(null); // Structure might change
  const [trainingMode, setTrainingMode] = useState(enableTraining);
  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]); // For visual feedback of pending saves
  const [isUpdating, setIsUpdating] = useState(false); // For API call status
  
  // Debug state
  const [clickPosition, setClickPosition] = useState<{x: number, y: number} | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  
  // Deduplicate data based on timeframe
  const isDailyTimeframe = timeframe.endsWith("d") || timeframe.endsWith("w") || timeframe.endsWith("M");
  const processedData = deduplicateOhlcData(data, isDailyTimeframe);

  // Helper function to format timestamps in Eastern Time (for display)
  const formatTimestampToEastern = useCallback((timestamp: number): string => {
    try {
      const date = new Date(timestamp);
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true, timeZone: 'America/New_York'
      };
      return new Intl.DateTimeFormat('en-US', options).format(date) + ' ET';
    } catch (e) {
      console.error("Error formatting timestamp:", e);
      return new Date(timestamp).toLocaleString() + " (local)";
    }
  }, []);
  
  // Helper to inspect raw timestamp value
  const debugTimestamp = useCallback((timestamp: any): string => {
    try {
      if (timestamp instanceof Date) return `Date object: ${timestamp.toISOString()}`;
      if (typeof timestamp === 'number') return `Milliseconds: ${timestamp}, ISO: ${new Date(timestamp).toISOString()}`;
      if (typeof timestamp === 'string') return `String: ${timestamp}, ISO: ${new Date(timestamp).toISOString()}`;
        return `Unknown type: ${typeof timestamp}, Value: ${String(timestamp)}`;
    } catch (e) {
      return `Error inspecting timestamp: ${e}`;
    }
  }, []);
  
  // Function to handle removing a trend indicator
  const removeTrendPoint = async (bar: OhlcBarWithTrends, trendType: string) => {
    if (!onTrendRemoved) {
      console.error("Cannot remove trend: no callback provided");
      setError("No removal callback provided");
      return;
    }
    
    const timestamp = bar.timestamp instanceof Date 
      ? bar.timestamp.getTime() 
      : new Date(bar.timestamp).getTime();
    
    console.log(`Removing ${trendType} for candle at ${formatTimestampToEastern(timestamp)}`);
    setIsUpdating(true);
    
    try {
      const barIndex = processedData.findIndex(b => 
        (b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime()) === timestamp &&
        b.open === bar.open && b.close === bar.close // Add more checks if needed for uniqueness
      );
      
      if (barIndex === -1) {
        console.error("Bar not found in processedData for removal:", bar);
        setError("Could not find the bar to remove the trend from.");
        setIsUpdating(false);
        return;
      }

      const trendPoint = {
        timestamp: timestamp,
        type: trendType,
        index: barIndex,
        timeframe: timeframe
      };
      
      await onTrendRemoved(trendPoint);
      console.log(`Trend point removed: ${trendType} at ${formatTimestampToEastern(timestamp)}`);
      setError(null);
    } catch (err) {
      console.error("Error removing trend point:", err);
      setError(`Failed to remove trend: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const renderTrainingTable = () => {
    if (!enableTraining || !processedData || processedData.length === 0) return null;
    
    return (
      <TrendTrainingTable 
        data={processedData}
        selectedCandle={selectedCandle}
        setSelectedCandle={setSelectedCandle}
        onConfirmTrend={confirmTrendPoint}
        onRemoveTrend={removeTrendPoint}
        timeframe={timeframe}
        timeframes={timeframes}
        isUpdating={isUpdating}
        formatTimestampToEastern={formatTimestampToEastern}
        debugTimestamp={debugTimestamp}
      />
    );
  };
  
  useEffect(() => {
    if (enableTraining !== trainingMode) {
      setTrainingMode(enableTraining);
    }
  }, [enableTraining, trainingMode]);
  
  // Effect for initializing and updating the chart
  useEffect(() => {
    if (!chartContainerRef.current || processedData.length === 0) {
      setIsLoading(processedData.length === 0 && data.length > 0);
      if (data.length > 0 && processedData.length === 0) {
        console.warn("Original data has items, but processedData is empty.");
      }
      if (chartApiRef.current) {
        chartApiRef.current.remove();
        chartApiRef.current = null;
        seriesApiRef.current = null;
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    
    // Initialize or update chart instance
    if (!chartApiRef.current) {
      chartApiRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: height,
        layout: {
          background: { color: CHART_BACKGROUND },
          textColor: TEXT_COLOR,
        },
        grid: {
          vertLines: { color: '#2B2B43' },
          horzLines: { color: '#2B2B43' },
        },
        timeScale: {
          borderColor: '#484848',
          timeVisible: true,
          secondsVisible: timeframe.includes('m') || timeframe.includes('s'),
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
        },
      });
    } else {
      chartApiRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height });
    }
    
    const chart = chartApiRef.current; // chart is guaranteed to be IChartApi here

    // Initialize or update series instance
    if (!seriesApiRef.current) {
      seriesApiRef.current = chart.addCandlestickSeries({ // This should now work
        upColor: BULLISH_COLOR,
        downColor: BEARISH_COLOR,
        borderDownColor: BEARISH_COLOR,
        borderUpColor: BULLISH_COLOR,
        wickDownColor: BEARISH_COLOR,
        wickUpColor: BULLISH_COLOR,
      });
    } 
    // else { 
      // If series exists, it will be updated by setData. 
      // If options need to change, use seriesApiRef.current.applyOptions(...)
    // }
    
    const series = seriesApiRef.current; // series is guaranteed to be ISeriesApi<"Candlestick"> here
    if (!series) { // Should not happen if logic above is correct
        console.error("Series API reference is null after initialization attempt.");
        setError("Failed to initialize chart series.");
            setIsLoading(false);
            return;
          }
          
    const trendPointsForCallback: {timestamp: number; price: number; type: string; index: number}[] = [];
    
    const chartDataWithMarkers: CandlestickData[] = processedData.map((bar, index) => {
      const timestamp = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
      let timeValue: Time;
      if (isDailyTimeframe) {
        timeValue = normalizeDateForDaily(timestamp) as Time;
          } else {
        timeValue = (timestamp.getTime() / 1000) as UTCTimestamp;
      }
      
      const markersForThisBar: SeriesMarker<Time>[] = [];
      const addSeriesMarker = (type: string, priceVal: number, color: string, shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square', text: string, position: 'aboveBar' | 'belowBar') => {
        markersForThisBar.push({
          time: timeValue, 
          position: position,
          color: color,
          shape: shape,
          text: text, 
        });
        trendPointsForCallback.push({
          timestamp: timestamp.getTime(),
          price: priceVal,
          type,
          index
        });
      };

      if (bar.uptrendStart && bar.low) addSeriesMarker("Uptrend Start", bar.low, UPTREND_START_COLOR, 'arrowUp', 'UpS', 'belowBar');
      if (bar.downtrendStart && bar.high) addSeriesMarker("Downtrend Start", bar.high, DOWNTREND_START_COLOR, 'arrowDown', 'DnS', 'aboveBar');
      if (bar.highestDowntrendStart && bar.high) addSeriesMarker("Highest Downtrend", bar.high, HIGHEST_DOWNTREND_COLOR, 'arrowDown', 'HDn', 'aboveBar');
      if (bar.unbrokenUptrendStart && bar.low) addSeriesMarker("Unbroken Uptrend", bar.low, UNBROKEN_UPTREND_COLOR, 'circle', 'UnUp', 'belowBar');
      if (bar.uptrendToHigh && bar.high) addSeriesMarker("Uptrend to High", bar.high, KEY_LEVEL_COLOR, 'square', 'UpH', 'aboveBar');
      
      return {
        time: timeValue,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        // @ts-ignore 
        markers: markersForThisBar.length > 0 ? markersForThisBar : undefined 
      };
    }).sort((a, b) => {
        const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : (typeof a.time === 'number' ? a.time * 1000 : 0);
        const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : (typeof b.time === 'number' ? b.time * 1000 : 0);
        return timeA - timeB;
    });

    series.setData(chartDataWithMarkers.length > 0 ? chartDataWithMarkers : []);
    if(chartDataWithMarkers.length === 0) {
        setError("No valid data to display on the chart.");
    }

    if (onTrendPointsDetected && trendPointsForCallback.length > 0) {
      onTrendPointsDetected(trendPointsForCallback);
    }

    const clickHandler = (param: any) => {
      if (!trainingMode || !param.point || !param.time) {
        // param.point gives {x, y} coordinates
        // param.time gives the time of the point on the time scale
        // param.logical gives the logical index from the left of the chart
        // param.seriesData is a map of series to their data points at that time.
        if (trainingMode && !param.time) {
          console.log("Chart clicked, but no specific bar identified by Lightweight Charts.");
        }
        return;
      }

      // param.time is a UTCTimestamp (seconds) or a business day string (YYYY-MM-DD)
      // We need to find the corresponding bar in our original `processedData`
      let clickedBarIndex = -1;
      let clickedBarData: OhlcBarWithTrends | null = null;
      let originalTimestampValue: number | null = null;

      if (typeof param.time === 'string') { // Daily/Weekly/Monthly
        const clickedDateStr = param.time;
        clickedBarIndex = processedData.findIndex(b => normalizeDateForDaily(b.timestamp) === clickedDateStr);
      } else { // Intraday (UTCTimestamp in seconds)
        const clickedTimeSeconds = param.time;
        clickedBarIndex = processedData.findIndex(b => {
          const barTime = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
          return Math.floor(barTime.getTime() / 1000) === clickedTimeSeconds;
        });
      }

      if (clickedBarIndex !== -1) {
        clickedBarData = processedData[clickedBarIndex];
        originalTimestampValue = (clickedBarData.timestamp instanceof Date ? clickedBarData.timestamp : new Date(clickedBarData.timestamp)).getTime();
        
        setSelectedCandle({
          index: clickedBarIndex,
          timestamp: originalTimestampValue, // Use original JS timestamp for consistency
          bar: clickedBarData,
          // Add LWC specific info if needed, e.g., param.logical
        });
        setDebugInfo(`Selected: ${formatTimestampToEastern(originalTimestampValue)}`);

        // Highlight selected candle - LWC doesn't have direct "highlight annotation" like SciChart.
        // We can re-set markers or use price lines. For now, selection is managed in the table.
        // A more visual way would be to draw a temporary price line or a custom HTML marker.

      } else {
        console.warn("Could not map click time to data point:", param.time);
        setDebugInfo("Could not map click to data.");
        setSelectedCandle(null);
      }
    };

    let currentClickHandler = clickHandler;
    if (trainingMode) {
      chart.subscribeClick(currentClickHandler);
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartApiRef.current) {
        chartApiRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    
    setIsLoading(false);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartApiRef.current && currentClickHandler) {
        chartApiRef.current.unsubscribeClick(currentClickHandler);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedData, height, trainingMode, timeframe, onTrendPointsDetected, formatTimestampToEastern, isDailyTimeframe]);


  // Effect for full chart cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartApiRef.current) {
        console.log("Removing Lightweight Chart on unmount.");
        chartApiRef.current.remove();
        chartApiRef.current = null;
        seriesApiRef.current = null;
      }
    };
  }, []);

  
  // Function to confirm trend for selected candle
  const confirmTrendPoint = async (trendType: string) => {
    if (!selectedCandle || !onTrendConfirmed) {
      console.error("Cannot confirm trend: no candle selected or no callback provided");
      setError(!selectedCandle ? "No candle selected" : "Confirmation callback not provided");
      return;
    }
    
    setIsUpdating(true);
    try {
      const trendPoint = {
        timestamp: selectedCandle.timestamp, // This is already a JS ms timestamp
        price: trendType.includes('uptrend') || trendType === 'unbrokenUptrendStart' ? 
          selectedCandle.bar.low : 
          selectedCandle.bar.high,
        type: trendType,
        index: selectedCandle.index,
        timeframe: timeframe // Pass current chart timeframe
      };
      
      console.log(`Confirming trend point for LWC:`, trendPoint);
        await onTrendConfirmed(trendPoint);
      setSelectedCandle(null); // Reset selection
        setError(null);
      // Optionally trigger a re-fetch or data update if confirmation changes underlying data
    } catch (err) {
      console.error("Error confirming trend point:", err);
      setError(`Failed to confirm trend: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Render training UI overlay
  const renderTrainingControls = (): ReactNode => {
    if (!enableTraining) return null;
    // Placeholder for actual TrainingControls implementation
    // This should ideally use the selectedCandle state to display info and buttons
    return (
      <div className="training-controls-placeholder">
        <h3>Trend Training Controls (Placeholder)</h3>
            {selectedCandle ? (
          <div>
            <p>Selected: Index {selectedCandle.index}, Time: {formatTimestampToEastern(selectedCandle.timestamp)}</p>
            <p>O: {selectedCandle.bar.open.toFixed(2)} H: {selectedCandle.bar.high.toFixed(2)} L: {selectedCandle.bar.low.toFixed(2)} C: {selectedCandle.bar.close.toFixed(2)}</p>
            {/* Add buttons for confirming trend types */}
            <button onClick={() => confirmTrendPoint('uptrendStart')} disabled={isUpdating}>Mark Uptrend Start</button>
            {/* ... other buttons ... */}
              </div>
            ) : (
          <p>Click on a candle in the chart to select it for training.</p>
        )}
        {isUpdating && <p>Updating...</p>}
      </div>
    );
  };
  
  return (
    <div className="space-y-4">
      {renderTrainingControls()}
      
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
          ref={chartContainerRef}
          style={{ width: "100%", height: `${height}px` }}
          className="bg-gray-900"
          // Removed direct onClick from here as LWC handles its own click events
        />
        
        {/* Visual indicator of click position for debugging - LWC click provides data directly */}
        {/* {trainingMode && clickPosition && ( ... )} */}
        
        {/* Debug info overlay */}
        {trainingMode && (
          <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-2 rounded text-xs z-40 max-w-xs max-h-32 overflow-auto">
            <div>Training active: {trainingMode ? "YES" : "NO"}</div>
            <div>Selected candle: {selectedCandle ? `Idx ${selectedCandle.index}, ${formatTimestampToEastern(selectedCandle.timestamp)}` : "None"}</div>
            <div className="text-xs text-gray-400 whitespace-pre-line">{debugInfo}</div>
          </div>
        )}
      </div>
      
      {renderTrainingTable()}
      
      {/* Tooltip styling is generally handled by LWC's default, or custom HTML tooltips via API */}
      {/* Removed <style> block for SciChart tooltips */}
      
      <div className="text-sm text-center text-gray-500">
        <p>Drag to pan • Use mouse wheel to zoom • Double-click to reset view • Hover for details</p>
        {processedData && processedData.length > 0 ? (
          <>
            <p className="text-xs mt-1">Showing {processedData.length} bars</p>
            {/* Lightweight Charts handles time scale display, so remove "with compressed time" etc. unless we add custom logic for it */}
          </>
        ) : (
          <p className="text-xs mt-1 text-red-500">No data available</p>
        )}
      </div>
    </div>
  );
};

export default TrendChart; 
