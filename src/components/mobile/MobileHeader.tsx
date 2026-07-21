"use client";
import Image from "next/image";
import { useState } from "react";
import { useUser } from "@/context/user-context";

const GOLD = "#e2ca7a";
const PAGES = [
  { label: "Home",        href: "/m/home"    },
  { label: "Monitoring",  href: "/monitoring" },
  { label: "Sentinel",    href: "/m/sentinel" },
  { label: "Signale",     href: "/m/signale"  },
  { label: "Brain Graph", href: "/brain"      },
  { label: "Analytics",   href: "/analytics"  },
  { label: "Komponenten", href: "/komponenten"},
  { label: "Settings",    href: "/settings"   },
];

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function MobileHeader({ hidden }: { hidden: boolean }) {
  const { user } = useUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const filtered = query.trim()
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES;

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 900,
          height: hidden ? 0 : 52,
          overflow: "hidden",
          transition: "height 200ms ease",
          background: "rgba(8,8,10,0.95)",
          backdropFilter: "blur(20px) saturate(1.8)",
          WebkitBackdropFilter: "blur(20px) saturate(1.8)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          paddingRight: 16,
          boxSizing: "border-box",
          gap: 10,
        }}
      >
        {/* Logo */}
        <div style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
          <Image src="/CAPITALIFE_ICON.png" alt="Capitalife" fill style={{ objectFit: "contain" }} />
        </div>

        {/* Welcome text */}
        <span style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
          fontFamily: "var(--font-montserrat,sans-serif)",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          Willkommen, <span style={{ color: GOLD }}>{firstName}</span>
        </span>

        {/* Search icon */}
        <button
          onClick={() => setSearchOpen(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.45)", padding: 4, lineHeight: 0, WebkitTapHighlightColor: "transparent" }}
          aria-label="Suche"
        >
          <IconSearch />
        </button>

        {/* User avatar */}
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(226,202,122,0.12)",
          border: "1px solid rgba(226,202,122,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, overflow: "hidden",
        }}>
          {user?.avatar ? (
            <Image src={user.avatar} alt={user.name} width={28} height={28} style={{ objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, fontFamily: "var(--font-nunito,sans-serif)" }}>
              {user?.name?.charAt(0) ?? "U"}
            </span>
          )}
        </div>
      </header>

      {/* Full-screen search overlay */}
      {searchOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(8,8,10,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Search bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}>
            <IconSearch />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Seite suchen…"
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#fff", fontSize: 16, fontFamily: "var(--font-montserrat,sans-serif)",
                fontWeight: 500,
              }}
            />
            <button
              onClick={() => { setSearchOpen(false); setQuery(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.45)", padding: 4, lineHeight: 0, WebkitTapHighlightColor: "transparent" }}
            >
              <IconX />
            </button>
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
            {filtered.map(p => (
              <a
                key={p.href}
                href={p.href}
                onClick={() => { setSearchOpen(false); setQuery(""); }}
                style={{
                  display: "block", padding: "14px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.8)", textDecoration: "none",
                  fontSize: 15, fontWeight: 600,
                  fontFamily: "var(--font-montserrat,sans-serif)",
                }}
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
