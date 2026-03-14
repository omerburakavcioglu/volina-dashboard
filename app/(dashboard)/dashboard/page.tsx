"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KPICards } from "@/components/dashboard/KPICards";
import { Charts } from "@/components/dashboard/Charts";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Button } from "@/components/ui/button";
import { RefreshCw, Cloud, Database } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { getCallStats, getDailyActivity, getRecentActivity } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";

interface KPIData {
  monthlyCalls: number;
  monthlyChange: number;
  dailyCalls: number;
  dailyChange: number;
  avgDuration: number;
  durationChange: number;
  appointmentRate: number;
  appointmentRateChange: number;
}

interface CallTypeData {
  name: string;
  value: number;
  color: string;
}

interface DailyActivityData {
  date: string;
  calls: number;
  appointments: number;
}

interface ActivityItem {
  id: string;
  type: "call" | "appointment" | "inquiry" | "cancellation";
  description: string;
  timestamp: string;
  sentiment?: "positive" | "neutral" | "negative";
}

function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { t } = useTranslation("dashboard");
  
  const isMockMode = searchParams.get("mock") === "true";
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [dataSource, setDataSource] = useState<"vapi" | "supabase" | "mock" | null>(null);
  const [kpiData, setKpiData] = useState<KPIData>({
    monthlyCalls: 0,
    monthlyChange: 0,
    dailyCalls: 0,
    dailyChange: 0,
    avgDuration: 0,
    durationChange: 0,
    appointmentRate: 0,
    appointmentRateChange: 0,
  });
  const [callTypeData, setCallTypeData] = useState<CallTypeData[]>([]);
  const [dailyActivityData, setDailyActivityData] = useState<DailyActivityData[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  // Mock data
  const mockKPIData: KPIData = {
    monthlyCalls: 1247,
    monthlyChange: 12,
    dailyCalls: 42,
    dailyChange: 5,
    avgDuration: 245, // 4:05 in seconds
    durationChange: -3,
    appointmentRate: 68,
    appointmentRateChange: 2,
  };

  const mockCallTypeData: CallTypeData[] = [
    { name: "Appointments", value: 850, color: "#0055FF" },
    { name: "Inquiries", value: 320, color: "#8B5CF6" },
    { name: "Follow-ups", value: 77, color: "#F59E0B" },
  ];

  // Mock daily activity for last 7 days - varied data (not all zeros)
  const mockDailyActivityData: DailyActivityData[] = [
    { date: "Mon", calls: 38, appointments: 26 },
    { date: "Tue", calls: 45, appointments: 31 },
    { date: "Wed", calls: 42, appointments: 29 },
    { date: "Thu", calls: 51, appointments: 35 },
    { date: "Fri", calls: 47, appointments: 32 },
    { date: "Sat", calls: 25, appointments: 17 },
    { date: "Sun", calls: 19, appointments: 13 },
  ];

  const mockRecentActivity: ActivityItem[] = [
    {
      id: "1",
      type: "appointment",
      description: "New appointment scheduled with John Doe for tomorrow at 2:00 PM",
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      sentiment: "positive",
    },
    {
      id: "2",
      type: "call",
      description: "Incoming call from +1 234 567 8900 - Inquiry about services",
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      sentiment: "neutral",
    },
    {
      id: "3",
      type: "appointment",
      description: "Appointment confirmed with Sarah Smith for next week",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      sentiment: "positive",
    },
    {
      id: "4",
      type: "inquiry",
      description: "Customer inquiry about pricing and availability",
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      sentiment: "neutral",
    },
    {
      id: "5",
      type: "appointment",
      description: "Follow-up call completed - Customer interested in premium plan",
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      sentiment: "positive",
    },
  ];

  // Redirect if not authenticated (unless in mock mode)
  useEffect(() => {
    if (!isMockMode && !authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router, isMockMode]);

  // Redirect outbound users to their dashboard (unless in mock mode)
  useEffect(() => {
    if (!isMockMode && !authLoading && isAuthenticated && user?.dashboard_type === 'outbound') {
      router.push("/dashboard/outbound");
    }
  }, [authLoading, isAuthenticated, user, router, isMockMode]);

  const loadMockData = useCallback(() => {
    setDataSource("mock");
    setKpiData(mockKPIData);
    setCallTypeData(mockCallTypeData);
    setDailyActivityData(mockDailyActivityData);
    setRecentActivity(mockRecentActivity);
    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    // If in mock mode, use mock data
    if (isMockMode) {
      loadMockData();
      return;
    }
    const typeColors: Record<string, string> = {
      appointment: "#0055FF",
      inquiry: "#8B5CF6",
      follow_up: "#F59E0B",
      cancellation: "#EF4444",
    };
    
    const typeNames: Record<string, string> = {
      appointment: "Appointments",
      inquiry: "Inquiries",
      follow_up: "Follow-ups",
      cancellation: "Cancellations",
    };

    try {
      // Try to fetch from VAPI API first
      const vapiResponse = await fetch("/api/vapi/analytics?days=30");
      
      if (vapiResponse.ok) {
        const vapiData = await vapiResponse.json();
        
        if (vapiData.success) {
          setDataSource("vapi");
          
          setKpiData({
            monthlyCalls: vapiData.kpi.monthlyCalls,
            monthlyChange: 12, // TODO: Calculate from historical data
            dailyCalls: vapiData.kpi.dailyCalls,
            dailyChange: 5,
            avgDuration: vapiData.kpi.avgDuration,
            durationChange: -3,
            appointmentRate: vapiData.kpi.appointmentRate,
            appointmentRateChange: 2,
          });

          // Convert type distribution to chart format
          setCallTypeData(
            Object.entries(vapiData.typeDistribution as Record<string, number>).map(([type, value]) => ({
              name: typeNames[type] || type,
              value: value as number,
              color: typeColors[type] || "#6B7280",
            }))
          );

          // Set daily activity
          setDailyActivityData(vapiData.dailyActivity);

          // Fetch recent calls from VAPI for activity feed
          const callsResponse = await fetch("/api/vapi/calls?limit=10");
          if (callsResponse.ok) {
            const callsData = await callsResponse.json();
            if (callsData.success && callsData.data) {
              const activities = callsData.data.map((call: {
                id: string;
                type: string;
                summary: string | null;
                sentiment: string | null;
                created_at: string;
              }) => ({
                id: call.id,
                type: call.type as 'call' | 'appointment',
                description: call.summary || `${call.type} call`,
                timestamp: call.created_at,
                sentiment: call.sentiment,
              }));
              setRecentActivity(activities);
            }
          }

          setLastUpdated(new Date());
          return;
        }
      }
    } catch (error) {
      console.error("Error fetching from VAPI, falling back to Supabase:", error);
    }

    // Fallback to Supabase data
    try {
      setDataSource("supabase");
      
      // Fetch call stats
      const stats = await getCallStats();
      
      // Calculate appointment rate
      const totalCalls = Object.values(stats.typeDistribution).reduce((sum, count) => sum + count, 0);
      const appointmentCalls = stats.typeDistribution.appointment || 0;
      const appointmentRate = totalCalls > 0 ? Math.round((appointmentCalls / totalCalls) * 100) : 0;

      setKpiData({
        monthlyCalls: stats.monthlyCalls,
        monthlyChange: 12, // Would need historical data for accurate change
        dailyCalls: stats.dailyCalls,
        dailyChange: 5,
        avgDuration: stats.avgDuration,
        durationChange: -3,
        appointmentRate,
        appointmentRateChange: 2,
      });

      setCallTypeData(
        Object.entries(stats.typeDistribution).map(([type, value]) => ({
          name: typeNames[type] || type,
          value,
          color: typeColors[type] || "#6B7280",
        }))
      );

      // Fetch daily activity
      const dailyData = await getDailyActivity(7);
      setDailyActivityData(dailyData);

      // Fetch recent activity
      const activities = await getRecentActivity(10);
      setRecentActivity(activities as ActivityItem[]);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    }
  }, [isMockMode, loadMockData]);

  useEffect(() => {
    if (isMockMode) {
      loadMockData();
    } else if (isAuthenticated) {
      loadData().then(() => setIsLoading(false));
    }
  }, [isAuthenticated, isMockMode, loadData, loadMockData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (isMockMode) {
      loadMockData();
    } else {
      await loadData();
    }
    setIsRefreshing(false);
  };

  // Show loading while checking auth (unless in mock mode)
  if (!isMockMode && authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {isMockMode 
              ? t("mockPreview")
              : `${t("welcomeBack")}${user?.full_name ? `, ${user.full_name}` : ""}! ${t("subtitle")}`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataSource && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              dataSource === "vapi" 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                : dataSource === "mock"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            }`}>
              {dataSource === "vapi" ? (
                <>
                  <Cloud className="w-3 h-3" />
                  {t("liveFromVapi")}
                </>
              ) : dataSource === "mock" ? (
                <>
                  <Database className="w-3 h-3" />
                  {t("mockData")}
                </>
              ) : (
                <>
                  <Database className="w-3 h-3" />
                  {t("fromDatabase")}
                </>
              )}
            </span>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {format(lastUpdated, "h:mm a")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards data={kpiData} />

      {/* Charts */}
      <Charts 
        callTypeData={callTypeData.length > 0 ? callTypeData : [
          { name: "No Data", value: 1, color: "#E5E7EB" }
        ]} 
        dailyActivityData={dailyActivityData} 
      />

      {/* Recent Activity & Performance */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RecentActivity activities={recentActivity} />
        </div>
        
        {/* Quick Stats Card */}
        <div className="bg-gradient-to-br from-primary to-blue-700 rounded-xl p-5 text-white">
          <h3 className="text-lg font-semibold mb-4">{t("aiPerformance")}</h3>
          <div className="space-y-4">
            {[
              { label: t("callCompletionRate"), value: kpiData.monthlyCalls > 0 ? "98.5%" : "N/A" },
              { label: t("appointmentConversion"), value: `${kpiData.appointmentRate}%` },
              { label: t("customerSatisfaction"), value: kpiData.monthlyCalls > 0 ? "94%" : "N/A" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="opacity-80">{stat.label}</span>
                  <span className="font-medium">{stat.value}</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white rounded-full transition-all duration-500" 
                    style={{ width: stat.value === "N/A" ? "0%" : stat.value }} 
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-white/20">
            <p className="text-sm opacity-80">
              {kpiData.monthlyCalls > 0 ? (
                <>{t("aboveAverage")}</>
              ) : (
                <>{t("startMakingCalls")}</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPageContent() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <DashboardPage />
    </Suspense>
  );
}

export default DashboardPageContent;
