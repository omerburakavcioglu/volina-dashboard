import { supabase } from './supabase';
import type { 
  Lead, 
  Campaign, 
  Outreach, 
  MessageTemplate, 
  AISettings, 
  OnlineAppointment,
  OutboundStats,
  OutreachResult
} from './types-outbound';

// ===========================================
// LEADS
// ===========================================

export async function getLeads(filters?: {
  status?: string;
  priority?: string;
  language?: string;
  search?: string;
  limit?: number;
}): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters?.language) {
    query = query.eq('language', filters.language);
  }
  if (filters?.search) {
    query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
  
  return data as Lead[];
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching lead:', error);
    return null;
  }

  return data as Lead;
}

export async function createLead(lead: Partial<Lead>): Promise<Lead | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, user_id: user.id } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating lead:', error);
    return null;
  }

  return data as Lead;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating lead:', error);
    return null;
  }

  return data as Lead;
}

export async function deleteLead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting lead:', error);
    return false;
  }

  return true;
}

export async function createLeadsBulk(leads: Partial<Lead>[]): Promise<{ success: number; failed: number; errors: string[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: 0, failed: leads.length, errors: ['Kullanıcı oturumu bulunamadı'] };

  const results = { success: 0, failed: 0, errors: [] as string[] };

  // Add user_id to all leads
  const leadsWithUser = leads.map(lead => ({
    ...lead,
    user_id: user.id,
    status: lead.status || 'new',
    priority: lead.priority || 'medium',
    language: lead.language || 'tr',
  }));

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < leadsWithUser.length; i += batchSize) {
    const batch = leadsWithUser.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('leads')
      .insert(batch as never[])
      .select();

    if (error) {
      console.error('Error creating leads batch:', error);
      results.failed += batch.length;
      results.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      results.success += data?.length || 0;
      results.failed += batch.length - (data?.length || 0);
    }
  }

  return results;
}

export async function getTodaysLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .lte('next_contact_date', new Date().toISOString())
    .not('status', 'in', '("converted","lost","unreachable")')
    .order('priority', { ascending: false })
    .order('next_contact_date', { ascending: true });

  if (error) {
    console.error('Error fetching today\'s leads:', error);
    return [];
  }

  return data as Lead[];
}

// ===========================================
// CAMPAIGNS
// ===========================================

export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
    return [];
  }

  return data as Campaign[];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching campaign:', error);
    return null;
  }

  return data as Campaign;
}

export async function createCampaign(campaign: Partial<Campaign>): Promise<Campaign | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...campaign, user_id: user.id } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating campaign:', error);
    return null;
  }

  return data as Campaign;
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating campaign:', error);
    return null;
  }

  return data as Campaign;
}

// ===========================================
// OUTREACH
// ===========================================

export async function getOutreach(filters?: {
  lead_id?: string;
  channel?: string;
  status?: string;
  date?: string;
  limit?: number;
}): Promise<Outreach[]> {
  let query = supabase
    .from('outreach')
    .select('*, lead:leads(*)')
    .order('created_at', { ascending: false });

  if (filters?.lead_id) {
    query = query.eq('lead_id', filters.lead_id);
  }
  if (filters?.channel) {
    query = query.eq('channel', filters.channel);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.date) {
    query = query.gte('scheduled_for', `${filters.date}T00:00:00`)
                 .lte('scheduled_for', `${filters.date}T23:59:59`);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching outreach:', error);
    return [];
  }

  return data as Outreach[];
}

export async function getTodaysOutreach(): Promise<Outreach[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('outreach')
    .select('*, lead:leads(*)')
    .gte('scheduled_for', `${today}T00:00:00`)
    .lte('scheduled_for', `${today}T23:59:59`)
    .order('scheduled_for', { ascending: true });

  if (error) {
    console.error('Error fetching today\'s outreach:', error);
    return [];
  }

  return data as Outreach[];
}

export async function createOutreach(outreach: Partial<Outreach>): Promise<Outreach | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('outreach')
    .insert({ ...outreach, user_id: user.id } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating outreach:', error);
    return null;
  }

  return data as Outreach;
}

export async function updateOutreach(id: string, updates: Partial<Outreach>): Promise<Outreach | null> {
  const { data, error } = await supabase
    .from('outreach')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating outreach:', error);
    return null;
  }

  return data as Outreach;
}

