"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, Bell, Check, Layers, LogOut, Search, X,
  LayoutDashboard, BarChart2, Activity, Bot, Network,
  Zap, FlaskConical, TrendingUp, Calendar, ScanLine,
  Shield, Cpu, Settings as SettingsIcon, Component,
} from "lucide-react";
import { useHomeDashboard } from "@/context/home-dashboard-context";

const EXPANDED_H = 72;

type NavEntry = {
  label: string;
  category: string;
  href: string;
  icon: React.ReactNode;
  aliases?: string[];
};

const NAV_INDEX: NavEntry[] = [
  {
    label: "Home",
    category: "Dashboard",
    href: "/",
    icon: <LayoutDashboard className="h-3.5 w-3.5" />,
    aliases: ["overview", "start"],
  },
  {
    label: "White Swan",
    category: "Portfolio Strategy",
    href: "/white-swan",
    icon: <Shield className="h-3.5 w-3.5" />,
    aliases: ["white", "swan", "portfolio", "v7", "v7.0", "whiteswan", "ws"],
  },
  {
    label: "Analytics",
    category: "Performance & Track Record",
    href: "/analytics",
    icon: <BarChart2 className="h-3.5 w-3.5" />,
    aliases: ["charts", "backtest", "performance", "track record"],
  },
  {
    label: "Monitoring",
    category: "Markets & Signals",
    href: "/monitoring",
    icon: <Activity className="h-3.5 w-3.5" />,
    aliases: ["markets", "live", "signals", "monitor"],
  },
  {
    label: "Sentinel",
    category: "AI Assistant",
    href: "/sentinel",
    icon: <Bot className="h-3.5 w-3.5" />,
    aliases: ["ai", "chat", "assistant"],
  },
  {
    label: "Brain",
    category: "Knowledge Graph",
    href: "/brain",
    icon: <Network className="h-3.5 w-3.5" />,
    aliases: ["knowledge", "vault", "graph", "obsidian"],
  },
  {
    label: "Research",
    category: "Strategy Research Hub",
    href: "/research",
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    aliases: ["lab", "research hub"],
  },
  {
    label: "Strategy Tester",
    category: "Research",
    href: "/research",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    aliases: ["tester", "walk-forward", "wf", "backtest engine", "strategy"],
  },
  {
    label: "Seasonality",
    category: "Research",
    href: "/research",
    icon: <Calendar className="h-3.5 w-3.5" />,
    aliases: ["seasonal", "calendar", "weekday", "month"],
  },
  {
    label: "MVA",
    category: "Research · Local Only",
    href: "/research",
    icon: <ScanLine className="h-3.5 w-3.5" />,
    aliases: ["mva", "factor", "exposure", "multi-factor"],
  },
  {
    label: "Signals",
    category: "Live Signal Feed",
    href: "/signal",
    icon: <Zap className="h-3.5 w-3.5" />,
    aliases: ["signale", "feed", "live signal"],
  },
  {
    label: "Execution",
    category: "Read-Only — Disabled",
    href: "/execution",
    icon: <Cpu className="h-3.5 w-3.5" />,
    aliases: ["broker", "ibkr", "orders", "trade"],
  },
  {
    label: "System Health",
    category: "Status & Diagnostics",
    href: "/system-health",
    icon: <Activity className="h-3.5 w-3.5" />,
    aliases: ["health", "status", "diagnostics", "system"],
  },
  {
    label: "Portfolio Lab",
    category: "Capital Scenario Engine",
    href: "/manager",
    icon: <LayoutDashboard className="h-3.5 w-3.5" />,
    aliases: ["manager", "capital", "scenario"],
  },
  {
    label: "Settings",
    category: "Preferences & Config",
    href: "/settings",
    icon: <SettingsIcon className="h-3.5 w-3.5" />,
    aliases: ["preferences", "config"],
  },
  {
    label: "Komponenten",
    category: "UI Component Library",
    href: "/komponenten",
    icon: <Component className="h-3.5 w-3.5" />,
    aliases: ["components", "ui", "library"],
  },
];

function matchNav(q: string): NavEntry[] {
  const lower = q.toLowerCase().trim();
  if (!lower) return NAV_INDEX;
  return NAV_INDEX.filter((e) => {
    if (e.label.toLowerCase().includes(lower)) return true;
    if (e.category.toLowerCase().includes(lower)) return true;
    return e.aliases?.some((a) => a.toLowerCase().includes(lower));
  });
}

type TopbarProps = {
  sectionLabel: string;
  visible: boolean;
};

