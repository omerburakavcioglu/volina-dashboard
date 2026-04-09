-- =============================================================================
-- Backfill: funnel → calls + leads (Supabase SQL Editor uyumlu)
-- =============================================================================
-- ÖNEMLİ: Bu editör PostgreSQL'dir. psql komutları ÇALIŞMAZ.
--          "\set" satırı EKLEME — hata verir. Sadece aşağıdaki sorguları çalıştır.
--
-- Tenant UUID'yi tek yerde değiştir: her sorgudaki WITH tenant AS (...) içindeki UUID.
-- =============================================================================

-- =============================================================================
-- ADIM 1 — PREVIEW (önce bunu çalıştır)
-- =============================================================================

WITH tenant AS (
  SELECT '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid AS id
)
SELECT
  fe.id AS funnel_event_id,
  fe.created_at,
  fe.payload->>'call_id' AS vapi_call_id,
  fe.payload->>'result' AS call_result,
  fl.lead_id,
  l.full_name,
  l.phone,
  l.status AS lead_status_now
FROM tenant t
CROSS JOIN funnel_events fe
JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
JOIN leads l ON l.id = fl.lead_id AND l.user_id = fe.user_id
WHERE fe.user_id = t.id
  AND fe.event_type = 'call_result'
  AND fe.payload->>'result' IN ('call_result_soft', 'call_result_hard')
  AND fe.payload->>'call_id' IS NOT NULL
  AND TRIM(fe.payload->>'call_id') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM calls c WHERE c.vapi_call_id = fe.payload->>'call_id'
  )
ORDER BY fe.created_at DESC;

-- =============================================================================
-- ADIM 2 — calls INSERT (PREVIEW uygunsa; tek başına seçip çalıştır)
-- =============================================================================
-- Kolon hatası alırsan: assistant_id, evaluation_score veya tags satırlarını
-- INSERT listesi ve SELECT listesinden birlikte sil.

WITH tenant AS (
  SELECT '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid AS id
)
INSERT INTO calls (
  user_id,
  vapi_call_id,
  assistant_id,
  transcript,
  summary,
  sentiment,
  duration,
  type,
  caller_phone,
  caller_name,
  evaluation_score,
  tags,
  metadata,
  created_at,
  updated_at
)
SELECT DISTINCT ON (fe.payload->>'call_id')
  fe.user_id,
  fe.payload->>'call_id',
  (SELECT p.vapi_assistant_id FROM profiles p WHERE p.id = fe.user_id),
  NULL,
  'Funnel araması (geçmiş kayıt — backfill)',
  CASE
    WHEN fe.payload->>'result' = 'call_result_soft' THEN 'positive'
    ELSE 'neutral'
  END,
  NULLIF(NULLIF(fe.payload->>'duration', ''), '')::integer,
  'outbound',
  l.phone,
  l.full_name,
  CASE
    WHEN fe.payload->>'evaluation_score' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (fe.payload->>'evaluation_score')::numeric
    ELSE NULL
  END,
  '{}'::text[],
  jsonb_build_object(
    'source', 'funnel_backfill',
    'funnel_event_id', fe.id::text,
    'lead_id', l.id::text,
    'call_result', fe.payload->>'result',
    'assistantId', (SELECT p.vapi_assistant_id FROM profiles p WHERE p.id = fe.user_id)
  ),
  fe.created_at,
  fe.created_at
FROM tenant t
CROSS JOIN funnel_events fe
JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
JOIN leads l ON l.id = fl.lead_id AND l.user_id = fe.user_id
WHERE fe.user_id = t.id
  AND fe.event_type = 'call_result'
  AND fe.payload->>'result' IN ('call_result_soft', 'call_result_hard')
  AND fe.payload->>'call_id' IS NOT NULL
  AND TRIM(fe.payload->>'call_id') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM calls c WHERE c.vapi_call_id = fe.payload->>'call_id'
  )
ORDER BY fe.payload->>'call_id', fe.created_at DESC;

-- =============================================================================
-- ADIM 3 — leads UPDATE (new → contacted)
-- =============================================================================

WITH tenant AS (
  SELECT '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid AS id
)
UPDATE leads l
SET
  status = 'contacted',
  last_contact_date = GREATEST(
    COALESCE(l.last_contact_date::timestamptz, sub.last_evt),
    sub.last_evt
  )
FROM (
  SELECT
    fl.lead_id,
    MAX(fe.created_at) AS last_evt
  FROM tenant t
  CROSS JOIN funnel_events fe
  JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
  WHERE fe.user_id = t.id
    AND fe.event_type = 'call_result'
    AND fe.payload->>'result' IN ('call_result_soft', 'call_result_hard')
  GROUP BY fl.lead_id
) sub,
tenant t
WHERE l.id = sub.lead_id
  AND l.user_id = t.id
  AND l.status = 'new';
