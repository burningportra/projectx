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

  // --- Core Trend Identification Logic (Simplified single API call approach) ---

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

  // Public method to get trend signals
  public async getSignalsForRange(
    bars: BacktestBarData[], 
    currentBarIndex: number, 
    contractId: string, 
    timeframe: string
  ): Promise<TrendStartSignal[]> {
    if (currentBarIndex < 0) return []; // No bars to process

    // Add specific logging for 1d timeframe
    if (timeframe === '1d') {
      // console.log(`[TrendIdentifier][1d] ===== 1D TREND START DEBUG =====`);
      // console.log(`[TrendIdentifier][1d] Processing bar ${currentBarIndex} for ${contractId} ${timeframe}`);
      // console.log(`[TrendIdentifier][1d] Total bars available: ${bars.length}`);
      if (bars.length > 0) {
        // console.log(`[TrendIdentifier][1d] First bar date: ${bars[0].time}`);
        // console.log(`[TrendIdentifier][1d] Current bar date: ${bars[currentBarIndex]?.time}`);
        // console.log(`[TrendIdentifier][1d] Last bar date: ${bars[bars.length - 1].time}`);
      }
    }

    if (currentBarIndex < this.state.processedBarCount) {
      console.log(`[TrendIdentifier] Data for bar ${currentBarIndex} already processed (up to ${this.state.processedBarCount - 1}). Collecting from cache.`);
    } else {
      // Bars from this.state.processedBarCount up to currentBarIndex need processing.
      const firstBarToProcessNewSegment = this.state.processedBarCount;
      console.log(`[TrendIdentifier] Processing needed from bar index ${firstBarToProcessNewSegment} up to ${currentBarIndex}.`);

      const now = Date.now();
      const timeSinceLastCall = now - this.state.lastApiCallTime;

      if (timeSinceLastCall < this.apiCallThrottleMs && currentBarIndex >= this.state.processedBarCount) {
        // Throttled: Use simplified detection for the new segment of bars.
        console.log(`[TrendIdentifier] API call throttled. Using simplified detection for bars ${firstBarToProcessNewSegment}-${currentBarIndex}.`);
        for (let i = firstBarToProcessNewSegment; i <= currentBarIndex; i++) {
          const barKey = `${contractId}-${timeframe}-${i}`;
          const simplifiedSignals = this.detectTrendStartSimplifiedInternal(bars, i);
          this.state.cache.set(barKey, simplifiedSignals); // Set/overwrite with simplified signals
          // console.log(`[TrendIdentifier DEBUG] Cached simplified signals for bar ${i} due to throttle. Signals:`, simplifiedSignals);
        }
        this.state.processedBarCount = currentBarIndex + 1;
      } else {
        // Not throttled or processing initial batch: Attempt API call.
        // This call will fetch all signals up to currentBarIndex.
        this.state.lastApiCallTime = now;
        console.log(`[TrendIdentifier] Attempting API call for ${contractId} ${timeframe}, processing up to bar index ${currentBarIndex}`);

        const barsUpToTarget = bars.slice(0, currentBarIndex + 1);
        const apiBars = barsUpToTarget.map((b, idx) => ({
          index: idx + 1, // Python is 1-indexed
          timestamp: new Date(b.time * 1000).toISOString(),
          date: new Date(b.time * 1000).toISOString(), // Keep for compatibility if py side uses it
          open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0
        }));

        // Special logging for 1d timeframe
        if (timeframe === '1d') {
          // console.log(`[TrendIdentifier][1d] ===== API REQUEST PAYLOAD =====`);
          // console.log(`[TrendIdentifier][1d] Sending ${apiBars.length} bars to Python API`);
          // console.log(`[TrendIdentifier][1d] First 5 bars being sent:`, apiBars.slice(0, 5));
          // console.log(`[TrendIdentifier][1d] Last 5 bars being sent:`, apiBars.slice(-5));
          // console.log(`[TrendIdentifier][1d] Bar index range: 1 to ${currentBarIndex + 1} (Python 1-indexed)`);
        }

        const requestPayload = { 
          bars: apiBars, 
          contract_id: contractId, 
          timeframe: timeframe, 
          debug: timeframe === '1d' // Enable debug for 1d timeframe
        };

        try {
          const response = await fetch('/api/trend-analysis', { // Changed from '/api/trend-analysis/forward' to use the correct endpoint
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });

          if (timeframe === '1d') {
            // console.log(`[TrendIdentifier][1d] ===== API RESPONSE =====`);
            // console.log(`[TrendIdentifier][1d] Response status: ${response.status}`);
          }

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[TrendIdentifier] API call failed for target bar ${currentBarIndex}. Status: ${response.status}, Body: ${errorText}. Falling back to simplified for new segment ${firstBarToProcessNewSegment}-${currentBarIndex}.`);
            if (timeframe === '1d') {
              // console.error(`[TrendIdentifier][1d] ===== API ERROR =====`);
              // console.error(`[TrendIdentifier][1d] Error response: ${errorText}`);
            }
            for (let i = firstBarToProcessNewSegment; i <= currentBarIndex; i++) {
              const barKey = `${contractId}-${timeframe}-${i}`;
              // Only fill with simplified if no previous (potentially more accurate) cache entry exists for this bar.
              if (!this.state.cache.has(barKey)) { 
                const simplifiedSignals = this.detectTrendStartSimplifiedInternal(bars, i);
                this.state.cache.set(barKey, simplifiedSignals);
                // console.log(`[TrendIdentifier DEBUG] Cached simplified signals for bar ${i} (new segment) due to API error. Signals:`, simplifiedSignals);
              }
            }
            this.state.processedBarCount = currentBarIndex + 1; // Still advance processed count over the new segment
          } else {
            const rawResponseText = await response.text();
            if (timeframe === '1d') {
              // console.log(`[TrendIdentifier][1d] ===== RAW API RESPONSE =====`);
              // console.log(`[TrendIdentifier][1d] Raw response text:`, rawResponseText);
            }
            const result = JSON.parse(rawResponseText);
            if (timeframe === '1d') {
              // console.log(`[TrendIdentifier][1d] ===== PARSED API RESPONSE =====`);
              // console.log(`[TrendIdentifier][1d] Parsed result:`, JSON.stringify(result, null, 2));
            }
            
            const allSignalsFromResponse: TrendStartSignal[] = [];
            if (Array.isArray(result.signals)) {
              if (timeframe === '1d') {
                // console.log(`[TrendIdentifier][1d] ===== PROCESSING SIGNALS =====`);
                // console.log(`[TrendIdentifier][1d] Found ${result.signals.length} signals in API response`);
              }
              for (let idx = 0; idx < result.signals.length; idx++) {
                const pySig = result.signals[idx];
                if (timeframe === '1d') {
                  // console.log(`[TrendIdentifier][1d] Processing signal ${idx + 1}:`, JSON.stringify(pySig, null, 2));
                }
                try {
                  // Bar index from Python can be under 'bar_index' or 'details.confirmed_signal_bar_index'
                  // Ensure it's 0-indexed for JavaScript.
                  const barIndexJs = (pySig.details?.confirmed_signal_bar_index !== undefined 
                                    ? Number(pySig.details.confirmed_signal_bar_index) 
                                    : Number(pySig.bar_index || 1)) - 1; // py is 1-indexed
                  
                  const signalType = pySig.signal_type === 'uptrend_start' ? 'CUS' : 'CDS';
                  const signalPrice = Number(pySig.signal_price || pySig.price || bars[barIndexJs]?.close || 0); // Fallback to bar close if price missing
                  const signalConfidence = Number(pySig.confidence || 0.95); // Default confidence
                  // Rule determination: prefer details, then top-level, then default
                  const signalRule = pySig.details?.rule_type || pySig.rule_type || 'API';

                  if (timeframe === '1d') {
                    // console.log(`[TrendIdentifier][1d] Mapped signal ${idx + 1}:`);
                    // console.log(`[TrendIdentifier][1d]   Python bar_index: ${pySig.bar_index || pySig.details?.confirmed_signal_bar_index}`);
                    // console.log(`[TrendIdentifier][1d]   JavaScript barIndex: ${barIndexJs}`);
                    // console.log(`[TrendIdentifier][1d]   Signal type: ${pySig.signal_type} -> ${signalType}`);
                    // console.log(`[TrendIdentifier][1d]   Price: ${signalPrice}`);
                    // console.log(`[TrendIdentifier][1d]   Confidence: ${signalConfidence}`);
                    // console.log(`[TrendIdentifier][1d]   Rule: ${signalRule}`);
                    if (bars[barIndexJs]) {
                      // console.log(`[TrendIdentifier][1d]   Bar date: ${new Date(bars[barIndexJs].time * 1000).toISOString()}`);
                    }
                  }

                  if (isNaN(barIndexJs) || barIndexJs < 0 || isNaN(signalPrice) || isNaN(signalConfidence)) {
                    console.error(`[TrendIdentifier DEBUG] Invalid data after parsing pySig ${idx}:`, pySig, `Parsed values - barIndexJs: ${barIndexJs}, signalPrice: ${signalPrice}, confidence: ${signalConfidence}. Skipping this signal.`);
                  } else if (barIndexJs > currentBarIndex) {
                    console.warn(`[TrendIdentifier DEBUG] Signal received for future barIndex ${barIndexJs} (current is ${currentBarIndex}). Skipping this signal. PySig:`, pySig);
                  }
                  else {
                    const mappedSignal: TrendStartSignal = {
                      type: signalType,
                      barIndex: barIndexJs,
                      price: signalPrice,
                      confidence: signalConfidence,
                      rule: signalRule
                    };
                    allSignalsFromResponse.push(mappedSignal);
                    if (timeframe === '1d') {
                      // console.log(`[TrendIdentifier][1d] ✓ Successfully mapped signal ${idx + 1}:`, mappedSignal);
                    }
                  }
                } catch (loopMapError) {
                  console.error(`[TrendIdentifier DEBUG] Error processing pySig ${idx} in loop:`, pySig, 'Error:', loopMapError);
                }
              }
            } else {
              console.log('[TrendIdentifier DEBUG] result.signals is not an array or missing, no signals processed from API.');
              if (timeframe === '1d') {
                console.log(`[TrendIdentifier][1d] ❌ No signals array found in API response`);
              }
            }
            
            if (timeframe === '1d') {
              // console.log(`[TrendIdentifier][1d] ===== FINAL MAPPED SIGNALS =====`);
              // console.log(`[TrendIdentifier][1d] Total signals mapped: ${allSignalsFromResponse.length}`);
              allSignalsFromResponse.forEach((sig, idx) => {
                // console.log(`[TrendIdentifier][1d] Signal ${idx + 1}: ${sig.type} at bar ${sig.barIndex} (${new Date(bars[sig.barIndex]?.time * 1000).toISOString()}) - ${sig.rule}`);
              });
            }

            // API response is authoritative for all bars from 0 up to currentBarIndex.
            // Group signals by bar index.
            const signalsByBarApi = new Map<number, TrendStartSignal[]>();
            allSignalsFromResponse.forEach(sig => {
              // Ensure signal barIndex is within the requested range (0 to currentBarIndex)
              if (sig.barIndex >= 0 && sig.barIndex <= currentBarIndex) {
                const list = signalsByBarApi.get(sig.barIndex) || [];
                list.push(sig);
                signalsByBarApi.set(sig.barIndex, list);
              } else {
                // console.warn(`[TrendIdentifier DEBUG] API signal for bar ${sig.barIndex} is outside current processing range 0-${currentBarIndex}. Discarding.`);
              }
            });

            // Update cache for all bars from 0 to currentBarIndex.
            // Bars not mentioned in API response (i.e., no signals for them) will have their cache entry set to an empty array.
            for (let barIdxToCache = 0; barIdxToCache <= currentBarIndex; barIdxToCache++) {
              const key = `${contractId}-${timeframe}-${barIdxToCache}`;
              const signalsForThisIdx = signalsByBarApi.get(barIdxToCache) || [];
              this.state.cache.set(key, signalsForThisIdx);
              if (timeframe === '1d' && signalsForThisIdx.length > 0) {
                // console.log(`[TrendIdentifier][1d] ✓ Cached ${signalsForThisIdx.length} signals for bar ${barIdxToCache}:`, signalsForThisIdx);
              }
            }
            
            console.log(`[TrendIdentifier] API call successful. Cache authoritatively updated for bars 0-${currentBarIndex}.`);
            this.state.processedBarCount = currentBarIndex + 1;
          }
        } catch (error) {
          console.error(`[TrendIdentifier] API call exception for target bar ${currentBarIndex}:`, error, `Falling back to simplified for new segment ${firstBarToProcessNewSegment}-${currentBarIndex}.`);
          if (timeframe === '1d') {
            // console.error(`[TrendIdentifier][1d] ===== API EXCEPTION =====`);
            // console.error(`[TrendIdentifier][1d] Exception:`, error);
          }
          for (let i = firstBarToProcessNewSegment; i <= currentBarIndex; i++) {
            const barKey = `${contractId}-${timeframe}-${i}`;
            if (!this.state.cache.has(barKey)) {
              const simplifiedSignals = this.detectTrendStartSimplifiedInternal(bars, i);
              this.state.cache.set(barKey, simplifiedSignals);
              // console.log(`[TrendIdentifier DEBUG] Cached simplified signals for bar ${i} (new segment) due to API exception. Signals:`, simplifiedSignals);
            }
          }
          this.state.processedBarCount = currentBarIndex + 1;
        }
      }
    }

    // Collect all signals from cache up to currentBarIndex
    const finalSignalList: TrendStartSignal[] = [];
    for (let k = 0; k <= currentBarIndex; k++) {
      const barKey = `${contractId}-${timeframe}-${k}`;
      const barSignals = this.state.cache.get(barKey) || [];
      finalSignalList.push(...barSignals);
    }
    
    if (timeframe === '1d') {
      // console.log(`[TrendIdentifier][1d] ===== FINAL RESULT =====`);
      // console.log(`[TrendIdentifier][1d] Total signals returned: ${finalSignalList.length}`);
      finalSignalList.forEach((sig, idx) => {
        // console.log(`[TrendIdentifier][1d] Final signal ${idx + 1}: ${sig.type} at bar ${sig.barIndex} (${new Date(bars[sig.barIndex]?.time * 1000).toISOString()}) - ${sig.rule}`);
      });
      // console.log(`[TrendIdentifier][1d] ===== END 1D TREND START DEBUG =====`);
    }

    // Deduplicate signals: A signal is unique by its barIndex, type, rule, price, and confidence.
    // This helps if the same signal was somehow added multiple times or if simplified overlaps with a later API call for the same bar.
    const uniqueSignals = Array.from(new Map(finalSignalList.map(s => [`${s.barIndex}-${s.type}-${s.rule}-${s.price.toFixed(5)}-${s.confidence?.toFixed(2)}`, s])).values());
    return uniqueSignals.sort((a,b) => a.barIndex - b.barIndex);
  }
} 