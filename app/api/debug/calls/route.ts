import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Debug endpoint to check all calls without filters
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Get user's assistant_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("vapi_assistant_id")
      .eq("id", userId)
      .single() as { data: { vapi_assistant_id?: string | null } | null };

    // Get ALL calls for this user (no assistant filter)
    const { data: allCalls, error } = await supabase
      .from("calls")
      .select("id, created_at, assistant_id, caller_name")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }) as { data: { id: string; created_at: string; assistant_id: string | null; caller_name: string | null }[] | null; error: any };

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by assistant_id
    const byAssistant: Record<string, number> = {};
    const dateRange: Record<string, { oldest: string; newest: string }> = {};
    
    allCalls?.forEach(call => {
      const aid = call.assistant_id || "NO_ASSISTANT_ID";
      byAssistant[aid] = (byAssistant[aid] || 0) + 1;
      
      if (!dateRange[aid]) {
        dateRange[aid] = { oldest: call.created_at, newest: call.created_at };
      } else {
        dateRange[aid].newest = call.created_at;
      }
    });

    return NextResponse.json({
      userAssistantId: profile?.vapi_assistant_id,
      totalCallsInDb: allCalls?.length || 0,
      oldestCall: allCalls?.[0]?.created_at,
      newestCall: allCalls?.[allCalls.length - 1]?.created_at,
      byAssistantId: byAssistant,
      dateRangeByAssistant: dateRange,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
