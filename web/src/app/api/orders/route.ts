import { NextResponse } from 'next/server';

/**
 * Orders API Endpoint - v3 Compatible
 * 
 * The v3 backtesting system uses self-contained React Context state management
 * and doesn't require external APIs for order management during backtesting.
 * This endpoint now returns mock data for compatibility with any legacy components.
 */
export async function GET() {
  try {
    // Return empty orders array since v3 handles order management internally
    const mockData = {
      orders: [],
      message: "v3 backtesting uses internal order management - no external orders",
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(mockData);
  } catch (error) {
    console.error('Error in orders endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 