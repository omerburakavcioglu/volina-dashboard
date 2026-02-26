"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Lock, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type PageState = "loading" | "invalid" | "ready";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      const hasHash = typeof window !== "undefined" && window.location.hash.length > 0;
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session || hasHash) setState("ready");
      else setState("invalid");
    }
    checkSession();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); setIsSubmitting(false); return; }
      await supabase.auth.signOut();
      router.replace("/login?message=PasswordUpdated");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="min-h-screen flex">
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 xl:px-24 bg-white dark:bg-gray-900">
          <div className="max-w-md w-full mx-auto">
            <Link href="/" className="flex items-center gap-2 mb-10">
              <Image src="/VolinaLogo.png" alt="Volina Logo" width={40} height={40} className="rounded-lg" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">Volina</span>
            </Link>
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">This link is invalid or has expired. Please request a new password reset.</p>
            </div>
            <Link href="/forgot-password" className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">Request new reset link</Link>
            <div className="mt-8">
              <Link href="/login" className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors">&larr; Back to login</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 xl:px-24 bg-white dark:bg-gray-900">
        <div className="max-w-md w-full mx-auto">
          <Link href="/" className="flex items-center gap-2 mb-10">
            <Image src="/VolinaLogo.png" alt="Volina Logo" width={40} height={40} className="rounded-lg" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">Volina</span>
          </Link>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Set new password</h1>
            <p className="text-gray-600 dark:text-gray-400">Enter your new password below.</p>
          </div>
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700 dark:text-gray-300">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} disabled={isSubmitting} className="pl-10 pr-10 h-12 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary/20" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-700 dark:text-gray-300">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input id="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} disabled={isSubmitting} className="pl-10 h-12 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full h-12 text-base font-semibold">
              {isSubmitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Updating...</> : "Update password"}
            </Button>
          </form>
          <div className="mt-8 text-center">
            <Link href="/login" className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors">&larr; Back to login</Link>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary via-blue-600 to-blue-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="max-w-lg">
            <h2 className="text-4xl font-bold text-white mb-6">AI-Powered Voice Agents for Your Business</h2>
            <p className="text-xl text-blue-100 mb-8">Automate your customer calls, schedule appointments, and manage inquiries with our intelligent voice assistant.</p>
          </div>
        </div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/5 rounded-full" />
      </div>
    </div>
  );
}
