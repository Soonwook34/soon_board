// 인라인 확장 안의 세션 카드 — plan main-page-implementation.md §6 + §8.
// Phase 8 추가: status.kind === 'past' AND result_preview 존재 시 호버 200ms 지연 후
// ResultPreviewTooltip 표시, mouseleave 후 100ms 지연 후 숨김 (인수 10).
// Show/hide cancel은 양방향: enter는 hide 타이머를, leave는 show 타이머를 clearTimeout.
// 컴포넌트 unmount 시 양 타이머 모두 cleanup (memory leak 방지).

import { useEffect, useRef, useState } from 'react';
import { ResultPreviewTooltip } from './ResultPreviewTooltip';
import { StatusBadge } from './StatusBadge';
import type { SessionData } from '../shared/seasonData';
import type { SessionStatus } from './derived/sessionStatus';

export interface SessionCardProps {
  session: SessionData;
  status: SessionStatus;
  onClick: () => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 100;

function formatStartUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const month = MONTH_NAMES[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day} · ${hh}:${mm} UTC`;
}

export function SessionCard({ session, status, onClick }: SessionCardProps) {
  const disabled = status.kind === 'cancelled';
  const canHover = status.kind === 'past' && session.result_preview != null;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(
    () => () => {
      if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  function handleEnter() {
    if (!canHover) return;
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (showTimerRef.current !== null) return;
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      if (buttonRef.current) setAnchorRect(buttonRef.current.getBoundingClientRect());
      setVisible(true);
    }, SHOW_DELAY_MS);
  }

  function handleLeave() {
    if (!canHover) return;
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) return;
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setVisible(false);
    }, HIDE_DELAY_MS);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        disabled={disabled}
        data-status={status.kind}
        data-session-key={session.session_key}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '6px',
          padding: '12px 14px',
          borderRadius: '8px',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {session.session_type}
          </span>
          <StatusBadge status={status.kind} />
        </div>
        <span style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.2 }}>{session.session_name}</span>
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {formatStartUtc(session.date_start)}
        </span>
      </button>
      {canHover && (
        <ResultPreviewTooltip session={session} anchorRect={anchorRect} visible={visible} />
      )}
    </>
  );
}
