import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EVENT_DESCRIPTIONS: Record<string, string> = {
  stage_entered: "moved to",
  call_made: "AI called",
  call_result: "Call result for",
  whatsapp_sent: "WhatsApp sent to",
  whatsapp_response: "WhatsApp response from",
  live_transfer: "Live transfer for",
  alert: "Alert for",
  manual_move: "Manually moved",
  archived: "Archived",
};

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: events, error } = await (supabase as any)
    .from("funnel_events")
    .select(`
      id,
      event_type,
      funnel_lead_id,
      from_stage_id,
      to_stage_id,
      payload,
      actor,
      created_at,
      funnel_leads!inner(lead_id, leads!inner(full_name)),
      to_stage:funnel_stages!funnel_events_to_stage_id_fkey(display_name)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[funnel/activity] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (events || []).map((evt: Record<string, unknown>) => {
    const funnelLead = evt.funnel_leads as { lead_id: string; leads: { full_name: string } } | null;
    const toStage = evt.to_stage as { display_name: string } | null;
    const leadName = funnelLead?.leads?.full_name || "Unknown";
    const stageName = toStage?.display_name || null;
    const eventType = evt.event_type as string;
    const prefix = EVENT_DESCRIPTIONS[eventType] || eventType;
    const description = stageName ? `${prefix} ${leadName} — ${stageName}` : `${prefix} ${leadName}`;

    return {
      id: evt.id,
      event_type: eventType,
      lead_name: leadName,
      lead_id: funnelLead?.lead_id || null,
      funnel_lead_id: evt.funnel_lead_id,
      stage_name: stageName,
      description,
      created_at: evt.created_at,
    };
  });

  return NextResponse.json({ success: true, items });
}
