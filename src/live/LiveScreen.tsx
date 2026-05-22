// /live/:key 컨테이너 — plan main-page-implementation.md §12 단계 11 + critic P0-4.
// 진입 흐름:
//   1. CORS ping (pingOpenF1) — 실패 시 CorsFailedNotice (라이브맵 마운트 보류)
//   2. 성공 시 catalogStore loadCatalogIndex + 현재 연도 loadSeason
//   3. findSessionByKey로 :key → SessionData 검색
//   4. session.status === 'past'면 /replay/:key로 리다이렉트
//   5. 그 외 (upcoming/live) → CountdownOverlay (Phase 9 wire)
//      LiveDataSource 통합은 live-map-implementation.md 책임 — 본 phase는 overlay만.
//
// pingImpl prop: 테스트 주입용 (기본 pingOpenF1). msw 없이 단순한 dependency injection.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { CorsFailedNotice } from './CorsFailedNotice';
import { CountdownOverlay } from './CountdownOverlay';
import { findSessionByKey } from './findSessionByKey';
import { pingOpenF1 } from './corsPing';
import { classify } from '../main/derived/sessionStatus';
import { loadCatalogIndex, loadSeason } from '../main/stores/catalogStore';
import { useNowSecond } from '../main/useNowSecond';
import { useCatalogIndex, useSeasonCatalog } from '../main/stores/hooks';

type PingState = 'pending' | 'ok' | 'failed';

interface LiveScreenProps {
  pingImpl?: () => Promise<boolean>;
}

export function LiveScreen({ pingImpl }: LiveScreenProps = {}) {
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
        // pingImpl이 throw하더라도 'pending' 영구 멈춤 방지 (pingOpenF1 자체는 throw 안 함).
        if (myRun !== pingRunIdRef.current) return;
        setPingState('failed');
      });
  }, [pingImpl]);

  useEffect(() => {
    runPing();
  }, [runPing]);

  // ping 성공한 후에만 카탈로그 로드 — 실패 시 OpenF1 무관 정적 자산이지만 라이브 의도 명확화 위해 gate.
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const index = useCatalogIndex();
  const seasonData = useSeasonCatalog(currentYear);
  useEffect(() => {
    if (pingState !== 'ok') return;
    loadCatalogIndex().catch((err) => console.error('[LiveScreen] index load failed', err));
    loadSeason(currentYear).catch((err) => console.error('[LiveScreen] season load failed', err));
  }, [pingState, currentYear]);

  const nowMs = useNowSecond();

  if (pingState === 'pending') {
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-secondary)' }}>Connecting…</main>
    );
  }
  if (pingState === 'failed') {
    return <CorsFailedNotice onRetry={runPing} />;
  }

  // pingState === 'ok'
  if (!Number.isFinite(sessionKey)) {
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-primary)' }}>
        Invalid session key.
      </main>
    );
  }
  const found = findSessionByKey(seasonData, sessionKey);
  const status = found ? classify(found.session, new Date(nowMs)) : null;
  const shouldRedirectToReplay = status?.kind === 'past';

  // 리다이렉트는 useEffect로 — render 중 setLocation 호출 시 StrictMode dev에서 history.pushState
  // 중복 가능성 (architect P1). 의존성에 sessionKey + status.kind를 두어 상태 전환 시점에만 트리거.
  useEffect(() => {
    if (shouldRedirectToReplay) setLocation(`/replay/${sessionKey}`);
  }, [shouldRedirectToReplay, sessionKey, setLocation]);

  if (!found) {
    const ready = index !== null && seasonData !== null;
    if (!ready) {
      return (
        <main style={{ padding: '32px', color: 'var(--color-text-secondary)' }}>Loading session…</main>
      );
    }
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-primary)' }}>Session not found.</main>
    );
  }
  if (shouldRedirectToReplay) return null;

  return (
    <CountdownOverlay
      meetingName={found.meeting.meeting_name}
      session={found.session}
      onBack={() => setLocation('/')}
    />
  );
}
