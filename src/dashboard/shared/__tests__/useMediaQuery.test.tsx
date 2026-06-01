/// @vitest-environment jsdom
// US-12A — useMediaQuery: matchMedia 구독(초기값 + change 반영 + cleanup), SSR-safe.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';

afterEach(() => {
  // @ts-expect-error — 테스트 후 mock 제거 (jsdom 기본은 matchMedia 미구현).
  delete window.matchMedia;
  vi.restoreAllMocks();
});

/** 토글 가능한 matchMedia mock. set(v) 로 matches 변경 + change 리스너 통지. */
function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
  };
  window.matchMedia = ((q: string) => {
    mql.media = q;
    return mql;
  }) as unknown as typeof window.matchMedia;
  return {
    set(v: boolean) {
      matches = v;
      for (const l of listeners) l();
    },
    listenerCount: () => listeners.size,
  };
}

describe('useMediaQuery', () => {
  it('초기값 = matchMedia.matches', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1279.98px)'));
    expect(result.current).toBe(true);
  });

  it('change 이벤트 시 갱신', () => {
    const ctl = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1279.98px)'));
    expect(result.current).toBe(false);
    act(() => ctl.set(true));
    expect(result.current).toBe(true);
  });

  it('unmount 시 리스너 해제', () => {
    const ctl = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 1279.98px)'));
    expect(ctl.listenerCount()).toBe(1);
    unmount();
    expect(ctl.listenerCount()).toBe(0);
  });

  it('matchMedia 미지원(SSR/jsdom 기본) → false (graceful)', () => {
    // matchMedia 설치 안 함.
    const { result } = renderHook(() => useMediaQuery('(max-width: 1279.98px)'));
    expect(result.current).toBe(false);
  });
});
