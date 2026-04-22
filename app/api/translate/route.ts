import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Deterministic hash shared with `useCallContentTranslation` client hook so a
 * previously saved DB translation can be matched against the current source
 * text. Keep the algorithm identical on both sides.
 */
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

interface PersistedTranslationBlock {
  hash: string;
  savedAt: string;
  summary?: string;
  transcript?: string;
  evaluation_summary?: string;
}

async function persistTranslation(
  callId: string,
  targetLang: TranslateTargetLang,
  sourceHash: string,
  translations: Record<string, string>
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("calls")
      .select("metadata")
      .eq("id", callId)
      .single();
    if (error || !data) return;

    const currentMetadata =
      (data.metadata as Record<string, unknown> | null) || {};
    const existingTranslations =
      (currentMetadata.translations as Record<string, PersistedTranslationBlock> | undefined) ||
      {};

    const block: PersistedTranslationBlock = {
      hash: sourceHash,
      savedAt: new Date().toISOString(),
    };
    if (typeof translations.summary === "string") block.summary = translations.summary;
    if (typeof translations.transcript === "string") block.transcript = translations.transcript;
    if (typeof translations.evaluation_summary === "string") {
      block.evaluation_summary = translations.evaluation_summary;
    }

    await supabase
      .from("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        metadata: {
          ...currentMetadata,
          translations: {
            ...existingTranslations,
            [targetLang]: block,
          },
        },
      } as any)
      .eq("id", callId);
  } catch (e) {
    console.warn("[translate] Failed to persist translation:", e);
  }
}

/** Max characters accepted per text segment (after trimming). */
const MAX_TEXT_LEN = 14_000;

/** Max total characters across all segments in one request. */
const MAX_TOTAL_CHARS = 40_000;

/** Max number of text segments per request. */
const MAX_SEGMENTS = 6;

export type TranslateTargetLang = "tr" | "en";

export interface TranslatePart {
  id: string;
  text: string;
}

