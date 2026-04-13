"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function LoginContent() {
  const searchParams = useSearchParams();
  const { signIn, isAuthenticated, isLoading: authLoading, user } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Check for success messages (e.g. password updated)
  useEffect(() => {
    const msg = searchParams.get("message");
    if (msg === "PasswordUpdated") {
      setError(null);
    }
  }, [searchParams]);

  // Check for OAuth errors in URL
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        OAuthCallback: "Google Calendar bağlantısı başarısız oldu. Lütfen Google Cloud Console'da test kullanıcısı olarak eklendiğinizden emin olun.",
        OAuthAccountNotLinked: "Bu email adresi başka bir hesapla ilişkilendirilmiş.",
        OAuthSignin: "Google ile giriş başarısız oldu.",
        OAuthCreateAccount: "Hesap oluşturulamadı.",
        Callback: "Callback hatası oluştu.",
      };
      const errorMessage = errorMessages[errorParam] || "Bir hata oluştu. Lütfen tekrar deneyin.";
      setError(errorMessage);
    }
  }, [searchParams]);

  // Redirect if already authenticated (e.g., returning to login page while logged in)
  useEffect(() => {
    if (isAuthenticated && user && !isRedirecting) {
      setIsRedirecting(true);
      // Admin users go to /admin, regular users go to their tenant slug
      const targetUrl = user.role === "admin" ? "/admin" : (user.slug ? `/${user.slug}` : "/dashboard");
      window.location.href = targetUrl;
    }
  }, [isAuthenticated, user, isRedirecting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Use server-side auth API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const result = await response.json();
      
      if (!response.ok || result.error) {
        setError(result.error || "Invalid email or password");
        setIsLoading(false);
        return;
      }

      // Store session in localStorage - use the actual Supabase URL to generate the key
      if (result.session) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'ydgsarbkvtyjevyzyuzq';
        const storageKey = `sb-${projectRef}-auth-token`;
        localStorage.setItem(storageKey, JSON.stringify(result.session));
      }
      
      // Sign-in successful - redirect based on role
      if (result.user.role === "admin") {
        window.location.href = "/admin";
        return;
      }

      // Regular user - use slug from profile, or generate from email
      const slug = result.user.slug || (() => {
        const atIndex = email.indexOf('@');
        const domain = email.substring(atIndex + 1).split('.')[0];
        const username = email.substring(0, atIndex);
        const personalDomains = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'mail', 'protonmail'];
        return personalDomains.includes(domain?.toLowerCase() || '') 
          ? username.toLowerCase().replace(/[^a-z0-9]/g, '')
          : (domain || username).toLowerCase().replace(/[^a-z0-9]/g, '');
      })();
      
      window.location.href = `/${slug}`;
      
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  // Show redirecting state if authenticated
  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #ede9fe 100%)" }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-600">Panele yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  // Always show the form immediately - no waiting
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #ede9fe 100%)" }}>
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl px-8 py-10">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <Image
            src="/VolinaLogoFull.png"
            alt="Volina AI"
            width={200}
            height={60}
            className="object-contain"
          />
        </div>

        {/* Welcome text */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Tekrar hoş geldiniz
          </h1>
          <p className="text-sm text-gray-500">
            AI sesli asistan panelinize giriş yapın.
          </p>
        </div>

        {/* Password updated success message */}
        {searchParams.get("message") === "PasswordUpdated" && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-700">Şifreniz güncellendi. Lütfen yeni şifrenizle giriş yapın.</p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">
              E-posta adresi
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@volina.ai"
              required
              disabled={isLoading}
              className="h-11 bg-gray-50 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              Şifre
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="h-11 pr-10 bg-gray-50 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Remember me + Forgot password row */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Beni hatırla</span>
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Şifremi unuttum?
            </Link>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Giriş yapılıyor...
              </>
            ) : (
              "Giriş yap"
            )}
          </Button>
        </form>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <a
            href="https://volina.ai"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Ana sayfaya dön
          </a>
        </div>
      </div>

      {/* Support footer */}
      <p className="mt-8 text-sm text-gray-500">
        Destek: <a href="mailto:info@volina.ai" className="text-gray-600 hover:text-gray-800">info@volina.ai</a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #ede9fe 100%)" }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
