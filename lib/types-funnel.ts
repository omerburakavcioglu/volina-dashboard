// ===========================================
// Funnel Feature — Type Definitions
// Matches Supabase schema (snake_case)
// ===========================================

// --- Enums ---

export type FunnelStageType =
  | 'entry'
  | 'action_call'
  | 'action_whatsapp'
  | 'action_live_transfer'
  | 'decision'
  | 'waiting'
  | 'treatment'
  | 'terminal_archive'
  | 'terminal_loyal'
  | 'alert';

export type FunnelBranch = 'hard' | 'soft' | 'no_answer' | 'post_treatment' | 'main' | null;

export type SimpleStage = 'new' | 'contacting' | 'nurturing' | 'ready' | 'in_treatment' | 'loyal' | 'archived';

export type FunnelConditionType =
  | 'call_result_hard'
  | 'call_result_soft'
  | 'call_result_no_answer'
  | 'response_positive'
  | 'response_negative'
  | 'response_uncertain'
  | 'satisfaction_happy'
  | 'satisfaction_problem'
  | 're_engagement_positive'
  | 're_engagement_rejected'
  | 'time_elapsed'
  | 'manual'
  | 'auto';

export type FunnelLeadStatus = 'active' | 'paused' | 'completed' | 'archived';

export type FunnelEventType =
  | 'stage_entered'
  | 'call_made'
  | 'call_result'
  | 'whatsapp_sent'
  | 'whatsapp_response'
  | 'live_transfer'
  | 'alert'
  | 'manual_move'
  | 'archived';

export type FunnelScheduleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type FunnelActionType = 'ai_call' | 'whatsapp_message' | 'live_transfer_alert' | 'satisfaction_call' | 'check_in_call';

// --- DB Row Types ---

export interface FunnelStage {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  simple_stage: SimpleStage;
  stage_type: FunnelStageType;
  branch: string | null;
  day_offset: number | null;
  color: string;
  icon: string | null;
  position_order: number;
  is_automated: boolean;
  description: string | null;
  created_at: string;
}

export interface FunnelTransition {
  id: string;
  user_id: string;
  from_stage_id: string;
  to_stage_id: string;
  condition_type: FunnelConditionType;
  condition_value: Record<string, unknown> | null;
  label: string | null;
  created_at: string;
}

export interface FunnelLead {
  id: string;
  user_id: string;
  lead_id: string;
  current_stage_id: string;
  status: FunnelLeadStatus;
  branch: string | null;
  entered_funnel_at: string;
  entered_current_stage_at: string;
  treatment_date: string | null;
  metadata: Record<string, unknown>;
  next_action_at: string | null;
  next_action_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface FunnelEvent {
  id: string;
  user_id: string;
  funnel_lead_id: string;
  event_type: FunnelEventType;
  from_stage_id: string | null;
  to_stage_id: string | null;
  payload: Record<string, unknown>;
  actor: string;
  created_at: string;
}

export interface FunnelSchedule {
  id: string;
  user_id: string;
  funnel_lead_id: string;
  stage_id: string;
  action_type: FunnelActionType;
  scheduled_at: string;
  lead_timezone: string;
  status: FunnelScheduleStatus;
  retry_count: number;
  max_retries: number;
  payload: Record<string, unknown>;
  created_at: string;
  executed_at: string | null;
}

export interface FunnelMessageTemplate {
  id: string;
  user_id: string;
  stage_name: string;
  channel: 'whatsapp' | 'call_script';
  language: string;
  content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FunnelConfig {
  id: string;
  user_id: string;
  is_running: boolean;
  daily_call_limit: number;
  calling_hours_start: string;
  calling_hours_end: string;
  hard_waiting_days: number;
  paused_at: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Frontend View Types ---

export interface SimpleStageSummary {
  stage: SimpleStage;
  label: string;
  count: number;
  percentage: number;
  trend: number;
  color: string;
}

export interface FunnelActivityItem {
  id: string;
  event_type: FunnelEventType;
  lead_name: string;
  lead_id: string;
  funnel_lead_id: string;
  stage_name: string | null;
  description: string;
  created_at: string;
}

export interface FunnelMetrics {
  active_leads: number;
  calls_today: number;
  responses_7d: number;
  conversions: number;
}

export interface FunnelStatsResponse {
  buckets: SimpleStageSummary[];
  metrics: FunnelMetrics;
  archived_count: number;
  unreachable_count: number;
}

export interface FunnelLeadWithInfo extends FunnelLead {
  lead_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage_name: string;
  stage_color: string;
  simple_stage: SimpleStage;
}

export interface FunnelStageWithCount extends FunnelStage {
  lead_count: number;
}

export interface FunnelDailyData {
  date: string;
  entered: number;
  calls: number;
  responses: number;
  conversions: number;
}
