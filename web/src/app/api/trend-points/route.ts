import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '../../../lib/db';

// Define validation schema for incoming trend point data
const trendPointSchema = z.object({
  timestamp: z.number(),
  price: z.number(),
  type: z.string(),
  index: z.number(),
  timeframe: z.string(),
  contractId: z.string()
});

// Add GET handler to fetch trend points
export async function GET(request: NextRequest) {
  console.log('GET /api/trend-points - Request received');
  
  try {
    // Get query parameters
    const url = new URL(request.url);
    const contractId = url.searchParams.get('contractId');
    const timeframe = url.searchParams.get('timeframe');
    
    console.log(`Query params: contractId=${contractId}, timeframe=${timeframe}`);
    
    if (!contractId || !timeframe) {
      return NextResponse.json({
        success: false,
        message: 'Missing required parameters: contractId and timeframe',
      }, { status: 400 });
    }
    
    // Build the query
    const where: any = {
      contractId,
      timeframe
    };
    
    // Fetch trend points from the database
    const trendPoints = await prisma.trendPoint.findMany({
      where,
      orderBy: {
        timestamp: 'asc'
      }
    });
    
    console.log(`Found ${trendPoints.length} trend points`);
    
    return NextResponse.json({
      success: true,
      message: `Found ${trendPoints.length} trend points`,
      data: trendPoints
    });
  } catch (error) {
    console.error('Error fetching trend points:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch trend points',
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  console.log('POST /api/trend-points - Request received');
  
  try {
    // Parse the request body
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body));
    
    // Validate the incoming data
    const validatedData = trendPointSchema.parse(body);
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
      
      // Check if a similar trend point already exists using lowercase model name
      const existingTrendPoint = await prisma.trendPoint.findFirst({
        where: {
          contractId,
          timestamp,
          type: validatedData.type,
          timeframe: validatedData.timeframe
        }
      });
      
      // If the trend point exists, return it directly
      if (existingTrendPoint) {
        console.log('Trend point already exists:', existingTrendPoint);
        return NextResponse.json({
          success: true,
          message: `Trend point already exists: ${validatedData.type} at ${timestamp.toISOString()}`,
          trendPoint: existingTrendPoint
        });
      }
      
      // Create a new trend point in the database
      console.log('Creating new trend point with data:', {
        contractId,
        timestamp,
        price: validatedData.price,
        type: validatedData.type,
        timeframe: validatedData.timeframe
      });
      
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
    } catch (dbError) {
      console.error('Database operation error:', dbError);
      return NextResponse.json({
        success: false,
        message: 'Database error while saving trend point',
        error: dbError instanceof Error ? dbError.message : String(dbError),
        details: dbError instanceof Error ? dbError.stack : undefined
      }, { status: 500 });
    }
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
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 