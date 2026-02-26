import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { parseVapiEvaluation } from "@/lib/vapi-evaluation-parser";

interface CallRecord {
  id: string;
  vapi_call_id: string | null;
  transcript: string | null;
  summary: string | null;
  evaluation_score: number | null;
  evaluation_summary: string | null;
  tags?: string[] | null;
  metadata: {
    endedReason?: string;
    successEvaluation?: string;
    [key: string]: unknown;
  } | null;
}

// Check if tags column exists
async function checkTagsColumnExists(supabase: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { error } = await supabase
    .from("calls")
    .select("tags")
    .limit(1);
  
  return !error || !error.message.includes("tags");
}

// Helper to check if endedReason indicates a failed connection
function isFailedConnection(endedReason: string | undefined): boolean {
  if (!endedReason) return false;
  const reason = endedReason.toLowerCase();
  return reason.includes('no-answer') || 
         reason.includes('customer-did-not-answer') ||
         reason.includes('voicemail') || 
         reason.includes('busy');
}

// POST - Backfill evaluation scores and tags for existing calls
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const forceAll = searchParams.get("forceAll") === "true";
    const fixFailedOnly = searchParams.get("fixFailedOnly") === "true"; // New option
    
    // Check if tags column exists
    const tagsColumnExists = await checkTagsColumnExists(supabase);
    console.log("Tags column exists:", tagsColumnExists);
    
    // Build select query based on available columns
    const selectColumns = tagsColumnExists 
      ? "id, vapi_call_id, transcript, summary, evaluation_score, evaluation_summary, tags, metadata"
      : "id, vapi_call_id, transcript, summary, evaluation_score, evaluation_summary, metadata";
    
    // Get calls that need evaluation
    let query = supabase
      .from("calls")
      .select(selectColumns);
    
    // By default, only process calls without evaluation score (unless forceAll or fixFailedOnly)
    if (!forceAll && !fixFailedOnly) {
      query = query.is("evaluation_score", null);
    }
    
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    const { data: calls, error: callsError } = await query as { 
      data: CallRecord[] | null; 
      error: { message: string } | null 
    };
    
    if (callsError) {
      console.error("Error fetching calls:", callsError);
      return NextResponse.json(
        { error: "Failed to fetch calls", details: callsError.message },
        { status: 500 }
      );
    }
    
    if (!calls || calls.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls need evaluation backfilling",
        updated: 0,
        total: 0,
        tagsColumnExists,
      });
    }
    
    console.log(`Found ${calls.length} calls to evaluate`);
    
    let updated = 0;
    let skipped = 0;
    let failedConnectionsFixed = 0;
    const results: Array<{ 
      call_id: string; 
      score: number | null; 
      tags: string[]; 
      status: string 
    }> = [];
    
    for (const call of calls) {
      const endedReason = call.metadata?.endedReason as string | undefined;
      
      // PRIORITY 1: Fix failed connections (no-answer, voicemail, busy) to score 1
      if (isFailedConnection(endedReason)) {
        // Always set to 1 for failed connections, regardless of current value
        if (call.evaluation_score !== 1) {
          const { error: updateError } = await supabase
            .from("calls")
            .update({ 
              evaluation_score: 1, 
              sentiment: 'negative' 
            } as never)
            .eq("id", call.id);
          
          if (!updateError) {
            updated++;
            failedConnectionsFixed++;
            results.push({ 
              call_id: call.id, 
              score: 1, 
              tags: ['failed_connection'], 
              status: `fixed_failed_connection (was ${call.evaluation_score})` 
            });
          } else {
            results.push({ 
              call_id: call.id, 
              score: null, 
              tags: [], 
              status: "error: " + updateError.message 
            });
          }
        } else {
          skipped++;
          results.push({ 
            call_id: call.id, 
            score: 1, 
            tags: [], 
            status: "already_correct" 
          });
        }
        continue;
      }
      
      // If fixFailedOnly mode, skip non-failed calls
      if (fixFailedOnly) {
        skipped++;
        continue;
      }
      
      // Try to get successEvaluation from metadata
      const successEvaluation = call.metadata?.successEvaluation as string | undefined;
      
      // Parse the evaluation
      const parsed = parseVapiEvaluation(successEvaluation, endedReason);
      
      // If no meaningful data was extracted and call already has some evaluation, skip
      if (parsed.score === null && parsed.tags.length === 0 && call.evaluation_score !== null) {
        skipped++;
        results.push({ 
          call_id: call.id, 
          score: call.evaluation_score, 
          tags: call.tags || [], 
          status: "skipped_has_data" 
        });
        continue;
      }
      
      // If we have a transcript/summary but no VAPI evaluation, try to infer score
      if (parsed.score === null && (call.transcript || call.summary)) {
        const content = (call.transcript || "") + " " + (call.summary || "");
        const lowerContent = content.toLowerCase();
        
        // Simple inference based on content
        if (lowerContent.includes("randevu") || lowerContent.includes("appointment") || 
            lowerContent.includes("rezervasyon") || lowerContent.includes("booking")) {
          parsed.score = 8;
          parsed.tags.push("appointment_set");
        } else if (lowerContent.includes("ilgili") || lowerContent.includes("interested") ||
                   lowerContent.includes("isterim") || lowerContent.includes("want")) {
          parsed.score = 7;
          parsed.tags.push("interested");
        } else if (lowerContent.includes("ilgisiz") || lowerContent.includes("not interested") ||
                   lowerContent.includes("istemiyorum")) {
          parsed.score = 3;
          parsed.tags.push("not_interested");
        } else if (call.transcript && call.transcript.length > 100) {
          // Has substantial transcript, assume moderate score
          parsed.score = 5;
        } else if (call.transcript && call.transcript.length > 0) {
          // Has some transcript
          parsed.score = 4;
        }
      }
      
      // Only update if we have something to update
      if (parsed.score !== null || parsed.tags.length > 0 || parsed.summary) {
        const updateData: Record<string, unknown> = {};
        
        if (parsed.score !== null) {
          updateData.evaluation_score = parsed.score;
        }
        if (parsed.summary && !call.evaluation_summary) {
          updateData.evaluation_summary = parsed.summary;
        }
        // Only include tags if column exists
        if (tagsColumnExists && parsed.tags.length > 0) {
          const existingTags = call.tags || [];
          const mergedTags = [...new Set([...existingTags, ...parsed.tags])];
          updateData.tags = mergedTags;
        }
        if (parsed.sentiment && parsed.sentiment !== "neutral") {
          updateData.sentiment = parsed.sentiment;
        }
        
        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from("calls")
            .update(updateData as never)
            .eq("id", call.id);
          
          if (updateError) {
            console.error(`Error updating call ${call.id}:`, updateError);
            results.push({ 
              call_id: call.id, 
              score: null, 
              tags: [], 
              status: "error: " + updateError.message 
            });
          } else {
            updated++;
            results.push({ 
              call_id: call.id, 
              score: parsed.score, 
              tags: parsed.tags, 
              status: "updated" 
            });
          }
        } else {
          skipped++;
          results.push({ 
            call_id: call.id, 
            score: null, 
            tags: [], 
            status: "no_changes" 
          });
        }
      } else {
        skipped++;
        results.push({ 
          call_id: call.id, 
          score: null, 
          tags: [], 
          status: "no_data" 
        });
      }
    }
    
    console.log(`Evaluation backfill complete: ${updated} updated (${failedConnectionsFixed} failed connections fixed), ${skipped} skipped`);
    
    return NextResponse.json({
      success: true,
      message: `Backfilled ${updated} calls with evaluation data (${failedConnectionsFixed} failed connections fixed to score 1)`,
      updated,
      failedConnectionsFixed,
      skipped,
      total: calls.length,
      tagsColumnExists,
      results: results.slice(0, 50), // Only return first 50 for readability
    });
    
  } catch (error) {
    console.error("Evaluation backfill error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Check how many calls need evaluation
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    
    // Check if tags column exists
    const tagsColumnExists = await checkTagsColumnExists(supabase);
    
    // Count calls without evaluation score
    let query = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .is("evaluation_score", null);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    const { count, error } = await query;
    
    if (error) {
      return NextResponse.json(
        { error: "Failed to count calls", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      calls_needing_evaluation: count || 0,
      tagsColumnExists,
      message: count ? `${count} calls can be evaluated` : "No calls need evaluation",
      note: !tagsColumnExists ? "Tags column missing - run migration to enable tags" : undefined,
    });
    
  } catch (error) {
    console.error("Evaluation check error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
