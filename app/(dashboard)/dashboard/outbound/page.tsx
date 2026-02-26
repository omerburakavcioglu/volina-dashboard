"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Users, 
  Phone, 
  CalendarCheck, 
  TrendingUp, 
  RefreshCw,
  MessageSquare,
  UserPlus,
  Clock,
  Target,
  PhoneCall
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { getOutboundStats, getTodaysLeads, getChannelPerformance } from "@/lib/supabase-outbound";
import type { OutboundStats, Lead } from "@/lib/types-outbound";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// Simple chart component for funnel
function FunnelChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={item.name} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
            <span className="font-medium text-gray-900 dark:text-white">{item.value}</span>
          </div>
          <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
            <div 
              className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
              style={{ 
                width: `${Math.max((item.value / maxValue) * 100, 5)}%`,
                backgroundColor: item.color 
              }}
            >
              {item.value > 0 && (
                <span className="text-white text-xs font-medium">
                  {Math.round((item.value / (data[0]?.value || 1)) * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OutboundDashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  
  const [stats, setStats] = useState<OutboundStats | null>(null);
  const [todaysLeads, setTodaysLeads] = useState<Lead[]>([]);
  const [channelPerformance, setChannelPerformance] = useState<{ channel: string; attempts: number; successes: number; rate: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const loadData = useCallback(async () => {
    try {
      const [statsData, leadsData, channelData] = await Promise.all([
        getOutboundStats(),
        getTodaysLeads(),
        getChannelPerformance(),
      ]);
      
      setStats(statsData);
      setTodaysLeads(leadsData);
      setChannelPerformance(channelData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData().then(() => setIsLoading(false));
    }
  }, [isAuthenticated, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const funnelData = [
    { name: "Toplam Lead", value: stats?.total_leads || 0, color: "#6366F1" },
    { name: "İletişime Geçildi", value: stats?.contacted_leads || 0, color: "#8B5CF6" },
    { name: "İlgileniyor", value: stats?.interested_leads || 0, color: "#A855F7" },
    { name: "Randevu Alındı", value: stats?.appointments_set || 0, color: "#D946EF" },
    { name: "Dönüşüm", value: stats?.converted_leads || 0, color: "#EC4899" },
  ];

  const channelNames: Record<string, string> = {
    call: "Telefon",
    whatsapp: "WhatsApp",
    email: "Email",
    sms: "SMS",
    instagram_dm: "Instagram DM",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Outbound Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Hoş geldin{user?.full_name ? `, ${user.full_name}` : ""}! İşte satış performansın.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {format(new Date(), "HH:mm", { locale: tr })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Toplam Lead</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats?.total_leads || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <UserPlus className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Yeni Lead</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats?.new_leads || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                <CalendarCheck className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Randevu</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats?.appointments_set || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Dönüşüm</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  %{stats?.conversion_rate || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Actions & Funnel */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Calls Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-primary" />
              Bugünkü Aramalar
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/outbound/calls")}>
              Tümünü Gör
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-primary">{stats?.completed_calls_today || 0}</p>
                <p className="text-sm text-gray-500">Tamamlanan</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-bold text-orange-500">{(stats?.todays_calls || 0) - (stats?.completed_calls_today || 0)}</p>
                <p className="text-sm text-gray-500">Bekleyen</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-bold text-gray-400">{stats?.todays_calls || 0}</p>
                <p className="text-sm text-gray-500">Toplam</p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Günlük İlerleme</span>
                <span className="font-medium">
                  {stats?.todays_calls ? Math.round((stats.completed_calls_today / stats.todays_calls) * 100) : 0}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${stats?.todays_calls ? (stats.completed_calls_today / stats.todays_calls) * 100 : 0}%` 
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Satış Hunisi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart data={funnelData} />
          </CardContent>
        </Card>
      </div>

      {/* Channel Performance & Leads to Contact */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Channel Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Kanal Performansı
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channelPerformance.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Henüz outreach verisi yok
              </div>
            ) : (
              <div className="space-y-4">
                {channelPerformance.map((channel) => (
                  <div key={channel.channel} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {channel.channel === 'call' && <Phone className="w-5 h-5 text-blue-500" />}
                      {channel.channel === 'whatsapp' && <MessageSquare className="w-5 h-5 text-green-500" />}
                      {channel.channel === 'email' && <MessageSquare className="w-5 h-5 text-purple-500" />}
                      {channel.channel === 'instagram_dm' && <MessageSquare className="w-5 h-5 text-pink-500" />}
                      <span className="font-medium">{channelNames[channel.channel] || channel.channel}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{channel.attempts} deneme</span>
                      <span className="font-medium text-green-600">%{channel.rate}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads to Contact Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Bugün Aranacaklar
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/outbound/leads")}>
              Tümünü Gör
            </Button>
          </CardHeader>
          <CardContent>
            {todaysLeads.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Bugün aranacak lead yok
              </div>
            ) : (
              <div className="space-y-3">
                {todaysLeads.slice(0, 5).map((lead) => (
                  <div 
                    key={lead.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={() => router.push(`/dashboard/outbound/leads/${lead.id}`)}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{lead.full_name}</p>
                      <p className="text-sm text-gray-500">{lead.phone || lead.whatsapp}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        lead.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        lead.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {lead.priority === 'high' ? 'Yüksek' : lead.priority === 'medium' ? 'Orta' : 'Düşük'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {lead.language === 'tr' ? '🇹🇷' : '🇬🇧'}
                      </span>
                    </div>
                  </div>
                ))}
                {todaysLeads.length > 5 && (
                  <p className="text-sm text-center text-gray-500">
                    +{todaysLeads.length - 5} daha
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
