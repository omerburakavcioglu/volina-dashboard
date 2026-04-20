import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardVisibleCall {
  assistant_id?: string | null;
  metadata?: Record<string, unknown> | null;
  transcript?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export async function getUserAssistantId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("vapi_assistant_id")
    .eq("id", userId)
    .single();

  return profile?.vapi_assistant_id || null;
}

export function filterVisibleDashboardCalls<T extends DashboardVisibleCall>(
  calls: T[],
  _userAssistantId: string | null
): T[] {
  const initialCount = calls.length;

  // Only exclude Vapi dashboard test calls (webCall). Tenant isolation is
  // already enforced at the DB level via user_id; additional assistant_id
  // and transcript-pattern filtering was hiding legitimate calls.
  const filtered = calls.filter((call) => {
    const callType = call.metadata?.callType as string | undefined;
    return callType !== "webCall";
  });

  if (initialCount !== filtered.length) {
    console.log(`[Filter Calls] Initial: ${initialCount}, Final: ${filtered.length}, Removed (webCall): ${initialCount - filtered.length}`);
  }

  return filtered;
}
