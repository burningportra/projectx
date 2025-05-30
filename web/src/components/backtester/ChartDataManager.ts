import { BacktestBarData, SubBarData } from '@/lib/types/backtester';
import { UTCTimestamp, CandlestickData } from 'lightweight-charts';

export interface ChartDataPoint extends CandlestickData {
  originalIndex: number;
  isDecimated?: boolean;
}

export interface ViewportData {
  startIndex: number;
  endIndex: number;
  decimationLevel: number;
  data: ChartDataPoint[];
}

export class ChartDataManager {
  private rawData: BacktestBarData[] = [];
  private decimatedCache: Map<number, ChartDataPoint[]> = new Map();
  private viewportCache: Map<string, ViewportData> = new Map();
  private maxCacheSize = 10; // Limit cache size to prevent memory bloat
  
  // Performance thresholds
  private readonly DECIMATION_THRESHOLD = 5000; // Start decimating after 5k points
  private readonly MAX_VISIBLE_POINTS = 2000; // Never show more than 2k points
  private readonly VIEWPORT_BUFFER = 0.2; // 20% buffer on each side

  // Cache for progressive data optimization
  private lastProgressiveDataCache: ChartDataPoint[] | null = null;
  private lastProgressiveMainBarIndex: number = -1;
  private lastProgressiveNumSubBarsLength: number = -1; // Tracks the length of the subBars array
  private lastProgressiveSubBarIndex: number = -1;

  constructor() {}

  /**
   * Set the raw bar data and clear caches
   */
  setData(bars: BacktestBarData[]): void {
    this.rawData = bars;
    this.clearCaches(); // This will also clear progressive cache
  }

  /**
   * Get optimized data for a specific viewport
   */
  getViewportData(
    startTime: number,
    endTime: number,
    availableWidth: number,
    pixelsPerPoint: number = 6
  ): ViewportData {
    const cacheKey = `${startTime}-${endTime}-${availableWidth}-${pixelsPerPoint}`;
    
    // Check cache first
    if (this.viewportCache.has(cacheKey)) {
      return this.viewportCache.get(cacheKey)!;
    }

    // Calculate optimal decimation level
    const maxPoints = Math.floor(availableWidth / pixelsPerPoint);
    const actualMaxPoints = Math.min(maxPoints, this.MAX_VISIBLE_POINTS);
    
    // Find data indices for the viewport
    const startIndex = this.findTimeIndex(startTime, true);
    const endIndex = this.findTimeIndex(endTime, false);
    const dataPointsInRange = endIndex - startIndex + 1;
    
    // Calculate decimation level
    const decimationLevel = dataPointsInRange > actualMaxPoints 
      ? Math.ceil(dataPointsInRange / actualMaxPoints)
      : 1;

    // Add viewport buffer
    const bufferSize = Math.floor((endIndex - startIndex) * this.VIEWPORT_BUFFER);
    const bufferedStartIndex = Math.max(0, startIndex - bufferSize);
    const bufferedEndIndex = Math.min(this.rawData.length - 1, endIndex + bufferSize);

    // Get decimated data
    const data = this.getDecimatedData(bufferedStartIndex, bufferedEndIndex, decimationLevel);
    
    const viewportData: ViewportData = {
      startIndex: bufferedStartIndex,
      endIndex: bufferedEndIndex,
      decimationLevel,
      data
    };

    // Cache the result (with size limit)
    this.cacheViewportData(cacheKey, viewportData);
    
    return viewportData;
  }

  /**
   * Get all data with optimal decimation for full chart view
   */
  getOptimizedFullData(availableWidth: number, pixelsPerPoint: number = 6): ChartDataPoint[] {
    if (this.rawData.length === 0) return [];

    const maxPoints = Math.floor(availableWidth / pixelsPerPoint);
    const actualMaxPoints = Math.min(maxPoints, this.MAX_VISIBLE_POINTS);
    
    if (this.rawData.length <= actualMaxPoints) {
      // No decimation needed
      return this.convertToChartData(this.rawData, 0, this.rawData.length - 1, 1);
    }

    const decimationLevel = Math.ceil(this.rawData.length / actualMaxPoints);
    return this.getDecimatedData(0, this.rawData.length - 1, decimationLevel);
  }

