"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveContextUsage = {
  providerId: string | null;
  modelId: string | null;
  inputTokensUsed: number | null;
  contextWindowTokens: number | null;
  reservedOutputTokens: number | null;
  measuredAtUtc: string | null;
  status: "measured" | "estimated" | "no_run" | "unknown";
};

type SentinelUsageSummary = {
  measuredAtUtc: string;
  today: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number; knownDailyTokenLimit: number | null; limitCoverage: "complete" | "partial" | "unknown"; };
  week: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number; fromUtc: string; toUtc: string; };
  month: { inputTokens: number; outputTokens: number; totalTokens: number; requests: number; fromUtc: string; toUtc: string; };
  dataAvailableSince: string | null;
  activeContext: ActiveContextUsage;
};

type ModelCapabilities = {
  text: boolean; vision: boolean; streaming: boolean;
  nativeTools: boolean; structuredOutput: boolean; reasoning: boolean; embeddings: boolean;
};

type ModelEntry = {
  provider: string; modelId: string; displayName: string; availability: string;
  verifiedFree: boolean; capabilities: ModelCapabilities;
  contextWindow: number | null; maxOutputTokens: number | null;
  rpmLimit: number | null; rdLimit: number | null; tpmLimit: number | null; tpdLimit: number | null;
};

type CapacityProvider = {
  providerId: string; configured: boolean; status: string;
  modelCount: number; freeModelCount: number;
  requestsToday: number; tokensToday: number; blocked: boolean;
  largestContextWindow: number | null; largestOutputLimit: number | null;
  rpmLimit: number | null; rpdLimit: number | null; tpmLimit: number | null; tpdLimit: number | null;
  requestsRemainingToday: number | null; tokensRemainingToday: number | null;
};

type LocalAgent = {
  id: string; name: string; description: string; primarySkill: string;
  supportedTasks: string[]; active: boolean; availableModel: string | null;
  contextWindow: number; speedTier: string; minVramGb: number;
};

type CapacityData = {
  measuredAtUtc: string; freeOnlyPolicy: boolean;
  systemStatus?: "healthy" | "degraded" | "offline";
  systemReady?: boolean;
  readyProviderCount?: number;
  blockedProviderCount?: number;
  ollamaOnline?: boolean;
  activeLocalAgentCount?: number;
  localAgents?: LocalAgent[];
  configuredProviderCount: number; totalFreeModels: number;
  providers: CapacityProvider[];
  profiles: string[];
};

type DiagProvider = {
  id: string; configured: boolean; model: string | null;
  contextWindow: number | null; maxOutputTokens: number | null; streaming: boolean;
};

type DiagData = {
  generatedAt: string;
  providers: DiagProvider[];
  quota: Record<string, { tokensToday: number; requestsToday: number; blocked: boolean }>;
  config: { mode: string; freeOnlyPolicy: boolean };
  availableProfiles: string[];
};

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  bg: "#0D0F14",
  border: "rgba(255,255,255,0.06)",
  gold: "#C9A84C",
  goldDim: "rgba(201,168,76,0.60)",
  white: "#e8edf5",
  muted: "rgba(255,255,255,0.50)",
  dim: "rgba(255,255,255,0.30)",
  track: "rgba(255,255,255,0.07)",
  // NO green / NO red — final palette: black/white/grey/muted-gold only
  active: "#e8edf5",      // READY / ACTIVE → white
  selected: "#C9A84C",    // SELECTED / IMPORTANT → muted gold
  inactive: "rgba(255,255,255,0.30)", // INACTIVE → grey
  warning: "rgba(201,168,76,0.70)",   // WARNING / FAILURE → dim gold
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")}K`;
  return n.toLocaleString("de-DE");
}

