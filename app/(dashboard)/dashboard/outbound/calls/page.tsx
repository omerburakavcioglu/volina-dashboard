"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Phone, 
  PhoneCall, 
  PhoneOff, 
  PhoneMissed,
  RefreshCw, 
  Play,
  Check,
  X,
  Clock,
  User,
  MessageSquare,
  Calendar,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { 
  getTodaysOutreach, 
  getOutreach, 
  completeOutreach,
  updateLead,
  createOnlineAppointment
} from "@/lib/supabase-outbound";
import type { Outreach, OutreachResult, Lead } from "@/lib/types-outbound";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const resultLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  answered_interested: { label: "İlgileniyor", color: "bg-green-100 text-green-700", icon: <Check className="w-4 h-4" /> },
  answered_not_interested: { label: "İlgilenmiyor", color: "bg-gray-100 text-gray-700", icon: <X className="w-4 h-4" /> },
  answered_callback_requested: { label: "Geri Arama İstedi", color: "bg-blue-100 text-blue-700", icon: <Phone className="w-4 h-4" /> },
  answered_appointment_set: { label: "Randevu Alındı", color: "bg-purple-100 text-purple-700", icon: <Calendar className="w-4 h-4" /> },
  no_answer: { label: "Cevap Yok", color: "bg-yellow-100 text-yellow-700", icon: <PhoneMissed className="w-4 h-4" /> },
  busy: { label: "Meşgul", color: "bg-orange-100 text-orange-700", icon: <PhoneOff className="w-4 h-4" /> },
  voicemail: { label: "Sesli Mesaj", color: "bg-indigo-100 text-indigo-700", icon: <MessageSquare className="w-4 h-4" /> },
  wrong_number: { label: "Yanlış Numara", color: "bg-red-100 text-red-700", icon: <X className="w-4 h-4" /> },
};

function getResultLabel(result: string | null) {
  if (!result || !resultLabels[result]) {
    return { label: "", color: "bg-gray-100", icon: <Phone className="w-4 h-4" /> };
  }
  return resultLabels[result];
}

export default function OutboundCallsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [todaysCalls, setTodaysCalls] = useState<Outreach[]>([]);
  const [recentCalls, setRecentCalls] = useState<Outreach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCall, setSelectedCall] = useState<Outreach | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const loadData = useCallback(async () => {
    try {
      const [todaysData, recentData] = await Promise.all([
        getTodaysOutreach(),
        getOutreach({ channel: 'call', limit: 20 }),
      ]);
      
      setTodaysCalls(todaysData.filter(o => o.channel === 'call'));
      setRecentCalls(recentData.filter(o => o.status === 'completed'));
    } catch (error) {
      console.error("Error loading calls:", error);
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

  const handleStartCall = (call: Outreach) => {
    setSelectedCall(call);
    setNotes("");
    setShowResultModal(true);
  };

  const handleCompleteCall = async (result: OutreachResult) => {
    if (!selectedCall) return;
    
    setIsSaving(true);
    try {
      await completeOutreach(selectedCall.id, result, notes);
      
      // Update lead status based on result
      if (selectedCall.lead_id) {
        let newStatus: Lead["status"] | null = null;
        
        switch (result) {
          case 'answered_interested':
            newStatus = 'interested';
            break;
          case 'answered_appointment_set':
            newStatus = 'appointment_set';
            break;
          case 'answered_not_interested':
            newStatus = 'lost';
            break;
          case 'wrong_number':
            newStatus = 'unreachable';
            break;
        }
        
        if (newStatus) {
          await updateLead(selectedCall.lead_id, { 
            status: newStatus,
            last_contact_date: new Date().toISOString(),
          });
        }
      }
      
      setShowResultModal(false);
      setSelectedCall(null);
      await loadData();
    } catch (error) {
      console.error("Error completing call:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const pendingCalls = todaysCalls.filter(c => c.status === 'pending' || c.status === 'scheduled');
  const completedCalls = todaysCalls.filter(c => c.status === 'completed');

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Outbound Aramalar</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Bugünkü aramalarınızı yönetin ve sonuçları kaydedin
          </p>
        </div>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Bekleyen</p>
                <p className="text-3xl font-bold text-orange-500">{pendingCalls.length}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Tamamlanan</p>
                <p className="text-3xl font-bold text-green-500">{completedCalls.length}</p>
              </div>
              <Check className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Başarılı</p>
                <p className="text-3xl font-bold text-purple-500">
                  {completedCalls.filter(c => 
                    c.result === 'answered_interested' || c.result === 'answered_appointment_set'
                  ).length}
                </p>
              </div>
              <PhoneCall className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Başarı Oranı</p>
                <p className="text-3xl font-bold text-primary">
                  {completedCalls.length > 0 
                    ? Math.round((completedCalls.filter(c => 
                        c.result === 'answered_interested' || c.result === 'answered_appointment_set'
                      ).length / completedCalls.length) * 100)
                    : 0}%
                </p>
              </div>
              <Phone className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Calls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              Bekleyen Aramalar ({pendingCalls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingCalls.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                🎉 Tüm aramalar tamamlandı!
              </div>
            ) : (
              <div className="space-y-3">
                {pendingCalls.map((call) => (
                  <div 
                    key={call.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <User className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {call.lead?.full_name || "Bilinmiyor"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {call.lead?.phone || call.lead?.whatsapp}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {call.lead?.language === 'tr' ? '🇹🇷' : '🇬🇧'}
                      </span>
                      <Button 
                        size="sm" 
                        onClick={() => handleStartCall(call)}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Ara
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Completed Calls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              Son Aramalar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCalls.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Henüz tamamlanan arama yok
              </div>
            ) : (
              <div className="space-y-3">
                {recentCalls.slice(0, 5).map((call) => (
                  <div 
                    key={call.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        getResultLabel(call.result).color
                      )}>
                        {getResultLabel(call.result).icon}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {call.lead?.full_name || "Bilinmiyor"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {getResultLabel(call.result).label}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {call.completed_at && format(new Date(call.completed_at), "HH:mm", { locale: tr })}
                      </p>
                      {call.duration && (
                        <p className="text-xs text-gray-400">
                          {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, '0')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Result Modal */}
      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Arama Sonucu</DialogTitle>
            <DialogDescription>
              {selectedCall?.lead?.full_name} ile yapılan aramanın sonucunu seçin
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Lead Info */}
            {selectedCall?.lead && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedCall.lead.full_name}</p>
                    <p className="text-sm text-gray-500">{selectedCall.lead.phone || selectedCall.lead.whatsapp}</p>
                  </div>
                  <span className="ml-auto text-2xl">
                    {selectedCall.lead.language === 'tr' ? '🇹🇷' : '🇬🇧'}
                  </span>
                </div>
              </div>
            )}
            
            {/* Result Options */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(resultLabels).map(([key, { label, color, icon }]) => (
                <button
                  key={key}
                  onClick={() => handleCompleteCall(key as OutreachResult)}
                  disabled={isSaving}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border-2 border-transparent transition-all",
                    "hover:border-primary hover:scale-105",
                    color
                  )}
                >
                  {icon}
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
            
            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Notlar (opsiyonel)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Arama hakkında notlar..."
                className="mt-1 w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 min-h-[80px]"
              />
            </div>
            
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowResultModal(false)}>
                İptal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
