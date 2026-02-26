import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { filterVisibleDashboardCalls, getUserAssistantId } from "@/lib/dashboard/visible-calls";
import { computeCallScore } from "@/lib/dashboard/call-scoring";

/** Max leads considered for eval filter/sort (candidate set and in-memory sort). Raises cap so older leads with 6+ calls are included. */
const EVAL_LEADS_LIMIT = 50000;

/** Canonical form: digits only, strip international 00 prefix, then + prefix. */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // International format 00<country>... → treat as +<country>...
  if (digits.startsWith("00")) digits = digits.slice(2);
  return `+${digits}`;
}

function addPhoneKeysForEval(map: Map<string, string>, norm: string, leadId: string) {
  if (!norm) return;
  const digits = norm.replace(/\D/g, "");
  map.set(norm, leadId);
  map.set(digits, leadId);
  if (digits.length === 11 && digits.startsWith("1")) {
    map.set("+" + digits.slice(1), leadId);
    map.set(digits.slice(1), leadId);
  }
  if (digits.length === 10) {
    map.set("+1" + digits, leadId);
    map.set("1" + digits, leadId);
  }
}

/** Resolve lead id from caller_phone using all common variants (norm, digits, 00-stripped, US 10/11-digit). */
function resolveLeadIdByPhone(phoneToLeadId: Map<string, string>, callerPhone: string | null | undefined): string | undefined {
  if (!callerPhone || typeof callerPhone !== "string") return undefined;
  const norm = normalizePhone(callerPhone);
  if (!norm) return undefined;
  const digits = norm.replace(/\D/g, "");
  return (
    phoneToLeadId.get(norm) ??
    phoneToLeadId.get(digits) ??
    (digits.length === 11 && digits.startsWith("1") ? phoneToLeadId.get("+" + digits.slice(1)) ?? phoneToLeadId.get(digits.slice(1)) : undefined) ??
    (digits.length === 10 ? phoneToLeadId.get("+1" + digits) ?? phoneToLeadId.get("1" + digits) : undefined)
  );
}

interface LeadRecord {
  id: string;
  status: string;
  priority?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  created_at: string;
  [key: string]: unknown;
}

