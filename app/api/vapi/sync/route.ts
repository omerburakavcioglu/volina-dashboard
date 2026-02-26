import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getVapiCalls, transformVapiCallToLocal, isVapiConfigured } from "@/lib/vapi-api";
import { parseVapiEvaluation } from "@/lib/vapi-evaluation-parser";
import { cleanCallSummary } from "@/lib/utils";

// POST - Sync VAPI calls to Supabase
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get("days") || "14"), 14);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Check if user has a per-tenant VAPI API key
    const supabaseForProfile = createAdminClient();
    const { data: userProfile } = await supabaseForProfile
      .from("profiles")
      .select("vapi_private_key, vapi_assistant_id")
      .eq("id", userId)
      .single() as { data: { vapi_private_key?: string | null; vapi_assistant_id?: string | null } | null };
    
    const tenantApiKey = userProfile?.vapi_private_key?.trim() || undefined;

    // Calculate date range (VAPI only allows 14 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch calls from VAPI using tenant-specific key if available
    const vapiCalls = await getVapiCalls({
      limit: 100,
      createdAtGe: startDate.toISOString(),
      assistantId: userProfile?.vapi_assistant_id || undefined,
    }, tenantApiKey);

    if (vapiCalls.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls to sync",
        synced: 0,
        skipped: 0,
      });
    }

    const supabase = createAdminClient();
    let synced = 0;
    let skipped = 0;

    for (const vapiCall of vapiCalls) {
      // Check if call already exists in Supabase
      const { data: existing } = await supabase
        .from("calls")
        .select("id")
        .eq("vapi_call_id", vapiCall.id)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      // Transform and insert
      const localCall = transformVapiCallToLocal(vapiCall);
      
      // Calculate duration in seconds
      let duration: number | null = null;
      if (vapiCall.startedAt && vapiCall.endedAt) {
        duration = Math.round(
          (new Date(vapiCall.endedAt).getTime() - new Date(vapiCall.startedAt).getTime()) / 1000
        );
      }

      // Use original VAPI timestamp for created_at
      const originalTimestamp = vapiCall.startedAt || vapiCall.createdAt || new Date().toISOString();

      // Try to get lead name from database
      let callerName: string | null = vapiCall.customer?.name || null;
      
      // 1. First try by lead_id from metadata
      const leadId = vapiCall.metadata?.lead_id;
      if (leadId && !callerName) {
        const { data: lead } = await supabase
          .from("leads")
          .select("full_name")
          .eq("id", leadId)
          .single() as { data: { full_name: string | null } | null };
        
        if (lead?.full_name) {
          callerName = lead.full_name;
        }
      }
      
      // 2. If no name yet, try to match by phone number
      if (!callerName && vapiCall.customer?.number) {
        const callerPhone = vapiCall.customer.number;
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
          .select("full_name")
          .or(phoneVariants.map(p => `phone.eq.${p}`).join(','))
          .limit(1)
          .single() as { data: { full_name: string | null } | null };
        
        if (matchedLead?.full_name) {
          callerName = matchedLead.full_name;
        }
      }

      // Parse VAPI's success evaluation to get score, tags, and sentiment
      const parsedEvaluation = parseVapiEvaluation(
        vapiCall.analysis?.successEvaluation,
        vapiCall.endedReason
      );

      // Clean the summary from markdown formatting
      const rawSummary = vapiCall.analysis?.summary || vapiCall.summary || null;
      const cleanedSummary = cleanCallSummary(rawSummary);

      // Get assistant_id from VAPI call
      const assistantId = vapiCall.assistantId || vapiCall.assistant?.id || null;

      const insertData: Record<string, unknown> = {
        user_id: userId,
        vapi_call_id: vapiCall.id,
        assistant_id: assistantId,
        recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
        transcript: vapiCall.transcript || null,
        summary: cleanedSummary,
        sentiment: parsedEvaluation.sentiment || localCall.sentiment,
        duration,
        type: localCall.type,
        caller_phone: vapiCall.customer?.number || null,
        caller_name: callerName,
        evaluation_score: parsedEvaluation.score,
        evaluation_summary: parsedEvaluation.summary || vapiCall.analysis?.successEvaluation || null,
        created_at: originalTimestamp, // Use original VAPI call time
        metadata: {
          orgId: vapiCall.orgId,
          status: vapiCall.status,
          endedReason: vapiCall.endedReason,
          cost: vapiCall.cost || vapiCall.costBreakdown?.total,
          callType: vapiCall.type,
          originalStartedAt: vapiCall.startedAt,
          originalEndedAt: vapiCall.endedAt,
          tags: parsedEvaluation.tags,
          assistantId: assistantId,
        },
      };

      const { error } = await supabase
        .from("calls")
        .insert(insertData as never);

      if (error) {
        console.error("Error inserting call:", error);
      } else {
        synced++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${synced} calls, skipped ${skipped} existing`,
      synced,
      skipped,
      total: vapiCalls.length,
    });
  } catch (error) {
    console.error("VAPI sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync VAPI calls", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Get sync status
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Use POST to sync VAPI calls to Supabase",
    params: {
      days: "Number of days to sync (max 14)",
      userId: "User ID to associate calls with",
    },
  });
}

