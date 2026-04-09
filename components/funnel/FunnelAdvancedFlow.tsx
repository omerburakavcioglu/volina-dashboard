"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { useFunnelAdvancedStages } from "@/hooks/useFunnel";
import {
  UserPlus, PhoneCall, Clock, MessageCircle, PhoneForwarded, Heart, Send,
  Archive, Stethoscope, Star, AlertTriangle, HeartPulse, Award, Users,
  Phone, Mail, ChevronRight, X, Loader2,
} from "lucide-react";
import type { FunnelStageWithCount, FunnelTransition } from "@/lib/types-funnel";
import { STAGE_ENTRY_ACTIONS, TIME_TRANSITIONS } from "@/lib/funnel-engine";

const ICON_MAP: Record<string, typeof UserPlus> = {
  UserPlus, PhoneCall, Clock, MessageCircle, PhoneForwarded, Heart,
  Send, Archive, Stethoscope, Star, AlertTriangle, HeartPulse, Award,
};

const BRANCH_COLORS: Record<string, string> = {
  main: "#3B82F6",
  hard: "#F97316",
  soft: "#10B981",
  no_answer: "#8B5CF6",
  post_treatment: "#06B6D4",
};

const ACTION_LABELS: Record<string, string> = {
  ai_call: "AI Phone Call",
  whatsapp_message: "WhatsApp Message",
  live_transfer_alert: "Live Transfer Alert",
  satisfaction_call: "Satisfaction Call",
  check_in_call: "Check-in Call",
};

// ─── Types ───────────────────────────────────────────────

interface NodePos {
  id: string;
  x: number;
  y: number;
  stage: FunnelStageWithCount;
}

interface StageLead {
  id: string;
  lead_name: string;
  phone: string | null;
  email: string | null;
  entered_current_stage_at: string;
  next_action_type: string | null;
  next_action_at: string | null;
}

// ─── Layout ──────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 76;
const GAP_X = 60;
const GAP_Y = 44;
const PADDING = 24;

function layoutNodes(stages: FunnelStageWithCount[]): NodePos[] {
  const branchOrder = ["main", "no_answer", "soft", "hard", "post_treatment", null];

  const byBranch: Record<string, FunnelStageWithCount[]> = {};
  for (const s of stages) {
    const b = s.branch || "none";
    if (!byBranch[b]) byBranch[b] = [];
    byBranch[b]!.push(s);
  }

  const positions: NodePos[] = [];
  let colIndex = 0;

  for (const branch of branchOrder) {
    const key = branch || "none";
    const group = byBranch[key];
    if (!group || group.length === 0) continue;

    group.sort((a, b) => a.position_order - b.position_order);

    for (let i = 0; i < group.length; i++) {
      const s = group[i]!;
      positions.push({
        id: s.id,
        x: colIndex * (NODE_W + GAP_X) + PADDING,
        y: i * (NODE_H + GAP_Y) + PADDING,
        stage: s,
      });
    }
    colIndex++;
  }

  return positions;
}

// ─── Arrow path builders ─────────────────────────────────

function buildStraightPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function buildOrthogonalPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const midY = y1 + 22;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

function buildEdgePath(
  from: NodePos, to: NodePos,
): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;

  const sameColumn = Math.abs(x1 - x2) < 10;

  if (sameColumn) {
    return buildStraightPath(x1, y1, x2, y2);
  }

  return buildOrthogonalPath(x1, y1, x2, y2);
}

// ─── Detail panel helpers ────────────────────────────────

function getStageActions(stageName: string) {
  return STAGE_ENTRY_ACTIONS[stageName] || [];
}

