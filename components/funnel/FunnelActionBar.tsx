"use client";

import { useState } from "react";
import { Play, Pause, Circle, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface FunnelActionBarProps {
  isRunning: boolean;
  isPaused: boolean;
  isNotStarted: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => Promise<unknown>;
}

export default function FunnelActionBar({
  isRunning,
  isPaused,
  isNotStarted,
  onStart,
  onPause,
  onResume,
  onReset,
}: FunnelActionBarProps) {
  const { t } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetConfirm = async () => {
    setIsResetting(true);
    try {
      await onReset();
    } finally {
      setIsResetting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
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

          {/* Reset button — always visible */}
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-sm font-medium transition-colors border border-red-200 dark:border-red-800"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Funnel
          </button>

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

      {/* Reset confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Reset Funnel
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              All funnel progress, schedules and events will be deleted.
              All leads will be reset to <span className="font-semibold">new</span> status
              so you can start the funnel fresh.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConfirm}
                disabled={isResetting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium transition-colors"
              >
                {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
