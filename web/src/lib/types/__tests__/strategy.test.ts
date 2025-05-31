import { 
  IStrategy, 
  StrategyResult, 
  BaseStrategyConfig, 
  StrategyConstructor,
  StrategyMetadata 
} from '../strategy';
import { 
  BacktestBarData, 
  SubBarData, 
  StrategySignal, 
  StrategySignalType,
  SimulatedTrade, 
  Order, 
  StrategyConfig,
  UTCTimestamp,
  BacktestResults,
  TradeType,
  OrderStatus,
  OrderSide,
  OrderType
} from '../backtester';

// Mock implementations for testing

class ValidMockStrategy implements IStrategy {
  private trades: SimulatedTrade[] = [];
  private signals: StrategySignal[] = [];
  private config: BaseStrategyConfig;

  constructor(config: Partial<BaseStrategyConfig> = {}) {
    this.config = {
      name: 'MockStrategy',
      description: 'A mock strategy for testing',
      version: '1.0.0',
      commission: 2.50,
      positionSize: 1,
      ...config
    };
  }

  reset(): void {
    this.trades = [];
    this.signals = [];
  }

  processBar(
    mainBar: BacktestBarData, 
    subBars: SubBarData[] | undefined, 
    barIndex: number, 
    allMainBars: BacktestBarData[]
  ): StrategyResult {
    return {
      signal: null,
      indicators: { mockIndicator: 100 },
      filledOrders: []
    };
  }

  getTrades(): SimulatedTrade[] {
    return this.trades;
  }

  getOpenTrade(): SimulatedTrade | null {
    return null;
  }

  getSignals(): StrategySignal[] {
    return this.signals;
  }

  getCurrentIndicators(): Record<string, number> | null {
    return { mockIndicator: 100 };
  }

  getPendingOrders(contractId?: string): Order[] {
    return [];
  }

  getFilledOrders(contractId?: string): Order[] {
    return [];
  }

  getCancelledOrders(contractId?: string): Order[] {
    return [];
  }

  updateConfig(config: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): StrategyConfig {
    return this.config;
  }

  getName(): string {
    return this.config.name;
  }

  getDescription(): string {
    return this.config.description;
  }

  getVersion(): string {
    return this.config.version;
  }

  // Optional backtest method
  backtest?(mainBars: BacktestBarData[], subBars?: SubBarData[]): BacktestResults {
    return {
      totalProfitOrLoss: 0,
      winRate: 0,
      totalTrades: 0,
      maxDrawdown: 0,
      profitFactor: 0,
      trades: []
    };
  }
}

class AsyncMockStrategy implements IStrategy {
  private config: BaseStrategyConfig = {
    name: 'AsyncMockStrategy',
    description: 'An async mock strategy',
    version: '1.0.0',
    commission: 2.50,
    positionSize: 1
  };

  reset(): void {}

  async processBar(
    mainBar: BacktestBarData, 
    subBars: SubBarData[] | undefined, 
    barIndex: number, 
    allMainBars: BacktestBarData[]
  ): Promise<StrategyResult> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 1));
    return {
      signal: null,
      indicators: { asyncIndicator: 200 },
      filledOrders: []
    };
  }

  getTrades(): SimulatedTrade[] { return []; }
  getOpenTrade(): SimulatedTrade | null { return null; }
  getSignals(): StrategySignal[] { return []; }
  getCurrentIndicators(): Record<string, number> | null { return { asyncIndicator: 200 }; }
  getPendingOrders(): Order[] { return []; }
  getFilledOrders(): Order[] { return []; }
  getCancelledOrders(): Order[] { return []; }
  updateConfig(config: Partial<StrategyConfig>): void {}
  getConfig(): StrategyConfig { return this.config; }
  getName(): string { return this.config.name; }
  getDescription(): string { return this.config.description; }
  getVersion(): string { return this.config.version; }
}

// Test data
const mockBarData: BacktestBarData = {
  time: 1640995200 as UTCTimestamp, // 2022-01-01 00:00:00
  open: 100,
  high: 105,
  low: 95,
  close: 102,
  volume: 1000
};

