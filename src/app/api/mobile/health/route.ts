import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isPublicPreview } from "@/lib/server/app-mode";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ServiceHealth =
  | "READY"
  | "PARTIAL"
  | "LOCAL_ONLY"
  | "OFFLINE"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE_PUBLICLY";

export type MobileHealthEntry = {
  id: string;
  name: string;
  status: ServiceHealth;
  detail?: string;
};

export type MobileHealthV2 = {
  overall: "READY" | "DEGRADED" | "DOWN";
  mode: "public-preview" | "local-private";
  services: MobileHealthEntry[];
  updatedAt: string;
};

async function checkSupabase(): Promise<ServiceHealth> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!url) return "NOT_CONFIGURED";
    const db = createSupabaseServiceClient();
    const { error } = await db.from("forward_signals").select("signal_ts").limit(1);
    return error ? "PARTIAL" : "READY";
  } catch {
    return "OFFLINE";
  }
}

function checkBrain(): ServiceHealth {
  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim();
  if (!brainPath) return "NOT_CONFIGURED";
  try {
    if (!fs.existsSync(brainPath)) return "OFFLINE";
    const graphPath = path.join(brainPath, "graphify-out", "graph.json");
    return fs.existsSync(graphPath) ? "READY" : "PARTIAL";
  } catch {
    return "OFFLINE";
  }
}

function checkBrainSearch(): ServiceHealth {
  const brainPath = process.env.CAPITALIFE_BRAIN_PATH?.trim();
  if (!brainPath) return "UNAVAILABLE_PUBLICLY";
  return fs.existsSync(brainPath) ? "READY" : "OFFLINE";
}

function checkSentinel(): ServiceHealth {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  return hasKey ? "READY" : "NOT_CONFIGURED";
}

function checkWhiteSwan(): ServiceHealth {
  const p = path.join(process.cwd(), "public", "data", "white-swan", "final-normalized", "summary.json");
  return fs.existsSync(p) ? "READY" : "OFFLINE";
}

function checkMarketData(): ServiceHealth {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return url ? "PARTIAL" : "NOT_CONFIGURED"; // live_quotes requires Supabase
}

function checkHistoricalData(): ServiceHealth {
  const p = path.join(process.cwd(), "src", "data", "capitalife", "analytics-generated.json");
  return fs.existsSync(p) ? "READY" : "OFFLINE";
}

function checkStrategyTester(): ServiceHealth {
  const p = path.join(process.cwd(), "public", "data", "anomaly");
  try {
    if (!fs.existsSync(p)) return "OFFLINE";
    const files = fs.readdirSync(p).filter((f) => f.endsWith(".json"));
    return files.length > 0 ? "READY" : "OFFLINE";
  } catch {
    return "OFFLINE";
  }
}

function checkSeasonality(): ServiceHealth {
  const p = path.join(process.cwd(), "src", "data", "capitalife", "seasonality_validation.json");
  return fs.existsSync(p) ? "READY" : "LOCAL_ONLY";
}

export async function GET(): Promise<NextResponse<MobileHealthV2>> {
  const preview = isPublicPreview();
  const supabaseStatus = await checkSupabase();

  const services: MobileHealthEntry[] = [
    { id: "mobile-apis",       name: "Mobile APIs",          status: "READY",                   detail: "7+ endpoints operational" },
    { id: "brain",             name: "Brain",                status: checkBrain(),               detail: !process.env.CAPITALIFE_BRAIN_PATH ? "CAPITALIFE_BRAIN_PATH not set" : undefined },
    { id: "brain-search",      name: "Brain Search",         status: checkBrainSearch(),         detail: preview ? "Local vault unavailable on Vercel" : undefined },
    { id: "sentinel",          name: "Sentinel AI",          status: checkSentinel() },
    { id: "white-swan",        name: "White Swan",           status: checkWhiteSwan() },
    { id: "market-data",       name: "Market Data",          status: checkMarketData(),          detail: supabaseStatus === "READY" ? "live_quotes via Supabase" : "Supabase required for live quotes" },
    { id: "historical-data",   name: "Historical Data",      status: checkHistoricalData() },
    { id: "strategy-tester",   name: "Strategy Tester",      status: checkStrategyTester() },
    { id: "seasonality",       name: "Seasonality Engine",   status: checkSeasonality() },
    { id: "mva",               name: "MVA Engine",           status: "LOCAL_ONLY",              detail: "Active locally; not available on Vercel" },
    { id: "shadow-forward",    name: "Shadow/Forward",       status: supabaseStatus === "READY" ? "PARTIAL" : "NOT_CONFIGURED", detail: "forward_signals via Supabase" },
    { id: "database",          name: "Database (Supabase)",  status: supabaseStatus },
    { id: "ibkr",              name: "IBKR",                 status: "LOCAL_ONLY",              detail: "Paper/live only via local TWS — never on Vercel" },
    { id: "nautilus",          name: "NautilusTrader",       status: "LOCAL_ONLY",              detail: "Execution sidecar — local only" },
    { id: "ai-providers",      name: "AI Providers",         status: checkSentinel() },
  ];

  const readyCount = services.filter((s) => s.status === "READY").length;
  const offlineCount = services.filter((s) => s.status === "OFFLINE").length;
  const overall = offlineCount > 3 ? "DOWN" : readyCount < services.length / 2 ? "DEGRADED" : "READY";

  return NextResponse.json({
    overall,
    mode: preview ? "public-preview" : "local-private",
    services,
    updatedAt: new Date().toISOString(),
  });
}
