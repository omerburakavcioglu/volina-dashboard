import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { cleanCallSummary } from "@/lib/utils";
import {
  evaluateCallWithStructuredOutput,
  enqueueOpenAiEvaluate,
  createDefaultEvaluation,
} from "@/app/api/vapi/sync/route";

/*
 * Vercel Cron Job — runs every minute.
 * Picks up rows in `calls` where evaluation_status='pending', runs the
 * OpenAI structured evaluation one at a time (TPM-friendly) and updates
 * the row. This is the only place the OpenAI evaluation runs in the
 * steady-state pipeline; ingestion (webhook / cron-sync) stays fast and
 * rate-limit-resilient.
 */

export const maxDuration = 300;

// Don't spend the whole 5 minutes on a single cron tick — leave headroom
// so a slow batch cannot overlap the next tick.
const PROCESS_BUDGET_MS = 55_000;
const BATCH_SIZE = 25;
const PER_CALL_TIMEOUT_MS = 45_000;

interface PendingCall {
  id: string;
  vapi_call_id: string | null;
  transcript: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  evaluation_status: string;
}

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

/** Optimistic lock: flip pending -> processing atomically on a single row. */
async function claimRow(
  supabase: ReturnType<typeof createAdminClient>,
  row: PendingCall
): Promise<boolean> {
  const { data, error } = await supabase
    .from("calls")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ evaluation_status: "processing" } as any)
    .eq("id", row.id)
    .eq("evaluation_status", "pending")
    .select("id");
  if (error) {
    console.warn(
      `[Evaluate Pending] Failed to claim row ${row.id}: ${error.message}`
    );
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function processRow(
  supabase: ReturnType<typeof createAdminClient>,
  row: PendingCall
): Promise<{ ok: boolean; status: "evaluated" | "failed"; error?: string }> {
  const endedReason =
    typeof row.metadata?.endedReason === "string"
      ? (row.metadata.endedReason as string)
      : undefined;

  const cleanedSummary = cleanCallSummary(row.summary);
  const textToEvaluate = row.transcript || cleanedSummary || "";

  // No transcript/summary — lock in the default eval and move on.
  if (!textToEvaluate) {
    const def = createDefaultEvaluation(endedReason);
    const { error } = await supabase
      .from("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        evaluation_status: "evaluated",
        sentiment: def.sentiment,
        evaluation_score: def.score,
        evaluation_summary: def.summary,
        metadata: {
          ...(row.metadata || {}),
          structuredData: {
            successEvaluation: {
              score: def.score,
              sentiment: def.sentiment,
              outcome: def.outcome,
              tags: def.tags,
            },
            callSummary: { callSummary: def.summary },
            evaluationSource: "default_no_transcript",
            evaluatedAt: new Date().toISOString(),
          },
          tags: def.tags,
        },
      } as any)
      .eq("id", row.id);
    if (error) {
      return { ok: false, status: "failed", error: error.message };
    }
    return { ok: true, status: "evaluated" };
  }

  try {
    const structured = await Promise.race([
      enqueueOpenAiEvaluate(() =>
        evaluateCallWithStructuredOutput(textToEvaluate, cleanedSummary, endedReason)
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Evaluation timeout after ${PER_CALL_TIMEOUT_MS}ms`)),
          PER_CALL_TIMEOUT_MS
        )
      ),
    ]);

    const callSummary =
      structured.callSummary?.callSummary || cleanedSummary || null;

    const structuredData = {
      successEvaluation: {
        score: structured.successEvaluation.score,
        sentiment: structured.successEvaluation.sentiment,
        outcome: structured.successEvaluation.outcome,
        tags: structured.successEvaluation.tags || [],
        objections: structured.successEvaluation.objections,
        nextAction: structured.successEvaluation.nextAction,
      },
      callSummary: { callSummary },
      evaluationSource: "our_evaluation_only",
      evaluatedAt: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        evaluation_status: "evaluated",
        sentiment: structured.successEvaluation.sentiment,
        evaluation_score: structured.successEvaluation.score,
        evaluation_summary: structured.successEvaluation.nextAction || null,
        summary: callSummary,
        metadata: {
          ...(row.metadata || {}),
          structuredData,
          tags: structured.successEvaluation.tags || [],
          evalError: undefined,
        },
      } as any)
      .eq("id", row.id);

    if (error) {
      return { ok: false, status: "failed", error: error.message };
    }
    return { ok: true, status: "evaluated" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Release back to pending unless this is a terminal error (e.g. repeated
    // rate limits exceeded maxAttempts). Use 'failed' for terminal errors so
    // we can inspect them manually; the row can be re-queued by setting
    // evaluation_status='pending' again.
    const terminal =
      /OpenAI API error/.test(message) || /Failed to parse/.test(message);
    const nextStatus: "pending" | "failed" = terminal ? "failed" : "pending";

    const { error: updErr } = await supabase
      .from("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        evaluation_status: nextStatus,
        metadata: {
          ...(row.metadata || {}),
          evalError: message.slice(0, 500),
          evalErrorAt: new Date().toISOString(),
        },
      } as any)
      .eq("id", row.id);

    if (updErr) {
      console.error(
        `[Evaluate Pending] Failed to write error state for ${row.id}: ${updErr.message}`
      );
    }

    return { ok: false, status: "failed", error: message };
  }
}

async function runEvaluatePendingCron(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  // Fetch a batch of oldest pending rows. Oldest-first keeps the queue FIFO
  // so users see evaluations land in the order calls happened.
  const { data: rows, error } = (await supabase
    .from("calls")
    .select("id, vapi_call_id, transcript, summary, metadata, evaluation_status")
    .eq("evaluation_status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE)) as { data: PendingCall[] | null; error: unknown };

  if (error) {
    console.error("[Evaluate Pending] Failed to fetch pending rows:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pending calls" },
      { status: 500 }
    );
  }

  const pending = rows || [];
  console.log(`[Evaluate Pending] Picked ${pending.length} pending row(s)`);

  let evaluated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    if (Date.now() - startedAt > PROCESS_BUDGET_MS) {
      console.log(
        `[Evaluate Pending] Hit time budget (${PROCESS_BUDGET_MS}ms), stopping early`
      );
      break;
    }

    const claimed = await claimRow(supabase, row);
    if (!claimed) {
      skipped++;
      continue;
    }

    const result = await processRow(supabase, row);
    if (result.ok) {
      evaluated++;
    } else {
      failed++;
      console.warn(
        `[Evaluate Pending] Row ${row.id} failed: ${result.error ?? "unknown"}`
      );
    }
  }

  const elapsed = Date.now() - startedAt;
  console.log(
    `[Evaluate Pending] Done. evaluated=${evaluated} failed=${failed} skipped=${skipped} elapsedMs=${elapsed}`
  );

  return NextResponse.json({
    success: true,
    picked: pending.length,
    evaluated,
    failed,
    skipped,
    elapsedMs: elapsed,
  });
}

export async function GET(request: NextRequest) {
  return runEvaluatePendingCron(request);
}

export async function POST(request: NextRequest) {
  return runEvaluatePendingCron(request);
}
