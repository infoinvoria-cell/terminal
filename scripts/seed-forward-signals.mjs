/**
 * Seed forward_signals from local strategy signal files.
 * Run: node scripts/seed-forward-signals.mjs
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

config({ path: join(ROOT, ".env.local") });

const SIGNALS_DIR = join(ROOT, "public", "generated", "monitoring", "signals");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function latestEvent(events) {
  if (!events?.length) return null;
  return events
    .filter((e) => e.time)
    .sort((a, b) => b.time.localeCompare(a.time))[0] ?? null;
}

async function main() {
  const files = readdirSync(SIGNALS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} signal files`);

  const rows = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(SIGNALS_DIR, file), "utf-8"));
      const symbol = raw.symbol;
      const strategyId = raw.source ?? raw.strategyName ?? null;
      if (!symbol) continue;

      const latest = latestEvent(raw.signalEvents);
      const direction = latest?.direction?.toUpperCase() ?? "";
      const signalTs = latest?.time ? `${latest.time}T00:00:00Z` : null;
      const inPosition = raw.openTrade === true;

      rows.push({
        symbol,
        direction,
        in_position: inPosition,
        signal_ts: signalTs,
        strategy_id: strategyId,
      });
    } catch (err) {
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }

  console.log(`Prepared ${rows.length} rows. Clearing old entries...`);

  // Clear existing rows
  const { error: delErr } = await supabase
    .from("forward_signals")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }

  // Insert all rows
  const { error: insErr } = await supabase.from("forward_signals").insert(rows);
  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} rows into forward_signals.`);

  // Verify
  const { data, error: selErr } = await supabase
    .from("forward_signals")
    .select("symbol, direction, in_position, signal_ts, strategy_id")
    .order("signal_ts", { ascending: false })
    .limit(20);

  if (selErr) {
    console.error("Verify failed:", selErr.message);
  } else {
    console.log("\nTop 20 by signal_ts:");
    for (const r of data ?? []) {
      console.log(
        `  ${r.symbol.padEnd(8)} ${(r.direction||"").padEnd(6)} in_pos=${String(r.in_position).padEnd(5)} ts=${r.signal_ts?.slice(0,10) ?? "null"} strat=${r.strategy_id ?? ""}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
