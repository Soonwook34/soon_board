// dashboard §2.5/§5 — 드라이버 메타(acronym·팀컬러·이름) 맵.
// drivers 는 비-시계열 정적 메타라 DataSource(시간 쿼리)와 분리한다: 화면이 /v1/drivers 를 1회
// fetch 해 context 로 패널에 제공 (DataSourceProvider 와 동일한 순수 provider 패턴).
// useDrivers 는 provider 없으면 빈 Map (graceful — drivers 는 선택 메타라 throw 하지 않음).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DriverRecord } from '../../shared/openf1Types';
import { openF1Client, type OpenF1Client } from '../../shared/openf1Client';

export type DriversMap = ReadonlyMap<number, DriverRecord>;

const EMPTY_DRIVERS: DriversMap = new Map();
const DriversContext = createContext<DriversMap>(EMPTY_DRIVERS);

export function DriversProvider({ drivers, children }: { drivers: DriversMap; children: ReactNode }) {
  return <DriversContext.Provider value={drivers}>{children}</DriversContext.Provider>;
}

export function useDrivers(): DriversMap {
  return useContext(DriversContext);
}

const NEUTRAL_TEAM_COLOR = '#9ca3af';

/** DriverRecord.team_colour(OpenF1 은 '#' 없는 hex) → '#rrggbb'. 없으면 중립 회색. */
export function teamColorOf(driver: DriverRecord | undefined): string {
  const c = driver?.team_colour;
  if (!c) return NEUTRAL_TEAM_COLOR;
  return c.startsWith('#') ? c : `#${c}`;
}

/**
 * sessionKey 의 /v1/drivers 를 1회 fetch 해 Map<driver_number, DriverRecord> 반환.
 * 로딩/실패/비활성 시 빈 Map (graceful). 싱글톤 client 경유 → LiveMap 의 drivers fetch 와 dedup.
 * options.enabled=false 면 fetch 안 함 (CORS gate 미통과 등 — 화면이 pingState 로 제어).
 */
export function useSessionDrivers(
  sessionKey: number,
  options: { enabled?: boolean; client?: OpenF1Client } = {},
): DriversMap {
  const { enabled = true, client = openF1Client } = options;
  const [drivers, setDrivers] = useState<DriversMap>(EMPTY_DRIVERS);

  useEffect(() => {
    if (!enabled || !Number.isFinite(sessionKey)) return;
    const ctrl = new AbortController();
    let alive = true;
    client
      .fetch({ path: '/v1/drivers', params: { session_key: sessionKey }, priority: 'normal', signal: ctrl.signal })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<DriverRecord[]>)
          : Promise.reject(new Error(`drivers HTTP ${r.status}`)),
      )
      .then((list) => {
        if (!alive) return;
        const map = new Map<number, DriverRecord>();
        for (const d of list) {
          if (Number.isFinite(d.driver_number)) map.set(d.driver_number, d);
        }
        setDrivers(map);
      })
      .catch(() => {
        // graceful — 빈 Map 유지 (리더보드 등은 acronym/색 없이도 동작 또는 미표시).
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [sessionKey, enabled, client]);

  return drivers;
}
