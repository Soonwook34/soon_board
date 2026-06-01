// dashboard §2.5 — 리더보드 ⑤. position 정렬 20행 + LAST 섹터바 + 타이어 + 표지. 클릭→선택.

import { useMemo, type CSSProperties } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { useDrivers, teamColorOf } from '../shared/DriversContext';
import { useAggregate } from '../shared/useAggregate';
import { tyreColor, tyreLetter } from '../shared/tyreColors';
import { SectorBar } from '../shared/SectorBar';
import { personalBestLap } from '../derived/personalBests';
import { selectDriver } from '../shared/selectionStore';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';
import type { AggregateResults } from '../../shared/openf1Types';

const MONO = 'var(--font-mono, monospace)';
const NO_VALUE = '—';

/** float 동등 비교 — fastest_lap 보유 판정 (sectorColors 와 동일 epsilon). */
function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** 91.456 → '1:31.456'. 음수/NaN 은 '—'. */
function formatLapTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return NO_VALUE;
  const min = Math.floor(sec / 60);
  const rem = sec - min * 60;
  return `${min}:${rem.toFixed(3).padStart(6, '0')}`;
}

/** interval/gap_to_leader 표시: 숫자 → '+s.mmm', 문자열 → 그대로, null → '—'. */
function formatGap(value: number | string | null | undefined): string {
  if (value == null) return NO_VALUE;
  if (typeof value === 'number') return `+${value.toFixed(3)}`;
  return value;
}

const headerCellStyle: CSSProperties = {
  color: dashboardColors.textMuted,
  fontSize: '11px',
  fontWeight: 600,
  textAlign: 'left',
  padding: '2px 6px',
};

const cellStyle: CSSProperties = {
  padding: '2px 6px',
  verticalAlign: 'middle',
};

const monoCellStyle: CSSProperties = {
  ...cellStyle,
  fontFamily: MONO,
  fontSize: '12px',
};

const markerStyle: CSSProperties = {
  fontSize: '10px',
  verticalAlign: 'super',
  marginLeft: '2px',
};

export function Leaderboard() {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const drivers = useDrivers();

  const fastest = useAggregate('fastest_lap');
  const purple = useAggregate('purple_sectors');
  const pbs = useAggregate('personal_bests');
  const aggregate = useMemo<AggregateResults>(
    () => ({
      fastest_lap: fastest,
      purple_sectors: purple ?? { s1: null, s2: null, s3: null },
      personal_bests: pbs ?? new Map(),
    }),
    [fastest, purple, pbs],
  );

  const rows = useMemo(() => {
    const built = [];
    for (const driver_number of drivers.keys()) {
      const driver = drivers.get(driver_number);
      const pos = ds.getLatestBefore('position', t, { driver_number });
      const iv = ds.getLatestBefore('intervals', t, { driver_number });
      const last = ds.getCompletedLapsBefore(driver_number, t, 1)[0];
      const lapNum = last?.lap_number ?? null;
      const stint = lapNum != null ? ds.getStintForLap(driver_number, lapNum) : null;
      const tyreAge =
        stint && lapNum != null ? lapNum - stint.lap_start + stint.tyre_age_at_start : null;

      const pbLap = personalBestLap(aggregate, driver_number);
      const isFastest =
        pbLap != null && fastest != null && approxEq(pbLap, fastest.lap_duration);
      const dnf = ds.getLatestBefore('session_result', t, { driver_number })?.dnf ?? false;
      const latestPit = ds.getLatestBefore('pit', t, { driver_number });
      const justPitted = latestPit != null && lapNum != null && latestPit.lap_number === lapNum;

      built.push({
        driver_number,
        acronym: driver?.name_acronym || `#${driver_number}`,
        teamColor: teamColorOf(driver),
        position: pos?.position ?? null,
        interval: iv?.interval,
        gap: iv?.gap_to_leader,
        last,
        stint,
        tyreAge,
        isFastest,
        dnf,
        justPitted,
        sortKey: pos?.position ?? Number.POSITIVE_INFINITY,
      });
    }
    built.sort((a, b) => a.sortKey - b.sortKey);
    return built;
  }, [ds, t, drivers, aggregate, fastest]);

  return (
    <section
      data-testid="leaderboard"
      aria-label="Leaderboard"
      style={{ ...panelStyle, overflowX: 'auto' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>P</th>
            <th style={headerCellStyle}>DRV</th>
            <th style={headerCellStyle}>INT</th>
            <th style={headerCellStyle}>GAP</th>
            <th style={headerCellStyle}>LAST</th>
            <th style={headerCellStyle}>TYR</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ ...cellStyle, color: dashboardColors.textMuted }}>
                데이터 없음
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.driver_number}
                data-testid={`lb-row-${row.driver_number}`}
                role="button"
                onClick={() => selectDriver(row.driver_number)}
                style={{ cursor: 'pointer', borderTop: `1px solid ${dashboardColors.border}` }}
              >
                <td style={monoCellStyle}>{row.position ?? NO_VALUE}</td>
                <td style={cellStyle}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      marginRight: '6px',
                      background: row.teamColor,
                    }}
                  />
                  <span style={{ fontSize: '12px', color: dashboardColors.text }}>{row.acronym}</span>
                  {row.isFastest && (
                    <span style={{ ...markerStyle, color: dashboardColors.text }}>ⓕ</span>
                  )}
                  {row.dnf && (
                    <span style={{ ...markerStyle, color: dashboardColors.textMuted }}>✕</span>
                  )}
                  {row.justPitted && (
                    <span style={{ ...markerStyle, color: dashboardColors.textSecondary }}>ⓟ</span>
                  )}
                </td>
                <td style={monoCellStyle}>{formatGap(row.interval)}</td>
                <td style={monoCellStyle}>{formatGap(row.gap)}</td>
                <td style={monoCellStyle}>
                  {formatLapTime(row.last?.lap_duration)}
                  {row.last && (
                    <SectorBar
                      sectors={[
                        row.last.duration_sector_1 ?? null,
                        row.last.duration_sector_2 ?? null,
                        row.last.duration_sector_3 ?? null,
                      ]}
                      aggregate={aggregate}
                      driverNumber={row.driver_number}
                    />
                  )}
                </td>
                <td style={cellStyle}>
                  {row.stint ? (
                    <span style={{ fontSize: '12px', fontFamily: MONO }}>
                      <span style={{ color: tyreColor(row.stint.compound), fontWeight: 700 }}>
                        {tyreLetter(row.stint.compound)}
                      </span>
                      {row.tyreAge != null && (
                        <span style={{ color: dashboardColors.textMuted }}> {row.tyreAge}</span>
                      )}
                    </span>
                  ) : (
                    <span style={{ ...monoCellStyle, padding: 0 }}>{NO_VALUE}</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
