import { NextRequest, NextResponse } from "next/server";
import { getVapiCalls, transformVapiCallToLocal, isVapiConfigured } from "@/lib/vapi-api";

// GET - Fetch calls from VAPI API
export async function GET(request: NextRequest) {
  try {
    // Check if VAPI is configured
    if (!isVapiConfigured()) {
      return NextResponse.json(
        { error: "VAPI is not configured", code: "VAPI_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    const limit = parseInt(searchParams.get("limit") || "50");
    // VAPI free tier only allows 14 days of history
    const days = Math.min(parseInt(searchParams.get("days") || "14"), 14);
    const assistantId = searchParams.get("assistantId") || undefined;

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch calls from VAPI
    const vapiCalls = await getVapiCalls({
      limit,
      createdAtGe: startDate.toISOString(),
      assistantId,
    });

    // Transform to local format
    const calls = vapiCalls.map(transformVapiCallToLocal);

    return NextResponse.json({
      success: true,
      data: calls,
      count: calls.length,
      source: "vapi",
    });
  } catch (error) {
    console.error("Error fetching VAPI calls:", error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      { 
        error: "Failed to fetch calls from VAPI", 
        details: errorMessage,
        code: "VAPI_FETCH_ERROR"
      },
      { status: 500 }
    );
  }
}

