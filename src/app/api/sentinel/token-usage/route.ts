import { NextResponse } from "next/server";

// ── Groq daily limits (free tier) ─────────────────────────────────────────
const PROVIDER_LIMITS: Record<string, { daily: number; resetHour: number }> = {
  groq: { daily: 14_400, resetHour: 0 },   // free tier ~14k tokens/day
  mistral: { daily: Infinity, resetHour: 0 }, // free tier via La Plateforme (generous)
  ollama: { daily: Infinity, resetHour: 0 },
  local: { daily: Infinity, resetHour: 0 },
  anthropic: { daily: Infinity, resetHour: 0 },
  custom: { daily: Infinity, resetHour: 0 },
};

// ── globalThis singleton — survives hot-reloads in Turbopack dev ───────────
type Store = Record<string, { date: string; tokens: number }>;

declare const globalThis: { __sentinelTokenStore?: Store } & typeof global;
if (!globalThis.__sentinelTokenStore) globalThis.__sentinelTokenStore = {};

function getStore(): Store { return globalThis.__sentinelTokenStore!; }

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // "2026-07-20"
}

// ── GET — return usage + limits for all providers ─────────────────────────
export async function GET() {
  const store = getStore();
  const today = todayUtc();

  const result: Record<string, {
    provider: string;
    tokensUsed: number;
    tokensAvailable: number;
    dailyLimit: number;
    resetAt: string;
    unlimited: boolean;
  }> = {};

  for (const [id, cfg] of Object.entries(PROVIDER_LIMITS)) {
    const entry = store[id];
    const tokensUsed = entry?.date === today ? entry.tokens : 0;
    const unlimited = cfg.daily === Infinity;
    const now = new Date();
    const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, cfg.resetHour)).toISOString();

    result[id] = {
      provider: id,
      tokensUsed,
      tokensAvailable: unlimited ? Infinity : Math.max(0, cfg.daily - tokensUsed),
      dailyLimit: cfg.daily,
      resetAt,
      unlimited,
    };
  }

  return NextResponse.json(result);
}

// ── POST — increment token counter for a provider ─────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json() as { provider: string; tokens: number };
    const { provider, tokens } = body;
    if (!provider || typeof tokens !== "number") {
      return NextResponse.json({ error: "provider and tokens required" }, { status: 400 });
    }
    const store = getStore();
    const today = todayUtc();
    const prev = store[provider];
    store[provider] = {
      date: today,
      tokens: (prev?.date === today ? prev.tokens : 0) + tokens,
    };
    return NextResponse.json({ ok: true, tokensUsed: store[provider].tokens });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
}
