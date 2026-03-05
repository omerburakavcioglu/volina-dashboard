import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { EVALUATION_SYSTEM_PROMPT } from "@/lib/evaluation-prompt";

// OpenAI API configuration
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

interface CallRecord {
  id: string;
  transcript: string | null;
  summary: string | null;
  evaluation_score: number | null;
  evaluation_summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface StructuredEvaluationResult {
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
}

/**
 * Evaluate call with OpenAI using structured output format (same as VAPI)
 */
async function evaluateCallWithStructuredOutput(
  transcript: string,
  existingSummary?: string | null,
  endedReason?: string
): Promise<StructuredEvaluationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  // Use our own evaluation prompt
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
    
    return parsed as StructuredEvaluationResult;
  } catch (error) {
    console.error("Error parsing structured output:", error);
    throw new Error(`Failed to parse structured output: ${error}`);
  }
}

// POST - Re-evaluate a single call with structured output format
export async function POST(request: NextRequest) {
  try {
    const { callId, force = false } = await request.json();

    if (!callId) {
      return NextResponse.json(
        { error: "callId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch the call
    const { data: callData, error: fetchError } = await supabase
      .from("calls")
      .select("*")
      .eq("id", callId)
      .single();

    if (fetchError || !callData) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    const call = callData as unknown as CallRecord;

    // Check if already has structured output (unless force=true)
    const hasStructuredOutput = call.metadata?.structuredData && 
                                typeof call.metadata.structuredData === 'object' &&
                                (call.metadata.structuredData as Record<string, unknown>).successEvaluation;
    
    if (hasStructuredOutput && !force) {
      return NextResponse.json(
        { 
          error: "Call already has structured output. Use force=true to re-evaluate.",
          hasStructuredOutput: true 
        },
        { status: 400 }
      );
    }

    // Check if there's a transcript to evaluate
    if (!call.transcript && !call.summary) {
      return NextResponse.json(
        { error: "No transcript or summary available to evaluate" },
        { status: 400 }
      );
    }

    // Get endedReason from metadata
    const endedReason = call.metadata?.endedReason as string | undefined;

    // Evaluate the call with structured output format
    const textToEvaluate = call.transcript || call.summary || "";
    const structuredEvaluation = await evaluateCallWithStructuredOutput(
      textToEvaluate,
      call.summary,
      endedReason
    );

    // Update metadata with structured output
    const updatedMetadata = {
      ...(call.metadata || {}),
      structuredData: {
        successEvaluation: structuredEvaluation.successEvaluation,
        callSummary: structuredEvaluation.callSummary,
        evaluationSource: "our_evaluation_only",
        evaluatedAt: new Date().toISOString(),
      },
      // Store tags in metadata since tags column doesn't exist in database
      tags: structuredEvaluation.successEvaluation.tags,
    };

    // Update the call with structured evaluation results
    const updatePayload = {
      evaluation_score: structuredEvaluation.successEvaluation.score,
      sentiment: structuredEvaluation.successEvaluation.sentiment,
      evaluation_summary: structuredEvaluation.successEvaluation.nextAction || null,
      summary: structuredEvaluation.callSummary.callSummary,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    };
    
    const { error: updateError } = await supabase
      .from("calls")
      .update(updatePayload as never)
      .eq("id", callId);

    if (updateError) {
      console.error("Error updating call:", updateError);
      return NextResponse.json(
        { 
          error: "Failed to save structured evaluation",
          details: String(updateError),
          updateError: updateError
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Call re-evaluated with structured output format",
      evaluation: structuredEvaluation,
    });
  } catch (error) {
    console.error("Structured re-evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to re-evaluate call", details: String(error) },
      { status: 500 }
    );
  }
}

// PUT - Re-evaluate multiple calls (batch) with structured output format
export async function PUT(request: NextRequest) {
  try {
    const { callIds, force = false, limit = 50 } = await request.json();

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return NextResponse.json(
        { error: "callIds array is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const results = {
      evaluated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process calls in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < Math.min(callIds.length, limit); i += batchSize) {
      const batch = callIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (callId: string) => {
        try {
          // Fetch the call
          const { data: callData, error: fetchError } = await supabase
            .from("calls")
            .select("*")
            .eq("id", callId)
            .single();

          if (fetchError || !callData) {
            results.failed++;
            results.errors.push(`Call ${callId} not found`);
            return;
          }

          const call = callData as unknown as CallRecord;

          // Check if already has structured output from our system (unless force=true)
          const structuredData = call.metadata?.structuredData;
          const hasStructuredOutput = structuredData && 
                                      typeof structuredData === 'object' &&
                                      (structuredData as Record<string, unknown>).successEvaluation;
          const evaluatedByUs = structuredData && 
                               typeof structuredData === 'object' &&
                               (structuredData as Record<string, unknown>).evaluationSource === 'our_evaluation_only';
          
          if (hasStructuredOutput && evaluatedByUs && !force) {
            results.skipped++;
            return;
          }

          // Skip if no transcript
          if (!call.transcript && !call.summary) {
            results.skipped++;
            return;
          }

          // Get endedReason from metadata
          const endedReason = call.metadata?.endedReason as string | undefined;

          // Evaluate with structured output format
          const textToEvaluate = call.transcript || call.summary || "";
          const structuredEvaluation = await evaluateCallWithStructuredOutput(
            textToEvaluate,
            call.summary,
            endedReason
          );

          // Update metadata with structured output
          const updatedMetadata = {
            ...(call.metadata || {}),
            structuredData: {
              successEvaluation: structuredEvaluation.successEvaluation,
              callSummary: structuredEvaluation.callSummary,
              evaluationSource: "our_evaluation_only",
              evaluatedAt: new Date().toISOString(),
            },
            // Store tags in metadata since tags column doesn't exist in database
            tags: structuredEvaluation.successEvaluation.tags,
          };

          // Update
          const batchUpdatePayload = {
            evaluation_score: structuredEvaluation.successEvaluation.score,
            sentiment: structuredEvaluation.successEvaluation.sentiment,
            evaluation_summary: structuredEvaluation.successEvaluation.nextAction || null,
            summary: structuredEvaluation.callSummary.callSummary,
            metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          };
          
          const { error: updateError } = await supabase
            .from("calls")
            .update(batchUpdatePayload as never)
            .eq("id", callId);

          if (updateError) {
            results.failed++;
            results.errors.push(`Failed to update call ${callId}`);
          } else {
            results.evaluated++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          results.failed++;
          results.errors.push(`Error evaluating call ${callId}: ${String(err)}`);
        }
      }));
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Batch structured re-evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to re-evaluate calls", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Find calls that need structured output re-evaluation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    const supabase = createAdminClient();

    // Build query to find calls without structured output
    // Get calls that have either transcript or summary
    // Get more calls to ensure we find unevaluated ones
    let query = supabase
      .from("calls")
      .select("id, created_at, evaluation_score, metadata, transcript, summary")
      .or("transcript.not.is.null,summary.not.is.null")
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 5, 100)); // Get 5x more to filter down, minimum 100

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: callsData, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch calls" },
        { status: 500 }
      );
    }

    const calls = (callsData || []) as Array<{
      id: string;
      created_at: string;
      evaluation_score: number | null;
      metadata: Record<string, unknown> | null;
      transcript: string | null;
      summary: string | null;
    }>;

    // Filter calls that don't have structured output from our evaluation system
    const callsNeedingReEvaluation = calls.filter(call => {
      // Must have transcript or summary to evaluate
      if (!call.transcript && !call.summary) {
        return false;
      }
      
      const structuredData = call.metadata?.structuredData;
      
      // Check if it has our structured evaluation
      const hasStructuredOutput = structuredData && 
                                  typeof structuredData === 'object' &&
                                  (structuredData as Record<string, unknown>).successEvaluation;
      
      // Check if it was evaluated by our system (not VAPI)
      const evaluatedByUs = structuredData && 
                           typeof structuredData === 'object' &&
                           (structuredData as Record<string, unknown>).evaluationSource === 'our_evaluation_only';
      
      // Need re-evaluation if: no structured output OR not evaluated by our system
      return !hasStructuredOutput || !evaluatedByUs;
    }).slice(0, limit); // Limit to requested amount

    return NextResponse.json({
      success: true,
      total: calls.length,
      needingReEvaluation: callsNeedingReEvaluation.length,
      calls: callsNeedingReEvaluation.map(c => ({
        id: c.id,
        created_at: c.created_at,
        hasStructuredOutput: false,
      })),
      debug: {
        totalCalls: calls.length,
        withTranscript: calls.filter(c => c.transcript).length,
        withSummary: calls.filter(c => c.summary).length,
        withStructuredData: calls.filter(c => {
          const sd = c.metadata?.structuredData;
          return sd && typeof sd === 'object' && (sd as Record<string, unknown>).successEvaluation;
        }).length,
        evaluatedByUs: calls.filter(c => {
          const sd = c.metadata?.structuredData;
          return sd && typeof sd === 'object' && (sd as Record<string, unknown>).evaluationSource === 'our_evaluation_only';
        }).length,
      },
    });
  } catch (error) {
    console.error("Get calls for re-evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to get calls", details: String(error) },
      { status: 500 }
    );
  }
}
