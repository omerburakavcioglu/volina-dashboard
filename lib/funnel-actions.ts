/**
 * Funnel action executors — actually call VAPI and send WhatsApp messages.
 * Used by the funnel cron (/api/cron/funnel).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { validateAndNormalize, DEFAULT_CALLER_ID } from "@/lib/phone-utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY || "";
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || "";
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || "";

interface FunnelProfile {
  vapi_assistant_id?: string | null;
  vapi_phone_number_id?: string | null;
  vapi_private_key?: string | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_access_token?: string | null;
  company_name?: string | null;
  phone?: string | null;
}

interface SchedulePayload {
  lead_id?: string;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  lead_language?: string;
  stage_name?: string;
  [key: string]: unknown;
}

interface ActionResult {
  success: boolean;
  error?: string;
  vapi_call_id?: string;
  wa_message_id?: string;
}

// ─── VAPI Call ──────────────────────────────────────────

export async function executeFunnelCall(
  schedule: { id: string; action_type: string; user_id: string; funnel_lead_id: string; payload: SchedulePayload },
  profile: FunnelProfile,
): Promise<ActionResult> {
  // Trim everywhere: Vercel/Supabase copy-paste often adds trailing \n which breaks VAPI UUID validation.
  const assistantId = (profile.vapi_assistant_id || VAPI_ASSISTANT_ID).trim();
  const phoneNumberId = (profile.vapi_phone_number_id || VAPI_PHONE_NUMBER_ID).trim();
  const apiKey = (profile.vapi_private_key?.trim() || VAPI_API_KEY.trim() || "");

  if (phoneNumberId === "placeholder-update-me" || phoneNumberId.startsWith("placeholder")) {
    return {
      success: false,
      error:
        "VAPI_PHONE_NUMBER_ID is still a placeholder. Set a real phone number UUID in Vercel env or profiles.vapi_phone_number_id.",
    };
  }

  if (!apiKey || !assistantId || !phoneNumberId) {
    return { success: false, error: "VAPI not configured (missing assistantId, phoneNumberId, or apiKey)" };
  }

  const rawPhone = schedule.payload.lead_phone;
  if (!rawPhone) {
    return { success: false, error: "No phone number in schedule payload" };
  }

  let normalizedPhone: string;
  try {
    const defaultRegion = schedule.payload.lead_language === "en" ? "US" : "TR";
    normalizedPhone = validateAndNormalize(rawPhone, defaultRegion);
  } catch (err) {
    return { success: false, error: `Phone normalization failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const vapiPayload = {
    assistantId,
    phoneNumberId,
    customer: {
      number: normalizedPhone,
      name: schedule.payload.lead_name || "Patient",
    },
    metadata: {
      lead_id: schedule.payload.lead_id,
      user_id: schedule.user_id,
      funnel_lead_id: schedule.funnel_lead_id,
      schedule_id: schedule.id,
      action_type: schedule.action_type,
      source: "funnel",
      language: schedule.payload.lead_language || "en",
      original_phone: rawPhone,
      normalized_phone: normalizedPhone,
      caller_id: DEFAULT_CALLER_ID,
    },
  };

  console.log(`[funnel-action] Making ${schedule.action_type} call:`, {
    to: normalizedPhone,
    assistantId,
    phoneNumberId,
    funnel_lead_id: schedule.funnel_lead_id,
    schedule_id: schedule.id,
  });

  try {
    const response = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vapiPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[funnel-action] VAPI call error:", errorData);
      return { success: false, error: errorData.message || response.statusText };
    }

    const callData = await response.json();
    console.log(`[funnel-action] Call initiated: vapi_call_id=${callData.id}`);
    return { success: true, vapi_call_id: callData.id };
  } catch (err) {
    console.error("[funnel-action] VAPI call exception:", err);
    return { success: false, error: String(err) };
  }
}

// ─── WhatsApp Message ───────────────────────────────────

export async function executeFunnelWhatsApp(
  supabase: SupabaseClient,
  schedule: { id: string; user_id: string; funnel_lead_id: string; payload: SchedulePayload },
  profile: FunnelProfile,
): Promise<ActionResult> {
  const waPhoneNumberId = profile.whatsapp_phone_number_id;
  const waAccessToken = profile.whatsapp_access_token;

  if (!waPhoneNumberId || !waAccessToken) {
    return { success: false, error: "WhatsApp not configured (missing phone_number_id or access_token on profile)" };
  }

  const leadPhone = schedule.payload.lead_phone;
  if (!leadPhone) {
    return { success: false, error: "No phone number in schedule payload" };
  }

  const stageName = schedule.payload.stage_name;
  if (!stageName) {
    return { success: false, error: "No stage_name in schedule payload" };
  }

  const { data: template } = await (supabase as any)
    .from("funnel_message_templates")
    .select("content, variables")
    .eq("user_id", schedule.user_id)
    .eq("stage_name", stageName)
    .eq("channel", "whatsapp")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!template?.content) {
    return { success: false, error: `No active WhatsApp template found for stage ${stageName}` };
  }

  let message: string = template.content;
  message = message.replace(/\{\{lead_name\}\}/g, schedule.payload.lead_name || "there");
  message = message.replace(/\{\{clinic_name\}\}/g, profile.company_name || "our clinic");

  let normalizedTo = leadPhone.replace(/[\s\-\(\)]/g, "");
  if (normalizedTo.startsWith("+")) {
    normalizedTo = normalizedTo.substring(1);
  }

  console.log(`[funnel-action] Sending WhatsApp to ${normalizedTo} for stage ${stageName}`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${waPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedTo,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const waData = await response.json();

    if (!response.ok) {
      console.error("[funnel-action] WhatsApp API error:", waData);
      return { success: false, error: waData.error?.message || "WhatsApp API error" };
    }

    const messageId = waData.messages?.[0]?.id || null;
    console.log(`[funnel-action] WhatsApp sent: message_id=${messageId}`);
    return { success: true, wa_message_id: messageId };
  } catch (err) {
    console.error("[funnel-action] WhatsApp exception:", err);
    return { success: false, error: String(err) };
  }
}

// ─── Live Transfer Notification ─────────────────────────

export async function executeFunnelLiveTransferNotification(
  schedule: { id: string; user_id: string; funnel_lead_id: string; payload: SchedulePayload },
  profile: FunnelProfile,
): Promise<ActionResult> {
  const waPhoneNumberId = profile.whatsapp_phone_number_id;
  const waAccessToken = profile.whatsapp_access_token;

  if (!waPhoneNumberId || !waAccessToken) {
    console.warn("[funnel-action] WhatsApp not configured for live transfer notification, logging only");
    return { success: true, error: "WhatsApp not configured — notification logged only" };
  }

  const clinicPhone = profile.phone;
  if (!clinicPhone) {
    console.warn("[funnel-action] No clinic phone for live transfer notification, logging only");
    return { success: true, error: "No clinic phone — notification logged only" };
  }

  const leadName = schedule.payload.lead_name || "A patient";
  const leadPhone = schedule.payload.lead_phone || "unknown";
  const message = `🔔 Live Transfer Request\n\n${leadName} (${leadPhone}) is ready to talk.\nPlease call them as soon as possible.`;

  let normalizedTo = clinicPhone.replace(/[\s\-\(\)]/g, "");
  if (normalizedTo.startsWith("+")) {
    normalizedTo = normalizedTo.substring(1);
  }

  console.log(`[funnel-action] Sending live transfer notification to clinic: ${normalizedTo}`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${waPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedTo,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const waData = await response.json();

    if (!response.ok) {
      console.error("[funnel-action] Live transfer notification error:", waData);
      return { success: false, error: waData.error?.message || "WhatsApp API error" };
    }

    return { success: true, wa_message_id: waData.messages?.[0]?.id || undefined };
  } catch (err) {
    console.error("[funnel-action] Live transfer notification exception:", err);
    return { success: false, error: String(err) };
  }
}
