import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await (supabase as any)
    .from("funnel_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, config: data || null });
}

export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const body = await request.json();
  const supabase = createAdminClient();

  const { data, error } = await (supabase as any)
    .from("funnel_config")
    .upsert(
      {
        user_id: userId,
        daily_call_limit: body.daily_call_limit,
        calling_hours_start: body.calling_hours_start,
        calling_hours_end: body.calling_hours_end,
        hard_waiting_days: body.hard_waiting_days,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, config: data });
}
