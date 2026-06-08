// 퀄리파잉 패널 공용 모델 — buildQualifyingModel 을 React 시계에 연결해 1Hz 1회만 계산하고,
// QualifyingTower·KnockoutPanel·SegmentBestBoard 형제 패널이 context 로 공유한다(틱당 3중 계산 제거).
// undated session_result 접근은 derived 레이어(buildQualifyingModel)에 격리(futureLeakGuard 규약).

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDataSource } from '../../shared/DataSourceContext';
import { useDisplayTime } from '../../shared/useDisplayTime';
import { useDrivers } from '../../shared/DriversContext';
import { buildQualifyingModel, type QualifyingModel } from '../../derived/qualifyingModel';

export type { QualifyingModel } from '../../derived/qualifyingModel';

const QualifyingModelContext = createContext<QualifyingModel | null>(null);

/** ds·display_time·drivers 로 buildQualifyingModel 을 1Hz 1회 계산해 하위 사이드바 패널에 제공. */
export function QualifyingModelProvider({ children }: { children: ReactNode }) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const drivers = useDrivers();
  const model = useMemo(() => buildQualifyingModel(ds, drivers.keys(), t), [ds, t, drivers]);
  return <QualifyingModelContext.Provider value={model}>{children}</QualifyingModelContext.Provider>;
}

export function useQualifyingModel(): QualifyingModel {
  const model = useContext(QualifyingModelContext);
  if (model == null) {
    throw new Error('useQualifyingModel must be used within a QualifyingModelProvider');
  }
  return model;
}
