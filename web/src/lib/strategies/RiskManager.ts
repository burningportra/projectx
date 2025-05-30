import { Order, OrderSide, OrderType } from '@/lib/types/backtester';

export interface RiskMetrics {
  totalEquity: number;
  availableMargin: number;
  usedMargin: number;
  marginLevel: number;
  drawdown: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  riskScore: number; // 0-100
}

export interface PositionSizing {
  maxPositionSize: number;
  recommendedSize: number;
  riskAdjustedSize: number;
  marginRequired: number;
}

export interface RiskSettings {
  maxRiskPerTrade: number; // % of account
  maxDrawdown: number; // % of account
  maxPositionsOpen: number;
  maxCorrelatedPositions: number;
  marginThreshold: number; // % required margin level
  maxDailyLoss: number; // % of account per day
  volatilityAdjustment: boolean;
  useKellyOptimization: boolean;
}

export class RiskManager {
  private riskSettings: RiskSettings;
  private accountBalance: number;
  private trades: any[] = [];
  private openPositions: any[] = [];
  private dailyPnL: Map<string, number> = new Map();

  constructor(settings: RiskSettings, initialBalance: number = 100000) {
    this.riskSettings = settings;
    this.accountBalance = initialBalance;
  }

  // Calculate position size based on risk management rules
  calculatePositionSize(
    entryPrice: number,
    stopLossPrice: number,
    currentVolatility: number = 0.02
  ): PositionSizing {
    const riskAmount = this.accountBalance * (this.riskSettings.maxRiskPerTrade / 100);
    const riskPerShare = Math.abs(entryPrice - stopLossPrice);
    
    if (riskPerShare <= 0) {
      return {
        maxPositionSize: 0,
        recommendedSize: 0,
        riskAdjustedSize: 0,
        marginRequired: 0
      };
    }

    // Basic position size
    let baseSize = riskAmount / riskPerShare;
    
    // Volatility adjustment
    if (this.riskSettings.volatilityAdjustment) {
      const volatilityMultiplier = 1 / (1 + currentVolatility * 10);
      baseSize *= volatilityMultiplier;
    }

    // Portfolio heat adjustment
    const heatMultiplier = this.calculatePortfolioHeatMultiplier();
    const riskAdjustedSize = baseSize * heatMultiplier;

    // Kelly optimization
    let kellyOptimizedSize = riskAdjustedSize;
    if (this.riskSettings.useKellyOptimization && this.trades.length > 10) {
      const kellyFraction = this.calculateKellyFraction();
      kellyOptimizedSize = riskAdjustedSize * kellyFraction;
    }

    // Maximum position limits
    const maxPositionValue = this.accountBalance * 0.2; // Max 20% per position
    const maxPositionSize = maxPositionValue / entryPrice;

    return {
      maxPositionSize: maxPositionSize,
      recommendedSize: Math.min(baseSize, maxPositionSize),
      riskAdjustedSize: Math.min(riskAdjustedSize, maxPositionSize),
      marginRequired: Math.min(kellyOptimizedSize, maxPositionSize) * entryPrice * 0.05 // 5% margin
    };
  }

  // Check if a new trade meets risk criteria
  validateTrade(
    side: OrderSide,
    size: number,
    entryPrice: number,
    stopLoss?: number
  ): { allowed: boolean; reason?: string; adjustedSize?: number } {
    // Check maximum positions
    if (this.openPositions.length >= this.riskSettings.maxPositionsOpen) {
      return { allowed: false, reason: 'Maximum positions limit reached' };
    }

    // Check daily loss limit
    const today = new Date().toDateString();
    const todayPnL = this.dailyPnL.get(today) || 0;
    const maxDailyLoss = this.accountBalance * (this.riskSettings.maxDailyLoss / 100);
    
    if (todayPnL <= -maxDailyLoss) {
      return { allowed: false, reason: 'Daily loss limit exceeded' };
    }

    // Check margin requirements
    const marginRequired = size * entryPrice * 0.05; // 5% margin requirement
    const availableMargin = this.calculateAvailableMargin();
    
    if (marginRequired > availableMargin * 0.8) { // Use max 80% of available margin
      const adjustedSize = (availableMargin * 0.8) / (entryPrice * 0.05);
      return { 
        allowed: true, 
        reason: 'Position size adjusted for margin requirements',
        adjustedSize: adjustedSize
      };
    }

    // Check drawdown protection
    const currentDrawdown = this.calculateCurrentDrawdown();
    if (currentDrawdown >= this.riskSettings.maxDrawdown * 0.8) { // Stop at 80% of max drawdown
      return { allowed: false, reason: 'Drawdown protection activated' };
    }

    return { allowed: true };
  }

  // Calculate current risk metrics
  calculateRiskMetrics(): RiskMetrics {
    const totalPnL = this.trades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const currentEquity = this.accountBalance + totalPnL;
    
    const winningTrades = this.trades.filter(t => (t.profitOrLoss || 0) > 0);
    const losingTrades = this.trades.filter(t => (t.profitOrLoss || 0) < 0);
    
    const winRate = this.trades.length > 0 ? (winningTrades.length / this.trades.length) * 100 : 0;
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profitOrLoss, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profitOrLoss, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 1;

    return {
      totalEquity: currentEquity,
      availableMargin: this.calculateAvailableMargin(),
      usedMargin: this.calculateUsedMargin(),
      marginLevel: this.calculateMarginLevel(),
      drawdown: this.calculateCurrentDrawdown(),
      maxDrawdown: this.calculateMaxDrawdown(),
      sharpeRatio: this.calculateSharpeRatio(),
      winRate: winRate,
      profitFactor: profitFactor,
      riskScore: this.calculateRiskScore()
    };
  }

