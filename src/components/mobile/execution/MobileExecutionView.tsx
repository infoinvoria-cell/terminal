"use client";
import { useEffect, useState } from "react";

const CARD_BG  = "#1F1F1F";
const BORDER   = "rgba(255,255,255,0.06)";
const MUTED    = "rgba(255,255,255,0.42)";
const RED      = "#ef4444";
const GOLD     = "#C9A84C";

import type { MobileExecutionStatus } from "@/lib/mobile/types";

type ForwardLoggerResponse = {
  available: boolean;
  openTrades?: Record<string, string>[];
  activeSignals?: Record<string, string>[];
};


function ShieldIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
    </svg>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const dot = ok === true ? "#22C55E" : ok === false ? RED : "#374151";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${BORDER}` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{label}</span>
        {detail && <span style={{ fontSize: 10.5, color: MUTED, marginLeft: 6 }}>{detail}</span>}
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: dot, letterSpacing: "0.04em" }}>
        {ok === true ? "OK" : ok === false ? "OFFLINE" : "—"}
      </span>
    </div>
  );
}

export function MobileExecutionView() {
  const [forwardData, setForwardData] = useState<ForwardLoggerResponse | null>(null);
  const [_execStatus, setExecStatus]  = useState<MobileExecutionStatus | null>(null);
  const [fetching, setFetching]       = useState(true);

  useEffect(() => {
    fetch("/api/mobile/execution")
      .then(r => r.json())
      .then(j => setExecStatus(j as MobileExecutionStatus))
      .catch(() => null);
    fetch("/api/monitoring/forward-logger")
      .then(r => r.json())
      .then(j => setForwardData(j as ForwardLoggerResponse))
      .catch(() => setForwardData({ available: false }))
      .finally(() => setFetching(false));
  }, []);

  const forwardAvailable = forwardData?.available ?? false;
  const openCount        = forwardData?.openTrades?.length ?? 0;
  const signalCount      = forwardData?.activeSignals?.length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "16px 16px 12px", background: "linear-gradient(#0c0d10 68%, rgba(12,13,16,0))" }}>
        <p style={{ margin: "0 0 1px", fontSize: 9, fontWeight: 600, color: MUTED, fontFamily: "var(--font-text)", textTransform: "uppercase", letterSpacing: "0.07em" }}>EXECUTION</p>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-text), sans-serif" }}>Status</h1>
      </header>

      <div style={{ padding: "8px 16px 120px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Hard stop banner */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          background: `${RED}10`, border: `1px solid ${RED}40`,
          borderRadius: 16, padding: "16px 18px",
        }}>
          <ShieldIcon />
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: RED, fontFamily: "var(--font-text)", letterSpacing: "-0.01em" }}>
              KEINE AUSFÜHRUNG
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "rgba(239,68,68,0.7)", fontFamily: "var(--font-text)" }}>
              Execution permanent deaktiviert · Read-only
            </p>
          </div>
        </div>

        {/* System checks */}
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Systemstatus</div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            <StatusRow label="Forward Logger"   ok={forwardAvailable}       detail={fetching ? "Lädt…" : forwardAvailable ? "erreichbar" : "nicht verfügbar"} />
            <StatusRow label="Offene Positionen" ok={openCount > 0 ? null : null}   detail={fetching ? "—" : `${openCount} offen`} />
            <StatusRow label="Aktive Signale"    ok={signalCount > 0 ? null : null} detail={fetching ? "—" : `${signalCount} aktiv`} />
            <StatusRow label="IBKR Broker"       ok={false}                 detail="Keine Live-Verbindung" />
            <StatusRow label="Nautilus Engine"   ok={false}                 detail="Offline / Cloud" />
            <StatusRow label="Order Execution"   ok={false}                 detail="Deaktiviert" />
          </div>
        </section>

        {/* Forward signals quick view */}
        {!fetching && forwardData && (forwardData.openTrades?.length ?? 0) > 0 && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Offene Positionen ({openCount}) · READ ONLY
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(forwardData.openTrades ?? []).slice(0, 5).map((t, i) => (
                <div key={i} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", fontFamily: "var(--font-numbers)" }}>{t.symbol ?? "—"}</span>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700,
                      color: (t.direction ?? "").toUpperCase() === "LONG" ? "#22C55E" : RED,
                      border: `1px solid ${(t.direction ?? "").toUpperCase() === "LONG" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                      borderRadius: 5, padding: "2px 6px", letterSpacing: "0.04em",
                    }}>
                      {(t.direction ?? "—").toUpperCase()}
                    </span>
                  </div>
                  {t.strategy && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3, fontFamily: "var(--font-text)" }}>{t.strategy}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!fetching && !forwardAvailable && (
          <div style={{ textAlign: "center", padding: "24px 0", color: MUTED, fontSize: 13, fontFamily: "var(--font-text)" }}>
            Forward Logger nicht erreichbar · Nur in lokaler Umgebung verfügbar
          </div>
        )}

        {/* Info block */}
        <div style={{ background: `${GOLD}08`, border: `1px solid ${GOLD}20`, borderRadius: 12, padding: "12px 14px" }}>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(201,168,76,0.7)", lineHeight: 1.6, fontFamily: "var(--font-text)" }}>
            Diese Seite zeigt ausschließlich Lesezugriff auf Forward-Logs und Signale.
            Keine Verbindung zu IBKR · Keine Orders möglich · Keine Execution.
          </p>
        </div>
      </div>
    </div>
  );
}
