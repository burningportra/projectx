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
import { TrendStartStrategyRefactored } from '@/lib/strategies/TrendStartStrategyRefactored';
import { TrendStartStrategyConfig } from '@/lib/strategies/config/TrendStartStrategyConfig';
import { createTrendStartStrategyFactory } from '@/lib/strategies/factories/TrendStartStrategyFactory';
import { OrderManager } from '@/lib/OrderManager';
import { TrendIdentifier } from '@/lib/trend-analysis/TrendIdentifier';
import { Message, MessageBus, MessageType } from '@/lib/MessageBus';
import { EventDrivenSignalGenerator } from '@/lib/strategies/signals/EventDrivenSignalGenerator';
import { EventDrivenOrderHandler } from '@/lib/strategies/orders/EventDrivenOrderHandler';

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
  const messageBusRef = useRef(new MessageBus());
  
  const signalGeneratorRef = useRef(new EventDrivenSignalGenerator(
    messageBusRef.current,
    trendIdentifierRef.current
  ));

  const orderHandlerRef = useRef(new EventDrivenOrderHandler(
    messageBusRef.current,
    orderManagerRef.current
  ));

  const trendStartStrategyFactory = createTrendStartStrategyFactory(
    orderManagerRef.current,
    trendIdentifierRef.current,
    messageBusRef.current
  );
  const [trendStartStrategy] = useState<IStrategy>(() => trendStartStrategyFactory({
    name: 'Trend Start Strategy', description: 'Trades on CUS/CDS signals.', version: '1.0.0',
    stopLossPercent: 2.0, takeProfitPercent: 4.0, useMarketOrders: true, commission: 2.5, positionSize: 1,
    confidenceThreshold: 0.6, minConfirmationBars: 2, contractId: 'DEFAULT_CONTRACT', timeframe: '1h'
  }) as unknown as IStrategy);
  
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
    allSignals: StrategySignal[];
    lastProcessedBarIndex: number;
    backtestResults: BacktestResults | null; 
    currentIndicators: Record<string, number | Record<string, number>>; 
  }>({
    openTrade: null,
    pendingOrders: [],
    filledOrders: [],
    cancelledOrders: [],
    allSignals: [],
    lastProcessedBarIndex: -1,
    backtestResults: null,
    currentIndicators: {},
  });

  const [currentContract, setCurrentContract] = useState<string>('CON.F.US.MES.M25');
  const [currentTimeframe, setCurrentTimeframe] = useState<string>('1d');

  const resetLiveStrategy = useCallback(() => {
    currentStrategyInstance.reset(); 
    signalGeneratorRef.current.reset();
    orderHandlerRef.current.reset();
    orderManagerRef.current.reset();
    messageBusRef.current.clearHistory();
    setLiveStrategyState({
      openTrade: null, pendingOrders: [], filledOrders: [], cancelledOrders: [],
      allSignals: [],
      lastProcessedBarIndex: -1, backtestResults: null, currentIndicators: {},
    });
    setLiveTradeMarkers([]);
  }, [currentStrategyInstance]);

  useEffect(() => {
    if (currentStrategyInstance instanceof TrendStartStrategyRefactored) {
      if (currentStrategyInstance.getLifecycleState() === 'UNINITIALIZED') {
        currentStrategyInstance.initialize();
      }
      if (currentStrategyInstance.getLifecycleState() === 'INITIALIZED' || currentStrategyInstance.getLifecycleState() === 'STOPPED') {
        currentStrategyInstance.start();
      }
    }

    if (!signalGeneratorRef.current.isRunning()) {
      signalGeneratorRef.current.start();
    }
    if (!orderHandlerRef.current.isRunning()) {
      orderHandlerRef.current.start();
    }

    // Add comprehensive event logging
    const eventLogger = (eventType: string) => (message: Message) => {
      console.log(`[EVENT] ${eventType}:`, {
        source: message.source,
        timestamp: new Date().toISOString(),
        data: message.data
      });
    };

    const subscriptions = [
      // Log ALL events for debugging
      messageBusRef.current.subscribe(MessageType.BAR_RECEIVED, eventLogger('BAR_RECEIVED')),
      messageBusRef.current.subscribe(MessageType.MARKET_UPDATE, eventLogger('MARKET_UPDATE')),
      messageBusRef.current.subscribe(MessageType.SIGNAL_GENERATED, eventLogger('SIGNAL_GENERATED')),
      messageBusRef.current.subscribe(MessageType.SUBMIT_ORDER, eventLogger('SUBMIT_ORDER')),
      messageBusRef.current.subscribe(MessageType.ORDER_SUBMITTED, eventLogger('ORDER_SUBMITTED')),
      messageBusRef.current.subscribe(MessageType.ORDER_FILLED, (message: Message) => {
        const filledOrder = message.data.order as Order;
        console.log('[UI] ORDER_FILLED event received:', {
          orderId: filledOrder.id,
          orderStatus: filledOrder.status,
          isEntry: filledOrder.isEntry,
          isExit: filledOrder.isExit
        });
        
        setLiveStrategyState(prevState => {
          const orderExistsInPending = prevState.pendingOrders.some(o => o.id === filledOrder.id);
          console.log('[UI] Removing order from pending list:', {
            orderId: filledOrder.id,
            existsInPending: orderExistsInPending,
            pendingOrderCount: prevState.pendingOrders.length,
            pendingOrderIds: prevState.pendingOrders.map(o => o.id)
          });
          
          return {
            ...prevState,
            pendingOrders: prevState.pendingOrders.filter(o => o.id !== filledOrder.id),
            filledOrders: [...prevState.filledOrders, filledOrder],
          };
        });
      }),
      messageBusRef.current.subscribe(MessageType.ORDER_CANCELLED, eventLogger('ORDER_CANCELLED')),
      messageBusRef.current.subscribe(MessageType.POSITION_OPENED, eventLogger('POSITION_OPENED')),
      messageBusRef.current.subscribe(MessageType.POSITION_CLOSED, eventLogger('POSITION_CLOSED')),
      
      // Original subscriptions for state updates
      messageBusRef.current.subscribe(MessageType.SIGNAL_GENERATED, (message: Message) => {
        setLiveStrategyState(prevState => ({
          ...prevState,
          allSignals: [...prevState.allSignals, message.data.signal],
        }));
      }),
      messageBusRef.current.subscribe(MessageType.ORDER_SUBMITTED, (message: Message) => {
        const submittedOrder = message.data.order as Order;
        console.log('[UI] ORDER_SUBMITTED event received:', {
          orderId: submittedOrder.id,
          orderStatus: submittedOrder.status,
          isEntry: submittedOrder.isEntry,
          isExit: submittedOrder.isExit,
          source: message.source
        });
        
        setLiveStrategyState(prevState => {
          console.log('[UI] Adding order to pending list:', {
            orderId: submittedOrder.id,
            currentPendingCount: prevState.pendingOrders.length,
            currentPendingIds: prevState.pendingOrders.map(o => o.id)
          });
          
          return {
            ...prevState,
            pendingOrders: [...prevState.pendingOrders, submittedOrder],
          };
        });
      }),
      // ORDER_FILLED is handled above with debugging
      messageBusRef.current.subscribe(MessageType.ORDER_CANCELLED, (message: Message) => {
        const cancelledOrder = message.data.order as Order;
        setLiveStrategyState(prevState => ({
          ...prevState,
          pendingOrders: prevState.pendingOrders.filter(o => o.id !== cancelledOrder.id),
          cancelledOrders: [...prevState.cancelledOrders, cancelledOrder],
        }));
      }),
      messageBusRef.current.subscribe(MessageType.POSITION_OPENED, (message: Message) => {
        setLiveStrategyState(prevState => ({
          ...prevState,
          openTrade: message.data.position,
        }));
      }),
      messageBusRef.current.subscribe(MessageType.POSITION_CLOSED, (message: Message) => {
        setLiveStrategyState(prevState => ({
          ...prevState,
          openTrade: null,
        }));
      }),
    ];

    return () => {
      if (currentStrategyInstance instanceof TrendStartStrategyRefactored && currentStrategyInstance.getLifecycleState() === 'STARTED') {
        currentStrategyInstance.stop();
      }
      if (signalGeneratorRef.current.isRunning()) {
        signalGeneratorRef.current.stop();
      }
      if (orderHandlerRef.current.isRunning()) {
        orderHandlerRef.current.stop();
      }
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [currentStrategyInstance]);

  const processStrategyBars = useCallback(async (startIndex: number, endIndex: number) => {
    for (let barIndex = startIndex; barIndex <= endIndex; barIndex++) {
      const currentMainBar = mainTimeframeBars[barIndex];
      if (!currentMainBar) continue;
      
      const relevantSubBars = subTimeframeBars.filter(sb => sb.parentBarIndex === barIndex);
      
      await currentStrategyInstance.processBar(
          currentMainBar, relevantSubBars, barIndex, mainTimeframeBars
      );
    }
    
    // Sync order state with OrderManager after processing
    const pendingOrders = orderManagerRef.current.getPendingOrders();
    const filledOrders = orderManagerRef.current.getFilledOrders();
    const openPositions = orderManagerRef.current.getAllOpenPositions();
    
    console.log('[UI] Syncing order state after bar processing:', {
      pendingCount: pendingOrders.length,
      filledCount: filledOrders.length,
      openPositionsCount: openPositions.length,
      pendingIds: pendingOrders.map(o => o.id),
      filledIds: filledOrders.map(o => o.id),
      openPositionIds: openPositions.map(p => p.id)
    });
    
    // Convert the first open position to a trade object for the UI
    const openTrade = openPositions.length > 0 ? {
      id: openPositions[0].id,
      entryPrice: openPositions[0].averageEntryPrice,
      size: openPositions[0].size,
      type: openPositions[0].side === OrderSide.BUY ? TradeType.BUY : TradeType.SELL,
      status: 'OPEN' as const,
      entryTime: openPositions[0].lastUpdateTime,
      // Find associated SL/TP orders
      stopLossOrder: pendingOrders.find(o => o.parentTradeId === openPositions[0].id && o.isStopLoss),
      takeProfitOrder: pendingOrders.find(o => o.parentTradeId === openPositions[0].id && o.isTakeProfit)
    } : null;
    
    console.log('[UI] Open trade state:', {
      hasOpenTrade: !!openTrade,
      openTradeDetails: openTrade ? {
        id: openTrade.id,
        entryPrice: openTrade.entryPrice,
        hasStopLoss: !!openTrade.stopLossOrder,
        stopLossPrice: openTrade.stopLossOrder?.stopPrice,
        hasTakeProfit: !!openTrade.takeProfitOrder,
        takeProfitPrice: openTrade.takeProfitOrder?.price
      } : null
    });
    
    // Force a state update to ensure UI reflects the current state
    setLiveStrategyState(prev => ({
      ...prev,
      pendingOrders: [...pendingOrders], // Create new array to force re-render
      filledOrders: [...filledOrders],
      openTrade: openTrade
    }));
  }, [mainTimeframeBars, subTimeframeBars, currentStrategyInstance]);

  useEffect(() => {
    const allMarkersForChart: any[] = [];
    
    const tradeActionSignals = currentStrategyInstance.getSignals(); 
    tradeActionSignals.forEach(sig => {
      if (mainTimeframeBars[sig.barIndex]) {
        allMarkersForChart.push({
          time: mainTimeframeBars[sig.barIndex].time,
          position: sig.type === StrategySignalType.BUY ? 'belowBar' : 'aboveBar',
          color: sig.type === StrategySignalType.BUY ? '#26a69a' : '#ef5350',
          shape: sig.type === StrategySignalType.BUY ? 'arrowUp' : 'arrowDown',
          text: `Trade ${sig.type}`,
          size: 1,
        });
      }
    });

    liveStrategyState.allSignals.forEach(sig => {
      if (mainTimeframeBars[sig.barIndex]) {
        const isCUS = sig.type === StrategySignalType.CONFIRMED_UPTREND_START || sig.type === StrategySignalType.FORCED_CUS;
        const isCDS = sig.type === StrategySignalType.CONFIRMED_DOWNTREND_START || sig.type === StrategySignalType.FORCED_CDS;

        if (isCUS || isCDS) {
            allMarkersForChart.push({
              time: mainTimeframeBars[sig.barIndex].time,
              position: 'aboveBar',
              color: isCUS ? '#f68423' : '#a142f6',
              shape: 'circle',
              text: isCUS ? 'CUS' : 'CDS',
              size: 0.5,
            });
        }
      }
    });
    
    const finalResults = currentStrategyInstance.getCurrentBacktestResults ? currentStrategyInstance.getCurrentBacktestResults() : null;
    
    console.log('[UI] Backtest results updated:', {
      hasResults: !!finalResults,
      totalTrades: finalResults?.totalTrades || 0,
      trades: finalResults?.trades?.length || 0,
      totalPnL: finalResults?.totalProfitOrLoss || 0,
      winRate: finalResults?.winRate || 0,
      tradeDetails: finalResults?.trades?.map(t => ({
        id: t.id,
        status: t.status,
        pnl: t.profitOrLoss,
        exitReason: t.exitReason
      }))
    });
    
    // Update the live strategy state with the final results
    setLiveStrategyState(prev => ({
      ...prev,
      backtestResults: finalResults
    }));
    
    const uniqueMarkers = Array.from(new Map(allMarkersForChart.map(m => [`${m.time}-${m.text}-${m.shape}-${m.position}`, m])).values());
    uniqueMarkers.sort((a, b) => a.time - b.time);
    setLiveTradeMarkers(uniqueMarkers);

  }, [liveStrategyState.allSignals, currentStrategyInstance, mainTimeframeBars, currentBarIndex]);

  const buildStrategyStateUpToBar = useCallback(async (targetBarIndex: number) => {
    if (mainTimeframeBars.length === 0 || targetBarIndex < 0 || targetBarIndex >= mainTimeframeBars.length) {
      return;
    }
    const lastProcessedIndex = liveStrategyState.lastProcessedBarIndex;
    const needsFullRebuild = targetBarIndex < lastProcessedIndex || lastProcessedIndex < 0;
    
    if (needsFullRebuild) {
      resetLiveStrategy();
      await processStrategyBars(0, targetBarIndex);
    } else if (targetBarIndex > lastProcessedIndex) {
      await processStrategyBars(lastProcessedIndex + 1, targetBarIndex);
    }
    
    // Update the last processed bar index
    setLiveStrategyState(prev => ({
      ...prev,
      lastProcessedBarIndex: targetBarIndex
    }));
  }, [mainTimeframeBars, liveStrategyState.lastProcessedBarIndex, processStrategyBars, resetLiveStrategy]);

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
    if (mainTimeframeBars.length > 0) {
      resetLiveStrategy();
      buildStrategyStateUpToBar(0);
    }
  }, [mainTimeframeBars.length]);

  useEffect(() => {
    resetLiveStrategy(); 
    if (mainTimeframeBars.length > 0) {
      buildStrategyStateUpToBar(0);
    }
  }, [selectedStrategy]);
  
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
        } else if (formattedMainBars.length > 0) {
            setCurrentBarIndex(0);
        }
      }
    } catch (err: any) { setError(err.message || 'Failed to load data.');
    } finally { setIsLoading(false); }
  }, [barFormationMode, resetLiveStrategy, buildStrategyStateUpToBar, emaStrategy, trendStartStrategy, mainTimeframeBars.length]);

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
        (currentStrat as any).updateConfig(emaConf);
    } else if (selectedStrategy === 'trendstart' && currentStrat.getName && currentStrat.getName() === 'TrendStartStrategy') {
        const trendConf: Partial<TrendStartStrategyConfig> = {
            ...newBaseConfig,
            minConfirmationBars: newConfigFromPanel.minConfirmationBars || 2,
            confidenceThreshold: newConfigFromPanel.confidenceThreshold || 0.6,
        };
        (currentStrat as any).updateConfig(trendConf);
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
                      stopLossPrice: liveStrategyState.openTrade.stopLossOrder?.stopPrice || liveStrategyState.openTrade.stopLossOrder?.price,
                      takeProfitPrice: liveStrategyState.openTrade.takeProfitOrder?.price || liveStrategyState.openTrade.takeProfitOrder?.stopPrice,
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
                      stopLossPrice: liveStrategyState.openTrade.stopLossOrder?.stopPrice || liveStrategyState.openTrade.stopLossOrder?.price,
                      takeProfitPrice: liveStrategyState.openTrade.takeProfitOrder?.price || liveStrategyState.openTrade.takeProfitOrder?.stopPrice,
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
                commission: strategyConfig.commission ?? 0,
                positionSize: strategyConfig.positionSize ?? 1,
                stopLossPercent: strategyConfig.stopLossPercent ?? 0,
                stopLossTicks: strategyConfig.stopLossTicks ?? 0,
                takeProfitPercent: strategyConfig.takeProfitPercent ?? 0,
                takeProfitTicks: strategyConfig.takeProfitTicks ?? 0,
                useMarketOrders: strategyConfig.useMarketOrders ?? true,
                limitOrderOffset: strategyConfig.limitOrderOffsetTicks ?? strategyConfig.limitOrderOffset ?? 0,
                orderTimeoutBars: strategyConfig.orderTimeoutBars ?? 0,
                name: strategyConfig.name ?? 'N/A',
                description: strategyConfig.description ?? 'N/A',
                version: strategyConfig.version ?? 'N/A',
                contractId: strategyConfig.contractId,
                timeframe: strategyConfig.timeframe,
                fastPeriod: strategyConfig.fastPeriod ?? 12,
                slowPeriod: strategyConfig.slowPeriod ?? 26,
                minConfirmationBars: strategyConfig.minConfirmationBars ?? 2,
                confidenceThreshold: strategyConfig.confidenceThreshold ?? 0.6,
                limitOrderOffsetTicks: strategyConfig.limitOrderOffsetTicks
              } as any
            }
            onConfigChange={handleConfigChange as (config: UIPanelStrategyConfig) => void}
          />
        </ErrorBoundary>
      </div>
    </Layout>
  );
};

export default BacktesterPage;
