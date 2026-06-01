// dashboard §1.1/§6 — 최상위 레이아웃 (CSS Grid, Hybrid B).
// ① 헤더(전체폭) / ② 진행률 + ④ Race Control 행 / ③ 맵 슬롯(prop) + 우측열 ⑤⑥⑦(세로 stack, 스크롤) /
// 하단 ⑧ 빠른 랩 배지 + ⑨ 날씨. DataSourceProvider + DriversProvider 안에서 렌더 전제(자체 provider 미포함).

import type { ReactNode } from 'react';
import { SessionHeader, type DashboardMode } from './panels/SessionHeader';
import { SessionProgress } from './panels/SessionProgress';
import { RaceControlBanner } from './panels/RaceControlBanner';
import { WeatherMini } from './panels/WeatherMini';
import { Leaderboard } from './panels/Leaderboard';
import { TyreStrategy } from './panels/TyreStrategy';
import { EventTicker } from './panels/EventTicker';
import { FastestLapBadges } from './panels/FastestLapBadges';
import { dashboardColors } from './shared/dashboardStyles';
import type { MeetingData, SessionData } from '../shared/seasonData';

export interface DashboardAppProps {
  meeting: MeetingData;
  session: SessionData;
  year: number;
  mode: DashboardMode;
  /** 임베드되는 라이브 맵 ③ (live-map-implementation.md). 미지정 시 placeholder. */
  map?: ReactNode;
}

export function DashboardApp({ meeting, session, year, mode, map }: DashboardAppProps) {
  return (
    <div
      data-testid="dashboard-app"
      style={{
        display: 'grid',
        gap: '12px',
        padding: '12px',
        minHeight: '100vh',
        background: 'var(--color-bg-base, #0a0d12)',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridTemplateAreas: [
          '"h h h h h h h h h h h h"',
          '"p p p p p p p r r r r r"',
          '"m m m m m m m s s s s s"',
          '"b b b b b b b b w w w w"',
        ].join('\n'),
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
    </div>
  );
}
