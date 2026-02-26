import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface CampaignStep {
  day: number;
  channel: string;
  description?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, user_id } = body;

    if (!campaign_id || !user_id) {
      return NextResponse.json(
        { error: "campaign_id and user_id are required" },
        { status: 400 }
      );
    }

    // 1. Get the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // 2. Get leads sorted by priority (high > medium > low), excluding converted/lost/unreachable
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user_id)
      .not("status", "in", '("converted","lost","unreachable")')
      .order("created_at", { ascending: true });

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { message: "No eligible leads found", created: 0 },
        { status: 200 }
      );
    }

    // Sort leads by priority manually
    const sortedLeads = leads.sort((a, b) => {
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 2;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 2;
      return aPriority - bPriority;
    });

    // 3. Parse campaign schedule
    const schedule: CampaignStep[] = campaign.schedule || [];
    
    if (schedule.length === 0) {
      return NextResponse.json(
        { error: "Campaign has no steps defined" },
        { status: 400 }
      );
    }

    // 4. Create outreach records for each lead
    const now = new Date();
    const outreachRecords: Array<{
      user_id: string;
      lead_id: string;
      campaign_id: string;
      channel: string;
      status: string;
      scheduled_for: string;
      notes: string;
    }> = [];

    for (const lead of sortedLeads) {
      // Update lead with campaign assignment
      await supabase
        .from("leads")
        .update({ 
          campaign_id: campaign_id,
          campaign_day: 0,
          next_contact_date: now.toISOString()
        } as never)
        .eq("id", lead.id);

      // Create outreach for each step
      for (const step of schedule) {
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + step.day);
        
        // Set time based on business hours (9 AM - 6 PM)
        const hour = 9 + Math.floor(Math.random() * 9); // Random hour between 9-17
        const minute = Math.floor(Math.random() * 60);
        scheduledDate.setHours(hour, minute, 0, 0);

        outreachRecords.push({
          user_id: user_id,
          lead_id: lead.id,
          campaign_id: campaign_id,
          channel: step.channel,
          status: "scheduled",
          scheduled_for: scheduledDate.toISOString(),
          notes: step.description || `${step.channel} - Campaign: ${campaign.name}`,
        });
      }
    }

    // 5. Batch insert outreach records
    if (outreachRecords.length > 0) {
      const { error: insertError } = await supabase
        .from("outreach")
        .insert(outreachRecords as never[]);

      if (insertError) {
        console.error("Error creating outreach records:", insertError);
        return NextResponse.json(
          { error: "Failed to create outreach records: " + insertError.message },
          { status: 500 }
        );
      }
    }

    // 6. Mark campaign as active
    await supabase
      .from("campaigns")
      .update({ is_active: true } as never)
      .eq("id", campaign_id);

    // 7. Return summary
    const todaysOutreach = outreachRecords.filter(o => {
      const scheduled = new Date(o.scheduled_for);
      return scheduled.toDateString() === now.toDateString();
    });

    return NextResponse.json({
      success: true,
      message: `Campaign started successfully`,
      summary: {
        total_leads: sortedLeads.length,
        total_outreach_created: outreachRecords.length,
        todays_scheduled: todaysOutreach.length,
        campaign_name: campaign.name,
      }
    });

  } catch (error) {
    console.error("Error running campaign:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Get campaign run status
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign_id = searchParams.get("campaign_id");
  const user_id = searchParams.get("user_id");

  if (!campaign_id || !user_id) {
    return NextResponse.json(
      { error: "campaign_id and user_id are required" },
      { status: 400 }
    );
  }

  try {
    // Get outreach stats for this campaign
    const { data: outreach, error } = await supabase
      .from("outreach")
      .select("status, channel, scheduled_for")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const today = now.toDateString();

    const stats = {
      total: outreach?.length || 0,
      scheduled: outreach?.filter(o => o.status === "scheduled").length || 0,
      completed: outreach?.filter(o => o.status === "completed").length || 0,
      failed: outreach?.filter(o => o.status === "failed").length || 0,
      todays_scheduled: outreach?.filter(o => {
        const scheduled = new Date(o.scheduled_for);
        return scheduled.toDateString() === today && o.status === "scheduled";
      }).length || 0,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error getting campaign status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
