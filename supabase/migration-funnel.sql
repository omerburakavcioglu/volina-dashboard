-- ===========================================
-- VOLINA AI — Funnel Feature Migration
-- Run this in the Supabase SQL Editor
-- ===========================================

-- 1. funnel_stages
CREATE TABLE IF NOT EXISTS funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  simple_stage TEXT NOT NULL,
  stage_type TEXT NOT NULL,
  branch TEXT,
  day_offset INTEGER,
  color TEXT NOT NULL,
  icon TEXT,
  position_order INTEGER NOT NULL,
  is_automated BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_stages_user ON funnel_stages(user_id);
CREATE UNIQUE INDEX idx_funnel_stages_user_name ON funnel_stages(user_id, name);

-- 2. funnel_transitions
CREATE TABLE IF NOT EXISTS funnel_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  to_stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL,
  condition_value JSONB,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_transitions_user ON funnel_transitions(user_id);
CREATE INDEX idx_funnel_transitions_from ON funnel_transitions(from_stage_id);

-- 3. funnel_leads
CREATE TABLE IF NOT EXISTS funnel_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  current_stage_id UUID NOT NULL REFERENCES funnel_stages(id),
  status TEXT NOT NULL DEFAULT 'active',
  branch TEXT,
  entered_funnel_at TIMESTAMPTZ DEFAULT now(),
  entered_current_stage_at TIMESTAMPTZ DEFAULT now(),
  treatment_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  next_action_at TIMESTAMPTZ,
  next_action_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_leads_user ON funnel_leads(user_id);
CREATE INDEX idx_funnel_leads_status ON funnel_leads(user_id, status);
CREATE INDEX idx_funnel_leads_stage ON funnel_leads(current_stage_id);
CREATE INDEX idx_funnel_leads_lead ON funnel_leads(lead_id);

-- 4. funnel_events
CREATE TABLE IF NOT EXISTS funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  funnel_lead_id UUID NOT NULL REFERENCES funnel_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_stage_id UUID REFERENCES funnel_stages(id),
  to_stage_id UUID REFERENCES funnel_stages(id),
  payload JSONB DEFAULT '{}',
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_events_user ON funnel_events(user_id);
CREATE INDEX idx_funnel_events_lead ON funnel_events(funnel_lead_id);
CREATE INDEX idx_funnel_events_created ON funnel_events(user_id, created_at DESC);

