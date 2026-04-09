-- =============================================================================
-- Backfill: funnel aramaları → calls tablosu + leads.status / last_contact_date
-- =============================================================================
-- Koşul: Sadece gerçekten konuşma olduğu anlamına gelen webhook kayıtları
--        (event_type = call_result ve result = call_result_soft | call_result_hard).
--        Sadece çaldı / cevapsız (call_result_no_answer) bu scripte dahil DEĞİL.
--
-- Kullanım (Supabase → SQL):
--   1. Aşağıdaki UUID'yi Find-Replace ile kendi tenant user_id (profiles.id) yap.
--   2. PREVIEW sorgusunu çalıştır.
--   3. INSERT INTO calls ... çalıştır. Hata: "column tags" veya "assistant_id" yoksa
--      ilgili satırları INSERT listesinden ve SELECT'ten silip tekrar dene.
--   4. UPDATE leads ... çalıştır.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW: Kaç kayıt oluşacak? (INSERT’ten önce mutlaka çalıştır)
-- -----------------------------------------------------------------------------
-- Supabase’de: '4b5a9052-0056-4b70-80d6-e8509864d833' yerine kendi user_id’n

SELECT
  fe.id AS funnel_event_id,
  fe.created_at,
  fe.payload->>'call_id' AS vapi_call_id,
  fe.payload->>'result' AS call_result,
  fl.lead_id,
  l.full_name,
  l.phone,
  l.status AS lead_status_now
FROM funnel_events fe
JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
JOIN leads l ON l.id = fl.lead_id AND l.user_id = fe.user_id
WHERE fe.user_id = '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid
  AND fe.event_type = 'call_result'
  AND fe.payload->>'result' IN ('call_result_soft', 'call_result_hard')
  AND fe.payload->>'call_id' IS NOT NULL
  AND TRIM(fe.payload->>'call_id') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM calls c WHERE c.vapi_call_id = fe.payload->>'call_id'
  )
ORDER BY fe.created_at DESC;

-- -----------------------------------------------------------------------------
-- 1) calls tablosuna ekle (zaten var olan vapi_call_id atlanır)
-- -----------------------------------------------------------------------------
-- Not: assistant_id veya evaluation_score kolonları yoksa hata alırsan,
--      o iki satırı INSERT listesinden ve SELECT’ten çıkarıp tekrar dene.

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
FROM funnel_events fe
JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
JOIN leads l ON l.id = fl.lead_id AND l.user_id = fe.user_id
WHERE fe.user_id = '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid
  AND fe.event_type = 'call_result'
  AND fe.payload->>'result' IN ('call_result_soft', 'call_result_hard')
  AND fe.payload->>'call_id' IS NOT NULL
  AND TRIM(fe.payload->>'call_id') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM calls c WHERE c.vapi_call_id = fe.payload->>'call_id'
  )
ORDER BY fe.payload->>'call_id', fe.created_at DESC;

-- -----------------------------------------------------------------------------
-- 2) leads: hâlâ "new" ise contacted + last_contact_date
-- -----------------------------------------------------------------------------
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
  FROM funnel_events fe
  JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
  WHERE fe.user_id = '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid
    AND fe.event_type = 'call_result'
    AND fe.payload->>'result' IN ('call_result_soft', 'call_result_hard')
  GROUP BY fl.lead_id
) sub
WHERE l.id = sub.lead_id
  AND l.user_id = '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid
  AND l.status = 'new';

-- -----------------------------------------------------------------------------
-- İsteğe bağlı: Sadece "aranmış ama webhook’ta call_result yok" kayıtlar
-- (call_made) — cevap garantisi YOK, yalnızca çağrı başlatıldı demektir.
-- Açan / açmayan ayrımı yapamazsanız bu bloğu KULLANMAYIN.
-- -----------------------------------------------------------------------------

/*
INSERT INTO calls (
  user_id,
  vapi_call_id,
  transcript,
  summary,
  sentiment,
  duration,
  type,
  caller_phone,
  caller_name,
  tags,
  metadata,
  created_at,
  updated_at
)
SELECT DISTINCT ON ((fe.payload->>'vapi_call_id'))
  fe.user_id,
  fe.payload->>'vapi_call_id',
  NULL,
  'Funnel outbound (sadece arama başlatıldı — backfill, call_made)',
  'neutral',
  NULL,
  'outbound',
  l.phone,
  COALESCE(fe.payload->>'lead_name', l.full_name),
  '{}'::text[],
  jsonb_build_object(
    'source', 'funnel_backfill_call_made_only',
    'funnel_event_id', fe.id::text,
    'lead_id', l.id::text,
    'assistantId', (SELECT p.vapi_assistant_id FROM profiles p WHERE p.id = fe.user_id)
  ),
  fe.created_at,
  fe.created_at
FROM funnel_events fe
JOIN funnel_leads fl ON fl.id = fe.funnel_lead_id
JOIN leads l ON l.id = fl.lead_id AND l.user_id = fe.user_id
WHERE fe.user_id = '4b5a9052-0056-4b70-80d6-e8509864d833'::uuid
  AND fe.event_type = 'call_made'
  AND fe.payload->>'vapi_call_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM calls c WHERE c.vapi_call_id = fe.payload->>'vapi_call_id'
  )
ORDER BY fe.payload->>'vapi_call_id', fe.created_at DESC;
*/
