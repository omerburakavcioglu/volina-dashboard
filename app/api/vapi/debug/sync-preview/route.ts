import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getVapiCalls, type VapiCall } from "@/lib/vapi-api";

export const maxDuration = 60;

function mask(secret: string | null | undefined): string | null {
  if (!secret) return null;
  const s = secret.trim();
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 4)}...${s.slice(-4)} (len=${s.length})`;
}

function summarizeCall(call: VapiCall) {
  return {
    id: call.id,
    status: call.status,
    type: call.type,
    endedReason: call.endedReason ?? null,
    assistantId: call.assistantId ?? call.assistant?.id ?? null,
    startedAt: call.startedAt ?? null,
    endedAt: call.endedAt ?? null,
    createdAt: call.createdAt,
    customerNumber: call.customer?.number ?? null,
    orgId: call.orgId,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const days = Math.min(parseInt(searchParams.get("days") || "2"), 14);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, vapi_private_key, vapi_assistant_id, vapi_org_id")
      .eq("id", userId)
      .single() as {
      data: {
        id: string;
        vapi_private_key?: string | null;
        vapi_assistant_id?: string | null;
        vapi_org_id?: string | null;
      } | null;
      error: unknown;
    };

    if (profileError || !profileRow) {
      return NextResponse.json(
        { error: "profile not found", details: String(profileError ?? "no row") },
        { status: 404 }
      );
    }

    const tenantApiKey = profileRow.vapi_private_key?.trim() || undefined;
    const assistantId = profileRow.vapi_assistant_id || null;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const createdAtGe = startDate.toISOString();
    const createdAtLe = new Date().toISOString();

    const fetchResult = async (useAssistantFilter: boolean) => {
      try {
        const calls = await getVapiCalls(
          {
            limit: 1000,
            createdAtGe,
            createdAtLe,
            assistantId: useAssistantFilter ? assistantId || undefined : undefined,
          },
          tenantApiKey
        );
        return { ok: true as const, count: calls.length, calls };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    };

    const [filtered, unfiltered] = await Promise.all([
      fetchResult(true),
      fetchResult(false),
    ]);

    const filteredIds = filtered.ok ? filtered.calls.map((c) => c.id) : [];
    const unfilteredIds = unfiltered.ok ? unfiltered.calls.map((c) => c.id) : [];

    const allIds = Array.from(new Set([...filteredIds, ...unfilteredIds]));

    const existingIds = new Set<string>();
    if (allIds.length > 0) {
      const { data: existingRows } = await supabase
        .from("calls")
        .select("vapi_call_id")
        .eq("user_id", userId)
        .in("vapi_call_id", allIds) as {
        data: { vapi_call_id: string | null }[] | null;
      };
      for (const row of existingRows ?? []) {
        if (row.vapi_call_id) existingIds.add(row.vapi_call_id);
      }
    }

    const missingFromDb = allIds.filter((id) => !existingIds.has(id));
    const recentUnfiltered = unfiltered.ok
      ? unfiltered.calls.slice(0, 3).map(summarizeCall)
      : [];
    const recentFiltered = filtered.ok
      ? filtered.calls.slice(0, 3).map(summarizeCall)
      : [];

    const filteredOnlyIds = filteredIds.filter((id) => !unfilteredIds.includes(id));
    const unfilteredOnlyIds = unfilteredIds.filter((id) => !filteredIds.includes(id));

    return NextResponse.json({
      userId,
      window: { days, createdAtGe, createdAtLe },
      profile: {
        vapi_private_key: mask(profileRow.vapi_private_key),
        vapi_assistant_id: assistantId,
        vapi_org_id: profileRow.vapi_org_id ?? null,
        usedTenantApiKey: Boolean(tenantApiKey),
      },
      vapi: {
        filteredByAssistant: filtered.ok
          ? { count: filtered.count, sample: recentFiltered }
          : { error: filtered.error },
        unfiltered: unfiltered.ok
          ? { count: unfiltered.count, sample: recentUnfiltered }
          : { error: unfiltered.error },
        onlyInFiltered: filteredOnlyIds,
        onlyInUnfiltered: unfilteredOnlyIds,
      },
      db: {
        existingVapiCallIds: Array.from(existingIds),
        missingFromDb,
        missingCount: missingFromDb.length,
      },
      diagnosis: {
        assistantFilterHidesCalls:
          filtered.ok && unfiltered.ok && filtered.count < unfiltered.count,
        vapiHasCallsButDbEmpty:
          (filtered.ok && filtered.count > 0 && existingIds.size === 0) ||
          (unfiltered.ok && unfiltered.count > 0 && existingIds.size === 0),
      },
    });
  } catch (error) {
    console.error("[VAPI Debug] sync-preview error:", error);
    return NextResponse.json(
      {
        error: "debug failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
