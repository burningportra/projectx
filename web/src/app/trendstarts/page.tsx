'use client';

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import Layout from "@/components/layout/Layout";
import TrendStartsTraining from "@/components/training/TrendStartsTraining";

export default function TrendStartsPage() {
  return (
    <Layout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Trend Starts Training</h1>
        
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Train Trend Detection Algorithm</h2>
          <p className="text-gray-600 mb-6">
            This page allows you to train the trend starts detection algorithm by reviewing, confirming, 
            or rejecting automatically detected trend starts. You can also manually mark new trend starts 
            that were missed by the algorithm.
          </p>
          
          <TrendStartsTraining />
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4">
            <h3 className="text-lg font-medium mb-2">Training Instructions</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Select your desired timeframe from the dropdown menu</li>
              <li>Review the detected trend starts in the table</li>
              <li>Remove incorrectly marked trend starts by clicking the remove button</li>
              <li>Select any row to mark a new trend start point</li>
              <li>Choose the appropriate trend type for the selected candle</li>
              <li>Submit your changes to train the algorithm</li>
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