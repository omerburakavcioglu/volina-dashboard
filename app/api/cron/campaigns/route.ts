import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/*
 * Vercel Cron Job — runs every minute
 * Processes all "running" campaigns:
 *   1. Determines which day of the campaign we're on
 *   2. For "call" days: checks time slots, makes calls at the right interval
 *   3. For "whatsapp" days: sends messages at the scheduled time
 *   4. For "off" days: skips
 *   5. After day 7: marks campaign as completed
 */

// Turkey timezone offset (UTC+3)
function getTurkeyNow(): Date {
  const now = new Date();
  // Get UTC time, then add 3 hours for Turkey
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 3 * 3600000);
}

interface TimeSlot {
  id: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  callsPerSlot: number;
}

interface DayPlan {
  day: number;
  action: "call" | "whatsapp" | "off";
  timeSlots: TimeSlot[];
  whatsappMessage?: string;
  whatsappSendHour?: number;
  whatsappSendMinute?: number;
}

interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: string;
  started_at: string;
  day_plans: DayPlan[];
  assigned_lead_ids: string[];
  whatsapp_config?: {
    phone_number_id: string;
    access_token: string;
    business_account_id: string;
  };
  progress: {
    current_day: number;
    calls_today: number;
    messages_today: number;
    total_calls: number;
    total_messages: number;
  };
}

