// dashboard §3.4 — 핏 히스토리. getAllBefore('pit', t) 만 사용(컴포넌트 자체 date filter 금지, 인수18).
// 미래 핏 record 미표시(인수17a — getAllBefore 가 date ≤ t 컷). 'Lap N · {pit_duration}s' (null → '—').

import { useMemo } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { dashboardColors, MONO } from '../shared/dashboardStyles';

export function PitHistory({ driverNumber }: { driverNumber: number }) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);

  const pits = useMemo(
    () => ds.getAllBefore('pit', t, { driver_number: driverNumber }),
    [ds, t, driverNumber],
  );

  return (
    <section data-testid="pit-history" aria-label="핏 히스토리" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '10px', color: dashboardColors.textMuted }}>PIT STOPS</span>
      {pits.length === 0 ? (
        <span style={{ fontSize: '12px', color: dashboardColors.textMuted }}>핏 기록 없음</span>
      ) : (
        pits.map((pit, i) => (
          <div
            key={`${pit.lap_number}-${i}`}
            data-testid={`pit-${pit.lap_number}`}
            style={{ fontSize: '12px', fontFamily: MONO, color: dashboardColors.text }}
          >
            Lap {pit.lap_number} · {pit.pit_duration != null ? `${pit.pit_duration.toFixed(1)}s` : '—'}
          </div>
        ))
      )}
    </section>
  );
}
