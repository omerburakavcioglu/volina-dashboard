import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { inferTimezoneFromPhone } from "@/lib/phone-utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const body = await request.json();
  const {
    leadIds,
    dailyCallLimit = 50,
    callingHoursStart = "09:00",
    callingHoursEnd = "20:00",
  } = body;

  const supabase = createAdminClient();

  // 1. Upsert funnel_config
  await (supabase as any).from("funnel_config").upsert(
    {
      user_id: userId,
      is_running: true,
      daily_call_limit: dailyCallLimit,
      calling_hours_start: callingHoursStart,
      calling_hours_end: callingHoursEnd,
      started_at: new Date().toISOString(),
      paused_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // 2. Get leads to process
  let excludeIds: string[] = [];

  if (leadIds && leadIds.length > 0) {
    // Specific leads requested
  } else {
    const { data: existing } = await (supabase as any)
      .from("funnel_leads")
      .select("lead_id")
      .eq("user_id", userId)
      .in("status", ["active", "paused"]);

    excludeIds = (existing || []).map((e: { lead_id: string }) => e.lead_id);
  }

  let leadsQuery = (supabase as any)
    .from("leads")
    .select("id, phone, full_name, email, language")
    .eq("user_id", userId)
    .eq("status", "new");

  if (leadIds && leadIds.length > 0) {
    leadsQuery = leadsQuery.in("id", leadIds);
  } else if (excludeIds.length > 0) {
    leadsQuery = leadsQuery.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data: leads, error: leadsError } = await leadsQuery;
  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No new leads to process",
      count: 0,
    });
  }

  // 3. Get DAY0_AI_CALL stage
  const { data: day0Stage } = await (supabase as any)
    .from("funnel_stages")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "DAY0_AI_CALL")
    .single();

  if (!day0Stage) {
    return NextResponse.json(
      { error: "Funnel stages not seeded. Run the migration seed function first." },
      { status: 400 }
    );
  }

  // 4. Batch-insert funnel_leads, events, and schedules
  let processed = 0;

  for (const lead of leads) {
    const leadTz = inferTimezoneFromPhone(lead.phone);

    const { data: funnelLead, error: insertError } = await (supabase as any)
      .from("funnel_leads")
      .insert({
        user_id: userId,
        lead_id: lead.id,
        current_stage_id: day0Stage.id,
        status: "active",
        branch: "main",
        entered_funnel_at: new Date().toISOString(),
        entered_current_stage_at: new Date().toISOString(),
        next_action_type: "ai_call",
        metadata: { timezone: leadTz },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(`[funnel/start] Error inserting lead ${lead.id}:`, insertError.message);
      continue;
    }

    await (supabase as any).from("funnel_events").insert({
      user_id: userId,
      funnel_lead_id: funnelLead.id,
      event_type: "stage_entered",
      to_stage_id: day0Stage.id,
      payload: { source: "funnel_start", lead_name: lead.full_name },
      actor: "system",
    });

    const callTime = new Date().toISOString();

    await (supabase as any).from("funnel_schedules").insert({
      user_id: userId,
      funnel_lead_id: funnelLead.id,
      stage_id: day0Stage.id,
      action_type: "ai_call",
      scheduled_at: callTime,
      lead_timezone: leadTz,
      status: "pending",
      payload: {
        lead_id: lead.id,
        lead_name: lead.full_name,
        lead_phone: lead.phone,
        lead_email: lead.email || "",
        lead_language: lead.language || "en",
      },
    });

    await (supabase as any).from("funnel_leads").update({
      next_action_at: callTime,
    }).eq("id", funnelLead.id);

    processed++;
  }

  return NextResponse.json({
    success: true,
    message: `Started funnel for ${processed} leads`,
    count: processed,
  });
}
