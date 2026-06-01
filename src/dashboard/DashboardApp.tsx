// dashboard §1.1/§6 — 최상위 레이아웃 (CSS Grid). 단계 4 범위: ① 헤더 / ② 진행률 / ④ Race Control /
// ⑨ 날씨 + ③ 맵 슬롯(prop) + ⑤⑥⑦⑧ placeholder(단계 5-7). DataSourceProvider 안에서 렌더 전제.

import type { ReactNode } from 'react';
import { SessionHeader, type DashboardMode } from './panels/SessionHeader';
import { SessionProgress } from './panels/SessionProgress';
import { RaceControlBanner } from './panels/RaceControlBanner';
import { WeatherMini } from './panels/WeatherMini';
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

function Placeholder({ label, area }: { label: string; area: string }) {
  return (
    <div
      data-region={area}
      style={{
        gridArea: area,
        border: `1px dashed ${dashboardColors.border}`,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: dashboardColors.textMuted,
        fontSize: '12px',
        minHeight: '60px',
        textAlign: 'center',
        padding: '8px',
      }}
    >
      {label}
    </div>
  );
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
      <Placeholder label="리더보드 ⑤ · 타이어 ⑥ · 이벤트 티커 ⑦ (단계 5-7)" area="s" />
      <Placeholder label="빠른 랩 배지 ⑧ (단계 7)" area="b" />
      <div style={{ gridArea: 'w' }}>
        <WeatherMini />
      </div>
    </div>
  );
}
