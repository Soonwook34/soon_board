// dashboard §4.3 — getAllBefore 구독 훅 (이벤트 티커 §2.7, 핏 히스토리 §3.4 등).
// throttled t 로 ds 위임, 시간 역순(최신 우선) 배열 반환.
//
// ⚠️ options.filters 는 **안정 reference** 로 전달할 것 (모듈 상수 또는 useMemo). 매 렌더
//    새 객체 리터럴을 넘기면 useMemo dep 가 매번 바뀌어 재계산된다 (정확성엔 영향 없음, 비용만).

import { useMemo } from 'react';
import type { OpenF1EndpointName, OpenF1EndpointRecords } from '../../shared/openf1Types';
import { useDataSource } from './DataSourceContext';
import { useDisplayTime } from './useDisplayTime';

export function useAllBefore<E extends OpenF1EndpointName>(
  endpoint: E,
  options: { filters?: Partial<OpenF1EndpointRecords[E]>; limit?: number; intervalMs?: number } = {},
): OpenF1EndpointRecords[E][] {
  const ds = useDataSource();
  const t = useDisplayTime(options.intervalMs);
  const { filters, limit } = options;
  return useMemo(() => ds.getAllBefore(endpoint, t, filters, limit), [ds, endpoint, t, filters, limit]);
}
