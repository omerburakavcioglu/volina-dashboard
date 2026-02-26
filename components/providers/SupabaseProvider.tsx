"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

// Generate slug from email
function generateSlugFromEmail(email: string): string {
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

interface AuthContextType {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Fetch user profile from profiles table via API (uses service role key for reliability)
  const fetchProfile = useCallback(async (authUser: User) => {
    console.log("[Auth] fetchProfile called for:", authUser.id);
    const email = authUser.email || "";
    const generatedSlug = generateSlugFromEmail(email);
    
    // Create a basic profile from auth user data (fallback)
    const basicProfile: Profile = {
      id: authUser.id,
      email: email,
      full_name: authUser.user_metadata?.full_name || email.split("@")[0] || "User",
      avatar_url: authUser.user_metadata?.avatar_url || null,
      role: "user",
      slug: generatedSlug,
      created_at: authUser.created_at,
      updated_at: authUser.updated_at || authUser.created_at,
    };
    
    try {
      console.log("[Auth] Fetching profile via API...");
      
      // Use server-side API to fetch profile (bypasses RLS, uses service role key)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`/api/dashboard/profile?userId=${authUser.id}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const result = await response.json();
      console.log("[Auth] Profile API result:", { success: result.success, hasData: !!result.data });
      
      if (!result.success || !result.data) {
        console.log("[Auth] Using basic profile from auth data");
        setUser(basicProfile);
        return;
      }

      // Cast to Profile type
      const profile = result.data as Profile;
      
      // If profile exists but has no slug, use the generated one
      if (!profile.slug) {
        profile.slug = generatedSlug;
      }

      console.log("[Auth] Profile loaded:", profile.email, profile.slug, "role:", profile.role);
      setUser(profile);
    } catch (error) {
      console.error("[Auth] Error in fetchProfile:", error);
      
      // Fallback: try direct supabase query
      try {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single();
        
        if (data) {
          const profile = data as Profile;
          if (!profile.slug) profile.slug = generatedSlug;
          console.log("[Auth] Profile loaded via fallback:", profile.email, profile.role);
          setUser(profile);
          return;
        }
      } catch {
        // ignore fallback error
      }
      
      // Use basic profile on error
      setUser(basicProfile);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      console.log("[Auth] Starting auth initialization...");
      try {
        // First, check if there's a session in localStorage
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'ydgsarbkvtyjevyzyuzq';
        const storageKey = `sb-${projectRef}-auth-token`;
        const storedSession = localStorage.getItem(storageKey);
        
        console.log("[Auth] Storage key:", storageKey, "Has stored session:", !!storedSession);
        
        if (storedSession) {
          try {
            const parsedSession = JSON.parse(storedSession);
            console.log("[Auth] Parsed session has access_token:", !!parsedSession.access_token);
            
            // Check if token is expired
            const expiresAt = parsedSession.expires_at;
            const now = Math.floor(Date.now() / 1000);
            const isExpired = expiresAt && now >= expiresAt;
            console.log("[Auth] Token expired:", isExpired, "expiresAt:", expiresAt, "now:", now);
            
            if (parsedSession.access_token && !isExpired && parsedSession.user) {
              console.log("[Auth] Using stored session directly...");
              
              // Use the stored session directly without calling Supabase API
              // This avoids network issues with supabase.auth.setSession()
              const reconstructedSession = {
                access_token: parsedSession.access_token,
                refresh_token: parsedSession.refresh_token,
                expires_at: parsedSession.expires_at,
                expires_in: parsedSession.expires_in,
                token_type: parsedSession.token_type || 'bearer',
                user: parsedSession.user,
              };
              
              setSession(reconstructedSession as any);
              
              // Create a user object from the stored data
              const authUser = {
                id: parsedSession.user.id,
                email: parsedSession.user.email,
                created_at: parsedSession.user.created_at,
                updated_at: parsedSession.user.updated_at,
                user_metadata: parsedSession.user.user_metadata || {},
              };
              
              console.log("[Auth] Fetching profile for user:", authUser.id);
              await fetchProfile(authUser as any);
              setIsLoading(false);
              console.log("[Auth] Initialization complete via localStorage session");
              return;
            }
          } catch (e) {
            console.error("[Auth] Error parsing stored session:", e);
          }
        }
        
        // Fallback: try getSession (may be slow or hang)
        console.log("[Auth] No valid localStorage session, trying getSession...");
        const timeoutPromise = new Promise<{ data: { session: null }, error: Error }>((resolve) => {
          setTimeout(() => {
            console.log("[Auth] getSession timed out after 3s");
            resolve({ data: { session: null }, error: new Error('Timeout') });
          }, 3000);
        });
        
        const { data: { session: initialSession }, error } = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise
        ]);
        
        console.log("[Auth] getSession result:", { 
          hasSession: !!initialSession, 
          hasUser: !!initialSession?.user,
          error: error?.message 
        });
        
        if (!mounted) return;
        
        if (initialSession?.user) {
          setSession(initialSession);
          await fetchProfile(initialSession.user);
        } else {
          setUser(null);
        }
        
        setIsLoading(false);
        console.log("[Auth] Initialization complete");
      } catch (error) {
        console.error("[Auth] Error initializing auth:", error);
        if (mounted) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        
        setSession(currentSession);
        
        if (event === "SIGNED_IN" && currentSession?.user) {
          await fetchProfile(currentSession.user);
          setIsLoading(false);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setSession(null);
          setIsLoading(false);
        } else if (event === "USER_UPDATED" && currentSession?.user) {
          await fetchProfile(currentSession.user);
          setIsLoading(false);
        } else if (event === "TOKEN_REFRESHED" && currentSession?.user) {
          // Session token was refreshed, profile should still be valid
          if (!user) {
            await fetchProfile(currentSession.user);
          }
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Handle visibility change - refresh session when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && session) {
        // Tab became visible, check if session is still valid
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (error || !currentSession) {
          // Session expired, clear state
          setUser(null);
          setSession(null);
        } else if (currentSession.user && !user) {
          // Session valid but user not loaded
          await fetchProfile(currentSession.user);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session, user, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Auth timeout - Supabase is not responding')), 15000);
      });
      
      const authPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      const { data, error } = await Promise.race([authPromise, timeoutPromise]);

      if (!error && data.user) {
        setSession(data.session);
        fetchProfile(data.user).then(() => setIsLoading(false));
        return { error: null };
      }
      
      setIsLoading(false);
      return { error };
    } catch (err: any) {
      setIsLoading(false);
      return { error: { message: err?.message || 'Network error - please check your connection' } as any };
    }
  };

  const signOut = async () => {
    try {
      setIsLoading(true);
      
      // Clear session from state
      setUser(null);
      setSession(null);
      
      // Clear localStorage (Supabase stores session there)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'ydgsarbkvtyjevyzyuzq';
        const storageKey = `sb-${projectRef}-auth-token`;
        localStorage.removeItem(storageKey);
      }
      
      // Clear any other auth-related storage
      sessionStorage.clear();
      
      // Try server-side signout (non-blocking)
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      
      // Force redirect to login
      window.location.href = '/login';
    } catch (error) {
      console.error("Error signing out:", error);
      // Force redirect even on error
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!session && !!user,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error("useAuth must be used within a SupabaseProvider");
  }
  
  return context;
}
