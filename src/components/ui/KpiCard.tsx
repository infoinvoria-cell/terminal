export function KpiCard({ label, value, color }: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div style={{
      background: '#0D0D0D',
      border: '1px solid #1A1A1A',
      borderRadius: 10,
      padding: '10px 14px',
    }}>
      <div style={{
        fontFamily: 'var(--font-text)',
        fontSize: 9,
        fontWeight: 700,
        color: '#5A6070',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-numbers)',
        fontSize: 20,
        fontWeight: 600,
        color: color ?? '#F0F0F0',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  )
}
