'use client';

import React, { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import Layout from "@/components/layout/Layout";
import TrendChartContainer from "@/components/charts/TrendChartContainer";
import { toast } from "@/components/ui/toast";
import TrendStartsTraining from "@/components/training/TrendStartsTraining";

// Define trend point type
interface TrendPoint {
  timestamp: number;
  price: number;
  type: string;
  index: number;
}

// Define OhlcBar type
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

export default function TrendStartsPage() {
  // State to track selected trend points from the chart
  const [selectedPoint, setSelectedPoint] = useState<TrendPoint | null>(null);
  const [chartData, setChartData] = useState<OhlcBarWithTrends[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("5m");
  const [selectedContract, setSelectedContract] = useState<string>("CON.F.US.MES.M25");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Log state changes for debugging
  useEffect(() => {
    console.log("TrendStartsPage - Timeframe changed:", selectedTimeframe);
  }, [selectedTimeframe]);

  useEffect(() => {
    console.log("TrendStartsPage - Contract changed:", selectedContract);
  }, [selectedContract]);

  // Ensure consistent timeframe format conversion
  const normalizeTimeframe = (timeframe: string): string => {
    // Already in correct format like 5m, 1h, etc.
    if (/^\d+[mhdw]$/.test(timeframe)) {
      return timeframe;
    }
    
    // Convert from display format to data format
    if (timeframe.includes("Min")) {
      const value = timeframe.split(" ")[0];
      return `${value}m`;
    }
    if (timeframe.includes("Hour")) {
      const value = timeframe.split(" ")[0];
      return `${value}h`;
    }
    if (timeframe.includes("Day")) {
      const value = timeframe.split(" ")[0];
      return `${value}d`;
    }
    if (timeframe.includes("Week")) {
      const value = timeframe.split(" ")[0];
      return `${value}w`;
    }
    
    // Default fallback
    return "5m";
  };

  // Callback to handle trend points detected from the chart
  const handleTrendPointsDetected = useCallback((points: TrendPoint[]) => {
    console.log('Trend points detected from chart:', points);
    // You could update some state here if needed
  }, []);

  // Callback when a trend is confirmed in the chart
  const handleTrendConfirmed = useCallback(async (point: {
    timestamp: number;
    price: number;
    type: string;
    index: number;
    timeframe?: string;
  }) => {
    console.log('Trend confirmed from chart:', point);
    
    try {
      // Send the data to the API
      const response = await fetch('/api/trend-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...point,
          contractId: selectedContract, // Use selected contract
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response:", errorText);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log("API response:", result);
      
      // Show toast notification on success
      toast({
        title: "Trend Point Saved",
        description: `${point.type} at ${new Date(point.timestamp).toLocaleString()}`,
        variant: "success"
      });
      
      // Trigger a refresh of all components
      setRefreshTrigger(prev => prev + 1);
      
      return result;
    } catch (error) {
      console.error("Error confirming trend point from chart:", error);
      
      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save trend point",
        variant: "destructive"
      });
      
      throw error;
    }
  }, [selectedContract]);

  // Handle trend point removal
  const handleTrendRemoved = useCallback(async (point: {
    timestamp: number;
    type: string;
    index: number;
    timeframe?: string;
  }) => {
    try {
      // Send the request to the API
      const response = await fetch('/api/trend-points/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...point,
          contractId: selectedContract, // Use selected contract
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response:", errorText);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Show success toast
      toast({
        title: "Trend Point Removed",
        description: `${point.type} at ${new Date(point.timestamp).toLocaleString()}`,
        variant: "success"
      });
      
      // Trigger a refresh of all components
      setRefreshTrigger(prev => prev + 1);
      
      return result;
    } catch (error) {
      console.error("Error removing trend point:", error);
      
      // Show error toast
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove trend point",
        variant: "destructive"
      });
      
      throw error;
    }
  }, [selectedContract]);

  // Handle timeframe change
  const handleTimeframeChange = useCallback((timeframe: string) => {
    // Always normalize to ensure consistent format (5m, 1h, etc.)
    const normalizedTimeframe = normalizeTimeframe(timeframe);
    console.log(`Timeframe change: ${timeframe} → ${normalizedTimeframe}`);
    setSelectedTimeframe(normalizedTimeframe);
  }, [normalizeTimeframe]);

  // Handle contract change
  const handleContractChange = useCallback((contract: string) => {
    setSelectedContract(contract);
  }, []);

  // Share chart data between components
  const handleChartDataUpdated = useCallback((data: OhlcBarWithTrends[]) => {
    setChartData(data);
  }, []);
  
  return (
    <Layout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Trend Analysis & Training</h1>
        
        {/* Chart Section */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Interactive Trend Chart</h2>
          <p className="text-gray-600 mb-4">
            Click on any bar in the chart to mark trend points. The chart will display markers 
            for trend points that have been identified.
          </p>
          
          <TrendChartContainer 
            enableTraining={true} 
            onTrendPointsDetected={handleTrendPointsDetected}
            onTrendConfirmed={handleTrendConfirmed}
            onTrendRemoved={handleTrendRemoved}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={handleTimeframeChange}
            selectedContract={selectedContract}
            onContractChange={handleContractChange}
            onDataUpdated={handleChartDataUpdated}
            refreshTrigger={refreshTrigger}
            showAllContracts={true}
          />

          <TrendStartsTraining 
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={handleTimeframeChange}
            selectedContract={selectedContract}
            onContractChange={handleContractChange}
            onTrendConfirmed={handleTrendConfirmed}
            onTrendRemoved={handleTrendRemoved}
            chartData={chartData}
            refreshTrigger={refreshTrigger}
          />
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4">
            <h3 className="text-lg font-medium mb-2">Usage Instructions</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Select your desired timeframe from the dropdown</li>
              <li>Click on any bar in the chart to analyze it</li>
              <li>Choose the appropriate trend type when prompted</li>
              <li>The chart will display markers for all saved trend points</li>
              <li>To remove a trend point, click on the marker and select "Remove"</li>
            </ol>
          </Card>
          
          <Card className="p-4">
            <h3 className="text-lg font-medium mb-2">Trend Type Legend</h3>
            <ul className="space-y-2">
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                <span className="font-medium">Uptrend Start</span>
                <span className="ml-2 text-sm text-gray-500">Beginning of a potential upward trend</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-orange-500 mr-2"></span>
                <span className="font-medium">Downtrend Start</span>
                <span className="ml-2 text-sm text-gray-500">Beginning of a potential downward trend</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                <span className="font-medium">Highest Downtrend</span>
                <span className="ml-2 text-sm text-gray-500">Significant downtrend reversal point</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-green-800 mr-2"></span>
                <span className="font-medium">Unbroken Uptrend</span>
                <span className="ml-2 text-sm text-gray-500">Strong uptrend without significant pullbacks</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                <span className="font-medium">Uptrend to High</span>
                <span className="ml-2 text-sm text-gray-500">Uptrend that reached a significant peak</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </Layout>
  );
} 