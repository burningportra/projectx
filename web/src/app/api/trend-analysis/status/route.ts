import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseTimeframeString } from '@/lib/time'; // Assuming you have this utility

// Helper to get the latest bar timestamp from OHLC data
async function getLatestBarTimestamp(contractId: string, timeframe: string): Promise<Date | null> {
    const tf = parseTimeframeString(timeframe);
    if (!tf) {
        return null;
    }

    const result = await prisma.ohlcBar.findFirst({
        where: {
            contractId: contractId,
            timeframeUnit: tf.unit,
            timeframeValue: tf.value,
        },
        orderBy: {
            timestamp: 'desc',
        },
        select: {
            timestamp: true,
        },
    });
    return result?.timestamp || null;
}

// Helper to get the last processed watermark for an analyzer
async function getAnalyzerWatermark(analyzerId: string, contractId: string, timeframe: string): Promise<Date | null> {
    const result = await prisma.analyzerWatermark.findUnique({
        where: {
            analyzerId_contractId_timeframe: {
                analyzerId,
                contractId,
                timeframe,
            },
        },
        select: {
            lastProcessedTimestamp: true,
        },
    });
    return result?.lastProcessedTimestamp || null;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe');
    const contractId = searchParams.get('contract_id');
    const analyzerId = searchParams.get('analyzer_id') || 'cus_cds_trend_finder'; // Default analyzer

    if (!timeframe || !contractId) {
        return NextResponse.json({ error: 'timeframe and contract_id query parameters are required' }, { status: 400 });
    }

    try {
        const [latestBarTimestamp, lastProcessedTimestamp] = await Promise.all([
            getLatestBarTimestamp(contractId, timeframe),
            getAnalyzerWatermark(analyzerId, contractId, timeframe),
        ]);

        return NextResponse.json({
            latest_bar_timestamp: latestBarTimestamp?.toISOString() || null,
            last_processed_timestamp: lastProcessedTimestamp?.toISOString() || null,
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching trend analysis status:', error);
        let errorMessage = 'An unexpected error occurred.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ error: 'Failed to fetch trend analysis status.', details: errorMessage }, { status: 500 });
    }
} 