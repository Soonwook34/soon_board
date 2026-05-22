// PAST 세션 호버 시 표시되는 결과 미리보기 카드 — plan main-page-implementation.md §8.
// 데이터: session.result_preview (Phase 1 빌드 타임 사전 계산, immutable).
//
// 위치 전략: SessionCard가 grid container 안에 있어 overflow가 잘릴 수 있으므로 createPortal
//   로 document.body에 fixed 포지셔닝. anchorRect.bottom 기준 below 배치, viewport 우측
//   clip 시 left를 clamp.
//
// Qualifying 변형 (plan §8.3): P1 행에 'POLE' 배지. POLE 시간은 result_preview 스키마에
//   포함되지 않아 acronym 옆 배지만 표시 (스키마 확장은 별도 Phase에서).
// 포디움 race 시간/gap도 §8.2 wireframe에 등장하지만 마찬가지로 schema에는 없음 — 가용한
//   필드(position/name_acronym/team_colour)만 렌더.

import { createPortal } from 'react-dom';
import { formatLapDuration } from './derived/resultPreviewFormat';
import type { SessionData } from '../shared/seasonData';

const TOOLTIP_WIDTH = 280;
const TOOLTIP_GAP = 6;
const VIEWPORT_MARGIN = 8;

export interface ResultPreviewTooltipProps {
  session: SessionData;
  anchorRect: DOMRect | null;
  visible: boolean;
}

export function ResultPreviewTooltip({ session, anchorRect, visible }: ResultPreviewTooltipProps) {
  if (!visible || !anchorRect || !session.result_preview) return null;

  const preview = session.result_preview;
  const isQualifying = /^qualifying$/i.test(session.session_type.trim());
  const sortedPodium = [...preview.podium].sort((a, b) => a.position - b.position);

  const top = anchorRect.bottom + TOOLTIP_GAP;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchorRect.left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN),
  );

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        top,
        left,
        width: `${TOOLTIP_WIDTH}px`,
        zIndex: 100,
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-strong)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        color: 'var(--color-text-primary)',
        fontSize: '13px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          color: 'var(--color-text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}
      >
        {session.session_name}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        {sortedPodium.map((row) => (
          <div key={row.position} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              aria-hidden
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: `#${row.team_colour}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', minWidth: '24px', color: 'var(--color-text-secondary)' }}>
              P{row.position}
            </span>
            <span style={{ fontWeight: 600 }}>{row.name_acronym}</span>
            {isQualifying && row.position === 1 && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: 'var(--color-accent)',
                  color: 'var(--color-text-on-accent)',
                }}
              >
                POLE
              </span>
            )}
          </div>
        ))}
      </div>
      {preview.fastest_lap && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
          ⚡ Fastest: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{preview.fastest_lap.name_acronym}</span>{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{formatLapDuration(preview.fastest_lap.lap_duration)}</span>
        </div>
      )}
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        ☔ Rain: {preview.rainfall_any ? 'Yes' : 'No'}
      </div>
    </div>,
    document.body,
  );
}
