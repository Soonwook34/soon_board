// Hero — plan main-page-implementation.md §1.1, §4.4.
// 동작:
//   - useNowSecond()로 1초 단위 now 갱신
//   - nextHeroSession(seasons, now) useMemo로 캐시 ([seasons, now])
//   - now 진행에 따라 upcoming → live → past 자동 전환 (인수 5)
//   - 진입 버튼: live/upcoming → /live/:key, past → /replay/:key

import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { Countdown } from './Countdown';
import { nextHeroSession, type HeroSelection } from './derived/nextUpcoming';
import { useNowSecond } from './useNowSecond';
import type { SeasonData } from '../shared/seasonData';

export interface HeroProps {
  seasons: SeasonData[];
}

export function Hero({ seasons }: HeroProps) {
  const nowMs = useNowSecond();
  const selection = useMemo(
    () => nextHeroSession(seasons, new Date(nowMs)),
    [seasons, nowMs],
  );

  if (!selection) {
    return (
      <section style={containerStyle({ kind: 'idle' })}>
        <div style={messageStyle}>표시할 세션이 없습니다.</div>
      </section>
    );
  }

  return <HeroBody selection={selection} />;
}

function HeroBody({ selection }: { selection: HeroSelection }) {
  const [, setLocation] = useLocation();
  const { session, meeting, status } = selection;
  const route =
    status.kind === 'past' ? `/replay/${session.session_key}` : `/live/${session.session_key}`;
  const buttonLabel = status.kind === 'past' ? 'Enter replay →' : 'Enter live screen →';

  return (
    <section style={containerStyle(status)} data-status={status.kind}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={labelStyle(status.kind)}>{labelText(status.kind)}</span>
        <span style={titleStyle}>
          {meeting.meeting_name.replace(/\s*Grand Prix$/i, ' GP')} · {session.session_name}
        </span>
        <span style={subtitleStyle}>{subtitleText(status, session.date_start, session.date_end)}</span>
      </div>
      <button type="button" onClick={() => setLocation(route)} style={ctaStyle(status.kind)}>
        {buttonLabel}
      </button>
    </section>
  );
}

function labelText(kind: HeroSelection['status']['kind']): string {
  if (kind === 'live') return 'LIVE NOW';
  if (kind === 'upcoming') return 'NEXT';
  return 'OFF-SEASON · LATEST';
}

function subtitleText(
  status: HeroSelection['status'],
  startIso: string,
  endIso: string,
): React.ReactNode {
  if (status.kind === 'upcoming') {
    return (
      <>
        Starts <Countdown targetDate={startIso} />
      </>
    );
  }
  if (status.kind === 'live') {
    return (
      <>
        In progress · ends <Countdown targetDate={endIso} />
      </>
    );
  }
  // past — 가장 최근 결과. Date 표시.
  const d = new Date(endIso);
  if (Number.isNaN(d.getTime())) return '—';
  return `Finished ${d.toUTCString().slice(0, 16)} UTC`;
}

// ─── styles ───────────────────────────────────────────────────────────────

const containerStyle = (
  status: HeroSelection['status'] | { kind: 'idle' },
): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '24px',
  padding: '20px 32px',
  borderBottom: '1px solid var(--color-border)',
  background:
    status.kind === 'live'
      ? 'color-mix(in srgb, var(--color-live) 12%, var(--color-bg-base))'
      : 'var(--color-bg-surface)',
  borderLeft: status.kind === 'live' ? '3px solid var(--color-live)' : '3px solid transparent',
});

const messageStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: '14px',
};

const labelStyle = (kind: HeroSelection['status']['kind']): React.CSSProperties => ({
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.16em',
  color:
    kind === 'live'
      ? 'var(--color-live)'
      : kind === 'upcoming'
        ? 'var(--color-upcoming)'
        : 'var(--color-text-muted)',
});

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--color-text-secondary)',
};

const ctaStyle = (kind: HeroSelection['status']['kind']): React.CSSProperties => ({
  padding: '10px 18px',
  borderRadius: '8px',
  background: kind === 'live' ? 'var(--color-live)' : 'var(--color-bg-elevated)',
  color: kind === 'live' ? 'var(--color-text-on-accent)' : 'var(--color-text-primary)',
  border:
    kind === 'live' ? '1px solid var(--color-live)' : '1px solid var(--color-border-strong)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
});
