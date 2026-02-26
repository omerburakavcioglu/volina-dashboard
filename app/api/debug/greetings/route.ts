import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Find unique greetings (first AI message) for each assistant and for calls without assistant_id
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Get sample calls with transcripts for each assistant_id
    const { data: allCalls } = await supabase
      .from("calls")
      .select("id, assistant_id, transcript, caller_name, created_at")
      .eq("user_id", userId)
      .not("transcript", "is", null)
      .order("created_at", { ascending: false }) as { data: { id: string; assistant_id: string | null; transcript: string | null; caller_name: string | null; created_at: string }[] | null };

    // Group by assistant_id and extract first AI message
    const greetingsByAssistant: Record<string, { greeting: string; count: number; sample: string }> = {};
    
    allCalls?.forEach(call => {
      const aid = call.assistant_id || "NO_ASSISTANT_ID";
      const transcript = call.transcript || "";
      
      // Extract first AI message
      const aiMatch = transcript.match(/^AI:\s*(.+?)(?:\n|$)/i);
      const greeting = aiMatch && aiMatch[1] ? aiMatch[1].trim().substring(0, 100) : "NO_GREETING_FOUND";
      
      if (!greetingsByAssistant[aid]) {
        greetingsByAssistant[aid] = { 
          greeting, 
          count: 1,
          sample: call.caller_name || "Unknown"
        };
      } else {
        greetingsByAssistant[aid].count++;
      }
    });

    // Also get unique greetings from NO_ASSISTANT_ID calls
    const noAssistantCalls = allCalls?.filter(c => !c.assistant_id) || [];
    const uniqueGreetings: Record<string, number> = {};
    
    noAssistantCalls.forEach(call => {
      const transcript = call.transcript || "";
      const aiMatch = transcript.match(/^AI:\s*(.+?)(?:\n|$)/i);
      const greeting = aiMatch && aiMatch[1] ? aiMatch[1].trim().substring(0, 100) : "NO_GREETING";
      uniqueGreetings[greeting] = (uniqueGreetings[greeting] || 0) + 1;
    });

    return NextResponse.json({
      greetingsByAssistant,
      uniqueGreetingsInNoAssistantCalls: uniqueGreetings,
      totalNoAssistantCalls: noAssistantCalls.length,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
