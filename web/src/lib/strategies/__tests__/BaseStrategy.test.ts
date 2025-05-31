import { BaseStrategy } from '../BaseStrategy';
import {
  BacktestBarData,
  SubBarData,
  StrategySignal,
  OrderSide,
  OrderType,
  TradeType,
  StrategySignalType,
  UTCTimestamp
} from '../../types/backtester';
import { StrategyResult } from '../../types/strategy';

// Helper function to create a test bar
const createBar = (time: number, open: number, high: number, low: number, close: number): BacktestBarData => ({
  time: time as UTCTimestamp,
  open,
  high,
  low,
  close
});

// Concrete implementation of BaseStrategy for testing
class TestStrategy extends BaseStrategy {
  constructor() {
    super({
      name: 'Test Strategy',
      description: 'A strategy for testing BaseStrategy',
      version: '1.0.0',
      commission: 0.1,
      positionSize: 1
    });
  }

  // Expose protected methods for testing
  public testCreateMarketOrder(...args: Parameters<TestStrategy['createMarketOrder']>) {
    return this.createMarketOrder(...args);
  }

  public testCreateLimitOrder(...args: Parameters<TestStrategy['createLimitOrder']>) {
    return this.createLimitOrder(...args);
  }

  public testCreateStopOrder(...args: Parameters<TestStrategy['createStopOrder']>) {
    return this.createStopOrder(...args);
  }

  public testCreateTakeProfitOrder(...args: Parameters<TestStrategy['createTakeProfitOrder']>) {
    return this.createTakeProfitOrder(...args);
  }

  public testFillOrder(...args: Parameters<TestStrategy['fillOrder']>) {
    return this.fillOrder(...args);
  }

  public testCancelOrder(...args: Parameters<TestStrategy['cancelOrder']>) {
    return this.cancelOrder(...args);
  }

  public testCreateTrade(...args: Parameters<TestStrategy['createTrade']>) {
    return this.createTrade(...args);
  }

  public testCloseTrade(...args: Parameters<TestStrategy['closeTrade']>) {
    return this.closeTrade(...args);
  }

  getName(): string {
    return 'Test Strategy';
  }

  getDescription(): string {
    return 'A strategy for testing BaseStrategy';
  }

  getVersion(): string {
    return '1.0.0';
  }

  processBar(
    mainBar: BacktestBarData,
    subBars: SubBarData[] | undefined,
    barIndex: number,
    allMainBars: BacktestBarData[]
  ): StrategyResult {
    // Simple implementation for testing
    this.indicators = { price: mainBar.close };

    // For testing purposes, generate a buy signal on the 5th bar
    if (barIndex === 5) {
      const signal: StrategySignal = {
        barIndex,
        time: mainBar.time,
        type: StrategySignalType.BUY,
        price: mainBar.close
      };
      this.recordSignal(signal);

      // Create a market buy order
      const order = this.testCreateMarketOrder(
        OrderSide.BUY,
        this.config.positionSize,
        mainBar,
        undefined,
        'TEST'
      );

      // Fill the order immediately for testing
      const filledOrder = this.testFillOrder(order, mainBar.close, mainBar.time);

      // Create a trade
      this.testCreateTrade(
        TradeType.BUY,
        mainBar.close,
        this.config.positionSize,
        mainBar.time,
        filledOrder,
        signal
      );

      return {
        signal,
        indicators: this.indicators,
        filledOrders: [filledOrder]
      };
    }

    // For testing purposes, generate a sell signal on the 10th bar
    if (barIndex === 10 && this.getOpenTrade()) {
      const signal: StrategySignal = {
        barIndex,
        time: mainBar.time,
        type: StrategySignalType.SELL,
        price: mainBar.close
      };
      this.recordSignal(signal);

      // Create a market sell order
      const order = this.testCreateMarketOrder(
        OrderSide.SELL,
        this.config.positionSize,
        mainBar,
        this.getOpenTrade()?.id,
        'TEST'
      );

      // Fill the order immediately for testing
      const filledOrder = this.testFillOrder(order, mainBar.close, mainBar.time);

      // Close the trade
      if (this.getOpenTrade()) {
        this.testCloseTrade(
          this.getOpenTrade()!,
          mainBar.close,
          mainBar.time,
          filledOrder,
          signal,
          'SIGNAL'
        );
      }

      return {
        signal,
        indicators: this.indicators,
        filledOrders: [filledOrder]
      };
    }

    return {
      signal: null,
      indicators: this.indicators,
      filledOrders: []
    };
  }
}

