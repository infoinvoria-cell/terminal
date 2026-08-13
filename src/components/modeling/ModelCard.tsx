"use client";

import { useState } from "react";
import { Maximize2, Play, Pause, RotateCcw } from "lucide-react";
import type { PlaybackEngine } from "./usePlaybackEngine";

const CARD_STYLE: React.CSSProperties = {
  background: "linear-gradient(to bottom, #17171b, #0b0b0e)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.055)",
  overflow: "hidden",
  position: "relative",
};

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

export function ModelCard({
  id,
  title,
  caption,
  formula,
  height = 420,
  fullWidth = false,
  expandedId,
  onExpand,
  playback,
  children,
}: {
  id: string;
  title: string;
  caption?: string;
  formula?: string;
  height?: number;
  fullWidth?: boolean;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  playback: PlaybackEngine;
  children: React.ReactNode;
}) {
  const [showFormula, setShowFormula] = useState(false);
  const isExpanded = expandedId === id;

  const cardHeight = isExpanded ? "calc(100vh - 160px)" : height;

  return (
    <div style={{ ...CARD_STYLE, height: cardHeight, display: "flex", flexDirection: "column" }} className={fullWidth ? "w-full" : ""}>
      {/* Header row */}
      <div
        className="flex items-start justify-between px-4 pt-3 pb-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex flex-col gap-0.5">
          <span
            style={{
              fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "rgba(210,210,210,0.5)",
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
          {caption && (
            <span
              style={{
                fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
                fontSize: 9,
                color: "rgba(175,175,175,0.45)",
                letterSpacing: "0.04em",
              }}
            >
              {caption}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity" style={{ opacity: undefined }}>
          <HoverControls
            playback={playback}
            onExpand={() => onExpand(isExpanded ? null : id)}
            isExpanded={isExpanded}
          />
          {formula && (
            <button
              type="button"
              title="Show formula"
              onClick={() => setShowFormula((v) => !v)}
              style={{
                background: showFormula ? "rgba(201,168,76,0.15)" : "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "2px 5px",
                color: showFormula ? "#C9A84C" : "rgba(175,175,175,0.5)",
                fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              ƒx
            </button>
          )}
        </div>
      </div>

      {/* Formula tooltip */}
      {formula && showFormula && (
        <div
          style={{
            background: "rgba(201,168,76,0.06)",
            borderBottom: "1px solid rgba(201,168,76,0.12)",
            padding: "6px 16px",
            fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
            fontSize: 9,
            color: "rgba(201,168,76,0.8)",
            letterSpacing: "0.04em",
            whiteSpace: "pre-wrap",
          }}
        >
          {formula}
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-2 pb-2 pt-1">{children}</div>
    </div>
  );
}

function HoverControls({
  playback,
  onExpand,
  isExpanded,
}: {
  playback: PlaybackEngine;
  onExpand: () => void;
  isExpanded: boolean;
}) {
  const [showSpeed, setShowSpeed] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {/* Play / Pause */}
      <IconBtn
        title={playback.isPlaying ? "Pause" : "Play"}
        onClick={playback.isPlaying ? playback.pause : playback.play}
      >
        {playback.isPlaying ? <Pause size={9} /> : <Play size={9} />}
      </IconBtn>

      {/* Restart */}
      <IconBtn title="Restart" onClick={playback.restart}>
        <RotateCcw size={9} />
      </IconBtn>

      {/* Speed */}
      <div className="relative">
        <button
          type="button"
          title="Speed"
          onClick={() => setShowSpeed((v) => !v)}
          style={{
            background: showSpeed ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            padding: "2px 5px",
            color: "rgba(210,210,210,0.55)",
            fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
            fontSize: 9,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          {playback.speed}x
        </button>
        {showSpeed && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 2,
              background: "#17171b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "4px",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              zIndex: 50,
              minWidth: 44,
            }}
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { playback.setSpeed(s as typeof playback.speed); setShowSpeed(false); }}
                style={{
                  background: playback.speed === s ? "rgba(201,168,76,0.15)" : "transparent",
                  border: "none",
                  borderRadius: 3,
                  padding: "3px 6px",
                  color: playback.speed === s ? "#C9A84C" : "rgba(210,210,210,0.5)",
                  fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
                  fontSize: 9,
                  cursor: "pointer",
                  textAlign: "right",
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Expand */}
      <IconBtn title={isExpanded ? "Collapse" : "Expand"} onClick={onExpand} gold={isExpanded}>
        <Maximize2 size={9} />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  gold = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  gold?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        background: gold ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${gold ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 4,
        padding: "3px 4px",
        color: gold ? "#C9A84C" : "rgba(210,210,210,0.55)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

export function PlaybackHoverZone({ playback }: { playback: PlaybackEngine }) {
  const [hovered, setHovered] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 30,
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: hovered ? 1 : 0.15,
        transition: "opacity 0.2s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowSpeed(false); }}
    >
      <IconBtn
        title={playback.isPlaying ? "Pause" : "Play all"}
        onClick={playback.isPlaying ? playback.pause : playback.play}
      >
        {playback.isPlaying ? <Pause size={11} /> : <Play size={11} />}
      </IconBtn>
      <IconBtn title="Restart all" onClick={playback.restart}>
        <RotateCcw size={11} />
      </IconBtn>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowSpeed((v) => !v)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            padding: "3px 7px",
            color: "rgba(210,210,210,0.6)",
            fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {playback.speed}×
        </button>
        {showSpeed && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 3,
              background: "#17171b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "4px",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              zIndex: 60,
            }}
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { playback.setSpeed(s as typeof playback.speed); setShowSpeed(false); }}
                style={{
                  background: playback.speed === s ? "rgba(201,168,76,0.15)" : "transparent",
                  border: "none",
                  borderRadius: 3,
                  padding: "3px 8px",
                  color: playback.speed === s ? "#C9A84C" : "rgba(210,210,210,0.5)",
                  fontFamily: "var(--font-numbers,'Nunito',sans-serif)",
                  fontSize: 10,
                  cursor: "pointer",
                  textAlign: "right",
                }}
              >
                {s}×
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            width: `${playback.progress * 100}%`,
            height: "100%",
            background: "#C9A84C",
            transition: "width 0.05s linear",
          }}
        />
      </div>
    </div>
  );
}
