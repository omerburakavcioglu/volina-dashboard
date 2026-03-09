import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get all stages
  const { data: stages, error: stagesError } = await (supabase as any)
    .from("funnel_stages")
    .select("*")
    .eq("user_id", userId)
    .order("position_order", { ascending: true });

  if (stagesError) {
    return NextResponse.json({ error: stagesError.message }, { status: 500 });
  }

  // Get lead counts per stage
  const { data: funnelLeads } = await (supabase as any)
    .from("funnel_leads")
    .select("current_stage_id")
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  const countMap: Record<string, number> = {};
  for (const fl of funnelLeads || []) {
    const sid = (fl as { current_stage_id: string }).current_stage_id;
    countMap[sid] = (countMap[sid] || 0) + 1;
  }

  const stagesWithCounts = (stages || []).map((s: Record<string, unknown>) => ({
    ...s,
    lead_count: countMap[s.id as string] || 0,
  }));

  // Get transitions
  const { data: transitions } = await (supabase as any)
    .from("funnel_transitions")
    .select("*")
    .eq("user_id", userId);

  return NextResponse.json({
    success: true,
    stages: stagesWithCounts,
    transitions: transitions || [],
  });
}
