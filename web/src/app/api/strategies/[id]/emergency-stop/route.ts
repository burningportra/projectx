import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8000';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    console.log(`Emergency stopping strategy with ID: ${id}`);
    
    const response = await fetch(`${API_BASE_URL}/api/strategies/${id}/emergency-stop`, {
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
    console.error('Error emergency stopping strategy:', error);
    return NextResponse.json(
      { error: 'Failed to emergency stop strategy' },
      { status: 500 }
    );
  }
} 