export async function completeOutreach(
  id: string, 
  result: OutreachResult, 
  notes?: string,
  aiSummary?: string,
  aiSentiment?: 'positive' | 'neutral' | 'negative'
): Promise<Outreach | null> {
  const updates: Partial<Outreach> = {
    status: 'completed',
    result,
    completed_at: new Date().toISOString(),
    notes,
    ai_summary: aiSummary,
    ai_sentiment: aiSentiment,
  };

  return updateOutreach(id, updates);
}

// ===========================================
// MESSAGE TEMPLATES
// ===========================================

export async function getMessageTemplates(channel?: string): Promise<MessageTemplate[]> {
  let query = supabase
    .from('message_templates')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (channel) {
    query = query.eq('channel', channel);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching templates:', error);
    return [];
  }

  return data as MessageTemplate[];
}

export async function createMessageTemplate(template: Partial<MessageTemplate>): Promise<MessageTemplate | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('message_templates')
    .insert({ ...template, user_id: user.id } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating template:', error);
    return null;
  }

  return data as MessageTemplate;
}

export async function updateMessageTemplate(id: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating template:', error);
    return null;
  }

  return data as MessageTemplate;
}

// ===========================================
// AI SETTINGS
// ===========================================

export async function getAISettings(): Promise<AISettings | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) {
    // If not found, create default settings
    if (error.code === 'PGRST116') {
      return createDefaultAISettings();
    }
    console.error('Error fetching AI settings:', error);
    return null;
  }

  return data as AISettings;
}

async function createDefaultAISettings(): Promise<AISettings | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const defaultSettings = {
    user_id: user.id,
    company_name: 'Smile and Holiday',
    agent_name: 'AI Asistan',
    opening_script_tr: 'Merhaba, ben Smile and Holiday\'den arıyorum. Size Türkiye\'yi neden tercih ettiğinizi sorabilir miyim?',
    opening_script_en: 'Hello, I\'m calling from Smile and Holiday. May I ask why you chose Turkey?',
    announce_ai: true,
    persistence_level: 'medium',
    curiosity_questions: JSON.stringify([
      'Tedavi hakkında daha fazla bilgi almak ister misiniz?',
      'Online doktor randevusu ayarlamamızı ister misiniz?'
    ]),
    primary_goal: 'online_appointment',
    call_hours_start: '09:00',
    call_hours_end: '20:00',
    call_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  };

  const { data, error } = await supabase
    .from('ai_settings')
    .insert(defaultSettings as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating default AI settings:', error);
    return null;
  }

  return data as AISettings;
}

export async function updateAISettings(updates: Partial<AISettings>): Promise<AISettings | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('ai_settings')
    .update(updates as never)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating AI settings:', error);
    return null;
  }

  return data as AISettings;
}

// ===========================================
// ONLINE APPOINTMENTS
// ===========================================

export async function getOnlineAppointments(filters?: {
  status?: string;
  date?: string;
  limit?: number;
}): Promise<OnlineAppointment[]> {
  let query = supabase
    .from('online_appointments')
    .select('*, lead:leads(*)')
    .order('appointment_date', { ascending: true });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.date) {
    query = query.gte('appointment_date', `${filters.date}T00:00:00`)
                 .lte('appointment_date', `${filters.date}T23:59:59`);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }

  return data as OnlineAppointment[];
}

export async function createOnlineAppointment(appointment: Partial<OnlineAppointment>): Promise<OnlineAppointment | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('online_appointments')
    .insert({ ...appointment, user_id: user.id } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating appointment:', error);
    return null;
  }

  // Update lead status
  if (appointment.lead_id) {
    await updateLead(appointment.lead_id, { status: 'appointment_set' });
  }

  return data as OnlineAppointment;
}

// ===========================================
// STATS & ANALYTICS
// ===========================================

