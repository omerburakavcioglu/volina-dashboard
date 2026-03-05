import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

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

    // Apply sorting
    if (sortBy === "score_desc") {
      query = query.order("evaluation_score", { ascending: false, nullsFirst: false });
    } else if (sortBy === "score_asc") {
      query = query.order("evaluation_score", { ascending: true, nullsFirst: true });
    } else if (sortBy === "date_desc") {
      query = query.order("created_at", { ascending: false });
    } else if (sortBy === "date_asc") {
      query = query.order("created_at", { ascending: true });
    } else {
      query = query.order("evaluation_score", { ascending: false, nullsFirst: false });
    }

    query = query.range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: calls, error } = await query;

    if (error) {
      console.error("Error fetching calls:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch calls", details: String(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: calls || [],
      count: calls?.length || 0,
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
