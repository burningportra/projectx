import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { OhlcBar } from '@/lib/prisma';

// Utility to map timeframe string to database values
function parseTimeframe(timeframe: string): { timeframeUnit: number; timeframeValue: number } {
  const timeframeUnit = timeframe.slice(-1);
  const timeframeValue = parseInt(timeframe.slice(0, -1), 10);
  
  // Map timeframe units to database values
  let timeframeUnitValue = 2; // Default to minutes
  switch (timeframeUnit) {
    case 's': timeframeUnitValue = 1; break; // seconds
    case 'm': timeframeUnitValue = 2; break; // minutes
    case 'h': timeframeUnitValue = 3; break; // hours
    case 'd': timeframeUnitValue = 4; break; // days
    case 'w': timeframeUnitValue = 5; break; // weeks
    case 'M': timeframeUnitValue = 6; break; // months
  }
  
  return { timeframeUnit: timeframeUnitValue, timeframeValue };
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const contract = searchParams.get('contract') || 'ES';
    const timeframe = searchParams.get('timeframe') || '5m';
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const since = searchParams.get('since');
    
    // Parse timeframe string to get unit and value
    const { timeframeUnit, timeframeValue } = parseTimeframe(timeframe);
    
    console.log(`Fetching bars for ${contract} with timeframe ${timeframe}`);
    if (since) {
      console.log(`...since timestamp ${since}`);
    } else {
      console.log(`...with a limit of ${limit} bars`);
    }
    
    // Map the contract symbol to the actual contract ID format
    let contractId = contract;
    if (!contract.startsWith('CON.')) {
      // Mapping common symbols to full contract IDs
      // Adjust this mapping based on your actual contract ID format
      const contractMap: Record<string, string> = {
        'ES': 'CON.F.US.ES',
        'NQ': 'CON.F.US.NQ',
        'RTY': 'CON.F.US.RTY',
        'MES': 'CON.F.US.MES',
        'AAPL': 'CON.S.US.AAPL',
        'MSFT': 'CON.S.US.MSFT'
      };
      contractId = contractMap[contract] || contract;
    }
    
    // Build the query dynamically based on whether 'since' is provided
    const queryOptions: any = {
      where: {
        contractId: contractId,
        timeframeUnit: timeframeUnit,
        timeframeValue: timeframeValue
      }
    };

    if (since) {
      queryOptions.where.timestamp = {
        gte: new Date(since)
      };
      queryOptions.orderBy = {
        timestamp: 'asc' // Fetch in ascending order when getting recent data
      };
    } else {
      queryOptions.orderBy = {
        timestamp: 'desc'
      };
      queryOptions.take = limit;
    }
    
    // Query the database using Prisma
    const bars = await prisma.ohlcBar.findMany(queryOptions);

    if (!since) {
      // The historical fetch is 'desc', so we need to reverse it for the chart
      bars.reverse();
    }
    
    // Initialize an empty map for trend points
    const trendPointMap = new Map();
    
    // Only query trend points if the model exists in the client
    if ('trendPoint' in prisma) {
      // Query trend points for the same contract and timeframe
      const trendPoints = await prisma.trendPoint.findMany({
        where: {
          contractId: contractId,
          timeframe: timeframe
        }
      });
      
      // Create a map for quick lookup of trend points by timestamp
      trendPoints.forEach((point: any) => {
        // Use timestamp as a string key
        const key = point.timestamp.toISOString();
        
        if (!trendPointMap.has(key)) {
          trendPointMap.set(key, {
            uptrendStart: false,
            downtrendStart: false,
            highestDowntrendStart: false,
            unbrokenUptrendStart: false,
            uptrendToHigh: false
          });
        }
        
        // Set the appropriate trend type to true
        const trends = trendPointMap.get(key);
        if (point.type === 'uptrendStart') trends.uptrendStart = true;
        if (point.type === 'downtrendStart') trends.downtrendStart = true;
        if (point.type === 'highestDowntrendStart') trends.highestDowntrendStart = true;
        if (point.type === 'unbrokenUptrendStart') trends.unbrokenUptrendStart = true;
        if (point.type === 'uptrendToHigh') trends.uptrendToHigh = true;
      });
    } else {
      console.log('Warning: trendPoint model not available in Prisma client');
    }
    
    // Process and format the response
    const data = bars.map((bar: any) => {
      // Look up trend indicators for this bar's timestamp
      const key = bar.timestamp.toISOString();
      const trends = trendPointMap.get(key) || {
        uptrendStart: false,
        downtrendStart: false,
        highestDowntrendStart: false,
        unbrokenUptrendStart: false,
        uptrendToHigh: false
      };
      
      return {
        contractId: bar.contractId,
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume !== null && bar.volume !== undefined ? String(bar.volume) : null,
        timeframeUnit: bar.timeframeUnit,
        timeframeValue: bar.timeframeValue,
        // Add trend indicators from our lookup
        uptrendStart: trends.uptrendStart,
        downtrendStart: trends.downtrendStart,
        highestDowntrendStart: trends.highestDowntrendStart,
        unbrokenUptrendStart: trends.unbrokenUptrendStart,
        uptrendToHigh: trends.uptrendToHigh
      };
    });
    
    return NextResponse.json({
      success: true,
      contract,
      timeframe,
      count: data.length,
      data
    });
    
  } catch (error) {
    console.error('Error fetching OHLC data:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch OHLC data', 
        error: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : undefined) : undefined
      },
      { status: 500 }
    );
  }
} 