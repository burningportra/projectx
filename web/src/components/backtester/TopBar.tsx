import React, { useState } from 'react';
import { PlaybackSpeed, BarFormationMode } from '@/lib/types/backtester';

interface TopBarProps {
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
  { label: '1x', value: PlaybackSpeed.NORMAL },
  { label: '2x', value: PlaybackSpeed.FAST_2X },
  { label: '4x', value: PlaybackSpeed.FAST_4X },
  { label: '8x', value: PlaybackSpeed.FAST_8X },
  { label: '16x', value: PlaybackSpeed.FAST_16X },
  { label: '32x', value: PlaybackSpeed.VERY_FAST_32X },
  { label: '64x', value: PlaybackSpeed.INSANE_64X },
];

const TopBar: React.FC<TopBarProps> = ({ 
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
    <div className="bg-white border border-gray-200 rounded-lg px-6 py-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-6">
        {/* Data Loading Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Contract:</label>
            <input
              type="text"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm w-40"
              placeholder="e.g., CON.F.US.ES.M25"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Timeframe:</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              {availableTimeframes.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Limit:</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              className="px-3 py-1 border border-gray-300 rounded text-sm w-20"
            />
          </div>

          <button 
            onClick={handleLoadClick}
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1 px-4 rounded text-sm disabled:bg-gray-400"
          >
            {isLoading ? 'Loading...' : 'Load Data'}
          </button>
        </div>

        {/* Separator */}
        {totalBars > 0 && <div className="w-px h-8 bg-gray-300"></div>}

        {/* Playback Controls Section */}
        {totalBars > 0 && (
          <>
            {/* Bar Formation Mode */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Mode:</label>
              <div className="flex gap-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value={BarFormationMode.INSTANT}
                    checked={barFormationMode === BarFormationMode.INSTANT}
                    onChange={(e) => onBarFormationModeChange(e.target.value as BarFormationMode)}
                    className="mr-1"
                  />
                  <span className="text-sm">Instant</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value={BarFormationMode.PROGRESSIVE}
                    checked={barFormationMode === BarFormationMode.PROGRESSIVE}
                    onChange={(e) => onBarFormationModeChange(e.target.value as BarFormationMode)}
                    className="mr-1"
                  />
                  <span className="text-sm">Progressive</span>
                </label>
              </div>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={onReset}
                disabled={isPlaying}
                className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded disabled:bg-gray-300"
                title="Reset to beginning"
              >
                ⏮
              </button>
              <button
                onClick={onPreviousBar}
                disabled={isPlaying || (currentBarIndex === 0 && currentSubBarIndex === 0)}
                className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded disabled:bg-gray-300"
                title="Previous bar/step"
              >
                ⏪
              </button>
              <button
                onClick={onPlayPause}
                disabled={totalBars === 0}
                className="px-4 py-1 text-sm bg-green-500 hover:bg-green-600 text-white rounded disabled:bg-gray-300"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? '⏸' : '▶️'}
              </button>
              <button
                onClick={onNextBar}
                disabled={isPlaying || currentBarIndex >= totalBars - 1}
                className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded disabled:bg-gray-300"
                title="Next bar/step"
              >
                ⏩
              </button>
            </div>

            {/* Speed Control */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Speed:</label>
              <select 
                value={playbackSpeed}
                onChange={(e) => onSpeedChange(parseInt(e.target.value) as PlaybackSpeed)}
                className={`px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  playbackSpeed <= PlaybackSpeed.FAST_4X ? 'bg-white' : 
                  playbackSpeed <= PlaybackSpeed.FAST_16X ? 'bg-yellow-50 border-yellow-300' : 
                  'bg-red-50 border-red-300 text-red-700 font-semibold'
                }`}
              >
                {speedOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress Info */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-600">{getPositionText()}</span>
              <span className="text-sm font-medium text-gray-700">({progressPercentage.toFixed(1)}%)</span>
            </div>
          </>
        )}
      </div>

      {/* Progress Bar */}
      {totalBars > 0 && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div 
              className="bg-indigo-600 h-1 rounded-full transition-all duration-200" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopBar; 