// 라이브 화면 카운트다운 오버레이 — plan main-page-implementation.md §5, §12 단계 9.
// 부모(LiveScreen, Phase 11)가 mount 결정. 본 컴포넌트는 status 기반 표시 분기만 책임:
//   - upcoming → "Starts in HH:MM:SS" (lights out 카운트다운)
//   - live + startedAgoMs < 0 → 동일 카운트다운 유지 (라이브 윈도우 진입 후 lights out 이전)
//   - live + startedAgoMs >= 0 → "Waiting for first data..." (lights out 도달, OpenF1 데이터 대기)
//   - past/cancelled → null (부모가 다른 UI 마운트)
//
// LiveDataSource 통합(첫 sample 도달 시 페이드아웃)은 live-map-implementation.md 스코프 +
// 라우팅 wire는 Phase 11 책임. 본 phase는 standalone overlay만.

import { useEffect, useMemo } from 'react';
import { formatHmsCountdown } from './derived/overlayCountdown';
import { classify } from '../main/derived/sessionStatus';
import { useNowSecond } from '../main/useNowSecond';
import type { SessionData } from '../shared/seasonData';

export interface CountdownOverlayProps {
  meetingName: string;
  session: SessionData;
  onBack: () => void;
}

export function CountdownOverlay({ meetingName, session, onBack }: CountdownOverlayProps) {
  const nowMs = useNowSecond();
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const status = classify(session, now);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onBack();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  if (status.kind === 'past' || status.kind === 'cancelled') return null;

  const startMs = Date.parse(session.date_start);
  const remainingMs = startMs - nowMs;
  const isWaitingForData = status.kind === 'live' && status.startedAgoMs >= 0;

  return (
    <div
      role="dialog"
      aria-label="Session countdown"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-base)',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '48px 56px',
          borderRadius: '16px',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-strong)',
          textAlign: 'center',
          minWidth: '420px',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {meetingName} · {session.session_name}
        </div>
        {isWaitingForData ? (
          <>
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Session started</div>
            <div
              style={{
                fontSize: '36px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Waiting for first data...
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Starts in</div>
            <div
              style={{
                fontSize: '64px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}
            >
              {formatHmsCountdown(remainingMs)}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Status: pre-session (no live data)
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: '8px',
            padding: '8px 18px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-strong)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
          }}
        >
          ← Back to main
        </button>
      </div>
    </div>
  );
}