  /**
   * Get data for progressive bar formation (optimized for real-time updates)
   */
  getProgressiveData(
    currentBarIndex: number,
    currentSubBarIndex: number,
    subBars: SubBarData[],
    // availableWidth: number // This parameter is not currently used but kept for potential future use
  ): ChartDataPoint[] {
    const currentMainBar = this.rawData[currentBarIndex];

    // Check if we can do an optimized update (only the last forming bar changes)
    const canOptimize = 
      this.lastProgressiveDataCache &&
      this.lastProgressiveMainBarIndex === currentBarIndex &&
      this.lastProgressiveNumSubBarsLength === subBars.length && // Ensures subBars array reference hasn't changed drastically
      currentMainBar; // Ensure currentMainBar is available

    let dataToReturn: ChartDataPoint[];

    if (canOptimize && this.lastProgressiveDataCache) {
      dataToReturn = this.lastProgressiveDataCache; // Work on the cached array (it will be copied before returning)
      const lastPointIndex = dataToReturn.length - 1;

      if (lastPointIndex >= 0) {
        const subBarsForCurrentMain = subBars.filter(
          subBar => subBar.parentBarIndex === currentBarIndex
        );
        
        if (subBarsForCurrentMain.length > 0) {
          const subBarsToInclude = subBarsForCurrentMain.slice(0, currentSubBarIndex + 1);
          if (subBarsToInclude.length > 0) {
            const formingBar: ChartDataPoint = {
              time: currentMainBar.time as UTCTimestamp,
              open: subBarsToInclude[0].open,
              high: Math.max(...subBarsToInclude.map(sb => sb.high)),
              low: Math.min(...subBarsToInclude.map(sb => sb.low)),
              close: subBarsToInclude[subBarsToInclude.length - 1].close,
              originalIndex: currentBarIndex,
              isDecimated: false
            };
            dataToReturn[lastPointIndex] = formingBar;
          }
        } else if (dataToReturn[lastPointIndex]?.originalIndex === currentBarIndex) {
            // No sub-bars for the current main bar, ensure the main bar is displayed as complete
            dataToReturn[lastPointIndex] = {
                time: currentMainBar.time as UTCTimestamp,
                open: currentMainBar.open,
                high: currentMainBar.high,
                low: currentMainBar.low,
                close: currentMainBar.close,
                originalIndex: currentBarIndex,
                isDecimated: false
            };
        }
      }
    } else {
      // Full rebuild path
      const recentBarsToShow = Math.min(500, currentBarIndex + 1);
      const startIndex = Math.max(0, currentBarIndex - recentBarsToShow + 1);
      
      dataToReturn = this.convertToChartData(
        this.rawData.slice(startIndex, currentBarIndex + 1),
        startIndex,
        currentBarIndex, // should be currentBarIndex - startIndex for length, but convertToChartData handles originalIndex
        1 // No decimation for the progressive part
      );

      if (currentMainBar && subBars.length > 0) {
        const subBarsForCurrentMain = subBars.filter(
          subBar => subBar.parentBarIndex === currentBarIndex
        );
        
        if (subBarsForCurrentMain.length > 0) {
          const subBarsToInclude = subBarsForCurrentMain.slice(0, currentSubBarIndex + 1);
          if (subBarsToInclude.length > 0) {
            const formingBar: ChartDataPoint = {
              time: currentMainBar.time as UTCTimestamp,
              open: subBarsToInclude[0].open,
              high: Math.max(...subBarsToInclude.map(sb => sb.high)),
              low: Math.min(...subBarsToInclude.map(sb => sb.low)),
              close: subBarsToInclude[subBarsToInclude.length - 1].close,
              originalIndex: currentBarIndex,
              isDecimated: false
            };
            
            if (dataToReturn.length > 0 && dataToReturn[dataToReturn.length-1].originalIndex === currentBarIndex) {
              dataToReturn[dataToReturn.length - 1] = formingBar;
            } else if (dataToReturn.length === 0 || dataToReturn[dataToReturn.length-1].originalIndex < currentBarIndex) {
              // This case implies currentBarIndex is a new bar not yet in dataToReturn, or dataToReturn is empty.
              // If currentBarIndex was sliced into dataToReturn, it should be the last item.
              // This might indicate an edge case or an empty initial slice.
              dataToReturn.push(formingBar); 
            }
          }
        }
      }      
      this.lastProgressiveDataCache = [...dataToReturn]; // Store a copy for the next potential optimization
    }
    
    // Update state for next optimization check
    this.lastProgressiveMainBarIndex = currentBarIndex;
    this.lastProgressiveSubBarIndex = currentSubBarIndex;
    this.lastProgressiveNumSubBarsLength = subBars.length;
    
    return [...dataToReturn]; // Return a new array reference for React/Lightweight Charts
  }

