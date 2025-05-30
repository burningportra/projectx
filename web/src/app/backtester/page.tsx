"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import TradeChart from '@/components/backtester/TradeChart';
import TopBar from '@/components/backtester/TopBar';
import CompactResultsPanel from '@/components/backtester/CompactResultsPanel';
import AnalysisPanel from '@/components/backtester/AnalysisPanel';
import CompactOrderPanel from '@/components/backtester/CompactOrderPanel';
import { BacktestBarData, SubBarData, PlaybackSpeed, BarFormationMode, TimeframeConfig, Order } from '@/lib/types/backtester';
import { UTCTimestamp } from 'lightweight-charts';
import { EmaStrategy } from '@/lib/strategies/EmaStrategy';
import { TrendStartStrategy } from '@/lib/strategies/TrendStartStrategy';

// Strategy configuration interface
interface StrategyConfig {
  // Risk Management
  stopLossPercent: number;
  takeProfitPercent: number;
  commission: number;
  positionSize: number;
  
  // Order Preferences
  useMarketOrders: boolean;
  limitOrderOffset: number;
  
  // Strategy Parameters
  fastPeriod: number;
  slowPeriod: number;
}

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
  
  console.log(`[mapSubBarsToMainBars] Starting mapping for ${config.main}/${config.sub}. Main bars: ${mainBars.length}, Sub bars: ${subBars.length}`);
  
  // Debug timestamp ranges to understand data alignment
  if (mainBars.length > 0 && subBars.length > 0) {
    console.log(`[mapSubBarsToMainBars] Main bars: ${new Date(mainBars[0].time * 1000).toISOString()} to ${new Date(mainBars[mainBars.length - 1].time * 1000).toISOString()}`);
    console.log(`[mapSubBarsToMainBars] Sub bars: ${new Date(subBars[0].time * 1000).toISOString()} to ${new Date(subBars[subBars.length - 1].time * 1000).toISOString()}`);
  }
  
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
  
  console.log(`[mapSubBarsToMainBars] Mapping complete. Mapped ${mappedSubBars.length} sub-bars total.`);
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

