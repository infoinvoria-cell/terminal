/**
 * seed-supabaseAdmin.ts
 * Einmaliger Upload: liest forward_trades_log.csv + forward_signal_log.csv
 * aus dem lokalen Brain-Pfad und schreibt sie in Supabase.
 *
 * Aufruf:
 *   npx tsx scripts/seed-supabaseAdmin.ts
 *
 * Benötigt in .env.local:
 *   CAPITALIFE_BRAIN_PATH
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const BRAIN_PATH = process.env.CAPITALIFE_BRAIN_PATH ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!BRAIN_PATH) { console.error("❌  CAPITALIFE_BRAIN_PATH not set"); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error("❌  Supabase env vars missing"); process.exit(1); }

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TRADES_FILE = path.join(BRAIN_PATH, "16_Backtesting_Validation/forward_trades_log.csv");
const SIGNALS_FILE = path.join(BRAIN_PATH, "16_Backtesting_Validation/forward_signal_log.csv");

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
}

function toNum(val: string | undefined): number | null {
  if (!val || val === "" || val === "n/a") return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

async function seedTrades() {
  if (!fs.existsSync(TRADES_FILE)) {
    console.warn("⚠️  forward_trades_log.csv not found at:", TRADES_FILE);
    return;
  }
  const rows = parseCsv(fs.readFileSync(TRADES_FILE, "utf-8"));
  console.log(`📂  ${rows.length} trade rows found`);

  const payload = rows.map((r) => ({
    event:       r.event ?? "ENTRY",
    symbol:      r.symbol ?? "",
    direction:   r.direction ?? "",
    entry_price: toNum(r.entry_price),
    exit_price:  toNum(r.exit_price),
    entry_date:  r.entry_date || null,
    exit_date:   r.exit_date || null,
    pnl:         toNum(r.pnl),
    strategy_id: r.strategy_id || null,
    notes:       r.notes || null,
  }));

  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabaseAdmin
      .from("forward_trades")
      .upsert(payload.slice(i, i + CHUNK), { onConflict: "symbol,entry_date,direction,event" });
    if (error) { console.error(`❌  Upsert chunk ${i}:`, error.message); return; }
    console.log(`✅  trades upserted ${i + 1}–${Math.min(i + CHUNK, payload.length)}`);
  }
  console.log("✅  forward_trades done");
}

async function seedSignals() {
  if (!fs.existsSync(SIGNALS_FILE)) {
    console.warn("⚠️  forward_signal_log.csv not found at:", SIGNALS_FILE);
    return;
  }
  const rows = parseCsv(fs.readFileSync(SIGNALS_FILE, "utf-8"));
  console.log(`📂  ${rows.length} signal rows found`);

  const payload = rows.map((r) => ({
    symbol:      r.symbol ?? "",
    direction:   r.direction ?? "",
    in_position: r.in_position === "True",
    signal_ts:   r.timestamp ? new Date(r.timestamp).toISOString() : null,
    strategy_id: r.strategy_id || null,
  }));

  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabaseAdmin
      .from("forward_signals")
      .upsert(payload.slice(i, i + CHUNK), { onConflict: "symbol,strategy_id" });
    if (error) { console.error(`❌  Upsert chunk ${i}:`, error.message); return; }
    console.log(`✅  signals upserted ${i + 1}–${Math.min(i + CHUNK, payload.length)}`);
  }
  console.log("✅  forward_signals done");
}

async function main() {
  console.log("🚀  Seeding Supabase from Brain path:", BRAIN_PATH);
  await seedTrades();
  await seedSignals();
  console.log("🎉  Done");
}

main().catch((e) => { console.error(e); process.exit(1); });
