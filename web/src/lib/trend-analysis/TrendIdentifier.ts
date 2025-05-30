import { BacktestBarData } from '@/lib/types/backtester';

// State for managing forward testing cache and API calls for trend identification
export interface TrendIdentificationState {
  processedBarCount: number;
  cache: Map<string, TrendStartSignal[]>; // Cache for Python API responses
  lastApiCallTime: number;
}

// Definition of a trend start signal
export interface TrendStartSignal {
  type: 'CUS' | 'CDS'; // Change to Uptrend Start / Change to Downtrend Start
  barIndex: number;
  price: number;
  confidence?: number;
  rule?: string; // Rule type from Python analysis or simplified detection
}

export class TrendIdentifier {
  private state: TrendIdentificationState;
  private apiCallThrottleMs: number = 200;
  private currentTrendForSimplified: 'UP' | 'DOWN' | 'NONE' = 'NONE'; // Used by simplified detector

  constructor(initialState?: Partial<TrendIdentificationState>, throttleMs?: number) {
    this.state = {
      processedBarCount: initialState?.processedBarCount || 0,
      cache: initialState?.cache || new Map(),
      lastApiCallTime: initialState?.lastApiCallTime || 0,
    };
    if (throttleMs !== undefined) {
      this.apiCallThrottleMs = throttleMs;
    }
  }

  public resetState(): void {
    this.state.processedBarCount = 0;
    this.state.cache.clear();
    this.state.lastApiCallTime = 0;
    this.currentTrendForSimplified = 'NONE';
  }

  // --- Core Trend Identification Logic (Moved from TrendStartStrategy) ---

