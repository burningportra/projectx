import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// process.cwd() in Next.js is the 'web' directory, so we go up one level to project root
const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const LIVE_STATE_FILE_PATH = path.join(PROJECT_ROOT, 'logs', 'analyzer_live_state.json');

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe');
    const contract_id = searchParams.get('contract_id');

    if (!timeframe || !contract_id) {
        return NextResponse.json({ error: 'timeframe and contract_id query parameters are required' }, { status: 400 });
    }

    try {
        const fileContent = await fs.readFile(LIVE_STATE_FILE_PATH, 'utf-8');
        const liveStateData = JSON.parse(fileContent);

        const contractData = liveStateData[contract_id];
        if (!contractData) {
            return NextResponse.json({ error: 'No live state data found for the specified contract' }, { status: 404 });
        }

        const timeframeData = contractData[timeframe];
        if (!timeframeData) {
            return NextResponse.json({ error: 'No live state data found for the specified timeframe' }, { status: 404 });
        }

        return NextResponse.json(timeframeData, { status: 200 });

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return NextResponse.json({ error: 'Live state file not found. The analyzer may not have run yet.' }, { status: 404 });
        }
        console.error('Error fetching live analyzer state:', error);
        return NextResponse.json({ error: 'Failed to fetch live analyzer state.', details: error.message }, { status: 500 });
    }
} 