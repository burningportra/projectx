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

/**
 * Calculate whether a bar shows the start of an uptrend
 */
function isUptrendStart(
  currentClose: number,
  currentOpen: number,
  currentLow: number,
  prevClose: number,
  prevOpen: number,
  prevLow: number,
  prev2Low: number,
  prev2Close: number,
  prev3Low: number,
  prev3Close: number
): boolean {
  // Previous candle is bearish
  const condition1 = prevClose < prevOpen;
  
  // Low point test
  const condition2 = 
    prevLow < prev2Low || 
    prevLow < prev2Close || 
    prevLow < prev3Low || 
    prevLow < prev3Close;
  
  // Current price relation
  const condition3 = prevLow < currentLow || prevLow < currentClose;
  
  // Price movement
  const condition4 = currentClose > prevClose;
  
  return condition1 && condition2 && condition3 && condition4;
}

/**
 * Calculate whether a bar shows the start of a downtrend
 */
function isDowntrendStart(
  currentClose: number,
  currentOpen: number,
  currentHigh: number,
  prevClose: number,
  prevOpen: number,
  prevHigh: number,
  prev2High: number,
  prev2Close: number,
  prev3High: number,
  prev3Close: number
): boolean {
  // Previous candle is bullish
  const condition1 = prevClose > prevOpen;
  
  // High point test
  const condition2 = 
    prevHigh > prev2High || 
    prevHigh > prev2Close || 
    prevHigh > prev3High || 
    prevHigh > prev3Close;
  
  // Current price relation
  const condition3 = prevHigh > currentHigh || prevHigh > currentClose;
  
  // Price movement
  const condition4 = currentClose < prevClose;
  
  return condition1 && condition2 && condition3 && condition4;
}

interface OhlcBarWithTrends extends OhlcBar {
  uptrendStart: boolean;
  downtrendStart: boolean;
  highestDowntrendStart: boolean;
  unbrokenUptrendStart: boolean;
  uptrendToHigh: boolean;
}

/**
 * Calculate trend indicators for a series of OHLC bars
 */
export function calculateTrendIndicators(bars: OhlcBar[]): OhlcBarWithTrends[] {
  if (bars.length < 4) {
    // Need at least 4 bars for trend detection
    return bars.map((bar) => ({
      ...bar,
      uptrendStart: false,
      downtrendStart: false,
      highestDowntrendStart: false,
      unbrokenUptrendStart: false,
      uptrendToHigh: false,
    }));
  }

  // Initialize result array with basic indicators
  const result = bars.map((bar, i) => {
    const current = bar;
    
    // Default values for first 3 bars which can't have trend starts
    if (i < 3) {
      return {
        ...bar,
        uptrendStart: false,
        downtrendStart: false,
        highestDowntrendStart: false,
        unbrokenUptrendStart: false,
        uptrendToHigh: false,
      };
    }
    
    // Get previous bars
    const prev1 = bars[i - 1];
    const prev2 = bars[i - 2];
    const prev3 = bars[i - 3];
    
    // Calculate trend starts
    const uptrendStart = isUptrendStart(
      current.close,
      current.open,
      current.low,
      prev1.close,
      prev1.open,
      prev1.low,
      prev2.low,
      prev2.close,
      prev3.low,
      prev3.close
    );
    
    const downtrendStart = isDowntrendStart(
      current.close,
      current.open,
      current.high,
      prev1.close,
      prev1.open,
      prev1.high,
      prev2.high,
      prev2.close,
      prev3.high,
      prev3.close
    );
    
    return {
      ...bar,
      uptrendStart,
      downtrendStart,
      highestDowntrendStart: false, // Will calculate in next step
      unbrokenUptrendStart: false,  // Will calculate in next step
      uptrendToHigh: false,         // Will calculate in next step
    };
  });
  
  // Track completed trends
  const completedTrends: { 
    startIndex: number; 
    endIndex: number; 
    startPrice: number; 
    endPrice: number;
    isUptrend: boolean; 
  }[] = [];
  
  // Find trend segments
  let prevTrendBar: number | null = null;
  let prevTrendPrice: number | null = null;
  let prevTrendIsUp: boolean | null = null;
  
  // Process trends
  for (let i = 3; i < result.length; i++) {
    if (result[i].uptrendStart || result[i].downtrendStart) {
      const currentBar = i;
      
      // Determine trend price (low for uptrend, high for downtrend)
      let currentPrice: number;
      let currentIsUp: boolean;
      
      if (result[i].uptrendStart) {
        currentPrice = result[i].low;
        currentIsUp = true;
      } else {
        currentPrice = result[i].high;
        currentIsUp = false;
      }
      
      // Check for consecutive uptrends
      const consecutiveUptrend = (prevTrendIsUp && currentIsUp);
      
      // If we have a previous trend, complete it
      if (prevTrendPrice !== null && prevTrendBar !== null && !consecutiveUptrend) {
        completedTrends.push({
          startIndex: prevTrendBar,
          endIndex: currentBar,
          startPrice: prevTrendPrice,
          endPrice: currentPrice,
          isUptrend: prevTrendIsUp!
        });
      }
      
      // Only update previous trend if not consecutive uptrends
      if (!consecutiveUptrend) {
        prevTrendBar = currentBar;
        prevTrendPrice = currentPrice;
        prevTrendIsUp = currentIsUp;
      }
    }
  }
  
  // Calculate advanced indicators if we have enough completed trends
  if (completedTrends.length >= 2) {
    // Find highest downtrend start
    let highestDowntrendStartPrice = -Infinity;
    let highestDowntrendStartIndex = -1;
    
    // Find lowest unbroken uptrend start
    let lowestUnbrokenUptrendPrice = Infinity;
    let unbrokenUptrendStartIndex = -1;
    
    // Find uptrend with highest end price
    let highestEndPrice = -Infinity;
    let highestEndUptrendIndex = -1;
    
    // Process completed trends
    for (let i = 0; i < completedTrends.length; i++) {
      const trend = completedTrends[i];
      const isUptrend = trend.isUptrend;
      
      // Find highest downtrend start
      if (!isUptrend && trend.startPrice > highestDowntrendStartPrice) {
        highestDowntrendStartPrice = trend.startPrice;
        highestDowntrendStartIndex = trend.startIndex;
      }
      
      // Find uptrend with highest end price
      if (isUptrend && trend.endPrice > highestEndPrice) {
        highestEndPrice = trend.endPrice;
        highestEndUptrendIndex = trend.startIndex;
      }
      
      // Check for unbroken uptrend
      if (i < completedTrends.length - 1 && isUptrend
          && trend.startPrice < lowestUnbrokenUptrendPrice
          && trend.endPrice > completedTrends[i+1].startPrice) {
        lowestUnbrokenUptrendPrice = trend.startPrice;
        unbrokenUptrendStartIndex = trend.startIndex;
      }
    }
    
    // Mark key levels in the result
    if (highestDowntrendStartIndex >= 0) {
      result[highestDowntrendStartIndex].highestDowntrendStart = true;
    }
    
    if (unbrokenUptrendStartIndex >= 0) {
      result[unbrokenUptrendStartIndex].unbrokenUptrendStart = true;
    }
    
    if (highestEndUptrendIndex >= 0) {
      result[highestEndUptrendIndex].uptrendToHigh = true;
    }
  }
  
  return result;
} 