"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface DailyPoint {
  date: string;
  entered: number;
  calls: number;
  responses: number;
  conversions: number;
}

interface FunnelPerformanceChartProps {
  userId: string | null;
  /** When provided, use this data instead of fetching (e.g. mock demo). */
  mockData?: DailyPoint[];
}

export default function FunnelPerformanceChart({ userId, mockData }: FunnelPerformanceChartProps) {
  const [data, setData] = useState<DailyPoint[]>(mockData ?? []);
  const [isLoading, setIsLoading] = useState(!mockData);

  const fetchData = useCallback(async () => {
    if (mockData) {
      setData(mockData);
      setIsLoading(false);
      return;
    }
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/funnel/activity?userId=${userId}&limit=200`);
      const json = await res.json();
      const items = json.items || [];

      // Aggregate by day over last 30 days
      const dayMap: Record<string, DailyPoint> = {};
      const now = new Date();

      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86_400_000);
        const key = d.toISOString().split("T")[0]!;
        dayMap[key] = { date: key, entered: 0, calls: 0, responses: 0, conversions: 0 };
      }

      for (const item of items) {
        const day = (item.created_at as string).split("T")[0];
        if (!day || !dayMap[day]) continue;
        const et = item.event_type;
        if (et === "stage_entered") dayMap[day].entered++;
        if (et === "call_made") dayMap[day].calls++;
        if (et === "whatsapp_response" || et === "call_result") dayMap[day].responses++;
        if (et === "live_transfer") dayMap[day].conversions++;
      }

      setData(
        Object.values(dayMap).map((p) => ({
          ...p,
          date: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }))
      );
    } catch (err) {
      console.error("[FunnelPerformanceChart]", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, mockData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-4">
          Performance (30 days)
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-4">
        Performance (30 days)
      </h3>

      {data.every((d) => d.entered === 0 && d.calls === 0 && d.responses === 0) ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-12 text-center">
          No data yet. Start the funnel to see performance trends.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1F2937",
                border: "1px solid #374151",
                borderRadius: 8,
                color: "#F9FAFB",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="entered" stroke="#3B82F6" name="Entered" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="calls" stroke="#F59E0B" name="Calls" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="responses" stroke="#8B5CF6" name="Responses" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="conversions" stroke="#10B981" name="Conversions" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
