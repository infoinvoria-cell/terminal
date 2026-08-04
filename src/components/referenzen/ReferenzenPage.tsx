"use client";

import { KpiCard } from "@/components/shared/KpiCard";
import { ChartAssetOverlay } from "@/components/shared/ChartAssetOverlay";
import { DS } from "@/lib/ds";

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C9A84C", marginBottom: 6 }}>
          Referenz
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#eef5ff", lineHeight: 1.1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginTop: 6 }}>{subtitle}</div>}
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ children, gap = 16 }: { children: React.ReactNode; gap?: number }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap, alignItems: "flex-start" }}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginTop: 10, marginBottom: 6 }}>
      {children}
    </div>
  );
}

// ── Color swatch ──────────────────────────────────────────────────────────────

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: color, border: "1px solid rgba(255,255,255,0.08)" }} />
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 56 }}>{label}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>{color}</div>
    </div>
  );
}

// ── Signal card mock ──────────────────────────────────────────────────────────

function SignalCardMock({ direction, asset, strategy, date }: { direction: "LONG" | "SHORT" | "NEUTRAL"; asset: string; strategy: string; date: string }) {
  const dirColor = direction === "LONG" ? "#00ff08" : direction === "SHORT" ? "#ff0000" : "#7F93B8";
  const dirBg = direction === "LONG" ? "rgba(0,255,8,0.07)" : direction === "SHORT" ? "rgba(255,0,0,0.07)" : "rgba(127,147,184,0.07)";
  return (
    <div style={{
      background: "linear-gradient(135deg, #14151a 0%, #0d0e12 100%)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14,
      padding: "14px 16px",
      width: 220,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#eef5ff" }}>{asset}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{strategy}</div>
        </div>
        <div style={{ background: dirBg, border: `1px solid ${dirColor}33`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: dirColor }}>
          {direction}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{date}</div>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dirColor, boxShadow: `0 0 6px ${dirColor}` }} />
      </div>
    </div>
  );
}

// ── Chart overlay demo ────────────────────────────────────────────────────────

