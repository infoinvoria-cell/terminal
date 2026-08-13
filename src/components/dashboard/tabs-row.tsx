"use client";

import { BarChart2, Circle, Layers, Sparkles } from "lucide-react";
import { InjectPillCss } from "@/components/ui/pill-button";
import {
  useHomeDashboard,
  type HomeSubTab,
} from "@/context/home-dashboard-context";

const M = "var(--font-montserrat,'Montserrat',sans-serif)";

const HOME_TABS: { id: HomeSubTab; label: string; icon: typeof Layers }[] = [
  { id: "portfolio", label: "Portfolio", icon: Layers },
  { id: "risk", label: "Risk", icon: Circle },
  { id: "trades", label: "Trades", icon: BarChart2 },
  { id: "quant", label: "Quant", icon: Sparkles },
];

export function TabsRow() {
  const { homeTab, setHomeTab } = useHomeDashboard();

  return (
    <>
      <InjectPillCss />
      <div className="flex flex-wrap items-center gap-2">
        {HOME_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = homeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHomeTab(tab.id)}
              aria-pressed={active}
              className={`rc-pill ${active ? "rc-active" : "rc-inactive"}`}
              style={{
                fontFamily: M,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? "#F3F3F4" : "#6a6e7a",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon style={{ width: 14, height: 14, flexShrink: 0, opacity: active ? 0.85 : 0.5 }} strokeWidth={1.65} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
