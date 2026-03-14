/**
 * Mock funnel data for investor demo at /[tenant]/mockfunnel
 * Same UI as real funnel, no sidebar link — URL only.
 */

import type {
  SimpleStageSummary,
  FunnelMetrics,
  FunnelStatsResponse,
  FunnelActivityItem,
  FunnelStageWithCount,
  FunnelTransition,
  FunnelConfig,
  FunnelLeadWithInfo,
  SimpleStage,
} from "@/lib/types-funnel";

const BUCKET_COLORS: Record<string, string> = {
  new: "#EC4899",
  contacting: "#F59E0B",
  nurturing: "#8B5CF6",
  ready: "#F97316",
  in_treatment: "#3B82F6",
  loyal: "#10B981",
};

export const MOCK_BUCKETS: SimpleStageSummary[] = [
  { stage: "new", label: "New", count: 847, percentage: 43, trend: 2, color: BUCKET_COLORS.new! },
  { stage: "contacting", label: "Contacting", count: 412, percentage: 21, trend: -1, color: BUCKET_COLORS.contacting! },
  { stage: "nurturing", label: "Nurturing", count: 324, percentage: 17, trend: 0, color: BUCKET_COLORS.nurturing! },
  { stage: "ready", label: "Ready", count: 28, percentage: 1, trend: 1, color: BUCKET_COLORS.ready! },
  { stage: "in_treatment", label: "In Treatment", count: 156, percentage: 8, trend: 0, color: BUCKET_COLORS.in_treatment! },
  { stage: "loyal", label: "Loyal", count: 89, percentage: 5, trend: 1, color: BUCKET_COLORS.loyal! },
];

export const MOCK_METRICS: FunnelMetrics = {
  active_leads: 1856,
  calls_today: 47,
  responses_7d: 128,
  conversions: 273,
};

export const MOCK_STATS: FunnelStatsResponse = {
  buckets: MOCK_BUCKETS,
  metrics: MOCK_METRICS,
  archived_count: 312,
  unreachable_count: 89,
};

