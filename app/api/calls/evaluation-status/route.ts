import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Lightweight stats endpoint so the UI can show a small pill while the
// evaluate-pending cron is working through the queue for this tenant.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const countFor = (status: "pending" | "processing" | "failed") =>
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("evaluation_status", status);

  const [pendingRes, processingRes, failedRes] = await Promise.all([
    countFor("pending"),
    countFor("processing"),
    countFor("failed"),
  ]);

  return NextResponse.json({
    pending: pendingRes.count ?? 0,
    processing: processingRes.count ?? 0,
    failed: failedRes.count ?? 0,
  });
}
