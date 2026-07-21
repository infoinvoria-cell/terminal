"use client";
import Image from "next/image";
import { useState } from "react";
import { useUser, APP_USERS, type AppUser } from "@/context/user-context";

const PAGES = [
  { label: "Home",        href: "/m/home"     },
  { label: "Monitoring",  href: "/monitoring"  },
  { label: "Sentinel",    href: "/m/sentinel"  },
  { label: "Signale",     href: "/m/signale"   },
  { label: "Brain Graph", href: "/brain"       },
  { label: "Analytics",   href: "/analytics"   },
  { label: "Komponenten", href: "/komponenten" },
  { label: "Settings",    href: "/settings"    },
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

function UserAvatar({ user, size = 32 }: { user: AppUser | null; size?: number }) {
  if (user?.avatar) {
    return (
      <Image
        src={user.avatar}
        alt={user?.name ?? "User"}
        width={size}
        height={size}
        style={{ objectFit: "cover", borderRadius: "50%", display: "block" }}
      />
    );
  }
  return (
    <span style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: "rgba(255,255,255,0.1)",
      fontSize: size * 0.38, fontWeight: 700,
      color: "rgba(255,255,255,0.8)",
      fontFamily: "var(--font-nunito,sans-serif)",
      flexShrink: 0,
    }}>
      {user?.name?.charAt(0) ?? "U"}
    </span>
  );
}

export function MobileHeader({ hidden }: { hidden: boolean }) {
  const { user, setUser } = useUser();
  const [searchOpen, setSearchOpen]       = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [query, setQuery]                 = useState("");

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const filtered  = query.trim()
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES;

  return (
    <>
      {/* ── Fixed header bar ── */}
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 900,
          height: hidden ? 0 : 52,
          overflow: "hidden",
          transition: "height 200ms ease",
          background: "#0c0d10",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center",
          paddingLeft: 14, paddingRight: 14,
          boxSizing: "border-box", gap: 10,
        }}
      >
        {/* Logo — hard refresh on click */}
        <button
          onClick={() => window.location.reload()}
          aria-label="Seite neu laden"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 0, lineHeight: 0, flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div style={{ position: "relative", width: 22, height: 22 }}>
            <Image src="/CAPITALIFE_ICON.png" alt="Capitalife" fill style={{ objectFit: "contain" }} />
          </div>
        </button>

        {/* Welcome text */}
        <span style={{
          flex: 1,
          fontSize: 13, fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
          fontFamily: "var(--font-montserrat,sans-serif)",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          Willkommen, {firstName}
        </span>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Suche"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.45)", padding: 4, lineHeight: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <IconSearch />
        </button>

        {/* User avatar — opens user switcher */}
        <button
          onClick={() => setUserPanelOpen(v => !v)}
          aria-label="User wechseln"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 0, lineHeight: 0, flexShrink: 0,
            borderRadius: "50%",
            WebkitTapHighlightColor: "transparent",
            outline: userPanelOpen ? "2px solid rgba(255,255,255,0.3)" : "none",
            outlineOffset: 2,
          }}
        >
          <UserAvatar user={user} size={30} />
        </button>
      </header>

      {/* ── User switcher panel ── */}
      {userPanelOpen && (
        <>
          {/* backdrop */}
          <div
            onClick={() => setUserPanelOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1100 }}
          />
          {/* panel */}
          <div style={{
            position: "fixed", top: 58, right: 14, zIndex: 1101,
            background: "linear-gradient(180deg,#1c1d20 0%,#141517 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            minWidth: 200,
            overflow: "hidden",
          }}>
            <p style={{
              margin: 0, padding: "10px 14px 6px",
              fontSize: 10, fontWeight: 600,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase", letterSpacing: "0.07em",
              fontFamily: "var(--font-montserrat,sans-serif)",
            }}>
              User wechseln
            </p>
            {APP_USERS.map(u => {
              const active = user?.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => { setUser(u); setUserPanelOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 14px",
                    background: active ? "rgba(255,255,255,0.07)" : "transparent",
                    border: "none", cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <UserAvatar user={u} size={32} />
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? "#ffffff" : "rgba(255,255,255,0.65)",
                      fontFamily: "var(--font-montserrat,sans-serif)",
                      whiteSpace: "nowrap",
                    }}>
                      {u.name}
                    </p>
                    {active && (
                      <p style={{
                        margin: 0, fontSize: 10,
                        color: "rgba(255,255,255,0.35)",
                        fontFamily: "var(--font-montserrat,sans-serif)",
                      }}>
                        Aktiv
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Full-screen search overlay ── */}
      {searchOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(8,8,10,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          display: "flex", flexDirection: "column",
        }}>
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
                color: "#fff", fontSize: 16,
                fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 500,
              }}
            />
            <button
              onClick={() => { setSearchOpen(false); setQuery(""); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.45)", padding: 4, lineHeight: 0,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <IconX />
            </button>
          </div>
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
