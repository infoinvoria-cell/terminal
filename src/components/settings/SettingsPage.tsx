"use client";

import { useEffect, useState } from "react";
import type { SentinelStatusPayload } from "@/lib/sentinel/sentinel-session-store";

// ── Types ──────────────────────────────────────────────────────────────────────

type CommitEntry = { hash: string; message: string; date: string };
type InfoPayload = {
  version: string;
  branch: string;
  commits: CommitEntry[];
  nextVersion: string;
  nodeVersion: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const LANG_KEY = "fmd_settings_lang";
const PREF_PROVIDER_KEY = "fmd_settings_preferred_provider";

function lsGet<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const v = window.localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="st-section">
      <h2 className="st-section-title">{title}</h2>
      {children}
    </section>
  );
}

// ── Provider card ─────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { envKey: string; defaultModel: string }> = {
  local:     { envKey: "OLLAMA_BASE_URL / OLLAMA_MODEL",          defaultModel: "llama3.2" },
  ollama:    { envKey: "OLLAMA_BASE_URL / OLLAMA_MODEL",          defaultModel: "llama3.2" },
  groq:      { envKey: "GROQ_API_KEY",                            defaultModel: "llama-3.3-70b-versatile" },
  anthropic: { envKey: "ANTHROPIC_API_KEY",                       defaultModel: "claude-opus-4-8" },
  custom:    { envKey: "CUSTOM_CHAT_API_URL / CUSTOM_CHAT_MODEL", defaultModel: "—" },
};

function statusDot(usable: boolean, available: boolean, reason: string) {
  if (usable) return "#5dd39e";
  if (reason === "key_missing" || reason === "endpoint_missing") return "#C9A84C";
  return "#ff7b86";
}

function statusLabel(usable: boolean, available: boolean, reason: string) {
  if (usable) return "ready";
  if (reason === "key_missing") return "key missing";
  if (reason === "endpoint_missing") return "not configured";
  if (reason === "disabled") return "disabled";
  if (reason === "offline") return "offline";
  return reason;
}

function ProviderCard({
  p,
  preferred,
  onSetPreferred,
}: {
  p: SentinelStatusPayload["providers"][number];
  preferred: string;
  onSetPreferred: (id: string) => void;
}) {
  const meta = PROVIDER_META[p.id] ?? { envKey: "—", defaultModel: "—" };
  const dot = statusDot(p.usable, p.available, p.reason);
  const label = statusLabel(p.usable, p.available, p.reason);
  const isPreferred = preferred === p.id;
  return (
    <div className={`st-provider-card${p.active ? " st-provider-active" : ""}${isPreferred ? " st-provider-preferred" : ""}`}>
      <div className="st-provider-head">
        <span className="st-dot" style={{ background: dot }} />
        <span className="st-provider-label">{p.label}</span>
        <span className="st-provider-status">{label}</span>
        {p.active && <span className="st-chip st-chip-gold">aktiv</span>}
        {isPreferred && !p.active && <span className="st-chip st-chip-dim">bevorzugt</span>}
      </div>
      <div className="st-provider-row">
        <span className="st-key">Modell</span>
        <span className="st-val">{p.model ?? meta.defaultModel}</span>
      </div>
      <div className="st-provider-row">
        <span className="st-key">Env</span>
        <code className="st-code">{meta.envKey}</code>
      </div>
      <button
        type="button"
        className={`st-prefer-btn${isPreferred ? " st-prefer-btn-active" : ""}`}
        onClick={() => onSetPreferred(isPreferred ? "" : p.id)}
      >
        {isPreferred ? "Bevorzugung entfernen" : "Als bevorzugt setzen"}
      </button>
    </div>
  );
}

// ── Commit row ────────────────────────────────────────────────────────────────