function fmtCtx(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function fmtDate(utc: string): string {
  const d = new Date(utc + "T00:00:00Z");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function providerLabel(id: string): string {
  const M: Record<string, string> = {
    groq: "Groq", cerebras: "Cerebras", mistral: "Mistral", cohere: "Cohere",
    anthropic: "Anthropic", openrouter: "OpenRouter", gemini: "Gemini",
    "github-models": "GitHub Models", cloudflare: "Cloudflare",
    huggingface: "HuggingFace", ollama: "Ollama", local: "Local", custom: "Custom",
  };
  return M[id] ?? id;
}

function providerTestId(id: string): string {
  const M: Record<string, string> = {
    groq: "sentinel-provider-groq", gemini: "sentinel-provider-gemini",
    cerebras: "sentinel-provider-cerebras", mistral: "sentinel-provider-mistral",
    cohere: "sentinel-provider-cohere", openrouter: "sentinel-provider-openrouter",
    "github-models": "sentinel-provider-github", cloudflare: "sentinel-provider-cloudflare",
    huggingface: "sentinel-provider-huggingface", ollama: "sentinel-provider-ollama",
  };
  return M[id] ?? `sentinel-provider-${id}`;
}

function shortModelName(id: string): string {
  const M: Record<string, string> = {
    "llama-3.3-70b-versatile": "Llama 3.3 70B",
    "llama-3.3-70b": "Llama 3.3 70B",
    "llama-3.1-8b-instant": "Llama 3.1 8B",
    "mistral-small-latest": "Mistral Small",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini-2.0-flash-exp": "Gemini 2.0 Flash",
    "mistral-7b-instruct:free": "Mistral 7B",
    "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3 70B",
    "mistralai/mistral-7b-instruct:free": "Mistral 7B",
    "meta-llama-3.1-8b-instruct": "Llama 3.1 8B",
  };
  const key = id.replace(/^[^/]*\//, "");
  return M[id] ?? M[key] ?? id.replace(/:free$/, "").replace(/^[^/]*\//, "").split("-").slice(0, 3).join(" ");
}

function dotColor(status: string): string {
  if (status === "ready") return C.active;
  if (status === "rate_limited" || status === "quota_exhausted") return C.warning;
  return "rgba(255,255,255,0.18)";
}

const PROFILES: Record<string, string> = {
  auto_balanced: "Auto",
  maximum_quality: "Best Quality",
  maximum_context: "Large Context",
  maximum_output: "Long Answer",
  privacy_local: "Local Privacy",
};

// ── Mini ring (button only) ───────────────────────────────────────────────────

function MiniRing({ percent, size, strokeWidth, testId }: {
  percent: number | null; size: number; strokeWidth: number; testId?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = percent !== null ? Math.min(100, Math.max(0, percent)) : 0;
  const offset = circ * (1 - pct / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} data-testid={testId} style={{ display: "block", flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.track} strokeWidth={strokeWidth} />
      {percent !== null && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.gold}
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      )}
    </svg>
  );
}

// ── Horizontal progress bar ───────────────────────────────────────────────────

function HBar({ percent }: { percent: number }) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div style={{ height: 3, borderRadius: 2, background: C.track, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 2, background: C.gold,
        transition: "width 400ms ease",
      }} />
    </div>
  );
}

// ── Data hook ─────────────────────────────────────────────────────────────────

type DataState = {
  usage: SentinelUsageSummary | null;
  capacity: CapacityData | null;
  models: ModelEntry[];
  diag: DiagData | null;
  loading: boolean;
  lastUpdated: Date | null;
};

function useUsageData(isOpen: boolean) {
  const [s, setS] = useState<DataState>({ usage: null, capacity: null, models: [], diag: null, loading: false, lastUpdated: null });

  const load = useCallback(async () => {
    setS(p => ({ ...p, loading: true }));
    try {
      const [ur, cr, mr, dr] = await Promise.all([
        fetch("/api/sentinel/usage-summary"),
        fetch("/api/sentinel/capacity"),
        fetch("/api/sentinel/models"),
        fetch("/api/sentinel/diagnostics", { headers: { "x-sentinel-local": "1" } }),
      ]);
      const [usage, cap, mod, diag] = await Promise.all([
        ur.ok ? (ur.json() as Promise<SentinelUsageSummary>) : Promise.resolve(null),
        cr.ok ? (cr.json() as Promise<CapacityData>) : Promise.resolve(null),
        mr.ok ? (mr.json() as Promise<{ models: ModelEntry[] }>) : Promise.resolve(null),
        dr.ok ? (dr.json() as Promise<DiagData>) : Promise.resolve(null),
      ]);
      setS({ usage, capacity: cap, models: (mod?.models ?? []).filter(m => m.verifiedFree), diag, loading: false, lastUpdated: new Date() });
    } catch { setS(p => ({ ...p, loading: false })); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => void load(), isOpen ? 30_000 : 120_000);
    return () => clearInterval(id);
  }, [isOpen, load]);

  const prevOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpen.current) void load();
    prevOpen.current = isOpen;
  }, [isOpen, load]);

  useEffect(() => {
    const h = () => setTimeout(() => void load(), 800);
    window.addEventListener("sentinel-request-complete", h);
    return () => window.removeEventListener("sentinel-request-complete", h);
  }, [load]);

  return { ...s, refresh: load };
}