function OverlayDemo({ iconUrl, symbol, assetName, iconSize }: { iconUrl?: string; symbol: string; assetName: string; iconSize?: number }) {
  return (
    <div style={{
      position: "relative",
      width: 280,
      height: 140,
      borderRadius: 10,
      background: "#0A0A0A",
      border: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* fake candles */}
      <svg viewBox="0 0 280 140" style={{ position: "absolute", inset: 0 }}>
        {[
          [40, 60, 80, 50, 90], [70, 50, 70, 40, 80], [100, 70, 90, 60, 95],
          [130, 45, 65, 35, 75], [160, 55, 75, 45, 85], [190, 40, 60, 30, 70],
          [220, 65, 85, 55, 95], [250, 50, 70, 40, 80],
        ].map(([x, open, close, low, high], i) => {
          const up = close < open;
          const color = up ? "#FFFFFF" : "#C9A84C";
          return (
            <g key={i}>
              <line x1={x} y1={low} x2={x} y2={high} stroke={color} strokeWidth={1} opacity={0.5} />
              <rect x={x - 6} y={Math.min(open, close)} width={12} height={Math.abs(open - close) || 1} fill={color} opacity={0.85} />
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: 10, top: 10, zIndex: 10 }}>
        <ChartAssetOverlay iconUrl={iconUrl} symbol={symbol} assetName={assetName} iconSize={iconSize} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ReferenzenPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0E", padding: "40px 40px 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
          Design System
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#eef5ff", lineHeight: 1 }}>Referenzen</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.32)", marginTop: 10, maxWidth: 480 }}>
          Jedes Element einmal in seiner Master-Form. Diese Seite ist die Quelle der Wahrheit für alle UI-Komponenten.
        </div>
      </div>

      {/* ── 1. Farb-Tokens ─────────────────────────────────────────────── */}
      <Section title="Farb-Tokens" subtitle="Zentrale Farbwerte aus ds.ts — nie inline überschreiben">
        <Label>Kerzen</Label>
        <Row>
          <Swatch color={DS.candle.up} label="Positiv" />
          <Swatch color={DS.candle.down} label="Negativ" />
          <Swatch color={DS.candle.bg} label="Hintergrund" />
        </Row>
        <Label>Signale</Label>
        <Row>
          <Swatch color={DS.signal.long} label="Long" />
          <Swatch color={DS.signal.short} label="Short" />
          <Swatch color={DS.signal.pending} label="Pending" />
        </Row>
        <Label>UI</Label>
        <Row>
          <Swatch color={DS.accent.gold} label="Gold" />
          <Swatch color={DS.card.bg} label="Card BG" />
          <Swatch color={DS.card.surface} label="Surface" />
          <Swatch color={DS.border.subtle} label="Border" />
        </Row>
      </Section>

      {/* ── 2. KpiCard — Default ───────────────────────────────────────── */}
      <Section title="KPI Card — Default" subtitle="Einsatz: Home Dashboard. Gradient-Hintergrund, min-h 132px, rounded-[20px]">
        <Row>
          <div>
            <Label>Positiv / Delta</Label>
            <KpiCard label="AUM" value="€ 2.4 M" color="#00ff08" delta="+8.3%" deltaColor="#00ff08" />
          </div>
          <div>
            <Label>Negativ / Delta</Label>
            <KpiCard label="Drawdown" value="−4.2%" color="#ff0000" delta="−1.1%" deltaColor="#ff0000" />
          </div>
          <div>
            <Label>Neutral / Subtitle</Label>
            <KpiCard label="Sharpe Ratio" value="1.84" color="#C9A84C" subtitle="12-Monats-Rolling" />
          </div>
          <div>
            <Label>Ohne Delta</Label>
            <KpiCard label="Strategien" value="12" color="rgba(255,255,255,0.6)" />
          </div>
        </Row>
      </Section>

      {/* ── 3. KpiCard — Compact ──────────────────────────────────────── */}
      <Section title="KPI Card — Compact" subtitle="Einsatz: Signal-Seite, Tabellen. Flach, rounded-[10px], 20px Wert">
        <Row>
          <div>
            <Label>Bull</Label>
            <KpiCard variant="compact" label="Win Rate" value="68.4%" color="#00ff08" />
          </div>
          <div>
            <Label>Bear</Label>
            <KpiCard variant="compact" label="Max DD" value="−6.1%" color="#ff0000" />
          </div>
          <div>
            <Label>Gold</Label>
            <KpiCard variant="compact" label="Avg Return" value="+2.3%" color="#C9A84C" />
          </div>
          <div>
            <Label>Neutral</Label>
            <KpiCard variant="compact" label="Trades" value="247" color="rgba(255,255,255,0.45)" />
          </div>
        </Row>
      </Section>

      {/* ── 4. Chart Asset Overlay ─────────────────────────────────────── */}
      <Section title="Chart Asset Overlay" subtitle="Oben links direkt auf dem Chart. Kein Rahmen, kein Hintergrund-Box. Backdrop-Blur auf Chart-Inhalt dahinter.">
        <Row gap={20}>
          <div>
            <Label>Mit Icon (Futures)</Label>
            <OverlayDemo symbol="GC1!" assetName="Gold Futures" iconSize={26} />
          </div>
          <div>
            <Label>Ohne Icon (Fallback)</Label>
            <OverlayDemo symbol="ES1!" assetName="E-mini S&P 500" iconSize={26} />
          </div>
          <div>
            <Label>Klein (iconSize 20)</Label>
            <OverlayDemo symbol="ZN1!" assetName="10-Year T-Note" iconSize={20} />
          </div>
        </Row>
        <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.3)", maxWidth: 560, lineHeight: 1.7 }}>
          Komponente: <code style={{ color: "#C9A84C", fontFamily: "monospace" }}>ChartAssetOverlay</code> aus{" "}
          <code style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>@/components/shared/ChartAssetOverlay</code>.
          Props: <code style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>iconUrl · symbol · assetName · iconSize</code>
        </div>
      </Section>

      {/* ── 5. Signal Card ─────────────────────────────────────────────── */}
      <Section title="Signal Card" subtitle="Einsatz: Signal-Seite. Gradient, border, Direction-Pill, Status-Dot">
        <Row>
          <div>
            <Label>Long</Label>
            <SignalCardMock direction="LONG" asset="GC1! — Gold" strategy="White Swan EUR" date="04. Aug 2026" />
          </div>
          <div>
            <Label>Short</Label>
            <SignalCardMock direction="SHORT" asset="ES1! — S&P 500" strategy="Core Invest Alpha" date="04. Aug 2026" />
          </div>
          <div>
            <Label>Neutral</Label>
            <SignalCardMock direction="NEUTRAL" asset="ZN1! — T-Note" strategy="White Swan USD" date="05. Aug 2026" />
          </div>
        </Row>
      </Section>

      {/* ── 6. Kerzenfarben ────────────────────────────────────────────── */}
      <Section title="Kerzenfarben — Master" subtitle="Alle OHLC-Charts: Positiv = Weiß #FFFFFF, Negativ = Gold #C9A84C. Nie rot, nie grün.">
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["up","up","down","up","down","down","up"].map((dir, i) => {
              const color = dir === "up" ? "#FFFFFF" : "#C9A84C";
              const h = 40 + (i % 3) * 18;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 1, height: 8, background: color, opacity: 0.5, margin: "0 auto" }} />
                  <div style={{ width: 12, height: h, background: color, borderRadius: 2 }} />
                  <div style={{ width: 1, height: 8, background: color, opacity: 0.5, margin: "0 auto" }} />
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.8 }}>
            <div><span style={{ color: "#FFFFFF", fontWeight: 700 }}>■</span> Positiv (Up) — <code style={{ fontFamily: "monospace", color: "#C9A84C" }}>#FFFFFF</code></div>
            <div><span style={{ color: "#C9A84C", fontWeight: 700 }}>■</span> Negativ (Down) — <code style={{ fontFamily: "monospace", color: "#C9A84C" }}>#C9A84C</code></div>
          </div>
        </div>
      </Section>
    </div>
  );
}
