import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  transitionFunnelLead,
  calculateNextCallSlot,
  TIME_TRANSITIONS,
} from "@/lib/funnel-engine";
import {
  executeFunnelCall,
  executeFunnelWhatsApp,
  executeFunnelLiveTransferNotification,
} from "@/lib/funnel-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  let actionsProcessed = 0;
  let actionsFailed = 0;
  let transitionsProcessed = 0;

  // =============================================
  // PART 1: Process pending scheduled actions
  // =============================================

  const { data: pendingActions } = await (supabase as any)
    .from("funnel_schedules")
    .select("*, funnel_leads(id, lead_id, user_id, metadata, current_stage_id)")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .limit(50);

  const profileCache: Record<string, any> = {};

  for (const action of (pendingActions || []) as any[]) {
    const funnelLead = action.funnel_leads;
    if (!funnelLead) continue;

    const userId = funnelLead.user_id;

    const { data: config } = await (supabase as any)
      .from("funnel_config")
      .select("is_running, daily_call_limit, calling_hours_start, calling_hours_end")
      .eq("user_id", userId)
      .single();

    if (!config?.is_running) continue;

    const isCallAction =
      action.action_type === "ai_call" ||
      action.action_type === "satisfaction_call" ||
      action.action_type === "check_in_call";

    if (isCallAction) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count: todayCallCount } = await (supabase as any)
        .from("funnel_schedules")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["completed", "processing"])
        .in("action_type", ["ai_call", "satisfaction_call", "check_in_call"])
        .gte("executed_at", todayStart.toISOString());

      if ((todayCallCount || 0) >= config.daily_call_limit) {
        const nextSlot = calculateNextCallSlot(
          action.lead_timezone,
          config.calling_hours_start,
          config.calling_hours_end
        );
        await (supabase as any)
          .from("funnel_schedules")
          .update({ scheduled_at: nextSlot })
          .eq("id", action.id);
        continue;
      }
    }

    // Load profile once per user (cached)
    if (!profileCache[userId]) {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("vapi_assistant_id, vapi_phone_number_id, vapi_private_key, whatsapp_phone_number_id, whatsapp_access_token, company_name, phone")
        .eq("id", userId)
        .single();
      profileCache[userId] = profile || {};
    }
    const profile = profileCache[userId];

    // Ensure payload has lead info (backfill for schedules created before this update)
    const payload = action.payload || {};
    if (!payload.lead_phone && funnelLead.lead_id) {
      const { data: leadRec } = await (supabase as any)
        .from("leads")
        .select("phone, full_name, email, language")
        .eq("id", funnelLead.lead_id)
        .single();
      if (leadRec) {
        payload.lead_id = funnelLead.lead_id;
        payload.lead_name = leadRec.full_name || "Unknown";
        payload.lead_phone = leadRec.phone || "";
        payload.lead_email = leadRec.email || "";
        payload.lead_language = leadRec.language || "en";
      }
    }

    // Resolve stage_name if missing from payload
    if (!payload.stage_name && action.stage_id) {
      const { data: stageRec } = await (supabase as any)
        .from("funnel_stages")
        .select("name")
        .eq("id", action.stage_id)
        .single();
      if (stageRec) payload.stage_name = stageRec.name;
    }

    // Mark as processing
    await (supabase as any)
      .from("funnel_schedules")
      .update({ status: "processing" })
      .eq("id", action.id);

    const scheduleArg = {
      id: action.id,
      action_type: action.action_type,
      user_id: userId,
      funnel_lead_id: funnelLead.id,
      payload,
    };

    try {
      let result: { success: boolean; error?: string; vapi_call_id?: string; wa_message_id?: string };

      if (isCallAction) {
        result = await executeFunnelCall(scheduleArg, profile);
      } else if (action.action_type === "whatsapp_message") {
        result = await executeFunnelWhatsApp(supabase, scheduleArg, profile);
      } else if (action.action_type === "live_transfer_alert") {
        result = await executeFunnelLiveTransferNotification(scheduleArg, profile);
      } else {
        result = { success: false, error: `Unknown action_type: ${action.action_type}` };
      }

      if (result.success) {
        const eventType =
          action.action_type === "whatsapp_message"
            ? "whatsapp_sent"
            : action.action_type === "live_transfer_alert"
              ? "live_transfer"
              : "call_made";

        const eventPayload: Record<string, unknown> = {
          action_type: action.action_type,
          schedule_id: action.id,
          lead_name: payload.lead_name,
        };
        if (result.vapi_call_id) eventPayload.vapi_call_id = result.vapi_call_id;
        if (result.wa_message_id) eventPayload.wa_message_id = result.wa_message_id;

        await (supabase as any).from("funnel_events").insert({
          user_id: userId,
          funnel_lead_id: funnelLead.id,
          event_type: eventType,
          to_stage_id: action.stage_id,
          payload: eventPayload,
          actor: isCallAction ? "ai_agent" : "system",
        });

        if (isCallAction) {
          // For calls: keep status as "processing" — the VAPI webhook will mark it completed
          // and handle the stage transition based on call result.
          await (supabase as any)
            .from("funnel_schedules")
            .update({
              executed_at: now.toISOString(),
              payload: { ...payload, vapi_call_id: result.vapi_call_id },
            })
            .eq("id", action.id);
        } else {
          // For WhatsApp and live transfer: mark completed immediately
          await (supabase as any)
            .from("funnel_schedules")
            .update({ status: "completed", executed_at: now.toISOString() })
            .eq("id", action.id);
        }

        actionsProcessed++;
      } else {
        throw new Error(result.error || "Action failed");
      }
    } catch (error: any) {
      console.error(`[cron/funnel] Action ${action.id} failed:`, error?.message || error);
      actionsFailed++;
      if (action.retry_count < action.max_retries) {
        const retryAt = new Date(now.getTime() + 15 * 60_000).toISOString();
        await (supabase as any)
          .from("funnel_schedules")
          .update({
            status: "pending",
            retry_count: action.retry_count + 1,
            scheduled_at: retryAt,
          })
          .eq("id", action.id);
      } else {
        await (supabase as any)
          .from("funnel_schedules")
          .update({ status: "failed", executed_at: now.toISOString() })
          .eq("id", action.id);
      }
    }
  }

  // =============================================
  // PART 2: Process time-based transitions
  // =============================================

  for (const transition of TIME_TRANSITIONS) {
    if (transition.days < 0) continue;

    const cutoff = new Date(now.getTime() - transition.days * 86_400_000);

    const { data: leadsToTransition } = await (supabase as any)
      .from("funnel_leads")
      .select("id, user_id, branch, metadata, current_stage_id, funnel_stages!inner(name)")
      .eq("status", "active")
      .eq("funnel_stages.name", transition.from)
      .lte("entered_current_stage_at", cutoff.toISOString());

    for (const lead of (leadsToTransition || []) as any[]) {
      const { data: cfg } = await (supabase as any)
        .from("funnel_config")
        .select("is_running, calling_hours_start, calling_hours_end")
        .eq("user_id", lead.user_id)
        .single();

      if (!cfg?.is_running) continue;

      const success = await transitionFunnelLead(
        supabase,
        lead.id,
        lead.user_id,
        transition.to,
        lead.branch,
        cfg.calling_hours_start,
        cfg.calling_hours_end
      );

      if (success) transitionsProcessed++;
    }
  }

  // HARD_WAITING → HARD_RE_ENGAGEMENT using config.hard_waiting_days
  const { data: hardWaitLeads } = await (supabase as any)
    .from("funnel_leads")
    .select("id, user_id, branch, metadata, current_stage_id, entered_current_stage_at, funnel_stages!inner(name)")
    .eq("status", "active")
    .eq("funnel_stages.name", "HARD_WAITING");

  for (const lead of (hardWaitLeads || []) as any[]) {
    const { data: cfg } = await (supabase as any)
      .from("funnel_config")
      .select("is_running, hard_waiting_days, calling_hours_start, calling_hours_end")
      .eq("user_id", lead.user_id)
      .single();

    if (!cfg?.is_running) continue;

    const enteredAt = new Date(lead.entered_current_stage_at);
    const daysSince = (now.getTime() - enteredAt.getTime()) / 86_400_000;

    if (daysSince >= cfg.hard_waiting_days) {
      const success = await transitionFunnelLead(
        supabase,
        lead.id,
        lead.user_id,
        "HARD_RE_ENGAGEMENT",
        "hard",
        cfg.calling_hours_start,
        cfg.calling_hours_end
      );
      if (success) transitionsProcessed++;
    }
  }

  return NextResponse.json({
    success: true,
    actions_processed: actionsProcessed,
    actions_failed: actionsFailed,
    transitions_processed: transitionsProcessed,
    timestamp: now.toISOString(),
  });
}
