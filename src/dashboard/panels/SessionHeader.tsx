// dashboard §2.1 — 세션 헤더 ①. 트랙·세션·연도(정적) + 현지 시계(gmt_offset) + 모드 인디케이터.
// hooks 는 모두 early-return 이전에 호출 (rules-of-hooks).

import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';
import type { MeetingData, SessionData } from '../../shared/seasonData';

export type DashboardMode = 'live' | 'replay';

export interface SessionHeaderProps {
  meeting: MeetingData;
  session: SessionData;
  year: number;
  mode: DashboardMode;
}

/** "03:00:00" / "-05:00:00" → ms 오프셋. 파싱 실패 시 0. */
function parseGmtOffsetMs(off: string | undefined): number {
  if (!off) return 0;
  const m = off.match(/^([+-]?)(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0)) * 1000;
}

function formatLocalClock(t: Date, offsetMs: number): string {
  if (t.valueOf() === 0) return '--:--:--'; // 데이터 전 (display_time epoch)
  const d = new Date(t.valueOf() + offsetMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function SessionHeader({ meeting, session, year, mode }: SessionHeaderProps) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const streamState = ds.getStreamState();

  const trackName = meeting.circuit_short_name ?? meeting.meeting_name;
  const clock = formatLocalClock(t, parseGmtOffsetMs(meeting.gmt_offset));

  // 모드 배지: live 는 stream 상태(-30s / STALLED…), replay 는 라벨만 (speed 표시는 후속).
  const isAlert = streamState === 'stalled' || streamState === 'buffering';
  const modeLabel = mode === 'live' ? 'LIVE' : 'REPLAY';
  const modeSub = mode === 'live' ? (streamState === 'live' ? '-30s' : streamState.toUpperCase()) : '';

  return (
    <header
      style={{
        ...panelStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', minWidth: 0 }}>
        <span style={{ fontSize: '18px', fontWeight: 700, color: dashboardColors.text }}>
          {trackName}
        </span>
        {meeting.country_code ? (
          <span style={{ fontSize: '12px', color: dashboardColors.textMuted, letterSpacing: '0.08em' }}>
            {meeting.country_code}
          </span>
        ) : null}
        <span style={{ fontSize: '13px', color: dashboardColors.textSecondary }}>
          {session.session_name} · {year}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span
          aria-label="현지 시각"
          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '15px', color: dashboardColors.text }}
        >
          {clock}
        </span>
        <span
          data-mode={mode}
          data-stream={streamState}
          style={{
            display: 'inline-flex',
            gap: '6px',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            background: mode === 'live' ? 'var(--color-live, #ef4444)' : 'var(--color-upcoming, #3b82f6)',
            color: dashboardColors.textOnAccent,
            opacity: isAlert ? 0.7 : 1,
          }}
        >
          {modeLabel}
          {modeSub ? <span style={{ fontWeight: 400, opacity: 0.85 }}>{modeSub}</span> : null}
        </span>
        <abbr
          title="Data: OpenF1 (CC-BY-4.0). Not associated with Formula 1 companies."
          style={{ fontSize: '13px', color: dashboardColors.textMuted, cursor: 'help', textDecoration: 'none' }}
        >
          ⓘ
        </abbr>
      </div>
    </header>
  );
}
