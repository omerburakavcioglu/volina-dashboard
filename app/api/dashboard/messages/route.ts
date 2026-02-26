import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const channel = searchParams.get("channel");
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }

    // Fetch messages - MUST filter by user_id for security
    let messagesQuery = supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (channel && channel !== "all") {
      messagesQuery = messagesQuery.eq("channel", channel);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    // Fetch templates - filter by user_id
    const { data: templates, error: templatesError } = await supabase
      .from("message_templates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
    }

    return NextResponse.json({
      success: true,
      messages: messages || [],
      templates: templates || [],
    });
  } catch (error: any) {
    console.error("Messages API error:", error);
    return NextResponse.json(
      { success: false, error: error.message, messages: [], templates: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel, recipient, subject, content, userId } = body;

    const { data, error } = await supabase
      .from("messages")
      .insert({
        user_id: userId,
        channel,
        recipient,
        subject,
        content,
        status: "pending",
        direction: "outbound",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Send message API error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

