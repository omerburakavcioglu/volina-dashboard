"use client";

import { ChevronRight, Archive, PhoneOff } from "lucide-react";
import type { SimpleStageSummary } from "@/lib/types-funnel";

interface FunnelSimplePipelineProps {
  buckets: SimpleStageSummary[];
  archivedCount: number;
  unreachableCount: number;
  onStageClick: (stage: string) => void;
  selectedStage: string | null;
}

export default function FunnelSimplePipeline({
  buckets,
  archivedCount,
  unreachableCount,
  onStageClick,
  selectedStage,
}: FunnelSimplePipelineProps) {
  const totalActive = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
          Lead Pipeline
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totalActive.toLocaleString()} active
        </span>
      </div>

      {/* Main 6-bucket pipeline */}
      <div className="space-y-3">
        {buckets.map((bucket, idx) => {
          const pct = totalActive > 0 ? (bucket.count / totalActive) * 100 : 0;
          const isSelected = selectedStage === bucket.stage;

          return (
            <button
              key={bucket.stage}
              onClick={() => onStageClick(bucket.stage)}
              className={`w-full flex items-center gap-3 group transition-colors rounded-lg px-2 py-1.5 -mx-2 ${
                isSelected
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              {/* Stage number */}
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: bucket.color }}
              >
                {idx + 1}
              </span>

              {/* Label */}
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 w-28 sm:w-32 text-left truncate">
                {bucket.label}
              </span>

              {/* Progress bar */}
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, bucket.count > 0 ? 2 : 0)}%`,
                    backgroundColor: bucket.color,
                  }}
                />
              </div>

              {/* Count & percentage */}
              <div className="flex items-center gap-2 min-w-[80px] justify-end">
                <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                  {bucket.count.toLocaleString()}
                </span>
                <span className="text-xs text-gray-400 w-10 text-right">
                  {Math.round(pct)}%
                </span>
              </div>

              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 transition-colors flex-shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Secondary row: archived + unreachable */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Archive className="w-4 h-4" />
          <span>Archived:</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {archivedCount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <PhoneOff className="w-4 h-4" />
          <span>Unreachable:</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {unreachableCount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
