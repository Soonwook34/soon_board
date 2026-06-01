// dashboard §2.5/§2.8/§3.2/§3.3 — 섹터 색 판정(SectorBar)에 필요한 전체 AggregateResults 조립 훅.
// fastest_lap/purple_sectors/personal_bests 세 누적 통계를 한 객체로 모은다(null 가드).
// 리더보드 ⑤·현재상태 §3.2·최근5랩 §3.3 가 공유 — 시크해도 t 까지의 누적만 반영(인수8/14).

import { useMemo } from 'react';
import type { AggregateResults } from '../../shared/openf1Types';
import { useAggregate } from './useAggregate';

export function useAggregateResults(intervalMs?: number): AggregateResults {
  const fastest = useAggregate('fastest_lap', intervalMs);
  const purple = useAggregate('purple_sectors', intervalMs);
  const pbs = useAggregate('personal_bests', intervalMs);
  return useMemo<AggregateResults>(
    () => ({
      fastest_lap: fastest,
      purple_sectors: purple ?? { s1: null, s2: null, s3: null },
      personal_bests: pbs ?? new Map(),
    }),
    [fastest, purple, pbs],
  );
}
