// 퀄리파잉 패널 공용 모델 훅 — derived/qualifyingModel(ds 와이어링)을 React 시계에 연결.
// undated session_result 접근은 derived 레이어(buildQualifyingModel)에 격리(futureLeakGuard 규약).

import { useMemo } from 'react';
import { useDataSource } from '../../shared/DataSourceContext';
import { useDisplayTime } from '../../shared/useDisplayTime';
import { useDrivers } from '../../shared/DriversContext';
import { buildQualifyingModel } from '../../derived/qualifyingModel';

export type { QualifyingModel } from '../../derived/qualifyingModel';

export function useQualifyingModel() {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const drivers = useDrivers();
  return useMemo(() => buildQualifyingModel(ds, drivers.keys(), t), [ds, t, drivers]);
}
