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
  { label: "1 Min", unit: 2, value: 1 },
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
  /**
   * If true, show all chart data regardless of contract (default: true)
   */
  showAllContracts?: boolean;
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
  refreshTrigger = 0,
  showAllContracts = true
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
      console.log(`Converting external timeframe: ${externalSelectedTimeframe}`);

      // Direct mapping to ensure we match exactly with available options
      const timeframeMap: Record<string, string> = {
        "1m": "1 Min",
        "5m": "5 Min", 
        "15m": "15 Min",
        "30m": "30 Min",
        "1h": "1 Hour",
        "4h": "4 Hour", 
        "1d": "1 Day",
        "1w": "1 Week"
      };

      const internalTimeframe = timeframeMap[externalSelectedTimeframe];
      if (internalTimeframe) {
        // Only update if it's different from current to avoid loops
        if (selectedTimeframe !== internalTimeframe) {
          console.log(`Setting timeframe from ${selectedTimeframe} to ${internalTimeframe}`);
          setSelectedTimeframe(internalTimeframe);
        }
      } else {
        console.warn(`Unknown timeframe format: ${externalSelectedTimeframe}, keeping current: ${selectedTimeframe}`);
      }
    }
  }, [externalSelectedTimeframe, selectedTimeframe]);

  // Update when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      setRefreshCounter(prev => prev + 1);
    }
  }, [refreshTrigger]);

  // Add memoization for the timeframe finding function to prevent recreation on each render
  const getCurrentTimeframeString = useCallback(() => {
    console.log("Getting timeframe string for:", selectedTimeframe);
    
    const tf = timeframeOptions.find(t => t.label === selectedTimeframe);
    if (!tf) {
      console.error(`No matching timeframe found for "${selectedTimeframe}"`);
      console.log("Available timeframes:", timeframeOptions.map(tf => tf.label));
      throw new Error(`Invalid timeframe selected: "${selectedTimeframe}"`);
    }
    
    // Convert from internal format (e.g., "5 Min") to API format (e.g., "5m")
    const unit = tf.unit === 2 ? "m" : tf.unit === 3 ? "h" : tf.unit === 4 ? "d" : tf.unit === 5 ? "w" : "";
    const apiTimeframe = `${tf.value}${unit}`;
    console.log(`Converted ${selectedTimeframe} to API timeframe: ${apiTimeframe}`);
    
    return apiTimeframe;
  }, [selectedTimeframe]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Clear existing data immediately when timeframe changes to prevent accumulation
        setData([]);
        setTrendPoints([]);
        
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
        let apiUrl = `/api/market-data/bars?timeframeUnit=${timeframe.unit}&timeframeValue=${timeframe.value}&limit=100`;
        
        if (showAllContracts) {
          apiUrl += '&allContracts=true';
          console.log("Fetching data for all contracts");
        } else {
          apiUrl += `&contractId=${contractId}`;
          console.log(`Fetching data for contract: ${contractId}`);
        }
        
        const response = await fetch(apiUrl);
        
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
          let timeframeString;
          try {
            timeframeString = getCurrentTimeframeString();
                     } catch (timeframeError) {
             console.error("Error getting timeframe string:", timeframeError);
             // Use a fallback or skip trend points - use the data with trend indicators initialized
             console.warn("Skipping trend points fetch due to timeframe error");
             const dataWithDefaultTrends = processedMarketData.map(bar => ({
               ...bar,
               uptrendStart: false,
               downtrendStart: false,
               highestDowntrendStart: false,
               unbrokenUptrendStart: false,
               uptrendToHigh: false
             })) as OhlcBarWithTrends[];
             
             setData(dataWithDefaultTrends);
             if (onDataUpdated) {
               onDataUpdated(dataWithDefaultTrends);
             }
             return;
           }
          
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
          if (timeframeString) {
            let trendPointsData;
            
            if (showRuleEngineTrends) {
              // Fetch trend points from rule engine detection
              let ruleEngineApiUrl = `/api/trend/detect?timeframe=${encodeURIComponent(timeframeString)}`;
              if (!showAllContracts) {
                ruleEngineApiUrl += `&contractId=${encodeURIComponent(finalContractId)}`;
              } else {
                ruleEngineApiUrl += `&allContracts=true`;
              }
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
                let savedTrendsApiUrl = `/api/trend-points?timeframe=${encodeURIComponent(timeframeString)}`;
                if (!showAllContracts) {
                  savedTrendsApiUrl += `&contractId=${encodeURIComponent(finalContractId)}`;
                } else {
                  savedTrendsApiUrl += `&allContracts=true`;
                }
                const savedTrendsResponse = await fetch(savedTrendsApiUrl);
                
                if (savedTrendsResponse.ok) {
                  trendPointsData = await savedTrendsResponse.json();
                }
              }
            } else {
              // Fetch saved trend points from database
              let apiUrl = `/api/trend-points?timeframe=${encodeURIComponent(timeframeString)}`;
              if (!showAllContracts) {
                apiUrl += `&contractId=${encodeURIComponent(finalContractId)}`;
              } else {
                apiUrl += `&allContracts=true`;
              }
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
        
        // When showing all contracts, we need to handle duplicate timestamps
        // Lightweight Charts requires unique timestamps in ascending order
        let finalData = dataWithTrends;
        if (showAllContracts) {
          console.log("Processing data for all contracts, handling duplicate timestamps...");
          console.log("Timeframe selected:", selectedTimeframe);
          
          // Identify the timeframe type
          const isDaily = timeframe?.unit === 4 || selectedTimeframe === "1 Day";
          console.log("Is daily timeframe:", isDaily);

          if (isDaily) {
            // Special handling for daily timeframe which is more prone to timestamp conflicts
            console.log("⚠️ Daily timeframe detected with multiple contracts - using special handling");
            
            // First attempt: Create a map of timestamps to the "best" bar for that time
            // For each timestamp, we'll prefer bars with trend indicators
            const uniqueBars = new Map<number, OhlcBarWithTrends>();
            
            // First pass: identify all bars with trend indicators
            const trendBars = dataWithTrends.filter(bar => 
              bar.uptrendStart || bar.downtrendStart || 
              bar.highestDowntrendStart || bar.unbrokenUptrendStart || 
              bar.uptrendToHigh
            );
            
            console.log(`Found ${trendBars.length} bars with trend indicators`);
            
            // Add trend bars first (they take priority)
            trendBars.forEach(bar => {
              const timestamp = new Date(bar.timestamp).getTime();
              uniqueBars.set(timestamp, bar);
            });
            
            // Then add other bars only if we don't already have a bar for that timestamp
            dataWithTrends.forEach(bar => {
              const timestamp = new Date(bar.timestamp).getTime();
              if (!uniqueBars.has(timestamp)) {
                uniqueBars.set(timestamp, bar);
              }
            });
            
            // Convert the map back to an array and sort by timestamp
            let dedupedData = Array.from(uniqueBars.values()).sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            console.log(`After deduplication: ${dataWithTrends.length} bars → ${dedupedData.length} bars`);
            
            // If deduplication reduced the data too much (lost more than 50% of data),
            // try using large offsets instead
            if (dedupedData.length < dataWithTrends.length * 0.5) {
              console.log("⚠️ Deduplication removed too many bars, trying offset approach instead");
              
              // Group by timestamp but preserve all bars
              const barsByTimestamp = new Map<number, OhlcBarWithTrends[]>();
              dataWithTrends.forEach(bar => {
                const timestamp = new Date(bar.timestamp).getTime();
                if (!barsByTimestamp.has(timestamp)) {
                  barsByTimestamp.set(timestamp, []);
                }
                barsByTimestamp.get(timestamp)!.push(bar);
              });
              
              // Apply very large offsets (whole days) to ensure no overlap
              // 86400000 milliseconds = 1 day
              const DAY_OFFSET = 86400000;
              
              const offsetData: OhlcBarWithTrends[] = [];
              
              barsByTimestamp.forEach((bars, timestamp) => {
                if (bars.length === 1) {
                  // Just one bar, keep as is
                  offsetData.push(bars[0]);
                } else {
                  // Group by contractId to keep the same contract's bars together
                  const barsByContract = new Map<string, OhlcBarWithTrends[]>();
                  bars.forEach(bar => {
                    if (!barsByContract.has(bar.contractId)) {
                      barsByContract.set(bar.contractId, []);
                    }
                    barsByContract.get(bar.contractId)!.push(bar);
                  });
                  
                  // Sort contracts for consistent results
                  const sortedContracts = Array.from(barsByContract.keys()).sort();
                  
                  // Add each contract's bar with a day offset per contract
                  sortedContracts.forEach((contractId, idx) => {
                    const contractBars = barsByContract.get(contractId)!;
                    contractBars.forEach(bar => {
                      if (idx === 0) {
                        // First contract gets no offset
                        offsetData.push(bar);
                      } else {
                        // Other contracts get offset by the contract index (in days)
                        const newTimestamp = new Date(timestamp + (idx * DAY_OFFSET));
                        const adjustedBar = {
                          ...bar,
                          timestamp: newTimestamp
                        };
                        offsetData.push(adjustedBar);
                      }
                    });
                  });
                }
              });
              
              // Use the offset data
              finalData = offsetData.sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              );
              
              console.log(`Using offset approach: ${dataWithTrends.length} → ${finalData.length} bars`);
            } else {
              // Deduplication worked well enough, use that data
              finalData = dedupedData;
            }
            
            // Final validation
            const finalTimestamps = finalData.map(bar => new Date(bar.timestamp).getTime());
            const uniqueTimestamps = new Set(finalTimestamps);
            
            if (finalTimestamps.length !== uniqueTimestamps.size) {
              console.error("CRITICAL: Still have duplicate timestamps after all processing!");
              console.log("Falling back to emergency deduplication - keeping only one bar per timestamp");
              
              // Last resort: Only keep the first occurrence of each timestamp
              const seenTimestamps = new Set<number>();
              finalData = finalData.filter(bar => {
                const ts = new Date(bar.timestamp).getTime();
                if (seenTimestamps.has(ts)) {
                  return false;
                }
                seenTimestamps.add(ts);
                return true;
              });
              
              console.log(`Emergency fallback complete: ${finalData.length} bars with unique timestamps`);
            }
          } else {
            // Non-daily timeframes - use the existing approach with small offsets
            // Group bars by timestamp
            const barsByTimestamp = new Map<number, OhlcBarWithTrends[]>();
            dataWithTrends.forEach(bar => {
              const timestamp = new Date(bar.timestamp).getTime();
              if (!barsByTimestamp.has(timestamp)) {
                barsByTimestamp.set(timestamp, []);
              }
              barsByTimestamp.get(timestamp)!.push(bar);
            });
            
            // Count duplicates for debugging
            let duplicateCount = 0;
            barsByTimestamp.forEach((bars, timestamp) => {
              if (bars.length > 1) {
                duplicateCount += bars.length - 1;
                console.log(`Found ${bars.length} bars with same timestamp: ${new Date(timestamp).toISOString()}`);
                console.log(`Contract IDs:`, bars.map(b => b.contractId).join(', '));
              }
            });
            console.log(`Found ${duplicateCount} duplicate timestamps out of ${dataWithTrends.length} bars`);
            
            // If we have any timestamps with multiple bars, fix by adding offsets
            finalData = [];
            barsByTimestamp.forEach((bars, timestamp) => {
              if (bars.length === 1) {
                // Just one bar for this timestamp, no change needed
                finalData.push(bars[0]);
              } else {
                // Multiple bars for the same timestamp
                // Sort by contractId to ensure consistent ordering
                bars.sort((a, b) => a.contractId.localeCompare(b.contractId));
                
                // Add an offset to each bar after the first one
                const offsetAmount = 1000; // 1 second
                
                bars.forEach((bar, i) => {
                  if (i === 0) {
                    finalData.push(bar);
                  } else {
                    // Create a new timestamp with the offset
                    const newTimestamp = new Date(new Date(bar.timestamp).getTime() + (i * offsetAmount));
                    
                    const adjustedBar = { 
                      ...bar,
                      timestamp: newTimestamp
                    };
                    finalData.push(adjustedBar);
                  }
                });
              }
            });
            
            // Sort by timestamp again to ensure ascending order
            finalData.sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          }
          
          console.log(`Final processed data: ${dataWithTrends.length} → ${finalData.length} bars`);
          console.log("First few timestamps:", 
            finalData.slice(0, 3).map(b => new Date(b.timestamp).toISOString())
          );
        }
        
        // Set the data
        setData(finalData);
        
        // If there's a callback to update parent with data, call it
        if (onDataUpdated) {
          onDataUpdated(finalData);
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
            showAllContracts={showAllContracts}
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