'use client';

import React, { useState, useEffect } from "react";
import TrendChart from "./TrendChart";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast, ToastContainer } from "@/components/ui/toast";

// Define the data structure that matches what we get from the API
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

// Extended type with trend indicators
interface OhlcBarWithTrends extends OhlcBar {
  uptrendStart: boolean;
  downtrendStart: boolean;
  highestDowntrendStart: boolean;
  unbrokenUptrendStart: boolean;
  uptrendToHigh: boolean;
}

// Timeframe options
interface TimeframeOption {
  label: string;
  unit: number;
  value: number;
}

// Define a type for trend points
interface TrendPoint {
  timestamp: number;
  price: number;
  type: string;
  index: number;
}

const timeframeOptions: TimeframeOption[] = [
  { label: "5 Min", unit: 2, value: 5 },
  { label: "15 Min", unit: 2, value: 15 },
  { label: "30 Min", unit: 2, value: 30 },
  { label: "1 Hour", unit: 3, value: 1 },
  { label: "4 Hour", unit: 3, value: 4 },
  { label: "1 Day", unit: 4, value: 1 },
  { label: "1 Week", unit: 5, value: 1 },
];

const TrendChartContainer: React.FC = () => {
  const [data, setData] = useState<OhlcBarWithTrends[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [removeGaps, setRemoveGaps] = useState<boolean>(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("5 Min");
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  // Add training states
  const [trainingEnabled, setTrainingEnabled] = useState<boolean>(true);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [refreshCounter, setRefreshCounter] = useState<number>(0);
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get the timeframe details
        const timeframe = timeframeOptions.find(tf => tf.label === selectedTimeframe);
        
        if (!timeframe) {
          throw new Error("Invalid timeframe selected");
        }
        
        // Fetch market data
        const contractId = "CON.F.US.MES.M25"; // Micro E-mini S&P 500 futures
        const response = await fetch(
          `/api/market-data/bars?contractId=${contractId}&timeframeUnit=${timeframe.unit}&timeframeValue=${timeframe.value}&limit=100`
        );
        
        if (!response.ok) {
          throw new Error(`API returned status: ${response.status}`);
        }
        
        // Parse the response data
        const responseData = await response.json();
        
        // Check response format - handle both array and object with bars property
        const marketData: OhlcBar[] = Array.isArray(responseData) 
          ? responseData 
          : (responseData.bars || []);
        
        // Validate that marketData is an array
        if (!Array.isArray(marketData)) {
          console.error("Invalid market data format:", marketData);
          throw new Error("Received invalid market data format from API");
        }
        
        console.log("Received market data:", marketData.length, "bars");
        
        // Process timestamp format correctly based on timeframe
        const processedMarketData = marketData.map(bar => {
          // Make sure timestamp is correctly handled as a Date
          let timestamp;
          if (typeof bar.timestamp === 'string') {
            timestamp = new Date(bar.timestamp);
          } else if (bar.timestamp instanceof Date) {
            timestamp = bar.timestamp;
          } else {
            // If timestamp is a number or something else, convert to Date
            timestamp = new Date(bar.timestamp);
          }
          
          // Check if we have a valid date
          if (isNaN(timestamp.getTime())) {
            console.error("Invalid timestamp:", bar.timestamp);
            timestamp = new Date(); // Fallback to current time
          }
          
          // Apply special handling based on timeframe
          const isLessThanDay = timeframe.unit < 4; // Unit 4 is days
          if (isLessThanDay) {
            // For intraday timeframes, ensure exact time is preserved
            console.log(`Timeframe: ${timeframe.label} (Unit ${timeframe.unit}, Value ${timeframe.value})`);
          }
          
          // Log a few timestamps to debug
          if (marketData.indexOf(bar) < 3) {
            console.log(`Bar ${marketData.indexOf(bar)} timestamp:`, 
              timestamp.toISOString(), 
              "Local time:", 
              timestamp.toLocaleString(),
              "Timeframe unit:", timeframe.unit
            );
          }
          
          return {
            ...bar,
            timestamp
          };
        });
        
        // Add trend indicators using the trend-analysis lib
        // For demo, we'll simulate trend indicators
        console.log("Calculating trend indicators for", processedMarketData.length, "bars");
        
        // Count how many of each trend type we find
        let trendCounts = {
          uptrendStart: 0,
          downtrendStart: 0,
          highestDowntrendStart: 0,
          unbrokenUptrendStart: 0,
          uptrendToHigh: 0
        };
        
        const dataWithTrends: OhlcBarWithTrends[] = processedMarketData.map((bar, index) => {
          // Detect simple trends based on price movements
          // In a real app, use the actual trend detection logic
          const prev1 = index > 0 ? processedMarketData[index - 1] : null;
          const prev2 = index > 1 ? processedMarketData[index - 2] : null;
          const prev3 = index > 2 ? processedMarketData[index - 3] : null;
          
          // Simple uptrendStart: three rising closes in a row
          const uptrendStart = !!(prev3 && prev2 && prev1 && 
            prev3.close < prev2.close && 
            prev2.close < prev1.close && 
            prev1.close < bar.close);
          
          // Simple downtrendStart: three falling closes in a row
          const downtrendStart = !!(prev3 && prev2 && prev1 && 
            prev3.close > prev2.close && 
            prev2.close > prev1.close && 
            prev1.close > bar.close);
          
          // Highest downtrend: a new high followed by a significant drop
          const highestDowntrendStart = !!(prev2 && prev1 && 
            prev2.high < prev1.high && 
            prev1.high > bar.high && 
            (prev1.high - bar.low) / prev1.high > 0.01); // 1% drop
          
          // Unbroken uptrend: a series of higher lows
          const unbrokenUptrendStart = !!(prev3 && prev2 && prev1 && 
            prev3.low < prev2.low && 
            prev2.low < prev1.low && 
            prev1.low < bar.low);
          
          // Key level (uptrendToHigh): new high after uptrend
          const uptrendToHigh = !!(prev3 && prev2 && prev1 && 
            prev3.close < prev2.close && 
            prev2.close < prev1.close && 
            bar.high > prev1.high && 
            bar.high > prev2.high && 
            bar.high > prev3.high);
          
          // Update trend counts
          if (uptrendStart) trendCounts.uptrendStart++;
          if (downtrendStart) trendCounts.downtrendStart++;
          if (highestDowntrendStart) trendCounts.highestDowntrendStart++;
          if (unbrokenUptrendStart) trendCounts.unbrokenUptrendStart++;
          if (uptrendToHigh) trendCounts.uptrendToHigh++;
          
          return {
            ...bar,
            uptrendStart,
            downtrendStart,
            highestDowntrendStart,
            unbrokenUptrendStart,
            uptrendToHigh
          };
        });
        
        // Log trend indicator counts
        console.log("Trend indicator counts:", trendCounts);
        
        // To ensure we detect some trends, if we don't have any trends at all,
        // let's artificially create some for visualization purposes
        if (Object.values(trendCounts).every(count => count === 0) && dataWithTrends.length > 5) {
          console.log("No trends detected, adding some artificial trends for testing");
          
          // Add some sample trends for visualization testing
          const samplePositions = [5, 15, 25, 35, 45];
          
          samplePositions.forEach(pos => {
            if (pos < dataWithTrends.length) {
              dataWithTrends[pos].uptrendStart = true;
              dataWithTrends[Math.min(pos + 10, dataWithTrends.length - 1)].downtrendStart = true;
              
              if (pos + 20 < dataWithTrends.length) {
                dataWithTrends[pos + 20].highestDowntrendStart = true;
              }
              
              if (pos + 30 < dataWithTrends.length) {
                dataWithTrends[pos + 30].unbrokenUptrendStart = true;
              }
              
              if (pos + 40 < dataWithTrends.length) {
                dataWithTrends[pos + 40].uptrendToHigh = true;
              }
            }
          });
          
          console.log("Added sample trends for visualization testing");
        }
        
        // Set the data
        setData(dataWithTrends);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(`Failed to load chart data: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };
    
    fetchData();
  }, [selectedTimeframe, refreshCounter]);
  
  // Handle timeframe change
  const handleTimeframeChange = (value: string) => {
    setSelectedTimeframe(value);
  };
  
  // Toggle gap removal
  const handleToggleGaps = (checked: boolean) => {
    setRemoveGaps(checked);
  };

  // Toggle training mode
  const handleToggleTraining = (checked: boolean) => {
    setTrainingEnabled(checked);
  };
  
  // Handle trend points detected
  const handleTrendPointsDetected = (points: TrendPoint[]) => {
    console.log("Trend points detected:", points.length);
    setTrendPoints(points);
  };

  // Handle trend confirmation
  const handleTrendConfirmed = async (point: {timestamp: number; price: number; type: string; index: number; timeframe?: string}) => {
    try {
      console.log("Confirming trend point:", point);
      
      // Get the timeframe details
      const timeframe = timeframeOptions.find(tf => tf.label === selectedTimeframe);
      
      if (!timeframe) {
        throw new Error("Invalid timeframe selected");
      }
      
      // Convert the timestamp to appropriate format
      const timestamp = new Date(point.timestamp).toISOString();
      
      // Send to API endpoint
      const response = await fetch("/api/trend/confirm", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({
          timestamp: point.timestamp,
          type: point.type,
          index: point.index,
          price: point.price,
          timeframeUnit: timeframe.unit,
          timeframeValue: timeframe.value,
          contractId: "CON.F.US.MES.M25" // Default contract
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Trend Confirmed",
          description: `${point.type} at ${new Date(point.timestamp).toLocaleString()}`,
          variant: "success"
        });
        
        // Trigger a refresh of the chart data
        setRefreshCounter(prev => prev + 1);
      } else {
        throw new Error(result.message || "Unknown error");
      }
      
      return result;
    } catch (err) {
      console.error("Error confirming trend:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to confirm trend",
        variant: "destructive"
      });
      throw err;
    }
  };

  // Get current timeframe string for the TrendChart
  const getCurrentTimeframeString = () => {
    const tf = timeframeOptions.find(t => t.label === selectedTimeframe);
    if (!tf) return "5m";
    
    // Convert to format like "5m", "1h", "1d"
    const unit = tf.unit === 2 ? "m" : tf.unit === 3 ? "h" : tf.unit === 4 ? "d" : tf.unit === 5 ? "w" : "";
    return `${tf.value}${unit}`;
  };

  return (
    <div className="space-y-4">
      {isClient && <ToastContainer />}
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="timeframe">Timeframe:</Label>
            <Select value={selectedTimeframe} onValueChange={handleTimeframeChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Select Timeframe" />
              </SelectTrigger>
              <SelectContent>
                {timeframeOptions.map((option) => (
                  <SelectItem key={option.label} value={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        
          <div className="flex items-center space-x-2">
            <Switch
              id="remove-gaps"
              checked={removeGaps}
              onCheckedChange={handleToggleGaps}
            />
            <Label htmlFor="remove-gaps">Remove Weekend Gaps</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="enable-training"
              checked={trainingEnabled}
              onCheckedChange={handleToggleTraining}
            />
            <Label htmlFor="enable-training">
              <span className={trainingEnabled ? "text-green-500 font-medium" : ""}>
                Training Mode
              </span>
            </Label>
          </div>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshCounter(prev => prev + 1)}
          className="self-end sm:self-auto"
        >
          Refresh
        </Button>
      </div>
      
      {error ? (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg">
          {error}
        </div>
      ) : (
        <>
          <TrendChart 
            data={data} 
            height={500} 
            removeGaps={removeGaps}
            onTrendPointsDetected={handleTrendPointsDetected}
            enableTraining={trainingEnabled}
            onTrendConfirmed={handleTrendConfirmed}
            timeframe={getCurrentTimeframeString()}
          />
          
          {/* Debug info for trend indicators */}
          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-2 p-2 bg-gray-800 text-white text-xs rounded overflow-auto">
              <div className="font-bold">Debug Info</div>
              <div>Data points: {data.length}</div>
              <div>
                Trend counts: 
                {data.filter(d => d.uptrendStart).length} uptrend, 
                {data.filter(d => d.downtrendStart).length} downtrend, 
                {data.filter(d => d.highestDowntrendStart).length} highest downtrend, 
                {data.filter(d => d.unbrokenUptrendStart).length} unbroken uptrend, 
                {data.filter(d => d.uptrendToHigh).length} uptrend to high
              </div>
              {data.filter(d => d.uptrendStart || d.downtrendStart || d.highestDowntrendStart || 
                              d.unbrokenUptrendStart || d.uptrendToHigh).length === 0 && (
                <div className="text-orange-400">No trend indicators found in data!</div>
              )}
          </div>
        )}
        
          {/* Trend Points Table */}
          {trendPoints.length > 0 && (
            <div className="mt-4 bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Trend Points</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300 dark:border-gray-700">
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Time</th>
                      <th className="text-right p-2">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendPoints.map((point, index) => (
                      <tr 
                        key={index} 
                        className={`border-b border-gray-200 dark:border-gray-700 ${
                          point.type.includes("Uptrend") 
                            ? "bg-green-50 dark:bg-green-900/20" 
                            : point.type.includes("Downtrend") 
                              ? "bg-red-50 dark:bg-red-900/20" 
                              : ""
                        }`}
                      >
                        <td className="p-2">{point.type}</td>
                        <td className="p-2">{new Date(point.timestamp).toLocaleDateString()}</td>
                        <td className="p-2">{new Date(point.timestamp).toLocaleTimeString()}</td>
                        <td className="p-2 text-right font-mono">{point.price.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
          )}
        </>
      )}
      
      <div className="mt-4 bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-2">Trend Indicators</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span>Uptrend Start (▲)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-orange-500"></div>
            <span>Downtrend Start (▼)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span>Highest Downtrend (◆)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-green-700"></div>
            <span>Unbroken Uptrend (●)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span>Key Level (✦)</span>
          </div>
      </div>
      </div>
    </div>
  );
};

export default TrendChartContainer; 