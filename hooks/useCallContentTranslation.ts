"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "@/lib/i18n";

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const memoryCache = new Map<string, Record<string, string>>();

function makeCacheKey(
  callId: string,
  summaryRaw: string,
  transcriptRaw: string,
  evaluationSummaryRaw: string
): string {
  return `${callId}:tr:${simpleHash(`${summaryRaw}\0${transcriptRaw}\0${evaluationSummaryRaw}`)}`;
}

export interface PersistedTranslationBlock {
  hash?: string;
  summary?: string;
  transcript?: string;
  evaluation_summary?: string;
}

export interface UseCallContentTranslationArgs {
  callId: string;
  /** e.g. row expanded — avoids translating every row in the list */
  enabled: boolean;
  language: Language;
  summaryRaw: string | null;
  transcriptRaw: string | null;
  evaluationSummaryRaw: string | null;
  /**
   * Translations previously persisted to `calls.metadata.translations[lang]`.
   * When the `hash` matches the current source fingerprint, we use them
   * immediately and skip the OpenAI round-trip — makes repeat opens instant.
   */
  persistedTranslations?: PersistedTranslationBlock | null;
}

export interface CallContentTranslationState {
  loading: boolean;
  error: string | null;
  /** Present when language is `tr` and fetch succeeded; keys: summary, transcript, evaluation_summary */
  translations: Record<string, string> | null;
}

/**
 * Fetches Turkish translations for call summary / transcript / evaluation summary when UI language is Turkish.
 * Caches by call id + content fingerprint (memory + sessionStorage).
 */
export function useCallContentTranslation({
  callId,
  enabled,
  language,
  summaryRaw,
  transcriptRaw,
  evaluationSummaryRaw,
  persistedTranslations,
}: UseCallContentTranslationArgs): CallContentTranslationState {
  const [translations, setTranslations] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const contentKey = useMemo(
    () =>
      simpleHash(`${summaryRaw ?? ""}\0${transcriptRaw ?? ""}\0${evaluationSummaryRaw ?? ""}`),
    [summaryRaw, transcriptRaw, evaluationSummaryRaw]
  );

  useEffect(() => {
    if (language !== "tr") {
      setTranslations(null);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    // Turkish UI but row/dialog not active: keep last translations (e.g. after collapse) so
    // cached text can still be used; do not fetch until enabled.
    if (!enabled) {
      setLoading(false);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const key = makeCacheKey(
      callId,
      summaryRaw ?? "",
      transcriptRaw ?? "",
      evaluationSummaryRaw ?? ""
    );

    const cachedMem = memoryCache.get(key);
    if (cachedMem) {
      setTranslations(cachedMem);
      setLoading(false);
      setError(null);
      return;
    }

    if (typeof sessionStorage !== "undefined") {
      try {
        const raw = sessionStorage.getItem(`volina-ct:${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, string>;
          memoryCache.set(key, parsed);
          setTranslations(parsed);
          setLoading(false);
          setError(null);
          return;
        }
      } catch {
        /* ignore */
      }
    }

    // DB-persisted translation: hydrate instantly if the fingerprint matches
    // the current source text. This is the fast-path for repeat opens (any
    // user, any device) after the very first translation of a call.
    if (persistedTranslations && persistedTranslations.hash === contentKey) {
      const fromDb: Record<string, string> = {};
      if (typeof persistedTranslations.summary === "string") {
        fromDb.summary = persistedTranslations.summary;
      }
      if (typeof persistedTranslations.transcript === "string") {
        fromDb.transcript = persistedTranslations.transcript;
      }
      if (typeof persistedTranslations.evaluation_summary === "string") {
        fromDb.evaluation_summary = persistedTranslations.evaluation_summary;
      }
      memoryCache.set(key, fromDb);
      try {
        sessionStorage.setItem(`volina-ct:${key}`, JSON.stringify(fromDb));
      } catch {
        /* storage full */
      }
      setTranslations(fromDb);
      setLoading(false);
      setError(null);
      return;
    }

    const parts: { id: string; text: string }[] = [];
    if (summaryRaw?.trim()) parts.push({ id: "summary", text: summaryRaw });
    if (transcriptRaw?.trim()) parts.push({ id: "transcript", text: transcriptRaw });
    if (evaluationSummaryRaw?.trim()) parts.push({ id: "evaluation_summary", text: evaluationSummaryRaw });

    if (parts.length === 0) {
      setTranslations({});
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    setTranslations(null);

    (async () => {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetLang: "tr",
            parts,
            callId,
            sourceHash: contentKey,
          }),
          signal: ac.signal,
        });
        const data = (await res.json()) as {
          success?: boolean;
          translations?: Record<string, string>;
          error?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Translation failed");
        }
        const tr = data.translations ?? {};
        memoryCache.set(key, tr);
        try {
          sessionStorage.setItem(`volina-ct:${key}`, JSON.stringify(tr));
        } catch {
          /* storage full */
        }
        if (!ac.signal.aborted) {
          setTranslations(tr);
          setLoading(false);
          setError(null);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Translation failed");
        setLoading(false);
        setTranslations(null);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [
    enabled,
    language,
    callId,
    contentKey,
    summaryRaw,
    transcriptRaw,
    evaluationSummaryRaw,
    persistedTranslations,
  ]);

  return { loading, error, translations };
}
