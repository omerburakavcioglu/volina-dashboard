import { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Stage → actions to schedule when a lead enters that stage
const STAGE_ENTRY_ACTIONS: Record<string, Array<{ action_type: string; delay_days: number }>> = {
  DAY0_AI_CALL: [{ action_type: "ai_call", delay_days: 0 }],
  NO_ANSWER_WHATSAPP_INTRO: [{ action_type: "whatsapp_message", delay_days: 0 }],
  NO_ANSWER_DAY1: [{ action_type: "whatsapp_message", delay_days: 0 }],
  NO_ANSWER_DAY2: [{ action_type: "whatsapp_message", delay_days: 0 }],
  NO_ANSWER_DAY15: [{ action_type: "whatsapp_message", delay_days: 0 }],
  SOFT_FOLLOWUP: [{ action_type: "whatsapp_message", delay_days: 0 }],
  HARD_RE_ENGAGEMENT: [{ action_type: "whatsapp_message", delay_days: 0 }],
  HARD_REACQUISITION_CALL: [{ action_type: "ai_call", delay_days: 0 }],
  LIVE_TRANSFER: [{ action_type: "live_transfer_alert", delay_days: 0 }],
  POST_TREATMENT_DAY7: [{ action_type: "satisfaction_call", delay_days: 0 }],
  REVIEW_AND_REFERRAL: [{ action_type: "whatsapp_message", delay_days: 0 }],
  POST_TREATMENT_DAY30: [{ action_type: "check_in_call", delay_days: 0 }],
  DAY60_STILL_HERE: [{ action_type: "whatsapp_message", delay_days: 0 }],
};

// Time-based automatic transitions (from → to after N days)
export const TIME_TRANSITIONS: Array<{ from: string; to: string; days: number }> = [
  { from: "NO_ANSWER_WHATSAPP_INTRO", to: "NO_ANSWER_DAY1", days: 1 },
  { from: "NO_ANSWER_DAY1", to: "NO_ANSWER_DAY2", days: 1 },
  { from: "NO_ANSWER_DAY2", to: "NO_ANSWER_DAY15", days: 13 },
  { from: "NO_ANSWER_DAY15", to: "SOFT_FOLLOWUP", days: 0 },
  { from: "HARD_RE_ENGAGEMENT", to: "HARD_REACQUISITION_CALL", days: 2 },
  { from: "TREATMENT", to: "POST_TREATMENT_DAY7", days: 7 },
  { from: "REVIEW_AND_REFERRAL", to: "POST_TREATMENT_DAY30", days: 23 },
  { from: "POST_TREATMENT_DAY30", to: "RECOVERY_MANAGEMENT", days: 0 },
  { from: "RECOVERY_MANAGEMENT", to: "LOYAL", days: 30 },
];

export function getActionsForStage(stageName: string): Array<{ action_type: string; delay_days: number }> {
  return STAGE_ENTRY_ACTIONS[stageName] || [];
}

/**
 * Compute the next valid call slot respecting timezone and calling hours.
 * Returns an ISO string.
 */
export function calculateNextCallSlot(
  leadTimezone: string | null,
  startHour: string,
  endHour: string,
): string {
  const tz = leadTimezone || "Europe/London";
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    const minutePart = parts.find((p) => p.type === "minute");
    const localHour = parseInt(hourPart?.value || "0", 10);
    const localMinute = parseInt(minutePart?.value || "0", 10);
    const localMinutes = localHour * 60 + localMinute;

    const startParts = startHour.split(":").map(Number);
    const endParts = endHour.split(":").map(Number);
    const startMinutes = (startParts[0] ?? 9) * 60 + (startParts[1] ?? 0);
    const endMinutes = (endParts[0] ?? 20) * 60 + (endParts[1] ?? 0);

    if (localMinutes >= startMinutes && localMinutes < endMinutes) {
      const offsetMin = Math.floor(Math.random() * 30);
      return new Date(now.getTime() + offsetMin * 60_000).toISOString();
    }

    if (localMinutes < startMinutes) {
      const diffMin = startMinutes - localMinutes + Math.floor(Math.random() * 15);
      return new Date(now.getTime() + diffMin * 60_000).toISOString();
    }

    const minutesToMidnight = 1440 - localMinutes;
    const totalMin = minutesToMidnight + startMinutes + Math.floor(Math.random() * 15);
    return new Date(now.getTime() + totalMin * 60_000).toISOString();
  } catch {
    const offsetMin = Math.floor(Math.random() * 30);
    return new Date(now.getTime() + offsetMin * 60_000).toISOString();
  }
}

