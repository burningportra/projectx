'use client';

import React, { useState, useEffect, useRef, useId } from "react";

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
  removeGaps?: boolean;
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
const CHART_BACKGROUND = "#131722";

// Trend marker colors
const UPTREND_START_COLOR = "#22c55e"; // Green
const DOWNTREND_START_COLOR = "#f97316"; // Orange
const HIGHEST_DOWNTREND_COLOR = "#ef4444"; // Red
const UNBROKEN_UPTREND_COLOR = "#16a34a"; // Dark green
const KEY_LEVEL_COLOR = "#3b82f6"; // Blue

// Helper function to convert UTC to Eastern Time (EST/EDT)
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

// Instead of creating sequential timestamps with equally spaced bars, 
// this function removes large gaps by adjusting timestamps so they appear consecutive
// without creating artificial data
const compressTimeGaps = (timestamps: number[], opens: number[], highs: number[], 
                        lows: number[], closes: number[]): {
  compressedTimestamps: number[],
  compressedOpens: number[],
  compressedHighs: number[],
  compressedLows: number[],
  compressedCloses: number[]
} => {
  // Log the original data
  console.log("Original data points:", timestamps.length);
  if (timestamps.length > 0) {
    console.log("First timestamp:", new Date(timestamps[0]).toISOString());
    console.log("Last timestamp:", new Date(timestamps[timestamps.length-1]).toISOString());
  }
  
  // If there are no data points or only one, return them as is
  if (timestamps.length <= 1) {
    return {
      compressedTimestamps: [...timestamps],
      compressedOpens: [...opens],
      compressedHighs: [...highs],
      compressedLows: [...lows],
      compressedCloses: [...closes]
    };
  }
  
  // First, identify all large time gaps (potential weekends/holidays)
  const timeGaps: {startIndex: number, endIndex: number, gapSize: number}[] = [];
  let totalGapTime = 0;
  
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i-1];
    const gapHours = gap / (3600 * 1000);
    
    // Consider gaps larger than 8 hours as non-trading periods
    if (gapHours > 8) {
      timeGaps.push({
        startIndex: i-1,
        endIndex: i,
        gapSize: gap
      });
      totalGapTime += gap;
      
      console.log(`Found large gap (${gapHours.toFixed(1)} hours) between:`);
      console.log(`  ${new Date(timestamps[i-1]).toISOString()} and`);
      console.log(`  ${new Date(timestamps[i]).toISOString()}`);
    }
  }
  
  console.log(`Found ${timeGaps.length} large gaps totaling ${(totalGapTime/(3600*1000)).toFixed(1)} hours`);
  
  // If no large gaps were found, return the original data
  if (timeGaps.length === 0) {
    return {
      compressedTimestamps: [...timestamps],
      compressedOpens: [...opens],
      compressedHighs: [...highs], 
      compressedLows: [...lows],
      compressedCloses: [...closes]
    };
  }
  
  // Create new compressed arrays
  const compressedTimestamps: number[] = [];
  const compressedOpens: number[] = [];
  const compressedHighs: number[] = [];
  const compressedLows: number[] = [];
  const compressedCloses: number[] = [];
  
  // Include the first data point
  compressedTimestamps.push(timestamps[0]);
  compressedOpens.push(opens[0]);
  compressedHighs.push(highs[0]);
  compressedLows.push(lows[0]);
  compressedCloses.push(closes[0]);
  
  // Get the median time between bars in normal trading (excluding large gaps)
  const normalGaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i-1];
    if (gap > 0 && gap < 8 * 3600 * 1000) { // Only normal trading gaps
      normalGaps.push(gap);
    }
  }
  
  let typicalGap = 300000; // Default: 5 minutes
  if (normalGaps.length > 0) {
    normalGaps.sort((a, b) => a - b);
    typicalGap = normalGaps[Math.floor(normalGaps.length / 2)]; // Median
  }
  
  console.log(`Typical time between bars during trading: ${(typicalGap/60000).toFixed(1)} minutes`);
  
  // Keep track of the offset to apply
  let cumulativeOffset = 0;
  
  // Process each point, compressing the large gaps
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i-1];
    const largeGapEntry = timeGaps.find(g => g.endIndex === i);
    
    if (largeGapEntry) {
      // This point comes after a large gap, adjust its timestamp
      // Leave just a typical gap instead of the large one
      const compressionAmount = gap - typicalGap;
      cumulativeOffset += compressionAmount;
      
      console.log(`Compressing gap at index ${i} by ${(compressionAmount/3600000).toFixed(1)} hours`);
    }
    
    // Adjust the timestamp by removing the cumulative offset
    const adjustedTimestamp = timestamps[i] - cumulativeOffset;
    
    // Add the adjusted point
    compressedTimestamps.push(adjustedTimestamp);
    compressedOpens.push(opens[i]);
    compressedHighs.push(highs[i]);
    compressedLows.push(lows[i]);
    compressedCloses.push(closes[i]);
  }
  
  // Log the results
  if (compressedTimestamps.length > 0) {
    console.log("Compressed time range:");
    console.log("  Original: ", 
      new Date(Math.min(...timestamps)).toISOString(), 
      "to", 
      new Date(Math.max(...timestamps)).toISOString(),
      `(${(timestamps[timestamps.length-1] - timestamps[0])/(3600*1000)} hours)`
    );
    console.log("  Compressed: ", 
      new Date(Math.min(...compressedTimestamps)).toISOString(), 
      "to", 
      new Date(Math.max(...compressedTimestamps)).toISOString(),
      `(${(compressedTimestamps[compressedTimestamps.length-1] - compressedTimestamps[0])/(3600*1000)} hours)`
    );
  }
  
  return {
    compressedTimestamps,
    compressedOpens,
    compressedHighs,
    compressedLows,
    compressedCloses
  };
};

// TrendTrainingTable component
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

