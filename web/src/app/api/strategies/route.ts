import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8000';

export async function GET() {
  try {
    // Mock strategies data instead of fetching from backend
    const mockStrategies = [
      {
        id: "1",
        name: "Trend Following",
        description: "Identifies and follows market trends across multiple timeframes",
        contracts: ["ES", "NQ"],
        timeframes: ["1h", "4h"],
        status: "active",
        performance: {
          winRate: 62,
          pnl: 1240.50,
          trades: 48
        }
      },
      {
        id: "2",
        name: "Breakout Strategy",
        description: "Trades breakouts from key support and resistance levels",
        contracts: ["ES", "NQ", "RTY"],
        timeframes: ["30m", "1h"],
        status: "active",
        performance: {
          winRate: 58,
          pnl: 875.25,
          trades: 36
        }
      },
      {
        id: "3",
        name: "Mean Reversion",
        description: "Trades market overextensions back to the mean",
        contracts: ["ES"],
        timeframes: ["15m", "1h"],
        status: "paused",
        performance: {
          winRate: 71,
          pnl: 1560.75,
          trades: 42
        }
      }
    ];
    
    return NextResponse.json(mockStrategies);
  } catch (error) {
    console.error('Error generating strategies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategies' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Mock response for creating a strategy
    const mockResponse = {
      id: Math.random().toString(36).substring(2, 10),
      ...body,
      status: body.status || "inactive",
      performance: {
        winRate: 0,
        pnl: 0,
        trades: 0
      }
    };
    
    return NextResponse.json(mockResponse);
  } catch (error) {
    console.error('Error creating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to create strategy' },
      { status: 500 }
    );
  }
} 