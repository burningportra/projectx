'use client';

import React, { useState, useEffect, useCallback } from "react";
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

// Define props interface for TrendChartContainer
interface TrendChartContainerProps {
  enableTraining?: boolean;
  onTrendPointsDetected?: (points: TrendPoint[]) => void;
  onTrendConfirmed?: (point: {timestamp: number; price: number; type: string; index: number; timeframe?: string}) => Promise<any>;
  onTrendRemoved?: (point: {timestamp: number; type: string; index: number; timeframe?: string}) => Promise<any>;
  selectedTimeframe?: string;
  onTimeframeChange?: (timeframe: string) => void;
  selectedContract?: string;
  onContractChange?: (contract: string) => void;
  onDataUpdated?: (data: OhlcBarWithTrends[]) => void;
  refreshTrigger?: number;
}

const TrendChartContainer: React.FC<TrendChartContainerProps> = ({ 
  enableTraining: externalEnableTraining, 
  onTrendPointsDetected: externalOnTrendPointsDetected,
  onTrendConfirmed: externalOnTrendConfirmed,
  onTrendRemoved: externalOnTrendRemoved,
  selectedTimeframe: externalSelectedTimeframe,
  onTimeframeChange,
  selectedContract: externalSelectedContract,
  onContractChange,
  onDataUpdated,
  refreshTrigger = 0
}) => {
  const [data, setData] = useState<OhlcBarWithTrends[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [removeGaps, setRemoveGaps] = useState<boolean>(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(externalSelectedTimeframe || "5 Min");
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  // Add training states
  const [trainingEnabled, setTrainingEnabled] = useState<boolean>(externalEnableTraining ?? true);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [refreshCounter, setRefreshCounter] = useState<number>(0);
  const [isClient, setIsClient] = useState(false);
  // Add toggle for rule engine trend detection
  const [showRuleEngineTrends, setShowRuleEngineTrends] = useState<boolean>(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update training mode when prop changes
  useEffect(() => {
    if (externalEnableTraining !== undefined) {
      setTrainingEnabled(externalEnableTraining);
    }
  }, [externalEnableTraining]);

  // Update when external timeframe changes
  useEffect(() => {
    if (externalSelectedTimeframe) {
      // Convert external timeframe format (like "5m") to internal format (like "5 Min")
      // Get the suffix (last character)
      const unit = externalSelectedTimeframe.slice(-1);
      // Get the numeric part
      const value = externalSelectedTimeframe.slice(0, -1);
      
      // Log the values for debugging
      console.log(`Converting timeframe: value=${value}, unit=${unit}`);

      // Direct mapping to ensure we match exactly with available options
      if (externalSelectedTimeframe === "5m") {
        setSelectedTimeframe("5 Min");
      } 
      else if (externalSelectedTimeframe === "1m") {
        setSelectedTimeframe("1 Min");
      }
      else if (externalSelectedTimeframe === "15m") {
        setSelectedTimeframe("15 Min");
      }
      else if (externalSelectedTimeframe === "30m") {
        setSelectedTimeframe("30 Min");
      }
      else if (externalSelectedTimeframe === "1h") {
        setSelectedTimeframe("1 Hour");
      }
      else if (externalSelectedTimeframe === "4h") {
        setSelectedTimeframe("4 Hour");
      }
      else if (externalSelectedTimeframe === "1d") {
        setSelectedTimeframe("1 Day");
      }
      else if (externalSelectedTimeframe === "1w") {
        setSelectedTimeframe("1 Week");
      }
      else {
        console.warn(`Unknown timeframe format: ${externalSelectedTimeframe}, defaulting to 5 Min`);
        setSelectedTimeframe("5 Min");
      }
    }
  }, [externalSelectedTimeframe]);

  // Update when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      setRefreshCounter(prev => prev + 1);
    }
  }, [refreshTrigger]);

  // Add memoization for the timeframe finding function to prevent recreation on each render
  const getCurrentTimeframeString = useCallback(() => {
    console.log("Getting timeframe string for:", selectedTimeframe);
    console.log("Available timeframes:", timeframeOptions.map(tf => `${tf.label} (${tf.unit}-${tf.value})`));
    
    const tf = timeframeOptions.find(t => t.label === selectedTimeframe);
    if (!tf) {
      // If no match, try to convert from "5m" format directly
      if (selectedTimeframe?.endsWith('m')) {
        const minutes = parseInt(selectedTimeframe.slice(0, -1), 10);
        console.log(`Direct conversion from ${selectedTimeframe} to ${minutes}m`);
        return `${minutes}m`;
      }
      if (selectedTimeframe?.endsWith('h')) {
        const hours = parseInt(selectedTimeframe.slice(0, -1), 10);
        console.log(`Direct conversion from ${selectedTimeframe} to ${hours}h`);
        return `${hours}h`;
      }
      if (selectedTimeframe?.endsWith('d')) {
        const days = parseInt(selectedTimeframe.slice(0, -1), 10);
        console.log(`Direct conversion from ${selectedTimeframe} to ${days}d`);
        return `${days}d`;
      }
      
      // If no match and no direct conversion, use default
      console.warn(`No matching timeframe found for ${selectedTimeframe}, using default 5m`);
      return "5m";
    }
    
    // Convert from internal format (e.g., "5 Min") to API format (e.g., "5m")
    const unit = tf.unit === 2 ? "m" : tf.unit === 3 ? "h" : tf.unit === 4 ? "d" : tf.unit === 5 ? "w" : "";
    const apiTimeframe = `${tf.value}${unit}`;
    console.log(`Converted ${selectedTimeframe} to API timeframe: ${apiTimeframe}`);
    
    return apiTimeframe;
  }, [selectedTimeframe, timeframeOptions]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get the timeframe details
        const timeframe = timeframeOptions.find(tf => tf.label === selectedTimeframe);
        
        if (!timeframe) {
          console.error("Invalid timeframe selected:", selectedTimeframe);
          console.log("Available timeframes:", timeframeOptions.map(tf => tf.label));
          setError(`Invalid timeframe selected: ${selectedTimeframe}. Please try another option.`);
          setLoading(false);
          return; // Exit early instead of throwing
        }
        
        console.log("Selected timeframe:", selectedTimeframe);
        console.log("Mapped to:", timeframe);
        
        // Fetch market data
        const contractId = externalSelectedContract || "CON.F.US.MES.M25"; // Use selected contract or default
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
        console.log("First bar sample:", marketData[0]);
        
        // Process timestamp format correctly based on timeframe
        let processedMarketData = marketData.map(bar => {
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

        // Initialize with empty trend data
        processedMarketData = processedMarketData.map(bar => ({
          ...bar,
          uptrendStart: false,
          downtrendStart: false,
          highestDowntrendStart: false,
          unbrokenUptrendStart: false,
          uptrendToHigh: false
        })) as OhlcBarWithTrends[];

        console.log("Initialized bars with default trend indicators:", processedMarketData.length);

        // Now fetch trend points based on toggle state
        try {
          const timeframeString = getCurrentTimeframeString();
          console.log("Fetching trend points with timeframe:", timeframeString);
          
          // Log timeframeOptions and selectedTimeframe to debug
          console.log("Available timeframes:", timeframeOptions.map(tf => tf.label));
          console.log("Selected timeframe:", selectedTimeframe);
          
          // Make sure contractId is valid
          let finalContractId = contractId;
          if (!finalContractId) {
            console.error("Invalid contract ID for trend points fetch");
            finalContractId = "CON.F.US.MES.M25"; // Use default if none provided
          }

          // Only fetch if we have valid params
          if (timeframeString && finalContractId) {
            let trendPointsData;
            
            if (showRuleEngineTrends) {
              // Fetch trend points from rule engine detection
              const ruleEngineApiUrl = `/api/trend/detect?contractId=${encodeURIComponent(finalContractId)}&timeframe=${encodeURIComponent(timeframeString)}`;
              console.log("Rule engine API URL:", ruleEngineApiUrl);
              
              const ruleEngineTrendsResponse = await fetch(ruleEngineApiUrl);
              
              if (ruleEngineTrendsResponse.ok) {
                trendPointsData = await ruleEngineTrendsResponse.json();
                console.log("Fetched rule engine trend points:", trendPointsData);
                
                if (trendPointsData.data && trendPointsData.data.length > 0) {
                  console.log("First rule engine trend point sample:", trendPointsData.data[0]);
                } else {
                  console.warn("No rule engine trend points found in response");
                }
              } else {
                console.error(`Failed to fetch rule engine trends: ${ruleEngineTrendsResponse.status}`);
                console.log("Response text:", await ruleEngineTrendsResponse.text().catch(() => "Could not read response text"));
                // If fetching rule engine trends fails, switch back to saved trends
                toast({
                  title: "Warning",
                  description: "Failed to fetch rule engine trends, displaying saved trends instead",
                  variant: "destructive"
                });
                setShowRuleEngineTrends(false);
                
                // Fall back to saved trend points
                const savedTrendsApiUrl = `/api/trend-points?contractId=${encodeURIComponent(finalContractId)}&timeframe=${encodeURIComponent(timeframeString)}`;
                const savedTrendsResponse = await fetch(savedTrendsApiUrl);
                
                if (savedTrendsResponse.ok) {
                  trendPointsData = await savedTrendsResponse.json();
                }
              }
            } else {
              // Fetch saved trend points from database
              const apiUrl = `/api/trend-points?contractId=${encodeURIComponent(finalContractId)}&timeframe=${encodeURIComponent(timeframeString)}`;
              console.log("Trend points API URL:", apiUrl);

              // Use GET request with proper query parameters
              const trendPointsResponse = await fetch(apiUrl);
              
              if (trendPointsResponse.ok) {
                trendPointsData = await trendPointsResponse.json();
                console.log("Fetched saved trend points:", trendPointsData);
                
                if (trendPointsData.data && trendPointsData.data.length > 0) {
                  console.log("First saved trend point sample:", trendPointsData.data[0]);
                } else {
                  console.warn("No saved trend points found in response");
                }
              }
            }
            
            if (trendPointsData?.success && Array.isArray(trendPointsData.data)) {
              // Now apply the trend points from API
              console.log(`Applying ${trendPointsData.data.length} trend points from ${showRuleEngineTrends ? 'rule engine' : 'database'}`);
              
              let matchCount = 0;
              let mismatchCount = 0;
              
              trendPointsData.data.forEach((point: any) => {
                const timestamp = new Date(point.timestamp).getTime();
                
                // Log the timestamp we're looking for to match
                console.log(`Looking for bar matching trend point timestamp: ${new Date(timestamp).toISOString()}`);
                
                const bar = processedMarketData.find(b => {
                  const barTime = new Date(b.timestamp).getTime();
                  // Allow some tolerance for timestamp comparison (e.g. within same minute)
                  const isMatch = Math.abs(barTime - timestamp) < 60000;
                  if (isMatch) {
                    console.log(`Found matching bar at: ${new Date(barTime).toISOString()}`);
                  }
                  return isMatch;
                }) as OhlcBarWithTrends;
                
                if (bar) {
                  matchCount++;
                  console.log(`Marking trend point: ${point.type} at ${new Date(timestamp).toLocaleString()}`);
                  // Mark the appropriate trend type
                  if (point.type === 'uptrendStart') bar.uptrendStart = true;
                  else if (point.type === 'downtrendStart') bar.downtrendStart = true;
                  else if (point.type === 'highestDowntrendStart') bar.highestDowntrendStart = true;
                  else if (point.type === 'unbrokenUptrendStart') bar.unbrokenUptrendStart = true;
                  else if (point.type === 'uptrendToHigh') bar.uptrendToHigh = true;
                } else {
                  mismatchCount++;
                  console.warn(`Could not find matching bar for trend point: ${point.type} at ${new Date(timestamp).toLocaleString()}`);
                  // Log all bar timestamps to help debug
                  if (mismatchCount === 1) {
                    console.log("Available bar timestamps:");
                    processedMarketData.slice(0, 10).forEach((b, idx) => {
                      console.log(`Bar ${idx}: ${new Date(b.timestamp).toISOString()}`);
                    });
                    
                    // Check if there's a timezone issue
                    console.log("Checking for timezone issues:");
                    const pointDate = new Date(timestamp);
                    console.log(`Point timestamp: ${pointDate.toISOString()} (UTC offset: ${pointDate.getTimezoneOffset() / -60}h)`);
                    
                    const barSample = processedMarketData[0];
                    const barDate = new Date(barSample.timestamp);
                    console.log(`Bar timestamp: ${barDate.toISOString()} (UTC offset: ${barDate.getTimezoneOffset() / -60}h)`);
                  }
                }
              });
              
              console.log(`Trend point application summary: ${matchCount} matches, ${mismatchCount} mismatches`);
            } else {
              console.log(`No ${showRuleEngineTrends ? 'rule engine' : 'saved'} trend points found or invalid response format`);
            }
          } else {
            console.error("Missing required parameters for trend points fetch:", {
              contractId: finalContractId,
              timeframe: timeframeString
            });
          }
        } catch (trendError) {
          console.error("Error fetching trend points:", trendError);
        }
        
        // Count how many of each trend type we find
        let trendCounts = {
          uptrendStart: 0,
          downtrendStart: 0,
          highestDowntrendStart: 0,
          unbrokenUptrendStart: 0,
          uptrendToHigh: 0
        };
        
        // Keep track of the bars with trend markers
        let barsWithTrends = 0;
        
        const dataWithTrends = processedMarketData.map(bar => {
          const barWithTrends = bar as OhlcBarWithTrends;
          
          // Count existing trend markers (only count markers that are true)
          if (barWithTrends.uptrendStart) trendCounts.uptrendStart++;
          if (barWithTrends.downtrendStart) trendCounts.downtrendStart++;
          if (barWithTrends.highestDowntrendStart) trendCounts.highestDowntrendStart++;
          if (barWithTrends.unbrokenUptrendStart) trendCounts.unbrokenUptrendStart++;
          if (barWithTrends.uptrendToHigh) trendCounts.uptrendToHigh++;
          
          // Count how many bars have at least one trend marker
          if (barWithTrends.uptrendStart || 
              barWithTrends.downtrendStart || 
              barWithTrends.highestDowntrendStart || 
              barWithTrends.unbrokenUptrendStart ||
              barWithTrends.uptrendToHigh) {
            barsWithTrends++;
          }
          
          return barWithTrends;
        });
        
        // Log trend indicator counts
        console.log(`Found ${barsWithTrends} bars with trend indicators (total: ${processedMarketData.length} bars)`);
        console.log("Trend indicator counts:", trendCounts);
        
        // Check if we have any bars with trend indicators
        if (barsWithTrends === 0) {
          console.warn("No trend indicators were applied to any bars!");
          if (showRuleEngineTrends) {
            console.log("Rule engine trends were requested but none were found or matched");
          } else {
            console.log("Saved trend points were requested but none were found or matched");
          }
        } else {
          // Log a few samples of bars with trend indicators
          console.log("Sample bars with trend indicators:");
          const trendBars = dataWithTrends.filter(bar => 
            bar.uptrendStart || bar.downtrendStart || 
            bar.highestDowntrendStart || bar.unbrokenUptrendStart || 
            bar.uptrendToHigh
          );
          
          trendBars.slice(0, 3).forEach((bar, idx) => {
            console.log(`Trend bar ${idx}:`, {
              timestamp: new Date(bar.timestamp).toISOString(),
              trends: {
                uptrendStart: bar.uptrendStart,
                downtrendStart: bar.downtrendStart,
                highestDowntrendStart: bar.highestDowntrendStart,
                unbrokenUptrendStart: bar.unbrokenUptrendStart,
                uptrendToHigh: bar.uptrendToHigh
              }
            });
          });
        }
        
        // Set the data
        setData(dataWithTrends);
        
        // If there's a callback to update parent with data, call it
        if (onDataUpdated) {
          onDataUpdated(dataWithTrends);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(`Failed to load chart data: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [selectedTimeframe, refreshCounter, externalSelectedContract, getCurrentTimeframeString, onDataUpdated, showRuleEngineTrends]);
  
  // Handle timeframe change
  const handleTimeframeChange = (value: string) => {
    setSelectedTimeframe(value);
    
    // Convert from internal format to external format if needed
    if (onTimeframeChange) {
      const tf = timeframeOptions.find(t => t.label === value);
      if (tf) {
        const unit = tf.unit === 2 ? "m" : tf.unit === 3 ? "h" : tf.unit === 4 ? "d" : tf.unit === 5 ? "w" : "";
        onTimeframeChange(`${tf.value}${unit}`);
      }
    }
  };
  
  // Toggle gap removal
  const handleToggleGaps = (checked: boolean) => {
    setRemoveGaps(checked);
  };

  // Toggle training mode
  const handleToggleTraining = (checked: boolean) => {
    setTrainingEnabled(checked);
  };
  
  // Handle select change from native select element
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleTimeframeChange(e.target.value);
  };

  // Handle trend points detected
  const handleTrendPointsDetected = (points: TrendPoint[]) => {
    console.log("Trend points detected:", points.length);
    setTrendPoints(points);
    // Call external handler if provided
    if (externalOnTrendPointsDetected) {
      externalOnTrendPointsDetected(points);
    }
  };

  // Handle trend confirmation
  const handleTrendConfirmed = async (point: {timestamp: number; price: number; type: string; index: number; timeframe?: string}) => {
    try {
      console.log("Confirming trend point:", point);
      
      // If external handler is provided, use it
      if (externalOnTrendConfirmed) {
        return await externalOnTrendConfirmed(point);
      }
      
      // Otherwise use default implementation
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
          contractId: externalSelectedContract || "CON.F.US.MES.M25"
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

  // Toggle rule engine trend detection
  const handleToggleRuleEngine = (checked: boolean) => {
    setShowRuleEngineTrends(checked);
    // Refresh data when toggling
    setRefreshCounter(prev => prev + 1);
  };

  return (
    <div className="space-y-4">
      {isClient && <ToastContainer />}
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="timeframe">Timeframe:</Label>
            {/* Replace Select component with native select to avoid infinite loop */}
            <select 
              id="timeframe"
              className="p-2 border border-gray-300 rounded shadow-sm"
              value={selectedTimeframe}
              onChange={handleSelectChange}
            >
              {timeframeOptions.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        
          <div className="flex items-center space-x-2">
            <input
              id="remove-gaps"
              type="checkbox"
              className="rounded border-gray-300"
              checked={removeGaps}
              onChange={(e) => handleToggleGaps(e.target.checked)}
            />
            <Label htmlFor="remove-gaps">Remove Weekend Gaps</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              id="enable-training"
              type="checkbox"
              className="rounded border-gray-300"
              checked={trainingEnabled}
              onChange={(e) => handleToggleTraining(e.target.checked)}
            />
            <Label htmlFor="enable-training">
              <span className={trainingEnabled ? "text-green-500 font-medium" : ""}>
                Training Mode
              </span>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              id="rule-engine-trends"
              type="checkbox"
              className="rounded border-gray-300"
              checked={showRuleEngineTrends}
              onChange={(e) => handleToggleRuleEngine(e.target.checked)}
            />
            <Label htmlFor="rule-engine-trends">
              <span className={showRuleEngineTrends ? "text-blue-500 font-medium" : ""}>
                Rule Engine Trends
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
            onTrendPointsDetected={handleTrendPointsDetected}
            enableTraining={trainingEnabled}
            onTrendConfirmed={handleTrendConfirmed}
            timeframe={getCurrentTimeframeString()}
            timeframes={timeframeOptions.map(t => {
              const unit = t.unit === 2 ? "m" : t.unit === 3 ? "h" : t.unit === 4 ? "d" : t.unit === 5 ? "w" : "";
              return `${t.value}${unit}`;
            })}
          />
          
          {/* Debug info for trend indicators */}
          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-2 p-2 bg-gray-800 text-white text-xs rounded overflow-auto">
              <div className="font-bold">Debug Info</div>
              <div>
                <span className="text-blue-300">Info:</span> Displaying {showRuleEngineTrends ? 'rule engine detected' : 'saved'} trend points
              </div>
              <div>Data points: {data.length}</div>
              <div>
                Trend markers: {data.filter(d => 
                  d.uptrendStart || d.downtrendStart || d.highestDowntrendStart || 
                  d.unbrokenUptrendStart || d.uptrendToHigh
                ).length} bars with trend indicators
              </div>
              <div className="text-xs mt-1">
                <span className="text-green-300">Uptrend: {data.filter(d => d.uptrendStart).length}</span> • 
                <span className="text-orange-300"> Downtrend: {data.filter(d => d.downtrendStart).length}</span> • 
                <span className="text-red-300"> Highest Dn: {data.filter(d => d.highestDowntrendStart).length}</span> • 
                <span className="text-green-500"> Unbroken: {data.filter(d => d.unbrokenUptrendStart).length}</span> • 
                <span className="text-blue-300"> Up High: {data.filter(d => d.uptrendToHigh).length}</span>
              </div>
              {data.filter(d => d.uptrendStart || d.downtrendStart || d.highestDowntrendStart || 
                              d.unbrokenUptrendStart || d.uptrendToHigh).length === 0 && (
                <div className="text-orange-400 mt-1">
                  No {showRuleEngineTrends ? 'rule engine' : 'saved'} trend indicators found.
                  {!showRuleEngineTrends && trainingEnabled && " Click on bars to mark trend points."}
                </div>
              )}
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