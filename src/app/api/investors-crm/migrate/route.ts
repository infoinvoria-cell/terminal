export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

// All columns that MUST be present in the schema before migration may proceed
const REQUIRED_COLS = [
  "name","unternehmen","email","telefon","kontaktquelle","kapitalrahmen",
  "verfuegbar_ab","status","letzter_kontakt","naechster_schritt","zustaendig","notizen",
  "rolle","typ","linkedin","ort","website","source_url","research_status",
];

// Normalize a raw CSV row map into a Supabase insert payload
function normalizeRow(raw: Record<string, string>): Record<string, string | null> {
  function g(k: string): string | null {
    const v = raw[k]?.trim();
    return v || null;
  }
  return {
    name:             g("name"),
    unternehmen:      g("unternehmen") ?? g("firma"),
    rolle:            g("rolle"),
    typ:              g("typ"),
    email:            g("email") ?? g("e-mail"),
    telefon:          null,
    linkedin:         g("linkedin"),
    kontaktquelle:    g("quelle") ?? g("kontaktquelle"),
    kapitalrahmen:    g("kapital") ?? g("kapitalrahmen"),
    verfuegbar_ab:    null,
    status:           g("status") ?? "Neu",
    letzter_kontakt:  null,
    naechster_schritt:null,
    zustaendig:       null,
    notizen:          null,
    ort:              g("ort"),
    website:          g("website"),
    source_url:       g("source_url"),
    research_status:  "NEEDS_CONTACT",
  };
}

// Canonical identity key for a row: domain > normalized company name > contact name
function canonicalKey(row: Record<string, string | null>): string {
  const domain = row.website?.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0].toLowerCase().trim();
  if (domain) return `domain:${domain}`;
  const company = row.unternehmen?.toLowerCase().trim().replace(/\s+(gmbh|ag|kg|ug|mbh|se|sarl|ltd|inc|llc|bv|nv|sa)\.?$/i,"").trim();
  if (company) return `company:${company}`;
  return `name:${(row.name ?? "").toLowerCase().trim()}`;
}

// Minimal CSV parser — quoted-field state machine
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]).map(h => h.trim().replace(/^"|"$/g,"").toLowerCase());
  return lines.slice(1).filter(Boolean).map(line => {
    const vals = parseLine(line);
    const out: Record<string,string> = {};
    headers.forEach((h, i) => { out[h] = vals[i]?.trim() ?? ""; });
    return out;
  });
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = ""; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServiceClient();

  // 1. Verify schema is complete — fail explicitly if not
  const { error: probeErr } = await supabase
    .from("investors_crm")
    .select(REQUIRED_COLS.join(","))
    .limit(0);

  if (probeErr) {
    return NextResponse.json({
      ok: false,
      error: "SCHEMA_NOT_READY",
      detail: probeErr.message,
      action: "Run supabase/migrations/20260811_investors_crm_extend.sql in the Supabase SQL Editor before seeding.",
    }, { status: 422 });
  }

  // 2. Parse CSV from request body
  const body = await req.json() as { csvText?: string };
  if (!body.csvText) {
    return NextResponse.json({ ok: false, error: "csvText is required" }, { status: 400 });
  }

  const rawRows = parseCsv(body.csvText);
  const csvRowsRead = rawRows.length;

  // 3. Fetch existing canonical keys from Supabase
  const { data: existing, error: fetchErr } = await supabase
    .from("investors_crm")
    .select("id,name,unternehmen,website");

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  const existingKeys = new Set<string>(
    (existing ?? []).map(r => canonicalKey({ name: r.name, unternehmen: r.unternehmen, website: r.website }))
  );

  // 4. Normalize and deduplicate
  const toInsert: Array<Record<string,string|null>> = [];
  const skippedRows: number[] = [];
  const invalidRows: number[] = [];

  rawRows.forEach((raw, i) => {
    const norm = normalizeRow(raw);
    const hasIdentity = !!(norm.unternehmen || norm.name);
    if (!hasIdentity) { invalidRows.push(i + 2); return; } // +2: 1-indexed + header row

    const key = canonicalKey(norm);
    if (existingKeys.has(key)) { skippedRows.push(i + 2); return; }

    existingKeys.add(key); // dedup within batch too
    toInsert.push(norm);
  });

  // 5. Batch insert — fail explicitly on any column error (no silent drops)
  let created = 0;
  const failedRows: Array<{ csvLine: number; error: string; row: Record<string,string|null> }> = [];

  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from("investors_crm")
      .insert(toInsert)
      .select("id");

    if (insertErr) {
      // Any schema error here means the migration is incomplete
      return NextResponse.json({
        ok: false,
        error: "INSERT_FAILED",
        detail: insertErr.message,
        rowsAttempted: toInsert.length,
        action: insertErr.message.includes("schema cache") || insertErr.message.includes("does not exist")
          ? "Schema migration incomplete. Run supabase/migrations/20260811_investors_crm_extend.sql."
          : "Check Supabase logs for details.",
      }, { status: 500 });
    }

    created = inserted?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    csvRowsRead,
    csvUniqueCompanies: csvRowsRead - invalidRows.length,
    processed: csvRowsRead - invalidRows.length,
    created,
    skipped: skippedRows.length,
    invalid: invalidRows.length,
    failed: failedRows.length,
    failedRows,
    invalidCsvLines: invalidRows,
  });
}
