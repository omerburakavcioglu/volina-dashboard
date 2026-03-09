import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import type { SimpleStageSummary, FunnelMetrics, FunnelStatsResponse } from "@/lib/types-funnel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SIMPLE_STAGE_META: Record<string, { label: string; color: string; order: number }> = {
  new: { label: "New", color: "#EC4899", order: 1 },
  contacting: { label: "Contacting", color: "#F59E0B", order: 2 },
  nurturing: { label: "Nurturing", color: "#8B5CF6", order: 3 },
  ready: { label: "Ready", color: "#F97316", order: 4 },
  in_treatment: { label: "In Treatment", color: "#3B82F6", order: 5 },
  loyal: { label: "Loyal", color: "#10B981", order: 6 },
};

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get all active/paused funnel_leads with their stage's simple_stage
  const { data: funnelLeads } = await (supabase as any)
    .from("funnel_leads")
    .select("id, status, current_stage_id, funnel_stages!inner(simple_stage)")
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  const leads = (funnelLeads || []) as Array<{
    id: string;
    status: string;
    current_stage_id: string;
    funnel_stages: { simple_stage: string };
  }>;

  // Count by simple_stage
  const counts: Record<string, number> = {};
  for (const lead of leads) {
    const ss = lead.funnel_stages.simple_stage;
    counts[ss] = (counts[ss] || 0) + 1;
  }

  const totalActive = leads.length;

  // Build bucket summaries
  const buckets: SimpleStageSummary[] = Object.entries(SIMPLE_STAGE_META).map(
    ([stage, meta]) => ({
      stage: stage as SimpleStageSummary["stage"],
      label: meta.label,
      count: counts[stage] || 0,
      percentage: totalActive > 0 ? Math.round(((counts[stage] || 0) / totalActive) * 100) : 0,
      trend: 0,
      color: meta.color,
    })
  );

  buckets.sort((a, b) => {
    const am = SIMPLE_STAGE_META[a.stage];
    const bm = SIMPLE_STAGE_META[b.stage];
    return (am?.order || 0) - (bm?.order || 0);
  });

  // Archived count
  const { count: archivedCount } = await (supabase as any)
    .from("funnel_leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "archived");

  // Calls today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: callsToday } = await (supabase as any)
    .from("funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "call_made")
    .gte("created_at", todayStart.toISOString());

  // Responses last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const { count: responses7d } = await (supabase as any)
    .from("funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("event_type", ["whatsapp_response", "call_result"])
    .gte("created_at", weekAgo.toISOString());

  // Conversions (leads in ready + in_treatment + loyal)
  const conversionStages = ["ready", "in_treatment", "loyal"];
  const conversions = leads.filter((l) =>
    conversionStages.includes(l.funnel_stages.simple_stage)
  ).length;

  const metrics: FunnelMetrics = {
    active_leads: totalActive,
    calls_today: callsToday || 0,
    responses_7d: responses7d || 0,
    conversions,
  };

  const response: FunnelStatsResponse = {
    buckets,
    metrics,
    archived_count: archivedCount || 0,
    unreachable_count: 0,
  };

  return NextResponse.json({ success: true, ...response });
}
