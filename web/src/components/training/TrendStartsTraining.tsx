'use client';

import React, { useState, useEffect } from "react";

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

// Contract type
interface Contract {
  id: string;
  symbol: string;
  fullName: string;
}

// Helper function to ensure consistent timezone handling
const ensureUTC = (timestamp: number | Date): number => {
  // Convert any input to a UTC timestamp in milliseconds
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.getTime();
};

const TrendStartsTraining: React.FC = () => {
  const [data, setData] = useState<OhlcBarWithTrends[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandle, setSelectedCandle] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState("5m");
  const [selectedContract, setSelectedContract] = useState<string>("ES");
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [availableTimeframes, setAvailableTimeframes] = useState<string[]>(["1m", "5m", "15m", "1h", "4h", "1d"]);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);

  // Fetch available contracts from the database
  useEffect(() => {
    const fetchContracts = async () => {
      setIsLoadingContracts(true);
      
      try {
        const response = await fetch('/api/contracts');
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setAvailableContracts(result.data);
          
          // If we have contracts and the currently selected one isn't in the list,
          // select the first one from the database
          if (result.data.length > 0) {
            const contractIds = result.data.map((c: Contract) => c.id);
            const symbols = result.data.map((c: Contract) => c.symbol);
            
            if (!contractIds.includes(selectedContract) && !symbols.includes(selectedContract)) {
              setSelectedContract(result.data[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching contracts:", err);
        // Fall back to default contracts if there's an error
        setAvailableContracts([
          { id: "CON.F.US.ES", symbol: "ES", fullName: "E-mini S&P 500" },
          { id: "CON.F.US.NQ", symbol: "NQ", fullName: "E-mini Nasdaq" },
          { id: "CON.F.US.RTY", symbol: "RTY", fullName: "E-mini Russell 2000" },
        ]);
      } finally {
        setIsLoadingContracts(false);
      }
    };
    
    fetchContracts();
  }, []);

  // Format timestamp to Eastern Time (UTC-4)
  const formatTimestampToEastern = (timestamp: number): string => {
    try {
      const date = new Date(timestamp);
      
      // Force display in Eastern Time (UTC-4) regardless of user's local timezone
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      };
      
      // Format the date in Eastern Time
      return new Intl.DateTimeFormat('en-US', options).format(date) + ' ET';
    } catch (e) {
      console.error("Error formatting timestamp:", e);
      return new Date(timestamp).toLocaleString() + " (local)";
    }
  };

  // Fetch data from the API based on the selected timeframe and contract
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Get the contract ID - if it's a symbol, find the corresponding full ID
        let contractId = selectedContract;
        if (!selectedContract.includes('.')) {
          // It's probably a symbol, find the full ID
          const contract = availableContracts.find(c => c.symbol === selectedContract);
          if (contract) {
            contractId = contract.id;
          }
        }
        
        // Construct the API URL with query parameters
        const apiUrl = `/api/ohlc?contract=${contractId}&timeframe=${selectedTimeframe}&limit=500`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        // Map the API response to our expected format
        const processedData: OhlcBarWithTrends[] = result.data.map((item: any) => ({
          id: item.id,
          contractId: item.contractId,
          timestamp: new Date(item.timestamp),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
          timeframeUnit: item.timeframeUnit,
          timeframeValue: item.timeframeValue,
          uptrendStart: item.uptrendStart || false,
          downtrendStart: item.downtrendStart || false,
          highestDowntrendStart: item.highestDowntrendStart || false,
          unbrokenUptrendStart: item.unbrokenUptrendStart || false,
          uptrendToHigh: item.uptrendToHigh || false
        }));
        
        // Ensure data is sorted by timestamp (newest first)
        processedData.sort((a, b) => {
          const aTime = ensureUTC(a.timestamp);
          const bTime = ensureUTC(b.timestamp);
          return bTime - aTime; // Descending order (newest first)
        });

        setData(processedData);
        console.log(`Loaded ${processedData.length} bars for ${selectedContract} ${selectedTimeframe}`);
      } catch (err) {
        console.error("Error fetching trend data:", err);
        setError(`Failed to load data: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch data if we have the contract list
    if (availableContracts.length > 0) {
      fetchData();
    }
  }, [selectedTimeframe, selectedContract, availableContracts]);

  // Debug function to inspect timestamp values
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

  // Function to confirm a trend at the selected candle
  const confirmTrendPoint = async (trendType: string) => {
    if (!selectedCandle) {
      setError("No candle selected");
      return;
    }

    setIsUpdating(true);
    
    try {
      // Extract the timestamp from the selected candle
      const timestamp = ensureUTC(selectedCandle.bar.timestamp);
      
      // Determine price based on trend type
      const price = trendType.includes('uptrend') || trendType === 'unbrokenUptrendStart' 
        ? selectedCandle.bar.low 
        : selectedCandle.bar.high;
      
      // Get the contract ID - if it's a symbol, find the corresponding full ID
      let contractId = selectedContract;
      if (!selectedContract.includes('.')) {
        // It's probably a symbol, find the full ID
        const contract = availableContracts.find(c => c.symbol === selectedContract);
        if (contract) {
          contractId = contract.id;
        }
      }
      
      // Create trend point object
      const trendPoint = {
        timestamp,
        price,
        type: trendType,
        index: selectedCandle.index,
        timeframe: selectedTimeframe,
        contractId: contractId
      };
      
      console.log("Confirming trend point:", trendPoint);
      
      // Send the data to the API
      const response = await fetch('/api/trend-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trendPoint),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Update the local data to reflect the change
      setData(prevData => {
        return prevData.map((bar, idx) => {
          if (idx === selectedCandle.index) {
            const updatedBar = { ...bar };
            
            // Set the specific trend indicator to true
            if (trendType === 'uptrendStart') updatedBar.uptrendStart = true;
            if (trendType === 'downtrendStart') updatedBar.downtrendStart = true;
            if (trendType === 'highestDowntrendStart') updatedBar.highestDowntrendStart = true;
            if (trendType === 'unbrokenUptrendStart') updatedBar.unbrokenUptrendStart = true;
            if (trendType === 'uptrendToHigh') updatedBar.uptrendToHigh = true;
            
            return updatedBar;
          }
          return bar;
        });
      });
      
      // Clear the selection and show success message
      setSelectedCandle(null);
      setSuccessMessage(`${trendType} confirmed at ${formatTimestampToEastern(timestamp)}`);
      setShowSuccessMessage(true);
      
      // Hide the success message after 3 seconds
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
      
    } catch (err) {
      console.error("Error confirming trend point:", err);
      setError(`Failed to confirm trend: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Function to remove a trend indicator
  const removeTrendPoint = async (bar: OhlcBarWithTrends, trendType: string) => {
    setIsUpdating(true);
    
    try {
      // Extract the timestamp
      const timestamp = ensureUTC(bar.timestamp);
      
      // Find the index of this bar
      const barIndex = data.indexOf(bar);
      
      // Get the contract ID - if it's a symbol, find the corresponding full ID
      let contractId = selectedContract;
      if (!selectedContract.includes('.')) {
        // It's probably a symbol, find the full ID
        const contract = availableContracts.find(c => c.symbol === selectedContract);
        if (contract) {
          contractId = contract.id;
        }
      }
      
      // Create trend point object for removal
      const trendPoint = {
        timestamp,
        type: trendType,
        index: barIndex,
        timeframe: selectedTimeframe,
        contractId: contractId
      };
      
      console.log("Removing trend point:", trendPoint);
      
      // Send the request to the API
      const response = await fetch('/api/trend-points/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trendPoint),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Update the local data to reflect the change
      setData(prevData => {
        return prevData.map((item, idx) => {
          if (idx === barIndex) {
            const updatedBar = { ...item };
            
            // Clear the specific trend indicator
            if (trendType === 'uptrendStart') updatedBar.uptrendStart = false;
            if (trendType === 'downtrendStart') updatedBar.downtrendStart = false;
            if (trendType === 'highestDowntrendStart') updatedBar.highestDowntrendStart = false;
            if (trendType === 'unbrokenUptrendStart') updatedBar.unbrokenUptrendStart = false;
            if (trendType === 'uptrendToHigh') updatedBar.uptrendToHigh = false;
            
            return updatedBar;
          }
          return item;
        });
      });
      
      // Show success message
      setSuccessMessage(`${trendType} removed at ${formatTimestampToEastern(timestamp)}`);
      setShowSuccessMessage(true);
      
      // Hide the success message after 3 seconds
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
      
    } catch (err) {
      console.error("Error removing trend point:", err);
      setError(`Failed to remove trend: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle trend action button click
  const handleTrendAction = (bar: OhlcBarWithTrends, action: string, trendType?: string) => {
    const timestamp = ensureUTC(bar.timestamp);
    
    if (action === 'select') {
      const barIndex = data.indexOf(bar);
      setSelectedCandle({
        index: barIndex,
        timestamp: timestamp,
        bar: bar
      });
    } else if (action === 'remove' && trendType) {
      removeTrendPoint(bar, trendType);
    }
  };

  // Render the trends table with filtering options
  return (
    <div className="space-y-6">
      {/* Controls Section */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Contract selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contract</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedContract}
              onChange={(e) => setSelectedContract(e.target.value)}
              disabled={isLoading || isUpdating || isLoadingContracts}
            >
              {isLoadingContracts ? (
                <option value="">Loading contracts...</option>
              ) : availableContracts.length === 0 ? (
                <option value="">No contracts available</option>
              ) : (
                availableContracts.map((contract) => (
                  <option key={contract.id} value={contract.symbol}>
                    {contract.symbol} - {contract.fullName}
                  </option>
                ))
              )}
            </select>
          </div>
          
          {/* Timeframe selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Timeframe</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-md py-2 px-3 text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              disabled={isLoading || isUpdating}
            >
              {availableTimeframes.map((timeframe) => (
                <option key={timeframe} value={timeframe}>{timeframe}</option>
              ))}
            </select>
          </div>
          
          {/* Status display */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
            <div className="h-10 flex items-center">
              {isLoading ? (
                <div className="bg-blue-900 text-blue-300 px-3 py-2 rounded-md text-sm flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading data...
                </div>
              ) : error ? (
                <div className="bg-red-900 text-red-300 px-3 py-2 rounded-md text-sm">
                  Error: {error}
                </div>
              ) : showSuccessMessage ? (
                <div className="bg-green-900 text-green-300 px-3 py-2 rounded-md text-sm">
                  {successMessage}
                </div>
              ) : (
                <div className="bg-gray-800 text-gray-300 px-3 py-2 rounded-md text-sm">
                  {data.length} bars loaded • {data.filter(bar => 
                    bar.uptrendStart || bar.downtrendStart || bar.highestDowntrendStart || 
                    bar.unbrokenUptrendStart || bar.uptrendToHigh
                  ).length} trend points
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Selected candle info */}
        {selectedCandle && (
          <div className="mt-4 bg-gray-800 p-3 rounded border border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-white">Selected Candle</h3>
              <button 
                onClick={() => setSelectedCandle(null)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-300">
                  <span className="text-gray-500">Time:</span> {formatTimestampToEastern(selectedCandle.timestamp)}
                </p>
                <p className="text-sm text-gray-300">
                  <span className="text-gray-500">Bar #:</span> {selectedCandle.index + 1} of {data.length}
                </p>
                <p className="text-sm text-gray-300">
                  <span className="text-gray-500">OHLC:</span> 
                  {selectedCandle.bar.open?.toFixed(2)}/{selectedCandle.bar.high?.toFixed(2)}/
                  {selectedCandle.bar.low?.toFixed(2)}/{selectedCandle.bar.close?.toFixed(2)}
                </p>
              </div>
              
              <div className="grid grid-cols-5 gap-1">
                <button 
                  className="bg-green-700 text-white text-xs py-1 rounded hover:bg-green-600 disabled:opacity-50"
                  onClick={() => confirmTrendPoint('uptrendStart')}
                  disabled={isUpdating}
                >
                  Up Start
                </button>
                <button 
                  className="bg-orange-700 text-white text-xs py-1 rounded hover:bg-orange-600 disabled:opacity-50"
                  onClick={() => confirmTrendPoint('downtrendStart')}
                  disabled={isUpdating}
                >
                  Down Start
                </button>
                <button 
                  className="bg-red-700 text-white text-xs py-1 rounded hover:bg-red-600 disabled:opacity-50"
                  onClick={() => confirmTrendPoint('highestDowntrendStart')}
                  disabled={isUpdating}
                >
                  Highest
                </button>
                <button 
                  className="bg-green-800 text-white text-xs py-1 rounded hover:bg-green-700 disabled:opacity-50"
                  onClick={() => confirmTrendPoint('unbrokenUptrendStart')}
                  disabled={isUpdating}
                >
                  Unbroken
                </button>
                <button 
                  className="bg-blue-700 text-white text-xs py-1 rounded hover:bg-blue-600 disabled:opacity-50"
                  onClick={() => confirmTrendPoint('uptrendToHigh')}
                  disabled={isUpdating}
                >
                  Up High
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Data Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Time (ET)</th>
                <th className="px-3 py-2">Open</th>
                <th className="px-3 py-2">High</th>
                <th className="px-3 py-2">Low</th>
                <th className="px-3 py-2">Close</th>
                <th className="px-3 py-2">Trends</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center">
                    <div className="flex justify-center items-center">
                      <svg className="animate-spin mr-2 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Loading data...</span>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                    No data available for the selected contract and timeframe
                  </td>
                </tr>
              ) : (
                data.map((bar, index) => {
                  const timestamp = ensureUTC(bar.timestamp);
                  
                  const isSelected = selectedCandle && selectedCandle.index === index;
                  
                  // Check for trend indicators
                  const hasTrends = bar.uptrendStart || bar.downtrendStart || 
                                  bar.highestDowntrendStart || bar.unbrokenUptrendStart || 
                                  bar.uptrendToHigh;
                  
                  return (
                    <tr 
                      key={index} 
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
                        {data.length - index}
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
                              Highest
                            </span>
                          )}
                          {bar.unbrokenUptrendStart && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-950 text-green-300">
                              Unbroken
                            </span>
                          )}
                          {bar.uptrendToHigh && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-300">
                              Up High
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* Actions column */}
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                                  ✕ High
                                </button>
                              )}
                              {bar.unbrokenUptrendStart && (
                                <button 
                                  className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                  onClick={() => handleTrendAction(bar, 'remove', 'unbrokenUptrendStart')}
                                  disabled={isUpdating}
                                  title="Remove Unbroken Uptrend marker"
                                >
                                  ✕ Unbrn
                                </button>
                              )}
                              {bar.uptrendToHigh && (
                                <button 
                                  className="px-1 py-0.5 text-xs border border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-50 rounded-sm"
                                  onClick={() => handleTrendAction(bar, 'remove', 'uptrendToHigh')}
                                  disabled={isUpdating}
                                  title="Remove Uptrend to High marker"
                                >
                                  ✕ UpH
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Table footer */}
        <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
          {data.length > 0 ? (
            <div className="flex justify-between items-center">
              <div>
                Total: {data.length} bars • 
                Trend Points: {data.filter(bar => 
                  bar.uptrendStart || bar.downtrendStart || bar.highestDowntrendStart || 
                  bar.unbrokenUptrendStart || bar.uptrendToHigh
                ).length}
              </div>
              
              <div className="flex space-x-4">
                <span className="text-green-500">Up: {data.filter(bar => bar.uptrendStart).length}</span>
                <span className="text-orange-500">Down: {data.filter(bar => bar.downtrendStart).length}</span>
                <span className="text-red-500">Highest: {data.filter(bar => bar.highestDowntrendStart).length}</span>
                <span className="text-green-700">Unbroken: {data.filter(bar => bar.unbrokenUptrendStart).length}</span>
                <span className="text-blue-500">Up High: {data.filter(bar => bar.uptrendToHigh).length}</span>
              </div>
            </div>
          ) : !isLoading ? (
            <div className="text-center">No data to display</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TrendStartsTraining; 