const mockSubBarData: SubBarData = {
  ...mockBarData,
  parentBarIndex: 0
};

const mockOrder: Order = {
  id: 'order-1',
  type: OrderType.MARKET,
  side: OrderSide.BUY,
  quantity: 1,
  status: OrderStatus.FILLED,
  submittedTime: mockBarData.time,
  filledTime: mockBarData.time,
  filledPrice: 102,
  filledQuantity: 1
};

describe('IStrategy Interface', () => {
  let strategy: IStrategy;

  beforeEach(() => {
    strategy = new ValidMockStrategy();
  });

  describe('Interface Compilation', () => {
    test('should accept valid strategy implementation', () => {
      expect(strategy).toBeInstanceOf(ValidMockStrategy);
      expect(strategy).toBeDefined();
    });

    test('should work with async strategy implementation', () => {
      const asyncStrategy = new AsyncMockStrategy();
      expect(asyncStrategy).toBeInstanceOf(AsyncMockStrategy);
      expect(asyncStrategy).toBeDefined();
    });

    test('should work with strategy constructor type', () => {
      const StrategyClass: StrategyConstructor = ValidMockStrategy;
      const instance = new StrategyClass();
      expect(instance).toBeInstanceOf(ValidMockStrategy);
    });
  });

  describe('Method Signature Validation', () => {
    test('reset method should be callable', () => {
      expect(() => strategy.reset()).not.toThrow();
    });

    test('processBar should accept correct parameters and return StrategyResult', () => {
      const result = strategy.processBar(mockBarData, [mockSubBarData], 0, [mockBarData]);
      expect(result).toBeDefined();
      
      // Handle both sync and async returns
      if (result instanceof Promise) {
        // This shouldn't happen with ValidMockStrategy, but TypeScript needs to know
        expect(result).toBeInstanceOf(Promise);
      } else {
        expect(result).toHaveProperty('signal');
        expect(result).toHaveProperty('indicators');
        expect(result).toHaveProperty('filledOrders');
      }
    });

    test('processBar should work with async implementation', async () => {
      const asyncStrategy = new AsyncMockStrategy();
      const result = await asyncStrategy.processBar(mockBarData, [mockSubBarData], 0, [mockBarData]);
      expect(result).toBeDefined();
      expect(result.indicators).toEqual({ asyncIndicator: 200 });
    });

    test('getter methods should return correct types', () => {
      expect(Array.isArray(strategy.getTrades())).toBe(true);
      expect(strategy.getOpenTrade()).toBeNull();
      expect(Array.isArray(strategy.getSignals())).toBe(true);
      expect(typeof strategy.getCurrentIndicators()).toBe('object');
      expect(Array.isArray(strategy.getPendingOrders())).toBe(true);
      expect(Array.isArray(strategy.getFilledOrders())).toBe(true);
      expect(Array.isArray(strategy.getCancelledOrders())).toBe(true);
    });

    test('order methods should accept optional contractId parameter', () => {
      expect(() => strategy.getPendingOrders('contract1')).not.toThrow();
      expect(() => strategy.getFilledOrders('contract1')).not.toThrow();
      expect(() => strategy.getCancelledOrders('contract1')).not.toThrow();
    });

    test('config methods should work correctly', () => {
      const config = strategy.getConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('commission');
      
      expect(() => strategy.updateConfig({ commission: 5.0 })).not.toThrow();
    });

    test('metadata methods should return strings', () => {
      expect(typeof strategy.getName()).toBe('string');
      expect(typeof strategy.getDescription()).toBe('string');
      expect(typeof strategy.getVersion()).toBe('string');
    });
  });

  describe('Type Safety Tests', () => {
    test('StrategyResult should have correct structure', () => {
      const result = strategy.processBar(mockBarData, undefined, 0, [mockBarData]);
      
      // Ensure we have a sync result for testing
      expect(result).not.toBeInstanceOf(Promise);
      
      if (!(result instanceof Promise)) {
        // signal can be null or StrategySignal
        expect(result.signal === null || typeof result.signal === 'object').toBe(true);
        
        // indicators should be Record<string, number>
        expect(typeof result.indicators).toBe('object');
        if (result.indicators) {
          Object.values(result.indicators).forEach(value => {
            expect(typeof value).toBe('number');
          });
        }
        
        // filledOrders should be array
        expect(Array.isArray(result.filledOrders)).toBe(true);
      }
    });

    test('BaseStrategyConfig should extend StrategyConfig', () => {
      const mockConfig: BaseStrategyConfig = {
        name: 'TestStrategy',
        description: 'Test description',
        version: '1.0.0',
        commission: 2.50,
        positionSize: 1
      };
      
      expect(mockConfig).toHaveProperty('name');
      expect(mockConfig).toHaveProperty('description');
      expect(mockConfig).toHaveProperty('version');
      expect(mockConfig).toHaveProperty('commission');
      expect(mockConfig).toHaveProperty('positionSize');
    });

    test('StrategyMetadata should have correct structure', () => {
      const metadata: StrategyMetadata = {
        id: 'test-strategy',
        name: 'Test Strategy',
        description: 'A test strategy',
        version: '1.0.0',
        author: 'Test Author',
        parameters: {
          period: {
            type: 'number',
            default: 20,
            description: 'Moving average period',
            min: 1,
            max: 100
          },
          enabled: {
            type: 'boolean',
            default: true,
            description: 'Enable strategy'
          }
        },
        complexity: 5
      };
      
      expect(metadata).toHaveProperty('id');
      expect(metadata).toHaveProperty('parameters');
      expect(metadata.parameters.period.type).toBe('number');
      expect(metadata.parameters.enabled.type).toBe('boolean');
    });
  });

  describe('Integration Tests', () => {
    test('should work with existing backtester types', () => {
      const signal: StrategySignal = {
        barIndex: 0,
        time: mockBarData.time,
        type: StrategySignalType.BUY,
        price: 102,
        message: 'Test signal'
      };
      
      const trade: SimulatedTrade = {
        id: 'trade-1',
        entryTime: mockBarData.time,
        entryPrice: 102,
        type: TradeType.BUY,
        size: 1,
        status: 'OPEN'
      };
      
      // These should compile without errors
      expect(signal).toBeDefined();
      expect(trade).toBeDefined();
    });

    test('generic indicators should work with different number types', () => {
      const indicators: Record<string, number> = {
        sma: 100.5,
        ema: 99.8,
        rsi: 65,
        volume: 1000
      };
      
      const result: StrategyResult = {
        signal: null,
        indicators,
        filledOrders: []
      };
      
      expect(result.indicators.sma).toBe(100.5);
      expect(result.indicators.ema).toBe(99.8);
      expect(result.indicators.rsi).toBe(65);
      expect(result.indicators.volume).toBe(1000);
    });

    test('optional backtest method should work', () => {
      const strategyWithBacktest = new ValidMockStrategy();
      
      if (strategyWithBacktest.backtest) {
        const results = strategyWithBacktest.backtest([mockBarData]);
        expect(results).toHaveProperty('totalProfitOrLoss');
        expect(results).toHaveProperty('winRate');
        expect(results).toHaveProperty('totalTrades');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle undefined subBars gracefully', () => {
      expect(() => {
        strategy.processBar(mockBarData, undefined, 0, [mockBarData]);
      }).not.toThrow();
    });

    test('should handle empty arrays gracefully', () => {
      expect(() => {
        strategy.processBar(mockBarData, [], 0, []);
      }).not.toThrow();
    });

    test('should handle null getCurrentIndicators return', () => {
      // Create a strategy that returns null for indicators
      class NullIndicatorStrategy extends ValidMockStrategy {
        getCurrentIndicators(): null {
          return null;
        }
      }
      
      const nullStrategy = new NullIndicatorStrategy();
      expect(nullStrategy.getCurrentIndicators()).toBeNull();
    });
  });
});
