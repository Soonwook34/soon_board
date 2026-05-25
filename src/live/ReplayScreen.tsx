// /replay/:key 컨테이너 — plan main-page-implementation.md §12 단계 11 + critic P0-4.
// 흐름: CORS ping → 실패 시 CorsFailedNotice (대시보드 마운트 보류) →
//       성공 시 카탈로그 로드 + findSessionByKey → past 아니면 /live 리다이렉트 →
//       past면 DashboardPlaceholder (실제 대시보드는 dashboard-implementation.md 책임).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { CorsFailedNotice } from './CorsFailedNotice';
import { findSessionByKey } from './findSessionByKey';
import { pingOpenF1 } from './corsPing';
import { TrackMapPreview } from './TrackMapPreview';
import { classify } from '../main/derived/sessionStatus';
import { loadCatalogIndex, loadSeason } from '../main/stores/catalogStore';
import { useNowSecond } from '../main/useNowSecond';
import { useCatalogIndex, useSeasonCatalog } from '../main/stores/hooks';

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

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const index = useCatalogIndex();
  const seasonData = useSeasonCatalog(currentYear);
  useEffect(() => {
    if (pingState !== 'ok') return;
    loadCatalogIndex().catch((err) => console.error('[ReplayScreen] index load failed', err));
    loadSeason(currentYear).catch((err) => console.error('[ReplayScreen] season load failed', err));
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

  if (!Number.isFinite(sessionKey)) {
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-primary)' }}>
        Invalid session key.
      </main>
    );
  }
  const found = findSessionByKey(seasonData, sessionKey);
  const status = found ? classify(found.session, new Date(nowMs)) : null;
  const shouldRedirectToLive = status !== null && status.kind !== 'past';

  // 리다이렉트는 useEffect로 — render 중 setLocation 호출 시 StrictMode dev에서 history.pushState
  // 중복 가능성 (architect P1).
  useEffect(() => {
    if (shouldRedirectToLive) setLocation(`/live/${sessionKey}`);
  }, [shouldRedirectToLive, sessionKey, setLocation]);

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
  if (shouldRedirectToLive) return null;

  // live-map §10 단계 3 — Phase 1 산출물 시각 검증. 마커는 Phase 6+ 에서 LiveMapRenderer 가 통합.
  const circuitKey = found.meeting.circuit_key;

  return (
    <main
      data-testid="replay-screen"
      style={{ padding: '32px', color: 'var(--color-text-primary)' }}
    >
      <div style={{ fontSize: '18px', fontWeight: 600 }}>
        {found.meeting.meeting_name} · {found.session.session_name}
      </div>
      <div style={{ marginTop: '12px', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
        Static track preview (Phase 3) — 마커·대시보드는 후속 phase.
      </div>
      {circuitKey !== undefined ? (
        <TrackMapPreview circuitKey={circuitKey} year={currentYear} />
      ) : (
        <div style={{ marginTop: '12px', color: 'var(--color-text-secondary)' }}>
          이 세션은 circuit_key 가 없어 트랙 미리보기를 표시할 수 없습니다.
        </div>
      )}
    </main>
  );
}
