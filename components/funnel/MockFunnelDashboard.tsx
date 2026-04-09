"use client";

import { useState, useCallback } from "react";
import {
  useFunnelConfigMock,
  useFunnelStatsMock,
  useFunnelActivityMock,
  useFunnelLeadsByStageMock,
  useFunnelNewLeadCountMock,
  useFunnelPerformanceMock,
  MOCK_USER_ID,
} from "@/hooks/useFunnelMock";
import { MOCK_STAGES, MOCK_TRANSITIONS, getMockLeadsByStage, getMockLeadsTotalByStage } from "@/lib/mock-funnel-demo";
import FunnelActionBar from "./FunnelActionBar";
import StartFunnelModal from "./StartFunnelModal";
import FunnelMetricsRow from "./FunnelMetricsRow";
import FunnelSimplePipeline from "./FunnelSimplePipeline";
import FunnelActivityFeed from "./FunnelActivityFeed";
import FunnelPerformanceChart from "./FunnelPerformanceChart";
import FunnelLeadList from "./FunnelLeadList";
import type { SimpleStage } from "@/lib/types-funnel";

export default function MockFunnelDashboard() {
  const { config, isRunning, startFunnel, pauseFunnel, resumeFunnel } = useFunnelConfigMock();
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useFunnelStatsMock();
  const { items: activityItems, isLoading: activityLoading } = useFunnelActivityMock();
  const { count: newLeadCount } = useFunnelNewLeadCountMock();
  const { data: chartData } = useFunnelPerformanceMock();

  const [showModal, setShowModal] = useState(false);
  const [selectedStage, setSelectedStage] = useState<SimpleStage | null>(null);

  const isPaused = !config.is_running && config.paused_at !== null;
  const isNotStarted = !config.is_running && config.started_at === null;

  const handleStart = useCallback(() => setShowModal(true), []);

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

  const handleStageClick = useCallback((stage: string) => {
    setSelectedStage((prev) => (prev === stage ? null : (stage as SimpleStage)));
  }, []);

  const overrideLeads = selectedStage ? getMockLeadsByStage(selectedStage) : undefined;
  const overrideTotal = selectedStage ? getMockLeadsTotalByStage(selectedStage) : undefined;

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
        onReset={async () => {}}
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
      {selectedStage && (
        <FunnelLeadList
          userId={MOCK_USER_ID}
          stage={selectedStage}
          onClose={() => setSelectedStage(null)}
          overrideLeads={overrideLeads}
          overrideTotal={overrideTotal}
        />
      )}

      {/* Section D & E: Activity + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <FunnelActivityFeed items={activityItems} isLoading={activityLoading} />
        <FunnelPerformanceChart userId={null} mockData={chartData} />
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
