"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BadgeCheck, Bell, Check, LogOut, Search, X } from "lucide-react";
import { useHomeDashboard } from "@/context/home-dashboard-context";
import { useHeaderState } from "@/context/header-state-context";

const EXPANDED_H = 72;

const PAGES = [
  { label: "Home", sub: "Dashboard Overview", href: "/" },
  { label: "Analytics", sub: "Charts, Backtest, Track Record", href: "/analytics" },
  { label: "Monitoring", sub: "Strategy Monitor, Signals", href: "/monitoring" },
  { label: "Sentinel", sub: "AI Assistant", href: "/sentinel" },
  { label: "Brain Graph", sub: "Obsidian Vault Graph", href: "/brain" },
  { label: "Signale", sub: "Live Signal Feed", href: "/signal" },
  { label: "Komponenten", sub: "UI Component Library", href: "/komponenten" },
  { label: "Settings", sub: "Preferences & Config", href: "/settings" },
];

type TopbarProps = {
  sectionLabel: string;
};

export function Topbar({ sectionLabel }: TopbarProps) {
  const { activeProfile, profiles, setActiveProfile } = useHomeDashboard();
  const { headerHidden: hidden } = useHeaderState();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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

  const filteredPages = query.trim()
    ? PAGES.filter(
        (p) =>
          p.label.toLowerCase().includes(query.toLowerCase()) ||
          p.sub.toLowerCase().includes(query.toLowerCase()),
      )
    : PAGES;

  const h = hidden ? 0 : EXPANDED_H;

  return (
    <div style={{ height: h, overflow: "clip", transition: "height 200ms ease", flexShrink: 0 }}>
      <header className="flex shrink-0 items-center justify-between gap-4 px-8 pb-3 pt-4" style={{ overflow: "visible" }}>
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-white [font-family:var(--font-montserrat),sans-serif]">
            Welcome back, {activeProfile.name}!
          </h1>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-montserrat),sans-serif]">
            {sectionLabel}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Sentinel floating window trigger */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("sentinel-butler-toggle"))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2b30]/80 bg-[#141517] text-zinc-400 transition-colors hover:border-[rgba(214,184,108,0.25)] hover:text-[#e2ca7a]"
            aria-label="Sentinel"
            title="Sentinel"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Sentinel.png" alt="" width={20} height={20} style={{ objectFit: "contain", opacity: 0.75 }} />
          </button>

          {/* Search */}
          <div ref={searchRef} className="relative">
            <div
              className="flex h-9 min-w-[220px] cursor-text items-center gap-2 rounded-full border border-[#2a2b30]/80 bg-[#141517] px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus-within:border-[rgba(226,202,122,0.25)]"
              onClick={() => { setSearchOpen(true); inputRef.current?.focus(); }}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={2} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-zinc-500 [font-family:var(--font-montserrat),sans-serif]"
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
                  <p className="px-3 py-2 text-[12px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
                    Keine Ergebnisse
                  </p>
                ) : (
                  filteredPages.map((page) => (
                    <button
                      key={page.href}
                      type="button"
                      onClick={() => { router.push(page.href); setSearchOpen(false); setQuery(""); }}
                      className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="text-[13px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                        {page.label}
                      </span>
                      <span className="text-[11px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
                        {page.sub}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

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
                    <BadgeCheck className="h-[18px] w-[18px] text-[#e2ca7a]" fill="currentColor" stroke="#0c0d10" strokeWidth={1.5} aria-hidden />
                  </span>
                )}
              </div>
              <div className="text-left leading-tight">
                <p className="text-[14px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">{activeProfile.name}</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-montserrat),sans-serif]">PROFILE</p>
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
                          <BadgeCheck className="h-[14px] w-[14px] text-[#e2ca7a]" fill="currentColor" stroke="#0c0d10" strokeWidth={1.4} aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">{profile.name}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-montserrat),sans-serif]">PROFILE</p>
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[#e2ca7a]" strokeWidth={2.5} />}
                  </button>
                );
              })}
              <div className="my-1.5 h-px bg-white/[0.06]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setProfileOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 [font-family:var(--font-montserrat),sans-serif]"
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
