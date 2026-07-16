"use client";
// data-mobile-version="live-desktop-parity-v3"
import { useCallback, useEffect, useState } from "react";
import { loadWave1Groups, type Wave1GroupId } from "@/lib/monitoring/wave1Data";

// ─── Types ────────────────────────────────────────────────────────────────────

type ManualSignal = {
  symbol: string;
  name: string;
  strategyId: string;
  group: string;
  status: "OPEN" | "EXIT_TODAY" | string;
  direction?: "long" | "short" | null;
  entryTime?: string | null;
  entryPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  currentPrice?: number | null;
  exitTime?: string | null;
  exitPrice?: number | null;
  note?: string;
};

type Wave1Signal = {
  strategy_id: string;
  label: string;
  symbol: string;
  signal_status: string | null;
  last_signal_time: string | null;
  last_signal_label: string | null;
  last_price: number | null;
  last_bar_time: string | null;
  strategy_status: string;
  open_position: boolean;
  position_side: string | null;
};

export type LiveCard = {
  key: string;
  symbol: string;
  name: string;
  strategy: string;
  group: string;
  direction: "long" | "short" | null;
  status: string;
  isOpen: boolean;
  isExitToday: boolean;
  entryTime: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  currentPrice: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  signalLabel: string | null;
  source: "manual_verified" | "wave1";
  sparkline: number[] | null;
};

type FilterMode = "open" | "watch" | "all";

const SPARKLINE_N = 28;
const WAVE1_GROUPS: Wave1GroupId[] = ["agrar", "intraday", "indices"];

const DISPLAY_NAMES: Record<string, string> = {
  "KC1!": "Coffee", "SB1!": "Sugar", "CC1!": "Cocoa", "CT1!": "Cotton", "OJ1!": "Orange Juice",
  "ZC1!": "Corn", "ZS1!": "Soybeans", "ZW1!": "Wheat",
  "GC1!": "Gold", "SI1!": "Silver", "PA1!": "Palladium", "PL1!": "Platinum",
  "CL1!": "Crude Oil", "HG1!": "Copper", "NG1!": "Natural Gas",
  "ES1!": "S&P 500", "NQ1!": "Nasdaq 100", "YM1!": "Dow Jones", "FDAX1!": "DAX",
  "UKX!": "FTSE 100", "USDCHF": "USD/CHF", "META": "Meta",
};

function displayName(symbol: string, name?: string | null): string {
  if (name && name !== symbol && name !== "-") return name;
  return DISPLAY_NAMES[symbol] ?? symbol;
}

function fmtPrice(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const d = a < 10 ? 4 : a < 100 ? 3 : 2;
  return v.toLocaleString("de-DE", { maximumFractionDigits: d });
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

// ─── Data loading ──────────────────────────────────────────────────────────────

async function loadManualVerified(): Promise<ManualSignal[]> {
  try {
    const r = await fetch("/generated/monitoring/live_state/manual_verified_live_signals.json", { cache: "no-store" });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.signals) ? d.signals : [];
  } catch { return []; }
}

