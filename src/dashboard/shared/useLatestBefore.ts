// dashboard §4.3 — getLatestBefore 구독 훅. display_time 의 throttled t 로 ds 위임.
// 패널이 raw record.date 비교를 직접 하지 않도록 단일 진입점 (인수 18).
//
// ⚠️ options.filters 는 **안정 reference** 로 전달할 것 (모듈 상수 또는 useMemo). 매 렌더
//    새 객체 리터럴을 넘기면 useMemo dep 가 매번 바뀌어 재계산된다 (정확성엔 영향 없음, 비용만).

import { useMemo } from 'react';
import type { OpenF1EndpointName, OpenF1EndpointRecords } from '../../shared/openf1Types';
import { useDataSource } from './DataSourceContext';
import { useDisplayTime } from './useDisplayTime';

export function useLatestBefore<E extends OpenF1EndpointName>(
  endpoint: E,
  options: { filters?: Partial<OpenF1EndpointRecords[E]>; intervalMs?: number } = {},
): OpenF1EndpointRecords[E] | null {
  const ds = useDataSource();
  const t = useDisplayTime(options.intervalMs);
  const { filters } = options;
  return useMemo(() => ds.getLatestBefore(endpoint, t, filters), [ds, endpoint, t, filters]);
}
