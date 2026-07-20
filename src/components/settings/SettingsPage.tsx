"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { swrJsonFetcher } from "@/components/performance/swr-fetcher";
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
  if (reason === "key_missing" || reason === "endpoint_missing") return "#e2ca7a";
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
  const tagColor = isFeature ? "#5dd39e" : isFix ? "#e2ca7a" : "rgba(255,255,255,0.25)";
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

export function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [lang, setLangState] = useState("de");
  const [preferred, setPreferredState] = useState("");
  const { data: status } = useSWR<SentinelStatusPayload>("/api/sentinel/status", swrJsonFetcher, {
    refreshInterval: 20_000,
    keepPreviousData: true,
  });
  const { data: info } = useSWR<InfoPayload>("/api/settings/info", swrJsonFetcher, {
    keepPreviousData: true,
  });

  useEffect(() => {
    setMounted(true);
    setLangState(lsGet(LANG_KEY, "de"));
    setPreferredState(lsGet(PREF_PROVIDER_KEY, ""));
  }, []);

  const setLang = (v: string) => { setLangState(v); lsSet(LANG_KEY, v); };
  const setPreferred = (v: string) => { setPreferredState(v); lsSet(PREF_PROVIDER_KEY, v); };

  const providers = status?.providers ?? [];

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#07080a]">
        <Sidebar />
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
      </div>

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
          font-family: var(--font-montserrat, sans-serif);
        }
        .st-page-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          margin: 4px 0 0;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          font-family: var(--font-montserrat, sans-serif);
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
          font-family: var(--font-montserrat, sans-serif);
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
          color: #e2ca7a;
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
        .st-chip-gold { background: rgba(214,184,108,0.12); color: #e2ca7a; border: 1px solid rgba(214,184,108,0.25); }
        .st-chip-dim  { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.1); }
      `}</style>
    </HomeDashboardProvider>
  );
}
