"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import TradeChart from '@/components/backtester/TradeChart';
import TopBar from '@/components/backtester/TopBar';
import CompactResultsPanel from '@/components/backtester/CompactResultsPanel';
import AnalysisPanel from '@/components/backtester/AnalysisPanel';
import OrdersPanel from '@/components/backtester/OrdersPanel';
import { BacktestBarData, SubBarData, PlaybackSpeed, BarFormationMode, TimeframeConfig } from '@/lib/types/backtester';
import { UTCTimestamp } from 'lightweight-charts';
import { EmaStrategy } from '@/lib/strategies/EmaStrategy';
import { TrendStartStrategy } from '@/lib/strategies/TrendStartStrategy';
import { BacktestEngine, BacktestConfig } from '@/lib/trading/BacktestEngine';
import { Order, Position } from '@/lib/trading/orders/types';

// Helper to parse timeframe string (e.g., "5m", "1h") into unit and value for API
const parseTimeframeForApi = (timeframe: string): { unit: number; value: number } => {
  const unitChar = timeframe.slice(-1);
  const value = parseInt(timeframe.slice(0, -1), 10);
  let unit = 2; // Default to minutes

  switch (unitChar) {
    case 's': unit = 1; break; // seconds
    case 'm': unit = 2; break; // minutes
    case 'h': unit = 3; break; // hours
    case 'd': unit = 4; break; // days
    case 'w': unit = 5; break; // weeks
    // case 'M': unit = 6; break; // months - if your API supports it
  }
  return { unit, value };
};

// Helper to determine appropriate sub-timeframe for bar formation
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

// Helper to determine which sub-bars belong to which main bar
const mapSubBarsToMainBars = (mainBars: BacktestBarData[], subBars: BacktestBarData[], config: TimeframeConfig): SubBarData[] => {
  const mappedSubBars: SubBarData[] = [];
  
  mainBars.forEach((mainBar, mainBarIndex) => {
    // Find sub-bars that fall within this main bar's timeframe
    const mainBarStart = mainBar.time;
    const mainBarEnd = mainBarStart + (config.subBarsPerMain * getTimeframeSeconds(config.sub));
    
    const relatedSubBars = subBars.filter(subBar => 
      subBar.time >= mainBarStart && subBar.time < mainBarEnd
    );
    
    relatedSubBars.forEach(subBar => {
      mappedSubBars.push({
        ...subBar,
        parentBarIndex: mainBarIndex
      });
    });
  });
  
  return mappedSubBars.sort((a, b) => a.time - b.time);
};

// Helper to get timeframe duration in seconds
const getTimeframeSeconds = (timeframe: string): number => {
  const unitChar = timeframe.slice(-1);
  const value = parseInt(timeframe.slice(0, -1), 10);
  
  switch (unitChar) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    case 'w': return value * 60 * 60 * 24 * 7;
    default: return 60; // Default to 1 minute
  }
};

