import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { computeCallScore } from "@/lib/dashboard/call-scoring";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(parseInt(searchParams.get("limit") || "5"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");
    const sortBy = searchParams.get("sortBy") || "score_desc";

    // First get total count
    let countQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .not("transcript", "is", null);

    if (userId) {
      countQuery = countQuery.eq("user_id", userId);
    }

    const { count: totalCount } = await countQuery;

    // Fetch calls with transcripts (all calls, not just evaluated ones)
    let query = supabase
      .from("calls")
      .select("id, created_at, transcript, summary, evaluation_score, evaluation_summary, sentiment, duration, metadata, caller_phone, caller_name")
      .not("transcript", "is", null);

    // For date sorting, we can use DB order directly
    if (sortBy === "date_desc") {
      query = query.order("created_at", { ascending: false });
    } else if (sortBy === "date_asc") {
      query = query.order("created_at", { ascending: true });
    } else {
      // For score sorting, we need to fetch all and sort in memory (to handle V/F/HR/SR properly)
      // Default to date_desc for now, we'll sort in memory
      query = query.order("created_at", { ascending: false });
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    // Fetch all matching calls (we'll paginate after sorting)
    const { data: allCalls, error } = await query;

    if (error) {
      console.error("Error fetching calls:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch calls", details: String(error) },
        { status: 500 }
      );
    }

    // Sort by score if needed (in-memory to handle V/F/HR/SR properly)
    type CallRow = {
      evaluation_score: number | string | null;
      transcript: string | null;
      summary: string | null;
      evaluation_summary: string | null;
      duration: number | null;
      sentiment: string | null;
      metadata: Record<string, unknown> | null;
    };
    
    let sortedCalls: CallRow[] = (allCalls || []) as CallRow[];
    if (sortBy === "score_desc" || sortBy === "score_asc") {
      sortedCalls = [...(allCalls || []) as CallRow[]].sort((a, b) => {
        const scoreA = computeCallScore({
          evaluation_score: a.evaluation_score,
          transcript: a.transcript,
          summary: a.summary,
          evaluation_summary: a.evaluation_summary,
          duration: a.duration,
          sentiment: a.sentiment,
          metadata: a.metadata,
        });
        const scoreB = computeCallScore({
          evaluation_score: b.evaluation_score,
          transcript: b.transcript,
          summary: b.summary,
          evaluation_summary: b.evaluation_summary,
          duration: b.duration,
          sentiment: b.sentiment,
          metadata: b.metadata,
        });
        
        // Convert display to sort key: V=1, F=2, HR (1-2)=3-4, SR (3-6)=5-8, Score (7-10)=9-12
        const getSortKey = (result: { display: string; numericScore: number | null }) => {
          if (result.display === "V") return 1;
          if (result.display === "F") return 2;
          if (result.numericScore !== null) {
            return result.numericScore + 2; // Score 1 → 3, Score 10 → 12
          }
          return 2; // Fallback
        };
        
        const keyA = getSortKey(scoreA);
        const keyB = getSortKey(scoreB);
        
        if (sortBy === "score_desc") {
          return keyB - keyA; // Higher scores first
        } else {
          return keyA - keyB; // Lower scores first
        }
      });
    }

    // Apply pagination after sorting
    const paginatedCalls = sortedCalls.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginatedCalls,
      count: paginatedCalls.length,
      total: totalCount || 0,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Evaluation review API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
