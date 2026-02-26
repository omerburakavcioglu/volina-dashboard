import { google } from "googleapis";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: string;
  }[];
  status?: string;
  htmlLink?: string;
}

export async function getGoogleCalendarEvents(
  accessToken: string,
  timeMin?: Date,
  timeMax?: Date,
  calendarId: string = "primary"
): Promise<GoogleCalendarEvent[]> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const defaultTimeMin = timeMin || new Date(now.setHours(0, 0, 0, 0));
  const defaultTimeMax = timeMax || new Date(now.setDate(now.getDate() + 30));

  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin: defaultTimeMin.toISOString(),
      timeMax: defaultTimeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    return (response.data.items || []) as GoogleCalendarEvent[];
  } catch (error) {
    console.error("Error fetching Google Calendar events:", error);
    return [];
  }
}

export async function getGoogleCalendarList(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const response = await calendar.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    console.error("Error fetching calendar list:", error);
    return [];
  }
}

// Convert Google Calendar event to our Appointment format
export function convertGoogleEventToAppointment(event: GoogleCalendarEvent) {
  const startDateTime = event.start.dateTime || event.start.date || "";
  const endDateTime = event.end.dateTime || event.end.date || "";
  
  // Extract patient info from attendees or description
  const attendee = event.attendees?.[0];
  const patientName = attendee?.displayName || attendee?.email?.split("@")[0] || event.summary || "Unknown";
  const patientEmail = attendee?.email || "";

  return {
    id: event.id,
    patient_name: patientName,
    patient_email: patientEmail,
    patient_phone: "", // Not available from Google Calendar
    start_time: startDateTime,
    end_time: endDateTime,
    status: event.status === "cancelled" ? "cancelled" : "scheduled",
    notes: event.description || "",
    created_via_ai: false,
    google_event_id: event.id,
    google_calendar_link: event.htmlLink,
  };
}
