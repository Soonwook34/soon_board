// 상태 배지 — plan main-page-implementation.md §1, §4.
// 색상은 src/style/global.css의 CSS variables (tokens.ts와 동기) 사용.

export type StatusKind = 'past' | 'live' | 'upcoming' | 'cancelled';

const LABELS: Record<StatusKind, string> = {
  past: 'PAST',
  live: 'LIVE',
  upcoming: 'UPCOMING',
  cancelled: 'CANCELLED',
};

const COLOR_VARS: Record<StatusKind, string> = {
  past: 'var(--color-past)',
  live: 'var(--color-live)',
  upcoming: 'var(--color-upcoming)',
  cancelled: 'var(--color-cancelled)',
};

export interface StatusBadgeProps {
  status: StatusKind;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const bg = COLOR_VARS[status];
  return (
    <span
      className="status-badge"
      data-status={status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: `color-mix(in srgb, ${bg} 20%, transparent)`,
        color: bg,
        border: `1px solid color-mix(in srgb, ${bg} 35%, transparent)`,
      }}
    >
      {status === 'live' && (
        <span
          aria-hidden="true"
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: bg,
            animation: 'soon-pulse 1.4s ease-in-out infinite',
          }}
        />
      )}
      {LABELS[status]}
    </span>
  );
}
