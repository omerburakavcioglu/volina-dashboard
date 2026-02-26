import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, full_name, company_name, dashboard_type, role, admin_secret } = body;

    // Simple admin secret check (use CRON_SECRET as admin auth)
    if (admin_secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate slug from email
    const atIndex = email.indexOf("@");
    const domain = email.substring(atIndex + 1).split(".")[0];
    const username = email.substring(0, atIndex);
    const personalDomains = ["gmail", "hotmail", "yahoo", "outlook", "icloud", "mail", "protonmail"];
    const slug = personalDomains.includes(domain?.toLowerCase() || "")
      ? username.toLowerCase().replace(/[^a-z0-9]/g, "")
      : (domain || username).toLowerCase().replace(/[^a-z0-9]/g, "");

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || company_name || email.split("@")[0] },
    });

    if (authError) {
      return NextResponse.json({ success: false, error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // Update the profile (auto-created by trigger) with tenant-specific fields
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: full_name || company_name || email.split("@")[0],
        slug,
        dashboard_type: dashboard_type || "outbound",
        company_name: company_name || null,
        role: role || "user",
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Profile update error:", profileError);
      // Profile might not exist yet if trigger hasn't fired - try upsert
      const { error: upsertError } = await supabase.from("profiles").upsert({
        id: userId,
        email,
        full_name: full_name || company_name || email.split("@")[0],
        slug,
        dashboard_type: dashboard_type || "outbound",
        company_name: company_name || null,
        role: role || "user",
      });
      if (upsertError) {
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        user_id: userId,
        email,
        slug,
        dashboard_type: dashboard_type || "outbound",
        company_name,
        role: role || "user",
        login_url: `/${slug}`,
      },
    });
  } catch (error: any) {
    console.error("Setup tenant error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal error" }, { status: 500 });
  }
}
