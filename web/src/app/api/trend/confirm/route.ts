import { NextResponse } from "next/server";

interface TrendConfirmationRequest {
  timestamp: number;
  type: string;
  index: number;
  price: number;
  timeframeUnit: number;
  timeframeValue: number;
  contractId: string;
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as TrendConfirmationRequest;
    
    console.log("Received trend confirmation:", data);
    
    // Validate required fields
    if (!data.timestamp || !data.type) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // In a production app, we would make a call to the backend service
    // For now, we'll simulate a successful response
    
    // Simulate backend processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Map frontend trend type names to backend names if needed
    const trendTypeMap: Record<string, string> = {
      "uptrendStart": "uptrend_start",
      "downtrendStart": "downtrend_start",
      "highestDowntrendStart": "highest_downtrend_start",
      "unbrokenUptrendStart": "unbroken_uptrend_start",
      "uptrendToHigh": "uptrend_to_high"
    };
    
    const backendType = trendTypeMap[data.type] || data.type;
    
    // Create response payload
    const responseData = {
      success: true,
      message: `Trend ${data.type} confirmed`,
      timestamp: data.timestamp,
      timeframe: `${data.timeframeValue}${data.timeframeUnit === 2 ? 'm' : data.timeframeUnit === 3 ? 'h' : data.timeframeUnit === 4 ? 'd' : 'w'}`,
      type: backendType,
      contractId: data.contractId
    };

    // TODO: In a real implementation, call the backend API:
    // const response = await fetch("http://localhost:8000/api/trend/confirm", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     timestamp: new Date(data.timestamp).toISOString(),
    //     trend_type: backendType,
    //     timeframe_unit: data.timeframeUnit,
    //     timeframe_value: data.timeframeValue,
    //     contract_id: data.contractId,
    //     price: data.price
    //   })
    // });
    // const responseData = await response.json();
    
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error processing trend confirmation:", error);
    return NextResponse.json(
      { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 