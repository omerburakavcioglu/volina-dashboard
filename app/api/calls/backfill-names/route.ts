import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST - Backfill caller_name for existing calls by matching phone numbers to leads
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    
    // Define call type
    interface CallRecord {
      id: string;
      caller_phone: string | null;
      metadata: { lead_id?: string } | null;
    }
    
    // Get all calls without caller_name
    const baseQuery = supabase
      .from("calls")
      .select("id, caller_phone, metadata")
      .is("caller_name", null)
      .not("caller_phone", "is", null);
    
    // Optionally filter by user
    const finalQuery = userId ? baseQuery.eq("user_id", userId) : baseQuery;
    
    const { data: calls, error: callsError } = await finalQuery as {
      data: CallRecord[] | null;
      error: { message: string } | null;
    };
    
    if (callsError) {
      console.error("Error fetching calls:", callsError);
      return NextResponse.json(
        { error: "Failed to fetch calls", details: callsError.message },
        { status: 500 }
      );
    }
    
    if (!calls || calls.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls need backfilling",
        updated: 0,
        total: 0,
      });
    }
    
    console.log(`Found ${calls.length} calls to backfill`);
    
    // Get all leads for matching
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, full_name, phone") as { 
        data: Array<{ id: string; full_name: string | null; phone: string | null }> | null; 
        error: { message: string } | null 
      };
    
    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads", details: leadsError.message },
        { status: 500 }
      );
    }
    
    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No leads found to match against",
        updated: 0,
        total: calls.length,
      });
    }
    
    // Create a phone number to lead name map with multiple formats
    const phoneToName: Record<string, string> = {};
    for (const lead of leads) {
      if (lead.phone && lead.full_name) {
        const phone = lead.phone;
        // Store all variants
        phoneToName[phone] = lead.full_name;
        phoneToName[phone.replace(/^\+/, '')] = lead.full_name;
        phoneToName[phone.replace(/^\+90/, '0')] = lead.full_name;
        phoneToName[phone.replace(/^90/, '0')] = lead.full_name;
        phoneToName['+' + phone.replace(/^\+/, '')] = lead.full_name;
        // Also store without any leading zeros for flexibility
        phoneToName[phone.replace(/^0+/, '')] = lead.full_name;
      }
    }
    
    let updated = 0;
    let skipped = 0;
    const results: Array<{ call_id: string; phone: string; name: string | null; status: string }> = [];
    
    for (const call of calls) {
      const callerPhone = call.caller_phone;
      if (!callerPhone) {
        skipped++;
        continue;
      }
      
      // First check if there's a lead_id in metadata
      let matchedName: string | null = null;
      const metadata = call.metadata as { lead_id?: string } | null;
      
      if (metadata?.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("full_name")
          .eq("id", metadata.lead_id)
          .single() as { data: { full_name: string | null } | null };
        
        if (lead?.full_name) {
          matchedName = lead.full_name;
        }
      }
      
      // If no match from lead_id, try phone number matching
      if (!matchedName) {
        // Try different phone formats
        const phoneVariants = [
          callerPhone,
          callerPhone.replace(/^\+/, ''),
          callerPhone.replace(/^\+90/, '0'),
          callerPhone.replace(/^90/, '0'),
          '+' + callerPhone.replace(/^\+/, ''),
          callerPhone.replace(/^0+/, ''),
        ];
        
        for (const variant of phoneVariants) {
          if (phoneToName[variant]) {
            matchedName = phoneToName[variant];
            break;
          }
        }
      }
      
      if (matchedName) {
        // Update the call with the matched name
        const { error: updateError } = await supabase
          .from("calls")
          .update({ caller_name: matchedName } as never)
          .eq("id", call.id);
        
        if (updateError) {
          console.error(`Error updating call ${call.id}:`, updateError);
          results.push({ call_id: call.id, phone: callerPhone, name: null, status: "error" });
        } else {
          updated++;
          results.push({ call_id: call.id, phone: callerPhone, name: matchedName, status: "updated" });
        }
      } else {
        skipped++;
        results.push({ call_id: call.id, phone: callerPhone, name: null, status: "no_match" });
      }
    }
    
    console.log(`Backfill complete: ${updated} updated, ${skipped} skipped`);
    
    return NextResponse.json({
      success: true,
      message: `Backfilled ${updated} calls with lead names`,
      updated,
      skipped,
      total: calls.length,
      results: results.slice(0, 50), // Only return first 50 for readability
    });
    
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Check how many calls need backfilling
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    
    // Count calls without caller_name
    let query = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .is("caller_name", null)
      .not("caller_phone", "is", null);
    
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    const { count, error } = await query;
    
    if (error) {
      return NextResponse.json(
        { error: "Failed to count calls", details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      calls_needing_backfill: count || 0,
      message: count ? `${count} calls can be backfilled` : "No calls need backfilling",
    });
    
  } catch (error) {
    console.error("Backfill check error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
