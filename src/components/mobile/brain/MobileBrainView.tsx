"use client";
import { useEffect, useRef, useState } from "react";

const GOLD = "#C9A84C";
const CARD_BG = "#1F1F1F";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.42)";

type BrainStatus = {
  available: boolean;
  pathConfigured: boolean;
  brainFile: boolean;
  snapshotFile: boolean;
};

type BrainNetwork = {
  nodes: { id: string }[];
  links: { source: string; target: string }[];
  source?: string;
};

type SearchResult = {
  query: string;
  graph: { nodeCount: number; summary: string; tokenEstimate: number };
  brain: { resultCount: number; results: { file: string; snippet: string; score: number }[] };
  brainAvailable?: boolean;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ flex: 1, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, lineHeight: 1.1, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function GlobeSpinner({ size = 120 }: { size?: number }) {
  const r = size / 2;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <style>{`
        @keyframes globe-cw  { to { transform: rotateY(360deg)  } }
        @keyframes globe-ccw { to { transform: rotateX(360deg)  } }
        .clife-globe-shell { position:absolute;inset:0;border-radius:50%;border:1.5px solid ${GOLD}38;background:radial-gradient(circle at 35% 35%,${GOLD}18 0%,transparent 70%),${CARD_BG} }
        .clife-globe-ring  { position:absolute;inset:0;border-radius:50% }
        .clife-globe-ring-h{ animation:globe-cw  6s linear infinite }
        .clife-globe-ring-v{ animation:globe-ccw 9s linear infinite;transform-origin:center }
        .clife-globe-dot   { position:absolute;border-radius:50%;background:${GOLD};animation:globe-cw 4s linear infinite;transform-origin:${r}px ${r}px }
      `}</style>
      <div className="clife-globe-shell" />
      <div className="clife-globe-ring clife-globe-ring-h" style={{ border: `1.5px solid ${GOLD}50` }} />
      <div className="clife-globe-ring clife-globe-ring-v" style={{ border: `1.5px solid ${GOLD}40` }} />
      <div className="clife-globe-dot" style={{ width: 6, height: 6, top: r - 3, left: r - 3 + (r - 8) }} />
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  const dot = ok ? "#22C55E" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: `1px solid ${CARD_BORDER}` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0, display: "inline-block" }} />
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function FileTag({ file }: { file: string }) {
  const short = file.split("/").pop() ?? file;
  return (
    <span style={{
      display: "inline-block",
      fontSize: 9.5, fontWeight: 700,
      color: GOLD, border: `1px solid ${GOLD}40`,
      borderRadius: 5, padding: "2px 6px",
      letterSpacing: "0.03em",
      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      {short}
    </span>
  );
}

export function MobileBrainView() {
  const [status, setStatus]   = useState<BrainStatus | null>(null);
  const [network, setNetwork] = useState<BrainNetwork | null>(null);
  const [error, setError]     = useState(false);
  const [query, setQuery]     = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searchErr, setSearchErr] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/brain-graph/status").then(r => r.json()).then(j => setStatus(j as BrainStatus)).catch(() => setError(true));
    fetch("/api/brain-graph/network").then(r => r.json()).then(j => setNetwork(j as BrainNetwork)).catch(() => null);
  }, []);

  const nodeCount = network?.nodes?.length ?? 0;
  const linkCount = network?.links?.length ?? 0;
  const hasGraph  = Array.isArray(network?.nodes) && nodeCount > 0;

  function onQueryChange(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults(null); setSearchErr(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchErr(false);
      try {
        const r = await fetch(`/api/brain-graph/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json() as SearchResult;
        setResults(j);
      } catch {
        setSearchErr(true);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  const brainLocal = status ? !status.pathConfigured : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa" }}>Brain</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED, fontWeight: 600 }}>Capitalife Knowledge Graph</p>
          </div>
          {brainLocal && (
            <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, border: `1px solid ${GOLD}50`, borderRadius: 5, padding: "3px 7px", letterSpacing: "0.05em", marginTop: 4 }}>
              LOCAL ONLY
            </span>
          )}
        </div>

        {/* Search bar */}
        <div style={{ marginTop: 12, position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}>
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Brain durchsuchen…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: CARD_BG,
              border: `1px solid ${query ? GOLD + "60" : CARD_BORDER}`,
              borderRadius: 12,
              color: "#fafafa",
              fontSize: 13.5,
              fontFamily: "var(--font-text), sans-serif",
              padding: "9px 12px 9px 34px",
              outline: "none",
              WebkitAppearance: "none",
              transition: "border-color 0.15s",
            }}
          />
          {searching && (
            <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: MUTED }}>
              …
            </span>
          )}
        </div>
      </header>

      <div style={{ padding: "8px 16px 120px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Search results */}
        {query.trim() && (
          <div>
            {searchErr && (
              <p style={{ color: "rgba(239,68,68,0.8)", fontSize: 12, margin: 0 }}>Suche fehlgeschlagen</p>
            )}
            {results && !searchErr && (
              <>
                {/* Graph hit count */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
                    {results.graph.nodeCount} Graph-Knoten · {results.brain.resultCount} Brain-Treffer
                  </span>
                  {results.graph.summary && (
                    <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>
                      ~{results.graph.tokenEstimate} Tokens
                    </span>
                  )}
                </div>

                {/* Brain file snippets */}
                {results.brain.results.length === 0 && results.graph.nodeCount === 0 && (
                  <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Keine Treffer für „{results.query}"</p>
                )}
                {results.brain.results.map((r, i) => (
                  <div key={i} style={{
                    background: CARD_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 8,
                  }}>
                    <FileTag file={r.file} />
                    <pre style={{
                      margin: "8px 0 0",
                      fontSize: 11.5,
                      color: "rgba(255,255,255,0.72)",
                      fontFamily: "var(--font-text), monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.55,
                      maxHeight: 120,
                      overflow: "hidden",
                    }}>
                      {r.snippet}
                    </pre>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Default state — globe + stats */}
        {!query.trim() && (
          <>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
              <GlobeSpinner size={130} />
            </div>

            {error ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Brain nicht erreichbar</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <StatCard label="Knoten" value={hasGraph ? nodeCount.toLocaleString("de-DE") : "–"} sub={network?.source ?? "Nodes im Graphen"} />
                  <StatCard label="Links"  value={hasGraph ? linkCount.toLocaleString("de-DE") : "–"} sub="Verbindungen" />
                </div>
                {status && (
                  <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px 8px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>Systemstatus</div>
                    <StatusRow ok={status.pathConfigured} label="Brain-Pfad konfiguriert" />
                    <StatusRow ok={status.brainFile}      label="Brain-Datei vorhanden" />
                    <StatusRow ok={status.snapshotFile}   label="Snapshot vorhanden" />
                    <StatusRow ok={hasGraph}              label="Graph geladen" />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
