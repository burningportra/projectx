'use client';

import React, { useState, useEffect, useRef, useId, useCallback, FC, ReactNode } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, SeriesMarker, Time, LineStyle, CrosshairMode, SeriesType, CandlestickSeries, LineSeries } from 'lightweight-charts';

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
  // Note: uptrendStart and downtrendStart can coexist on the same candle
  // This represents a "dual trend" scenario where price action shows characteristics of both trend types
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
  /**
   * If true, show all data regardless of contractId (do not filter/deduplicate by contract)
   */
  showAllContracts?: boolean;
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
const DUAL_TREND_COLOR = "#9333ea"; // Purple for candles with both up and down trends

// Add an interface for our custom marker data
interface MarkerData {
  time: Time;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text?: string;
  size?: number;
}

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

// Custom markers configuration
const TREND_MARKERS = {
  uptrendStart: {
    shape: 'arrowUp' as const,
    color: UPTREND_START_COLOR,
    position: 'belowBar' as const,
    text: '▲Up',
  },
  downtrendStart: {
    shape: 'arrowDown' as const,
    color: DOWNTREND_START_COLOR,
    position: 'aboveBar' as const,
    text: '▼Down',
  },
  dualTrend: {
    shape: 'circle' as const,
    color: DUAL_TREND_COLOR,
    position: 'inBar' as const,
    text: '◆Dual',
  },
  highestDowntrendStart: {
    shape: 'square' as const,
    color: HIGHEST_DOWNTREND_COLOR,
    position: 'aboveBar' as const,
    text: '■High',
  },
  unbrokenUptrendStart: {
    shape: 'circle' as const,
    color: UNBROKEN_UPTREND_COLOR,
    position: 'belowBar' as const,
    text: '●Unbrk',
  },
  uptrendToHigh: {
    shape: 'square' as const,
    color: KEY_LEVEL_COLOR,
    position: 'aboveBar' as const,
    text: '■UpH',
  },
};

