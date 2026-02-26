"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { 
  LayoutDashboard, 
  Phone, 
  Calendar, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  Moon,
  Sun,
  Loader2,
  Users,
  PhoneOutgoing,
  MessageSquare,
  BarChart3,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useMemo } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";

// Inbound dashboard navigation (existing)
const inboundNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Call Logs",
    href: "/dashboard/calls",
    icon: Phone,
  },
  {
    label: "Calendar CRM",
    href: "/dashboard/calendar",
    icon: Calendar,
  },
];

// Outbound dashboard navigation (new - for Smile and Holiday)
const outboundNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard/outbound",
    icon: LayoutDashboard,
  },
  {
    label: "Leads",
    href: "/dashboard/outbound/leads",
    icon: Users,
  },
  {
    label: "Calls",
    href: "/dashboard/outbound/calls",
    icon: PhoneOutgoing,
  },
  {
    label: "Messages",
    href: "/dashboard/outbound/messages",
    icon: MessageSquare,
  },
  {
    label: "Analytics",
    href: "/dashboard/outbound/analytics",
    icon: BarChart3,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  
  // Determine if we're in outbound dashboard based on path or user preference
  const isOutbound = useMemo(() => {
    return pathname.includes('/outbound');
  }, [pathname]);
  
  const navItems = isOutbound ? outboundNavItems : inboundNavItems;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user?.full_name) return "U";
    const names = user.full_name.split(" ");
    if (names.length >= 2 && names[0] && names[1]) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return names[0]?.[0]?.toUpperCase() || "U";
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-screen bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 flex flex-col transition-all duration-300 z-40",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-gray-100 dark:border-gray-700 px-4",
        isCollapsed ? "justify-center" : "gap-2"
      )}>
        <Image
          src="/VolinaLogo.png"
          alt="Volina AI Logo"
          width={40}
          height={40}
          className="h-10 w-auto flex-shrink-0"
          priority
        />
        {!isCollapsed && (
          <span className="font-semibold text-gray-900 dark:text-white text-lg tracking-tight">
            Volina<span className="text-primary">AI</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-primary text-white shadow-lg shadow-primary/25" 
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white",
                    isCollapsed && "justify-center px-3"
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={cn("w-5 h-5 flex-shrink-0", isCollapsed && "w-6 h-6")} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Settings link */}
        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-700 space-y-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-all duration-200",
              isCollapsed && "justify-center px-3"
            )}
            title={isCollapsed ? (theme === "light" ? "Dark mode" : "Light mode") : undefined}
          >
            {theme === "light" ? (
              <Moon className={cn("w-5 h-5 flex-shrink-0", isCollapsed && "w-6 h-6")} />
            ) : (
              <Sun className={cn("w-5 h-5 flex-shrink-0", isCollapsed && "w-6 h-6")} />
            )}
            {!isCollapsed && <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>}
          </button>

          <Link
            href="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-all duration-200",
              pathname === "/dashboard/settings" && "bg-primary text-white shadow-lg shadow-primary/25",
              isCollapsed && "justify-center px-3"
            )}
            title={isCollapsed ? "Settings" : undefined}
          >
            <Settings className={cn("w-5 h-5 flex-shrink-0", isCollapsed && "w-6 h-6")} />
            {!isCollapsed && <span>Settings</span>}
          </Link>
        </div>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700">
        <div className={cn(
          "flex items-center gap-3",
          isCollapsed && "justify-center"
        )}>
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.full_name || "User"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user?.email || ""}
              </p>
            </div>
          )}
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
              title="Sign out"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="w-full mt-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
            title="Sign out"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
          </Button>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        )}
      </button>
    </aside>
  );
}
