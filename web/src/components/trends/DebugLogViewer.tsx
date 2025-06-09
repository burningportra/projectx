'use client';

interface DebugLog {
    event_timestamp: string;
    message: string;
    processing_bar_index: number;
}

interface DebugLogViewerProps {
    logs: DebugLog[] | undefined;
    isLoading: boolean;
    error: string | null;
}

export function DebugLogViewer({ logs, isLoading, error }: DebugLogViewerProps) {
    if (isLoading) {
        return <div className="text-gray-400">Loading debug logs...</div>;
    }

    if (error) {
        return <div className="text-red-400">Error loading logs: {error}</div>;
    }

    if (!logs || logs.length === 0) {
        return <p className="text-gray-500">No debug logs available for this run.</p>;
    }

    return (
        <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-4 mt-4 h-64 overflow-y-auto font-mono text-xs">
            <h4 className="font-semibold text-white mb-2 sticky top-0 bg-gray-900/80 pb-2">Live Debug Log</h4>
            <div className="space-y-1">
                {logs.map((log, index) => (
                    <div key={index} className="flex items-start">
                        <span className="text-gray-500 mr-2">[{new Date(log.event_timestamp).toLocaleTimeString()}]</span>
                        <span className="text-cyan-400 mr-2">Bar {log.processing_bar_index}:</span>
                        <span className="text-gray-300 flex-1">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
} 