  /**
   * Find the index of a bar closest to the given time
   */
  private findTimeIndex(targetTime: number, findStart: boolean): number {
    if (this.rawData.length === 0) return 0;
    
    let left = 0;
    let right = this.rawData.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTime = this.rawData[mid].time;
      
      if (midTime === targetTime) {
        return mid;
      } else if (midTime < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    // Return the closest index
    if (findStart) {
      return Math.max(0, Math.min(left, this.rawData.length - 1));
    } else {
      return Math.max(0, Math.min(right, this.rawData.length - 1));
    }
  }

  /**
   * Get decimated data from cache or calculate it
   */
  private getDecimatedData(startIndex: number, endIndex: number, decimationLevel: number): ChartDataPoint[] {
    if (decimationLevel <= 1 && startIndex === 0 && endIndex === this.rawData.length -1) {
        // If no decimation and full range, try cache level 1 or convert full
        if (this.decimatedCache.has(1)) {
            return this.decimatedCache.get(1)!;
        }
        const fullData = this.convertToChartData(this.rawData, 0, this.rawData.length - 1, 1);
        this.decimatedCache.set(1, fullData);
        return fullData.slice(startIndex, endIndex + 1);
    }

    const cacheKey = decimationLevel;
    if (this.decimatedCache.has(cacheKey)) {
      const cachedData = this.decimatedCache.get(cacheKey)!;
      // Calculate slice indices based on the decimated data length
      const decimatedStartIndex = Math.floor(startIndex / decimationLevel);
      const decimatedEndIndex = Math.ceil(endIndex / decimationLevel);
      return cachedData.slice(decimatedStartIndex, decimatedEndIndex + 1);
    }

    const decimatedData = this.calculateDecimatedData(decimationLevel);
    this.decimatedCache.set(cacheKey, decimatedData);
    
    const decimatedStartIndex = Math.floor(startIndex / decimationLevel);
    const decimatedEndIndex = Math.ceil(endIndex / decimationLevel);
    return decimatedData.slice(decimatedStartIndex, decimatedEndIndex + 1);
  }

  /**
   * Calculate decimated data using Douglas-Peucker-inspired algorithm
   */
  private calculateDecimatedData(decimationLevel: number): ChartDataPoint[] {
    if (decimationLevel <= 1) {
      return this.convertToChartData(this.rawData, 0, this.rawData.length - 1, 1);
    }

    const decimatedData: ChartDataPoint[] = [];
    
    for (let i = 0; i < this.rawData.length; i += decimationLevel) {
      const endIdx = Math.min(i + decimationLevel - 1, this.rawData.length - 1);
      const group = this.rawData.slice(i, endIdx + 1);
      
      if (group.length === 0) continue;
      
      // Create OHLC from the group
      const decimatedPoint: ChartDataPoint = {
        time: group[0].time as UTCTimestamp,
        open: group[0].open,
        high: Math.max(...group.map(bar => bar.high)),
        low: Math.min(...group.map(bar => bar.low)),
        close: group[group.length - 1].close,
        originalIndex: i,
        isDecimated: decimationLevel > 1
      };
      
      decimatedData.push(decimatedPoint);
    }
    
    return decimatedData;
  }

  /**
   * Convert raw bar data to chart data format
   */
  private convertToChartData(
    bars: BacktestBarData[],
    startIndexInRawData: number, // The actual index in this.rawData for bars[0]
    endIndexInRawData: number, // The actual index in this.rawData for bars[bars.length-1]
    decimationLevel: number
  ): ChartDataPoint[] {
    return bars.map((bar, relativeIndex) => ({
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      originalIndex: startIndexInRawData + relativeIndex, // Correct original index
      isDecimated: decimationLevel > 1
    }));
  }

  /**
   * Cache viewport data with size limit
   */
  private cacheViewportData(key: string, data: ViewportData): void {
    if (this.viewportCache.size >= this.maxCacheSize) {
      // Remove oldest cache entry
      const iterator = this.viewportCache.keys();
      const firstResult = iterator.next();
      if (!firstResult.done && firstResult.value) {
        this.viewportCache.delete(firstResult.value);
      }
    }
    this.viewportCache.set(key, data);
  }

  /**
   * Clear all caches
   */
  private clearCaches(): void {
    this.decimatedCache.clear();
    this.viewportCache.clear();
    this.lastProgressiveDataCache = null;
    this.lastProgressiveMainBarIndex = -1;
    this.lastProgressiveSubBarIndex = -1;
    this.lastProgressiveNumSubBarsLength = -1;
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    rawDataPoints: number;
    decimatedCacheEntries: number;
    viewportCacheEntries: number;
    estimatedMemoryMB: number;
  } {
    const rawDataPoints = this.rawData.length;
    const decimatedCacheEntries = this.decimatedCache.size;
    const viewportCacheEntries = this.viewportCache.size;
    
    // Rough estimate: each data point ~100 bytes
    const estimatedMemoryMB = (rawDataPoints * 100 + 
      Array.from(this.decimatedCache.values()).reduce((sum, arr) => sum + arr.length * 100, 0) +
      Array.from(this.viewportCache.values()).reduce((sum, vp) => sum + vp.data.length * 100, 0)
    ) / (1024 * 1024);
    
    return {
      rawDataPoints,
      decimatedCacheEntries,
      viewportCacheEntries,
      estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100
    };
  }

  /**
   * Force cache cleanup (useful for memory management)
   */
  cleanup(): void {
    this.clearCaches();
  }
} 