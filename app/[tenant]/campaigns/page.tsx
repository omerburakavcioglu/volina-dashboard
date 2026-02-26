"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTenant } from "@/components/providers/TenantProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Target, 
  Plus, 
  RefreshCw, 
  Phone,
  Clock,
  Play,
  Square,
  Trash2,
  Users,
  Loader2,
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Ban,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────

type DayActionType = "call" | "whatsapp" | "off";
type CampaignStatus = "idle" | "running" | "paused" | "completed";

interface TimeSlot {
  id: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  callsPerSlot: number;
}

interface DayPlan {
  day: number; // 1–7
  action: DayActionType;
  timeSlots: TimeSlot[]; // Only for "call"
  whatsappMessage?: string; // Only for "whatsapp"
  whatsappSendHour?: number; // 0-23
  whatsappSendMinute?: number; // 0-59
}

interface AutoCallCampaign {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  status: CampaignStatus;
  started_at?: string;
  day_plans: DayPlan[];
  timezone: string;
  whatsapp_config?: {
    phone_number_id: string;
    access_token: string;
    business_account_id: string;
  };
  assigned_lead_ids?: string[];
  progress?: {
    current_day: number;
    calls_today: number;
    messages_today: number;
    total_calls: number;
    total_messages: number;
  };
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

// Campaign translations
const campaignTexts = {
  dayLabels: { en: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"], tr: ["Gün 1", "Gün 2", "Gün 3", "Gün 4", "Gün 5", "Gün 6", "Gün 7"] },
  status: {
    idle: { en: "Idle", tr: "Beklemede" },
    running: { en: "Running", tr: "Çalışıyor" },
    paused: { en: "Paused", tr: "Duraklatıldı" },
    completed: { en: "Completed", tr: "Tamamlandı" },
  },
  action: {
    call: { en: "Call", tr: "Arama" },
    whatsapp: { en: "WhatsApp", tr: "WhatsApp" },
    off: { en: "Off", tr: "Kapalı" },
  },
  title: { en: "Campaigns", tr: "Kampanyalar" },
  subtitle: { en: "Automated 7-day campaigns with calls & WhatsApp", tr: "Aramalar ve WhatsApp ile otomatik 7 günlük kampanyalar" },
  newCampaign: { en: "New Campaign", tr: "Yeni Kampanya" },
  refresh: { en: "Refresh", tr: "Yenile" },
  newLeads: { en: "New Leads", tr: "Yeni Müşteriler" },
  runningCampaigns: { en: "Running Campaigns", tr: "Çalışan Kampanyalar" },
  timezone: { en: "Timezone", tr: "Saat Dilimi" },
  turkeyTime: { en: "Turkey (UTC+3)", tr: "Türkiye (UTC+3)" },
  howItWorks: { en: "How it works:", tr: "Nasıl çalışır:" },
  howItWorksDesc: { en: "Create a campaign, press Start. A background process (cron) will automatically execute calls during your time slots and send WhatsApp messages at the scheduled times. No need to keep the page open.", tr: "Bir kampanya oluşturun, Başlat'a basın. Arka planda çalışan bir süreç (cron) zaman dilimlerinizde otomatik olarak aramalar yapacak ve WhatsApp mesajlarını planlanan saatlerde gönderecektir. Sayfayı açık tutmanıza gerek yok." },
  noCampaigns: { en: "No campaigns yet", tr: "Henüz kampanya yok" },
  createFirst: { en: "Create Your First Campaign", tr: "İlk Kampanyanızı Oluşturun" },
  start: { en: "Start", tr: "Başlat" },
  restart: { en: "Restart", tr: "Yeniden Başlat" },
  stop: { en: "Stop", tr: "Durdur" },
  dayOf: { en: "Day {current} of 7", tr: "7 günün {current}. günü" },
  callsSent: { en: "calls, {messages} messages sent", tr: "arama, {messages} mesaj gönderildi" },
  leadsAssigned: { en: "leads assigned", tr: "müşteri atandı" },
  createCampaign: { en: "Create Campaign", tr: "Kampanya Oluştur" },
  createCampaignDesc: { en: "Set up a 7-day automated campaign. All days start as off — configure the ones you need.", tr: "7 günlük otomatik bir kampanya kurun. Tüm günler kapalı olarak başlar — ihtiyacınız olanları yapılandırın." },
  campaignName: { en: "Campaign Name *", tr: "Kampanya Adı *" },
  description: { en: "Description", tr: "Açıklama" },
  optionalDesc: { en: "Optional description...", tr: "İsteğe bağlı açıklama..." },
  dayPlan: { en: "7-Day Plan (Turkey Time)", tr: "7 Günlük Plan (Türkiye Saati)" },
  slot: { en: "Slot {num}", tr: "Zaman Dilimi {num}" },
  timeStart: { en: "Start", tr: "Başlangıç" },
  timeEnd: { en: "End", tr: "Bitiş" },
  callsInSlot: { en: "Calls in this slot", tr: "Bu zaman dilimindeki aramalar" },
  minBetween: { en: "min | ~{interval}s between calls", tr: "dakika | aramalar arası ~{interval} saniye" },
  addSlot: { en: "Add Slot", tr: "Zaman Dilimi Ekle" },
  sendTime: { en: "Send Time (Turkey Time)", tr: "Gönderim Zamanı (Türkiye Saati)" },
  messageTemplate: { en: "Message Template", tr: "Mesaj Şablonu" },
  useName: { en: "Use {{name}} for lead's name...", tr: "Müşteri adı için {{name}} kullanın..." },
  variables: { en: "Variables: {{name}}, {{phone}}", tr: "Değişkenler: {{name}}, {{phone}}" },
  whatsappBusiness: { en: "WhatsApp Business API", tr: "WhatsApp Business API" },
  whatsappDesc: { en: "Enter your WhatsApp Cloud API credentials from Meta Business Suite.", tr: "Meta Business Suite'den WhatsApp Cloud API kimlik bilgilerinizi girin." },
  phoneNumberId: { en: "Phone Number ID", tr: "Telefon Numarası ID" },
  accessToken: { en: "Access Token", tr: "Erişim Token'ı" },
  businessAccountId: { en: "Business Account ID", tr: "İşletme Hesabı ID" },
  campaignSummary: { en: "Campaign Summary", tr: "Kampanya Özeti" },
  callDays: { en: "call day(s), {whatsapp} WhatsApp day(s), {off} off day(s).", tr: "arama günü, {whatsapp} WhatsApp günü, {off} kapalı gün." },
  totalCalls: { en: "Total calls on call days: {total}.", tr: "Arama günlerindeki toplam aramalar: {total}." },
  newLeadsAvailable: { en: "{count} new leads available.", tr: "{count} yeni müşteri mevcut." },
  cancel: { en: "Cancel", tr: "İptal" },
  deleteCampaign: { en: "Delete Campaign", tr: "Kampanyayı Sil" },
  deleteConfirm: { en: "Are you sure you want to delete \"{name}\"? This cannot be undone.", tr: "\"{name}\" kampanyasını silmek istediğinize emin misiniz? Bu işlem geri alınamaz." },
  delete: { en: "Delete", tr: "Sil" },
  at: { en: "at {time}", tr: "{time} saatinde" },
  day: { en: "Day {day}", tr: "Gün {day}" },
  noDescription: { en: "No description", tr: "Açıklama yok" },
  callsMessages: { en: "{calls} calls, {messages} messages sent", tr: "{calls} arama, {messages} mesaj gönderildi" },
};

const formatTime = (hour: number, minute: number) =>
  `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

const getSlotDuration = (slot: TimeSlot) => {
  return (slot.endHour * 60 + slot.endMinute) - (slot.startHour * 60 + slot.startMinute);
};

const getCallInterval = (slot: TimeSlot) => {
  const durationMinutes = getSlotDuration(slot);
  if (slot.callsPerSlot <= 0) return 0;
  return Math.round((durationMinutes / slot.callsPerSlot) * 60);
};

const getStatusConfig = (lang: "en" | "tr"): Record<CampaignStatus, { label: string; color: string; icon: typeof CheckCircle2 }> => ({
  idle: { label: campaignTexts.status.idle[lang], color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400", icon: AlertCircle },
  running: { label: campaignTexts.status.running[lang], color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: Play },
  paused: { label: campaignTexts.status.paused[lang], color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Square },
  completed: { label: campaignTexts.status.completed[lang], color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: CheckCircle2 },
});

// ─── Component: WhatsApp Settings ────────────────────────────────────

function WhatsAppSettings({
  config,
  onChange,
  lang = "en",
}: {
  config: { phone_number_id: string; access_token: string; business_account_id: string };
  onChange: (config: { phone_number_id: string; access_token: string; business_account_id: string }) => void;
  lang?: "en" | "tr";
}) {
  return (
    <div className="space-y-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
        <h4 className="font-semibold text-green-800 dark:text-green-300">{campaignTexts.whatsappBusiness[lang]}</h4>
      </div>
      <p className="text-xs text-green-700 dark:text-green-400 mb-3">
        {campaignTexts.whatsappDesc[lang]}
      </p>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs text-green-800 dark:text-green-300">{campaignTexts.phoneNumberId[lang]}</Label>
          <Input
            value={config.phone_number_id}
            onChange={(e) => onChange({ ...config, phone_number_id: e.target.value })}
            placeholder="e.g., 123456789012345"
            className="h-8 text-sm border-green-300 dark:border-green-700 dark:bg-green-900/30"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-green-800 dark:text-green-300">{campaignTexts.accessToken[lang]}</Label>
          <Input
            type="password"
            value={config.access_token}
            onChange={(e) => onChange({ ...config, access_token: e.target.value })}
            placeholder="EAAxxxxxxx..."
            className="h-8 text-sm border-green-300 dark:border-green-700 dark:bg-green-900/30"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-green-800 dark:text-green-300">{campaignTexts.businessAccountId[lang]}</Label>
          <Input
            value={config.business_account_id}
            onChange={(e) => onChange({ ...config, business_account_id: e.target.value })}
            placeholder="e.g., 123456789012345"
            className="h-8 text-sm border-green-300 dark:border-green-700 dark:bg-green-900/30"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Component: Day Plan Editor ──────────────────────────────────────

function DayPlanEditor({
  plan,
  onUpdate,
  lang = "en",
}: {
  plan: DayPlan;
  onUpdate: (updated: DayPlan) => void;
  lang?: "en" | "tr";
}) {
  const [expanded, setExpanded] = useState(plan.action !== "off");

  const addTimeSlot = () => {
    onUpdate({
      ...plan,
      timeSlots: [
        ...plan.timeSlots,
        { id: Date.now().toString(), startHour: 10, startMinute: 0, endHour: 11, endMinute: 0, callsPerSlot: 50 },
      ],
    });
  };

  const removeTimeSlot = (id: string) => {
    onUpdate({ ...plan, timeSlots: plan.timeSlots.filter((s) => s.id !== id) });
  };

  const updateTimeSlot = (id: string, field: keyof TimeSlot, value: number) => {
    onUpdate({
      ...plan,
      timeSlots: plan.timeSlots.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    });
  };

  const actionIcon = {
    call: <Phone className="w-4 h-4 text-blue-500" />,
    whatsapp: <MessageSquare className="w-4 h-4 text-green-500" />,
    off: <Ban className="w-4 h-4 text-gray-400" />,
  };

  const actionBg = {
    call: "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10",
    whatsapp: "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10",
    off: "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50",
  };

  return (
    <div className={cn("rounded-lg border p-3", actionBg[plan.action])}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          {actionIcon[plan.action]}
          <span className="text-sm font-medium text-gray-900 dark:text-white">{campaignTexts.dayLabels[lang][plan.day - 1]}</span>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            plan.action === "call" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
            plan.action === "whatsapp" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
            plan.action === "off" && "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
          )}>
            {campaignTexts.action[plan.action][lang]}
          </span>
          {plan.action === "whatsapp" && plan.whatsappSendHour !== undefined && (
            <span className="text-xs text-gray-500">{campaignTexts.at[lang].replace("{time}", formatTime(plan.whatsappSendHour, plan.whatsappSendMinute || 0))}</span>
          )}
        </div>
        {plan.action !== "off" ? (
          expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : null}
      </div>

      {/* Action selector (always visible) */}
      <div className="mt-2">
        <Select
          value={plan.action}
          onValueChange={(v) => {
            const newAction = v as DayActionType;
            onUpdate({
              ...plan,
              action: newAction,
              timeSlots: newAction === "call" ? (plan.timeSlots.length > 0 ? plan.timeSlots : [{ id: Date.now().toString(), startHour: 12, startMinute: 0, endHour: 13, endMinute: 0, callsPerSlot: 100 }]) : [],
              whatsappMessage: newAction === "whatsapp" ? (plan.whatsappMessage || (lang === "tr" ? "Merhaba {{name}}, sizinle tekrar iletişime geçiyoruz." : "Hello {{name}}, we're reaching out to you again.")) : undefined,
              whatsappSendHour: newAction === "whatsapp" ? (plan.whatsappSendHour ?? 10) : undefined,
              whatsappSendMinute: newAction === "whatsapp" ? (plan.whatsappSendMinute ?? 0) : undefined,
            });
            if (newAction !== "off") setExpanded(true);
          }}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">{campaignTexts.action.off[lang]}</SelectItem>
            <SelectItem value="call">{campaignTexts.action.call[lang]}</SelectItem>
            <SelectItem value="whatsapp">{campaignTexts.action.whatsapp[lang]}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expanded content for call/whatsapp */}
      {expanded && plan.action === "call" && (
        <div className="mt-3 space-y-2">
          {plan.timeSlots.map((slot, idx) => {
            const duration = getSlotDuration(slot);
            const interval = slot.callsPerSlot > 0 ? Math.round((duration / slot.callsPerSlot) * 60) : 0;
            return (
              <div key={slot.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg space-y-2 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{campaignTexts.slot[lang].replace("{num}", (idx + 1).toString())}</span>
                  {plan.timeSlots.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeTimeSlot(slot.id)} className="h-6 w-6 p-0 text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{campaignTexts.timeStart[lang]}</Label>
                    <div className="flex gap-1 items-center">
                      <Input type="number" min={0} max={23} value={slot.startHour} onChange={(e) => updateTimeSlot(slot.id, "startHour", parseInt(e.target.value) || 0)} className="w-20 min-w-[5rem] h-9 text-sm text-center tabular-nums" />
                      <span className="self-center text-xs">:</span>
                      <Input type="number" min={0} max={59} value={slot.startMinute} onChange={(e) => updateTimeSlot(slot.id, "startMinute", parseInt(e.target.value) || 0)} className="w-20 min-w-[5rem] h-9 text-sm text-center tabular-nums" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{campaignTexts.timeEnd[lang]}</Label>
                    <div className="flex gap-1 items-center">
                      <Input type="number" min={0} max={23} value={slot.endHour} onChange={(e) => updateTimeSlot(slot.id, "endHour", parseInt(e.target.value) || 0)} className="w-20 min-w-[5rem] h-9 text-sm text-center tabular-nums" />
                      <span className="self-center text-xs">:</span>
                      <Input type="number" min={0} max={59} value={slot.endMinute} onChange={(e) => updateTimeSlot(slot.id, "endMinute", parseInt(e.target.value) || 0)} className="w-20 min-w-[5rem] h-9 text-sm text-center tabular-nums" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{campaignTexts.callsInSlot[lang]}</Label>
                  <Input type="number" min={1} max={1000} value={slot.callsPerSlot} onChange={(e) => updateTimeSlot(slot.id, "callsPerSlot", parseInt(e.target.value) || 1)} className="w-full h-7 text-xs" />
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-1.5 rounded">
                  {campaignTexts.minBetween[lang].replace("{interval}", interval.toString())}
                </div>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={addTimeSlot} className="w-full h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> {campaignTexts.addSlot[lang]}
          </Button>
        </div>
      )}

      {expanded && plan.action === "whatsapp" && (
        <div className="mt-3 space-y-3">
          {/* Send Time */}
          <div className="space-y-1">
            <Label className="text-xs">{campaignTexts.sendTime[lang]}</Label>
            <div className="flex gap-1 items-center">
              <Input
                type="number" min={0} max={23}
                value={plan.whatsappSendHour ?? 10}
                onChange={(e) => onUpdate({ ...plan, whatsappSendHour: parseInt(e.target.value) || 0 })}
                className="w-20 min-w-[5rem] h-9 text-sm text-center tabular-nums"
              />
              <span className="text-xs">:</span>
              <Input
                type="number" min={0} max={59}
                value={plan.whatsappSendMinute ?? 0}
                onChange={(e) => onUpdate({ ...plan, whatsappSendMinute: parseInt(e.target.value) || 0 })}
                className="w-20 min-w-[5rem] h-9 text-sm text-center tabular-nums"
              />
              <span className="text-xs text-gray-500 ml-2">{campaignTexts.turkeyTime[lang]}</span>
            </div>
          </div>
          {/* Message */}
          <div className="space-y-1">
            <Label className="text-xs">{campaignTexts.messageTemplate[lang]}</Label>
            <Textarea
              value={plan.whatsappMessage || ""}
              onChange={(e) => onUpdate({ ...plan, whatsappMessage: e.target.value })}
              placeholder={campaignTexts.useName[lang]}
              rows={3}
              className="text-sm border-green-300 dark:border-green-700"
            />
            <p className="text-[10px] text-gray-500">{campaignTexts.variables[lang]}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function CampaignsPage() {
  const params = useParams();
  useTenant();
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = (key: keyof typeof campaignTexts): string => {
    const value = campaignTexts[key];
    if (typeof value === "object" && value !== null && "en" in value && "tr" in value) {
      const result = value[language];
      return typeof result === "string" ? result : String(result || "");
    }
    return typeof value === "string" ? value : String(value || "");
  };

  const [campaigns, setCampaigns] = useState<AutoCallCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newLeadCount, setNewLeadCount] = useState(0);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<AutoCallCampaign | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Default form: all days off
  const makeDefaultDayPlans = (): DayPlan[] =>
    Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      action: "off" as DayActionType,
      timeSlots: [],
    }));

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    timezone: "Europe/Istanbul",
    day_plans: makeDefaultDayPlans(),
    whatsapp_config: { phone_number_id: "", access_token: "", business_account_id: "" },
  });

  // Load campaigns
  const loadCampaigns = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }
    try {
      const response = await fetch(`/api/campaigns/auto-call?userId=${user.id}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) setCampaigns(result.data || []);
      }
    } catch (error) {
      console.error("Error loading campaigns:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load new lead count
  const loadNewLeadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/dashboard/leads?userId=${user.id}&status=new&countOnly=true`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) setNewLeadCount(result.count || 0);
      }
    } catch (error) {
      console.error("Error loading lead count:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) { loadCampaigns(); loadNewLeadCount(); }
    else setIsLoading(false);
  }, [user?.id, loadCampaigns, loadNewLeadCount]);

  // Auto-refresh every 30s to show cron progress
  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(() => { loadCampaigns(); }, 30000);
    return () => clearInterval(interval);
  }, [campaigns, loadCampaigns]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadCampaigns(), loadNewLeadCount()]);
    setIsRefreshing(false);
  };

  // Create campaign
  const handleCreate = async () => {
    if (!user?.id || !formData.name) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/auto-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          day_plans: formData.day_plans,
          timezone: formData.timezone,
          whatsapp_config: formData.whatsapp_config,
        }),
      });
      if (response.ok) {
        setShowCreateDialog(false);
        setFormData({ name: "", description: "", timezone: "Europe/Istanbul", day_plans: makeDefaultDayPlans(), whatsapp_config: { phone_number_id: "", access_token: "", business_account_id: "" } });
        await loadCampaigns();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create campaign");
      }
    } catch (error) {
      console.error("Error creating campaign:", error);
      alert("Failed to create campaign");
    } finally {
      setIsSaving(false);
    }
  };

  // Start campaign (assigns leads and sets status to running)
  const handleStart = async (campaign: AutoCallCampaign) => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/auto-call`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          user_id: user.id,
          action: "start",
        }),
      });
      if (response.ok) {
        await loadCampaigns();
        await loadNewLeadCount();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to start campaign");
      }
    } catch (error) {
      console.error("Error starting campaign:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Stop campaign
  const handleStop = async (campaign: AutoCallCampaign) => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/auto-call`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          user_id: user.id,
          action: "stop",
        }),
      });
      if (response.ok) await loadCampaigns();
    } catch (error) {
      console.error("Error stopping campaign:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete campaign
  const handleDelete = async () => {
    if (!selectedCampaign || !user?.id) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/campaigns/auto-call?id=${selectedCampaign.id}&userId=${user.id}`, { method: "DELETE" });
      if (response.ok) { setShowDeleteDialog(false); setSelectedCampaign(null); await loadCampaigns(); }
    } catch (error) {
      console.error("Error deleting campaign:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateDayPlan = (dayIndex: number, updated: DayPlan) => {
    const newPlans = [...formData.day_plans];
    newPlans[dayIndex] = updated;
    setFormData({ ...formData, day_plans: newPlans });
  };

  // ─── Render ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const totalCallDays = formData.day_plans.filter((p) => p.action === "call").length;
  const totalWhatsAppDays = formData.day_plans.filter((p) => p.action === "whatsapp").length;
  const totalOffDays = formData.day_plans.filter((p) => p.action === "off").length;
  const totalDailyCalls = formData.day_plans
    .filter((p) => p.action === "call")
    .reduce((sum, p) => sum + p.timeSlots.reduce((s, slot) => s + slot.callsPerSlot, 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => { setFormData({ name: "", description: "", timezone: "Europe/Istanbul", day_plans: makeDefaultDayPlans(), whatsapp_config: { phone_number_id: "", access_token: "", business_account_id: "" } }); setShowCreateDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" /> {t("newCampaign")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} /> {t("refresh")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Users className="w-6 h-6 text-blue-600 dark:text-blue-400" /></div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("newLeads")}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{newLeadCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30"><Target className="w-6 h-6 text-green-600 dark:text-green-400" /></div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("runningCampaigns")}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{campaigns.filter((c) => c.status === "running").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30"><Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" /></div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("timezone")}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{t("turkeyTime")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
        <strong>{t("howItWorks")}</strong> {t("howItWorksDesc")}
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">{t("noCampaigns")}</p>
              <Button onClick={() => { setFormData({ name: "", description: "", timezone: "Europe/Istanbul", day_plans: makeDefaultDayPlans(), whatsapp_config: { phone_number_id: "", access_token: "", business_account_id: "" } }); setShowCreateDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" /> {t("createFirst")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {campaigns.map((campaign) => {
            const plans: DayPlan[] = campaign.day_plans || [];
            const status = campaign.status || "idle";
            const statusCfg = getStatusConfig(language)[status];
            const StatusIcon = statusCfg.icon;
            const progress = campaign.progress;
            const currentDay = progress?.current_day || 0;

            return (
            <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{campaign.name}</CardTitle>
                      <CardDescription className="mt-1 truncate">{campaign.description || t("noDescription")}</CardDescription>
                  </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      {status === "idle" || status === "paused" || status === "completed" ? (
                    <Button
                          variant="default" size="sm"
                          onClick={() => handleStart(campaign)}
                          disabled={isSaving || newLeadCount === 0}
                          className="h-8 bg-green-600 hover:bg-green-700"
                        >
                          <Play className="w-4 h-4 mr-1" />
                          {status === "completed" ? t("restart") : t("start")}
                        </Button>
                      ) : (
                        <Button variant="destructive" size="sm" onClick={() => handleStop(campaign)} disabled={isSaving} className="h-8">
                          <Square className="w-4 h-4 mr-1" /> {t("stop")}
                    </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedCampaign(campaign); setShowDeleteDialog(true); }} className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
                <CardContent className="space-y-3">
                  {/* 7-Day Visual */}
                  <div className="flex gap-1">
                    {plans.map((plan, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex-1 h-10 rounded flex flex-col items-center justify-center text-[10px] font-medium relative",
                          plan.action === "call" && "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
                          plan.action === "whatsapp" && "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
                          plan.action === "off" && "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
                          currentDay === idx + 1 && status === "running" && "ring-2 ring-blue-500"
                        )}
                        title={`Day ${idx + 1}: ${plan.action}`}
                      >
                        <span>{idx + 1}</span>
                        {plan.action === "call" ? <Phone className="w-3 h-3" /> : plan.action === "whatsapp" ? <MessageSquare className="w-3 h-3" /> : <span className="text-[8px]">off</span>}
                      </div>
                    ))}
                        </div>

                  {/* Progress (if running) */}
                  {status === "running" && progress && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-1">
                      <div className="flex justify-between text-xs text-blue-800 dark:text-blue-300">
                        <span>{(t("dayOf") || "").replace("{current}", currentDay.toString())}</span>
                        <span>{(t("callsMessages") || "").replace("{calls}", progress.total_calls.toString()).replace("{messages}", progress.total_messages.toString())}</span>
                        </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${(currentDay / 7) * 100}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Slot details */}
                  <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    {plans.filter((p) => p.action === "call").map((day) => (
                      <div key={day.day} className="flex items-center gap-2">
                        <Phone className="w-3 h-3 text-blue-400" />
                        <span>{(t("day") || "").replace("{day}", day.day.toString())}: {day.timeSlots.map((s) => `${formatTime(s.startHour, s.startMinute)}–${formatTime(s.endHour, s.endMinute)} (${s.callsPerSlot})`).join(", ")}</span>
                      </div>
                    ))}
                    {plans.filter((p) => p.action === "whatsapp").map((day) => (
                      <div key={day.day} className="flex items-center gap-2">
                        <MessageSquare className="w-3 h-3 text-green-400" />
                        <span>{(t("day") || "").replace("{day}", day.day.toString())}: {campaignTexts.action.whatsapp[language]} {(t("at") || "").replace("{time}", formatTime(day.whatsappSendHour ?? 10, day.whatsappSendMinute ?? 0))}</span>
                </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t dark:border-gray-700">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      <span>{format(new Date(campaign.created_at), "MMM d, yyyy")}</span>
                      {campaign.assigned_lead_ids && (
                        <span className="ml-2">{campaign.assigned_lead_ids.length} {t("leadsAssigned")}</span>
                      )}
                    </div>
                    <span className={cn("px-2 py-1 text-xs rounded-full font-medium flex items-center gap-1", statusCfg.color)}>
                      <StatusIcon className="w-3 h-3" />
                      {statusCfg.label}
                  </span>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createCampaign")}</DialogTitle>
            <DialogDescription>{t("createCampaignDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("campaignName")}</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={language === "tr" ? "örn. Haftalık Müşteri Arama" : "e.g., Weekly Lead Outreach"} />
              </div>
              <div className="space-y-1">
                <Label>{t("description")}</Label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("optionalDesc")} />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">{t("dayPlan")}</Label>
            <div className="space-y-2">
                {formData.day_plans.map((plan, idx) => (
                  <DayPlanEditor key={plan.day} plan={plan} lang={language} onUpdate={(updated) => updateDayPlan(idx, updated)} />
                ))}
              </div>
            </div>

            {formData.day_plans.some((p) => p.action === "whatsapp") && (
              <WhatsAppSettings lang={language} config={formData.whatsapp_config} onChange={(config) => setFormData({ ...formData, whatsapp_config: config })} />
            )}

            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">{t("campaignSummary")}</p>
              <p className="text-sm text-green-700 dark:text-green-400">
                {(t("callDays") || "").replace("{whatsapp}", totalWhatsAppDays.toString()).replace("{off}", totalOffDays.toString())}
                {totalDailyCalls > 0 && ` ${(t("totalCalls") || "").replace("{total}", totalDailyCalls.toString())}`}
                {newLeadCount > 0 && ` ${(t("newLeadsAvailable") || "").replace("{count}", newLeadCount.toString())}`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreate} disabled={isSaving || !formData.name}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {t("createCampaign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteCampaign")}</DialogTitle>
            <DialogDescription>{(t("deleteConfirm") || "").replace("{name}", selectedCampaign?.name || "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {t("delete")}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
