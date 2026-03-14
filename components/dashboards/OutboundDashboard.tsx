"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Phone, 
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  Clock,
  Target,
  Users,
  Calendar,
  Megaphone,
  PhoneCall,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/providers/SupabaseProvider";
import type { Call } from "@/lib/types";
import { computeCallScore } from "@/lib/dashboard/call-scoring";
import { format, subDays, isAfter, startOfMonth, endOfMonth, subMonths, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

// Dashboard translations
const dashboardTexts = {
  dashboard: { en: "Dashboard", tr: "Panel" },
  welcome: { en: "Welcome", tr: "Hoş geldin" },
  aiSummary: { en: "Here's your AI summary.", tr: "İşte yapay zeka özetin." },
  refresh: { en: "Refresh", tr: "Yenile" },
  last7Days: { en: "Last 7 Days", tr: "Son 7 Gün" },
  thisMonth: { en: "This Month", tr: "Bu Ay" },
  lastMonth: { en: "Last Month", tr: "Son Ay" },
  monthlyCalls: { en: "Monthly Calls", tr: "Aylık Aramalar" },
  dailyCalls: { en: "Daily Calls", tr: "Günlük Aramalar" },
  avgDuration: { en: "Avg Duration", tr: "Ort. Süre" },
  conversionRate: { en: "Conversion Rate", tr: "Dönüşüm Oranı" },
  overview: { en: "Overview", tr: "Genel Bakış" },
  calls: { en: "Calls", tr: "Aramalar" },
  conversion: { en: "Conversion", tr: "Dönüşüm" },
  leadPipeline: { en: "Lead Pipeline", tr: "Müşteri Akışı" },
  total: { en: "total", tr: "toplam" },
  new: { en: "New", tr: "Yeni" },
  contacted: { en: "Contacted", tr: "İletişime Geçildi" },
  interested: { en: "Interested", tr: "İlgili" },
  appointment: { en: "Appointment", tr: "Randevu" },
  converted: { en: "Converted", tr: "Dönüştürüldü" },
  unreachable: { en: "Unreachable", tr: "Ulaşılamadı" },
  lost: { en: "Lost", tr: "Kayıp" },
  monthlyTarget: { en: "Monthly Target", tr: "Aylık Hedef" },
  edit: { en: "Edit", tr: "Düzenle" },
  save: { en: "Save", tr: "Kaydet" },
  ofTarget: { en: "of target", tr: "hedefin" },
  remaining: { en: "remaining", tr: "kalan" },
  targetReached: { en: "Target reached!", tr: "Hedefe ulaşıldı!" },
  campaignStatus: { en: "Campaign Status", tr: "Kampanya Durumu" },
  active: { en: "Active", tr: "Aktif" },
  messages: { en: "Messages", tr: "Mesajlar" },
  todayActions: { en: "Today's Actions", tr: "Bugünkü Aksiyonlar" },
  leads: { en: "lead(s)", tr: "müşteri adayı" },
  callDistribution: { en: "Call Distribution", tr: "Arama Dağılımı" },
  information: { en: "Information", tr: "Bilgi" },
  followUp: { en: "Follow-up", tr: "Takip" },
  cancellation: { en: "Cancellation", tr: "İptal" },
  weeklyActivity: { en: "Weekly Activity", tr: "Haftalık Aktivite" },
  appointments: { en: "Appointments", tr: "Randevular" },
  importantRecentLeads: { en: "Important Recent Leads", tr: "Önemli Son Müşteriler" },
  score6Plus: { en: "Score 6+ (last 7 days)", tr: "Puan 6+ (son 7 gün)" },
  noHighScoreLeads: { en: "No high-scoring leads in the last 7 days", tr: "Son 7 günde yüksek puanlı müşteri yok" },
};

// KPI Card Component (with trend) - Mobile Responsive
function KPICard({ 
  label, 
  value, 
  trend,
  trendValue,
  icon: Icon
}: { 
  label: string; 
  value: string | number;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        {Icon && <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500" />}
        {trend && trendValue && (
          <div className={cn(
            "flex items-center text-xs sm:text-sm font-medium",
            trend === "up" && "text-green-600 dark:text-green-400",
            trend === "down" && "text-orange-600 dark:text-orange-400",
            trend === "neutral" && "text-gray-500 dark:text-gray-400"
          )}>
            {trend === "up" && <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5" />}
            {trend === "down" && <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5" />}
            {trendValue}
          </div>
        )}
      </div>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium mb-0.5 sm:mb-1">{label}</p>
      <p className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function OutboundDashboardContent() {
  const searchParams = useSearchParams();
  const isMockMode = searchParams.get("mock") === "true";
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const t = (key: keyof typeof dashboardTexts) => dashboardTexts[key][language];
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number; total: number } | null>(null);
  
  // KPI Data
  const [monthlyCalls, setMonthlyCalls] = useState<number>(0);
  const [monthlyCallsTrend, setMonthlyCallsTrend] = useState<{ value: number; type: "up" | "down" }>({ value: 0, type: "up" });
  const [dailyCalls, setDailyCalls] = useState<number>(0);
  const [dailyCallsTrend, setDailyCallsTrend] = useState<{ value: number; type: "up" | "down" }>({ value: 0, type: "up" });
  const [avgDuration, setAvgDuration] = useState<number>(0);
  const [avgDurationTrend, setAvgDurationTrend] = useState<{ value: number; type: "up" | "down" }>({ value: 0, type: "up" });
  const [conversionRate, setConversionRate] = useState<number>(0);
  const [conversionRateTrend, setConversionRateTrend] = useState<{ value: number; type: "up" | "down" }>({ value: 0, type: "up" });
  
  // Call Distribution (Donut chart data) - Only for answered calls (F and V excluded)
  const [callDistribution, setCallDistribution] = useState<{
    low: number;      // 1-3 score
    medium: number;  // 4-6 score
    high: number;    // 7-10 score
  }>({
    low: 0,
    medium: 0,
    high: 0,
  });
  
  // Weekly Activity (Bar chart data)
  const [weeklyActivity, setWeeklyActivity] = useState<{
    date: string;
    calls: number;
    appointments: number;
  }[]>([]);

  // Important recent leads (6+ score in last 7 days, via computeCallScore)
  const [importantLeads, setImportantLeads] = useState<{
    id: string;
    name: string;
    phone: string;
    score: number;
    date: string;
    summary: string;
  }[]>([]);

  // Date range filter
  const [dateRange, setDateRange] = useState<"7days" | "this_month" | "last_month">("7days");

  // Monthly target
  const [monthlyTarget, setMonthlyTarget] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard_monthly_target");
      return saved ? parseInt(saved) : 100;
    }
    return 100;
  });
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");

  // Lead pipeline counts
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({
    new: 0,
    contacted: 0,
    interested: 0,
    appointment_set: 0,
    converted: 0,
    unreachable: 0,
    lost: 0,
  });

  // Today's actions
  const [todayActions, setTodayActions] = useState<{
    id: string;
    name: string;
    phone: string;
    status: string;
    nextContactDate?: string;
  }[]>([]);

  // Campaign status
  const [campaignSummary, setCampaignSummary] = useState<{
    active: number;
    totalCalls: number;
    totalMessages: number;
  }>({ active: 0, totalCalls: 0, totalMessages: 0 });

  // All calls stored for date range filtering
  const [allCalls, setAllCalls] = useState<Call[]>([]);

  // Mock data for mock mode
  const loadMockData = useCallback(() => {
    setIsLoading(true);
    try {
      // Mock KPI data
      setMonthlyCalls(1247);
      setMonthlyCallsTrend({ value: 12, type: "up" });
      setDailyCalls(42);
      setDailyCallsTrend({ value: 5, type: "up" });
      setAvgDuration(245);
      setAvgDurationTrend({ value: 3, type: "up" });
      setConversionRate(68);
      setConversionRateTrend({ value: 2, type: "up" });
      
      // Mock call distribution
      setCallDistribution({ low: 120, medium: 320, high: 450 });
      
      // Mock weekly activity - Last 7 days with varied data (not all zeros)
      setWeeklyActivity([
        { date: "MON", calls: 38, appointments: 26 },
        { date: "TUE", calls: 45, appointments: 31 },
        { date: "WED", calls: 42, appointments: 29 },
        { date: "THU", calls: 51, appointments: 35 },
        { date: "FRI", calls: 47, appointments: 32 },
        { date: "SAT", calls: 25, appointments: 17 },
        { date: "SUN", calls: 19, appointments: 13 },
      ]);
      
      // Mock important leads
      setImportantLeads([
        { id: "1", name: "John Doe", phone: "+1 234 567 8900", score: 9, date: new Date().toISOString(), summary: "Very interested in premium plan" },
        { id: "2", name: "Jane Smith", phone: "+1 234 567 8901", score: 8, date: new Date().toISOString(), summary: "Interested in services" },
        { id: "3", name: "Bob Johnson", phone: "+1 234 567 8902", score: 7, date: new Date().toISOString(), summary: "Follow-up needed" },
      ]);
      
      // Mock pipeline counts
      setPipelineCounts({
        new: 45,
        contacted: 120,
        interested: 85,
        appointment_set: 65,
        converted: 42,
        unreachable: 28,
        lost: 15,
      });
      
      // Mock today's actions
      setTodayActions([
        { id: "1", name: "John Doe", phone: "+1 234 567 8900", status: "interested", nextContactDate: new Date().toISOString() },
        { id: "2", name: "Jane Smith", phone: "+1 234 567 8901", status: "appointment_set", nextContactDate: new Date().toISOString() },
      ]);
      
      // Mock campaign summary
      setCampaignSummary({
        active: 2,
        totalCalls: 1247,
        totalMessages: 856,
      });
      
      // Mock calls for date range filtering (Last 7 Days Overview)
      const mockCallsForFiltering: Call[] = [];
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        // Add multiple calls per day with varied data
        const callsPerDay = i === 0 ? 8 : i === 1 ? 10 : i === 2 ? 9 : i === 3 ? 12 : i === 4 ? 11 : i === 5 ? 6 : 5;
        for (let j = 0; j < callsPerDay; j++) {
          const callDate = new Date(date);
          callDate.setHours(9 + j * 2, Math.floor(Math.random() * 60), 0);
          mockCallsForFiltering.push({
            id: `mock-call-${i}-${j}`,
            user_id: "mock-user",
            vapi_call_id: `mock-vapi-${i}-${j}`,
            appointment_id: null,
            recording_url: null,
            transcript: `AI: Hello, this is Volina AI. User: Hi, I'm interested. AI: Great! User: Tell me more.`,
            summary: `Mock call ${j + 1} on day ${i + 1}`,
            sentiment: j % 3 === 0 ? "positive" : j % 3 === 1 ? "neutral" : "positive",
            duration: 180 + Math.floor(Math.random() * 120),
            type: j % 3 === 0 ? "appointment" : "inquiry",
            caller_phone: `+123456789${i}${j}`,
            caller_name: `Mock User ${i}-${j}`,
            evaluation_summary: "Interested",
            evaluation_score: j % 3 === 0 ? 8 : j % 3 === 1 ? 6 : 7,
            tags: [],
            metadata: { endedReason: "completed" },
            created_at: callDate.toISOString(),
            updated_at: callDate.toISOString(),
          });
        }
      }
      setAllCalls(mockCallsForFiltering);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (isMockMode) {
      loadMockData();
      return;
    }
    
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch calls, leads, and campaigns in parallel
      const [callsResponse, leadsResponse, campaignsResponse] = await Promise.all([
        fetch(`/api/dashboard/calls?days=365&userId=${user.id}`),
        fetch(`/api/dashboard/leads?userId=${user.id}&page=1&pageSize=1000`),
        fetch(`/api/campaigns/auto-call?userId=${user.id}`).catch(() => null),
      ]);

      let callsData: any = null;
      let calls: Call[] = [];
      
      if (callsResponse.ok) {
        callsData = await callsResponse.json();
        if (callsData.success && callsData.data) {
          calls = callsData.data.map((call: any) => ({
            id: call.id,
            user_id: call.user_id || "",
            vapi_call_id: call.vapi_call_id,
            appointment_id: call.appointment_id || null,
            recording_url: call.recording_url,
            transcript: call.transcript,
            summary: call.summary,
            sentiment: call.sentiment as Call["sentiment"],
            duration: call.duration,
            type: call.type as Call["type"],
            caller_phone: call.caller_phone,
            caller_name: call.caller_name,
            evaluation_summary: call.evaluation_summary,
            evaluation_score: call.evaluation_score,
            metadata: call.metadata || {},
            created_at: call.created_at,
            updated_at: call.updated_at,
          }));
          
          setAllCalls(calls);
          
          const now = new Date();
          const monthStart = startOfMonth(now);
          const todayStart = startOfDay(now);
          const lastMonthStart = startOfMonth(subMonths(now, 1));
          const lastMonthEnd = endOfMonth(subMonths(now, 1));
          const yesterday = new Date(todayStart);
          yesterday.setDate(yesterday.getDate() - 1);
          
          // Monthly Calls & Trend
          const monthlyCallsCount = calls.filter(c => new Date(c.created_at) >= monthStart).length;
          const lastMonthCalls = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= lastMonthStart && callDate <= lastMonthEnd;
          }).length;
          const monthlyChange = lastMonthCalls > 0 
            ? Math.round(((monthlyCallsCount - lastMonthCalls) / lastMonthCalls) * 100)
            : 0;
          setMonthlyCalls(monthlyCallsCount);
          setMonthlyCallsTrend({ 
            value: Math.abs(monthlyChange), 
            type: monthlyChange >= 0 ? "up" : "down" 
          });
          
          // Daily Calls & Trend
          const dailyCallsCount = calls.filter(c => new Date(c.created_at) >= todayStart).length;
          const yesterdayCalls = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= yesterday && callDate < todayStart;
          }).length;
          const dailyChange = yesterdayCalls > 0
            ? Math.round(((dailyCallsCount - yesterdayCalls) / yesterdayCalls) * 100)
            : (dailyCallsCount > 0 ? 100 : 0);
          setDailyCalls(dailyCallsCount);
          setDailyCallsTrend({ 
            value: Math.abs(dailyChange), 
            type: dailyChange >= 0 ? "up" : "down" 
          });
          
          // Avg Duration & Trend
          const callsWithDuration = calls.filter(c => c.duration && c.duration > 0);
          const avgDurationSeconds = callsWithDuration.length > 0
            ? Math.round(callsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / callsWithDuration.length)
            : 0;
          setAvgDuration(avgDurationSeconds);
          
          const thisMonthCallsWithDuration = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= monthStart && c.duration && c.duration > 0;
          });
          const lastMonthCallsWithDuration = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= lastMonthStart && callDate <= lastMonthEnd && c.duration && c.duration > 0;
          });
          
          const thisMonthAvg = thisMonthCallsWithDuration.length > 0
            ? thisMonthCallsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / thisMonthCallsWithDuration.length
            : 0;
          const lastMonthAvg = lastMonthCallsWithDuration.length > 0
            ? lastMonthCallsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / lastMonthCallsWithDuration.length
            : 0;
          
          const durationChange = lastMonthAvg > 0
            ? Math.round(((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100)
            : 0;
          setAvgDurationTrend({ 
            value: Math.abs(durationChange), 
            type: durationChange >= 0 ? "up" : "down" 
          });
          
          // Conversion Rate & Trend
          const successfulCalls = calls.filter(c => 
            c.evaluation_score != null && Number(c.evaluation_score) >= 6
          ).length;
          const conversionRateValue = calls.length > 0
            ? Math.round((successfulCalls / calls.length) * 100)
            : 0;
          setConversionRate(conversionRateValue);
          
          const thisMonthTotal = calls.filter(c => new Date(c.created_at) >= monthStart).length;
          const thisMonthSuccessful = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= monthStart && c.evaluation_score != null && Number(c.evaluation_score) >= 6;
          }).length;
          const lastMonthTotal = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= lastMonthStart && callDate <= lastMonthEnd;
          }).length;
          const lastMonthSuccessful = calls.filter(c => {
            const callDate = new Date(c.created_at);
            return callDate >= lastMonthStart && callDate <= lastMonthEnd && c.evaluation_score != null && Number(c.evaluation_score) >= 6;
          }).length;
          
          const thisMonthRate = thisMonthTotal > 0 ? (thisMonthSuccessful / thisMonthTotal) * 100 : 0;
          const lastMonthRate = lastMonthTotal > 0 ? (lastMonthSuccessful / lastMonthTotal) * 100 : 0;
          const rateChange = lastMonthRate > 0
            ? Math.round(((thisMonthRate - lastMonthRate) / lastMonthRate) * 100)
            : (thisMonthRate > 0 ? 100 : 0);
          setConversionRateTrend({ 
            value: Math.abs(rateChange), 
            type: rateChange >= 0 ? "up" : "down" 
          });
          
          // Call Distribution - Only for answered calls (F and V excluded)
          const distribution = {
            low: 0,      // 1-3
            medium: 0,  // 4-6
            high: 0,    // 7-10
          };
          
          for (const call of calls) {
            const scored = computeCallScore({
              evaluation_score: call.evaluation_score,
              transcript: call.transcript ?? null,
              summary: call.summary ?? null,
              evaluation_summary: call.evaluation_summary ?? null,
              duration: call.duration ?? null,
              sentiment: call.sentiment ?? null,
              metadata: call.metadata ?? null,
            });
            
            // Only count answered calls (exclude F and V)
            if (scored.display !== "F" && scored.display !== "V" && scored.numericScore !== null) {
              if (scored.numericScore >= 7) {
                distribution.high++;
              } else if (scored.numericScore >= 4) {
                distribution.medium++;
              } else {
                // 1-3 scores
                distribution.low++;
              }
            }
          }
          
          setCallDistribution(distribution);
          
          // Weekly Activity (last 7 days)
          const weeklyData: { date: string; calls: number; appointments: number }[] = [];
          for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            const dayCalls = calls.filter(c => {
              const callDate = new Date(c.created_at);
              return callDate >= dayStart && callDate <= dayEnd;
            });
            
            const dayAppointments = dayCalls.filter(c => 
              c.type === 'appointment' || c.metadata?.appointmentBooked
            ).length;
            
            weeklyData.push({
              date: format(date, 'EEE').toUpperCase(),
              calls: dayCalls.length,
              appointments: dayAppointments
            });
          }
          setWeeklyActivity(weeklyData);

          // Important Recent Leads: 6+ score from last 7 days (computeCallScore – same as Calls page)
          const oneWeekAgo = subDays(now, 7);
          const highScoreCalls = calls
            .filter(c => isAfter(new Date(c.created_at), oneWeekAgo))
            .map(c => {
              const scored = computeCallScore({
                evaluation_score: c.evaluation_score,
                transcript: c.transcript ?? null,
                summary: c.summary ?? null,
                evaluation_summary: c.evaluation_summary ?? null,
                duration: c.duration ?? null,
                sentiment: c.sentiment ?? null,
                metadata: c.metadata ?? null,
              });
              return { call: c, scored };
            })
            .filter(({ scored }) => scored.numericScore !== null && scored.numericScore >= 6)
            .sort((a, b) => (b.scored.numericScore ?? 0) - (a.scored.numericScore ?? 0) || new Date(b.call.created_at).getTime() - new Date(a.call.created_at).getTime())
            .slice(0, 10)
            .map(({ call: c, scored }) => ({
              id: c.id,
              name: c.caller_name || "Unknown",
              phone: c.caller_phone || "—",
              score: scored.numericScore ?? 6,
              date: c.created_at,
              summary: c.summary || "No summary available",
            }));
          setImportantLeads(highScoreCalls);
        } else {
          // No calls data, reset all to 0
          setMonthlyCalls(0);
          setDailyCalls(0);
          setAvgDuration(0);
          setConversionRate(0);
          setCallDistribution({ low: 0, medium: 0, high: 0 });
          setWeeklyActivity([]);
          setImportantLeads([]);
        }
      } else {
        console.error("Failed to load calls:", callsResponse.statusText);
        // Reset on error
        setMonthlyCalls(0);
        setDailyCalls(0);
        setAvgDuration(0);
        setConversionRate(0);
        setCallDistribution({ low: 0, medium: 0, high: 0 });
        setWeeklyActivity([]);
        setImportantLeads([]);
      }
      
      // Handle leads response - pipeline counts + today's actions
      if (leadsResponse.ok) {
        const leadsData = await leadsResponse.json();
        
        // Use calls data if available (already loaded above), otherwise use leads data
        if (callsData && callsData.success && callsData.data && calls.length > 0) {
          const allCallsForPipeline: Call[] = calls;
          
          // Calculate pipeline counts based on call scores (more meaningful)
          const counts: Record<string, number> = {
            new: 0,
            contacted: 0,
            interested: 0,
            appointment_set: 0,
            converted: 0,
            unreachable: 0,
            lost: 0,
          };
          
          // Count calls by score categories
          for (const call of allCallsForPipeline) {
            const scored = computeCallScore({
              evaluation_score: call.evaluation_score,
              transcript: call.transcript ?? null,
              summary: call.summary ?? null,
              evaluation_summary: call.evaluation_summary ?? null,
              duration: call.duration ?? null,
              sentiment: call.sentiment ?? null,
              metadata: call.metadata ?? null,
            });
            
            // Appointment Set: calls with appointment type or appointmentBooked
            if (call.type === 'appointment' || call.metadata?.appointmentBooked) {
              counts.appointment_set = (counts.appointment_set || 0) + 1;
            }
            // Converted: 9-10 score answered calls (very high interest)
            else if (scored.display !== "F" && scored.display !== "V" && scored.numericScore !== null && scored.numericScore >= 9) {
              counts.converted = (counts.converted || 0) + 1;
            }
            // Interested: 7-8 score answered calls
            else if (scored.display !== "F" && scored.display !== "V" && scored.numericScore !== null && scored.numericScore >= 7) {
              counts.interested = (counts.interested || 0) + 1;
            }
            // Contacted/Neutral: 4-6 score answered calls
            else if (scored.display !== "F" && scored.display !== "V" && scored.numericScore !== null && scored.numericScore >= 4) {
              counts.contacted = (counts.contacted || 0) + 1;
            }
            // Lost/Low Interest: 1-3 score answered calls
            else if (scored.display !== "F" && scored.display !== "V" && scored.numericScore !== null) {
              counts.lost = (counts.lost || 0) + 1;
            }
            // Unreachable: Voicemail calls
            else if (scored.display === "V") {
              counts.unreachable = (counts.unreachable || 0) + 1;
            }
            // Failed: Failed calls
            else if (scored.display === "F") {
              counts.unreachable = (counts.unreachable || 0) + 1; // Failed calls also count as unreachable
            }
          }
          
          // New: leads that haven't been called yet (if we have leads data)
          if (leadsData.success && leadsData.data) {
            const allLeads = leadsData.data as any[];
            const calledLeadIds = new Set<string>();
            for (const call of allCallsForPipeline) {
              const meta = call.metadata as Record<string, unknown> | undefined;
              if (meta?.lead_id) {
                calledLeadIds.add(meta.lead_id as string);
              }
            }
            counts.new = allLeads.filter((lead: any) => !calledLeadIds.has(lead.id)).length;
          }
          
          setPipelineCounts(counts);
        } else if (leadsData.success && leadsData.data) {
          // Fallback to lead status counts if calls data not available
          const allLeads = leadsData.data as any[];
          const counts: Record<string, number> = {
            new: 0, contacted: 0, interested: 0, appointment_set: 0,
            converted: 0, unreachable: 0, lost: 0,
          };
          for (const lead of allLeads) {
            const s = lead.status as string;
            if (s in counts) {
              counts[s] = (counts[s] || 0) + 1;
            }
          }
          setPipelineCounts(counts);
        }

        // Today's actions: leads that need follow-up today or are "interested"/"appointment_set"
        if (leadsData.success && leadsData.data) {
          const allLeads = leadsData.data as any[];
          const now = new Date();
          const todayStr = format(now, "yyyy-MM-dd");
          const actions = allLeads
            .filter((lead: any) => {
              // Include leads with next_contact_date of today
              if (lead.next_contact_date) {
                const nextDate = format(new Date(lead.next_contact_date), "yyyy-MM-dd");
                if (nextDate === todayStr) return true;
              }
              // Include recently interested/appointment leads that haven't been contacted today
              if (lead.status === "interested" || lead.status === "appointment_set") {
                return true;
              }
              return false;
            })
            .slice(0, 10)
            .map((lead: any) => ({
              id: lead.id,
              name: lead.full_name || "Unknown",
              phone: lead.phone || "—",
              status: lead.status,
              nextContactDate: lead.next_contact_date,
            }));
          setTodayActions(actions);
        }
      }

      // Handle campaigns response
      if (campaignsResponse && campaignsResponse.ok) {
        try {
          const campaignsData = await campaignsResponse.json();
          if (campaignsData.success && campaignsData.data) {
            const campaigns = campaignsData.data as any[];
            const activeCampaigns = campaigns.filter((c: any) => c.status === "running" || c.is_active);
            const totalCalls = campaigns.reduce((sum: number, c: any) => sum + (c.progress?.total_calls || 0), 0);
            const totalMessages = campaigns.reduce((sum: number, c: any) => sum + (c.progress?.total_messages || 0), 0);
            setCampaignSummary({
              active: activeCampaigns.length,
              totalCalls,
              totalMessages,
            });
          }
        } catch {
          // Campaign API might not exist yet
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
      // Reset on error
      setMonthlyCalls(0);
      setDailyCalls(0);
      setAvgDuration(0);
      setConversionRate(0);
      setCallDistribution({ low: 0, medium: 0, high: 0 });
      setWeeklyActivity([]);
      setImportantLeads([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isMockMode, loadMockData]);

  useEffect(() => {
    if (isMockMode) {
      loadMockData();
      return;
    }
    
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    
    if (user?.id) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [user?.id, authLoading, loadData, isMockMode, loadMockData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (isMockMode) {
      loadMockData();
    } else {
      await loadData();
    }
    setIsRefreshing(false);
  };

  const handleSyncVapi = async () => {
    if (!user?.id) return;
    
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const response = await fetch(`/api/vapi/sync?userId=${user.id}&days=14`, {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSyncResult({
          synced: result.synced || 0,
          skipped: result.skipped || 0,
          total: result.total || 0,
        });
        // Refresh data after sync
        await loadData();
      } else {
        console.error("Sync failed:", result);
        const errorMessage = result.error || result.details || 'Unknown error';
        alert(`Sync failed: ${errorMessage}\n\nCheck browser console for details.`);
      }
    } catch (error) {
      console.error("Error syncing VAPI calls:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Error syncing VAPI calls: ${errorMessage}\n\nCheck browser console for details.`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Compute KPIs based on date range filter
  const filteredCalls = (() => {
    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date = now;
    
    switch (dateRange) {
      case "7days":
        rangeStart = subDays(now, 7);
        break;
      case "this_month":
        rangeStart = startOfMonth(now);
        break;
      case "last_month":
        rangeStart = startOfMonth(subMonths(now, 1));
        rangeEnd = endOfMonth(subMonths(now, 1));
        break;
      default:
        rangeStart = subDays(now, 7);
    }
    
    return allCalls.filter(c => {
      const d = new Date(c.created_at);
      return d >= rangeStart && d <= rangeEnd;
    });
  })();

  const filteredCallsCount = filteredCalls.length;
  const filteredAvgDuration = (() => {
    const withDuration = filteredCalls.filter(c => c.duration && c.duration > 0);
    return withDuration.length > 0
      ? Math.round(withDuration.reduce((s, c) => s + (c.duration || 0), 0) / withDuration.length)
      : 0;
  })();
  const filteredConversionRate = (() => {
    const successful = filteredCalls.filter(c => c.evaluation_score != null && Number(c.evaluation_score) >= 6).length;
    return filteredCallsCount > 0 ? Math.round((successful / filteredCallsCount) * 100) : 0;
  })();

  // Target progress
  const targetProgress = monthlyTarget > 0 ? Math.min(Math.round((monthlyCalls / monthlyTarget) * 100), 100) : 0;
  const targetRemaining = Math.max(monthlyTarget - monthlyCalls, 0);

  // Pipeline total
  const pipelineTotal = Object.values(pipelineCounts).reduce((s, v) => s + v, 0);

  // Calculate call distribution percentages for donut chart (only answered calls)
  const totalDistribution = callDistribution.low + callDistribution.medium + callDistribution.high;
  const distributionPercentages = {
    low: totalDistribution > 0 ? (callDistribution.low / totalDistribution) * 100 : 0,
    medium: totalDistribution > 0 ? (callDistribution.medium / totalDistribution) * 100 : 0,
    high: totalDistribution > 0 ? (callDistribution.high / totalDistribution) * 100 : 0,
  };

  // Calculate max for weekly activity chart
  const maxWeeklyValue = Math.max(
    ...weeklyActivity.map(w => Math.max(w.calls, w.appointments)),
    1
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t("dashboard")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">
            {t("welcome")}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ""}! {t("aiSummary")}
              </p>
            </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
            <SelectTrigger className="w-32 sm:w-40 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
              <Calendar className="w-4 h-4 mr-1 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">{t("last7Days")}</SelectItem>
              <SelectItem value="this_month">{t("thisMonth")}</SelectItem>
              <SelectItem value="last_month">{t("lastMonth")}</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleSyncVapi} 
            disabled={isSyncing}
            className="border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            title="Sync calls from VAPI (last 14 days)"
          >
            <RefreshCw className={cn("w-4 h-4 sm:mr-2", isSyncing && "animate-spin")} />
            <span className="hidden sm:inline">{isSyncing ? "Syncing..." : "Sync VAPI"}</span>
          </Button>
          {syncResult && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Synced: {syncResult.synced}, Skipped: {syncResult.skipped}
            </span>
          )}
              <Button 
                variant="outline" 
            size="sm"
                onClick={handleRefresh} 
                disabled={isRefreshing}
            className="border-gray-200 dark:border-gray-700"
              >
            <RefreshCw className={cn("w-4 h-4 sm:mr-2", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">{t("refresh")}</span>
              </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <KPICard
          label={t("monthlyCalls")}
          value={monthlyCalls}
          trend={monthlyCallsTrend.type}
          trendValue={`${monthlyCallsTrend.value}%`}
          icon={Phone}
        />
        <KPICard
          label={t("dailyCalls")}
          value={dailyCalls}
          trend={dailyCallsTrend.type}
          trendValue={`${dailyCallsTrend.value}%`}
        />
        <KPICard
          label={t("avgDuration")}
          value={`${Math.floor(avgDuration / 60)}:${(avgDuration % 60).toString().padStart(2, '0')}`}
          trend={avgDurationTrend.type}
          trendValue={`${avgDurationTrend.value}%`}
        />
        <KPICard
          label={t("conversionRate")}
          value={`${conversionRate}%`}
          trend={conversionRateTrend.type}
          trendValue={`${conversionRateTrend.value}%`}
        />
      </div>

      {/* Date Range Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-3">
          {dateRange === "7days" ? t("last7Days") : dateRange === "this_month" ? t("thisMonth") : t("lastMonth")} {t("overview")}
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{filteredCallsCount}</p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t("calls")}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {Math.floor(filteredAvgDuration / 60)}:{(filteredAvgDuration % 60).toString().padStart(2, '0')}
            </p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t("avgDuration")}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{filteredConversionRate}%</p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t("conversion")}</p>
          </div>
        </div>
      </div>

      {/* Pipeline + Target Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Lead Pipeline Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">{t("leadPipeline")}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{pipelineTotal} {t("total")}</span>
          </div>
          <div className="space-y-3">
            {[
              { key: "new", label: t("new"), color: "bg-blue-500" },
              { key: "contacted", label: t("contacted"), color: "bg-purple-500" },
              { key: "interested", label: t("interested"), color: "bg-amber-500" },
              { key: "appointment_set", label: t("appointment"), color: "bg-green-500" },
              { key: "converted", label: t("converted"), color: "bg-emerald-500" },
              { key: "unreachable", label: t("unreachable"), color: "bg-red-500" },
              { key: "lost", label: t("lost"), color: "bg-gray-400" },
            ].map(({ key, label, color }) => {
              const count = pipelineCounts[key] || 0;
              const pct = pipelineTotal > 0 ? (count / pipelineTotal) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 w-24 sm:w-28">{label}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className={cn("h-2 rounded-full transition-all duration-300", color)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white w-10 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Target */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">{t("monthlyTarget")}</h3>
            {!editingTarget ? (
              <button
                onClick={() => { setEditingTarget(true); setTargetInput(monthlyTarget.toString()); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-auto"
              >
                {t("edit")}
              </button>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <Input
                  type="number"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-20 h-7 text-xs"
                  min={1}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const val = parseInt(targetInput) || 100;
                    setMonthlyTarget(val);
                    localStorage.setItem("dashboard_monthly_target", val.toString());
                    setEditingTarget(false);
                  }}
                >
                  {t("save")}
                </Button>
              </div>
            )}
          </div>
          
          {/* Large progress ring */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32 sm:w-40 sm:h-40">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                  className="text-gray-200 dark:text-gray-700" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 40 * (targetProgress / 100)} ${2 * Math.PI * 40}`}
                  className={cn(
                    targetProgress >= 100 ? "text-green-500" : targetProgress >= 50 ? "text-blue-500" : "text-amber-500"
                  )}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{targetProgress}%</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t("ofTarget")}</span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">{monthlyCalls}</span> / {monthlyTarget} {t("calls")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {targetRemaining > 0 ? `${targetRemaining} ${t("remaining")}` : t("targetReached")}
              </p>
            </div>
          </div>

          {/* Campaign Status */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">{t("campaignStatus")}</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{campaignSummary.active}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{t("active")}</p>
              </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{campaignSummary.totalCalls}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{t("calls")}</p>
        </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{campaignSummary.totalMessages}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{t("messages")}</p>
              </div>
            </div>
          </div>
                    </div>
                  </div>
                  
      {/* Today's Actions */}
      {todayActions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">{t("todayActions")}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{todayActions.length} {t("leads")}</span>
                  </div>
          <div className="space-y-2">
            {todayActions.map((action) => (
              <div key={action.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                <div className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  action.status === "interested" ? "bg-amber-500" :
                  action.status === "appointment_set" ? "bg-green-500" : "bg-blue-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{action.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{action.phone}</p>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium flex-shrink-0",
                  action.status === "interested" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                  action.status === "appointment_set" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                )}>
                  {action.status === "interested" ? t("interested") :
                   action.status === "appointment_set" ? t("appointment") : action.status}
                </span>
                {action.nextContactDate && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {format(new Date(action.nextContactDate), "HH:mm")}
                  </span>
                )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Call Distribution Donut Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6">{t("callDistribution")}</h3>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0">
            {/* Simple Donut Chart */}
            <div className="relative w-32 h-32 sm:w-48 sm:h-48">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="20"
                  className="text-gray-200 dark:text-gray-700"
                />
                {/* Segments - Only answered calls: 1-3 (red), 4-6 (yellow), 7-10 (green) */}
                {distributionPercentages.low > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="20"
                    strokeDasharray={`${2 * Math.PI * 40 * (distributionPercentages.low / 100)} ${2 * Math.PI * 40}`}
                    className="text-red-600 dark:text-red-400"
                    strokeDashoffset="0"
                  />
                )}
                {distributionPercentages.medium > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="20"
                    strokeDasharray={`${2 * Math.PI * 40 * (distributionPercentages.medium / 100)} ${2 * Math.PI * 40}`}
                    className="text-yellow-600 dark:text-yellow-400"
                    strokeDashoffset={`-${2 * Math.PI * 40 * (distributionPercentages.low / 100)}`}
                  />
                )}
                {distributionPercentages.high > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="20"
                    strokeDasharray={`${2 * Math.PI * 40 * (distributionPercentages.high / 100)} ${2 * Math.PI * 40}`}
                    className="text-green-600 dark:text-green-400"
                    strokeDashoffset={`-${2 * Math.PI * 40 * ((distributionPercentages.low + distributionPercentages.medium) / 100)}`}
                  />
                )}
              </svg>
            </div>
            {/* Legend - Only answered calls with counts and percentages */}
            <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:ml-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-600 dark:bg-red-400" />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Low Interest (1-3)</span>
                </div>
                <div className="text-right">
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{callDistribution.low}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({distributionPercentages.low.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-600 dark:bg-yellow-400" />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Neutral (4-6)</span>
                </div>
                <div className="text-right">
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{callDistribution.medium}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({distributionPercentages.medium.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-600 dark:bg-green-400" />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{t("interested")} (7-10)</span>
                </div>
                <div className="text-right">
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{callDistribution.high}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({distributionPercentages.high.toFixed(1)}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Activity Bar Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6">{t("weeklyActivity")}</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3 sm:gap-4 mb-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-blue-600 dark:bg-blue-400" />
                <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">{t("calls")}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-green-600 dark:bg-green-400" />
                <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">{t("appointments")}</span>
              </div>
            </div>
            <div className="flex items-end justify-around">
              {weeklyActivity.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5 sm:gap-2">
                  {/* Bar container with fixed height */}
                  <div className="flex items-end justify-center gap-0.5 sm:gap-1 h-20 sm:h-32 w-6 sm:w-10">
                    {/* Calls bar */}
                    <div
                      className="bg-blue-600 dark:bg-blue-400 rounded-t w-2 sm:w-3 transition-all duration-300 cursor-pointer hover:bg-blue-700 dark:hover:bg-blue-300 relative group"
                      style={{ 
                        height: maxWeeklyValue > 0 ? `${Math.max((item.calls / maxWeeklyValue) * 100, item.calls > 0 ? 8 : 0)}%` : '0%'
                      }}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {item.calls} calls
                      </div>
                    </div>
                    {/* Appointments bar */}
                    <div
                      className="bg-green-600 dark:bg-green-400 rounded-t w-2 sm:w-3 transition-all duration-300 cursor-pointer hover:bg-green-700 dark:hover:bg-green-300 relative group"
                      style={{ 
                        height: maxWeeklyValue > 0 ? `${Math.max((item.appointments / maxWeeklyValue) * 100, item.appointments > 0 ? 8 : 0)}%` : '0%'
                      }}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {item.appointments} appts
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium text-center">{item.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Important Recent Leads */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4 sm:mb-6">
          <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">{t("importantRecentLeads")}</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{t("score6Plus")}</span>
        </div>

        {importantLeads.length === 0 ? (
          <div className="text-center py-8">
            <Star className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("noHighScoreLeads")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {importantLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {/* Score Badge */}
                <div className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                  lead.score >= 9
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                )}>
                  {lead.score}
                </div>

                {/* Lead Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{lead.name}</p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{lead.phone}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                    {lead.summary}
                  </p>
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  <span>{format(new Date(lead.date), "MMM d, HH:mm")}</span>
                </div>
                </div>
              ))}
            </div>
          )}
      </div>

    </div>
  );
}

export default function OutboundDashboard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <OutboundDashboardContent />
    </Suspense>
  );
}
