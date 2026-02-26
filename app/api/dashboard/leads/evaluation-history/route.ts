import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { filterVisibleDashboardCalls, getUserAssistantId } from "@/lib/dashboard/visible-calls";
import { computeCallScore } from "@/lib/dashboard/call-scoring";

/** Canonical form: digits only, strip international 00 prefix, then + prefix. */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  return `+${digits}`;
}

/** Add all lookup keys for a normalized phone so 10-digit and 11-digit (1+10) match */
function addPhoneKeys(map: Map<string, string>, norm: string, leadId: string) {
  if (!norm) return;
  const digits = norm.replace(/\D/g, "");
  map.set(norm, leadId);
  map.set(digits, leadId);
  if (digits.length === 11 && digits.startsWith("1")) {
    map.set("+" + digits.slice(1), leadId);
    map.set(digits.slice(1), leadId);
  }
  if (digits.length === 10) {
    map.set("+1" + digits, leadId);
    map.set("1" + digits, leadId);
  }
}

/**
 * GET /api/dashboard/leads/evaluation-history?userId=&leadIds=id1,id2,id3
 *
 * EVAL data comes ONLY from the calls table (same source as the Calls screen).
 * We do NOT call Vapi evaluation API — we use the call's stored evaluation_score
 * and metadata (evaluation_score/score written when the call is saved).
 *
 * Returns evaluation history and call counts per lead from calls table.
 * Matches calls to leads by caller_phone = lead.phone first, then metadata.lead_id.
 * data: { [leadId]: string[] } e.g. { "lead-1": ["V", "7", "8"] }
 * callCounts: { [leadId]: number }
 * V = voicemail, F = failed/no-answer, numbers = evaluation_score 1-10 (from calls.evaluation_score or metadata).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const leadIdsParam = searchParams.get("leadIds");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const leadIds = leadIdsParam
      ? leadIdsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    if (leadIds.length === 0) {
      return NextResponse.json({ success: true, data: {}, callCounts: {} });
    }

    const leadIdSet = new Set(leadIds);

    // Fetch leads to get phone numbers for matching
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, phone")
      .eq("user_id", userId)
      .in("id", leadIds) as { data: { id: string; phone: string | null }[] | null };
    const phoneToLeadId = new Map<string, string>();
    for (const l of leadsData || []) {
      const norm = normalizePhone(l.phone);
      if (norm) {
        addPhoneKeys(phoneToLeadId, norm, l.id);
      }
    }

    const since = new Date();
    since.setDate(since.getDate() - 365);

    const { data: calls, error } = await supabase
      .from("calls")
      .select("id, assistant_id, metadata, transcript, summary, evaluation_score, evaluation_summary, created_at, caller_phone, duration, sentiment")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000) as {
      data: {
        id: string;
        assistant_id: string | null;
        metadata: Record<string, unknown> | null;
        transcript: string | null;
        summary: string | null;
        evaluation_score: number | string | null;
        evaluation_summary: string | null;
        created_at: string;
        caller_phone: string | null;
        duration: number | null;
        sentiment: string | null;
      }[] | null;
      error: { message: string } | null;
    };

    if (error) {
      console.error("Error fetching calls for evaluation history:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const includeAllCallsForUser = searchParams.get("includeAllCallsForUser") === "1";
    const userAssistantId = includeAllCallsForUser
      ? null
      : await getUserAssistantId(supabase, userId);
    const visibleCalls = filterVisibleDashboardCalls(calls || [], userAssistantId);

    const byLead: Record<string, typeof visibleCalls> = {};
    for (const leadId of leadIds) {
      byLead[leadId] = [];
    }

    for (const call of visibleCalls) {
      const meta = (call.metadata || {}) as Record<string, unknown>;
      let lid: string | undefined;
      if (call.caller_phone) {
        const normCall = normalizePhone(call.caller_phone);
        const digits = normCall.replace(/\D/g, "");
        lid = phoneToLeadId.get(normCall) ?? phoneToLeadId.get(digits)
          ?? (digits.length === 11 && digits.startsWith("1") ? phoneToLeadId.get("+" + digits.slice(1)) ?? phoneToLeadId.get(digits.slice(1)) : undefined)
          ?? (digits.length === 10 ? phoneToLeadId.get("+1" + digits) ?? phoneToLeadId.get("1" + digits) : undefined);
      }
      if (!lid && meta.lead_id && leadIdSet.has(meta.lead_id as string)) {
        lid = meta.lead_id as string;
      }
      if (!lid) continue;

      if (!byLead[lid]) byLead[lid] = [];
      byLead[lid]!.push(call);
    }

    const result: Record<string, string[]> = {};
    const callCounts: Record<string, number> = {};
    for (const leadId of leadIds) {
      const entries = byLead[leadId] || [];
      callCounts[leadId] = entries.length;
      result[leadId] = entries.map((call) => {
        const scored = computeCallScore({
          evaluation_score: call.evaluation_score,
          transcript: call.transcript,
          summary: call.summary,
          evaluation_summary: call.evaluation_summary,
          duration: call.duration,
          sentiment: call.sentiment,
          metadata: call.metadata,
        });
        return scored.display;
      });
    }

    // Diagnostics when all callCounts are zero (helps debug tenant-specific empty CALLS/EVAL)
    const allCountsZero =
      leadIds.length > 0 && leadIds.every((id) => (callCounts[id] ?? 0) === 0);
    if (allCountsZero) {
      const totalCalls = (calls || []).length;
      const matchedToLeads = leadIds.reduce(
        (sum, id) => sum + (byLead[id]?.length ?? 0),
        0
      );
      console.log(
        "[EvalHistory] All callCounts zero for request.",
        "leadCount:",
        leadIds.length,
        "totalCalls:",
        totalCalls,
        "afterVisibility:",
        visibleCalls.length,
        "matchedToLeads:",
        matchedToLeads
      );
    }

    return NextResponse.json({ success: true, data: result, callCounts });
  } catch (err: unknown) {
    console.error("Evaluation history error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
