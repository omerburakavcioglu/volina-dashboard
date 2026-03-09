"use client";

import { useState, useCallback } from "react";
import {
  MOCK_STATS,
  MOCK_ACTIVITY,
  MOCK_CONFIG,
  MOCK_NEW_LEAD_COUNT,
  MOCK_STAGES,
  MOCK_TRANSITIONS,
  getMockLeadsByStage,
  getMockLeadsTotalByStage,
  MOCK_DAILY_CHART,
} from "@/lib/mock-funnel-demo";
import type { SimpleStage } from "@/lib/types-funnel";

const MOCK_USER_ID = "mock-demo-user";

export function useFunnelConfigMock() {
  const [config, setConfig] = useState(MOCK_CONFIG);
  const isRunning = config.is_running;
  const isPaused = !!config.paused_at;

  const startFunnel = useCallback(
    async (_options?: { leadIds?: string[]; dailyCallLimit: number; callingHoursStart: string; callingHoursEnd: string }) => {
      setConfig((c) => ({ ...c, is_running: true, paused_at: null, started_at: new Date().toISOString() }));
      return { success: true, count: MOCK_NEW_LEAD_COUNT };
    },
    []
  );

  const pauseFunnel = useCallback(async () => {
    setConfig((c) => ({ ...c, is_running: false, paused_at: new Date().toISOString() }));
  }, []);

  const resumeFunnel = useCallback(async () => {
    setConfig((c) => ({ ...c, is_running: true, paused_at: null }));
  }, []);

  return {
    config,
    isLoading: false,
    isRunning,
    startFunnel,
    pauseFunnel,
    resumeFunnel,
    refetch: () => {},
  };
}

export function useFunnelStatsMock() {
  return {
    stats: MOCK_STATS,
    isLoading: false,
    refetch: () => {},
  };
}

export function useFunnelActivityMock() {
  return {
    items: MOCK_ACTIVITY,
    isLoading: false,
    refetch: () => {},
  };
}

export function useFunnelLeadsByStageMock(_userId: string | null, simpleStage: SimpleStage | null, _page: number, _pageSize: number, _search: string) {
  const leads = simpleStage ? getMockLeadsByStage(simpleStage) : [];
  const total = simpleStage ? getMockLeadsTotalByStage(simpleStage) : 0;
  return {
    leads,
    total,
    isLoading: false,
    refetch: () => {},
  };
}

export function useFunnelAdvancedStagesMock() {
  return {
    stages: MOCK_STAGES,
    transitions: MOCK_TRANSITIONS,
    isLoading: false,
    refetch: () => {},
  };
}

export function useFunnelNewLeadCountMock() {
  return { count: MOCK_NEW_LEAD_COUNT, isLoading: false };
}

export function useFunnelPerformanceMock() {
  return { data: MOCK_DAILY_CHART, isLoading: false };
}

export { MOCK_USER_ID };
