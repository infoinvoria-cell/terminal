/**
 * seed-trades-snapshot.mjs
 * Reads trades_clean_compounded.csv and upserts serialized_trades
 * into the Supabase dashboard_snapshot row with key="latest".
 *
 * Usage: node scripts/seed-trades-snapshot.mjs
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.local)
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const CSV_PATH = "trades_clean_compounded.csv";
if (!existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const lastComma = line.lastIndexOf(",");
    if (lastComma <= 0) continue;
    const dateStr = line.slice(0, lastComma).trim();
    const gainStr = line.slice(lastComma + 1).trim().replace(",", ".");
    const gainPct = parseFloat(gainStr);
    const dateMs = Date.parse(dateStr);
    if (!isFinite(gainPct) || !isFinite(dateMs)) continue;
    rows.push({ dateMs, gainPct });
  }
  return rows;
}

const raw = readFileSync(CSV_PATH, "utf-8");
const serialized_trades = parseCsv(raw);
console.log(`Parsed ${serialized_trades.length} trade rows from CSV`);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Load existing snapshot to merge
const { data: existing, error: fetchErr } = await db
  .from("dashboard_snapshot")
  .select("data")
  .eq("key", "latest")
  .single();

if (fetchErr && fetchErr.code !== "PGRST116") {
  console.error("Fetch error:", fetchErr.message);
  process.exit(1);
}

const existingData = existing?.data ?? {};
const merged = { ...existingData, serialized_trades };

const { error: upsertErr } = await db
  .from("dashboard_snapshot")
  .upsert({ key: "latest", data: merged }, { onConflict: "key" });

if (upsertErr) {
  console.error("Upsert error:", upsertErr.message);
  process.exit(1);
}

console.log(`Seeded ${serialized_trades.length} rows into dashboard_snapshot[key=latest].serialized_trades`);
