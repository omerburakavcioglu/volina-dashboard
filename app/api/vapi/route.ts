import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { cleanCallSummary } from "@/lib/utils";
import { EVALUATION_SYSTEM_PROMPT } from "@/lib/evaluation-prompt";
import { transitionFunnelLead, mapCallResultToFunnelCondition } from "@/lib/funnel-engine";

interface ParsedEvaluation {
  score: number | null;
  sentiment: "positive" | "neutral" | "negative";
  outcome: string;
  tags: string[];
  summary: string | null;
  objections?: string[];
  nextAction?: string;
}

// Helper function to create default evaluation when transcript/summary is not available
function createDefaultEvaluation(endedReason?: string): ParsedEvaluation {
  if (!endedReason) {
    return {
      score: null,
      sentiment: "neutral",
      outcome: "needs_info",
      tags: ["no_transcript"],
      summary: "Arama tamamlandı ancak transkript mevcut değil.",
    };
  }

  const reason = endedReason.toLowerCase();
  
  // Failed connections
  if (reason.includes("voicemail") || reason === "voicemail") {
    return {
      score: null, // V - Voicemail
      sentiment: "negative",
      outcome: "voicemail",
      tags: ["voicemail", "failed_call"],
      summary: "Sesli mesaja düştü",
    };
  }
  
  if (reason.includes("no-answer") || reason.includes("no_answer") || reason === "customer-did-not-answer") {
    return {
      score: 1,
      sentiment: "negative",
      outcome: "no_answer",
      tags: ["no_answer", "failed_call"],
      summary: "Cevap verilmedi",
    };
  }
  
  if (reason.includes("busy") || reason === "customer-busy") {
    return {
      score: 1,
      sentiment: "negative",
      outcome: "busy",
      tags: ["busy", "failed_call"],
      summary: "Müşteri meşgul",
    };
  }
  
  // Customer ended call - could be positive or negative, default to neutral
  if (reason.includes("customer-ended") || reason === "customer-ended-call") {
    return {
      score: 5,
      sentiment: "neutral",
      outcome: "needs_info",
      tags: ["customer_ended", "needs_info"],
      summary: "Müşteri aramayı sonlandırdı",
    };
  }
  
  // Assistant ended call - usually positive
  if (reason.includes("assistant-ended") || reason === "assistant-ended-call") {
    return {
      score: 6,
      sentiment: "neutral",
      outcome: "needs_info",
      tags: ["assistant_ended", "needs_info"],
      summary: "Asistan aramayı sonlandırdı",
    };
  }
  
  // Default
  return {
    score: null,
    sentiment: "neutral",
    outcome: "needs_info",
    tags: ["no_transcript"],
    summary: `Arama tamamlandı. Sebep: ${endedReason}`,
  };
}

