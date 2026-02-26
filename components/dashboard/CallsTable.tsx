"use client";

import { useState, Fragment } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  Play, 
  Pause, 
  Phone, 
  Calendar, 
  MessageSquare,
  XCircle,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  formatDate, 
  formatDuration, 
  getSentimentColor, 
  getCallTypeColor, 
  getCallTypeLabel,
  cleanCallSummary 
} from "@/lib/utils";
import type { Call } from "@/lib/types";

interface CallsTableProps {
  calls: Call[];
}

const typeIcons: Record<string, typeof Calendar> = {
  appointment: Calendar,
  inquiry: MessageSquare,
  follow_up: Phone,
  cancellation: XCircle,
};

export function CallsTable({ calls }: CallsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const togglePlay = (id: string) => {
    setPlayingId(playingId === id ? null : id);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Call History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                Date & Time
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                Type
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                Sentiment
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                Duration
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                Summary
              </th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {calls.map((call) => {
              const isExpanded = expandedId === call.id;
              const isPlaying = playingId === call.id;
              const TypeIcon = typeIcons[call.type] || Phone;

              return (
                <Fragment key={call.id}>
                  <tr
                    className={cn(
                      "hover:bg-gray-50/50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors",
                      isExpanded && "bg-blue-50/30 dark:bg-blue-900/10"
                    )}
                    onClick={() => toggleExpand(call.id)}
                  >
                    {/* Date */}
                    <td className="px-5 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDate(call.created_at)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(call.created_at).toLocaleTimeString([], { 
                          hour: "2-digit", 
                          minute: "2-digit" 
                        })}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            getCallTypeColor(call.type)
                          )}
                        >
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {getCallTypeLabel(call.type)}
                        </span>
                      </div>
                    </td>

                    {/* Sentiment */}
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                          getSentimentColor(call.sentiment)
                        )}
                      >
                        {call.sentiment || "N/A"}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {call.duration ? formatDuration(call.duration) : "N/A"}
                      </div>
                    </td>

                    {/* Summary */}
                    <td className="px-5 py-4 max-w-xs">
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {cleanCallSummary(call.summary) || "No summary available"}
                      </p>
                    </td>

                    {/* Expand button */}
                    <td className="px-5 py-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 dark:text-gray-400 dark:hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(call.id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </td>
                  </tr>

                  {/* Expanded content */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50">
                        <div className="space-y-4">
                          {/* Audio Player */}
                          {call.recording_url && (
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <div className="flex items-center gap-4">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-12 w-12 rounded-full dark:bg-gray-700 dark:border-gray-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePlay(call.id);
                                  }}
                                >
                                  {isPlaying ? (
                                    <Pause className="w-5 h-5" />
                                  ) : (
                                    <Play className="w-5 h-5 ml-0.5" />
                                  )}
                                </Button>
                                <div className="flex-1">
                                  <audio
                                    controls
                                    className="w-full h-10"
                                    src={call.recording_url}
                                  >
                                    Your browser does not support the audio element.
                                  </audio>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Transcript */}
                          {call.transcript && (
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                Full Transcript
                              </h4>
                              <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto space-y-2">
                                {call.transcript.split("\n").map((line, i) => {
                                  const isAgent = line.startsWith("Agent:");
                                  const isCaller = line.startsWith("Caller:");
                                  
                                  return (
                                    <p 
                                      key={i}
                                      className={cn(
                                        "p-2 rounded-lg",
                                        isAgent && "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100",
                                        isCaller && "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                      )}
                                    >
                                      {line}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Call details */}
                          <div className="grid sm:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Call ID</p>
                              <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                                {call.vapi_call_id || call.id}
                              </p>
                            </div>
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Caller Phone</p>
                              <p className="text-sm text-gray-900 dark:text-white">
                                {call.caller_phone || "Unknown"}
                              </p>
                            </div>
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created Via</p>
                              <p className="text-sm text-gray-900 dark:text-white">
                                Volina AI Agent
                              </p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {calls.length === 0 && (
        <div className="text-center py-12">
          <Phone className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">No call logs found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}
