"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { useLanguage } from "@/lib/i18n";
import type { Lead, LeadStatus, LeadPriority } from "@/lib/types-outbound";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  RefreshCw, 
  Phone,
  Filter,
  Upload,
  Users,
  Loader2,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Tag,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Leads translations
const leadsTexts = {
  title: { en: "Leads", tr: "Müşteri Adayları" },
  subtitle: { en: "Manage your customer leads", tr: "Müşteri adaylarınızı yönetin" },
  searchPlaceholder: { en: "Search leads...", tr: "Müşteri adaylarında ara..." },
  status: { en: "Status", tr: "Durum" },
  allStatus: { en: "All Status", tr: "Tüm Durumlar" },
  sort: { en: "Sort", tr: "Sırala" },
  newestFirst: { en: "Newest First", tr: "En Yeni" },
  oldestFirst: { en: "Oldest First", tr: "En Eski" },
  priorityHighLow: { en: "Priority: High→Low", tr: "Öncelik: Yüksek→Düşük" },
  priorityLowHigh: { en: "Priority: Low→High", tr: "Öncelik: Düşük→Yüksek" },
  lastActivity: { en: "Last Activity", tr: "Son Aktivite" },
  statusPriority: { en: "Status Priority", tr: "Durum Önceliği" },
  evalScore: { en: "Evaluation score", tr: "Puan" },
  quick: { en: "Quick:", tr: "Hızlı:" },
  new: { en: "New", tr: "Yeni" },
  contacted: { en: "Contacted", tr: "İletişime Geçildi" },
  selectAll: { en: "Select All", tr: "Tümünü Seç" },
  selectPage: { en: "Select Page", tr: "Sayfayı Seç" },
  deselect: { en: "Deselect", tr: "Seçimi Kaldır" },
  statusBulk: { en: "Status", tr: "Durum" },
  call: { en: "Call", tr: "Ara" },
  delete: { en: "Delete", tr: "Sil" },
  noLeads: { en: "No leads found", tr: "Müşteri adayı bulunamadı" },
  addLead: { en: "Add Lead", tr: "Aday Ekle" },
  customer: { en: "Customer", tr: "Müşteri" },
  phone: { en: "Phone", tr: "Telefon" },
  calls: { en: "Calls", tr: "Aramalar" },
  eval: { en: "Eval", tr: "Puan" },
  evalFilterAll: { en: "All", tr: "Tümü" },
  evalFilter6Plus: { en: "Score 6+", tr: "Puan 6+" },
  evalFilter1to6: { en: "Score 1–6", tr: "Puan 1–6" },
  evalFilterVOrF: { en: "V or F", tr: "V veya F" },
  priority: { en: "Priority", tr: "Öncelik" },
  lastContact: { en: "Last Contact", tr: "Son İletişim" },
  noPhone: { en: "No phone", tr: "Telefon yok" },
  called: { en: "x called", tr: "x arandı" },
  prev: { en: "Prev", tr: "Önceki" },
  next: { en: "Next", tr: "Sonraki" },
  of: { en: "of", tr: "/" },
  editLead: { en: "Edit Lead", tr: "Adayı Düzenle" },
  addNewLead: { en: "Add New Lead", tr: "Yeni Aday Ekle" },
  updateLeadInfo: { en: "Update lead information", tr: "Aday bilgilerini güncelle" },
  enterLeadDetails: { en: "Enter lead details", tr: "Aday detaylarını girin" },
  fullName: { en: "Full Name *", tr: "Ad Soyad *" },
  phoneE164: { en: "Phone (E.164 format)", tr: "Telefon (E.164 formatı)" },
  phonePlaceholder: { en: "+33768163591, +12125551234, +903129114094", tr: "+33768163591, +12125551234, +903129114094" },
  phoneFormat: { en: "International format: +[country code][number] (e.g., +33 for France, +1 for US/Canada)", tr: "Uluslararası format: +[ülke kodu][numara] (örn. +33 Fransa, +1 ABD/Kanada)" },
  notes: { en: "Notes", tr: "Notlar" },
  notesPlaceholder: { en: "Additional notes...", tr: "Ek notlar..." },
  cancel: { en: "Cancel", tr: "İptal" },
  saveChanges: { en: "Save Changes", tr: "Değişiklikleri Kaydet" },
  deleteLead: { en: "Delete Lead", tr: "Adayı Sil" },
  deleteConfirm: { en: "Are you sure you want to delete {name}? This action cannot be undone.", tr: "{name} adayını silmek istediğinize emin misiniz? Bu işlem geri alınamaz." },
  deleteSelected: { en: "Delete Selected Leads", tr: "Seçili Adayları Sil" },
  deleteSelectedConfirm: { en: "Are you sure you want to delete {count} lead(s)? This action cannot be undone and will permanently remove them from the database.", tr: "{count} adayı silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve veritabanından kalıcı olarak kaldırılacaktır." },
  deleteLeads: { en: "Delete {count} Lead(s)", tr: "{count} Adayı Sil" },
  callSelected: { en: "Call Selected Leads", tr: "Seçili Adayları Ara" },
  callSelectedDesc: { en: "You are about to call {count} lead(s). Calls will be made one by one with a 3 second delay between each call.", tr: "{count} adayı aramak üzeresiniz. Aramalar 3 saniye arayla sırayla yapılacaktır." },
  callNote: { en: "Note:", tr: "Not:" },
  callNoteDesc: { en: "This will initiate actual phone calls to the selected leads. Make sure your assistant is properly configured and you have enough credits.", tr: "Bu, seçili adaylara gerçek telefon aramaları başlatacaktır. Asistanınızın düzgün yapılandırıldığından ve yeterli krediniz olduğundan emin olun." },
  startCalling: { en: "Start Calling ({count})", tr: "Aramaya Başla ({count})" },
  calling: { en: "Calling {current}/{total}", tr: "Aranıyor {current}/{total}" },
  currentlyCalling: { en: "Currently calling: {name}", tr: "Şu anda aranıyor: {name}" },
  callInitiated: { en: "Call Initiated", tr: "Arama Başlatıldı" },
  callSuccess: { en: "Successfully started call to {name}", tr: "{name} için arama başarıyla başlatıldı" },
  importLeads: { en: "Import Leads", tr: "Adayları İçe Aktar" },
  leadsFound: { en: "{count} leads found", tr: "{count} aday bulundu" },
  name: { en: "Name", tr: "İsim" },
  importButton: { en: "Import", tr: "İçe Aktar" },
  importLeadsCount: { en: "Import {count} Leads", tr: "{count} Adayı İçe Aktar" },
  updateStatus: { en: "Update Status", tr: "Durumu Güncelle" },
  changeStatus: { en: "Change status for {count} selected lead(s).", tr: "{count} seçili adayın durumunu değiştir." },
  newStatus: { en: "New Status", tr: "Yeni Durum" },
  updateLeads: { en: "Update {count} Lead(s)", tr: "{count} Adayı Güncelle" },
  duplicatePhones: { en: "Duplicate Phone Numbers", tr: "Yinelenen Telefon Numaraları" },
  duplicateDesc: { en: "The following phone numbers appear more than once in your leads.", tr: "Aşağıdaki telefon numaraları adaylarınızda birden fazla kez görünüyor." },
  removeDuplicate: { en: "Remove duplicate", tr: "Yineleneni kaldır" },
  close: { en: "Close", tr: "Kapat" },
  leadDetails: { en: "Lead Details", tr: "Aday Detayları" },
  leadInfo: { en: "Lead Information", tr: "Aday Bilgileri" },
  importedDetails: { en: "İmport Edilen Detaylar", tr: "İçe Aktarılan Detaylar" },
  dataDropped: { en: "Data Düşen Tarih", tr: "Data Düşen Tarih" },
  dataCalled: { en: "Data Aranan Tarih", tr: "Data Aranan Tarih" },
  call1: { en: "1. Arama", tr: "1. Arama" },
  call2: { en: "2. Arama", tr: "2. Arama" },
  call3: { en: "3. Arama", tr: "3. Arama" },
  call4: { en: "4. Arama", tr: "4. Arama" },
  postCallStatus: { en: "Görüşme Sonrası Durum", tr: "Görüşme Sonrası Durum" },
  treatmentInterest: { en: "Bilgi Almak İstediği Konu", tr: "Bilgi Almak İstediği Konu" },
  firstContactDate: { en: "First Contact Date", tr: "İlk İletişim Tarihi" },
  lastContactDate: { en: "Last Contact Date", tr: "Son İletişim Tarihi" },
  edit: { en: "Edit", tr: "Düzenle" },
  export: { en: "Export", tr: "Dışa Aktar" },
  duplicates: { en: "Duplicate{plural}", tr: "Yinelenen{plural}" },
  statusLabels: {
    new: { en: "New", tr: "Yeni" },
    contacted: { en: "Contacted", tr: "İletişime Geçildi" },
    interested: { en: "Interested", tr: "İlgili" },
    appointment_set: { en: "Appointment", tr: "Randevu" },
    converted: { en: "Converted", tr: "Dönüştürüldü" },
    unreachable: { en: "Unreachable", tr: "Ulaşılamadi" },
    lost: { en: "Lost", tr: "Kayıp" },
  },
  priorityLabels: {
    high: { en: "High", tr: "Yüksek" },
    medium: { en: "Medium", tr: "Orta" },
    low: { en: "Low", tr: "Düşük" },
  },
};