// Verify Vercel Cron secret (optional, recommended for production)
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Skip if not configured
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const turkeyNow = getTurkeyNow();
  const currentHour = turkeyNow.getHours();
  const currentMinute = turkeyNow.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  console.log(`[CRON] Running campaign cron at Turkey time ${currentHour}:${currentMinute.toString().padStart(2, "0")}`);

  try {
    // Get all running campaigns
    const { data: campaigns, error } = await supabase
      .from("auto_call_campaigns")
      .select("*")
      .eq("status", "running");

    if (error) {
      console.error("[CRON] Error fetching campaigns:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ message: "No running campaigns", processed: 0 });
    }

    const results: { campaign_id: string; campaign_name: string; action: string; details: string }[] = [];

    for (const rawCampaign of campaigns) {
      const campaign = rawCampaign as Campaign;

      if (!campaign.started_at || !campaign.day_plans || !campaign.assigned_lead_ids) {
        console.log(`[CRON] Campaign ${campaign.id} missing required fields, skipping`);
        continue;
      }

      // Calculate current campaign day
      const startedAt = new Date(campaign.started_at);
      const startedAtTurkey = new Date(startedAt.getTime() + startedAt.getTimezoneOffset() * 60000 + 3 * 3600000);
      const startDate = new Date(startedAtTurkey.getFullYear(), startedAtTurkey.getMonth(), startedAtTurkey.getDate());
      const todayDate = new Date(turkeyNow.getFullYear(), turkeyNow.getMonth(), turkeyNow.getDate());
      const daysDiff = Math.floor((todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const campaignDay = daysDiff + 1; // Day 1 = start day

      // Campaign completed (past day 7)
      if (campaignDay > 7) {
        console.log(`[CRON] Campaign ${campaign.name} completed (day ${campaignDay})`);
        await supabase
          .from("auto_call_campaigns")
          .update({
            status: "completed",
            is_active: false,
            progress: { ...campaign.progress, current_day: 7 },
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", campaign.id);

        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "completed", details: "Campaign finished all 7 days" });
        continue;
      }

      // Update current day in progress
      if (campaign.progress.current_day !== campaignDay) {
        campaign.progress.current_day = campaignDay;
        campaign.progress.calls_today = 0;
        campaign.progress.messages_today = 0;
      }

      // Get today's plan
      const todayPlan = campaign.day_plans[campaignDay - 1];
      if (!todayPlan || todayPlan.action === "off") {
        // Update progress and skip
        await supabase
          .from("auto_call_campaigns")
          .update({ progress: campaign.progress, updated_at: new Date().toISOString() } as never)
          .eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "skip", details: `Day ${campaignDay} is off` });
        continue;
      }

      // Get leads already actioned
      const { data: existingActions } = await supabase
        .from("campaign_actions")
        .select("lead_id, action_type")
        .eq("campaign_id", campaign.id);

      const actionedLeadIds = new Set((existingActions || []).map((a: { lead_id: string }) => a.lead_id));
      const remainingLeadIds = campaign.assigned_lead_ids.filter((id) => !actionedLeadIds.has(id));

      if (remainingLeadIds.length === 0) {
        console.log(`[CRON] Campaign ${campaign.name} has no remaining leads`);
        await supabase
          .from("auto_call_campaigns")
          .update({
            status: "completed",
            is_active: false,
            progress: campaign.progress,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "completed", details: "All leads processed" });
        continue;
      }

      // ─── CALL DAY ──────────────────────────────────────────────
      if (todayPlan.action === "call") {
        // Find active slot
        const activeSlot = todayPlan.timeSlots.find((slot) => {
          const slotStart = slot.startHour * 60 + slot.startMinute;
          const slotEnd = slot.endHour * 60 + slot.endMinute;
          return currentTimeMinutes >= slotStart && currentTimeMinutes < slotEnd;
        });

        if (!activeSlot) {
          results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "waiting", details: `Day ${campaignDay} call - not in any slot (${currentHour}:${currentMinute})` });
          await supabase
            .from("auto_call_campaigns")
            .update({ progress: campaign.progress, updated_at: new Date().toISOString() } as never)
            .eq("id", campaign.id);
          continue;
        }

        // How many calls should have been made by now in this slot?
        const slotStart = activeSlot.startHour * 60 + activeSlot.startMinute;
        const slotEnd = activeSlot.endHour * 60 + activeSlot.endMinute;
        const slotDuration = slotEnd - slotStart;
        const minutesElapsed = currentTimeMinutes - slotStart;
        const expectedCalls = Math.min(
          activeSlot.callsPerSlot,
          Math.floor((minutesElapsed / slotDuration) * activeSlot.callsPerSlot) + 1
        );

        // Get today's calls for this slot
        const todayStr = `${turkeyNow.getFullYear()}-${(turkeyNow.getMonth() + 1).toString().padStart(2, "0")}-${turkeyNow.getDate().toString().padStart(2, "0")}`;
        const { count: todayCallCount } = await supabase
          .from("campaign_actions")
          .select("id", { count: "exact" })
          .eq("campaign_id", campaign.id)
          .eq("action_type", "call")
          .eq("day_number", campaignDay)
          .gte("created_at", `${todayStr}T00:00:00Z`)
          .lte("created_at", `${todayStr}T23:59:59Z`);

        const actualCalls = todayCallCount || 0;
        const callsToMake = Math.min(expectedCalls - actualCalls, 3); // Max 3 per cron run

        if (callsToMake <= 0) {
          results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "waiting", details: `Day ${campaignDay} call - on schedule (${actualCalls}/${activeSlot.callsPerSlot})` });
          await supabase
            .from("auto_call_campaigns")
            .update({ progress: { ...campaign.progress, current_day: campaignDay, calls_today: actualCalls }, updated_at: new Date().toISOString() } as never)
            .eq("id", campaign.id);
          continue;
        }

        // Make calls
        let callsMade = 0;
        for (let i = 0; i < callsToMake && i < remainingLeadIds.length; i++) {
          const leadId = remainingLeadIds[i];

          try {
            // Execute call via outreach API (internal call)
            const callResponse = await fetch(new URL("/api/outreach/execute", request.url).toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lead_id: leadId, channel: "call", direct_call: true }),
            });

            const callData = await callResponse.json();
            const success = callResponse.ok && callData.success;

            // Record action
            await supabase.from("campaign_actions").insert({
              campaign_id: campaign.id,
              lead_id: leadId,
              day_number: campaignDay,
              action_type: "call",
              status: success ? "completed" : "failed",
              details: success ? callData.message : (callData.error || callData.message || "Unknown error"),
            } as never);

            if (success) callsMade++;
            console.log(`[CRON] Call ${success ? "SUCCESS" : "FAILED"} - Campaign: ${campaign.name}, Lead: ${leadId}`);
          } catch (err) {
            console.error(`[CRON] Call error for lead ${leadId}:`, err);
            await supabase.from("campaign_actions").insert({
              campaign_id: campaign.id,
              lead_id: leadId,
              day_number: campaignDay,
              action_type: "call",
              status: "failed",
              details: String(err),
            } as never);
          }
        }

        // Update progress
        campaign.progress.calls_today = actualCalls + callsMade;
        campaign.progress.total_calls += callsMade;
        campaign.progress.current_day = campaignDay;

        await supabase
          .from("auto_call_campaigns")
          .update({ progress: campaign.progress, updated_at: new Date().toISOString() } as never)
          .eq("id", campaign.id);

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          action: "calls",
          details: `Day ${campaignDay}: Made ${callsMade} calls (${actualCalls + callsMade}/${activeSlot.callsPerSlot} in slot)`,
        });
      }

      // ─── WHATSAPP DAY ──────────────────────────────────────────
      if (todayPlan.action === "whatsapp") {
        const sendHour = todayPlan.whatsappSendHour ?? 10;
        const sendMinute = todayPlan.whatsappSendMinute ?? 0;
        const sendTime = sendHour * 60 + sendMinute;

        // Check if it's within the send window (±2 minutes)
        if (Math.abs(currentTimeMinutes - sendTime) > 2) {
          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            action: "waiting",
            details: `Day ${campaignDay} WhatsApp - scheduled for ${sendHour}:${sendMinute.toString().padStart(2, "0")} (now ${currentHour}:${currentMinute})`,
          });
          await supabase
            .from("auto_call_campaigns")
            .update({ progress: { ...campaign.progress, current_day: campaignDay }, updated_at: new Date().toISOString() } as never)
            .eq("id", campaign.id);
          continue;
        }

        // Check if already sent today
        const todayStr2 = `${turkeyNow.getFullYear()}-${(turkeyNow.getMonth() + 1).toString().padStart(2, "0")}-${turkeyNow.getDate().toString().padStart(2, "0")}`;
        const { count: todayMsgCount } = await supabase
          .from("campaign_actions")
          .select("id", { count: "exact" })
          .eq("campaign_id", campaign.id)
          .eq("action_type", "whatsapp")
          .eq("day_number", campaignDay)
          .gte("created_at", `${todayStr2}T00:00:00Z`);

        if ((todayMsgCount || 0) > 0) {
          results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "done", details: `Day ${campaignDay} WhatsApp already sent` });
          continue;
        }

        // Check WhatsApp config
        const waConfig = campaign.whatsapp_config;
        if (!waConfig?.phone_number_id || !waConfig?.access_token) {
          results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: "error", details: "WhatsApp API not configured" });
          continue;
        }

        // Send messages (batch up to 50 per cron run)
        const leadsToMessage = remainingLeadIds.slice(0, 50);
        let messagesSent = 0;

        for (const leadId of leadsToMessage) {
          // Get lead data
          const { data: leadData } = await supabase
            .from("leads")
            .select("full_name, phone, whatsapp")
            .eq("id", leadId)
            .single();

          if (!leadData) continue;

          const lead = leadData as { full_name: string; phone: string; whatsapp?: string };
          const phone = lead.whatsapp || lead.phone;
          if (!phone) continue;

          const message = (todayPlan.whatsappMessage || "Merhaba {{name}}")
            .replace(/\{\{name\}\}/g, lead.full_name || "")
            .replace(/\{\{phone\}\}/g, phone);

          try {
            const waResponse = await fetch(new URL("/api/campaigns/whatsapp/send", request.url).toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone_number_id: waConfig.phone_number_id,
                access_token: waConfig.access_token,
                to: phone,
                message,
              }),
            });

            const waData = await waResponse.json();
            const success = waResponse.ok && waData.success;

            await supabase.from("campaign_actions").insert({
              campaign_id: campaign.id,
              lead_id: leadId,
              day_number: campaignDay,
              action_type: "whatsapp",
              status: success ? "completed" : "failed",
              details: success ? `Message sent to ${phone}` : (waData.error || "Send failed"),
            } as never);

            if (success) messagesSent++;
          } catch (err) {
            console.error(`[CRON] WhatsApp error for lead ${leadId}:`, err);
            await supabase.from("campaign_actions").insert({
              campaign_id: campaign.id,
              lead_id: leadId,
              day_number: campaignDay,
              action_type: "whatsapp",
              status: "failed",
              details: String(err),
            } as never);
          }
        }

        // Update progress
        campaign.progress.messages_today = messagesSent;
        campaign.progress.total_messages += messagesSent;
        campaign.progress.current_day = campaignDay;

        await supabase
          .from("auto_call_campaigns")
          .update({ progress: campaign.progress, updated_at: new Date().toISOString() } as never)
          .eq("id", campaign.id);

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          action: "whatsapp",
          details: `Day ${campaignDay}: Sent ${messagesSent}/${leadsToMessage.length} WhatsApp messages`,
        });
      }
    }

    console.log(`[CRON] Processed ${campaigns.length} campaigns:`, JSON.stringify(results));
    return NextResponse.json({ success: true, processed: campaigns.length, results });
  } catch (error) {
    console.error("[CRON] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
