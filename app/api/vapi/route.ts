import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { parseVapiEvaluation, parseVapiStructuredData } from "@/lib/vapi-evaluation-parser";
import { cleanCallSummary } from "@/lib/utils";

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

// Determine call result based on analysis
function determineCallResult(
  endedReason: string,
  analysis?: { successEvaluation?: string; structuredData?: Record<string, unknown> }
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
  if (endedReason === "customer-ended-call") {
    // Customer hung up - could be interested or not
    if (analysis?.successEvaluation?.toLowerCase().includes("success")) {
      return "answered_interested";
    }
    return "answered_not_interested";
  }
  
  // Check analysis for more detailed results
  if (analysis?.successEvaluation) {
    const evaluation = analysis.successEvaluation.toLowerCase();
    if (evaluation.includes("appointment") || evaluation.includes("randevu")) {
      return "answered_appointment_set";
    }
    if (evaluation.includes("callback") || evaluation.includes("geri ara")) {
      return "answered_callback_requested";
    }
    if (evaluation.includes("success") || evaluation.includes("interested") || evaluation.includes("ilgili")) {
      return "answered_interested";
    }
    if (evaluation.includes("not interested") || evaluation.includes("ilgisiz") || evaluation.includes("fail")) {
      return "answered_not_interested";
    }
  }
  
  // Default based on call completion
  if (endedReason === "assistant-ended-call" || endedReason === "silence-timed-out") {
    return "answered_interested";
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

  // Parse VAPI's structured output data (new format) or fallback to old format
  // Priority: structuredData > successEvaluation string
  let parsedEvaluation;
  let callSummaryFromStructured: string | null = null;
  
  if (analysis?.structuredData && typeof analysis.structuredData === 'object') {
    // New format: structured outputs
    const structuredResult = parseVapiStructuredData(
      analysis.structuredData as Record<string, unknown>,
      call.endedReason
    );
    parsedEvaluation = structuredResult.evaluation;
    callSummaryFromStructured = structuredResult.callSummary;
    
    console.log("Using structured output data:", {
      hasEvaluation: !!parsedEvaluation,
      hasCallSummary: !!callSummaryFromStructured,
      structuredDataKeys: Object.keys(analysis.structuredData),
    });
  } else {
    // Old format: successEvaluation string (backward compatibility)
    parsedEvaluation = parseVapiEvaluation(
      analysis?.successEvaluation,
      call.endedReason
    );
    console.log("Using legacy successEvaluation string");
  }
  
  const sentiment = parsedEvaluation.sentiment;
  const evaluationScore = parsedEvaluation.score;
  // Use structured call summary if available, otherwise fallback to old format
  const evaluationSummary = parsedEvaluation.summary || analysis?.successEvaluation || null;
  const tags = parsedEvaluation.tags;

  console.log("Parsed evaluation:", {
    score: evaluationScore,
    tags,
    sentiment,
    summary: evaluationSummary?.substring(0, 100),
    callSummaryFromStructured: callSummaryFromStructured?.substring(0, 100),
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

  // Determine call result for outreach
  const callResult = determineCallResult(call.endedReason || "", analysis);

  // Update outreach record if exists
  if (outreachId) {
    const outreachUpdate = {
      status: "completed",
      result: callResult,
      completed_at: new Date().toISOString(),
      notes: summary || analysis?.summary || `Arama tamamlandı. Süre: ${duration}s`,
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
    // Priority for summary: structured callSummary > analysis.summary > summary parameter
    const rawSummary = callSummaryFromStructured || analysis?.summary || summary || null;
    const cleanedSummary = cleanCallSummary(rawSummary);

    // Get assistant_id from call
    const assistantId = call.assistantId || call.assistant?.id || null;

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
        structuredData: analysis?.structuredData,
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
