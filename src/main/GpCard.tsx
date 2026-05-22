// 개별 GP 카드 — plan main-page-implementation.md §1.1.
// 클릭 시 setExpandedGp 호출 (인라인 확장은 Phase 6 ExpandedSessions가 처리).

import { StatusBadge } from './StatusBadge';
import type { MeetingData } from '../shared/seasonData';
import type { MeetingStatus } from './derived/meetingStatus';

export interface GpCardProps {
  meeting: MeetingData;
  status: MeetingStatus;
  isExpanded: boolean;
  onClick: () => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRaceDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function GpCard({ meeting, status, isExpanded, onClick }: GpCardProps) {
  const label = meeting.country_code ?? meeting.circuit_short_name ?? meeting.meeting_name;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isExpanded}
      data-status={status.kind}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '16px',
        borderRadius: '12px',
        background: 'var(--color-bg-surface)',
        border: isExpanded
          ? '1px solid var(--color-accent)'
          : '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'border-color 120ms ease, background 120ms ease, transform 120ms ease',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <StatusBadge status={status.kind} />
      </div>
      <span style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.2 }}>
        {meeting.meeting_name.replace(/\s*Grand Prix$/i, ' GP')}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        {formatRaceDate(meeting.date_start)}
      </span>
    </button>
  );
}
