"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  Phone,
  BarChart3,
  RefreshCw,
  Loader2,
  Building2,
  PhoneCall,
  TrendingUp,
  Star,
  Target,
  ChevronDown,
  ChevronUp,
  LogOut,
  Settings,
  Save,
  UserPlus,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ClientMetrics {
  total_leads: number;
  new_leads: number;
  contacted_leads: number;
  interested_leads: number;
  appointment_leads: number;
  converted_leads: number;
  total_calls: number;
  monthly_calls: number;
  today_calls: number;
  avg_duration: number;
  avg_score: number;
  active_campaigns: number;
}

interface ClientData {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  slug: string | null;
  dashboard_type: string | null;
  role: string;
  created_at: string;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
  metrics: ClientMetrics;
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<ClientData | null>(null);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [vapiAssistantId, setVapiAssistantId] = useState("");
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("");
  const [vapiPrivateKey, setVapiPrivateKey] = useState("");

  const loadClients = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/admin/clients?adminUserId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setClients(data.data || []);
      }
    } catch (error) {
      console.error("Error loading clients:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadClients();
  }, [user?.id, loadClients]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadClients();
    setIsRefreshing(false);
  };

  const openSettings = (client: ClientData) => {
    setEditingClient(client);
    setVapiAssistantId(client.vapi_assistant_id || "");
    setVapiPhoneNumberId(client.vapi_phone_number_id || "");
    setVapiPrivateKey(""); // Never show existing key; leave blank or enter new one
    setShowSettingsDialog(true);
  };

  const handleSaveSettings = async () => {
    if (!editingClient || !user?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/clients/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUserId: user.id,
          clientId: editingClient.id,
          updates: {
            vapi_assistant_id: vapiAssistantId || null,
            vapi_phone_number_id: vapiPhoneNumberId || null,
            vapi_private_key: vapiPrivateKey.trim() || null,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadClients();
        setShowSettingsDialog(false);
      } else {
        alert(data.error || "Failed to update settings");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Aggregate metrics
  const totalLeadsAll = clients.reduce((s, c) => s + c.metrics.total_leads, 0);
  const totalCallsAll = clients.reduce((s, c) => s + c.metrics.total_calls, 0);
  const monthlyCallsAll = clients.reduce((s, c) => s + c.metrics.monthly_calls, 0);
  const todayCallsAll = clients.reduce((s, c) => s + c.metrics.today_calls, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image src="/VolinaLogo.png" alt="Volina" width={40} height={40} className="rounded-lg" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Volina Admin</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {clients.length} client{clients.length !== 1 ? "s" : ""} managed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}
            className="border-gray-200 dark:border-gray-700">
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => signOut()}
            className="border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Leads</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalLeadsAll}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Calls</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalCallsAll}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Monthly Calls</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{monthlyCallsAll}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-2">
            <PhoneCall className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Today&apos;s Calls</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{todayCallsAll}</p>
        </div>
      </div>

      {/* Clients List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Clients</h2>
        
        {clients.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No clients yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => {
              const isExpanded = expandedClient === client.id;
              const m = client.metrics;
              const convRate = m.total_leads > 0 
                ? Math.round(((m.converted_leads + m.appointment_leads) / m.total_leads) * 100) 
                : 0;

              return (
                <div key={client.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Client Header Row */}
                  <div
                    className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {(client.company_name || client.full_name || "?").charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                            {client.company_name || client.full_name || client.email}
                          </h3>
                          {client.vapi_assistant_id ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              VAPI Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              No VAPI
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{client.email}</p>
                      </div>

                      {/* Quick Stats */}
                      <div className="hidden sm:flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{m.total_leads}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Leads</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{m.total_calls}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Calls</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{m.today_calls}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Today</p>
                        </div>
                        <div className="text-center">
                          <p className={cn(
                            "text-lg font-bold",
                            m.avg_score >= 7 ? "text-green-600 dark:text-green-400" :
                            m.avg_score >= 4 ? "text-amber-600 dark:text-amber-400" :
                            "text-gray-600 dark:text-gray-400"
                          )}>
                            {m.avg_score > 0 ? m.avg_score : "—"}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Avg Score</p>
                        </div>
                      </div>

                      {/* Expand button */}
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-5 bg-gray-50 dark:bg-gray-800/50">
                      {/* Mobile Quick Stats */}
                      <div className="sm:hidden grid grid-cols-4 gap-3 mb-4">
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{m.total_leads}</p>
                          <p className="text-[10px] text-gray-500">Leads</p>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{m.total_calls}</p>
                          <p className="text-[10px] text-gray-500">Calls</p>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                          <p className="text-lg font-bold text-gray-900 dark:text-white">{m.today_calls}</p>
                          <p className="text-[10px] text-gray-500">Today</p>
                        </div>
                        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                          <p className="text-lg font-bold">{m.avg_score || "—"}</p>
                          <p className="text-[10px] text-gray-500">Score</p>
                        </div>
                      </div>

                      {/* Detailed Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Conversion</span>
                          </div>
                          <p className="text-xl font-bold text-gray-900 dark:text-white">{convRate}%</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Phone className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Monthly Calls</span>
                          </div>
                          <p className="text-xl font-bold text-gray-900 dark:text-white">{m.monthly_calls}</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Star className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Avg Duration</span>
                          </div>
                          <p className="text-xl font-bold text-gray-900 dark:text-white">
                            {m.avg_duration > 0 ? `${Math.floor(m.avg_duration / 60)}:${(m.avg_duration % 60).toString().padStart(2, "0")}` : "—"}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Target className="w-3.5 h-3.5 text-purple-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Campaigns</span>
                          </div>
                          <p className="text-xl font-bold text-gray-900 dark:text-white">{m.active_campaigns}</p>
                        </div>
                      </div>

                      {/* Lead Pipeline */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Lead Pipeline</h4>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {[
                            { label: "New", value: m.new_leads, color: "bg-blue-500" },
                            { label: "Contacted", value: m.contacted_leads, color: "bg-purple-500" },
                            { label: "Interested", value: m.interested_leads, color: "bg-amber-500" },
                            { label: "Appointment", value: m.appointment_leads, color: "bg-green-500" },
                            { label: "Converted", value: m.converted_leads, color: "bg-emerald-500" },
                            { label: "Total", value: m.total_leads, color: "bg-gray-500" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                              <div className={cn("w-2 h-2 rounded-full mx-auto mb-1", color)} />
                              <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Client Info & Actions */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                          <p>Slug: <span className="font-mono text-gray-700 dark:text-gray-300">/{client.slug}</span></p>
                          <p>Dashboard: <span className="font-medium text-gray-700 dark:text-gray-300">{client.dashboard_type || "—"}</span></p>
                          <p>Created: <span className="font-medium text-gray-700 dark:text-gray-300">{format(new Date(client.created_at), "MMM d, yyyy")}</span></p>
                          {client.vapi_assistant_id && (
                            <p>Assistant: <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{client.vapi_assistant_id.substring(0, 16)}...</span></p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => openSettings(client)}>
                          <Settings className="w-4 h-4 mr-2" />
                          VAPI Settings
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VAPI Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              VAPI Settings
            </DialogTitle>
            <DialogDescription>
              Configure VAPI assistant and phone number for{" "}
              <span className="font-semibold">{editingClient?.company_name || editingClient?.email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>VAPI Assistant ID</Label>
              <Input
                value={vapiAssistantId}
                onChange={(e) => setVapiAssistantId(e.target.value)}
                placeholder="e.g., abc123-def456-..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">The assistant ID from your VAPI dashboard</p>
            </div>
            <div>
              <Label>VAPI Phone Number ID</Label>
              <Input
                value={vapiPhoneNumberId}
                onChange={(e) => setVapiPhoneNumberId(e.target.value)}
                placeholder="e.g., xyz789-..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">The phone number ID for outbound calls</p>
            </div>
            <div>
              <Label>VAPI Private Key (farklı hesap için)</Label>
              <Input
                type="password"
                value={vapiPrivateKey}
                onChange={(e) => setVapiPrivateKey(e.target.value)}
                placeholder="Boş bırak = varsayılan hesap (env)"
                className="font-mono text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-gray-500 mt-1">Bu müşteri farklı bir VAPI hesabı kullanıyorsa API key buraya yapıştırın. Boş bırakırsanız varsayılan VAPI hesabı kullanılır.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
