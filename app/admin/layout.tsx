"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { Loader2 } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, session } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const timer = setTimeout(() => {
      if (!session || !isAuthenticated) {
        if (!hasRedirected.current) {
          hasRedirected.current = true;
          router.replace("/login");
        }
        return;
      }
      if (user && user.role !== "admin") {
        if (!hasRedirected.current) {
          hasRedirected.current = true;
          router.replace(user.slug ? `/${user.slug}` : "/login");
        }
        return;
      }
      setChecked(true);
    }, 400);

    return () => clearTimeout(timer);
  }, [isLoading, session, isAuthenticated, user, router]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {children}
    </div>
  );
}
