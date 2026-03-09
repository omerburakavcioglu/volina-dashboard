"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { useFunnelAdvancedStages } from "@/hooks/useFunnel";
import {
  UserPlus, PhoneCall, Clock, MessageCircle, PhoneForwarded, Heart, Send,
  Archive, Stethoscope, Star, AlertTriangle, HeartPulse, Award
} from "lucide-react";
import type { FunnelStageWithCount, FunnelTransition } from "@/lib/types-funnel";

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

interface NodePos {
  id: string;
  x: number;
  y: number;
  stage: FunnelStageWithCount;
}

function layoutNodes(stages: FunnelStageWithCount[]): NodePos[] {
  const NODE_W = 180;
  const NODE_H = 70;
  const GAP_X = 40;
  const GAP_Y = 30;

  const branchOrder = ["main", "no_answer", "soft", "hard", "post_treatment", null];

  const byBranch: Record<string, FunnelStageWithCount[]> = {};
  for (const s of stages) {
    const b = s.branch || "none";
    if (!byBranch[b]) byBranch[b] = [];
    byBranch[b].push(s);
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
        x: colIndex * (NODE_W + GAP_X) + 20,
        y: i * (NODE_H + GAP_Y) + 20,
        stage: s,
      });
    }
    colIndex++;
  }

  return positions;
}

function buildPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export default function FunnelAdvancedFlow() {
  const { user } = useAuth();
  const { stages, transitions, isLoading } = useFunnelAdvancedStages(user?.id || null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const NODE_W = 180;
  const NODE_H = 70;

  const nodePositions = useMemo(() => layoutNodes(stages), [stages]);

  const posMap = useMemo(() => {
    const m: Record<string, NodePos> = {};
    for (const p of nodePositions) m[p.id] = p;
    return m;
  }, [nodePositions]);

  const svgWidth = useMemo(() => {
    if (nodePositions.length === 0) return 800;
    return Math.max(...nodePositions.map((n) => n.x)) + NODE_W + 40;
  }, [nodePositions]);

  const svgHeight = useMemo(() => {
    if (nodePositions.length === 0) return 600;
    return Math.max(...nodePositions.map((n) => n.y)) + NODE_H + 60;
  }, [nodePositions]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          How Your Funnel Works
        </h3>
        <p className="text-sm text-gray-400">Loading flow...</p>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          How Your Funnel Works
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No stages configured yet. Run the seed function in Supabase to set up the funnel stages.
        </p>
      </div>
    );
  }

  const hoveredStage = hoveredId ? stages.find((s) => s.id === hoveredId) : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          How Your Funnel Works
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          This read-only view shows the automation logic behind your funnel. Each node represents a stage, and arrows show how leads move between them.
        </p>
      </div>

      {/* Branch legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {Object.entries(BRANCH_COLORS).map(([branch, color]) => (
          <div key={branch} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{branch.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredStage && (
        <div className="mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {hoveredStage.display_name}
          </p>
          {hoveredStage.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {hoveredStage.description}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {hoveredStage.lead_count} leads &middot; {hoveredStage.stage_type} &middot; {hoveredStage.branch || "—"}
          </p>
        </div>
      )}

      {/* SVG Flow */}
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="min-w-full">
          {/* Arrows */}
          {transitions.map((t: FunnelTransition) => {
            const from = posMap[t.from_stage_id];
            const to = posMap[t.to_stage_id];
            if (!from || !to) return null;

            const fromStage = from.stage;
            const branchColor = BRANCH_COLORS[fromStage.branch || "main"] || "#9CA3AF";

            return (
              <g key={t.id}>
                <defs>
                  <marker
                    id={`arrow-${t.id}`}
                    viewBox="0 0 10 10"
                    refX="10"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={branchColor} />
                  </marker>
                </defs>
                <path
                  d={buildPath(
                    from.x + NODE_W / 2,
                    from.y + NODE_H,
                    to.x + NODE_W / 2,
                    to.y
                  )}
                  fill="none"
                  stroke={branchColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                  markerEnd={`url(#arrow-${t.id})`}
                />
                {t.label && (
                  <text
                    x={(from.x + to.x) / 2 + NODE_W / 2}
                    y={(from.y + NODE_H + to.y) / 2}
                    textAnchor="middle"
                    className="fill-gray-400 dark:fill-gray-500"
                    fontSize={9}
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
            const isHovered = hoveredId === id;

            return (
              <g
                key={id}
                transform={`translate(${x}, ${y})`}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  ry={12}
                  fill={isHovered ? `${branchColor}20` : "white"}
                  stroke={branchColor}
                  strokeWidth={isHovered ? 2 : 1}
                  className="dark:fill-gray-800"
                />
                {/* Left color bar */}
                <rect x={0} y={0} width={4} height={NODE_H} rx={2} fill={branchColor} />

                {/* Icon */}
                <foreignObject x={12} y={(NODE_H - 20) / 2} width={20} height={20}>
                  <Icon
                    style={{ color: branchColor, width: 16, height: 16, marginTop: 2 }}
                  />
                </foreignObject>

                {/* Name */}
                <text x={38} y={28} fontSize={11} fontWeight={600} className="fill-gray-900 dark:fill-white">
                  {stage.display_name.length > 18
                    ? stage.display_name.slice(0, 18) + "…"
                    : stage.display_name}
                </text>

                {/* Lead count */}
                <text x={38} y={48} fontSize={11} className="fill-gray-500 dark:fill-gray-400">
                  {stage.lead_count} leads
                </text>

                {/* Count badge */}
                {stage.lead_count > 0 && (
                  <>
                    <rect
                      x={NODE_W - 36}
                      y={8}
                      width={28}
                      height={18}
                      rx={9}
                      fill={branchColor}
                    />
                    <text
                      x={NODE_W - 22}
                      y={20}
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
    </div>
  );
}
