import { TrendStartStrategyConfig } from '../TrendStartStrategyConfig';

describe('TrendStartStrategyConfig', () => {
  describe('Constructor and Defaults', () => {
    it('should create config with default values', () => {
      const config = new TrendStartStrategyConfig();
      
      // Base defaults
      expect(config.name).toBe('TrendStartStrategy');
      expect(config.description).toBe('Event-driven strategy trading on trend start signals.');
      expect(config.version).toBe('2.0.0');
      expect(config.commission).toBe(2.50);
      expect(config.positionSize).toBe(1);
      expect(config.stopLossPercent).toBe(2.0);
      expect(config.takeProfitPercent).toBe(4.0);
      expect(config.useMarketOrders).toBe(true);
      
      // Strategy specific defaults
      expect(config.minConfirmationBars).toBe(2);
      expect(config.confidenceThreshold).toBe(0.6);
      expect(config.limitOrderOffsetTicks).toBe(2);
      expect(config.contractId).toBe('DEFAULT_CONTRACT');
      expect(config.timeframe).toBe('1h');
      expect(config.allowShorting).toBe(true);
      expect(config.maxOpenPositions).toBe(1);
      expect(config.useResearchMode).toBe(false);
      expect(config.signalExpiryBars).toBe(5);
      
      // Instance identification
      expect(config.orderIdTag).toBe('001');
      expect(config.strategyId).toBe('TrendStartStrategy-DEFAULT_CONTRACT-1h-001');
    });

    it('should override defaults with provided values', () => {
      const config = new TrendStartStrategyConfig({
        name: 'CustomStrategy',
        contractId: 'ES',
        timeframe: '5m',
        confidenceThreshold: 0.8,
        commission: 1.50,
        orderIdTag: '002'
      });
      
      expect(config.name).toBe('CustomStrategy');
      expect(config.contractId).toBe('ES');
      expect(config.timeframe).toBe('5m');
      expect(config.confidenceThreshold).toBe(0.8);
      expect(config.commission).toBe(1.50);
      expect(config.orderIdTag).toBe('002');
      expect(config.strategyId).toBe('CustomStrategy-ES-5m-002');
    });

    it('should use provided strategyId if specified', () => {
      const config = new TrendStartStrategyConfig({
        strategyId: 'CUSTOM_ID_123'
      });
      
      expect(config.strategyId).toBe('CUSTOM_ID_123');
    });
  });

  describe('Immutability', () => {
    it('should be frozen after construction', () => {
      const config = new TrendStartStrategyConfig();
      
      expect(Object.isFrozen(config)).toBe(true);
      
      // Attempt to modify should fail silently in non-strict mode
      // or throw in strict mode
      expect(() => {
        (config as any).commission = 5.0;
      }).toThrow();
    });

    it('should not allow property modification', () => {
      const config = new TrendStartStrategyConfig();
      const originalCommission = config.commission;
      
      // Try to modify
      expect(() => {
        (config as any).commission = 10.0;
      }).toThrow();
      
      // Value should remain unchanged
      expect(config.commission).toBe(originalCommission);
    });
  });

  describe('Validation', () => {
    it('should throw error for empty name', () => {
      expect(() => new TrendStartStrategyConfig({ name: '' }))
        .toThrow('Strategy name is required');
      
      expect(() => new TrendStartStrategyConfig({ name: '   ' }))
        .toThrow('Strategy name is required');
    });

    it('should throw error for negative commission', () => {
      expect(() => new TrendStartStrategyConfig({ commission: -1 }))
        .toThrow('Commission must be non-negative');
    });

    it('should throw error for non-positive position size', () => {
      expect(() => new TrendStartStrategyConfig({ positionSize: 0 }))
        .toThrow('Position size must be positive');
      
      expect(() => new TrendStartStrategyConfig({ positionSize: -1 }))
        .toThrow('Position size must be positive');
    });

    it('should throw error for invalid stop loss percent', () => {
      expect(() => new TrendStartStrategyConfig({ stopLossPercent: -1 }))
        .toThrow('Stop loss percent must be between 0 and 100');
      
      expect(() => new TrendStartStrategyConfig({ stopLossPercent: 101 }))
        .toThrow('Stop loss percent must be between 0 and 100');
    });

    it('should throw error for invalid take profit percent', () => {
      expect(() => new TrendStartStrategyConfig({ takeProfitPercent: -1 }))
        .toThrow('Take profit percent must be between 0 and 1000');
      
      expect(() => new TrendStartStrategyConfig({ takeProfitPercent: 1001 }))
        .toThrow('Take profit percent must be between 0 and 1000');
    });

    it('should throw error for negative minConfirmationBars', () => {
      expect(() => new TrendStartStrategyConfig({ minConfirmationBars: -1 }))
        .toThrow('minConfirmationBars must be non-negative');
    });

    it('should throw error for invalid confidenceThreshold', () => {
      expect(() => new TrendStartStrategyConfig({ confidenceThreshold: -0.1 }))
        .toThrow('confidenceThreshold must be between 0 and 1');
      
      expect(() => new TrendStartStrategyConfig({ confidenceThreshold: 1.1 }))
        .toThrow('confidenceThreshold must be between 0 and 1');
    });

    it('should throw error for negative limitOrderOffsetTicks', () => {
      expect(() => new TrendStartStrategyConfig({ limitOrderOffsetTicks: -1 }))
        .toThrow('limitOrderOffsetTicks must be non-negative');
    });

    it('should throw error for empty contractId', () => {
      expect(() => new TrendStartStrategyConfig({ contractId: '' }))
        .toThrow('contractId is required');
    });

    it('should throw error for empty timeframe', () => {
      expect(() => new TrendStartStrategyConfig({ timeframe: '' }))
        .toThrow('timeframe is required');
    });

    it('should throw error for invalid timeframe format', () => {
      expect(() => new TrendStartStrategyConfig({ timeframe: 'invalid' }))
        .toThrow('Invalid timeframe format');
      
      expect(() => new TrendStartStrategyConfig({ timeframe: '5' }))
        .toThrow('Invalid timeframe format');
      
      expect(() => new TrendStartStrategyConfig({ timeframe: 'm5' }))
        .toThrow('Invalid timeframe format');
    });

    it('should accept valid timeframe formats', () => {
      const validTimeframes = ['1s', '5m', '15m', '1h', '4h', '1d', '1w'];
      
      validTimeframes.forEach(tf => {
        expect(() => new TrendStartStrategyConfig({ timeframe: tf }))
          .not.toThrow();
      });
    });

    it('should throw error for invalid maxOpenPositions', () => {
      expect(() => new TrendStartStrategyConfig({ maxOpenPositions: 0 }))
        .toThrow('maxOpenPositions must be at least 1');
    });

    it('should throw error for negative signalExpiryBars', () => {
      expect(() => new TrendStartStrategyConfig({ signalExpiryBars: -1 }))
        .toThrow('signalExpiryBars must be non-negative');
    });

    it('should throw error for empty orderIdTag', () => {
      expect(() => new TrendStartStrategyConfig({ orderIdTag: '' }))
        .toThrow('orderIdTag is required for strategy identification');
    });
  });

  describe('Methods', () => {
    describe('withUpdates', () => {
      it('should create new config with updated values', () => {
        const original = new TrendStartStrategyConfig({
          commission: 2.5,
          confidenceThreshold: 0.6
        });
        
        const updated = original.withUpdates({
          commission: 3.0,
          confidenceThreshold: 0.8
        });
        
        // Original should be unchanged
        expect(original.commission).toBe(2.5);
        expect(original.confidenceThreshold).toBe(0.6);
        
        // Updated should have new values
        expect(updated.commission).toBe(3.0);
        expect(updated.confidenceThreshold).toBe(0.8);
        
        // Both should be frozen
        expect(Object.isFrozen(original)).toBe(true);
        expect(Object.isFrozen(updated)).toBe(true);
      });
    });

    describe('toObject', () => {
      it('should return plain object representation', () => {
        const config = new TrendStartStrategyConfig({
          name: 'TestStrategy',
          commission: 1.5
        });
        
        const obj = config.toObject();
        
        expect(obj).toEqual(expect.objectContaining({
          name: 'TestStrategy',
          commission: 1.5,
          version: '2.0.0'
        }));
        
        // Should not include methods
        expect(obj.validateConfig).toBeUndefined();
        expect(obj.withUpdates).toBeUndefined();
      });
    });

    describe('toString', () => {
      it('should return formatted string', () => {
        const config = new TrendStartStrategyConfig({
          contractId: 'ES',
          timeframe: '5m'
        });
        
        expect(config.toString()).toBe('TrendStartStrategyConfig(TrendStartStrategy-ES-5m-001)');
      });
    });

    describe('isCompatibleWith', () => {
      it('should return true for compatible configs', () => {
        const config1 = new TrendStartStrategyConfig({
          contractId: 'ES',
          timeframe: '5m',
          version: '2.0.0'
        });
        
        const config2 = new TrendStartStrategyConfig({
          contractId: 'ES',
          timeframe: '5m',
          version: '2.0.0',
          commission: 3.0 // Different but not affecting compatibility
        });
        
        expect(config1.isCompatibleWith(config2)).toBe(true);
      });

      it('should return false for incompatible configs', () => {
        const config1 = new TrendStartStrategyConfig({
          contractId: 'ES',
          timeframe: '5m'
        });
        
        const config2 = new TrendStartStrategyConfig({
          contractId: 'NQ', // Different contract
          timeframe: '5m'
        });
        
        const config3 = new TrendStartStrategyConfig({
          contractId: 'ES',
          timeframe: '1h' // Different timeframe
        });
        
        expect(config1.isCompatibleWith(config2)).toBe(false);
        expect(config1.isCompatibleWith(config3)).toBe(false);
      });
    });

    describe('Parameter Getters', () => {
      const config = new TrendStartStrategyConfig({
        stopLossPercent: 3.0,
        takeProfitPercent: 6.0,
        maxOpenPositions: 2,
        positionSize: 5,
        useMarketOrders: false,
        limitOrderOffsetTicks: 3,
        orderTimeoutBars: 20,
        commission: 1.5,
        minConfirmationBars: 3,
        confidenceThreshold: 0.7,
        signalExpiryBars: 10,
        useResearchMode: true
      });

      it('should return risk parameters', () => {
        const riskParams = config.getRiskParameters();
        
        expect(riskParams).toEqual({
          stopLossPercent: 3.0,
          takeProfitPercent: 6.0,
          maxOpenPositions: 2,
          positionSize: 5
        });
      });

      it('should return execution parameters', () => {
        const execParams = config.getExecutionParameters();
        
        expect(execParams).toEqual({
          useMarketOrders: false,
          limitOrderOffsetTicks: 3,
          orderTimeoutBars: 20,
          commission: 1.5
        });
      });

      it('should return signal parameters', () => {
        const signalParams = config.getSignalParameters();
        
        expect(signalParams).toEqual({
          minConfirmationBars: 3,
          confidenceThreshold: 0.7,
          signalExpiryBars: 10,
          useResearchMode: true
        });
      });
    });
  });
}); 