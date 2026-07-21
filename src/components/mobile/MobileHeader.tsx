"use client";
import Image from "next/image";
import { useState } from "react";
import { useUser, APP_USERS, type AppUser } from "@/context/user-context";

const PAGES = [
  { label: "Home",        href: "/m/home"        },
  { label: "Monitoring",  href: "/m/monitoring"  },
  { label: "Sentinel",    href: "/m/sentinel"    },
  { label: "Signale",     href: "/m/signale"     },
  { label: "Onboarding",  href: "/m/onboarding"  },
  { label: "Brain Graph", href: "/brain"         },
  { label: "Analytics",   href: "/analytics"     },
  { label: "Komponenten", href: "/komponenten"   },
  { label: "Settings",    href: "/settings"      },
];

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function IconX() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// Circular avatar — always clips to circle, shows image or initial
function Avatar({ user, size }: { user: AppUser | null; size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      overflow: "hidden", flexShrink: 0,
      background: "rgba(255,255,255,0.12)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      {user?.avatar ? (
        <Image
          src={user.avatar}
          alt={user.name}
          fill
          sizes={`${size}px`}
          style={{ objectFit: "cover" }}
        />
      ) : (
        <span style={{
          fontSize: Math.round(size * 0.4), fontWeight: 700,
          color: "rgba(255,255,255,0.85)",
          fontFamily: "var(--font-nunito,sans-serif)",
          lineHeight: 1, userSelect: "none",
        }}>
          {user?.name?.charAt(0) ?? "?"}
        </span>
      )}
    </div>
  );
}

export function MobileHeader({ hidden }: { hidden: boolean }) {
  const { user, setUser }                     = useUser();
  const [searchOpen,    setSearchOpen]        = useState(false);
  const [userPanelOpen, setUserPanelOpen]     = useState(false);
  const [query,         setQuery]             = useState("");

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const filtered  = query.trim()
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES;

  return (
    <>
      {/* ── Fixed header bar ──────────────────────────────────────────────── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 900,
        height: hidden ? 0 : 52,
        overflow: "hidden",
        transition: "height 200ms ease",
        background: "#0c0d10",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center",
        paddingLeft: 14, paddingRight: 14,
        boxSizing: "border-box", gap: 10,
      }}>
        {/* Logo — hard refresh */}
        <button onClick={() => window.location.reload()} aria-label="Seite neu laden"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
          <div style={{ position: "relative", width: 22, height: 22 }}>
            <Image src="/CAPITALIFE_ICON.png" alt="Capitalife" fill sizes="22px" style={{ objectFit: "contain" }} />
          </div>
        </button>

        {/* Welcome */}
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600,
          color: "rgba(255,255,255,0.82)",
          fontFamily: "var(--font-montserrat,sans-serif)",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          Willkommen, {firstName}
        </span>

        {/* Search */}
        <button onClick={() => setSearchOpen(true)} aria-label="Suche"
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.42)", padding: 4, lineHeight: 0, WebkitTapHighlightColor: "transparent" }}>
          <IconSearch />
        </button>

        {/* User avatar button — clearly visible ring when open */}
        <button
          onClick={() => setUserPanelOpen(v => !v)}
          aria-label="User wechseln"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 0, lineHeight: 0, flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
            borderRadius: "50%",
            outline: userPanelOpen ? "2px solid rgba(255,255,255,0.5)" : "2px solid rgba(255,255,255,0.18)",
            outlineOffset: 2,
          }}
        >
          <Avatar user={user} size={28} />
        </button>
      </header>

      {/* ── User switcher panel ───────────────────────────────────────────── */}
      {userPanelOpen && (
        <>
          <div onClick={() => setUserPanelOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1099 }} />
          <div style={{
            position: "fixed", top: 58, right: 14, zIndex: 1100,
            background: "linear-gradient(180deg,#1e1f23 0%,#16171a 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
            minWidth: 210, overflow: "hidden",
          }}>
            <p style={{
              margin: 0, padding: "10px 14px 8px",
              fontSize: 9.5, fontWeight: 600,
              color: "rgba(255,255,255,0.28)",
              textTransform: "uppercase", letterSpacing: "0.07em",
              fontFamily: "var(--font-montserrat,sans-serif)",
            }}>
              User wechseln
            </p>

            {APP_USERS.map((u, i) => {
              const active = user?.id === u.id;
              return (
                <button key={u.id} onClick={() => { setUser(u); setUserPanelOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    width: "100%", padding: "10px 14px",
                    background: active ? "rgba(255,255,255,0.07)" : "transparent",
                    border: "none",
                    borderTop: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer", WebkitTapHighlightColor: "transparent",
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    borderRadius: "50%",
                    outline: active ? "2px solid rgba(255,255,255,0.5)" : "none",
                    outlineOffset: 2,
                    flexShrink: 0,
                  }}>
                    <Avatar user={u} size={36} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? "#ffffff" : "rgba(255,255,255,0.6)",
                      fontFamily: "var(--font-montserrat,sans-serif)",
                      whiteSpace: "nowrap",
                    }}>
                      {u.name}
                    </p>
                    <p style={{
                      margin: 0, fontSize: 10,
                      color: active ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.22)",
                      fontFamily: "var(--font-montserrat,sans-serif)",
                    }}>
                      {`User ${i + 1}`}{active ? " · Aktiv" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Full-screen search ─────────────────────────────────────────────── */}
      {searchOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(8,8,10,0.97)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <IconSearch />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Seite suchen…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 16, fontFamily: "var(--font-montserrat,sans-serif)", fontWeight: 500 }} />
            <button onClick={() => { setSearchOpen(false); setQuery(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.45)", padding: 4, lineHeight: 0, WebkitTapHighlightColor: "transparent" }}>
              <IconX />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
            {filtered.map(p => (
              <a key={p.href} href={p.href} onClick={() => { setSearchOpen(false); setQuery(""); }}
                style={{ display: "block", padding: "13px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", textDecoration: "none", fontSize: 15, fontWeight: 600, fontFamily: "var(--font-montserrat,sans-serif)" }}>
                {p.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
