/**
 * Capitalife Terminal — Canonical UI Primitives
 *
 * MetricCard   — KPI tile, no subtext by default
 * SectionHeader — section title row
 * DataTable    — table styles + component
 * tableStyles  — raw style object for table consumers
 *
 * Import from here. Do not recreate these in product pages.
 */

import type { CSSProperties, ReactNode } from "react";
import { COLORS, FONTS, GRADIENTS, RADIUS, BORDER_STANDARD } from "@/lib/design-tokens";

// ── MetricCard ────────────────────────────────────────────────────────────────

type MetricTone = "default" | "risk";

interface MetricCardProps {
  label: string;
  value: string | number;
  /** "risk" renders value in gold — use for drawdown, negative values */
  tone?: MetricTone;
  /** Optional override when label itself encodes all needed context */
  style?: CSSProperties;
  /** Optional title for tooltip on hover */
  title?: string;
}

const TONE_COLOR: Record<MetricTone, string> = {
  default: COLORS.TEXT_PRIMARY,
  risk: COLORS.GOLD,
};

/**
 * Canonical KPI tile.
 *
 * Shows LABEL (top) and VALUE (bottom). No subtext. No badge.
 * If context is needed, encode it in the label string:
 *   label="SHARPE · €100K"
 *
 * Use tone="risk" for drawdown, max DD, negative values → renders value in gold.
 */
export function MetricCard({ label, value, tone = "default", style, title }: MetricCardProps) {
  return (
    <div
      title={title}
      style={{
        minHeight: 84,
        padding: "11px 14px 12px",
        boxSizing: "border-box",
        background: GRADIENTS.KPI_BG,
        borderRadius: RADIUS.kpi,
        border: BORDER_STANDARD,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.MONTSERRAT,
          fontSize: 9,
          fontWeight: 700,
          color: COLORS.TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: "1px",
          lineHeight: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.NUNITO,
          fontSize: 20,
          fontWeight: 600,
          color: TONE_COLOR[tone],
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  children: ReactNode;
  /** Optional right-side element (e.g. a single control) */
  action?: ReactNode;
  style?: CSSProperties;
}

/**
 * Canonical section title.
 *
 * Renders: SECTION TITLE
 * Then content follows. No subtitle. No badge row. No description.
 */
export function SectionHeader({ children, action, style }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.MONTSERRAT,
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.TEXT_HEADER,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
      {action && (
        <div style={{ flexShrink: 0 }}>
          {action}
        </div>
      )}
    </div>
  );
}

// ── DataTable ─────────────────────────────────────────────────────────────────

/** Raw style objects — use when rendering your own table markup */
export const tableStyles = {
  container: {
    background: GRADIENTS.CARD_BG,
    borderRadius: RADIUS.card,
    border: BORDER_STANDARD,
    overflow: "hidden",
  } satisfies CSSProperties,

  header: {
    fontFamily: FONTS.MONTSERRAT,
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.TEXT_MUTED,
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    padding: "8px 12px",
    background: "rgba(0,0,0,0.18)",
    borderBottom: `1px solid ${COLORS.DIVIDER}`,
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  headerNumeric: {
    textAlign: "right" as const,
  } satisfies CSSProperties,

  row: {
    height: 40,
    borderBottom: `1px solid ${COLORS.DIVIDER}`,
    transition: "background 100ms ease",
  } satisfies CSSProperties,

  cell: {
    fontFamily: FONTS.MONTSERRAT,
    fontSize: 12,
    color: COLORS.TEXT_PRIMARY,
    padding: "0 12px",
    verticalAlign: "middle" as const,
  } satisfies CSSProperties,

  cellNumeric: {
    fontFamily: FONTS.NUNITO,
    fontSize: 12,
    color: COLORS.TEXT_PRIMARY,
    padding: "0 12px",
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
    verticalAlign: "middle" as const,
  } satisfies CSSProperties,

  cellRisk: {
    color: COLORS.GOLD,
  } satisfies CSSProperties,
} as const;

interface Column<T> {
  key: keyof T;
  label: string;
  align?: "left" | "right";
  tone?: (row: T) => MetricTone;
  format?: (val: T[keyof T]) => string;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  rows: T[];
  style?: CSSProperties;
}

/**
 * Canonical data table.
 *
 * Rules enforced:
 * - Right-aligned numeric columns (pass align:"right")
 * - Subtle row separators
 * - Rounded outer container
 * - Gold for risk values (pass tone callback)
 */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  style,
}: DataTableProps<T>) {
  return (
    <div style={{ ...tableStyles.container, ...style }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={{
                  ...tableStyles.header,
                  ...(col.align === "right" ? tableStyles.headerNumeric : {}),
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={tableStyles.row}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.02)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = "";
              }}
            >
              {columns.map((col) => {
                const raw = row[col.key];
                const display = col.format ? col.format(raw) : String(raw ?? "—");
                const tone = col.tone ? col.tone(row) : "default";
                const isNumeric = col.align === "right";
                return (
                  <td
                    key={String(col.key)}
                    style={{
                      ...(isNumeric ? tableStyles.cellNumeric : tableStyles.cell),
                      ...(tone === "risk" ? tableStyles.cellRisk : {}),
                    }}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
