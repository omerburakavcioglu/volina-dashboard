import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { 
  extractLeadFromCall, 
  determineLeadStatus, 
  determineLeadPriority 
} from "@/lib/vapi-lead-extractor";

interface CallRecord {
  id: string;
  user_id: string;
  transcript?: string;
  summary?: string;
  sentiment?: string;
  type?: string;
  caller_phone?: string;
  created_at: string;
  [key: string]: unknown;
}

// POST - Sync calls to leads
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch all calls that don't have an associated lead yet
    const { data: calls, error: callsError } = await supabase
      .from("calls")
      .select("*")
      .eq("user_id", userId)
      .not("transcript", "is", null)
      .order("created_at", { ascending: false }) as { data: CallRecord[] | null; error: { message: string } | null };

    if (callsError) {
      console.error("Error fetching calls:", callsError);
      return NextResponse.json(
        { error: "Failed to fetch calls" },
        { status: 500 }
      );
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls to process",
        created: 0,
        updated: 0,
      });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const call of calls) {
      // Extract lead info from call
      const extracted = extractLeadFromCall({
        transcript: call.transcript,
        summary: call.summary,
        sentiment: call.sentiment,
        type: call.type,
        caller_phone: call.caller_phone,
      });

      // Skip calls without useful lead info
      if (!extracted.full_name && !extracted.phone) {
        skipped++;
        continue;
      }

      // Check if lead already exists (by phone or name)
      let existingLead: { id: string } | null = null;
      
      if (extracted.phone) {
        const { data } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", userId)
          .eq("phone", extracted.phone)
          .single() as { data: { id: string } | null; error: unknown };
        existingLead = data;
      }

      if (!existingLead && extracted.full_name) {
        const { data } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", userId)
          .eq("full_name", extracted.full_name)
          .single() as { data: { id: string } | null; error: unknown };
        existingLead = data;
      }

      const status = determineLeadStatus(extracted);
      const priority = determineLeadPriority(extracted);

      if (existingLead) {
        // Update existing lead with new contact info
        const nextContactDate = new Date(); // Set to now
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("leads")
          .update({
            last_contact_date: call.created_at,
            next_contact_date: nextContactDate.toISOString(), // Set for follow-up
            status: status,
            notes: call.summary || extracted.treatment_interest,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLead.id);

        if (!updateError) {
          updated++;
        }
      } else {
        // Create new lead
        // Set next_contact_date to now (so it shows in "today's leads")
        const nextContactDate = new Date();
        
        const leadData = {
          user_id: userId,
          full_name: extracted.full_name || `Lead ${new Date(call.created_at).toLocaleDateString('tr-TR')}`,
          phone: extracted.phone,
          source: 'other', // AI phone call
          treatment_interest: extracted.treatment_interest || extracted.business_type,
          notes: call.summary || `${extracted.business_type} - VAPI call`,
          status: status,
          priority: priority,
          language: 'tr',
          first_contact_date: call.created_at,
          last_contact_date: call.created_at,
          next_contact_date: nextContactDate.toISOString(), // Set for today
          contact_attempts: 1,
        };

        const { error: insertError } = await supabase
          .from("leads")
          .insert(leadData as never);

        if (!insertError) {
          created++;
        } else {
          console.error("Error creating lead:", insertError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${created} leads, updated ${updated}, skipped ${skipped}`,
      created,
      updated,
      skipped,
      total: calls.length,
    });
  } catch (error) {
    console.error("Lead sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync leads" },
      { status: 500 }
    );
  }
}

// GET - Get sync status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({
      status: "ok",
      message: "Use POST with userId to sync calls to leads",
    });
  }

  const supabase = createAdminClient();

  // Get counts
  const { count: callCount } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: leadCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  return NextResponse.json({
    status: "ok",
    callCount,
    leadCount,
    message: `${callCount} calls, ${leadCount} leads for user`,
  });
}

