"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { X, Minus, Maximize2 } from "lucide-react";
import { SentinelSessionProvider } from "@/components/sentinel/sentinel-session-provider";

const SentinelDashboard = dynamic(
  () => import("@/components/sentinel/sentinel-dashboard").then((module) => module.SentinelDashboard),
  { ssr: false },
);

// ── Snap positions ────────────────────────────────────────────────────────────
type SnapPos = "TL" | "TC" | "TR" | "ML" | "MC" | "MR" | "BL" | "BC" | "BR";

const DEFAULT_W = 520;
const DEFAULT_H = 640;
const SNAP_THRESHOLD = 120; // px from edge to trigger snap

function getSnappedStyle(pos: SnapPos, w: number, h: number): React.CSSProperties {
  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = (vw - w) / 2;
  const cy = (vh - h) / 2;

  const map: Record<SnapPos, React.CSSProperties> = {
    TL: { left: pad,      top: pad },
    TC: { left: cx,       top: pad },
    TR: { left: vw-w-pad, top: pad },
    ML: { left: pad,      top: cy },
    MC: { left: cx,       top: cy },
    MR: { left: vw-w-pad, top: cy },
    BL: { left: pad,      top: vh-h-pad },
    BC: { left: cx,       top: vh-h-pad },
    BR: { left: vw-w-pad, top: vh-h-pad },
  };
  return map[pos];
}

function detectSnap(x: number, y: number, w: number, h: number): SnapPos | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const T = SNAP_THRESHOLD;
  const nearL = x < T;
  const nearR = x + w > vw - T;
  const nearT = y < T;
  const nearB = y + h > vh - T;
  const nearH = Math.abs(y + h / 2 - vh / 2) < T;
  const nearV = Math.abs(x + w / 2 - vw / 2) < T;

  if (nearT && nearL) return "TL";
  if (nearT && nearR) return "TR";
  if (nearT && nearV) return "TC";
  if (nearB && nearL) return "BL";
  if (nearB && nearR) return "BR";
  if (nearB && nearV) return "BC";
  if (nearL && nearH) return "ML";
  if (nearR && nearH) return "MR";
  if (nearV && nearH) return "MC";
  return null;
}

