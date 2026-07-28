"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Maximize, RotateCcw } from "lucide-react";
import { TIER_COLORS } from "@/lib/partner/tierColors";
import type { PartnerTierId } from "@/lib/partner/partnerProgramConfig";

// ── Canvas constants ──────────────────────────────────────────────────────────

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const CANVAS_W = 2800;
const CANVAS_H = 4800;
const INITIAL_ZOOM = 0.55;

// ── Data structures ───────────────────────────────────────────────────────────

interface WbNode {
  id: string;
  title: string;
  bullets: string[];
  keywords: string[];
  detail?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

interface WbSection {
  id: string;
  title: string;
  y: number;
  color: string;
  nodes: WbNode[];
}

// ── Canvas data ───────────────────────────────────────────────────────────────

const NODE_W = 580;
const NODE_H = 220;
const NODE_GAP = 60;
const SECTION_COLS = 4;
const SECTION_PAD_X = 80;

function makeNodes(sectionY: number, color: string, items: Array<{ title: string; bullets: string[]; keywords: string[]; detail?: string }>): WbNode[] {
  return items.map((item, i) => {
    const col = i % SECTION_COLS;
    const row = Math.floor(i / SECTION_COLS);
    return {
      id: `node-${sectionY}-${i}`,
      title: item.title,
      bullets: item.bullets,
      keywords: item.keywords,
      detail: item.detail,
      x: SECTION_PAD_X + col * (NODE_W + NODE_GAP),
      y: sectionY + row * (NODE_H + NODE_GAP),
      w: NODE_W,
      h: NODE_H,
      color,
    };
  });
}

const SECTIONS: WbSection[] = [
  {
    id: "einstieg",
    title: "1 — Partner-Einstieg",
    y: 40,
    color: "#c99e3e",
    nodes: makeNodes(120, "#c99e3e", [
      {
        title: "Registrierung & Rolle",
        bullets: ["Partner-Account anlegen", "Rolle wählen: Vermittler", "Zugang zu Partner-Portal"],
        keywords: ["Onboarding", "Rolle", "Portal"],
        detail: "Der Partner registriert sich im Capitalife-System und wählt die Vermittlerrolle.",
      },
      {
        title: "KYC / Compliance",
        bullets: ["Identitätsprüfung (KYC)", "Anti-Geldwäsche (AML)", "Regulatorische Freigabe"],
        keywords: ["KYC", "AML", "Compliance"],
      },
      {
        title: "Partnervertrag",
        bullets: ["Vertragsunterzeichnung", "Provisionsvereinbarung", "Datenschutz & NDA"],
        keywords: ["Vertrag", "NDA", "Provision"],
      },
      {
        title: "Vermittlerstruktur",
        bullets: ["Eigene Partnerkennung", "Teamstruktur (Tiefe 1)", "Volumen-Tracking"],
        keywords: ["Teamstruktur", "Volumen", "Tracking"],
      },
    ]),
  },
  {
    id: "gewinnung",
    title: "2 — Investorengewinnung",
    y: 560,
    color: "#5b9cf6",
    nodes: makeNodes(640, "#5b9cf6", [
      {
        title: "Lead & Erstkontakt",
        bullets: ["Identifikation Investoren", "Erstkontakt herstellen", "Interesse wecken"],
        keywords: ["Lead", "Akquise", "Erstkontakt"],
      },
      {
        title: "Beratung & Qualifikation",
        bullets: ["Investitionsziele klären", "Qualifikationsprüfung", "Produktpräsentation"],
        keywords: ["Beratung", "Qualifikation", "Präsentation"],
      },
      {
        title: "Risikohinweis",
        bullets: ["Risikoaufklärung (MiFID)", "Dokumentation", "Unterschrift Aufklärungsprotokoll"],
        keywords: ["Risiko", "MiFID", "Protokoll"],
      },
      {
        title: "Zeichnung",
        bullets: ["Zeichnungsschein ausfüllen", "Bindungsdauer wählen", "Betrag festlegen"],
        keywords: ["Zeichnung", "Betrag", "Laufzeit"],
      },
    ]),
  },
  {
    id: "kapital",
    title: "3 — Kapitalprozess",
    y: 1080,
    color: "#4ade80",
    nodes: makeNodes(1160, "#4ade80", [
      {
        title: "Vertragsunterzeichnung",
        bullets: ["Finalvertrag unterzeichnen", "Notarielle Beglaubigung (opt.)", "Exemplar für Investor"],
        keywords: ["Vertrag", "Unterzeichnung"],
      },
      {
        title: "Geldeingang",
        bullets: ["Kapitalüberweisung", "Bestätigungs-E-Mail", "Buchungsprüfung"],
        keywords: ["Überweisung", "Kapital", "Buchung"],
      },
      {
        title: "KYC/AML-Abschluss",
        bullets: ["Vollständige AML-Prüfung", "PEP-Screening", "Freigabe durch Compliance"],
        keywords: ["AML", "PEP", "Freigabe"],
      },
      {
        title: "Aktivierung & Lock-up",
        bullets: ["Investment aktiviert", "Lock-up-Periode startet", "Widerrufsfrist abgelaufen"],
        keywords: ["Aktivierung", "Lock-up", "Widerruf"],
      },
    ]),
  },
  {
    id: "verguetung",
    title: "4 — Vergütung",
    y: 1600,
    color: "#e2ca7a",
    nodes: makeNodes(1680, "#e2ca7a", [
      {
        title: "AP (Abschlussprovision)",
        bullets: ["Bei Aktivierung fällig", "0,5 % / 1,0 % / 1,5 %", "Bindungsdauer abhängig"],
        keywords: ["AP", "Provision", "Abschluss"],
      },
      {
        title: "Mgmt. Fee 3 % p.a.",
        bullets: ["Jährlich auf AUM", "12,5 % → InnoInvest", "87,5 % → CL-Pool"],
        keywords: ["Verwaltung", "AUM", "Jährlich"],
      },
      {
        title: "Performance Fee 25 %",
        bullets: ["25 % des Investorengewinns", "Nur bei positivem Ergebnis", "Ausgangsbasis für Verteilung"],
        keywords: ["Performance", "Gewinnbeteiligung"],
      },
      {
        title: "InnoInvest 12,5 %",
        bullets: ["12,5 % der Performance Fee", "Haftungsdach-Kosten", "Fest, nicht verhandelbar"],
        keywords: ["InnoInvest", "Haftungsdach"],
      },
      {
        title: "Partneranteil (nach Stufe)",
        bullets: ["Bronze 20 % · Silber 30 %", "Gold 40 % · Platin 50 %", "Black 60 % (des CL-Anteils)"],
        keywords: ["Stufe", "Anteil", "CL-Basis"],
      },
    ]),
  },
  {
    id: "entwicklung",
    title: "5 — Partnerentwicklung",
    y: 2200,
    color: "#c07840",
    nodes: makeNodes(2280, "#c07840", [
      {
        title: "Eigenes Volumen",
        bullets: ["Aktiv investiertes Kapital", "Direkte Zeichnungen", "Bleibt aktiv bis Rückzahlung"],
        keywords: ["Eigenes AuM", "Kapital"],
      },
      {
        title: "Teamvolumen",
        bullets: ["Kapital direkter Teampartner", "Tiefe 1 (aktuell)", "Addiert zum Gesamtvolumen"],
        keywords: ["Team", "Tiefe 1"],
      },
      {
        title: "Stufenaufstieg",
        bullets: ["Volumen überschreitet Schwelle", "Automatischer Tier-Wechsel", "Höherer CL-Anteil"],
        keywords: ["Tier", "Aufstieg", "Schwelle"],
      },
      {
        title: "Founder-Programm",
        bullets: ["Schwellen –50 % reduziert", "Kein Unterschied in Sätzen", "Früher Aufstieg möglich"],
        keywords: ["Founder", "–50 %", "Einstieg"],
      },
      {
        title: "Platin / Black",
        bullets: ["Platin ab 2 Mio (1 Mio Founder)", "Black ab 5 Mio (2,5 Mio Founder)", "Mgmt. Fee-Beteiligung (TBD)"],
        keywords: ["Platin", "Black", "Elite"],
      },
    ]),
  },
  {
    id: "ergebnis",
    title: "6 — Ergebnis",
    y: 2720,
    color: "#8a8a9e",
    nodes: makeNodes(2800, "#8a8a9e", [
      {
        title: "Investorertrag",
        bullets: ["75 % des Gewinns", "Kapital zurück nach Laufzeit", "Lock-up eingehalten"],
        keywords: ["Investor", "75 %", "Rückzahlung"],
      },
      {
        title: "Vermittlerertrag",
        bullets: ["AP + PF-Anteil + MF (opt.)", "Stufen-abhängig", "Kumuliert über Laufzeit"],
        keywords: ["Vermittler", "Provision", "AP"],
      },
      {
        title: "InnoInvest-Ertrag",
        bullets: ["12,5 % PF + 12,5 % MF", "Haftungsdach-Vergütung", "Fest pro Investment"],
        keywords: ["InnoInvest", "Haftung"],
      },
      {
        title: "CL-Ertrag",
        bullets: ["CL-PF Rest + CL-MF Netto", "Finanziert Betrieb & AP", "Nach allen Abzügen"],
        keywords: ["CL", "Netto", "Betrieb"],
      },
    ]),
  },
];

// ── Pan/Zoom state ─────────────────────────────────────────────────────────────

interface PanZoom { x: number; y: number; zoom: number }

// ── Node card component ───────────────────────────────────────────────────────

function NodeCard({ node, onClick, isSelected }: {
  node: WbNode;
  onClick: (id: string) => void;
  isSelected: boolean;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        background: "linear-gradient(180deg, #1c1d20 0%, #141517 100%)",
        border: `1.5px solid ${isSelected ? (node.color ?? "#e2ca7a") : "rgba(255,255,255,0.08)"}`,
        borderRadius: 14,
        padding: "16px 18px 12px",
        cursor: "pointer",
        boxShadow: isSelected
          ? `0 0 0 2px ${node.color ?? "#e2ca7a"}40, 0 8px 32px rgba(0,0,0,0.6)`
          : "0 4px 20px rgba(0,0,0,0.4)",
        transition: "border-color 0.15s, box-shadow 0.15s",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Color accent bar */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 3,
        borderRadius: "14px 14px 0 0",
        background: node.color ?? "#e2ca7a",
        opacity: 0.7,
      }} />

