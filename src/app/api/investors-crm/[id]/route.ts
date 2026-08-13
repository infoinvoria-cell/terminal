export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getFailureRequestId, shouldInjectFailure } from "@/lib/server/capitalife-failure-injection";
import { logServerFailure } from "@/lib/runtime/capitalife-errors";

const SAFE_COLS_BASE = [
  "name","unternehmen","email","telefon",
  "kontaktquelle","kapitalrahmen","verfuegbar_ab","status",
  "letzter_kontakt","naechster_schritt","zustaendig","notizen",
];
const SAFE_COLS_EXTENDED = [
  "rolle","typ","linkedin","ort","website","source_url","research_status","researched_at",
];

function pickCols(raw: Record<string, unknown>, cols: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of cols) { if (k in raw) out[k] = raw[k]; }
  return out;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (shouldInjectFailure(req, "investor-db-api")) {
      throw new Error("INVESTOR_DB_API_500");
    }
    const { id } = await params;
    const supabase = createSupabaseServiceClient();
    const raw = await req.json() as Record<string, unknown>;

    const fullBody = pickCols(raw, [...SAFE_COLS_BASE, ...SAFE_COLS_EXTENDED]);
    const { data, error } = await supabase
      .from("investors_crm")
      .update(fullBody)
      .eq("id", id)
      .select()
      .single();

    if (error && (error.message.includes("does not exist") || error.message.includes("schema cache") || error.message.includes("Could not find"))) {
      const baseBody = pickCols(raw, SAFE_COLS_BASE);
      if (Object.keys(baseBody).length === 0) {
        return NextResponse.json({ error: "No valid columns to update" }, { status: 400 });
      }
      const { data: d2, error: e2 } = await supabase
        .from("investors_crm")
        .update(baseBody)
        .eq("id", id)
        .select()
        .single();
      if (e2) {
        logServerFailure({
          route: "/api/investors-crm/[id]",
          module: "investors-crm-patch-fallback",
          error: e2.message,
          errorCode: "INVESTOR_DB_WRITE_FAILED",
          requestId: getFailureRequestId(req),
        });
        return NextResponse.json({ error: e2.message, status: "ERROR" }, { status: 500 });
      }
      return NextResponse.json(d2);
    }

    if (error) {
      logServerFailure({
        route: "/api/investors-crm/[id]",
        module: "investors-crm-patch",
        error: error.message,
        errorCode: "INVESTOR_DB_WRITE_FAILED",
        requestId: getFailureRequestId(req),
      });
      return NextResponse.json({ error: error.message, status: "ERROR" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    logServerFailure({
      route: "/api/investors-crm/[id]",
      module: "investors-crm-patch",
      error,
      errorCode: "INVESTOR_DB_API_500",
      requestId: getFailureRequestId(req),
    });
    return NextResponse.json({ error: "INVESTOR_DB_API_500", status: "ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (shouldInjectFailure(req, "investor-db-api")) {
      throw new Error("INVESTOR_DB_API_500");
    }
    const { id } = await params;
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("investors_crm").delete().eq("id", id);
    if (error) {
      logServerFailure({
        route: "/api/investors-crm/[id]",
        module: "investors-crm-delete",
        error: error.message,
        errorCode: "INVESTOR_DB_DELETE_FAILED",
        requestId: getFailureRequestId(req),
      });
      return NextResponse.json({ error: error.message, status: "ERROR" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerFailure({
      route: "/api/investors-crm/[id]",
      module: "investors-crm-delete",
      error,
      errorCode: "INVESTOR_DB_API_500",
      requestId: getFailureRequestId(req),
    });
    return NextResponse.json({ error: "INVESTOR_DB_API_500", status: "ERROR" }, { status: 500 });
  }
}