const TrendTrainingTable: React.FC<TrendTrainingTableProps> = ({
  data,
  selectedCandle,
  setSelectedCandle,
  onConfirmTrend,
  onRemoveTrend,
  timeframe,
  timeframes,
  isUpdating,
  formatTimestampToEastern,
  debugTimestamp
}) => {
  const [displayCount, setDisplayCount] = useState(50); // Show 50 bars by default
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest'); 
  const [filterTrendType, setFilterTrendType] = useState<string | null>(null);
  const [searchDate, setSearchDate] = useState<string>('');
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // Check if this is a daily timeframe
  const isDaily = timeframe === "1d" || timeframe === "1w";

  // Get visible data based on filters and limits
  const getVisibleData = () => {
    // Start with all data
    let filteredData = [...data];

    // Debug: Log the original data format for the first few entries
    if (isDaily && filteredData.length > 0) {
      console.log("Daily data format samples:");
      filteredData.slice(0, 5).forEach((bar, idx) => {
        const timestamp = bar.timestamp instanceof Date 
          ? bar.timestamp 
          : new Date(bar.timestamp);
        
        console.log(`Bar ${idx}:`, {
          timestamp: timestamp.toISOString(),
          dateOnly: new Date(timestamp).toLocaleDateString(),
          year: timestamp.getFullYear(),
          month: timestamp.getMonth(),
          day: timestamp.getDate()
        });
      });
    }

    // Debug: Check for duplicates in daily timeframe
    if (isDaily) {
      console.log("Analyzing daily data for duplicates in TrendTrainingTable...");
      
      // Track timestamps we've seen
      const seenTimestamps = new Map<string, number>();
      const duplicates: { index: number; dateKey: string; originalIndex: number; timestamp: string }[] = [];
      
      // Find duplicates based on timestamp dates (ignoring time component for daily)
      filteredData.forEach((bar, index) => {
        const timestamp = bar.timestamp instanceof Date 
          ? bar.timestamp 
          : new Date(bar.timestamp);
        
        // For daily, only consider the date part (year-month-day)
        const dateKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
        
        if (seenTimestamps.has(dateKey)) {
          duplicates.push({
            index,
            dateKey,
            originalIndex: seenTimestamps.get(dateKey)!,
            timestamp: timestamp.toISOString()
          });
        } else {
          seenTimestamps.set(dateKey, index);
        }
      });
      
      if (duplicates.length > 0) {
        console.warn(`Found ${duplicates.length} duplicate daily entries in TrendTrainingTable:`, duplicates.slice(0, 5));
        
        // Filter out duplicates - keep only one entry per date
        const uniqueData: OhlcBarWithTrends[] = [];
        const processedDates = new Set<string>();
        
        filteredData.forEach(bar => {
          const timestamp = bar.timestamp instanceof Date 
            ? bar.timestamp 
            : new Date(bar.timestamp);
          
          const dateKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
          
          if (!processedDates.has(dateKey)) {
            uniqueData.push(bar);
            processedDates.add(dateKey);
          }
        });
        
        console.log(`Removed ${filteredData.length - uniqueData.length} duplicate entries in TrendTrainingTable`);
        filteredData = uniqueData;
      } else {
        console.log("No duplicates found in TrendTrainingTable daily data.");
      }
    }

    // Apply trend type filter if set
    if (filterTrendType) {
      filteredData = filteredData.filter(bar => {
        switch(filterTrendType) {
          case 'any': 
            return bar.uptrendStart || bar.downtrendStart || bar.highestDowntrendStart || 
                  bar.unbrokenUptrendStart || bar.uptrendToHigh;
          case 'uptrendStart': return bar.uptrendStart;
          case 'downtrendStart': return bar.downtrendStart;
          case 'highestDowntrendStart': return bar.highestDowntrendStart;
          case 'unbrokenUptrendStart': return bar.unbrokenUptrendStart;
          case 'uptrendToHigh': return bar.uptrendToHigh;
          default: return true;
        }
      });
    }

    // Apply date search if provided
    if (searchDate) {
      const searchLower = searchDate.toLowerCase();
      filteredData = filteredData.filter(bar => {
        const timestamp = bar.timestamp instanceof Date 
          ? bar.timestamp.getTime() 
          : new Date(bar.timestamp).getTime();
        
        return formatTimestampToEastern(timestamp).toLowerCase().includes(searchLower);
      });
    }

    // Sort the data
    const sortedData = [...filteredData];
    sortedData.sort((a, b) => {
      const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

    // Limit the display count
    return sortedData.slice(0, displayCount);
  };

  const visibleData = getVisibleData();
  const totalBars = data.length;
  const filteredCount = visibleData.length;

  // Get trend count for a specific type
  const getTrendCount = (type: string | null) => {
    if (!type || type === 'any') {
      return data.filter(bar => 
        bar.uptrendStart || bar.downtrendStart || bar.highestDowntrendStart || 
        bar.unbrokenUptrendStart || bar.uptrendToHigh
      ).length;
    }

    return data.filter(bar => {
      switch(type) {
        case 'uptrendStart': return bar.uptrendStart;
        case 'downtrendStart': return bar.downtrendStart;
        case 'highestDowntrendStart': return bar.highestDowntrendStart;
        case 'unbrokenUptrendStart': return bar.unbrokenUptrendStart;
        case 'uptrendToHigh': return bar.uptrendToHigh;
        default: return false;
      }
    }).length;
  };

  // Handle trend action button click
  const handleTrendAction = (bar: OhlcBarWithTrends, action: string, trendType?: string) => {
    const timestamp = bar.timestamp instanceof Date 
      ? bar.timestamp.getTime() 
      : new Date(bar.timestamp).getTime();
    
    if (action === 'select') {
      const barIndex = data.indexOf(bar);
      setSelectedCandle({
        index: barIndex,
        timestamp: timestamp,
        bar: bar
      });
    } else if (action === 'remove' && trendType) {
      onRemoveTrend(bar, trendType);
    }
  };

  // Add debug bar details display
  const renderTimestampDebug = (bar: OhlcBarWithTrends) => {
    if (!showDebugInfo) return null;
    
    const timestamp = bar.timestamp instanceof Date 
      ? bar.timestamp 
      : new Date(bar.timestamp);

    return (
      <div className="text-xs text-gray-500 mt-1 font-mono">
        <div>ISO: {timestamp.toISOString()}</div>
        <div>Local: {timestamp.toLocaleString()}</div>
        <div>Date: {timestamp.getFullYear()}-{timestamp.getMonth()}-{timestamp.getDate()}</div>
        <div>Time: {timestamp.getHours()}:{timestamp.getMinutes().toString().padStart(2, '0')}:{timestamp.getSeconds().toString().padStart(2, '0')}</div>
      </div>
    );
  };

  return (
    <div className="mt-4 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Table header with controls */}
      <div className="p-3 bg-gray-800 border-b border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-medium">Trend Training Data Table</h3>
          
          <div className="flex space-x-2">
            <select 
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            
            <select 
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
              value={displayCount.toString()}
              onChange={(e) => setDisplayCount(Number(e.target.value))}
            >
              <option value="50">Show 50</option>
              <option value="100">Show 100</option>
              <option value="200">Show 200</option>
              <option value="500">Show 500</option>
              <option value="1000">Show 1000</option>
            </select>
          </div>
        </div>
        
        {/* Filter controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          {/* Trend type filter */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Filter by Trend Type</label>
            <select 
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
              value={filterTrendType || ''}
              onChange={(e) => setFilterTrendType(e.target.value || null)}
            >
              <option value="">All Bars</option>
              <option value="any">Any Trend ({getTrendCount('any')})</option>
              <option value="uptrendStart">Uptrend Start ({getTrendCount('uptrendStart')})</option>
              <option value="downtrendStart">Downtrend Start ({getTrendCount('downtrendStart')})</option>
              <option value="highestDowntrendStart">Highest Downtrend ({getTrendCount('highestDowntrendStart')})</option>
              <option value="unbrokenUptrendStart">Unbroken Uptrend ({getTrendCount('unbrokenUptrendStart')})</option>
              <option value="uptrendToHigh">Uptrend to High ({getTrendCount('uptrendToHigh')})</option>
            </select>
          </div>
          
          {/* Date search */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Search by Date</label>
            <input 
              type="text"
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
              placeholder="e.g., '3/15' or '10:30'"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          </div>
          
          {/* Timeframe indicator */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Current Timeframe</label>
            <div className="flex items-center space-x-2">
              <span className="bg-blue-900 px-2 py-1 rounded text-sm text-white font-medium">
                {timeframe}
              </span>
              {isDaily && <span className="text-amber-400 text-xs">1-day correction applied</span>}
              <span className="text-xs text-gray-400">
                {totalBars} total bars • {filteredCount} shown
              </span>
            </div>
          </div>
        </div>
        
        {/* Stats row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
          <div>Total Bars: {totalBars}</div>
          <div>Shown: {filteredCount}</div>
          <div>Trend Points: {getTrendCount('any')}</div>
          <div className="text-green-500">Uptrends: {getTrendCount('uptrendStart')}</div>
          <div className="text-orange-500">Downtrends: {getTrendCount('downtrendStart')}</div>
          <div className="text-red-500">Highest Down: {getTrendCount('highestDowntrendStart')}</div>
          <div className="text-green-700">Unbroken Up: {getTrendCount('unbrokenUptrendStart')}</div>
          <div className="text-blue-500">Uptrend High: {getTrendCount('uptrendToHigh')}</div>
        </div>
      </div>
      
      {/* Table content */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Time (ET)</th>
              <th className="px-3 py-2">Open</th>
              <th className="px-3 py-2">High</th>
              <th className="px-3 py-2">Low</th>
              <th className="px-3 py-2">Close</th>
              <th className="px-3 py-2">Trends</th>
              <th className="px-3 py-2 w-40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {visibleData.map((bar) => {
              const barIndex = data.indexOf(bar);
              const timestamp = bar.timestamp instanceof Date 
                ? bar.timestamp.getTime() 
                : new Date(bar.timestamp).getTime();
              
              const isSelected = selectedCandle && selectedCandle.index === barIndex;
              
              // Check for trend indicators
              const hasTrends = bar.uptrendStart || bar.downtrendStart || 
                              bar.highestDowntrendStart || bar.unbrokenUptrendStart || 
                              bar.uptrendToHigh;
              
              return (
                <tr 
                  key={barIndex} 
                  className={`border-b border-gray-700 ${
                    isSelected 
                      ? 'bg-amber-900 bg-opacity-50' 
                      : hasTrends 
                        ? 'bg-blue-900 bg-opacity-20' 
                        : 'hover:bg-gray-800'
                  } cursor-pointer`}
                  onClick={() => handleTrendAction(bar, 'select')}
                >
                  <td className="px-3 py-2">
                    {totalBars - barIndex}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {formatTimestampToEastern(timestamp)}
                  </td>
                  <td className="px-3 py-2">{bar.open?.toFixed(2)}</td>
                  <td className="px-3 py-2">{bar.high?.toFixed(2)}</td>
                  <td className="px-3 py-2">{bar.low?.toFixed(2)}</td>
                  <td className="px-3 py-2">{bar.close?.toFixed(2)}</td>
                  
                  {/* Trend indicators */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {bar.uptrendStart && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300">
                          Up Start
                        </span>
                      )}
                      {bar.downtrendStart && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-900 text-orange-300">
                          Down Start
                        </span>
                      )}
                      {bar.highestDowntrendStart && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-300">
                          Highest Down
                        </span>
                      )}
                      {bar.unbrokenUptrendStart && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-950 text-green-300">
                          Unbroken Up
                        </span>
                      )}
                      {bar.uptrendToHigh && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-300">
                          Up to High
                        </span>
                      )}
                    </div>
                  </td>
                  
                  {/* Actions column */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {isSelected ? (
                      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                        <button 
                          onClick={() => onConfirmTrend('uptrendStart')}
                          className="px-2 py-1 rounded-md bg-green-700 hover:bg-green-600 text-xs text-white"
                          title="Mark as Uptrend Start"
                          disabled={isUpdating}
                        >
                          Up Start
                        </button>
                        <button 
                          onClick={() => onConfirmTrend('downtrendStart')}
                          className="px-2 py-1 rounded-md bg-orange-700 hover:bg-orange-600 text-xs text-white"
                          title="Mark as Downtrend Start"
                          disabled={isUpdating}
                        >
                          Down Start
                        </button>
                        <button 
                          onClick={() => onConfirmTrend('highestDowntrendStart')}
                          className="px-2 py-1 rounded-md bg-red-700 hover:bg-red-600 text-xs text-white"
                          title="Mark as Highest Downtrend"
                          disabled={isUpdating}
                        >
                          Highest Down
                        </button>
                        <button 
                          onClick={() => onConfirmTrend('unbrokenUptrendStart')}
                          className="px-2 py-1 rounded-md bg-green-800 hover:bg-green-700 text-xs text-white"
                          title="Mark as Unbroken Uptrend"
                          disabled={isUpdating}
                        >
                          Unbroken Up
                        </button>
                        <button 
                          onClick={() => onConfirmTrend('uptrendToHigh')}
                          className="px-2 py-1 rounded-md bg-blue-700 hover:bg-blue-600 text-xs text-white"
                          title="Mark as Uptrend to High"
                          disabled={isUpdating}
                        >
                          Up High
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-1">
                        <button 
                          className="px-2 py-0.5 text-xs border border-blue-500 text-blue-400 hover:bg-blue-900 hover:bg-opacity-50 rounded"
                          onClick={() => handleTrendAction(bar, 'select')}
                        >
                          Select
                        </button>
                        
                        {/* Show remove buttons for existing trends */}
                        {hasTrends && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {bar.uptrendStart && (
                              <button 
                                className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                onClick={() => handleTrendAction(bar, 'remove', 'uptrendStart')}
                                disabled={isUpdating}
                                title="Remove Uptrend Start marker"
                              >
                                ✕ Up
                              </button>
                            )}
                            {bar.downtrendStart && (
                              <button 
                                className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                onClick={() => handleTrendAction(bar, 'remove', 'downtrendStart')}
                                disabled={isUpdating}
                                title="Remove Downtrend Start marker"
                              >
                                ✕ Down
                              </button>
                            )}
                            {bar.highestDowntrendStart && (
                              <button 
                                className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                onClick={() => handleTrendAction(bar, 'remove', 'highestDowntrendStart')}
                                disabled={isUpdating}
                                title="Remove Highest Downtrend marker"
                              >
                                ✕ Highest
                              </button>
                            )}
                            {bar.unbrokenUptrendStart && (
                              <button 
                                className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                onClick={() => handleTrendAction(bar, 'remove', 'unbrokenUptrendStart')}
                                disabled={isUpdating}
                                title="Remove Unbroken Uptrend marker"
                              >
                                ✕ Unbroken
                              </button>
                            )}
                            {bar.uptrendToHigh && (
                              <button 
                                className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                onClick={() => handleTrendAction(bar, 'remove', 'uptrendToHigh')}
                                disabled={isUpdating}
                                title="Remove Uptrend to High marker"
                              >
                                ✕ High
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Table footer with load more option */}
      <div className="p-3 bg-gray-800 border-t border-gray-700 flex justify-between items-center">
        <span className="text-xs text-gray-400">
          Showing {filteredCount} of {totalBars} bars
          {filterTrendType && ` (filtered by ${filterTrendType === 'any' ? 'any trend' : filterTrendType})`}
        </span>
        
        {displayCount < totalBars && (
          <button 
            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm"
            onClick={() => setDisplayCount(prev => Math.min(prev + 100, totalBars))}
          >
            Load 100 More
          </button>
        )}
      </div>
    </div>
  );
};

// Add a utility function to normalize dates for daily timeframes
const normalizeDateForDaily = (date: Date | string | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
};

// Deduplicate data function
const deduplicateOhlcData = (data: OhlcBarWithTrends[], isDaily: boolean): OhlcBarWithTrends[] => {
  if (!isDaily || !data || data.length === 0) return data;
  
  console.log(`Deduplicating ${data.length} daily bars...`);
  
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
    const dateKey = normalizeDateForDaily(timestamp);
    
    if (!datesSeen.has(dateKey)) {
      uniqueBars.push(bar);
      datesSeen.add(dateKey);
    }
  });
  
  console.log(`Removed ${data.length - uniqueBars.length} duplicate daily bars`);
  
  return uniqueBars;
};

const TrendChart: React.FC<TrendChartProps> = ({ 
  data = [], 
  height = 400,
  removeGaps = true,
  onTrendPointsDetected,
  enableTraining = false,
  onTrendConfirmed,
  onTrendRemoved,
  timeframe = "5m",
  timeframes = ["1m", "5m", "15m", "1h", "1d"]
}) => {
  // Generate a unique ID for this chart instance
  const uniqueId = useId();
  const chartId = `sci-chart-${uniqueId.replace(/[^a-z0-9]/gi, '-')}`;
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<any>(null);
  
  // Use a reference to track if we already set up tooltip styling to avoid duplicates
  const didSetupTooltipStyling = useRef(false);
  
  // Training mode state
  const [selectedCandle, setSelectedCandle] = useState<any>(null);
  const [trainingMode, setTrainingMode] = useState(enableTraining);
  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<any>(null);
  
  // Store click event handler ref to ensure cleanup works properly
  const chartClickHandlerRef = useRef<(event: MouseEvent) => void | null>(null);
  
  // Add debug state
  const [clickPosition, setClickPosition] = useState<{x: number, y: number} | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  
  // Add refs to store data that needs to be accessed across functions
  const timestampsRef = useRef<number[]>([]);
  const sciChartRef = useRef<any>(null);
  
  // Deduplicate data for daily timeframes
  const isDaily = timeframe === "1d" || timeframe === "1w";
  const processedData = isDaily ? deduplicateOhlcData(data, true) : data;
  
  // Helper function to format timestamps in Eastern Time
  const formatTimestampToEastern = (timestamp: number): string => {
    try {
      const date = new Date(timestamp);
      
      // Format with explicit Eastern Time (ET) designation
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      };
      
      // Format the date in Eastern Time
      const formattedDate = new Intl.DateTimeFormat('en-US', options).format(date);
      
      // Add 'ET' to clarify timezone
      return `${formattedDate} ET`;
    } catch (e) {
      console.error("Error formatting timestamp:", e);
      return new Date(timestamp).toLocaleString() + " (local)";
    }
  };
  
  // Helper to inspect raw timestamp value
  const debugTimestamp = (timestamp: any): string => {
    try {
      if (timestamp instanceof Date) {
        return `Date object: ${timestamp.toISOString()}`;
      } else if (typeof timestamp === 'number') {
        return `Milliseconds: ${timestamp}, ISO: ${new Date(timestamp).toISOString()}`;
      } else if (typeof timestamp === 'string') {
        return `String: ${timestamp}, ISO: ${new Date(timestamp).toISOString()}`;
      } else {
        return `Unknown type: ${typeof timestamp}, Value: ${String(timestamp)}`;
      }
    } catch (e) {
      return `Error inspecting timestamp: ${e}`;
    }
  };
  
  // Function to handle removing a trend indicator
  const removeTrendPoint = async (bar: OhlcBarWithTrends, trendType: string) => {
    if (!onTrendRemoved) {
      console.error("Cannot remove trend: no callback provided");
      setError("No removal callback provided");
      return;
    }
    
    // Extract timestamp from the bar
    const timestamp = bar.timestamp instanceof Date 
      ? bar.timestamp.getTime() 
      : new Date(bar.timestamp).getTime();
    
    console.log(`Removing ${trendType} for candle at ${formatTimestampToEastern(timestamp)}`);
    setIsUpdating(true);
    
    try {
      // Find the index of this bar
      const barIndex = data.indexOf(bar);
      
      // Create trend point object with only necessary fields for removal
      const trendPoint = {
        timestamp: timestamp,
        type: trendType,
        index: barIndex,
        timeframe: timeframe
      };
      
      // Call the callback to handle the removal
      await onTrendRemoved(trendPoint);
      
      // Show success message
      console.log(`Trend point removed: ${trendType} at ${formatTimestampToEastern(timestamp)}`);
      
      // Clear any error state
      setError(null);
    } catch (err) {
      console.error("Error removing trend point:", err);
      setError(`Failed to remove trend: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Replace renderBarTable with TrendTrainingTable
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
  
  // Update training mode when enableTraining prop changes
  useEffect(() => {
    if (enableTraining !== trainingMode) {
      console.log(`Training mode prop changed to ${enableTraining}, updating state`);
      setTrainingMode(enableTraining);
    }
  }, [enableTraining]);
  
  useEffect(() => {
    // Cleanup function to delete any existing chart
    const cleanup = () => {
      // Clean up event listeners
      const chartElement = document.getElementById(chartId);
      if (chartElement && chartClickHandlerRef.current) {
        chartElement.removeEventListener('click', chartClickHandlerRef.current);
        chartElement.removeEventListener('mousedown', chartClickHandlerRef.current);
        console.log("Removed chart click event listeners");
      }
      
      if (chartRef.current) {
        try {
          chartRef.current.delete();
          chartRef.current = null;
        } catch (e) {
          console.error("Error cleaning up chart:", e);
        }
      }
    };
    
    // Clean up any existing chart first
    cleanup();
    
    // Reset state
    setIsLoading(true);
    setError(null);
    
    // Create a new chart
    const initChart = async () => {
      try {
        // Make sure our chart div exists
        const chartDiv = document.getElementById(chartId);
        if (!chartDiv) {
          console.error(`Chart container with ID '${chartId}' not found`);
          setError(`Chart container not found: #${chartId}`);
          setIsLoading(false);
          return;
        }
        
        // Clear any existing content
        chartDiv.innerHTML = '';
        
        // Check if data is valid
        if (!processedData || processedData.length === 0) {
          setError("No data available to display");
          setIsLoading(false);
          return;
        }
        
        // Import SciChart
        const SciChart = await import('scichart');
        
        // Store SciChart in ref for access in handleChartClick
        sciChartRef.current = SciChart;
        
        try {
          // Load WASM modules
          await SciChart.SciChartSurface.useWasmFromCDN();
          
          // Create the surface with the unique ID
          const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chartId);
          
          // Store the chart for cleanup
          chartRef.current = sciChartSurface;
          
          // Set background color
          sciChartSurface.background = CHART_BACKGROUND;
          
          // Create X axis with detailed timestamp formatting
          // Create X axis
          const xAxis = new SciChart.DateTimeNumericAxis(wasmContext);
          xAxis.visibleRangeLimit = new SciChart.NumberRange(0, Number.MAX_SAFE_INTEGER);
          
          // Ensure the X axis displays dates correctly
          try {
            if (SciChart.NumericLabelProvider) {
              const labelProvider = new SciChart.NumericLabelProvider();
              labelProvider.formatLabel = (dataValue: number) => {
                const date = new Date(dataValue);
                return date.toLocaleString();
              };
              xAxis.labelProvider = labelProvider;
            }
          } catch (err) {
            console.error("Error setting up date label provider:", err);
          }
          
          sciChartSurface.xAxes.add(xAxis);
          
          // Create Y axis
          const yAxis = new SciChart.NumericAxis(wasmContext);
          yAxis.growBy = new SciChart.NumberRange(0.1, 0.1);
          sciChartSurface.yAxes.add(yAxis);
          
          // Process data for the chart
          const rawTimestamps = processedData
            .map(bar => {
              if (!bar?.timestamp) return 0;
              
              // Ensure we're working with a Date object
              const timestamp = bar.timestamp instanceof Date 
                ? bar.timestamp 
                : new Date(bar.timestamp);
              
              // Debug: Check for potential daily duplicates
              if (timeframe === "1d" || timeframe === "1w") {
                // Store with date-only key for duplicate detection
                const dateStr = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
                
                // For first few daily bars, log detailed timestamp info to help debug
                if (processedData.indexOf(bar) < 10) {
                  console.log(`Daily bar ${processedData.indexOf(bar)} timestamp:`, {
                    dateStr,
                    iso: timestamp.toISOString(),
                    localTime: timestamp.toLocaleString(),
                    timestamp: timestamp.getTime(),
                    barObj: {
                      open: bar.open,
                      high: bar.high,
                      low: bar.low,
                      close: bar.close
                    }
                  });
                }
              }
              
              // For debugging, log a few timestamps to see the format
              if (processedData.indexOf(bar) < 3) {
                console.log(`Bar ${processedData.indexOf(bar)} timestamp:`, 
                  timestamp.toISOString(), 
                  "Local time:", 
                  timestamp.toLocaleString()
                );
              }
              
              // Return the timestamp in milliseconds
              return timestamp.getTime();
            })
            .filter(t => t > 0);
          
          if (rawTimestamps.length === 0) {
            setError("No valid timestamps in data");
            setIsLoading(false);
            return;
          }
          
          // Create data arrays
          const opens = processedData.map(bar => bar?.open || 0).filter(v => v > 0);
          const highs = processedData.map(bar => bar?.high || 0).filter(v => v > 0);
          const lows = processedData.map(bar => bar?.low || 0).filter(v => v > 0);
          const closes = processedData.map(bar => bar?.close || 0).filter(v => v > 0);
          
          if (opens.length === 0) {
            setError("No valid price data");
            setIsLoading(false);
            return;
          }
          
          // Process with or without gap compression
          let timestamps, processedOpens, processedHighs, processedLows, processedCloses;
          
          if (removeGaps) {
            const result = compressTimeGaps(rawTimestamps, opens, highs, lows, closes);
            timestamps = result.compressedTimestamps;
            processedOpens = result.compressedOpens;
            processedHighs = result.compressedHighs;
            processedLows = result.compressedLows;
            processedCloses = result.compressedCloses;
          } else {
            timestamps = rawTimestamps;
            processedOpens = opens;
            processedHighs = highs;
            processedLows = lows;
            processedCloses = closes;
          }
          
          // Store timestamps in ref for use in handleChartClick
          timestampsRef.current = timestamps;
          
          // Create data series
          const dataSeries = new SciChart.OhlcDataSeries(wasmContext);
          dataSeries.appendRange(timestamps, processedOpens, processedHighs, processedLows, processedCloses);
          
          // Create candlestick series
          const candlestickSeries = new SciChart.FastCandlestickRenderableSeries(wasmContext);
          
          // Set styling
          candlestickSeries.dataSeries = dataSeries;
          candlestickSeries.strokeThickness = 1;
          candlestickSeries.dataPointWidth = 0.7;
          
          // Set colors using type casting to avoid TypeScript errors
          // Different versions of SciChart have different property names
          const series = candlestickSeries as any;
          series.strokeUp = BULLISH_COLOR;
          series.strokeDown = BEARISH_COLOR;
          series.fillUp = BULLISH_COLOR;
          series.fillDown = BEARISH_COLOR;
          
          // Add the series to the chart
          sciChartSurface.renderableSeries.add(candlestickSeries);
          
          // Add basic chart modifiers
          sciChartSurface.chartModifiers.clear();
          sciChartSurface.chartModifiers.add(new SciChart.ZoomPanModifier());
          sciChartSurface.chartModifiers.add(new SciChart.ZoomExtentsModifier());
          sciChartSurface.chartModifiers.add(new SciChart.MouseWheelZoomModifier());
          sciChartSurface.chartModifiers.add(new SciChart.LegendModifier());
          
          // Create a tooltip modifier with improved styling
          const tooltipModifier = new SciChart.CursorModifier({
            showTooltip: true
          });
          
          // Add rollover modifier with specific configuration for better styling
          const rolloverModifier = new SciChart.RolloverModifier({
            showRolloverLine: true,
            showTooltip: true,
            // Set rollover line color and thickness
            rolloverLineStroke: "#f97316" // Orange color
            // rolloverLineStrokeThickness property isn't available in this version
          });
          
          // Add tooltip modifiers to the chart
          sciChartSurface.chartModifiers.add(tooltipModifier);
          sciChartSurface.chartModifiers.add(rolloverModifier);
          
          // Add specific styling for rollover tooltips via global style
          const rolloverStyleId = 'sci-chart-rollover-style';
          if (!document.getElementById(rolloverStyleId)) {
            const styleElement = document.createElement('style');
            styleElement.id = rolloverStyleId;
            styleElement.textContent = `
              /* Target rollover tooltips specifically */
              .scichart__rolloverTooltip,
              [class*="rolloverTooltip"],
              [class*="RolloverTooltip"] {
                background-color: #000000 !important; 
                color: #ffffff !important;
                border: 2px solid #f97316 !important;
                border-radius: 4px !important;
                padding: 8px 12px !important;
                font-weight: bold !important;
                box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5) !important;
                z-index: 10000 !important;
                opacity: 0.95 !important;
              }
            `;
            document.head.appendChild(styleElement);
          }
          
          // Format axis labels to show proper date/time
          const xAxisLabelFormatter = new SciChart.NumericLabelProvider();
          xAxisLabelFormatter.formatLabel = (dataValue: number) => {
            if (!dataValue) return '';
            
            const date = new Date(dataValue);
            
            // Format date and time in a readable way
            try {
              // Always show full date and time for precision
              return date.toLocaleDateString() + ' ' + 
                     date.toLocaleTimeString(undefined, { 
                       hour: '2-digit', 
                       minute: '2-digit'
                     });
            } catch (e) {
              // Fallback if formatting fails
              return date.toString();
            }
          };
          xAxis.labelProvider = xAxisLabelFormatter;
          
          // Try to add trend annotations
          try {
            // Log trend indicator data
            const trendCounts = {
              uptrendStart: processedData.filter(bar => bar.uptrendStart).length,
              downtrendStart: processedData.filter(bar => bar.downtrendStart).length,
              highestDowntrendStart: processedData.filter(bar => bar.highestDowntrendStart).length,
              unbrokenUptrendStart: processedData.filter(bar => bar.unbrokenUptrendStart).length,
              uptrendToHigh: processedData.filter(bar => bar.uptrendToHigh).length
            };
            
            console.log("TrendChart received indicators:", trendCounts);
            
            if (Object.values(trendCounts).every(count => count === 0)) {
              console.warn("No trend indicators found in data!");
            } else {
              console.log("Processing trend indicators for chart display...");
            }
            
            // Process each bar for trend indicators
            let markersAdded = 0;
            // Track trend points for drawing lines and displaying in a table
            const trendPoints: {timestamp: number; price: number; type: string; index: number}[] = [];
            
            processedData.forEach((bar, index) => {
              if (!bar || !timestamps[index]) return;
              
              const timestamp = timestamps[index];
              // Only log every 10th bar to reduce console spam
              const shouldLog = index % 10 === 0;
              if (shouldLog) {
                console.log(`Processing bar ${index}, timestamp ${new Date(timestamp).toISOString()}`);
              }
              
              // Handle uptrendStart
              if (bar.uptrendStart && bar.low) {
                // Only log certain markers to reduce noise
                console.log(`Adding uptrend marker at ${new Date(timestamp).toISOString()}, price ${bar.low}`);
                try {
                  const uptrendMarker = new SciChart.TextAnnotation({
                    x1: timestamp,
                    y1: bar.low * 0.9995,
                    text: "▲",
                    fontSize: 16, // Increased size for visibility
                    textColor: UPTREND_START_COLOR,
                    background: "#00000033" 
                  });
                  sciChartSurface.annotations.add(uptrendMarker);
                  markersAdded++;
                  // Store trend point for lines and table
                  trendPoints.push({
                    timestamp,
                    price: bar.low,
                    type: "Uptrend Start",
                    index
                  });
                } catch (e) {
                  console.error("Error adding uptrend marker:", e);
                }
              }
              
              // Handle downtrendStart
              if (bar.downtrendStart && bar.high) {
                console.log(`Adding downtrend marker at ${new Date(timestamp).toISOString()}, price ${bar.high}`);
                try {
                  const downtrendMarker = new SciChart.TextAnnotation({
                    x1: timestamp,
                    y1: bar.high * 1.0005,
                    text: "▼",
                    fontSize: 16, // Increased size
                    textColor: DOWNTREND_START_COLOR,
                    background: "#00000033"
                  });
                  sciChartSurface.annotations.add(downtrendMarker);
                  markersAdded++;
                  // Store trend point for lines and table
                  trendPoints.push({
                    timestamp,
                    price: bar.high,
                    type: "Downtrend Start",
                    index
                  });
                } catch (e) {
                  console.error("Error adding downtrend marker:", e);
                }
              }
              
              // Handle highestDowntrendStart
              if (bar.highestDowntrendStart && bar.high) {
                console.log(`Adding highest downtrend marker at ${new Date(timestamp).toISOString()}, price ${bar.high}`);
                try {
                  const highestDowntrendMarker = new SciChart.TextAnnotation({
                    x1: timestamp,
                    y1: bar.high * 1.001,
                    text: "◆",
                    fontSize: 16, // Increased size
                    textColor: HIGHEST_DOWNTREND_COLOR,
                    background: "#00000033"
                  });
                  sciChartSurface.annotations.add(highestDowntrendMarker);
                  markersAdded++;
                  // Store trend point for lines and table
                  trendPoints.push({
                    timestamp,
                    price: bar.high,
                    type: "Highest Downtrend",
                    index
                  });
                } catch (e) {
                  console.error("Error adding highest downtrend marker:", e);
                }
              }
              
              // Handle unbrokenUptrendStart
              if (bar.unbrokenUptrendStart && bar.low) {
                console.log(`Adding unbroken uptrend marker at ${new Date(timestamp).toISOString()}, price ${bar.low}`);
                try {
                  const unbrokenUptrendMarker = new SciChart.TextAnnotation({
                    x1: timestamp,
                    y1: bar.low * 0.999,
                    text: "●",
                    fontSize: 16, // Increased size
                    textColor: UNBROKEN_UPTREND_COLOR,
                    background: "#00000033"
                  });
                  sciChartSurface.annotations.add(unbrokenUptrendMarker);
                  markersAdded++;
                  // Store trend point for lines and table
                  trendPoints.push({
                    timestamp,
                    price: bar.low,
                    type: "Unbroken Uptrend",
                    index
                  });
                } catch (e) {
                  console.error("Error adding unbroken uptrend marker:", e);
                }
              }
              
              // Handle uptrendToHigh
              if (bar.uptrendToHigh && bar.high) {
                console.log(`Adding key level marker at ${new Date(timestamp).toISOString()}, price ${bar.high}`);
                try {
                  const keyLevelMarker = new SciChart.TextAnnotation({
                    x1: timestamp,
                    y1: bar.high * 1.0015,
                    text: "✦",
                    fontSize: 16, // Increased size
                    textColor: KEY_LEVEL_COLOR,
                    background: "#00000033"
                  });
                  sciChartSurface.annotations.add(keyLevelMarker);
                  markersAdded++;
                  // Store trend point for lines and table
                  trendPoints.push({
                    timestamp,
                    price: bar.high,
                    type: "Uptrend to High",
                    index
                  });
                } catch (e) {
                  console.error("Error adding key level marker:", e);
                }
              }
            });
            
            // Connect trend points with lines
            console.log(`Adding trend lines between ${trendPoints.length} trend points`);
            if (trendPoints.length > 1) {
              // Sort trend points by timestamp
              trendPoints.sort((a, b) => a.timestamp - b.timestamp);
              
              for (let i = 0; i < trendPoints.length - 1; i++) {
                const start = trendPoints[i];
                const end = trendPoints[i + 1];
                
                try {
                  // Only connect adjacent trend points
                  const lineColor = start.type.includes("Uptrend") && end.type.includes("Downtrend") ? 
                    "#FF4500" : // Orange-red for uptrend to downtrend
                    start.type.includes("Downtrend") && end.type.includes("Uptrend") ? 
                      "#4CAF50" : // Green for downtrend to uptrend
                      "#3CB9FC"; // Blue for other connections
                      
                  const lineThickness = 2;
                  
                  // Create line annotation
                  const trendLine = new SciChart.LineAnnotation({
                    x1: start.timestamp,
                    y1: start.price,
                    x2: end.timestamp,
                    y2: end.price,
                    stroke: lineColor,
                    strokeThickness: lineThickness
                  });
                  
                  sciChartSurface.annotations.add(trendLine);
                  console.log(`Added trend line from ${new Date(start.timestamp).toISOString()} to ${new Date(end.timestamp).toISOString()}`);
                } catch (e) {
                  console.error("Error adding trend line:", e);
                }
              }
            }
            
            // Call the callback if provided
            if (onTrendPointsDetected && trendPoints.length > 0) {
              onTrendPointsDetected(trendPoints);
            }
            
            // Verify markers were added
            console.log(`Added ${markersAdded} trend markers to the chart`);
            if (markersAdded === 0) {
              console.warn("No trend markers were added to the chart! Check your data and SciChart configuration.");
              
              // As a fallback, add a test marker at the center of the chart to verify annotation capabilities
              try {
                // Find a reasonable position for a test marker
                if (timestamps.length > 0) {
                  const middleIndex = Math.floor(timestamps.length / 2);
                  const middleTimestamp = timestamps[middleIndex];
                  const middleBar = processedData[middleIndex];
                  
                  if (middleBar && middleBar.close) {
                    console.log("Adding test marker in the middle of the chart");
                    const testMarker = new SciChart.TextAnnotation({
                      x1: middleTimestamp,
                      y1: middleBar.close,
                      text: "TEST",
                      fontSize: 20,
                      textColor: "#FF0000",
                      background: "#00000055"
                    });
                    sciChartSurface.annotations.add(testMarker);
                    console.log("Test marker added successfully");
                  }
                }
              } catch (e) {
                console.error("Error adding test marker:", e);
              }
            }

            // Check if annotations were actually added to the chart surface
            try {
              const annotationCount = sciChartSurface.annotations.size();
              console.log(`SciChart surface has ${annotationCount} annotations`);
              
              if (annotationCount === 0 && markersAdded > 0) {
                console.error("Failed to add markers to chart! Markers were created but not added to the surface.");
                
                // Try a different approach as a last resort
                console.log("Attempting alternative annotation method...");
                
                // Add a single annotation directly in a clearly visible area
                const xCenter = (sciChartSurface.xAxes.get(0).visibleRange.max + 
                                sciChartSurface.xAxes.get(0).visibleRange.min) / 2;
                const yCenter = (sciChartSurface.yAxes.get(0).visibleRange.max + 
                                sciChartSurface.yAxes.get(0).visibleRange.min) / 2;
                
                const emergencyMarker = new SciChart.TextAnnotation({
                  x1: xCenter,
                  y1: yCenter,
                  text: "TREND MARKER TEST",
                  fontSize: 24,
                  textColor: "#FF0000",
                  background: "#00000077"
                });
                
                sciChartSurface.annotations.add(emergencyMarker);
                console.log("Emergency test marker added at chart center");
              }
            } catch (e) {
              console.error("Error checking annotation count:", e);
            }

            // After all chart elements are initialized, apply tooltip styling
            setTimeout(() => {
              try {
                // Check for tooltips and restyle them if needed
                const tooltipElements = document.querySelectorAll('[class*="tooltip"], [class*="Tooltip"]');
                tooltipElements.forEach(element => {
                  console.log("Found tooltip element to style:", element);
                });
                
                console.log("Applied custom tooltip styling");
              } catch (e) {
                console.error("Error applying tooltip styles:", e);
              }
            }, 500); // Delay to ensure chart is fully rendered
            
          } catch (e) {
            console.error("Error adding trend markers:", e);
          }
          
          // Zoom to fit all data
          try {
            sciChartSurface.zoomExtents();
          } catch (e) {
            console.error("Error zooming chart:", e);
          }
          
          // Add click handler for candle selection if training is enabled
          if (enableTraining) {
            try {
              console.log("Setting up candle selection for training mode. Training active:", trainingMode);
              
              // Use handleChartClick from the outer scope
              
              // Add click detection to the chart element - use multiple approaches
              const chartElement = document.getElementById(chartId);
              if (chartElement) {
                // Define a handler that can be removed in cleanup
                const handleChartClickEvent = (event: MouseEvent) => {
                  if (!trainingMode) return;
                  
                  // Prevent any further event processing
                  event.preventDefault();
                  event.stopPropagation();
                  
                  const rect = chartElement.getBoundingClientRect();
                  const mouseX = event.clientX - rect.left;
                  const mouseY = event.clientY - rect.top;
                  
                  console.log("DOM click on chart:", { x: mouseX, y: mouseY });
                  
                  // Update debug visualization
                  setClickPosition({ x: mouseX, y: mouseY });
                  
                  // Add debug message
                  const newDebugMsg = `Click at (${mouseX.toFixed(0)}, ${mouseY.toFixed(0)}) at ${new Date().toLocaleString()}`;
                  setDebugInfo(prev => `${newDebugMsg}\n${prev}`.slice(0, 500));
                  
                  // Delay slightly to allow UI to update
                  setTimeout(() => {
                    try {
                      handleChartClick({ x: mouseX, y: mouseY });
                    } catch (clickErr) {
                      console.error("Error in delayed click handler:", clickErr);
                      setDebugInfo(prev => `Error: ${clickErr instanceof Error ? clickErr.message : String(clickErr)}\n${prev}`);
                    }
                  }, 0);
                };
                
                // Store in ref for cleanup
                chartClickHandlerRef.current = handleChartClickEvent;
                
                // Remove any existing listeners first
                chartElement.removeEventListener('click', chartClickHandlerRef.current);
                chartElement.removeEventListener('mousedown', chartClickHandlerRef.current);
                
                // Add event listeners with capture phase to ensure we get first priority
                chartElement.addEventListener('click', handleChartClickEvent, true);
                console.log("Added click event listeners to chart element");
                
                // Also set up direct pointer events in case regular click events are intercepted
                chartElement.addEventListener('pointerdown', handleChartClickEvent, true);
                console.log("Added pointer event listeners for backup");
              } else {
                console.error("Chart element not found, cannot add click handlers");
              }
              
              // Also set up the RolloverModifier to help visualize which candle will be selected
              const rolloverModifier = new SciChart.RolloverModifier({
                showTooltip: true,
                showRolloverLine: true,
                rolloverLineStroke: "#ffcc00"
              });
              sciChartSurface.chartModifiers.add(rolloverModifier);
              
              // Add cursor modifier for more precise pointing
              const cursorModifier = new SciChart.CursorModifier({
                showTooltip: true
              });
              sciChartSurface.chartModifiers.add(cursorModifier);
              
              console.log("Click handlers and visual aids added successfully");
            } catch (e) {
              console.error("Error setting up click handler:", e);
            }
          }
          
          // Add pending update markers
          if (pendingUpdates.length > 0) {
            try {
              for (const point of pendingUpdates) {
                const timestamp = point.timestamp;
                const price = point.price;
                const type = point.type;
                
                // Create a more prominent marker for pending updates
                const pendingMarker = new SciChart.TextAnnotation({
                  x1: timestamp,
                  y1: price * (type.includes('uptrend') ? 0.998 : 1.002),
                  text: "●",  // Different symbol for pending updates
                  fontSize: 24,
                  textColor: "#FFCC00",  // Yellow/gold for pending updates
                  background: "#00000055"
                });
                
                sciChartSurface.annotations.add(pendingMarker);
              }
            } catch (e) {
              console.error("Error adding pending updates:", e);
            }
          }
          
          // Add a legend label to show the training mode status
          const legendAnnotation = new SciChart.TextAnnotation({
            x1: timestamps[Math.floor(timestamps.length / 4)], // Quarter way through chart
            y1: sciChartSurface.yAxes.get(0).visibleRange.max * 0.9,
            text: trainingMode ? "🔍 TRAINING MODE ACTIVE - CLICK A CANDLE" : "TRAINING MODE INACTIVE",
            fontSize: 16,
            fontWeight: "bold",
            textColor: trainingMode ? "#22c55e" : "#6b7280",
            background: "#00000066"
          });
          sciChartSurface.annotations.add(legendAnnotation);
          
        } catch (e) {
          console.error("Error initializing SciChart:", e);
          setError(`SciChart initialization error: ${e instanceof Error ? e.message : String(e)}`);
          setIsLoading(false);
          return;
        }
        
        // Done loading
        setIsLoading(false);
      } catch (e) {
        console.error("Error creating chart:", e);
        setError(`Failed to create chart: ${e instanceof Error ? e.message : String(e)}`);
        setIsLoading(false);
      }
    };
    
    // Initialize the chart
    initChart();
    
    // Cleanup on unmount
    return cleanup;
  }, [processedData, height, removeGaps, trainingMode, pendingUpdates, enableTraining, chartId]);
  
  // Function to confirm trend for selected candle
  const confirmTrendPoint = async (trendType: string) => {
    if (!selectedCandle || !onTrendConfirmed) {
      console.error("Cannot confirm trend: no candle selected or no callback provided");
      setError("No candle selected");
      return;
    }
    
    // Check if this is a daily timeframe
    const isDaily = timeframe === "1d" || timeframe === "1w";
    
    console.log(`Confirming ${trendType} for candle at ${formatTimestampToEastern(selectedCandle.timestamp)}`);
    setIsUpdating(true);
    
    try {
      // Create trend point object
      const trendPoint = {
        timestamp: selectedCandle.timestamp,
        price: trendType.includes('uptrend') || trendType === 'unbrokenUptrendStart' ? 
          selectedCandle.bar.low : 
          selectedCandle.bar.high,
        type: trendType,
        index: selectedCandle.index,
        timeframe: timeframe
      };
      
      // Log timestamp details for verification
      console.log(`Trend point details:`, {
        timestamp: trendPoint.timestamp,
        formattedTimestamp: formatTimestampToEastern(trendPoint.timestamp),
        uncorrectedTimestamp: formatTimestampToEastern(trendPoint.timestamp),
        timestampDebug: debugTimestamp(trendPoint.timestamp),
        originalBarTimestamp: selectedCandle.bar.timestamp,
        originalBarTimestampDebug: debugTimestamp(selectedCandle.bar.timestamp),
        isDaily: isDaily,
        timeframe: timeframe,
        candle: selectedCandle.index,
        price: trendPoint.price.toFixed(2),
        type: trendType
      });
      
      // Add to pending updates
      setPendingUpdates(prev => [...prev, trendPoint]);
      
      // Save a copy of the selected candle for recovery if needed
      const savedCandle = { ...selectedCandle };
      
      try {
        // Call the callback to handle the confirmed point
        await onTrendConfirmed(trendPoint);
        
        // Reset selection after successful confirmation
        setSelectedCandle(null);
        
        // Show success message
        console.log(`Trend point confirmed: ${trendType} at ${formatTimestampToEastern(trendPoint.timestamp)}`);
        
        // Clear any error state
        setError(null);
      } catch (apiError) {
        console.error("API error confirming trend point:", apiError);
        setError(`API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
        
        // Don't clear selection state on API failure
        console.log("Keeping candle selection after API error");
      }
      
    } catch (err) {
      console.error("Error confirming trend point:", err);
      setError(`Failed to confirm trend: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Render training UI overlay - enhanced with quick trend buttons 
  const renderTrainingControls = () => {
    if (!enableTraining) return null;
    
    return (
      <div className="mb-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-white font-medium">Trend Training Mode</h3>
          <button 
            className={`px-3 py-1 rounded text-sm ${trainingMode ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => setTrainingMode(!trainingMode)}
          >
            {trainingMode ? 'Training Active' : 'Start Training'}
          </button>
        </div>
        
        {trainingMode && (
          <>
            {selectedCandle ? (
              <div className="bg-gray-800 p-2 rounded mb-2">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs text-gray-300">
                    Selected: {formatTimestampToEastern(selectedCandle.timestamp)}
                  </p>
                  <button 
                    className="text-xs text-gray-400 hover:text-white"
                    onClick={() => setSelectedCandle(null)}
                  >
                    Clear
                  </button>
                </div>
                <p className="text-xs text-gray-300">
                  O: {selectedCandle.bar.open?.toFixed(2)} H: {selectedCandle.bar.high?.toFixed(2)} L: {selectedCandle.bar.low?.toFixed(2)} C: {selectedCandle.bar.close?.toFixed(2)}
                </p>
                <p className="text-xs text-blue-300">
                  Bar #{selectedCandle.index + 1} of {processedData.length} • Timeframe: {timeframe}
                  {(timeframe === "1d" || timeframe === "1w") && <span className="text-amber-400 ml-1">(1-day correction applied)</span>}
                </p>
                <p className="text-xs font-mono text-gray-400 truncate">
                  Raw timestamp: {String(selectedCandle.bar.timestamp).substring(0, 30)}
                </p>
                
                <div className="grid grid-cols-5 gap-1 mt-2">
                  <button 
                    className="bg-green-700 text-white text-xs py-1 rounded hover:bg-green-600"
                    onClick={() => confirmTrendPoint('uptrendStart')}
                    disabled={isUpdating}
                  >
                    Uptrend Start
                  </button>
                  <button 
                    className="bg-orange-700 text-white text-xs py-1 rounded hover:bg-orange-600"
                    onClick={() => confirmTrendPoint('downtrendStart')}
                    disabled={isUpdating}
                  >
                    Downtrend Start
                  </button>
                  <button 
                    className="bg-red-700 text-white text-xs py-1 rounded hover:bg-red-600"
                    onClick={() => confirmTrendPoint('highestDowntrendStart')}
                    disabled={isUpdating}
                  >
                    Highest Down
                  </button>
                  <button 
                    className="bg-green-800 text-white text-xs py-1 rounded hover:bg-green-700"
                    onClick={() => confirmTrendPoint('unbrokenUptrendStart')}
                    disabled={isUpdating}
                  >
                    Unbroken Up
                  </button>
                  <button 
                    className="bg-blue-700 text-white text-xs py-1 rounded hover:bg-blue-600"
                    onClick={() => confirmTrendPoint('uptrendToHigh')}
                    disabled={isUpdating}
                  >
                    Uptrend High
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Select a bar from the table below or click on a candle</p>
            )}
            
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Pending updates: {pendingUpdates.length}</span>
              {pendingUpdates.length > 0 && (
                <button 
                  className="text-blue-400 hover:text-blue-300"
                  onClick={() => setPendingUpdates([])}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };
  
  // Define handleChartClick outside useEffect so it's accessible in other parts of the component
  const handleChartClick = (mousePoint: {x: number, y: number}) => {
    if (!trainingMode) {
      console.log("Training mode not active, ignoring click");
      return;
    }
    
    console.log("Processing chart click at:", mousePoint);
    
    try {
      // If we don't have a chart yet, abort
      if (!chartRef.current || !processedData || processedData.length === 0) {
        console.error("Chart not initialized or no data available");
        setDebugInfo(prev => `Error: Chart or data not available\n${prev}`);
        return;
      }
      
      // Get the chart surface
      const sciChartSurface = chartRef.current;
      const SciChart = sciChartRef.current;
      
      if (!SciChart) {
        console.error("SciChart library not loaded");
        setDebugInfo(prev => `Error: SciChart library not loaded\n${prev}`);
        return;
      }
      
      // Make sure we can access the axes
      if (!sciChartSurface.xAxes || !sciChartSurface.xAxes.get || !sciChartSurface.xAxes.get(0)) {
        console.error("Cannot access chart X axis");
        setDebugInfo(prev => `Error: Cannot access X axis\n${prev}`);
        return;
      }
      
      const xAxis = sciChartSurface.xAxes.get(0);
      
      // Check for coordinate calculator method
      if (!xAxis.getCurrentCoordinateCalculator) {
        console.error("X-axis coordinate calculator not available");
        setDebugInfo(prev => `Error: Coordinate calculator not available\n${prev}`);
        return;
      }
      
      // Convert screen coordinates to data coordinates
      const xCoord = xAxis.getCurrentCoordinateCalculator().getDataValue(mousePoint.x);
      console.log("X coordinate in data space:", xCoord);
      
      // Add debug info
      setDebugInfo(prev => `Converting to timestamp: ${formatTimestampToEastern(xCoord)}\n${prev}`);
      
      // Get timestamps from ref
      const timestamps = timestampsRef.current;
      
      // Ensure timestamps array exists and has data
      if (!timestamps || timestamps.length === 0) {
        console.error("No timestamps available for comparison");
        setDebugInfo(prev => `Error: No timestamps available\n${prev}`);
        return;
      }
      
      // Find closest data point by timestamp
      let closestIndex = -1;
      let minDistance = Number.MAX_VALUE;
      
      for (let i = 0; i < timestamps.length; i++) {
        const distance = Math.abs(timestamps[i] - xCoord);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = i;
        }
      }
      
      console.log("Closest candle index:", closestIndex, "with distance:", minDistance);
      
      // Make sure we found a valid index
      if (closestIndex < 0 || closestIndex >= processedData.length) {
        console.warn("No valid data point found near click");
        setDebugInfo(prev => `Warning: No valid candle found near click\n${prev}`);
        return;
      }
      
      // Get the selected candle
      const clickedBar = processedData[closestIndex];
      const clickedTimestamp = timestamps[closestIndex];
      
      // Get the original timestamp from the data (not the potentially compressed one)
      const originalTimestamp = clickedBar.timestamp instanceof Date ? 
        clickedBar.timestamp.getTime() : 
        new Date(clickedBar.timestamp).getTime();
      
      console.log("Selected candle:", {
        index: closestIndex,
        displayTimestamp: formatTimestampToEastern(clickedTimestamp),
        originalTimestamp: formatTimestampToEastern(originalTimestamp),
        open: clickedBar.open,
        high: clickedBar.high,
        low: clickedBar.low,
        close: clickedBar.close
      });
      
      // Add debug info
      setDebugInfo(prev => (
        `Selected candle ${closestIndex}: ${formatTimestampToEastern(originalTimestamp)}\n` +
        `Chart timestamp: ${formatTimestampToEastern(clickedTimestamp)}\n` +
        `OHLC: ${clickedBar.open?.toFixed(2)}/${clickedBar.high?.toFixed(2)}/${clickedBar.low?.toFixed(2)}/${clickedBar.close?.toFixed(2)}\n${prev}`
      ));
      
      // Update the selected candle state
      setSelectedCandle({
        index: closestIndex,
        timestamp: originalTimestamp, // Use the original timestamp
        bar: clickedBar
      });
      
      // Remove existing annotations
      try {
        if (selectedAnnotation) {
          sciChartSurface.annotations.remove(selectedAnnotation);
          setSelectedAnnotation(null);
        }
        
        // Clear all other highlight annotations
        const annotationsToRemove = [];
        for (let i = 0; i < sciChartSurface.annotations.size(); i++) {
          const annotation = sciChartSurface.annotations.get(i);
          if (annotation.className.includes("BoxAnnotation") || 
              (annotation.className.includes("TextAnnotation") && annotation.text === "SELECTED")) {
            annotationsToRemove.push(annotation);
          }
        }
        
        annotationsToRemove.forEach(a => {
          try {
            sciChartSurface.annotations.remove(a);
          } catch (e) {
            console.error("Error removing annotation:", e);
          }
        });
        
        // Calculate a reasonable box width based on chart data
        let boxWidth = 300000; // Default width (5 minutes in ms)
        try {
          // Try to calculate width based on average spacing between points
          if (timestamps.length > 1) {
            let totalSpacing = 0;
            let spacingCount = 0;
            
            // Get average space between timestamps for more consistent sizing
            for (let i = 1; i < Math.min(timestamps.length, 10); i++) {
              const gap = timestamps[i] - timestamps[i-1];
              if (gap > 0) {
                totalSpacing += gap;
                spacingCount++;
              }
            }
            
            if (spacingCount > 0) {
              boxWidth = (totalSpacing / spacingCount) * 0.4;
              console.log(`Using calculated box width: ${boxWidth}ms`);
            }
          }
        } catch (widthError) {
          console.warn("Using default box width due to calculation error:", widthError);
        }
        
        // Create a new highlight annotation with error handling
        try {
          console.log("Creating box annotation:", {
            x1: clickedTimestamp - boxWidth,
            x2: clickedTimestamp + boxWidth,
            y1: clickedBar.low * 0.998,
            y2: clickedBar.high * 1.002,
            originalTime: formatTimestampToEastern(originalTimestamp),
            chartTime: formatTimestampToEastern(clickedTimestamp)
          });
          
          const highlightAnnotation = new SciChart.BoxAnnotation({
            x1: clickedTimestamp - boxWidth,
            x2: clickedTimestamp + boxWidth,
            y1: clickedBar.low * 0.998,
            y2: clickedBar.high * 1.002,
            strokeThickness: 3,
            stroke: "#ff9900",
            fill: "#ff990033",
            isEditable: false
          });
          
          // Add the annotation
          sciChartSurface.annotations.add(highlightAnnotation);
          setSelectedAnnotation(highlightAnnotation);
          console.log("Successfully added box annotation");
          
          // Add a text annotation
          const labelAnnotation = new SciChart.TextAnnotation({
            x1: clickedTimestamp,
            y1: clickedBar.high * 1.01,
            text: "SELECTED",
            fontSize: 14,
            fontWeight: "bold",
            textColor: "#ff9900",
            background: "#00000066"
          });
          
          sciChartSurface.annotations.add(labelAnnotation);
          console.log("Successfully added text annotation");
        } catch (annotationError) {
          console.error("Error creating/adding annotations:", annotationError);
          setDebugInfo(prev => `Error details: ${annotationError instanceof Error ? annotationError.message : String(annotationError)}\n${prev}`);
          
          // Fallback to simpler annotation if complex ones fail
          try {
            console.log("Trying fallback annotation...");
            const simpleAnnotation = new SciChart.TextAnnotation({
              x1: clickedTimestamp,
              y1: clickedBar.close,
              text: "●",
              fontSize: 24,
              textColor: "#ff9900",
              background: "#00000066"
            });
            sciChartSurface.annotations.add(simpleAnnotation);
            setSelectedAnnotation(simpleAnnotation);
            console.log("Added fallback annotation");
          } catch (fallbackError) {
            console.error("Even fallback annotation failed:", fallbackError);
          }
        }
        
        console.log("Added highlight annotations for selected candle");
      } catch (annotationError) {
        console.error("Error managing annotations:", annotationError);
        setDebugInfo(prev => `Error: Failed to highlight candle - ${annotationError instanceof Error ? annotationError.message : String(annotationError)}\n${prev}`);
        
        // Don't let annotation errors prevent selection
        // We still want the candle to be selected even if highlighting fails
        console.log("Continuing with candle selection despite annotation error");
      }
      
    } catch (error) {
      console.error("Error processing chart click:", error);
      setDebugInfo(prev => `Error: ${error instanceof Error ? error.message : String(error)}\n${prev}`);
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Training controls */}
      {renderTrainingControls()}
      
      {/* Chart container */}
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
          id={chartId}
          style={{ width: "100%", height: `${height}px` }}
          className="bg-gray-900"
          onClick={(e) => {
            // Simple direct click handler for debugging
            if (!trainingMode) return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            console.log("Direct React onClick handler:", { x, y });
            setClickPosition({ x, y });
            
            // Add debug message
            const newDebugMsg = `Click at (${x.toFixed(0)}, ${y.toFixed(0)}) at ${new Date().toLocaleString()}`;
            setDebugInfo(prev => `${newDebugMsg}\n${prev}`.slice(0, 500));
            
            // Use the enhanced handleChartClick function
            try {
              if (chartRef.current) {
                // Don't need to wrap in additional try/catch as handleChartClick does that
                handleChartClick({ x, y });
              } else {
                console.error("Cannot process click - chart not initialized");
                setDebugInfo(prev => `Error: Chart not initialized\n${prev}`);
              }
            } catch (clickError) {
              console.error("Error in click handler:", clickError);
            }
          }}
        />
        
        {/* Visual indicator of click position for debugging */}
        {trainingMode && clickPosition && (
          <div
            className="absolute w-6 h-6 rounded-full border-2 border-yellow-400 bg-yellow-400 bg-opacity-50 pointer-events-none z-30"
            style={{
              left: `${clickPosition.x - 12}px`,
              top: `${clickPosition.y - 12}px`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        )}
        
        {/* Debug info overlay */}
        {trainingMode && (
          <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-2 rounded text-xs z-40 max-w-xs max-h-32 overflow-auto">
            <div>Training active: {trainingMode ? "YES" : "NO"}</div>
            <div>Selected candle: {selectedCandle ? `Index ${selectedCandle.index}` : "None"}</div>
            <div className="text-xs text-gray-400 whitespace-pre-line">{debugInfo}</div>
          </div>
        )}
      </div>
      
      {/* Enhanced training table */}
      {renderTrainingTable()}
      
      {/* Tooltip styling - added directly to the component */}
      <style dangerouslySetInnerHTML={{
        __html: `
          /* Force tooltip styling */
          #${chartId} [class*="tooltip"],
          #${chartId} [class*="Tooltip"],
          .sciChart__tooltip,
          .scichart__tooltip,
          .sciChartTooltip,
          .scichartTooltip,
          div[class*="tooltip"],
          div[class*="Tooltip"] {
            background-color: #121212 !important;
            color: white !important;
            border-radius: 6px !important;
            padding: 8px !important;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5) !important;
            border-left: 4px solid #f97316 !important;
            font-weight: bold !important;
            font-size: 14px !important;
            z-index: 9999 !important;
          }
        `
      }} />
      
      <div className="text-sm text-center text-gray-500">
        <p>Drag to pan • Use mouse wheel to zoom • Double-click to reset view • Hover for details</p>
        {processedData && processedData.length > 0 ? (
          <>
            <p className="text-xs mt-1">Showing {processedData.length} bars {removeGaps ? "(with compressed time)" : "(with actual timestamps)"}</p>
            {removeGaps && (
              <p className="text-xs italic">Non-trading periods (weekends/holidays) are compressed to show continuous price action</p>
            )}
          </>
        ) : (
          <p className="text-xs mt-1 text-red-500">No data available</p>
        )}
      </div>
    </div>
  );
};

export default TrendChart; 