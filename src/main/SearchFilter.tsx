// 검색바 + 세션 타입/상태 필터 — plan main-page-implementation.md §7.
// 인수 8: 200ms 디바운스 후 setSearch (즉시 setSearch 호출 시 매 키 입력마다 URL replaceState 호출 — 과도).
// 인수 9: 체크박스 토글은 즉시 toggle 호출 (디바운스 없음).
//
// 검색 input은 local controlled state로 운영:
//   - 키 입력 → local state 갱신 (즉시 반응)
//   - 200ms 디바운스 → uiStore.setSearch
//   - 외부 변경(popstate / resetFilters)이 uiStore.search를 바꾸면 local state도 동기

import { useEffect, useRef, useState } from 'react';
import {
  ALL_SESSION_TYPES,
  ALL_STATUSES,
  setSearch,
  toggleSessionType,
  toggleStatus,
} from './stores/uiStore';
import { useUiState } from './stores/hooks';
import type { SessionTypeFilter, StatusFilter } from './stores/uiStore';

const SEARCH_DEBOUNCE_MS = 200;

const SESSION_TYPE_LABEL: Record<SessionTypeFilter, string> = {
  race: 'Race',
  qualifying: 'Qualifying',
  sprint: 'Sprint',
  sprint_qualifying: 'Sprint Qualifying',
  practice: 'Practice',
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  past: 'Past',
  live: 'Live',
  upcoming: 'Upcoming',
  cancelled: 'Cancelled',
};

export function SearchBar() {
  const ui = useUiState();
  const [text, setText] = useState(ui.search);
  const lastSentRef = useRef(ui.search);

  // 외부 변경 동기: popstate / resetFilters 등으로 ui.search가 바뀌면 local state 갱신.
  // lastSentRef로 본인이 보낸 값과 구분 → 디바운스 round-trip 시 무한 setState 방지.
  useEffect(() => {
    if (ui.search !== lastSentRef.current) {
      setText(ui.search);
      lastSentRef.current = ui.search;
    }
  }, [ui.search]);

  useEffect(() => {
    if (text === lastSentRef.current) return;
    const id = window.setTimeout(() => {
      lastSentRef.current = text;
      setSearch(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [text]);

  return (
    <input
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Search GP, location, circuit..."
      aria-label="Search Grand Prix"
      style={{
        padding: '6px 12px',
        minWidth: '260px',
        borderRadius: '6px',
        border: '1px solid var(--color-border-strong)',
        background: 'var(--color-bg-elevated)',
        color: 'var(--color-text-primary)',
        fontSize: '13px',
        outline: 'none',
      }}
    />
  );
}

function CheckboxChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        border: '1px solid var(--color-border-strong)',
        background: checked ? 'var(--color-bg-elevated)' : 'transparent',
        color: checked ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontSize: '12px',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: 'var(--color-accent)', margin: 0 }}
      />
      {label}
    </label>
  );
}

export function FilterChips() {
  const ui = useUiState();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Sessions
        </span>
        {ALL_SESSION_TYPES.map((t) => (
          <CheckboxChip
            key={t}
            label={SESSION_TYPE_LABEL[t]}
            checked={ui.sessionTypes.has(t)}
            onChange={() => toggleSessionType(t)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Status
        </span>
        {ALL_STATUSES.map((s) => (
          <CheckboxChip
            key={s}
            label={STATUS_LABEL[s]}
            checked={ui.statuses.has(s)}
            onChange={() => toggleStatus(s)}
          />
        ))}
      </div>
    </div>
  );
}
