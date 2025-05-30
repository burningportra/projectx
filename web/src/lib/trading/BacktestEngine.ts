import { createOrderManagementSystem, SignalType } from './orders';
import { BacktestBarData, StrategySignal, StrategySignalType } from '@/lib/types/backtester';
import { MarketData, Order, Position, Trade } from './orders/types';
import { EventEmitter } from 'events';

export interface BacktestConfig {
  contractId: string;
  commission?: number;
  slippage?: number;
  initialCapital?: number;
  positionSize?: number;
  maxPositionSize?: number;
  useMarketOrders?: boolean;
  enableStopLoss?: boolean;
  enableTakeProfit?: boolean;
}

export interface BacktestResults {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  commission: number;
  trades: Trade[];
  orders: Order[];
  positions: Position[];
  equityCurve: Array<{ time: number; value: number }>;
}

export class BacktestEngine extends EventEmitter {
  private config: BacktestConfig;
  private orderSystem: ReturnType<typeof createOrderManagementSystem>;
  private currentBar: number = 0;
  private bars: BacktestBarData[] = [];
  private equityCurve: Array<{ time: number; value: number }> = [];
  private initialCapital: number;
  private peakEquity: number;
  private maxDrawdown: number = 0;

  constructor(config: BacktestConfig) {
    super();
    this.config = config;
    this.initialCapital = config.initialCapital || 10000;
    this.peakEquity = this.initialCapital;

    // Create order management system
    this.orderSystem = createOrderManagementSystem({
      commissionStructure: {
        perContract: config.commission || 5,
      },
      slippageModel: {
        type: 'FIXED',
        value: config.slippage || 0,
      },
      riskLimits: {
        maxPositionSize: config.maxPositionSize || 10,
        maxOrderSize: config.positionSize || 1,
        allowShortSelling: true,
      },
      executionConfig: {
        defaultQuantity: config.positionSize || 1,
        maxPositionSize: config.maxPositionSize || 10,
        useMarketOrders: config.useMarketOrders ?? true,
        allowPartialFills: false,
        enableBracketOrders: config.enableStopLoss || config.enableTakeProfit || false,
      },
      isBacktesting: true,
    });

    // Listen to position updates
    this.orderSystem.positionManager.on('positionUpdated', (position: Position) => {
      this.emit('positionUpdated', position);
    });
  }

  // Load bars for backtesting
  public loadBars(bars: BacktestBarData[]): void {
    this.bars = bars;
    this.currentBar = 0;
    this.equityCurve = [];
    this.resetEngine();
  }

  // Reset the engine
  private resetEngine(): void {
    this.orderSystem.orderManager.clearAll();
    this.orderSystem.positionManager.clearAll();
    this.currentBar = 0;
    this.equityCurve = [];
    this.peakEquity = this.initialCapital;
    this.maxDrawdown = 0;
  }

  // Process a strategy signal
  public async processSignal(signal: StrategySignal): Promise<Order[]> {
    if (this.currentBar >= this.bars.length) return [];

    const currentBarData = this.bars[this.currentBar];
    const marketData: MarketData = {
      symbol: this.config.contractId,
      bid: currentBarData.close - 0.25, // Simulate bid/ask spread
      ask: currentBarData.close + 0.25,
      last: currentBarData.close,
      volume: currentBarData.volume || 0,
      timestamp: new Date(currentBarData.time * 1000),
    };

    // Convert strategy signal to execution signal
    const executionSignal = {
      type: this.mapSignalType(signal.type),
      symbol: this.config.contractId,
      quantity: this.config.positionSize,
      price: signal.price,
      metadata: {
        strategySignal: signal,
        barIndex: this.currentBar,
      },
    };

    // Execute the signal
    const orders = await this.orderSystem.tradeExecutor.executeSignal(executionSignal, marketData);

    // Process market data to execute orders
    await this.orderSystem.tradeExecutor.processMarketData(marketData);

    return orders;
  }

  // Map strategy signal type to execution signal type
  private mapSignalType(type: StrategySignalType): SignalType {
    switch (type) {
      case StrategySignalType.BUY:
        return SignalType.BUY;
      case StrategySignalType.SELL:
        return SignalType.CLOSE_LONG;
      default:
        throw new Error(`Unknown signal type: ${type}`);
    }
  }

  // Advance to next bar
  public async advanceBar(): Promise<void> {
    if (this.currentBar >= this.bars.length - 1) return;

    this.currentBar++;
    const currentBarData = this.bars[this.currentBar];

    // Create market data
    const marketData: MarketData = {
      symbol: this.config.contractId,
      bid: currentBarData.close - 0.25,
      ask: currentBarData.close + 0.25,
      last: currentBarData.close,
      volume: currentBarData.volume || 0,
      timestamp: new Date(currentBarData.time * 1000),
    };

    // Update position P&L with current market price
    this.orderSystem.positionManager.updateUnrealizedPnL(this.config.contractId, currentBarData.close);

    // Process any pending orders
    await this.orderSystem.orderManager.processMarketData(marketData);

    // Update equity curve
    this.updateEquityCurve(currentBarData.time);

    // Emit bar update
    this.emit('barProcessed', this.currentBar, currentBarData);
  }

