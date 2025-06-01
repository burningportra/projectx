import { StrategyFluentBuilder } from '../StrategyFluentBuilder';
import { OrderManager } from '../../OrderManager';
import { IStrategy, BaseStrategyConfig, StrategyResult } from '../../types/strategy';
import { BacktestBarData, OrderSide, TradeType, StrategySignalType, UTCTimestamp, OrderStatus, SimulatedTrade, StrategySignal, Order } from '../../types/backtester';
import { IIndicator } from '../../types/indicator';

// Mock Indicator Class for testing
class MockIndicator implements IIndicator {
  private value: number = 0;
  public name: string;
  constructor(public period: number) {
    this.name = `MockIndicator(${period})`;
  }
  update(bar: BacktestBarData): void { this.value = bar.close + this.period; }
  getValue(): number { return this.value; }
  reset(): void { this.value = 0; }
  isReady?(): boolean { return this.value !== 0; } // Example: ready after first update
}

// Helper to create a dummy bar
const createDummyBar = (close: number, time: number = Date.now() / 1000): BacktestBarData => ({
  time: time as UTCTimestamp, open: close, high: close, low: close, close,
});

describe('StrategyFluentBuilder', () => {
  let orderManager: OrderManager;

  beforeEach(() => {
    orderManager = new OrderManager(0.25);
  });

  test('should build a valid strategy with all required steps', () => {
    const strategy = StrategyFluentBuilder.create(orderManager)
      .withName('TestStrategy')
      .withDescription('A test strategy')
      .withVersion('1.0.0')
      .addIndicator('mockInd', MockIndicator, { period: 10 })
      .withEntryCondition((inds, bar) => inds.mockInd > bar.close)
      .withExitCondition((inds, bar, trade) => inds.mockInd < bar.close)
      .withPositionSizing({ fixedSize: 1 })
      .withStopLoss({ percent: 2 })
      .withTakeProfit({ ticks: 10 })
      .build();

    expect(strategy).toBeDefined();
    expect(strategy.getName()).toBe('TestStrategy');
    expect(strategy.getDescription()).toBe('A test strategy');
    expect(strategy.getVersion()).toBe('1.0.0');
    const config = strategy.getConfig() as BaseStrategyConfig;
    expect(config.positionSize).toBe(1);
    expect(config.stopLossPercent).toBe(2);
    expect(config.takeProfitTicks).toBe(10);
  });

  test('build() should throw if name is missing', () => {
    expect(() => {
      // To test runtime check, we bypass TypeScript's stage enforcement with 'as any'
      (StrategyFluentBuilder.create(orderManager) as any)
        // Name is missing intentionally
        .withDescription('A test strategy')
        .withVersion('1.0.0')
        .withEntryCondition((inds: Record<string, any>, bar: BacktestBarData) => true)
        .withExitCondition((inds: Record<string, any>, bar: BacktestBarData, trade: SimulatedTrade | null) => false)
        .build();
    }).toThrow('Strategy name, description, and version are required.');
  });

  test('build() should throw if description is missing', () => {
    expect(() => {
      (StrategyFluentBuilder.create(orderManager)
        .withName('TestStrategy') as any)
        // Description is missing intentionally
        .withVersion('1.0.0')
        .withEntryCondition((inds: Record<string, any>, bar: BacktestBarData) => true)
        .withExitCondition((inds: Record<string, any>, bar: BacktestBarData, trade: SimulatedTrade | null) => false)
        .build();
    }).toThrow('Strategy name, description, and version are required.');
  });

  test('build() should throw if version is missing', () => {
    expect(() => {
      (StrategyFluentBuilder.create(orderManager)
        .withName('TestStrategy')
        .withDescription('A test strategy') as any)
        // Version is missing intentionally
        .withEntryCondition((inds: Record<string, any>, bar: BacktestBarData) => true)
        .withExitCondition((inds: Record<string, any>, bar: BacktestBarData, trade: SimulatedTrade | null) => false)
        .build();
    }).toThrow('Strategy name, description, and version are required.');
  });

  test('build() should throw if entry condition is missing', () => {
    expect(() => {
      (StrategyFluentBuilder.create(orderManager)
        .withName('TestStrategy')
        .withDescription('A test strategy')
        .withVersion('1.0.0') as any) // Cast to any to call withExitCondition from IOptionalIndicatorStage
        // Entry condition is missing intentionally
        .withExitCondition((inds: Record<string, any>, bar: BacktestBarData, trade: SimulatedTrade | null) => false)
        .build();
    }).toThrow('Entry condition logic is required.');
  });

  test('build() should throw if exit condition is missing', () => {
    expect(() => {
      (StrategyFluentBuilder.create(orderManager)
        .withName('TestStrategy')
        .withDescription('A test strategy')
        .withVersion('1.0.0')
        .withEntryCondition((inds: Record<string, any>, bar: BacktestBarData) => true) as any) 
        // Intentionally not calling withExitCondition, then casting to 'any' to call build.
        .build(); 
    }).toThrow('Exit condition logic is required.');
  });
  
  test('built strategy processBar should execute entry and exit logic', async () => {
    const entryLogic = jest.fn((inds: Record<string, any>, bar: BacktestBarData): boolean => inds.mockInd > bar.close + 2);
    const exitLogic = jest.fn((inds: Record<string, any>, bar: BacktestBarData, trade: SimulatedTrade | null): boolean => inds.mockInd < bar.close + 10);

    const strategy = StrategyFluentBuilder.create(orderManager)
      .withName('ProcessBarTestStrategy')
      .withDescription('Test processBar execution')
      .withVersion('1.0.0')
      .addIndicator('mockInd', MockIndicator, { period: 5 })
      .withEntryCondition(entryLogic)
      .withExitCondition(exitLogic)
      .build();

    const bar1 = createDummyBar(100, 1);
    const bar2 = createDummyBar(200, 2); // Price moves up, no exit
    const bar3 = createDummyBar(10, 3);  // Price drops, exit

    // Bar 1: Entry
    const result1: StrategyResult = await strategy.processBar(bar1, undefined, 0, [bar1, bar2, bar3]);
    expect(entryLogic).toHaveBeenCalledWith(expect.objectContaining({ mockInd: 105 }), bar1);
    expect(result1.signal?.type).toBe(StrategySignalType.BUY);
    expect(strategy.getOpenTrade()).not.toBeNull();
    
    // Manually simulate fill for the entry order to allow exit logic to trigger
    const openTrade = strategy.getOpenTrade();
    if (openTrade && openTrade.entryOrder) {
        const filledEntryOrder: Order = {
            ...openTrade.entryOrder,
            status: OrderStatus.FILLED,
            filledPrice: bar1.close,
            filledTime: bar1.time,
            filledQuantity: openTrade.size
        };
        // Simulate OrderManager processing this fill and strategy reacting
        (strategy as any).onOrderFilled(filledEntryOrder, openTrade); 
        // Note: This direct call to onOrderFilled is a simplification for testing.
        // In reality, OrderManager.processBar would return this fill, and the
        // DynamicStrategy's processBar would call onOrderFilled.
    }

    // Bar 2: Hold
    const result2: StrategyResult = await strategy.processBar(bar2, undefined, 1, [bar1, bar2, bar3]);
    expect(exitLogic).toHaveBeenCalledWith(expect.objectContaining({ mockInd: 205 }), bar2, strategy.getOpenTrade());
    expect(result2.signal).toBeNull();
    expect(strategy.getOpenTrade()).not.toBeNull(); // Still open

    // Bar 3: Exit
    const result3: StrategyResult = await strategy.processBar(bar3, undefined, 2, [bar1, bar2, bar3]);
    expect(exitLogic).toHaveBeenCalledWith(expect.objectContaining({ mockInd: 15 }), bar3, strategy.getOpenTrade());
    expect(result3.signal?.type).toBe(StrategySignalType.SELL);
    // After exit order is submitted, OrderManager would fill it.
    // For this test, we assume the exit signal means the conceptual trade will close.
    // A more thorough test would mock OrderManager.processBar to return the exit fill.
  });

  test('strategy with no indicators should work', async () => {
    const strategy = StrategyFluentBuilder.create(orderManager)
      .withName('NoIndicatorStrategy')
      .withDescription('A test strategy without indicators')
      .withVersion('1.0.0')
      .withEntryCondition((inds: Record<string, any>, bar: BacktestBarData): boolean => bar.close > 100)
      .withExitCondition((inds: Record<string, any>, bar: BacktestBarData, trade: SimulatedTrade | null): boolean => bar.close < 90)
      .build();
    
    expect(strategy).toBeDefined();
    const bar = createDummyBar(101);
    const result: StrategyResult = await strategy.processBar(bar, undefined, 0, [bar]);
    expect(result.signal?.type).toBe(StrategySignalType.BUY);
    expect(result.indicators).toEqual({});
  });
});
