import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  validateAndNormalize,
  DEFAULT_CALLER_ID,
  isValidE164,
} from "@/lib/phone-utils";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// VAPI Configuration
const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

interface Lead {
  id: string;
  full_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  language: string;
}

interface Outreach {
  id: string;
  user_id: string;
  lead_id: string;
  channel: string;
  scheduled_for: string;
  status: string;
  lead?: Lead;
}

// Execute a single outreach (call, message, etc.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { outreach_id, lead_id, channel, direct_call } = body;

    // Direct call from leads page (without outreach record)
    if (direct_call && lead_id) {
      // Get lead data directly (including user_id)
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("*, user_id")
        .eq("id", lead_id)
        .single() as { data: (Lead & { user_id: string }) | null; error: unknown };

      if (leadError || !leadData) {
        return NextResponse.json(
          { error: "Lead not found" },
          { status: 404 }
        );
      }

      const lead = leadData;

      if (!lead.phone) {
        return NextResponse.json(
          { success: false, message: "Lead'in telefon numarası yok" },
          { status: 400 }
        );
      }

      // Execute direct call with user_id in metadata
      const result = await executeCallDirect(lead, lead.user_id);

      // Update lead status if successful
      if (result.success) {
        await supabase
          .from("leads")
          .update({ 
            status: "contacted",
            last_contact_date: new Date().toISOString(),
          } as never)
          .eq("id", lead_id);
      }

      return NextResponse.json({
        success: result.success,
        message: result.message,
        lead_id,
        channel: "call",
        vapi_call_id: result.vapi_call_id,
      });
    }

    // Original outreach-based call
    if (!outreach_id) {
      return NextResponse.json(
        { error: "outreach_id or lead_id with direct_call is required" },
        { status: 400 }
      );
    }

    // Get outreach with lead data
    const { data: outreach, error: outreachError } = await supabase
      .from("outreach")
      .select("*, lead:leads(*)")
      .eq("id", outreach_id)
      .single();

    if (outreachError || !outreach) {
      return NextResponse.json(
        { error: "Outreach not found" },
        { status: 404 }
      );
    }

    const typedOutreach = outreach as Outreach;
    const lead = typedOutreach.lead;

    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found for this outreach" },
        { status: 404 }
      );
    }

    // Mark as in progress
    await supabase
      .from("outreach")
      .update({ status: "in_progress" } as never)
      .eq("id", outreach_id);

    let result: {
      success: boolean;
      message: string;
      vapi_call_id?: string;
      error?: string;
    };

    // Execute based on channel
    switch (typedOutreach.channel) {
      case "call":
        result = await executeCall(lead, outreach_id, typedOutreach.user_id);
        break;
      case "whatsapp":
        result = await executeWhatsApp(lead, outreach_id);
        break;
      case "email":
        result = await executeEmail(lead, outreach_id);
        break;
      case "sms":
        result = await executeSMS(lead, outreach_id);
        break;
      case "instagram_dm":
        result = await executeInstagramDM(lead, outreach_id);
        break;
      default:
        result = { success: false, message: "Unknown channel", error: "Unknown channel type" };
    }

    // Update outreach status based on result
    const updateData: Record<string, string | undefined> = {
      status: result.success ? "completed" : "failed",
      completed_at: result.success ? new Date().toISOString() : undefined,
      notes: result.message,
    };

    if (result.vapi_call_id) {
      updateData.vapi_call_id = result.vapi_call_id;
    }

    await supabase
      .from("outreach")
      .update(updateData as never)
      .eq("id", outreach_id);

    // If successful call, update lead status
    if (result.success && typedOutreach.channel === "call") {
      await supabase
        .from("leads")
        .update({ 
          status: "contacted",
          last_contact_date: new Date().toISOString(),
          contact_attempts: (lead as Lead & { contact_attempts?: number }).contact_attempts 
            ? ((lead as Lead & { contact_attempts?: number }).contact_attempts || 0) + 1 
            : 1
        } as never)
        .eq("id", lead.id);
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      outreach_id,
      channel: typedOutreach.channel,
      vapi_call_id: result.vapi_call_id,
    });

  } catch (error) {
    console.error("Error executing outreach:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Execute a direct phone call via VAPI (from leads page, without outreach record)
async function executeCallDirect(lead: Lead & { user_id: string }, user_id: string): Promise<{
  success: boolean;
  message: string;
  vapi_call_id?: string;
  error?: string;
}> {
  // Get user-specific VAPI config (assistant, phone number, optional per-tenant API key)
  const { data: profile } = await supabase
    .from("profiles")
    .select("vapi_assistant_id, vapi_phone_number_id, vapi_private_key")
    .eq("id", user_id)
    .single() as { data: { vapi_assistant_id?: string | null; vapi_phone_number_id?: string | null; vapi_private_key?: string | null } | null };

  const assistantId = profile?.vapi_assistant_id || VAPI_ASSISTANT_ID;
  const phoneNumberId = profile?.vapi_phone_number_id || VAPI_PHONE_NUMBER_ID;
  const apiKey = (profile?.vapi_private_key?.trim() || "") || VAPI_API_KEY || "";

  if (!apiKey || !assistantId || !phoneNumberId) {
    return {
      success: false,
      message: "VAPI entegrasyonu yapılandırılmamış. Lütfen assistant ID ve (gerekirse) VAPI API key ayarlayın.",
      error: "VAPI not configured"
    };
  }

  if (!lead.phone) {
    return {
      success: false,
      message: "Lead'in telefon numarası yok",
      error: "No phone number"
    };
  }

  // Normalize and validate phone number to E.164 format
  let normalizedPhone: string;
  try {
    normalizedPhone = validateAndNormalize(lead.phone, lead.language === "en" ? "US" : "TR");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid phone number format";
    console.error(`[executeCallDirect] Phone normalization failed for ${lead.phone}:`, errorMessage);
    return {
      success: false,
      message: `Geçersiz telefon numarası formatı: ${lead.phone}. Lütfen E.164 formatında girin (örn: +903129114094, +33123456789)`,
      error: errorMessage
    };
  }

  // Validate caller ID is E.164
  if (!isValidE164(DEFAULT_CALLER_ID)) {
    console.error(`[executeCallDirect] Invalid DEFAULT_CALLER_ID: ${DEFAULT_CALLER_ID}`);
    return {
      success: false,
      message: "Sistem yapılandırma hatası: Geçersiz caller ID",
      error: "Invalid DEFAULT_CALLER_ID configuration"
    };
  }

  // Prepare VAPI call payload
  // Note: VAPI uses phoneNumberId for caller ID, not a 'from' field
  // The caller ID is configured in the phone number settings in VAPI dashboard
  const vapiPayload = {
    assistantId: assistantId,
    phoneNumberId: phoneNumberId,
    customer: {
      number: normalizedPhone,
      name: lead.full_name,
    },
    metadata: {
      lead_id: lead.id,
      user_id: user_id,  // Include user_id for webhook to save call
      direct_call: true,
      language: lead.language || "tr",
      original_phone: lead.phone, // Keep original for reference
      normalized_phone: normalizedPhone,
      caller_id: DEFAULT_CALLER_ID, // Store in metadata for reference
    },
  };

  // Log the payload for debugging
  console.log(`[executeCallDirect] Making outbound call:`, {
    to: normalizedPhone,
    caller_id: DEFAULT_CALLER_ID,
    assistantId,
    phoneNumberId,
    lead_id: lead.id,
    original_phone: lead.phone,
  });

  try {
    const response = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vapiPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("VAPI call error:", errorData);
      return {
        success: false,
        message: `VAPI arama başarısız: ${errorData.message || response.statusText}`,
        error: errorData.message || response.statusText
      };
    }

    const callData = await response.json();
    console.log(`[executeCallDirect] Call initiated successfully:`, {
      vapi_call_id: callData.id,
      to: normalizedPhone,
      status: callData.status || 'unknown'
    });
    return {
      success: true,
      message: `Arama başlatıldı: ${lead.full_name} (${normalizedPhone})`,
      vapi_call_id: callData.id
    };
  } catch (error) {
    console.error("VAPI call exception:", error);
    return {
      success: false,
      message: "VAPI bağlantı hatası",
      error: String(error)
    };
  }
}

// Execute a phone call via VAPI (with outreach record)
async function executeCall(lead: Lead, outreach_id: string, user_id: string): Promise<{
  success: boolean;
  message: string;
  vapi_call_id?: string;
  error?: string;
}> {
  // Get user-specific VAPI config (assistant, phone number, optional per-tenant API key)
  const { data: profile } = await supabase
    .from("profiles")
    .select("vapi_assistant_id, vapi_phone_number_id, vapi_private_key")
    .eq("id", user_id)
    .single() as { data: { vapi_assistant_id?: string | null; vapi_phone_number_id?: string | null; vapi_private_key?: string | null } | null };

  const assistantId = profile?.vapi_assistant_id || VAPI_ASSISTANT_ID;
  const phoneNumberId = profile?.vapi_phone_number_id || VAPI_PHONE_NUMBER_ID;
  const apiKey = (profile?.vapi_private_key?.trim() || "") || VAPI_API_KEY || "";

  if (!apiKey || !assistantId || !phoneNumberId) {
    console.log("VAPI not configured. Call would be made to:", lead.phone);
    return {
      success: false,
      message: "VAPI entegrasyonu yapılandırılmamış. Lütfen assistant ID ve (gerekirse) VAPI API key ayarlayın.",
      error: "VAPI not configured"
    };
  }

  if (!lead.phone) {
    return {
      success: false,
      message: "Lead'in telefon numarası yok",
      error: "No phone number"
    };
  }

  // Normalize and validate phone number to E.164 format
  let normalizedPhone: string;
  try {
    normalizedPhone = validateAndNormalize(lead.phone, lead.language === "en" ? "US" : "TR");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid phone number format";
    console.error(`[executeCall] Phone normalization failed for ${lead.phone}:`, errorMessage);
    return {
      success: false,
      message: `Geçersiz telefon numarası formatı: ${lead.phone}. Lütfen E.164 formatında girin (örn: +903129114094, +33123456789)`,
      error: errorMessage
    };
  }

  // Note: Caller ID is configured in VAPI phone number settings, not via API field
  // DEFAULT_CALLER_ID is logged for reference but not sent to VAPI API

  // Prepare VAPI call payload
  // Note: VAPI uses phoneNumberId for caller ID, not a 'from' field
  // The caller ID is configured in the phone number settings in VAPI dashboard
  const vapiPayload = {
    assistantId: assistantId,
    phoneNumberId: phoneNumberId,
    customer: {
      number: normalizedPhone,
      name: lead.full_name,
    },
    metadata: {
      lead_id: lead.id,
      outreach_id: outreach_id,
      user_id: user_id, // Include user_id for webhook to save call
      language: lead.language || "tr",
      original_phone: lead.phone, // Keep original for reference
      normalized_phone: normalizedPhone,
      caller_id: DEFAULT_CALLER_ID, // Store in metadata for reference
    },
  };

  // Log the payload for debugging
  console.log(`[executeCall] Making outbound call:`, {
    to: normalizedPhone,
    caller_id: DEFAULT_CALLER_ID,
    assistantId,
    phoneNumberId,
    lead_id: lead.id,
    outreach_id,
    original_phone: lead.phone,
  });

  try {
    const response = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vapiPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("VAPI call error:", errorData);
      return {
        success: false,
        message: `VAPI arama başarısız: ${errorData.message || response.statusText}`,
        error: errorData.message || response.statusText
      };
    }

    const callData = await response.json();
    console.log(`[executeCall] Call initiated successfully:`, {
      vapi_call_id: callData.id,
      to: normalizedPhone,
      status: callData.status || 'unknown'
    });
    return {
      success: true,
      message: `Arama başlatıldı: ${lead.full_name} (${normalizedPhone})`,
      vapi_call_id: callData.id
    };

  } catch (error) {
    console.error("VAPI call exception:", error);
    return {
      success: false,
      message: "VAPI bağlantı hatası",
      error: String(error)
    };
  }
}

