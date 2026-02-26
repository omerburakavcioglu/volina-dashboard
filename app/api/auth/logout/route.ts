import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side logout
export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Logout API error:", error);
    // Still return success - client-side cleanup is more important
    return NextResponse.json({ success: true });
  }
}

