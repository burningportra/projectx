import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Query unique contract IDs from the database
    const contracts = await prisma.$queryRaw`
      SELECT DISTINCT contract_id 
      FROM ohlc_bars 
      ORDER BY contract_id ASC
    `;
    
    console.log(`Found ${Array.isArray(contracts) ? contracts.length : 0} contracts in database`);
    
    // Map contract IDs to friendly names if needed
    const contractList = Array.isArray(contracts) ? contracts.map((contract: any) => {
      const contractId = contract.contract_id;
      
      // Extract short symbol from contract ID
      // Format: CON.F.US.ES -> ES
      let shortSymbol = contractId;
      if (contractId.includes('.')) {
        const parts = contractId.split('.');
        shortSymbol = parts[parts.length - 1];
      }
      
      return {
        id: contractId,
        symbol: shortSymbol,
        fullName: contractId
      };
    }) : [];
    
    return NextResponse.json({
      success: true,
      count: contractList.length,
      data: contractList
    });
    
  } catch (error) {
    console.error('Error fetching contracts:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch contracts', 
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
} 