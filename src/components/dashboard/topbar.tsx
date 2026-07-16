"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BadgeCheck, Bell, ChevronDown, Search } from "lucide-react";
import { useHomeDashboard } from "@/context/home-dashboard-context";

type TopbarProps = {
  sectionLabel: string;
};

export function Topbar({ sectionLabel }: TopbarProps) {
  const { activeProfile, profiles, setActiveProfile } = useHomeDashboard();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onWindowClick(event: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 px-8 pb-3 pt-4">
      <div>
        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-white [font-family:var(--font-montserrat),sans-serif]">
          Welcome back, {activeProfile.name}!
        </h1>
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-montserrat),sans-serif]">
          {sectionLabel}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-9 min-w-[200px] items-center gap-2 rounded-full border border-[#2a2b30]/80 bg-[#141517] px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={2} />
          <span className="text-[13px] text-zinc-500 [font-family:var(--font-montserrat),sans-serif]">
            Search
          </span>
        </div>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <div ref={dropdownRef} className="relative pl-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen((current) => !current);
            }}
            className="flex items-center gap-2.5 rounded-xl border border-transparent px-1.5 py-1 transition-colors hover:border-white/[0.08]"
            aria-haspopup="menu"
            aria-expanded={open}
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
              <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#0c0d10] ring-2 ring-[#0c0d10]">
                <BadgeCheck
                  className="h-[18px] w-[18px] text-[#e2ca7a]"
                  fill="currentColor"
                  stroke="#0c0d10"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="leading-tight text-left">
                <p className="text-[14px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                  {activeProfile.name}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-montserrat),sans-serif]">
                  PROFILE
                </p>
              </div>
              <ChevronDown
                className="mt-0.5 h-3.5 w-3.5 text-zinc-500"
                strokeWidth={2}
              />
            </div>
          </button>

          {open ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[230px] rounded-xl border border-white/[0.08] bg-[#121316] p-1.5 shadow-[0_16px_42px_-12px_rgba(0,0,0,0.75)]">
              {profiles.map((profile) => {
                const active = profile.id === activeProfile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setActiveProfile(profile.id);
                      setOpen(false);
                    }}
                    className={
                      active
                        ? "flex w-full items-center gap-2.5 rounded-lg border border-[#e2ca7a]/40 bg-gradient-to-b from-[#1c1d20] to-[#141517] px-2.5 py-2 text-left"
                        : "flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-white/[0.06] hover:bg-white/[0.03]"
                    }
                    role="menuitem"
                  >
                    <div className="relative h-8 w-8 shrink-0">
                      <Image
                        src={profile.avatarSrc}
                        alt={profile.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover ring-1 ring-white/[0.06]"
                      />
                      {profile.verified ? (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#0c0d10] ring-2 ring-[#0c0d10]">
                          <BadgeCheck
                            className="h-[14px] w-[14px] text-[#e2ca7a]"
                            fill="currentColor"
                            stroke="#0c0d10"
                            strokeWidth={1.4}
                            aria-hidden
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
                        {profile.name}
                      </p>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[color:var(--dash-section-label)] [font-family:var(--font-montserrat),sans-serif]">
                        PROFILE
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
