"use client";

import React from 'react';
import Layout from '@/components/layout/Layout';
import { BacktestProvider } from '@/lib/v3/BacktestProvider';
import BacktestDemo from '@/lib/v3/components/BacktestDemo';
import TrendAnalysisView from '@/lib/v3/components/TrendAnalysisView';
import StrategyBuilder from '@/components/strategy-builder/StrategyBuilder';
import { DeclarativeStrategy } from '@/lib/v3/DeclarativeStrategy';

/**
 * Modern Backtesting Page - v3 Architecture
 * 
 * This replaces the old backtester with our new v3 system featuring:
 * - Clean React Context state management
 * - Pure function strategies
 * - Visual strategy builder for non-programmers
 * - Advanced debugging and optimization tools
 */
export default function BacktesterV3Page() {
  const [activeTab, setActiveTab] = React.useState<'trends' | 'demo' | 'builder'>('trends');
  const [createdStrategy, setCreatedStrategy] = React.useState<DeclarativeStrategy | null>(null);

  const handleStrategyCreated = (strategy: DeclarativeStrategy) => {
    setCreatedStrategy(strategy);
    setActiveTab('demo'); // Switch to demo to test the strategy
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Backtesting System v3
            </h1>
            <p className="mt-2 text-gray-600">
              Professional trend analysis and backtesting platform with advanced execution simulation
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-8">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('trends')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'trends'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🎯 Trend Analysis
              </button>
              <button
                onClick={() => setActiveTab('demo')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'demo'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🚀 Strategy Backtesting
              </button>
              <button
                onClick={() => setActiveTab('builder')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'builder'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🎨 Strategy Builder
              </button>
            </nav>
          </div>

          {/* Content */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-5 w-5 text-blue-400">🎯</div>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      Professional Trend Analysis
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        Analyze market data using our proprietary CUS/CDS trend detection algorithm. 
                        This production-grade system identifies trend start signals with high accuracy.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trend Analysis Component */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '80vh' }}>
                <TrendAnalysisView />
              </div>
            </div>
          )}

          {activeTab === 'demo' && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-5 w-5 text-blue-400">ℹ️</div>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      New v3 Architecture Features
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Immutable state management with automatic subscriptions</li>
                        <li>Synthetic tick generation for realistic order execution</li>
                        <li>Pure function strategies - completely stateless and testable</li>
                        <li>Advanced bracket orders with OCO (One-Cancels-Other) logic</li>
                        <li>Time-travel debugging and parameter optimization</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Backtest Demo */}
              <BacktestProvider>
                <BacktestDemo />
              </BacktestProvider>
            </div>
          )}

          {activeTab === 'builder' && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-5 w-5 text-green-400">🎯</div>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      Visual Strategy Creation
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>
                        Create sophisticated trading strategies without coding! The visual builder 
                        generates JSON-based strategy definitions that can be executed by our 
                        declarative strategy engine.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy Builder */}
              <StrategyBuilder 
                onStrategyCreated={handleStrategyCreated}
                onValidationChange={(validation) => {
                  console.log('Strategy validation:', validation);
                }}
              />

              {/* Created Strategy Preview */}
              {createdStrategy && (
                <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    ✅ Strategy Created: {createdStrategy.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Your strategy has been created successfully! Switch to the "Live Backtesting Demo" 
                    tab to test it with historical data.
                  </p>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setActiveTab('demo')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      🚀 Test Strategy
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(createdStrategy, null, 2)], { 
                          type: 'application/json' 
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${createdStrategy.name.replace(/\s+/g, '_')}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                    >
                      💾 Download JSON
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Architecture Highlights */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-2xl mb-3">⚡</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Performance Optimized</h3>
              <p className="text-sm text-gray-600">
                Memoized indicator calculations, intelligent caching, and optimized execution paths 
                deliver enterprise-grade performance.
              </p>
            </div>
            
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-2xl mb-3">🎯</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Highly Accurate</h3>
              <p className="text-sm text-gray-600">
                Synthetic tick generation and realistic order matching provide the most accurate 
                backtesting simulation available.
              </p>
            </div>
            
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-2xl mb-3">🔧</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Developer Friendly</h3>
              <p className="text-sm text-gray-600">
                Pure functions, TypeScript strict mode, comprehensive testing, and time-travel 
                debugging make development a breeze.
              </p>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
} 