"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/components/providers/SupabaseProvider";
import {
  useFunnelConfig,
  useFunnelStats,
  useFunnelActivity,
  useFunnelNewLeadCount,
} from "@/hooks/useFunnel";
import FunnelActionBar from "./FunnelActionBar";
import StartFunnelModal from "./StartFunnelModal";
import FunnelMetricsRow from "./FunnelMetricsRow";
import FunnelSimplePipeline from "./FunnelSimplePipeline";
import FunnelActivityFeed from "./FunnelActivityFeed";
import FunnelPerformanceChart from "./FunnelPerformanceChart";
import FunnelLeadList from "./FunnelLeadList";
import type { SimpleStage } from "@/lib/types-funnel";

export default function FunnelDashboard() {
  const { user } = useAuth();
  const userId = user?.id || null;

  const { config, isRunning, startFunnel, pauseFunnel, resumeFunnel, resetFunnel } = useFunnelConfig(userId);
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useFunnelStats(userId);
  const { items: activityItems, isLoading: activityLoading } = useFunnelActivity(userId);
  const { count: newLeadCount } = useFunnelNewLeadCount(userId);

  const [showModal, setShowModal] = useState(false);
  const [selectedStage, setSelectedStage] = useState<SimpleStage | null>(null);

  const isPaused = config !== null && !config.is_running && config.paused_at !== null;
  const isNotStarted = config === null || (!config.is_running && config.started_at === null);

  const handleStart = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleConfirmStart = useCallback(
    async (options: {
      selectAll: boolean;
      dailyCallLimit: number;
      callingHoursStart: string;
      callingHoursEnd: string;
    }) => {
      await startFunnel({
        dailyCallLimit: options.dailyCallLimit,
        callingHoursStart: options.callingHoursStart,
        callingHoursEnd: options.callingHoursEnd,
      });
      refetchStats();
    },
    [startFunnel, refetchStats]
  );

  const handleReset = useCallback(async () => {
    await resetFunnel();
    refetchStats();
  }, [resetFunnel, refetchStats]);

  const handleStageClick = useCallback((stage: string) => {
    setSelectedStage((prev) => (prev === stage ? null : (stage as SimpleStage)));
  }, []);

  return (
    <div className="space-y-6">
      {/* Section A: Action Bar */}
      <FunnelActionBar
        isRunning={isRunning}
        isPaused={isPaused}
        isNotStarted={isNotStarted}
        onStart={handleStart}
        onPause={pauseFunnel}
        onResume={resumeFunnel}
        onReset={handleReset}
      />

      {/* Section B: Key Metrics */}
      <FunnelMetricsRow metrics={stats?.metrics || null} isLoading={statsLoading} />

      {/* Section C: Simple Pipeline */}
      <FunnelSimplePipeline
        buckets={stats?.buckets || []}
        archivedCount={stats?.archived_count || 0}
        unreachableCount={stats?.unreachable_count || 0}
        onStageClick={handleStageClick}
        selectedStage={selectedStage}
      />

      {/* Expanded lead list for selected stage */}
      {selectedStage && userId && (
        <FunnelLeadList
          userId={userId}
          stage={selectedStage}
          onClose={() => setSelectedStage(null)}
        />
      )}

      {/* Section D & E: Activity + Chart side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <FunnelActivityFeed items={activityItems} isLoading={activityLoading} />
        <FunnelPerformanceChart userId={userId} />
      </div>

      {/* Start Funnel Modal */}
      {showModal && (
        <StartFunnelModal
          newLeadCount={newLeadCount}
          onConfirm={handleConfirmStart}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
