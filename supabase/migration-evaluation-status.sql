-- ===========================================
-- VOLINA AI — calls.evaluation_status migration
-- Adds a status column so the evaluate-pending cron can
-- pick up rows inserted without OpenAI evaluation.
-- Run this in the Supabase SQL Editor.
-- ===========================================

-- 1. Column + default
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS evaluation_status TEXT NOT NULL DEFAULT 'pending';

-- Allowed values: pending | processing | evaluated | failed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_evaluation_status_check'
  ) THEN
    ALTER TABLE calls
      ADD CONSTRAINT calls_evaluation_status_check
      CHECK (evaluation_status IN ('pending', 'processing', 'evaluated', 'failed'));
  END IF;
END $$;

-- 2. Index for the cron lookup (pending + oldest first).
CREATE INDEX IF NOT EXISTS idx_calls_evaluation_status_pending
  ON calls (evaluation_status, created_at)
  WHERE evaluation_status IN ('pending', 'processing');

-- 3. Backfill existing rows so the cron does not re-process everything.
--    Rows that already have our structured evaluation -> evaluated.
--    Everything else -> pending (the cron will pick them up).
UPDATE calls
SET evaluation_status = CASE
  WHEN (metadata -> 'structuredData') IS NOT NULL THEN 'evaluated'
  ELSE 'pending'
END
WHERE evaluation_status = 'pending';
