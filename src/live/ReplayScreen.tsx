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
import type { LocationSample } from '../shared/DataSource';
import { DashboardApp, DataSourceProvider, DriversProvider, useSessionDrivers } from '../dashboard';

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

  // §5 — 화면이 단일 ReplayDataSource 를 소유: 맵 + 대시보드 패널이 같은 인스턴스 공유 (LiveScreen 과 형제 일관성).
  // found.session.date_start/end 를 캡처. 투영 onSample 은 LiveMap 이 에셋 로드 후 onSampleRef 로 등록(여기선 위임만).
  const sessionDateStartIso = found?.session.date_start;
  const sessionDateEndIso = found?.session.date_end;
  const onSampleRef = useRef<((driverNumber: number, sample: LocationSample) => void) | null>(null);
  const ds = useMemo<LiveMapDataSource | null>(() => {
    if (!sessionDateStartIso) return null;
    return new ReplayDataSource({
      sessionKey,
      sessionDateStart: new Date(sessionDateStartIso),
      sessionDateEnd: sessionDateEndIso ? new Date(sessionDateEndIso) : undefined,
      onSample: (driverNumber, sample) => onSampleRef.current?.(driverNumber, sample),
    });
  }, [sessionKey, sessionDateStartIso, sessionDateEndIso]);
  // §2.5 — 드라이버 메타 1회 fetch (LiveScreen 과 형제 일관). CORS ok 일 때만.
  const drivers = useSessionDrivers(sessionKey, { enabled: pingState === 'ok' });

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

  // live-map plan §10 단계 13 + dashboard §5/§1.1 — DashboardApp 이 레이아웃을 소유하고 맵을 슬롯에 임베드.
  // 같은 ds 를 provider 로 패널에 주입. year 는 currentYear 가 아닌 found.year (세션 시즌) — 다년도 검색의 핵심.
  // replay-screen testid wrapper 유지(기존 테스트 + 형제 구조).
  return (
    <div data-testid="replay-screen">
      {ds ? (
        <DataSourceProvider ds={ds}>
          <DriversProvider drivers={drivers}>
            <DashboardApp
              meeting={found.meeting}
              session={found.session}
              year={found.year}
              mode="replay"
              map={
                <LiveMap
                  sessionKey={sessionKey}
                  circuitKey={circuitKey}
                  year={found.year}
                  dataSource={ds}
                  onSampleRef={onSampleRef}
                  isReplay={true}
                  onBack={() => setLocation('/')}
                />
              }
            />
          </DriversProvider>
        </DataSourceProvider>
      ) : null}
    </div>
  );
}
