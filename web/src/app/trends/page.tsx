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
  createSeriesMarkers
} from 'lightweight-charts';
import useSWR from 'swr';

const availableContracts = ['CON.F.US.MES.M25', 'CON.F.US.ES.M25', 'CON.F.US.NQ.M25'];
const availableTimeframes = ['5m', '15m', '30m', '1h', '4h', '1d'];

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

interface OhlcData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

const TrendsPage: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [selectedContract, setSelectedContract] = useState<string>(availableContracts[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(availableTimeframes[3]); // Default to 1h
  const [ohlcLimit, setOhlcLimit] = useState<number>(500); // Number of OHLC bars to fetch

  const { data: ohlcApiResponse, error: ohlcError, isLoading: ohlcIsLoading } = useSWR(
    selectedContract && selectedTimeframe ? `/api/ohlc?contract=${selectedContract}&timeframe=${selectedTimeframe}&limit=${ohlcLimit}` : null,
    fetcher
  );

  const { data: signalsApiResponse, error: signalsError, isLoading: signalsIsLoading } = useSWR(
    selectedContract && selectedTimeframe ? `/api/trend-starts?contract_id=${selectedContract}&timeframe=${selectedTimeframe}&limit=1000` : null, // Fetch a good number of signals
    fetcher
  );

  const processChartData = useCallback(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !ohlcApiResponse?.data || !signalsApiResponse?.data) {
      return;
    }

    const ohlcData: OhlcData[] = ohlcApiResponse.data
      .map((bar: any) => ({
        time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
      .sort((a: OhlcData, b: OhlcData) => a.time - b.time); // Ensure ascending order for chart

    candlestickSeriesRef.current.setData(ohlcData);

    const signalMarkers: SeriesMarker<UTCTimestamp>[] = signalsApiResponse.data
      .filter((signal: Signal) => signal.contract_id === selectedContract && signal.timeframe === selectedTimeframe)
      .map((signal: Signal) => ({
        time: (new Date(signal.timestamp).getTime() / 1000) as UTCTimestamp,
        position: signal.signal_type === 'uptrend_start' ? 'belowBar' : 'aboveBar',
        color: signal.signal_type === 'uptrend_start' ? '#26a69a' : '#ef5350',
        shape: signal.signal_type === 'uptrend_start' ? 'arrowUp' : 'arrowDown',
        text: signal.signal_type === 'uptrend_start' ? 'UT' : 'DT',
        size: 1.5,
      }));
    
    if (candlestickSeriesRef.current && signalMarkers.length > 0) {
      createSeriesMarkers(candlestickSeriesRef.current, signalMarkers);
    }

    chartRef.current.timeScale().fitContent();

  }, [ohlcApiResponse, signalsApiResponse, selectedContract, selectedTimeframe]);


  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600, // Adjust as needed
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: {
          color: 'rgba(197, 203, 206, 0.2)',
        },
        horzLines: {
          color: 'rgba(197, 203, 206, 0.2)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        timeVisible: true,
        secondsVisible: selectedTimeframe.endsWith('m') || selectedTimeframe.endsWith('s'), // Show seconds for minute/second timeframes
      },
    });

    candlestickSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [selectedTimeframe]); // Recreate chart if timeframe changes to adjust timeScale visibility

  useEffect(() => {
    processChartData();
  }, [processChartData]);

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
         <div>
          <label htmlFor="ohlcLimit" className="block text-sm font-medium text-gray-700 mb-1">OHLC Bars:</label>
          <input 
            type="number" 
            id="ohlcLimit" 
            value={ohlcLimit}
            onChange={(e) => setOhlcLimit(parseInt(e.target.value, 10) || 100)} // Default to 100 if parsing fails
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            min="50"
            max="2000"
            step="50"
          />
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
                  .map((signal: Signal) => (
                  <tr key={signal.signal_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(signal.timestamp).toLocaleString()}</td>
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
                ))}
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