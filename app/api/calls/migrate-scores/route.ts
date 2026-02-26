import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Migration endpoint to convert old 1-5 scores to new 1-10 scale
 * Formula: newScore = oldScore * 2
 * 
 * This ensures backward compatibility:
 * - Old 1 → New 2 (very negative)
 * - Old 2 → New 4 (negative) 
 * - Old 3 → New 6 (neutral)
 * - Old 4 → New 8 (positive)
 * - Old 5 → New 10 (excellent)
 */

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "true";
    const userId = searchParams.get("userId");

    const supabase = createAdminClient();

    // Find all calls with scores in 1-5 range (old system)
    let query = supabase
      .from("calls")
      .select("id, evaluation_score, caller_name, created_at")
      .not("evaluation_score", "is", null)
      .lte("evaluation_score", 5)
      .gte("evaluation_score", 1);

    // Optionally filter by user
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: callsToMigrate, error: fetchError } = await query as { data: { id: string; evaluation_score: number | null; caller_name: string | null; created_at: string }[] | null; error: any };

    if (fetchError) {
      console.error("Error fetching calls:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch calls", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!callsToMigrate || callsToMigrate.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls found with old 1-5 scores to migrate",
        migrated: 0,
        dryRun,
      });
    }

    const results = {
      total: callsToMigrate.length,
      migrated: 0,
      failed: 0,
      details: [] as Array<{
        id: string;
        oldScore: number;
        newScore: number;
        callerName: string | null;
      }>,
    };

    for (const call of callsToMigrate) {
      const oldScore = call.evaluation_score as number;
      const newScore = oldScore * 2; // Convert 1-5 to 2-10

      results.details.push({
        id: call.id,
        oldScore,
        newScore,
        callerName: call.caller_name,
      });

      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("calls")
          .update({ 
            evaluation_score: newScore,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call.id);

        if (updateError) {
          console.error(`Error updating call ${call.id}:`, updateError);
          results.failed++;
        } else {
          results.migrated++;
        }
      } else {
        results.migrated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun 
        ? `Dry run complete. ${results.total} calls would be migrated.`
        : `Migration complete. ${results.migrated} calls migrated, ${results.failed} failed.`,
      dryRun,
      results,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Migration failed", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Check migration status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const supabase = createAdminClient();

    // Count calls with old scores (1-5)
    let oldScoreQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .not("evaluation_score", "is", null)
      .lte("evaluation_score", 5)
      .gte("evaluation_score", 1);

    // Count calls with new scores (6-10)
    let newScoreQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .not("evaluation_score", "is", null)
      .gt("evaluation_score", 5);

    // Count calls with no score
    let noScoreQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .is("evaluation_score", null);

    if (userId) {
      oldScoreQuery = oldScoreQuery.eq("user_id", userId);
      newScoreQuery = newScoreQuery.eq("user_id", userId);
      noScoreQuery = noScoreQuery.eq("user_id", userId);
    }

    const [oldResult, newResult, noScoreResult] = await Promise.all([
      oldScoreQuery,
      newScoreQuery,
      noScoreQuery,
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        oldScoreSystem: oldResult.count || 0,
        newScoreSystem: newResult.count || 0,
        noScore: noScoreResult.count || 0,
        needsMigration: (oldResult.count || 0) > 0,
      },
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Failed to check status", details: String(error) },
      { status: 500 }
    );
  }
}
