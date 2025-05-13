import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

// Define validation schema for removing trend points
const removeTrendPointSchema = z.object({
  timestamp: z.number(),
  type: z.string(),
  index: z.number(),
  timeframe: z.string(),
  contractId: z.string()
});

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    
    // Validate the incoming data
    const validatedData = removeTrendPointSchema.parse(body);
    
    console.log('Removing trend point:', validatedData);
    
    // Map the contract symbol to the actual contract ID format if needed
    let contractId = validatedData.contractId;
    if (!contractId.startsWith('CON.')) {
      // Mapping common symbols to full contract IDs
      const contractMap: Record<string, string> = {
        'ES': 'CON.F.US.ES',
        'NQ': 'CON.F.US.NQ',
        'RTY': 'CON.F.US.RTY',
        'MES': 'CON.F.US.MES',
        'AAPL': 'CON.S.US.AAPL',
        'MSFT': 'CON.S.US.MSFT'
      };
      contractId = contractMap[contractId] || contractId;
    }
    
    // Create the timestamp object from the timestamp number
    const timestamp = new Date(validatedData.timestamp);
    
    // Check if the trendPoint model exists in the Prisma client
    if (!('trendPoint' in prisma)) {
      return NextResponse.json({
        success: false,
        message: 'TrendPoint model not available in Prisma client',
        error: 'Database schema not synchronized'
      }, { status: 500 });
    }
    
    // Delete the trend point from the database
    const result = await prisma.trendPoint.deleteMany({
      where: {
        contractId,
        timestamp,
        type: validatedData.type,
        timeframe: validatedData.timeframe
      }
    });
    
    // Log the result
    console.log(`Deleted ${result.count} trend points from database`);
    
    return NextResponse.json({
      success: true,
      message: `Trend point removed: ${validatedData.type} at ${timestamp.toISOString()}`,
      count: result.count
    });
    
  } catch (error) {
    console.error('Error removing trend point:', error);
    
    // Check if it's a validation error from zod
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Invalid data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, message: 'Failed to remove trend point' },
      { status: 500 }
    );
  }
} 