'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StrategyForm from '@/components/strategies/StrategyForm';

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

export default function EditStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>('');
  
  useEffect(() => {
    params.then(({ id }) => setId(id));
  }, [params]);
  
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
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
          href={`/strategies/${id}`}
          className="text-blue-600 hover:underline"
        >
          &larr; Back to Strategy Details
        </Link>
      </div>
      
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Edit Strategy: {strategy.name}</h1>
        <div className="bg-white shadow rounded-lg p-6">
          <StrategyForm initialData={strategy} />
        </div>
      </div>
    </div>
  );
} 