function CommitRow({ c }: { c: CommitEntry }) {
  const isFeature = c.message.startsWith("feat:");
  const isFix = c.message.startsWith("fix:");
  const tagColor = isFeature ? "#5dd39e" : isFix ? "#C9A84C" : "rgba(255,255,255,0.25)";
  const tag = isFeature ? "feat" : isFix ? "fix" : "chg";
  const body = c.message.replace(/^(feat|fix|chore|refactor|docs|style|test|perf|ci|build|revert):\s*/i, "");
  return (
    <div className="st-commit">
      <span className="st-commit-hash">{c.hash}</span>
      <span className="st-commit-tag" style={{ color: tagColor, borderColor: tagColor }}>{tag}</span>
      <span className="st-commit-msg">{body}</span>
      <span className="st-commit-date">{c.date}</span>
    </div>
  );
}

// ── Language selector ─────────────────────────────────────────────────────────

function LangOption({ value, label, current, onSelect }: { value: string; label: string; current: string; onSelect: (v: string) => void }) {
  const active = current === value;
  return (
    <button
      type="button"
      className={`st-lang-btn${active ? " st-lang-btn-active" : ""}`}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

// ── Connect Setup types ───────────────────────────────────────────────────────

type ConnectProvider = {
  id: string; label: string; configured: boolean; healthy: boolean;
  reason: string; model: string | null; quotaBlocked: boolean;
  requestsToday: number; blockedUntil: string | null;
};
type ConnectProvidersPayload = {
  providers: ConnectProvider[];
  brain: { available: boolean; cacheAgeMs: number; cacheValid: boolean };
  graphify: { available: boolean; nodeCount: number; linkCount: number };
  todayStats: { totalRuns: number; localRuns: number; remoteRuns: number; ensembleRuns: number };
};

function ConnectStatusDot({ configured, healthy, quotaBlocked }: { configured: boolean; healthy: boolean; quotaBlocked: boolean }) {
  const color = !configured ? "#C9A84C" : quotaBlocked ? "#ff7b86" : healthy ? "#5dd39e" : "#ff7b86";
  return <span className="st-dot" style={{ background: color }} />;
}

function ConnectSetupSection({ data }: { data: ConnectProvidersPayload | null }) {
  if (!data) return <div className="st-loading">Connect-Status wird geladen…</div>;

  const { providers, brain, graphify, todayStats } = data;
  const configured = providers.filter((p) => p.configured);
  const healthy = providers.filter((p) => p.healthy);

  return (
    <>
      <p className="st-desc">
        Sentinel Connect — lokaler Qwen-Layer 1 Router (Ollama) + Multi-Provider Orchestration.
        Konfiguration via <code className="st-code">.env.local</code>. Alle Keys sind server-only.
      </p>

      {/* Stats row */}
      <div className="st-connect-stats">
        <div className="st-connect-stat">
          <span className="st-connect-stat-val">{configured.length}</span>
          <span className="st-connect-stat-key">konfiguriert</span>
        </div>
        <div className="st-connect-stat">
          <span className="st-connect-stat-val">{healthy.length}</span>
          <span className="st-connect-stat-key">bereit</span>
        </div>
        <div className="st-connect-stat">
          <span className="st-connect-stat-val">{todayStats?.totalRuns ?? 0}</span>
          <span className="st-connect-stat-key">runs heute</span>
        </div>
        <div className="st-connect-stat">
          <span className="st-connect-stat-val">{todayStats?.localRuns ?? 0}</span>
          <span className="st-connect-stat-key">lokal</span>
        </div>
      </div>

      {/* Provider grid */}
      <div className="st-connect-provider-grid">
        {providers.map((p) => (
          <div key={p.id} className={`st-connect-provider${p.healthy ? " st-connect-provider-ready" : ""}`}>
            <div className="st-provider-head">
              <ConnectStatusDot configured={p.configured} healthy={p.healthy} quotaBlocked={p.quotaBlocked} />
              <span className="st-provider-label">{p.label}</span>
              <span className="st-provider-status">
                {!p.configured ? "key missing" : p.quotaBlocked ? "quota blocked" : p.healthy ? "ready" : p.reason}
              </span>
            </div>
            {p.model && (
              <div className="st-provider-row">
                <span className="st-key">Modell</span>
                <span className="st-val" style={{ fontFamily: "monospace", fontSize: 10 }}>{p.model}</span>
              </div>
            )}
            {p.requestsToday > 0 && (
              <div className="st-provider-row">
                <span className="st-key">Heute</span>
                <span className="st-val">{p.requestsToday} req</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Brain + Graphify */}
      <div className="st-connect-infra">
        <div className="st-connect-infra-row">
          <span className="st-dot" style={{ background: brain.available ? "#5dd39e" : "#ff7b86" }} />
          <span className="st-key">Brain</span>
          <span className="st-val">{brain.available ? (brain.cacheValid ? "Cache gültig" : "Cache abgelaufen") : "nicht verfügbar"}</span>
        </div>
        <div className="st-connect-infra-row">
          <span className="st-dot" style={{ background: graphify.available ? "#5dd39e" : "#C9A84C" }} />
          <span className="st-key">Graphify</span>
          <span className="st-val">{graphify.available ? `${graphify.nodeCount} nodes, ${graphify.linkCount} links` : "kein Index"}</span>
        </div>
      </div>

      <div className="st-envhint">
        <span className="st-envhint-title">Connect .env.local Keys</span>
        <pre className="st-pre">{[
          "GROQ_API_KEY=...",
          "MISTRAL_API_KEY=...",
          "COHERE_API_KEY=...",
          "CEREBRAS_API_KEY=...",
          "OLLAMA_API_URL=http://localhost:11434  # Qwen Layer 1",
          "# SENTINEL_ALLOW_PAID_API=true         # paid inference (off by default)",
        ].join("\n")}</pre>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<SentinelStatusPayload | null>(null);
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const [lang, setLangState] = useState("de");
  const [preferred, setPreferredState] = useState("");
  const [connectData, setConnectData] = useState<ConnectProvidersPayload | null>(null);

  useEffect(() => {
    setMounted(true);
    setLangState(lsGet(LANG_KEY, "de"));
    setPreferredState(lsGet(PREF_PROVIDER_KEY, ""));
    fetch("/api/sentinel/status").then((r) => r.json()).then(setStatus).catch(() => null);
    fetch("/api/settings/info").then((r) => r.json()).then(setInfo).catch(() => null);
    fetch("/api/sentinel/connect/providers").then((r) => r.json()).then(setConnectData).catch(() => null);
  }, []);

  const setLang = (v: string) => { setLangState(v); lsSet(LANG_KEY, v); };
  const setPreferred = (v: string) => { setPreferredState(v); lsSet(PREF_PROVIDER_KEY, v); };

  const providers = status?.providers ?? [];

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Page header */}
          <div className="st-page-head">
            <h1 className="st-page-title">Settings</h1>
            <p className="st-page-sub">Terminal-Konfiguration — lokal und privat</p>
          </div>

          <div className="st-content">

            {/* ── KI ── */}
            <Section title="KI">
              <p className="st-desc">
                API-Keys werden in <code className="st-code">.env.local</code> gesetzt und sind nie im Repo.
                Preferred Provider wird lokal gespeichert (localStorage) und hat keine Auswirkung auf Env-Konfiguration.
              </p>
              {!mounted || !status ? (
                <div className="st-loading">Provider-Status wird geladen…</div>
              ) : (
                <>
                  <div className="st-provider-grid">
                    {providers.map((p) => (
                      <ProviderCard key={p.id} p={p} preferred={preferred} onSetPreferred={setPreferred} />
                    ))}
                  </div>
                  {status.activeProvider && (
                    <div className="st-active-row">
                      <span className="st-key">Aktiver Provider</span>
                      <span className="st-chip st-chip-gold">{status.activeProvider}</span>
                      <span className="st-key" style={{ marginLeft: 16 }}>Mode</span>
                      <span className="st-chip st-chip-dim">{status.mode}</span>
                    </div>
                  )}
                  <div className="st-envhint">
                    <span className="st-envhint-title">Env-Variablen (.env.local)</span>
                    <pre className="st-pre">{[
                      "GROQ_API_KEY=...",
                      "ANTHROPIC_KEY=...",
                      "OLLAMA_BASE_URL=http://localhost:11434",
                      "OLLAMA_MODEL=llama3.2",
                      "SENTINEL_ALLOW_PAID_API=true",
                    ].join("\n")}</pre>
                  </div>
                </>
              )}
            </Section>

            {/* ── Sentinel Connect ── */}
            <Section title="Sentinel Connect">
              {!mounted ? (
                <div className="st-loading">Connect-Status wird geladen…</div>
              ) : (
                <ConnectSetupSection data={connectData} />
              )}
            </Section>

            {/* ── Versionen ── */}
            <Section title="Versionen">
              {!mounted || !info ? (
                <div className="st-loading">Version wird geladen…</div>
              ) : (
                <>
                  <div className="st-version-grid">
                    <div className="st-vrow"><span className="st-key">Terminal</span><span className="st-chip st-chip-gold">v{info.version}</span></div>
                    <div className="st-vrow"><span className="st-key">Branch</span><code className="st-code">{info.branch}</code></div>
                    <div className="st-vrow"><span className="st-key">Next.js</span><code className="st-code">{info.nextVersion}</code></div>
                    <div className="st-vrow"><span className="st-key">Node</span><code className="st-code">{info.nodeVersion}</code></div>
                  </div>
                  <div className="st-commits-head">Letzte Commits</div>
                  <div className="st-commits">
                    {info.commits.length > 0
                      ? info.commits.map((c) => <CommitRow key={c.hash} c={c} />)
                      : <span className="st-loading">Kein Git-Zugriff</span>}
                  </div>
                </>
              )}
            </Section>

            {/* ── Allgemein ── */}
            <Section title="Allgemein">
              <div className="st-general-grid">
                <div className="st-general-row">
                  <span className="st-key">Sprache</span>
                  <div className="st-lang-group">
                    <LangOption value="de" label="Deutsch" current={lang} onSelect={setLang} />
                    <LangOption value="en" label="English" current={lang} onSelect={setLang} />
                  </div>
                </div>
                <div className="st-general-row">
                  <span className="st-key">Theme</span>
                  <span className="st-chip st-chip-dim">Dark (only)</span>
                </div>
                <div className="st-general-row">
                  <span className="st-key">Brain Path</span>
                  <code className="st-code" style={{ fontSize: 10, opacity: 0.7 }}>
                    {typeof window !== "undefined" ? "via CAPITALIFE_BRAIN_PATH (server-side)" : "—"}
                  </code>
                </div>
              </div>
            </Section>

          </div>
      </main>

      <style jsx>{`
        /* Layout */
        .st-page-head {
          flex: 0 0 auto;
          padding: 32px 40px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .st-page-title {
          font-size: 26px;
          font-weight: 600;
          color: #f5f5f7;
          letter-spacing: -0.02em;
          margin: 0;
          font-family: var(--font-text);
        }
        .st-page-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          margin: 4px 0 0;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          font-family: var(--font-text);
        }
        .st-content {
          padding: 32px 40px 60px;
          display: flex;
          flex-direction: column;
          gap: 48px;
          max-width: 860px;
        }
        /* Section */
        .st-section { display: flex; flex-direction: column; gap: 16px; }
        .st-section-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(214,184,108,0.75);
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(214,184,108,0.12);
          font-family: var(--font-text);
        }
        .st-desc { font-size: 12px; color: rgba(255,255,255,0.4); line-height: 1.6; margin: 0; }
        .st-loading { font-size: 12px; color: rgba(255,255,255,0.25); }
        /* Provider grid */
        .st-provider-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
        }
        .st-provider-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: border-color 0.2s;
        }
        .st-provider-active { border-color: rgba(214,184,108,0.28); background: rgba(214,184,108,0.04); }
        .st-provider-preferred { border-color: rgba(93,211,158,0.22); }
        .st-provider-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .st-dot { width: 7px; height: 7px; border-radius: 999px; flex: 0 0 auto; }
        .st-provider-label { font-size: 13px; font-weight: 600; color: #e8eaed; }
        .st-provider-status { font-size: 10.5px; color: rgba(255,255,255,0.35); margin-left: auto; }
        .st-provider-row { display: flex; align-items: center; gap: 8px; }
        .st-prefer-btn {
          margin-top: 4px;
          align-self: flex-start;
          background: none;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: rgba(255,255,255,0.35);
          font-size: 10.5px;
          padding: 3px 10px;
          cursor: pointer;
          font-family: inherit;
          transition: color 0.15s, border-color 0.15s;
        }
        .st-prefer-btn:hover { color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.25); }
        .st-prefer-btn-active { color: #5dd39e; border-color: rgba(93,211,158,0.3); }
        /* Active row */
        .st-active-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        /* Env hint */
        .st-envhint {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 14px 16px;
        }
        .st-envhint-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.3); display: block; margin-bottom: 8px; }
        .st-pre {
          margin: 0;
          font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
          font-size: 11.5px;
          color: rgba(214,184,108,0.75);
          line-height: 1.7;
          white-space: pre;
        }
        /* Versions */
        .st-version-grid { display: flex; flex-direction: column; gap: 10px; }
        .st-vrow { display: flex; align-items: center; gap: 10px; }
        /* Commits */
        .st-commits-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.3); margin-top: 8px; }
        .st-commits { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .st-commit { display: flex; align-items: center; gap: 10px; font-size: 12px; }
        .st-commit-hash { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; color: rgba(255,255,255,0.25); flex: 0 0 auto; }
        .st-commit-tag { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 1px 6px; border: 1px solid; border-radius: 4px; flex: 0 0 auto; }
        .st-commit-msg { color: rgba(255,255,255,0.7); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .st-commit-date { font-size: 10.5px; color: rgba(255,255,255,0.25); flex: 0 0 auto; }
        /* Allgemein */
        .st-general-grid { display: flex; flex-direction: column; gap: 14px; }
        .st-general-row { display: flex; align-items: center; gap: 12px; }
        .st-lang-group { display: flex; gap: 6px; }
        .st-lang-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: rgba(255,255,255,0.45);
          font-size: 12px;
          padding: 5px 14px;
          cursor: pointer;
          font-family: inherit;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .st-lang-btn:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.22); }
        .st-lang-btn-active { color: #f3ead2; border-color: rgba(214,184,108,0.4); background: rgba(214,184,108,0.07); }
        /* Shared */
        .st-key { font-size: 11.5px; color: rgba(255,255,255,0.35); flex: 0 0 auto; }
        .st-val { font-size: 12px; color: rgba(255,255,255,0.75); }
        .st-code {
          font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
          font-size: 11px;
          color: #C9A84C;
          background: rgba(226,202,122,0.08);
          border: 1px solid rgba(226,202,122,0.12);
          border-radius: 4px;
          padding: 1px 6px;
        }
        .st-chip {
          display: inline-flex;
          align-items: center;
          font-size: 10.5px;
          font-weight: 600;
          padding: 2px 9px;
          border-radius: 999px;
          letter-spacing: 0.03em;
        }
        .st-chip-gold { background: rgba(214,184,108,0.12); color: #C9A84C; border: 1px solid rgba(214,184,108,0.25); }
        .st-chip-dim  { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.1); }
        /* Connect Setup */
        .st-connect-stats {
          display: flex; gap: 16px; flex-wrap: wrap;
        }
        .st-connect-stat {
          display: flex; flex-direction: column; align-items: center;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px; padding: 10px 18px; min-width: 70px;
        }
        .st-connect-stat-val { font-size: 22px; font-weight: 700; color: #e8eaed; line-height: 1; }
        .st-connect-stat-key { font-size: 9.5px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }
        .st-connect-provider-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;
        }
        .st-connect-provider {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
        }
        .st-connect-provider-ready { border-color: rgba(93,211,158,0.15); }
        .st-connect-infra { display: flex; flex-direction: column; gap: 8px; }
        .st-connect-infra-row { display: flex; align-items: center; gap: 8px; }
      `}</style>
    </>
  );
}
