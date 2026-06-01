// dashboard §1.1/§6 — 최상위 레이아웃 (CSS Grid, Hybrid B).
// ① 헤더(전체폭) / ② 진행률 + ④ Race Control 행 / ③ 맵 슬롯(prop) + 우측열 ⑤⑥⑦(세로 stack, 스크롤) /
// 하단 ⑧ 빠른 랩 배지 + ⑨ 날씨. DataSourceProvider + DriversProvider 안에서 렌더 전제(자체 provider 미포함).

import { useEffect, useState, type ReactNode } from 'react';
import { SessionHeader, type DashboardMode } from './panels/SessionHeader';
import { SessionProgress } from './panels/SessionProgress';
import { RaceControlBanner } from './panels/RaceControlBanner';
import { WeatherMini } from './panels/WeatherMini';
import { Leaderboard } from './panels/Leaderboard';
import { TyreStrategy } from './panels/TyreStrategy';
import { EventTicker } from './panels/EventTicker';
import { FastestLapBadges } from './panels/FastestLapBadges';
import { DriverDetailPanel } from './detailPanel/DriverDetailPanel';
import { useSelectedDriver, clearSelection } from './shared/selectionStore';
import { useMediaQuery } from './shared/useMediaQuery';
import { dashboardColors } from './shared/dashboardStyles';
import { NarrowScreenBanner } from '../main/NarrowScreenBanner';
import { Toast } from '../main/Toast';
import type { MeetingData, SessionData } from '../shared/seasonData';

// 사이드 패널 닫힘: 맵 7 / 우측 5 (§1.3). 열림: 맵 6 / 우측(s) 3 / 디테일(d) 3 — push 모드.
const GRID_CLOSED = [
  '"h h h h h h h h h h h h"',
  '"p p p p p p p r r r r r"',
  '"m m m m m m m s s s s s"',
  '"b b b b b b b b w w w w"',
].join('\n');
const GRID_OPEN = [
  '"h h h h h h h h h h h h"',
  '"p p p p p p r r r d d d"',
  '"m m m m m m s s s d d d"',
  '"b b b b b b w w w d d d"',
].join('\n');

// §1.5/§3.7/인수22 — Desktop(1280px+) 미만에서는 사이드 패널 push 폭이 부족해 자동 닫힘.
const BELOW_DESKTOP = '(max-width: 1279.98px)';
const SIDE_PANEL_TOO_NARROW = '1280px 이상에서 사이드 패널을 사용하세요';

export interface DashboardAppProps {
  meeting: MeetingData;
  session: SessionData;
  year: number;
  mode: DashboardMode;
  /** 임베드되는 라이브 맵 ③ (live-map-implementation.md). 미지정 시 placeholder. */
  map?: ReactNode;
}

export function DashboardApp({ meeting, session, year, mode, map }: DashboardAppProps) {
  const selected = useSelectedDriver();
  const belowDesktop = useMediaQuery(BELOW_DESKTOP);
  const [toast, setToast] = useState<string | null>(null);
  // <1280px 에서는 push 폭 부족 → 디테일 영역 미렌더(자동 닫힘과 정합, §3.7).
  const detailOpen = selected != null && !belowDesktop;

  // 인수23 — 모드(라이브↔리플레이) 전환 시 선택 해제(사이드 패널 닫힘). 화면 재마운트 간
  // 모듈스코프 selectionStore 가 잔류하므로 mode 변화를 트리거로 reset.
  useEffect(() => {
    clearSelection();
  }, [mode]);

  // 인수22/§3.7 — viewport 가 1280px 미만으로 줄고 선택 중이면 자동 닫힘 + 토스트 안내.
  useEffect(() => {
    if (belowDesktop && selected != null) {
      clearSelection();
      setToast(SIDE_PANEL_TOO_NARROW);
    }
  }, [belowDesktop, selected]);

  return (
    <>
      <NarrowScreenBanner />
      <div
        data-testid="dashboard-app"
        style={{
          display: 'grid',
          gap: '12px',
          padding: '12px',
          minHeight: '100vh',
          background: 'var(--color-bg-base, #0a0d12)',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateAreas: detailOpen ? GRID_OPEN : GRID_CLOSED,
          gridAutoRows: 'min-content',
        }}
      >
        <div style={{ gridArea: 'h' }}>
          <SessionHeader meeting={meeting} session={session} year={year} mode={mode} />
        </div>
        <div style={{ gridArea: 'p' }}>
          <SessionProgress session={session} circuitKey={meeting.circuit_key} year={year} />
        </div>
        <div style={{ gridArea: 'r' }}>
          <RaceControlBanner />
        </div>
        <div data-region="map" style={{ gridArea: 'm', minHeight: '320px' }}>
          {map ?? (
            <div
              style={{
                height: '100%',
                minHeight: '320px',
                border: `1px dashed ${dashboardColors.border}`,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: dashboardColors.textMuted,
                fontSize: '12px',
              }}
            >
              라이브 맵 ③
            </div>
          )}
        </div>
        {/* 우측열 — ⑤⑥⑦ 세로 stack. 정보량이 많아 내부 세로 스크롤 (§1.3). 정확한 1280×800 무스크롤
            튜닝(인수1)은 dev-server 시각 게이트에서. */}
        <div
          style={{
            gridArea: 's',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          <Leaderboard />
          <TyreStrategy />
          <EventTicker />
        </div>
        <div style={{ gridArea: 'b' }}>
          <FastestLapBadges />
        </div>
        <div style={{ gridArea: 'w' }}>
          <WeatherMini />
        </div>
        {detailOpen && (
          <div style={{ gridArea: 'd', minHeight: 0 }}>
            <DriverDetailPanel session={session} />
          </div>
        )}
      </div>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
