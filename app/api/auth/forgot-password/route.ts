import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUCCESS_MESSAGE =
  "If an account exists with that email, we've sent instructions to reset your password. Check your inbox and spam folder.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // Prefer NEXT_PUBLIC_APP_URL in production (set to your live URL in Vercel env).
    // Fallback to request origin so localhost works without env.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      request.nextUrl.origin ||
      "";
    const redirectTo = baseUrl ? `${baseUrl.replace(/\/$/, "")}/reset-password` : undefined;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : {});
  } catch {
    // Intentionally not exposing errors (e.g. user not found) to avoid email enumeration
  }

  return NextResponse.json({
    success: true,
    message: SUCCESS_MESSAGE,
  });
}
