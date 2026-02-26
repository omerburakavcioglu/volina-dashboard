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
    // Supabase has a default limit of 1000, so we need to use pagination to fetch all calls
    let allCalls: CallRecord[] = [];
    const pageSize = 1000; // Supabase's max per request
    let hasMore = true;
    let offset = 0;
    let pageCount = 0;
    
    while (hasMore) {
      pageCount++;
      const { data: pageData, error } = await supabase
        .from("calls")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1) as { data: CallRecord[] | null; error: { message: string } | null };
      
      if (error) {
        console.error("Error fetching calls page:", error);
        break;
      }
      
      if (pageData && pageData.length > 0) {
        allCalls = allCalls.concat(pageData);
        console.log(`[Dashboard Calls] Fetched page ${pageCount}: ${pageData.length} calls (total: ${allCalls.length})`);
        offset += pageSize;
        hasMore = pageData.length === pageSize; // If we got less than pageSize, we're done
      } else {
        hasMore = false;
      }
    }
    
    console.log(`[Dashboard Calls] Total pages fetched: ${pageCount}, Total calls: ${allCalls.length}`);
    
    const error = null; // No error if we got here
    
    // Log for debugging
    console.log(`[Dashboard Calls] Total calls from DB: ${allCalls?.length || 0}, User ID: ${userId}, Assistant ID: ${userAssistantId}`);
    
    // Count calls by assistant_id for debugging
    if (allCalls && allCalls.length > 0) {
      const assistantIdCounts = new Map<string, number>();
      const noAssistantIdCount = allCalls.filter(call => {
        const callAssistantId = (call as Record<string, unknown>).assistant_id as string | undefined;
        const metadataAssistantId = call.metadata?.assistantId as string | undefined;
        return !callAssistantId && !metadataAssistantId;
      }).length;
      
      allCalls.forEach(call => {
        const callAssistantId = (call as Record<string, unknown>).assistant_id as string | undefined;
        const metadataAssistantId = call.metadata?.assistantId as string | undefined;
        const assistantId = callAssistantId || metadataAssistantId;
        if (assistantId) {
          assistantIdCounts.set(assistantId, (assistantIdCounts.get(assistantId) || 0) + 1);
        }
      });
      
      console.log(`[Dashboard Calls] Calls by assistant_id:`, Object.fromEntries(assistantIdCounts));
      console.log(`[Dashboard Calls] Calls without assistant_id (legacy): ${noAssistantIdCount}`);
      console.log(`[Dashboard Calls] Expected assistant_id: ${userAssistantId}`);
    }
    
    const filteredCalls = filterVisibleDashboardCalls(allCalls || [], userAssistantId);
    
    // Log filtered count
    console.log(`[Dashboard Calls] Filtered calls: ${filteredCalls.length}, Removed: ${(allCalls?.length || 0) - filteredCalls.length}`);

    // Prepare debug info for client
    const debugInfo = {
      totalFromDB: allCalls?.length || 0,
      filteredCount: filteredCalls.length,
      removedCount: (allCalls?.length || 0) - filteredCalls.length,
      assistantIdCounts: allCalls && allCalls.length > 0 ? (() => {
        const counts = new Map<string, number>();
        const noAssistantIdCount = allCalls.filter(call => {
          const callAssistantId = (call as Record<string, unknown>).assistant_id as string | undefined;
          const metadataAssistantId = call.metadata?.assistantId as string | undefined;
          return !callAssistantId && !metadataAssistantId;
        }).length;
        
        allCalls.forEach(call => {
          const callAssistantId = (call as Record<string, unknown>).assistant_id as string | undefined;
          const metadataAssistantId = call.metadata?.assistantId as string | undefined;
          const assistantId = callAssistantId || metadataAssistantId;
          if (assistantId) {
            counts.set(assistantId, (counts.get(assistantId) || 0) + 1);
          }
        });
        
        return {
          byAssistantId: Object.fromEntries(counts),
          withoutAssistantId: noAssistantIdCount,
          expectedAssistantId: userAssistantId
        };
      })() : null
    };

    // Show ALL calls - don't filter by caller_name
    // Calls without caller_name will display phone number or "Unknown" in UI
    // Previously we filtered out calls without caller_name, but this hid
    // international calls that didn't match any lead in the database

    if (error) {
      console.error("Error fetching calls:", error);
      const errorMessage = (error as { message?: string })?.message || String(error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch calls", details: errorMessage },
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
      debug: debugInfo, // Include debug info for client-side logging
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
