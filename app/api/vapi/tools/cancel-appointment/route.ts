import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Vapi Tool: Cancel Appointment
// This tool is called by Vapi to cancel an existing appointment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const args = body.message?.toolCallList?.[0]?.function?.arguments || body;
    const { 
      appointment_id,
      patient_name,
      patient_phone,
      date,
      time
    } = args;

    // Get Vapi orgId from webhook body
    const vapiOrgId = body.message?.call?.orgId || body.orgId;
    
    if (!vapiOrgId) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
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
            success: false,
            error: "Account not found for this Vapi organization",
          },
        }],
      });
    }

    const userId = profile.id;

    // Try to find the appointment
    let appointmentQuery = supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "cancelled");

    // If we have an appointment_id, use that directly
    if (appointment_id) {
      appointmentQuery = appointmentQuery.eq("id", appointment_id);
    } else {
      // Otherwise try to find by patient info and/or time
      if (patient_name) {
        appointmentQuery = appointmentQuery.ilike("patient_name", `%${patient_name}%`);
      }
      if (patient_phone) {
        appointmentQuery = appointmentQuery.eq("patient_phone", patient_phone);
      }
      if (date && time) {
        const startDateTime = `${date}T${time}:00`;
        appointmentQuery = appointmentQuery.eq("start_time", startDateTime);
      } else if (date) {
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;
        appointmentQuery = appointmentQuery
          .gte("start_time", startOfDay)
          .lte("start_time", endOfDay);
      }
    }

    const { data: appointments, error: fetchError } = await appointmentQuery as {
      data: { id: string; patient_name: string; start_time: string }[] | null;
      error: unknown;
    };

    if (fetchError) {
      console.error("Error finding appointment:", fetchError);
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "Failed to find appointment",
          },
        }],
      });
    }

    if (!appointments || appointments.length === 0) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "No matching appointment found",
          },
        }],
      });
    }

    // If multiple appointments found, return error asking for more specifics
    if (appointments.length > 1) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: `Found ${appointments.length} appointments. Please provide more details to identify the specific appointment.`,
            appointments: appointments.map(apt => {
              const timeParts = apt.start_time.split("T");
              return {
                patient_name: apt.patient_name,
                date: timeParts[0] || "",
                time: timeParts[1]?.substring(0, 5) || "",
              };
            }),
          },
        }],
      });
    }

    // Cancel the appointment
    const appointment = appointments[0];
    if (!appointment) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "Appointment not found",
          },
        }],
      });
    }
    
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "cancelled" } as never)
      .eq("id", appointment.id);

    if (updateError) {
      console.error("Error cancelling appointment:", updateError);
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "Failed to cancel appointment",
          },
        }],
      });
    }

    return NextResponse.json({
      results: [{
        toolCallId: body.message?.toolCallList?.[0]?.id || "cancel-appointment",
        result: {
          success: true,
          appointment_id: appointment.id,
          patient_name: appointment.patient_name,
          message: `Successfully cancelled appointment for ${appointment.patient_name}`,
        },
      }],
    });
  } catch (error) {
    console.error("Cancel appointment error:", error);
    return NextResponse.json({
      results: [{
        toolCallId: "error",
        result: {
          success: false,
          error: "Internal server error",
        },
      }],
    }, { status: 500 });
  }
}
