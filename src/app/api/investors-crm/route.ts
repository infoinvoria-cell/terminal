export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

// Columns confirmed to exist in investors_crm before migration
const SAFE_COLS_BASE = [
  "name","unternehmen","email","telefon",
  "kontaktquelle","kapitalrahmen","verfuegbar_ab","status",
  "letzter_kontakt","naechster_schritt","zustaendig","notizen",
];
// Columns added by supabase/migrations/20260811_investors_crm_extend.sql
const SAFE_COLS_EXTENDED = [
  "rolle","typ","linkedin","ort","website","source_url","research_status","researched_at",
];

function pickCols(raw: Record<string, unknown>, cols: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of cols) { if (k in raw) out[k] = raw[k]; }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    if (shouldInjectFailure(req, "investor-db-api")) {
      throw new Error("INVESTOR_DB_API_500");
    }
    const supabase = createSupabaseServiceClient();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";

    let query = supabase
      .from("investors_crm")
      .select("*")
      .order("created_at", { ascending: true });

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,unternehmen.ilike.%${search}%,email.ilike.%${search}%`
      );
    }
    if (status && status !== "Alle") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      logServerFailure({
        route: "/api/investors-crm",
        module: "investors-crm-get",
        error: error.message,
        errorCode: "INVESTOR_DB_QUERY_FAILED",
        requestId: getFailureRequestId(req),
      });
      return NextResponse.json({ error: error.message, status: "ERROR" }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (error) {
    logServerFailure({
      route: "/api/investors-crm",
      module: "investors-crm-get",
      error,
      errorCode: "INVESTOR_DB_API_500",
      requestId: getFailureRequestId(req),
    });
    return NextResponse.json({ error: "INVESTOR_DB_API_500", status: "ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (shouldInjectFailure(req, "investor-db-api")) {
      throw new Error("INVESTOR_DB_API_500");
    }
    const supabase = createSupabaseServiceClient();
    const raw = await req.json() as Record<string, unknown>;

    const fullBody = pickCols(raw, [...SAFE_COLS_BASE, ...SAFE_COLS_EXTENDED]);
    const { data, error } = await supabase
      .from("investors_crm")
      .insert([fullBody])
      .select()
      .single();

    if (error) {
      logServerFailure({
        route: "/api/investors-crm",
        module: "investors-crm-post",
        error: error.message,
        errorCode: "INVESTOR_DB_WRITE_FAILED",
        requestId: getFailureRequestId(req),
      });
      return NextResponse.json({ error: error.message, status: "ERROR" }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logServerFailure({
      route: "/api/investors-crm",
      module: "investors-crm-post",
      error,
      errorCode: "INVESTOR_DB_API_500",
      requestId: getFailureRequestId(req),
    });
    return NextResponse.json({ error: "INVESTOR_DB_API_500", status: "ERROR" }, { status: 500 });
  }
}
