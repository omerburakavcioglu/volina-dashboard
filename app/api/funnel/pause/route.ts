import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const body = await request.json();
  const action = body.action as "pause" | "resume";

  const supabase = createAdminClient();

  if (action === "pause") {
    await (supabase as any)
      .from("funnel_config")
      .update({
        is_running: false,
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json({ success: true, message: "Funnel paused" });
  }

  if (action === "resume") {
    await (supabase as any)
      .from("funnel_config")
      .update({
        is_running: true,
        paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json({ success: true, message: "Funnel resumed" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
