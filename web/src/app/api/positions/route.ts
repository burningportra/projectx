import { NextResponse } from 'next/server';

/**
 * Positions API Endpoint - v3 Compatible
 * 
 * The v3 backtesting system uses self-contained React Context state management
 * and doesn't require external APIs for position management during backtesting.
 * This endpoint now returns mock data for compatibility with any legacy components.
 */
export async function GET() {
  try {
    // Return empty positions array since v3 handles position management internally
    const mockData = {
      positions: [],
      message: "v3 backtesting uses internal position management - no external positions",
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(mockData);
  } catch (error) {
    console.error('Error in positions endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Close a position - v3 Compatible
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { positionId } = body;
    
    // In v3, position management is handled internally by the BacktestEngine
    // Return success response for compatibility
    const mockResponse = {
      success: true,
      message: `Position ${positionId} close request received - v3 handles internally`,
      positionId,
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(mockResponse);
  } catch (error) {
    console.error('Error in position close endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 