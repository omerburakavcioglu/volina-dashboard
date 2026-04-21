import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getVapiCalls, transformVapiCallToLocal, isVapiConfigured } from "@/lib/vapi-api";
import { cleanCallSummary } from "@/lib/utils";
import { EVALUATION_SYSTEM_PROMPT } from "@/lib/evaluation-prompt";

// Allow up to 5 minutes on Vercel. Sync can be slow when many new calls
// exist (OpenAI evaluation per call). Default 60s was causing 504s.
export const maxDuration = 300;

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Helper function to create default evaluation when transcript/summary is not available
function createDefaultEvaluation(endedReason?: string): {
  score: number | null;
  sentiment: "positive" | "neutral" | "negative";
  outcome: string;
  tags: string[];
  summary: string | null;
} {
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
  
  if (reason.includes("voicemail") || reason === "voicemail") {
    return {
      score: null,
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
  
  return {
    score: null,
    sentiment: "neutral",
    outcome: "needs_info",
    tags: ["no_transcript"],
    summary: `Arama tamamlandı. Sebep: ${endedReason}`,
  };
}

// Evaluate call with our own evaluation system
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

  const systemPrompt = EVALUATION_SYSTEM_PROMPT;

  const userMessage = existingSummary 
    ? `Arama Transkripti:\n${transcript}\n\nMevcut Özet:\n${existingSummary}${endedReason ? `\n\nEnded Reason: ${endedReason}` : ''}`
    : `Arama Transkripti:\n${transcript}${endedReason ? `\n\nEnded Reason: ${endedReason}` : ''}`;

  const response = await fetch(OPENAI_API_URL, {
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
      response_format: { type: "json_object" },
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

  try {
    const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanedContent);
    
    if (!parsed.successEvaluation || !parsed.callSummary) {
      throw new Error("Invalid structured output format");
    }
    
    return parsed;
  } catch (error) {
    console.error("Error parsing structured output:", error);
    throw new Error(`Failed to parse structured output: ${error}`);
  }
}

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
    // Track which fetched calls came from the assistant-less fallback so we
    // can tag them in metadata (useful for diagnosing wrong vapi_assistant_id
    // in the user profile).
    const fallbackCallIds = new Set<string>();
    try {
      // Strategy: Fetch in batches by splitting date range into 1-day chunks
      // This is faster than recursive splitting and ensures we get all calls
      const runChunkedFetch = async (useAssistantFilter: boolean) => {
        const fetched: any[] = [];
        const seen = new Set<string>();
        const end = new Date();
        let cursor = new Date(startDate);
        let failed = 0;
        while (cursor < end) {
          const chunkEnd = new Date(cursor);
          chunkEnd.setDate(chunkEnd.getDate() + 1);
          if (chunkEnd > end) chunkEnd.setTime(end.getTime());

          try {
            const batch = await getVapiCalls({
              limit: 1000,
              createdAtGe: cursor.toISOString(),
              createdAtLe: chunkEnd.toISOString(),
              assistantId: useAssistantFilter
                ? userProfile?.vapi_assistant_id || undefined
                : undefined,
            }, tenantApiKey);

            for (const call of batch) {
              if (!seen.has(call.id)) {
                seen.add(call.id);
                fetched.push(call);
              }
            }

            console.log(`[VAPI Sync] Fetched ${batch.length} calls from ${cursor.toISOString().split('T')[0]} (assistantFilter=${useAssistantFilter}, total: ${fetched.length})`);
          } catch (dayError) {
            failed++;
            console.error(`[VAPI Sync] Failed to fetch calls for ${cursor.toISOString().split('T')[0]} (assistantFilter=${useAssistantFilter}): ${dayError instanceof Error ? dayError.message : String(dayError)}`);
            if (failed >= days) {
              throw dayError;
            }
          }

          cursor = new Date(chunkEnd);
          cursor.setMilliseconds(cursor.getMilliseconds() + 1);

          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (failed > 0) {
          console.log(`[VAPI Sync] Warning: ${failed} day(s) failed to fetch (assistantFilter=${useAssistantFilter}), continuing with ${fetched.length} calls`);
        }
        return fetched;
      };

      const hasAssistantFilter = Boolean(userProfile?.vapi_assistant_id);
      const primary = await runChunkedFetch(hasAssistantFilter);
      vapiCalls = primary;

      // Fallback: if the assistant filter was applied and produced zero
      // calls, retry without the filter. This covers the common case where
      // profiles.vapi_assistant_id is stale/wrong but the tenant's API key
      // is correct. Tag these calls in metadata so we can tell them apart.
      if (hasAssistantFilter && primary.length === 0) {
        console.log(`[VAPI Sync] assistantId filter returned 0, retrying without filter`);
        const fallback = await runChunkedFetch(false);
        for (const call of fallback) {
          fallbackCallIds.add(call.id);
        }
        vapiCalls = fallback;
      }

      console.log(`[VAPI Sync] Total unique calls fetched: ${vapiCalls.length} (fallback=${fallbackCallIds.size})`);
    } catch (vapiError) {
      console.error("[VAPI Sync] Error fetching calls from VAPI:", vapiError);
      const errorMessage = vapiError instanceof Error ? vapiError.message : String(vapiError);
      const errorStack = vapiError instanceof Error ? vapiError.stack : undefined;
      
      // If it's a VAPI API error (like 401, 403), return more specific error
      if (vapiError instanceof Error && errorMessage.includes('401')) {
        return NextResponse.json(
          { 
            success: false,
            error: "VAPI API key is invalid or expired", 
            details: errorMessage,
          },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { 
          success: false,
          error: "Failed to fetch calls from VAPI", 
          details: errorMessage,
          stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
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

    // Preload existing vapi_call_ids for this user into a Set so we can skip
    // a per-call existence check. Previously this did up to N round trips to
    // Supabase per sync (where N = number of VAPI calls fetched), which was
    // the main cause of 504 timeouts once the user accumulated thousands of
    // historical calls.
    const existingIds = new Set<string>();
    {
      const batchSize = 1000;
      let from = 0;
      while (true) {
        const { data: existingRows, error: existingError } = await supabase
          .from("calls")
          .select("vapi_call_id")
          .eq("user_id", userId)
          .not("vapi_call_id", "is", null)
          .range(from, from + batchSize - 1) as {
          data: { vapi_call_id: string | null }[] | null;
          error: unknown;
        };
        if (existingError) {
          console.warn("[VAPI Sync] Could not preload existing ids:", existingError);
          break;
        }
        if (!existingRows || existingRows.length === 0) break;
        for (const row of existingRows) {
          if (row.vapi_call_id) existingIds.add(row.vapi_call_id);
        }
        if (existingRows.length < batchSize) break;
        from += batchSize;
      }
      console.log(`[VAPI Sync] Preloaded ${existingIds.size} existing vapi_call_ids`);
    }

    for (const vapiCall of vapiCalls) {
      if (existingIds.has(vapiCall.id)) {
        skipped++;
        continue;
      }

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

      // Clean the summary from markdown formatting
      const rawSummary = vapiCall.analysis?.summary || vapiCall.summary || null;
      const cleanedSummary = cleanCallSummary(rawSummary);
      
      // Use our own evaluation system (same as webhook handler)
      let parsedEvaluation: {
        score: number | null;
        sentiment: "positive" | "neutral" | "negative";
        outcome: string;
        tags: string[];
        summary: string | null;
        objections?: string[];
        nextAction?: string;
      };
      let callSummaryFromStructured: string | null = null;
      
      const textToEvaluate = vapiCall.transcript || cleanedSummary || "";
      
      if (textToEvaluate) {
        try {
          console.log(`[VAPI Sync] Evaluating call ${vapiCall.id} with our system...`);
          // Per-call 8s cap so a single slow OpenAI response can't cause the
          // whole sync to hit Vercel's function timeout. Falls back to the
          // endedReason-based default eval — the call still gets inserted.
          const evalTimeoutMs = 8000;
          const structuredEvaluation = await Promise.race([
            evaluateCallWithStructuredOutput(
              textToEvaluate,
              cleanedSummary,
              vapiCall.endedReason
            ),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Evaluation timeout after ${evalTimeoutMs}ms`)),
                evalTimeoutMs
              )
            ),
          ]);

          parsedEvaluation = {
            score: structuredEvaluation.successEvaluation.score,
            sentiment: structuredEvaluation.successEvaluation.sentiment,
            outcome: structuredEvaluation.successEvaluation.outcome,
            tags: structuredEvaluation.successEvaluation.tags || [],
            objections: structuredEvaluation.successEvaluation.objections,
            nextAction: structuredEvaluation.successEvaluation.nextAction,
            summary: structuredEvaluation.callSummary.callSummary,
          };
          callSummaryFromStructured = structuredEvaluation.callSummary.callSummary;
        } catch (error) {
          console.error(`[VAPI Sync] Error/timeout evaluating call ${vapiCall.id}:`, error);
          // Fallback to default evaluation — insert proceeds so the call
          // still shows up in the dashboard. Re-eval can run later via
          // /api/calls/evaluate.
          parsedEvaluation = createDefaultEvaluation(vapiCall.endedReason);
          callSummaryFromStructured = null;
        }
      } else {
        // No transcript/summary - use default evaluation
        parsedEvaluation = createDefaultEvaluation(vapiCall.endedReason);
        callSummaryFromStructured = null;
      }

      // Get assistant_id from VAPI call
      const assistantId = vapiCall.assistantId || vapiCall.assistant?.id || null;

      // Store our evaluation in structuredData (same format as webhook handler)
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

      const insertData: Record<string, unknown> = {
        user_id: userId,
        vapi_call_id: vapiCall.id,
        assistant_id: assistantId,
        recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
        transcript: vapiCall.transcript || null,
        summary: callSummaryFromStructured || cleanedSummary,
        sentiment: parsedEvaluation.sentiment,
        duration,
        type: vapiCall.type || 'outbound',
        caller_phone: vapiCall.customer?.number || null,
        caller_name: callerName,
        evaluation_score: parsedEvaluation.score,
        evaluation_summary: parsedEvaluation.nextAction || null,
        created_at: originalTimestamp, // Use original VAPI call time
        metadata: {
          orgId: vapiCall.orgId,
          status: vapiCall.status,
          endedReason: vapiCall.endedReason,
          cost: vapiCall.cost || vapiCall.costBreakdown?.total,
          callType: vapiCall.type,
          originalStartedAt: vapiCall.startedAt,
          originalEndedAt: vapiCall.endedAt,
          structuredData: ourStructuredData,
          tags: parsedEvaluation.tags,
          assistantId: assistantId, // Also store in metadata for filtering
          assistantFilterFallback: fallbackCallIds.has(vapiCall.id) || undefined,
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
    console.error("[VAPI Sync] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error for debugging
    if (error instanceof Error) {
      console.error("[VAPI Sync] Error name:", error.name);
      console.error("[VAPI Sync] Error message:", error.message);
      console.error("[VAPI Sync] Error stack:", error.stack);
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to sync VAPI calls", 
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
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

