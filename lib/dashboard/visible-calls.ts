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

  // Include calls that match assistant OR legacy calls without assistant
  if (userAssistantId && filtered.length > 0) {
    filtered = filtered.filter((call) => {
      const callAssistantId = (call as Record<string, unknown>).assistant_id as
        | string
        | undefined;
      const metadataAssistantId = call.metadata?.assistantId as string | undefined;
      const hasAssistantId = callAssistantId || metadataAssistantId;
      if (!hasAssistantId) return true;
      return callAssistantId === userAssistantId || metadataAssistantId === userAssistantId;
    });
  }

  // Exclude webCall (Vapi dashboard test calls)
  filtered = filtered.filter((call) => {
    const callType = call.metadata?.callType as string | undefined;
    return callType !== "webCall";
  });

  // Exclude wrong-assistant conversations by transcript/summary text
  filtered = filtered.filter((call) => {
    const transcript = String(call.transcript || "").toLowerCase();
    const summary = String(call.summary || "").toLowerCase();
    const textToCheck = `${transcript} ${summary}`;
    return !WRONG_ASSISTANT_PATTERNS.some((pattern) =>
      textToCheck.includes(pattern.toLowerCase())
    );
  });

  return filtered;
}
