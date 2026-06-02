// 대시보드 프로파일 타입 — qualifying-session-dashboard.md §3.2 (요구 B: 세션별 패널 취사선택).
// DashboardApp 의 그리드/반응형/선택 로직은 공통이며, 프로파일은 세션 종류에 따라 달라지는
// 가변 슬롯(진행률 p · 사이드바 s · 하단 배지 b)의 "내용"만 선언한다.
// 헤더(h)·Race Control(r)·맵(m)·날씨(w)·디테일(d) 슬롯은 모든 프로파일 공통이라 DashboardApp 가 직접 렌더.

import type { ReactNode } from 'react';
import type { MeetingData, SessionData } from '../../shared/seasonData';

export interface ProfileRenderContext {
  meeting: MeetingData;
  session: SessionData;
  year: number;
}

export interface DashboardProfile {
  /** 프로파일 식별자(테스트/디버그용). */
  readonly kind: 'default' | 'qualifying';
  /** 'p' 진행률 슬롯 (레이스 LAP 카운터 / 퀄리 세그먼트 진행). */
  renderProgress(ctx: ProfileRenderContext): ReactNode;
  /** 's' 우측 사이드바 세로 스택 내용. */
  renderSidebar(ctx: ProfileRenderContext): ReactNode;
  /** 'b' 하단 좌측 배지 슬롯. */
  renderBadges(ctx: ProfileRenderContext): ReactNode;
}
