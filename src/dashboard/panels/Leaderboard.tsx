// dashboard §2.5 — 리더보드 ⑤. position 정렬 20행 + LAST 섹터바 + 타이어 + 표지. 클릭→선택.

import { useMemo, type CSSProperties } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { useDrivers, teamColorOf } from '../shared/DriversContext';
import { useAggregateResults } from '../shared/useAggregateResults';
import { tyreColor, tyreLetter } from '../shared/tyreColors';
import { SectorBar } from '../shared/SectorBar';
import { personalBestLap } from '../derived/personalBests';
import { selectDriver } from '../shared/selectionStore';
import { dashboardColors, MONO, panelStyle } from '../shared/dashboardStyles';
import { PanelHeading } from '../shared/PanelHeading';
import { formatGap, formatLapTime, NO_VALUE } from '../shared/formatTime';
import { approxEq } from '../shared/sectorColors';
import { driverOutAt } from '../derived/driverOutStatus';

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

  const aggregate = useAggregateResults();
  const fastest = aggregate.fastest_lap;

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
      // out(DNF/DNS/DSQ) — driverOutAt 가 undated session_result 를 시간 컷된 완료 랩과 결합해
      // 실제 리타이어 시점 이후에만 non-null (미래 누설 zero, 인수18). 직접 getSessionResult 금지.
      const out = driverOutAt(ds, driver_number, t);
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
        out,
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
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '6px', overflowX: 'auto' }}
    >
      <PanelHeading>LEADERBOARD</PanelHeading>
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
                  {row.out && (
                    <span
                      data-testid={`lb-out-${row.driver_number}`}
                      title={row.out === 'dns' ? 'DNS' : row.out === 'dsq' ? 'DSQ' : 'DNF'}
                      aria-label={row.out === 'dns' ? 'DNS' : row.out === 'dsq' ? 'DSQ' : 'DNF'}
                      style={{ ...markerStyle, color: dashboardColors.textMuted }}
                    >
                      ✕
                    </span>
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