      {/* Title */}
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#f0f0f0",
        lineHeight: 1.3,
        marginTop: 4,
      }}>
        {node.title}
      </div>

      {/* Bullets */}
      <ul style={{ margin: 0, padding: "0 0 0 14px", listStyle: "disc", flex: 1 }}>
        {node.bullets.map((b, i) => (
          <li key={i} style={{ fontSize: 10.5, color: "#a1a1aa", lineHeight: 1.5, marginBottom: 2 }}>
            {b}
          </li>
        ))}
      </ul>

      {/* Keywords */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {node.keywords.map((kw) => (
          <span key={kw} style={{
            fontSize: 9,
            color: node.color ?? "#e2ca7a",
            background: `${node.color ?? "#e2ca7a"}18`,
            border: `1px solid ${node.color ?? "#e2ca7a"}35`,
            borderRadius: 5,
            padding: "1px 6px",
          }}>
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Section label component ────────────────────────────────────────────────────

function SectionLabel({ section }: { section: WbSection }) {
  return (
    <div style={{
      position: "absolute",
      left: SECTION_PAD_X,
      top: section.y,
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: `${section.color}25`,
        border: `1.5px solid ${section.color}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: section.color }} />
      </div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: `${section.color}cc`,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        {section.title}
      </div>
    </div>
  );
}

// ── Detail popover ─────────────────────────────────────────────────────────────

function DetailPopover({ node, onClose }: { node: WbNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y + node.h + 10,
        width: node.w,
        background: "#1c1d20",
        border: `1.5px solid ${node.color ?? "#e2ca7a"}55`,
        borderRadius: 10,
        padding: "12px 14px",
        zIndex: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: node.color ?? "#e2ca7a" }}>Detail</div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", padding: 0 }}
        >
          <X size={12} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.6 }}>
        {node.detail ?? "Keine weiteren Details verfügbar."}
      </div>
    </div>
  );
}

// ── Control button ─────────────────────────────────────────────────────────────

function CtrlBtn({ onClick, title, children }: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 36, height: 36,
        background: "rgba(28,29,32,0.9)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        color: "#a1a1aa",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(40,42,48,0.95)";
        (e.currentTarget as HTMLButtonElement).style.color = "#f0f0f0";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(28,29,32,0.9)";
        (e.currentTarget as HTMLButtonElement).style.color = "#a1a1aa";
      }}
    >
      {children}
    </button>
  );
}

// ── Main whiteboard component ─────────────────────────────────────────────────

export function PartnerWhiteboard({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const lastTouches = useRef<Array<{ x: number; y: number }>>([]);

  const [pz, setPz] = useState<PanZoom>(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    return {
      zoom: INITIAL_ZOOM,
      x: (vw - CANVAS_W * INITIAL_ZOOM) / 2,
      y: 40,
    };
  });

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Get selected node data
  const selectedNodeData = selectedNode
    ? SECTIONS.flatMap((s) => s.nodes).find((n) => n.id === selectedNode) ?? null
    : null;

  // ── ESC key ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Touch move prevention ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    const handler = (e: TouchEvent) => e.preventDefault();
    el?.addEventListener("touchmove", handler, { passive: false });
    return () => el?.removeEventListener("touchmove", handler);
  }, []);

  // ── Mouse pan ─────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPz((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setPz((prev) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
      const newX = mx - (mx - prev.x) * (newZoom / prev.zoom);
      const newY = my - (my - prev.y) * (newZoom / prev.zoom);
      return { x: newX, y: newY, zoom: newZoom };
    });
  }, []);

  // ── Touch events ──────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
    lastTouches.current = touches;
    if (touches.length === 1) {
      isPanning.current = true;
      lastPos.current = { x: touches[0].x, y: touches[0].y };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
    if (touches.length === 1 && isPanning.current) {
      const dx = touches[0].x - lastPos.current.x;
      const dy = touches[0].y - lastPos.current.y;
      lastPos.current = { x: touches[0].x, y: touches[0].y };
      setPz((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (touches.length === 2 && lastTouches.current.length === 2) {
      const prevDist = Math.hypot(
        lastTouches.current[1].x - lastTouches.current[0].x,
        lastTouches.current[1].y - lastTouches.current[0].y,
      );
      const newDist = Math.hypot(
        touches[1].x - touches[0].x,
        touches[1].y - touches[0].y,
      );
      const factor = newDist / prevDist;
      const midX = (touches[0].x + touches[1].x) / 2;
      const midY = (touches[0].y + touches[1].y) / 2;
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = midX - rect.left;
      const my = midY - rect.top;
      setPz((prev) => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
        const newX = mx - (mx - prev.x) * (newZoom / prev.zoom);
        const newY = my - (my - prev.y) * (newZoom / prev.zoom);
        return { x: newX, y: newY, zoom: newZoom };
      });
    }
    lastTouches.current = touches;
  }, []);

  const onTouchEnd = useCallback(() => {
    isPanning.current = false;
    lastTouches.current = [];
  }, []);

  // ── Fit to screen ─────────────────────────────────────────────────────────
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const fitZoom = Math.min(
      clientWidth / CANVAS_W,
      clientHeight / CANVAS_H,
    ) * 0.9;
    const fitX = (clientWidth - CANVAS_W * fitZoom) / 2;
    const fitY = (clientHeight - CANVAS_H * fitZoom) / 2;
    setPz({ zoom: fitZoom, x: fitX, y: fitY });
  }, []);

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const vw = containerRef.current.clientWidth;
    setPz({
      zoom: INITIAL_ZOOM,
      x: (vw - CANVAS_W * INITIAL_ZOOM) / 2,
      y: 40,
    });
  }, []);

  const zoomIn = useCallback(() => {
    setPz((prev) => ({ ...prev, zoom: Math.min(MAX_ZOOM, prev.zoom * 1.2) }));
  }, []);

  const zoomOut = useCallback(() => {
    setPz((prev) => ({ ...prev, zoom: Math.max(MIN_ZOOM, prev.zoom * 0.8) }));
  }, []);

  const dotBgX = pz.x % (20 * pz.zoom);
  const dotBgY = pz.y % (20 * pz.zoom);

  // Tier badge row
  const tierIds: PartnerTierId[] = ["bronze", "silver", "gold", "platin", "black"];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0a0b0e",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header overlay */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "linear-gradient(180deg, rgba(10,11,14,0.95) 0%, transparent 100%)",
        pointerEvents: "none",
      }}>
        <div style={{ pointerEvents: "none" }}>
          <div style={{
            fontSize: 8.5, fontWeight: 700,
            color: "rgba(226,202,122,0.6)",
            letterSpacing: "0.14em", textTransform: "uppercase",
          }}>
            Capitalife Partnerprogramm
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(240,240,240,0.85)", marginTop: 1 }}>
            Strukturmodell
          </div>
        </div>

        {/* Tier badges */}
        <div style={{ display: "flex", gap: 6, pointerEvents: "none" }}>
          {tierIds.map((tid) => {
            const tc = TIER_COLORS[tid];
            return (
              <div key={tid} style={{
                background: tc.badgeBg,
                border: `1px solid ${tc.stroke}55`,
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 9,
                fontWeight: 700,
                color: tc.text,
              }}>
                {tc.label}
              </div>
            );
          })}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            pointerEvents: "auto",
            width: 36, height: 36,
            background: "rgba(28,29,32,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#a1a1aa",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "hidden",
          cursor: isPanning.current ? "grabbing" : "grab",
          position: "relative",
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)`,
          backgroundSize: `${20 * pz.zoom}px ${20 * pz.zoom}px`,
          backgroundPosition: `${dotBgX}px ${dotBgY}px`,
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => setSelectedNode(null)}
      >
        {/* Transformed canvas */}
        <div style={{
          position: "absolute",
          left: 0, top: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(${pz.x}px, ${pz.y}px) scale(${pz.zoom})`,
          transformOrigin: "0 0",
          userSelect: isPanning.current ? "none" : "auto",
        }}>
          {/* SVG connection lines */}
          <svg
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
            width={CANVAS_W}
            height={CANVAS_H}
          >
            {SECTIONS.slice(0, -1).map((section, si) => {
              const nextSection = SECTIONS[si + 1];
              const lastNode = section.nodes[section.nodes.length - 1];
              const firstNextNode = nextSection.nodes[0];
              const x1 = lastNode.x + lastNode.w / 2;
              const y1 = lastNode.y + lastNode.h;
              const x2 = firstNextNode.x + firstNextNode.w / 2;
              const y2 = firstNextNode.y;
              return (
                <line
                  key={section.id}
                  x1={x1} y1={y1}
                  x2={x2} y2={y2}
                  stroke="rgba(226,202,122,0.2)"
                  strokeWidth={2}
                  strokeDasharray="10 6"
                />
              );
            })}
          </svg>

          {/* Sections */}
          {SECTIONS.map((section) => (
            <div key={section.id}>
              <SectionLabel section={section} />
              {section.nodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  onClick={setSelectedNode}
                  isSelected={selectedNode === node.id}
                />
              ))}
              {selectedNodeData && selectedNode && section.nodes.find((n) => n.id === selectedNode) && (
                <DetailPopover
                  node={selectedNodeData}
                  onClose={() => setSelectedNode(null)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Control buttons (bottom right) */}
      <div style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        zIndex: 20,
      }}>
        <CtrlBtn onClick={zoomIn} title="Vergrößern"><ZoomIn size={15} /></CtrlBtn>
        <CtrlBtn onClick={zoomOut} title="Verkleinern"><ZoomOut size={15} /></CtrlBtn>
        <CtrlBtn onClick={fitToScreen} title="Einpassen"><Maximize size={15} /></CtrlBtn>
        <CtrlBtn onClick={resetView} title="Ansicht zurücksetzen"><RotateCcw size={15} /></CtrlBtn>
      </div>

      {/* Zoom indicator */}
      <div style={{
        position: "absolute",
        bottom: 20,
        left: 20,
        fontSize: 10,
        color: "rgba(255,255,255,0.25)",
        zIndex: 20,
      }}>
        {Math.round(pz.zoom * 100)} %
      </div>
    </div>
  );
}
