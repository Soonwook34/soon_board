// 대시보드 패널 렌더 테스트용 fake DataSource. *.test 가 아니라 vitest 가 수집 안 함
// (createMockOpenF1Client.ts 와 동일 규약). 필요한 메서드만 override 로 주입.

import type { DataSource, StreamState } from '../../shared/DataSource';

export interface FakeDsHandle {
  ds: DataSource;
  /** display_time 갱신 + onDisplayTimeChange 구독자 통지 (getDisplayTime 을 override 안 한 경우만 유효). */
  setTime(t: Date): void;
}

export function makeFakeDs(
  overrides: { displayTime?: Date; streamState?: StreamState } & Record<string, unknown> = {},
): FakeDsHandle {
  const { displayTime, streamState, ...methodOverrides } = overrides;
  let current = displayTime ?? new Date(0);
  const listeners = new Set<(t: Date) => void>();
  const ds = {
    getDisplayTime: () => current,
    onDisplayTimeChange: (h: (t: Date) => void) => {
      listeners.add(h);
      return () => listeners.delete(h);
    },
    getStreamState: () => streamState ?? 'live',
    getSamplePair: () => null,
    getLatestBefore: () => null,
    getAllBefore: () => [],
    getLapAt: () => null,
    getCompletedLapsBefore: () => [],
    getStintForLap: () => null,
    getAggregateBefore: () => null,
    ...methodOverrides,
  } as unknown as DataSource;
  return {
    ds,
    setTime(t: Date) {
      current = t;
      for (const l of listeners) l(t);
    },
  };
}
