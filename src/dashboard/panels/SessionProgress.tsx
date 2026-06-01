// dashboard §2.2 — 세션 진행률 바 ②.
//  - Race/Sprint: "LAP n / M" (n = leader 현재 lap, M = raceDistance 룩업, 없으면 ??)
//  - 그 외(Practice/Qualifying): 경과/총 시간 진행바
// raceDistance 는 graceful degrade (실패 시 ?? — 인수 21 연계). hooks 는 early-return 이전 호출.

import { useEffect, useMemo, useState } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { leaderCurrentLap } from '../derived/currentLap';
import { loadRaceDistance, totalLapsFor } from '../derived/totalLaps';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';
import type { SessionData } from '../../shared/seasonData';

const LAP_SESSION_TYPES = new Set(['race', 'sprint']);

export interface SessionProgressProps {
  session: SessionData;
  circuitKey: number | null | undefined;
  year: number;
  /** 테스트 주입 seam (catalogStore.fetchImpl 패턴). 기본 loadRaceDistance(). */
  loadRaceDistanceImpl?: () => Promise<Map<string, number>>;
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mmss = `${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return hh > 0 ? `${hh}:${mmss}` : mmss;
}

export function SessionProgress({ session, circuitKey, year, loadRaceDistanceImpl }: SessionProgressProps) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const [raceDistance, setRaceDistance] = useState<Map<string, number> | null>(null);

  const isLapMode = LAP_SESSION_TYPES.has(session.session_type.toLowerCase());

  useEffect(() => {
    if (!isLapMode) return;
    let cancelled = false;
    const loader = loadRaceDistanceImpl ?? (() => loadRaceDistance());
    loader()
      .then((m) => {
        if (!cancelled) setRaceDistance(m);
      })
      .catch(() => {
        if (!cancelled) setRaceDistance(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [isLapMode, loadRaceDistanceImpl]);

  const lap = useMemo(() => (isLapMode ? leaderCurrentLap(ds, t) : null), [isLapMode, ds, t]);
  const totalLaps =
    isLapMode && raceDistance && circuitKey != null ? totalLapsFor(raceDistance, circuitKey, year) : null;

  const startMs = Date.parse(session.date_start);
  const endMs = Date.parse(session.date_end);
  const totalMs = endMs - startMs;
  const elapsedMs = t.valueOf() - startMs;
  const pct = totalMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalMs)) : 0;
  const noData = t.valueOf() === 0 || !Number.isFinite(startMs);

  return (
    <section
      aria-label="세션 진행률"
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}
    >
      {isLapMode ? (
        <span style={{ fontSize: '15px', fontWeight: 700, color: dashboardColors.text }}>
          LAP {lap ?? '--'} / {totalLaps ?? '??'}
        </span>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: dashboardColors.textSecondary,
            }}
          >
            <span>{noData ? '--:--' : fmtDuration(Math.max(0, elapsedMs))}</span>
            <span>{Number.isFinite(totalMs) && totalMs > 0 ? fmtDuration(totalMs) : '--:--'}</span>
          </div>
          <div style={{ height: '4px', borderRadius: '999px', background: 'var(--color-border, #262d3a)' }}>
            <div
              data-testid="progress-fill"
              style={{
                width: `${pct * 100}%`,
                height: '100%',
                borderRadius: '999px',
                background: 'var(--color-accent, #e10600)',
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
