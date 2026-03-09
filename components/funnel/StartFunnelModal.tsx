"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

interface StartFunnelModalProps {
  newLeadCount: number;
  onConfirm: (options: {
    selectAll: boolean;
    dailyCallLimit: number;
    callingHoursStart: string;
    callingHoursEnd: string;
  }) => Promise<void>;
  onClose: () => void;
}

export default function StartFunnelModal({
  newLeadCount,
  onConfirm,
  onClose,
}: StartFunnelModalProps) {
  const [selectAll, setSelectAll] = useState(true);
  const [dailyCallLimit, setDailyCallLimit] = useState(50);
  const [callingHoursStart, setCallingHoursStart] = useState("09:00");
  const [callingHoursEnd, setCallingHoursEnd] = useState("20:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        selectAll,
        dailyCallLimit,
        callingHoursStart,
        callingHoursEnd,
      });
      onClose();
    } catch (err) {
      console.error("Start funnel error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Start Funnel
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Start automation for{" "}
              <span className="font-bold">{newLeadCount}</span> new leads
            </p>
          </div>

          {/* Lead selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Which leads?
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={selectAll}
                  onChange={() => setSelectAll(true)}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  All new leads ({newLeadCount})
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!selectAll}
                  onChange={() => setSelectAll(false)}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Select manually (coming soon)
                </span>
              </label>
            </div>
          </div>

          {/* Daily call limit */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Daily call limit
            </label>
            <input
              type="number"
              value={dailyCallLimit}
              onChange={(e) => setDailyCallLimit(parseInt(e.target.value, 10) || 50)}
              min={1}
              max={500}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Calling hours */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Calling hours
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={callingHoursStart}
                onChange={(e) => setCallingHoursStart(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-500">to</span>
              <input
                type="time"
                value={callingHoursEnd}
                onChange={(e) => setCallingHoursEnd(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || newLeadCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Start Automation
          </button>
        </div>
      </div>
    </div>
  );
}
