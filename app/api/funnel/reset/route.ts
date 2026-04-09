import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/funnel/reset?userId=...
 *
 * Resets the funnel for a tenant:
 * - Deletes all funnel_schedules, funnel_events, funnel_leads for this user
 * - Resets leads.status = "new" for every lead that was in the funnel
 * - Resets funnel_config: is_running=false, started_at=null, paused_at=null
 *
 * After this, "Start Funnel" works exactly like the first time.
 */
export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Collect all lead_ids that are currently in the funnel (before deleting)
  const { data: funnelLeads } = await (supabase as any)
    .from("funnel_leads")
    .select("lead_id")
    .eq("user_id", userId);

  const leadIds: string[] = (funnelLeads || []).map(
    (fl: { lead_id: string }) => fl.lead_id
  );

  // 2. Delete child tables first (FK order)
  await (supabase as any)
    .from("funnel_schedules")
    .delete()
    .eq("user_id", userId);

  await (supabase as any)
    .from("funnel_events")
    .delete()
    .eq("user_id", userId);

  await (supabase as any)
    .from("funnel_leads")
    .delete()
    .eq("user_id", userId);

  // 3. Reset lead statuses back to "new" so they can re-enter the funnel
  if (leadIds.length > 0) {
    await (supabase as any)
      .from("leads")
      .update({ status: "new" })
      .eq("user_id", userId)
      .in("id", leadIds);
  }

  // 4. Reset funnel_config
  await (supabase as any)
    .from("funnel_config")
    .update({
      is_running: false,
      started_at: null,
      paused_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return NextResponse.json({
    success: true,
    message: `Funnel reset. ${leadIds.length} leads set back to "new".`,
    leads_reset: leadIds.length,
  });
}
