import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Vapi Tool: Check Availability
// This tool is called by Vapi to check available appointment slots
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const args = body.message?.toolCallList?.[0]?.function?.arguments || body;
    const { date, doctor_id } = args;

    // Get Vapi orgId from webhook body
    const vapiOrgId = body.message?.call?.orgId || body.orgId;
    
    if (!vapiOrgId) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            available: false,
            error: "Vapi organization ID not found",
          },
        }],
      });
    }

    const supabase = createAdminClient();

    // Find user by vapi_org_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("vapi_org_id", vapiOrgId)
      .single() as { data: { id: string } | null; error: unknown };

    if (profileError || !profile) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            available: false,
            error: "Account not found for this Vapi organization",
          },
        }],
      });
    }

    const userId = profile.id;

    // Get the requested date or default to today
    const requestedDate = date || new Date().toISOString().split("T")[0];
    const startOfDay = `${requestedDate}T00:00:00`;
    const endOfDay = `${requestedDate}T23:59:59`;

    // Fetch existing appointments for the date
    let query = supabase
      .from("appointments")
      .select("start_time, end_time, doctor_id")
      .eq("user_id", userId)
      .gte("start_time", startOfDay)
      .lte("start_time", endOfDay)
      .neq("status", "cancelled");

    if (doctor_id) {
      query = query.eq("doctor_id", doctor_id);
    }

    const { data: existingAppointments, error } = await query as { 
      data: { start_time: string; end_time: string; doctor_id: string }[] | null; 
      error: unknown 
    };

    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            available: false,
            error: "Failed to check availability",
          },
        }],
      });
    }

    // Generate available slots (9 AM to 6 PM, 30-minute intervals)
    const allSlots = [];
    for (let hour = 9; hour < 18; hour++) {
      allSlots.push(`${hour.toString().padStart(2, "0")}:00`);
      allSlots.push(`${hour.toString().padStart(2, "0")}:30`);
    }

    // Filter out booked slots
    const bookedTimes = existingAppointments?.map((apt) => {
      const time = new Date(apt.start_time);
      return `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
    }) || [];

    const availableSlots = allSlots.filter((slot) => !bookedTimes.includes(slot));

    return NextResponse.json({
      results: [{
        toolCallId: body.message?.toolCallList?.[0]?.id || "check-availability",
        result: {
          available: availableSlots.length > 0,
          date: requestedDate,
          slots: availableSlots,
          bookedCount: bookedTimes.length,
          message: availableSlots.length > 0 
            ? `Found ${availableSlots.length} available slots on ${requestedDate}`
            : `No available slots on ${requestedDate}`,
        },
      }],
    });
  } catch (error) {
    console.error("Check availability error:", error);
    return NextResponse.json({
      results: [{
        toolCallId: "error",
        result: {
          available: false,
          error: "Internal server error",
        },
      }],
    }, { status: 500 });
  }
}
