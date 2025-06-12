import { NextResponse } from 'next/server';

// Define Order type
interface Order {
  id: string;
  strategyName: string;
  contract: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  price: number;
  size: number;
  time: string;
  status: 'pending' | 'submitted' | 'filled' | 'cancelled' | 'rejected';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
}

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
    const mockOrders: Order[] = [];
    
    return NextResponse.json(mockOrders);
  } catch (error) {
    console.error('Error in orders endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 