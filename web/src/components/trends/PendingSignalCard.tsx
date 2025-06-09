'use client';

interface Bar {
    index: number;
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface PendingSignalInfo {
    bar: Bar | null;
    anchor_bar: Bar | null;
}

interface PendingSignalCardProps {
    type: 'PUS' | 'PDS';
    signalInfo: PendingSignalInfo | undefined;
}

function BarDetails({ bar, label }: { bar: Bar | null, label: string }) {
    if (!bar) return null;
    return (
        <div className="text-xs">
            <span className="font-semibold">{label} Bar #{bar.index}:</span>
            <span className="font-mono ml-2">
                T: {new Date(bar.timestamp).toLocaleTimeString()} O:{bar.open.toFixed(2)} H:{bar.high.toFixed(2)} L:{bar.low.toFixed(2)} C:{bar.close.toFixed(2)}
            </span>
        </div>
    );
}

export function PendingSignalCard({ type, signalInfo }: PendingSignalCardProps) {
    if (!signalInfo || !signalInfo.bar) {
        return (
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3">
                <h4 className={`font-semibold ${type === 'PUS' ? 'text-green-400' : 'text-red-400'}`}>
                    Pending {type === 'PUS' ? 'Uptrend' : 'Downtrend'} Signal
                </h4>
                <p className="text-gray-500 text-sm mt-2">No active candidate.</p>
            </div>
        );
    }

    const cardColor = type === 'PUS' ? 'border-green-600/50' : 'border-red-600/50';
    const textColor = type === 'PUS' ? 'text-green-400' : 'text-red-400';

    return (
        <div className={`flex-1 bg-gray-800/80 border ${cardColor} rounded-lg p-3`}>
            <h4 className={`font-semibold ${textColor}`}>
                Pending {type === 'PUS' ? 'Uptrend' : 'Downtrend'} Signal (Candidate)
            </h4>
            <div className="mt-2 space-y-1 text-gray-300">
                <BarDetails bar={signalInfo.bar} label="Candidate" />
                <BarDetails bar={signalInfo.anchor_bar} label="Anchor" />
            </div>
        </div>
    );
} 