'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface StrategyFormData {
  name: string;
  status: 'active' | 'paused' | 'stopped';
  timeframes: {
    primary: TimeFrame;
    secondary?: TimeFrame;
  };
  riskSettings: {
    positionSize: number;
    maxLoss: number;
    dailyLossLimit: number;
    maxPositions: number;
  };
}

interface StrategyFormProps {
  initialData?: StrategyFormData & { id?: string };
}

export default function StrategyForm({ initialData }: StrategyFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<StrategyFormData>({
    name: initialData?.name || '',
    status: initialData?.status || 'paused',
    timeframes: {
      primary: initialData?.timeframes?.primary || '1h',
      secondary: initialData?.timeframes?.secondary,
    },
    riskSettings: {
      positionSize: initialData?.riskSettings?.positionSize || 1,
      maxLoss: initialData?.riskSettings?.maxLoss || 100,
      dailyLossLimit: initialData?.riskSettings?.dailyLossLimit || 300,
      maxPositions: initialData?.riskSettings?.maxPositions || 1,
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [section, field] = name.split('.');
      
      if (section === 'timeframes') {
        setFormData(prev => ({
          ...prev,
          timeframes: {
            ...prev.timeframes,
            [field]: value || undefined
          }
        }));
      } else if (section === 'riskSettings') {
        setFormData(prev => ({
          ...prev,
          riskSettings: {
            ...prev.riskSettings,
            [field]: Number(value)
          }
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const url = initialData?.id 
        ? `/api/strategies/${initialData.id}`
        : '/api/strategies';
      
      const method = initialData?.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save strategy');
      }

      router.push('/strategies');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const timeframeOptions: TimeFrame[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Strategy Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">
          Status
        </label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="paused">Paused</option>
          <option value="active">Active</option>
          <option value="stopped">Stopped</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="timeframes.primary" className="block text-sm font-medium text-gray-700">
            Primary Timeframe
          </label>
          <select
            id="timeframes.primary"
            name="timeframes.primary"
            value={formData.timeframes.primary}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            {timeframeOptions.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="timeframes.secondary" className="block text-sm font-medium text-gray-700">
            Secondary Timeframe (Optional)
          </label>
          <select
            id="timeframes.secondary"
            name="timeframes.secondary"
            value={formData.timeframes.secondary || ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="">None</option>
            {timeframeOptions.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="text-base font-medium text-gray-900">Risk Settings</legend>
        <div className="mt-4 grid grid-cols-1 gap-y-4 gap-x-6 sm:grid-cols-2">
          <div>
            <label htmlFor="riskSettings.positionSize" className="block text-sm font-medium text-gray-700">
              Position Size
            </label>
            <input
              type="number"
              id="riskSettings.positionSize"
              name="riskSettings.positionSize"
              min="1"
              step="1"
              required
              value={formData.riskSettings.positionSize}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="riskSettings.maxLoss" className="block text-sm font-medium text-gray-700">
              Max Loss ($)
            </label>
            <input
              type="number"
              id="riskSettings.maxLoss"
              name="riskSettings.maxLoss"
              min="0"
              required
              value={formData.riskSettings.maxLoss}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="riskSettings.dailyLossLimit" className="block text-sm font-medium text-gray-700">
              Daily Loss Limit ($)
            </label>
            <input
              type="number"
              id="riskSettings.dailyLossLimit"
              name="riskSettings.dailyLossLimit"
              min="0"
              required
              value={formData.riskSettings.dailyLossLimit}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="riskSettings.maxPositions" className="block text-sm font-medium text-gray-700">
              Max Concurrent Positions
            </label>
            <input
              type="number"
              id="riskSettings.maxPositions"
              name="riskSettings.maxPositions"
              min="1"
              step="1"
              required
              value={formData.riskSettings.maxPositions}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : initialData?.id ? 'Update Strategy' : 'Create Strategy'}
        </button>
      </div>
    </form>
  );
} 