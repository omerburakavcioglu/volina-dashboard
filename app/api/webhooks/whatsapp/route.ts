import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { transitionFunnelLead } from "@/lib/funnel-engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.CRON_SECRET || "";

/**
 * GET /api/webhooks/whatsapp
 * Meta webhook verification challenge.
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[whatsapp-webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp
 * Handles incoming WhatsApp messages from Meta Cloud API.
 * Classifies response sentiment and triggers funnel transitions.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) {
    return NextResponse.json({ success: true, message: "No messages in payload" });
  }

  const supabase = createAdminClient();

  for (const msg of messages) {
    const senderPhone = msg.from;
    const messageText = msg.text?.body || "";
    const messageType = msg.type;

    if (!senderPhone || messageType !== "text" || !messageText.trim()) {
      continue;
    }

    let normalizedPhone = senderPhone;
    if (!normalizedPhone.startsWith("+")) {
      normalizedPhone = "+" + normalizedPhone;
    }

    const { data: leadMatches } = await (supabase as any)
      .from("leads")
      .select("id, user_id, full_name, phone")
      .or(`phone.eq.${normalizedPhone},phone.eq.${senderPhone},phone.eq.+${senderPhone}`)
      .limit(5);

    if (!leadMatches || leadMatches.length === 0) {
      console.log(`[whatsapp-webhook] No lead found for phone ${senderPhone}`);
      continue;
    }

    for (const lead of leadMatches as any[]) {
      const { data: funnelLead } = await (supabase as any)
        .from("funnel_leads")
        .select("id, user_id, current_stage_id, branch, metadata, funnel_stages!inner(name)")
        .eq("lead_id", lead.id)
        .eq("status", "active")
        .single();

      if (!funnelLead) continue;

      const fl = funnelLead as {
        id: string;
        user_id: string;
        current_stage_id: string;
        branch: string | null;
        metadata: Record<string, unknown>;
        funnel_stages: { name: string };
      };

      const currentStage = fl.funnel_stages.name;
      const respondableStages = [
        "SOFT_FOLLOWUP",
        "NO_ANSWER_WHATSAPP_INTRO",
        "NO_ANSWER_DAY1",
        "NO_ANSWER_DAY2",
        "NO_ANSWER_DAY15",
        "HARD_RE_ENGAGEMENT",
        "REVIEW_AND_REFERRAL",
        "DAY60_STILL_HERE",
      ];

      if (!respondableStages.includes(currentStage)) {
        console.log(`[whatsapp-webhook] Lead ${lead.id} in stage ${currentStage} — not a respondable stage, logging only`);
        await logWhatsAppResponse(supabase, fl, messageText, "logged");
        continue;
      }

      const sentiment = await classifyResponse(messageText, currentStage);

      await logWhatsAppResponse(supabase, fl, messageText, sentiment);

      const transition = getTransitionForResponse(currentStage, sentiment);
      if (transition) {
        const { data: funnelConfig } = await (supabase as any)
          .from("funnel_config")
          .select("calling_hours_start, calling_hours_end")
          .eq("user_id", fl.user_id)
          .single();

        const chStart = funnelConfig?.calling_hours_start || "09:00";
        const chEnd = funnelConfig?.calling_hours_end || "20:00";

        await transitionFunnelLead(
          supabase as any,
          fl.id,
          fl.user_id,
          transition.stage,
          transition.branch,
          chStart,
          chEnd,
        );

        console.log(`[whatsapp-webhook] Transitioned lead ${lead.id} from ${currentStage} to ${transition.stage} (${sentiment})`);
      }
    }
  }

  return NextResponse.json({ success: true });
}

async function logWhatsAppResponse(
  supabase: any,
  fl: { id: string; user_id: string; current_stage_id: string },
  messageText: string,
  sentiment: string,
) {
  await supabase.from("funnel_events").insert({
    user_id: fl.user_id,
    funnel_lead_id: fl.id,
    event_type: "whatsapp_response",
    from_stage_id: fl.current_stage_id,
    payload: {
      message_preview: messageText.substring(0, 200),
      sentiment,
    },
    actor: "lead",
  });
}

function getTransitionForResponse(
  currentStage: string,
  sentiment: string,
): { stage: string; branch: string | null } | null {
  if (sentiment === "positive") {
    if (["SOFT_FOLLOWUP", "HARD_RE_ENGAGEMENT", "DAY60_STILL_HERE"].includes(currentStage)) {
      return { stage: "LIVE_TRANSFER", branch: "main" };
    }
    if (currentStage.startsWith("NO_ANSWER")) {
      return { stage: "SOFT_FOLLOWUP", branch: "soft" };
    }
    if (currentStage === "REVIEW_AND_REFERRAL") {
      return null;
    }
  }

  if (sentiment === "negative") {
    if (currentStage === "HARD_RE_ENGAGEMENT") {
      return { stage: "ARCHIVE_GDPR", branch: null };
    }
    if (currentStage === "SOFT_FOLLOWUP") {
      return { stage: "HARD_WAITING", branch: "hard" };
    }
    if (currentStage.startsWith("NO_ANSWER")) {
      return { stage: "ARCHIVE_GDPR", branch: null };
    }
  }

  return null;
}

async function classifyResponse(
  messageText: string,
  currentStage: string,
): Promise<"positive" | "negative" | "uncertain"> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return heuristicClassify(messageText);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: "system",
            content: `You classify patient WhatsApp replies to a dental clinic. The patient is currently in the "${currentStage}" stage of a follow-up funnel. Respond with exactly one word: positive, negative, or uncertain.
- positive: interested, wants info, wants appointment, grateful, asks questions
- negative: not interested, asks to stop messaging, rejects, rude
- uncertain: unclear, vague, off-topic, single emoji`,
          },
          {
            role: "user",
            content: messageText,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[whatsapp-webhook] OpenAI classification failed:", response.status);
      return heuristicClassify(messageText);
    }

    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();

    if (answer === "positive" || answer === "negative" || answer === "uncertain") {
      return answer;
    }
    return "uncertain";
  } catch (err) {
    console.error("[whatsapp-webhook] OpenAI error:", err);
    return heuristicClassify(messageText);
  }
}

function heuristicClassify(text: string): "positive" | "negative" | "uncertain" {
  const lower = text.toLowerCase();
  const positiveKeywords = [
    "yes", "interested", "sure", "okay", "ok", "please", "appointment",
    "information", "info", "tell me", "want", "evet", "istiyorum", "tamam",
    "bilgi", "randevu",
  ];
  const negativeKeywords = [
    "no", "stop", "not interested", "don't", "remove", "unsubscribe",
    "hayır", "istemiyorum", "durdurun", "bırakın",
  ];

  if (positiveKeywords.some((kw) => lower.includes(kw))) return "positive";
  if (negativeKeywords.some((kw) => lower.includes(kw))) return "negative";
  return "uncertain";
}
