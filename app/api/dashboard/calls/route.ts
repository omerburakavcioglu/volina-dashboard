import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { filterVisibleDashboardCalls, getUserAssistantId } from "@/lib/dashboard/visible-calls";

interface CallRecord {
  id: string;
  user_id: string;
  created_at: string;
  duration?: number;
  type?: string;
  sentiment?: string;
  metadata?: Record<string, unknown>;
  caller_name?: string;
  evaluation_summary?: string;
  evaluation_score?: number;
  [key: string]: unknown;
}

// GET - Fetch calls from Supabase (synced from VAPI) - User-specific
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    
    // Get user_id from query params (REQUIRED - sent from frontend)
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }
    
    const days = parseInt(searchParams.get("days") || "365");
    
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const userAssistantId = await getUserAssistantId(supabase, userId);

    // Build query - MUST filter by user_id for security
    let query = supabase
      .from("calls")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000);
    
    const { data: allCalls, error } = await query as { data: CallRecord[] | null; error: { message: string } | null };
    
    const filteredCalls = filterVisibleDashboardCalls(allCalls || [], userAssistantId);

    // Show ALL calls - don't filter by caller_name
    // Calls without caller_name will display phone number or "Unknown" in UI
    // Previously we filtered out calls without caller_name, but this hid
    // international calls that didn't match any lead in the database

    if (error) {
      console.error("Error fetching calls:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch calls", details: error.message },
        { status: 500 }
      );
    }

    // Use filtered calls for everything
    const calls = filteredCalls;

    // Calculate KPI stats from filtered data
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const totalCalls = calls.length;
    const monthlyCalls = calls.filter(c => new Date(c.created_at) >= startOfMonth).length;
    const dailyCalls = calls.filter(c => new Date(c.created_at) >= startOfDay).length;
    
    // Calculate average duration
    const callsWithDuration = calls.filter(c => c.duration && c.duration > 0);
    const avgDuration = callsWithDuration.length > 0
      ? Math.round(callsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / callsWithDuration.length)
      : 0;

    // Calculate appointment rate (based on sentiment or type)
    const appointmentCalls = calls.filter(c => 
      c.type === 'appointment' || 
      c.sentiment === 'positive' ||
      (c.metadata && typeof c.metadata === 'object' && 
       (c.metadata as Record<string, unknown>).appointmentBooked === true)
    ).length;
    const appointmentRate = totalCalls > 0 ? Math.round((appointmentCalls / totalCalls) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: calls,
      kpi: {
        totalCalls,
        monthlyCalls,
        dailyCalls,
        avgDuration,
        appointmentRate,
      },
      source: "supabase",
    });
  } catch (error) {
    console.error("Dashboard calls error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete all calls for a user (from database)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    
    // Get user_id from query params (REQUIRED - sent from frontend)
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }
    
    // Delete all calls for this user
    const { error } = await supabase
      .from("calls")
      .delete()
      .eq("user_id", userId);
    
    if (error) {
      console.error("Error deleting calls:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete calls", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: "All calls deleted successfully",
    });
  } catch (error) {
    console.error("Delete calls error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}