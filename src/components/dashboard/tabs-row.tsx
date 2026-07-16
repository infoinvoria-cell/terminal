"use client";

import { BarChart2, Circle, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useHomeDashboard,
  type HomeSubTab,
} from "@/context/home-dashboard-context";

const HOME_TABS: { id: HomeSubTab; label: string; icon: typeof Layers }[] = [
  { id: "portfolio", label: "Portfolio", icon: Layers },
  { id: "risk", label: "Risk", icon: Circle },
  { id: "trades", label: "Trades", icon: BarChart2 },
  { id: "quant", label: "Quant", icon: Sparkles },
];

export function TabsRow() {
  const { homeTab, setHomeTab } = useHomeDashboard();

  return (
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
            className={cn(
              "flex items-center gap-1.5 text-[12px] font-medium transition-colors [font-family:var(--font-montserrat),sans-serif]",
              active
                ? "rounded-full border border-[#e2ca7a]/45 bg-gradient-to-b from-[#1c1d20] to-[#141517] px-3.5 py-1.5 font-semibold text-white shadow-[inset_0_-1px_0_0_rgba(226,202,122,0.45)]"
                : "border-0 bg-transparent px-2 py-1.5 text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Icon
              className={cn("h-4 w-4 shrink-0", active ? "text-[#e2ca7a]" : "")}
              strokeWidth={1.65}
            />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