-- 5. funnel_schedules
CREATE TABLE IF NOT EXISTS funnel_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  funnel_lead_id UUID NOT NULL REFERENCES funnel_leads(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES funnel_stages(id),
  action_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  lead_timezone TEXT DEFAULT 'Europe/London',
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX idx_funnel_schedules_pending ON funnel_schedules(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_funnel_schedules_user ON funnel_schedules(user_id);
CREATE INDEX idx_funnel_schedules_lead ON funnel_schedules(funnel_lead_id);

-- 6. funnel_message_templates
CREATE TABLE IF NOT EXISTS funnel_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  channel TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_funnel_templates_user ON funnel_message_templates(user_id);

-- 7. funnel_config
CREATE TABLE IF NOT EXISTS funnel_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  is_running BOOLEAN DEFAULT false,
  daily_call_limit INTEGER DEFAULT 50,
  calling_hours_start TIME DEFAULT '09:00',
  calling_hours_end TIME DEFAULT '20:00',
  hard_waiting_days INTEGER DEFAULT 10,
  paused_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================
-- Row Level Security
-- ===========================================

ALTER TABLE funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funnel_stages" ON funnel_stages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own funnel_stages" ON funnel_stages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own funnel_stages" ON funnel_stages FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own funnel_transitions" ON funnel_transitions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own funnel_transitions" ON funnel_transitions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own funnel_leads" ON funnel_leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own funnel_leads" ON funnel_leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own funnel_leads" ON funnel_leads FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own funnel_events" ON funnel_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own funnel_events" ON funnel_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own funnel_schedules" ON funnel_schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own funnel_schedules" ON funnel_schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own funnel_schedules" ON funnel_schedules FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own funnel_templates" ON funnel_message_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own funnel_templates" ON funnel_message_templates FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own funnel_config" ON funnel_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own funnel_config" ON funnel_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own funnel_config" ON funnel_config FOR UPDATE USING (auth.uid() = user_id);

-- ===========================================
-- Enable Realtime on key tables
-- ===========================================

ALTER PUBLICATION supabase_realtime ADD TABLE funnel_events;
ALTER PUBLICATION supabase_realtime ADD TABLE funnel_leads;

-- ===========================================
-- Seed Function: call with your user_id
-- Usage: SELECT seed_funnel_stages('your-user-uuid-here');
-- ===========================================

CREATE OR REPLACE FUNCTION seed_funnel_stages(p_user_id UUID)
RETURNS void AS $$
DECLARE
  s_new UUID; s_day0 UUID; s_hard_wait UUID; s_hard_re UUID; s_hard_reacq UUID;
  s_soft UUID; s_na_wp UUID; s_na_d1 UUID; s_na_d2 UUID; s_na_d15 UUID;
  s_live UUID; s_archive UUID; s_d60 UUID; s_treat UUID; s_pt7 UUID;
  s_review UUID; s_urgent UUID; s_pt30 UUID; s_recovery UUID; s_loyal UUID;
BEGIN
  -- Delete existing seed data for this user (idempotent)
  DELETE FROM funnel_message_templates WHERE user_id = p_user_id;
  DELETE FROM funnel_transitions WHERE user_id = p_user_id;
  DELETE FROM funnel_stages WHERE user_id = p_user_id;
  DELETE FROM funnel_config WHERE user_id = p_user_id;

  -- Insert 20 stages
  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'NEW', 'New Lead', 'new', 'entry', 'main', NULL, '#EC4899', 'UserPlus', 1, true, 'Lead just entered the funnel, waiting to be contacted.')
  RETURNING id INTO s_new;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'DAY0_AI_CALL', 'AI Call (Day 0)', 'contacting', 'action_call', 'main', 0, '#F59E0B', 'PhoneCall', 2, true, 'AI makes the first call to the lead.')
  RETURNING id INTO s_day0;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'HARD_WAITING', 'Hard Reject — Cooling', 'nurturing', 'waiting', 'hard', NULL, '#6B7280', 'Clock', 3, true, 'Lead rejected hard. Cooling off before re-engagement attempt.')
  RETURNING id INTO s_hard_wait;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'HARD_RE_ENGAGEMENT', 'Re-engagement Message', 'nurturing', 'action_whatsapp', 'hard', NULL, '#EF4444', 'MessageCircle', 4, true, 'Sending a success story to re-engage the lead.')
  RETURNING id INTO s_hard_re;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'HARD_REACQUISITION_CALL', 'Reacquisition Call', 'nurturing', 'action_call', 'hard', NULL, '#EF4444', 'PhoneForwarded', 5, true, 'AI calls again with a win-back script.')
  RETURNING id INTO s_hard_reacq;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'SOFT_FOLLOWUP', 'Soft Follow-Up', 'nurturing', 'action_whatsapp', 'soft', 7, '#F59E0B', 'Heart', 6, true, 'Gentle follow-up with clinic info and social proof.')
  RETURNING id INTO s_soft;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'NO_ANSWER_WHATSAPP_INTRO', 'WhatsApp Intro', 'contacting', 'action_whatsapp', 'no_answer', 0, '#8B5CF6', 'Send', 7, true, 'Lead did not answer the call. Sending intro message via WhatsApp.')
  RETURNING id INTO s_na_wp;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'NO_ANSWER_DAY1', 'Day 1 — Control', 'contacting', 'action_whatsapp', 'no_answer', 1, '#8B5CF6', 'Send', 8, true, 'Day 1 follow-up: offering options for information.')
  RETURNING id INTO s_na_d1;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'NO_ANSWER_DAY2', 'Day 2 — Social Proof', 'contacting', 'action_whatsapp', 'no_answer', 2, '#8B5CF6', 'Send', 9, true, 'Day 2: sharing patient review for social proof.')
  RETURNING id INTO s_na_d2;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'NO_ANSWER_DAY15', 'Day 15 — Before & After', 'contacting', 'action_whatsapp', 'no_answer', 15, '#8B5CF6', 'Send', 10, true, 'Day 15: sharing before/after case study.')
  RETURNING id INTO s_na_d15;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'LIVE_TRANSFER', 'Live Transfer', 'ready', 'action_live_transfer', 'main', NULL, '#F97316', 'PhoneForwarded', 11, true, 'Lead is ready — transferring to your sales team.')
  RETURNING id INTO s_live;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'ARCHIVE_GDPR', 'Archived', 'archived', 'terminal_archive', NULL, NULL, '#374151', 'Archive', 12, false, 'Lead archived after final rejection or GDPR request.')
  RETURNING id INTO s_archive;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'DAY60_STILL_HERE', 'Day 60 — Still Here', 'nurturing', 'action_whatsapp', 'soft', 60, '#6B7280', 'Clock', 13, true, 'Gentle reminder: we are still here whenever you are ready.')
  RETURNING id INTO s_d60;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'TREATMENT', 'In Treatment', 'in_treatment', 'treatment', 'post_treatment', NULL, '#3B82F6', 'Stethoscope', 14, false, 'Patient is currently receiving treatment.')
  RETURNING id INTO s_treat;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'POST_TREATMENT_DAY7', 'Post-Treatment Day 7', 'in_treatment', 'action_call', 'post_treatment', 7, '#3B82F6', 'PhoneCall', 15, true, 'Satisfaction call 7 days after treatment.')
  RETURNING id INTO s_pt7;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'REVIEW_AND_REFERRAL', 'Review & Referral', 'in_treatment', 'action_whatsapp', 'post_treatment', NULL, '#10B981', 'Star', 16, true, 'Asking for a review and referral.')
  RETURNING id INTO s_review;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'URGENT_ALERT', 'Urgent Alert', 'in_treatment', 'alert', 'post_treatment', NULL, '#EF4444', 'AlertTriangle', 17, false, 'Patient reported a problem — immediate attention needed.')
  RETURNING id INTO s_urgent;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'POST_TREATMENT_DAY30', 'Post-Treatment Day 30', 'in_treatment', 'action_call', 'post_treatment', 30, '#3B82F6', 'PhoneCall', 18, true, '30-day check-in call.')
  RETURNING id INTO s_pt30;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'RECOVERY_MANAGEMENT', 'Recovery', 'in_treatment', 'waiting', 'post_treatment', NULL, '#06B6D4', 'HeartPulse', 19, true, 'Recovery period before transition to loyal patient.')
  RETURNING id INTO s_recovery;

  INSERT INTO funnel_stages (id, user_id, name, display_name, simple_stage, stage_type, branch, day_offset, color, icon, position_order, is_automated, description)
  VALUES
    (gen_random_uuid(), p_user_id, 'LOYAL', 'Loyal Patient', 'loyal', 'terminal_loyal', NULL, NULL, '#10B981', 'Award', 20, false, 'Happy patient — your success story.')
  RETURNING id INTO s_loyal;

  -- Insert 21 transitions
  INSERT INTO funnel_transitions (user_id, from_stage_id, to_stage_id, condition_type, condition_value, label) VALUES
    (p_user_id, s_new,       s_day0,      'auto', NULL, 'Auto → AI Call'),
    (p_user_id, s_day0,      s_hard_wait, 'call_result_hard', NULL, 'Hard Reject'),
    (p_user_id, s_day0,      s_soft,      'call_result_soft', NULL, 'Soft / Interested'),
    (p_user_id, s_day0,      s_na_wp,     'call_result_no_answer', NULL, 'No Answer'),
    (p_user_id, s_hard_wait, s_hard_re,   'time_elapsed', '{"days": 10}', 'Cooling period ended'),
    (p_user_id, s_hard_re,   s_hard_reacq,'auto', NULL, 'Auto → Reacquisition Call'),
    (p_user_id, s_hard_reacq,s_live,      're_engagement_positive', NULL, 'Positive → Transfer'),
    (p_user_id, s_hard_reacq,s_archive,   're_engagement_rejected', NULL, 'Rejected → Archive'),
    (p_user_id, s_soft,      s_live,      'response_positive', NULL, 'Positive Response → Transfer'),
    (p_user_id, s_soft,      s_d60,       'response_uncertain', NULL, 'Uncertain → Day 60'),
    (p_user_id, s_na_wp,     s_na_d1,     'time_elapsed', '{"days": 1}', 'Day 1'),
    (p_user_id, s_na_d1,     s_na_d2,     'time_elapsed', '{"days": 1}', 'Day 2'),
    (p_user_id, s_na_d2,     s_na_d15,    'time_elapsed', '{"days": 13}', 'Day 15'),
    (p_user_id, s_na_d15,    s_soft,      'auto', NULL, 'Merge → Soft Follow-Up'),
    (p_user_id, s_live,      s_treat,     'auto', NULL, 'Transfer → Treatment'),
    (p_user_id, s_treat,     s_pt7,       'time_elapsed', '{"days": 7}', 'Post-Treatment Day 7'),
    (p_user_id, s_pt7,       s_review,    'satisfaction_happy', NULL, 'Happy → Review'),
    (p_user_id, s_pt7,       s_urgent,    'satisfaction_problem', NULL, 'Problem → Alert'),
    (p_user_id, s_review,    s_pt30,      'time_elapsed', '{"days": 23}', 'Day 30 Check-in'),
    (p_user_id, s_pt30,      s_recovery,  'auto', NULL, 'Auto → Recovery'),
    (p_user_id, s_recovery,  s_loyal,     'time_elapsed', '{"days": 30}', 'Recovery → Loyal');

  -- Insert message templates
  INSERT INTO funnel_message_templates (user_id, stage_name, channel, language, content, variables) VALUES
    (p_user_id, 'NO_ANSWER_WHATSAPP_INTRO', 'whatsapp', 'en',
     E'Good day {{lead_name}},\nThis is your medical consultant from {{clinic_name}} in Istanbul Turkey. We received your dental treatment inquiry and I''ll be happy to assist you.\nWhere would you like us to start?\n• Patient reviews and before/after results\n• Brief information about our clinic and dentist\n• Your dental concern and expectations',
     ARRAY['lead_name','clinic_name']),

    (p_user_id, 'NO_ANSWER_DAY1', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nTo make things easier for you, where would you like us to begin?\n▫️ Information about our clinic\n▫️ Doctor''s experience\n▫️ Example cases\n▫️ Estimated treatment plan\nI''ll follow your preference.',
     ARRAY['lead_name']),

    (p_user_id, 'NO_ANSWER_DAY2', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nI wanted to share a recent patient review from the UK who completed treatment with us.\nMany of our patients initially had similar questions before deciding.\nLet me know if you''d like to see more examples.',
     ARRAY['lead_name']),

    (p_user_id, 'SOFT_FOLLOWUP', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nI''m sharing a short video of our clinic environment so you can see our facilities and hygiene standards.\nTransparency is very important to us.',
     ARRAY['lead_name']),

    (p_user_id, 'NO_ANSWER_DAY15', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nI''m sharing a similar case to yours so you can see realistic treatment outcomes.\nIf you''d like, I can explain the procedure step by step.',
     ARRAY['lead_name']),

    (p_user_id, 'HARD_RE_ENGAGEMENT', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nI wanted to share a short success story of one of our recent international patients.\nHe initially had similar concerns about travelling for treatment.\nPlease let me know if you have any new questions.',
     ARRAY['lead_name']),

    (p_user_id, 'DAY60_STILL_HERE', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nI just wanted to let you know that we''re here whenever you feel ready to continue.\nThere is absolutely no pressure — your timing is what matters most.\nFeel free to reach out anytime.',
     ARRAY['lead_name']),

    (p_user_id, 'REVIEW_AND_REFERRAL', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nWe hope your recovery is going well! Your feedback means a lot to us.\nWould you mind sharing a brief review of your experience?\nIf you know anyone who might benefit from our services, we''d love to help them too.',
     ARRAY['lead_name']),

    (p_user_id, 'POST_TREATMENT_DAY30', 'call_script', 'en',
     E'Call purpose: 30-day post-treatment check-in.\nAsk: How are you feeling? Any concerns about your treatment?\nGoal: Ensure satisfaction, offer ongoing support, transition to loyal patient relationship.',
     ARRAY['lead_name']),

    (p_user_id, 'SOFT_FOLLOWUP', 'whatsapp', 'en',
     E'Hello {{lead_name}},\nI completely understand that this kind of decision takes time.\nAt this stage, what is the most important factor for you?\n▫️ Budget\n▫️ Doctor experience\n▫️ Treatment timeline\n▫️ Clinic safety\nI''m here to support you in the way that suits you best.',
     ARRAY['lead_name']);

  -- Insert default config
  INSERT INTO funnel_config (user_id, is_running, daily_call_limit, calling_hours_start, calling_hours_end, hard_waiting_days)
  VALUES (p_user_id, false, 50, '09:00', '20:00', 10);

END;
$$ LANGUAGE plpgsql;

-- =============================================
-- WhatsApp credentials on profiles (for funnel)
-- =============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;
