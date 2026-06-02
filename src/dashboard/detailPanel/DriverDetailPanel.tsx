// dashboard §3 / §1.2 — ⑩ 우측 sticky 사이드 패널 컨테이너. selectionStore 구독:
// 선택 없으면 렌더 null, 선택 시 슬라이드인. X 버튼·ESC 로 닫기(clearSelection).
// 헤더(§3.1)+현재상태(§3.2)+최근5랩(§3.3)+핏(§3.4)+스틴트(§3.5)+세션결과(§3.6) 조립.

import { useEffect, type ReactNode } from 'react';
import { useSelectedDriver, clearSelection } from '../shared/selectionStore';
import { panelStyle, dashboardColors } from '../shared/dashboardStyles';
import { DriverHeader } from './DriverHeader';
import { CurrentState } from './CurrentState';
import { RecentLapsTable } from './RecentLapsTable';
import { PitHistory } from './PitHistory';
import { StintHistory } from './StintHistory';
import { SessionResult } from './SessionResult';
import type { SessionData } from '../../shared/seasonData';

// 자체 포함 슬라이드인 키프레임 (전역 CSS 비의존). 시각 검증은 사용자 게이트(US-V).
const KEYFRAMES = '@keyframes driver-detail-in{from{transform:translateX(16px);opacity:0}to{transform:translateX(0);opacity:1}}';

// §3 (G) — 섹션 간 상단 구분선(1px) + 일관 간격. 헤더 다음 섹션부터 감싼다(신규 색 없음, 토큰만).
function DetailSection({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="detail-section"
      style={{ borderTop: `1px solid ${dashboardColors.border}`, paddingTop: '10px' }}
    >
      {children}
    </div>
  );
}

export function DriverDetailPanel({ session }: { session: SessionData }) {
  const selected = useSelectedDriver();

  // ESC 로 닫기. useEffect 는 early-return 이전에 무조건 호출(Rules of Hooks)하고,
  // 선택이 없을 땐 effect 본문이 리스너를 달지 않고 바로 반환한다([selected] 로 재실행).
  useEffect(() => {
    if (selected == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  if (selected == null) return null;

  return (
    <aside
      data-testid="driver-detail"
      aria-label="선수 디테일"
      style={{
        ...panelStyle,
        position: 'sticky',
        top: '12px',
        alignSelf: 'start',
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        animation: 'driver-detail-in 0.2s ease',
      }}
    >
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid="detail-close"
          aria-label="닫기"
          onClick={() => clearSelection()}
          style={{
            background: 'transparent',
            border: 'none',
            color: dashboardColors.textMuted,
            fontSize: '16px',
            lineHeight: 1,
            cursor: 'pointer',
            padding: '2px 4px',
          }}
        >
          ✕
        </button>
      </div>
      <DriverHeader driverNumber={selected} />
      <DetailSection><CurrentState driverNumber={selected} /></DetailSection>
      <DetailSection><RecentLapsTable driverNumber={selected} /></DetailSection>
      <DetailSection><PitHistory driverNumber={selected} /></DetailSection>
      <DetailSection><StintHistory driverNumber={selected} /></DetailSection>
      <DetailSection><SessionResult driverNumber={selected} session={session} /></DetailSection>
    </aside>
  );
}
