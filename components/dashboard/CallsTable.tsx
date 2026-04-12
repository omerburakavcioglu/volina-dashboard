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
  Clock,
  Loader2,
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
import { useLanguage, useTranslation } from "@/lib/i18n";
import { useCallContentTranslation } from "@/hooks/useCallContentTranslation";

interface CallsTableProps {
  calls: Call[];
}

const typeIcons: Record<string, typeof Calendar> = {
  appointment: Calendar,
  inquiry: MessageSquare,
  follow_up: Phone,
  cancellation: XCircle,
};

function CallsTableRow({
  call,
  isExpanded,
  isPlaying,
  onToggleExpand,
  onTogglePlay,
  labels,
}: {
  call: Call;
  isExpanded: boolean;
  isPlaying: boolean;
  onToggleExpand: () => void;
  onTogglePlay: (e: React.MouseEvent) => void;
  labels: {
    date: string;
    transcript: string;
    summary: string;
    duration: string;
    sentiment: string;
    noCalls: string;
    tryFilters: string;
    noSummary: string;
    fullTranscript: string;
    callId: string;
    callerPhone: string;
    createdVia: string;
  };
}) {
  const { language } = useLanguage();
  const contentTranslation = useCallContentTranslation({
    callId: call.id,
    enabled: isExpanded && language === "tr",
    language,
    summaryRaw: call.summary,
    transcriptRaw: call.transcript,
    evaluationSummaryRaw: call.evaluation_summary,
  });

  const displaySummary =
    language === "tr" && contentTranslation.translations?.summary
      ? cleanCallSummary(contentTranslation.translations.summary)
      : cleanCallSummary(call.summary);

  const displayTranscript =
    language === "tr" && contentTranslation.translations?.transcript
      ? contentTranslation.translations.transcript
      : call.transcript;

  const TypeIcon = typeIcons[call.type] || Phone;
  const transcriptLines = (displayTranscript || "").split("\n");

  return (
    <Fragment>
      <tr
        className={cn(
          "hover:bg-gray-50/50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors",
          isExpanded && "bg-blue-50/30 dark:bg-blue-900/10"
        )}
        onClick={onToggleExpand}
      >
        <td className="px-5 py-4">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {formatDate(call.created_at)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(call.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </td>

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

        <td className="px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4 text-gray-400" />
            {call.duration ? formatDuration(call.duration) : "N/A"}
          </div>
        </td>

        <td className="px-5 py-4 max-w-xs">
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate flex items-center gap-1">
            <span>{displaySummary || labels.noSummary}</span>
            {language === "tr" && contentTranslation.loading && (
              <Loader2 className="w-3 h-3 shrink-0 animate-spin text-gray-400" aria-hidden />
            )}
          </p>
        </td>

        <td className="px-5 py-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 dark:text-gray-400 dark:hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
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

      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-5 py-4 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="space-y-4">
              {call.recording_url && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 rounded-full dark:bg-gray-700 dark:border-gray-600"
                      onClick={onTogglePlay}
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

              {call.transcript && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    {labels.fullTranscript}
                    {language === "tr" && contentTranslation.loading && (
                      <Loader2 className="w-3 h-3 animate-spin text-gray-400" aria-hidden />
                    )}
                  </h4>
                  {contentTranslation.error && language === "tr" && (
                    <p className="text-xs text-red-500 dark:text-red-400 mb-2">{contentTranslation.error}</p>
                  )}
                  <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto space-y-2">
                    {transcriptLines.map((line, i) => {
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

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{labels.callId}</p>
                  <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {call.vapi_call_id || call.id}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{labels.callerPhone}</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {call.caller_phone || "Unknown"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{labels.createdVia}</p>
                  <p className="text-sm text-gray-900 dark:text-white">Volina AI Agent</p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function CallsTable({ calls }: CallsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { t, language } = useTranslation("calls");

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const togglePlay = (id: string) => {
    setPlayingId(playingId === id ? null : id);
  };

  const labels = {
    title: t("title"),
    date: language === "tr" ? "Tarih ve saat" : "Date & Time",
    transcript: t("transcript"),
    summary: t("summary"),
    duration: t("duration"),
    sentiment: t("sentiment"),
    noCalls: t("noCalls"),
    tryFilters: t("tryAdjustingFilters"),
    noSummary: language === "tr" ? "Özet yok" : "No summary available",
    fullTranscript: language === "tr" ? "Tam transkript" : "Full Transcript",
    callId: language === "tr" ? "Arama ID" : "Call ID",
    callerPhone: language === "tr" ? "Arayan telefon" : "Caller Phone",
    createdVia: language === "tr" ? "Oluşturuldu" : "Created Via",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{labels.title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                {labels.date}
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                {t("callType")}
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                {labels.sentiment}
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                {labels.duration}
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">
                {labels.summary}
              </th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {calls.map((call) => {
              const isExpanded = expandedId === call.id;
              const isPlaying = playingId === call.id;

              return (
                <CallsTableRow
                  key={call.id}
                  call={call}
                  isExpanded={isExpanded}
                  isPlaying={isPlaying}
                  onToggleExpand={() => toggleExpand(call.id)}
                  onTogglePlay={(e) => {
                    e.stopPropagation();
                    togglePlay(call.id);
                  }}
                  labels={labels}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {calls.length === 0 && (
        <div className="text-center py-12">
          <Phone className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">{labels.noCalls}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{labels.tryFilters}</p>
        </div>
      )}
    </div>
  );
}