// Helper to find the first main bar that has sub-bars
const findFirstValidMainBarIndex = (subTimeframeBars: SubBarData[]): number => {
  if (subTimeframeBars.length === 0) return 0;
  
  // Find the minimum parentBarIndex among all sub-bars
  const minParentIndex = Math.min(...subTimeframeBars.map(sb => sb.parentBarIndex));
  console.log(`[findFirstValidMainBarIndex] First main bar with sub-bars: ${minParentIndex}`);
  return Math.max(0, minParentIndex); // Ensure non-negative
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

  // Strategy instances with enhanced order management
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ema');
  const [emaStrategy] = useState(new EmaStrategy({
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    useMarketOrders: true,
  }));
  const [trendStartStrategy] = useState(new TrendStartStrategy({
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    useMarketOrders: true,
    confidenceThreshold: 0.6, // Permissive threshold for debugging
    useOpenCloseStrategy: false, // Keep simple for now
  }));

  // Strategy configuration state
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>({
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    commission: 2.50,
    positionSize: 1,
    useMarketOrders: true,
    limitOrderOffset: 2,
    fastPeriod: 12,
    slowPeriod: 26,
  });

  // Enhanced strategy execution state with performance tracking
  const [liveTradeMarkers, setLiveTradeMarkers] = useState<any[]>([]);
  const [liveStrategyState, setLiveStrategyState] = useState<{
    fastEmaValues: number[];
    slowEmaValues: number[];
    openTrade: any | null;
    tradeIdCounter: number;
    completedTrades: any[];
    pendingOrders: Order[];
    filledOrders: Order[];
    cancelledOrders: Order[];
    lastProcessedBarIndex: number; // Track last processed bar for incremental updates
  }>({
    fastEmaValues: [],
    slowEmaValues: [],
    openTrade: null,
    tradeIdCounter: 1,
    completedTrades: [],
    pendingOrders: [],
    filledOrders: [],
    cancelledOrders: [],
    lastProcessedBarIndex: -1,
  });

  // Current data state - track timeframe and contract
  const [currentContract, setCurrentContract] = useState<string>('CON.F.US.MES.M25');
  const [currentTimeframe, setCurrentTimeframe] = useState<string>('1d');

  // Reset live strategy when new data loads
  const resetLiveStrategy = useCallback(() => {
    emaStrategy.reset();
    trendStartStrategy.reset();
    
    setLiveStrategyState({
      fastEmaValues: [],
      slowEmaValues: [],
      openTrade: null,
      tradeIdCounter: 1,
      completedTrades: [],
      pendingOrders: [],
      filledOrders: [],
      cancelledOrders: [],
      lastProcessedBarIndex: -1,
    });
    setLiveTradeMarkers([]);
  }, [emaStrategy, trendStartStrategy]);

  // Enhanced strategy processing using the new OrderManager system with incremental updates
  const buildStrategyStateUpToBar = useCallback(async (targetBarIndex: number) => {
    if (mainTimeframeBars.length === 0 || targetBarIndex >= mainTimeframeBars.length) {
      // console.log(`[buildStrategyStateUpToBar] Skipping - no bars or invalid index. Bars: ${mainTimeframeBars.length}, Target: ${targetBarIndex}`);
      return;
    }
    
    // Incremental processing optimization - only process new bars
    const lastProcessedIndex = liveStrategyState.lastProcessedBarIndex;
    const isGoingBackward = targetBarIndex < lastProcessedIndex;
    const needsFullRebuild = isGoingBackward || lastProcessedIndex < 0;
    
    if (needsFullRebuild) {
      // Full rebuild needed (going backward or first time)
      console.log(`[buildStrategyStateUpToBar] Full rebuild from 0 to ${targetBarIndex} (was at ${lastProcessedIndex})`);
      
      // Reset strategies for clean rebuild
      if (selectedStrategy === 'ema') {
        emaStrategy.reset();
      } else if (selectedStrategy === 'trendstart') {
        trendStartStrategy.reset();
      }
      
      // Process all bars from 0 to target
      await processStrategyBars(0, targetBarIndex);
    } else if (targetBarIndex > lastProcessedIndex) {
      // Incremental update - only process new bars
      console.log(`[buildStrategyStateUpToBar] Incremental update from ${lastProcessedIndex + 1} to ${targetBarIndex}`);
      await processStrategyBars(lastProcessedIndex + 1, targetBarIndex);
    }
    // If targetBarIndex === lastProcessedIndex, no processing needed
  }, [mainTimeframeBars, selectedStrategy, currentContract, currentTimeframe, emaStrategy, trendStartStrategy, liveStrategyState.lastProcessedBarIndex]);

  // Extracted strategy processing logic for reuse
  const processStrategyBars = useCallback(async (startIndex: number, endIndex: number) => {
    const newMarkers: any[] = [...liveTradeMarkers]; // Start with existing markers
    let stateUpdate: any = {};
    
    if (selectedStrategy === 'ema') {
      // Process EMA strategy incrementally
      for (let barIndex = startIndex; barIndex <= endIndex; barIndex++) {
        const currentBar = mainTimeframeBars[barIndex];
        
        const result = emaStrategy.processBar(currentBar, barIndex, mainTimeframeBars);
        
        // Handle signals and create markers
        if (result.signal) {
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
      }
      
      // Get current strategy state
      const indicators = emaStrategy.getCurrentIndicators();
      const trades = emaStrategy.getTrades();
      const orderManager = (emaStrategy as any).orderManager;
      
      stateUpdate = {
        fastEmaValues: indicators ? [indicators.fastEma] : [],
        slowEmaValues: indicators ? [indicators.slowEma] : [],
        openTrade: null,
        tradeIdCounter: trades.length + 1,
        completedTrades: trades,
        pendingOrders: orderManager?.getPendingOrders() || [],
        filledOrders: orderManager?.getFilledOrders() || [],
        cancelledOrders: orderManager?.getCancelledOrders() || [],
        lastProcessedBarIndex: endIndex,
      };
      
    } else if (selectedStrategy === 'trendstart') {
      // Process trend start strategy incrementally
      const strategy = trendStartStrategy;
      
      for (let barIndex = startIndex; barIndex <= endIndex; barIndex++) {
        const currentBar = mainTimeframeBars[barIndex];
        try {
          const result = await strategy.processBar(
            currentBar, 
            barIndex, 
            mainTimeframeBars,
            currentContract,
            currentTimeframe
          );
          
          if (result.signal) {
            const marker = {
              time: mainTimeframeBars[barIndex].time,
              position: result.signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
              color: result.signal.type === 'BUY' ? '#26a69a' : '#ef5350',
              shape: result.signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
              text: result.signal.type === 'BUY' ? 'CUS' : 'CDS',
              size: 1,
            };
            newMarkers.push(marker);
          }
        } catch (error) {
          console.error(`[TrendStart Strategy] Error processing bar ${barIndex}:`, error);
        }
      }
      
      // Add trend signal markers (only for the processed range)
      const trendSignals = strategy.getTrendSignals();
      for (const trendSignal of trendSignals) {
        if (trendSignal.barIndex >= startIndex && trendSignal.barIndex <= endIndex) {
          const signalBar = mainTimeframeBars[trendSignal.barIndex];
          if (signalBar) {
            const trendMarker = {
              time: signalBar.time,
              position: trendSignal.type === 'CUS' ? 'belowBar' : 'aboveBar',
              color: trendSignal.type === 'CUS' ? '#4CAF50' : '#F44336',
              shape: trendSignal.type === 'CUS' ? 'arrowUp' : 'arrowDown',
              text: `${trendSignal.rule}`,
              size: 1.2,
            };
            newMarkers.push(trendMarker);
          }
        }
      }
      
      const currentOpenTrade = strategy.getOpenTrade();
      const currentPendingOrders = strategy.getPendingOrders();
      const currentFilledOrders = strategy.getFilledOrders();
      
      // Log when trades close for debugging
      if (!currentOpenTrade && currentPendingOrders.length === 0) {
        console.log(`[TrendStart Strategy] No open trades or pending orders at bar ${endIndex} - all order lines should disappear`);
      }
      
      stateUpdate = {
        fastEmaValues: [],
        slowEmaValues: [],
        openTrade: currentOpenTrade,
        tradeIdCounter: strategy.getTradeIdCounter(),
        completedTrades: strategy.getTrades(),
        pendingOrders: currentPendingOrders,
        filledOrders: currentFilledOrders,
        cancelledOrders: strategy.getCancelledOrders(),
        lastProcessedBarIndex: endIndex,
      };
    }
    
    // Update markers and state
    setLiveTradeMarkers(newMarkers);
    setLiveStrategyState(stateUpdate);
  }, [mainTimeframeBars, selectedStrategy, currentContract, currentTimeframe, emaStrategy, trendStartStrategy, liveTradeMarkers]);

  // Order management functions
  const handleCancelOrder = useCallback((orderId: string) => {
    if (selectedStrategy === 'ema') {
      const orderManager = (emaStrategy as any).orderManager;
      if (orderManager?.cancelOrder(orderId)) {
        console.log(`[BacktesterPage] Cancelled order ${orderId}`);
        // Trigger state update
        buildStrategyStateUpToBar(currentBarIndex);
      }
    }
  }, [selectedStrategy, emaStrategy, buildStrategyStateUpToBar, currentBarIndex]);

  // Auto-playback effect
  useEffect(() => {
    console.log(`[Playback Effect] isPlaying: ${isPlaying}, mainTimeframeBars.length: ${mainTimeframeBars.length}, currentBarIndex: ${currentBarIndex}, barFormationMode: ${barFormationMode}`);
    
    if (isPlaying && mainTimeframeBars.length > 0) {
      console.log(`[Playback Effect] Starting playback interval with speed: ${playbackSpeed}ms`);
      playbackIntervalRef.current = setInterval(() => {
        console.log(`[Playback Interval] Advancing from currentBarIndex: ${currentBarIndex}, currentSubBarIndex: ${currentSubBarIndex}, mode: ${barFormationMode}`);
        
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

  // Throttled strategy processing to prevent excessive updates during rapid playback
  const lastStrategyUpdateRef = useRef<number>(0);
  const strategyUpdateThrottleMs = 50; // Minimum 50ms between strategy updates

  // Effect to process strategy when playback advances (with throttling)
  useEffect(() => {
    // console.log(`[Strategy Effect] Triggered with currentBarIndex: ${currentBarIndex}, mainTimeframeBars.length: ${mainTimeframeBars.length}`);
    if (mainTimeframeBars.length > 0) {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastStrategyUpdateRef.current;
      
      if (timeSinceLastUpdate >= strategyUpdateThrottleMs) {
        // console.log(`[Strategy Effect] Calling buildStrategyStateUpToBar(${currentBarIndex})`);
        lastStrategyUpdateRef.current = now;
        buildStrategyStateUpToBar(currentBarIndex).catch(error => {
          console.error('[Strategy Effect] Error in buildStrategyStateUpToBar:', error);
        });
      }
      // If throttled, the update will be skipped but will be processed on the next effect trigger
    } else {
      // console.log(`[Strategy Effect] Skipping - no main timeframe bars`);
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
      trendStartStrategy.reset();
    }
    resetLiveStrategy();
  }, [selectedStrategy, trendStartStrategy, resetLiveStrategy]);

  // Debug effect to monitor live strategy state changes
  useEffect(() => {
    // console.log(`[LiveStrategyState] Updated - EMA arrays: fast=${liveStrategyState.fastEmaValues.length}, slow=${liveStrategyState.slowEmaValues.length}`);
    // console.log(`[LiveStrategyState] Completed trades: ${liveStrategyState.completedTrades.length}, Open trade: ${!!liveStrategyState.openTrade}`);
    if (liveStrategyState.completedTrades.length > 0) {
      // console.log(`[LiveStrategyState] Completed trades:`, liveStrategyState.completedTrades);
    }
  }, [liveStrategyState]);

  // Debug effect to monitor marker changes
  useEffect(() => {
    // console.log(`[BacktesterPage] LiveTradeMarkers updated. Count: ${liveTradeMarkers.length}`);
    if (liveTradeMarkers.length > 0) {
      // console.log(`[BacktesterPage] Latest markers:`, liveTradeMarkers);
    }
  }, [liveTradeMarkers]);

  // Debug effect to monitor when open trades change (for tracking order line clearing)
  useEffect(() => {
    const hasOpenTrade = !!liveStrategyState.openTrade;
    const pendingOrdersCount = liveStrategyState.pendingOrders.length;
    const filledOrdersCount = liveStrategyState.filledOrders.length;
    
    if (!hasOpenTrade && pendingOrdersCount === 0) {
      console.log(`[BacktesterPage] Trade closed - no open trades or pending orders. All order lines should disappear. Filled orders: ${filledOrdersCount}`);
    } else if (hasOpenTrade) {
      console.log(`[BacktesterPage] Open trade detected - showing order lines. Pending: ${pendingOrdersCount}, Filled: ${filledOrdersCount}`);
    }
  }, [liveStrategyState.openTrade, liveStrategyState.pendingOrders.length, liveStrategyState.filledOrders.length]);

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
    
    // In progressive mode, start from first valid main bar if sub-bars are available
    if (barFormationMode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      const firstValidBarIndex = findFirstValidMainBarIndex(subTimeframeBars);
      console.log(`[handleReset] Progressive mode: resetting to first valid bar index ${firstValidBarIndex}`);
      setCurrentBarIndex(firstValidBarIndex);
    } else {
      setCurrentBarIndex(0);
    }
    
    setCurrentSubBarIndex(0);
    resetLiveStrategy();
  }, [resetLiveStrategy, barFormationMode, subTimeframeBars]);

  const handleBarFormationModeChange = useCallback((mode: BarFormationMode) => {
    setBarFormationMode(mode);
    setIsPlaying(false);
    setCurrentSubBarIndex(0);
    
    // When switching to progressive mode, auto-start from first valid main bar
    if (mode === BarFormationMode.PROGRESSIVE && subTimeframeBars.length > 0) {
      const firstValidBarIndex = findFirstValidMainBarIndex(subTimeframeBars);
      console.log(`[handleBarFormationModeChange] Switching to progressive mode: auto-starting from bar ${firstValidBarIndex}`);
      setCurrentBarIndex(firstValidBarIndex);
    }
  }, [subTimeframeBars]);

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
        
        console.log(`[handleLoadData - ${config.main}/${config.sub}] Fetching sub-timeframe data from: ${subApiUrl}`);
        try {
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

              console.log(`[handleLoadData - ${config.main}/${config.sub}] Fetched ${formattedSubBars.length} raw sub-bars.`);
              if (formattedSubBars.length > 0) {
                console.log(`[handleLoadData - ${config.main}/${config.sub}] Raw sub-bars range: ${new Date(formattedSubBars[0].time * 1000).toISOString()} to ${new Date(formattedSubBars[formattedSubBars.length - 1].time * 1000).toISOString()}`);
              }
              if (formattedMainBars.length > 0) {
                  console.log(`[handleLoadData - ${config.main}/${config.sub}] Main bars range: ${new Date(formattedMainBars[0].time * 1000).toISOString()} to ${new Date(formattedMainBars[formattedMainBars.length-1].time * 1000).toISOString()}`);
              }

              const mappedSubBars = mapSubBarsToMainBars(formattedMainBars, formattedSubBars, config);
              setSubTimeframeBars(mappedSubBars);
              console.log(`[handleLoadData - ${config.main}/${config.sub}] Mapped ${mappedSubBars.length} sub-bars to ${formattedMainBars.length} main bars.`);
              
              // Debug: Check first few mappings
              if (mappedSubBars.length > 0) {
                console.log(`[handleLoadData - ${config.main}/${config.sub}] Sample sub-bar mappings:`, mappedSubBars.slice(0, Math.min(10, mappedSubBars.length)).map(sb => `Sub bar @ ${new Date(sb.time * 1000).toISOString()} -> Main bar index ${sb.parentBarIndex}`));
              } else if (formattedSubBars.length > 0 && formattedMainBars.length > 0) {
                console.warn(`[handleLoadData - ${config.main}/${config.sub}] No sub-bars were mapped despite having raw sub-bar and main-bar data. Check timestamp alignments and mapSubBarsToMainBars logic for this timeframe pair.`);
              }
              
              // Auto-start from first valid main bar in progressive mode
              if (barFormationMode === BarFormationMode.PROGRESSIVE && mappedSubBars.length > 0) {
                const firstValidBarIndex = findFirstValidMainBarIndex(mappedSubBars);
                if (firstValidBarIndex > 0) {
                  console.log(`[handleLoadData - ${config.main}/${config.sub}] Auto-starting from main bar ${firstValidBarIndex} (first bar with sub-bars) instead of 0`);
                  setCurrentBarIndex(firstValidBarIndex);
                  setCurrentSubBarIndex(0);
                }
              }
            } else {
              console.warn(`[handleLoadData - ${config.main}/${config.sub}] Sub-timeframe API call for ${config.sub} was OK, but subData.bars is missing or not an array. SubData:`, subData);
              setSubTimeframeBars([]); // Ensure empty
            }
          } else {
            const errorText = await subResponse.text();
            console.warn(`[handleLoadData - ${config.main}/${config.sub}] Failed to fetch sub-timeframe data for ${config.sub}. Status: ${subResponse.status}. Response: ${errorText}`);
            setSubTimeframeBars([]); // Ensure empty
          }
        } catch (subFetchError: any) {
            console.error(`[handleLoadData - ${config.main}/${config.sub}] Error fetching sub-timeframe data for ${config.sub}:`, subFetchError.message, subFetchError);
            setSubTimeframeBars([]); // Ensure empty
        }
      } else {
        if (barFormationMode !== BarFormationMode.PROGRESSIVE) {
          console.log(`[handleLoadData - ${config.main}/${config.sub}] Progressive mode not enabled. No sub-timeframe data fetched.`);
        } else { // config.main === config.sub
          console.log(`[handleLoadData - ${config.main}/${config.sub}] Main and sub timeframes are the same (${config.main}). No separate sub-timeframe data fetched.`);
        }
        setSubTimeframeBars([]); // Ensure empty if not fetching
      }

      console.log('Main timeframe bars loaded:', formattedMainBars.length);

      // Strategy will be processed automatically by buildStrategyStateUpToBar
    } catch (err: any) {
      console.error('Error fetching or processing data:', err);
      setError(err.message || 'Failed to load data.');
    } finally {
      setIsLoading(false);
    }
  }, [barFormationMode, resetLiveStrategy]);

  // Calculate metrics from enhanced strategy trades
  const liveTradesData = liveStrategyState.completedTrades;
  const liveTotalPnL = liveTradesData.reduce((sum: number, trade: any) => sum + (trade.profitOrLoss || 0), 0);
  const liveWinningTrades = liveTradesData.filter((t: any) => (t.profitOrLoss || 0) > 0);
  const liveWinRate = liveTradesData.length > 0 ? (liveWinningTrades.length / liveTradesData.length) * 100 : 0;

  // Handle strategy configuration changes
  const handleConfigChange = useCallback(async (newConfig: StrategyConfig) => {
    console.log('[BacktesterPage] Strategy configuration changed:', newConfig);
    
    // Update the strategy configuration state
    setStrategyConfig(newConfig);
    
    // Update the EMA strategy with new configuration
    if (selectedStrategy === 'ema') {
      // Create new strategy instance with updated config
      const updatedStrategy = new EmaStrategy({
        fastPeriod: newConfig.fastPeriod,
        slowPeriod: newConfig.slowPeriod,
        stopLossPercent: newConfig.stopLossPercent,
        takeProfitPercent: newConfig.takeProfitPercent,
        commission: newConfig.commission,
        positionSize: newConfig.positionSize,
        useMarketOrders: newConfig.useMarketOrders,
        limitOrderOffset: newConfig.limitOrderOffset,
      });
      
      // Replace the strategy instance
      Object.assign(emaStrategy, updatedStrategy);
      
      // Reset and re-run the strategy if we have data
      if (mainTimeframeBars.length > 0) {
        console.log('[BacktesterPage] Re-running EMA backtest with new configuration');
        
        // Reset playback to beginning
        setCurrentBarIndex(0);
        setCurrentSubBarIndex(0);
        setIsPlaying(false);
        
        // Reset strategy state
        resetLiveStrategy();
        
        // Re-process strategy up to current position (will be 0 initially)
        await buildStrategyStateUpToBar(0);
      }
    } else if (selectedStrategy === 'trendstart') {
      // Create new TrendStartStrategy instance with updated config
      const updatedStrategy = new TrendStartStrategy({
        stopLossPercent: newConfig.stopLossPercent,
        takeProfitPercent: newConfig.takeProfitPercent,
        commission: newConfig.commission,
        positionSize: newConfig.positionSize,
        useMarketOrders: newConfig.useMarketOrders,
        limitOrderOffset: newConfig.limitOrderOffset,
        confidenceThreshold: 0.6, // Keep permissive threshold for debugging
        useOpenCloseStrategy: false, // Keep disabled for now
        minConfirmationBars: 2,
        limitOrderOffsetTicks: 1,
      });
      
      // Replace the strategy instance
      Object.assign(trendStartStrategy, updatedStrategy);
      
      // Reset and re-run the strategy if we have data
      if (mainTimeframeBars.length > 0) {
        console.log('[BacktesterPage] Re-running TrendStart backtest with new configuration');
        
        // Reset playback to beginning
        setCurrentBarIndex(0);
        setCurrentSubBarIndex(0);
        setIsPlaying(false);
        
        // Reset strategy state
        resetLiveStrategy();
        
        // Re-process strategy up to current position (will be 0 initially)
        await buildStrategyStateUpToBar(0);
      }
    }
  }, [selectedStrategy, emaStrategy, trendStartStrategy, mainTimeframeBars.length, resetLiveStrategy, buildStrategyStateUpToBar]);

  return (
    <Layout fullWidth={true}>
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
          <div className="h-[700px] flex">
            {/* Chart takes most of the space */}
            <div className="flex-1">
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
                pendingOrders={liveStrategyState.pendingOrders}
                filledOrders={liveStrategyState.filledOrders}
                openPositions={(() => {
                  const positions = liveStrategyState.openTrade ? [{
                    entryPrice: liveStrategyState.openTrade.entryPrice,
                    stopLossPrice: liveStrategyState.openTrade.stopLossOrder?.stopPrice,
                    takeProfitPrice: liveStrategyState.openTrade.takeProfitOrder?.price,
                  }] : [];
                  
                  if (liveStrategyState.openTrade) {
                    console.log('[BacktesterPage] Passing openTrade to TradeChart:', {
                      openTrade: liveStrategyState.openTrade,
                      positions: positions
                    });
                  }
                  
                  return positions;
                })()}
              /> 
            </div>
            
            {/* Compact Order Panel on the right */}
            {(liveStrategyState.pendingOrders.length > 0 || liveStrategyState.filledOrders.length > 0 || liveStrategyState.openTrade) && (
              <div className="w-80 bg-gray-800 border-l border-gray-700">
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
              </div>
            )}
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
          pendingOrders={liveStrategyState.pendingOrders}
          filledOrders={liveStrategyState.filledOrders}
          cancelledOrders={liveStrategyState.cancelledOrders}
          onCancelOrder={handleCancelOrder}
          currentConfig={strategyConfig}
          onConfigChange={handleConfigChange}
        />
      </div>
    </Layout>
  );
};

export default BacktesterPage; 