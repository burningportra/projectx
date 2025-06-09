'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  UTCTimestamp,
  CrosshairMode,
  CandlestickData,
  WhitespaceData,
  CandlestickSeries,
  Time, // Import Time type for series.update
} from 'lightweight-charts';
import useSWR from 'swr';
import Layout from "@/components/layout/Layout";
import { TrendAnalysisStatus } from '@/components/trends/TrendAnalysisStatus';
import { PendingSignalCard } from '@/components/trends/PendingSignalCard';
import { DebugLogViewer } from '@/components/trends/DebugLogViewer';

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

interface LiveStateData {
    last_updated: string;
    analyzer_id: string;
    final_state: {
        pds_candidate: any;
        pus_candidate: any;
    };
    debug_logs: any[];
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

const getTimeframeInSeconds = (timeframe: string): number => {
  const value = parseInt(timeframe.slice(0, -1));
  const unit = timeframe.slice(-1);
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return 60; // Default to 1 minute if unknown
  }
};

const getBarStartTime = (timestamp: UTCTimestamp, timeframeSeconds: number): UTCTimestamp => {
  return (Math.floor(timestamp / timeframeSeconds) * timeframeSeconds) as UTCTimestamp;
};

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
  const markersApiRef = useRef<any | null>(null);
  const [seriesData, setSeriesData] = useState<OhlcDataForChart[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false); // Flag for initial data load

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

  const { data: liveState, error: liveStateError, isLoading: liveStateIsLoading } = useSWR<LiveStateData>(
    selectedContract && selectedTimeframe ? `/api/trend-analysis/live-state?contract_id=${selectedContract}&timeframe=${selectedTimeframe}` : null,
    fetcher,
    { refreshInterval: 5000 } // Poll every 5 seconds
  );

  // This is the new core function for fetching and preparing all data
  const prepareChartData = useCallback(async () => {
    if (!ohlcApiResponse?.data || !candlestickSeriesRef.current) {
      return;
    }

    // 1. Process base historical OHLC data
    let historicalOhlc: OhlcDataForChart[] = ohlcApiResponse.data
      .map((bar: any) => ({
        time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
      }))
      .sort((a: OhlcDataForChart, b: OhlcDataForChart) => a.time - b.time);

    // 2. Handle the currently forming bar logic
    const timeframeSeconds = getTimeframeInSeconds(selectedTimeframe);
    const now = new Date().getTime() / 1000;
    const nowBarStartTime = getBarStartTime(now as UTCTimestamp, timeframeSeconds);

    if (historicalOhlc.length > 0) {
      const lastHistoricalBar = historicalOhlc[historicalOhlc.length - 1];

      if (lastHistoricalBar.time === nowBarStartTime) {
        // Case A: The last historical bar is the one currently forming. Rebuild it to be up-to-date.
        const lastBarTimeISO = new Date(lastHistoricalBar.time * 1000).toISOString();
        const granularDataResponse = await fetch(`/api/ohlc?contract=${selectedContract}&timeframe=1m&since=${lastBarTimeISO}`);
        const granularData = await granularDataResponse.json();

        if (granularData.success && granularData.data.length > 0) {
          const rebuiltLastBar = {
            time: lastHistoricalBar.time,
            open: lastHistoricalBar.open,
            high: Math.max(...granularData.data.map((t: any) => parseFloat(t.high))),
            low: Math.min(...granularData.data.map((t: any) => parseFloat(t.low))),
            close: parseFloat(granularData.data[granularData.data.length - 1].close),
          };
          historicalOhlc[historicalOhlc.length - 1] = rebuiltLastBar;
        }
      } else if (nowBarStartTime > lastHistoricalBar.time) {
        // Case B: A new bar has started since the last historical entry. Create it.
        const newBarTimeISO = new Date(nowBarStartTime * 1000).toISOString();
        const granularDataResponse = await fetch(`/api/ohlc?contract=${selectedContract}&timeframe=1m&since=${newBarTimeISO}`);
        const granularData = await granularDataResponse.json();

        if (granularData.success && granularData.data.length > 0) {
          const formingBar: OhlcDataForChart = {
            time: nowBarStartTime,
            open: parseFloat(granularData.data[0].open),
            high: Math.max(...granularData.data.map((t: any) => parseFloat(t.high))),
            low: Math.min(...granularData.data.map((t: any) => parseFloat(t.low))),
            close: parseFloat(granularData.data[granularData.data.length - 1].close),
          };
          historicalOhlc.push(formingBar);
        }
      }
    }

    // Set the potentially modified data to state and chart
    setSeriesData(historicalOhlc);
    candlestickSeriesRef.current.setData(historicalOhlc);
    setIsDataLoaded(true);

    // 3. Prepare and set markers
    const allMarkers: SeriesMarker<UTCTimestamp>[] = [];
    const ohlcDataMap = new Map<UTCTimestamp, OhlcDataForChart>();
    historicalOhlc.forEach(bar => ohlcDataMap.set(bar.time, bar));

    // Add confirmed signal markers
    if (signalsApiResponse?.data) {
      const signalMarkers = signalsApiResponse.data
        .filter((signal: Signal) => signal.contract_id === selectedContract && signal.timeframe === selectedTimeframe)
        .map((signal: Signal) => {
          const signalTime = (new Date(signal.timestamp).getTime() / 1000) as UTCTimestamp;
          const correspondingBar = ohlcDataMap.get(signalTime);
          let markerText = signal.signal_type === 'uptrend_start' ? 'UT' : 'DT';
          if (correspondingBar) {
            markerText = signal.signal_type === 'uptrend_start' ? correspondingBar.low.toFixed(2) : correspondingBar.high.toFixed(2);
          }
          return {
            time: signalTime,
            position: signal.signal_type === 'uptrend_start' ? 'belowBar' : 'aboveBar',
            color: signal.signal_type === 'uptrend_start' ? '#26a69a' : '#ef5350',
            shape: signal.signal_type === 'uptrend_start' ? 'arrowUp' : 'arrowDown',
            text: markerText,
            size: 2,
          };
        });
      allMarkers.push(...signalMarkers);
    }

    // Add pending candidate markers
    if (liveState?.final_state) {
      // PUS Candidate marker
      if (liveState.final_state.pus_candidate?.bar) {
        const pusTime = (new Date(liveState.final_state.pus_candidate.bar.timestamp).getTime() / 1000) as UTCTimestamp;
        const pusBar = ohlcDataMap.get(pusTime);
        allMarkers.push({
          time: pusTime,
          position: 'belowBar' as const,
          color: '#42a5f5', // Light blue
          shape: 'circle' as const,
          text: pusBar ? `PUS ${pusBar.low.toFixed(2)}` : 'PUS',
          size: 2,
        });
      }

      // PDS Candidate marker
      if (liveState.final_state.pds_candidate?.bar) {
        const pdsTime = (new Date(liveState.final_state.pds_candidate.bar.timestamp).getTime() / 1000) as UTCTimestamp;
        const pdsBar = ohlcDataMap.get(pdsTime);
        allMarkers.push({
          time: pdsTime,
          position: 'aboveBar' as const,
          color: '#ff9800', // Orange
          shape: 'circle' as const,
          text: pdsBar ? `PDS ${pdsBar.high.toFixed(2)}` : 'PDS',
          size: 2,
        });
      }
    }

    // Set all markers
    if (markersApiRef.current && allMarkers.length > 0) {
      allMarkers.sort((a, b) => a.time - b.time);
      markersApiRef.current.setMarkers(allMarkers);
    }
    
    // The chart no longer needs to be refit here, as the initial load is just history.
    // chartRef.current?.timeScale().fitContent();

  }, [ohlcApiResponse, signalsApiResponse, selectedContract, selectedTimeframe, liveState]);

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

        if (candlestickSeriesRef.current) {
          // Initialize the series markers plugin and store its API
          markersApiRef.current = createSeriesMarkers(candlestickSeriesRef.current, []);
        }
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
    if (candlestickSeriesRef.current && chartRef.current && ohlcApiResponse) {
        // Update timescale seconds visibility when timeframe changes
        chartRef.current.applyOptions({
            timeScale: {
                secondsVisible: selectedTimeframe.endsWith('m') || selectedTimeframe.endsWith('s'),
            }
        });
        prepareChartData(); // This is the new main function to call
    }
  }, [selectedTimeframe, ohlcApiResponse, prepareChartData]);


  // EFFECT FOR WEBSOCKET CONNECTION AND LIVE DATA
  useEffect(() => {
    if (!isDataLoaded || !candlestickSeriesRef.current) {
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
            
            setSeriesData(currentData => {
              if (currentData.length === 0) {
                series.update(barData);
                return [barData];
              }

              const newData = [...currentData];
              const existingBarIndex = newData.findIndex(d => d.time === barData.time);

              if (existingBarIndex !== -1) {
                newData[existingBarIndex] = barData;
              } else {
                newData.push(barData);
                // Ensure data is sorted if a bar was missed and is now being added
                newData.sort((a, b) => a.time - b.time);
              }
              
              // Only call series.update() if the bar being updated is the last one.
              // This prevents the "Cannot update oldest data" error.
              const lastBarInNewData = newData[newData.length - 1];
              if (lastBarInNewData.time === barData.time) {
                series.update(barData);
              }

              return newData;
            });
          }
        } else if (message.type === 'tick' && message.contract_id === selectedContract) {
          // Tick applies to the currently forming bar of the *selectedTimeframe*
          setSeriesData(currentData => {
            if (currentData.length === 0) return currentData;
            
            const lastBar = currentData[currentData.length - 1];
            const tickPrice = Number(message.price);
            const tickTime = (new Date(message.timestamp).getTime() / 1000) as UTCTimestamp;
            const timeframeSeconds = getTimeframeInSeconds(selectedTimeframe);
            
            const tickBarStartTime = getBarStartTime(tickTime, timeframeSeconds);

            if (lastBar.time === tickBarStartTime) {
              // Tick belongs to the last bar, update it
              const updatedBar = {
                ...lastBar,
                high: Math.max(lastBar.high, tickPrice),
                low: Math.min(lastBar.low, tickPrice),
                close: tickPrice,
              };
              series.update(updatedBar);
              const newData = [...currentData];
              newData[newData.length - 1] = updatedBar;
              return newData;
            } else if (tickBarStartTime > lastBar.time) {
              // This is the first tick for a new bar. Create it.
              const newBar = {
                time: tickBarStartTime,
                open: tickPrice,
                high: tickPrice,
                low: tickPrice,
                close: tickPrice,
              };
              series.update(newBar);
              return [...currentData, newBar];
            }
            
            // If the tick is for a past bar, ignore it for this logic
            return currentData;
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
  }, [isDataLoaded, selectedContract, selectedTimeframe]); // Key dependencies

  if (ohlcError || signalsError) return (
    <div className="p-4">
      <p className="text-red-500">Error loading data:</p>
      {ohlcError && <pre>{JSON.stringify(ohlcError, null, 2)}</pre>}
      {signalsError && <pre>{JSON.stringify(signalsError, null, 2)}</pre>}
    </div>
  );

  return (
    <Layout>
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
            onChange={(e) => {
              setIsDataLoaded(false); // Reset on change
              setSelectedContract(e.target.value);
            }}
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
            onChange={(e) => {
              setIsDataLoaded(false); // Reset on change
              setSelectedTimeframe(e.target.value);
            }}
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

      <TrendAnalysisStatus contractId={selectedContract} timeframe={selectedTimeframe} />

      <div ref={chartContainerRef} className="w-full bg-white rounded-lg shadow mb-6" />

      <div className="flex space-x-4 my-4">
          <PendingSignalCard type="PUS" signalInfo={liveState?.final_state?.pus_candidate} />
          <PendingSignalCard type="PDS" signalInfo={liveState?.final_state?.pds_candidate} />
      </div>

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

        <DebugLogViewer 
            logs={liveState?.debug_logs} 
            isLoading={liveStateIsLoading}
            error={liveStateError ? (liveStateError.message || 'Failed to load live logs') : null}
        />

    </div>
    </Layout>
  );
};

export default TrendsPage; 