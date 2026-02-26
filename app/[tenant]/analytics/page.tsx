"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTenant } from "@/components/providers/TenantProvider";
// Analytics now loaded via API route
import type { AnalyticsData } from "@/lib/types-outbound";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  RefreshCw, 
  Users,
  Phone,
  Calendar,
  Clock,
  Target,
  Percent
} from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Simple bar chart component
function SimpleBarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
            <span className="font-medium text-gray-900 dark:text-white">{item.value}</span>
          </div>
          <div className="h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
            <div 
              className="h-full rounded transition-all duration-500"
              style={{ 
                width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                backgroundColor: item.color 
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Funnel chart component
function FunnelChart({ data }: { data: { label: string; value: number; percentage: number; color: string }[] }) {
  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={item.label} className="relative">
          <div 
            className="h-12 rounded-lg flex items-center justify-between px-4 transition-all"
            style={{ 
              backgroundColor: item.color,
              width: `${Math.max(item.percentage, 20)}%`,
              marginLeft: `${(100 - Math.max(item.percentage, 20)) / 2}%`
            }}
          >
            <span className="text-white text-sm font-medium truncate">{item.label}</span>
            <span className="text-white text-sm font-bold">{item.value}</span>
          </div>
          {index < data.length - 1 && (
            <div className="flex justify-center my-1">
              <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-gray-300 dark:border-gray-600"></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const params = useParams();
  const tenant = params?.tenant as string;
  useTenant(); // Ensure tenant context is available

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("7d");

  const loadAnalytics = useCallback(async () => {
    try {
      let startDate: Date;
      const endDate = new Date();
      
      switch (dateRange) {
        case "7d":
          startDate = subDays(endDate, 7);
          break;
        case "30d":
          startDate = subDays(endDate, 30);
          break;
        case "90d":
          startDate = subDays(endDate, 90);
          break;
        case "thisWeek":
          startDate = startOfWeek(endDate, { locale: tr });
          break;
        case "thisMonth":
          startDate = startOfMonth(endDate);
          break;
        default:
          startDate = subDays(endDate, 7);
      }
      
      // Use server-side API route
      const response = await fetch(
        `/api/dashboard/analytics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Map API response to AnalyticsData format
          const data = result.data;
          setAnalytics({
            total_leads: data.total_leads || 0,
            contacted_leads: data.contacted_leads || 0,
            interested_leads: data.interested_leads || 0,
            appointments_set: data.appointments_set || 0,
            converted_leads: data.converted_leads || 0,
            unreachable_leads: data.unreachable_leads || 0,
            conversion_rate: data.conversion_rate || 0,
            conversion_change: data.conversion_change || 0,
            avg_call_duration: data.avg_call_duration || 0,
            reachability_rate: data.reachability_rate || 0,
            total_calls: data.total_calls || 0,
            total_messages: data.total_messages || 0,
            avg_response_time: data.avg_response_time || 0,
            channel_performance: data.channel_performance || [],
            best_call_times: data.best_call_times || [],
            language_performance: data.language_performance || { tr: 0, en: 0 },
          });
          return;
        }
      }
      
      // Set default empty analytics on error
      setAnalytics({
        total_leads: 0, contacted_leads: 0, interested_leads: 0,
        appointments_set: 0, converted_leads: 0, unreachable_leads: 0,
        conversion_rate: 0, conversion_change: 0, avg_call_duration: 0,
        reachability_rate: 0, total_calls: 0, total_messages: 0,
        avg_response_time: 0, channel_performance: [],
        best_call_times: [], language_performance: { tr: 0, en: 0 },
      });
    } catch (error) {
      console.error("Error loading analytics:", error);
      setAnalytics({
        total_leads: 0, contacted_leads: 0, interested_leads: 0,
        appointments_set: 0, converted_leads: 0, unreachable_leads: 0,
        conversion_rate: 0, conversion_change: 0, avg_call_duration: 0,
        reachability_rate: 0, total_calls: 0, total_messages: 0,
        avg_response_time: 0, channel_performance: [],
        best_call_times: [], language_performance: { tr: 0, en: 0 },
      });
    }
  }, [dateRange]);

  useEffect(() => {
    loadAnalytics().then(() => setIsLoading(false));
  }, [loadAnalytics]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAnalytics();
    setIsRefreshing(false);
  };

  // Don't block on loading - show UI with loading indicators in sections

  const funnelData = analytics ? [
    { label: "Toplam Lead", value: analytics.total_leads, percentage: 100, color: "#6366F1" },
    { label: "İletişime Geçildi", value: analytics.contacted_leads, percentage: analytics.total_leads > 0 ? (analytics.contacted_leads / analytics.total_leads) * 100 : 0, color: "#8B5CF6" },
    { label: "İlgileniyor", value: analytics.interested_leads, percentage: analytics.total_leads > 0 ? (analytics.interested_leads / analytics.total_leads) * 100 : 0, color: "#A855F7" },
    { label: "Randevu Alındı", value: analytics.appointments_set, percentage: analytics.total_leads > 0 ? (analytics.appointments_set / analytics.total_leads) * 100 : 0, color: "#D946EF" },
    { label: "Dönüşüm", value: analytics.converted_leads, percentage: analytics.total_leads > 0 ? (analytics.converted_leads / analytics.total_leads) * 100 : 0, color: "#EC4899" },
  ] : [];

  const channelData = analytics?.channel_performance?.map(cp => ({
    label: cp.channel === 'call' ? 'Telefon' : 
           cp.channel === 'whatsapp' ? 'WhatsApp' : 
           cp.channel === 'email' ? 'Email' : 
           cp.channel === 'instagram_dm' ? 'Instagram' : cp.channel,
    value: cp.success_rate,
    color: cp.channel === 'call' ? '#3B82F6' : 
           cp.channel === 'whatsapp' ? '#22C55E' : 
           cp.channel === 'email' ? '#8B5CF6' : 
           cp.channel === 'instagram_dm' ? '#EC4899' : '#6B7280',
  })) || [];

  const maxChannelValue = Math.max(...channelData.map(d => d.value), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analitik</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Performans ve dönüşüm metrikleri
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Son 7 gün</SelectItem>
              <SelectItem value="30d">Son 30 gün</SelectItem>
              <SelectItem value="90d">Son 90 gün</SelectItem>
              <SelectItem value="thisWeek">Bu hafta</SelectItem>
              <SelectItem value="thisMonth">Bu ay</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Dönüşüm Oranı</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  %{analytics?.conversion_rate || 0}
                </p>
              </div>
              <div className={cn(
                "p-3 rounded-xl",
                (analytics?.conversion_rate || 0) > 10 
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-yellow-100 dark:bg-yellow-900/30"
              )}>
                <Percent className={cn(
                  "w-6 h-6",
                  (analytics?.conversion_rate || 0) > 10 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-yellow-600 dark:text-yellow-400"
                )} />
              </div>
            </div>
            <div className="flex items-center mt-2 text-sm">
              {(analytics?.conversion_change || 0) >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={cn(
                (analytics?.conversion_change || 0) >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {Math.abs(analytics?.conversion_change || 0)}% önceki döneme göre
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ort. Arama Süresi</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {Math.floor((analytics?.avg_call_duration || 0) / 60)}:{((analytics?.avg_call_duration || 0) % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ulaşılabilirlik</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  %{analytics?.reachability_rate || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                <Phone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Randevu Sayısı</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {analytics?.appointments_set || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                <Calendar className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sales Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Satış Hunisi
            </CardTitle>
            <CardDescription>Lead&apos;den dönüşüme kadar olan süreç</CardDescription>
          </CardHeader>
          <CardContent>
            {funnelData.length > 0 ? (
              <FunnelChart data={funnelData} />
            ) : (
              <div className="text-center py-8 text-gray-500">
                Veri bulunamadı
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Kanal Başarı Oranları
            </CardTitle>
            <CardDescription>Her kanalın dönüşüm oranı (%)</CardDescription>
          </CardHeader>
          <CardContent>
            {channelData.length > 0 ? (
              <SimpleBarChart data={channelData} maxValue={maxChannelValue} />
            ) : (
              <div className="text-center py-8 text-gray-500">
                Veri bulunamadı
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Best Call Times */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            En İyi Arama Saatleri
          </CardTitle>
          <CardDescription>Ulaşılabilirlik oranına göre en verimli saatler</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics?.best_call_times && analytics.best_call_times.length > 0 ? (
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {analytics.best_call_times.map((time) => (
                <div
                  key={time.hour}
                  className={cn(
                    "p-3 rounded-lg text-center transition-all",
                    time.success_rate > 50 
                      ? "bg-green-100 dark:bg-green-900/30" 
                      : time.success_rate > 30 
                        ? "bg-yellow-100 dark:bg-yellow-900/30"
                        : "bg-gray-100 dark:bg-gray-700"
                  )}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{time.hour}:00</p>
                  <p className={cn(
                    "text-xs",
                    time.success_rate > 50 
                      ? "text-green-600 dark:text-green-400" 
                      : time.success_rate > 30 
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-gray-500"
                  )}>
                    %{time.success_rate}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Henüz yeterli veri yok
            </div>
          )}
        </CardContent>
      </Card>

      {/* Language Performance */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Dil Bazlı Performans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <span className="text-3xl mb-2">🇹🇷</span>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  %{analytics?.language_performance?.tr || 0}
                </p>
                <p className="text-sm text-gray-500">Türkçe başarı</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <span className="text-3xl mb-2">🇬🇧</span>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  %{analytics?.language_performance?.en || 0}
                </p>
                <p className="text-sm text-gray-500">İngilizce başarı</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performans Özeti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Toplam Lead</span>
                <span className="font-semibold text-gray-900 dark:text-white">{analytics?.total_leads || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Toplam Arama</span>
                <span className="font-semibold text-gray-900 dark:text-white">{analytics?.total_calls || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Toplam Mesaj</span>
                <span className="font-semibold text-gray-900 dark:text-white">{analytics?.total_messages || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Ort. Yanıt Süresi</span>
                <span className="font-semibold text-gray-900 dark:text-white">{analytics?.avg_response_time || 0} saat</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
