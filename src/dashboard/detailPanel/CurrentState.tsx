// dashboard §3.2 — 현재 상태. 포지션·현재랩·갭·타이어 + Last Lap(섹터바+섹터시간) + In Progress 행.
// 모든 시간 읽기는 DataSource 메서드 경유(인수18). In Progress 판정은 raw date 비교 없이
// "getLapAt 의 lap_number > 최근 완료 lap_number"(=완료 집합에 아직 없음)로 판단(인수18/§4.5).
// 섹터 색은 sectorColor/SectorBar SSOT(인수13), 미통과/null 섹터는 회색(인수16).

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { useAggregateResults } from '../shared/useAggregateResults';
import { SectorBar } from '../shared/SectorBar';
import { sectorColor, SECTOR_INDICES } from '../shared/sectorColors';
import { tyreColor, tyreLetter } from '../shared/tyreColors';
import { formatGap, formatLapTime, formatSector, NO_VALUE } from '../shared/formatTime';
import { dashboardColors, MONO } from '../shared/dashboardStyles';
import type { LapRecord } from '../../shared/openf1Types';

function StatItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '10px', color: dashboardColors.textMuted, letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: '13px', fontFamily: MONO, color: dashboardColors.text }}>{children}</span>
    </div>
  );
}

const sectorTextStyle: CSSProperties = { fontSize: '11px', fontFamily: MONO };

export function CurrentState({ driverNumber }: { driverNumber: number }) {
  const ds = useDataSource();
  const t = useDisplayTime(500);
  const aggregate = useAggregateResults();

  const state = useMemo(() => {
    const last = ds.getCompletedLapsBefore(driverNumber, t, 1)[0] ?? null;
    const cur = ds.getLapAt(driverNumber, t);
    const currentLapNum = cur?.lap_number ?? last?.lap_number ?? null;
    const position = ds.getLatestBefore('position', t, { driver_number: driverNumber })?.position ?? null;
    const iv = ds.getLatestBefore('intervals', t, { driver_number: driverNumber });
    const stint = currentLapNum != null ? ds.getStintForLap(driverNumber, currentLapNum) : null;
    const tyreAge =
      stint && currentLapNum != null ? currentLapNum - stint.lap_start + stint.tyre_age_at_start : null;
    // In Progress: getLapAt 이 가리키는 lap 이 아직 완료 집합(getCompletedLapsBefore)에 없으면 주행 중.
    const inProgress = cur != null && (last == null || cur.lap_number > last.lap_number) ? cur : null;
    return { last, currentLapNum, position, interval: iv?.interval, gap: iv?.gap_to_leader, stint, tyreAge, inProgress };
  }, [ds, t, driverNumber]);

  const renderSectors = (lap: LapRecord) => {
    const vals: readonly (number | null)[] = [
      lap.duration_sector_1 ?? null,
      lap.duration_sector_2 ?? null,
      lap.duration_sector_3 ?? null,
    ];
    return (
      <>
        <SectorBar
          sectors={[vals[0], vals[1], vals[2]]}
          aggregate={aggregate}
          driverNumber={driverNumber}
        />
        <div style={{ display: 'flex', gap: '10px', marginTop: '3px' }}>
          {SECTOR_INDICES.map((s) => (
            <span
              key={s}
              style={{ ...sectorTextStyle, color: sectorColor(aggregate, driverNumber, s, vals[s - 1]) }}
            >
              S{s} {formatSector(vals[s - 1])}
            </span>
          ))}
        </div>
      </>
    );
  };

  return (
    <section data-testid="current-state" aria-label="현재 상태" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <StatItem label="POS">{state.position != null ? `P${state.position}` : NO_VALUE}</StatItem>
        <StatItem label="LAP">{state.currentLapNum != null ? `L${state.currentLapNum}` : NO_VALUE}</StatItem>
        <StatItem label="INT">{formatGap(state.interval)}</StatItem>
        <StatItem label="GAP">{formatGap(state.gap)}</StatItem>
        <StatItem label="TYRE">
          {state.stint ? (
            <>
              <span style={{ color: tyreColor(state.stint.compound), fontWeight: 700 }}>
                {tyreLetter(state.stint.compound)}
              </span>
              {state.tyreAge != null && (
                <span style={{ color: dashboardColors.textMuted }}> {state.tyreAge}</span>
              )}
            </>
          ) : (
            NO_VALUE
          )}
        </StatItem>
      </div>

      <div data-testid="cs-last-lap">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: dashboardColors.textMuted }}>LAST LAP</span>
          <span style={{ fontSize: '18px', fontFamily: MONO, color: dashboardColors.text }}>
            {formatLapTime(state.last?.lap_duration)}
          </span>
        </div>
        {state.last && renderSectors(state.last)}
      </div>

      {state.inProgress && (
        <div data-testid="cs-in-progress">
          <span style={{ fontSize: '10px', color: dashboardColors.textMuted }}>IN PROGRESS</span>
          {renderSectors(state.inProgress)}
        </div>
      )}
    </section>
  );
}
