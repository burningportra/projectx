'use client';

import React, { useState, useEffect } from "react";
import TrendChart from "./TrendChart";
import { OhlcBar } from "@/lib/prisma";
import useSWR from "swr";

interface OhlcBarWithTrends extends OhlcBar {
  uptrendStart: boolean;
  downtrendStart: boolean;
  highestDowntrendStart: boolean;
  unbrokenUptrendStart: boolean;
  uptrendToHigh: boolean;
}

interface ChartData {
  bars: OhlcBarWithTrends[];
}

const TrendChartContainer = () => {
  const [contractId, setContractId] = useState("CON.F.US.MES.M25");
  const [timeframeUnit, setTimeframeUnit] = useState("2"); // 2 = minutes
  const [timeframeValue, setTimeframeValue] = useState("5"); // 5 minute bars
  const [limit, setLimit] = useState("100");

  // SWR fetcher
  const fetcher = (url: string) => fetch(url).then((res) => res.json());

  // Build query URL
  const queryUrl = `/api/market-data/bars?contractId=${contractId}&timeframeUnit=${timeframeUnit}&timeframeValue=${timeframeValue}&limit=${limit}`;

  // Fetch data
  const { data, error, isLoading } = useSWR<ChartData>(queryUrl, fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // Available contracts and timeframes
  const contracts = [
    { id: "CON.F.US.MES.M25", name: "Micro E-mini S&P 500" },
    { id: "CON.F.US.MNQ.M25", name: "Micro E-mini Nasdaq" },
  ];

  const timeframes = [
    { unit: "2", value: "1", name: "1 Minute" },
    { unit: "2", value: "5", name: "5 Minutes" },
    { unit: "2", value: "15", name: "15 Minutes" },
    { unit: "3", value: "1", name: "1 Hour" },
    { unit: "4", value: "1", name: "1 Day" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contract
          </label>
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timeframe
          </label>
          <select
            value={`${timeframeUnit}-${timeframeValue}`}
            onChange={(e) => {
              const [unit, value] = e.target.value.split("-");
              setTimeframeUnit(unit);
              setTimeframeValue(value);
            }}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {timeframes.map((tf) => (
              <option key={`${tf.unit}-${tf.value}`} value={`${tf.unit}-${tf.value}`}>
                {tf.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Bars
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
      </div>
      
      <div className="mt-4">
        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <p>Loading chart data...</p>
          </div>
        )}
        
        {error && (
          <div className="flex justify-center items-center h-64 text-red-500">
            <p>Error loading chart data. Please try again.</p>
          </div>
        )}
        
        {data && data.bars && data.bars.length > 0 ? (
          <TrendChart data={data.bars} height={500} />
        ) : !isLoading && (
          <div className="flex justify-center items-center h-64 text-gray-500">
            <p>No data available for the selected criteria.</p>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        <p>
          Last updated: {data ? new Date().toLocaleString() : "Not loaded"}
        </p>
      </div>
    </div>
  );
};

export default TrendChartContainer; 