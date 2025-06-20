'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  UTCTimestamp,
  CrosshairMode,
  CandlestickData,
  WhitespaceData,
  CandlestickSeries,
  createSeriesMarkers,
  Time, // Import Time type for series.update
} from 'lightweight-charts';
import useSWR from 'swr';

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8765';

const availableContracts = ['CON.F.US.MES.M25', 'CON.F.US.ES.M25', 'CON.F.US.NQ.M25'];
const availableTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']; // Added 1m for live bar testing

interface Signal {
  signal_id: number;
  analyzer_id: string;
  timestamp: string; // Assuming ISO string format
  trigger_timestamp: string;
  contract_id: string;
  timeframe: string;
  signal_type: 'uptrend_start' | 'downtrend_start' | string; // Allow other signal types if any
  signal_price: number | null;
  details: any;
}

interface OhlcDataForChart extends CandlestickData {
  time: UTCTimestamp;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

// Helper to convert timeframe_unit (integer from backend) to char (e.g., 'm', 'h')
const getTimeframeUnitChar = (timeframeUnit: number): string => {
  switch (timeframeUnit) {
    case 1: return 's'; // seconds
    case 2: return 'm'; // minutes
    case 3: return 'h'; // hours
    case 4: return 'd'; // days
    case 5: return 'w'; // weeks
    // case 6: return 'M'; // months - uncomment if used
    default: return '';
  }
};

const TrendsPage: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [seriesData, setSeriesData] = useState<OhlcDataForChart[]>([]);

