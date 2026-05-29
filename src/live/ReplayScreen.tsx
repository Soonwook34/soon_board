// /replay/:key 컨테이너 — plan main-page-implementation.md §12 단계 11 + critic P0-4.
// 흐름: CORS ping → 실패 시 CorsFailedNotice (대시보드 마운트 보류) →
//       성공 시 인덱스 + 모든 시즌 로드 → findSessionAcrossSeasons 로 년도 무관 검색 →
//       past 아니면 /live 리다이렉트 → past 면 LiveMap + ReplayDataSource (live-map plan §10 단계 13).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { CorsFailedNotice } from './CorsFailedNotice';
import { findSessionAcrossSeasons } from './findSessionByKey';
import { pingOpenF1 } from './corsPing';
import { LiveMap, type LiveMapDataSource } from './LiveMap';
import { classify } from '../main/derived/sessionStatus';
import { loadCatalogIndex, loadSeason } from '../main/stores/catalogStore';
import { useNowSecond } from '../main/useNowSecond';
import { useAllSeasons, useCatalogIndex } from '../main/stores/hooks';
import { ReplayDataSource } from '../map/ReplayDataSource';
import type { LiveDataSourceOptions } from '../map/LiveDataSource';

type PingState = 'pending' | 'ok' | 'failed';

interface ReplayScreenProps {
  pingImpl?: () => Promise<boolean>;
}

export function ReplayScreen({ pingImpl }: ReplayScreenProps = {}) {
  const params = useParams<{ key: string }>();
  const sessionKey = Number(params.key);
  const [, setLocation] = useLocation();
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
        if (myRun !== pingRunIdRef.current) return;
        setPingState('failed');
      });
  }, [pingImpl]);

  useEffect(() => {
    runPing();
  }, [runPing]);

  const index = useCatalogIndex();
  const allSeasons = useAllSeasons();

  // ping ok → 인덱스 로드.
  useEffect(() => {
    if (pingState !== 'ok') return;
    loadCatalogIndex().catch((err) => console.error('[ReplayScreen] index load failed', err));
  }, [pingState]);

  // 인덱스 적재 시 모든 시즌 병렬 로드 — :key 는 어느 년도 세션이든 가능하므로 multi-year 검색 필요.
  // loadSeason 은 in-flight dedup + cache 가 있어 중복 호출 비용 없음.
  useEffect(() => {
    if (pingState !== 'ok' || !index) return;
    for (const entry of index.seasons) {
      loadSeason(entry.year).catch((err) =>
        console.error(`[ReplayScreen] season ${entry.year} load failed`, err),
      );
    }
  }, [pingState, index]);

  const nowMs = useNowSecond();

  // findSession/classify 는 hook 이 아니지만 redirect useEffect 가 의존하므로 conditional return 전에 계산
  // (Rules of Hooks — feedback_hooks_before_early_return).
  const sessionKeyValid = Number.isFinite(sessionKey);
  const found = sessionKeyValid ? findSessionAcrossSeasons(allSeasons, sessionKey) : null;
  const status = found ? classify(found.session, new Date(nowMs)) : null;
  const shouldRedirectToLive = status !== null && status.kind !== 'past';

  useEffect(() => {
    if (pingState === 'ok' && shouldRedirectToLive) setLocation(`/live/${sessionKey}`);
  }, [pingState, shouldRedirectToLive, sessionKey, setLocation]);

  // ReplayDataSource factory — found.session.date_start 를 클로저로 캡처.
  // LiveMap 의 dataSourceFactory 는 LiveDataSourceOptions 만 받으므로 sessionDateStart 는 외부 클로저.
  const sessionDateStartIso = found?.session.date_start;
  const sessionDateEndIso = found?.session.date_end;
  const replayFactory = useMemo(() => {
    if (!sessionDateStartIso) return undefined;
    const dateStart = new Date(sessionDateStartIso);
    const dateEnd = sessionDateEndIso ? new Date(sessionDateEndIso) : undefined;
    return (opts: LiveDataSourceOptions): LiveMapDataSource =>
      new ReplayDataSource({
        sessionKey: opts.sessionKey,
        sessionDateStart: dateStart,
        sessionDateEnd: dateEnd,
        fetchImpl: opts.fetchImpl,
        onSample: opts.onSample,
      });
  }, [sessionDateStartIso, sessionDateEndIso]);

  if (pingState === 'pending') {
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-secondary)' }}>Connecting…</main>
    );
  }
  if (pingState === 'failed') {
    return <CorsFailedNotice onRetry={runPing} />;
  }

  if (!sessionKeyValid) {
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-primary)' }}>
        Invalid session key.
      </main>
    );
  }

  if (!found) {
    // 모든 인덱스 시즌이 캐시될 때까지는 "loading", 끝나도 못 찾으면 "not found".
    const allLoaded =
      index !== null && index.seasons.every((e) => allSeasons.some((s) => s.year === e.year));
    if (!allLoaded) {
      return (
        <main style={{ padding: '32px', color: 'var(--color-text-secondary)' }}>Loading session…</main>
      );
    }
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-primary)' }}>Session not found.</main>
    );
  }
  if (shouldRedirectToLive) return null;

  const circuitKey = found.meeting.circuit_key;
  if (circuitKey === undefined) {
    return (
      <main
        data-testid="replay-screen"
        style={{ padding: '32px', color: 'var(--color-text-primary)' }}
      >
        <div style={{ fontSize: '18px', fontWeight: 600 }}>
          {found.meeting.meeting_name} · {found.session.session_name}
        </div>
        <div style={{ marginTop: '12px', color: 'var(--color-text-secondary)' }}>
          이 세션은 circuit_key 가 없어 트랙을 표시할 수 없습니다.
        </div>
      </main>
    );
  }

  // live-map plan §10 단계 13 — ReplayDataSource + LiveMap 통합.
  // year 는 currentYear 가 아닌 found.year (세션이 속한 시즌) — 다년도 검색의 핵심.
  return (
    <div data-testid="replay-screen">
      <LiveMap
        sessionKey={sessionKey}
        circuitKey={circuitKey}
        year={found.year}
        dataSourceFactory={replayFactory}
        isReplay={true}
        onBack={() => setLocation('/')}
      />
    </div>
  );
}
