import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardVisibleCall {
  assistant_id?: string | null;
  metadata?: Record<string, unknown> | null;
  transcript?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

const WRONG_ASSISTANT_PATTERNS = [
  "gop dentel",
  "özel gop dentel",
  "gop dentel diş polikliniği",
  "eda ben",
  "turkcell sekreter servisi",
];

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
  userAssistantId: string | null
): T[] {
  let filtered = calls;
  const initialCount = calls.length;
  let assistantFiltered = 0;
  let webCallFiltered = 0;
  let patternFiltered = 0;

  // Include calls that match assistant OR legacy calls without assistant
  if (userAssistantId && filtered.length > 0) {
    const beforeAssistantFilter = filtered.length;
    filtered = filtered.filter((call) => {
      const callAssistantId = (call as Record<string, unknown>).assistant_id as
        | string
        | undefined;
      const metadataAssistantId = call.metadata?.assistantId as string | undefined;
      const hasAssistantId = callAssistantId || metadataAssistantId;
      if (!hasAssistantId) return true; // Legacy calls without assistant_id are included
      return callAssistantId === userAssistantId || metadataAssistantId === userAssistantId;
    });
    assistantFiltered = beforeAssistantFilter - filtered.length;
  }

  // Exclude webCall (Vapi dashboard test calls)
  const beforeWebCallFilter = filtered.length;
  filtered = filtered.filter((call) => {
    const callType = call.metadata?.callType as string | undefined;
    return callType !== "webCall";
  });
  webCallFiltered = beforeWebCallFilter - filtered.length;

  // Exclude wrong-assistant conversations by transcript/summary text
  const beforePatternFilter = filtered.length;
  filtered = filtered.filter((call) => {
    const transcript = String(call.transcript || "").toLowerCase();
    const summary = String(call.summary || "").toLowerCase();
    const textToCheck = `${transcript} ${summary}`;
    return !WRONG_ASSISTANT_PATTERNS.some((pattern) =>
      textToCheck.includes(pattern.toLowerCase())
    );
  });
  patternFiltered = beforePatternFilter - filtered.length;

  // Log filtering details for debugging
  if (initialCount !== filtered.length) {
    console.log(`[Filter Calls] Initial: ${initialCount}, Final: ${filtered.length}, Removed: ${initialCount - filtered.length} (Assistant: ${assistantFiltered}, WebCall: ${webCallFiltered}, Pattern: ${patternFiltered})`);
  }

  return filtered;
}
