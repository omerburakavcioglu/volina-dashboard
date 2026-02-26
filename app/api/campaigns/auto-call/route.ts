import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET - List all auto-call campaigns for a user
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ success: false, error: "User ID is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("auto_call_campaigns")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ success: true, data: [] });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("Campaigns GET error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create a new campaign
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { user_id, name, description, day_plans, time_slots, timezone, whatsapp_config } = body;

    if (!user_id || !name) {
      return NextResponse.json({ success: false, error: "User ID and name are required" }, { status: 400 });
    }

    const hasDayPlans = day_plans && Array.isArray(day_plans) && day_plans.length > 0;
    const hasTimeSlots = time_slots && Array.isArray(time_slots) && time_slots.length > 0;

    if (!hasDayPlans && !hasTimeSlots) {
      return NextResponse.json({ success: false, error: "Day plans or time slots are required" }, { status: 400 });
    }

    const campaignData: Record<string, unknown> = {
      user_id,
      name,
      description: description || null,
      is_active: false,
      status: "idle",
      timezone: timezone || "Europe/Istanbul",
      day_plans: hasDayPlans ? day_plans : null,
      time_slots: hasTimeSlots ? time_slots : (hasDayPlans ? day_plans : null),
    };

    if (whatsapp_config) {
      campaignData.whatsapp_config = whatsapp_config;
    }

    const { data, error } = await supabase
      .from("auto_call_campaigns")
      .insert(campaignData as never)
      .select()
      .single();

    if (error) {
      console.error("Error creating campaign:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Campaigns POST error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update campaign OR start/stop
export async function PUT(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { id, user_id, action, ...updateData } = body;

    if (!id || !user_id) {
      return NextResponse.json({ success: false, error: "Campaign ID and User ID are required" }, { status: 400 });
    }

    // Handle start/stop actions
    if (action === "start") {
      // Fetch new leads to assign
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "new")
        .order("created_at", { ascending: true });

      if (leadsError) {
        return NextResponse.json({ success: false, error: "Failed to fetch leads: " + leadsError.message }, { status: 500 });
      }

      const leadIds = (leads || []).map((l: { id: string }) => l.id);

      if (leadIds.length === 0) {
        return NextResponse.json({ success: false, error: "No new leads available to assign" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("auto_call_campaigns")
        .update({
          status: "running",
          is_active: true,
          started_at: new Date().toISOString(),
          assigned_lead_ids: leadIds,
          progress: {
            current_day: 1,
            calls_today: 0,
            messages_today: 0,
            total_calls: 0,
            total_messages: 0,
          },
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .eq("user_id", user_id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      // Clear any previous actions for this campaign (fresh start)
      await supabase.from("campaign_actions").delete().eq("campaign_id", id);

      return NextResponse.json({ success: true, data, leads_assigned: leadIds.length });
    }

    if (action === "stop") {
      const { data, error } = await supabase
        .from("auto_call_campaigns")
        .update({
          status: "paused",
          is_active: false,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .eq("user_id", user_id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    // Regular update
    const dataToUpdate = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("auto_call_campaigns")
      .update(dataToUpdate as never)
      .eq("id", id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Campaigns PUT error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!id || !userId) {
      return NextResponse.json({ success: false, error: "Campaign ID and User ID are required" }, { status: 400 });
    }

    // Delete actions first
    await supabase.from("campaign_actions").delete().eq("campaign_id", id);

    // Delete campaign
    const { error } = await supabase.from("auto_call_campaigns").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Campaign deleted successfully" });
  } catch (error) {
    console.error("Campaigns DELETE error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
