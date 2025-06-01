import { BacktestBarData } from './backtester';

/**
 * Common interface for all technical indicators.
 */
export interface IIndicator {
  /**
   * Updates the indicator with the latest bar data.
   * @param bar - The current bar data.
   */
  update(bar: BacktestBarData): void;

  /**
   * Gets the current value(s) of the indicator.
   * Can return a single number or a record of multiple values (e.g., for MACD).
   * @returns The current indicator value(s).
   */
  getValue(): number | Record<string, number>;

  /**
   * Resets the indicator to its initial state.
   */
  reset(): void;

  /**
   * Optional: Checks if the indicator has enough data to produce a valid value.
   * @returns True if the indicator is ready, false otherwise.
   */
  isReady?(): boolean;
}
