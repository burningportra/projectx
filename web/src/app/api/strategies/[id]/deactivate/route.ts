import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8000';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`Deactivating strategy with ID: ${id}`);
    
    const response = await fetch(`${API_BASE_URL}/api/strategies/${id}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deactivating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate strategy' },
      { status: 500 }
    );
  }
} 