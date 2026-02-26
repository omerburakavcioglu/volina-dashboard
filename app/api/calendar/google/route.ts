import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getGoogleCalendarEvents, convertGoogleEventToAppointment } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated with Google", needsAuth: true },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    
    // Default to today's date if not provided
    let timeMin: Date;
    let timeMax: Date;
    
    if (dateStr) {
      timeMin = new Date(dateStr);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(dateStr);
      timeMax.setHours(23, 59, 59, 999);
    } else {
      timeMin = new Date();
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + 30);
    }

    const events = await getGoogleCalendarEvents(
      session.accessToken,
      timeMin,
      timeMax
    );

    const appointments = events.map(convertGoogleEventToAppointment);

    return NextResponse.json({
      success: true,
      appointments,
      count: appointments.length,
    });
  } catch (error) {
    console.error("Google Calendar API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Google Calendar events" },
      { status: 500 }
    );
  }
}
