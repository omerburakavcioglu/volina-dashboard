import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { POST as vapiSyncPOST } from "@/app/api/vapi/sync/route";

/*
 * Vercel Cron Job — runs every 2 minutes.
 * Pulls recent VAPI calls for every tenant that has a VAPI key into Supabase
 * without running OpenAI evaluation. Rows land with evaluation_status='pending'
 * and are picked up by /api/cron/evaluate-pending.
 */

export const maxDuration = 300;

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Skip if not configured
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

interface SyncResult {
  userId: string;
  ok: boolean;
  synced?: number;
  skipped?: number;
  total?: number;
  error?: string;
}

async function runSyncForUser(
  request: NextRequest,
  userId: string,
  days: number
): Promise<SyncResult> {
  const url = new URL(request.url);
  url.pathname = "/api/vapi/sync";
  url.search = `?userId=${encodeURIComponent(userId)}&days=${days}&skipEvaluation=true`;

  // Rebuild a NextRequest carrying the existing cron secret so auth
  // inside the sync handler (if any is added later) keeps working.
  const innerReq = new NextRequest(url, {
    method: "POST",
    headers: request.headers,
  });

  try {
    const response = await vapiSyncPOST(innerReq);
    const body = (await response.json()) as {
      success?: boolean;
      synced?: number;
      skipped?: number;
      total?: number;
      error?: string;
      details?: string;
    };
    if (!body.success) {
      return {
        userId,
        ok: false,
        error: body.error || body.details || "unknown sync error",
      };
    }
    return {
      userId,
      ok: true,
      synced: body.synced ?? 0,
      skipped: body.skipped ?? 0,
      total: body.total ?? 0,
    };
  } catch (err) {
    return {
      userId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runVapiSyncCron(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "2"), 14);

  const supabase = createAdminClient();

  // Pick tenants to sync. Primary signal is a per-tenant VAPI key. If the
  // global VAPI_PRIVATE_KEY is set we also include tenants that have a
  // vapi_assistant_id (they use the shared key but their own assistant).
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, vapi_private_key, vapi_assistant_id") as {
    data:
      | {
          id: string;
          vapi_private_key: string | null;
          vapi_assistant_id: string | null;
        }[]
      | null;
    error: unknown;
  };

  if (profilesError) {
    console.error("[VAPI Sync Cron] Failed to load profiles:", profilesError);
    return NextResponse.json(
      { success: false, error: "Failed to load profiles" },
      { status: 500 }
    );
  }

  const hasGlobalKey = Boolean(process.env.VAPI_PRIVATE_KEY);
  const candidates = (profiles || []).filter((p) => {
    if (p.vapi_private_key && p.vapi_private_key.trim()) return true;
    if (hasGlobalKey && p.vapi_assistant_id) return true;
    return false;
  });

  console.log(
    `[VAPI Sync Cron] Running for ${candidates.length} tenant(s), days=${days}`
  );

  let syncedTotal = 0;
  let skippedTotal = 0;
  let failed = 0;
  const perUser: SyncResult[] = [];

  for (const p of candidates) {
    const res = await runSyncForUser(request, p.id, days);
    perUser.push(res);
    if (res.ok) {
      syncedTotal += res.synced || 0;
      skippedTotal += res.skipped || 0;
    } else {
      failed++;
      console.error(
        `[VAPI Sync Cron] Sync failed for user ${p.id}: ${res.error}`
      );
    }
  }

  console.log(
    `[VAPI Sync Cron] Done. users=${candidates.length} synced=${syncedTotal} skipped=${skippedTotal} failed=${failed}`
  );

  return NextResponse.json({
    success: true,
    users: candidates.length,
    syncedTotal,
    skippedTotal,
    failed,
    perUser,
  });
}

// Vercel Cron invokes routes via GET by default.
export async function GET(request: NextRequest) {
  return runVapiSyncCron(request);
}

// Support manual POST triggering (e.g. for testing from the dashboard).
export async function POST(request: NextRequest) {
  return runVapiSyncCron(request);
}
