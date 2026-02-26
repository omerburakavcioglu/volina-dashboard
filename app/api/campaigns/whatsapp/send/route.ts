import { NextRequest, NextResponse } from "next/server";

// Send a WhatsApp message via the WhatsApp Cloud API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone_number_id, access_token, to, message } = body;

    if (!phone_number_id || !access_token || !to || !message) {
      return NextResponse.json(
        { success: false, error: "phone_number_id, access_token, to, and message are required" },
        { status: 400 }
      );
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    let normalizedTo = to.replace(/[\s\-\(\)]/g, "");
    // Ensure it starts with country code (no + prefix for WhatsApp API)
    if (normalizedTo.startsWith("+")) {
      normalizedTo = normalizedTo.substring(1);
    }

    // Send via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizedTo,
          type: "text",
          text: {
            body: message,
          },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error("WhatsApp API error:", waData);
      return NextResponse.json(
        {
          success: false,
          error: waData.error?.message || "WhatsApp API error",
          details: waData,
        },
        { status: waResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      message_id: waData.messages?.[0]?.id,
      data: waData,
    });
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
