import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST - Re-evaluate all calls for a user (or all users if admin)
export async function POST(request: NextRequest) {
  try {
    const { userId, force = true, limit = 10000, batchSize = 50 } = await request.json();

    const supabase = createAdminClient();

    // First, get total count
    let countQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .not("transcript", "is", null);

    if (userId) {
      countQuery = countQuery.eq("user_id", userId);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      return NextResponse.json(
        { error: "Failed to count calls", details: countError.message },
        { status: 500 }
      );
    }

    const maxCalls = Math.min(limit, totalCount || 0);
    const allCallIds: string[] = [];
    let processed = 0;
    const pageSize = 1000; // Fetch 1000 at a time

    // Fetch all call IDs in batches
    while (processed < maxCalls) {
      let query = supabase
        .from("calls")
        .select("id, transcript, summary")
        .not("transcript", "is", null)
        .order("created_at", { ascending: false })
        .range(processed, Math.min(processed + pageSize - 1, maxCalls - 1));

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data: callsData, error } = await query;

      if (error) {
        return NextResponse.json(
          { error: "Failed to fetch calls", details: error.message },
          { status: 500 }
        );
      }

      if (!callsData || callsData.length === 0) {
        break;
      }

      // Type assertion for calls data
      const typedCallsData = callsData as Array<{
        id: string;
        transcript: string | null;
        summary: string | null;
        metadata?: Record<string, unknown> | null;
      }>;

      // Filter calls that need re-evaluation
      const callsNeedingReEvaluation = typedCallsData.filter(call => {
        if (force) return true; // Force mode: re-evaluate all
        
        // For non-force mode, check if has structured output
        const metadata = call.metadata as Record<string, unknown> | null;
        const hasStructuredOutput = metadata?.structuredData && 
                                    typeof metadata.structuredData === 'object' &&
                                    (metadata.structuredData as Record<string, unknown>).successEvaluation;
        return !hasStructuredOutput;
      });

      allCallIds.push(...callsNeedingReEvaluation.map(c => c.id));
      processed += callsData.length;

      if (callsData.length < pageSize) {
        break;
      }
    }

    if (allCallIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls need re-evaluation",
        total: totalCount || 0,
        needingReEvaluation: 0,
        evaluated: 0,
      });
    }

    // Process in batches to avoid overwhelming the API
    const results = {
      evaluated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const actualBatchSize = Math.min(batchSize, 50); // Max 50 at a time
    const totalBatches = Math.ceil(allCallIds.length / actualBatchSize);

    for (let i = 0; i < allCallIds.length; i += actualBatchSize) {
      const batch = allCallIds.slice(i, i + actualBatchSize);
      const batchNumber = Math.floor(i / actualBatchSize) + 1;

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} calls)...`);

      try {
        // Use the batch endpoint
        const reEvaluateResponse = await fetch(`${request.nextUrl.origin}/api/calls/re-evaluate-structured`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callIds: batch,
            force,
            limit: batch.length,
          }),
        });

        if (!reEvaluateResponse.ok) {
          const error = await reEvaluateResponse.json();
          results.failed += batch.length;
          results.errors.push(`Batch ${batchNumber} failed: ${error.error || 'Unknown error'}`);
          console.error(`Batch ${batchNumber} failed:`, error);
          continue;
        }

        const batchResults = await reEvaluateResponse.json();
        results.evaluated += batchResults.results?.evaluated || 0;
        results.failed += batchResults.results?.failed || 0;
        results.skipped += batchResults.results?.skipped || 0;
        if (batchResults.results?.errors) {
          results.errors.push(...batchResults.results.errors);
        }

        // Small delay between batches to avoid rate limiting
        if (i + actualBatchSize < allCallIds.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        results.failed += batch.length;
        results.errors.push(`Batch ${batchNumber} error: ${String(error)}`);
        console.error(`Batch ${batchNumber} error:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Re-evaluation complete for ${allCallIds.length} calls`,
      total: totalCount || 0,
      needingReEvaluation: allCallIds.length,
      results: {
        evaluated: results.evaluated,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors.slice(0, 50), // Limit error messages
      },
    });
  } catch (error) {
    console.error("Re-evaluate all calls error:", error);
    return NextResponse.json(
      { error: "Failed to re-evaluate calls", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Check how many calls need re-evaluation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "1000"), 1000);

    const supabase = createAdminClient();

    // Build query
    let query = supabase
      .from("calls")
      .select("id, created_at, evaluation_score, metadata", { count: "exact" })
      .not("transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: callsData, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch calls", details: error.message },
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
      total: count || calls.length,
      needingReEvaluation: callsNeedingReEvaluation.length,
      percentage: count && count > 0 
        ? ((callsNeedingReEvaluation.length / count) * 100).toFixed(1) + "%"
        : "0%",
      message: callsNeedingReEvaluation.length === 0
        ? "✅ All calls already have structured output!"
        : `⚠️ ${callsNeedingReEvaluation.length}/${count || calls.length} calls need re-evaluation`,
    });
  } catch (error) {
    console.error("Check re-evaluation status error:", error);
    return NextResponse.json(
      { error: "Failed to check calls", details: String(error) },
      { status: 500 }
    );
  }
}
