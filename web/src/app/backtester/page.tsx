"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import TradeChart from '@/components/backtester/TradeChart';
import TopBar from '@/components/backtester/TopBar';
import CompactResultsPanel from '@/components/backtester/CompactResultsPanel';
import AnalysisPanel from '@/components/backtester/AnalysisPanel';
import CompactOrderPanel from '@/components/backtester/CompactOrderPanel';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { 
  BacktestBarData, 
  SubBarData, 
  PlaybackSpeed, 
  BarFormationMode, 
  TimeframeConfig, 
  Order,
  BacktestResults,
  SimulatedTrade,
  StrategySignalType,
  TradeType,
  OrderSide,
  StrategySignal,
  OrderStatus,
  StrategyConfig
} from '@/lib/types/backtester';
import { IStrategy, StrategyResult, BaseStrategyConfig as GenericStrategyConfig } from '@/lib/types/strategy';
import { UTCTimestamp } from 'lightweight-charts';
import { EmaStrategy, EmaStrategyConfig } from '@/lib/strategies/EmaStrategy';
import { TrendStartStrategy, TrendStartStrategyConfig } from '@/lib/strategies/TrendStartStrategy';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';

type UIPanelStrategyConfig = Partial<EmaStrategyConfig & TrendStartStrategyConfig & GenericStrategyConfig>;

const parseTimeframeForApi = (timeframe: string): { unit: number; value: number } => {
  const unitChar = timeframe.slice(-1);
  const value = parseInt(timeframe.slice(0, -1), 10);
  let unit = 2; 
  switch (unitChar) {
    case 's': unit = 1; break; 
    case 'm': unit = 2; break; 
    case 'h': unit = 3; break; 
    case 'd': unit = 4; break; 
    case 'w': unit = 5; break; 
  }
  return { unit, value };
};

const getTimeframeConfig = (mainTimeframe: string): TimeframeConfig => {
  const configs: Record<string, TimeframeConfig> = {
    '5m': { main: '5m', sub: '1m', subBarsPerMain: 5 },
    '15m': { main: '15m', sub: '1m', subBarsPerMain: 15 },
    '30m': { main: '30m', sub: '5m', subBarsPerMain: 6 },
    '1h': { main: '1h', sub: '5m', subBarsPerMain: 12 },
    '4h': { main: '4h', sub: '15m', subBarsPerMain: 16 },
    '1d': { main: '1d', sub: '1h', subBarsPerMain: 24 },
  };
  return configs[mainTimeframe] || { main: mainTimeframe, sub: '1m', subBarsPerMain: 1 };
};

const mapSubBarsToMainBars = (mainBars: BacktestBarData[], subBars: BacktestBarData[], config: TimeframeConfig): SubBarData[] => {
  const mappedSubBars: SubBarData[] = [];
  mainBars.forEach((mainBar, mainBarIndex) => {
    const mainBarStart = mainBar.time;
    const mainBarEnd = mainBarStart + (config.subBarsPerMain * getTimeframeSeconds(config.sub));
    const relatedSubBars = subBars.filter(subBar => 
      subBar.time >= mainBarStart && subBar.time < mainBarEnd
    );
    relatedSubBars.forEach(subBar => {
      mappedSubBars.push({ ...subBar, parentBarIndex: mainBarIndex });
    });
  });
  return mappedSubBars.sort((a: SubBarData, b: SubBarData) => a.time - b.time);
};

const getTimeframeSeconds = (timeframe: string): number => {
  const unitChar = timeframe.slice(-1);
  const value = parseInt(timeframe.slice(0, -1), 10);
  switch (unitChar) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    case 'w': return value * 60 * 60 * 24 * 7;
    default: return 60; 
  }
};

const findFirstValidMainBarIndex = (subTimeframeBars: SubBarData[]): number => {
  if (subTimeframeBars.length === 0) return 0;
  const minParentIndex = Math.min(...subTimeframeBars.map(sb => sb.parentBarIndex));
  return Math.max(0, minParentIndex); 
};

const BacktesterPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [mainTimeframeBars, setMainTimeframeBars] = useState<BacktestBarData[]>([]);
  const [subTimeframeBars, setSubTimeframeBars] = useState<SubBarData[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [currentSubBarIndex, setCurrentSubBarIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(PlaybackSpeed.NORMAL);
  const [barFormationMode, setBarFormationMode] = useState<BarFormationMode>(BarFormationMode.PROGRESSIVE);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [timeframeConfig, setTimeframeConfig] = useState<TimeframeConfig | null>(null);

  const orderManagerRef = useRef(new OrderManager(0.25));

  const [selectedStrategy, setSelectedStrategy] = useState<string>('trendstart');
  
  const [emaStrategy] = useState(() => new EmaStrategy(orderManagerRef.current, {
    name: 'EMA Crossover', description: 'A simple EMA crossover strategy.', version: '1.0.0',
    fastPeriod: 12, slowPeriod: 26, commission: 2.5, positionSize: 1,
    stopLossPercent: 2.0, takeProfitPercent: 4.0, useMarketOrders: true,
  }));

  const trendIdentifierRef = useRef(new TrendIdentifier());
  const [trendStartStrategy] = useState(() => new TrendStartStrategy(
    orderManagerRef.current,
    trendIdentifierRef.current,
    {
      name: 'Trend Start Strategy', description: 'Trades on CUS/CDS signals.', version: '1.0.0',
      stopLossPercent: 2.0, takeProfitPercent: 4.0, useMarketOrders: true, commission: 2.5, positionSize: 1,
      confidenceThreshold: 0.6, minConfirmationBars: 2, contractId: 'DEFAULT_CONTRACT', timeframe: '1h'
    }
  ));
  
  const [currentStrategyInstance, setCurrentStrategyInstance] = useState<IStrategy>(trendStartStrategy);

  useEffect(() => {
    setCurrentStrategyInstance(selectedStrategy === 'ema' ? emaStrategy : trendStartStrategy);
  }, [selectedStrategy, emaStrategy, trendStartStrategy]);

  const [strategyConfig, setStrategyConfig] = useState<UIPanelStrategyConfig>({
    stopLossPercent: 2.0, takeProfitPercent: 4.0, commission: 2.50, positionSize: 1,
    useMarketOrders: true, limitOrderOffsetTicks: 2, fastPeriod: 12, slowPeriod: 26,
    minConfirmationBars: 2, confidenceThreshold: 0.6, contractId: 'CON.F.US.MES.M25', timeframe: '1d'
  });

  const [liveTradeMarkers, setLiveTradeMarkers] = useState<any[]>([]);
  const [liveStrategyState, setLiveStrategyState] = useState<{
    openTrade: SimulatedTrade | null; 
    pendingOrders: Order[];
    filledOrders: Order[];
    cancelledOrders: Order[];
    lastProcessedBarIndex: number;
    backtestResults: BacktestResults | null; 
    currentIndicators: Record<string, number | Record<string, number>>; 
  }>({
    openTrade: null,
    pendingOrders: [],
    filledOrders: [],
    cancelledOrders: [],
    lastProcessedBarIndex: -1,
    backtestResults: null,
    currentIndicators: {},
  });

  const [currentContract, setCurrentContract] = useState<string>('CON.F.US.MES.M25');
  const [currentTimeframe, setCurrentTimeframe] = useState<string>('1d');

  const resetLiveStrategy = useCallback(() => {
    currentStrategyInstance.reset(); 
    orderManagerRef.current.reset(); 
    setLiveStrategyState({
      openTrade: null, pendingOrders: [], filledOrders: [], cancelledOrders: [],
      lastProcessedBarIndex: -1, backtestResults: null, currentIndicators: {},
    });
    setLiveTradeMarkers([]);
  }, [currentStrategyInstance]);

  const processStrategyBars = useCallback(async (startIndex: number, endIndex: number) => {
    // Removed: const newTrendMarkers: any[] = []; 
    let currentIndicatorsForUpdate: Record<string, number | Record<string, number>> = {};
    let currentOpenTradeForUpdate: SimulatedTrade | null = null;

    // Process bars first to update strategy state
    for (let barIndex = startIndex; barIndex <= endIndex; barIndex++) {
      const currentMainBar = mainTimeframeBars[barIndex];
      if (!currentMainBar) continue;
      const relevantSubBars = subTimeframeBars.filter(sb => sb.parentBarIndex === barIndex);
      
      // This call updates currentStrategyInstance's internal state (signals, trades, etc.)
      const result: StrategyResult = await currentStrategyInstance.processBar(
          currentMainBar, relevantSubBars, barIndex, mainTimeframeBars
      );
      
      // Store indicators and open trade from the very last bar processed in this segment
      if (barIndex === endIndex) {
        currentIndicatorsForUpdate = result.indicators || {};
        currentOpenTradeForUpdate = currentStrategyInstance.getOpenTrade();
      }
    }
    
    // After processing all bars in the segment, collect all markers
    const allMarkersForChart: any[] = [];

    // 1. Collect general trade signals (BUY/SELL arrows for entries/exits)
    const tradeActionSignals = currentStrategyInstance.getSignals(); // From BaseStrategy
    tradeActionSignals.forEach(sig => {
      // Only include signals up to the endIndex of the current processing segment
      if (sig.barIndex <= endIndex && mainTimeframeBars[sig.barIndex]) {
        allMarkersForChart.push({
          time: mainTimeframeBars[sig.barIndex].time,
          position: sig.type === StrategySignalType.BUY ? 'belowBar' : 'aboveBar',
          color: sig.type === StrategySignalType.BUY ? '#26a69a' : '#ef5350',
          shape: sig.type === StrategySignalType.BUY ? 'arrowUp' : 'arrowDown',
          text: '', // Hide labels for trend start signals
          size: 1,
        });
      }
    });

    // 2. Trend start signals (CUS/CDS) are now hidden to avoid duplicate markers
    // The trade action signals (BUY/SELL) above are sufficient to show strategy actions
    // Trend start signals are still processed internally by the strategy but not displayed
        
    const finalResults = currentStrategyInstance.getCurrentBacktestResults ? currentStrategyInstance.getCurrentBacktestResults() : null;
    
    // Deduplicate and sort all markers before setting state
    const uniqueMarkers = Array.from(new Map(allMarkersForChart.map(m => [`${m.time}-${m.text}-${m.shape}-${m.position}`, m])).values());
    uniqueMarkers.sort((a, b) => a.time - b.time);
    setLiveTradeMarkers(uniqueMarkers);

    setLiveStrategyState(prevState => ({ 
      ...prevState,
      pendingOrders: currentStrategyInstance.getPendingOrders(),
      filledOrders: currentStrategyInstance.getFilledOrders(),
      cancelledOrders: currentStrategyInstance.getCancelledOrders(),
      lastProcessedBarIndex: endIndex,
      backtestResults: finalResults, 
      currentIndicators: currentIndicatorsForUpdate,
      openTrade: currentOpenTradeForUpdate,
    }));
  }, [mainTimeframeBars, subTimeframeBars, selectedStrategy, currentStrategyInstance, liveTradeMarkers]);

  const buildStrategyStateUpToBar = useCallback(async (targetBarIndex: number) => {
    if (mainTimeframeBars.length === 0 || targetBarIndex < 0 || targetBarIndex >= mainTimeframeBars.length) {
      return;
    }
    const lastProcessedIndex = liveStrategyState.lastProcessedBarIndex;
    const needsFullRebuild = targetBarIndex < lastProcessedIndex || lastProcessedIndex < 0;
    
    if (needsFullRebuild) {
      currentStrategyInstance.reset();
      orderManagerRef.current.reset(); 
      setLiveTradeMarkers([]); 
      await processStrategyBars(0, targetBarIndex);
    } else if (targetBarIndex > lastProcessedIndex) {
      await processStrategyBars(lastProcessedIndex + 1, targetBarIndex);
    }
  }, [mainTimeframeBars, currentStrategyInstance, liveStrategyState.lastProcessedBarIndex, processStrategyBars]);

  const handleCancelOrder = useCallback((orderId: string) => {
      orderManagerRef.current.cancelOrder(orderId);
      buildStrategyStateUpToBar(currentBarIndex); 
  }, [buildStrategyStateUpToBar, currentBarIndex]);

  useEffect(() => {
    if (isPlaying && mainTimeframeBars.length > 0) {
      playbackIntervalRef.current = setInterval(() => {
        if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
          setCurrentSubBarIndex(prevSubIndex => {
            const subBarsForCurrentMain = subTimeframeBars.filter(sb => sb.parentBarIndex === currentBarIndex);
            if (prevSubIndex >= subBarsForCurrentMain.length - 1) {
              setCurrentBarIndex(prevBarIndex => {
                if (prevBarIndex >= mainTimeframeBars.length - 1) {
                  setIsPlaying(false); return prevBarIndex;
                }
                return prevBarIndex + 1;
              });
              return 0; 
            }
            return prevSubIndex + 1;
          });
        } else {
          setCurrentBarIndex(prevIndex => {
            if (prevIndex >= mainTimeframeBars.length - 1) {
              setIsPlaying(false); return prevIndex;
            }
            return prevIndex + 1;
          });
        }
      }, playbackSpeed);
    } else {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    }
    return () => { if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current); };
  }, [isPlaying, playbackSpeed, mainTimeframeBars.length, subTimeframeBars.length, currentBarIndex, barFormationMode]);

  const lastStrategyUpdateRef = useRef<number>(0);
  const strategyUpdateThrottleMs = 50; 

  useEffect(() => {
    if (mainTimeframeBars.length > 0 && currentBarIndex >= 0 && currentBarIndex < mainTimeframeBars.length) { 
      const now = Date.now();
      if (now - lastStrategyUpdateRef.current >= strategyUpdateThrottleMs) {
        lastStrategyUpdateRef.current = now;
        buildStrategyStateUpToBar(currentBarIndex).catch(console.error);
      }
    }
  }, [currentBarIndex, mainTimeframeBars, buildStrategyStateUpToBar]);

  useEffect(() => {
    if (mainTimeframeBars.length > 0) resetLiveStrategy();
  }, [mainTimeframeBars.length, resetLiveStrategy]);

  useEffect(() => {
    resetLiveStrategy(); 
  }, [selectedStrategy, resetLiveStrategy]);
  
  const handlePlayPause = useCallback(() => setIsPlaying(prev => !prev), []);
  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => setPlaybackSpeed(speed), []);
  const handleReset = useCallback(() => {
    setIsPlaying(false);
    const firstValidIdx = barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0 ? findFirstValidMainBarIndex(subTimeframeBars) : 0;
    setCurrentBarIndex(firstValidIdx);
    setCurrentSubBarIndex(0);
    resetLiveStrategy();
    if (mainTimeframeBars.length > 0 && firstValidIdx < mainTimeframeBars.length) {
        buildStrategyStateUpToBar(firstValidIdx); 
    }
  }, [resetLiveStrategy, barFormationMode, subTimeframeBars, buildStrategyStateUpToBar, mainTimeframeBars]);

  const handleBarFormationModeChange = useCallback((mode: BarFormationMode) => {
    setBarFormationMode(mode);
    setIsPlaying(false);
    setCurrentSubBarIndex(0);
    if (mode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      setCurrentBarIndex(findFirstValidMainBarIndex(subTimeframeBars));
    }
  }, [subTimeframeBars]);

  const handleLoadData = useCallback(async (params: { contractId: string; timeframe: string; limit: number }) => {
    setIsLoading(true); setError(null); setMainTimeframeBars([]); setSubTimeframeBars([]);
    setCurrentBarIndex(0); setCurrentSubBarIndex(0); setIsPlaying(false);
    
    setCurrentContract(params.contractId); 
    setCurrentTimeframe(params.timeframe);
    
    const newStrategyConfigBase = { contractId: params.contractId, timeframe: params.timeframe };
    emaStrategy.updateConfig(newStrategyConfigBase);
    trendStartStrategy.updateConfig(newStrategyConfigBase);

    resetLiveStrategy(); 

    const config = getTimeframeConfig(params.timeframe);
    setTimeframeConfig(config);

    try {
      const mainApiUrl = `/api/market-data/bars?contractId=${encodeURIComponent(params.contractId)}&timeframeUnit=${parseTimeframeForApi(config.main).unit}&timeframeValue=${parseTimeframeForApi(config.main).value}&limit=${params.limit}&all=false`;
      const mainResponse = await fetch(mainApiUrl);
      if (!mainResponse.ok) { const errText = await mainResponse.text(); throw new Error(errText || `Main API Error: ${mainResponse.status}`);}
      const mainData = await mainResponse.json();
      if (!mainData.bars || !Array.isArray(mainData.bars)) throw new Error('Invalid main data');
      const formattedMainBars: BacktestBarData[] = mainData.bars.map((bar: any) => ({
        time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(bar.open), high: parseFloat(bar.high), low: parseFloat(bar.low), close: parseFloat(bar.close),
        volume: bar.volume != null ? parseFloat(bar.volume) : undefined,
      })).sort((a: BacktestBarData, b: BacktestBarData) => a.time - b.time);
      setMainTimeframeBars(formattedMainBars);

      if (barFormationMode === BarFormationMode.PROGRESSIVE && config.main !== config.sub) {
        const subLimit = params.limit * config.subBarsPerMain * 2;
        const subApiUrl = `/api/market-data/bars?contractId=${encodeURIComponent(params.contractId)}&timeframeUnit=${parseTimeframeForApi(config.sub).unit}&timeframeValue=${parseTimeframeForApi(config.sub).value}&limit=${subLimit}&all=false`;
        const subResponse = await fetch(subApiUrl);
        if (subResponse.ok) {
          const subData = await subResponse.json();
          if (subData.bars && Array.isArray(subData.bars)) {
            const formattedSubBars: BacktestBarData[] = subData.bars.map((bar: any) => ({
              time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
              open: parseFloat(bar.open), high: parseFloat(bar.high), low: parseFloat(bar.low), close: parseFloat(bar.close),
              volume: bar.volume != null ? parseFloat(bar.volume) : undefined,
            })).sort((a: BacktestBarData, b: BacktestBarData) => a.time - b.time);
            setSubTimeframeBars(mapSubBarsToMainBars(formattedMainBars, formattedSubBars, config));
          }
        }
      } else {
        setSubTimeframeBars([]);
      }
      if (formattedMainBars.length > 0) {
        const firstIdx = barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0 ? findFirstValidMainBarIndex(subTimeframeBars) : 0;
        if (firstIdx < formattedMainBars.length) {
            setCurrentBarIndex(firstIdx); 
            await buildStrategyStateUpToBar(firstIdx);
        } else if (formattedMainBars.length > 0) {
            setCurrentBarIndex(0);
            await buildStrategyStateUpToBar(0);
        }
      }
    } catch (err: any) { setError(err.message || 'Failed to load data.');
    } finally { setIsLoading(false); }
  }, [barFormationMode, resetLiveStrategy, buildStrategyStateUpToBar, emaStrategy, trendStartStrategy]);

  const liveResults = liveStrategyState.backtestResults;
  const liveTradesData = liveResults?.trades || [];
  const liveTotalPnL = liveResults?.totalProfitOrLoss || 0;
  const liveWinRate = liveResults?.winRate || 0;
  const liveTotalTrades = liveResults?.totalTrades || 0;

  const handleConfigChange = useCallback(async (newConfigFromPanel: UIPanelStrategyConfig) => {
    setStrategyConfig(newConfigFromPanel); 
    
    const currentStrat = selectedStrategy === 'ema' ? emaStrategy : trendStartStrategy;
    
    const newBaseConfig: Partial<GenericStrategyConfig> = {
        commission: newConfigFromPanel.commission,
        positionSize: newConfigFromPanel.positionSize,
        stopLossPercent: newConfigFromPanel.stopLossPercent,
        takeProfitPercent: newConfigFromPanel.takeProfitPercent,
        useMarketOrders: newConfigFromPanel.useMarketOrders,
        limitOrderOffsetTicks: newConfigFromPanel.limitOrderOffsetTicks || newConfigFromPanel.limitOrderOffset,
        contractId: newConfigFromPanel.contractId || currentContract,
        timeframe: newConfigFromPanel.timeframe || currentTimeframe,
    };

    if (selectedStrategy === 'ema' && currentStrat instanceof EmaStrategy) {
        const emaConf: Partial<EmaStrategyConfig> = {
            ...newBaseConfig,
            fastPeriod: newConfigFromPanel.fastPeriod || 12,
            slowPeriod: newConfigFromPanel.slowPeriod || 26,
        };
        currentStrat.updateConfig(emaConf);
    } else if (selectedStrategy === 'trendstart' && currentStrat instanceof TrendStartStrategy) {
        const trendConf: Partial<TrendStartStrategyConfig> = {
            ...newBaseConfig,
            minConfirmationBars: newConfigFromPanel.minConfirmationBars || 2,
            confidenceThreshold: newConfigFromPanel.confidenceThreshold || 0.6,
        };
        currentStrat.updateConfig(trendConf);
    }
    
    if (mainTimeframeBars.length > 0) {
      setCurrentBarIndex(0); setCurrentSubBarIndex(0); setIsPlaying(false);
      resetLiveStrategy(); 
      await buildStrategyStateUpToBar(0);
    }
  }, [selectedStrategy, emaStrategy, trendStartStrategy, mainTimeframeBars.length, resetLiveStrategy, buildStrategyStateUpToBar, currentContract, currentTimeframe]);
  
  const handleNextBar = useCallback(() => {
    if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      const subBarsForCurrentMain = subTimeframeBars.filter(sb => sb.parentBarIndex === currentBarIndex);
      if (currentSubBarIndex >= subBarsForCurrentMain.length - 1) {
        if (currentBarIndex < mainTimeframeBars.length - 1) {
          setCurrentBarIndex(prev => prev + 1);
          setCurrentSubBarIndex(0);
        }
      } else {
        setCurrentSubBarIndex(prev => prev + 1);
      }
    } else {
      if (currentBarIndex < mainTimeframeBars.length - 1) {
        setCurrentBarIndex(prev => prev + 1);
      }
    }
  }, [currentBarIndex, currentSubBarIndex, mainTimeframeBars.length, subTimeframeBars, barFormationMode]);

  const handlePreviousBar = useCallback(() => {
     if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      if (currentSubBarIndex > 0) {
        setCurrentSubBarIndex(prev => prev - 1);
      } else if (currentBarIndex > 0) {
        const prevMainIdx = currentBarIndex - 1;
        setCurrentBarIndex(prevMainIdx);
        const subBarsForPrevMain = subTimeframeBars.filter(sb => sb.parentBarIndex === prevMainIdx);
        setCurrentSubBarIndex(Math.max(0, subBarsForPrevMain.length - 1));
      }
    } else {
      setCurrentBarIndex(prev => Math.max(0, prev - 1));
    }
  }, [currentBarIndex, currentSubBarIndex, subTimeframeBars, barFormationMode]);


  return (
    <Layout fullWidth={true}>
      <div className="flex flex-col space-y-4">
        <TopBar 
          onLoadData={handleLoadData} 
          isLoading={isLoading}
          currentBarIndex={currentBarIndex}
          currentSubBarIndex={currentSubBarIndex}
          totalBars={mainTimeframeBars.length}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          barFormationMode={barFormationMode}
          onNextBar={handleNextBar}
          onPreviousBar={handlePreviousBar}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
          onReset={handleReset}
          onBarFormationModeChange={handleBarFormationModeChange}
          selectedStrategy={selectedStrategy}
          onStrategyChange={setSelectedStrategy}
        />
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <div className="relative bg-white rounded-lg shadow-sm border">
          <div className="h-[700px] flex">
            <div className="flex-1">
              <ErrorBoundary
                resetKeys={[mainTimeframeBars.length, currentBarIndex, selectedStrategy]}
                resetOnPropsChange={true}
                onError={(error, errorInfo) => {
                  console.error('TradeChart Error:', error, errorInfo);
                  setError(`Chart error: ${error.message}`);
                }}
              >
                <TradeChart 
                  mainTimeframeBars={mainTimeframeBars}
                  subTimeframeBars={subTimeframeBars}
                  currentBarIndex={currentBarIndex}
                  currentSubBarIndex={currentSubBarIndex}
                  barFormationMode={barFormationMode}
                  timeframeConfig={timeframeConfig}
                  tradeMarkers={liveTradeMarkers}
                  emaData={selectedStrategy === 'ema' ? undefined : undefined}
                  pendingOrders={liveStrategyState.pendingOrders}
                  filledOrders={liveStrategyState.filledOrders}
                  openPositions={liveStrategyState.openTrade ? [{
                      entryPrice: liveStrategyState.openTrade.entryPrice,
                      stopLossPrice: liveStrategyState.openTrade.stopLossOrder?.stopPrice,
                      takeProfitPrice: liveStrategyState.openTrade.takeProfitOrder?.price,
                  }] : []}
                /> 
              </ErrorBoundary>
            </div>
            
            {(liveStrategyState.pendingOrders.length > 0 || liveStrategyState.filledOrders.length > 0 || liveStrategyState.openTrade) && (
              <div className="w-80 bg-gray-800 border-l border-gray-700">
                <ErrorBoundary
                  resetKeys={[liveStrategyState.pendingOrders.length, liveStrategyState.filledOrders.length]}
                  resetOnPropsChange={true}
                >
                  <CompactOrderPanel 
                    pendingOrders={liveStrategyState.pendingOrders}
                    filledOrders={liveStrategyState.filledOrders}
                    openPositions={liveStrategyState.openTrade ? [{
                      entryPrice: liveStrategyState.openTrade.entryPrice,
                      stopLossPrice: liveStrategyState.openTrade.stopLossOrder?.stopPrice,
                      takeProfitPrice: liveStrategyState.openTrade.takeProfitOrder?.price,
                    }] : []}
                    onCancelOrder={handleCancelOrder}
                  />
                </ErrorBoundary>
              </div>
            )}
          </div>
          
          <div className="absolute top-4 right-4 w-48 z-10">
            <ErrorBoundary
              resetKeys={[liveTotalPnL, liveWinRate, liveTotalTrades]}
              resetOnPropsChange={true}
            >
              <CompactResultsPanel 
                profitOrLoss={liveTotalPnL}
                winRate={liveWinRate}
                totalTrades={liveTotalTrades}
              />
            </ErrorBoundary>
          </div>
        </div>

        <ErrorBoundary
          resetKeys={[
            liveTradesData.length, 
            selectedStrategy, 
            strategyConfig.commission,
            strategyConfig.positionSize,
            strategyConfig.stopLossPercent,
            strategyConfig.takeProfitPercent
          ]}
          resetOnPropsChange={true}
        >
          <AnalysisPanel 
            trades={liveTradesData} 
            totalPnL={liveTotalPnL}
            winRate={liveWinRate}
            totalTrades={liveTotalTrades}
            pendingOrders={liveStrategyState.pendingOrders}
            filledOrders={liveStrategyState.filledOrders}
            cancelledOrders={liveStrategyState.cancelledOrders}
            onCancelOrder={handleCancelOrder}
            currentConfig={
              {
                // Core fields from backtester.ts#StrategyConfig
                commission: strategyConfig.commission ?? 0,
                positionSize: strategyConfig.positionSize ?? 1,
                stopLossPercent: strategyConfig.stopLossPercent ?? 0,
                stopLossTicks: strategyConfig.stopLossTicks ?? 0,
                takeProfitPercent: strategyConfig.takeProfitPercent ?? 0,
                takeProfitTicks: strategyConfig.takeProfitTicks ?? 0,
                useMarketOrders: strategyConfig.useMarketOrders ?? true,
                limitOrderOffset: strategyConfig.limitOrderOffsetTicks ?? strategyConfig.limitOrderOffset ?? 0,
                orderTimeoutBars: strategyConfig.orderTimeoutBars ?? 0,
                
                // Explicitly include all fields from UIPanelStrategyConfig with defaults
                // to ensure the object is as complete as possible before any cast.
                name: strategyConfig.name ?? 'N/A',
                description: strategyConfig.description ?? 'N/A',
                version: strategyConfig.version ?? 'N/A',
                contractId: strategyConfig.contractId, // Optional in Base, might be needed
                timeframe: strategyConfig.timeframe,   // Optional in Base, might be needed
                
                fastPeriod: strategyConfig.fastPeriod ?? 12,
                slowPeriod: strategyConfig.slowPeriod ?? 26,
                minConfirmationBars: strategyConfig.minConfirmationBars ?? 2,
                confidenceThreshold: strategyConfig.confidenceThreshold ?? 0.6,
                limitOrderOffsetTicks: strategyConfig.limitOrderOffsetTicks // Already handled by limitOrderOffset
              } as any // Last resort: cast to any to bypass persistent specific type error
            }
            onConfigChange={handleConfigChange as (config: UIPanelStrategyConfig) => void}
          />
        </ErrorBoundary>
      </div>
    </Layout>
  );
};

export default BacktesterPage;
