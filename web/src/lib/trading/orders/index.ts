// Export all types
export * from './types';

// Export main classes
export { OrderManager } from './OrderManager';
export { PositionManager } from './PositionManager';
export { TradeExecutor, SignalType, type StrategySignal, type ExecutionConfig } from './TradeExecutor';

// Import for factory function
import { OrderManager } from './OrderManager';
import { PositionManager } from './PositionManager';
import { TradeExecutor } from './TradeExecutor';

// Factory function to create integrated order management system
export function createOrderManagementSystem(config?: {
  commissionStructure?: import('./types').CommissionStructure;
  slippageModel?: import('./types').SlippageModel;
  riskLimits?: import('./types').RiskLimits;
  executionConfig?: import('./TradeExecutor').ExecutionConfig;
  isBacktesting?: boolean;
}) {
  const positionManager = new PositionManager();
  
  const orderManager = new OrderManager(
    positionManager,
    config?.commissionStructure || { perContract: 5 },
    config?.slippageModel || { type: 'FIXED', value: 0 },
    config?.riskLimits || {},
    config?.isBacktesting ?? true
  );
  
  const tradeExecutor = new TradeExecutor(
    orderManager,
    positionManager,
    config?.executionConfig || {
      defaultQuantity: 1,
      maxPositionSize: 10,
      useMarketOrders: true,
      allowPartialFills: true,
      enableBracketOrders: false,
    }
  );
  
  return {
    orderManager,
    positionManager,
    tradeExecutor,
  };
} 