  // Update equity curve
  private updateEquityCurve(time: number): void {
    const portfolio = this.orderSystem.positionManager.getPortfolioValue();
    const currentEquity = this.initialCapital + portfolio.realizedPnL + portfolio.unrealizedPnL;

    this.equityCurve.push({ time, value: currentEquity });

    // Update peak equity and drawdown
    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }
    const drawdown = (this.peakEquity - currentEquity) / this.peakEquity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }

    this.emit('equityUpdated', currentEquity, portfolio.realizedPnL, portfolio.unrealizedPnL);
  }

  // Run complete backtest
  public async runBacktest(
    strategy: { processBar: (bar: BacktestBarData, index: number, bars: BacktestBarData[]) => { signal: StrategySignal | null } }
  ): Promise<BacktestResults> {
    this.resetEngine();

    // Process each bar
    for (let i = 0; i < this.bars.length; i++) {
      this.currentBar = i;
      const bar = this.bars[i];

      // Get strategy signal
      const result = strategy.processBar(bar, i, this.bars);
      
      // Process signal if any
      if (result.signal) {
        await this.processSignal(result.signal);
      }

      // Advance and process market data
      if (i < this.bars.length - 1) {
        await this.advanceBar();
      }
    }

    // Close all positions at the end
    const lastBar = this.bars[this.bars.length - 1];
    const marketData: MarketData = {
      symbol: this.config.contractId,
      bid: lastBar.close - 0.25,
      ask: lastBar.close + 0.25,
      last: lastBar.close,
      volume: lastBar.volume || 0,
      timestamp: new Date(lastBar.time * 1000),
    };

    await this.orderSystem.tradeExecutor.executeSignal({
      type: SignalType.CLOSE_ALL,
      symbol: this.config.contractId,
    }, marketData);

    await this.orderSystem.orderManager.processMarketData(marketData);
    this.updateEquityCurve(lastBar.time);

    // Calculate results
    return this.calculateResults();
  }

  // Calculate backtest results
  private calculateResults(): BacktestResults {
    const portfolio = this.orderSystem.positionManager.getPortfolioValue();
    const summary = this.orderSystem.positionManager.getPositionSummary();
    const trades = this.orderSystem.positionManager.getTradeHistory();
    const orders = this.orderSystem.orderManager.getAllOrders();
    const positions = this.orderSystem.positionManager.getAllPositions();

    // Calculate trade statistics
    const closedTrades = trades.filter(t => !t.isOpen);
    const winningTrades = closedTrades.filter(t => (t.realizedPnL || 0) > 0);
    const losingTrades = closedTrades.filter(t => (t.realizedPnL || 0) < 0);

    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    
    const averageWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) / winningTrades.length
      : 0;
    
    const averageLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) / losingTrades.length)
      : 0;

    const profitFactor = averageLoss > 0 ? averageWin / averageLoss : 0;

    // Calculate Sharpe Ratio (simplified)
    const returns: number[] = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const prevEquity = this.equityCurve[i - 1].value;
      const currEquity = this.equityCurve[i].value;
      returns.push((currEquity - prevEquity) / prevEquity);
    }

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 0
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 0;
    
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    return {
      totalPnL: portfolio.realizedPnL + portfolio.unrealizedPnL,
      realizedPnL: portfolio.realizedPnL,
      unrealizedPnL: portfolio.unrealizedPnL,
      winRate,
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown: this.maxDrawdown * 100, // Convert to percentage
      sharpeRatio,
      commission: summary.totalCommission,
      trades: closedTrades,
      orders,
      positions,
      equityCurve: this.equityCurve,
    };
  }

  // Get current state
  public getCurrentState() {
    return {
      currentBar: this.currentBar,
      orders: this.orderSystem.orderManager.getAllOrders(),
      positions: this.orderSystem.positionManager.getAllPositions(),
      portfolio: this.orderSystem.positionManager.getPortfolioValue(),
      equityCurve: this.equityCurve,
    };
  }

  // Get order manager (for direct access if needed)
  public getOrderManager() {
    return this.orderSystem.orderManager;
  }

  // Get position manager (for direct access if needed)  
  public getPositionManager() {
    return this.orderSystem.positionManager;
  }

  // Get trade executor (for direct access if needed)
  public getTradeExecutor() {
    return this.orderSystem.tradeExecutor;
  }
} 