function getTimeTransitionsFrom(stageName: string) {
  return TIME_TRANSITIONS.filter((t) => t.from === stageName);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Main Component ──────────────────────────────────────

interface FunnelAdvancedFlowProps {
  mockStages?: FunnelStageWithCount[];
  mockTransitions?: FunnelTransition[];
}

export default function FunnelAdvancedFlow({ mockStages, mockTransitions }: FunnelAdvancedFlowProps = {}) {
  const { user } = useAuth();
  const fetched = useFunnelAdvancedStages(user?.id || null);
  const useMock = mockStages != null && mockTransitions != null;
  const stages = useMock ? mockStages : fetched.stages;
  const transitions = useMock ? mockTransitions : fetched.transitions;
  const isLoading = useMock ? false : fetched.isLoading;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [stageLeads, setStageLeads] = useState<StageLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const nodePositions = useMemo(() => layoutNodes(stages), [stages]);

  const posMap = useMemo(() => {
    const m: Record<string, NodePos> = {};
    for (const p of nodePositions) m[p.id] = p;
    return m;
  }, [nodePositions]);

  const svgWidth = useMemo(() => {
    if (nodePositions.length === 0) return 600;
    return Math.max(...nodePositions.map((n) => n.x)) + NODE_W + PADDING * 2;
  }, [nodePositions]);

  const svgHeight = useMemo(() => {
    if (nodePositions.length === 0) return 400;
    return Math.max(...nodePositions.map((n) => n.y)) + NODE_H + PADDING * 2;
  }, [nodePositions]);

  const selectedStage = selectedId ? stages.find((s) => s.id === selectedId) : null;

  // Edges connected to selected/hovered node — for highlighting
  const activeNodeId = selectedId || hoveredId;
  const connectedEdgeIds = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const ids = new Set<string>();
    for (const t of transitions) {
      if (t.from_stage_id === activeNodeId || t.to_stage_id === activeNodeId) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [transitions, activeNodeId]);

  // Fetch leads for selected stage
  const fetchLeads = useCallback(async (stageId: string) => {
    if (!user?.id) return;
    setLeadsLoading(true);
    try {
      const res = await fetch(
        `/api/funnel/leads?userId=${user.id}&stageId=${stageId}&pageSize=20`
      );
      const data = await res.json();
      setStageLeads(
        (data.leads || []).map((l: Record<string, unknown>) => ({
          id: l.id,
          lead_name: l.lead_name,
          phone: l.phone,
          email: l.email,
          entered_current_stage_at: l.entered_current_stage_at,
          next_action_type: l.next_action_type,
          next_action_at: l.next_action_at,
        }))
      );
    } catch {
      setStageLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (selectedId) {
      fetchLeads(selectedId);
    } else {
      setStageLeads([]);
    }
  }, [selectedId, fetchLeads]);

  const handleNodeClick = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Automation Flow
        </h3>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading flow...
        </div>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Automation Flow
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No stages configured yet. Run the seed function to set up funnel stages.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Automation Flow
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Click a node to see details and leads. Arrows show how leads move between stages.
        </p>
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3">
          {Object.entries(BRANCH_COLORS).map(([branch, color]) => (
            <div key={branch} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {branch.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: Flow diagram */}
        <div className="flex-1 overflow-x-auto px-4 sm:px-6 pb-4 sm:pb-6 min-w-0">
          <svg width={svgWidth} height={svgHeight} className="block">
            <defs>
              {transitions.map((t: FunnelTransition) => {
                const from = posMap[t.from_stage_id];
                const branchColor = BRANCH_COLORS[from?.stage.branch || "main"] || "#9CA3AF";
                const isActive = connectedEdgeIds.has(t.id);
                return (
                  <marker
                    key={`arrow-${t.id}`}
                    id={`arrow-${t.id}`}
                    viewBox="0 0 10 10"
                    refX="10"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill={branchColor}
                      fillOpacity={isActive ? 1 : 0.4}
                    />
                  </marker>
                );
              })}
            </defs>

            {/* Edges */}
            {transitions.map((t: FunnelTransition) => {
              const from = posMap[t.from_stage_id];
              const to = posMap[t.to_stage_id];
              if (!from || !to) return null;

              const branchColor = BRANCH_COLORS[from.stage.branch || "main"] || "#9CA3AF";
              const isActive = connectedEdgeIds.has(t.id);

              return (
                <g key={t.id}>
                  <path
                    d={buildEdgePath(from, to)}
                    fill="none"
                    stroke={branchColor}
                    strokeWidth={isActive ? 2 : 1.2}
                    strokeOpacity={isActive ? 0.85 : 0.25}
                    markerEnd={`url(#arrow-${t.id})`}
                    strokeLinejoin="round"
                  />
                  {t.label && (
                    <text
                      x={(from.x + to.x) / 2 + NODE_W / 2}
                      y={(from.y + NODE_H + to.y) / 2 - 4}
                      textAnchor="middle"
                      fontSize={8}
                      className="fill-gray-400 dark:fill-gray-500"
                      style={{ pointerEvents: "none" }}
                    >
                      {t.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodePositions.map(({ id, x, y, stage }) => {
              const Icon = ICON_MAP[stage.icon || ""] || UserPlus;
              const branchColor = BRANCH_COLORS[stage.branch || "main"] || "#9CA3AF";
              const isSelected = selectedId === id;
              const isHovered = hoveredId === id;
              const isHighlighted = isSelected || isHovered;

              return (
                <g
                  key={id}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => handleNodeClick(id)}
                  onMouseEnter={() => setHoveredId(id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="cursor-pointer"
                >
                  {/* Shadow for selected */}
                  {isSelected && (
                    <rect
                      x={-2} y={-2}
                      width={NODE_W + 4} height={NODE_H + 4}
                      rx={14} ry={14}
                      fill="none"
                      stroke={branchColor}
                      strokeWidth={2.5}
                      strokeOpacity={0.35}
                    />
                  )}
                  {/* Card */}
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={12}
                    ry={12}
                    fill={isHighlighted ? `${branchColor}12` : "white"}
                    stroke={branchColor}
                    strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1}
                    className="dark:fill-gray-800"
                  />
                  {/* Left accent */}
                  <rect x={0} y={12} width={3.5} height={NODE_H - 24} rx={2} fill={branchColor} />

                  {/* Icon */}
                  <foreignObject x={14} y={14} width={22} height={22}>
                    <Icon style={{ color: branchColor, width: 18, height: 18 }} />
                  </foreignObject>

                  {/* Name */}
                  <text x={42} y={28} fontSize={11.5} fontWeight={600} className="fill-gray-900 dark:fill-white">
                    {stage.display_name.length > 20
                      ? stage.display_name.slice(0, 20) + "…"
                      : stage.display_name}
                  </text>

                  {/* Lead count row */}
                  <foreignObject x={42} y={38} width={NODE_W - 54} height={28}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 2 }}>
                      <Users style={{ width: 11, height: 11, color: "#9CA3AF" }} />
                      <span style={{ fontSize: 11, color: "#6B7280" }}>
                        {stage.lead_count} lead{stage.lead_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </foreignObject>

                  {/* Count badge */}
                  {stage.lead_count > 0 && (
                    <>
                      <rect
                        x={NODE_W - 36}
                        y={10}
                        width={26}
                        height={18}
                        rx={9}
                        fill={branchColor}
                      />
                      <text
                        x={NODE_W - 23}
                        y={22.5}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill="white"
                      >
                        {stage.lead_count}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right: Detail panel */}
        <div
          className={`
            lg:w-[340px] lg:min-w-[340px] border-t lg:border-t-0 lg:border-l
            border-gray-200 dark:border-gray-700
            ${selectedStage ? "" : "hidden lg:block"}
          `}
        >
          <div className="lg:sticky lg:top-4 p-4 sm:p-5">
            {selectedStage ? (
              <DetailPanel
                stage={selectedStage}
                leads={stageLeads}
                leadsLoading={leadsLoading}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <PhoneCall className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Click a node to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────

function DetailPanel({
  stage,
  leads,
  leadsLoading,
  onClose,
}: {
  stage: FunnelStageWithCount;
  leads: StageLead[];
  leadsLoading: boolean;
  onClose: () => void;
}) {
  const branchColor = BRANCH_COLORS[stage.branch || "main"] || "#9CA3AF";
  const Icon = ICON_MAP[stage.icon || ""] || UserPlus;
  const actions = getStageActions(stage.name);
  const timeTrans = getTimeTransitionsFrom(stage.name);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${branchColor}18` }}
          >
            <Icon style={{ color: branchColor, width: 16, height: 16 }} />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
              {stage.display_name}
            </h4>
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: branchColor }}
            >
              {stage.branch || "main"} &middot; {stage.stage_type.replace("_", " ")}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      {stage.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {stage.description}
        </p>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Automatic Actions
          </h5>
          {actions.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-300"
            >
              <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: branchColor }} />
              {ACTION_LABELS[a.action_type] || a.action_type}
              {a.delay_days > 0 && (
                <span className="ml-auto text-[10px] text-gray-400">
                  +{a.delay_days}d
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Time transitions */}
      {timeTrans.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Time-Based Transitions
          </h5>
          {timeTrans.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-300"
            >
              <Clock className="w-3 h-3 flex-shrink-0 text-gray-400" />
              After {t.days} day{t.days !== 1 ? "s" : ""}
              <ChevronRight className="w-3 h-3 flex-shrink-0 text-gray-400" />
              <span className="font-medium">{t.to.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Leads */}
      <div className="space-y-2">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Leads in Stage ({stage.lead_count})
        </h5>
        {leadsLoading ? (
          <div className="flex items-center gap-2 py-4 justify-center text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading leads...</span>
          </div>
        ) : leads.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">
            No leads in this stage
          </p>
        ) : (
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white uppercase"
                  style={{ backgroundColor: branchColor }}
                >
                  {(lead.lead_name || "?")[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                    {lead.lead_name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {lead.phone && (
                      <span className="flex items-center gap-0.5">
                        <Phone className="w-2.5 h-2.5" />
                        {lead.phone}
                      </span>
                    )}
                    {lead.email && !lead.phone && (
                      <span className="flex items-center gap-0.5">
                        <Mail className="w-2.5 h-2.5" />
                        {lead.email}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {timeAgo(lead.entered_current_stage_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
