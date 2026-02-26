// ===========================================
// VOLINA AI - TypeScript Type Definitions
// ===========================================

// Database Types
export interface Doctor {
  id: string;
  user_id: string;
  name: string;
  specialty: string;
  color_code: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  doctor_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_via_ai: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  doctor?: Doctor;
}

export type AppointmentStatus = 
  | 'scheduled' 
  | 'confirmed' 
  | 'completed' 
  | 'cancelled' 
  | 'no_show';

export interface Call {
  id: string;
  user_id: string;
  vapi_call_id: string | null;
  appointment_id: string | null;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  sentiment: CallSentiment | null;
  duration: number | null;
  type: CallType;
  caller_phone: string | null;
  caller_name: string | null;
  evaluation_summary: string | null;
  evaluation_score: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  appointment?: Appointment;
}

export type CallSentiment = 'positive' | 'neutral' | 'negative';

export type CallType = 'appointment' | 'inquiry' | 'follow_up' | 'cancellation';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  vapi_org_id?: string | null;
  vapi_assistant_id?: string | null;
  vapi_phone_number_id?: string | null;
  /** Per-tenant VAPI API key (different VAPI account). Server-only, never exposed to client. */
  vapi_private_key?: string | null;
  slug?: string | null;
  dashboard_type?: DashboardType;
  company_name?: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'admin' | 'user' | 'viewer';
export type DashboardType = 'inbound' | 'outbound';

// API Types
export interface VapiWebhookPayload {
  message: {
    type: string;
    call: {
      id: string;
      orgId: string;
      createdAt: string;
      updatedAt: string;
      type: string;
      status: string;
      endedReason: string;
    };
    recordingUrl?: string;
    transcript?: string;
    summary?: string;
    analysis?: {
      sentiment?: string;
    };
  };
}

export interface VapiAssistantConfig {
  assistantId: string;
  assistant?: {
    name: string;
    firstMessage: string;
    model: {
      provider: string;
      model: string;
    };
  };
}

// Dashboard Analytics Types
export interface DashboardStats {
  totalCalls: number;
  monthlyCallsChange: number;
  dailyCalls: number;
  dailyCallsChange: number;
  avgDuration: number;
  avgDurationChange: number;
  appointmentRate: number;
  appointmentRateChange: number;
}

export interface CallTypeDistribution {
  name: string;
  value: number;
  color: string;
}

export interface DailyActivity {
  date: string;
  calls: number;
  appointments: number;
}

export interface RecentActivity {
  id: string;
  type: 'call' | 'appointment';
  description: string;
  timestamp: string;
  sentiment?: CallSentiment;
}

// Calendar Types
export interface TimeSlot {
  time: string;
  hour: number;
  minute: number;
}

export interface CalendarAppointment extends Appointment {
  doctor: Doctor;
  gridRow: number;
  gridRowEnd: number;
}

// Auth Types
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: Profile | null;
  error: string | null;
}

// Component Props Types
export interface KPICardProps {
  title: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  trend: 'up' | 'down' | 'neutral';
}

export interface CallRowProps {
  call: Call;
  isExpanded: boolean;
  onToggle: () => void;
}

// Utility Types
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Supabase Realtime Types
export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T | null;
  schema: string;
  table: string;
  commit_timestamp: string;
}
