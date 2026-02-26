import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET - Find a specific call by name and date
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    
    const name = searchParams.get("name");
    const dateStr = searchParams.get("date"); // Format: "Jan 17" or "2024-01-17"
    
    if (!name) {
      return NextResponse.json(
        { error: "Name parameter is required" },
        { status: 400 }
      );
    }
    
    // Build query
    let query = supabase
      .from("calls")
      .select("*")
      .ilike("caller_name", `%${name}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    
    // If date provided, filter by date
    if (dateStr) {
      // Try to parse date string
      const dateMatch = dateStr.match(/(\w+)\s+(\d+)/); // "Jan 17" format
      if (dateMatch && dateMatch[1] && dateMatch[2]) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const monthName = dateMatch[1].toLowerCase();
        const day = parseInt(dateMatch[2]);
        const monthIndex = monthNames.findIndex(m => m.startsWith(monthName));
        
        if (monthIndex !== -1) {
          const currentYear = new Date().getFullYear();
          const targetDate = new Date(currentYear, monthIndex, day);
          const nextDay = new Date(targetDate);
          nextDay.setDate(nextDay.getDate() + 1);
          
          query = query
            .gte("created_at", targetDate.toISOString())
            .lt("created_at", nextDay.toISOString());
        }
      } else {
        // Try ISO format "2024-01-17"
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) {
          const nextDay = new Date(isoDate);
          nextDay.setDate(nextDay.getDate() + 1);
          
          query = query
            .gte("created_at", isoDate.toISOString())
            .lt("created_at", nextDay.toISOString());
        }
      }
    }
    
    const { data: calls, error } = await query as { 
      data: Array<{
        id: string;
        caller_name: string | null;
        caller_phone: string | null;
        transcript: string | null;
        summary: string | null;
        evaluation_score: number | null;
        evaluation_summary: string | null;
        duration: number | null;
        sentiment: string | null;
        type: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
      }> | null; 
      error: any 
    };
    
    if (error) {
      console.error("Error finding call:", error);
      return NextResponse.json(
        { error: "Failed to find call", details: error.message },
        { status: 500 }
      );
    }
    
    // Format response with detailed info
    const formattedCalls = (calls || []).map(call => ({
      id: call.id,
      caller_name: call.caller_name,
      caller_phone: call.caller_phone,
      created_at: call.created_at,
      duration: call.duration,
      evaluation_score: call.evaluation_score,
      sentiment: call.sentiment,
      type: call.type,
      summary: call.summary,
      evaluation_summary: call.evaluation_summary,
      transcript_preview: call.transcript ? call.transcript.substring(0, 500) + "..." : null,
      metadata: call.metadata,
    }));
    
    return NextResponse.json({
      success: true,
      count: formattedCalls.length,
      calls: formattedCalls,
    });
  } catch (error) {
    console.error("Find call error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
