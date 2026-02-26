"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "./SupabaseProvider";
import type { Profile } from "@/lib/types";

interface TenantContextType {
  tenant: string | null;
  tenantProfile: Profile | null;
  isOwner: boolean;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { user, session, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [tenantProfile, setTenantProfile] = useState<Profile | null>(null);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  
  const tenant = params?.tenant as string | undefined;
  
  // Check if current user owns this tenant
  const isOwner = user?.slug === tenant;
  
  useEffect(() => {
    // Wait for auth to fully load before making any redirect decisions
    if (authLoading) return;
    
    // Give a small delay to ensure session is properly set
    const timer = setTimeout(() => {
      setHasCheckedAuth(true);
      
      // Check session directly - more reliable than isAuthenticated
      if (session) {
        // Admin users should always go to /admin, not tenant dashboard
        if (user && user.role === "admin") {
          router.push("/admin");
          return;
        }
        // User is authenticated
        if (user && tenant && user.slug !== tenant) {
          // Wrong tenant, redirect to their own
          router.push(`/${user.slug}`);
        } else if (user) {
          setTenantProfile(user);
        }
      } else {
        // No session - redirect to login
        router.push("/login");
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [authLoading, session, user, tenant, router]);

  return (
    <TenantContext.Provider
      value={{
        tenant: tenant || null,
        tenantProfile: tenantProfile || user,
        isOwner,
        isLoading: authLoading || !hasCheckedAuth,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  
  return context;
}