  const [selectedContract, setSelectedContract] = useState<string>(availableContracts[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1d'); // Default to 1d
  const ohlcLimit = 5000; // Set a large limit to fetch more bars, effectively "all" for most practical purposes

  const { data: ohlcApiResponse, error: ohlcError, isLoading: ohlcIsLoading } = useSWR(
    selectedContract && selectedTimeframe ? `/api/ohlc?contract=${selectedContract}&timeframe=${selectedTimeframe}&limit=${ohlcLimit}` : null,
    fetcher
  );

  const { data: signalsApiResponse, error: signalsError, isLoading: signalsIsLoading } = useSWR(
    selectedContract && selectedTimeframe ? `/api/trend-starts?contract_id=${selectedContract}&timeframe=${selectedTimeframe}&limit=1000` : null, 
    fetcher
  );

  // Initialize or update chart with historical data and markers
  const initializeChartWithData = useCallback(() => {
    if (!candlestickSeriesRef.current || !ohlcApiResponse?.data) {
      return;
    }

    // Base historical OHLC data
    let historicalOhlc: OhlcDataForChart[] = ohlcApiResponse.data
      .map((bar: any) => ({
        time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
      }))
      .sort((a: OhlcDataForChart, b: OhlcDataForChart) => a.time - b.time);
    
    // Prepare and embed markers if signals API response is available
    if (signalsApiResponse?.data) {
      const ohlcDataMap = new Map<UTCTimestamp, OhlcDataForChart>();
      historicalOhlc.forEach(bar => ohlcDataMap.set(bar.time, bar)); // For text assignment

      // Create a map of markers keyed by their timestamp for efficient lookup
      const markersByTime = new Map<UTCTimestamp, SeriesMarker<UTCTimestamp>[]>();

      signalsApiResponse.data
        .filter((signal: Signal) => signal.contract_id === selectedContract && signal.timeframe === selectedTimeframe)
        .forEach((signal: Signal) => {
          const signalTime = (new Date(signal.timestamp).getTime() / 1000) as UTCTimestamp;
          const correspondingBar = ohlcDataMap.get(signalTime);
          let markerText = signal.signal_type === 'uptrend_start' ? 'UT' : 'DT';

          if (correspondingBar) {
            if (signal.signal_type === 'uptrend_start') {
              markerText = correspondingBar.low.toFixed(2);
            } else if (signal.signal_type === 'downtrend_start') {
              markerText = correspondingBar.high.toFixed(2);
            }
          }
          
          const newMarker: SeriesMarker<UTCTimestamp> = {
            time: signalTime,
            position: signal.signal_type === 'uptrend_start' ? 'belowBar' : 'aboveBar',
            color: signal.signal_type === 'uptrend_start' ? '#26a69a' : '#ef5350',
            shape: signal.signal_type === 'uptrend_start' ? 'arrowUp' : 'arrowDown',
            text: markerText,
            size: 2,
          };

          if (!markersByTime.has(signalTime)) {
            markersByTime.set(signalTime, []);
          }
          markersByTime.get(signalTime)!.push(newMarker);
        });

      // Augment historicalOhlc with markers
      // The SeriesMarker<Time> should be part of the CandlestickData or WhitespaceData object.
      // Let's ensure OhlcDataForChart can hold markers.
      // The type SeriesDataItemTypeMap[TSeriesType] is CandlestickData | WhitespaceData for 'Candlestick'.
      // CandlestickData itself doesn't have a 'markers' property in the standard type.
      // This implies markers are not directly embedded this way in the core library for setData.

      // The series.setMarkers() method is indeed the standard way.
      // The runtime error means something is wrong with the candlestickSeriesRef.current or the library version.

      // Let's stick to trying series.setMarkers() but clear it first.
      // If `setMarkers` isn't a function, then this will also fail, but it's the documented API.
      // Perhaps the ref isn't initialized properly when this is first called, or is the wrong type.

      // Given the runtime error, the direct `setMarkers` call is failing.
      // Let's log the type of candlestickSeriesRef.current to be sure.
      console.log('candlestickSeriesRef.current:', candlestickSeriesRef.current);
      console.log('typeof setMarkers:', typeof (candlestickSeriesRef.current as any)?.setMarkers);

      const signalMarkersToPlot: SeriesMarker<UTCTimestamp>[] = [];
      if (signalsApiResponse?.data) { // Only process if there's signal data
        signalsApiResponse.data
          .filter((signal: Signal) => signal.contract_id === selectedContract && signal.timeframe === selectedTimeframe)
          .map((signal: Signal) => {
            const signalTime = (new Date(signal.timestamp).getTime() / 1000) as UTCTimestamp;
            const correspondingBar = ohlcDataMap.get(signalTime);
            let markerText = signal.signal_type === 'uptrend_start' ? 'UT' : 'DT';

            if (correspondingBar) {
              if (signal.signal_type === 'uptrend_start') {
                markerText = correspondingBar.low.toFixed(2);
              } else if (signal.signal_type === 'downtrend_start') {
                markerText = correspondingBar.high.toFixed(2);
              }
            }
            signalMarkersToPlot.push({
              time: signalTime,
              position: signal.signal_type === 'uptrend_start' ? 'belowBar' : 'aboveBar',
              color: signal.signal_type === 'uptrend_start' ? '#26a69a' : '#ef5350',
              shape: signal.signal_type === 'uptrend_start' ? 'arrowUp' : 'arrowDown',
              text: markerText,
              size: 2,
            });
          });
      }
        
      if (candlestickSeriesRef.current) {
        // Sort markers by time in ascending order before plotting
        signalMarkersToPlot.sort((a, b) => a.time - b.time);

        // First, attempt to clear existing markers by passing an empty array
        createSeriesMarkers(candlestickSeriesRef.current, []); 
        // Then, add the new markers for the current selection
        if (signalMarkersToPlot.length > 0) {
          createSeriesMarkers(candlestickSeriesRef.current, signalMarkersToPlot);
        }
      } else {
        console.error('Candlestick series object not available. Markers will not be updated.');
      }
    }
    
    setSeriesData(historicalOhlc); // Set data for WebSocket updates, this does NOT draw on chart
    candlestickSeriesRef.current.setData(historicalOhlc); // This draws the OHLC bars

    chartRef.current?.timeScale().fitContent();
  }, [ohlcApiResponse, signalsApiResponse, selectedContract, selectedTimeframe]);

  useEffect(() => {
    if (chartContainerRef.current && !chartRef.current) {
      chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 600,
        layout: {
          background: { color: '#1e1e1e' }, // Dark mode background
          textColor: '#d1d4dc', // Light text for dark mode
        },
        grid: {
          vertLines: { color: 'rgba(70, 70, 70, 0.5)' },
          horzLines: { color: 'rgba(70, 70, 70, 0.5)' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
        timeScale: {
          borderColor: 'rgba(197, 203, 206, 0.4)',
          timeVisible: true,
          secondsVisible: selectedTimeframe.endsWith('m') || selectedTimeframe.endsWith('s'),
        },
      });

      // Ensure the chart is created and candlestick series is added correctly
      if (chartRef.current) {
        candlestickSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
          upColor: '#089981', // Green for up candles
          downColor: '#F23645', // Red for down candles
          borderVisible: false,
          wickUpColor: '#089981',
          wickDownColor: '#F23645',
        });
      }
    }

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // No need to remove chartRef.current here if it's meant to persist across selections
      // It will be cleaned up if the component unmounts entirely
    };
  }, []); // Create chart once

  useEffect(() => {
    if (candlestickSeriesRef.current && chartRef.current) {
        // Update timescale seconds visibility when timeframe changes
        chartRef.current.applyOptions({
            timeScale: {
                secondsVisible: selectedTimeframe.endsWith('m') || selectedTimeframe.endsWith('s'),
            }
        });
        initializeChartWithData(); // Reload data when contract/timeframe changes
    }
  }, [selectedContract, selectedTimeframe, ohlcApiResponse, signalsApiResponse, initializeChartWithData]);


  // EFFECT FOR WEBSOCKET CONNECTION AND LIVE DATA
  useEffect(() => {
    if (!candlestickSeriesRef.current || seriesData.length === 0) { // Wait for initial data
      return;
    }

    console.log(`Attempting to connect to WebSocket: ${WEBSOCKET_URL} for ${selectedContract} ${selectedTimeframe}`);
    const ws = new WebSocket(WEBSOCKET_URL);
    const series = candlestickSeriesRef.current;

    ws.onopen = () => {
      console.log(`WebSocket connection established for ${selectedContract} ${selectedTimeframe}`);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        // console.log('WS Message:', message);

        if (message.type === 'ohlc' && message.contract_id === selectedContract) {
          const incomingTimeframe = `${message.timeframe_value}${getTimeframeUnitChar(message.timeframe_unit)}`;
          if (incomingTimeframe === selectedTimeframe) {
            const barData: OhlcDataForChart = {
              time: (new Date(message.timestamp).getTime() / 1000) as UTCTimestamp,
              open: Number(message.open),
              high: Number(message.high),
              low: Number(message.low),
              close: Number(message.close),
            };
            series.update(barData);
            // Update our local seriesData state as well
            setSeriesData(currentData => {
              const existingBarIndex = currentData.findIndex(d => d.time === barData.time);
              if (existingBarIndex !== -1) {
                const newData = [...currentData];
                newData[existingBarIndex] = barData;
                return newData;
              } else {
                // Add new bar and keep sorted by time
                const newData = [...currentData, barData].sort((a,b) => a.time - b.time);
                return newData;
              }
            });
          }
        } else if (message.type === 'tick' && message.contract_id === selectedContract) {
          // Tick applies to the currently forming bar of the *selectedTimeframe*
          setSeriesData(currentData => {
            if (currentData.length === 0) return currentData;
            
            const lastBar = currentData[currentData.length - 1];
            const tickPrice = Number(message.price);
            const tickTime = (new Date(message.timestamp).getTime() / 1000) as UTCTimestamp;

            // TODO: More robust logic to check if tick belongs to the current selectedTimeframe's forming bar
            // For now, assume any tick updates the last bar of the selected timeframe if it's very recent.
            // This might need adjustment based on how frequently your 'ohlc' type messages arrive for the selectedTimeframe.
            // A common approach is to check if tickTime is >= lastBar.time and < next bar's expected time for selectedTimeframe.

            const updatedLastBar: OhlcDataForChart = {
              ...lastBar,
              high: Math.max(lastBar.high, tickPrice),
              low: Math.min(lastBar.low, tickPrice),
              close: tickPrice,
            };
            
            series.update(updatedLastBar);
            
            const newData = [...currentData];
            newData[newData.length - 1] = updatedLastBar;
            return newData;
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket message or updating chart:', error, event.data);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${selectedContract} ${selectedTimeframe}:`, error);
    };

    ws.onclose = (event) => {
      console.log(`WebSocket connection closed for ${selectedContract} ${selectedTimeframe}:`, event.reason, `Code: ${event.code}`);
    };

    return () => {
      console.log(`Closing WebSocket connection for ${selectedContract} ${selectedTimeframe}...`);
      ws.close();
    };
  }, [selectedContract, selectedTimeframe]); // Key dependencies

  if (ohlcError || signalsError) return (
    <div className="p-4">
      <p className="text-red-500">Error loading data:</p>
      {ohlcError && <pre>{JSON.stringify(ohlcError, null, 2)}</pre>}
      {signalsError && <pre>{JSON.stringify(signalsError, null, 2)}</pre>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Trend Analysis</h1>
      </header>

      <div className="mb-6 p-4 bg-white rounded-lg shadow flex space-x-4 items-end">
        <div>
          <label htmlFor="contractSelect" className="block text-sm font-medium text-gray-700 mb-1">Contract ID:</label>
          <select 
            id="contractSelect" 
            value={selectedContract}
            onChange={(e) => setSelectedContract(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {availableContracts.map(contract => (
              <option key={contract} value={contract}>{contract}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="timeframeSelect" className="block text-sm font-medium text-gray-700 mb-1">Timeframe:</label>
          <select 
            id="timeframeSelect"
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {availableTimeframes.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
      </div>

      {(ohlcIsLoading || signalsIsLoading) && 
        <div className="p-4 text-center">
          <p className="text-lg text-gray-600">Loading chart data...</p>
        </div>
      }

      <div ref={chartContainerRef} className="w-full bg-white rounded-lg shadow mb-6" />

      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Detected Signals</h2>
        {(signalsIsLoading) && <p>Loading signals...</p>}
        {signalsApiResponse && signalsApiResponse.data && signalsApiResponse.data.length > 0 ? (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rule</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {signalsApiResponse.data
                  .filter((signal: Signal) => signal.contract_id === selectedContract && signal.timeframe === selectedTimeframe)
                  .sort((a: Signal, b: Signal) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) // Sort by most recent first
                  .map((signal: Signal) => {
                    const d = new Date(signal.timestamp);
                    const formattedTimestamp = `${d.getUTCFullYear()}-` +
                                             `${String(d.getUTCMonth() + 1).padStart(2, '0')}-` +
                                             `${String(d.getUTCDate()).padStart(2, '0')} ` +
                                             `${String(d.getUTCHours()).padStart(2, '0')}:` +
                                             `${String(d.getUTCMinutes()).padStart(2, '0')}:` +
                                             `${String(d.getUTCSeconds()).padStart(2, '0')} UTC`;
                    return (
                      <tr key={signal.signal_id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formattedTimestamp}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${signal.signal_type === 'uptrend_start' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {signal.signal_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{signal.signal_price?.toFixed(2) ?? 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{signal.details?.rule_type || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          Conf: B{signal.details?.confirmed_signal_bar_index}, Trig: B{signal.details?.triggering_bar_index}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          !signalsIsLoading && <p className="text-gray-600">No signals found for the selected criteria.</p>
        )}
      </div>
    </div>
  );
};

export default TrendsPage; 