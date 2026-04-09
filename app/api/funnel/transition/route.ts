import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { transitionFunnelLead } from "@/lib/funnel-engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/funnel/transition?userId=...
 * body: { funnelLeadId, targetStage, branch? }
 *
 * Manual stage transition — used by clinic staff to confirm treatment started,
 * or to manually move a lead between stages.
 */
export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const body = await request.json();
  const { funnelLeadId, targetStage, branch } = body as {
    funnelLeadId: string;
    targetStage: string;
    branch?: string | null;
  };

  if (!funnelLeadId || !targetStage) {
    return NextResponse.json(
      { error: "funnelLeadId and targetStage are required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: funnelLead } = await (supabase as any)
    .from("funnel_leads")
    .select("id, user_id, current_stage_id, branch, funnel_stages!inner(name)")
    .eq("id", funnelLeadId)
    .eq("user_id", userId)
    .single();

  if (!funnelLead) {
    return NextResponse.json({ error: "Funnel lead not found" }, { status: 404 });
  }

  const { data: funnelConfig } = await (supabase as any)
    .from("funnel_config")
    .select("calling_hours_start, calling_hours_end")
    .eq("user_id", userId)
    .single();

  const chStart = funnelConfig?.calling_hours_start || "09:00";
  const chEnd = funnelConfig?.calling_hours_end || "20:00";

  const fromStage = (funnelLead as any).funnel_stages?.name || "unknown";
  const nextBranch = branch !== undefined ? branch : funnelLead.branch;

  const success = await transitionFunnelLead(
    supabase as any,
    funnelLeadId,
    userId,
    targetStage,
    nextBranch,
    chStart,
    chEnd
  );

  if (!success) {
    return NextResponse.json(
      { error: `Failed to transition to ${targetStage}` },
      { status: 500 }
    );
  }

  await (supabase as any).from("funnel_events").insert({
    user_id: userId,
    funnel_lead_id: funnelLeadId,
    event_type: "manual_move",
    from_stage_id: funnelLead.current_stage_id,
    payload: {
      from_stage: fromStage,
      to_stage: targetStage,
      reason: "manual_transition",
    },
    actor: "clinic_staff",
  });

  return NextResponse.json({
    success: true,
    message: `Lead transitioned from ${fromStage} to ${targetStage}`,
  });
}