  private async detectTrendStartsForwardTestingBatch(
    bars: BacktestBarData[], 
    startBarIndex: number,
    endBarIndex: number,
    contractId: string, 
    timeframe: string
  ): Promise<TrendStartSignal[]> {
    try {
      const batchKey = `${contractId}-${timeframe}-${startBarIndex}-${endBarIndex}`;
      if (this.state.cache.has(batchKey)) {
        return this.state.cache.get(batchKey) || [];
      }
      const now = Date.now();
      const timeSinceLastCall = now - this.state.lastApiCallTime;
      if (timeSinceLastCall < this.apiCallThrottleMs) {
        const allSignals: TrendStartSignal[] = [];
        for (let i = startBarIndex; i <= endBarIndex; i++) {
          allSignals.push(...this.detectTrendStartSimplifiedInternal(bars, i));
        }
        this.state.cache.set(batchKey, allSignals);
        return allSignals;
      }
      this.state.lastApiCallTime = now;
      const batchBars = bars.slice(0, endBarIndex + 1).map((bar, index) => ({
        index: index + 1, timestamp: new Date(bar.time * 1000).toISOString(), date: new Date(bar.time * 1000).toISOString(),
        open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0
      }));
      const response = await fetch('/api/trend-analysis/forward-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bars: batchBars, contract_id: contractId, timeframe: timeframe, start_bar_index: startBarIndex + 1, end_bar_index: endBarIndex + 1, debug: false })
      });
      if (!response.ok) {
        const allSignals: TrendStartSignal[] = [];
        for (let i = startBarIndex; i <= endBarIndex; i++) { allSignals.push(...this.detectTrendStartSimplifiedInternal(bars, i)); }
        this.state.cache.set(batchKey, allSignals);
        return allSignals;
      }
      const result = await response.json();
      const batchSignalsData: TrendStartSignal[] = (result.batch_signals || []).map((pySig: any) => ({
        type: pySig.signal_type === 'uptrend_start' ? 'CUS' : 'CDS', barIndex: (pySig.bar_index || 1) - 1,
        price: pySig.signal_price || pySig.price || 0, confidence: pySig.confidence || 0.95, rule: pySig.rule_type || 'Batch'
      }));
      this.state.cache.set(batchKey, batchSignalsData);
      for (let i = startBarIndex; i <= endBarIndex; i++) {
        const barKey = `${contractId}-${timeframe}-${i}`;
        const barSignalsForCurrentI = batchSignalsData.filter(s => s.barIndex === i);
        if (!this.state.cache.has(barKey) || (this.state.cache.get(barKey) || []).length === 0) {
             this.state.cache.set(barKey, barSignalsForCurrentI);
        }
      }
      return batchSignalsData;
    } catch (error) {
      console.error('[TrendIdentifier] Batch API call failed:', error);
      const allSignals: TrendStartSignal[] = [];
      for (let i = startBarIndex; i <= endBarIndex; i++) { allSignals.push(...this.detectTrendStartSimplifiedInternal(bars, i)); }
      return allSignals;
    }
  }

  // Renamed to avoid conflict if imported directly, and uses internal trend state
  private detectTrendStartSimplifiedInternal(bars: BacktestBarData[], currentIndex: number): TrendStartSignal[] {
    if (currentIndex < 1) return []; 
    const currentBar = bars[currentIndex]; 
    const prevBar = bars[currentIndex - 1]; 
    const signals: TrendStartSignal[] = [];
    // Use this.currentTrendForSimplified for simplified logic internal to this class
    if (currentBar.close > prevBar.close && this.currentTrendForSimplified !== 'UP') {
      signals.push({ type: 'CUS', barIndex: currentIndex, price: currentBar.close, confidence: 0.8, rule: 'SimpCUS_P' });
    }
    if (currentBar.close < prevBar.close && this.currentTrendForSimplified !== 'DOWN') {
      signals.push({ type: 'CDS', barIndex: currentIndex, price: currentBar.close, confidence: 0.8, rule: 'SimpCDS_P' });
    }
    // Update internal trend for next simplified check if a signal was generated
    if (signals.length > 0) {
        this.currentTrendForSimplified = signals[0].type === 'CUS' ? 'UP' : 'DOWN';
    }
    return signals;
  }

  // Public method to get trend signals, encapsulates batching/single call logic
  public async getSignalsForRange(
    bars: BacktestBarData[], 
    currentBarIndex: number, // The latest bar index for which signals are needed
    contractId: string, 
    timeframe: string
  ): Promise<TrendStartSignal[]> {
    const shouldUseBatch = currentBarIndex > this.state.processedBarCount + 3;
    
    if (shouldUseBatch) {
      const batchStart = this.state.processedBarCount; 
      const batchEnd = currentBarIndex;
      const batchSignals = await this.detectTrendStartsForwardTestingBatch(
        bars, batchStart, batchEnd, contractId, timeframe
      );
      this.state.processedBarCount = Math.max(this.state.processedBarCount, batchEnd + 1);
      
      // Return ALL signals up to currentBarIndex, not just batch signals
      const allSignals: TrendStartSignal[] = [];
      for (let i = 0; i <= currentBarIndex; i++) {
        const barKey = `${contractId}-${timeframe}-${i}`;
        const barSignals = this.state.cache.get(barKey) || [];
        allSignals.push(...barSignals);
      }
      return allSignals;
    }

    // Use single-bar processing (forward testing API or simplified)
    try {
      const cacheKey = `${contractId}-${timeframe}-${currentBarIndex}`;
      let currentBarSignals: TrendStartSignal[] = [];
      
      if (!this.state.cache.has(cacheKey)) {
        const now = Date.now();
        const timeSinceLastCall = now - this.state.lastApiCallTime;
        
        if (timeSinceLastCall < this.apiCallThrottleMs) {
          currentBarSignals = this.detectTrendStartSimplifiedInternal(bars, currentBarIndex);
          this.state.cache.set(cacheKey, currentBarSignals);
        } else {
          this.state.lastApiCallTime = now;

          const barsUpToCurrent = bars.slice(0, currentBarIndex + 1).map((bar, index) => ({
            index: index + 1,
            timestamp: new Date(bar.time * 1000).toISOString(),
            date: new Date(bar.time * 1000).toISOString(),
            open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0
          }));

          const response = await fetch('/api/trend-analysis/forward', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bars: barsUpToCurrent, contract_id: contractId, timeframe: timeframe, current_bar_index: currentBarIndex + 1, debug: false })
          });

          if (!response.ok) {
            currentBarSignals = this.detectTrendStartSimplifiedInternal(bars, currentBarIndex);
            this.state.cache.set(cacheKey, currentBarSignals);
          } else {
            const result = await response.json();
            
            // Process ALL signals from the response, not just new ones
            const allResponseSignals: TrendStartSignal[] = (result.all_signals || result.new_signals || []).map((pySig: any) => ({
              type: pySig.signal_type === 'uptrend_start' ? 'CUS' : 'CDS',
              barIndex: (pySig.details?.confirmed_signal_bar_index || pySig.bar_index || 1) - 1, 
              price: pySig.signal_price || pySig.price || 0,
              confidence: pySig.confidence || 0.95,
              rule: pySig.details?.rule_type || pySig.rule_type || 'SingleAPI'
            }));
            
            // Update cache for all signals
            for (const signal of allResponseSignals) {
              const signalBarKey = `${contractId}-${timeframe}-${signal.barIndex}`;
              const existingSignals = this.state.cache.get(signalBarKey) || [];
              const signalExists = existingSignals.some(s => 
                s.type === signal.type && s.rule === signal.rule
              );
              if (!signalExists) {
                this.state.cache.set(signalBarKey, [...existingSignals, signal]);
              }
            }
            
            // Get signals for current bar
            currentBarSignals = this.state.cache.get(cacheKey) || [];
          }
        }
        
        this.state.processedBarCount = Math.max(this.state.processedBarCount, currentBarIndex + 1);
      }

      // Return ALL signals up to current bar index
      const allSignals: TrendStartSignal[] = [];
      for (let i = 0; i <= currentBarIndex; i++) {
        const barKey = `${contractId}-${timeframe}-${i}`;
        const barSignals = this.state.cache.get(barKey) || [];
        allSignals.push(...barSignals);
      }
      return allSignals;

    } catch (error) {
      console.error('[TrendIdentifier] Single API call failed:', error);
      const currentBarSignals = this.detectTrendStartSimplifiedInternal(bars, currentBarIndex);
      this.state.cache.set(`${contractId}-${timeframe}-${currentBarIndex}`, currentBarSignals);
      
      // Return all signals up to current bar
      const allSignals: TrendStartSignal[] = [];
      for (let i = 0; i <= currentBarIndex; i++) {
        const barKey = `${contractId}-${timeframe}-${i}`;
        const barSignals = this.state.cache.get(barKey) || [];
        allSignals.push(...barSignals);
      }
      return allSignals;
    }
  }
} 