"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, Download, RefreshCw, X, Check } from "lucide-react";
import { CallsTable } from "@/components/dashboard/CallsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { getCalls, subscribeToCalls } from "@/lib/supabase";
import type { Call } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";

const filterOptions = {
  type: ["appointment", "inquiry", "cancellation", "follow_up"],
  sentiment: ["positive", "neutral", "negative"],
};

function CallsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useTranslation("calls");
  
  const isMockMode = searchParams.get("mock") === "true";
  
  const [calls, setCalls] = useState<Call[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    type: string[];
    sentiment: string[];
  }>({ type: [], sentiment: [] });
  const [exportSuccess, setExportSuccess] = useState(false);

  // Mock data
  const mockCalls: Call[] = [
    {
      id: "1",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-1",
      appointment_id: null,
      recording_url: null,
      transcript: "Customer called to schedule an appointment. Confirmed availability for tomorrow afternoon.",
      summary: "New appointment scheduled with John Doe for tomorrow at 2:00 PM",
      sentiment: "positive",
      duration: 245,
      type: "appointment",
      caller_phone: "+1 234 567 8900",
      caller_name: "John Doe",
      evaluation_summary: "High interest",
      evaluation_score: 8,
      tags: [],
      metadata: {},
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "2",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-2",
      appointment_id: null,
      recording_url: null,
      transcript: "Customer asked about available services and pricing options.",
      summary: "Inquiry about services and pricing",
      sentiment: "neutral",
      duration: 180,
      type: "inquiry",
      caller_phone: "+1 234 567 8901",
      caller_name: "Jane Smith",
      evaluation_summary: "Neutral interest",
      evaluation_score: 6,
      tags: [],
      metadata: {},
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "3",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-3",
      appointment_id: null,
      recording_url: null,
      transcript: "Confirmed appointment details with customer. All information verified.",
      summary: "Appointment confirmed with Sarah Smith for next week",
      sentiment: "positive",
      duration: 320,
      type: "appointment",
      caller_phone: "+1 234 567 8902",
      caller_name: "Sarah Smith",
      evaluation_summary: "Very interested",
      evaluation_score: 9,
      tags: [],
      metadata: {},
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "4",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-4",
      appointment_id: null,
      recording_url: null,
      transcript: "Follow-up call regarding premium service options. Customer showed interest.",
      summary: "Follow-up call completed - Customer interested in premium plan",
      sentiment: "positive",
      duration: 195,
      type: "follow_up",
      caller_phone: "+1 234 567 8903",
      caller_name: "Bob Johnson",
      evaluation_summary: "Interested",
      evaluation_score: 7,
      tags: [],
      metadata: {},
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "5",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-5",
      appointment_id: null,
      recording_url: null,
      transcript: "Customer requested to cancel their upcoming appointment.",
      summary: "Appointment cancellation request",
      sentiment: "neutral",
      duration: 120,
      type: "cancellation",
      caller_phone: "+1 234 567 8904",
      caller_name: "Alice Williams",
      evaluation_summary: "Neutral",
      evaluation_score: 4,
      tags: [],
      metadata: {},
      created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // Redirect if not authenticated (unless in mock mode)
  useEffect(() => {
    if (!isMockMode && !authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router, isMockMode]);

  // Load mock data
  const loadMockData = useCallback(() => {
    setCalls(mockCalls);
    setIsLoading(false);
  }, []);

  // Load calls
  const loadCalls = useCallback(async () => {
    if (isMockMode) {
      loadMockData();
      return;
    }
    try {
      const data = await getCalls(50);
      setCalls(data);
    } catch (error) {
      console.error("Error loading calls:", error);
    }
  }, [isMockMode, loadMockData]);

  useEffect(() => {
    if (isMockMode) {
      loadMockData();
    } else if (isAuthenticated) {
      loadCalls().then(() => setIsLoading(false));
    }
  }, [isAuthenticated, isMockMode, loadCalls, loadMockData]);

  // Subscribe to realtime updates (skip in mock mode)
  useEffect(() => {
    if (isMockMode || !isAuthenticated) return;

    const subscription = subscribeToCalls((payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        setCalls(prev => [payload.new as Call, ...prev]);
      } else if (payload.eventType === "UPDATE" && payload.new) {
        setCalls(prev => prev.map(call => 
          call.id === (payload.new as Call).id ? payload.new as Call : call
        ));
      } else if (payload.eventType === "DELETE" && payload.old) {
        setCalls(prev => prev.filter(call => call.id !== (payload.old as Call).id));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isAuthenticated, isMockMode]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (isMockMode) {
      loadMockData();
    } else {
      await loadCalls();
    }
    setIsRefreshing(false);
  };

  const handleExport = () => {
    // Create CSV content
    const headers = ["Date", "Type", "Phone", "Duration", "Sentiment", "Summary"];
    const rows = filteredCalls.map(call => [
      new Date(call.created_at).toLocaleString(),
      call.type,
      call.caller_phone || "N/A",
      `${Math.floor((call.duration || 0) / 60)}:${((call.duration || 0) % 60).toString().padStart(2, "0")}`,
      call.sentiment || "N/A",
      call.summary || "N/A"
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    
    // Create download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `call-logs-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2000);
  };

  const toggleFilter = (category: "type" | "sentiment", value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(v => v !== value)
        : [...prev[category], value]
    }));
  };

  const clearFilters = () => {
    setActiveFilters({ type: [], sentiment: [] });
  };

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          call.summary?.toLowerCase().includes(query) ||
          call.transcript?.toLowerCase().includes(query) ||
          call.caller_phone?.toLowerCase().includes(query) ||
          call.type.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Type filter
      if (activeFilters.type.length > 0 && !activeFilters.type.includes(call.type)) {
        return false;
      }
      
      // Sentiment filter
      if (activeFilters.sentiment.length > 0 && call.sentiment && !activeFilters.sentiment.includes(call.sentiment)) {
        return false;
      }
      
      return true;
    });
  }, [calls, searchQuery, activeFilters]);

  const activeFilterCount = activeFilters.type.length + activeFilters.sentiment.length;

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
          <div className="flex gap-2">
            <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="h-[600px] bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
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
            {isMockMode ? t("mockPreview") : t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button 
            variant="outline"
            onClick={handleExport}
            disabled={filteredCalls.length === 0}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
          >
            {exportSuccess ? (
              <>
                <Check className="w-4 h-4 mr-2 text-green-500" />
                {t("exported")}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {t("export")}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
          <Button 
            variant="outline"
            onClick={() => setShowFilters(true)}
            className={cn(
              "dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300",
              activeFilterCount > 0 && "border-primary text-primary"
            )}
          >
            <Filter className="w-4 h-4 mr-2" />
            {t("filters")}
            {activeFilterCount > 0 && (
              <span className="ml-2 bg-primary text-white text-xs px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </Button>
      </div>

      {/* Active Filters */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400">{t("activeFilters")}</span>
          {activeFilters.type.map(filter => (
            <button
              key={filter}
              onClick={() => toggleFilter("type", filter)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm capitalize"
            >
              {filter.replace("_", " ")}
              <X className="w-3 h-3" />
            </button>
          ))}
          {activeFilters.sentiment.map(filter => (
            <button
              key={filter}
              onClick={() => toggleFilter("sentiment", filter)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm capitalize"
            >
              {filter}
              <X className="w-3 h-3" />
            </button>
          ))}
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
          >
            {t("clearAll")}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredCalls.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("totalCalls")}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-2xl font-bold text-primary">
            {filteredCalls.filter((c) => c.type === "appointment").length}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("appointments")}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {filteredCalls.filter((c) => c.sentiment === "positive").length}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("positive")}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">
            {filteredCalls.length > 0 
              ? `${Math.round(filteredCalls.reduce((acc, c) => acc + (c.duration || 0), 0) / filteredCalls.length / 60)}m`
              : "0m"
            }
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("avgDuration")}</p>
        </div>
      </div>

      {/* Table or Empty State */}
      {filteredCalls.length > 0 ? (
      <CallsTable calls={filteredCalls} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {calls.length === 0 ? t("noCallsYet") : t("noMatchingCalls")}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            {calls.length === 0 
              ? t("callsDescription")
              : t("tryAdjustingFilters")
            }
          </p>
        </div>
      )}

      {/* Filter Dialog */}
      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{t("filterCalls")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t("callType")}</h4>
              <div className="flex flex-wrap gap-2">
                {filterOptions.type.map(type => (
                  <button
                    key={type}
                    onClick={() => toggleFilter("type", type)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                      activeFilters.type.includes(type)
                        ? "bg-primary text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                  >
                    {type.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t("sentiment")}</h4>
              <div className="flex flex-wrap gap-2">
                {filterOptions.sentiment.map(sentiment => (
                  <button
                    key={sentiment}
                    onClick={() => toggleFilter("sentiment", sentiment)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                      activeFilters.sentiment.includes(sentiment)
                        ? "bg-primary text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                  >
                    {sentiment}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={clearFilters} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
              {t("clearAll")}
            </Button>
            <Button onClick={() => setShowFilters(false)}>
              {t("applyFilters")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CallsPageContent() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <CallsPage />
    </Suspense>
  );
}

export default CallsPageContent;
