// GP 확장 패널 — plan main-page-implementation.md §6.
// 동작:
//   - meeting.sessions를 date_start 오름차순으로 SessionCard 렌더
//   - 세션 클릭 시 plan §6.3 라우팅 (sessionRoute 분기) — wouter setLocation
//   - ESC 키 → onClose() (plan §6.1)
//   - useNowSecond()로 status를 1초 갱신 (live/upcoming/past boundary 자동 전환)
// 호버 미리보기는 Phase 8 (ResultPreviewTooltip) 책임.

import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { SessionCard } from './SessionCard';
import { classify } from './derived/sessionStatus';
import { sessionRoute } from './derived/sessionRoute';
import { useNowSecond } from './useNowSecond';
import type { MeetingData } from '../shared/seasonData';

export interface ExpandedSessionsProps {
  meeting: MeetingData;
  onClose: () => void;
}

export function ExpandedSessions({ meeting, onClose }: ExpandedSessionsProps) {
  const [, setLocation] = useLocation();
  const nowMs = useNowSecond();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = useMemo(
    () =>
      [...meeting.sessions].sort(
        (a, b) => Date.parse(a.date_start) - Date.parse(b.date_start),
      ),
    [meeting.sessions],
  );

  const now = useMemo(() => new Date(nowMs), [nowMs]);

  return (
    <div
      role="region"
      aria-label={`${meeting.meeting_name} sessions`}
      style={{
        gridColumn: '1 / -1',
        padding: '16px',
        marginTop: '4px',
        borderRadius: '12px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {meeting.meeting_name.replace(/\s*Grand Prix$/i, ' GP')}
          {meeting.location ? ` · ${meeting.location}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close expanded sessions"
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-strong)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-secondary)',
            fontSize: '12px',
          }}
        >
          Close (ESC)
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        {sorted.map((session) => {
          const status = classify(session, now);
          const route = sessionRoute(session, status);
          return (
            <SessionCard
              key={session.session_key}
              session={session}
              status={status}
              onClick={() => {
                if (route !== null) setLocation(route);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
