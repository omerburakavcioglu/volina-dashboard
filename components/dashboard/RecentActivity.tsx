"use client";

import Link from "next/link";
import { Phone, Calendar, MessageSquare, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, getSentimentColor } from "@/lib/utils";

interface Activity {
  id: string;
  type: "call" | "appointment" | "inquiry" | "cancellation";
  description: string;
  timestamp: string;
  sentiment?: "positive" | "neutral" | "negative";
}

interface RecentActivityProps {
  activities: Activity[];
}

const typeConfig = {
  call: {
    icon: Phone,
    color: "#0055FF",
    bgColor: "#0055FF15",
  },
  appointment: {
    icon: Calendar,
    color: "#10B981",
    bgColor: "#10B98115",
  },
  inquiry: {
    icon: MessageSquare,
    color: "#8B5CF6",
    bgColor: "#8B5CF615",
  },
  cancellation: {
    icon: XCircle,
    color: "#EF4444",
    bgColor: "#EF444415",
  },
};

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
        <Link 
          href="/dashboard/calls" 
          className="text-sm text-primary hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="p-4">
        <div className="space-y-2">
          {activities.map((activity) => {
            const config = typeConfig[activity.type];
            const Icon = config.icon;

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ 
                    backgroundColor: config.bgColor,
                    color: config.color,
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                    {activity.sentiment && (
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                          getSentimentColor(activity.sentiment)
                        )}
                      >
                        {activity.sentiment}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {activities.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Phone className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
