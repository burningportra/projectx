'use client';

import { useState } from 'react';
import StrategyForm from '@/components/strategies/StrategyForm';

export default function NewStrategyPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Create New Strategy</h1>
        <div className="bg-white shadow rounded-lg p-6">
          <StrategyForm />
        </div>
      </div>
    </div>
  );
} 