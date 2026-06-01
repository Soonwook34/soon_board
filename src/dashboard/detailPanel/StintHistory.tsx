// dashboard §3.5 — 스틴트 히스토리. stints 는 undated → getStintForLap 을 1..currentLap 순회 수집
// (TyreStrategy 와 동일 패턴; currentLap 이 시간컷이라 미래 시작 스틴트 미표시 = 인수17c 누설 zero).
// lap_end ≤ currentLap → 완료, 아니면 '진행 중'(표시 lap_end = currentLap).

import { useMemo } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { leaderCurrentLap } from '../derived/currentLap';
import { tyreColor, tyreLetter } from '../shared/tyreColors';
import { dashboardColors } from '../shared/dashboardStyles';
import type { StintRecord } from '../../shared/openf1Types';

const MONO = 'var(--font-mono, monospace)';

export function StintHistory({ driverNumber }: { driverNumber: number }) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const currentLap = leaderCurrentLap(ds, t) ?? 0;

  const stints = useMemo<StintRecord[]>(() => {
    if (currentLap <= 0) return [];
    const byStint = new Map<number, StintRecord>();
    for (let lap = 1; lap <= currentLap; lap++) {
      const s = ds.getStintForLap(driverNumber, lap);
      if (s && !byStint.has(s.stint_number)) byStint.set(s.stint_number, s);
    }
    return [...byStint.values()].sort((a, b) => a.stint_number - b.stint_number);
  }, [ds, driverNumber, currentLap]);

  return (
    <section data-testid="stint-history" aria-label="스틴트 히스토리" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '10px', color: dashboardColors.textMuted }}>STINTS</span>
      {stints.length === 0 ? (
        <span style={{ fontSize: '12px', color: dashboardColors.textMuted }}>스틴트 없음</span>
      ) : (
        stints.map((stint) => {
          const complete = stint.lap_end <= currentLap;
          const endLap = complete ? stint.lap_end : currentLap;
          return (
            <div
              key={stint.stint_number}
              data-testid={`stint-${stint.stint_number}`}
              style={{ fontSize: '12px', fontFamily: MONO, color: dashboardColors.text, display: 'flex', gap: '6px', alignItems: 'baseline' }}
            >
              <span style={{ color: tyreColor(stint.compound), fontWeight: 700 }}>
                {tyreLetter(stint.compound)}
              </span>
              <span>
                L{stint.lap_start}-{endLap}
              </span>
              <span style={{ color: dashboardColors.textMuted }}>age {stint.tyre_age_at_start}</span>
              {!complete && (
                <span style={{ color: dashboardColors.textSecondary, fontSize: '11px' }}>진행 중</span>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
