// ===========================================
// VOLINA AI - VAPI API Client (Server-Side)
// ===========================================
// This module handles fetching data from VAPI's REST API

const VAPI_API_BASE_URL = 'https://api.vapi.ai';

// Get VAPI API key from environment
function getVapiApiKey(): string {
  const apiKey = process.env.VAPI_PRIVATE_KEY;
  if (!apiKey) {
    throw new Error('VAPI_PRIVATE_KEY is not configured');
  }
  return apiKey;
}

// Generic fetch helper with authentication
// Accepts optional overrideApiKey to support per-tenant VAPI accounts
async function vapiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  overrideApiKey?: string
): Promise<T> {
  const apiKey = overrideApiKey || getVapiApiKey();
  
  const response = await fetch(`${VAPI_API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`VAPI API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ===========================================
// VAPI Types
// ===========================================

export interface VapiCall {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  costBreakdown?: {
    transport?: number;
    stt?: number;
    llm?: number;
    tts?: number;
    vapi?: number;
    total?: number;
  };
  transcript?: string;
  recordingUrl?: string;
  stereoRecordingUrl?: string;
  summary?: string;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
  messages?: VapiMessage[];
  phoneNumber?: {
    id: string;
    number: string;
  };
  customer?: {
    number?: string;
    name?: string;
  };
  assistant?: {
    id: string;
    name: string;
  };
  assistantId?: string;
  metadata?: {
    lead_id?: string;
    outreach_id?: string;
    user_id?: string;
    [key: string]: unknown;
  };
}

export interface VapiMessage {
  role: 'system' | 'assistant' | 'user' | 'function' | 'tool';
  message?: string;
  content?: string;
  time?: number;
  secondsFromStart?: number;
}

export interface VapiAnalytics {
  totalCalls: number;
  totalMinutes: number;
  totalCost: number;
  avgDuration: number;
  successRate: number;
  callsByType: {
    inbound: number;
    outbound: number;
    web: number;
  };
  callsByStatus: Record<string, number>;
}

export interface VapiListCallsParams {
  limit?: number;
  createdAtGt?: string;
  createdAtLt?: string;
  createdAtGe?: string;
  createdAtLe?: string;
  assistantId?: string;
  phoneNumberId?: string;
}

export interface VapiListCallsResponse {
  results: VapiCall[];
  metadata?: {
    totalCount?: number;
    pageSize?: number;
    currentPage?: number;
  };
}

// ===========================================
// API Functions
// ===========================================

/**
 * Fetch a list of calls from VAPI
 */
export async function getVapiCalls(
  params: VapiListCallsParams = {},
  overrideApiKey?: string
): Promise<VapiCall[]> {
  const queryParams = new URLSearchParams();
  
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.createdAtGt) queryParams.set('createdAtGt', params.createdAtGt);
  if (params.createdAtLt) queryParams.set('createdAtLt', params.createdAtLt);
  if (params.createdAtGe) queryParams.set('createdAtGe', params.createdAtGe);
  if (params.createdAtLe) queryParams.set('createdAtLe', params.createdAtLe);
  if (params.assistantId) queryParams.set('assistantId', params.assistantId);
  if (params.phoneNumberId) queryParams.set('phoneNumberId', params.phoneNumberId);

  const queryString = queryParams.toString();
  const endpoint = `/call${queryString ? `?${queryString}` : ''}`;
  
  const response = await vapiRequest<VapiCall[] | VapiListCallsResponse>(endpoint, {}, overrideApiKey);
  
  // Handle both array response and paginated response
  if (Array.isArray(response)) {
    return response;
  }
  
  return response.results || [];
}

/**
 * Fetch a single call by ID
 */
export async function getVapiCallById(callId: string): Promise<VapiCall> {
  return vapiRequest<VapiCall>(`/call/${callId}`);
}

/**
 * Calculate analytics from call data
 */
export function calculateVapiAnalytics(calls: VapiCall[]): VapiAnalytics {
  const totalCalls = calls.length;
  
  let totalMinutes = 0;
  let totalCost = 0;
  let successfulCalls = 0;
  const callsByType = { inbound: 0, outbound: 0, web: 0 };
  const callsByStatus: Record<string, number> = {};

  for (const call of calls) {
    // Calculate duration in minutes
    if (call.startedAt && call.endedAt) {
      const duration = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000 / 60;
      totalMinutes += duration;
    }

    // Aggregate cost
    if (call.cost) {
      totalCost += call.cost;
    } else if (call.costBreakdown?.total) {
      totalCost += call.costBreakdown.total;
    }

    // Count by type
    if (call.type === 'inboundPhoneCall') {
      callsByType.inbound++;
    } else if (call.type === 'outboundPhoneCall') {
      callsByType.outbound++;
    } else if (call.type === 'webCall') {
      callsByType.web++;
    }

    // Count by status
    callsByStatus[call.status] = (callsByStatus[call.status] || 0) + 1;

    // Determine success based on endedReason
    if (call.status === 'ended' && call.endedReason === 'assistant-ended-call') {
      successfulCalls++;
    } else if (call.status === 'ended' && call.endedReason === 'customer-ended-call') {
      successfulCalls++;
    }
  }

  const avgDuration = totalCalls > 0 ? totalMinutes / totalCalls : 0;
  const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;

  return {
    totalCalls,
    totalMinutes: Math.round(totalMinutes * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    avgDuration: Math.round(avgDuration * 100) / 100,
    successRate: Math.round(successRate * 100) / 100,
    callsByType,
    callsByStatus,
  };
}

/**
 * Get calls with calculated analytics for dashboard
 */
export async function getVapiDashboardData(options: {
  days?: number;
  limit?: number;
} = {}): Promise<{
  calls: VapiCall[];
  analytics: VapiAnalytics;
  dailyActivity: Array<{ date: string; calls: number; minutes: number }>;
}> {
  // VAPI free tier only allows 14 days of history
  const { days = 14, limit = 100 } = options;
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch calls from VAPI
  const calls = await getVapiCalls({
    limit,
    createdAtGe: startDate.toISOString(),
  });

  // Calculate analytics
  const analytics = calculateVapiAnalytics(calls);

  // Calculate daily activity
  const dailyMap: Record<string, { calls: number; minutes: number }> = {};
  
  // Initialize all days in range
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split('T')[0];
    if (dateStr) {
      dailyMap[dateStr] = { calls: 0, minutes: 0 };
    }
  }

  // Populate with call data
  for (const call of calls) {
    const dateStr = call.createdAt.split('T')[0];
    if (dateStr && dailyMap[dateStr]) {
      dailyMap[dateStr].calls++;
      
      if (call.startedAt && call.endedAt) {
        const duration = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000 / 60;
        dailyMap[dateStr].minutes += duration;
      }
    }
  }

  const dailyActivity = Object.entries(dailyMap).map(([date, data]) => ({
    date,
    calls: data.calls,
    minutes: Math.round(data.minutes * 100) / 100,
  }));

  return {
    calls,
    analytics,
    dailyActivity,
  };
}

/**
 * Transform VAPI call to local Call format for compatibility
 */
export function transformVapiCallToLocal(vapiCall: VapiCall): {
  id: string;
  vapi_call_id: string;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  duration: number | null;
  type: 'appointment' | 'inquiry' | 'follow_up' | 'cancellation';
  caller_phone: string | null;
  created_at: string;
  updated_at: string;
  cost: number | null;
  status: string;
  ended_reason: string | null;
} {
  // Calculate duration in seconds
  let duration: number | null = null;
  if (vapiCall.startedAt && vapiCall.endedAt) {
    duration = Math.round(
      (new Date(vapiCall.endedAt).getTime() - new Date(vapiCall.startedAt).getTime()) / 1000
    );
  }

  // Determine sentiment from analysis
  let sentiment: 'positive' | 'neutral' | 'negative' | null = null;
  if (vapiCall.analysis?.successEvaluation) {
    const evaluation = vapiCall.analysis.successEvaluation.toLowerCase();
    if (evaluation.includes('positive') || evaluation.includes('success') || evaluation.includes('good')) {
      sentiment = 'positive';
    } else if (evaluation.includes('negative') || evaluation.includes('fail') || evaluation.includes('bad')) {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }
  }

  // Determine call type from summary or transcript
  let type: 'appointment' | 'inquiry' | 'follow_up' | 'cancellation' = 'inquiry';
  const lowerContent = (vapiCall.summary || vapiCall.transcript || '').toLowerCase();
  
  if (lowerContent.includes('cancel')) {
    type = 'cancellation';
  } else if (lowerContent.includes('follow') || lowerContent.includes('follow-up')) {
    type = 'follow_up';
  } else if (
    lowerContent.includes('appointment') ||
    lowerContent.includes('schedule') ||
    lowerContent.includes('book')
  ) {
    type = 'appointment';
  }

  return {
    id: vapiCall.id,
    vapi_call_id: vapiCall.id,
    recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
    transcript: vapiCall.transcript || null,
    summary: vapiCall.analysis?.summary || vapiCall.summary || null,
    sentiment,
    duration,
    type,
    caller_phone: vapiCall.customer?.number || null,
    created_at: vapiCall.createdAt,
    updated_at: vapiCall.updatedAt,
    cost: vapiCall.cost || vapiCall.costBreakdown?.total || null,
    status: vapiCall.status,
    ended_reason: vapiCall.endedReason || null,
  };
}

/**
 * Check if VAPI is configured
 */
export function isVapiConfigured(): boolean {
  return !!process.env.VAPI_PRIVATE_KEY;
}

