import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Backfill assistant_id for old calls based on greeting pattern
 * Maps greeting patterns to known assistant IDs
 */

// Known assistant patterns (greeting -> assistant_id)
const ASSISTANT_PATTERNS: { pattern: RegExp; assistantId: string; name: string }[] = [
  {
    pattern: /sarah.*smile.*holiday|smile.*holiday.*dental/i,
    assistantId: "b0767fb3-fa4e-4fad-a22c-403918ab354d",
    name: "Smile & Holiday (Sarah)"
  },
  {
    pattern: /merhaba.*voli|volina|voliano|volia.*ahu|ben ahu/i,
    assistantId: "dddad00f-4042-4845-b9cd-fb1bb8d73505",
    name: "Volina Türkçe (Ahu)"
  },
  {
    pattern: /özel.*gop.*dental|gop.*dantal|polikliniğinden.*eda/i,
    assistantId: "GOP_DENTAL", // Placeholder - needs actual ID
    name: "GOP Dental (Eda)"
  },
  {
    pattern: /asker.*alma.*danışma/i,
    assistantId: "ASKER_ALMA", // Placeholder - needs actual ID
    name: "Asker Alma Hattı"
  },
];

function detectAssistantFromGreeting(transcript: string): { assistantId: string; name: string } | null {
  if (!transcript) return null;
  
  // Get first AI message
  const firstAiMatch = transcript.match(/^AI:\s*(.+?)(?:\n|$)/i);
  if (!firstAiMatch || !firstAiMatch[1]) return null;
  
  const greeting = firstAiMatch[1];
  
  for (const { pattern, assistantId, name } of ASSISTANT_PATTERNS) {
    if (pattern.test(greeting)) {
      return { assistantId, name };
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const dryRun = searchParams.get("dryRun") === "true";
    const targetAssistant = searchParams.get("targetAssistant"); // Optional: only backfill to specific assistant

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Find calls without assistant_id that have transcripts
    const { data: callsWithoutAssistant, error: fetchError } = await supabase
      .from("calls")
      .select("id, transcript, caller_name, created_at")
      .eq("user_id", userId)
      .is("assistant_id", null) as { data: { id: string; transcript: string | null; caller_name: string | null; created_at: string }[] | null; error: any };

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Analyze and categorize calls
    const results: Record<string, { count: number; calls: string[] }> = {};
    const updates: { id: string; assistantId: string; name: string }[] = [];
    let unmatched = 0;

    for (const call of callsWithoutAssistant || []) {
      const detected = detectAssistantFromGreeting(call.transcript || "");
      
      if (detected && !detected.assistantId.includes("_")) { // Skip placeholders
        if (targetAssistant && detected.assistantId !== targetAssistant) {
          continue; // Skip if filtering by specific assistant
        }
        
        if (!results[detected.name]) {
          results[detected.name] = { count: 0, calls: [] };
        }
        const resultEntry = results[detected.name];
        if (resultEntry) {
          resultEntry.count++;
          if (resultEntry.calls.length < 3) {
            resultEntry.calls.push(call.caller_name || call.id);
          }
        }
        
        updates.push({ id: call.id, assistantId: detected.assistantId, name: detected.name });
      } else {
        unmatched++;
      }
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalCalls: callsWithoutAssistant?.length || 0,
        wouldUpdate: updates.length,
        unmatched,
        breakdown: results,
      });
    }

    // Perform updates
    let updated = 0;
    let failed = 0;

    for (const update of updates) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("calls")
        .update({ 
          assistant_id: update.assistantId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", update.id);

      if (error) {
        failed++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      totalCalls: callsWithoutAssistant?.length || 0,
      updated,
      failed,
      unmatched,
      breakdown: results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET - Check status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get user's current assistant_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("vapi_assistant_id")
      .eq("id", userId)
      .single() as { data: { vapi_assistant_id?: string | null } | null };

    // Count calls without assistant_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("assistant_id", null);

    return NextResponse.json({
      userAssistantId: profile?.vapi_assistant_id,
      callsWithoutAssistantId: count || 0,
      needsBackfill: (count || 0) > 0,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
