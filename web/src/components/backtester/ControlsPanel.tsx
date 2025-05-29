import React, { useState } from 'react';
import { PlaybackSpeed, BarFormationMode } from '@/lib/types/backtester';

interface ControlsPanelProps {
  onLoadData: (params: { contractId: string; timeframe: string; limit: number }) => void;
  isLoading: boolean;
  // Playback controls
  currentBarIndex: number;
  currentSubBarIndex: number;
  totalBars: number;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  barFormationMode: BarFormationMode;
  onNextBar: () => void;
  onPreviousBar: () => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onReset: () => void;
  onBarFormationModeChange: (mode: BarFormationMode) => void;
}

const availableTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

const speedOptions = [
  { label: 'Very Slow', value: PlaybackSpeed.VERY_SLOW },
  { label: 'Slow', value: PlaybackSpeed.SLOW },
  { label: 'Normal', value: PlaybackSpeed.NORMAL },
  { label: 'Fast', value: PlaybackSpeed.FAST },
  { label: 'Very Fast', value: PlaybackSpeed.VERY_FAST },
];

const ControlsPanel: React.FC<ControlsPanelProps> = ({ 
  onLoadData, 
  isLoading,
  currentBarIndex,
  currentSubBarIndex,
  totalBars,
  isPlaying,
  playbackSpeed,
  barFormationMode,
  onNextBar,
  onPreviousBar,
  onPlayPause,
  onSpeedChange,
  onReset,
  onBarFormationModeChange,
}) => {
  const [contractId, setContractId] = useState<string>('CON.F.US.MES.M25');
  const [timeframe, setTimeframe] = useState<string>(availableTimeframes[4]); // Default to 1h
  const [limit, setLimit] = useState<number>(500);

  const handleLoadClick = () => {
    onLoadData({ contractId, timeframe, limit });
  };

  const progressPercentage = totalBars > 0 ? ((currentBarIndex + 1) / totalBars) * 100 : 0;

  // Display text for current position based on mode
  const getPositionText = () => {
    if (barFormationMode === BarFormationMode.PROGRESSIVE && currentSubBarIndex > 0) {
      return `Bar ${currentBarIndex + 1} of ${totalBars} (forming: ${currentSubBarIndex + 1})`;
    }
    return `Bar ${currentBarIndex + 1} of ${totalBars}`;
  };

  return (
    <div className="bg-gray-100 p-4 rounded-lg shadow-md my-4">
      <h2 className="text-xl font-semibold mb-3 text-gray-700">Controls</h2>
      
      {/* Data Loading Section */}
      <div className="space-y-4 mb-6">
        <div>
          <label htmlFor="contractId" className="block text-sm font-medium text-gray-700">
            Contract ID
          </label>
          <input
            type="text"
            name="contractId"
            id="contractId"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="e.g., CON.F.US.ES.M25"
          />
        </div>

        <div>
          <label htmlFor="timeframe" className="block text-sm font-medium text-gray-700">
            Timeframe
          </label>
          <select
            id="timeframe"
            name="timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {availableTimeframes.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="limit" className="block text-sm font-medium text-gray-700">
            Data Points Limit
          </label>
          <input
            type="number"
            name="limit"
            id="limit"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>

        <button 
          onClick={handleLoadClick}
          disabled={isLoading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
        >
          {isLoading ? 'Loading...' : 'Load Data'}
        </button>
      </div>

      {/* Playback Controls Section */}
      {totalBars > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Playback</h3>
          
          {/* Bar Formation Mode */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bar Formation Mode
            </label>
            <div className="flex space-x-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  value={BarFormationMode.INSTANT}
                  checked={barFormationMode === BarFormationMode.INSTANT}
                  onChange={(e) => onBarFormationModeChange(e.target.value as BarFormationMode)}
                  className="mr-2"
                />
                <span className="text-sm">Instant</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value={BarFormationMode.PROGRESSIVE}
                  checked={barFormationMode === BarFormationMode.PROGRESSIVE}
                  onChange={(e) => onBarFormationModeChange(e.target.value as BarFormationMode)}
                  className="mr-2"
                />
                <span className="text-sm">Progressive</span>
              </label>
            </div>
            {barFormationMode === BarFormationMode.PROGRESSIVE && (
              <p className="text-xs text-gray-500 mt-1">
                Shows bars forming progressively using lower timeframe data
              </p>
            )}
          </div>
          
          {/* Position Indicator */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{getPositionText()}</span>
              <span>{progressPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-200" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex space-x-2 mb-4">
            <button
              onClick={onReset}
              disabled={isPlaying}
              className="px-3 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded disabled:bg-gray-300"
              title="Reset to beginning"
            >
              ⏮
            </button>
            <button
              onClick={onPreviousBar}
              disabled={isPlaying || (currentBarIndex === 0 && currentSubBarIndex === 0)}
              className="px-3 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded disabled:bg-gray-300"
              title="Previous bar/step"
            >
              ⏪
            </button>
            <button
              onClick={onPlayPause}
              disabled={totalBars === 0}
              className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded disabled:bg-gray-300"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? '⏸' : '▶️'}
            </button>
            <button
              onClick={onNextBar}
              disabled={isPlaying || currentBarIndex >= totalBars - 1}
              className="px-3 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded disabled:bg-gray-300"
              title="Next bar/step"
            >
              ⏩
            </button>
          </div>

          {/* Speed Control */}
          <div>
            <label htmlFor="playbackSpeed" className="block text-sm font-medium text-gray-700 mb-1">
              Playback Speed
            </label>
            <select
              id="playbackSpeed"
              value={playbackSpeed}
              onChange={(e) => onSpeedChange(parseInt(e.target.value) as PlaybackSpeed)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              {speedOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.value}ms)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlsPanel; 