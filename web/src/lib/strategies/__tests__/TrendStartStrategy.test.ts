import { TrendStartStrategy, TrendStartStrategyConfig } from '../TrendStartStrategy';
import { OrderManager } from '../../OrderManager';
import { TrendIdentifier, TrendStartSignal } from '../../trend-analysis/TrendIdentifier'; // Corrected path
import { BacktestBarData, OrderSide, StrategySignalType, TradeType, UTCTimestamp, OrderStatus, Order, SimulatedTrade, StrategySignal, SubBarData, OrderType } from '../../types/backtester'; // Added OrderType
import { StrategyResult, BaseStrategyConfig } from '../../types/strategy';

// Mock TrendIdentifier
jest.mock('../../trend-analysis/TrendIdentifier'); // Corrected path

const MockTrendIdentifier = TrendIdentifier as jest.MockedClass<typeof TrendIdentifier>;

// Helper to create a dummy bar
const createDummyBar = (time: number, open: number, high: number, low: number, close: number): BacktestBarData => ({
  time: time as UTCTimestamp, open, high, low, close,
});

describe('TrendStartStrategy', () => {
  let mockOrderManager: OrderManager;
  let mockTrendIdentifier: jest.Mocked<TrendIdentifier>;
  let strategy: TrendStartStrategy;
  let baseConfig: Partial<TrendStartStrategyConfig>;

  beforeEach(() => {
    // Create a fresh OrderManager for each test, or reset if shared.
    // For these tests, a real OrderManager is used but its methods can be spied on/mocked.
    mockOrderManager = new OrderManager(0.25); 
    
    // Spy on and mock OrderManager's submitOrder to return a valid Order structure
    jest.spyOn(mockOrderManager, 'submitOrder').mockImplementation((orderInput): Order => {
      const now = (Date.now() / 1000) as UTCTimestamp;
      // Ensure all required fields of Order are present
      const fullOrder: Order = {
        id: orderInput.id || `ord_${Math.random().toString(36).substr(2, 9)}`,
        tradeId: orderInput.tradeId || `trade_${Math.random().toString(36).substr(2, 9)}`,
        contractId: orderInput.contractId || 'DEFAULT_CONTRACT',
        type: orderInput.type || OrderType.MARKET,
        side: orderInput.side || OrderSide.BUY,
        quantity: orderInput.quantity || 0,
        status: orderInput.status || OrderStatus.PENDING,
        submittedTime: orderInput.submittedTime || now,
        price: orderInput.price,
        stopPrice: orderInput.stopPrice,
        filledPrice: orderInput.filledPrice,
        filledQuantity: orderInput.filledQuantity || 0,
        filledTime: orderInput.filledTime,
        commission: orderInput.commission || 0,
        message: orderInput.message || '',
        isStopLoss: orderInput.isStopLoss || false,
        isTakeProfit: orderInput.isTakeProfit || false,
        isEntry: orderInput.isEntry || false,
        isExit: orderInput.isExit || false,
        parentTradeId: orderInput.parentTradeId,
        positionId: orderInput.positionId,
      };
      return fullOrder;
    });
    
    // Spy on and mock OrderManager's processBar to return an empty array by default
    jest.spyOn(mockOrderManager, 'processBar').mockReturnValue([]);

    mockTrendIdentifier = new MockTrendIdentifier() as jest.Mocked<TrendIdentifier>;
    mockTrendIdentifier.getSignalsForRange.mockResolvedValue([]);
    mockTrendIdentifier.resetState = jest.fn();

    baseConfig = {
        name: 'TestTrendStrategy',
        description: 'Test instance of TrendStartStrategy',
        version: '1.0.0',
        commission: 1.0,
        positionSize: 1,
        contractId: 'MES',
        timeframe: '1h',
        confidenceThreshold: 0.5,
        minConfirmationBars: 1,
    };
    strategy = new TrendStartStrategy(mockOrderManager, mockTrendIdentifier, baseConfig);
  });

  test('constructor initializes with provided and default config', () => {
    expect(strategy.getName()).toBe('TestTrendStrategy');
    const config = strategy.getConfig() as TrendStartStrategyConfig;
    expect(config.confidenceThreshold).toBe(0.5);
    expect(config.commission).toBe(1.0); 
    expect(config.stopLossPercent).toBe(2.0); // Default from TrendStartStrategy's own defaults
  });

  test('processBar should request signals from TrendIdentifier', async () => {
    const bar = createDummyBar(1000, 100, 101, 99, 100);
    await strategy.processBar(bar, undefined, 0, [bar]);
    expect(mockTrendIdentifier.getSignalsForRange).toHaveBeenCalledWith([bar], 0, 'MES', '1h');
  });

  test('processBar should open a new BUY position on CUS signal if no trade is open', async () => {
    const cusSignal: TrendStartSignal = { type: 'CUS', barIndex: 0, price: 100, confidence: 0.7, rule: 'TestCUS' };
    mockTrendIdentifier.getSignalsForRange.mockResolvedValue([cusSignal]);
    
    const bar = createDummyBar(1000, 100, 101, 99, 100);
    const result = await strategy.processBar(bar, undefined, 0, [bar]);

    expect(strategy.getOpenTrade()).not.toBeNull();
    expect(strategy.getOpenTrade()?.type).toBe(TradeType.BUY);
    expect(result.signal?.type).toBe(StrategySignalType.BUY);
    expect(mockOrderManager.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
      side: OrderSide.BUY,
      type: OrderType.MARKET, // Assuming default useMarketOrders = true
    }));
  });

  test('processBar should submit SELL order to close an open long position on CDS signal', async () => {
    // Step 1: Open a long position
    const cusSignal: TrendStartSignal = { type: 'CUS', barIndex: 0, price: 100, confidence: 0.7, rule: 'EntryCUS' };
    mockTrendIdentifier.getSignalsForRange.mockResolvedValueOnce([cusSignal]);
    const entryBar = createDummyBar(1000, 100, 101, 99, 100);
    await strategy.processBar(entryBar, undefined, 0, [entryBar]);
    
    const openTrade = strategy.getOpenTrade();
    expect(openTrade).not.toBeNull();
    expect(openTrade?.type).toBe(TradeType.BUY);

    // Simulate the entry order being filled by OrderManager processing
    if (openTrade && openTrade.entryOrder) {
      const filledEntryOrder: Order = { 
        ...openTrade.entryOrder, 
        status: OrderStatus.FILLED, 
        filledPrice: 100, 
        filledTime: entryBar.time,
        filledQuantity: openTrade.size 
      };
      // Make processBar return this fill next time it's called within this test scope for this bar
      (mockOrderManager.processBar as jest.Mock).mockReturnValueOnce([filledEntryOrder]);
      // Call processBar again, or directly call _handleFilledOrder to simulate the fill being processed by strategy
      // For a more integrated test, let processBar handle it:
      await strategy.processBar(entryBar, undefined, 0, [entryBar]); // Re-process same bar to pick up the fill
    }
     expect(strategy.getOpenTrade()?.entryOrder?.status).toBe(OrderStatus.FILLED);


    // Step 2: Generate CDS signal to close the position
    const cdsSignal: TrendStartSignal = { type: 'CDS', barIndex: 1, price: 105, confidence: 0.7, rule: 'ExitCDS' };
    mockTrendIdentifier.getSignalsForRange.mockResolvedValueOnce([cdsSignal]); // Next call to getSignalsForRange
    
    const exitBar = createDummyBar(1001, 105, 106, 104, 105);
    // Ensure processBar is clear of previous mocks for this call
    (mockOrderManager.processBar as jest.Mock).mockReturnValue([]); 
    const result = await strategy.processBar(exitBar, undefined, 1, [entryBar, exitBar]);

    expect(result.signal?.type).toBe(StrategySignalType.SELL);
    // Check that a SELL order was submitted
    expect(mockOrderManager.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
      side: OrderSide.SELL,
      parentTradeId: openTrade?.id // Check it's linked to the open trade
    }));
    // The conceptual trade remains open until the exit order is filled and processed by _handleFilledOrder
    expect(strategy.getOpenTrade()?.status).toBe('OPEN'); 
  });

  // TODO: Add more tests:
  // - _handleFilledOrder for exit fills (SL, TP, signal) correctly calls BaseStrategy.closeTrade
  // - _shouldEnterPosition and _shouldExitPosition logic under various conditions
  // - SL/TP placement via BaseStrategy.onOrderFilled -> placeProtectiveOrders
  // - getTrendSignals and getStatusIndicators
  // - Behavior when TrendIdentifier returns no signals or error
  // - Correct use of contractId and timeframe from config
});