export function SentinelFloatingWindow() {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [snapPos, setSnapPos] = useState<SnapPos | null>("BR");
  const [snapHint, setSnapHint] = useState<SnapPos | null>(null);

  const winRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const resizeRef = useRef<{ ox: number; oy: number; sw: number; sh: number } | null>(null);

  // Listen for toggle event from header
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("sentinel-butler-toggle", handler);
    return () => window.removeEventListener("sentinel-butler-toggle", handler);
  }, []);

  // Set initial position bottom-right on first open
  useEffect(() => {
    if (open && pos === null && snapPos === null) {
      setSnapPos("BR");
    }
  }, [open, pos, snapPos]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = winRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSnapPos(null);
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: rect.left, py: rect.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.ox;
      const dy = ev.clientY - dragRef.current.oy;
      const nx = dragRef.current.px + dx;
      const ny = dragRef.current.py + dy;
      setPos({ x: nx, y: ny });
      setSnapHint(detectSnap(nx, ny, size.w, size.h));
    };
    const onUp = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.ox;
      const dy = ev.clientY - dragRef.current.oy;
      const nx = dragRef.current.px + dx;
      const ny = dragRef.current.py + dy;
      const snap = detectSnap(nx, ny, size.w, size.h);
      if (snap) { setSnapPos(snap); setPos(null); }
      else setPos({ x: nx, y: ny });
      setSnapHint(null);
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size]);

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { ox: e.clientX, oy: e.clientY, sw: size.w, sh: size.h };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const nw = Math.max(360, resizeRef.current.sw + ev.clientX - resizeRef.current.ox);
      const nh = Math.max(300, resizeRef.current.sh + ev.clientY - resizeRef.current.oy);
      setSize({ w: nw, h: nh });
      // Clear snap so position doesn't jump
      if (snapPos !== null) {
        const rect = winRef.current?.getBoundingClientRect();
        if (rect) { setPos({ x: rect.left, y: rect.top }); setSnapPos(null); }
      }
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size, snapPos]);

  if (!open) return null;

  // Compute final CSS position
  let left: number | undefined;
  let top: number | undefined;
  if (snapPos) {
    const style = getSnappedStyle(snapPos, size.w, minimised ? 44 : size.h);
    left = style.left as number;
    top = style.top as number;
  } else if (pos) {
    left = pos.x;
    top = pos.y;
  } else {
    left = window.innerWidth - size.w - 16;
    top = window.innerHeight - size.h - 16;
  }

  const currentH = minimised ? 44 : size.h;

  return (
    <>
      {/* Snap ghost overlay */}
      {snapHint && (
        <div
          style={{
            position: "fixed",
            zIndex: 2147483000,
            pointerEvents: "none",
            ...((() => {
              const s = getSnappedStyle(snapHint, size.w, size.h);
              return { left: s.left, top: s.top, width: size.w, height: size.h };
            })()),
            background: "rgba(226,202,122,0.08)",
            border: "1px dashed rgba(226,202,122,0.35)",
            borderRadius: 16,
          }}
        />
      )}

      {/* Floating window */}
      <div
        ref={winRef}
        style={{
          position: "fixed",
          left,
          top,
          width: size.w,
          height: currentH,
          zIndex: 2147483001,
          display: "flex",
          flexDirection: "column",
          background: "#0d0e11",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          boxShadow: "0 24px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          transition: "height 150ms ease",
          userSelect: dragRef.current ? "none" : undefined,
        }}
      >
        {/* Title bar — drag handle */}
        <div
          onMouseDown={onDragStart}
          style={{
            flex: "0 0 44px",
            display: "flex",
            alignItems: "center",
            paddingLeft: 14,
            paddingRight: 8,
            gap: 8,
            cursor: "grab",
            background: "rgba(255,255,255,0.025)",
            borderBottom: minimised ? "none" : "1px solid rgba(255,255,255,0.08)",
            userSelect: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Sentinel.png" alt="" width={18} height={18} style={{ opacity: 0.7, objectFit: "contain" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", fontFamily: "var(--font-montserrat,sans-serif)", flex: 1 }}>
            Sentinel
          </span>
          {/* Snap position picker */}
          <div style={{ display: "flex", gap: 2, marginRight: 4 }}>
            {(["TL","TC","TR","ML","MC","MR","BL","BC","BR"] as SnapPos[]).map((sp) => (
              <button
                key={sp}
                type="button"
                title={sp}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { setSnapPos(sp); setPos(null); }}
                style={{
                  width: 7, height: 7, borderRadius: 2, border: "none", cursor: "pointer", padding: 0,
                  background: snapPos === sp ? "#e2ca7a" : "rgba(255,255,255,0.15)",
                  transition: "background 0.1s",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMinimised((v) => !v)}
            title={minimised ? "Wiederherstellen" : "Minimieren"}
            style={iconBtnStyle}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { window.location.href = "/sentinel"; }}
            title="Als Seite öffnen"
            style={iconBtnStyle}
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setOpen(false)}
            title="Schließen"
            style={{ ...iconBtnStyle, color: "rgba(255,100,100,0.7)" }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Content */}
        {!minimised && (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
            <SentinelSessionProvider>
              <SentinelDashboard />
            </SentinelSessionProvider>
          </div>
        )}

        {/* Resize handle */}
        {!minimised && (
          <div
            onMouseDown={onResizeStart}
            title="Größe ändern"
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 18,
              height: 18,
              cursor: "nwse-resize",
              zIndex: 10,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: 3,
              opacity: 0.4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M9 1L1 9M9 5L5 9M9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>
    </>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: "none", background: "none",
  color: "rgba(255,255,255,0.45)", cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center", transition: "color 0.1s, background 0.1s",
};
