// Phase 1 산출물 (public/trackOutlines/{key}-{year}.json) 의 정적 트랙을 canvas 로 보여주는 컴포넌트.
// live-map §10 단계 3 — "단계 1 결과 그려보기 (단계 5까지는 마커 없이)".
//
// ReplayScreen 의 dashboard-placeholder 자리를 본 컴포넌트가 대체.
// 마커·라이브 데이터는 후속 phase (6+) 에서 LiveMapRenderer 가 통합.

import { useEffect, useRef, useState } from 'react';
import { color, font, space } from '../style/tokens.js';
import { mapStyles } from '../map/mapStyles.js';
import type { TrackOutlineJson } from '../../scripts/_lib/trackOutlinesSchema.js';
import { renderStaticTrack } from '../map/trackRenderer.js';
import { computeViewport, type Point2D } from '../map/viewport.js';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; track: TrackOutlineJson }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export interface TrackMapPreviewProps {
  circuitKey: number;
  year: number;
  /** 정사각 캔버스의 한 변 픽셀 (기본 720). */
  size?: number;
  /** 테스트용 fetch 주입. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_SIZE = 720;

export function TrackMapPreview({ circuitKey, year, size, fetchImpl }: TrackMapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const canvasSize = size ?? DEFAULT_SIZE;

  // fetch track outline
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    const f = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!f) {
      setState({ kind: 'error', message: 'fetch not available' });
      return;
    }
    const url = `/trackOutlines/${circuitKey}-${year}.json`;
    f(url)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'missing' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as TrackOutlineJson;
        if (!cancelled) setState({ kind: 'ready', track: body });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'error', message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [circuitKey, year, fetchImpl]);

  // render after ready
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const viewport = computeViewport({
      viewBox: state.track.viewBox,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    renderStaticTrack({
      ctx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      polyline: state.track.polyline as readonly Point2D[],
      viewport,
    });
  }, [state]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: mapStyles.bgPrimary,
    minHeight: canvasSize,
    color: mapStyles.loadingTextColor,
    fontFamily: font.family,
    fontSize: font.size.sm,
    padding: space['4'],
    borderRadius: '8px',
    border: `1px solid ${color.border}`,
  };

  if (state.kind === 'loading') {
    return (
      <div style={containerStyle} data-testid="trackmap-loading">
        트랙 로딩 중…
      </div>
    );
  }
  if (state.kind === 'missing') {
    return (
      <div style={containerStyle} data-testid="trackmap-missing">
        이 세션의 트랙 데이터가 아직 준비되지 않았습니다.
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div style={containerStyle} data-testid="trackmap-error">
        트랙 로딩 실패: {state.message}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: space['3'] }}>
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        data-testid="trackmap-canvas"
        style={{
          width: canvasSize,
          height: canvasSize,
          background: mapStyles.bgPrimary,
          borderRadius: '8px',
        }}
      />
    </div>
  );
}
