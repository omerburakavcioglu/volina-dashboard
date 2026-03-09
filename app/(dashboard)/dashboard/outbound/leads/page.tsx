"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, 
  Filter, 
  Plus, 
  RefreshCw, 
  Phone, 
  Mail, 
  MessageSquare,
  MoreVertical,
  Trash2,
  Edit,
  Eye,
  X,
  Check,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { getLeads, createLead, updateLead, deleteLead, subscribeToLeads } from "@/lib/supabase-outbound";
import type { Lead } from "@/lib/types-outbound";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: "Yeni", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  contacted: { label: "İletişime Geçildi", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  interested: { label: "İlgileniyor", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  appointment_set: { label: "Randevu Alındı", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  converted: { label: "Dönüşüm", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  lost: { label: "Kayıp", color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400" },
  unreachable: { label: "Ulaşılamıyor", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const sourceLabels: Record<string, string> = {
  web_form: "Web Form",
  instagram: "Instagram",
  referral: "Referans",
  facebook: "Facebook",
  google_ads: "Google Ads",
  other: "Diğer",
};

export default function LeadsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showLeadDetail, setShowLeadDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [newLead, setNewLead] = useState({
    full_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    instagram: "",
    language: "tr" as "tr" | "en",
    source: "web_form" as Lead["source"],
    treatment_interest: "",
    notes: "",
    priority: "medium" as "high" | "medium" | "low",
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const loadLeads = useCallback(async () => {
    try {
      const data = await getLeads({ limit: 100 });
      setLeads(data);
    } catch (error) {
      console.error("Error loading leads:", error);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadLeads().then(() => setIsLoading(false));
    }
  }, [isAuthenticated, loadLeads]);

  // Filter leads based on search and status
  useEffect(() => {
    let filtered = leads;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(lead => 
        lead.full_name.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.phone?.includes(query) ||
        lead.whatsapp?.includes(query)
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(lead => lead.status === statusFilter);
    }

    setFilteredLeads(filtered);
  }, [leads, searchQuery, statusFilter]);

  // Realtime subscription
  useEffect(() => {
    if (!isAuthenticated) return;

    const subscription = subscribeToLeads((payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        setLeads(prev => [payload.new as Lead, ...prev]);
      } else if (payload.eventType === "UPDATE" && payload.new) {
        setLeads(prev => prev.map(lead => 
          lead.id === (payload.new as Lead).id ? payload.new as Lead : lead
        ));
      } else if (payload.eventType === "DELETE" && payload.old) {
        setLeads(prev => prev.filter(lead => lead.id !== (payload.old as Lead).id));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isAuthenticated]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadLeads();
    setIsRefreshing(false);
  };

  const handleAddLead = async () => {
    setIsSaving(true);
    try {
      const lead = await createLead({
        ...newLead,
        next_contact_date: new Date().toISOString(),
      });
      
      if (lead) {
        setShowAddLead(false);
        setNewLead({
          full_name: "",
          email: "",
          phone: "",
          whatsapp: "",
          instagram: "",
          language: "tr",
          source: "web_form",
          treatment_interest: "",
          notes: "",
          priority: "medium",
        });
      }
    } catch (error) {
      console.error("Error adding lead:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm("Bu lead'i silmek istediğinizden emin misiniz?")) return;
    
    const success = await deleteLead(id);
    if (success) {
      setLeads(prev => prev.filter(lead => lead.id !== id));
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: Lead["status"]) => {
    const updated = await updateLead(lead.id, { status: newStatus });
    if (updated) {
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l));
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Tüm potansiyel müşterilerinizi yönetin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Yenile
          </Button>
          <Button onClick={() => setShowAddLead(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Yeni Lead
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="İsim, email veya telefon ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">Tüm Durumlar</option>
            {Object.entries(statusLabels).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Object.entries(statusLabels).map(([status, { label, color }]) => {
          const count = leads.filter(l => l.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
              className={cn(
                "p-3 rounded-lg text-center transition-all",
                statusFilter === status 
                  ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-900" 
                  : "hover:scale-105",
                color
              )}
            >
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">İletişim</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kaynak</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Son İletişim</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sonraki</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      {searchQuery || statusFilter ? "Filtrelere uygun lead bulunamadı" : "Henüz lead eklenmemiş"}
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-white font-medium",
                            lead.priority === 'high' ? "bg-red-500" :
                            lead.priority === 'medium' ? "bg-yellow-500" : "bg-gray-400"
                          )}>
                            {lead.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{lead.full_name}</p>
                            <p className="text-sm text-gray-500">
                              {lead.treatment_interest || "Belirtilmemiş"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          {lead.phone && (
                            <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                              <Phone className="w-3 h-3" /> {lead.phone}
                            </span>
                          )}
                          {lead.whatsapp && (
                            <span className="flex items-center gap-1 text-sm text-green-600">
                              <MessageSquare className="w-3 h-3" /> {lead.whatsapp}
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                              <Mail className="w-3 h-3" /> {lead.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{lead.source ? sourceLabels[lead.source] || lead.source : "-"}</span>
                          <span className="text-lg">{lead.language === 'tr' ? '🇹🇷' : '🇬🇧'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead, e.target.value as Lead["status"])}
                          className={cn(
                            "px-2 py-1 text-xs rounded-full border-0 cursor-pointer",
                            statusLabels[lead.status]?.color || "bg-gray-100 text-gray-700"
                          )}
                        >
                          {Object.entries(statusLabels).map(([key, { label }]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {lead.last_contact_date 
                          ? format(new Date(lead.last_contact_date), "d MMM", { locale: tr })
                          : "-"
                        }
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {lead.next_contact_date 
                          ? format(new Date(lead.next_contact_date), "d MMM", { locale: tr })
                          : "-"
                        }
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowLeadDetail(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLead(lead.id)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Lead Modal */}
      <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Yeni Lead Ekle</DialogTitle>
            <DialogDescription>
              Yeni bir potansiyel müşteri ekleyin
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Ad Soyad *</Label>
                <Input
                  value={newLead.full_name}
                  onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              
              <div>
                <Label>Telefon</Label>
                <Input
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  placeholder="+90 555 123 4567"
                />
              </div>
              
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={newLead.whatsapp}
                  onChange={(e) => setNewLead({ ...newLead, whatsapp: e.target.value })}
                  placeholder="+90 555 123 4567"
                />
              </div>
              
              <div>
                <Label>Instagram</Label>
                <Input
                  value={newLead.instagram}
                  onChange={(e) => setNewLead({ ...newLead, instagram: e.target.value })}
                  placeholder="@username"
                />
              </div>
              
              <div>
                <Label>Dil</Label>
                <select
                  value={newLead.language}
                  onChange={(e) => setNewLead({ ...newLead, language: e.target.value as "tr" | "en" })}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value="tr">🇹🇷 Türkçe</option>
                  <option value="en">🇬🇧 English</option>
                </select>
              </div>
              
              <div>
                <Label>Kaynak</Label>
                <select
                  value={newLead.source || "other"}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                >
                  {Object.entries(sourceLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label>Öncelik</Label>
                <select
                  value={newLead.priority}
                  onChange={(e) => setNewLead({ ...newLead, priority: e.target.value as "high" | "medium" | "low" })}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value="high">🔴 Yüksek</option>
                  <option value="medium">🟡 Orta</option>
                  <option value="low">⚪ Düşük</option>
                </select>
              </div>
              
              <div className="col-span-2">
                <Label>İlgi Alanı (Tedavi)</Label>
                <Input
                  value={newLead.treatment_interest}
                  onChange={(e) => setNewLead({ ...newLead, treatment_interest: e.target.value })}
                  placeholder="Dental implant, saç ekimi, vb."
                />
              </div>
              
              <div className="col-span-2">
                <Label>Notlar</Label>
                <textarea
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  placeholder="Ek notlar..."
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 min-h-[80px]"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAddLead(false)}>
                İptal
              </Button>
              <Button onClick={handleAddLead} disabled={isSaving || !newLead.full_name}>
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Ekle
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Modal */}
      <Dialog open={showLeadDetail} onOpenChange={setShowLeadDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead Detayı</DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-6 mt-4">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-medium",
                  selectedLead.priority === 'high' ? "bg-red-500" :
                  selectedLead.priority === 'medium' ? "bg-yellow-500" : "bg-gray-400"
                )}>
                  {selectedLead.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedLead.full_name}
                  </h3>
                  <p className="text-gray-500">{selectedLead.treatment_interest || "İlgi alanı belirtilmemiş"}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("px-3 py-1 text-sm rounded-full", statusLabels[selectedLead.status]?.color || "bg-gray-100")}>
                      {statusLabels[selectedLead.status]?.label || selectedLead.status}
                    </span>
                    <span className="text-lg">{selectedLead.language === 'tr' ? '🇹🇷' : '🇬🇧'}</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Telefon</p>
                  <p className="font-medium">{selectedLead.phone || "-"}</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">WhatsApp</p>
                  <p className="font-medium">{selectedLead.whatsapp || "-"}</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Email</p>
                  <p className="font-medium">{selectedLead.email || "-"}</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Instagram</p>
                  <p className="font-medium">{selectedLead.instagram || "-"}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                  <p className="text-sm text-gray-500 mb-1">Kaynak</p>
                  <p className="font-medium">{selectedLead.source ? (sourceLabels[selectedLead.source] || selectedLead.source) : "-"}</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                  <p className="text-sm text-gray-500 mb-1">İletişim Denemesi</p>
                  <p className="font-medium">{selectedLead.contact_attempts}</p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                  <p className="text-sm text-gray-500 mb-1">Kampanya Günü</p>
                  <p className="font-medium">Gün {selectedLead.campaign_day}</p>
                </div>
              </div>
              
              {selectedLead.notes && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Notlar</p>
                  <p>{selectedLead.notes}</p>
                </div>
              )}
              
              <div className="flex justify-between pt-4 border-t dark:border-gray-700">
                <div className="text-sm text-gray-500">
                  Oluşturulma: {format(new Date(selectedLead.created_at), "d MMMM yyyy HH:mm", { locale: tr })}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowLeadDetail(false)}>
                    Kapat
                  </Button>
                  <Button>
                    <Phone className="w-4 h-4 mr-2" />
                    Ara
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
