'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface Strategy {
  id: string;
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

export default function StrategyDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    const fetchStrategy = async () => {
      try {
        const response = await fetch(`/api/strategies/${id}`);
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }
        
        const data = await response.json();
        
        // Ensure the timeframes are of the correct type
        const typedStrategy: Strategy = {
          ...data,
          timeframes: {
            primary: data.timeframes?.primary as TimeFrame,
            secondary: data.timeframes?.secondary as TimeFrame | undefined
          }
        };
        
        setStrategy(typedStrategy);
      } catch (err) {
        setError('Failed to load strategy details');
        console.error('Error fetching strategy:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStrategy();
  }, [id]);

  const handleStatusChange = async (action: 'activate' | 'deactivate' | 'emergency-stop') => {
    if (!strategy) return;
    
    setIsActionLoading(true);
    try {
      const response = await fetch(`/api/strategies/${id}/${action}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} strategy`);
      }
      
      const data = await response.json();
      
      // Update strategy status
      setStrategy(prev => {
        if (!prev) return null;
        
        const newStatus = action === 'activate' ? 'active' : 
                         (action === 'deactivate' ? 'paused' : 'stopped');
        
        return {
          ...prev,
          status: newStatus
        };
      });
      
    } catch (err) {
      setError(`Failed to ${action} strategy`);
      console.error(`Error ${action} strategy:`, err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'stopped':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-500">Loading strategy details...</p>
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
          {error || 'Strategy not found'}
        </div>
        <div className="mt-4">
          <Link 
            href="/strategies"
            className="text-blue-600 hover:underline"
          >
            Back to Strategies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link 
          href="/strategies"
          className="text-blue-600 hover:underline"
        >
          &larr; Back to Strategies
        </Link>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{strategy.name}</h1>
        <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getStatusBadgeClass(strategy.status)}`}>
          {strategy.status}
        </span>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-medium">Strategy Details</h2>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Timeframes</h3>
              <p className="mt-1 text-sm text-gray-900">
                Primary: <span className="font-medium">{strategy.timeframes.primary}</span>
                {strategy.timeframes.secondary && (
                  <>, Secondary: <span className="font-medium">{strategy.timeframes.secondary}</span></>
                )}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Status</h3>
              <p className="mt-1 text-sm text-gray-900">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(strategy.status)}`}>
                  {strategy.status}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-medium">Risk Settings</h2>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Position Size</h3>
              <p className="mt-1 text-sm text-gray-900 font-medium">
                {strategy.riskSettings.positionSize}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Max Loss</h3>
              <p className="mt-1 text-sm text-gray-900 font-medium">
                ${strategy.riskSettings.maxLoss}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Daily Loss Limit</h3>
              <p className="mt-1 text-sm text-gray-900 font-medium">
                ${strategy.riskSettings.dailyLossLimit}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Max Concurrent Positions</h3>
              <p className="mt-1 text-sm text-gray-900 font-medium">
                {strategy.riskSettings.maxPositions}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-3 justify-end">
        <Link
          href={`/strategies/${id}/edit`}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Edit Strategy
        </Link>
        
        {strategy.status === 'active' ? (
          <>
            <button
              onClick={() => handleStatusChange('deactivate')}
              disabled={isActionLoading}
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50"
            >
              {isActionLoading ? 'Processing...' : 'Pause Strategy'}
            </button>
            <button
              onClick={() => handleStatusChange('emergency-stop')}
              disabled={isActionLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              {isActionLoading ? 'Processing...' : 'Emergency Stop'}
            </button>
          </>
        ) : (
          <button
            onClick={() => handleStatusChange('activate')}
            disabled={isActionLoading || strategy.status === 'stopped'}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          >
            {isActionLoading ? 'Processing...' : 'Activate Strategy'}
          </button>
        )}
      </div>
    </div>
  );
} 