"use client";

import { useState } from "react";
import { X, Search, Phone, Mail, Clock, ChevronRight } from "lucide-react";
import { useFunnelLeadsByStage } from "@/hooks/useFunnel";
import type { SimpleStage, FunnelLeadWithInfo } from "@/lib/types-funnel";

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacting: "Contacting",
  nurturing: "Nurturing",
  ready: "Ready",
  in_treatment: "In Treatment",
  loyal: "Loyal",
};

interface FunnelLeadListProps {
  userId: string;
  stage: SimpleStage;
  onClose: () => void;
  /** When provided, use these instead of fetching (e.g. mock demo). */
  overrideLeads?: FunnelLeadWithInfo[];
  overrideTotal?: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function FunnelLeadList({ userId, stage, onClose, overrideLeads, overrideTotal }: FunnelLeadListProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const fetched = useFunnelLeadsByStage(userId, stage, page, 30, search);
  const useOverride = overrideLeads != null && overrideTotal != null;
  const leads = useOverride ? overrideLeads : fetched.leads;
  const total = useOverride ? overrideTotal : fetched.total;
  const isLoading = useOverride ? false : fetched.isLoading;

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {STAGE_LABELS[stage] || stage} — {total} leads
          </h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search leads..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Lead list */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            No leads in this stage
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                  style={{ backgroundColor: lead.stage_color }}
                >
                  {(lead.lead_name || "?")[0]?.toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {lead.lead_name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {lead.phone && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Phone className="w-3 h-3" />
                        {lead.phone}
                      </span>
                    )}
                    {lead.email && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Mail className="w-3 h-3" />
                        {lead.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stage + time */}
                <div className="text-right flex-shrink-0">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: lead.stage_color }}
                  >
                    {lead.stage_name}
                  </span>
                  <div className="flex items-center gap-1 mt-1 justify-end text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {timeAgo(lead.entered_current_stage_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
