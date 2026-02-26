import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

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

  // Use the same prompt as VAPI structured output description
  const systemPrompt = `Analyze this call and evaluate its success. You must fill ALL required fields in the structured output.

CRITICAL RULES FOR SCORING (1-10 scale) - APPLY IN ORDER:

PRIORITY 1 - FAILED CONNECTIONS (Score 1-2, outcome "voicemail", "no_answer", or "busy"):
1. If caller NEVER responded or only AI spoke → score 1, outcome "no_answer"
2. If voicemail system answered OR customer said "leave me a message", "you can leave me a brief message", "leave a message", "I'll get back to you", "I will call you back", "I missed your call. Please leave me your name, number, and a brief message, and I will call you back" → score 1, outcome "voicemail" (CRITICAL: "leave me a message" = voicemail, NOT a conversation. Also: "I missed your call" + "leave me your name/number" + "I will call you back" = voicemail)
3. If customer said "can't take your call", "can't talk", "unavailable", "busy right now", "in a meeting" → score 1-2, outcome "busy" (this is NOT a successful call, user is not available to engage)
4. If call lasted <15 seconds with no real conversation → score 1 or 2, outcome "no_answer" or "not_interested"

PRIORITY 2 - IMMEDIATE REJECTIONS (Score 2-4):
5. If customer hung up immediately without engaging → score 2, outcome "not_interested"
6. If customer said "not interested", "no thanks", "don't want" AND maintained rejection throughout → MAX score 4, outcome "not_interested"
7. If customer asked for different language (e.g., "someone speak Spanish", "speak Turkish") → MAX score 3-4, outcome "not_interested" (language mismatch = not interested in current conversation)

PRIORITY 3 - MINIMAL ENGAGEMENT (Score 3-5):
8. If customer barely spoke (only greetings like "hello", "hi", "yes", "okay" without context) → MAX score 3, outcome "not_interested"
9. If customer only gave minimal passive responses (just "okay", "hello?", "yes" without context, no questions asked) → MAX score 3, outcome "needs_info" or "not_interested"
10. If customer said multiple "no" WITHOUT any positive engagement later → MAX score 5, outcome "not_interested"
11. If call duration <20 seconds and customer showed no interest → MAX score 4, outcome "not_interested"

PRIORITY 4 - POSITIVE ENGAGEMENT (Score 7-10):
12. IMPORTANT: If customer initially said "no" but THEN showed positive engagement (e.g., "I'm gonna hear", "tell me more", "yeah", "open to", "considering", "finding a solution", "let me think about it") → score 7-8, outcome "interested" (this shows they changed their mind or are open to learning more)
13. ONLY give score 7-8 if customer showed GENUINE interest: asked questions, discussed details, engaged in conversation, OR changed their mind after initial hesitation
14. ONLY give score 9-10 if appointment was set, sale was made, or strong commitment was given → outcome "appointment_set" or "interested"
15. If customer requested callback or follow-up → score 8-9, outcome "callback_requested"

Scoring (1-10):
- 1: No connection (voicemail, no answer, busy, only AI spoke, customer never responded, call <15 seconds)
- 2: Connected but immediately rejected (immediate hang up, "not interested" immediately, "wrong number", hostile)
- 3: Connected but minimal engagement (only greetings, barely spoke, no real conversation)
- 4: Connected but negative (said "not interested", "no thanks", declined, no engagement, call <20 seconds)
- 5: Neutral conversation (brief chat, listened but unclear interest, some "no" responses)
- 6: Neutral with some interest (listened, asked basic questions, but non-committal)
- 7: Positive interest (engaged conversation, asked questions, wants more info, showed genuine interest)
- 8: Strong interest (engaged, asked detailed questions, wants follow-up, discussed details)
- 9: Success (appointment set, callback scheduled, strong commitment, hot lead)
- 10: Great success (sale made, appointment confirmed, very strong commitment, VIP lead)

CRITICAL SCORING GUIDELINES:
- Be STRICT with high scores (7-10). Only give them if there's clear evidence of genuine interest or success.
- ALWAYS check call duration FIRST: very short calls (<20 seconds) cannot be highly successful (MAX score 4)
- ALWAYS check user engagement: if user said very few words (<10 words), it cannot be a great call (MAX score 5)
- If customer said "can't take your call", "unavailable", "busy", "in a meeting" → score 1-2, outcome "busy" (user is not available, this is NOT a successful engagement)
- If customer said "not interested" or similar AND maintained rejection throughout, NEVER give score > 4, outcome "not_interested"
- BUT: If customer initially said "no" but THEN showed positive engagement (e.g., "I'm gonna hear", "tell me more", "yeah", "open to", "considering", "let me think"), this is POSITIVE - give score 7-8, outcome "interested"
- If call was very short (<20 seconds) and customer didn't engage, NEVER give score > 4
- If customer barely spoke (only greetings like "hello", "hi"), NEVER give score > 3
- Pay attention to the FULL conversation: initial "no" followed by positive engagement indicates genuine interest - score 7-8
- NEVER give high scores (7-10) if user explicitly said they can't take the call or are unavailable - this is a failed connection, not a success
- Count user's actual words: if user said less than 10 meaningful words, MAX score is 5
- If user only responded with single words ("yes", "no", "okay", "hello") without context, MAX score is 3

OUTCOME VALUES (choose the most appropriate - MUST match the score):
- "appointment_set": Appointment or meeting was scheduled (score 9-10)
- "callback_requested": Customer asked to be called back later (score 8-9)
- "interested": Customer showed genuine interest but no commitment yet (score 7-8)
- "not_interested": Customer explicitly declined or showed no interest (score 2-4)
- "needs_info": Customer needs more information before deciding (score 5-6)
- "no_answer": Customer never answered the call (score 1)
- "voicemail": Call went to voicemail (score 1)
- "wrong_number": Wrong number or person reached (score 2)
- "busy": Line was busy or customer was unavailable (score 1-2)

SENTIMENT VALUES:
- "positive": Customer was positive, engaged, interested
- "neutral": Customer was neutral, neither positive nor negative
- "negative": Customer was negative, hostile, or clearly not interested

TAGS (add relevant tags from this list):
- "appointment_set", "callback_requested", "follow_up_needed"
- "hot_lead", "warm_lead", "cold_lead"
- "price_concern", "timing_concern", "needs_info"
- "interested", "not_interested", "highly_interested"
- "successful_call", "failed_call", "voicemail", "no_answer"
- "referral", "complaint", "vip_customer"

You must respond with a valid JSON object matching this exact structure:
{
  "successEvaluation": {
    "score": <1-10>,
    "sentiment": "<positive|neutral|negative>",
    "outcome": "<appointment_set|callback_requested|interested|not_interested|needs_info|no_answer|voicemail|wrong_number|busy>",
    "tags": ["<tag1>", "<tag2>"],
    "objections": ["<objection1>"] (optional),
    "nextAction": "<recommended next step>" (optional)
  },
  "callSummary": {
    "callSummary": "<2-3 sentence summary in call's language>"
  }
}`;

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
      },
    };

    // Update the call with structured evaluation results
    const updatePayload = {
      evaluation_score: structuredEvaluation.successEvaluation.score,
      sentiment: structuredEvaluation.successEvaluation.sentiment,
      evaluation_summary: structuredEvaluation.successEvaluation.nextAction || null,
      summary: structuredEvaluation.callSummary.callSummary,
      tags: structuredEvaluation.successEvaluation.tags,
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
        { error: "Failed to save structured evaluation" },
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

          // Check if already has structured output (unless force=true)
          const hasStructuredOutput = call.metadata?.structuredData && 
                                      typeof call.metadata.structuredData === 'object' &&
                                      (call.metadata.structuredData as Record<string, unknown>).successEvaluation;
          
          if (hasStructuredOutput && !force) {
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
            },
          };

          // Update
          const batchUpdatePayload = {
            evaluation_score: structuredEvaluation.successEvaluation.score,
            sentiment: structuredEvaluation.successEvaluation.sentiment,
            evaluation_summary: structuredEvaluation.successEvaluation.nextAction || null,
            summary: structuredEvaluation.callSummary.callSummary,
            tags: structuredEvaluation.successEvaluation.tags,
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
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const supabase = createAdminClient();

    // Build query to find calls without structured output
    let query = supabase
      .from("calls")
      .select("id, created_at, evaluation_score, metadata")
      .not("transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

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
    }>;

    // Filter calls that don't have structured output
    const callsNeedingReEvaluation = calls.filter(call => {
      const hasStructuredOutput = call.metadata?.structuredData && 
                                  typeof call.metadata.structuredData === 'object' &&
                                  (call.metadata.structuredData as Record<string, unknown>).successEvaluation;
      return !hasStructuredOutput;
    });

    return NextResponse.json({
      success: true,
      total: calls.length,
      needingReEvaluation: callsNeedingReEvaluation.length,
      calls: callsNeedingReEvaluation.map(c => ({
        id: c.id,
        created_at: c.created_at,
        hasStructuredOutput: false,
      })),
    });
  } catch (error) {
    console.error("Get calls for re-evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to get calls", details: String(error) },
      { status: 500 }
    );
  }
}
