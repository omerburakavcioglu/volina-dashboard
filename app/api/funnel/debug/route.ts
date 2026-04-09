import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  // 1. Check funnel_config
  const { data: config, error: configErr } = await (supabase as any)
    .from("funnel_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  // 2. Check funnel_schedules
  const { data: allSchedules, error: schedErr } = await (supabase as any)
    .from("funnel_schedules")
    .select("id, action_type, status, scheduled_at, executed_at, retry_count, payload, funnel_lead_id, lead_timezone, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  // 3. Check pending schedules that cron SHOULD pick up
  const { data: pendingNow, error: pendErr } = await (supabase as any)
    .from("funnel_schedules")
    .select("id, action_type, status, scheduled_at, payload, funnel_lead_id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .limit(10);

  // 4. Check profile VAPI fields
  const { data: profile, error: profErr } = await (supabase as any)
    .from("profiles")
    .select("id, vapi_assistant_id, vapi_phone_number_id, vapi_private_key, whatsapp_phone_number_id, whatsapp_access_token, company_name, phone")
    .eq("id", userId)
    .single();

  const vapiStatus = {
    has_assistant_id: !!profile?.vapi_assistant_id,
    has_phone_number_id: !!profile?.vapi_phone_number_id,
    has_private_key: !!profile?.vapi_private_key,
    env_VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
    env_VAPI_ASSISTANT_ID: !!process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID,
    env_VAPI_PHONE_NUMBER_ID: !!process.env.VAPI_PHONE_NUMBER_ID,
    env_CRON_SECRET_set: !!process.env.CRON_SECRET,
  };

  // 5. Check funnel_leads
  const { data: funnelLeads } = await (supabase as any)
    .from("funnel_leads")
    .select("id, lead_id, status, branch, current_stage_id, entered_current_stage_at, next_action_type, next_action_at, metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(10);

  // 6. Try the cron join query to see if it works
  const { data: cronSimulation, error: cronErr } = await (supabase as any)
    .from("funnel_schedules")
    .select("*, funnel_leads(id, lead_id, user_id, metadata, current_stage_id)")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .limit(5);

  return NextResponse.json({
    timestamp: now.toISOString(),
    config: config || { error: configErr?.message },
    vapi_status: vapiStatus,
    funnel_leads_active: funnelLeads?.length ?? 0,
    funnel_leads: funnelLeads,
    all_schedules: allSchedules || { error: schedErr?.message },
    pending_ready_now: pendingNow || { error: pendErr?.message },
    cron_join_simulation: cronSimulation || { error: cronErr?.message },
    cron_join_error: cronErr?.message || null,
  });
}
