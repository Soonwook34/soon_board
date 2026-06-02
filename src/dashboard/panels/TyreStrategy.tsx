// dashboard §2.6 — 타이어 전략 ⑥. 드라이버별 스틴트 막대(반개구간 합산) + 현재랩 라인 + 핏점.
// Issue #89 (인수5): 인접 스틴트가 경계 lap 을 공유(A.lap_end == B.lap_start)하면 +1 중복.
// stintLapSpans 가 [lap_start, lap_end+1) 반개구간으로 타일링해 공유 lap 없이 합산되게 한다.

import { useMemo, useState } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { useDrivers } from '../shared/DriversContext';
import { tyreColor, tyreLetter } from '../shared/tyreColors';
import { leaderCurrentLap } from '../derived/currentLap';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';
import { PanelHeading } from '../shared/PanelHeading';
import type { StintRecord } from '../../shared/openf1Types';

export interface StintSpan {
  stint: StintRecord;
  /** 표시 구간 시작 lap (포함). */
  startLap: number;
  /** 표시 구간 끝 lap (포함). 다음 스틴트와 lap 을 공유하지 않게 타일링됨. */
  endLap: number;
}

/**
 * Issue #89 / 인수5 — 스틴트를 공유 lap 없이 타일링한다.
 * lap_start 오름차순으로 정렬 후, 각 스틴트의 끝을 (다음 스틴트 lap_start - 1) 로 끌어내려
 * 경계 lap 중복(+1)을 제거한다. 마지막 스틴트의 끝은 min(lap_end, currentLap).
 * sum(endLap - startLap + 1) === currentLap - firstStart + 1 (firstStart=lap_start of first).
 */
export function stintLapSpans(stints: readonly StintRecord[], currentLap: number): StintSpan[] {
  const sorted = [...stints].sort((a, b) => a.lap_start - b.lap_start);
  const spans: StintSpan[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const stint = sorted[i];
    if (stint.lap_start > currentLap) continue;
    const next = sorted[i + 1];
    // 다음 스틴트가 있으면 그 시작 직전까지 (경계 lap 공유 제거), 없으면 자신의 lap_end.
    const rawEnd = next ? next.lap_start - 1 : stint.lap_end;
    const endLap = Math.min(rawEnd, currentLap);
    if (endLap < stint.lap_start) continue;
    spans.push({ stint, startLap: stint.lap_start, endLap });
  }
  return spans;
}

interface DriverRow {
  driverNumber: number;
  spans: StintSpan[];
  pitLaps: number[];
  firstStart: number;
  /** 현재 순위 정렬 키 (#1) — position 없으면 +Infinity 로 맨 뒤. */
  sortKey: number;
}

export function TyreStrategy() {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const drivers = useDrivers();
  const currentLap = leaderCurrentLap(ds, t) ?? 0;
  // #2 — 리더보드를 주 패널로: ⑥ 타이어 전략은 기본 접힘(헤더 클릭 시 펼침).
  const [collapsed, setCollapsed] = useState(true);

  const rows = useMemo<DriverRow[]>(() => {
    if (currentLap <= 0) return [];
    const out: DriverRow[] = [];
    for (const driverNumber of drivers.keys()) {
      // stints 는 date 없는 lap-keyed endpoint → getAllBefore(date 컷)로는 못 가져온다 (실 DataSource 회귀:
      // StintRecord 에 date/date_start 없음 → allBefore 가 전부 누락). lap 기준 getStintForLap 을
      // 1..currentLap 순회해 거쳐온 스틴트를 모은다. currentLap 자체가 시간 컷이라 미래 누설 zero
      // (lap_start > currentLap 스틴트는 조회되지 않음).
      const byStint = new Map<number, StintRecord>();
      for (let lap = 1; lap <= currentLap; lap++) {
        const s = ds.getStintForLap(driverNumber, lap);
        if (s && !byStint.has(s.stint_number)) byStint.set(s.stint_number, s);
      }
      const spans = stintLapSpans([...byStint.values()], currentLap);
      if (spans.length === 0) continue;
      const pits = ds.getAllBefore('pit', t, { driver_number: driverNumber });
      // #1 — 현재 순위대로 정렬 (리더보드와 동일). 시간 컷은 getLatestBefore 가 보장 → 미래 누설 zero.
      const position = ds.getLatestBefore('position', t, { driver_number: driverNumber })?.position;
      out.push({
        driverNumber,
        spans,
        pitLaps: pits.map((p) => p.lap_number),
        firstStart: spans[0].startLap,
        sortKey: position ?? Number.POSITIVE_INFINITY,
      });
    }
    out.sort((a, b) => a.sortKey - b.sortKey);
    return out;
  }, [ds, t, drivers, currentLap]);

  return (
    <section
      data-testid="tyre-strategy"
      aria-label="타이어 전략"
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <button
        type="button"
        data-testid="tyre-strategy-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <span aria-hidden style={{ fontSize: '9px', color: dashboardColors.textMuted }}>
          {collapsed ? '▸' : '▾'}
        </span>
        <PanelHeading>TYRE STRATEGY</PanelHeading>
      </button>
      {!collapsed &&
        (rows.length === 0 ? (
          <span style={{ fontSize: '13px', color: dashboardColors.textMuted }}>데이터 없음</span>
        ) : (
          rows.map((row) => {
          // 전체 lap 폭: 첫 스틴트 시작 → 현재랩. firstStart=1 이면 currentLap 와 동일.
          const totalLaps = Math.max(1, currentLap - row.firstStart + 1);
          return (
            <div
              key={row.driverNumber}
              data-testid={`tyre-row-${row.driverNumber}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span
                style={{
                  width: '36px',
                  flex: '0 0 auto',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: dashboardColors.textSecondary,
                }}
              >
                {drivers.get(row.driverNumber)?.name_acronym ?? `#${row.driverNumber}`}
              </span>
              <div style={{ position: 'relative', flex: '1 1 auto', display: 'flex', height: '16px' }}>
                {row.spans.map((span) => {
                  const laps = span.endLap - span.startLap + 1;
                  const widthPct = (laps / totalLaps) * 100;
                  return (
                    <div
                      key={span.stint.stint_number}
                      data-compound={span.stint.compound}
                      title={`${span.stint.compound} L${span.startLap}-${span.endLap}`}
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        background: tyreColor(span.stint.compound),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: dashboardColors.panelBg,
                        overflow: 'hidden',
                      }}
                    >
                      {widthPct >= 8 ? tyreLetter(span.stint.compound) : ''}
                    </div>
                  );
                })}
                {row.pitLaps.map((lap, i) => {
                  const x = ((lap - row.firstStart + 1) / totalLaps) * 100;
                  if (x < 0 || x > 100) return null;
                  return (
                    <span
                      key={`pit-${lap}-${i}`}
                      data-testid={`tyre-pit-${row.driverNumber}`}
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: `${x}%`,
                        width: '4px',
                        height: '4px',
                        marginTop: '-2px',
                        marginLeft: '-2px',
                        borderRadius: '50%',
                        background: dashboardColors.text,
                      }}
                    />
                  );
                })}
                {/* 현재랩 수직 라인 — 막대가 currentLap 까지 이어지므로 우측 끝(100%). */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '2px',
                    height: '100%',
                    background: dashboardColors.borderStrong,
                  }}
                />
              </div>
            </div>
          );
        })
        ))}
    </section>
  );
}
