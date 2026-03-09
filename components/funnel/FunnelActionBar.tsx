"use client";

import { Play, Pause, Circle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface FunnelActionBarProps {
  isRunning: boolean;
  isPaused: boolean;
  isNotStarted: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
}

export default function FunnelActionBar({
  isRunning,
  isPaused,
  isNotStarted,
  onStart,
  onPause,
  onResume,
}: FunnelActionBarProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("sidebar", "funnel")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t("funnel", "subtitle")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm">
          <Circle
            className={`w-2.5 h-2.5 fill-current ${
              isRunning
                ? "text-green-500"
                : isPaused
                  ? "text-yellow-500"
                  : "text-gray-400"
            }`}
          />
          <span className="text-gray-700 dark:text-gray-300">
            {isRunning
              ? t("funnel", "running")
              : isPaused
                ? t("funnel", "paused")
                : t("funnel", "notStarted")}
          </span>
        </div>

        {/* Action buttons */}
        {isRunning && (
          <button
            onClick={onPause}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium transition-colors"
          >
            <Pause className="w-4 h-4" />
            {t("funnel", "pauseAll")}
          </button>
        )}

        {isPaused && (
          <button
            onClick={onResume}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {t("funnel", "resume")}
          </button>
        )}

        {(isNotStarted || isPaused) && (
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {t("funnel", "startFunnel")}
          </button>
        )}
      </div>
    </div>
  );
}
