import React, { useState, useCallback } from 'react';
import {
  DeclarativeStrategy,
  EntrySignal,
  ExitSignal,
  Condition,
  IndicatorConfig,
  RiskManagement,
  ValueReference,
  StrategyTemplate,
  StrategyValidationResult,
  IndicatorType,
  ComparisonOperator,
  LogicalOperator,
  OrderType,
  PositionSide
} from '../../lib/v3/DeclarativeStrategy';
import TemplateExecutor from '../../lib/v3/TemplateExecutor';

// Strategy Builder Components
interface StrategyBuilderProps {
  onStrategyCreated?: (strategy: DeclarativeStrategy) => void;
  onValidationChange?: (validation: StrategyValidationResult) => void;
  initialStrategy?: Partial<DeclarativeStrategy>;
  templates?: StrategyTemplate[];
}

interface ConditionBuilderProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
  indicators: IndicatorConfig[];
}

interface ValueReferenceBuilderProps {
  value: ValueReference;
  onChange: (value: ValueReference) => void;
  indicators: IndicatorConfig[];
  label: string;
}

/**
 * Main Strategy Builder Component
 * 
 * Provides a comprehensive visual interface for creating trading strategies
 * without coding. Includes forms, condition builders, and real-time validation.
 */
export const StrategyBuilder: React.FC<StrategyBuilderProps> = ({
  onStrategyCreated,
  onValidationChange,
  initialStrategy,
  templates = []
}) => {
  const [strategy, setStrategy] = useState<DeclarativeStrategy>(() => ({
    id: '',
    name: '',
    version: '1.0.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    settings: {
      timeframe: '1h',
      allowLong: true,
      allowShort: true,
      allowMultiplePositions: false
    },
    indicators: [],
    riskManagement: {
      positionSizing: {
        type: 'fixed_percentage',
        fixedPercentage: 10
      }
    },
    entrySignals: [],
    exitSignals: [],
    ...initialStrategy
  }));

  const [validation, setValidation] = useState<StrategyValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'indicators' | 'entry' | 'exit' | 'risk' | 'preview'>('general');

  // Validate strategy whenever it changes
  React.useEffect(() => {
    const newValidation = TemplateExecutor.validateStrategy(strategy);
    setValidation(newValidation);
    onValidationChange?.(newValidation);
  }, [strategy, onValidationChange]);

  const updateStrategy = useCallback((updates: Partial<DeclarativeStrategy>) => {
    setStrategy(prev => ({
      ...prev,
      ...updates,
      updated: new Date().toISOString()
    }));
  }, []);

  const addIndicator = useCallback(() => {
    const newIndicator: IndicatorConfig = {
      id: `indicator_${Date.now()}`,
      name: 'New Indicator',
      type: 'SMA',
      period: 20,
      source: 'close'
    };
    
    updateStrategy({
      indicators: [...strategy.indicators, newIndicator]
    });
  }, [strategy.indicators, updateStrategy]);

  const updateIndicator = useCallback((index: number, indicator: IndicatorConfig) => {
    const newIndicators = [...strategy.indicators];
    newIndicators[index] = indicator;
    updateStrategy({ indicators: newIndicators });
  }, [strategy.indicators, updateStrategy]);

  const removeIndicator = useCallback((index: number) => {
    const newIndicators = strategy.indicators.filter((_, i) => i !== index);
    updateStrategy({ indicators: newIndicators });
  }, [strategy.indicators, updateStrategy]);

  const addEntrySignal = useCallback(() => {
    const newSignal: EntrySignal = {
      id: `entry_${Date.now()}`,
      name: 'New Entry Signal',
      conditions: [],
      side: 'long',
      orderType: 'market',
      executeOn: 'bar_close'
    };
    
    updateStrategy({
      entrySignals: [...strategy.entrySignals, newSignal]
    });
  }, [strategy.entrySignals, updateStrategy]);

  const updateEntrySignal = useCallback((index: number, signal: EntrySignal) => {
    const newSignals = [...strategy.entrySignals];
    newSignals[index] = signal;
    updateStrategy({ entrySignals: newSignals });
  }, [strategy.entrySignals, updateStrategy]);

  const addExitSignal = useCallback(() => {
    const newSignal: ExitSignal = {
      id: `exit_${Date.now()}`,
      name: 'New Exit Signal',
      conditions: [],
      exitType: 'market',
      executeOn: 'bar_close'
    };
    
    updateStrategy({
      exitSignals: [...strategy.exitSignals, newSignal]
    });
  }, [strategy.exitSignals, updateStrategy]);

  const saveStrategy = useCallback(() => {
    if (validation?.isValid) {
      onStrategyCreated?.(strategy);
    }
  }, [strategy, validation, onStrategyCreated]);

  return (
    <div className="strategy-builder max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Strategy Builder</h1>
        <p className="text-gray-600">Create sophisticated trading strategies without coding</p>
        
        {/* Validation Status */}
        {validation && (
          <div className={`mt-4 p-3 rounded-md ${
            validation.isValid 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full mr-2 ${
                validation.isValid ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className={`font-medium ${
                validation.isValid ? 'text-green-800' : 'text-red-800'
              }`}>
                {validation.isValid ? 'Strategy is valid' : `${validation.errors.length} error(s) found`}
              </span>
              <span className="ml-4 text-sm text-gray-600">
                Completeness: {Math.round(validation.completeness.score * 100)}%
              </span>
            </div>
            
            {validation.errors.length > 0 && (
              <div className="mt-2">
                {validation.errors.slice(0, 3).map((error, idx) => (
                  <div key={idx} className="text-sm text-red-700">
                    • {error.message}
                  </div>
                ))}
                {validation.errors.length > 3 && (
                  <div className="text-sm text-red-600">
                    ... and {validation.errors.length - 3} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'general', label: 'General', icon: '⚙️' },
            { id: 'indicators', label: 'Indicators', icon: '📊' },
            { id: 'entry', label: 'Entry Signals', icon: '🟢' },
            { id: 'exit', label: 'Exit Signals', icon: '🔴' },
            { id: 'risk', label: 'Risk Management', icon: '🛡️' },
            { id: 'preview', label: 'Preview', icon: '👁️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {activeTab === 'general' && (
          <GeneralSettingsTab 
            strategy={strategy} 
            onUpdate={updateStrategy}
            templates={templates}
          />
        )}
        
        {activeTab === 'indicators' && (
          <IndicatorsTab
            indicators={strategy.indicators}
            onAdd={addIndicator}
            onUpdate={updateIndicator}
            onRemove={removeIndicator}
          />
        )}
        
        {activeTab === 'entry' && (
          <EntrySignalsTab
            signals={strategy.entrySignals}
            indicators={strategy.indicators}
            onAdd={addEntrySignal}
            onUpdate={updateEntrySignal}
          />
        )}
        
        {activeTab === 'exit' && (
          <ExitSignalsTab
            signals={strategy.exitSignals}
            indicators={strategy.indicators}
            onAdd={addExitSignal}
            onUpdate={(index, signal) => {
              const newSignals = [...strategy.exitSignals];
              newSignals[index] = signal;
              updateStrategy({ exitSignals: newSignals });
            }}
          />
        )}
        
        {activeTab === 'risk' && (
          <RiskManagementTab
            riskManagement={strategy.riskManagement}
            onUpdate={(rm) => updateStrategy({ riskManagement: rm })}
          />
        )}
        
        {activeTab === 'preview' && (
          <PreviewTab strategy={strategy} validation={validation} />
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-8 flex justify-between items-center pt-6 border-t border-gray-200">
        <div className="flex space-x-3">
          <button
            onClick={() => {
              const exported = JSON.stringify(strategy, null, 2);
              navigator.clipboard.writeText(exported);
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            📋 Copy JSON
          </button>
          
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(strategy, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${strategy.name || 'strategy'}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            💾 Download
          </button>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={() => setStrategy({
              id: '',
              name: '',
              version: '1.0.0',
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
              settings: {
                timeframe: '1h',
                allowLong: true,
                allowShort: true,
                allowMultiplePositions: false
              },
              indicators: [],
              riskManagement: {
                positionSizing: {
                  type: 'fixed_percentage',
                  fixedPercentage: 10
                }
              },
              entrySignals: [],
              exitSignals: []
            })}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            🔄 Reset
          </button>
          
          <button
            onClick={saveStrategy}
            disabled={!validation?.isValid}
            className={`px-6 py-2 text-sm font-medium rounded-md ${
              validation?.isValid
                ? 'text-white bg-blue-600 hover:bg-blue-700'
                : 'text-gray-400 bg-gray-200 cursor-not-allowed'
            }`}
          >
            ✅ Create Strategy
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * General Settings Tab
 */
const GeneralSettingsTab: React.FC<{
  strategy: DeclarativeStrategy;
  onUpdate: (updates: Partial<DeclarativeStrategy>) => void;
  templates: StrategyTemplate[];
}> = ({ strategy, onUpdate, templates }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Strategy Name *
            </label>
            <input
              type="text"
              value={strategy.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Trading Strategy"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={strategy.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief description of the strategy..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version
            </label>
            <input
              type="text"
              value={strategy.version}
              onChange={(e) => onUpdate({ version: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1.0.0"
            />
          </div>
        </div>
        
        {/* Strategy Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Strategy Settings</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timeframe
            </label>
            <select
              value={strategy.settings.timeframe}
              onChange={(e) => onUpdate({ 
                settings: { ...strategy.settings, timeframe: e.target.value }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1m">1 Minute</option>
              <option value="5m">5 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="1h">1 Hour</option>
              <option value="4h">4 Hours</option>
              <option value="1d">1 Day</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={strategy.settings.allowLong ?? true}
                onChange={(e) => onUpdate({
                  settings: { ...strategy.settings, allowLong: e.target.checked }
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Allow Long Positions</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={strategy.settings.allowShort ?? true}
                onChange={(e) => onUpdate({
                  settings: { ...strategy.settings, allowShort: e.target.checked }
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Allow Short Positions</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={strategy.settings.allowMultiplePositions ?? false}
                onChange={(e) => onUpdate({
                  settings: { ...strategy.settings, allowMultiplePositions: e.target.checked }
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Allow Multiple Positions</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Templates */}
      {templates.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Strategy Templates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(template => (
              <div
                key={template.id}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer"
                onClick={() => {
                  if (template.template) {
                    onUpdate(template.template);
                  }
                }}
              >
                <h4 className="font-medium text-gray-900">{template.name}</h4>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`px-2 py-1 text-xs rounded ${
                    template.difficulty === 'beginner' ? 'bg-green-100 text-green-800' :
                    template.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {template.difficulty}
                  </span>
                  <span className="text-xs text-gray-500">{template.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Indicators Tab
 */
const IndicatorsTab: React.FC<{
  indicators: IndicatorConfig[];
  onAdd: () => void;
  onUpdate: (index: number, indicator: IndicatorConfig) => void;
  onRemove: (index: number) => void;
}> = ({ indicators, onAdd, onUpdate, onRemove }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Technical Indicators</h3>
        <button
          onClick={onAdd}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          + Add Indicator
        </button>
      </div>
      
      {indicators.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-4">📊</div>
          <p>No indicators added yet.</p>
          <p className="text-sm">Add indicators to use in your strategy conditions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {indicators.map((indicator, index) => (
            <IndicatorBuilder
              key={indicator.id}
              indicator={indicator}
              onChange={(updated) => onUpdate(index, updated)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Individual Indicator Builder
 */
const IndicatorBuilder: React.FC<{
  indicator: IndicatorConfig;
  onChange: (indicator: IndicatorConfig) => void;
  onRemove: () => void;
}> = ({ indicator, onChange, onRemove }) => {
  const indicatorTypes: { value: IndicatorType; label: string }[] = [
    { value: 'SMA', label: 'Simple Moving Average' },
    { value: 'EMA', label: 'Exponential Moving Average' },
    { value: 'RSI', label: 'Relative Strength Index' },
    { value: 'MACD', label: 'MACD' },
    { value: 'BB', label: 'Bollinger Bands' },
    { value: 'ATR', label: 'Average True Range' },
    { value: 'STOCH', label: 'Stochastic' },
    { value: 'ADX', label: 'ADX' },
    { value: 'CCI', label: 'Commodity Channel Index' },
    { value: 'ROC', label: 'Rate of Change' }
  ];

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={indicator.name}
              onChange={(e) => onChange({ ...indicator, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              value={indicator.type}
              onChange={(e) => onChange({ ...indicator, type: e.target.value as IndicatorType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {indicatorTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period
            </label>
            <input
              type="number"
              value={indicator.period || 14}
              onChange={(e) => onChange({ ...indicator, period: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              max="200"
            />
          </div>
        </div>
        
        <button
          onClick={onRemove}
          className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-md"
          title="Remove indicator"
        >
          🗑️
        </button>
      </div>
      
      {/* Type-specific parameters */}
      {indicator.type === 'RSI' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Overbought Level
            </label>
            <input
              type="number"
              value={indicator.overbought || 70}
              onChange={(e) => onChange({ ...indicator, overbought: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="50"
              max="100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Oversold Level
            </label>
            <input
              type="number"
              value={indicator.oversold || 30}
              onChange={(e) => onChange({ ...indicator, oversold: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              max="50"
            />
          </div>
        </div>
      )}
      
      {indicator.type === 'BB' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Standard Deviations
          </label>
          <input
            type="number"
            value={indicator.standardDeviations || 2}
            onChange={(e) => onChange({ ...indicator, standardDeviations: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="0.5"
            max="5"
            step="0.1"
          />
        </div>
      )}
    </div>
  );
};

const EntrySignalsTab: React.FC<any> = ({ signals, indicators, onAdd, onUpdate }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-medium text-gray-900">Entry Signals</h3>
      <button
        onClick={onAdd}
        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
      >
        + Add Entry Signal
      </button>
    </div>
    
    {signals.length === 0 ? (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-4">🟢</div>
        <p>No entry signals defined yet.</p>
      </div>
    ) : (
      <div className="space-y-4">
        {signals.map((signal: EntrySignal, index: number) => (
          <div key={signal.id} className="p-4 border border-gray-200 rounded-lg">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input
                value={signal.name}
                onChange={(e) => onUpdate(index, { ...signal, name: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Signal Name"
              />
              <select
                value={signal.side}
                onChange={(e) => onUpdate(index, { ...signal, side: e.target.value as any })}
                className="px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="text-sm text-gray-600">
              Conditions: {signal.conditions.length} defined
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const ExitSignalsTab: React.FC<any> = ({ signals, indicators, onAdd, onUpdate }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-medium text-gray-900">Exit Signals</h3>
      <button
        onClick={onAdd}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
      >
        + Add Exit Signal
      </button>
    </div>
    
    {signals.length === 0 ? (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-4">🔴</div>
        <p>No exit signals defined yet.</p>
      </div>
    ) : (
      <div className="space-y-4">
        {signals.map((signal: ExitSignal, index: number) => (
          <div key={signal.id} className="p-4 border border-gray-200 rounded-lg">
            <input
              value={signal.name}
              onChange={(e) => onUpdate(index, { ...signal, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
              placeholder="Exit Signal Name"
            />
            <div className="text-sm text-gray-600">
              Conditions: {signal.conditions.length} defined
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const RiskManagementTab: React.FC<any> = ({ riskManagement, onUpdate }) => (
  <div className="space-y-6">
    <h3 className="text-lg font-medium text-gray-900">Risk Management</h3>
    
    <div className="grid grid-cols-2 gap-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Position Sizing Type</label>
        <select
          value={riskManagement.positionSizing.type}
          onChange={(e) => onUpdate({
            ...riskManagement,
            positionSizing: { ...riskManagement.positionSizing, type: e.target.value }
          })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="fixed_amount">Fixed Amount</option>
          <option value="fixed_percentage">Fixed Percentage</option>
          <option value="risk_based">Risk Based</option>
          <option value="kelly_criterion">Kelly Criterion</option>
        </select>
      </div>
      
      {riskManagement.positionSizing.type === 'fixed_percentage' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Percentage (%)</label>
          <input
            type="number"
            value={riskManagement.positionSizing.fixedPercentage || 10}
            onChange={(e) => onUpdate({
              ...riskManagement,
              positionSizing: { 
                ...riskManagement.positionSizing, 
                fixedPercentage: parseFloat(e.target.value) 
              }
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            min="0.1"
            max="100"
            step="0.1"
          />
        </div>
      )}
    </div>
  </div>
);

const PreviewTab: React.FC<any> = ({ strategy, validation }) => (
  <div className="space-y-6">
    <h3 className="text-lg font-medium text-gray-900">Strategy Preview</h3>
    
    <div className="bg-gray-50 p-4 rounded-lg">
      <h4 className="font-medium mb-2">Strategy Summary</h4>
      <ul className="space-y-1 text-sm text-gray-600">
        <li>• Name: {strategy.name || 'Unnamed Strategy'}</li>
        <li>• Timeframe: {strategy.settings.timeframe}</li>
        <li>• Indicators: {strategy.indicators.length} configured</li>
        <li>• Entry Signals: {strategy.entrySignals.length} defined</li>
        <li>• Exit Signals: {strategy.exitSignals.length} defined</li>
        <li>• Position Sizing: {strategy.riskManagement.positionSizing.type}</li>
      </ul>
    </div>
    
    <div>
      <h4 className="font-medium mb-2">JSON Preview</h4>
      <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto max-h-96">
        {JSON.stringify(strategy, null, 2)}
      </pre>
    </div>
  </div>
);

export default StrategyBuilder; 