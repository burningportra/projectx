import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

// Define validation schema for incoming trend point data
const trendPointSchema = z.object({
  timestamp: z.number(),
  price: z.number(),
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
    const validatedData = trendPointSchema.parse(body);
    
    console.log('Received trend point data:', validatedData);
    
    // Map the contract symbol to the actual contract ID format if needed
    let contractId = validatedData.contractId;
    if (!contractId.startsWith('CON.')) {
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
      contractId = contractMap[contractId] || contractId;
    }
    
    // Create the timestamp object from the timestamp number
    const timestamp = new Date(validatedData.timestamp);
    
    // Check if a similar trend point already exists (same timestamp, contract, type)
    let existingTrendPoint = null;
    
    // Check if the trendPoint model exists in the Prisma client
    if (!('trendPoint' in prisma)) {
      return NextResponse.json({
        success: false,
        message: 'TrendPoint model not available in Prisma client',
        error: 'Database schema not synchronized'
      }, { status: 500 });
    }
    
    // Check if a similar trend point already exists
    existingTrendPoint = await prisma.trendPoint.findFirst({
      where: {
        contractId,
        timestamp,
        type: validatedData.type,
        timeframe: validatedData.timeframe
      }
    });
    
    // If the trend point exists, return it directly
    if (existingTrendPoint) {
      return NextResponse.json({
        success: true,
        message: `Trend point already exists: ${validatedData.type} at ${timestamp.toISOString()}`,
        trendPoint: existingTrendPoint
      });
    }
    
    // Create a new trend point in the database
    const trendPoint = await prisma.trendPoint.create({
      data: {
        contractId,
        timestamp,
        price: validatedData.price,
        type: validatedData.type,
        timeframe: validatedData.timeframe
      }
    });
    
    console.log('Created trend point in database:', trendPoint);
    
    return NextResponse.json({
      success: true,
      message: `Trend point saved: ${validatedData.type} at ${timestamp.toISOString()}`,
      trendPoint
    });
    
  } catch (error) {
    console.error('Error processing trend point:', error);
    
    // Check if it's a validation error from zod
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Invalid data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to process trend point',
        error: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : undefined) : undefined 
      },
      { status: 500 }
    );
  }
} 