// ── System Ready Status ───────────────────────────────────────────────────────

function SystemReadySection({ capacity }: { capacity: CapacityData | null }) {
  if (!capacity) return null;

  const status = capacity.systemStatus ?? (capacity.systemReady ? "healthy" : "offline");
  const ready = capacity.readyProviderCount ?? 0;
  const blocked = capacity.blockedProviderCount ?? 0;
  const total = capacity.configuredProviderCount ?? 0;
  const ollamaOnline = capacity.ollamaOnline ?? false;
  const localAgentCount = capacity.activeLocalAgentCount ?? 0;

  const dotCol = status === "healthy" ? C.active : status === "degraded" ? C.warning : C.dim;
  const statusLabel = status === "healthy" ? "Alle Systeme bereit" : status === "degraded" ? "Teilweise verfügbar" : "Keine Provider";

  const configuredProviders = (capacity.providers ?? []).filter(p => p.configured);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Traffic light row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: dotCol,
            boxShadow: `0 0 8px ${dotCol}80`, flexShrink: 0,
            animation: status === "healthy" ? "none" : "sentinel-pulse 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{statusLabel}</span>
        </div>
        {/* Free-only badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(201,168,76,0.08)", border: `1px solid rgba(201,168,76,0.22)`,
          borderRadius: 4, padding: "2px 7px",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold }}>
            Free Only ✓
          </span>
        </div>
      </div>

      {/* Provider grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
        {configuredProviders.map(p => {
          const isBlocked = p.blocked;
          const isReady = p.status === "ready" && !isBlocked;
          const col = isBlocked ? C.warning : isReady ? C.active : C.dim;
          return (
            <div key={p.providerId} style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,0.07)`,
              borderRadius: 4, padding: "3px 7px",
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: col, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: isReady ? C.white : C.dim, fontWeight: isReady ? 600 : 400 }}>
                {providerLabel(p.providerId)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary line */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.muted }}>
          {ready}/{total} bereit{blocked > 0 ? ` · ${blocked} blockiert` : ""}
        </span>
        <span style={{ fontSize: 10, color: ollamaOnline ? C.white : C.dim }}>
          {ollamaOnline
            ? `Ollama · ${localAgentCount} Agent${localAgentCount !== 1 ? "s" : ""} aktiv`
            : "Ollama offline"}
        </span>
      </div>
    </div>
  );
}

// ── Local Agents section ──────────────────────────────────────────────────────

