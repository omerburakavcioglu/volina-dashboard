import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const stage = request.nextUrl.searchParams.get("stage"); // simple_stage filter
  const page = parseInt(request.nextUrl.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(request.nextUrl.searchParams.get("pageSize") || "50", 10);
  const search = request.nextUrl.searchParams.get("search") || "";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = (supabase as any)
    .from("funnel_leads")
    .select(
      `
      id,
      lead_id,
      current_stage_id,
      status,
      branch,
      entered_funnel_at,
      entered_current_stage_at,
      next_action_at,
      next_action_type,
      metadata,
      leads!inner(full_name, phone, email, source),
      funnel_stages!inner(name, display_name, color, simple_stage)
    `,
      { count: "exact" }
    )
    .eq("user_id", userId)
    .in("status", ["active", "paused"]);

  if (stage) {
    query = query.eq("funnel_stages.simple_stage", stage);
  }

  if (search) {
    query = query.ilike("leads.full_name", `%${search}%`);
  }

  query = query.order("entered_current_stage_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("[funnel/leads] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data || []).map((fl: Record<string, unknown>) => {
    const lead = fl.leads as { full_name: string; phone: string | null; email: string | null; source: string | null };
    const stageInfo = fl.funnel_stages as { name: string; display_name: string; color: string; simple_stage: string };

    return {
      id: fl.id,
      lead_id: fl.lead_id,
      lead_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      current_stage_id: fl.current_stage_id,
      stage_name: stageInfo.display_name,
      stage_color: stageInfo.color,
      simple_stage: stageInfo.simple_stage,
      status: fl.status,
      branch: fl.branch,
      entered_funnel_at: fl.entered_funnel_at,
      entered_current_stage_at: fl.entered_current_stage_at,
      next_action_at: fl.next_action_at,
      next_action_type: fl.next_action_type,
      metadata: fl.metadata,
    };
  });

  return NextResponse.json({
    success: true,
    leads,
    total: count || 0,
    page,
    pageSize,
  });
}