const BacktesterPage = () => {
  const [results, setResults] = useState({
    profitOrLoss: 0,
    winRate: 0,
    totalTrades: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [mainTimeframeBars, setMainTimeframeBars] = useState<BacktestBarData[]>([]);
  const [subTimeframeBars, setSubTimeframeBars] = useState<SubBarData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [currentSubBarIndex, setCurrentSubBarIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(PlaybackSpeed.NORMAL);
  const [barFormationMode, setBarFormationMode] = useState<BarFormationMode>(BarFormationMode.PROGRESSIVE);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Current timeframe config
  const [timeframeConfig, setTimeframeConfig] = useState<TimeframeConfig | null>(null);

  // EMA Strategy state
  const [strategyTrades, setStrategyTrades] = useState<any[]>([]);
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);

  // Strategy selection state
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ema');
  const [emaStrategy] = useState(new EmaStrategy());
  const [trendStartStrategy] = useState(new TrendStartStrategy());

  // Live strategy execution state for bar-by-bar processing
  const [liveTradeMarkers, setLiveTradeMarkers] = useState<any[]>([]);
  const [liveStrategyState, setLiveStrategyState] = useState<{
    fastEmaValues: number[];
    slowEmaValues: number[];
    openTrade: any | null;
    tradeIdCounter: number;
    completedTrades: any[];
  }>({
    fastEmaValues: [],
    slowEmaValues: [],
    openTrade: null,
    tradeIdCounter: 1,
    completedTrades: [],
  });

  // Current data state - track timeframe and contract
  const [currentContract, setCurrentContract] = useState<string>('CON.F.US.MES.M25');
  const [currentTimeframe, setCurrentTimeframe] = useState<string>('1d');

  // BacktestEngine and Order Management state
  const [backtestEngine, setBacktestEngine] = useState<BacktestEngine | null>(null);
  const [currentOrders, setCurrentOrders] = useState<Order[]>([]);
  const [currentPositions, setCurrentPositions] = useState<Position[]>([]);
  const [equityCurveData, setEquityCurveData] = useState<Array<{ time: number; value: number }>>([]);
  
  // Trading parameters state
  const [tradingParams, setTradingParams] = useState<BacktestConfig>({
    contractId: 'CON.F.US.MES.M25',
    commission: 5.0,        // $5 per contract
    slippage: 0,           // No slippage for now
    initialCapital: 10000,  // $10,000
    positionSize: 1,       // 1 contract
    maxPositionSize: 5,    // Max 5 contracts
    useMarketOrders: true,
    enableStopLoss: false,
    enableTakeProfit: false,
  });

  // Advanced metrics state
  const [advancedMetrics, setAdvancedMetrics] = useState({
    sharpeRatio: 0,
    maxDrawdown: 0,
    profitFactor: 0,
    averageWin: 0,
    averageLoss: 0,
    totalCommission: 0,
  });

  // Initialize BacktestEngine when trading params change
  useEffect(() => {
    const engine = new BacktestEngine({
      ...tradingParams,
      contractId: currentContract,
    });

    // Listen to engine events
    engine.on('positionUpdated', (position: Position) => {
      setCurrentPositions(prev => {
        const updated = [...prev];
        const index = updated.findIndex(p => p.symbol === position.symbol);
        if (index >= 0) {
          updated[index] = position;
        } else {
          updated.push(position);
        }
        return updated;
      });
    });

    engine.on('equityUpdated', (equity: number, realizedPnL: number, unrealizedPnL: number) => {
      // Update results with new P&L
      setResults(prev => ({
        ...prev,
        profitOrLoss: realizedPnL + unrealizedPnL,
      }));
    });

    setBacktestEngine(engine);
  }, [tradingParams, currentContract]);

  // Reset live strategy when new data loads
  const resetLiveStrategy = useCallback(() => {
    setLiveStrategyState({
      fastEmaValues: [],
      slowEmaValues: [],
      openTrade: null,
      tradeIdCounter: 1,
      completedTrades: [],
    });
    setLiveTradeMarkers([]);
    
    // Reset the TrendStartStrategy state and cache
    trendStartStrategy.resetState();
  }, [trendStartStrategy]);

  // Process all bars from 0 to currentBarIndex to build complete strategy state
  const buildStrategyStateUpToBar = useCallback(async (targetBarIndex: number) => {
    if (mainTimeframeBars.length === 0 || targetBarIndex >= mainTimeframeBars.length || !backtestEngine) {
      console.log(`[buildStrategyStateUpToBar] Skipping - no bars, invalid index, or no engine. Bars: ${mainTimeframeBars.length}, Target: ${targetBarIndex}, Engine: ${!!backtestEngine}`);
      return;
    }
    
    console.log(`[buildStrategyStateUpToBar] Building ${selectedStrategy} strategy state from bar 0 to ${targetBarIndex}`);
    
    // Reset engine and load bars
    backtestEngine.loadBars(mainTimeframeBars);
    
    // Process each bar using the appropriate strategy
    const newMarkers: any[] = [];
    let currentStrategy: any;
    
    if (selectedStrategy === 'ema') {
      currentStrategy = emaStrategy;
    } else if (selectedStrategy === 'trendstart') {
      currentStrategy = trendStartStrategy;
    }
    
    // Process bars up to target index
    for (let barIndex = 0; barIndex <= targetBarIndex; barIndex++) {
      const currentBar = mainTimeframeBars[barIndex];
      
      // Get strategy signal
      const result = currentStrategy.processBar(currentBar, barIndex, mainTimeframeBars);
      
      // Process signal through BacktestEngine
      if (result.signal) {
        await backtestEngine.processSignal(result.signal);
        
        // Create visual marker
        const marker = {
          time: currentBar.time,
          position: result.signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
          color: result.signal.type === 'BUY' ? '#26a69a' : '#ef5350',
          shape: result.signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: result.signal.type === 'BUY' ? 'BUY' : 'SELL',
          size: 1,
        };
        newMarkers.push(marker);
      }
      
      // Advance the engine to process the bar
      if (barIndex < targetBarIndex) {
        await backtestEngine.advanceBar();
      }
    }
    
    // Get current state from engine
    const engineState = backtestEngine.getCurrentState();
    
    // Update orders and positions
    setCurrentOrders(engineState.orders);
    setCurrentPositions(engineState.positions);
    setEquityCurveData(engineState.equityCurve);
    
    // Update results
    const portfolio = engineState.portfolio;
    setResults({
      profitOrLoss: portfolio.realizedPnL + portfolio.unrealizedPnL,
      winRate: 0, // Will be calculated when trades complete
      totalTrades: engineState.orders.filter(o => o.status === 'FILLED').length,
    });
    
    // Update advanced metrics
    const positionSummary = backtestEngine.getPositionManager().getPositionSummary();
    setAdvancedMetrics(prev => ({
      ...prev,
      totalCommission: positionSummary.totalCommission,
    }));
    
    // Update visual markers with P&L
    const trades = backtestEngine.getPositionManager().getTradeHistory();
    const closedTrades = trades.filter(t => !t.isOpen);
    
    // Add P&L text to sell markers
    closedTrades.forEach((trade, idx) => {
      if (trade.exitTime) {
        const pnl = trade.realizedPnL || 0;
        const pnlText = pnl >= 0 ? `SELL +$${pnl.toFixed(0)}` : `SELL -$${Math.abs(pnl).toFixed(0)}`;
        
        // Find the corresponding marker and update its text
        const exitTime = (trade.exitTime.getTime() / 1000) as UTCTimestamp;
        const markerIndex = newMarkers.findIndex(m => m.time === exitTime && m.text === 'SELL');
        if (markerIndex >= 0) {
          newMarkers[markerIndex].text = pnlText;
          newMarkers[markerIndex].color = pnl >= 0 ? '#26a69a' : '#ef5350';
        }
      }
    });
    
    // Update markers and state
    setLiveTradeMarkers(newMarkers);
    
    // Update strategy-specific data (for indicators)
    if (selectedStrategy === 'ema') {
      const fastEmaValues: number[] = [];
      const slowEmaValues: number[] = [];
      
      // Rebuild EMA arrays from strategy
      for (let i = 0; i <= targetBarIndex; i++) {
        const bar = mainTimeframeBars[i];
        const res = emaStrategy.processBar(bar, i, mainTimeframeBars);
        if (res.indicators) {
          fastEmaValues.push(res.indicators.fastEma);
          slowEmaValues.push(res.indicators.slowEma);
        }
      }
      
      setLiveStrategyState(prev => ({
        ...prev,
        fastEmaValues,
        slowEmaValues,
        completedTrades: closedTrades,
      }));
    }
  }, [mainTimeframeBars, selectedStrategy, backtestEngine, emaStrategy, trendStartStrategy]);

  // Simple EMA calculation
  const calculateEMA = useCallback((prices: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const emaValues: number[] = [];
    
    if (prices.length === 0) return emaValues;
    emaValues[0] = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      emaValues[i] = prices[i] * k + emaValues[i - 1] * (1 - k);
    }
    
    return emaValues;
  }, []);

  // Run EMA backtest
  const runEmaBacktest = useCallback((bars: BacktestBarData[]) => {
    if (bars.length < 26) return; // Need enough data for EMAs
    
    setIsRunningBacktest(true);
    console.log('Running EMA 12/26 crossover strategy...');
    
    const closePrices = bars.map(bar => bar.close);
    const ema12 = calculateEMA(closePrices, 12);
    const ema26 = calculateEMA(closePrices, 26);
    
    const trades: any[] = [];
    let openTrade: any = null;
    let tradeId = 1;
    
    for (let i = 1; i < bars.length; i++) {
      const prevFast = ema12[i - 1];
      const prevSlow = ema26[i - 1];
      const currentFast = ema12[i];
      const currentSlow = ema26[i];
      
      // Bullish crossover (buy signal)
      if (prevFast <= prevSlow && currentFast > currentSlow && !openTrade) {
        openTrade = {
          id: `EMA_${tradeId++}`,
          entryTime: bars[i].time as number,
          entryPrice: bars[i].close,
          size: 1,
          type: 'BUY',
        };
      }
      // Bearish crossover (sell signal)
      else if (prevFast >= prevSlow && currentFast < currentSlow && openTrade) {
        const exitPrice = bars[i].close;
        const pnl = (exitPrice - openTrade.entryPrice) * openTrade.size - 5.0; // $2.50 commission each way
        
        trades.push({
          ...openTrade,
          exitTime: bars[i].time as number,
          exitPrice,
          profitOrLoss: pnl,
          status: 'CLOSED',
        });
        
        openTrade = null;
      }
    }
    
    // Close any open trade at the end
    if (openTrade && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const pnl = (lastBar.close - openTrade.entryPrice) * openTrade.size - 5.0;
      
      trades.push({
        ...openTrade,
        exitTime: lastBar.time as number,
        exitPrice: lastBar.close,
        profitOrLoss: pnl,
        status: 'CLOSED',
      });
    }
    
    setStrategyTrades(trades);
    setIsRunningBacktest(false);
    console.log(`EMA strategy completed. Generated ${trades.length} trades.`);
  }, [calculateEMA]);

  // Auto-playback effect
  useEffect(() => {
    console.log(`[Playback Effect] isPlaying: ${isPlaying}, mainTimeframeBars.length: ${mainTimeframeBars.length}, currentBarIndex: ${currentBarIndex}`);
    
    if (isPlaying && mainTimeframeBars.length > 0) {
      console.log(`[Playback Effect] Starting playback interval with speed: ${playbackSpeed}ms`);
      playbackIntervalRef.current = setInterval(() => {
        console.log(`[Playback Interval] Advancing from currentBarIndex: ${currentBarIndex}`);
        
        if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
          // Progressive mode: advance through sub-bars
          setCurrentSubBarIndex(prevSubIndex => {
            const currentMainBar = mainTimeframeBars[currentBarIndex];
            if (!currentMainBar) return prevSubIndex;
            
            const subBarsForCurrentMain = subTimeframeBars.filter(
              subBar => subBar.parentBarIndex === currentBarIndex
            );
            
            console.log(`[Playback Interval] Progressive mode - subBarsForCurrentMain: ${subBarsForCurrentMain.length}, currentSubBarIndex: ${prevSubIndex}`);
            
            if (prevSubIndex >= subBarsForCurrentMain.length - 1) {
              // Finished current main bar, move to next main bar
              console.log(`[Playback Interval] Moving to next main bar`);
              setCurrentBarIndex(prevBarIndex => {
                if (prevBarIndex >= mainTimeframeBars.length - 1) {
                  console.log(`[Playback Interval] Reached end of data, stopping playback`);
                  setIsPlaying(false); // Stop when we reach the end
                  return prevBarIndex;
                }
                const newBarIndex = prevBarIndex + 1;
                console.log(`[Playback Interval] Advanced to bar index: ${newBarIndex}`);
                return newBarIndex;
              });
              return 0; // Reset sub-bar index for new main bar
            }
            const newSubIndex = prevSubIndex + 1;
            console.log(`[Playback Interval] Advanced to sub-bar index: ${newSubIndex}`);
            return newSubIndex;
          });
        } else {
          // Instant mode: advance through main bars directly
          console.log(`[Playback Interval] Instant mode - advancing main bar`);
          setCurrentBarIndex(prevIndex => {
            if (prevIndex >= mainTimeframeBars.length - 1) {
              console.log(`[Playback Interval] Reached end of data, stopping playback`);
              setIsPlaying(false); // Stop when we reach the end
              return prevIndex;
            }
            const newIndex = prevIndex + 1;
            console.log(`[Playback Interval] Advanced to bar index: ${newIndex}`);
            return newIndex;
          });
        }
      }, playbackSpeed);
    } else {
      console.log(`[Playback Effect] Clearing playback interval - isPlaying: ${isPlaying}, bars: ${mainTimeframeBars.length}`);
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, mainTimeframeBars.length, subTimeframeBars.length, currentBarIndex, barFormationMode]);

  // Effect to process strategy when playback advances
  useEffect(() => {
    console.log(`[Strategy Effect] Triggered with currentBarIndex: ${currentBarIndex}, mainTimeframeBars.length: ${mainTimeframeBars.length}`);
    if (mainTimeframeBars.length > 0) {
      console.log(`[Strategy Effect] Calling buildStrategyStateUpToBar(${currentBarIndex})`);
      buildStrategyStateUpToBar(currentBarIndex).catch(error => {
        console.error('[Strategy Effect] Error in buildStrategyStateUpToBar:', error);
      });
    } else {
      console.log(`[Strategy Effect] Skipping - no main timeframe bars`);
    }
  }, [currentBarIndex, mainTimeframeBars, buildStrategyStateUpToBar]);

  // Reset strategy when new data loads
  useEffect(() => {
    if (mainTimeframeBars.length > 0) {
      resetLiveStrategy();
    }
  }, [mainTimeframeBars.length, resetLiveStrategy]);

  // Reset strategy when strategy selection changes
  useEffect(() => {
    if (selectedStrategy === 'trendstart') {
      trendStartStrategy.resetState();
    }
    resetLiveStrategy();
  }, [selectedStrategy, trendStartStrategy, resetLiveStrategy]);

  // Debug effect to monitor live strategy state changes
  useEffect(() => {
    console.log(`[LiveStrategyState] Updated - EMA arrays: fast=${liveStrategyState.fastEmaValues.length}, slow=${liveStrategyState.slowEmaValues.length}`);
    console.log(`[LiveStrategyState] Completed trades: ${liveStrategyState.completedTrades.length}, Open trade: ${!!liveStrategyState.openTrade}`);
    if (liveStrategyState.completedTrades.length > 0) {
      console.log(`[LiveStrategyState] Completed trades:`, liveStrategyState.completedTrades);
    }
  }, [liveStrategyState]);

  // Debug effect to monitor marker changes
  useEffect(() => {
    console.log(`[BacktesterPage] LiveTradeMarkers updated. Count: ${liveTradeMarkers.length}`);
    if (liveTradeMarkers.length > 0) {
      console.log(`[BacktesterPage] Latest markers:`, liveTradeMarkers);
    }
  }, [liveTradeMarkers]);

  // Playback control functions
  const handleNextBar = useCallback(() => {
    if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      const subBarsForCurrentMain = subTimeframeBars.filter(
        subBar => subBar.parentBarIndex === currentBarIndex
      );
      
      if (currentSubBarIndex >= subBarsForCurrentMain.length - 1) {
        // Move to next main bar
        setCurrentBarIndex(prevIndex => Math.min(prevIndex + 1, mainTimeframeBars.length - 1));
        setCurrentSubBarIndex(0);
      } else {
        // Move to next sub-bar
        setCurrentSubBarIndex(prevIndex => prevIndex + 1);
      }
    } else {
      setCurrentBarIndex(prevIndex => Math.min(prevIndex + 1, mainTimeframeBars.length - 1));
    }
  }, [currentBarIndex, currentSubBarIndex, mainTimeframeBars.length, subTimeframeBars, barFormationMode]);

  const handlePreviousBar = useCallback(() => {
    if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      if (currentSubBarIndex > 0) {
        // Move to previous sub-bar
        setCurrentSubBarIndex(prevIndex => prevIndex - 1);
      } else if (currentBarIndex > 0) {
        // Move to previous main bar's last sub-bar
        setCurrentBarIndex(prevIndex => prevIndex - 1);
        const prevMainBarIndex = currentBarIndex - 1;
        const subBarsForPrevMain = subTimeframeBars.filter(
          subBar => subBar.parentBarIndex === prevMainBarIndex
        );
        setCurrentSubBarIndex(Math.max(0, subBarsForPrevMain.length - 1));
      }
    } else {
      setCurrentBarIndex(prevIndex => Math.max(prevIndex - 1, 0));
    }
  }, [currentBarIndex, currentSubBarIndex, subTimeframeBars, barFormationMode]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentBarIndex(0);
    setCurrentSubBarIndex(0);
    resetLiveStrategy();
  }, [resetLiveStrategy]);

  const handleBarFormationModeChange = useCallback((mode: BarFormationMode) => {
    setBarFormationMode(mode);
    setIsPlaying(false);
    setCurrentSubBarIndex(0);
  }, []);

  const handleLoadData = useCallback(async (params: { contractId: string; timeframe: string; limit: number }) => {
    setIsLoading(true);
    setError(null);
    setMainTimeframeBars([]);
    setSubTimeframeBars([]);
    setCurrentBarIndex(0);
    setCurrentSubBarIndex(0);
    setIsPlaying(false);
    resetLiveStrategy();

    // Capture current contract and timeframe
    setCurrentContract(params.contractId);
    setCurrentTimeframe(params.timeframe);

    const config = getTimeframeConfig(params.timeframe);
    setTimeframeConfig(config);

    try {
      // Fetch main timeframe data
      const mainApiUrl = `/api/market-data/bars?contractId=${encodeURIComponent(params.contractId)}&timeframeUnit=${parseTimeframeForApi(config.main).unit}&timeframeValue=${parseTimeframeForApi(config.main).value}&limit=${params.limit}&all=false`;
      
      console.log(`Fetching main timeframe data from: ${mainApiUrl}`);
      const mainResponse = await fetch(mainApiUrl);
      if (!mainResponse.ok) {
        const errorData = await mainResponse.json();
        throw new Error(errorData.error || `Main timeframe API request failed with status ${mainResponse.status}`);
      }
      const mainData = await mainResponse.json();

      if (!mainData.bars || !Array.isArray(mainData.bars)) {
        throw new Error('Invalid main timeframe data structure received from API');
      }

      const formattedMainBars: BacktestBarData[] = mainData.bars.map((bar: any) => ({
        time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: bar.volume !== null && bar.volume !== undefined ? parseFloat(bar.volume) : undefined,
      })).sort((a: BacktestBarData, b: BacktestBarData) => a.time - b.time);

      setMainTimeframeBars(formattedMainBars);

      // Fetch sub-timeframe data if progressive mode is enabled
      if (barFormationMode === BarFormationMode.PROGRESSIVE && config.main !== config.sub) {
        // Calculate the time range we need for sub-timeframe data
        const subLimit = params.limit * config.subBarsPerMain * 2; // Extra buffer
        const subApiUrl = `/api/market-data/bars?contractId=${encodeURIComponent(params.contractId)}&timeframeUnit=${parseTimeframeForApi(config.sub).unit}&timeframeValue=${parseTimeframeForApi(config.sub).value}&limit=${subLimit}&all=false`;
        
        console.log(`Fetching sub-timeframe data from: ${subApiUrl}`);
        const subResponse = await fetch(subApiUrl);
        if (subResponse.ok) {
          const subData = await subResponse.json();
          if (subData.bars && Array.isArray(subData.bars)) {
            const formattedSubBars: BacktestBarData[] = subData.bars.map((bar: any) => ({
              time: (new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
              open: parseFloat(bar.open),
              high: parseFloat(bar.high),
              low: parseFloat(bar.low),
              close: parseFloat(bar.close),
              volume: bar.volume !== null && bar.volume !== undefined ? parseFloat(bar.volume) : undefined,
            })).sort((a: BacktestBarData, b: BacktestBarData) => a.time - b.time);

            const mappedSubBars = mapSubBarsToMainBars(formattedMainBars, formattedSubBars, config);
            setSubTimeframeBars(mappedSubBars);
            console.log(`Loaded ${mappedSubBars.length} sub-timeframe bars for ${formattedMainBars.length} main bars`);
          }
        }
      }

      console.log('Main timeframe bars loaded:', formattedMainBars.length);

      // Run EMA backtest
      runEmaBacktest(formattedMainBars);
    } catch (err: any) {
      console.error('Error fetching or processing data:', err);
      setError(err.message || 'Failed to load data.');
    } finally {
      setIsLoading(false);
    }
  }, [barFormationMode, runEmaBacktest, resetLiveStrategy]);

  // Calculate metrics from strategy trades - only show real data, no mock fallback
  const liveTradesData = liveStrategyState.completedTrades.length > 0 ? liveStrategyState.completedTrades : 
                         strategyTrades.length > 0 ? strategyTrades : [];
  const liveTotalPnL = liveTradesData.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
  const liveWinningTrades = liveTradesData.filter(t => (t.profitOrLoss || 0) > 0);
  const liveWinRate = liveTradesData.length > 0 ? (liveWinningTrades.length / liveTradesData.length) * 100 : 0;

  // Debug the trade data being used
  console.log(`[TradeData] Using data source: ${liveStrategyState.completedTrades.length > 0 ? 'liveStrategyState.completedTrades' : strategyTrades.length > 0 ? 'strategyTrades' : 'empty'}`);
  console.log(`[TradeData] Live trades count: ${liveTradesData.length}, Total P&L: ${liveTotalPnL}, Win rate: ${liveWinRate.toFixed(1)}%`);
  console.log(`[TradeData] Source counts - Live: ${liveStrategyState.completedTrades.length}, Strategy: ${strategyTrades.length}`);

  return (
    <Layout>
      <div className="flex flex-col space-y-4">
        {/* Top Bar with controls */}
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
          // Trading parameters
          tradingParams={tradingParams}
          onTradingParamsChange={setTradingParams}
        />
        
        {/* Error display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Main chart area */}
        <div className="relative bg-white rounded-lg shadow-sm border">
          {/* Chart container with reduced height to accommodate bottom panel */}
          <div className="h-[400px]">
            <TradeChart 
              mainTimeframeBars={mainTimeframeBars}
              subTimeframeBars={subTimeframeBars}
              currentBarIndex={currentBarIndex}
              currentSubBarIndex={currentSubBarIndex}
              barFormationMode={barFormationMode}
              timeframeConfig={timeframeConfig}
              tradeMarkers={liveTradeMarkers}
              emaData={selectedStrategy === 'ema' ? {
                fastEma: liveStrategyState.fastEmaValues,
                slowEma: liveStrategyState.slowEmaValues,
              } : undefined}
            /> 
          </div>
          
          {/* Compact results panel overlay */}
          <div className="absolute top-4 right-4 w-48 z-10">
            <CompactResultsPanel 
              profitOrLoss={liveTotalPnL}
              winRate={liveWinRate}
              totalTrades={liveTradesData.length}
            />
          </div>
        </div>

        {/* Analysis Panel */}
        <AnalysisPanel 
          trades={liveTradesData}
          totalPnL={liveTotalPnL}
          winRate={liveWinRate}
          totalTrades={liveTradesData.length}
        />

        {/* Orders Panel */}
        <OrdersPanel 
          orders={currentOrders}
          positions={currentPositions}
        />
      </div>
    </Layout>
  );
};

export default BacktesterPage; 