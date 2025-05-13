import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { calculateTrendIndicators } from "@/lib/trend-analysis";

// Define the OhlcBar interface that matches what the trend-analysis module expects
interface OhlcBar {
  id: number;
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
    const contractId = searchParams.get("contractId");
    const timeframeUnit = parseInt(searchParams.get("timeframeUnit") ?? "2"); // default to minutes (2)
    const timeframeValue = parseInt(searchParams.get("timeframeValue") ?? "5"); // default to 5
    const limit = parseInt(searchParams.get("limit") ?? "100"); // default to 100 bars
    const page = parseInt(searchParams.get("page") ?? "0"); // default to first page
    const fetchAll = searchParams.get("all") === "true"; // parameter to fetch all bars
    
    if (!contractId) {
      return NextResponse.json(
        { error: "Missing contractId parameter" },
        { status: 400 }
      );
    }

    // Query to count total bars for the contract and timeframe
    const totalBarsCount = await prisma.ohlcBar.count({
      where: {
        contractId,
        timeframeUnit,
        timeframeValue,
      }
    });

    // Fetch OHLC bars based on params
    let bars;
    if (fetchAll) {
      // Get all bars for the contract and timeframe
      bars = await prisma.ohlcBar.findMany({
        where: {
          contractId,
          timeframeUnit,
          timeframeValue,
        },
        orderBy: {
          timestamp: "desc", // Get newest first
        },
      });
    } else {
      // Get paginated bars
      bars = await prisma.ohlcBar.findMany({
        where: {
          contractId,
          timeframeUnit,
          timeframeValue,
        },
        orderBy: {
          timestamp: "desc", // Get newest first
        },
        take: limit,
        skip: page * limit,
      });
    }

    // Reverse the bars to get them in ascending order for proper display
    const barsInAscendingOrder = [...bars].reverse();

    // Debug timestamps
    console.log(`Found ${bars.length} bars in database`);
    if (bars.length > 0) {
      console.log("API - First bar:", bars[0]);
      console.log("API - Most recent timestamp:", bars[0].timestamp);
      console.log("API - Oldest timestamp in result set:", bars[bars.length - 1].timestamp);
      console.log("API - Timeframe:", `${timeframeValue}${timeframeUnit === 2 ? 'm' : timeframeUnit === 3 ? 'h' : timeframeUnit === 4 ? 'd' : timeframeUnit === 5 ? 'w' : 'mo'}`);
      
      // Calculate date range coverage
      if (bars.length > 1) {
        const firstDate = new Date(bars[bars.length - 1].timestamp);
        const lastDate = new Date(bars[0].timestamp);
        const rangeDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
        console.log(`API - Data spans ${rangeDays.toFixed(1)} days`);
      }
    }

    // Calculate trend indicators on the database result format
    // Make sure each bar's timestamp is properly converted to a Date object
    const dbBars: OhlcBar[] = barsInAscendingOrder.map(bar => ({
      ...bar,
      timestamp: new Date(bar.timestamp)
    }));
    
    // Calculate trend indicators
    const barsWithTrends = calculateTrendIndicators(dbBars);
    
    // Convert date objects to ISO strings for JSON serialization
    const serializedBars = barsWithTrends.map(bar => ({
      ...bar,
      timestamp: bar.timestamp.toISOString()
    }));

    return NextResponse.json({ 
      bars: serializedBars,
      meta: {
        timeframe: `${timeframeValue}${timeframeUnit === 2 ? 'm' : timeframeUnit === 3 ? 'h' : timeframeUnit === 4 ? 'd' : timeframeUnit === 5 ? 'w' : 'mo'}`,
        count: serializedBars.length,
        total: totalBarsCount,
        hasMore: !fetchAll && (page + 1) * limit < totalBarsCount,
        page: page,
        firstTimestamp: serializedBars.length > 0 ? serializedBars[0].timestamp : null,
        lastTimestamp: serializedBars.length > 0 ? serializedBars[serializedBars.length - 1].timestamp : null
      }
    });
  } catch (error) {
    console.error("Error fetching bars:", error);
    return NextResponse.json(
      { error: "Failed to fetch bars" },
      { status: 500 }
    );
  }
} 