export async function getOutboundStats(): Promise<OutboundStats> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const defaultStats: OutboundStats = {
    total_leads: 0,
    new_leads: 0,
    contacted_leads: 0,
    interested_leads: 0,
    appointments_set: 0,
    converted_leads: 0,
    unreachable_leads: 0,
    todays_calls: 0,
    completed_calls_today: 0,
    conversion_rate: 0,
  };

  if (!user) return defaultStats;

  // Get lead counts by status
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('status');

  if (leadsError) {
    console.error('Error fetching lead stats:', leadsError);
    return defaultStats;
  }

  const stats = { ...defaultStats };
  const leadsData = leads as { status: string }[] | null;
  stats.total_leads = leadsData?.length || 0;
  
  leadsData?.forEach(lead => {
    switch (lead.status) {
      case 'new': stats.new_leads++; break;
      case 'contacted': stats.contacted_leads++; break;
      case 'interested': stats.interested_leads++; break;
      case 'appointment_set': stats.appointments_set++; break;
      case 'converted': stats.converted_leads++; break;
      case 'unreachable': stats.unreachable_leads++; break;
    }
  });

  // Calculate conversion rate
  if (stats.total_leads > 0) {
    stats.conversion_rate = Math.round((stats.converted_leads / stats.total_leads) * 100 * 100) / 100;
  }

  // Get today's call stats
  const today = new Date().toISOString().split('T')[0] || '';
  
  const { data: todaysCalls } = await supabase
    .from('outreach')
    .select('status')
    .eq('channel', 'call')
    .gte('scheduled_for', `${today}T00:00:00`)
    .lte('scheduled_for', `${today}T23:59:59`);

  const callsData = todaysCalls as { status: string }[] | null;
  stats.todays_calls = callsData?.length || 0;
  stats.completed_calls_today = callsData?.filter(c => c.status === 'completed').length || 0;

  return stats;
}

export async function getChannelPerformance(): Promise<{ channel: string; attempts: number; successes: number; rate: number }[]> {
  const { data, error } = await supabase
    .from('outreach')
    .select('channel, result')
    .eq('status', 'completed');

  if (error) {
    console.error('Error fetching channel performance:', error);
    return [];
  }

  const channels: Record<string, { attempts: number; successes: number }> = {};
  const outreachData = data as { channel: string; result: string | null }[] | null;

  outreachData?.forEach(outreach => {
    const channelKey = outreach.channel;
    if (!channels[channelKey]) {
      channels[channelKey] = { attempts: 0, successes: 0 };
    }
    const channelStats = channels[channelKey];
    if (channelStats) {
      channelStats.attempts++;
      if (outreach.result?.includes('interested') || outreach.result?.includes('appointment')) {
        channelStats.successes++;
      }
    }
  });

  return Object.entries(channels).map(([channel, statsData]) => ({
    channel,
    attempts: statsData.attempts,
    successes: statsData.successes,
    rate: statsData.attempts > 0 ? Math.round((statsData.successes / statsData.attempts) * 100) : 0,
  }));
}

// ===========================================
// REALTIME SUBSCRIPTIONS
// ===========================================

export function subscribeToLeads(callback: (payload: { eventType: string; new: Lead | null; old: Lead | null }) => void) {
  return supabase
    .channel('leads-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
      callback({
        eventType: payload.eventType,
        new: payload.new as Lead | null,
        old: payload.old as Lead | null,
      });
    })
    .subscribe();
}

export function subscribeToOutreach(callback: (payload: { eventType: string; new: Outreach | null; old: Outreach | null }) => void) {
  return supabase
    .channel('outreach-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'outreach' }, (payload) => {
      callback({
        eventType: payload.eventType,
        new: payload.new as Outreach | null,
        old: payload.old as Outreach | null,
      });
    })
    .subscribe();
}

// ===========================================
// MESSAGES
// ===========================================

import type { Message, OutreachChannel, AnalyticsData } from './types-outbound';

export async function getMessages(channel?: OutreachChannel): Promise<Message[]> {
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      // Check if table doesn't exist (code 42P01) - return empty array instead of crashing
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('Messages table does not exist. Run add-messages-table.sql in Supabase SQL Editor.');
        return [];
      }
      console.error('Error fetching messages:', error);
      return [];
    }

    return data as Message[];
  } catch (err) {
    console.error('Error fetching messages:', err);
    return [];
  }
}

export async function sendMessage(message: {
  channel: OutreachChannel;
  recipient: string;
  subject?: string;
  content: string;
  lead_id?: string;
}): Promise<Message | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      user_id: user.id,
      channel: message.channel,
      recipient: message.recipient,
      subject: message.subject,
      content: message.content,
      lead_id: message.lead_id,
      direction: 'outbound',
      status: 'sent',
    } as never)
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    return null;
  }

  return data as Message;
}

// ===========================================
// CALLS
// ===========================================

export async function getTodaysCalls(): Promise<Outreach[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('outreach')
    .select('*, lead:leads(*)')
    .eq('channel', 'call')
    .gte('scheduled_for', `${today}T00:00:00`)
    .lte('scheduled_for', `${today}T23:59:59`)
    .order('scheduled_for', { ascending: true });

  if (error) {
    console.error('Error fetching today\'s calls:', error);
    return [];
  }

  return data as Outreach[];
}