function LocalAgentsSection({ capacity }: { capacity: CapacityData | null }) {
  const [open, setOpen] = useState(false);
  const agents = capacity?.localAgents ?? [];
  if (!agents.length) return null;

  const activeAgents = agents.filter(a => a.active);
  const inactiveAgents = agents.filter(a => !a.active);

  const skillIcon: Record<string, string> = {
    fast_chat: "⚡", code_assistant: "💻", financial_analyst: "📊",
    long_context: "📄", reasoning: "🧠", privacy_vault: "🔒",
    summarizer: "✂️", embedding: "🔢", general: "🤖",
  };

  return (
    <div style={{ marginTop: 2 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", color: C.dim }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em" }}>
          Local Agents {activeAgents.length > 0 ? `(${activeAgents.length} aktiv)` : "(VPS bereit)"}
        </span>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      {open && (
        <div>
          {activeAgents.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {activeAgents.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 14, lineHeight: 1, paddingTop: 1 }}>{skillIcon[a.primarySkill] ?? "🤖"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{a.availableModel}</div>
                  </div>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.active, marginTop: 4, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}

          {inactiveAgents.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Nicht verfügbar (Modell nicht geladen)
              </div>
              {inactiveAgents.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
                  <span style={{ fontSize: 12, opacity: 0.3 }}>{skillIcon[a.primarySkill] ?? "🤖"}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{a.name}</span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginLeft: 6 }}>
                      {a.minVramGb}GB VRAM · {a.speedTier}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Context Window section ────────────────────────────────────────────────────

function ContextWindowSection({
  ctx, diag, resolvedProvider,
}: {
  ctx: ActiveContextUsage;
  diag: DiagData | null;
  resolvedProvider: string | null;
}) {
  const isMeasured = ctx.status === "measured" && ctx.inputTokensUsed !== null && ctx.contextWindowTokens !== null;
  const ctxPct = isMeasured ? (ctx.inputTokensUsed! / ctx.contextWindowTokens!) * 100 : null;

  // Fallback model info from diagnostics when no measured run yet
  const diagProvider = diag?.providers.find(p => p.id === (ctx.providerId ?? resolvedProvider));
  const displayModelId = ctx.modelId ?? diagProvider?.model ?? null;
  const displayCtxWindow = ctx.contextWindowTokens ?? diagProvider?.contextWindow ?? null;
  const displayProvider = ctx.providerId ?? resolvedProvider ?? null;

  return (
    <div data-testid="sentinel-usage-context" style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, marginBottom: 8 }}>
        Context Window
      </div>

      {isMeasured ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 2 }}>
            {fmtNum(ctx.inputTokensUsed!)}
            <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}> / {fmtNum(ctx.contextWindowTokens!)} Tokens</span>
          </div>
          <HBar percent={ctxPct!} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: C.muted }}
              data-testid="sentinel-usage-context-percent">
              {Math.round(ctxPct!)} % genutzt
            </span>
            {ctx.reservedOutputTokens != null && ctx.reservedOutputTokens > 0 && (
              <span style={{ fontSize: 10, color: C.dim }}>Antwort reserviert: {fmtNum(ctx.reservedOutputTokens)}</span>
            )}
          </div>
          {(displayProvider ?? displayModelId) && (
            <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
              {[displayProvider ? providerLabel(displayProvider) : null, displayModelId ? shortModelName(displayModelId) : null].filter(Boolean).join(" · ")}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", marginBottom: 5 }}>
            Noch keine Kontextmessung
          </div>
          {displayModelId && (
            <div style={{ fontSize: 10, color: C.muted }}>
              Aktives Modell: {shortModelName(displayModelId)}
            </div>
          )}
          {displayCtxWindow != null && (
            <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
              Maximal: {fmtCtx(displayCtxWindow)} Tokens
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Advanced details ──────────────────────────────────────────────────────────

function AdvancedDetails({
  capacity, models, diag, resolvedProvider, onProfileChange,
}: {
  capacity: CapacityData | null;
  models: ModelEntry[];
  diag: DiagData | null;
  resolvedProvider: string | null;
  onProfileChange?: (p: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provOpen, setProvOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState("auto_balanced");
  const [modeOpen, setModeOpen] = useState(false);

  const activeDiag = diag?.providers.find(p => p.id === resolvedProvider);
  const activeCapProv = capacity?.providers.find(p => p.providerId === resolvedProvider);
  const activeModels = models.filter(m => m.provider === resolvedProvider);
  const quotaToday = resolvedProvider ? diag?.quota[resolvedProvider] : null;
  const activeStatus = activeCapProv?.status ?? "unknown";
  const activeModel = activeDiag?.model ?? null;

  const rpm = activeModels.find(m => m.rpmLimit !== null)?.rpmLimit ?? null;
  const rpd = activeModels.find(m => m.rdLimit !== null)?.rdLimit ?? null;
  const tpm = activeModels.find(m => m.tpmLimit !== null)?.tpmLimit ?? null;
  const tpd = activeModels.find(m => m.tpdLimit !== null)?.tpdLimit ?? null;
  const reqUsed = quotaToday?.requestsToday ?? (activeCapProv?.requestsToday ?? 0);
  const tokUsed = quotaToday?.tokensToday ?? (activeCapProv?.tokensToday ?? 0);
  const configuredProviders = new Set((capacity?.providers ?? []).filter(p => p.configured).map(p => p.providerId));
  const freeModels = models.filter(m => configuredProviders.has(m.provider));
  const unconfigured = (capacity?.providers ?? []).filter(p => !p.configured);

  function selectProfile(p: string) { setSelectedProfile(p); setModeOpen(false); onProfileChange?.(p); }

  return (
    <div data-testid="sentinel-usage-advanced" style={{ marginTop: 2 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", color: C.dim }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em" }}>Advanced Details</span>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      {open && (
        <div>
          {/* Aktiver Provider */}
          {resolvedProvider && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Aktiv</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor(activeStatus), flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>{providerLabel(resolvedProvider)}</span>
              </div>
              {activeModel && <div style={{ fontSize: 11, color: C.white, marginTop: 2, paddingLeft: 13 }}>{shortModelName(activeModel)}</div>}
              {activeDiag?.contextWindow && (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2, paddingLeft: 13 }}>
                  {fmtCtx(activeDiag.contextWindow)} Context{activeDiag.maxOutputTokens ? ` · ${fmtCtx(activeDiag.maxOutputTokens)} Output` : ""}
                </div>
              )}
            </div>
          )}

          {/* Mode */}
          <div style={{ marginBottom: 12, position: "relative" }}>
            <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Mode</div>
            <button type="button" onClick={() => setModeOpen(o => !o)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", cursor: "pointer", color: C.white, fontSize: 11, fontWeight: 600 }}>
              <span>{PROFILES[selectedProfile] ?? "Auto"}</span>
              <ChevronDown size={10} color={C.dim} />
            </button>
            {modeOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, background: "#111316", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.60)" }}>
                {Object.entries(PROFILES).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => selectProfile(key)}
                    style={{ width: "100%", background: "none", border: "none", padding: "7px 10px", cursor: "pointer", textAlign: "left", fontSize: 11, color: key === selectedProfile ? C.gold : C.muted, fontWeight: key === selectedProfile ? 700 : 400, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                    {label}
                    {key === selectedProfile && <span style={{ fontSize: 10, color: C.gold }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Provider Quoten — clearly labeled as quotas, not consumption */}
          {resolvedProvider && (rpm !== null || rpd !== null || tpm !== null || tpd !== null) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                Providerquoten — {providerLabel(resolvedProvider)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
                {rpm !== null && <AdvRow label="RPM" value={`${fmtNum(rpm)} req/min`} />}
                {rpd !== null && <AdvRow label="RPD" value={`${reqUsed > 0 ? `${fmtNum(reqUsed)} / ` : ""}${fmtNum(rpd)} req/day`} />}
                {tpm !== null && <AdvRow label="TPM" value={`${fmtNum(tpm)} tok/min`} />}
                {tpd !== null && <AdvRow label="TPD" value={`${tokUsed > 0 ? `${fmtNum(tokUsed)} / ` : ""}${fmtNum(tpd)} tok/day`} />}
              </div>
            </div>
          )}

          {/* Capabilities */}
          {activeDiag && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Capabilities</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
                <AdvRow label="Streaming" value={activeDiag.streaming ? "Ready" : "No"} />
                <AdvRow label="Tool Calling" value={activeModels.some(m => m.capabilities.nativeTools) ? "Ready" : "—"} />
                <AdvRow label="Vision" value={activeModels.some(m => m.capabilities.vision) ? "Ready" : "—"} />
                <AdvRow label="Free verified" value="Yes ✓" />
              </div>
            </div>
          )}

          {/* Models */}
          {freeModels.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Modelle</div>
              {freeModels.slice(0, 8).map(m => {
                const isActive = activeDiag?.model === m.modelId && m.provider === resolvedProvider;
                return (
                  <div key={`${m.provider}-${m.modelId}`} data-testid={providerTestId(m.provider)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: isActive ? C.gold : "rgba(255,255,255,0.25)", display: "inline-block" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? C.gold : C.white }}>{shortModelName(m.modelId)}</div>
                      <div style={{ fontSize: 9, color: C.dim }}>{providerLabel(m.provider)}{m.contextWindow ? ` · ${fmtCtx(m.contextWindow)}` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* All providers */}
          <div style={{ marginBottom: 8 }}>
            <button type="button" onClick={() => setProvOpen(o => !o)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 4px", color: C.dim }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>All providers</span>
              {provOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
            {provOpen && (
              <div>
                {(capacity?.providers ?? []).filter(p => p.configured && p.freeModelCount > 0).map(p => (
                  <div key={p.providerId} data-testid={providerTestId(p.providerId)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 10, color: p.providerId === resolvedProvider ? C.gold : C.muted, fontWeight: p.providerId === resolvedProvider ? 700 : 400 }}>
                      {providerLabel(p.providerId)}
                    </span>
                    <span style={{ fontSize: 9, color: C.dim }}>{p.freeModelCount} free · {fmtCtx(p.largestContextWindow)} ctx</span>
                  </div>
                ))}
                {unconfigured.length > 0 && (
                  <div style={{ marginTop: 5 }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontWeight: 600, marginBottom: 3 }}>Not configured ({unconfigured.length})</div>
                    {unconfigured.map(p => (
                      <div key={p.providerId} style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", padding: "2px 0" }}>{providerLabel(p.providerId)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdvRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 10, color: C.dim }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.muted }}>{value}</span>
    </div>
  );
}

// ── Panel content ─────────────────────────────────────────────────────────────

function PanelContent({
  usage, capacity, models, diag, loading, lastUpdated, refresh, resolvedProvider, onProfileChange, onClose,
}: {
  usage: SentinelUsageSummary | null;
  capacity: CapacityData | null;
  models: ModelEntry[];
  diag: DiagData | null;
  loading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
  resolvedProvider: string | null;
  onProfileChange?: (p: string) => void;
  onClose: () => void;
}) {
  const today = usage?.today;
  const week = usage?.week;
  const month = usage?.month;
  const ctx = usage?.activeContext ?? { status: "no_run", providerId: null, modelId: null, inputTokensUsed: null, contextWindowTokens: null, reservedOutputTokens: null, measuredAtUtc: null };
  const dataAvailableSince = usage?.dataAvailableSince ?? null;

  const todayTotal = today?.totalTokens ?? 0;
  const dayLimit = today?.knownDailyTokenLimit ?? null;
  const coverage = today?.limitCoverage ?? "unknown";
  const todayPct = (dayLimit !== null && dayLimit > 0) ? (todayTotal / dayLimit) * 100 : null;

  // Ring button pct — only show fill if verified token quota known
  const ringPct = coverage !== "unknown" && dayLimit !== null && dayLimit > 0
    ? (todayTotal / dayLimit) * 100 : null;

  const weekStart = week?.fromUtc ?? null;
  const monthStart = month?.fromUtc ?? null;
  const weekIsPartial = dataAvailableSince !== null && weekStart !== null && dataAvailableSince > weekStart;
  const monthIsPartial = dataAvailableSince !== null && monthStart !== null && dataAvailableSince > monthStart;

  return (
    <div data-testid="sentinel-usage-panel" style={{
      background: C.bg, fontFamily: "var(--font-text, system-ui, sans-serif)",
      fontSize: 13, color: C.white,
    }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10, background: C.bg,
        padding: "11px 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", color: C.white, fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)" }}>
            Sentinel Usage
          </div>
          <div style={{ fontSize: 10, color: C.goldDim, marginTop: 1 }}>Free cloud models</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {lastUpdated && (
            <span style={{ fontSize: 9, color: C.dim, marginRight: 4 }}>
              {lastUpdated.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" data-testid="sentinel-usage-refresh" onClick={refresh} disabled={loading} title="Refresh"
            style={{ background: "none", border: "none", padding: 5, cursor: loading ? "default" : "pointer", color: loading ? C.dim : C.muted, display: "flex", alignItems: "center" }}>
            <RefreshCw size={11} style={{ animation: loading ? "sentinel-spin 1s linear infinite" : "none" }} />
          </button>
          <button type="button" data-testid="sentinel-usage-close" onClick={onClose} title="Close"
            style={{ background: "none", border: "none", padding: 5, cursor: "pointer", color: C.muted, display: "flex", alignItems: "center" }}>
            <X size={11} />
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 14px 14px" }}>

        {/* ── 0. SYSTEM READY STATUS ── */}
        <SystemReadySection capacity={capacity} />

        <div style={{ height: 1, background: C.border, margin: "0 0 14px" }} />

        {/* ── 1. CONTEXT WINDOW (ganz oben) ── */}
        <ContextWindowSection ctx={ctx} diag={diag} resolvedProvider={resolvedProvider} />

        <div style={{ height: 1, background: C.border, margin: "14px 0" }} />

        {/* ── 2. HEUTE — echter gemessener Verbrauch ── */}
        <div data-testid="sentinel-usage-today" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, marginBottom: 7 }}>
            Heute
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>
            {fmtNum(todayTotal)} Tokens
          </div>
          {(today?.requests ?? 0) > 0 && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              {fmtNum(today!.requests)} Requests
            </div>
          )}
          {/* Bar only when verified token quota known */}
          {todayPct !== null && dayLimit !== null && (
            <div style={{ marginTop: 8 }}>
              <HBar percent={todayPct} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: C.muted }}>
                  von {fmtNum(dayLimit)} bestätigten Tokens
                </span>
                {coverage === "partial" && (
                  <span style={{ fontSize: 10, color: C.dim }}>teilweise bekannt</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 1, background: C.border, margin: "0 0 14px" }} />

        {/* ── 3. DIESE WOCHE — echte Events, kein Quota×7 ── */}
        <div data-testid="sentinel-usage-week" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, marginBottom: 7 }}>
            Diese Woche
          </div>
          {week ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{fmtNum(week.totalTokens)} Tokens</div>
              {week.requests > 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{fmtNum(week.requests)} Requests</div>
              )}
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                {fmtDate(week.fromUtc)} – heute
                {weekIsPartial && dataAvailableSince && (
                  <span style={{ marginLeft: 6 }}>· Messdaten seit {fmtDate(dataAvailableSince)}</span>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>Keine Daten</div>
          )}
        </div>

        <div style={{ height: 1, background: C.border, margin: "0 0 14px" }} />

        {/* ── 4. DIESER MONAT — echte Events, kein Quota×30 ── */}
        <div data-testid="sentinel-usage-month" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, marginBottom: 7 }}>
            Dieser Monat
          </div>
          {month ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{fmtNum(month.totalTokens)} Tokens</div>
              {month.requests > 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{fmtNum(month.requests)} Requests</div>
              )}
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                {fmtDate(month.fromUtc)} – heute
                {monthIsPartial && dataAvailableSince && (
                  <span style={{ marginLeft: 6 }}>· Messdaten teilweise verfügbar</span>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>Keine Daten</div>
          )}
        </div>

        <div style={{ height: 1, background: C.border, margin: "0 0 4px" }} />

        {/* ── Advanced Details ── */}
        <AdvancedDetails
          capacity={capacity} models={models} diag={diag}
          resolvedProvider={resolvedProvider} onProfileChange={onProfileChange}
        />

        {/* ── Local Agents ── */}
        <LocalAgentsSection capacity={capacity} />
      </div>

      <style>{`
        @keyframes sentinel-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes sentinel-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

type Props = {
  activeProvider: string | null;
  onProfileChange?: (profile: string) => void;
};

export function SentinelCapacityPanel({ activeProvider, onProfileChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState({ bottom: 64, right: 16 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { usage, capacity, models, diag, loading, lastUpdated, refresh } = useUsageData(isOpen);

  useEffect(() => { setMounted(true); }, []);

  const resolvedProvider = activeProvider
    ?? capacity?.providers.find(p => p.status === "ready" && p.freeModelCount > 0)?.providerId
    ?? null;

  // Ring: only show fill when verified daily token quota is known
  const today = usage?.today ?? null;
  const dayLimit = today?.knownDailyTokenLimit ?? null;
  const coverage = today?.limitCoverage ?? "unknown";
  const todayTotal = today?.totalTokens ?? 0;
  const ringPct = coverage !== "unknown" && dayLimit !== null && dayLimit > 0
    ? (todayTotal / dayLimit) * 100 : null;

  function open() {
    const rect = buttonRef.current?.getBoundingClientRect();
    const mobile = window.innerWidth < 640;
    setIsMobile(mobile);
    if (!mobile && rect) setPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
    setIsOpen(true);
  }
  function close() { setIsOpen(false); }

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const tid = setTimeout(() => {
      window.addEventListener("mousedown", h); window.addEventListener("touchstart", h);
    }, 80);
    return () => { clearTimeout(tid); window.removeEventListener("mousedown", h); window.removeEventListener("touchstart", h); };
  }, [isOpen]);

  const panelStyle: React.CSSProperties = isMobile
    ? { position: "fixed", bottom: 0, left: 0, right: 0, width: "100%", maxHeight: "85vh", borderRadius: "12px 12px 0 0" }
    : { position: "fixed", bottom: pos.bottom, right: Math.max(8, pos.right), width: Math.min(380, window.innerWidth - 16), maxHeight: "70vh", borderRadius: 12 };

  const panel = isOpen && (
    <div ref={panelRef} style={{ ...panelStyle, zIndex: 9999, border: `1px solid ${C.border}`, boxShadow: "0 16px 48px rgba(0,0,0,0.80)", overflowY: "auto", overflowX: "hidden", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
      <PanelContent
        usage={usage} capacity={capacity} models={models} diag={diag}
        loading={loading} lastUpdated={lastUpdated}
        refresh={() => void refresh()}
        resolvedProvider={resolvedProvider}
        onProfileChange={onProfileChange}
        onClose={close}
      />
    </div>
  );

  // Tooltip text for the ring button
  const tooltipLines = [
    `Heute: ${fmtNum(todayTotal)} Tokens`,
    today?.requests ? `${fmtNum(today.requests)} Requests` : null,
    coverage === "unknown" ? "Gesamtquote unbekannt" : coverage === "partial" ? "Gesamtquote teilweise bekannt" : null,
  ].filter(Boolean).join("\n");

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        data-testid="sentinel-usage-ring-button"
        onClick={isOpen ? close : open}
        aria-label="Sentinel Usage"
        title={tooltipLines}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
          opacity: isOpen ? 0.7 : 1,
          transition: "opacity 130ms ease",
        }}
      >
        <MiniRing
          percent={ringPct}
          size={18}
          strokeWidth={2}
          testId="sentinel-usage-ring-percent"
        />
      </button>

      {mounted && createPortal(panel, document.body)}
    </div>
  );
}
