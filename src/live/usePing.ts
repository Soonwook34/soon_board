// CORS ping 상태머신 — LiveScreen·ReplayScreen 공용 (형제 일관성: feedback_sibling_consistency).
// pingImpl prop 은 테스트 주입용 (기본 pingOpenF1). msw 없이 단순한 dependency injection.
// runId 가드: 재시도(runPing) 중 이전 in-flight ping 의 늦은 resolve 가 최신 상태를 덮어쓰지 않게 한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { pingOpenF1 } from './corsPing';

export type PingState = 'pending' | 'ok' | 'failed';

export function usePing(pingImpl?: () => Promise<boolean>): {
  pingState: PingState;
  runPing: () => void;
} {
  const [pingState, setPingState] = useState<PingState>('pending');
  const pingRunIdRef = useRef(0);

  const runPing = useCallback(() => {
    const myRun = ++pingRunIdRef.current;
    setPingState('pending');
    const exec = pingImpl ?? (() => pingOpenF1());
    exec()
      .then((ok) => {
        if (myRun !== pingRunIdRef.current) return;
        setPingState(ok ? 'ok' : 'failed');
      })
      .catch(() => {
        // pingImpl 이 throw 하더라도 'pending' 영구 멈춤 방지 (pingOpenF1 자체는 throw 안 함).
        if (myRun !== pingRunIdRef.current) return;
        setPingState('failed');
      });
  }, [pingImpl]);

  useEffect(() => {
    runPing();
  }, [runPing]);

  return { pingState, runPing };
}
