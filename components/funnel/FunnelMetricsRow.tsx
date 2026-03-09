"use client";

import { Users, Phone, MessageCircle, TrendingUp } from "lucide-react";
import type { FunnelMetrics } from "@/lib/types-funnel";

interface FunnelMetricsRowProps {
  metrics: FunnelMetrics | null;
  isLoading: boolean;
}

const CARDS = [
  { key: "active_leads" as const, label: "Active Leads", icon: Users, color: "#3B82F6" },
  { key: "calls_today" as const, label: "Calls Today", icon: Phone, color: "#F59E0B" },
  { key: "responses_7d" as const, label: "Responses (7d)", icon: MessageCircle, color: "#8B5CF6" },
  { key: "conversions" as const, label: "Conversions", icon: TrendingUp, color: "#10B981" },
];

export default function FunnelMetricsRow({ metrics, isLoading }: FunnelMetricsRowProps) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {isLoading ? "—" : (metrics?.[key] ?? 0).toLocaleString()}
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
