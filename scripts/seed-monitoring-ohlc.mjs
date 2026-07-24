/**
 * Seed monitoring_ohlc from local TVC cache files.
 * Run: node scripts/seed-monitoring-ohlc.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
config({ path: join(ROOT, ".env.local") });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalizeDay(val) {
  if (!val) return null;
  const s = String(val).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseBars(rawBars) {
  const out = [];
  for (const row of rawBars || []) {
    const time = normalizeDay(row?.date ?? row?.time ?? "");
    const open = Number(row?.open);
    const high = Number(row?.high);
    const low = Number(row?.low);
    const close = Number(row?.close);
    if (!time || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    if (close <= 0 || open <= 0) continue;
    out.push({ time, open, high, low, close, volume: row?.volume != null ? Number(row.volume) || null : null });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

async function upsertBatch(asset, timeframe, bars) {
  // Deduplicate by date — keep last entry per date
  const byDate = new Map();
  for (const b of bars) byDate.set(b.time, b);
  const deduped = [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const chunk = deduped.slice(i, i + BATCH).map((b) => ({
      asset,
      timeframe,
      date: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume ?? null,
    }));
    const { error } = await db.from("monitoring_ohlc").upsert(chunk, { onConflict: "asset,timeframe,date" });
    if (error) throw new Error(`Upsert failed for ${asset}: ${error.message}`);
    inserted += chunk.length;

  }
  return inserted;
}

async function main() {
  const manifestPath = join(ROOT, "public/generated/monitoring/tradingview_data_cache/cache_manifest_full.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const assets = (manifest.assets || []).filter((a) => a.tab !== "Dependency" && a.cachePath);

  console.log(`Seeding ${assets.length} assets into monitoring_ohlc...`);

  // Deduplicate by (asset, timeframe) — prefer non-Dependency, first occurrence wins
  const seen = new Set();
  const deduped = [];
  for (const a of assets) {
    const key = `${a.asset}|${a.timeframe || "D"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  let total = 0;
  for (const entry of deduped) {
    const relPath = entry.cachePath.startsWith("public/") ? entry.cachePath : `public/${entry.cachePath}`;
    const absPath = join(ROOT, relPath);
    try {
      const raw = JSON.parse(readFileSync(absPath, "utf-8"));
      const bars = parseBars(raw.bars || raw.data || []);
      if (!bars.length) {
        console.warn(`  SKIP ${entry.asset} — no valid bars in ${relPath}`);
        continue;
      }
      const inserted = await upsertBatch(entry.asset, entry.timeframe || "D", bars);
      total += inserted;
      console.log(`  OK   ${entry.asset.padEnd(24)} ${String(entry.timeframe || "D").padEnd(4)} ${String(inserted).padStart(5)} bars  [${bars[0].time} → ${bars[bars.length - 1].time}]`);
    } catch (err) {
      console.error(`  ERR  ${entry.asset}: ${err.message}`);
    }
  }

  console.log(`\nDone. Total rows upserted: ${total}`);

  // Verify
  const { data: check } = await db
    .from("monitoring_ohlc")
    .select("asset, timeframe")
    .order("asset");
  const counts = {};
  for (const r of check || []) {
    const k = `${r.asset}|${r.timeframe}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  console.log(`\nVerification — ${Object.keys(counts).length} distinct (asset, timeframe) pairs in table`);
}

main().catch((err) => { console.error(err); process.exit(1); });