// Execute WhatsApp message (placeholder)
async function executeWhatsApp(lead: Lead, outreach_id: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const whatsappNumber = lead.whatsapp || lead.phone;
  
  if (!whatsappNumber) {
    return {
      success: false,
      message: "Lead'in WhatsApp numarası yok",
      error: "No WhatsApp number"
    };
  }

  // TODO: Implement WhatsApp Business API integration
  console.log("WhatsApp message would be sent to:", whatsappNumber);
  
  return {
    success: false,
    message: "WhatsApp Business API entegrasyonu yapılandırılmamış",
    error: "WhatsApp API not configured"
  };
}

// Execute Email (placeholder)
async function executeEmail(lead: Lead, outreach_id: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  if (!lead.email) {
    return {
      success: false,
      message: "Lead'in email adresi yok",
      error: "No email address"
    };
  }

  // TODO: Implement email service (SendGrid, Resend, etc.)
  console.log("Email would be sent to:", lead.email);
  
  return {
    success: false,
    message: "Email servisi yapılandırılmamış",
    error: "Email service not configured"
  };
}

// Execute SMS (placeholder)
async function executeSMS(lead: Lead, outreach_id: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  if (!lead.phone) {
    return {
      success: false,
      message: "Lead'in telefon numarası yok",
      error: "No phone number"
    };
  }

  // TODO: Implement SMS service (Twilio, etc.)
  console.log("SMS would be sent to:", lead.phone);
  
  return {
    success: false,
    message: "SMS servisi yapılandırılmamış",
    error: "SMS service not configured"
  };
}

