import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  transitionFunnelLead,
  calculateNextCallSlot,
  TIME_TRANSITIONS,
} from "@/lib/funnel-engine";

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
  let transitionsProcessed = 0;

  // =============================================
  // PART 1: Process pending scheduled actions
  // =============================================

  const { data: pendingActions } = await (supabase as any)
    .from("funnel_schedules")
    .select("*, funnel_leads(id, lead_id, user_id, metadata, current_stage_id)")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .limit(100);

  for (const action of (pendingActions || []) as any[]) {
    const funnelLead = action.funnel_leads;
    if (!funnelLead) continue;

    const { data: config } = await (supabase as any)
      .from("funnel_config")
      .select("is_running, daily_call_limit, calling_hours_start, calling_hours_end")
      .eq("user_id", funnelLead.user_id)
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
        .eq("user_id", funnelLead.user_id)
        .eq("status", "completed")
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

    await (supabase as any)
      .from("funnel_schedules")
      .update({ status: "processing" })
      .eq("id", action.id);

    try {
      const eventType =
        action.action_type === "whatsapp_message"
          ? "whatsapp_sent"
          : action.action_type === "live_transfer_alert"
            ? "live_transfer"
            : "call_made";

      await (supabase as any).from("funnel_events").insert({
        user_id: funnelLead.user_id,
        funnel_lead_id: funnelLead.id,
        event_type: eventType,
        to_stage_id: action.stage_id,
        payload: { action_type: action.action_type, schedule_id: action.id },
        actor: "system",
      });

      await (supabase as any)
        .from("funnel_schedules")
        .update({ status: "completed", executed_at: now.toISOString() })
        .eq("id", action.id);

      actionsProcessed++;
    } catch (error) {
      console.error(`[cron/funnel] Action ${action.id} failed:`, error);
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
          .update({ status: "failed" })
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
    transitions_processed: transitionsProcessed,
    timestamp: now.toISOString(),
  });
}
