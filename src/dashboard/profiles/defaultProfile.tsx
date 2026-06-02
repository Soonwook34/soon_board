// 기본 프로파일(레이스/스프린트/프랙티스) — 기존 DashboardApp 레이아웃을 1:1 재현.
// qualifying-session-dashboard.md §3.2: default 는 비-퀄리 세션의 회귀 안전 기준선(R1).

import { SessionProgress } from '../panels/SessionProgress';
import { Leaderboard } from '../panels/Leaderboard';
import { TyreStrategy } from '../panels/TyreStrategy';
import { EventTicker } from '../panels/EventTicker';
import { FastestLapBadges } from '../panels/FastestLapBadges';
import type { DashboardProfile } from './types';

export const defaultProfile: DashboardProfile = {
  kind: 'default',
  renderProgress: ({ meeting, session, year }) => (
    <SessionProgress session={session} circuitKey={meeting.circuit_key} year={year} />
  ),
  renderSidebar: () => (
    <>
      <Leaderboard />
      <TyreStrategy />
      <EventTicker />
    </>
  ),
  renderBadges: () => <FastestLapBadges />,
};
