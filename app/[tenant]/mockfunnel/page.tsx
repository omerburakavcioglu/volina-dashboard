"use client";

import { useState } from "react";
import { LayoutDashboard, GitBranch } from "lucide-react";
import MockFunnelDashboard from "@/components/funnel/MockFunnelDashboard";
import FunnelAdvancedFlow from "@/components/funnel/FunnelAdvancedFlow";
import { MOCK_STAGES, MOCK_TRANSITIONS } from "@/lib/mock-funnel-demo";

type Tab = "dashboard" | "flow";

const tabs: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "flow", label: "Automation Flow", icon: GitBranch },
];

export default function MockFunnelPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                ${
                  isActive
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "dashboard" && <MockFunnelDashboard />}
      {activeTab === "flow" && <FunnelAdvancedFlow mockStages={MOCK_STAGES} mockTransitions={MOCK_TRANSITIONS} />}
    </div>
  );
}