export async function getOutreachHistory(leadId: string): Promise<Outreach[]> {
  const { data, error } = await supabase
    .from('outreach')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching outreach history:', error);
    return [];
  }

  return data as Outreach[];
}

// ===========================================
// ANALYTICS
// ===========================================

export async function getAnalytics(startDate: Date, endDate: Date): Promise<AnalyticsData> {
  const defaultAnalytics: AnalyticsData = {
    total_leads: 0,
    contacted_leads: 0,
    interested_leads: 0,
    appointments_set: 0,
    converted_leads: 0,
    unreachable_leads: 0,
    conversion_rate: 0,
    conversion_change: 0,
    avg_call_duration: 0,
    reachability_rate: 0,
    total_calls: 0,
    total_messages: 0,
    avg_response_time: 0,
    channel_performance: [],
    best_call_times: [],
    language_performance: { tr: 0, en: 0 },
  };

  try {
    // Get lead stats
    const { data: leads } = await supabase
      .from('leads')
      .select('status, language, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (leads) {
      const leadsData = leads as { status: string; language: string; created_at: string }[];
      defaultAnalytics.total_leads = leadsData.length;
      
      leadsData.forEach(lead => {
        switch (lead.status) {
          case 'contacted': defaultAnalytics.contacted_leads++; break;
          case 'interested': defaultAnalytics.interested_leads++; break;
          case 'appointment_set': defaultAnalytics.appointments_set++; break;
          case 'converted': defaultAnalytics.converted_leads++; break;
          case 'unreachable': defaultAnalytics.unreachable_leads++; break;
        }
      });

      if (defaultAnalytics.total_leads > 0) {
        defaultAnalytics.conversion_rate = Math.round((defaultAnalytics.converted_leads / defaultAnalytics.total_leads) * 100);
      }
    }

    // Get outreach stats
    const { data: outreach } = await supabase
      .from('outreach')
      .select('channel, result, duration, status, scheduled_for')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (outreach) {
      const outreachData = outreach as { channel: string; result: string | null; duration: number | null; status: string; scheduled_for: string }[];
      const calls = outreachData.filter(o => o.channel === 'call');
      defaultAnalytics.total_calls = calls.length;
      defaultAnalytics.total_messages = outreachData.filter(o => o.channel !== 'call').length;

      // Calculate avg call duration
      const completedCalls = calls.filter(c => c.status === 'completed' && c.duration);
      if (completedCalls.length > 0) {
        defaultAnalytics.avg_call_duration = Math.round(
          completedCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / completedCalls.length
        );
      }

      // Calculate reachability rate
      const answeredCalls = calls.filter(c => c.result?.includes('answered'));
      if (calls.length > 0) {
        defaultAnalytics.reachability_rate = Math.round((answeredCalls.length / calls.length) * 100);
      }

      // Calculate channel performance
      const channelMap: Record<string, { attempts: number; successes: number }> = {};
      outreachData.forEach(o => {
        if (!channelMap[o.channel]) {
          channelMap[o.channel] = { attempts: 0, successes: 0 };
        }
        const stats = channelMap[o.channel];
        if (stats) {
          stats.attempts++;
          if (o.result?.includes('interested') || o.result?.includes('appointment')) {
            stats.successes++;
          }
        }
      });

      defaultAnalytics.channel_performance = Object.entries(channelMap).map(([channel, stats]) => ({
        channel,
        attempts: stats.attempts,
        successes: stats.successes,
        conversion_rate: stats.attempts > 0 ? Math.round((stats.successes / stats.attempts) * 100) : 0,
        success_rate: stats.attempts > 0 ? Math.round((stats.successes / stats.attempts) * 100) : 0,
      }));

      // Calculate best call times
      const hourMap: Record<number, { total: number; success: number }> = {};
      calls.forEach(c => {
        const hour = new Date(c.scheduled_for).getHours();
        if (!hourMap[hour]) {
          hourMap[hour] = { total: 0, success: 0 };
        }
        const stats = hourMap[hour];
        if (stats) {
          stats.total++;
          if (c.result?.includes('answered') || c.result?.includes('interested')) {
            stats.success++;
          }
        }
      });

      defaultAnalytics.best_call_times = Object.entries(hourMap)
        .map(([hour, stats]) => ({
          hour: parseInt(hour),
          success_rate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.success_rate - a.success_rate)
        .slice(0, 8);
    }

    return defaultAnalytics;
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return defaultAnalytics;
  }
}