// GET - Fetch leads from Supabase - User-specific
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    
    // Get user_id from query params (REQUIRED - sent from frontend)
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }
    
    // Check if requesting a single lead by ID
    const leadId = searchParams.get("id");
    if (leadId) {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error fetching lead:", error);
        return NextResponse.json(
          { success: false, error: "Lead not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: lead,
      });
    }

    // Check if only count is requested
    const countOnly = searchParams.get("countOnly") === "true";
    if (countOnly) {
      const status = searchParams.get("status");
      let countQuery = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      
      if (status && status !== "all") {
        countQuery = countQuery.eq("status", status);
      }

      const { count, error } = await countQuery;

      if (error) {
        console.error("Error counting leads:", error);
        return NextResponse.json(
          { success: false, error: "Failed to count leads" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        count: count || 0,
      });
    }
    
    const idsOnly = searchParams.get("idsOnly") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = 100;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;
    
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") || "created_at"; // Default sort by created_at
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc"; // Default desc
    const evalFilter = searchParams.get("evalFilter") || null; // "6plus" | "1-6" | "v-or-f"
    let cachedAssistantId: string | null | undefined;
    const getScopedAssistantId = async () => {
      if (cachedAssistantId === undefined) {
        cachedAssistantId = await getUserAssistantId(supabase, userId);
      }
      return cachedAssistantId;
    };

    // Build base query for filtering - MUST filter by user_id for security
    const selectFields = idsOnly ? "id" : "*";
    let baseQuery = supabase
      .from("leads")
      .select(selectFields, { count: "exact" })
      .eq("user_id", userId);

    if (status && status !== "all") {
      baseQuery = baseQuery.eq("status", status);
    }
    if (priority && priority !== "all") {
      baseQuery = baseQuery.eq("priority", priority);
    }
    if (search) {
      baseQuery = baseQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    let matchingIds: string[] | null = null;

    // Eval filter: use only calls table (calls.evaluation_score + metadata) — same source as Calls screen, no Vapi API
    if (evalFilter === "6plus" || evalFilter === "1-6" || evalFilter === "v-or-f") {
      // Candidate leads: same filters as baseQuery, created_at desc so we get the same 10k "most recent" set
      let candidateQuery = supabase.from("leads").select("id, phone").eq("user_id", userId);
      if (status && status !== "all") candidateQuery = candidateQuery.eq("status", status);
      if (priority && priority !== "all") candidateQuery = candidateQuery.eq("priority", priority);
      if (search) candidateQuery = candidateQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      candidateQuery = candidateQuery.order("created_at", { ascending: false }).limit(EVAL_LEADS_LIMIT);
      const { data: candidateLeads } = await candidateQuery as { data: { id: string; phone: string | null }[] | null };
      const candidateIdSet = new Set((candidateLeads || []).map((l) => l.id));
      const phoneToLeadId = new Map<string, string>();
      for (const l of candidateLeads || []) {
        const norm = normalizePhone(l.phone);
        if (norm) addPhoneKeysForEval(phoneToLeadId, norm, l.id);
      }

      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data: calls } = await supabase
        .from("calls")
        .select("assistant_id, metadata, transcript, summary, evaluation_score, evaluation_summary, caller_phone, duration, sentiment")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(10000) as {
        data: { assistant_id: string | null; metadata: Record<string, unknown> | null; transcript: string | null; summary: string | null; evaluation_score: number | string | null; evaluation_summary: string | null; caller_phone: string | null; duration: number | null; sentiment: string | null }[] | null;
      };
      const visibleCalls = filterVisibleDashboardCalls(calls || [], await getScopedAssistantId());
      const byLead: Record<string, ("V" | "F" | number)[]> = {};
      for (const call of visibleCalls) {
        const meta = (call.metadata || {}) as Record<string, unknown>;
        let lid: string | undefined = resolveLeadIdByPhone(phoneToLeadId, call.caller_phone);
        if (!lid && meta.lead_id && candidateIdSet.has(meta.lead_id as string)) lid = meta.lead_id as string;
        if (!lid) continue;
        if (!byLead[lid]) byLead[lid] = [];
        const scored = computeCallScore({
          evaluation_score: call.evaluation_score,
          transcript: call.transcript,
          summary: call.summary,
          evaluation_summary: call.evaluation_summary,
          duration: call.duration,
          sentiment: call.sentiment,
          metadata: call.metadata,
        });
        if (scored.display === "V") byLead[lid]!.push("V");
        else if (scored.display === "F") byLead[lid]!.push("F");
        else byLead[lid]!.push(scored.numericScore ?? 5);
      }
      const ids: string[] = [];
      for (const [leadId, outcomes] of Object.entries(byLead)) {
        if (outcomes.length === 0) continue;
        const nums = outcomes.filter((o): o is number => typeof o === "number");
        const has6Plus = nums.some((n) => n >= 6);
        const all1to6 = nums.length > 0 && nums.every((n) => n >= 1 && n <= 6) && !has6Plus;
        const onlyVF = outcomes.every((o) => o === "V" || o === "F");
        if (evalFilter === "6plus" && has6Plus) ids.push(leadId);
        else if (evalFilter === "1-6" && all1to6) ids.push(leadId);
        else if (evalFilter === "v-or-f" && onlyVF && outcomes.length > 0) ids.push(leadId);
      }
      if (ids.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page: 1, pageSize, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
          stats: { total: 0, newLeads: 0, contacted: 0, interested: 0, appointmentSet: 0, converted: 0, unreachable: 0, conversionRate: 0 },
        });
      }
      matchingIds = ids;
      baseQuery = baseQuery.in("id", matchingIds);
    }

    // Build sorting - add secondary sort by id for consistent pagination
    // Priority and status sorting need in-memory sort
    const needsMemorySort = sortBy === "priority" || sortBy === "status" || sortBy === "eval_score";

    // Build per-lead eval sort key when sorting by eval_score (match calls by lead_id or phone)
    let evalScoreMap: Record<string, number> = {};
    if (sortBy === "eval_score") {
      // Same filters as baseQuery so eval score map covers exactly the leads we will sort and display
      let sortLeadsQuery = supabase.from("leads").select("id, phone").eq("user_id", userId);
      if (status && status !== "all") sortLeadsQuery = sortLeadsQuery.eq("status", status);
      if (priority && priority !== "all") sortLeadsQuery = sortLeadsQuery.eq("priority", priority);
      if (search) sortLeadsQuery = sortLeadsQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      if (matchingIds != null && matchingIds.length > 0) sortLeadsQuery = sortLeadsQuery.in("id", matchingIds);
      sortLeadsQuery = sortLeadsQuery.order("created_at", { ascending: false }).limit(EVAL_LEADS_LIMIT);
      const { data: allLeadsForSort } = await sortLeadsQuery as { data: { id: string; phone: string | null }[] | null };
      const phoneToLidSort = new Map<string, string>();
      for (const l of allLeadsForSort || []) {
        const n = normalizePhone(l.phone);
        if (n) addPhoneKeysForEval(phoneToLidSort, n, l.id);
      }
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data: callsForSort } = await supabase
        .from("calls")
        .select("assistant_id, metadata, transcript, summary, evaluation_score, evaluation_summary, caller_phone, duration, sentiment")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(10000) as {
        data: { assistant_id: string | null; metadata: Record<string, unknown> | null; transcript: string | null; summary: string | null; evaluation_score: number | string | null; evaluation_summary: string | null; caller_phone: string | null; duration: number | null; sentiment: string | null }[] | null;
      };
      const visibleCallsForSort = filterVisibleDashboardCalls(callsForSort || [], await getScopedAssistantId());
      const byLead: Record<string, ("V" | "F" | number)[]> = {};
      for (const call of visibleCallsForSort) {
        const meta = (call.metadata || {}) as Record<string, unknown>;
        let lid: string | undefined = resolveLeadIdByPhone(phoneToLidSort, call.caller_phone);
        if (!lid && meta.lead_id) lid = meta.lead_id as string;
        if (!lid) continue;
        if (!byLead[lid]) byLead[lid] = [];
        const scored = computeCallScore({
          evaluation_score: call.evaluation_score,
          transcript: call.transcript,
          summary: call.summary,
          evaluation_summary: call.evaluation_summary,
          duration: call.duration,
          sentiment: call.sentiment,
          metadata: call.metadata,
        });
        if (scored.display === "V") byLead[lid]!.push("V");
        else if (scored.display === "F") byLead[lid]!.push("F");
        else byLead[lid]!.push(scored.numericScore ?? 5);
      }
      for (const [leadId, outcomes] of Object.entries(byLead)) {
        const nums = outcomes.filter((o): o is number => typeof o === "number");
        if (nums.length > 0) {
          evalScoreMap[leadId] = Math.max(...nums);
        } else {
          evalScoreMap[leadId] = outcomes.some((o) => o === "V") ? 0.5 : 0;
        }
      }
    }

    const buildSortedQuery = (query: typeof baseQuery) => {
      if (needsMemorySort) {
        return query
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });
      } else if (sortBy === "last_contact_date") {
        // Sort by last_contact_date, with nulls last
        return query
          .order("last_contact_date", { ascending: sortOrder === "asc", nullsFirst: false })
          .order("id", { ascending: true });
      } else {
        return query
          .order(sortBy, { ascending: sortOrder === "asc" })
          .order("id", { ascending: true });
      }
    };

    // If idsOnly, return all IDs without pagination
    if (idsOnly) {
      const { data: allIds, count, error } = await buildSortedQuery(baseQuery) as { data: { id: string }[] | null; count: number | null; error: { message: string } | null };
      
      if (error) {
        console.error("Error fetching lead IDs:", error);
        return NextResponse.json(
          { success: false, error: "Failed to fetch lead IDs", details: error.message },
          { status: 500 }
        );
      }
      
      const ids = allIds?.map(lead => lead.id) || [];
      const total = count || 0;
      
      return NextResponse.json({
        success: true,
        data: ids,
        count: total,
      });
    }

    // Priority order mapping: high = 0, medium = 1, low = 2
    const priorityOrderMap: Record<string, number> = { high: 0, medium: 1, low: 2 };
    
    let leads: LeadRecord[] | null = null;
    let total = 0;
    
    // Status order: interested/appointment first (urgent), then new, contacted, etc.
    const statusOrderMap: Record<string, number> = {
      interested: 0,
      appointment_set: 1,
      new: 2,
      contacted: 3,
      converted: 4,
      unreachable: 5,
      lost: 6,
    };

    if (needsMemorySort) {
      // For priority/status/eval_score sorting, fetch matching leads (up to EVAL_LEADS_LIMIT), sort in memory, then paginate
      const { data: allLeads, count, error } = await buildSortedQuery(baseQuery).limit(EVAL_LEADS_LIMIT) as { 
        data: LeadRecord[] | null; 
        count: number | null; 
        error: { message: string } | null 
      };
      
      if (error) {
        console.error("Error fetching leads:", error);
        return NextResponse.json(
          { success: false, error: "Failed to fetch leads", details: error.message },
          { status: 500 }
        );
      }
      
      total = count || 0;
      
      const sortedLeads = (allLeads || []).sort((a, b) => {
        if (sortBy === "priority") {
          const orderA = priorityOrderMap[a.priority || 'medium'] ?? 1;
          const orderB = priorityOrderMap[b.priority || 'medium'] ?? 1;
          return sortOrder === "asc" ? orderB - orderA : orderA - orderB;
        } else if (sortBy === "eval_score") {
          const scoreA = evalScoreMap[a.id] ?? -1;
          const scoreB = evalScoreMap[b.id] ?? -1;
          return sortOrder === "asc" ? scoreA - scoreB : scoreB - scoreA;
        } else {
          // status sorting
          const orderA = statusOrderMap[a.status || 'new'] ?? 3;
          const orderB = statusOrderMap[b.status || 'new'] ?? 3;
          return sortOrder === "asc" ? orderA - orderB : orderB - orderA;
        }
      });
      
      // Apply pagination manually
      leads = sortedLeads.slice(offset, offset + limit);
    } else {
      // Normal sorting - use database pagination
      const { data, count, error } = await buildSortedQuery(baseQuery)
        .range(offset, offset + limit - 1) as { data: LeadRecord[] | null; count: number | null; error: { message: string } | null };

      if (error) {
        console.error("Error fetching leads:", error);
        return NextResponse.json(
          { success: false, error: "Failed to fetch leads", details: error.message },
          { status: 500 }
        );
      }
      
      leads = data;
      total = count || 0;
    }

    const totalPages = Math.ceil(total / pageSize);
    
    // Get all leads for stats (not just current page) - use a separate query
    let statsQuery = supabase
      .from("leads")
      .select("status")
      .eq("user_id", userId);
    
    if (status && status !== "all") {
      statsQuery = statsQuery.eq("status", status);
    }
    if (priority && priority !== "all") {
      statsQuery = statsQuery.eq("priority", priority);
    }
    if (search) {
      statsQuery = statsQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    
    const { data: allLeadsForStats } = await statsQuery;
    const allLeads = allLeadsForStats || [];
    const newLeads = allLeads.filter((l: any) => l.status === "new").length || 0;
    const contacted = allLeads.filter((l: any) => l.status === "contacted").length || 0;
    const interested = allLeads.filter((l: any) => l.status === "interested").length || 0;
    const appointmentSet = allLeads.filter((l: any) => l.status === "appointment_set").length || 0;
    const converted = allLeads.filter((l: any) => l.status === "converted").length || 0;
    const unreachable = allLeads.filter((l: any) => l.status === "unreachable").length || 0;

    return NextResponse.json({
      success: true,
      data: leads,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      stats: {
        total,
        newLeads,
        contacted,
        interested,
        appointmentSet,
        converted,
        unreachable,
        conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Dashboard leads error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create a new lead or multiple leads (CSV upload)
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    // Get user_id from query params or body (REQUIRED)
    let user_id = body.user_id || request.nextUrl.searchParams.get("userId");
    
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }

    // Handle bulk insert (CSV upload)
    if (body.leads && Array.isArray(body.leads)) {
      const leadsData = body.leads.map((lead: any) => {
        const validSources = ['web_form', 'instagram', 'referral', 'facebook', 'google_ads', 'other'];
        let source = lead.source?.toLowerCase() || 'other';
        if (!validSources.includes(source)) {
          source = 'other';
        }

        return {
          user_id: user_id,
          full_name: lead.full_name || null,
          email: lead.email || null,
          phone: lead.phone || null,
          whatsapp: lead.whatsapp || null,
          instagram: lead.instagram || null,
          language: lead.language || 'tr',
          source: source,
          treatment_interest: lead.interest || lead.treatment_interest || null,
          notes: lead.notes || null,
          status: lead.status || 'new',
          priority: lead.priority || 'medium',
          form_data: lead.form_data || {},
        };
      }).filter((lead: any) => lead.full_name || lead.phone || lead.email); // Filter out invalid leads

      if (leadsData.length === 0) {
        return NextResponse.json(
          { success: false, error: "No valid leads to insert" },
          { status: 400 }
        );
      }

      // Insert in batches of 100 (Supabase has limits)
      const BATCH_SIZE = 100;
      const batches: typeof leadsData[] = [];
      for (let i = 0; i < leadsData.length; i += BATCH_SIZE) {
        batches.push(leadsData.slice(i, i + BATCH_SIZE));
      }

      const allInserted: any[] = [];
      let errorOccurred: any = null;

      for (const batch of batches) {
        const { data, error } = await supabase
          .from("leads")
          .insert(batch as never)
          .select();

        if (error) {
          console.error("Error creating leads batch:", error);
          errorOccurred = error;
          break; // Stop on first error
        }

        if (data) {
          allInserted.push(...data);
        }
      }

      if (errorOccurred) {
        return NextResponse.json(
          { success: false, error: "Failed to create leads", details: errorOccurred.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data: allInserted, count: allInserted.length });
    }

    // Handle single lead insert
    if (!body.full_name) {
      return NextResponse.json(
        { success: false, error: "full_name is required" },
        { status: 400 }
      );
    }

    const validSources = ['web_form', 'instagram', 'referral', 'facebook', 'google_ads', 'other'];
    let source = body.source?.toLowerCase() || 'other';
    if (!validSources.includes(source)) {
      if (source.includes('web') || source.includes('site') || source.includes('form')) {
        source = 'web_form';
      } else if (source.includes('insta') || source.includes('ig')) {
        source = 'instagram';
      } else if (source.includes('face') || source.includes('fb')) {
        source = 'facebook';
      } else if (source.includes('google') || source.includes('ads')) {
        source = 'google_ads';
      } else if (source.includes('refer')) {
        source = 'referral';
      } else {
        source = 'other';
      }
    }

    const leadData = {
      user_id: user_id,
      full_name: body.full_name,
      email: body.email || null,
      phone: body.phone || null,
      whatsapp: body.whatsapp || null,
      instagram: body.instagram || null,
      language: body.language || 'tr',
      source: source,
      treatment_interest: body.interest || body.treatment_interest || null,
      notes: body.notes || null,
      status: body.status || 'new',
      priority: body.priority || 'medium',
    };

    const { data, error } = await supabase
      .from("leads")
      .insert(leadData as never)
      .select()
      .single();

    if (error) {
      console.error("Error creating lead:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create lead", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Create lead error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update a lead (User-specific)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const body = await request.json();

    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }

    const id = searchParams.get("id") || body.id;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Lead ID is required" },
        { status: 400 }
      );
    }

    const { id: _, ...updates } = body;

    // Verify the lead belongs to this user before updating
    const { data: existingLead } = await supabase
      .from("leads")
      .select("user_id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!existingLead) {
      return NextResponse.json(
        { success: false, error: "Lead not found or access denied" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .update(updates as never)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating lead:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update lead", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Update lead error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a lead or multiple leads (User-specific)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }
    
    // Try to get ids from request body for bulk delete
    let body: { ids?: string[] } | null = null;
    try {
      body = await request.json();
    } catch {
      // Body might not be JSON, that's okay
    }

    const ids = body?.ids || (id ? [id] : []);

    if (!ids || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "id or ids array is required" },
        { status: 400 }
      );
    }

    // Verify all leads belong to this user before deleting
    const { data: existingLeads, error: verifyError } = await supabase
      .from("leads")
      .select("id")
      .in("id", ids)
      .eq("user_id", userId) as { data: { id: string }[] | null; error: { message: string } | null };

    if (verifyError) {
      console.error("Error verifying leads:", verifyError);
      return NextResponse.json(
        { success: false, error: "Failed to verify leads", details: verifyError.message },
        { status: 500 }
      );
    }

    // Only delete leads that exist and belong to the user
    const validIds = existingLeads?.map((lead: { id: string }) => lead.id) || [];
    
    if (validIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid leads found to delete" },
        { status: 404 }
      );
    }

    // If some IDs were not found, log a warning but continue with valid ones
    if (validIds.length < ids.length) {
      console.warn(`Only ${validIds.length} out of ${ids.length} leads found and will be deleted`);
    }

    // Delete in batches to avoid Supabase limits (max 1000 items per query)
    const batchSize = 500;
    let deletedCount = 0;
    let lastError: any = null;

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batch = validIds.slice(i, i + batchSize);
      const { error: deleteError } = await supabase
        .from("leads")
        .delete()
        .in("id", batch)
        .eq("user_id", userId);

      if (deleteError) {
        console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
        lastError = deleteError;
      } else {
        deletedCount += batch.length;
      }
    }

    if (lastError && deletedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to delete leads", details: lastError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      deletedCount,
      requestedCount: ids.length,
      validCount: validIds.length
    });
  } catch (error) {
    console.error("Delete lead error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
