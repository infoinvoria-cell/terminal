/**
 * Capitalife Terminal — Design System (DS object + legacy components)
 *
 * DS object: use freely — values are canonical.
 * KpiCard: prefer MetricCard from src/components/ui/primitives.tsx for new work.
 *          This KpiCard is kept for backward compatibility.
 * StatusBadge: use sparingly — badges are exceptional (see Design Skill §22).
 * SectionLabel: prefer SectionHeader from src/components/ui/primitives.tsx.
 *
 * @see CAPITALIFE_DESIGN_SKILL.md
 */

export const DS = {
  fonts: {
    numbers: "var(--font-numbers)",
    text:    "var(--font-text)",
  },
  colors: {
    bg:            '#090909',
    surface:       '#0D0D0D',
    surface2:      '#111111',
    border:        '#1A1A1A',
    border2:       '#2A2A2A',
    textPrimary:   '#F0F0F0',
    textSecondary: '#9CA3AF',
    textMuted:     '#5A6070',
    gold:          '#C9A84C',
    green:         '#22C55E',
    red:           '#EF4444',
  },
  radius: { sm: 6, md: 10, lg: 14 } as const,
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const,
} as const;

/* ─── KpiCard ─────────────────────────────────────────────────────────────── */
export function KpiCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{
      // Canonical KPI gradient (matches kpi-card.tsx and design-tokens.ts)
      background:   'linear-gradient(to bottom, #26262d, #111114)',
      border:       '1px solid rgba(255,255,255,0.055)',
      borderRadius: DS.radius.lg, // 14px — canonical KPI radius
      padding:      '11px 14px 12px',
      display:      'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight:    84,
    }}>
      <div style={{
        fontFamily:    DS.fonts.text,
        fontSize:      9,
        fontWeight:    700,
        color:         DS.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        lineHeight:    1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily:         DS.fonts.numbers,
        fontSize:           20,
        fontWeight:         600,
        color:              color ?? DS.colors.textPrimary,
        fontVariantNumeric: 'tabular-nums',
        lineHeight:         1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: DS.fonts.text,
          fontSize:   8,
          color:      DS.colors.textMuted,
          lineHeight: 1,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── StatusBadge ─────────────────────────────────────────────────────────── */
export function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: 'pass' | 'warn' | 'fail';
}) {
  const color =
    status === 'pass' ? DS.colors.green
    : status === 'warn' ? DS.colors.gold
    : DS.colors.red;

  return (
    <div style={{
      border:        `1px solid ${color}`,
      color,
      borderRadius:  4,
      padding:       '2px 8px',
      fontFamily:    DS.fonts.text,
      fontSize:      9,
      fontWeight:    700,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      display:       'inline-block',
      lineHeight:    1.6,
    }}>
      {label}
    </div>
  );
}

/* ─── Section label ───────────────────────────────────────────────────────── */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    DS.fonts.text,
      fontSize:      8,
      fontWeight:    700,
      color:         DS.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.10em',
      marginBottom:  6,
    }}>
      {children}
    </div>
  );
}
