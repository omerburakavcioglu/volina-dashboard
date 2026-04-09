import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { executeFunnelCall } from "@/lib/funnel-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST: manually trigger one pending call and return the exact error/result
export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get the first pending ai_call schedule
  const { data: pending } = await (supabase as any)
    .from("funnel_schedules")
    .select("*, funnel_leads(id, lead_id, user_id, metadata, current_stage_id)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("action_type", "ai_call")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!pending) {
    return NextResponse.json({ error: "No pending ai_call schedules found" });
  }

  // Load profile via RPC to bypass PostgREST column cache
  const { data: profile } = await (supabase as any)
    .rpc("get_vapi_config", { p_user_id: userId });

  const effAssistant = (profile?.vapi_assistant_id || process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || "").trim();
  const effPhoneId = (profile?.vapi_phone_number_id || process.env.VAPI_PHONE_NUMBER_ID || "").trim();
  const vapiDiag = {
    profile_vapi_assistant_id: profile?.vapi_assistant_id || null,
    profile_vapi_phone_number_id: profile?.vapi_phone_number_id || null,
    profile_vapi_private_key_length: profile?.vapi_private_key ? profile.vapi_private_key.length : 0,
    env_VAPI_PRIVATE_KEY_length: process.env.VAPI_PRIVATE_KEY?.length || 0,
    env_VAPI_ASSISTANT_ID: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || null,
    env_VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID || null,
    effective_assistant_id_trimmed: effAssistant || null,
    effective_phone_number_id_trimmed: effPhoneId || null,
    lead_phone_in_payload: pending.payload?.lead_phone || null,
  };

  // Attempt to make the actual call
  const scheduleArg = {
    id: pending.id,
    action_type: pending.action_type,
    user_id: userId,
    funnel_lead_id: pending.funnel_leads?.id || pending.funnel_lead_id,
    payload: pending.payload || {},
  };

  const result = await executeFunnelCall(scheduleArg, profile || {});

  return NextResponse.json({
    schedule_id: pending.id,
    vapi_diagnostics: vapiDiag,
    call_result: result,
  });
}

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

  // 4. Check profile VAPI fields via RPC (bypasses PostgREST column cache)
  const { data: profile, error: profErr } = await (supabase as any)
    .rpc("get_vapi_config", { p_user_id: userId });

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