function chunkText(text: string, maxChunk: number): string[] {
  if (text.length <= maxChunk) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChunk, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"));
      if (lastBreak > maxChunk * 0.5) {
        end = start + lastBreak + 1;
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

async function translateBatch(
  apiKey: string,
  parts: { id: string; text: string }[],
  targetLang: TranslateTargetLang
): Promise<Record<string, string>> {
  const targetLabel = targetLang === "tr" ? "Turkish" : "English";

  const payload = parts.map((p) => ({ id: p.id, text: p.text }));

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator for a call-center dashboard. Translate each item's "text" field to ${targetLabel}.

Rules:
- Output ONLY valid JSON, no markdown fences.
- Output shape: {"results":[{"id":"string","text":"translated text"}]}
- The "results" array MUST have the same length and same "id" order as the input.
- Preserve line structure, speaker labels (AI:, User:, Agent:, Caller:), phone numbers, times, and proper names.
- For empty input text, return empty string for that id.`,
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      temperature: 0.2,
      max_tokens: Math.min(16_000, 2000 + parts.reduce((a, p) => a + p.text.length, 0)),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[translate] OpenAI error:", response.status, errText);
    throw new Error(`Translation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  let raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Empty translation response");
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(raw);
  if (fence) raw = fence[1]!.trim();

  let parsed: { results?: { id: string; text: string }[] };
  try {
    parsed = JSON.parse(raw) as { results?: { id: string; text: string }[] };
  } catch {
    throw new Error("Invalid translation JSON");
  }

  const results = parsed.results;
  if (!Array.isArray(results) || results.length !== parts.length) {
    throw new Error("Translation result count mismatch");
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const id = parts[i]!.id;
    const r = results[i];
    if (!r || r.id !== id) {
      throw new Error("Translation id mismatch");
    }
    out[id] = typeof r.text === "string" ? r.text : "";
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key not configured" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      targetLang?: TranslateTargetLang;
      parts?: TranslatePart[];
      callId?: string;
      sourceHash?: string;
    };

    const targetLang = body.targetLang;
    const callId = typeof body.callId === "string" && body.callId ? body.callId : null;
    const providedHash =
      typeof body.sourceHash === "string" && body.sourceHash ? body.sourceHash : null;
    if (targetLang !== "tr" && targetLang !== "en") {
      return NextResponse.json(
        { success: false, error: "targetLang must be 'tr' or 'en'" },
        { status: 400 }
      );
    }

    const rawParts = Array.isArray(body.parts) ? body.parts : [];
    if (rawParts.length === 0) {
      return NextResponse.json({ success: true, translations: {} });
    }

    if (rawParts.length > MAX_SEGMENTS) {
      return NextResponse.json(
        { success: false, error: `At most ${MAX_SEGMENTS} parts per request` },
        { status: 400 }
      );
    }

    const normalized: { id: string; text: string }[] = [];
    let total = 0;
    for (const p of rawParts) {
      const id = typeof p.id === "string" ? p.id : "";
      if (!id || !["summary", "transcript", "evaluation_summary"].includes(id)) {
        return NextResponse.json(
          { success: false, error: "Invalid part id" },
          { status: 400 }
        );
      }
      const text = typeof p.text === "string" ? p.text : "";
      const trimmed = text.trim();
      if (!trimmed) {
        normalized.push({ id, text: "" });
        continue;
      }
      if (trimmed.length > MAX_TEXT_LEN) {
        return NextResponse.json(
          { success: false, error: `Text for ${id} exceeds maximum length` },
          { status: 400 }
        );
      }
      total += trimmed.length;
      normalized.push({ id, text: trimmed });
    }

    if (total > MAX_TOTAL_CHARS) {
      return NextResponse.json(
        { success: false, error: "Total text length exceeds limit" },
        { status: 400 }
      );
    }

    const toTranslate = normalized.filter((p) => p.text.length > 0);
    const emptyIds = new Set(normalized.filter((p) => p.text.length === 0).map((p) => p.id));

    const emptyTranslations: Record<string, string> = {};
    for (const id of emptyIds) {
      emptyTranslations[id] = "";
    }

    if (toTranslate.length === 0) {
      return NextResponse.json({ success: true, translations: emptyTranslations });
    }

    // Chunk only very long single fields: split and merge
    const expanded: { id: string; text: string }[] = [];
    for (const p of toTranslate) {
      if (p.text.length <= 6000) {
        expanded.push(p);
        continue;
      }
      const chunks = chunkText(p.text, 6000);
      chunks.forEach((chunk, i) => {
        expanded.push({ id: `${p.id}__c${i}`, text: chunk });
      });
    }

    const batchOut = await translateBatch(apiKey, expanded, targetLang);

    const merged: Record<string, string> = { ...emptyTranslations };
    const chunkGroups = new Map<string, string[]>();

    for (const p of expanded) {
      const m = /^(.+)__c(\d+)$/.exec(p.id);
      if (m) {
        const base = m[1]!;
        const idx = Number(m[2]);
        const arr = chunkGroups.get(base) ?? [];
        arr[idx] = batchOut[p.id] ?? "";
        chunkGroups.set(base, arr);
      } else {
        merged[p.id] = batchOut[p.id] ?? "";
      }
    }

    for (const [base, arr] of chunkGroups) {
      merged[base] = Array.from({ length: arr.length }, (_, i) => arr[i] ?? "").join("");
    }

    // Persist to DB so subsequent opens of the same call on any client are
    // instant. We do NOT await this so translation response doesn't block on
    // the DB write.
    if (callId) {
      const hash =
        providedHash ??
        simpleHash(
          `${normalized.find((p) => p.id === "summary")?.text ?? ""}\0${
            normalized.find((p) => p.id === "transcript")?.text ?? ""
          }\0${normalized.find((p) => p.id === "evaluation_summary")?.text ?? ""}`
        );
      void persistTranslation(callId, targetLang, hash, merged);
    }

    return NextResponse.json({ success: true, translations: merged });
  } catch (e) {
    console.error("[translate]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Translation failed" },
      { status: 500 }
    );
  }
}
