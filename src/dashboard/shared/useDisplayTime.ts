// dashboard §4.1/§4.3 — display_time 구독 훅 (단일 진실 원천).
//
// display_time 은 RAF/tick 으로 매우 자주 바뀌지만 패널은 그렇게 자주 다시 그릴 필요 없다.
// 정상 진행은 intervalMs polling 으로 throttle 하고, 시크/모드전환(시간 점프)은 즉시 반영한다
// (§4.4: 시크 후 모든 패널 동시 재평가, 인수 2: 100ms 내).

import { useEffect, useState } from 'react';
import { useDataSource } from './DataSourceContext';

/** 점프 판정 임계 — 정상 진행(<2s 전진)은 poll 로, 뒤로/큰 폭 앞으로 점프는 즉시. */
const JUMP_THRESHOLD_MS = 2_000;

export function useDisplayTime(intervalMs = 500): Date {
  const ds = useDataSource();
  const [t, setT] = useState<Date>(() => ds.getDisplayTime());

  useEffect(() => {
    let lastApplied = ds.getDisplayTime().valueOf();
    const apply = (d: Date): void => {
      lastApplied = d.valueOf();
      setT(d);
    };
    // 정상 진행: intervalMs 주기 polling (wall-drift 로 매끄럽게 진행, throttle).
    const poll = (): void => {
      const d = ds.getDisplayTime();
      if (d.valueOf() !== lastApplied) apply(d);
    };
    const id = setInterval(poll, intervalMs);
    // 시크/모드전환: 뒤로 또는 큰 폭 앞으로 점프 시 즉시 반영.
    const unsub = ds.onDisplayTimeChange((d) => {
      const delta = d.valueOf() - lastApplied;
      if (delta < 0 || delta > JUMP_THRESHOLD_MS) apply(d);
    });
    // 마운트 시점과 effect 시점 사이의 진행분 동기화.
    poll();
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [ds, intervalMs]);

  return t;
}
