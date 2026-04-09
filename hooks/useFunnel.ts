"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type {
  FunnelConfig,
  FunnelStatsResponse,
  FunnelActivityItem,
  FunnelLeadWithInfo,
  FunnelStageWithCount,
  FunnelTransition,
} from "@/lib/types-funnel";

// ===========================================
// useFunnelConfig
// ===========================================

export function useFunnelConfig(userId: string | null) {
  const [config, setConfig] = useState<FunnelConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/funnel/config?userId=${userId}`);
      const data = await res.json();
      setConfig(data.config || null);
    } catch (err) {
      console.error("[useFunnelConfig]", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const startFunnel = useCallback(
    async (options: {
      leadIds?: string[];
      dailyCallLimit: number;
      callingHoursStart: string;
      callingHoursEnd: string;
    }) => {
      if (!userId) return null;
      const res = await fetch(`/api/funnel/start?userId=${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const data = await res.json();
      await fetchConfig();
      return data;
    },
    [userId, fetchConfig]
  );

  const pauseFunnel = useCallback(async () => {
    if (!userId) return;
    await fetch(`/api/funnel/pause?userId=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    await fetchConfig();
  }, [userId, fetchConfig]);

  const resumeFunnel = useCallback(async () => {
    if (!userId) return;
    await fetch(`/api/funnel/pause?userId=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    await fetchConfig();
  }, [userId, fetchConfig]);

  const resetFunnel = useCallback(async () => {
    if (!userId) return null;
    const res = await fetch(`/api/funnel/reset?userId=${userId}`, {
      method: "POST",
    });
    const data = await res.json();
    await fetchConfig();
    return data;
  }, [userId, fetchConfig]);

  return {
    config,
    isLoading,
    isRunning: config?.is_running ?? false,
    startFunnel,
    pauseFunnel,
    resumeFunnel,
    resetFunnel,
    refetch: fetchConfig,
  };
}

// ===========================================
// useFunnelStats
// ===========================================

export function useFunnelStats(userId: string | null) {
  const [stats, setStats] = useState<FunnelStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/funnel/stats?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setStats({
          buckets: data.buckets,
          metrics: data.metrics,
          archived_count: data.archived_count,
          unreachable_count: data.unreachable_count,
        });
      }
    } catch (err) {
      console.error("[useFunnelStats]", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, refetch: fetchStats };
}

// ===========================================
// useFunnelActivity — with Supabase Realtime
// ===========================================

export function useFunnelActivity(userId: string | null, limit = 20) {
  const [items, setItems] = useState<FunnelActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/funnel/activity?userId=${userId}&limit=${limit}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("[useFunnelActivity]", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Realtime subscription for new events
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`funnel-events-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "funnel_events",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchActivity();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, fetchActivity]);

  return { items, isLoading, refetch: fetchActivity };
}

// ===========================================
// useFunnelLeadsByStage
// ===========================================

export function useFunnelLeadsByStage(
  userId: string | null,
  simpleStage: string | null,
  page = 1,
  pageSize = 50,
  search = ""
) {
  const [leads, setLeads] = useState<FunnelLeadWithInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLeads = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        userId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (simpleStage) params.set("stage", simpleStage);
      if (search) params.set("search", search);

      const res = await fetch(`/api/funnel/leads?${params}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("[useFunnelLeadsByStage]", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, simpleStage, page, pageSize, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  return { leads, total, isLoading, refetch: fetchLeads };
}

// ===========================================
// useFunnelAdvancedStages — for the flowchart
// ===========================================

export function useFunnelAdvancedStages(userId: string | null) {
  const [stages, setStages] = useState<FunnelStageWithCount[]>([]);
  const [transitions, setTransitions] = useState<FunnelTransition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStages = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/funnel/stages?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setStages(data.stages);
        setTransitions(data.transitions);
      }
    } catch (err) {
      console.error("[useFunnelAdvancedStages]", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  return { stages, transitions, isLoading, refetch: fetchStages };
}

// ===========================================
// useFunnelNewLeadCount — count of leads not yet in funnel
// ===========================================

export function useFunnelNewLeadCount(userId: string | null) {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/dashboard/leads?userId=${userId}&status=new&page=1&pageSize=1`);
        const data = await res.json();
        const newLeads = data.pagination?.total ?? data.stats?.newLeads ?? 0;

        const funnelRes = await fetch(`/api/funnel/stats?userId=${userId}`);
        const funnelData = await funnelRes.json();
        const inFunnel = funnelData.metrics?.active_leads || 0;
        const archived = funnelData.archived_count || 0;

        setCount(Math.max(0, newLeads - inFunnel - archived));
      } catch (err) {
        console.error("[useFunnelNewLeadCount]", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [userId]);

  return { count, isLoading };
}
