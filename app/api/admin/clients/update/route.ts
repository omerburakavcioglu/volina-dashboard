import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const body = await request.json();
    const { adminUserId, clientId, updates } = body;

    if (!adminUserId || !clientId) {
      return NextResponse.json({ success: false, error: "Admin user ID and client ID required" }, { status: 400 });
    }

    // Verify the requester is an admin
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    // Whitelist of updatable fields
    const allowedFields = [
      "vapi_assistant_id", "vapi_phone_number_id", "vapi_org_id", "vapi_private_key",
      "company_name", "full_name", "dashboard_type",
    ];
    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates || {})) {
      if (allowedFields.includes(key)) {
        safeUpdates[key] = value;
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    safeUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("profiles")
      .update(safeUpdates)
      .eq("id", clientId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal error" }, { status: 500 });
  }
}