const getStatusConfig = (lang: "en" | "tr"): Record<LeadStatus, { label: string; color: string }> => ({
  new: { label: leadsTexts.statusLabels.new[lang], color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" },
  contacted: { label: leadsTexts.statusLabels.contacted[lang], color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" },
  interested: { label: leadsTexts.statusLabels.interested[lang], color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
  appointment_set: { label: leadsTexts.statusLabels.appointment_set[lang], color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" },
  converted: { label: leadsTexts.statusLabels.converted[lang], color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
  unreachable: { label: leadsTexts.statusLabels.unreachable[lang], color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
  lost: { label: leadsTexts.statusLabels.lost[lang], color: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" },
});

const getPriorityConfig = (lang: "en" | "tr"): Record<LeadPriority, { label: string; color: string }> => ({
  high: { label: leadsTexts.priorityLabels.high[lang], color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
  medium: { label: leadsTexts.priorityLabels.medium[lang], color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
  low: { label: leadsTexts.priorityLabels.low[lang], color: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" },
});

export default function LeadsPage() {
  const router = useRouter();
  const params = useParams();
  const tenant = params?.tenant as string;
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const t = (key: keyof typeof leadsTexts): string => {
    const value = leadsTexts[key];
    if (typeof value === "object" && value !== null && "en" in value && "tr" in value) {
      const result = value[language];
      return typeof result === "string" ? result : String(result || "");
    }
    return typeof value === "string" ? value : String(value || "");
  };
  
  const statusConfig = getStatusConfig(language);
  const priorityConfig = getPriorityConfig(language);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start as false, will be set to true when loading
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(""); // Debounced search query
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [sortBy, setSortBy] = useState<"created_at" | "priority" | "last_contact_date" | "status" | "eval_score">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [evalFilter, setEvalFilter] = useState<"all" | "6plus" | "1-6" | "v-or-f">("all");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkCallDialog, setShowBulkCallDialog] = useState(false);
  const [showLeadDetailDialog, setShowLeadDetailDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkCalling, setIsBulkCalling] = useState(false);
  const [bulkCallProgress, setBulkCallProgress] = useState({ current: 0, total: 0, currentName: "" });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvData, setCsvData] = useState<Partial<Lead>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [callSuccess, setCallSuccess] = useState<{ show: boolean; leadName?: string; count?: number }>({ show: false });
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<LeadStatus>("contacted");
  const [duplicateWarnings, setDuplicateWarnings] = useState<{ phone: string; count: number; names: string[]; leadIds: string[] }[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [evaluationHistory, setEvaluationHistory] = useState<Record<string, string[]>>({});
  const [callCountsFromApi, setCallCountsFromApi] = useState<Record<string, number>>({});

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    status: "new" as LeadStatus,
    priority: "medium" as LeadPriority,
    notes: "",
    language: "tr" as "tr" | "en",
  });

  // Debounce search query - wait 500ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load leads function - use useCallback to prevent infinite loops
  const loadLeads = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        userId: user.id,
        page: currentPage.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(evalFilter !== "all" && { evalFilter }),
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      
      const response = await fetch(`/api/dashboard/leads?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Server handles priority sorting correctly (high -> medium -> low)
          setLeads(data.data || []);
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages || 1);
            setTotalLeads(data.pagination.total || 0);
            // Only update currentPage if it's different (to avoid loops)
            if (data.pagination.page && data.pagination.page !== currentPage) {
              setCurrentPage(data.pagination.page);
            }
          }
        } else {
          console.error("Failed to load leads:", data.error);
          setLeads([]);
        }
      } else {
        console.error("Failed to load leads:", response.statusText);
        setLeads([]);
      }
    } catch (error) {
      console.error("Error loading leads:", error);
      setLeads([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, currentPage, statusFilter, evalFilter, debouncedSearch, sortBy, sortOrder]);

  // EVAL and call counts: from calls table only (same source as Calls screen), not Vapi evaluation API
  useEffect(() => {
    if (!user?.id || leads.length === 0) {
      setEvaluationHistory({});
      setCallCountsFromApi({});
      return;
    }
    const leadIds = leads.map((l) => l.id).join(",");
    fetch(`/api/dashboard/leads/evaluation-history?userId=${user.id}&leadIds=${encodeURIComponent(leadIds)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (data.data) setEvaluationHistory(data.data);
          else setEvaluationHistory({});
          if (data.callCounts && typeof data.callCounts === "object") setCallCountsFromApi(data.callCounts);
          else setCallCountsFromApi({});
        } else {
          setEvaluationHistory({});
          setCallCountsFromApi({});
        }
      })
      .catch(() => {
        setEvaluationHistory({});
        setCallCountsFromApi({});
      });
  }, [user?.id, leads]);

  // Separate effect for initial load and auth changes
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      setIsLoading(true); // Show loading while auth is loading
      return;
    }
    
    // Auth is loaded, now check user
    if (user?.id) {
      // User exists, load leads
      loadLeads();
    } else {
      // User not found after auth loaded - could be not authenticated
      console.log("User not found after auth loaded");
      setIsLoading(false);
      setLeads([]); // Clear leads if no user
      setTotalLeads(0);
      setTotalPages(1);
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]); // Only depend on user and auth loading

  // Separate effect for page, filter, search, and sort changes
  useEffect(() => {
    if (user?.id && !authLoading) {
      loadLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, statusFilter, evalFilter, debouncedSearch, sortBy, sortOrder]); // Reload when any of these change

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadLeads();
    setIsRefreshing(false);
  };

  // Filter leads (client-side filtering is now minimal since server handles it)
  const filteredLeads = leads;

  // When search, status filter, eval filter, or sort changes, reset to page 1
  useEffect(() => {
    if (user?.id && !authLoading && currentPage !== 1) {
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, evalFilter, sortBy, sortOrder]);

  // Reset form
  const resetForm = () => {
    setFormData({
      full_name: "",
      phone: "",
      email: "",
      status: "new",
      priority: "medium",
      notes: "",
      language: "tr",
    });
  };

  // Handle add lead
  const handleAddLead = async () => {
    console.log("handleAddLead called", { fullName: formData.full_name, userId: user?.id, authLoading });
    
    if (!formData.full_name) {
      alert("Please enter a full name for the lead.");
      return;
    }
    
    if (authLoading) {
      alert("Please wait for authentication to complete. Try again in a moment.");
      return;
    }
    
    if (!user?.id) {
      console.error("User not loaded yet", { user, authLoading });
      alert("Please wait for authentication to complete. Try again in a moment.");
      return;
    }
    
    setIsSaving(true);

    try {
      // Format phone number: ensure it starts with +
      let phoneNumber = formData.phone.trim();
      if (phoneNumber && !phoneNumber.startsWith("+")) {
        phoneNumber = "+" + phoneNumber.replace(/^\+/, ""); // Remove any existing + and add new one
      }
      
      const response = await fetch(`/api/dashboard/leads?userId=${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, phone: phoneNumber, user_id: user.id }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        await loadLeads();
        setShowAddDialog(false);
        resetForm();
      } else {
        console.error("Error adding lead:", result.error || "Unknown error");
        alert(result.error || "Failed to add lead. Please try again.");
      }
    } catch (error) {
      console.error("Error adding lead:", error);
      alert("An error occurred while adding the lead. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle edit lead
  const handleEditLead = async () => {
    if (!selectedLead || !user?.id) return;
    setIsSaving(true);

    try {
      // Format phone number: ensure it starts with +
      let phoneNumber = formData.phone.trim();
      if (phoneNumber && !phoneNumber.startsWith("+")) {
        phoneNumber = "+" + phoneNumber.replace(/^\+/, ""); // Remove any existing + and add new one
      }
      
      const response = await fetch(`/api/dashboard/leads?id=${selectedLead.id}&userId=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, phone: phoneNumber }),
      });
      
      if (response.ok) {
        await loadLeads();
        setShowEditDialog(false);
        setSelectedLead(null);
        resetForm();
      }
    } catch (error) {
      console.error("Error updating lead:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete lead
  const handleDeleteLead = async () => {
    if (!selectedLead || !user?.id) return;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/dashboard/leads?id=${selectedLead.id}&userId=${user.id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        await loadLeads();
        setShowDeleteDialog(false);
        setSelectedLead(null);
      }
    } catch (error) {
      console.error("Error deleting lead:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle bulk delete leads
  const handleBulkDeleteLeads = async () => {
    if (selectedLeadIds.size === 0 || !user?.id) return;
    setIsSaving(true);

    try {
      const ids = Array.from(selectedLeadIds);
      console.log(`Deleting ${ids.length} leads:`, ids);
      
      const response = await fetch(`/api/dashboard/leads?userId=${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const data = await response.json();
      console.log("Delete response:", data);

      if (response.ok && data.success) {
        console.log(`Successfully deleted ${ids.length} leads`);
        await loadLeads();
        setShowBulkDeleteDialog(false);
        setSelectedLeadIds(new Set());
      } else {
        // Handle API error response
        const errorMessage = data.error || `Failed to delete leads (${response.status})`;
        console.error("Delete failed:", errorMessage, data);
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error deleting leads:", error);
      alert("An error occurred while deleting leads. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle bulk call leads - calls selected leads one by one with 3 second delay
  const handleBulkCallLeads = async () => {
    if (selectedLeadIds.size === 0 || !user?.id) return;
    
    setIsBulkCalling(true);
    setShowBulkCallDialog(false);
    
    const ids = Array.from(selectedLeadIds);
    const totalLeadsToCall = ids.length;
    let successCount = 0;
    
    setBulkCallProgress({ current: 0, total: totalLeadsToCall, currentName: "" });

    try {
      // Get lead details for all selected IDs
      const leadsToCall = leads.filter(lead => ids.includes(lead.id) && lead.phone);
      
      if (leadsToCall.length === 0) {
        alert("No leads with phone numbers found in selection.");
        setIsBulkCalling(false);
        return;
      }

      for (let i = 0; i < leadsToCall.length; i++) {
        const lead = leadsToCall[i];
        if (!lead) continue;
        
        setBulkCallProgress({ 
          current: i + 1, 
          total: leadsToCall.length, 
          currentName: lead.full_name || lead.phone || "Unknown" 
        });

        try {
          const response = await fetch("/api/outreach/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lead_id: lead.id,
              channel: "call",
              direct_call: true,
            }),
          });

          const data = await response.json();
          
          if (response.ok && data.success) {
            successCount++;
            console.log(`Successfully initiated call ${i + 1}/${leadsToCall.length} to ${lead.full_name}`);
          } else {
            console.error(`Call ${i + 1} failed:`, data.message || "Unknown error");
          }
        } catch (error) {
          console.error(`Error calling lead ${lead.full_name}:`, error);
        }

        // Wait 3 seconds between calls (except for the last one)
        if (i < leadsToCall.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Show success notification
      setCallSuccess({ 
        show: true, 
        leadName: `${successCount} leads`, 
        count: successCount 
      });
      setTimeout(() => {
        setCallSuccess({ show: false });
      }, 5000);

      // Refresh leads and clear selection
      await loadLeads();
      setSelectedLeadIds(new Set());
      
    } catch (error) {
      console.error("Error in bulk call:", error);
      alert("An error occurred during bulk calling. Some calls may have been made.");
    } finally {
      setIsBulkCalling(false);
      setBulkCallProgress({ current: 0, total: 0, currentName: "" });
    }
  };

  // Handle bulk status update
  const handleBulkStatusUpdate = async () => {
    if (selectedLeadIds.size === 0 || !user?.id) return;
    setIsSaving(true);
    try {
      const ids = Array.from(selectedLeadIds);
      let successCount = 0;
      // Update in batches of 20
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20);
        const promises = batch.map((id) =>
          fetch(`/api/dashboard/leads?id=${id}&userId=${user!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: bulkStatusValue }),
          })
        );
        const results = await Promise.all(promises);
        successCount += results.filter((r) => r.ok).length;
      }
      await loadLeads();
      setShowBulkStatusDialog(false);
      setSelectedLeadIds(new Set());
      alert(`Successfully updated ${successCount} lead(s) to "${statusConfig[bulkStatusValue].label}"`);
    } catch (error) {
      console.error("Error bulk updating status:", error);
      alert("An error occurred while updating leads.");
    } finally {
      setIsSaving(false);
    }
  };

  // Export leads to CSV
  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = ["Name", "Phone", "Email", "Status", "Priority", "Contact Attempts", "Last Contact", "Notes", "Created"];
    const rows = leads.map((lead) => [
      lead.full_name || "",
      lead.phone || "",
      lead.email || "",
      statusConfig[lead.status]?.label || lead.status,
      priorityConfig[lead.priority]?.label || lead.priority,
      (lead.contact_attempts || 0).toString(),
      lead.last_contact_date ? format(new Date(lead.last_contact_date), "yyyy-MM-dd HH:mm") : "",
      (lead.notes || "").replace(/\n/g, " "),
      format(new Date(lead.created_at), "yyyy-MM-dd"),
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check for duplicate phone numbers
  const checkDuplicates = useCallback(() => {
    const phoneMap = new Map<string, { count: number; names: string[]; leadIds: string[] }>();
    for (const lead of leads) {
      if (!lead.phone) continue;
      const normalized = lead.phone.replace(/\s/g, "");
      const existing = phoneMap.get(normalized);
      if (existing) {
        existing.count++;
        existing.names.push(lead.full_name || "Unknown");
        existing.leadIds.push(lead.id);
      } else {
        phoneMap.set(normalized, { count: 1, names: [lead.full_name || "Unknown"], leadIds: [lead.id] });
      }
    }
    const dupes = Array.from(phoneMap.entries())
      .filter(([, v]) => v.count > 1)
      .map(([phone, v]) => ({ phone, count: v.count, names: v.names, leadIds: v.leadIds }));
    setDuplicateWarnings(dupes);
  }, [leads]);

  useEffect(() => {
    checkDuplicates();
  }, [checkDuplicates]);

  const handleRemoveDuplicateLead = useCallback(async (leadId: string, name: string) => {
    if (!user?.id) return;
    if (!confirm(t("deleteConfirm").replace("{name}", name || "this lead"))) return;
    try {
      const response = await fetch(`/api/dashboard/leads?id=${leadId}&userId=${user.id}`, { method: "DELETE" });
      if (response.ok) {
        await loadLeads();
        checkDuplicates();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || "Failed to delete lead.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred while deleting the lead.");
    }
  }, [user?.id, loadLeads, checkDuplicates]);

  // Toggle select all - fetches ALL lead IDs from API, not just current page
  const toggleSelectAll = async () => {
    if (!user?.id) return;
    
    // If all are already selected (approximate check), deselect all
    if (selectedLeadIds.size > 0 && selectedLeadIds.size >= totalLeads && totalLeads > 0) {
      setSelectedLeadIds(new Set());
      return;
    }
    
    // Otherwise, fetch ALL lead IDs from API
    try {
      const queryParams = new URLSearchParams({
        userId: user.id,
        idsOnly: "true", // Request only IDs, not full data
        sortBy: sortBy,
        sortOrder: sortOrder,
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      
      const response = await fetch(`/api/dashboard/leads?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // When idsOnly=true, API returns array of string IDs directly
          const allIds = Array.isArray(data.data) ? data.data : [];
          setSelectedLeadIds(new Set(allIds));
        }
      }
    } catch (error) {
      console.error("Error fetching all lead IDs:", error);
      // Fallback: select only current page leads
      setSelectedLeadIds(new Set(filteredLeads.map(lead => lead.id)));
    }
  };

  // Select only leads on the current page (up to 100 or fewer)
  const selectCurrentPage = () => {
    const pageIds = leads.map((lead) => lead.id);
    setSelectedLeadIds(new Set(pageIds));
  };

  // Toggle single lead selection
  const toggleLeadSelection = (leadId: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeadIds(newSelected);
  };

  // Open edit dialog
  const openEditDialog = (lead: Lead) => {
    setSelectedLead(lead);
    setFormData({
      full_name: lead.full_name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      status: lead.status,
      priority: lead.priority,
      notes: lead.notes || "",
      language: lead.language || "tr",
    });
    setShowEditDialog(true);
  };

  // Helper function to get priority from Excel row color
  const getPriorityFromColor = (worksheet: XLSX.WorkSheet, rowIndex: number): LeadPriority => {
    // Excel row numbers are 1-indexed, and we skip header (row 1), so rowIndex + 2
    const excelRowNum = rowIndex + 2;
    
    // Check first few cells of the row for background color
    // Usually columns A, B, C, D have the same background color for the entire row
    const cellsToCheck = ['A', 'B', 'C', 'D', 'E'];
    
    for (const col of cellsToCheck) {
      const cellAddress = `${col}${excelRowNum}`;
      const cell = worksheet[cellAddress];
      
      if (!cell || !cell.s) continue;
      
      // Check fill color - can be in different locations
      let rgbHex = '';
      
      // Try cell.s.fill.fgColor.rgb (most common)
      if (cell.s.fill && cell.s.fill.fgColor && cell.s.fill.fgColor.rgb) {
        rgbHex = cell.s.fill.fgColor.rgb.toString().toUpperCase();
      }
      // Try cell.s.fill.bgColor.rgb (sometimes used)
      else if (cell.s.fill && cell.s.fill.bgColor && cell.s.fill.bgColor.rgb) {
        rgbHex = cell.s.fill.bgColor.rgb.toString().toUpperCase();
      }
      // Try cell.s.fgColor.rgb (alternative location)
      else if (cell.s.fgColor && cell.s.fgColor.rgb) {
        rgbHex = cell.s.fgColor.rgb.toString().toUpperCase();
      }
      
      if (!rgbHex) continue;
      
      // Remove alpha channel if present (first 2 chars if 8 digits)
      if (rgbHex.length === 8) {
        rgbHex = rgbHex.substring(2);
      }
      
      // Convert hex to RGB
      if (rgbHex.length === 6) {
        const r = parseInt(rgbHex.substring(0, 2), 16);
        const g = parseInt(rgbHex.substring(2, 4), 16);
        const b = parseInt(rgbHex.substring(4, 6), 16);
        
        // Debug log for first few rows
        if (rowIndex < 10) {
          console.log(`Row ${excelRowNum}, Cell ${cellAddress}: RGB(${r}, ${g}, ${b}), Hex: #${rgbHex}`);
        }
        
        // Green (High priority): RGB(198, 239, 206) = #C6EFCE
        // Check if it's close to green - more lenient matching
        // Green has high G value, medium R and B
        const greenMatch = g > 220 && r < 220 && b < 220 && (g - r) > 20 && (g - b) > 20;
        if (greenMatch) {
          console.log(`Row ${excelRowNum}: Detected GREEN (High priority) - RGB(${r}, ${g}, ${b})`);
          return 'high';
        }
        
        // Red/Pink (Low priority): RGB(255, 199, 206) = #FFC7CE
        // Check if it's close to red/pink - high R value, medium G and B
        const redMatch = r > 240 && g < 220 && b < 220 && (r - g) > 30 && (r - b) > 30;
        if (redMatch) {
          console.log(`Row ${excelRowNum}: Detected RED/PINK (Low priority) - RGB(${r}, ${g}, ${b})`);
          return 'low';
        }
        
        // Also check exact hex matches
        if (rgbHex === 'C6EFCE' || rgbHex === 'FFC6EFCE') {
          console.log(`Row ${excelRowNum}: Exact GREEN match (High priority)`);
          return 'high';
        }
        if (rgbHex === 'FFC7CE' || rgbHex === 'FFFFC7CE') {
          console.log(`Row ${excelRowNum}: Exact RED/PINK match (Low priority)`);
          return 'low';
        }
      }
    }
    
    // Default to medium if color not recognized
    return 'medium';
  };

  // Parse Excel/CSV file
  const parseFileData = (data: any[][], headers: string[], worksheet?: XLSX.WorkSheet): Partial<Lead>[] => {
    const parsed: Partial<Lead>[] = [];
    
    // Map Turkish column names to fields
    const columnMap: Record<string, string> = {
      "data düşen tarih": "date_dropped",
      "data aranan tarih": "date_called",
      "ad soyad": "full_name",
      "adı soyadı": "full_name",
      "isim soyisim": "full_name",
      "telefon no": "phone",
      "telefon": "phone",
      "telefon numarası": "phone",
      "bilgi almak istediği konu": "treatment_interest",
      "konu": "treatment_interest",
      "1. arama": "call_1_date",
      "2. arama": "call_2_date",
      "3. arama": "call_3_date",
      "4. arama": "call_4_date",
      "görüşme sonrası durum": "post_call_status",
      "durum": "post_call_status",
      "email": "email",
      "e-posta": "email",
      "e mail": "email",
    };
    
    // Normalize headers
    const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      // Get priority from Excel row color if worksheet is provided
      let priority: LeadPriority = "medium";
      if (worksheet) {
        priority = getPriorityFromColor(worksheet, i);
      }
      
      const lead: Partial<Lead> & { form_data?: Record<string, unknown> } = {
        status: "new",
        priority: priority,
        language: "tr",
        form_data: {},
      };
      
      normalizedHeaders.forEach((header, index) => {
        const value = row[index]?.toString().trim() || "";
        if (!value || value === "x" || value.toLowerCase() === "x") return;
        
        const mappedField = columnMap[header];
        
        if (mappedField === "full_name") {
          lead.full_name = value;
        } else if (mappedField === "phone") {
          // Remove all spaces first
          let cleanedPhone = value.replace(/\s+/g, "");
          // Add + prefix if it doesn't start with it and is not empty
          if (cleanedPhone && !cleanedPhone.startsWith("+")) {
            cleanedPhone = "+" + cleanedPhone;
          }
          lead.phone = cleanedPhone;
        } else if (mappedField === "email") {
          lead.email = value;
        } else if (mappedField === "treatment_interest") {
          lead.treatment_interest = value;
          if (!lead.notes) lead.notes = value;
        } else if (mappedField === "post_call_status") {
          if (!lead.notes) {
            lead.notes = value;
          } else {
            lead.notes = `${lead.notes}\n${value}`;
          }
        } else if (mappedField && lead.form_data) {
          // Store other fields in form_data
          lead.form_data[mappedField] = value;
        }
      });
      
      // Combine notes if both treatment_interest and post_call_status exist
      if (lead.treatment_interest && lead.notes && lead.notes !== lead.treatment_interest) {
        lead.notes = `${lead.treatment_interest}\n\nGörüşme Sonrası Durum: ${lead.notes}`;
      } else if (lead.treatment_interest && !lead.notes) {
        lead.notes = lead.treatment_interest;
      }
      
      if (lead.full_name || lead.phone || lead.email) {
        parsed.push(lead);
      }
    }
    
    return parsed;
  };

  // Handle CSV/XLSX upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // Handle Excel file
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          if (!data) return;
          
          // Read with cellStyles enabled to get background colors
          const workbook = XLSX.read(data, { type: 'binary', cellStyles: true });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            alert("Excel dosyasında sheet bulunamadı.");
            return;
          }
          const worksheet = workbook.Sheets[firstSheetName];
          if (!worksheet) {
            alert("Excel sheet'i okunamadı.");
            return;
          }
          
          // Convert to JSON array
          const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
          
          if (jsonData.length < 2 || !jsonData[0]) {
            alert("Excel dosyası boş veya yeterli veri yok.");
            return;
          }
          
          const headers = jsonData[0].map(h => h?.toString() || "");
          const rows = jsonData.slice(1);
          
          // Pass worksheet to parseFileData for color detection
          const parsed = parseFileData(rows, headers, worksheet);
          setCsvData(parsed);
          setShowCsvDialog(true);
        } catch (error) {
          console.error("Error parsing Excel file:", error);
          alert("Excel dosyası okunamadı. Lütfen dosya formatını kontrol edin.");
        }
      };
      reader.readAsBinaryString(file);
    } else {
      // Handle CSV file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
          const lines = text.split("\n").filter(line => line.trim());
          if (lines.length < 2) {
            alert("CSV dosyası boş veya yeterli veri yok.");
            return;
          }
          
          const headerLine = lines[0];
          if (!headerLine) return;
          
          // Handle CSV with quoted fields and commas
          const parseCSVLine = (line: string): string[] => {
            const result: string[] = [];
            let current = "";
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = "";
        } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result;
          };
          
          const headers = parseCSVLine(headerLine);
          
          const rows: any[][] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            rows.push(parseCSVLine(line));
          }
          
          // CSV files don't have color information, so pass undefined for worksheet
          const parsed = parseFileData(rows, headers, undefined);
          setCsvData(parsed);
          setShowCsvDialog(true);
        } catch (error) {
          console.error("Error parsing CSV file:", error);
          alert("CSV dosyası okunamadı. Lütfen dosya formatını kontrol edin.");
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Confirm CSV upload
  const handleCsvUpload = async () => {
    console.log("handleCsvUpload called", { csvDataLength: csvData.length, userId: user?.id, authLoading });
    
    if (csvData.length === 0) {
      alert("No leads to import. Please check your CSV file.");
      return;
    }
    
    if (authLoading) {
      alert("Please wait for authentication to complete. Try again in a moment.");
      return;
    }
    
    if (!user?.id) {
      console.error("User not loaded yet", { user, authLoading });
      alert("Please wait for authentication to complete. Try again in a moment.");
      return;
    }
    
    setIsUploading(true);

      try {
      const leadsWithUserId = csvData.map(lead => ({ ...lead, user_id: user.id }));
      const response = await fetch(`/api/dashboard/leads?userId=${user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: leadsWithUserId }),
        });

        const result = await response.json();
      
      if (response.ok && result.success) {
        await loadLeads();
    setShowCsvDialog(false);
    setCsvData([]);
    setCsvFileName("");
        alert(`Successfully added ${result.count || leadsWithUserId.length} lead(s)!`);
      } else {
        console.error("Error uploading CSV:", result.error || "Unknown error");
        alert(result.error || "Failed to upload leads. Please try again.");
      }
    } catch (error) {
      console.error("Error uploading CSV:", error);
      alert("An error occurred while uploading leads. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Call lead
  const handleCallLead = async (lead: Lead) => {
    if (!lead.phone) return;
    
    try {
      const response = await fetch("/api/outreach/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          channel: "call",
          direct_call: true,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        await loadLeads();
        // Show success notification
        setCallSuccess({ show: true, leadName: lead.full_name || lead.phone });
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setCallSuccess({ show: false });
        }, 5000);
      } else {
        console.error("Call failed:", data.message || "Unknown error");
      }
    } catch (error) {
      console.error("Error calling lead:", error);
    }
  };

  // Show loading if auth is loading
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
    );
  }
  
  // Show loading if we're actively loading leads (but only if we have a user)
  if (isLoading && user?.id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Success Notification */}
      {callSuccess.show && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5 duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-green-200 dark:border-green-800 p-4 flex items-center gap-3 min-w-[320px]">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">{t("callInitiated")}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("callSuccess").replace("{name}", callSuccess.leadName || "")}
              </p>
            </div>
            <button
              onClick={() => setCallSuccess({ show: false })}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          {duplicateWarnings.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDuplicateWarning(true)}
              className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex-shrink-0"
            >
              <AlertTriangle className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">{duplicateWarnings.length} {t("duplicates").replace("{plural}", duplicateWarnings.length > 1 ? "s" : "")}</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={leads.length === 0}
            className="border-gray-200 dark:border-gray-700 flex-shrink-0"
          >
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("export")}</span>
          </Button>
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
            className="border-gray-200 dark:border-gray-700 flex-1 sm:flex-none"
            size="sm"
              >
                <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("importButton")}</span>
              </Button>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} className="flex-1 sm:flex-none" size="sm">
                <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("addLead")}</span>
              </Button>
            </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* First Row: Search and Main Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-gray-200 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}>
              <SelectTrigger className="w-32 sm:w-40 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
                <Filter className="w-4 h-4 mr-1 sm:mr-2 text-gray-400 dark:text-gray-500" />
                <SelectValue placeholder={t("status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatus")}</SelectItem>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={evalFilter} onValueChange={(v) => setEvalFilter(v as "all" | "6plus" | "1-6" | "v-or-f")}>
              <SelectTrigger className="w-28 sm:w-36 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
                <Tag className="w-4 h-4 mr-1 text-gray-400 dark:text-gray-500" />
                <SelectValue placeholder={t("eval")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("evalFilterAll")}</SelectItem>
                <SelectItem value="6plus">{t("evalFilter6Plus")}</SelectItem>
                <SelectItem value="1-6">{t("evalFilter1to6")}</SelectItem>
                <SelectItem value="v-or-f">{t("evalFilterVOrF")}</SelectItem>
              </SelectContent>
            </Select>
          
            {/* Sort Options */}
            <Select
              value={`${sortBy}|${sortOrder}`}
              onValueChange={(v) => {
                const [field, order] = v.split("|") as [string, string];
                setSortBy(field as typeof sortBy);
                setSortOrder(order as "asc" | "desc");
              }}
            >
              <SelectTrigger className="w-36 sm:w-44 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
                <ArrowUpDown className="w-4 h-4 mr-1 text-gray-400" />
                <SelectValue placeholder={t("sort")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at|desc">{t("newestFirst")}</SelectItem>
                <SelectItem value="created_at|asc">{t("oldestFirst")}</SelectItem>
                <SelectItem value="priority|desc">{t("priorityHighLow")}</SelectItem>
                <SelectItem value="priority|asc">{t("priorityLowHigh")}</SelectItem>
                <SelectItem value="last_contact_date|desc">{t("lastActivity")}</SelectItem>
                <SelectItem value="status|asc">{t("statusPriority")}</SelectItem>
                <SelectItem value="eval_score|desc">{t("evalScore")} ↓</SelectItem>
                <SelectItem value="eval_score|asc">{t("evalScore")} ↑</SelectItem>
              </SelectContent>
            </Select>
          
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh} 
              disabled={isRefreshing}
              className="border-gray-200 dark:border-gray-700"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Second Row: Quick Filters and Selection */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t("quick")}</span>
            <Button 
              variant={statusFilter === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === "new" ? "all" : "new")}
              className={cn(
                "border-gray-200 dark:border-gray-700 text-xs sm:text-sm",
                statusFilter === "new" && "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              {t("new")}
            </Button>
            <Button 
              variant={statusFilter === "contacted" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === "contacted" ? "all" : "contacted")}
              className={cn(
                "border-gray-200 dark:border-gray-700 text-xs sm:text-sm",
                statusFilter === "contacted" && "bg-purple-600 hover:bg-purple-700 text-white"
              )}
            >
              {t("contacted")}
            </Button>
          </div>

          <div className="flex-1" />

          {/* Selection Controls */}
          <div className="flex items-center gap-2">
            {filteredLeads.length > 0 && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={toggleSelectAll}
                  className="border-gray-200 dark:border-gray-700 text-xs sm:text-sm"
                  disabled={isLoading || !user?.id}
                >
                  {selectedLeadIds.size > 0 && selectedLeadIds.size >= totalLeads && totalLeads > 0 ? (
                    <>
                      <X className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t("deselect")} ({totalLeads})</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t("selectAll")} ({totalLeads})</span>
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectCurrentPage}
                  className="border-gray-200 dark:border-gray-700 text-xs sm:text-sm"
                  disabled={isLoading || !user?.id}
                >
                  {t("selectPage")} ({leads.length})
                </Button>
              </>
            )}
            {selectedLeadIds.size > 0 && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedLeadIds(new Set())}
                  className="border-gray-200 dark:border-gray-700 text-xs sm:text-sm"
                >
                  <X className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t("deselect")}</span>
                  <span className="sm:hidden">{t("deselect")}</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowBulkStatusDialog(true)}
                  disabled={isSaving}
                  className="border-gray-200 dark:border-gray-700 text-xs sm:text-sm"
                >
                  <Tag className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t("statusBulk")} ({selectedLeadIds.size})</span>
                  <span className="sm:hidden">{selectedLeadIds.size}</span>
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => setShowBulkCallDialog(true)}
                  disabled={isSaving || isBulkCalling}
                  className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                >
                  <Phone className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t("call")} ({selectedLeadIds.size})</span>
                  <span className="sm:hidden">{selectedLeadIds.size}</span>
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setShowBulkDeleteDialog(true)}
                  disabled={isSaving}
                  className="bg-red-600 hover:bg-red-700 text-xs sm:text-sm"
                >
                  <Trash2 className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t("delete")} ({selectedLeadIds.size})</span>
                  <span className="sm:hidden">{selectedLeadIds.size}</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Table Header - Hidden on mobile */}
        <div className="hidden sm:block px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            <div className="w-8 text-center">#</div>
            <div className="flex-1">{t("customer")}</div>
            <div className="w-32">{t("phone")}</div>
            <div className="w-24">{t("status")}</div>
            <div className="w-16 text-center">{t("calls")}</div>
            <div className="w-20 text-center">{t("eval")}</div>
            <div className="w-24">{t("priority")}</div>
            <div className="w-32">{t("lastContact")}</div>
            <div className="w-24"></div>
            </div>
          </div>
        
        {/* Table Body */}
        {filteredLeads.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">{t("noLeads")}</p>
            <Button 
              onClick={() => { resetForm(); setShowAddDialog(true); }}
              className="mt-4"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("addLead")}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredLeads.map((lead, index) => (
              <div 
                key={lead.id}
                className="px-4 sm:px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedLead(lead);
                  setShowLeadDetailDialog(true);
                }}
              >
                {/* Mobile Layout */}
                <div className="sm:hidden">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLeadSelection(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{lead.full_name || "—"}</p>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap",
                            statusConfig[lead.status].color
                          )}>
                            {statusConfig[lead.status].label}
                          </span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap",
                            priorityConfig[lead.priority].color
                          )}>
                            {priorityConfig[lead.priority].label}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{lead.phone || t("noPhone")}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {(callCountsFromApi[lead.id] ?? lead.contact_attempts ?? 0) > 0 ? (
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                            {(callCountsFromApi[lead.id] ?? lead.contact_attempts ?? 0)}{t("called")}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                        )}
                        {(evaluationHistory[lead.id]?.length ?? 0) > 0 && (
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                            {evaluationHistory[lead.id]?.join(", ") ?? "—"}
                          </span>
                        )}
                        {lead.last_contact_date && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(lead.last_contact_date), "MMM d, HH:mm")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {format(new Date(lead.created_at), "MMM d, yyyy")}
                        </span>
                        <div className="flex items-center gap-1">
                          {lead.phone && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); handleCallLead(lead); }}
                              className="h-7 w-7 p-0"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(lead); }}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t("edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowDeleteDialog(true); }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden sm:flex items-center gap-4">
                  <div className="w-8 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLeadSelection(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    />
      </div>

                  <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      {lead.full_name?.charAt(0).toUpperCase() || "?"}
                        </span>
                    </div>
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white">{lead.full_name || "—"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{lead.email || "—"}</p>
                    </div>
                  </div>
                  </div>
                  
                  <div className="w-32 text-sm text-gray-600 dark:text-gray-300">
                    {lead.phone || "—"}
                  </div>
                  
                  <div className="w-24">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap",
                      statusConfig[lead.status].color
                    )}>
                      {statusConfig[lead.status].label}
                    </span>
                  </div>

                  <div className="w-16 text-center">
                    {(callCountsFromApi[lead.id] ?? lead.contact_attempts ?? 0) > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                        {(callCountsFromApi[lead.id] ?? lead.contact_attempts ?? 0)}x
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </div>

                  <div className="w-20 text-center">
                    {(evaluationHistory[lead.id]?.length ?? 0) > 0 ? (
                      <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                        {evaluationHistory[lead.id]?.join(", ") ?? "—"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </div>
                  
                  <div className="w-24">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap",
                      priorityConfig[lead.priority].color
                    )}>
                      {priorityConfig[lead.priority].label}
                    </span>
                  </div>
                  
                  <div className="w-32 text-xs text-gray-500 dark:text-gray-400">
                    {lead.last_contact_date ? (
                      <div>
                        <div>{format(new Date(lead.last_contact_date), "MMM d, yyyy")}</div>
                        <div className="text-gray-400 dark:text-gray-500">{format(new Date(lead.last_contact_date), "HH:mm")}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </div>
                  
                  <div className="w-24 flex items-center justify-end gap-2">
                    {lead.phone && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleCallLead(lead); }}
                        className="h-8 w-8 p-0"
                      >
                        <Phone className="w-4 h-4" />
                      </Button>
                    )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(lead); }}>
                          <Edit className="w-4 h-4 mr-2" />
                          {t("edit")}
                      </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowDeleteDialog(true); }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </div>
              </div>
            ))}
                  </div>
                )}
                  </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 order-2 sm:order-1">
            {((currentPage - 1) * 100) + 1}-{Math.min(currentPage * 100, totalLeads)} {t("of")} {totalLeads}
              </div>

          <div className="flex items-center gap-1 sm:gap-2 order-1 sm:order-2">
                  <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isLoading}
              className="border-gray-200 dark:border-gray-700 h-8 px-2 sm:px-3"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">{t("prev")}</span>
                  </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 3) {
                  pageNum = i + 1;
                } else if (currentPage <= 2) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 1) {
                  pageNum = totalPages - 2 + i;
                } else {
                  pageNum = currentPage - 1 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    disabled={isLoading}
                    className={cn(
                      "min-w-[32px] sm:min-w-[40px] h-8 px-2",
                      currentPage === pageNum
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "border-gray-200 dark:border-gray-700"
                    )}
                  >
                    {pageNum}
                  </Button>
                );
              })}
                </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isLoading}
              className="border-gray-200 dark:border-gray-700 h-8 px-2 sm:px-3"
            >
              <span className="hidden sm:inline mr-1">{t("next")}</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
      </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAddDialog(false);
          setShowEditDialog(false);
          setSelectedLead(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{showEditDialog ? t("editLead") : t("addNewLead")}</DialogTitle>
            <DialogDescription>
              {showEditDialog ? t("updateLeadInfo") : t("enterLeadDetails")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>{t("fullName")}</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
              </div>
            
            <div>
              <Label>{t("phoneE164")}</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder={t("phonePlaceholder")}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t("phoneFormat")}
              </p>
              </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("status")}</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as LeadStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t("priority")}</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as LeadPriority })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </div>
            
            <div>
              <Label>{t("notes")}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("notesPlaceholder")}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setShowEditDialog(false);
              setSelectedLead(null);
              resetForm();
            }}>
              {t("cancel")}
            </Button>
            <Button 
              onClick={showEditDialog ? handleEditLead : handleAddLead}
              disabled={isSaving || !formData.full_name || !user?.id || authLoading}
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {showEditDialog ? t("saveChanges") : t("addLead")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteLead")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm").replace("{name}", selectedLead?.full_name || "")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteLead} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteSelected")}</DialogTitle>
            <DialogDescription>
              {t("deleteSelectedConfirm").replace("{count}", selectedLeadIds.size.toString())}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleBulkDeleteLeads} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("deleteLeads").replace("{count}", selectedLeadIds.size.toString())}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Call Confirmation Dialog */}
      <Dialog open={showBulkCallDialog} onOpenChange={setShowBulkCallDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-green-600" />
              {t("callSelected")}
            </DialogTitle>
            <DialogDescription>
              {t("callSelectedDesc").replace("{count}", selectedLeadIds.size.toString())}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>{t("callNote")}</strong> {t("callNoteDesc")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkCallDialog(false)}>
              {t("cancel")}
            </Button>
            <Button 
              onClick={handleBulkCallLeads} 
              disabled={isSaving || isBulkCalling}
              className="bg-green-600 hover:bg-green-700"
            >
              {isBulkCalling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("startCalling").replace("{count}", selectedLeadIds.size.toString())}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Call Progress Indicator */}
      {isBulkCalling && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-blue-200 dark:border-blue-800 p-4 min-w-[320px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {t("calling").replace("{current}", bulkCallProgress.current.toString()).replace("{total}", bulkCallProgress.total.toString())}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {t("currentlyCalling").replace("{name}", bulkCallProgress.currentName)}
                </p>
              </div>
            </div>
            <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(bulkCallProgress.current / bulkCallProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* CSV Preview Dialog */}
      <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("importLeads")}</DialogTitle>
            <DialogDescription>
              {csvFileName} - {t("leadsFound").replace("{count}", csvData.length.toString())}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">{t("name")}</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">{t("phone")}</th>
                    </tr>
                  </thead>
              <tbody className="divide-y divide-gray-100">
                {csvData.slice(0, 10).map((lead, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{lead.full_name || "—"}</td>
                    <td className="px-3 py-2">{lead.phone || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            {csvData.length > 10 && (
              <p className="text-center text-sm text-gray-500 py-2">
                ...and {csvData.length - 10} more
              </p>
            )}
              </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCsvDialog(false); setCsvData([]); }}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCsvUpload} disabled={isUploading || !user?.id || csvData.length === 0 || authLoading}>
              {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("importLeadsCount").replace("{count}", csvData.length.toString())}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Update Dialog */}
      <Dialog open={showBulkStatusDialog} onOpenChange={setShowBulkStatusDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" />
              {t("updateStatus")}
            </DialogTitle>
            <DialogDescription>
              {t("changeStatus").replace("{count}", selectedLeadIds.size.toString())}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>{t("newStatus")}</Label>
              <Select value={bulkStatusValue} onValueChange={(v) => setBulkStatusValue(v as LeadStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkStatusDialog(false)}>{t("cancel")}</Button>
            <Button onClick={handleBulkStatusUpdate} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("updateLeads").replace("{count}", selectedLeadIds.size.toString())}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Phone Warning Dialog */}
      <Dialog open={showDuplicateWarning} onOpenChange={setShowDuplicateWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              {t("duplicatePhones")}
            </DialogTitle>
            <DialogDescription>
              {t("duplicateDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-64 overflow-y-auto space-y-3">
            {duplicateWarnings.map((dup, i) => (
              <div key={i} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">{dup.phone} ({dup.count}x)</p>
                <div className="mt-2 space-y-1">
                  {(dup.leadIds || []).map((leadId, j) => (
                    <div key={leadId} className="flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <span>{dup.names[j] ?? "—"}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 h-7 text-xs"
                        onClick={() => handleRemoveDuplicateLead(leadId, dup.names[j] ?? "—")}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        {t("removeDuplicate")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateWarning(false)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <Dialog open={showLeadDetailDialog} onOpenChange={setShowLeadDetailDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("leadDetails")}</DialogTitle>
            <DialogDescription>
              {selectedLead?.full_name || t("leadInfo")}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-6 py-4">
              {/* Primary Info - İsim ve Telefon (İlk Başta) */}
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {selectedLead.full_name?.charAt(0).toUpperCase() || "?"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {selectedLead.full_name || "—"}
                      </h3>
                      <p className="text-lg text-gray-600 dark:text-gray-400 mt-1">
                        {selectedLead.phone || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status and Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-500 dark:text-gray-400">{t("status")}</Label>
                  <div className="mt-1">
                    <span className={cn("px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap", statusConfig[selectedLead.status].color)}>
                      {statusConfig[selectedLead.status].label}
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm text-gray-500 dark:text-gray-400">{t("priority")}</Label>
                  <div className="mt-1">
                    <span className={cn("px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap", priorityConfig[selectedLead.priority].color)}>
                      {priorityConfig[selectedLead.priority].label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Imported Data from CSV/XLSX - Tüm Detaylar */}
              {selectedLead.form_data && Object.keys(selectedLead.form_data).length > 0 && (
                <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("importedDetails")}</h4>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {(() => {
                      const dateDropped = selectedLead.form_data.date_dropped;
                      return dateDropped && typeof dateDropped === 'string' && dateDropped.trim() !== '' ? (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("dataDropped")}</Label>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">{dateDropped}</p>
                        </div>
                      ) : null;
                    })()}
                    
                    {(() => {
                      const dateCalled = selectedLead.form_data.date_called;
                      return dateCalled && typeof dateCalled === 'string' && dateCalled.trim() !== '' ? (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("dataCalled")}</Label>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">{dateCalled}</p>
                        </div>
                      ) : null;
                    })()}
                    
                    <div className="grid grid-cols-2 gap-4">
                      {(() => {
                        const call1 = selectedLead.form_data.call_1_date;
                        return call1 && typeof call1 === 'string' && call1.trim() !== '' && call1.toLowerCase() !== 'x' ? (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("call1")}</Label>
                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{call1}</p>
                          </div>
                        ) : null;
                      })()}
                      
                      {(() => {
                        const call2 = selectedLead.form_data.call_2_date;
                        return call2 && typeof call2 === 'string' && call2.trim() !== '' && call2.toLowerCase() !== 'x' ? (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("call2")}</Label>
                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{call2}</p>
                          </div>
                        ) : null;
                      })()}
                      
                      {(() => {
                        const call3 = selectedLead.form_data.call_3_date;
                        return call3 && typeof call3 === 'string' && call3.trim() !== '' && call3.toLowerCase() !== 'x' ? (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("call3")}</Label>
                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{call3}</p>
                          </div>
                        ) : null;
                      })()}
                      
                      {(() => {
                        const call4 = selectedLead.form_data.call_4_date;
                        return call4 && typeof call4 === 'string' && call4.trim() !== '' && call4.toLowerCase() !== 'x' ? (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("call4")}</Label>
                            <p className="mt-1 text-sm text-gray-900 dark:text-white">{call4}</p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    
                    {(() => {
                      const postCallStatus = selectedLead.form_data.post_call_status;
                      return postCallStatus && typeof postCallStatus === 'string' && postCallStatus.trim() !== '' ? (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("postCallStatus")}</Label>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-line">{postCallStatus}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}

              {/* Treatment Interest / Bilgi Almak İstediği Konu */}
              {(selectedLead.treatment_interest || (selectedLead.form_data && typeof selectedLead.form_data.treatment_interest === 'string')) && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("treatmentInterest")}</Label>
                  <p className="mt-2 text-gray-900 dark:text-white whitespace-pre-line">
                    {selectedLead.treatment_interest || (selectedLead.form_data?.treatment_interest as string) || "—"}
                  </p>
            </div>
          )}

              {/* Notes / Görüşme Sonrası Durum */}
              {selectedLead.notes && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {selectedLead.form_data?.post_call_status ? t("postCallStatus") : t("notes")}
                  </Label>
                  <p className="mt-2 text-gray-900 dark:text-white whitespace-pre-line">{selectedLead.notes}</p>
                </div>
              )}

              {/* Contact Dates */}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                {selectedLead.first_contact_date && (
                  <div>
                    <Label className="text-sm text-gray-500 dark:text-gray-400">{t("firstContactDate")}</Label>
                    <p className="mt-1 text-gray-900 dark:text-white">
                      {format(new Date(selectedLead.first_contact_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                {selectedLead.last_contact_date && (
                  <div>
                    <Label className="text-sm text-gray-500 dark:text-gray-400">{t("lastContactDate")}</Label>
                    <p className="mt-1 text-gray-900 dark:text-white">
                      {format(new Date(selectedLead.last_contact_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => openEditDialog(selectedLead)}
                  className="flex-1"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {t("edit")}
                </Button>
                {selectedLead.phone && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowLeadDetailDialog(false);
                      handleCallLead(selectedLead);
                    }}
                    className="flex-1"
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    {t("call")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
