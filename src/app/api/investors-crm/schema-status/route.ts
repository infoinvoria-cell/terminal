export const runtime = "edge";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// Columns that MUST exist for the canonical CRM model to be considered ready
const REQUIRED_EXTENDED = ["rolle", "typ", "linkedin", "ort", "website", "source_url", "research_status"];

export async function GET() {
  const supabase = createSupabaseServiceClient();

  // Probe by attempting a select of the extended columns on zero rows
  const { error } = await supabase
    .from("investors_crm")
    .select(REQUIRED_EXTENDED.join(","))
    .limit(0);

  if (error) {
    // Any column-missing error means migration not yet applied
    const isSchemaMissing =
      error.message.includes("does not exist") ||
      error.message.includes("schema cache") ||
      error.message.includes("Could not find");

    if (isSchemaMissing) {
      return NextResponse.json({
        state: "LEGACY_CSV",
        message: "Extended schema not yet applied. Run supabase/migrations/20260811_investors_crm_extend.sql",
        missingColumns: REQUIRED_EXTENDED,
      });
    }
    return NextResponse.json({ state: "MIGRATION_ERROR", message: error.message }, { status: 500 });
  }

  // Count rows to determine if migration has been seeded
  const { count, error: countErr } = await supabase
    .from("investors_crm")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    return NextResponse.json({ state: "MIGRATION_ERROR", message: countErr.message }, { status: 500 });
  }

  // Schema is correct but has fewer than 50 rows = migration not yet seeded
  if ((count ?? 0) < 50) {
    return NextResponse.json({
      state: "MIGRATING",
      message: "Schema ready but seed not yet applied",
      supabaseRows: count ?? 0,
    });
  }

  return NextResponse.json({
    state: "SUPABASE_READY",
    supabaseRows: count ?? 0,
  });
}