// Import our own evaluation function
// We'll define it here to avoid circular dependencies
async function evaluateCallWithStructuredOutput(
  transcript: string,
  existingSummary?: string | null,
  endedReason?: string
): Promise<{
  successEvaluation: {
    score: number;
    sentiment: "positive" | "neutral" | "negative";
    outcome: string;
    tags: string[];
    objections?: string[];
    nextAction?: string;
  };
  callSummary: {
    callSummary: string;
  };
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  // Use our own evaluation prompt
  const systemPrompt = EVALUATION_SYSTEM_PROMPT;

  const userMessage = existingSummary 
    ? `Arama Transkripti:\n${transcript}\n\nMevcut Özet:\n${existingSummary}${endedReason ? `\n\nEnded Reason: ${endedReason}` : ''}`
    : `Arama Transkripti:\n${transcript}${endedReason ? `\n\nEnded Reason: ${endedReason}` : ''}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }, // Force JSON response
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No response from OpenAI");
  }

  // Parse JSON response
  try {
    // Clean the response in case it has markdown code blocks
    const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanedContent);
    
    // Validate structure
    if (!parsed.successEvaluation || !parsed.callSummary) {
      throw new Error("Invalid structured output format");
    }
    
    return parsed;
  } catch (error) {
    console.error("Error parsing structured output:", error);
    throw new Error(`Failed to parse structured output: ${error}`);
  }
}

// Vapi webhook types - supporting multiple message types
interface VapiWebhookPayload {
  message: {
    type: string;
    call?: {
      id: string;
      orgId: string;
      createdAt: string;
      endedAt?: string;
      startedAt?: string;
      type: string;
      status: string;
      endedReason?: string;
      phoneNumberId?: string;
      assistantId?: string;
      assistant?: {
        id: string;
        name?: string;
      };
      customer?: {
        number: string;
        name?: string;
      };
      metadata?: {
        lead_id?: string;
        outreach_id?: string;
        language?: string;
        user_id?: string;
      };
    };
    recordingUrl?: string;
    stereoRecordingUrl?: string;
    transcript?: string;
    summary?: string;
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
      successEvaluation?: string;
    };
    // For status-update messages
    status?: string;
    endedReason?: string;
    // For transcript messages
    artifact?: {
      transcript?: string;
      messages?: Array<{
        role: string;
        message: string;
        time: number;
      }>;
    };
  };
}

// Determine call result based on our own evaluation (VAPI analysis ignored)
function determineCallResult(
  endedReason: string,
  ourEvaluation?: ParsedEvaluation
): string {
  // Check ended reason first
  if (endedReason === "customer-did-not-answer" || endedReason === "no-answer") {
    return "no_answer";
  }
  if (endedReason === "customer-busy" || endedReason === "busy") {
    return "busy";
  }
  if (endedReason === "voicemail") {
    return "voicemail";
  }
  
  // Use our own evaluation outcome
  if (ourEvaluation?.outcome) {
    const outcome = ourEvaluation.outcome;
    if (outcome === "appointment_set") {
      return "answered_appointment_set";
    }
    if (outcome === "callback_requested") {
      return "answered_callback_requested";
    }
    if (outcome === "interested") {
      return "answered_interested";
    }
    if (outcome === "not_interested") {
      return "answered_not_interested";
    }
    if (outcome === "voicemail") {
      return "voicemail";
    }
    if (outcome === "no_answer") {
      return "no_answer";
    }
    if (outcome === "busy") {
      return "busy";
    }
  }
  
  // Fallback based on score
  if (ourEvaluation?.score !== null && ourEvaluation?.score !== undefined) {
    if (ourEvaluation.score >= 7) {
      return "answered_interested";
    }
    if (ourEvaluation.score >= 5) {
      return "answered_interested";
    }
  }
  
  // Default based on call completion
  if (endedReason === "assistant-ended-call" || endedReason === "silence-timed-out") {
    return "answered_interested";
  }
  
  if (endedReason === "customer-ended-call") {
    return "answered_not_interested";
  }
  
  return "answered_not_interested";
}

// POST handler for Vapi webhooks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as VapiWebhookPayload;
    const messageType = body.message?.type;

    // Detailed logging for debugging
    console.log("=== VAPI WEBHOOK RECEIVED ===");
    console.log("Message Type:", messageType);
    console.log("Call ID:", body.message?.call?.id);
    console.log("Full Payload:", JSON.stringify(body, null, 2));
    console.log("===========================");

    // Handle different message types
    if (messageType === "status-update") {
      // Call status changed (ringing, in-progress, ended, etc.)
      return await handleStatusUpdate(body);
    }

    if (messageType === "end-of-call-report") {
      // Full call report with transcript and analysis
      return await handleEndOfCallReport(body);
    }

    if (messageType === "transcript") {
      // Real-time transcript updates (optional handling)
      console.log("Transcript update received");
      return NextResponse.json({ success: true, message: "Transcript received" });
    }

    if (messageType === "hang") {
      // Call ended signal
      console.log("Call hang signal received");
      return NextResponse.json({ success: true, message: "Hang signal received" });
    }

    // Unknown message type - log but don't error
    console.log("Unknown webhook type:", messageType);
    return NextResponse.json({ success: true, message: "Webhook received" });

  } catch (error) {
    console.error("Vapi webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// Handle status updates (call started, ended, etc.)
async function handleStatusUpdate(body: VapiWebhookPayload) {
  const call = body.message.call;
  if (!call) {
    return NextResponse.json({ success: true, message: "No call data" });
  }

  const supabase = createAdminClient();
  const outreachId = call.metadata?.outreach_id;

  console.log("Status update:", body.message.status, "for outreach:", outreachId);

  // Update outreach status if we have an outreach_id
  if (outreachId && body.message.status === "in-progress") {
    await supabase
      .from("outreach")
      .update({ 
        status: "in_progress",
        vapi_call_id: call.id 
      } as never)
      .eq("id", outreachId);
  }

  return NextResponse.json({ success: true, message: "Status update processed" });
}

// Handle end-of-call report with full details
async function handleEndOfCallReport(body: VapiWebhookPayload) {
  const { call, recordingUrl, transcript, summary, analysis } = body.message;
  
  if (!call) {
    return NextResponse.json({ error: "No call data in report" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const vapiOrgId = call.orgId;
  const outreachId = call.metadata?.outreach_id;
  const leadId = call.metadata?.lead_id;
  const directCallUserId = call.metadata?.user_id; // Direct call user_id from metadata

  console.log("End of call report:", {
    vapiCallId: call.id,
    outreachId,
    leadId,
    directCallUserId,
    endedReason: call.endedReason,
  });

  // Find user and lead name - multiple sources
  let userId: string | null = null;
  let leadName: string | null = null;

  // 1. First check if user_id is directly in metadata (direct calls)
  if (directCallUserId) {
    userId = directCallUserId;
    console.log("Using user_id from metadata:", userId);
  }

  // 2. Try to get from outreach record
  if (!userId && outreachId) {
    const { data: outreach } = await supabase
      .from("outreach")
      .select("user_id")
      .eq("id", outreachId)
      .single() as { data: { user_id: string } | null };
    
    if (outreach) {
      userId = outreach.user_id;
      console.log("Using user_id from outreach:", userId);
    }
  }

  // 3. Get lead data (for user_id and full_name)
  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("user_id, full_name")
      .eq("id", leadId)
      .single() as { data: { user_id: string; full_name: string | null } | null };
    
    if (lead) {
      if (!userId) {
        userId = lead.user_id;
        console.log("Using user_id from lead:", userId);
      }
      leadName = lead.full_name;
      console.log("Using lead name from lead_id:", leadName);
    }
  }

  // 4. If no lead name yet, try to match by phone number
  if (!leadName && call.customer?.number) {
    const callerPhone = call.customer.number;
    // Try different phone formats (with/without country code, etc.)
    const phoneVariants = [
      callerPhone,
      callerPhone.replace(/^\+/, ''),  // Remove leading +
      callerPhone.replace(/^\+90/, '0'),  // +90... -> 0...
      callerPhone.replace(/^90/, '0'),  // 90... -> 0...
      '+' + callerPhone,  // Add + prefix
    ];
    
    const { data: matchedLead } = await supabase
      .from("leads")
      .select("full_name, user_id")
      .or(phoneVariants.map(p => `phone.eq.${p}`).join(','))
      .limit(1)
      .single() as { data: { full_name: string | null; user_id: string } | null };
    
    if (matchedLead) {
      leadName = matchedLead.full_name;
      if (!userId) {
        userId = matchedLead.user_id;
      }
      console.log("Matched lead by phone number:", leadName);
    }
  }

  // 4. Fallback: find user by vapi_org_id
  if (!userId && vapiOrgId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("vapi_org_id", vapiOrgId)
      .single() as { data: { id: string } | null };
    
    if (profile) {
      userId = profile.id;
      console.log("Using user_id from vapi_org_id:", userId);
    }
  }

  // 5. Fallback: find user by vapi_assistant_id (for per-tenant VAPI accounts)
  const callAssistantId = call.assistantId || call.assistant?.id;
  if (!userId && callAssistantId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("vapi_assistant_id", callAssistantId)
      .single() as { data: { id: string } | null };
    
    if (profile) {
      userId = profile.id;
      console.log("Using user_id from vapi_assistant_id match:", userId);
    }
  }

  if (!userId) {
    console.error("=== USER ID NOT FOUND ===");
    console.error("Call ID:", call.id);
    console.error("Metadata:", call.metadata);
    console.error("Outreach ID:", outreachId);
    console.error("Lead ID:", leadId);
    console.error("VAPI Org ID:", vapiOrgId);
    console.error("Direct Call User ID:", directCallUserId);
    console.error("=========================");
    // Don't return error - just log it, so webhook doesn't fail
    // VAPI will retry if we return error
    return NextResponse.json(
      { success: false, error: "User not found for this call", call_id: call.id },
      { status: 200 } // Return 200 so VAPI doesn't retry
    );
  }

  // USE ONLY OUR OWN EVALUATION - VAPI evaluation is completely ignored
  let parsedEvaluation: ParsedEvaluation;
  let callSummaryFromStructured: string | null = null;
  
  // Check if we have transcript or summary to evaluate
  const textToEvaluate = transcript || summary || "";
  
  if (textToEvaluate) {
    try {
      console.log("=== RUNNING OUR OWN EVALUATION (VAPI IGNORED) ===");
      console.log("Transcript length:", transcript?.length || 0);
      console.log("Summary length:", summary?.length || 0);
      
      // Call our own evaluation function
      const structuredEvaluation = await evaluateCallWithStructuredOutput(
        textToEvaluate,
        summary,
        call.endedReason
      );
      
      // Map our structured output
      parsedEvaluation = {
        score: structuredEvaluation.successEvaluation.score,
        sentiment: structuredEvaluation.successEvaluation.sentiment as "positive" | "neutral" | "negative",
        outcome: structuredEvaluation.successEvaluation.outcome,
        tags: structuredEvaluation.successEvaluation.tags || [],
        objections: structuredEvaluation.successEvaluation.objections,
        nextAction: structuredEvaluation.successEvaluation.nextAction,
        summary: structuredEvaluation.callSummary.callSummary,
      };
      
      callSummaryFromStructured = structuredEvaluation.callSummary.callSummary;
      
      console.log("Our evaluation result:", {
        score: parsedEvaluation.score,
        sentiment: parsedEvaluation.sentiment,
        outcome: parsedEvaluation.outcome,
        tags: parsedEvaluation.tags,
      });
    } catch (error) {
      console.error("Error running our evaluation:", error);
      
      // If evaluation fails, create a minimal default evaluation based on endedReason
      const defaultEvaluation = createDefaultEvaluation(call.endedReason);
      parsedEvaluation = defaultEvaluation;
      callSummaryFromStructured = null;
      
      console.log("Using default evaluation due to error:", defaultEvaluation);
    }
  } else {
    // No transcript/summary available - create minimal evaluation from endedReason
    console.log("No transcript/summary available, creating default evaluation from endedReason");
    const defaultEvaluation = createDefaultEvaluation(call.endedReason);
    parsedEvaluation = defaultEvaluation;
    callSummaryFromStructured = null;
  }
  
  const sentiment = parsedEvaluation.sentiment;
  const evaluationScore = parsedEvaluation.score;
  const evaluationSummary = parsedEvaluation.summary || callSummaryFromStructured || null;
  const tags = parsedEvaluation.tags;

  console.log("Final evaluation (OUR OWN):", {
    score: evaluationScore,
    tags,
    sentiment,
    summary: evaluationSummary?.substring(0, 100),
    source: "our_evaluation_only",
  });

  // Determine call type
  let callType: "appointment" | "inquiry" | "follow_up" | "cancellation" | "outbound" = "outbound";
  const lowerSummary = (summary || transcript || "").toLowerCase();
  
  if (outreachId) {
    callType = "outbound";
  } else if (lowerSummary.includes("cancel")) {
    callType = "cancellation";
  } else if (lowerSummary.includes("follow") || lowerSummary.includes("follow-up")) {
    callType = "follow_up";
  } else if (
    lowerSummary.includes("appointment") ||
    lowerSummary.includes("schedule") ||
    lowerSummary.includes("book") ||
    lowerSummary.includes("randevu")
  ) {
    callType = "appointment";
  }

  // Calculate duration
  const startTime = new Date(call.startedAt || call.createdAt).getTime();
  const endTime = new Date(call.endedAt || new Date()).getTime();
  const duration = Math.round((endTime - startTime) / 1000);

  // Determine call result for outreach using our own evaluation
  const callResult = determineCallResult(call.endedReason || "", parsedEvaluation);

  // Update outreach record if exists
  if (outreachId) {
    const outreachUpdate = {
      status: "completed",
      result: callResult,
      completed_at: new Date().toISOString(),
      notes: callSummaryFromStructured || parsedEvaluation.summary || summary || `Arama tamamlandı. Süre: ${duration}s`,
      vapi_call_id: call.id,
    };

    const { error: outreachError } = await supabase
      .from("outreach")
      .update(outreachUpdate as never)
      .eq("id", outreachId);

    if (outreachError) {
      console.error("Error updating outreach:", outreachError);
    } else {
      console.log("Outreach updated:", outreachId, callResult);
    }

    // Update lead status based on result
    if (leadId) {
      let newLeadStatus = "contacted";
      if (callResult === "answered_appointment_set") {
        newLeadStatus = "appointment_scheduled";
      } else if (callResult === "answered_not_interested") {
        newLeadStatus = "not_interested";
      } else if (callResult === "no_answer" || callResult === "busy" || callResult === "voicemail") {
        newLeadStatus = "unreachable";
      }

      await supabase
        .from("leads")
        .update({
          status: newLeadStatus,
          last_contact_date: new Date().toISOString(),
        } as never)
        .eq("id", leadId);

      console.log("Lead status updated:", leadId, newLeadStatus);
    }
  }

  // Insert call record into calls table
  if (userId) {
    // Use our own call summary (VAPI summary ignored)
    const rawSummary = callSummaryFromStructured || parsedEvaluation.summary || summary || null;
    const cleanedSummary = cleanCallSummary(rawSummary);

    // Get assistant_id from call
    const assistantId = call.assistantId || call.assistant?.id || null;

    // Store ONLY our own structured evaluation in metadata (VAPI evaluation completely ignored)
    const ourStructuredData = {
      successEvaluation: {
        score: parsedEvaluation.score,
        sentiment: parsedEvaluation.sentiment,
        outcome: parsedEvaluation.outcome,
        tags: parsedEvaluation.tags || [],
        objections: parsedEvaluation.objections,
        nextAction: parsedEvaluation.nextAction,
      },
      callSummary: {
        callSummary: callSummaryFromStructured || parsedEvaluation.summary || null,
      },
      evaluationSource: "our_evaluation_only",
      evaluatedAt: new Date().toISOString(),
    };

    const insertData = {
      user_id: userId,
      vapi_call_id: call.id,
      assistant_id: assistantId,
      recording_url: recordingUrl || null,
      transcript: transcript || null,
      summary: cleanedSummary,
      sentiment,
      duration,
      type: callType,
      caller_phone: call.customer?.number || null,
      caller_name: leadName || call.customer?.name || null,
      evaluation_score: evaluationScore,
      evaluation_summary: evaluationSummary,
      tags: tags,
      metadata: {
        orgId: call.orgId,
        status: call.status,
        endedReason: call.endedReason,
        structuredData: ourStructuredData,
        outreach_id: outreachId,
        lead_id: leadId,
        assistantId: assistantId,
      },
    };

    const { data: callData, error: callError } = await supabase
      .from("calls")
      .insert(insertData as never)
      .select()
      .single() as { data: { id: string } | null; error: unknown };

    if (callError) {
      console.error("=== ERROR INSERTING CALL ===");
      console.error("Error:", callError);
      console.error("Insert Data:", JSON.stringify(insertData, null, 2));
      console.error("============================");
    } else {
      console.log("=== CALL RECORD INSERTED SUCCESSFULLY ===");
      console.log("Call DB ID:", callData?.id);
      console.log("VAPI Call ID:", call.id);
      console.log("User ID:", userId);
      console.log("Lead ID:", leadId);
      console.log("Duration:", duration);
      console.log("Sentiment:", sentiment);
      console.log("==========================================");
    }
  }

  // =============================================
  // FUNNEL INTEGRATION: check if lead is in funnel and transition
  // =============================================
  if (userId && leadId) {
    try {
      const { data: funnelLead } = await (supabase as any)
        .from("funnel_leads")
        .select("id, current_stage_id, branch, metadata, user_id, funnel_stages!inner(name)")
        .eq("lead_id", leadId)
        .eq("status", "active")
        .single();

      if (funnelLead) {
        const fl = funnelLead as {
          id: string;
          current_stage_id: string;
          branch: string | null;
          metadata: Record<string, unknown>;
          user_id: string;
          funnel_stages: { name: string };
        };

        const currentStageName = fl.funnel_stages.name;
        const funnelCondition = mapCallResultToFunnelCondition(
          call.endedReason || "",
          parsedEvaluation.outcome,
          evaluationScore
        );

        // Get config for calling hours
        const { data: funnelConfig } = await (supabase as any)
          .from("funnel_config")
          .select("calling_hours_start, calling_hours_end")
          .eq("user_id", fl.user_id)
          .single();

        const chStart = (funnelConfig as { calling_hours_start: string } | null)?.calling_hours_start || "09:00";
        const chEnd = (funnelConfig as { calling_hours_end: string } | null)?.calling_hours_end || "20:00";

        let nextStageName: string | null = null;
        let nextBranch: string | null = fl.branch;

        if (currentStageName === "DAY0_AI_CALL") {
          if (funnelCondition === "call_result_hard") {
            nextStageName = "HARD_WAITING";
            nextBranch = "hard";
          } else if (funnelCondition === "call_result_soft") {
            nextStageName = "SOFT_FOLLOWUP";
            nextBranch = "soft";
          } else {
            nextStageName = "NO_ANSWER_WHATSAPP_INTRO";
            nextBranch = "no_answer";
          }
        } else if (currentStageName === "HARD_REACQUISITION_CALL") {
          if (funnelCondition === "call_result_soft") {
            nextStageName = "LIVE_TRANSFER";
            nextBranch = "main";
          } else if (funnelCondition === "call_result_no_answer") {
            nextStageName = null; // will retry via scheduler
          } else {
            nextStageName = "ARCHIVE_GDPR";
            nextBranch = null;
          }
        } else if (currentStageName === "POST_TREATMENT_DAY7") {
          if (funnelCondition === "call_result_soft") {
            nextStageName = "REVIEW_AND_REFERRAL";
            nextBranch = "post_treatment";
          } else {
            nextStageName = "URGENT_ALERT";
            nextBranch = "post_treatment";
          }
        } else if (currentStageName === "POST_TREATMENT_DAY30") {
          nextStageName = "RECOVERY_MANAGEMENT";
          nextBranch = "post_treatment";
        }

        if (nextStageName) {
          await transitionFunnelLead(
            supabase,
            fl.id,
            fl.user_id,
            nextStageName,
            nextBranch,
            chStart,
            chEnd
          );
          console.log(`[funnel] Transitioned lead ${leadId} from ${currentStageName} to ${nextStageName}`);
        }

        // Log call result event
        await (supabase as any).from("funnel_events").insert({
          user_id: fl.user_id,
          funnel_lead_id: fl.id,
          event_type: "call_result",
          from_stage_id: fl.current_stage_id,
          payload: {
            call_id: call.id,
            duration,
            result: funnelCondition,
            evaluation_score: evaluationScore,
          },
          actor: "ai_agent",
        });
      }
    } catch (funnelError) {
      console.error("[funnel] Error processing funnel transition:", funnelError);
    }
  }

  return NextResponse.json({
    success: true,
    message: "End of call report processed",
    result: callResult,
    outreach_id: outreachId,
  });
}

// GET handler for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Volina AI Vapi webhook endpoint is active",
    timestamp: new Date().toISOString(),
    supported_events: ["status-update", "end-of-call-report", "transcript", "hang"],
  });
}