  // Portfolio heat map for correlation risk
  private calculatePortfolioHeatMultiplier(): number {
    if (this.openPositions.length === 0) return 1.0;
    
    // Reduce position size as more positions are open
    const heatReduction = Math.pow(0.9, this.openPositions.length);
    return Math.max(heatReduction, 0.3); // Minimum 30% of base size
  }

  // Kelly criterion for optimal position sizing
  private calculateKellyFraction(): number {
    if (this.trades.length < 10) return 0.5; // Conservative default
    
    const wins = this.trades.filter(t => (t.profitOrLoss || 0) > 0);
    const losses = this.trades.filter(t => (t.profitOrLoss || 0) < 0);
    
    if (wins.length === 0 || losses.length === 0) return 0.25;
    
    const winRate = wins.length / this.trades.length;
    const avgWin = wins.reduce((sum, t) => sum + t.profitOrLoss, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.profitOrLoss, 0) / losses.length);
    
    const winLossRatio = avgWin / avgLoss;
    const kellyFraction = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;
    
    // Cap Kelly fraction between 0.1 and 0.8 for safety
    return Math.max(0.1, Math.min(0.8, kellyFraction));
  }

  private calculateAvailableMargin(): number {
    const usedMargin = this.calculateUsedMargin();
    return Math.max(0, this.accountBalance - usedMargin);
  }

  private calculateUsedMargin(): number {
    return this.openPositions.reduce((total, pos) => {
      return total + (pos.size * pos.entryPrice * 0.05); // 5% margin
    }, 0);
  }

  private calculateMarginLevel(): number {
    const usedMargin = this.calculateUsedMargin();
    return usedMargin > 0 ? (this.accountBalance / usedMargin) * 100 : 999;
  }

  private calculateCurrentDrawdown(): number {
    const totalPnL = this.trades.reduce((sum, trade) => sum + (trade.profitOrLoss || 0), 0);
    const currentEquity = this.accountBalance + totalPnL;
    const highWaterMark = this.calculateHighWaterMark();
    
    return highWaterMark > 0 ? ((highWaterMark - currentEquity) / highWaterMark) * 100 : 0;
  }

  private calculateMaxDrawdown(): number {
    let maxDrawdown = 0;
    let runningPnL = 0;
    let highWaterMark = this.accountBalance;
    
    for (const trade of this.trades) {
      runningPnL += trade.profitOrLoss || 0;
      const currentEquity = this.accountBalance + runningPnL;
      
      if (currentEquity > highWaterMark) {
        highWaterMark = currentEquity;
      }
      
      const drawdown = ((highWaterMark - currentEquity) / highWaterMark) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  private calculateHighWaterMark(): number {
    let highWaterMark = this.accountBalance;
    let runningPnL = 0;
    
    for (const trade of this.trades) {
      runningPnL += trade.profitOrLoss || 0;
      const currentEquity = this.accountBalance + runningPnL;
      highWaterMark = Math.max(highWaterMark, currentEquity);
    }
    
    return highWaterMark;
  }

  private calculateSharpeRatio(): number {
    if (this.trades.length < 5) return 0;
    
    const returns = this.trades.map(t => (t.profitOrLoss || 0) / this.accountBalance);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized Sharpe
  }

  private calculateRiskScore(): number {
    const metrics = this.calculateRiskMetrics();
    
    // Risk factors (higher = more risky)
    const drawdownRisk = metrics.drawdown / this.riskSettings.maxDrawdown;
    const marginRisk = metrics.usedMargin / (metrics.totalEquity * 0.5); // 50% max margin usage
    const concentrationRisk = this.openPositions.length / this.riskSettings.maxPositionsOpen;
    const volatilityRisk = Math.min(1, Math.abs(metrics.sharpeRatio) < 0.5 ? 1 : 0);
    
    // Combined risk score (0-100)
    const riskScore = (drawdownRisk + marginRisk + concentrationRisk + volatilityRisk) * 25;
    return Math.min(100, Math.max(0, riskScore));
  }

  // Update methods
  addTrade(trade: any): void {
    this.trades.push(trade);
    
    // Update daily P&L tracking
    const tradeDate = new Date().toDateString();
    const currentDailyPnL = this.dailyPnL.get(tradeDate) || 0;
    this.dailyPnL.set(tradeDate, currentDailyPnL + (trade.profitOrLoss || 0));
  }

  addPosition(position: any): void {
    this.openPositions.push(position);
  }

  removePosition(positionId: string): void {
    this.openPositions = this.openPositions.filter(p => p.id !== positionId);
  }

  updateSettings(newSettings: Partial<RiskSettings>): void {
    this.riskSettings = { ...this.riskSettings, ...newSettings };
  }
} 