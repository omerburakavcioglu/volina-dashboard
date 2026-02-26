import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { searchParams } = new URL(request.url);
    const adminUserId = searchParams.get("adminUserId");

    if (!adminUserId) {
      return NextResponse.json({ success: false, error: "Admin user ID required" }, { status: 400 });
    }

    // Verify the requester is an admin
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    if (adminError || !adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Unauthorized - admin role required" }, { status: 403 });
    }

    // Get all non-admin user profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .neq("role", "admin")
      .order("created_at", { ascending: false });

    if (profilesError) {
      return NextResponse.json({ success: false, error: profilesError.message }, { status: 500 });
    }

    // For each client, fetch aggregate metrics
    const clientsWithMetrics = await Promise.all(
      (profiles || []).map(async (profile) => {
        // Count leads by status
        const { count: totalLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id);

        const { count: newLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "new");

        const { count: contactedLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "contacted");

        const { count: interestedLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "interested");

        const { count: appointmentLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "appointment_set");

        const { count: convertedLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "converted");

        // Count total calls
        const { count: totalCalls } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id);

        // Count this month's calls
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const { count: monthlyCalls } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .gte("created_at", startOfMonth.toISOString());

        // Count today's calls
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { count: todayCalls } = await supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .gte("created_at", today.toISOString());

        // Get average call duration and score
        const { data: callStats } = await supabase
          .from("calls")
          .select("duration, evaluation_score")
          .eq("user_id", profile.id)
          .not("duration", "is", null);

        const avgDuration = callStats && callStats.length > 0
          ? Math.round(callStats.reduce((s: number, c: any) => s + (c.duration || 0), 0) / callStats.length)
          : 0;

        const scoredCalls = (callStats || []).filter((c: any) => c.evaluation_score != null);
        const avgScore = scoredCalls.length > 0
          ? Math.round((scoredCalls.reduce((s: number, c: any) => s + c.evaluation_score, 0) / scoredCalls.length) * 10) / 10
          : 0;

        // Count active campaigns
        const { count: activeCampaigns } = await supabase
          .from("auto_call_campaigns")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("status", "running");

        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          company_name: profile.company_name,
          slug: profile.slug,
          dashboard_type: profile.dashboard_type,
          role: profile.role,
          created_at: profile.created_at,
          vapi_assistant_id: profile.vapi_assistant_id || null,
          vapi_phone_number_id: profile.vapi_phone_number_id || null,
          metrics: {
            total_leads: totalLeads || 0,
            new_leads: newLeads || 0,
            contacted_leads: contactedLeads || 0,
            interested_leads: interestedLeads || 0,
            appointment_leads: appointmentLeads || 0,
            converted_leads: convertedLeads || 0,
            total_calls: totalCalls || 0,
            monthly_calls: monthlyCalls || 0,
            today_calls: todayCalls || 0,
            avg_duration: avgDuration,
            avg_score: avgScore,
            active_campaigns: activeCampaigns || 0,
          },
        };
      })
    );

    return NextResponse.json({ success: true, data: clientsWithMetrics });
  } catch (error: any) {
    console.error("Admin clients error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal error" }, { status: 500 });
  }
}
