export function StatusBadge({ label, status }: {
  label: string
  status: 'pass' | 'warn' | 'fail' | 'info'
}) {
  const colors = {
    pass: '#22C55E',
    warn: '#C9A84C',
    fail: '#EF4444',
    info: '#6B7280',
  }
  const c = colors[status]
  return (
    <span style={{
      border: `1px solid ${c}`,
      color: c,
      borderRadius: 4,
      padding: '2px 8px',
      fontFamily: 'var(--font-text)',
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {label}
    </span>
  )
}
