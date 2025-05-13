'use client';

import React from "react";
import TrendChartContainer from "@/components/charts/TrendChartContainer";
import { Card } from "@/components/ui/card";
import Layout from "@/components/layout/Layout";

export default function TrendsPage() {
  return (
    <Layout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Market Trends</h1>
        
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Trend Analysis</h2>
          <TrendChartContainer />
        </Card>
        
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-4">
            <h3 className="text-lg font-medium mb-2">Trend Indicators</h3>
            <ul className="space-y-2">
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                <span className="font-medium">Uptrend Start</span>
                <span className="ml-2 text-sm text-gray-500">Indicates the beginning of a potential uptrend</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-orange-500 mr-2"></span>
                <span className="font-medium">Downtrend Start</span>
                <span className="ml-2 text-sm text-gray-500">Indicates the beginning of a potential downtrend</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                <span className="font-medium">Highest Downtrend</span>
                <span className="ml-2 text-sm text-gray-500">Significant downtrend reversal point</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-green-600 mr-2"></span>
                <span className="font-medium">Unbroken Uptrend</span>
                <span className="ml-2 text-sm text-gray-500">Strong uptrend that wasn't broken by subsequent moves</span>
              </li>
              <li className="flex items-center">
                <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                <span className="font-medium">Key Level</span>
                <span className="ml-2 text-sm text-gray-500">Important price level for decision making</span>
              </li>
            </ul>
          </Card>
          
          <Card className="p-4">
            <h3 className="text-lg font-medium mb-2">How to Use Trend Indicators</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">Uptrend Start:</span> Consider long positions when this appears</li>
              <li><span className="font-medium">Downtrend Start:</span> Consider short positions or tighten stops</li>
              <li><span className="font-medium">Highest Downtrend:</span> Key resistance level for short-term trading</li>
              <li><span className="font-medium">Unbroken Uptrend:</span> Strong support level for potential bounce</li>
              <li><span className="font-medium">Key Levels:</span> Areas where price has shown significant reaction</li>
            </ul>
            <p className="mt-4 text-sm text-gray-600">
              These indicators are based on price action patterns and help identify potential
              trend changes and key decision points in the market.
            </p>
          </Card>
        </div>
      </div>
    </Layout>
  );
} 