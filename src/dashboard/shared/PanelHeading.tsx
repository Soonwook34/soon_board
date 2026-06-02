// dashboard §1 — 우측 컬럼 패널 공통 제목 헤더 (⑤ LEADERBOARD / ⑥ TYRE STRATEGY / ⑦ EVENTS).
// 리더보드를 주 패널로 읽히게 하고 접이식 ⑥ 의 토글 라벨을 일관되게 한다 (#2/#6). 라벨 텍스트만 —
// 접이 토글은 호출처(TyreStrategy)가 button 으로 감싼다.

import type { CSSProperties, ReactNode } from 'react';
import { dashboardColors } from './dashboardStyles';

const headingStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: dashboardColors.textSecondary,
};

export function PanelHeading({ children }: { children: ReactNode }) {
  return <div style={headingStyle}>{children}</div>;
}
