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
    // VAPI allows max 1000 per request, so we need to make multiple requests if there are more calls
    let vapiCalls: any[] = [];
    try {
      // Strategy: Fetch in batches by splitting date range into 1-day chunks
      // This is faster than recursive splitting and ensures we get all calls
      let allCalls: any[] = [];
      const endDate = new Date();
      let currentStart = new Date(startDate);
      const callIds = new Set<string>(); // Track unique call IDs to avoid duplicates
      
      // Fetch in 1-day chunks to avoid missing calls when there are more than 1000 in a period
      while (currentStart < endDate) {
        const chunkEnd = new Date(currentStart);
        chunkEnd.setDate(chunkEnd.getDate() + 1); // 1 day chunk
        if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
        
        const batch = await getVapiCalls({
          limit: 1000,
          createdAtGe: currentStart.toISOString(),
          createdAtLe: chunkEnd.toISOString(),
          assistantId: userProfile?.vapi_assistant_id || undefined,
        }, tenantApiKey);
        
        // Add only new calls (deduplicate)
        for (const call of batch) {
          if (!callIds.has(call.id)) {
            callIds.add(call.id);
            allCalls.push(call);
          }
        }
        
        console.log(`[VAPI Sync] Fetched ${batch.length} calls from ${currentStart.toISOString().split('T')[0]} (total: ${allCalls.length})`);
        
        // Move to next day
        currentStart = new Date(chunkEnd);
        currentStart.setMilliseconds(currentStart.getMilliseconds() + 1);
      }
      
      vapiCalls = allCalls;
      console.log(`[VAPI Sync] Total unique calls fetched: ${vapiCalls.length}`);
    } catch (vapiError) {
      console.error("Error fetching calls from VAPI:", vapiError);
      const errorMessage = vapiError instanceof Error ? vapiError.message : String(vapiError);
      const errorStack = vapiError instanceof Error ? vapiError.stack : undefined;
      return NextResponse.json(
        { 
          success: false,
          error: "Failed to fetch calls from VAPI", 
          details: errorMessage,
          stack: errorStack 
        },
        { status: 500 }
      );
    }

    if (vapiCalls.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls to sync",
        synced: 0,
        skipped: 0,
        total: 0,
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
        try {
          const callerPhone = vapiCall.customer.number;
          // Try different phone formats (with/without country code, etc.)
          const phoneVariants = [
            callerPhone,
            callerPhone.replace(/^\+/, ''),  // Remove leading +
            callerPhone.replace(/^\+90/, '0'),  // +90... -> 0...
            callerPhone.replace(/^90/, '0'),  // 90... -> 0...
            '+' + callerPhone,  // Add + prefix
          ];
          
          // Try each phone variant one by one (more reliable than OR query)
          for (const phoneVariant of phoneVariants) {
            try {
              const { data: matchedLead, error: leadError } = await supabase
                .from("leads")
                .select("full_name")
                .eq("phone", phoneVariant)
                .limit(1)
                .maybeSingle() as { data: { full_name: string | null } | null; error: unknown };
              
              if (!leadError && matchedLead?.full_name) {
                callerName = matchedLead.full_name;
                break; // Found a match, stop searching
              }
            } catch (leadQueryError) {
              // Continue to next phone variant if query fails
              continue;
            }
          }
        } catch (phoneMatchError) {
          // Log but don't fail the sync if phone matching fails
          console.warn(`[VAPI Sync] Error matching phone for call ${vapiCall.id}:`, phoneMatchError);
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
          assistantId: assistantId, // Also store in metadata for filtering
        },
      };

      try {
        const { error, data: insertedCall } = await supabase
          .from("calls")
          .insert(insertData as never)
          .select()
          .single();

        if (error) {
          console.error("Error inserting call:", error, "VAPI Call ID:", vapiCall.id, "Insert Data:", JSON.stringify(insertData, null, 2));
          // Continue with next call instead of failing entire sync
        } else {
          synced++;
          // Log first few successful inserts for debugging
          if (synced <= 3) {
            console.log(`[VAPI Sync] Inserted call ${synced}: VAPI ID=${vapiCall.id}, Assistant ID=${assistantId}, User ID=${userId}`);
          }
        }
      } catch (insertError) {
        console.error("Exception inserting call:", insertError, "VAPI Call ID:", vapiCall.id);
        // Continue with next call instead of failing entire sync
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to sync VAPI calls", 
        details: errorMessage,
        stack: errorStack 
      },
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

