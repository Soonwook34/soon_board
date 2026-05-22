// GP 그리드 컨테이너 — plan main-page-implementation.md §1.3, §6, §7.
// Desktop 1280px+ 4열, 1024~1280 3열, <1024 1열.
// 인라인 확장(plan §6): expandedGp 일치하는 카드 직후에 `grid-column: 1/-1` spanner row를 끼움.
// .gp-grid의 `grid-auto-flow: dense` (global.css)가 spanner 옆 빈 셀에 후속 카드를 끌어와 row 점프를 막음.
// 검색·필터(plan §7): filterMeetings로 보이는 GP만 추림. 0건이면 reset 버튼.

import { Fragment, useCallback, useMemo } from 'react';
import { ExpandedSessions } from './ExpandedSessions';
import { GpCard } from './GpCard';
import { classifyMeeting } from './derived/meetingStatus';
import { filterMeetings } from './derived/searchFilter';
import { resetFilters } from './stores/uiStore';
import type { MeetingData } from '../shared/seasonData';
import type { SessionTypeFilter, StatusFilter } from './stores/uiStore';

export interface GpGridProps {
  meetings: MeetingData[] | null;
  expandedGp: number | null;
  onExpandGp: (meetingKey: number | null) => void;
  search: string;
  sessionTypes: ReadonlySet<SessionTypeFilter>;
  statuses: ReadonlySet<StatusFilter>;
  now: Date;
}

export function GpGrid({
  meetings,
  expandedGp,
  onExpandGp,
  search,
  sessionTypes,
  statuses,
  now,
}: GpGridProps) {
  // meetings === null(로딩) 케이스는 아래 early return에서 처리. filtered는 항상 array —
  // useMemo의 deps가 동일한 한 [] 참조도 안정적이므로 non-null assertion이 불필요.
  const filtered = useMemo(
    () => (meetings ? filterMeetings(meetings, { search, sessionTypes, statuses }, now) : []),
    [meetings, search, sessionTypes, statuses, now],
  );

  const statusesByMeeting = useMemo(
    () => filtered.map((m) => ({ meeting: m, status: classifyMeeting(m, now) })),
    [filtered, now],
  );

  // ExpandedSessions의 keydown 리스너가 매 렌더마다 add/remove 반복하지 않도록 ref 안정화.
  const closeExpanded = useCallback(() => onExpandGp(null), [onExpandGp]);

  if (meetings === null) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '14px',
        }}
      >
        시즌 데이터를 불러오는 중...
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '14px',
        }}
      >
        표시할 GP가 없습니다.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '14px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span>조건에 맞는 GP가 없습니다.</span>
        <button
          type="button"
          onClick={() => resetFilters()}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-strong)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
          }}
        >
          필터 초기화
        </button>
      </div>
    );
  }

  return (
    <div className="gp-grid">
      {statusesByMeeting.map(({ meeting, status }) => {
        const isExpanded = expandedGp === meeting.meeting_key;
        return (
          <Fragment key={meeting.meeting_key}>
            <GpCard
              meeting={meeting}
              status={status}
              isExpanded={isExpanded}
              onClick={() => onExpandGp(isExpanded ? null : meeting.meeting_key)}
            />
            {isExpanded && <ExpandedSessions meeting={meeting} onClose={closeExpanded} />}
          </Fragment>
        );
      })}
    </div>
  );
}