export const MOCK_ACTIVITY: FunnelActivityItem[] = [
  { id: "e1", event_type: "call_made", lead_name: "Ahmed K.", lead_id: "l1", funnel_lead_id: "fl1", stage_name: "AI Call", description: "AI called Ahmed K. — Result: Interested (Soft)", created_at: new Date(Date.now() - 2 * 60_000).toISOString() },
  { id: "e2", event_type: "whatsapp_sent", lead_name: "Maria S.", lead_id: "l2", funnel_lead_id: "fl2", stage_name: "Clinic video", description: "WhatsApp sent to Maria S. — Clinic video", created_at: new Date(Date.now() - 5 * 60_000).toISOString() },
  { id: "e3", event_type: "live_transfer", lead_name: "John D.", lead_id: "l3", funnel_lead_id: "fl3", stage_name: "Live Transfer", description: "Live transfer requested for John D. — Connecting to sales...", created_at: new Date(Date.now() - 8 * 60_000).toISOString() },
  { id: "e4", event_type: "call_result", lead_name: "Elena V.", lead_id: "l4", funnel_lead_id: "fl4", stage_name: null, description: "Call result for Elena V. — Soft (interested)", created_at: new Date(Date.now() - 15 * 60_000).toISOString() },
  { id: "e5", event_type: "stage_entered", lead_name: "Mehmet Y.", lead_id: "l5", funnel_lead_id: "fl5", stage_name: "Nurturing", description: "Mehmet Y. moved to Nurturing", created_at: new Date(Date.now() - 1 * 3600_000).toISOString() },
  { id: "e6", event_type: "whatsapp_sent", lead_name: "Sophie L.", lead_id: "l6", funnel_lead_id: "fl6", stage_name: "Day 7 follow-up", description: "WhatsApp sent to Sophie L. — Day 7 clinic video", created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: "e7", event_type: "call_made", lead_name: "David M.", lead_id: "l7", funnel_lead_id: "fl7", stage_name: "Re-acquisition", description: "AI called David M. — Re-acquisition call", created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
  { id: "e8", event_type: "stage_entered", lead_name: "Patient #412", lead_id: "l8", funnel_lead_id: "fl8", stage_name: "Loyal", description: "Review received from Patient #412", created_at: new Date(Date.now() - 24 * 3600_000).toISOString() },
];

export const MOCK_CONFIG: FunnelConfig = {
  id: "mock-config",
  user_id: "mock-demo-user",
  is_running: true,
  daily_call_limit: 50,
  calling_hours_start: "09:00",
  calling_hours_end: "20:00",
  hard_waiting_days: 10,
  paused_at: null,
  started_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const MOCK_NEW_LEAD_COUNT = 124;

// 20 stages with lead counts for flowchart
const STAGE_SPECS: Array<{ name: string; display_name: string; simple_stage: SimpleStage; stage_type: string; branch: string | null; position_order: number; color: string; icon: string; lead_count: number; description: string }> = [
  { name: "NEW", display_name: "New Lead", simple_stage: "new", stage_type: "entry", branch: "main", position_order: 1, color: "#EC4899", icon: "UserPlus", lead_count: 847, description: "Lead just entered the funnel." },
  { name: "DAY0_AI_CALL", display_name: "AI Call (Day 0)", simple_stage: "contacting", stage_type: "action_call", branch: "main", position_order: 2, color: "#F59E0B", icon: "PhoneCall", lead_count: 198, description: "AI makes the first call." },
  { name: "HARD_WAITING", display_name: "Hard — Cooling", simple_stage: "nurturing", stage_type: "waiting", branch: "hard", position_order: 3, color: "#6B7280", icon: "Clock", lead_count: 45, description: "Cooling off before re-engagement." },
  { name: "HARD_RE_ENGAGEMENT", display_name: "Re-engagement", simple_stage: "nurturing", stage_type: "action_whatsapp", branch: "hard", position_order: 4, color: "#EF4444", icon: "MessageCircle", lead_count: 22, description: "Sending success story." },
  { name: "HARD_REACQUISITION_CALL", display_name: "Reacquisition Call", simple_stage: "nurturing", stage_type: "action_call", branch: "hard", position_order: 5, color: "#EF4444", icon: "PhoneForwarded", lead_count: 8, description: "Win-back call." },
  { name: "SOFT_FOLLOWUP", display_name: "Soft Follow-Up", simple_stage: "nurturing", stage_type: "action_whatsapp", branch: "soft", position_order: 6, color: "#F59E0B", icon: "Heart", lead_count: 249, description: "Gentle nurture sequence." },
  { name: "NO_ANSWER_WHATSAPP_INTRO", display_name: "WhatsApp Intro", simple_stage: "contacting", stage_type: "action_whatsapp", branch: "no_answer", position_order: 7, color: "#8B5CF6", icon: "Send", lead_count: 112, description: "Intro message after missed call." },
  { name: "NO_ANSWER_DAY1", display_name: "Day 1", simple_stage: "contacting", stage_type: "action_whatsapp", branch: "no_answer", position_order: 8, color: "#8B5CF6", icon: "Send", lead_count: 54, description: "Day 1 follow-up." },
  { name: "NO_ANSWER_DAY2", display_name: "Day 2", simple_stage: "contacting", stage_type: "action_whatsapp", branch: "no_answer", position_order: 9, color: "#8B5CF6", icon: "Send", lead_count: 28, description: "Social proof message." },
  { name: "NO_ANSWER_DAY15", display_name: "Day 15", simple_stage: "contacting", stage_type: "action_whatsapp", branch: "no_answer", position_order: 10, color: "#8B5CF6", icon: "Send", lead_count: 12, description: "Before & after." },
  { name: "LIVE_TRANSFER", display_name: "Live Transfer", simple_stage: "ready", stage_type: "action_live_transfer", branch: "main", position_order: 11, color: "#F97316", icon: "PhoneForwarded", lead_count: 28, description: "Transfer to sales." },
  { name: "ARCHIVE_GDPR", display_name: "Archived", simple_stage: "archived", stage_type: "terminal_archive", branch: null, position_order: 12, color: "#374151", icon: "Archive", lead_count: 312, description: "Archived." },
  { name: "DAY60_STILL_HERE", display_name: "Day 60", simple_stage: "nurturing", stage_type: "action_whatsapp", branch: "soft", position_order: 13, color: "#6B7280", icon: "Clock", lead_count: 18, description: "We are here message." },
  { name: "TREATMENT", display_name: "In Treatment", simple_stage: "in_treatment", stage_type: "treatment", branch: "post_treatment", position_order: 14, color: "#3B82F6", icon: "Stethoscope", lead_count: 89, description: "Patient in treatment." },
  { name: "POST_TREATMENT_DAY7", display_name: "Post-Treatment Day 7", simple_stage: "in_treatment", stage_type: "action_call", branch: "post_treatment", position_order: 15, color: "#3B82F6", icon: "PhoneCall", lead_count: 24, description: "Satisfaction call." },
  { name: "REVIEW_AND_REFERRAL", display_name: "Review & Referral", simple_stage: "in_treatment", stage_type: "action_whatsapp", branch: "post_treatment", position_order: 16, color: "#10B981", icon: "Star", lead_count: 18, description: "Ask for review." },
  { name: "URGENT_ALERT", display_name: "Urgent Alert", simple_stage: "in_treatment", stage_type: "alert", branch: "post_treatment", position_order: 17, color: "#EF4444", icon: "AlertTriangle", lead_count: 3, description: "Immediate attention." },
  { name: "POST_TREATMENT_DAY30", display_name: "Post-Treatment Day 30", simple_stage: "in_treatment", stage_type: "action_call", branch: "post_treatment", position_order: 18, color: "#3B82F6", icon: "PhoneCall", lead_count: 12, description: "30-day check-in." },
  { name: "RECOVERY_MANAGEMENT", display_name: "Recovery", simple_stage: "in_treatment", stage_type: "waiting", branch: "post_treatment", position_order: 19, color: "#06B6D4", icon: "HeartPulse", lead_count: 10, description: "Recovery period." },
  { name: "LOYAL", display_name: "Loyal", simple_stage: "loyal", stage_type: "terminal_loyal", branch: null, position_order: 20, color: "#10B981", icon: "Award", lead_count: 89, description: "Loyal patient." },
];

export const MOCK_STAGES: FunnelStageWithCount[] = STAGE_SPECS.map((s, i) => ({
  id: `mock-stage-${i + 1}`,
  user_id: "mock-demo-user",
  name: s.name,
  display_name: s.display_name,
  simple_stage: s.simple_stage,
  stage_type: s.stage_type as FunnelStageWithCount["stage_type"],
  branch: s.branch,
  day_offset: null,
  color: s.color,
  icon: s.icon,
  position_order: s.position_order,
  is_automated: true,
  description: s.description,
  created_at: new Date().toISOString(),
  lead_count: s.lead_count,
}));

export const MOCK_TRANSITIONS: FunnelTransition[] = [
  { id: "t1", user_id: "mock-demo-user", from_stage_id: "mock-stage-1", to_stage_id: "mock-stage-2", condition_type: "auto", condition_value: null, label: "Auto", created_at: new Date().toISOString() },
  { id: "t2", user_id: "mock-demo-user", from_stage_id: "mock-stage-2", to_stage_id: "mock-stage-3", condition_type: "call_result_hard", condition_value: null, label: "Hard", created_at: new Date().toISOString() },
  { id: "t3", user_id: "mock-demo-user", from_stage_id: "mock-stage-2", to_stage_id: "mock-stage-6", condition_type: "call_result_soft", condition_value: null, label: "Soft", created_at: new Date().toISOString() },
  { id: "t4", user_id: "mock-demo-user", from_stage_id: "mock-stage-2", to_stage_id: "mock-stage-7", condition_type: "call_result_no_answer", condition_value: null, label: "No Answer", created_at: new Date().toISOString() },
];

// Mock leads per simple_stage for list view
const MOCK_LEAD_NAMES = ["Ahmed K.", "Maria S.", "John D.", "Elena V.", "Mehmet Y.", "Sophie L.", "David M.", "Fatma Z.", "James W.", "Ayşe T."];

function mockLeadsForStage(simpleStage: SimpleStage, count: number): FunnelLeadWithInfo[] {
  const stageMeta = STAGE_SPECS.find((s) => s.simple_stage === simpleStage);
  const stageName = stageMeta?.display_name ?? simpleStage;
  const stageColor = stageMeta?.color ?? "#6B7280";
  return Array.from({ length: Math.min(count, 30) }, (_, i) => ({
    id: `mock-fl-${simpleStage}-${i}`,
    user_id: "mock-demo-user",
    lead_id: `mock-lead-${i}`,
    lead_name: MOCK_LEAD_NAMES[i % MOCK_LEAD_NAMES.length] + (i >= MOCK_LEAD_NAMES.length ? ` ${i + 1}` : ""),
    phone: "+90 532 111 2233",
    email: `lead${i}@example.com`,
    source: "Website",
    current_stage_id: `mock-stage-${i}`,
    stage_name: stageName,
    stage_color: stageColor,
    simple_stage: simpleStage,
    status: "active",
    branch: "main",
    entered_funnel_at: new Date(Date.now() - (i + 1) * 24 * 3600_000).toISOString(),
    entered_current_stage_at: new Date(Date.now() - i * 12 * 3600_000).toISOString(),
    treatment_date: null,
    metadata: {},
    next_action_at: null,
    next_action_type: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export function getMockLeadsByStage(simpleStage: SimpleStage): FunnelLeadWithInfo[] {
  const bucket = MOCK_BUCKETS.find((b) => b.stage === simpleStage);
  const count = bucket?.count ?? 0;
  return mockLeadsForStage(simpleStage, Math.min(count, 30));
}

export function getMockLeadsTotalByStage(simpleStage: SimpleStage): number {
  const bucket = MOCK_BUCKETS.find((b) => b.stage === simpleStage);
  return bucket?.count ?? 0;
}

// Chart: last 30 days
export const MOCK_DAILY_CHART: Array<{ date: string; entered: number; calls: number; responses: number; conversions: number }> = (() => {
  const now = new Date();
  const out: Array<{ date: string; entered: number; calls: number; responses: number; conversions: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const dateStr = d.toISOString().split("T")[0]!;
    const dayOfWeek = d.getDay();
    const weekend = dayOfWeek === 0 || dayOfWeek === 6;
    out.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      entered: Math.floor(20 + Math.random() * 40) + (weekend ? -10 : 0),
      calls: Math.floor(30 + Math.random() * 25) + (weekend ? -15 : 0),
      responses: Math.floor(5 + Math.random() * 20),
      conversions: Math.floor(1 + Math.random() * 8),
    });
  }
  return out;
})();
