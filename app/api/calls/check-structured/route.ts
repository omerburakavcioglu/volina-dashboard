import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET - Check which calls have structured output vs old format
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    const supabase = createAdminClient();

    // Build query
    let query = supabase
      .from("calls")
      .select("id, created_at, evaluation_score, metadata, summary")
      .order("created_at", { ascending: false })
      .limit(limit);

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

    const calls = (callsData || []) as Array<{
      id: string;
      created_at: string;
      evaluation_score: number | null;
      metadata: Record<string, unknown> | null;
      summary: string | null;
    }>;

    // Categorize calls
    const withStructuredOutput: Array<{
      id: string;
      created_at: string;
      hasSuccessEvaluation: boolean;
      hasCallSummary: boolean;
    }> = [];
    
    const withOldFormat: Array<{
      id: string;
      created_at: string;
      hasSuccessEvaluationString: boolean;
    }> = [];
    
    const withNoEvaluation: Array<{
      id: string;
      created_at: string;
      hasTranscript: boolean;
    }> = [];

    calls.forEach(call => {
      const metadata = call.metadata || {};
      const structuredData = metadata.structuredData as Record<string, unknown> | undefined;
      
      // Check for new structured output format
      if (structuredData && typeof structuredData === 'object') {
        const hasSuccessEvaluation = !!(
          structuredData.successEvaluation && 
          typeof structuredData.successEvaluation === 'object'
        );
        const hasCallSummary = !!(
          structuredData.callSummary && 
          typeof structuredData.callSummary === 'object'
        );
        
        if (hasSuccessEvaluation || hasCallSummary) {
          withStructuredOutput.push({
            id: call.id,
            created_at: call.created_at,
            hasSuccessEvaluation,
            hasCallSummary,
          });
          return;
        }
      }
      
      // Check for old format (successEvaluation string in metadata)
      const hasSuccessEvaluationString = !!(
        metadata.successEvaluation && 
        typeof metadata.successEvaluation === 'string'
      );
      
      if (hasSuccessEvaluationString) {
        withOldFormat.push({
          id: call.id,
          created_at: call.created_at,
          hasSuccessEvaluationString: true,
        });
        return;
      }
      
      // No evaluation format found
      withNoEvaluation.push({
        id: call.id,
        created_at: call.created_at,
        hasTranscript: !!call.summary, // At least has summary
      });
    });

    // Calculate statistics
    const total = calls.length;
    const structuredCount = withStructuredOutput.length;
    const oldFormatCount = withOldFormat.length;
    const noEvaluationCount = withNoEvaluation.length;
    const structuredPercentage = total > 0 ? ((structuredCount / total) * 100).toFixed(1) : "0";

    return NextResponse.json({
      success: true,
      statistics: {
        total,
        withStructuredOutput: structuredCount,
        withOldFormat: oldFormatCount,
        withNoEvaluation: noEvaluationCount,
        structuredPercentage: `${structuredPercentage}%`,
      },
      breakdown: {
        newSystem: {
          count: structuredCount,
          percentage: structuredPercentage,
          calls: withStructuredOutput.slice(0, 10), // Show first 10
        },
        oldSystem: {
          count: oldFormatCount,
          calls: withOldFormat.slice(0, 10), // Show first 10
        },
        noEvaluation: {
          count: noEvaluationCount,
          calls: withNoEvaluation.slice(0, 10), // Show first 10
        },
      },
      message: structuredCount === total 
        ? "✅ Tüm aramalar yeni structured output sistemiyle değerlendirilmiş!"
        : structuredCount > 0
        ? `⚠️ ${structuredCount}/${total} arama yeni sistemle değerlendirilmiş (${structuredPercentage}%)`
        : "❌ Hiçbir arama yeni structured output sistemiyle değerlendirilmemiş",
    });
  } catch (error) {
    console.error("Check structured output error:", error);
    return NextResponse.json(
      { error: "Failed to check calls", details: String(error) },
      { status: 500 }
    );
  }
}
