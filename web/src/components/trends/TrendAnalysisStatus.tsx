'use client';

import { useEffect, useState } from 'react';

interface TrendAnalysisStatusProps {
    contractId: string;
    timeframe: string;
}

interface StatusData {
    latest_bar_timestamp: string | null;
    last_processed_timestamp: string | null;
}

export function TrendAnalysisStatus({ contractId, timeframe }: TrendAnalysisStatusProps) {
    const [status, setStatus] = useState<StatusData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!contractId || !timeframe) {
            return;
        }

        const fetchStatus = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/trend-analysis/status?contract_id=${contractId}&timeframe=${timeframe}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch status');
                }
                const data: StatusData = await response.json();
                setStatus(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchStatus();
    }, [contractId, timeframe]);

    const renderTimestamp = (timestamp: string | null) => {
        if (!timestamp) return <span className="text-gray-500">Not available</span>;
        const date = new Date(timestamp);
        return (
            <span className="font-mono" title={date.toLocaleString()}>
                {date.toLocaleTimeString()} <span className="text-gray-400 text-xs">{date.toLocaleDateString()}</span>
            </span>
        );
    };
    
    const getStatusColor = () => {
        if (!status || !status.latest_bar_timestamp || !status.last_processed_timestamp) {
            return 'bg-gray-700'; // Neutral
        }
        const lag = new Date(status.latest_bar_timestamp).getTime() - new Date(status.last_processed_timestamp).getTime();
        const lagInMinutes = lag / (1000 * 60);

        if (lagInMinutes > 60) return 'bg-red-500'; // Lagging > 1h
        if (lagInMinutes > 15) return 'bg-yellow-500'; // Lagging > 15m
        return 'bg-green-500'; // Up to date
    };

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-3 my-4 text-sm">
            <h3 className="font-semibold text-white mb-2 flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${isLoading ? 'bg-gray-500 animate-pulse' : getStatusColor()}`} title="Analysis Status"></div>
                Analyzer Status
            </h3>
            {isLoading ? (
                <div className="text-gray-400">Loading status...</div>
            ) : error ? (
                <div className="text-red-400">Error: {error}</div>
            ) : status ? (
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                    <div className="font-medium">Latest Bar in DB:</div>
                    <div>{renderTimestamp(status.latest_bar_timestamp)}</div>
                    
                    <div className="font-medium">Analyzer Watermark:</div>
                    <div>{renderTimestamp(status.last_processed_timestamp)}</div>
                </div>
            ) : null}
        </div>
    );
} 