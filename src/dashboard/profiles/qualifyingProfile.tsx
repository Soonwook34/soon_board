// 퀄리파잉 프로파일 — Leaderboard→QualifyingTower, SessionProgress→SegmentProgress,
// 사이드바에 KnockoutPanel + SegmentBestBoard 추가. qualifying-session-dashboard.md §3.2/§3.4.

import { SegmentProgress } from '../panels/qualifying/SegmentProgress';
import { QualifyingTower } from '../panels/qualifying/QualifyingTower';
import { SegmentBestBoard } from '../panels/qualifying/SegmentBestBoard';
import { KnockoutPanel } from '../panels/qualifying/KnockoutPanel';
import { QualifyingModelProvider } from '../panels/qualifying/useQualifyingModel';
import { FastestLapBadges } from '../panels/FastestLapBadges';
import type { DashboardProfile } from './types';

export const qualifyingProfile: DashboardProfile = {
  kind: 'qualifying',
  renderProgress: ({ session }) => <SegmentProgress session={session} />,
  renderSidebar: ({ session }) => (
    <QualifyingModelProvider>
      <QualifyingTower session={session} />
      <KnockoutPanel session={session} />
      <SegmentBestBoard session={session} />
    </QualifyingModelProvider>
  ),
  // 빠른 랩/보라 섹터/스피드트랩은 퀄리에서도 유효 — 기본 배지 유지.
  renderBadges: () => <FastestLapBadges />,
};
