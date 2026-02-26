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
  type: string | null;
  sentiment: string | null;
  created_at: string;
  updated_at: string;
}

interface EvaluationResult {
  summary: string;
  evaluation: string;
  score: number;
  callType: string;
  sentiment: string;
}

async function evaluateCallWithAI(transcript: string, existingSummary?: string | null): Promise<EvaluationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `Sen bir AI arama değerlendirme asistanısın. Müşteri hizmetleri veya satış aramalarını analiz edip değerlendiriyorsun.

Görevin:
1. Aramanın kısa bir özetini çıkar (maksimum 2 cümle)
2. Aramanın kalitesini ve müşteri ilgisini değerlendir
3. 1-10 arası bir puan ver:
   - 1-2: Bağlantı kuruldu ama çok olumsuz (hemen kapattı, düşmanca, yanlış numara)
   - 3-4: Bağlantı kuruldu ama olumsuz (ilgisiz, kaba, hiç etkileşim yok)
   - 5-6: Nötr görüşme (dinledi ama kararsız, ilgi belirsiz)
   - 7-8: Olumlu ilgi (sorular sordu, bilgi istedi, takip istedi)
   - 9-10: Çok başarılı (randevu alındı, satış yapıldı, kesin taahhüt, sıcak lead)
4. Arama türünü belirle: appointment (randevu), inquiry (bilgi talebi), follow_up (takip), cancellation (iptal)
5. Duygu durumunu belirle: positive, neutral, negative

ÖNEMLİ KURALLAR:
- Gerçek bir görüşme olduysa (müşteri cevap verip konuştuysa) minimum puan 3'tür
- Sesli mesaja düşen aramalar bu fonksiyon tarafından değerlendirilmez (V olarak işaretlenir)
- Cevap verilmeyen aramalar bu fonksiyon tarafından değerlendirilmez (F olarak işaretlenir)
- Puanı dürüstçe ve tutarlı ver, her zaman aynı kriterleri uygula

JSON formatında yanıt ver:
{
  "summary": "Aramanın kısa özeti",
  "evaluation": "Detaylı değerlendirme ve öneriler",
  "score": 6,
  "callType": "inquiry",
  "sentiment": "neutral"
}`;

  const userMessage = existingSummary 
    ? `Arama Transkripti:\n${transcript}\n\nMevcut Özet:\n${existingSummary}`
    : `Arama Transkripti:\n${transcript}`;

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
      max_tokens: 500,
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
    return JSON.parse(cleanedContent);
  } catch {
    // If JSON parsing fails, create a basic response
    return {
      summary: "Arama değerlendirildi",
      evaluation: content,
      score: 3,
      callType: "inquiry",
      sentiment: "neutral",
    };
  }
}

// POST - Evaluate a single call
export async function POST(request: NextRequest) {
  try {
    const { callId } = await request.json();

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

    // Check if there's a transcript to evaluate
    if (!call.transcript && !call.summary) {
      return NextResponse.json(
        { error: "No transcript or summary available to evaluate" },
        { status: 400 }
      );
    }

    // Evaluate the call
    const textToEvaluate = call.transcript || call.summary || "";
    const evaluation = await evaluateCallWithAI(textToEvaluate, call.summary);

    // Update the call with evaluation results
    const updatePayload = {
      summary: evaluation.summary,
      evaluation_summary: evaluation.evaluation,
      evaluation_score: evaluation.score,
      type: evaluation.callType,
      sentiment: evaluation.sentiment,
      updated_at: new Date().toISOString(),
    };
    
    const { error: updateError } = await supabase
      .from("calls")
      .update(updatePayload as never)
      .eq("id", callId);

    if (updateError) {
      console.error("Error updating call:", updateError);
      return NextResponse.json(
        { error: "Failed to save evaluation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      evaluation: {
        summary: evaluation.summary,
        evaluation_summary: evaluation.evaluation,
        score: evaluation.score,
        type: evaluation.callType,
        sentiment: evaluation.sentiment,
      },
    });
  } catch (error) {
    console.error("Call evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate call", details: String(error) },
      { status: 500 }
    );
  }
}

// PUT - Evaluate multiple calls (batch)
export async function PUT(request: NextRequest) {
  try {
    const { callIds } = await request.json();

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

    for (const callId of callIds) {
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
          continue;
        }

        const call = callData as unknown as CallRecord;

        // Skip if already evaluated with a score
        if (call.evaluation_score !== null) {
          results.skipped++;
          continue;
        }

        // Skip if no transcript
        if (!call.transcript && !call.summary) {
          results.skipped++;
          continue;
        }

        // Evaluate
        const textToEvaluate = call.transcript || call.summary || "";
        const evaluation = await evaluateCallWithAI(textToEvaluate, call.summary);

        // Update
        const batchUpdatePayload = {
          summary: evaluation.summary,
          evaluation_summary: evaluation.evaluation,
          evaluation_score: evaluation.score,
          type: evaluation.callType,
          sentiment: evaluation.sentiment,
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
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        results.failed++;
        results.errors.push(`Error evaluating call ${callId}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Batch evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate calls", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Evaluate all unevaluated calls
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    const supabase = createAdminClient();

    // Fetch calls without evaluation that have transcripts
    const { data: callsData, error } = await supabase
      .from("calls")
      .select("id, transcript, summary")
      .is("evaluation_score", null)
      .not("transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch calls" },
        { status: 500 }
      );
    }

    const calls = (callsData || []) as unknown as Pick<CallRecord, "id" | "transcript" | "summary">[];

    const results = {
      evaluated: 0,
      failed: 0,
      total: calls.length,
    };

    for (const call of calls) {
      try {
        const textToEvaluate = call.transcript || call.summary || "";
        const evaluation = await evaluateCallWithAI(textToEvaluate, call.summary);

        const autoUpdatePayload = {
          summary: evaluation.summary,
          evaluation_summary: evaluation.evaluation,
          evaluation_score: evaluation.score,
          type: evaluation.callType,
          sentiment: evaluation.sentiment,
          updated_at: new Date().toISOString(),
        };

        await supabase
          .from("calls")
          .update(autoUpdatePayload as never)
          .eq("id", call.id);

        results.evaluated++;

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        results.failed++;
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Auto-evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to auto-evaluate calls", details: String(error) },
      { status: 500 }
    );
  }
}
