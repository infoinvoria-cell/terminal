"use client";

import { useState } from "react";
import StrategyMasterTable from "@/components/components/StrategyMasterTable";
import WhiteSwanFuturesPanel from "@/components/components/WhiteSwanFuturesPanel";
import styles from "./ComponentsPage.module.css";

const TABS = [
  { key: "portfolio", label: "Portfolio" },
  { key: "futures", label: "Futures Reference" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const FONT_UI = "var(--font-ui, 'IBM Plex Sans', sans-serif)";
const MUTED = "rgba(255,255,255,0.38)";
const TEXT = "rgba(255,255,255,0.87)";
const BORDER = "rgba(255,255,255,0.07)";

export function ComponentsShell() {
  const [tab, setTab] = useState<Tab>("portfolio");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Page-level tab bar */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "10px 20px 0",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: FONT_UI,
              fontSize: 12,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? TEXT : MUTED,
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid rgba(255,255,255,0.7)" : "2px solid transparent",
              padding: "6px 14px 8px",
              cursor: "pointer",
              letterSpacing: "0.02em",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className={styles.page} style={{ overflowY: "auto" }}>
        {tab === "portfolio" && <StrategyMasterTable />}
        {tab === "futures" && <WhiteSwanFuturesPanel />}
      </main>
    </div>
  );
}
