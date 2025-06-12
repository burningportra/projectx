import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { calculateTrendIndicators } from "@/lib/trend-analysis";
import { Prisma } from '@prisma/client'; // Import Prisma

// Define the OhlcBar interface that matches what the trend-analysis module expects
interface OhlcBar {
  id: number; // Ensure id is part of the interface
  contractId: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  timeframeUnit: number;
  timeframeValue: number;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const contractIdParam = searchParams.get("contractId");
    const timeframeUnit = parseInt(searchParams.get("timeframeUnit") ?? "2");
    const timeframeValue = parseInt(searchParams.get("timeframeValue") ?? "5");
    const limit = parseInt(searchParams.get("limit") ?? "100");
    const page = parseInt(searchParams.get("page") ?? "0");
    const fetchAll = searchParams.get("all") === "true";
    const allContracts = searchParams.get("allContracts") === "true";
    
    if (!contractIdParam && !allContracts) {
      return NextResponse.json(
        { error: "Missing contractId parameter" },
        { status: 400 }
      );
    }

    // Build the where clause based on parameters
    const whereClause: Prisma.OhlcBarWhereInput = {};
    if (allContracts) {
      whereClause.timeframeUnit = timeframeUnit;
      whereClause.timeframeValue = timeframeValue;
    } else if (contractIdParam) { // Only add contractId if not fetching allContracts and it exists
      whereClause.contractId = contractIdParam;
      whereClause.timeframeUnit = timeframeUnit;
      whereClause.timeframeValue = timeframeValue;
    } else {
        // This case should ideally not be reached due to the check above,
        // but as a fallback to prevent querying with an undefined contractId:
        return NextResponse.json(
            { error: "Invalid parameter combination: contractId is required if not fetching for all contracts." },
            { status: 400 }
        );
    }

    const totalBarsCount = await prisma.ohlcBar.count({
      where: whereClause
    });

    let bars;
    if (fetchAll) {
      bars = await prisma.ohlcBar.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
      });
    } else {
      bars = await prisma.ohlcBar.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
        take: limit,
        skip: page * limit,
      });
    }

    const barsInAscendingOrder = [...bars].reverse();

    if (bars.length > 0) {
      console.log(`Found ${bars.length} bars in database`);
      console.log("API - First bar:", bars[0]);
      console.log("API - Most recent timestamp:", bars[0]?.timestamp);
      console.log("API - Oldest timestamp in result set:", bars[bars.length - 1]?.timestamp);
      console.log("API - Timeframe:", `${timeframeValue}${timeframeUnit === 2 ? 'm' : timeframeUnit === 3 ? 'h' : timeframeUnit === 4 ? 'd' : timeframeUnit === 5 ? 'w' : 'mo'}`);
      
      // Calculate date range coverage
      if (bars.length > 1) {
        const firstDate = new Date(bars[bars.length - 1]?.timestamp || '');
        const lastDate = new Date(bars[0]?.timestamp || '');
        const rangeDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
        console.log(`API - Data spans ${rangeDays.toFixed(1)} days`);
      }
    }

    const dbBars: OhlcBar[] = barsInAscendingOrder.map(bar => ({
      id: (bar as any).id, // Assert that bar has an id property
      contractId: (bar as any).contractId,
      timestamp: new Date((bar as any).timestamp),
      open: (bar as any).open,
      high: (bar as any).high,
      low: (bar as any).low,
      close: (bar as any).close,
      volume: typeof (bar as any).volume === 'bigint' ? Number((bar as any).volume) : ((bar as any).volume === null ? null : Number((bar as any).volume)),
      timeframeUnit: (bar as any).timeframeUnit,
      timeframeValue: (bar as any).timeframeValue,
    }));
    
    const barsWithTrends = calculateTrendIndicators(dbBars);
    
    const serializedBars = barsWithTrends.map(bar => ({
      ...bar,
      timestamp: bar.timestamp.toISOString(),
      volume: typeof bar.volume === 'bigint' ? Number(bar.volume) : (bar.volume === null ? null : Number(bar.volume))
    }));

    return NextResponse.json({ 
      bars: serializedBars,
      meta: {
        timeframe: `${timeframeValue}${timeframeUnit === 2 ? 'm' : timeframeUnit === 3 ? 'h' : timeframeUnit === 4 ? 'd' : timeframeUnit === 5 ? 'w' : 'mo'}`,
        count: serializedBars.length,
        total: totalBarsCount,
        hasMore: !fetchAll && (page + 1) * limit < totalBarsCount,
        page: page,
        firstTimestamp: serializedBars.length > 0 ? serializedBars[0]?.timestamp : null,
        lastTimestamp: serializedBars.length > 0 ? serializedBars[serializedBars.length - 1]?.timestamp : null
      }
    });
  } catch (error) {
    console.error("Error fetching bars:", error);
    // Ensure BigInt errors are caught and handled appropriately if they occur elsewhere
    if (error instanceof TypeError && error.message.includes("BigInt")) {
        return NextResponse.json(
            { error: "Failed to process data due to BigInt serialization issue." },
            { status: 500 }
        );
    }
    return NextResponse.json(
      { error: "Failed to fetch bars" },
      { status: 500 }
    );
  }
} 