/**
 * Transition a funnel lead to a new stage.
 * Cancels pending schedules, updates the lead, logs events, and schedules next actions.
 */
export async function transitionFunnelLead(
  supabase: SupabaseClient,
  funnelLeadId: string,
  userId: string,
  nextStageName: string,
  nextBranch: string | null,
  callingHoursStart = "09:00",
  callingHoursEnd = "20:00",
): Promise<boolean> {
  const { data: nextStage } = await (supabase as any)
    .from("funnel_stages")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", nextStageName)
    .single();

  if (!nextStage) {
    console.error(`[funnel-engine] Stage not found: ${nextStageName}`);
    return false;
  }

  const { data: currentLead } = await (supabase as any)
    .from("funnel_leads")
    .select("id, current_stage_id, lead_id, metadata")
    .eq("id", funnelLeadId)
    .single();

  if (!currentLead) return false;

  await (supabase as any)
    .from("funnel_schedules")
    .update({ status: "cancelled" })
    .eq("funnel_lead_id", funnelLeadId)
    .eq("status", "pending");

  const updateData: Record<string, unknown> = {
    current_stage_id: nextStage.id,
    entered_current_stage_at: new Date().toISOString(),
    branch: nextBranch,
    updated_at: new Date().toISOString(),
  };

  if (nextStageName === "TREATMENT") {
    updateData.treatment_date = new Date().toISOString();
  }
  if (nextStageName === "ARCHIVE_GDPR") {
    updateData.status = "archived";
  }
  if (nextStageName === "LOYAL") {
    updateData.status = "completed";
  }

  await (supabase as any).from("funnel_leads").update(updateData).eq("id", funnelLeadId);

  await (supabase as any).from("funnel_events").insert({
    user_id: userId,
    funnel_lead_id: funnelLeadId,
    event_type: "stage_entered",
    from_stage_id: currentLead.current_stage_id,
    to_stage_id: nextStage.id,
    payload: { previous_branch: (currentLead.metadata as Record<string, unknown>)?.branch, new_branch: nextBranch },
    actor: "system",
  });

  const actions = getActionsForStage(nextStageName);
  const leadTz = (currentLead.metadata as Record<string, unknown>)?.timezone as string || "Europe/London";

  for (const action of actions) {
    const scheduledAt =
      action.delay_days === 0
        ? action.action_type.includes("call")
          ? calculateNextCallSlot(leadTz, callingHoursStart, callingHoursEnd)
          : new Date().toISOString()
        : new Date(Date.now() + action.delay_days * 86_400_000).toISOString();

    await (supabase as any).from("funnel_schedules").insert({
      user_id: userId,
      funnel_lead_id: funnelLeadId,
      stage_id: nextStage.id,
      action_type: action.action_type,
      scheduled_at: scheduledAt,
      lead_timezone: leadTz,
      status: "pending",
      payload: {},
    });
  }

  const nextAction = actions[0];
  if (nextAction) {
    const nextActionAt =
      nextAction.delay_days === 0
        ? new Date().toISOString()
        : new Date(Date.now() + nextAction.delay_days * 86_400_000).toISOString();

    await (supabase as any).from("funnel_leads").update({
      next_action_at: nextActionAt,
      next_action_type: nextAction.action_type,
    }).eq("id", funnelLeadId);
  } else {
    await (supabase as any).from("funnel_leads").update({
      next_action_at: null,
      next_action_type: null,
    }).eq("id", funnelLeadId);
  }

  return true;
}

/**
 * Map a VAPI call result / evaluation outcome to a funnel condition type.
 */
export function mapCallResultToFunnelCondition(
  endedReason: string,
  evaluationOutcome?: string,
  evaluationScore?: number | null,
): "call_result_hard" | "call_result_soft" | "call_result_no_answer" {
  const reason = (endedReason || "").toLowerCase();

  if (
    reason.includes("no-answer") ||
    reason.includes("no_answer") ||
    reason === "customer-did-not-answer" ||
    reason.includes("voicemail") ||
    reason.includes("busy")
  ) {
    return "call_result_no_answer";
  }

  if (evaluationOutcome) {
    const o = evaluationOutcome.toLowerCase();
    if (o === "not_interested" || o === "rejected") return "call_result_hard";
    if (
      o === "interested" ||
      o === "appointment_set" ||
      o === "callback_requested"
    )
      return "call_result_soft";
  }

  if (evaluationScore !== null && evaluationScore !== undefined) {
    if (evaluationScore >= 5) return "call_result_soft";
    if (evaluationScore <= 3) return "call_result_hard";
  }

  if (reason === "customer-ended-call") return "call_result_hard";
  return "call_result_soft";
}
