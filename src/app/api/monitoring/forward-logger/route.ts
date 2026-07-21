import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRAIN_PATH = process.env.CAPITALIFE_BRAIN_PATH ?? "";
const TRADES_FILE = "16_Backtesting_Validation/forward_trades_log.csv";
const SIGNALS_FILE = "16_Backtesting_Validation/forward_signal_log.csv";
const MANIFEST_PATH = path.join(
  process.cwd(),
  "public/generated/monitoring/tradingview_data_cache/cache_manifest_full.json"
);

// ── CSV helpers ───────────────────────────────────────────────────────────────

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

// ── Price map from local manifest ─────────────────────────────────────────────

type ManifestAsset = { asset: string; isMainAsset?: boolean; lastClose: number | null; lastDate?: string };
type ManifestJson = { assets?: ManifestAsset[] };

function buildPriceMap(): Map<string, { lastClose: number; lastDate: string }> {
  const map = new Map<string, { lastClose: number; lastDate: string }>();
  if (!fs.existsSync(MANIFEST_PATH)) return map;
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as ManifestJson;
    const sorted = [...(manifest.assets ?? [])].sort((a, b) =>
      (b.isMainAsset ? 1 : 0) - (a.isMainAsset ? 1 : 0)
    );
    for (const a of sorted) {
      if (a.lastClose == null) continue;
      const entry = { lastClose: a.lastClose, lastDate: a.lastDate ?? "" };
      const key = a.asset.toUpperCase();
      const keyNoBang = key.replace(/!$/, "");
      if (a.isMainAsset || !map.has(key)) map.set(key, entry);
      if (a.isMainAsset || !map.has(keyNoBang)) map.set(keyNoBang, entry);
    }
  } catch { /* ignore */ }
  return map;
}

function calcUnrealizedPct(entryPrice: string, direction: string, lastClose: number): number | null {
  const entry = parseFloat(entryPrice);
  if (!entry || !lastClose) return null;
  const sign = direction.toUpperCase() === "SHORT" ? -1 : 1;
  return ((lastClose - entry) / entry) * 100 * sign;
}

// ── Filesystem source (local) ─────────────────────────────────────────────────

async function fromFilesystem() {
  const tradesPath = path.join(BRAIN_PATH, TRADES_FILE);
  const signalsPath = path.join(BRAIN_PATH, SIGNALS_FILE);

  if (!fs.existsSync(tradesPath) || !fs.existsSync(signalsPath)) {
    return null;
  }

  const tradesRaw = fs.readFileSync(tradesPath, "utf-8");
  const signalsRaw = fs.readFileSync(signalsPath, "utf-8");
  const allTrades = parseCsv(tradesRaw);
  const allSignals = parseCsv(signalsRaw);
  const priceMap = buildPriceMap();

  const openTrades = allTrades
    .filter((r) => r.event === "ENTRY" && !r.exit_date)
    .map((r) => {
      const sym = (r.symbol ?? "").toUpperCase();
      const price = priceMap.get(sym) ?? priceMap.get(`${sym}!`) ?? null;
      const unrealizedPct = price
        ? calcUnrealizedPct(r.entry_price, r.direction, price.lastClose)
        : null;
      return {
        ...r,
        lastClose: price?.lastClose ?? null,
        lastCloseDate: price?.lastDate ?? null,
        unrealizedPct: unrealizedPct != null ? Math.round(unrealizedPct * 100) / 100 : null,
      };
    });

  const activeSignals = allSignals.filter((r) => r.in_position === "True");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recentClosed = allTrades.filter((r) => r.exit_date && r.exit_date >= cutoffStr);

  return { openTrades, activeSignals, recentClosed, source: "filesystem" as const };
}

// ── Supabase source (fallback / Vercel) ───────────────────────────────────────

async function fromSupabase() {
  const db = createSupabaseServiceClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl.startsWith("https://")) return null;

  const [tradesRes, signalsRes] = await Promise.all([
    db.from("forward_trades").select("*"),
    db.from("forward_signals").select("*"),
  ]);

  if (tradesRes.error || signalsRes.error) {
    throw new Error(`Supabase query failed — trades: ${tradesRes.error?.message ?? "ok"} | signals: ${signalsRes.error?.message ?? "ok"}`);
  }

  const allTrades = tradesRes.data ?? [];
  const allSignals = signalsRes.data ?? [];

  const openTrades = allTrades.filter((r) => r.event === "ENTRY" && !r.exit_date);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recentClosed = allTrades.filter(
    (r) => r.exit_date && r.exit_date >= cutoffStr
  );

  const activeSignals = allSignals.filter((r) => r.in_position === true);

  return { openTrades, activeSignals, recentClosed, source: "supabase" as const };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Prefer filesystem when Brain path is set; fall back to Supabase on Vercel
    const result = BRAIN_PATH
      ? ((await fromFilesystem()) ?? (await fromSupabase()))
      : (await fromSupabase());

    if (!result) {
      return NextResponse.json({
        available: false,
        reason: BRAIN_PATH
          ? "Forward log files not found in Brain path"
          : "CAPITALIFE_BRAIN_PATH not set and Supabase not configured",
      });
    }

    return NextResponse.json({
      available: true,
      asOf: new Date().toISOString(),
      ...result,
      counts: {
        open: result.openTrades.length,
        activeSignals: result.activeSignals.length,
        recentClosed: result.recentClosed.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ available: false, reason: String(err) }, { status: 500 });
  }
}
