"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTenant } from "@/components/providers/TenantProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Phone,
  Users,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  Target,
  Globe,
} from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLanguage, useTranslation } from "@/lib/i18n";

export function TenantSidebar() {
  const pathname = usePathname();
  const { tenant, tenantProfile } = useTenant();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation("sidebar");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const effectiveTenant = tenant || "dashboard";
  const dashboardType = tenantProfile?.dashboard_type || user?.dashboard_type || 'outbound';

  // Navigation items - clean and minimal with translations
  const navItems = [
    { href: `/${effectiveTenant}`, icon: LayoutDashboard, label: t("dashboard") },
    { href: `/${effectiveTenant}/leads`, icon: Users, label: t("leads") },
    { href: `/${effectiveTenant}/calls`, icon: Phone, label: t("calls") },
    { href: `/${effectiveTenant}/campaigns`, icon: Target, label: t("campaigns") },
  ];

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "tr" : "en");
  };

  const handleLogout = async () => {
    await signOut();
  };

  const isActive = (href: string) => {
    if (href === `/${effectiveTenant}`) {
      return pathname === `/${effectiveTenant}`;
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {mobileOpen ? (
            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          )}
        </button>
        <Link href={`/${effectiveTenant}`} className="flex items-center gap-2">
          <Image
            src="/VolinaLogo.png"
            alt="Volina"
            width={28}
            height={28}
            className="w-7 h-7"
          />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Volina<span className="text-blue-600 dark:text-blue-400">AI</span>
          </span>
        </Link>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100 dark:border-gray-800">
          <Link href={`/${effectiveTenant}`} className="flex items-center gap-3">
            <Image
              src="/VolinaLogo.png"
              alt="Volina"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <span className="text-xl font-semibold text-gray-900 dark:text-white">
              Volina<span className="text-blue-600 dark:text-blue-400">AI</span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User & Actions */}
        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Globe className="w-5 h-5" />
            <span>{language === "en" ? "🇹🇷 Türkçe" : "🇬🇧 English"}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-5 h-5" />
                <span>{t("lightMode")}</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5" />
                <span>{t("darkMode")}</span>
              </>
            )}
          </button>

          {user && (
            <div className="px-4 py-3 mb-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.full_name || "User"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
          )}
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>{t("signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