async function loadAllCards(): Promise<{ cards: LiveCard[]; openCount: number }> {
  const [manualSignals, wave1Data] = await Promise.all([
    loadManualVerified(),
    loadWave1Groups(WAVE1_GROUPS),
  ]);

  const cards: LiveCard[] = [];
  const seen = new Set<string>();

  // 1. Manual verified signals (highest priority — cross-group, manually confirmed)
  for (const sig of manualSignals) {
    const k = (sig.symbol || "").toUpperCase();
    seen.add(k);
    const wave1Record = WAVE1_GROUPS.flatMap((g) => wave1Data[g]?.records ?? []).find(
      (r) => r.symbol?.toUpperCase() === k,
    );
    const closes = (wave1Record?.chart?.bars ?? [])
      .map((b) => b.close).filter((c): c is number => c != null)
      .slice(-SPARKLINE_N);
    cards.push({
      key: `manual-${sig.symbol}`,
      symbol: sig.symbol,
      name: displayName(sig.symbol, sig.name),
      strategy: sig.strategyId ?? "",
      group: sig.group ?? "",
      direction: sig.direction ?? null,
      status: sig.status,
      isOpen: sig.status === "OPEN",
      isExitToday: sig.status === "EXIT_TODAY",
      entryTime: sig.entryTime ?? null,
      entryPrice: sig.entryPrice ?? null,
      stopLoss: sig.stopLossPrice ?? null,
      takeProfit: sig.takeProfitPrice ?? null,
      currentPrice: sig.currentPrice ?? null,
      exitTime: sig.exitTime ?? null,
      exitPrice: sig.exitPrice ?? null,
      signalLabel: sig.status,
      source: "manual_verified",
      sparkline: closes.length >= 3 ? closes : null,
    });
  }

  // 2. Wave1 open positions not already in manual_verified
  for (const g of WAVE1_GROUPS) {
    for (const record of wave1Data[g]?.records ?? []) {
      const sig = record.signal;
      if (!sig) continue;
      const k = (sig.symbol || "").toUpperCase();
      if (seen.has(k)) continue;
      if (!sig.open_position) continue; // wave1: only show open positions
      seen.add(k);
      const closes = (record.chart?.bars ?? [])
        .map((b) => b.close).filter((c): c is number => c != null)
        .slice(-SPARKLINE_N);
      cards.push({
        key: `wave1-${g}-${sig.strategy_id}`,
        symbol: sig.symbol,
        name: displayName(sig.symbol, sig.label),
        strategy: sig.strategy_id ?? "",
        group: g,
        direction: null,
        status: sig.signal_status ?? sig.strategy_status ?? "OPEN",
        isOpen: true,
        isExitToday: false,
        entryTime: sig.last_signal_time ?? null,
        entryPrice: null,
        stopLoss: null,
        takeProfit: null,
        currentPrice: sig.last_price ?? null,
        exitTime: null,
        exitPrice: null,
        signalLabel: sig.signal_status ?? sig.last_signal_label,
        source: "wave1",
        sparkline: closes.length >= 3 ? closes : null,
      });
    }
  }

  // 3. Wave1 watch signals (not open, not already seen) — separate from open
  for (const g of WAVE1_GROUPS) {
    for (const record of wave1Data[g]?.records ?? []) {
      const sig = record.signal;
      if (!sig || sig.open_position) continue;
      const k = (sig.symbol || "").toUpperCase();
      if (seen.has(k)) continue;
      const isWatch = (sig.signal_status ?? "").toLowerCase().includes("watch") ||
        (sig.signal_status ?? "").toLowerCase().includes("le") ||
        (sig.signal_status ?? "").toLowerCase().includes("lx");
      if (!isWatch) continue;
      seen.add(k);
      const closes = (record.chart?.bars ?? [])
        .map((b) => b.close).filter((c): c is number => c != null)
        .slice(-SPARKLINE_N);
      cards.push({
        key: `wave1-watch-${g}-${sig.strategy_id}`,
        symbol: sig.symbol,
        name: displayName(sig.symbol, sig.label),
        strategy: sig.strategy_id ?? "",
        group: g,
        direction: null,
        status: sig.signal_status ?? "WATCH",
        isOpen: false,
        isExitToday: false,
        entryTime: sig.last_signal_time ?? null,
        entryPrice: null, stopLoss: null, takeProfit: null,
        currentPrice: sig.last_price ?? null,
        exitTime: null, exitPrice: null,
        signalLabel: sig.signal_status,
        source: "wave1",
        sparkline: closes.length >= 3 ? closes : null,
      });
    }
  }

  const openCount = cards.filter((c) => c.isOpen || c.isExitToday).length;
  return { cards, openCount };
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  const W = 60, H = 28;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const up = values[values.length - 1] >= values[0];
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? "rgba(74,222,128,0.7)" : "rgba(248,113,113,0.7)"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function statusColor(s: string): string {
  const sl = s.toLowerCase();
  if (sl === "open") return "#4ade80";
  if (sl === "exit_today") return "#facc15";
  if (sl.includes("lx") || sl.includes("le")) return "#60a5fa";
  if (sl.includes("watch")) return "#60a5fa";
  return "rgba(255,255,255,0.45)";
}

function dirLabel(d: "long" | "short" | null): string {
  if (!d) return "";
  return d === "long" ? "LONG" : "SHORT";
}

function dirColor(d: "long" | "short" | null): string {
  if (!d) return "rgba(255,255,255,0.45)";
  return d === "long" ? "#4ade80" : "#f87171";
}

function SignalCardComponent({ card, expanded, onToggle }: {
  card: LiveCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const accent = card.isOpen ? "rgba(74,222,128,0.15)" : card.isExitToday ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.025)";
  const borderColor = card.isOpen ? "rgba(74,222,128,0.18)" : card.isExitToday ? "rgba(250,204,21,0.18)" : "rgba(255,255,255,0.07)";

  return (
    <div
      data-live-symbol={card.symbol}
      data-mobile-version="live-desktop-parity-v3"
      style={{
        background: accent, border: `1px solid ${borderColor}`,
        borderRadius: 10, overflow: "hidden",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Card header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter") onToggle(); }}
        style={{
          padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
        }}
      >
        {/* Left: symbol + name + group */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{card.symbol}</span>
            {card.name !== card.symbol && (
              <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.32)" }}>{card.name}</span>
            )}
            {card.isOpen && (
              <span style={{ fontSize: 7, fontWeight: 700, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", borderRadius: 999, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                OPEN
              </span>
            )}
            {card.isExitToday && (
              <span style={{ fontSize: 7, fontWeight: 700, background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.3)", color: "#facc15", borderRadius: 999, padding: "1px 6px", textTransform: "uppercase" }}>
                EXIT TODAY
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 9, color: statusColor(card.status), fontWeight: 600 }}>{card.status}</span>
            {card.direction && (
              <span style={{ fontSize: 9, color: dirColor(card.direction), fontWeight: 700, letterSpacing: "0.04em" }}>
                {dirLabel(card.direction)}
              </span>
            )}
            {card.currentPrice != null && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                {fmtPrice(card.currentPrice)}
              </span>
            )}
          </div>
        </div>

        {/* Right: mini chart or expand chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {card.sparkline ? (
            <Sparkline values={card.sparkline} />
          ) : (
            <div style={{ width: 60, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.12)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l3-8 4 16 3-8h4" opacity="0.4" />
              </svg>
            </div>
          )}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.18s ease", flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded detail rows */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            padding: "10px 10px 12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 12px",
          }}
        >
          {[
            { label: "Strategie", value: card.strategy || "—" },
            { label: "Gruppe", value: card.group || "—" },
            { label: "Entry", value: fmtPrice(card.entryPrice) },
            { label: "Stop Loss", value: fmtPrice(card.stopLoss) },
            { label: "Take Profit", value: fmtPrice(card.takeProfit) },
            { label: "Preis", value: fmtPrice(card.currentPrice) },
            { label: "Signal Datum", value: fmtDate(card.entryTime) },
            { label: "Signal", value: card.signalLabel ?? "—" },
            { label: "Quelle", value: card.source === "manual_verified" ? "Manuell bestätigt" : "Wave1 Monitoring" },
            ...(card.isExitToday ? [
              { label: "Exit Datum", value: fmtDate(card.exitTime) },
              { label: "Exit Preis", value: fmtPrice(card.exitPrice) },
            ] : []),
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 7.5, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 10.5, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>{value}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1/-1", marginTop: 4, fontSize: 7.5, color: "rgba(255,255,255,0.18)", fontStyle: "italic" }}>
            Research only · Keine Trading-Freigabe · Keine Approved-Freigabe
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MobileLiveView() {
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadAllCards()
      .then(({ cards: c, openCount: n }) => { setCards(c); setOpenCount(n); setLoading(false); })
      .catch(() => { setError("Fehler beim Laden der Signale"); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = cards.filter((c) => {
    if (filter === "open") return c.isOpen || c.isExitToday;
    if (filter === "watch") return !c.isOpen && !c.isExitToday;
    return true;
  });

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px", borderRadius: 5, border: "none",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
    color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.36)",
    fontSize: 9.5, fontWeight: active ? 600 : 400,
    cursor: "pointer", WebkitTapHighlightColor: "transparent",
  });

  return (
    <div
      data-mobile-version="live-desktop-parity-v3"
      style={{
        minHeight: 200, background: "#090a0c",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "var(--font-montserrat, system-ui, sans-serif)",
        padding: "10px 12px 20px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={filterBtnStyle(filter === "open")} onClick={() => setFilter("open")}>
            Offen / Exit {openCount > 0 ? `(${openCount})` : ""}
          </button>
          <button style={filterBtnStyle(filter === "watch")} onClick={() => setFilter("watch")}>
            Watch
          </button>
          <button style={filterBtnStyle(filter === "all")} onClick={() => setFilter("all")}>
            Alle ({cards.length})
          </button>
        </div>
        <button
          onClick={load}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.32)", cursor: "pointer", padding: "4px 6px" }}
          aria-label="Aktualisieren"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: 11, padding: "24px 0" }}>Lade Signale…</div>
      ) : error ? (
        <div style={{ textAlign: "center", color: "#f87171", fontSize: 11, padding: "24px 0" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: 11, padding: "24px 0" }}>
          {filter === "open" ? "Keine offenen / heutigen Exit-Signale" : "Keine Signale in dieser Kategorie"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {([
            { title: "Open", items: filtered.filter((c) => c.isOpen || c.isExitToday), color: "#4ade80" },
            { title: "Watch / Closed", items: filtered.filter((c) => !c.isOpen && !c.isExitToday), color: "#60a5fa" },
          ] as const)
            .filter((sec) => sec.items.length > 0)
            .map((sec) => (
              <div key={sec.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: sec.color }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    {sec.title}
                  </span>
                  <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.25)" }}>({sec.items.length})</span>
                </div>
                {sec.items.map((c) => (
                  <SignalCardComponent
                    key={c.key}
                    card={c}
                    expanded={expanded === c.key}
                    onToggle={() => setExpanded((prev) => (prev === c.key ? null : c.key))}
                  />
                ))}
              </div>
            ))}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 8, color: "rgba(255,255,255,0.18)", textAlign: "center" }}>
        Research only · Keine Trading-Freigabe · Keine Approved-Freigabe
      </div>
    </div>
  );
}