// Placeholder for TrendTrainingTable - replace with actual implementation
const TrendTrainingTable: FC<TrendTrainingTableProps> = React.memo((props) => {
  const {
    data, 
    selectedCandle, 
    setSelectedCandle,
    onConfirmTrend,
    onRemoveTrend,
    timeframe,
    isUpdating,
    formatTimestampToEastern,
  } = props;

  // Filter data to only show bars with trend indicators
  const trendBars = React.useMemo(() => {
    return data.filter(bar => 
      bar.uptrendStart || 
      bar.downtrendStart || 
      bar.highestDowntrendStart || 
      bar.unbrokenUptrendStart || 
      bar.uptrendToHigh
    );
  }, [data]);

  // Handle clicking on a trend bar in the table
  const handleSelectTrendBar = (bar: OhlcBarWithTrends, index: number) => {
    const timestamp = bar.timestamp instanceof Date 
      ? bar.timestamp.getTime() 
      : new Date(bar.timestamp).getTime();
      
    setSelectedCandle({
      index,
      timestamp,
      bar
    });
  };

  return (
    <div className="trend-training-table mt-4 overflow-hidden">
      <h3 className="text-lg font-medium mb-2">Trend Training</h3>
      {selectedCandle && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-medium mb-1">Selected Candle</h4>
          <div className="text-xs space-y-1">
            <div>Time: {formatTimestampToEastern(selectedCandle.timestamp)}</div>
            <div className="font-mono">
              O: {selectedCandle.bar.open.toFixed(2)} H: {selectedCandle.bar.high.toFixed(2)} L: {selectedCandle.bar.low.toFixed(2)} C: {selectedCandle.bar.close.toFixed(2)}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => onConfirmTrend('uptrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
              >
                Mark Uptrend Start
              </button>
              <button
                onClick={() => onConfirmTrend('downtrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded disabled:opacity-50"
              >
                Mark Downtrend Start
              </button>
              <button
                onClick={() => onConfirmTrend('highestDowntrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
              >
                Mark Highest Downtrend
              </button>
              <button
                onClick={() => onConfirmTrend('unbrokenUptrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-green-800 hover:bg-green-900 text-white rounded disabled:opacity-50"
              >
                Mark Unbroken Uptrend
              </button>
            </div>
          </div>
        </div>
      )}
      
      {trendBars.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="text-left p-2">Time</th>
                <th className="text-right p-2">Price</th>
                <th className="text-left p-2">Trend Type</th>
                <th className="text-center p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trendBars.map((bar, idx) => {
                const timestamp = bar.timestamp instanceof Date 
                  ? bar.timestamp.getTime() 
                  : new Date(bar.timestamp).getTime();
                
                // Find index in original data array
                const originalIndex = data.findIndex(d => {
                  const dTime = d.timestamp instanceof Date 
                    ? d.timestamp.getTime() 
                    : new Date(d.timestamp).getTime();
                  return dTime === timestamp;
                });
                
                return (
                  <tr 
                    key={`${timestamp}-${idx}`}
                    className={`border-b border-gray-200 dark:border-gray-700 cursor-pointer 
                      hover:bg-gray-100 dark:hover:bg-gray-700 
                      ${selectedCandle && selectedCandle.timestamp === timestamp ? 
                        'bg-blue-100 dark:bg-blue-800/30' : ''}`}
                    onClick={() => handleSelectTrendBar(bar, originalIndex)}
                  >
                    <td className="p-2">{formatTimestampToEastern(timestamp)}</td>
                    <td className="p-2 text-right font-mono">
                      {bar.open.toFixed(2)} → {bar.close.toFixed(2)}
                    </td>
                    <td className="p-2">
                      {bar.uptrendStart && bar.downtrendStart && <span className="inline-block mr-1 text-purple-500">◆Dual</span>}
                      {bar.uptrendStart && <span className="inline-block mr-1 text-green-600">▲Up</span>}
                      {bar.downtrendStart && <span className="inline-block mr-1 text-orange-500">▼Down</span>}
                      {bar.highestDowntrendStart && <span className="inline-block mr-1 text-red-500">■High</span>}
                      {bar.unbrokenUptrendStart && <span className="inline-block mr-1 text-green-700">●Unbroken</span>}
                      {bar.uptrendToHigh && <span className="inline-block mr-1 text-blue-500">■UpH</span>}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex justify-center gap-1">
                        {bar.uptrendStart && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTrend(bar, 'uptrendStart');
                            }}
                            disabled={isUpdating}
                            className="px-1 py-0.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded disabled:opacity-50"
                          >
                            ✕ Up
                          </button>
                        )}
                        {bar.downtrendStart && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTrend(bar, 'downtrendStart');
                            }}
                            disabled={isUpdating}
                            className="px-1 py-0.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded disabled:opacity-50"
                          >
                            ✕ Down
                          </button>
                        )}
                        {bar.highestDowntrendStart && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTrend(bar, 'highestDowntrendStart');
                            }}
                            disabled={isUpdating}
                            className="px-1 py-0.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded disabled:opacity-50"
                          >
                            ✕ High
                          </button>
                        )}
                        {bar.unbrokenUptrendStart && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTrend(bar, 'unbrokenUptrendStart');
                            }}
                            disabled={isUpdating}
                            className="px-1 py-0.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded disabled:opacity-50"
                          >
                            ✕ Unbroken
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500 border border-gray-200 dark:border-gray-700 rounded">
          No trend indicators found. Click on candles in the chart to mark trend points.
        </div>
      )}
    </div>
  );
});

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
  timeframes = ["1m", "5m", "15m", "1h", "1d"],
  showAllContracts = false
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
  
  // Add a ref to track marker series for cleanup
  const markerSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  
  // Update training mode when prop changes
  useEffect(() => {
    setTrainingMode(enableTraining);
  }, [enableTraining]);

  // Deduplicate data based on timeframe - memoized to prevent recalculation on every render
  const isDailyTimeframe = timeframe.endsWith("d") || timeframe.endsWith("w") || timeframe.endsWith("M");
  const processedData = React.useMemo(() => {
    if (showAllContracts) return data;
    return deduplicateOhlcData(data, isDailyTimeframe);
  }, [data, isDailyTimeframe, showAllContracts]);
  
  // Memoize formatting functions to prevent unnecessary rerenders
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
  
  // Also memoize the debug timestamp function
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

  // Function to confirm trend for selected candle
  const confirmTrendPoint = useCallback(async (trendType: string) => {
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
  }, [selectedCandle, onTrendConfirmed, timeframe]);
  
  // Function to handle removing a trend indicator
  const removeTrendPoint = useCallback(async (bar: OhlcBarWithTrends, trendType: string) => {
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
  }, [onTrendRemoved, processedData, formatTimestampToEastern, timeframe]);

  const renderTrainingTable = useCallback(() => {
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
  }, [enableTraining, processedData, selectedCandle, confirmTrendPoint, 
      removeTrendPoint, timeframe, timeframes, isUpdating, 
      formatTimestampToEastern, debugTimestamp]);

  // Update loading state when data changes
  useEffect(() => {
    if (data.length === 0) {
      setIsLoading(true);
    }
  }, [data]);

  // Effect for initializing and updating the chart
  useEffect(() => {
    if (!chartContainerRef.current || processedData.length === 0) {
      if (processedData.length === 0 && data.length > 0) {
        setIsLoading(true);
      }
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

    // Create a cleanup flag to prevent state updates after unmounting
    let isComponentMounted = true;

    const initializeChart = () => {
      if (!isComponentMounted) return;
      
      // Set loading state at the beginning
      setIsLoading(true);
      setError(null);
      
      try {
        if (!chartContainerRef.current) return;

        // Initialize or update chart instance
        if (!chartApiRef.current) {
          const chart = createChart(chartContainerRef.current, {
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
          chartApiRef.current = chart;
          
          try {
            // Add candlestick series using the correct API for lightweight-charts v5.x
            const candleSeries = chart.addSeries(CandlestickSeries, {
              upColor: BULLISH_COLOR,
              downColor: BEARISH_COLOR,
              borderVisible: true,
              borderUpColor: BULLISH_COLOR,
              borderDownColor: BEARISH_COLOR,
              wickUpColor: BULLISH_COLOR,
              wickDownColor: BEARISH_COLOR,
            });
            
            seriesApiRef.current = candleSeries;
          } catch (seriesError) {
            console.error("Error creating candlestick series:", seriesError);
            if (isComponentMounted) {
              setError(`Failed to create chart series: ${seriesError instanceof Error ? seriesError.message : String(seriesError)}`);
              setIsLoading(false);
            }
            return;
          }
        } else {
          chartApiRef.current.applyOptions({ 
            width: chartContainerRef.current.clientWidth, 
            height 
          });
        }

        const chart = chartApiRef.current;
        const series = seriesApiRef.current;
        
        if (!series) {
          console.error("Series API reference is null after initialization attempt.");
          if (isComponentMounted) {
            setError("Failed to initialize chart series.");
            setIsLoading(false);
          }
          return;
        }
        
        // Create a local variable to collect trend points, but don't update state yet
        const localTrendPoints: {timestamp: number; price: number; type: string; index: number}[] = [];
        
        const chartDataWithMarkers: CandlestickData[] = processedData.map((bar, index) => {
          const timestamp = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
          let timeValue: Time;
          if (isDailyTimeframe) {
            timeValue = normalizeDateForDaily(timestamp) as Time;
          } else {
            timeValue = (timestamp.getTime() / 1000) as UTCTimestamp;
          }
          
          // Define markers array and custom bar styling
          const markers: SeriesMarker<Time>[] = [];
          let customBarColor: string | undefined = undefined;
          let customWickColor: string | undefined = undefined;
          let customBorderColor: string | undefined = undefined;
          
          // First check for dual trend (both up and down)
          if (bar.uptrendStart && bar.downtrendStart) {
            // Special case: Dual trend (both up and down)
            const marker = TREND_MARKERS.dualTrend;
            markers.push({
              time: timeValue,
              position: marker.position,
              color: marker.color,
              shape: marker.shape,
              text: marker.text,
            });
            
            localTrendPoints.push({
              timestamp: timestamp.getTime(),
              price: (bar.high + bar.low) / 2, // Middle price point
              type: 'dualTrend',
              index
            });
            
            // Set custom bar colors for this dual trend type
            customBarColor = DUAL_TREND_COLOR;
            customWickColor = DUAL_TREND_COLOR;
            customBorderColor = DUAL_TREND_COLOR;
          } 
          // Then handle individual trend types
          else {
            if (bar.uptrendStart) {
              const marker = TREND_MARKERS.uptrendStart;
              markers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
              
              // Add this trend point to our collection for callback
              localTrendPoints.push({
                timestamp: timestamp.getTime(),
                price: bar.low,
                type: 'uptrendStart',
                index
              });
              
              // Set custom bar colors for this trend type
              customBarColor = UPTREND_START_COLOR;
              customWickColor = UPTREND_START_COLOR;
              customBorderColor = UPTREND_START_COLOR;
            }
            
            if (bar.downtrendStart) {
              const marker = TREND_MARKERS.downtrendStart;
              markers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
              
              localTrendPoints.push({
                timestamp: timestamp.getTime(),
                price: bar.high,
                type: 'downtrendStart',
                index
              });
              
              // Set custom bar colors for this trend type if not already set by uptrendStart
              if (!customBarColor) {
                customBarColor = DOWNTREND_START_COLOR;
                customWickColor = DOWNTREND_START_COLOR;
                customBorderColor = DOWNTREND_START_COLOR;
              }
            }
          }
          
          if (bar.highestDowntrendStart) {
            const marker = TREND_MARKERS.highestDowntrendStart;
            markers.push({
              time: timeValue,
              position: marker.position,
              color: marker.color,
              shape: marker.shape,
              text: marker.text,
            });
            
            localTrendPoints.push({
              timestamp: timestamp.getTime(),
              price: bar.high,
              type: 'highestDowntrendStart',
              index
            });
            
            // Set custom bar colors for this trend type
            customBarColor = HIGHEST_DOWNTREND_COLOR;
            customWickColor = HIGHEST_DOWNTREND_COLOR;
            customBorderColor = HIGHEST_DOWNTREND_COLOR;
          }
          
          if (bar.unbrokenUptrendStart) {
            const marker = TREND_MARKERS.unbrokenUptrendStart;
            markers.push({
              time: timeValue,
              position: marker.position,
              color: marker.color,
              shape: marker.shape,
              text: marker.text,
            });
            
            localTrendPoints.push({
              timestamp: timestamp.getTime(),
              price: bar.low,
              type: 'unbrokenUptrendStart',
              index
            });
            
            // Set custom bar colors for this trend type
            customBarColor = UNBROKEN_UPTREND_COLOR;
            customWickColor = UNBROKEN_UPTREND_COLOR;
            customBorderColor = UNBROKEN_UPTREND_COLOR;
          }
          
          if (bar.uptrendToHigh) {
            const marker = TREND_MARKERS.uptrendToHigh;
            markers.push({
              time: timeValue,
              position: marker.position,
              color: marker.color,
              shape: marker.shape,
              text: marker.text,
            });
            
            localTrendPoints.push({
              timestamp: timestamp.getTime(),
              price: bar.high,
              type: 'uptrendToHigh',
              index
            });
            
            // Set custom bar colors for this trend type
            customBarColor = KEY_LEVEL_COLOR;
            customWickColor = KEY_LEVEL_COLOR;
            customBorderColor = KEY_LEVEL_COLOR;
          }

          // Create the bar data with potential custom styling
          const barData: CandlestickData = {
            time: timeValue,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close
          };

          // Add custom styling if this is a trend bar
          if (customBarColor) {
            // @ts-ignore - Add custom properties for bar coloring
            barData.color = customBarColor;
            // @ts-ignore
            barData.wickColor = customWickColor;
            // @ts-ignore
            barData.borderColor = customBorderColor;
          }
          
          // Instead of attaching markers to bar data, collect them for the series
          return barData;
        }).sort((a, b) => {
          const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : (typeof a.time === 'number' ? a.time * 1000 : 0);
          const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : (typeof b.time === 'number' ? b.time * 1000 : 0);
          return timeA - timeB;
        });

        // Define the resize handler
        const handleResize = () => {
          if (chartContainerRef.current && chartApiRef.current) {
            chartApiRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        };
        window.addEventListener('resize', handleResize);

        // Update series data
        try {
          series.setData(chartDataWithMarkers.length > 0 ? chartDataWithMarkers : []);
          
          // Clean up previous markers if they exist
          if (markerSeriesRefs.current.length > 0 && chartApiRef.current) {
            console.log(`Cleaning up ${markerSeriesRefs.current.length} previous markers`);
            markerSeriesRefs.current.forEach(markerSeries => {
              try {
                chartApiRef.current?.removeSeries(markerSeries);
              } catch (e) {
                console.warn("Error removing marker series:", e);
              }
            });
            markerSeriesRefs.current = [];
          }
          
          // Collect all markers from all bars
          const allMarkers: SeriesMarker<Time>[] = [];
          processedData.forEach((bar, index) => {
            const timestamp = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
            let timeValue: Time;
            if (isDailyTimeframe) {
              timeValue = normalizeDateForDaily(timestamp) as Time;
            } else {
              timeValue = (timestamp.getTime() / 1000) as UTCTimestamp;
            }
            
            if (bar.uptrendStart) {
              const marker = TREND_MARKERS.uptrendStart;
              allMarkers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
            }
            
            if (bar.downtrendStart) {
              const marker = TREND_MARKERS.downtrendStart;
              allMarkers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
            }
            
            if (bar.highestDowntrendStart) {
              const marker = TREND_MARKERS.highestDowntrendStart;
              allMarkers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
            }
            
            if (bar.unbrokenUptrendStart) {
              const marker = TREND_MARKERS.unbrokenUptrendStart;
              allMarkers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
            }
            
            if (bar.uptrendToHigh) {
              const marker = TREND_MARKERS.uptrendToHigh;
              allMarkers.push({
                time: timeValue,
                position: marker.position,
                color: marker.color,
                shape: marker.shape,
                text: marker.text,
              });
            }
          });
          
          // Set markers on the series correctly
          if (allMarkers.length > 0 && chartApiRef.current) {
            console.log(`Setting ${allMarkers.length} markers on chart`);
            
            // For Lightweight Charts v5+, we need a different approach for markers
            // Create a specific marker series
            // Create a marker renderer using a line series with custom markers
            try {
              const chart = chartApiRef.current; // Store reference to avoid null checks
              // Add markers near their respective price points
              allMarkers.forEach(marker => {
                // Find the bar that corresponds to this marker time
                const barForMarker = processedData.find(bar => {
                  const barTime = bar.timestamp instanceof Date ? 
                    bar.timestamp : new Date(bar.timestamp);
                  let barTimeValue;
                  if (isDailyTimeframe) {
                    barTimeValue = normalizeDateForDaily(barTime) as Time;
                  } else {
                    barTimeValue = (barTime.getTime() / 1000) as UTCTimestamp;
                  }
                  return barTimeValue === marker.time;
                });
                
                if (barForMarker) {
                  // Create a point series for the marker - use standard options only
                  const markerSeries = chart.addSeries(LineSeries, {
                    color: marker.color,
                    lastValueVisible: false,
                    priceLineVisible: false,
                    lineVisible: false,
                    // Add internal name for debugging and series management
                    title: `${marker.text}-${new Date(barForMarker.timestamp).toISOString().split('T')[0]}`,
                    // Use dot-style markers which are supported in all LWC versions
                    pointMarkersVisible: true,
                    pointMarkersRadius: 5,
                  });
                  
                  // Save reference for cleanup
                  markerSeriesRefs.current.push(markerSeries);
                  
                  // Add a single point with a custom marker - directly on the bar
                  // Get the appropriate price point based on marker type
                  let markerPrice: number;
                  if (marker.position === 'aboveBar') {
                    markerPrice = barForMarker.high; // Exact high price of the bar
                  } else if (marker.position === 'belowBar') {
                    markerPrice = barForMarker.low; // Exact low price of the bar
                  } else {
                    // For other positions, use close price
                    markerPrice = barForMarker.close;
                  }
                  
                  // Create marker data with appropriate shape
                  markerSeries.setData([
                    {
                      time: marker.time,
                      value: markerPrice,
                    }
                  ]);
                  
                  // Log marker creation for debugging
                  console.log(`Created marker: ${marker.text} at ${new Date(barForMarker.timestamp).toLocaleDateString()} Price: ${markerPrice}`);
                  
           

                  // Create a second marker series with a different visualization
                  // This gives us different visual elements at the same point
                  try {
                    // Create a constant line series for visual effect
                    const highlightSeries = chart.addSeries(LineSeries, {
                      color: 'rgba(255, 255, 255, 0.5)', // Semi-transparent white
                      lineVisible: false,
                      lastValueVisible: false,
                      priceLineVisible: false,
                      // Better visual dots (fallback for older LWC versions)
                      pointMarkersVisible: true,
                      pointMarkersRadius: 3,
                      title: `highlight-${marker.text}`,
                    });
                    
                    // Add to tracked series for cleanup
                    markerSeriesRefs.current.push(highlightSeries);
                    
                    // Add the highlight point
                    highlightSeries.setData([{
                      time: marker.time,
                      value: markerPrice,
                    }]);
                  } catch (highlightErr) {
                    console.warn("Could not create highlight marker:", highlightErr);
                  }
                }
              });
            } catch (markerError) {
              console.error("Error setting up markers:", markerError);
            }
          }
        } catch (dataError) {
          console.error("Error setting chart data:", dataError);
          if (isComponentMounted) {
            setError(`Failed to set chart data: ${dataError instanceof Error ? dataError.message : String(dataError)}`);
          }
        }
        
        if (chartDataWithMarkers.length === 0) {
          if (isComponentMounted) {
            setError("No valid data to display on the chart.");
          }
        }
        
        // Set loading to false once the chart is fully initialized
        if (isComponentMounted) {
          setIsLoading(false);
        }
        
        // Setup event handlers if needed
        if (isComponentMounted && trainingMode) {
          const clickHandler = (param: any) => {
            if (!trainingMode || !param.point || !param.time) {
              if (trainingMode && !param.time) {
                console.log("Chart clicked, but no specific bar identified by Lightweight Charts.");
              }
              return;
            }
            
            // Find the clicked bar
            let clickedBarIndex = -1;
            let clickedBarData: OhlcBarWithTrends | null = null;
            let originalTimestampValue: number | null = null;
            
            try {
              if (typeof param.time === 'string') {
                // Daily timeframes (YYYY-MM-DD format)
                const clickedDateStr = param.time;
                clickedBarIndex = processedData.findIndex(b => normalizeDateForDaily(b.timestamp) === clickedDateStr);
              } else {
                // Intraday timeframes (seconds timestamp)
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
                  timestamp: originalTimestampValue,
                  bar: clickedBarData
                });
                setDebugInfo(`Selected: ${formatTimestampToEastern(originalTimestampValue)}`);
              } else {
                console.warn("Could not map click time to data point:", param.time);
                setDebugInfo("Could not map click to data.");
                setSelectedCandle(null);
              }
            } catch (clickError) {
              console.error("Error handling chart click:", clickError);
            }
          };
          
          chart.subscribeClick(clickHandler);
          
          // Store the click handler reference for cleanup
          const currentClickHandler = clickHandler; 
          
          // Use a delayed callback for trend points to avoid render loop issues
          if (onTrendPointsDetected && localTrendPoints.length > 0) {
            const pointsToSend = [...localTrendPoints];
            setTimeout(() => {
              if (isComponentMounted && onTrendPointsDetected) {
                onTrendPointsDetected(pointsToSend);
              }
            }, 0);
          }
        }
        
        return () => {
          window.removeEventListener('resize', handleResize);
          // Any other cleanup needed
        };
      } catch (err) {
        console.error("Error initializing chart:", err);
        if (isComponentMounted) {
          setError(`Chart initialization failed: ${err instanceof Error ? err.message : String(err)}`);
          setIsLoading(false);
        }
      }
    };
    
    // Call initialize function with a short delay to avoid render issues
    const initTimeout = setTimeout(initializeChart, 0);
    
    // Cleanup function
    return () => {
      isComponentMounted = false;
      clearTimeout(initTimeout);
    };
  }, [processedData, height, trainingMode, timeframe, isDailyTimeframe]);

  // Whenever onTrendPointsDetected changes (like on first mount), avoid re-rendering chart
  useEffect(() => {
    // This is intentionally empty to capture onTrendPointsDetected changes
    // without triggering chart reinitialization
  }, [onTrendPointsDetected]);

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

  
  // Render training UI overlay
  const renderTrainingControls = useCallback((): ReactNode => {
    if (!enableTraining) return null;
    
    return (
      <div className="training-controls p-2 bg-gray-100 dark:bg-gray-800 rounded">
        <h3 className="text-sm font-medium mb-2">Trend Training Controls</h3>
        {selectedCandle ? (
          <div className="space-y-2">
            <p className="text-xs">Selected: Index {selectedCandle.index}, Time: {formatTimestampToEastern(selectedCandle.timestamp)}</p>
            <p className="text-xs">O: {selectedCandle.bar.open.toFixed(2)} H: {selectedCandle.bar.high.toFixed(2)} L: {selectedCandle.bar.low.toFixed(2)} C: {selectedCandle.bar.close.toFixed(2)}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <button 
                onClick={() => confirmTrendPoint('uptrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
              >
                Mark Uptrend Start
              </button>
              <button 
                onClick={() => confirmTrendPoint('downtrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded disabled:opacity-50"
              >
                Mark Downtrend Start
              </button>
              <button 
                onClick={() => confirmTrendPoint('highestDowntrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
              >
                Mark Highest Downtrend
              </button>
              <button 
                onClick={() => confirmTrendPoint('unbrokenUptrendStart')}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-green-800 hover:bg-green-900 text-white rounded disabled:opacity-50"
              >
                Mark Unbroken Uptrend
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs">Click on a candle in the chart to select it for training.</p>
        )}
        {isUpdating && <p className="text-xs mt-2 text-blue-500">Updating...</p>}
      </div>
    );
  }, [enableTraining, selectedCandle, isUpdating, formatTimestampToEastern, confirmTrendPoint]);
  
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
        />
        
        {/* Training mode debug overlay */}
        {trainingMode && (
          <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-2 rounded text-xs z-40 max-w-xs max-h-32 overflow-auto">
            <div>Training active: {trainingMode ? "YES" : "NO"}</div>
            <div>Selected candle: {selectedCandle ? `Idx ${selectedCandle.index}, ${formatTimestampToEastern(selectedCandle.timestamp)}` : "None"}</div>
            <div className="text-xs text-gray-400 whitespace-pre-line">{debugInfo}</div>
          </div>
        )}
      </div>
      
      {renderTrainingTable()}
      
      <div className="text-sm text-center text-gray-500">
        <p>Drag to pan • Use mouse wheel to zoom • Double-click to reset view • Hover for details</p>
        {processedData && processedData.length > 0 ? (
          <p className="text-xs mt-1">Showing {processedData.length} bars</p>
        ) : (
          <p className="text-xs mt-1 text-red-500">No data available</p>
        )}
      </div>
    </div>
  );
};

export default TrendChart; 
