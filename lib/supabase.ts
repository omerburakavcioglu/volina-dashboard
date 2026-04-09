// ===========================================
// VOLINA AI - Supabase Client Configuration
// ===========================================

import { createClient } from '@supabase/supabase-js';
import type { Doctor, Appointment, Call, Profile } from './types';

// Type definitions for the database
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
      doctors: {
        Row: Doctor;
        Insert: Omit<Doctor, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Doctor, 'id' | 'created_at' | 'updated_at'>>;
      };
      appointments: {
        Row: Appointment;
        Insert: Omit<Appointment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Appointment, 'id' | 'created_at' | 'updated_at'>>;
      };
      calls: {
        Row: Call;
        Insert: Omit<Call, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Call, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
}

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client for browser/client-side usage
export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// Create admin client for server-side operations
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient<Database>(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// ===========================================
// Database Query Functions
// ===========================================

// Get current user ID helper
async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// Doctors
export async function getDoctors(): Promise<Doctor[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching doctors:', error);
    return [];
  }
  return data || [];
}

export async function getDoctorById(id: string): Promise<Doctor | null> {
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching doctor:', error);
    return null;
  }
  return data;
}

export async function createDoctor(doctor: Omit<Doctor, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Doctor | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('doctors')
    .insert({ ...doctor, user_id: userId } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating doctor:', error);
    return null;
  }
  return data;
}

// Appointments
export async function getAppointments(date?: string): Promise<Appointment[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from('appointments')
    .select(`
      *,
      doctor:doctors(*)
    `)
    .eq('user_id', userId)
    .order('start_time', { ascending: true });

  if (date) {
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    query = query
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }
  return data || [];
}

export async function getAppointmentsByDoctor(doctorId: string, date?: string): Promise<Appointment[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .eq('doctor_id', doctorId)
    .order('start_time', { ascending: true });

  if (date) {
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    query = query
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }
  return data || [];
}

export async function createAppointment(appointment: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Appointment | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appointment, user_id: userId } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating appointment:', error);
    return null;
  }
  return data;
}

export async function updateAppointmentStatus(id: string, status: Appointment['status']): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status } as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating appointment:', error);
    return null;
  }
  return data;
}

export async function deleteAppointment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting appointment:', error);
    return false;
  }
  return true;
}

// Calls
export async function getCalls(limit = 50): Promise<Call[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  // Select only needed fields for better performance
  const { data, error } = await supabase
    .from('calls')
    .select('id, vapi_call_id, recording_url, transcript, summary, sentiment, duration, type, caller_phone, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit) as { data: Call[] | null; error: unknown };

  if (error) {
    console.error('Error fetching calls:', error);
    return [];
  }
  return data || [];
}

export async function getCallById(id: string): Promise<Call | null> {
  const { data, error } = await supabase
    .from('calls')
    .select(`
      *,
      appointment:appointments(
        *,
        doctor:doctors(*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching call:', error);
    return null;
  }
  return data;
}

export async function createCall(call: Omit<Call, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Call | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('calls')
    .insert({ ...call, user_id: userId } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating call:', error);
    return null;
  }
  return data;
}

// Analytics
export async function getCallStats() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      monthlyCalls: 0,
      dailyCalls: 0,
      avgDuration: 0,
      typeDistribution: {},
    };
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Monthly calls
  const { count: monthlyCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfMonth);

  // Daily calls
  const { count: dailyCalls } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay);

  // Average duration
  const { data: durationData } = await supabase
    .from('calls')
    .select('duration')
    .eq('user_id', userId)
    .not('duration', 'is', null) as { data: { duration: number }[] | null };

  const avgDuration = durationData && durationData.length > 0
    ? durationData.reduce((sum, c) => sum + (c.duration || 0), 0) / durationData.length
    : 0;

  // Call type distribution
  const { data: typeData } = await supabase
    .from('calls')
    .select('type')
    .eq('user_id', userId) as { data: { type: string }[] | null };

  const typeDistribution = typeData?.reduce((acc, call) => {
    acc[call.type] = (acc[call.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return {
    monthlyCalls: monthlyCalls || 0,
    dailyCalls: dailyCalls || 0,
    avgDuration: Math.round(avgDuration),
    typeDistribution,
  };
}

// Get daily activity for charts
export async function getDailyActivity(days = 7) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch calls
  const { data: calls } = await supabase
    .from('calls')
    .select('created_at, type')
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true }) as { data: { created_at: string; type: string }[] | null };

  // Fetch appointments
  const { data: appointments } = await supabase
    .from('appointments')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString()) as { data: { created_at: string }[] | null };

  // Group by day
  const dailyData: Record<string, { calls: number; appointments: number }> = {};
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split('T')[0] ?? '';
    if (dateStr) {
      dailyData[dateStr] = { calls: 0, appointments: 0 };
    }
  }

  calls?.forEach(call => {
    const dateStr = call.created_at?.split('T')[0];
    if (dateStr && dailyData[dateStr]) {
      dailyData[dateStr].calls++;
    }
  });

  appointments?.forEach(apt => {
    const dateStr = apt.created_at?.split('T')[0];
    if (dateStr && dailyData[dateStr]) {
      dailyData[dateStr].appointments++;
    }
  });

  return Object.entries(dailyData).map(([date, data]) => ({
    date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
    ...data,
  }));
}

// Get recent activity
export async function getRecentActivity(limit = 10) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  // Fetch recent calls
  const { data: calls } = await supabase
    .from('calls')
    .select('id, type, summary, sentiment, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit) as { data: { id: string; type: string; summary: string | null; sentiment: string | null; created_at: string }[] | null };

  // Convert to activity format
  return (calls || []).map(call => ({
    id: call.id,
    type: call.type as 'call' | 'appointment',
    description: call.summary || `${call.type} call`,
    timestamp: call.created_at,
    sentiment: call.sentiment,
  }));
}

// User Profile
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates as never)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    return null;
  }
  return data;
}

// ===========================================
// Realtime Subscriptions
// ===========================================

export function subscribeToAppointments(
  callback: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Appointment | null;
    old: Appointment | null;
  }) => void
) {
  return supabase
    .channel('appointments-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments',
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Appointment | null,
          old: payload.old as Appointment | null,
        });
      }
    )
    .subscribe();
}

export function subscribeToCalls(
  callback: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Call | null;
    old: Call | null;
  }) => void
) {
  return supabase
    .channel('calls-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'calls',
      },
      (payload) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as Call | null,
          old: payload.old as Call | null,
        });
      }
    )
    .subscribe();
}
