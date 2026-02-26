"use client";

import { Phone, Calendar, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPIData {
  monthlyCalls: number;
  monthlyChange: number;
  dailyCalls: number;
  dailyChange: number;
  avgDuration: number;
  durationChange: number;
  appointmentRate: number;
  appointmentRateChange: number;
}

interface KPICardsProps {
  data: KPIData;
}

export function KPICards({ data }: KPICardsProps) {
  const cards = [
    {
      title: "Monthly Calls",
      value: data.monthlyCalls.toLocaleString(),
      change: data.monthlyChange,
      icon: Phone,
      color: "#0055FF",
    },
    {
      title: "Daily Calls",
      value: data.dailyCalls.toLocaleString(),
      change: data.dailyChange,
      icon: Calendar,
      color: "#10B981",
    },
    {
      title: "Avg Duration",
      value: `${Math.floor(data.avgDuration / 60)}:${(data.avgDuration % 60).toString().padStart(2, "0")}`,
      change: data.durationChange,
      icon: Clock,
      color: "#F59E0B",
    },
    {
      title: "Conversion Rate",
      value: `${data.appointmentRate}%`,
      change: data.appointmentRateChange,
      icon: TrendingUp,
      color: "#8B5CF6",
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isPositive = card.change > 0;
        const isNeutral = card.change === 0;
        const TrendIcon = isPositive ? TrendingUp : isNeutral ? Minus : TrendingDown;

        return (
          <div 
            key={card.title} 
            className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ 
                  backgroundColor: `${card.color}15`,
                  color: card.color,
                }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                  isPositive && "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400",
                  isNeutral && "text-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-400",
                  !isPositive && !isNeutral && "text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400"
                )}
              >
                <TrendIcon className="w-3 h-3" />
                <span>{Math.abs(card.change)}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{card.title}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
