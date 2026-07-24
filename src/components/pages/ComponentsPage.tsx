"use client";

import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import ComponentBentoGrid from "@/components/components/ComponentBentoGrid";
import styles from "./ComponentsPage.module.css";
import type { StrategyInventoryRow } from "@/app/komponenten/page";

function fmt(n: number | null, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("de-DE", { maximumFractionDigits: decimals });
}

function StrategyInventorySection({ rows }: { rows: StrategyInventoryRow[] }) {
  if (!rows.length) return null;
  return (
    <section style={{ padding: "24px 28px 32px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", marginBottom: 16 }}>
        Strategy Engines
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.35)", textAlign: "left" }}>
              {["Symbol","Strategy","Direction","Entry","SL","TP","Signal Date","Status"].map((h) => (
                <th key={h} style={{ padding: "4px 12px 8px 0", fontWeight: 500, whiteSpace: "nowrap", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.sort((a, b) => (b.latestSignalDate ?? "").localeCompare(a.latestSignalDate ?? "")).map((r) => {
              const isOpen = r.openTrade;
              const dirColor = r.direction === "LONG" ? "#22c55e" : r.direction === "SHORT" ? "#ef4444" : "rgba(255,255,255,0.4)";
              return (
                <tr key={r.strategyId} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "7px 12px 7px 0", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{r.symbol}</td>
                  <td style={{ padding: "7px 12px 7px 0", color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap" }}>{r.strategyName}</td>
                  <td style={{ padding: "7px 12px 7px 0", color: dirColor, fontWeight: 600 }}>{r.direction || "—"}</td>
                  <td style={{ padding: "7px 12px 7px 0", color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>{fmt(r.entry)}</td>
                  <td style={{ padding: "7px 12px 7px 0", color: "#ef4444", fontFamily: "monospace" }}>{fmt(r.sl)}</td>
                  <td style={{ padding: "7px 12px 7px 0", color: "#22c55e", fontFamily: "monospace" }}>{fmt(r.tp)}</td>
                  <td style={{ padding: "7px 12px 7px 0", color: "rgba(255,255,255,0.40)", fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.latestSignalDate ?? "—"}</td>
                  <td style={{ padding: "7px 0 7px 0" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: isOpen ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                      color: isOpen ? "#22c55e" : "rgba(255,255,255,0.35)",
                    }}>
                      {isOpen ? "OPEN" : "CLOSED"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ComponentsShell({ strategyInventory = [] }: { strategyInventory?: StrategyInventoryRow[] }) {
  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#0a0a0c]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <main className={styles.page}>
            <ComponentBentoGrid />
          </main>
          <StrategyInventorySection rows={strategyInventory} />
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
