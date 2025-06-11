/**
 * Database Market Data Loader for v3 Backtesting System
 * 
 * Fetches real market data from the database and converts it to the format
 * expected by the BacktestEngine.
 */

import { BacktestBarData } from '../../types/backtester';

export interface MarketDataQuery {
  contract?: string;      // Default: 'ES' 
  timeframe?: string;     // Default: '5m'
  limit?: number;         // Default: 500
  since?: string;         // ISO timestamp
}

export interface DatabaseOHLCBar {
  contractId: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  timeframeUnit: number;
  timeframeValue: number;
  // Trend indicators (optional)
  uptrendStart?: boolean;
  downtrendStart?: boolean;
  highestDowntrendStart?: boolean;
  unbrokenUptrendStart?: boolean;
  uptrendToHigh?: boolean;
}

export interface DatabaseOHLCResponse {
  success: boolean;
  contract: string;
  timeframe: string;
  count: number;
  data: DatabaseOHLCBar[];
  message?: string;
  error?: string;
}

/**
 * DatabaseMarketDataLoader class for fetching real market data
 */
export class DatabaseMarketDataLoader {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || '';
  }

  /**
   * Load market data from the database
   */
  async loadMarketData(query: MarketDataQuery = {}): Promise<BacktestBarData[]> {
    const {
      contract = 'ES',
      timeframe = '5m', 
      limit = 500,
      since
    } = query;

    try {
      // Build query parameters
      const params = new URLSearchParams({
        contract,
        timeframe,
        limit: limit.toString(),
      });

      if (since) {
        params.append('since', since);
      }

      // Fetch from our OHLC API
      const response = await fetch(`${this.baseUrl}/api/ohlc?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch market data: ${response.status} ${response.statusText}`);
      }

      const result: DatabaseOHLCResponse = await response.json();

      if (!result.success) {
        throw new Error(result.message || result.error || 'Failed to fetch market data');
      }

      // Convert database format to BacktestBarData format
      const backtestData: BacktestBarData[] = result.data.map(bar => ({
        time: new Date(bar.timestamp).getTime() as any, // Convert to timestamp number
        open: bar.open,
        high: bar.high, 
        low: bar.low,
        close: bar.close,
        volume: bar.volume ? parseInt(bar.volume, 10) : 0,
        // Add metadata
        contractId: bar.contractId,
        timeframe,
        // Include trend indicators if present
        ...(bar.uptrendStart && { uptrendStart: bar.uptrendStart }),
        ...(bar.downtrendStart && { downtrendStart: bar.downtrendStart }),
        ...(bar.highestDowntrendStart && { highestDowntrendStart: bar.highestDowntrendStart }),
        ...(bar.unbrokenUptrendStart && { unbrokenUptrendStart: bar.unbrokenUptrendStart }),
        ...(bar.uptrendToHigh && { uptrendToHigh: bar.uptrendToHigh }),
      }));

      console.log(`✅ Loaded ${backtestData.length} bars of ${contract} ${timeframe} data from database`);
      return backtestData;

    } catch (error) {
      console.error('❌ Error loading market data from database:', error);
      throw error;
    }
  }

  /**
   * Get available contracts from the database
   */
  async getAvailableContracts(): Promise<Array<{id: string; symbol: string; fullName: string}>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/contracts`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch contracts: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch contracts');
      }

      return result.data || [];
    } catch (error) {
      console.error('❌ Error fetching available contracts:', error);
      return [];
    }
  }

  /**
   * Get available timeframes (static list for now)
   */
  getAvailableTimeframes(): Array<{value: string; label: string}> {
    return [
      { value: '1s', label: '1 Second' },
      { value: '1m', label: '1 Minute' },
      { value: '5m', label: '5 Minutes' },
      { value: '15m', label: '15 Minutes' },
      { value: '30m', label: '30 Minutes' },
      { value: '1h', label: '1 Hour' },
      { value: '4h', label: '4 Hours' },
      { value: '1d', label: '1 Day' },
    ];
  }
}

/**
 * Default instance for easy importing
 */
export const marketDataLoader = new DatabaseMarketDataLoader();

/**
 * Convenience function for loading market data
 */
export async function loadMarketData(query?: MarketDataQuery): Promise<BacktestBarData[]> {
  return marketDataLoader.loadMarketData(query);
}

/**
 * Convenience function for getting available contracts
 */
export async function getAvailableContracts() {
  return marketDataLoader.getAvailableContracts();
} 