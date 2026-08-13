"use client";

import React, { useState, useRef, useEffect } from "react";
import type { AnalyticsDataset } from "@/lib/analytics/portfolio-data";
import { entryHasData } from "@/lib/modeling/availability";
import {
  MODELING_REGISTRY,
  type ModelingSubjectEntry,
} from "./ModelingRegistry";

const C = {
  bg: "#0d0d0f",
  border: "rgba(255,255,255,0.08)",
  sectionLabel: "rgba(122,122,122,0.52)",
  itemText: "rgba(162,162,162,0.72)",
  itemTextHover: "rgba(232,232,232,0.92)",
  itemBgHover: "rgba(255,255,255,0.042)",
  itemBgSelected: "rgba(255,255,255,0.070)",
  itemTextSelected: "rgba(240,240,240,0.96)",
  typeHint: "rgba(102,102,102,0.52)",
  typeHintSelected: "rgba(145,145,145,0.68)",
  searchBg: "rgba(255,255,255,0.032)",
  searchBorder: "rgba(255,255,255,0.06)",
  searchText: "rgba(208,208,208,0.88)",
  divider: "rgba(255,255,255,0.052)",
  groupText: "rgba(193,193,193,0.80)",
  groupBg: "rgba(255,255,255,0.030)",
} as const;

const FONT = "var(--font-montserrat,'Montserrat',sans-serif)";

type SectionKey = ModelingSubjectEntry["section"];

const SECTION_ORDER: SectionKey[] = [
  "portfolios",
  "groups",
  "ws-strategies",
  "ws-seasonal",
  "core-invest",
  "monitoring-agrar",
  "monitoring-metalle",
  "monitoring-energie",
  "monitoring-indizes",
  "monitoring-fx",
  "monitoring-aktien",
  "other",
  "custom",
];

const SECTION_LABELS: Record<SectionKey, string> = {
  portfolios: "PORTFOLIOS",
  groups: "STRATEGY GROUPS",
  "ws-strategies": "WHITE SWAN STRATEGIES",
  "ws-seasonal": "SEASONAL SLEEVE",
  "core-invest": "CORE INVEST",
  "monitoring-agrar": "AGRAR",
  "monitoring-metalle": "METALLE",
  "monitoring-energie": "ENERGIE",
  "monitoring-indizes": "INDIZES",
  "monitoring-fx": "FX",
  "monitoring-aktien": "AKTIEN",
  other: "OTHER",
  custom: "CUSTOM",
};

type Props = {
  selectedId: string;
  dataset: AnalyticsDataset;
  onSelect: (entry: ModelingSubjectEntry) => void;
  onClose: () => void;
};

export function SelectionDropdown({ selectedId, dataset, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();

  function isEntryVisible(entry: ModelingSubjectEntry): boolean {
    if (q) {
      const match =
        entry.label.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q) ||
        entry.typeLabel.toLowerCase().includes(q) ||
        (entry.groupSeriesId ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    // All entries are always visible — unavailable ones are greyed out (per spec §36)
    return true;
  }

  const bySection: Record<SectionKey, ModelingSubjectEntry[]> = {
    portfolios: [],
    groups: [],
    "ws-strategies": [],
    "ws-seasonal": [],
    "core-invest": [],
    "monitoring-agrar": [],
    "monitoring-metalle": [],
    "monitoring-energie": [],
    "monitoring-indizes": [],
    "monitoring-fx": [],
    "monitoring-aktien": [],
    other: [],
    custom: [],
  };

  for (const entry of MODELING_REGISTRY) {
    if (isEntryVisible(entry)) {
      bySection[entry.section].push(entry);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        zIndex: 200,
        width: 560,
        maxHeight: "76vh",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: "0 36px 90px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Search */}
      <div style={{ flexShrink: 0, padding: "10px 10px 8px", borderBottom: `1px solid ${C.divider}` }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search  ·  GLD · DAX · White Swan · Intraday"
          style={{
            width: "100%",
            background: C.searchBg,
            border: `1px solid ${C.searchBorder}`,
            borderRadius: 7,
            padding: "7px 12px",
            color: C.searchText,
            fontSize: 11,
            fontFamily: FONT,
            letterSpacing: "0.025em",
            outline: "none",
            boxSizing: "border-box",
            caretColor: "rgba(215,215,215,0.8)",
          }}
        />
      </div>

      {/* Scrollable list */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px 0 14px",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.07) transparent",
      }}>
        {SECTION_ORDER.map((section) => {
          const entries = bySection[section];
          if (!entries.length) return null;

          return (
            <div key={section}>
              <div style={{
                padding: "10px 16px 4px",
                fontSize: 8,
                letterSpacing: "0.14em",
                color: C.sectionLabel,
                textTransform: "uppercase",
                fontFamily: FONT,
              }}>
                {SECTION_LABELS[section]}
              </div>

              {entries.map((entry) => {
                const hasData = entryHasData(entry);
                return (
                  <ItemRow
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedId}
                    hasData={hasData}
                    onSelect={() => hasData ? onSelect(entry) : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemRow({
  entry,
  isSelected,
  hasData,
  onSelect,
}: {
  entry: ModelingSubjectEntry;
  isSelected: boolean;
  hasData: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isGroup = entry.kind === "group";
  const disabled = !hasData;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: isGroup ? "8px 16px" : "6px 16px 6px 24px",
        background: isSelected ? C.itemBgSelected : hovered ? C.itemBgHover : isGroup ? C.groupBg : "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        transition: "background 0.1s",
        gap: 0,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <div style={{ width: 14, flexShrink: 0, marginRight: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isSelected && <span style={{ fontSize: 9, color: "rgba(228,228,228,0.85)" }}>✓</span>}
      </div>

      <span style={{
        fontSize: 11,
        fontFamily: FONT,
        fontWeight: isGroup ? 600 : isSelected ? 500 : 400,
        color: disabled ? "rgba(124,124,124,0.5)" : isSelected ? C.itemTextSelected : hovered ? C.itemTextHover : isGroup ? C.groupText : C.itemText,
        flex: 1,
        letterSpacing: isGroup ? "0.02em" : "0.01em",
      }}>
        {entry.label}
      </span>

      {disabled && (
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "rgba(120,120,120,0.22)",
          border: "1px solid rgba(120,120,120,0.18)",
          display: "inline-block", flexShrink: 0,
        }} />
      )}
    </button>
  );
}
