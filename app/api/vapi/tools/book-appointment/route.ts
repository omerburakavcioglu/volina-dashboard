import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Vapi Tool: Book Appointment
// This tool is called by Vapi to create a new appointment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const args = body.message?.toolCallList?.[0]?.function?.arguments || body;
    const { 
      patient_name, 
      patient_phone, 
      patient_email,
      doctor_id, 
      date, 
      time,
      notes 
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

    // Validate required fields
    if (!patient_name || !date || !time) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "Missing required fields: patient_name, date, and time are required",
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

    // Calculate end time (30 minutes after start)
    const [hours, minutes] = time.split(":").map(Number);
    let endHours = hours;
    let endMinutes = (minutes || 0) + 30;
    if (endMinutes >= 60) {
      endHours += 1;
      endMinutes -= 60;
    }
    const endTime = `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;

    // Get a doctor if not specified
    let selectedDoctorId = doctor_id;
    if (!selectedDoctorId) {
      const { data: doctors } = await supabase
        .from("doctors")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1) as { data: { id: string }[] | null };
      
      selectedDoctorId = doctors?.[0]?.id;
    }

    if (!selectedDoctorId) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "No available team members found",
          },
        }],
      });
    }

    // Check if slot is still available
    const startDateTime = `${date}T${time}:00`;
    const { data: existingAppointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("doctor_id", selectedDoctorId)
      .eq("start_time", startDateTime)
      .neq("status", "cancelled")
      .single() as { data: { id: string } | null };

    if (existingAppointment) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "This time slot is no longer available. Please choose another time.",
          },
        }],
      });
    }

    // Create the appointment
    const appointmentData = {
      user_id: userId,
      doctor_id: selectedDoctorId,
      patient_name,
      patient_phone: patient_phone || null,
      patient_email: patient_email || null,
      start_time: startDateTime,
      end_time: `${date}T${endTime}:00`,
      status: "scheduled",
      notes: notes || null,
      created_via_ai: true,
    };
    
    const { data: appointment, error } = await supabase
      .from("appointments")
      .insert(appointmentData as never)
      .select()
      .single() as { data: { id: string } | null; error: unknown };

    if (error) {
      console.error("Error creating appointment:", error);
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "Failed to create appointment",
          },
        }],
      });
    }

    if (!appointment) {
      return NextResponse.json({
        results: [{
          toolCallId: body.message?.toolCallList?.[0]?.id || "error",
          result: {
            success: false,
            error: "Failed to create appointment - no data returned",
          },
        }],
      });
    }

    return NextResponse.json({
      results: [{
        toolCallId: body.message?.toolCallList?.[0]?.id || "book-appointment",
        result: {
          success: true,
          appointment_id: appointment.id,
          date,
          time,
          patient_name,
          message: `Successfully booked appointment for ${patient_name} on ${date} at ${time}`,
        },
      }],
    });
  } catch (error) {
    console.error("Book appointment error:", error);
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
