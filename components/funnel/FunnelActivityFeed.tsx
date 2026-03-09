"use client";

import { Phone, MessageCircle, ArrowRight, AlertTriangle, Archive, Star } from "lucide-react";
import type { FunnelActivityItem } from "@/lib/types-funnel";

interface FunnelActivityFeedProps {
  items: FunnelActivityItem[];
  isLoading: boolean;
  onItemClick?: (leadId: string) => void;
}

const EVENT_ICONS: Record<string, typeof Phone> = {
  call_made: Phone,
  call_result: Phone,
  whatsapp_sent: MessageCircle,
  whatsapp_response: MessageCircle,
  stage_entered: ArrowRight,
  live_transfer: Phone,
  alert: AlertTriangle,
  archived: Archive,
  manual_move: ArrowRight,
};

const EVENT_COLORS: Record<string, string> = {
  call_made: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  call_result: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  whatsapp_sent: "text-green-500 bg-green-50 dark:bg-green-900/20",
  whatsapp_response: "text-green-600 bg-green-50 dark:bg-green-900/20",
  stage_entered: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
  live_transfer: "text-orange-500 bg-orange-50 dark:bg-orange-900/20",
  alert: "text-red-500 bg-red-50 dark:bg-red-900/20",
  archived: "text-gray-500 bg-gray-50 dark:bg-gray-900/20",
  manual_move: "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FunnelActivityFeed({
  items,
  isLoading,
  onItemClick,
}: FunnelActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-4">
          Activity Feed
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-4">
        Activity Feed
      </h3>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No activity yet. Start the funnel to see real-time updates here.
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = EVENT_ICONS[item.event_type] || Star;
            const colorClass = EVENT_COLORS[item.event_type] || "text-gray-500 bg-gray-50 dark:bg-gray-900/20";

            return (
              <button
                key={item.id}
                onClick={() => item.lead_id && onItemClick?.(item.lead_id)}
                className="w-full flex items-start gap-3 rounded-lg px-2 py-2.5 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {item.description}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {timeAgo(item.created_at)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
