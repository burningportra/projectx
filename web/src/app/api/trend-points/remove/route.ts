import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '../../../../lib/db';

// Define validation schema for removing trend points
const removeTrendPointSchema = z.object({
  timestamp: z.number(),
  type: z.string(),
  index: z.number(),
  timeframe: z.string(),
  contractId: z.string()
});

export async function POST(request: NextRequest) {
  console.log('POST /api/trend-points/remove - Request received');
  
  try {
    // Parse the request body
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body));
    
    // Validate the incoming data
    const validatedData = removeTrendPointSchema.parse(body);
    console.log('Validated data:', validatedData);
    
    // Map the contract symbol to the actual contract ID format if needed
    let contractId = validatedData.contractId;
    if (!contractId.includes('.')) {
      // Mapping common symbols to full contract IDs
      const contractMap: Record<string, string> = {
        'ES': 'CON.F.US.ES',
        'NQ': 'CON.F.US.NQ',
        'RTY': 'CON.F.US.RTY',
        'MES': 'CON.F.US.MES',
        'AAPL': 'CON.S.US.AAPL',
        'MSFT': 'CON.S.US.MSFT'
      };
      contractId = contractMap[contractId] || `CON.F.US.${contractId}`;
      console.log(`Mapped contract ID from ${validatedData.contractId} to ${contractId}`);
    }
    
    // Create the timestamp object from the timestamp number
    const timestamp = new Date(validatedData.timestamp);
    console.log(`Parsed timestamp: ${timestamp.toISOString()}`);
    
    try {
      // Log available models for debugging
      console.log('Available models on prisma:', Object.keys(prisma));
      
      // Find the trend point first to verify it exists
      const existingPoint = await prisma.trendPoint.findFirst({
        where: {
          contractId,
          timestamp,
          type: validatedData.type,
          timeframe: validatedData.timeframe
        }
      });
      
      if (!existingPoint) {
        console.log('No matching trend point found to delete');
        return NextResponse.json({
          success: false,
          message: `No trend point found to remove: ${validatedData.type} at ${timestamp.toISOString()}`
        }, { status: 404 });
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
    } catch (dbError) {
      console.error('Database operation error:', dbError);
      return NextResponse.json({
        success: false,
        message: 'Database error while removing trend point',
        error: dbError instanceof Error ? dbError.message : String(dbError),
        details: dbError instanceof Error ? dbError.stack : undefined
      }, { status: 500 });
    }
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
      { 
        success: false, 
        message: 'Failed to remove trend point',
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 