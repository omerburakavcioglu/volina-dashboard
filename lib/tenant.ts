import { supabase } from './supabase';
import type { Profile } from './types';

// Get profile by slug
export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching profile by slug:', error);
    return null;
  }

  return data as Profile;
}

// Generate slug from email
export function generateSlugFromEmail(email: string): string {
  // Extract domain or username from email
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const domain = email.substring(atIndex + 1).split('.')[0];
  const username = email.substring(0, atIndex);
  
  // For business emails, use domain (e.g., info@smileandholiday.com → smileandholiday)
  // For personal emails (gmail, hotmail, etc.), use username
  const personalDomains = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'mail', 'protonmail'];
  
  if (personalDomains.includes(domain?.toLowerCase() || '')) {
    return username.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  
  return (domain || username).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Check if slug is available
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error && error.code === 'PGRST116') {
    // No rows returned = slug is available
    return true;
  }

  return false;
}

// Update user's slug
export async function updateUserSlug(userId: string, slug: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ slug } as never)
    .eq('id', userId);

  if (error) {
    console.error('Error updating slug:', error);
    return false;
  }

  return true;
}

// Validate tenant access - check if current user owns the tenant
export async function validateTenantAccess(tenantSlug: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('slug', tenantSlug)
    .eq('id', userId)
    .single();

  if (error || !data) {
    return false;
  }

  return true;
}

// Get dashboard URL for user
export function getDashboardUrl(profile: Profile): string {
  if (!profile.slug) {
    // Fallback to old route if no slug
    return profile.dashboard_type === 'outbound' 
      ? '/dashboard/outbound' 
      : '/dashboard';
  }
  
  return `/${profile.slug}`;
}