describe('BaseStrategy', () => {
  let strategy: TestStrategy;
  let testBars: BacktestBarData[];

  beforeEach(() => {
    strategy = new TestStrategy();
    
    // Create a series of test bars
    testBars = Array.from({ length: 20 }, (_, i) => 
      createBar(
        1672531200 + i * 3600, // Start from 2023-01-01 00:00:00 UTC, hourly bars
        100 + i,
        105 + i,
        95 + i,
        102 + i
      )
    );
  });

  test('constructor sets config with defaults', () => {
    const config = strategy.getConfig();
    expect(config.name).toBe('Test Strategy');
    expect(config.description).toBe('A strategy for testing BaseStrategy');
    expect(config.version).toBe('1.0.0');
    expect(config.commission).toBe(0.1);
    expect(config.positionSize).toBe(1);
  });

  test('reset clears all state', () => {
    // First run some bars to create state
    testBars.slice(0, 15).forEach((bar, index) => {
      strategy.processBar(bar, undefined, index, testBars);
    });

    // Verify we have state
    expect(strategy.getSignals().length).toBeGreaterThan(0);
    expect(strategy.getFilledOrders().length).toBeGreaterThan(0);

    // Reset and verify state is cleared
    strategy.reset();
    expect(strategy.getSignals().length).toBe(0);
    expect(strategy.getTrades().length).toBe(0);
    expect(strategy.getOpenTrade()).toBeNull();
    expect(strategy.getFilledOrders().length).toBe(0);
    expect(strategy.getPendingOrders().length).toBe(0);
    expect(strategy.getCancelledOrders().length).toBe(0);
  });

  test('updateConfig updates configuration', () => {
    strategy.updateConfig({ commission: 0.2, positionSize: 2 });
    const config = strategy.getConfig();
    expect(config.commission).toBe(0.2);
    expect(config.positionSize).toBe(2);
    expect(config.name).toBe('Test Strategy'); // Other properties unchanged
  });

  test('getters return correct collections', () => {
    // Process bars to generate signals, orders, and trades
    testBars.forEach((bar, index) => {
      strategy.processBar(bar, undefined, index, testBars);
    });

    // Verify collections
    expect(strategy.getSignals().length).toBe(2); // Buy and sell signals
    expect(strategy.getTrades().length).toBe(1); // One completed trade
    expect(strategy.getOpenTrade()).toBeNull(); // No open trade after completion
    expect(strategy.getFilledOrders().length).toBe(2); // Buy and sell orders
    expect(strategy.getCurrentIndicators()).toEqual({ price: testBars[testBars.length - 1].close });
  });

  test('backtest processes all bars and returns results', () => {
    const results = strategy.backtest(testBars);
    
    // Verify backtest results
    expect(results.totalTrades).toBe(1);
    expect(results.trades.length).toBe(1);
    expect(results.totalProfitOrLoss).not.toBe(0); // Some P&L generated
    expect(results.winRate).toBeGreaterThanOrEqual(0);
    expect(results.winRate).toBeLessThanOrEqual(100);
    expect(results.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  test('order management methods work correctly', () => {
    const bar = testBars[0];
    
    // Create market order
    const marketOrder = strategy.testCreateMarketOrder(OrderSide.BUY, 1, bar, undefined, 'TEST');
    expect(strategy.getPendingOrders().length).toBe(1);
    expect(marketOrder.type).toBe(OrderType.MARKET);
    
    // Create limit order
    const limitOrder = strategy.testCreateLimitOrder(OrderSide.SELL, 1, 110, bar, undefined, 'TEST');
    expect(strategy.getPendingOrders().length).toBe(2);
    expect(limitOrder.type).toBe(OrderType.LIMIT);
    expect(limitOrder.price).toBe(110);
    
    // Create stop order
    const stopOrder = strategy.testCreateStopOrder(OrderSide.SELL, 1, 90, bar, undefined, 'TEST', true);
    expect(strategy.getPendingOrders().length).toBe(3);
    expect(stopOrder.type).toBe(OrderType.STOP);
    expect(stopOrder.stopPrice).toBe(90);
    expect(stopOrder.isStopLoss).toBe(true);
    
    // Create take profit order
    const tpOrder = strategy.testCreateTakeProfitOrder(OrderSide.SELL, 1, 120, bar, undefined, 'TEST');
    expect(strategy.getPendingOrders().length).toBe(4);
    expect(tpOrder.isTakeProfit).toBe(true);
    
    // Fill an order
    const filledOrder = strategy.testFillOrder(marketOrder, 102, bar.time);
    expect(strategy.getPendingOrders().length).toBe(3);
    expect(strategy.getFilledOrders().length).toBe(1);
    expect(filledOrder.status).toBe('FILLED');
    
    // Cancel an order
    const cancelledOrder = strategy.testCancelOrder(limitOrder, 'Testing cancellation');
    expect(strategy.getPendingOrders().length).toBe(2);
    expect(strategy.getCancelledOrders().length).toBe(1);
    expect(cancelledOrder.status).toBe('CANCELLED');
  });

  test('trade management methods work correctly', () => {
    const entryBar = testBars[5];
    const exitBar = testBars[10];
    
    // Create a trade
    const signal: StrategySignal = {
      barIndex: 5,
      time: entryBar.time,
      type: StrategySignalType.BUY,
      price: entryBar.close
    };
    
    const order = strategy.testCreateMarketOrder(
      OrderSide.BUY,
      1,
      entryBar,
      undefined,
      'TEST'
    );
    
    const filledOrder = strategy.testFillOrder(order, entryBar.close, entryBar.time);
    
    const trade = strategy.testCreateTrade(
      TradeType.BUY,
      entryBar.close,
      1,
      entryBar.time,
      filledOrder,
      signal
    );
    
    expect(strategy.getOpenTrade()).not.toBeNull();
    expect(trade.entryPrice).toBe(entryBar.close);
    expect(trade.status).toBe('OPEN');
    
    // Close the trade
    const exitSignal: StrategySignal = {
      barIndex: 10,
      time: exitBar.time,
      type: StrategySignalType.SELL,
      price: exitBar.close
    };
    
    const exitOrder = strategy.testCreateMarketOrder(
      OrderSide.SELL,
      1,
      exitBar,
      trade.id,
      'TEST'
    );
    
    const filledExitOrder = strategy.testFillOrder(exitOrder, exitBar.close, exitBar.time);
    
    const closedTrade = strategy.testCloseTrade(
      trade,
      exitBar.close,
      exitBar.time,
      filledExitOrder,
      exitSignal,
      'SIGNAL'
    );
    
    expect(strategy.getOpenTrade()).toBeNull();
    expect(strategy.getTrades().length).toBe(1);
    expect(closedTrade.status).toBe('CLOSED');
    expect(closedTrade.exitPrice).toBe(exitBar.close);
    expect(closedTrade.profitOrLoss).not.toBeUndefined();
  });

  test('filtering orders by contract ID works', () => {
    const bar = testBars[0];
    
    // Create orders with different contract IDs
    strategy.testCreateMarketOrder(OrderSide.BUY, 1, bar, undefined, 'TEST1');
    strategy.testCreateMarketOrder(OrderSide.BUY, 1, bar, undefined, 'TEST2');
    strategy.testCreateMarketOrder(OrderSide.BUY, 1, bar, undefined, 'TEST1');
    
    expect(strategy.getPendingOrders().length).toBe(3);
    expect(strategy.getPendingOrders('TEST1').length).toBe(2);
    expect(strategy.getPendingOrders('TEST2').length).toBe(1);
    expect(strategy.getPendingOrders('TEST3').length).toBe(0);
  });
});
