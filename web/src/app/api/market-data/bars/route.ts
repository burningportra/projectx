import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculateTrendIndicators } from "@/lib/trend-analysis";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const contractId = searchParams.get("contractId");
    const timeframeUnit = parseInt(searchParams.get("timeframeUnit") ?? "2"); // default to minutes (2)
    const timeframeValue = parseInt(searchParams.get("timeframeValue") ?? "5"); // default to 5
    const limit = parseInt(searchParams.get("limit") ?? "100"); // default to 100 bars
    
    if (!contractId) {
      return NextResponse.json(
        { error: "Missing contractId parameter" },
        { status: 400 }
      );
    }

    // Fetch OHLC bars from database
    const bars = await prisma.ohlcBar.findMany({
      where: {
        contractId,
        timeframeUnit,
        timeframeValue,
      },
      orderBy: {
        timestamp: "asc",
      },
      take: limit,
    });

    // Calculate trend indicators
    const barsWithTrends = calculateTrendIndicators(bars);

    return NextResponse.json({ bars: barsWithTrends });
  } catch (error) {
    console.error("Error fetching bars:", error);
    return NextResponse.json(
      { error: "Failed to fetch bars" },
      { status: 500 }
    );
  }
} 