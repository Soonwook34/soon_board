// dashboard §3.3 — 최근 완료 5랩 테이블. getCompletedLapsBefore(미완료 랩 제외 = 인수17b 누설 zero).
// S1/S2/S3 는 sectorColor SSOT 색(보라/초록/노랑/회색, 인수13/16). Speed Trap = st_speed.

import { useMemo, useState, type CSSProperties } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { useAggregateResults } from '../shared/useAggregateResults';
import { sectorColor, type SectorIndex } from '../shared/sectorColors';
import { formatLapTime, formatSector } from '../shared/formatTime';
import { dashboardColors } from '../shared/dashboardStyles';

const MONO = 'var(--font-mono, monospace)';
const NO_VALUE = '—';
const SECTORS: readonly SectorIndex[] = [1, 2, 3];

const headCell: CSSProperties = {
  fontSize: '10px',
  color: dashboardColors.textMuted,
  fontWeight: 600,
  textAlign: 'right',
  padding: '2px 4px',
};
const cell: CSSProperties = { fontSize: '11px', fontFamily: MONO, textAlign: 'right', padding: '2px 4px' };

export function RecentLapsTable({ driverNumber }: { driverNumber: number }) {
  const ds = useDataSource();
  const t = useDisplayTime(500);
  const aggregate = useAggregateResults();

  const [expanded, setExpanded] = useState(false);
  // #3 — 전체 완료랩을 한 번 조회(미완료 랩 제외는 getCompletedLapsBefore 가 보장, 인수17b).
  // 기본은 최근 5랩, "더 보기" 로 전체 펼침.
  const all = useMemo(() => ds.getCompletedLapsBefore(driverNumber, t), [ds, t, driverNumber]);
  const laps = expanded ? all : all.slice(0, 5);

  return (
    <section data-testid="recent-laps" aria-label="최근 5랩" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '10px', color: dashboardColors.textMuted }}>RECENT LAPS</span>
      {laps.length === 0 ? (
        <span style={{ fontSize: '12px', color: dashboardColors.textMuted }}>기록 없음</span>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...headCell, textAlign: 'left' }}>LAP</th>
              <th style={headCell}>TIME</th>
              <th style={headCell}>S1</th>
              <th style={headCell}>S2</th>
              <th style={headCell}>S3</th>
              <th style={headCell}>SPD</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap) => {
              const vals: readonly (number | null)[] = [
                lap.duration_sector_1 ?? null,
                lap.duration_sector_2 ?? null,
                lap.duration_sector_3 ?? null,
              ];
              return (
                <tr key={lap.lap_number} data-testid={`recent-lap-${lap.lap_number}`}>
                  <td style={{ ...cell, textAlign: 'left', color: dashboardColors.textSecondary }}>
                    {lap.lap_number}
                  </td>
                  <td style={{ ...cell, color: dashboardColors.text }}>{formatLapTime(lap.lap_duration)}</td>
                  {SECTORS.map((s) => (
                    <td
                      key={s}
                      data-sector={s}
                      style={{ ...cell, color: sectorColor(aggregate, driverNumber, s, vals[s - 1]) }}
                    >
                      {formatSector(vals[s - 1])}
                    </td>
                  ))}
                  <td style={{ ...cell, color: dashboardColors.textMuted }}>
                    {lap.st_speed != null ? lap.st_speed : NO_VALUE}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {all.length > 5 && (
        <button
          type="button"
          data-testid="recent-laps-toggle"
          onClick={() => setExpanded((e) => !e)}
          style={{
            alignSelf: 'flex-start',
            marginTop: '2px',
            background: 'transparent',
            border: 'none',
            color: dashboardColors.textSecondary,
            fontSize: '11px',
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          {expanded ? '접기' : `더 보기 (+${all.length - 5})`}
        </button>
      )}
    </section>
  );
}
