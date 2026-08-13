"use client";

import { useState } from "react";
import type { PlaybackEngine, PlaybackSpeed } from "./usePlaybackEngine";

type Props = { playback: PlaybackEngine };

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4, 8];

export function PlaybackHover({ playback }: Props) {
  const [hovered, setHovered] = useState(false);

  const btnBase: React.CSSProperties = {
    background: "transparent",
    border: "none",
    borderRadius: 4,
    padding: "3px 7px",
    fontFamily: "var(--font-montserrat,'Montserrat',sans-serif)",
    fontSize: 9,
    cursor: "pointer",
    letterSpacing: "0.05em",
    color: "rgba(228,228,228,0.75)",
    lineHeight: 1,
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        height: 40,
        display: "flex",
        alignItems: "center",
        paddingRight: 16,
        gap: 8,
        opacity: hovered ? 1 : 0.08,
        transition: "opacity 0.18s ease",
      }}
    >
      {/* Play / Pause */}
      <button
        style={btnBase}
        onClick={() => playback.isPlaying ? playback.pause() : playback.play()}
        title={playback.isPlaying ? "Pause" : "Play"}
      >
        {playback.isPlaying ? "‖" : "▶"}
      </button>

      {/* Restart */}
      <button
        style={btnBase}
        onClick={() => playback.restart()}
        title="Restart"
      >
        ↺
      </button>

      {/* Speed selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {SPEEDS.map((s) => {
          const active = playback.speed === s;
          return (
            <button
              key={s}
              style={{
                ...btnBase,
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: active
                  ? "rgba(236,236,236,0.92)"
                  : "rgba(132,132,132,0.6)",
              }}
              onClick={() => playback.setSpeed(s)}
            >
              {s}×
            </button>
          );
        })}
      </div>
    </div>
  );
}
