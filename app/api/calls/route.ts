import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET - List all calls
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const type = searchParams.get("type");
    const sentiment = searchParams.get("sentiment");

    let query = supabase
      .from("calls")
      .select(`
        *,
        appointment:appointments(
          *,
          doctor:doctors(*)
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (type) {
      query = query.eq("type", type);
    }
    if (sentiment) {
      query = query.eq("sentiment", sentiment);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching calls:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: "Failed to fetch calls", details: errorMessage },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Calls API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Create a new call record
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    // Validate required fields
    if (!body.type) {
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400 }
      );
    }

    const callData = {
      vapi_call_id: body.vapi_call_id || null,
      appointment_id: body.appointment_id || null,
      recording_url: body.recording_url || null,
      transcript: body.transcript || null,
      summary: body.summary || null,
      sentiment: body.sentiment || "neutral",
      duration: body.duration || null,
      type: body.type,
      caller_phone: body.caller_phone || null,
      metadata: body.metadata || {},
    };

    const { data, error } = await supabase
      .from("calls")
      .insert(callData as never)
      .select()
      .single();

    if (error) {
      console.error("Error creating call:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: "Failed to create call", details: errorMessage },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    }, { status: 201 });
  } catch (error) {
    console.error("Calls API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH - Update a call (for manual corrections)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { callId, updates } = body;

    if (!callId) {
      return NextResponse.json(
        { error: "callId is required" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "updates object is required" },
        { status: 400 }
      );
    }

    // Whitelist of allowed fields for manual updates
    const allowedFields = [
      "evaluation_score",
      "summary",
      "evaluation_summary",
      "sentiment",
      "type",
    ];

    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        // Validate evaluation_score is between 1-10 or null
        if (key === "evaluation_score" && value !== null) {
          const score = Number(value);
          if (isNaN(score) || score < 1 || score > 10) {
            return NextResponse.json(
              { error: "evaluation_score must be between 1 and 10, or null" },
              { status: 400 }
            );
          }
          safeUpdates[key] = score;
        } else {
          safeUpdates[key] = value;
        }
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    safeUpdates.updated_at = new Date().toISOString();

    // Fetch the call first to verify it exists
    const { data: callData, error: fetchError } = await supabase
      .from("calls")
      .select("id")
      .eq("id", callId)
      .single();

    if (fetchError || !callData) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    // Update the call
    const { data, error } = await supabase
      .from("calls")
      .update(safeUpdates as never)
      .eq("id", callId)
      .select()
      .single();

    if (error) {
      console.error("Error updating call:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: "Failed to update call", details: errorMessage },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Calls PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
