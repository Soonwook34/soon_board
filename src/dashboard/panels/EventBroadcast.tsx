// dashboard §2.7 / #5 — 상단 브로드캐스트. 중요 race_control 이벤트(플래그/SC/적기/체커)를 전진 시
// 화면 상단에서 슬라이드인 + ~5s 후 자동 사라짐 (F1 중계식). ④ Race Control 배너(현재 상태 표시)와 별개.
//
// 미래 누설 zero(인수18): getAllBefore('race_control', t, undefined, 1) 만 사용해 t 이후 이벤트는 안 봄.
// 전진 판정은 "최신 이벤트 date" 끼리 비교(display_time 컷이 아님) — 마운트/후진 시크에선 발생 안 함(spam 방지).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { flagKind, type FlagKind } from '../shared/flagDecoder';
import { flagIcon } from '../shared/flagIcons';
import { dashboardColors } from '../shared/dashboardStyles';
import type { RaceControlRecord } from '../../shared/openf1Types';

const BROADCAST_TTL_MS = 5_000;

// 사용자 결정(Q2): 중요 이벤트만 알림. green/clear/other(일상 메시지)는 제외해 spam 방지.
type ImportantKind = 'red' | 'yellow' | 'safetycar' | 'chequered';
const IMPORTANT = new Set<FlagKind>(['red', 'yellow', 'safetycar', 'chequered']);

function importantKindOf(rc: RaceControlRecord): ImportantKind | null {
  const k = flagKind(rc);
  return IMPORTANT.has(k) ? (k as ImportantKind) : null;
}

// flag 종류별 강조색 — ④ RaceControlBanner 와 동일한 F1 방송 표준색(인수19 예외). 중요 4종만.
const BROADCAST_ACCENT: Record<ImportantKind, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  safetycar: '#f59e0b',
  chequered: '#e8eaf0',
};

const KEYFRAMES =
  '@keyframes event-broadcast-in{from{transform:translate(-50%,-12px);opacity:0}to{transform:translate(-50%,0);opacity:1}}';

interface Broadcast {
  record: RaceControlRecord;
  kind: ImportantKind;
}

export function EventBroadcast() {
  const ds = useDataSource();
  const t = useDisplayTime(500);
  const latest = useMemo<RaceControlRecord | null>(
    () => ds.getAllBefore('race_control', t, undefined, 1)[0] ?? null,
    [ds, t],
  );
  const latestMs = latest?.date instanceof Date ? latest.date.valueOf() : null;

  const latestRef = useRef(latest);
  latestRef.current = latest;
  // 직전 평가에서 본 최신 이벤트 시각. undefined = 첫 평가(마운트) → baseline 만 잡고 무통지.
  const lastSeenRef = useRef<number | null | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<Broadcast | null>(null);

  useEffect(() => {
    const prev = lastSeenRef.current;
    lastSeenRef.current = latestMs;
    if (prev === undefined) return; // 마운트 baseline — 기존 최신 이벤트로는 통지 안 함
    if (latestMs == null) return;
    const rec = latestRef.current;
    if (!rec) return;
    const kind = importantKindOf(rec);
    // 전진(이전보다 새로운 최신) + 중요 → 알림. 마운트 때 이벤트 없었으면(prev=null) -Inf 로 취급해
    // 첫 이벤트 진입도 전진으로 인정. 후진 시크(latestMs ≤ prev)는 통지 안 함.
    const prevMs = prev ?? Number.NEGATIVE_INFINITY;
    if (kind && latestMs > prevMs) {
      setActive({ record: rec, kind });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(null), BROADCAST_TTL_MS);
    }
  }, [latestMs]);

  // 언마운트 시 타이머 정리.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  if (!active) return null;
  return (
    <div
      data-testid="event-broadcast"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 18px',
        borderRadius: '8px',
        background: dashboardColors.panelBgElevated,
        borderLeft: `4px solid ${BROADCAST_ACCENT[active.kind]}`,
        color: dashboardColors.text,
        fontSize: '14px',
        fontWeight: 600,
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
        animation: 'event-broadcast-in 0.25s ease',
        maxWidth: '90vw',
      }}
    >
      <style>{KEYFRAMES}</style>
      <span aria-hidden style={{ fontSize: '16px' }}>
        {flagIcon(active.record)}
      </span>
      <span>{active.record.message || active.kind.toUpperCase()}</span>
    </div>
  );
}
