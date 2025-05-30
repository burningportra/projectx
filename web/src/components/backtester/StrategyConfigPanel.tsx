"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StrategyConfigPanelProps {
  onConfigChange: (config: StrategyConfig) => void;
  initialConfig?: StrategyConfig;
}

interface StrategyConfig {
  // Risk Management
  stopLossPercent: number;
  takeProfitPercent: number;
  commission: number;
  positionSize: number;
  
  // Order Preferences
  useMarketOrders: boolean;
  limitOrderOffset: number;
  
  // Strategy Parameters
  fastPeriod: number;
  slowPeriod: number;
}

const StrategyConfigPanel: React.FC<StrategyConfigPanelProps> = ({
  onConfigChange,
  initialConfig = {
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    commission: 2.50,
    positionSize: 1,
    useMarketOrders: true,
    limitOrderOffset: 2,
    fastPeriod: 12,
    slowPeriod: 26,
  }
}) => {
  const [config, setConfig] = useState<StrategyConfig>(initialConfig);
  const [hasChanges, setHasChanges] = useState(false);

  const handleInputChange = (field: keyof StrategyConfig, value: number | boolean) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    setHasChanges(true);
  };

  const handleApplyConfig = () => {
    onConfigChange(config);
    setHasChanges(false);
  };

  const handleResetConfig = () => {
    setConfig(initialConfig);
    setHasChanges(false);
  };

  return (
    <div className="space-y-6">
      {/* Risk Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="mr-2">🛡️</span>
            Risk Management
          </CardTitle>
          <CardDescription>
            Configure stop loss, take profit, and position sizing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stopLoss">Stop Loss (%)</Label>
              <Input
                id="stopLoss"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={config.stopLossPercent}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('stopLossPercent', parseFloat(e.target.value) || 0)}
                placeholder="2.0"
              />
              <p className="text-xs text-gray-500">
                Stop loss as percentage (e.g., 2.0 for 2%)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="takeProfit">Take Profit (%)</Label>
              <Input
                id="takeProfit"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={config.takeProfitPercent}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('takeProfitPercent', parseFloat(e.target.value) || 0)}
                placeholder="4.0"
              />
              <p className="text-xs text-gray-500">
                Take profit as percentage (e.g., 4.0 for 4%)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="positionSize">Position Size</Label>
              <Input
                id="positionSize"
                type="number"
                min="1"
                value={config.positionSize}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('positionSize', parseInt(e.target.value) || 1)}
                placeholder="1"
              />
              <p className="text-xs text-gray-500">
                Number of contracts per trade
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="commission">Commission ($)</Label>
              <Input
                id="commission"
                type="number"
                step="0.01"
                min="0"
                value={config.commission}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('commission', parseFloat(e.target.value) || 0)}
                placeholder="2.50"
              />
              <p className="text-xs text-gray-500">
                Commission per trade (round trip)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="mr-2">📋</span>
            Order Management
          </CardTitle>
          <CardDescription>
            Configure order types and execution preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="marketOrders">Use Market Orders</Label>
              <p className="text-xs text-gray-500">
                Use market orders for immediate execution vs limit orders
              </p>
            </div>
            <Switch
              id="marketOrders"
              checked={config.useMarketOrders}
              onCheckedChange={(checked) => handleInputChange('useMarketOrders', checked)}
            />
          </div>
          
          {!config.useMarketOrders && (
            <div className="space-y-2">
              <Label htmlFor="limitOffset">Limit Order Offset (ticks)</Label>
              <Input
                id="limitOffset"
                type="number"
                min="1"
                value={config.limitOrderOffset}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('limitOrderOffset', parseInt(e.target.value) || 1)}
                placeholder="2"
              />
              <p className="text-xs text-gray-500">
                Number of ticks away from market for limit orders
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Parameters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="mr-2">⚙️</span>
            Strategy Parameters
          </CardTitle>
          <CardDescription>
            Configure EMA periods and strategy-specific settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fastPeriod">Fast EMA Period</Label>
              <Input
                id="fastPeriod"
                type="number"
                min="1"
                max="200"
                value={config.fastPeriod}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('fastPeriod', parseInt(e.target.value) || 12)}
                placeholder="12"
              />
              <p className="text-xs text-gray-500">
                Period for fast moving average (default: 12)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="slowPeriod">Slow EMA Period</Label>
              <Input
                id="slowPeriod"
                type="number"
                min="1"
                max="200"
                value={config.slowPeriod}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('slowPeriod', parseInt(e.target.value) || 26)}
                placeholder="26"
              />
              <p className="text-xs text-gray-500">
                Period for slow moving average (default: 26)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              <Button 
                onClick={handleApplyConfig}
                disabled={!hasChanges}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Apply Configuration
              </Button>
              <Button 
                variant="outline" 
                onClick={handleResetConfig}
                disabled={!hasChanges}
              >
                Reset to Default
              </Button>
            </div>
            {hasChanges && (
              <p className="text-sm text-amber-600 font-medium">
                ⚠️ Configuration changed - click Apply to update strategy
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Stop Loss:</span>
              <span className="ml-1 font-medium">{config.stopLossPercent}%</span>
            </div>
            <div>
              <span className="text-gray-500">Take Profit:</span>
              <span className="ml-1 font-medium">{config.takeProfitPercent}%</span>
            </div>
            <div>
              <span className="text-gray-500">Position:</span>
              <span className="ml-1 font-medium">{config.positionSize} contracts</span>
            </div>
            <div>
              <span className="text-gray-500">Commission:</span>
              <span className="ml-1 font-medium">${config.commission}</span>
            </div>
            <div>
              <span className="text-gray-500">Order Type:</span>
              <span className="ml-1 font-medium">{config.useMarketOrders ? 'Market' : 'Limit'}</span>
            </div>
            <div>
              <span className="text-gray-500">Fast EMA:</span>
              <span className="ml-1 font-medium">{config.fastPeriod}</span>
            </div>
            <div>
              <span className="text-gray-500">Slow EMA:</span>
              <span className="ml-1 font-medium">{config.slowPeriod}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StrategyConfigPanel; 