// Execute Instagram DM (placeholder)
async function executeInstagramDM(lead: Lead, outreach_id: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const instagram = (lead as Lead & { instagram?: string }).instagram;
  
  if (!instagram) {
    return {
      success: false,
      message: "Lead'in Instagram hesabı yok",
      error: "No Instagram handle"
    };
  }

  // TODO: Implement Instagram API integration
  console.log("Instagram DM would be sent to:", instagram);
  
  return {
    success: false,
    message: "Instagram API entegrasyonu yapılandırılmamış",
    error: "Instagram API not configured"
  };
}

// Bulk execute today's scheduled outreach
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user_id = searchParams.get("user_id");
  const channel = searchParams.get("channel"); // optional filter

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Get today's scheduled outreach
    let query = supabase
      .from("outreach")
      .select("id, channel, scheduled_for, status, lead:leads(full_name, phone)")
      .eq("user_id", user_id)
      .eq("status", "scheduled")
      .gte("scheduled_for", `${today}T00:00:00`)
      .lte("scheduled_for", `${today}T23:59:59`)
      .order("scheduled_for", { ascending: true });

    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data: outreachList, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      today: today,
      total: outreachList?.length || 0,
      outreach: outreachList || [],
    });
  } catch (error) {
    console.error("Error getting scheduled outreach:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