export function Topbar({ sectionLabel, visible }: TopbarProps) {
  const { activeProfile, profiles, setActiveProfile } = useHomeDashboard();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!profileOpen && !searchOpen) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (profileOpen && !triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) setProfileOpen(false);
      if (searchOpen && !searchRef.current?.contains(target)) setSearchOpen(false);
    }
    window.addEventListener("mousedown", onOutside);
    return () => window.removeEventListener("mousedown", onOutside);
  }, [profileOpen, searchOpen]);

  const filteredPages = query.trim() ? matchNav(query) : NAV_INDEX;

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredPages.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredPages[activeIndex] ?? filteredPages[0];
      if (target) { router.push(target.href); setSearchOpen(false); setQuery(""); setActiveIndex(-1); }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
      setQuery("");
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  }

  const h = visible ? EXPANDED_H : 0;

  return (
    <div
      style={{
        height: h,
        overflow: "clip",
        opacity: visible ? 1 : 0,
        transition: "height 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease",
        flexShrink: 0,
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-4 pb-3 pl-6 pr-4 pt-4" style={{ overflow: "visible" }}>
        <div>
          <h1 className="text-[21px] font-bold leading-tight tracking-tight text-white [font-family:var(--font-text),sans-serif]">
            Welcome back, {activeProfile.name}!
          </h1>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--dash-section-label)] [font-family:var(--font-text),sans-serif]">
            {sectionLabel}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div ref={searchRef} className="relative">
            <div
              className="flex h-9 min-w-[220px] cursor-text items-center gap-2 rounded-full border border-[#2a2b30]/80 bg-[#13131A] px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus-within:border-[rgba(226,202,122,0.25)]"
              onClick={() => { setSearchOpen(true); inputRef.current?.focus(); }}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={2} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); setActiveIndex(-1); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-zinc-500 [font-family:var(--font-text),sans-serif]"
              />
              {query && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuery(""); inputRef.current?.focus(); }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {searchOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-xl border border-white/[0.08] bg-[#121316] p-1.5 shadow-[0_16px_42px_-12px_rgba(0,0,0,0.75)]">
                {filteredPages.length === 0 ? (
                  <p className="px-3 py-2.5 text-[12px] text-zinc-500 [font-family:var(--font-text),sans-serif]">
                    No results
                  </p>
                ) : (
                  filteredPages.map((page, i) => (
                    <button
                      key={`${page.href}-${page.label}`}
                      type="button"
                      onClick={() => { router.push(page.href); setSearchOpen(false); setQuery(""); setActiveIndex(-1); }}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${i === activeIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                    >
                      <span className="shrink-0 text-zinc-500">{page.icon}</span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-white [font-family:var(--font-text),sans-serif]">
                          {page.label}
                        </span>
                        <span className="block truncate text-[10.5px] text-zinc-500 [font-family:var(--font-text),sans-serif]">
                          {page.category}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.push("/preview-workspace")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2b30]/80 bg-[#13131A] text-zinc-400 transition-colors hover:border-[rgba(214,184,108,0.25)] hover:text-[#C9A84C]"
            aria-label="Preview Workspace"
            title="Preview Workspace"
          >
            <Layers className="h-[16px] w-[16px]" strokeWidth={1.9} />
          </button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("sentinel-butler-toggle"))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2b30]/80 bg-[#13131A] text-zinc-400 transition-colors hover:border-[rgba(214,184,108,0.25)] hover:text-[#C9A84C]"
            aria-label="Sentinel Chat"
            title="Sentinel Chat"
          >
            {/* Sentinel logo mark as a CSS mask, colored via currentColor so it follows the button's idle/hover state */}
            <span
              aria-hidden
              style={{
                display: "inline-block", width: 16, height: 16,
                backgroundColor: "currentColor",
                WebkitMaskImage: "url(/sentinel-logo.png)",
                maskImage: "url(/sentinel-logo.png)",
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                transform: "scale(1.3)",
              }}
            />
          </button>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>

          {/* Profile trigger */}
          <div className="relative pl-1">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => {
                if (profileOpen) { setProfileOpen(false); return; }
                const rect = triggerRef.current?.getBoundingClientRect();
                if (rect) setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                setProfileOpen(true);
              }}
              className="flex items-center gap-2.5 rounded-xl border border-transparent px-1.5 py-1 transition-colors hover:border-white/[0.08]"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
            >
              <div className="relative h-10 w-10 shrink-0">
                <Image
                  src={activeProfile.avatarSrc}
                  alt={activeProfile.name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover ring-1 ring-white/[0.06]"
                  priority
                />
                {activeProfile.verified && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#0c0d10] ring-2 ring-[#0c0d10]">
                    <BadgeCheck className="h-[18px] w-[18px] text-[#C9A84C]" fill="currentColor" stroke="#0c0d10" strokeWidth={1.5} aria-hidden />
                  </span>
                )}
              </div>
              <div className="text-left leading-tight">
                <p className="text-[14px] font-semibold text-white [font-family:var(--font-text),sans-serif]">{activeProfile.name}</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-text),sans-serif]">PROFILE</p>
              </div>
            </button>
          </div>

          {/* Profile dropdown — portal so it escapes overflow:clip */}
          {profileOpen && dropdownPos && createPortal(
            <div
              ref={dropdownRef}
              style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
              className="w-[240px] rounded-xl border border-white/[0.08] bg-[#121316] p-1.5 shadow-[0_16px_42px_-12px_rgba(0,0,0,0.80)]"
              role="menu"
            >
              {profiles.map((profile) => {
                const isActive = profile.id === activeProfile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setActiveProfile(profile.id); setProfileOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="relative h-8 w-8 shrink-0">
                      <Image src={profile.avatarSrc} alt={profile.name} width={32} height={32} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/[0.06]" />
                      {profile.verified && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#0c0d10] ring-2 ring-[#0c0d10]">
                          <BadgeCheck className="h-[14px] w-[14px] text-[#C9A84C]" fill="currentColor" stroke="#0c0d10" strokeWidth={1.4} aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white [font-family:var(--font-text),sans-serif]">{profile.name}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-text),sans-serif]">PROFILE</p>
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[#C9A84C]" strokeWidth={2.5} />}
                  </button>
                );
              })}
              <div className="my-1.5 h-px bg-white/[0.06]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setProfileOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 [font-family:var(--font-text),sans-serif]"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                Logout
              </button>
            </div>,
            document.body
          )}
        </div>
      </header>
    </div>
  );
}
