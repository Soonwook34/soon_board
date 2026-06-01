// dashboard §4.3/§2.8 — getAggregateBefore 구독 훅 (빠른 랩, 보라색 섹터, personal best).
// 시크해도 t 까지의 누적만 반영 → 미래 best 표시 없음 (§4.4, 인수 8/14).

import { useMemo } from 'react';
import type { AggregateName, AggregateResults } from '../../shared/openf1Types';
import { useDataSource } from './DataSourceContext';
import { useDisplayTime } from './useDisplayTime';

export function useAggregate<A extends AggregateName>(
  aggregate: A,
  intervalMs?: number,
): AggregateResults[A] {
  const ds = useDataSource();
  const t = useDisplayTime(intervalMs);
  return useMemo(() => ds.getAggregateBefore(aggregate, t), [ds, aggregate, t]);
}
