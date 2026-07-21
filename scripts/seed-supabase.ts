/**
 * seed-supabase.ts
 * Seeds Supabase from local Brain + Invest Portfolio data.
 *
 * Tables seeded:
 *   forward_trades, forward_signals    — Brain/16_Backtesting_Validation CSVs
 *   invest_ohlc                        — Invest Portfolio CSVs (all symbols)
 *   strategy_sleeves, strategy_entries — final_production_sleeves.snapshot.json
 *   brain_nodes, brain_links           — graphify-out/graph.json
 *
 * Run:
 *   npx tsx scripts/seed-supabase.ts [--only=invest_ohlc,strategy]
 *
 * Requires in .env.local:
 *   CAPITALIFE_BRAIN_PATH
 *   INVEST_PORTFOLIO_PATH  (optional, defaults to local Desktop path)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const BRAIN_PATH   = process.env.CAPITALIFE_BRAIN_PATH ?? "";
const INVEST_PATH  = process.env.INVEST_PORTFOLIO_PATH ?? "C:\\Users\\joris\\Desktop\\Invest Portfolio";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Parse --only= early so we can conditionally require BRAIN_PATH
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7)?.split(",") ?? null;
const should = (name: string) => !ONLY || ONLY.some((o) => name.includes(o));

if (!SUPABASE_URL || !SERVICE_KEY) { console.error("❌  Supabase env vars missing"); process.exit(1); }

const BRAIN_REQUIRED_TASKS = ["forward_trades", "forward_signals", "strategy", "brain", "dashboard"];
const needsBrain = !ONLY || BRAIN_REQUIRED_TASKS.some(t => ONLY.some(o => t.includes(o)));
if (needsBrain && !BRAIN_PATH) { console.error("❌  CAPITALIFE_BRAIN_PATH not set (needed for: " + BRAIN_REQUIRED_TASKS.join(", ") + ")"); process.exit(1); }

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim().replace(/^"|"$/g, ""); });
    return row;
  });
}

function toNum(val: string | undefined): number | null {
  if (!val || val === "" || val === "n/a") return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsert(table: string, rows: any[], onConflict: string, label: string) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict } as { onConflict: string });
    if (error) { console.error(`❌  ${label} chunk ${i}:`, error.message); return false; }
    process.stdout.write(`\r  ${label}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log(`\r✅  ${label}: ${rows.length} rows`);
  return true;
}

// ── Forward Trades ────────────────────────────────────────────────────────────

async function seedTrades() {
  const file = path.join(BRAIN_PATH, "16_Backtesting_Validation/forward_trades_log.csv");
  if (!fs.existsSync(file)) { console.warn("⚠️  forward_trades_log.csv not found"); return; }
  const rows = parseCsv(fs.readFileSync(file, "utf-8"));
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
  await upsert("forward_trades", payload, "symbol,entry_date,direction,event", "forward_trades");
}

// ── Forward Signals ───────────────────────────────────────────────────────────

async function seedSignals() {
  const file = path.join(BRAIN_PATH, "16_Backtesting_Validation/forward_signal_log.csv");
  if (!fs.existsSync(file)) { console.warn("⚠️  forward_signal_log.csv not found"); return; }
  const rows = parseCsv(fs.readFileSync(file, "utf-8"));
  const payload = rows.map((r) => ({
    symbol:      r.symbol ?? "",
    direction:   r.direction ?? "",
    in_position: r.in_position === "True",
    signal_ts:   r.timestamp ? new Date(r.timestamp).toISOString() : null,
    strategy_id: r.strategy_id || null,
  }));
  await upsert("forward_signals", payload, "symbol,strategy_id", "forward_signals");
}

// ── Invest Portfolio OHLC ─────────────────────────────────────────────────────

const INVEST_SYMBOL_MAP: Record<string, string[]> = {
  "QQQ":  ["QQQ.csv", "BATS_QQQ, 1D_9233b.csv"],
  "SPY":  ["SPY.csv", "BATS_SPY, 1D_bb5e9.csv"],
  "SPMO": ["SPMO.csv", "BATS_SPMO, 1D_fe070.csv"],
  "GLD":  ["GLD.csv", "BATS_GLD, 1D_4975f.csv"],
  "GC1!": ["COMEX_DL_GC1!, 1D.csv", "GC1!.csv", "GC1.csv"],
  "HG1!": ["COMEX_DL_HG1!, 1D_9fc12.csv"],
  "6S1!": ["CME_DL_6S1!, 1D_b8f81.csv"],
};

async function seedInvestOhlc() {
  if (!fs.existsSync(INVEST_PATH)) {
    console.warn("⚠️  INVEST_PATH not found:", INVEST_PATH);
    return;
  }
  let total = 0;
  for (const [symbol, candidates] of Object.entries(INVEST_SYMBOL_MAP)) {
    const file = candidates.map((f) => path.join(INVEST_PATH, f)).find(fs.existsSync);
    if (!file) { console.warn(`⚠️  No CSV found for ${symbol}`); continue; }

    const rows = parseCsv(fs.readFileSync(file, "utf-8"));
    const payload = rows
      .map((r) => {
        const date = (r.time ?? r.date ?? r.Date ?? r.Time ?? "").slice(0, 10);
        const close = toNum(r.close ?? r.Close);
        if (!date || close === null) return null;
        return {
          symbol,
          date,
          open:   toNum(r.open ?? r.Open),
          high:   toNum(r.high ?? r.High),
          low:    toNum(r.low ?? r.Low),
          close,
          volume: toNum(r.volume ?? r.Volume),
        };
      })
      .filter(Boolean);

    const ok = await upsert("invest_ohlc", payload as object[], "symbol,date", `invest_ohlc(${symbol})`);
    if (ok) total += payload.length;
  }
  console.log(`✅  invest_ohlc total: ${total} bars`);
}

// ── Strategy Registry ─────────────────────────────────────────────────────────

const SLEEVES_FILE = path.join(
  BRAIN_PATH,
  "../Capitalife Brain/_External_Sources/capitalife_brain_final_v1/dashboard/final_production_sleeves.snapshot.json"
);

// Also try relative to script location or direct Brain path
function findSleevesFile(): string | null {
  const candidates = [
    SLEEVES_FILE,
    path.join(BRAIN_PATH, "_External_Sources/capitalife_brain_final_v1/dashboard/final_production_sleeves.snapshot.json"),
    path.join(path.dirname(BRAIN_PATH), "Capitalife Brain/_External_Sources/capitalife_brain_final_v1/dashboard/final_production_sleeves.snapshot.json"),
  ];
  return candidates.find(fs.existsSync) ?? null;
}

async function seedStrategyRegistry() {
  const file = findSleevesFile();
  if (!file) { console.warn("⚠️  final_production_sleeves.snapshot.json not found"); return; }

  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  const sleeves: object[] = (data.sleeves ?? []).map((s: Record<string, unknown>) => ({
    sleeve:              s.sleeve ?? "",
    active_version:      s.active_version ?? null,
    assets:              s.assets ?? null,
    status:              s.status ?? null,
    weighting:           s.weighting ?? null,
    oos_period:          s.oos_period ?? null,
    cagr_pct:            s.cagr_pct ?? null,
    total_return_pct:    s.total_return_pct ?? null,
    max_dd_pct:          s.max_dd_pct ?? null,
    sharpe:              s.sharpe ?? null,
    calmar:              s.calmar ?? null,
    profit_factor:       s.profit_factor ?? null,
    trades:              s.trades ?? null,
    positive_years_pct:  s.positive_years_pct ?? null,
  }));

  const entries: object[] = (data.strategies ?? []).map((s: Record<string, unknown>) => ({
    strategy_id:           s.strategy_id ?? "",
    sleeve:                s.sleeve ?? null,
    asset:                 s.asset ?? null,
    name:                  s.name ?? null,
    symbol:                s.symbol ?? null,
    timeframe:             s.timeframe ?? null,
    strategy_type:         s.strategy_type ?? null,
    direction:             s.direction ?? null,
    status:                s.status ?? null,
    active:                s.active ?? false,
    version:               s.version ?? null,
    oos_period:            s.oos_period ?? null,
    oos_cagr_pct:          s.oos_cagr_pct ?? null,
    oos_total_return_pct:  s.oos_total_return_pct ?? null,
    oos_max_dd_pct:        s.oos_max_dd_pct ?? null,
    oos_sharpe:            s.oos_sharpe ?? null,
    oos_calmar:            s.oos_calmar ?? null,
    oos_profit_factor:     s.oos_profit_factor ?? null,
    oos_trades:            s.oos_trades ?? null,
    oos_positive_years_pct: s.oos_positive_years_pct ?? null,
    params: {
      base: s.base, fast: s.fast, slow: s.slow, threshold: s.threshold,
      val_mode: s.val_mode, requirement: s.requirement,
      ema: s.ema, regime: s.regime, sd: s.sd,
      sl_atr: s.sl_atr, rr: s.rr, cooldown: s.cooldown,
      point_value: s.point_value, tick: s.tick,
      anchors: s.anchors, weight_pct: s.weight_pct,
      source_file: s.source_file, notes: s.notes,
    },
  }));

  await upsert("strategy_sleeves", sleeves, "sleeve", "strategy_sleeves");
  await upsert("strategy_entries", entries, "strategy_id", "strategy_entries");
}

// ── Monitoring OHLC Cache ─────────────────────────────────────────────────────

const MONITORING_CACHE_DIR = path.join(
  process.cwd(), "public", "generated", "monitoring", "tradingview_data_cache"
);
const CACHE_MANIFEST = path.join(MONITORING_CACHE_DIR, "cache_manifest_full.json");

async function seedMonitoringOhlc() {
  if (!fs.existsSync(CACHE_MANIFEST)) {
    console.warn("⚠️  cache_manifest_full.json not found — run monitoring cache refresh first");
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(CACHE_MANIFEST, "utf-8"));
  const assets: Array<{ asset: string; timeframe: string; cachePath?: string; legacyCachePath?: string }> = manifest.assets ?? [];

  const PUBLIC_DIR = path.join(process.cwd(), "public");
  let total = 0;

  for (const a of assets) {
    const assetKey = (a.asset ?? "").toUpperCase();
    const tf = (a.timeframe ?? "D").toUpperCase() === "1D" ? "D" : (a.timeframe ?? "D");
    const candidates = [a.cachePath, a.legacyCachePath].filter(Boolean) as string[];
    const filePath = candidates
      .map((c) => path.join(PUBLIC_DIR, c.startsWith("public/") ? c.slice(7) : c))
      .find(fs.existsSync);

    if (!filePath) { process.stdout.write(`  ⚠️  ${assetKey} ${tf}: no cache file\n`); continue; }

    let cacheJson: { bars?: Array<Record<string, unknown>> };
    try { cacheJson = JSON.parse(fs.readFileSync(filePath, "utf-8")); }
    catch { process.stdout.write(`  ⚠️  ${assetKey} ${tf}: parse error\n`); continue; }

    const payload = (cacheJson.bars ?? []).map((r) => {
      const date = String(r.date ?? r.time ?? "").slice(0, 10);
      const close = toNum(String(r.close ?? ""));
      if (!date || close === null) return null;
      return {
        asset:     assetKey,
        timeframe: tf,
        date,
        open:   toNum(String(r.open ?? "")),
        high:   toNum(String(r.high ?? "")),
        low:    toNum(String(r.low ?? "")),
        close,
        volume: toNum(String(r.volume ?? "")),
      };
    }).filter(Boolean);

    if (!payload.length) continue;
    const ok = await upsert("monitoring_ohlc", payload as object[], "asset,timeframe,date", `monitoring_ohlc(${assetKey}/${tf})`);
    if (ok) total += payload.length;
  }
  console.log(`✅  monitoring_ohlc total: ${total} bars across ${assets.length} assets`);
}

// ── Brain Graph ───────────────────────────────────────────────────────────────

async function seedBrainGraph() {
  const graphFile = path.join(BRAIN_PATH, "graphify-out/graph.json");
  if (!fs.existsSync(graphFile)) { console.warn("⚠️  graphify-out/graph.json not found"); return; }

  console.log("📂  Reading graph.json (~55MB)…");
  const graph = JSON.parse(fs.readFileSync(graphFile, "utf-8"));

  const nodes: object[] = (graph.nodes ?? []).map((n: Record<string, unknown>) => ({
    id:          String(n.id ?? n.key ?? ""),
    label:       String(n.label ?? n.id ?? ""),
    folder:      String(n.folder ?? n.group ?? ""),
    file_type:   n.file_type ? String(n.file_type) : null,
    preview:     String(n.preview ?? ""),
    degree:      Number(n.degree ?? 0),
    community:   n.community != null ? Number(n.community) : null,
    x:           Number(n.x ?? 0),
    y:           Number(n.y ?? 0),
  })).filter((n: Record<string, unknown>) => n.id);

  console.log(`  ${nodes.length} nodes`);
  const ok = await upsert("brain_nodes", nodes, "id", "brain_nodes");
  if (!ok) return;

  const links: object[] = (graph.links ?? graph.edges ?? []).map((l: Record<string, unknown>) => ({
    source:      String(l.source ?? l.from ?? ""),
    target:      String(l.target ?? l.to ?? ""),
  })).filter((l: Record<string, unknown>) => l.source && l.target);

  console.log(`  ${links.length} links`);

  // brain_links has identity PK — delete all then insert fresh
  const { error: delErr } = await supabaseAdmin.from("brain_links").delete().gte("id", 0);
  if (delErr) { console.error("❌  brain_links delete:", delErr.message); return; }

  const CHUNK = 500;
  for (let i = 0; i < links.length; i += CHUNK) {
    const { error } = await supabaseAdmin.from("brain_links").insert(links.slice(i, i + CHUNK));
    if (error) { console.error(`❌  brain_links insert chunk ${i}:`, error.message); return; }
    process.stdout.write(`\r  brain_links: ${Math.min(i + CHUNK, links.length)}/${links.length}`);
  }
  console.log(`\r✅  brain_links: ${links.length} rows`);
}

// ── Wave1 Group Data ──────────────────────────────────────────────────────────

function readJsonFile(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return null; }
}

async function seedWave1Groups() {
  const GROUPS = ["agrar", "intraday", "indices"] as const;
  const wave1Base = path.join(process.cwd(), "public/generated/monitoring/wave1");

  if (!fs.existsSync(wave1Base)) {
    console.warn("⚠️  public/generated/monitoring/wave1 not found — run monitoring engine first");
    return;
  }

  for (const group of GROUPS) {
    const base = path.join(wave1Base, group);
    const manifest = readJsonFile(path.join(base, "group_manifest.json"));
    const signals  = readJsonFile(path.join(base, "signals.json"));
    const statuses = readJsonFile(path.join(base, "status.json"));
    const cards    = readJsonFile(path.join(base, "cards.json"));
    const charts   = readJsonFile(path.join(base, "charts.json")); // includes per-strategy OHLC bars + markers

    if (!manifest && !signals) { console.warn(`⚠️  wave1_groups(${group}): no data`); continue; }

    const chartsSize = charts ? JSON.stringify(charts).length : 0;
    console.log(`  ${group}: manifest=${!!manifest}, signals=${!!signals}, charts=${chartsSize > 0 ? `${(chartsSize/1024).toFixed(0)}KB` : "none"}`);

    const generatedAt = (manifest as Record<string, unknown>)?.generated_at as string | null ?? null;
    const { error } = await supabaseAdmin.from("wave1_groups").upsert(
      [{ group_id: group, manifest, signals, statuses, cards, charts, generated_at: generatedAt }],
      { onConflict: "group_id" }
    );
    if (error) { console.error(`❌  wave1_groups(${group}):`, error.message); }
    else { console.log(`✅  wave1_groups(${group}): seeded`); }
  }
}

// ── Track KPIs (from trades_clean_compounded.csv) ────────────────────────────

const MONTHLY_OVERRIDE: Record<string, number> = {
  "2026-01": 0.17, "2026-02": 3.75, "2026-03": 0.17, "2026-04": 0.93,
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function computeTrackKpis(csvPath: string) {
  if (!fs.existsSync(csvPath)) return null;
  const raw = parseCsv(fs.readFileSync(csvPath, "utf-8"));
  const parsed = raw.map((r) => {
    const date = new Date(r["Close Date"] ?? "");
    const gain = parseFloat(r["Gain (%)"] ?? "");
    if (isNaN(date.getTime()) || !isFinite(gain)) return null;
    return { date, gainPct: gain };
  }).filter(Boolean) as { date: Date; gainPct: number }[];

  const overrideKeys = new Set(Object.keys(MONTHLY_OVERRIDE));
  const preserved = parsed.filter((r) => !overrideKeys.has(monthKey(r.date)));
  const injected = Object.entries(MONTHLY_OVERRIDE).map(([k, gainPct]) => {
    const [y, m] = k.split("-").map(Number);
    return { date: new Date(y, m - 1, 1, 12), gainPct };
  });
  const rows = [...preserved, ...injected].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (!rows.length) return null;

  const totalReturn = rows.reduce((acc, r) => acc * (1 + r.gainPct / 100), 1) - 1;

  let equity = 1; let peak = 1; let maxDd = 0;
  for (const r of rows) {
    equity *= (1 + r.gainPct / 100);
    peak = Math.max(peak, equity);
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
  }

  const currentYear = new Date().getFullYear();
  const ytdRows = rows.filter((r) => r.date.getFullYear() === currentYear);
  const ytdReturn = ytdRows.reduce((acc, r) => acc * (1 + r.gainPct / 100), 1) - 1;

  const endDate = rows.at(-1)!.date;
  const start24m = new Date(endDate);
  start24m.setMonth(start24m.getMonth() - 24);
  const return24m = rows.filter((r) => r.date >= start24m)
    .reduce((acc, r) => acc * (1 + r.gainPct / 100), 1) - 1;

  const sign = (n: number) => (n >= 0 ? "+" : "");
  const fmt = (n: number) => `${sign(n)}${(n * 100).toFixed(1)}%`;

  return {
    totalReturn: fmt(totalReturn),
    maxDrawdown: `-${maxDd.toFixed(2)}%`,
    compoundedReturn: fmt(totalReturn),
    annualizedReturn: `${(ytdReturn * 100).toFixed(1)}%`,
    totalReturn24m: fmt(return24m),
  };
}

// ── Dashboard Snapshot ────────────────────────────────────────────────────────

async function seedDashboardSnapshot() {
  const file = path.join(BRAIN_PATH, "09_AI/dashboard_snapshot.json");
  if (!fs.existsSync(file)) { console.warn("⚠️  dashboard_snapshot.json not found"); return; }
  const raw = fs.readFileSync(file, "utf-8");
  const data = JSON.parse(raw);

  const trackKpis = computeTrackKpis(path.join(process.cwd(), "trades_clean_compounded.csv"));
  if (trackKpis) {
    data._track_kpis = trackKpis;
    console.log("  📊  _track_kpis:", JSON.stringify(trackKpis));
  } else {
    console.warn("  ⚠️  trades_clean_compounded.csv not found — _track_kpis not injected");
  }

  const generated_at = data.generated_at ? new Date(data.generated_at).toISOString() : null;
  const { error } = await supabaseAdmin.from("dashboard_snapshot").upsert(
    [{ key: "latest", data, generated_at }],
    { onConflict: "key" }
  );
  if (error) { console.error("❌  dashboard_snapshot:", error.message); return; }
  console.log("✅  dashboard_snapshot: uploaded");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀  Seeding Supabase");
  console.log(`    Brain:  ${BRAIN_PATH}`);
  console.log(`    Invest: ${INVEST_PATH}`);
  if (ONLY) console.log(`    Only:   ${ONLY.join(", ")}`);

  if (should("forward_trades"))    await seedTrades();
  if (should("forward_signals"))   await seedSignals();
  if (should("invest_ohlc"))       await seedInvestOhlc();
  if (should("strategy"))          await seedStrategyRegistry();
  if (should("dashboard"))         await seedDashboardSnapshot();
  if (should("wave1"))             await seedWave1Groups();
  if (should("monitoring_ohlc"))   await seedMonitoringOhlc();
  if (should("brain"))             await seedBrainGraph();

  console.log("\n🎉  Done");
}

main().catch((e) => { console.error(e); process.exit(1); });
