/// @vitest-environment jsdom
// src/map/markerLabelToggle.ts — plan §4.1.1 회귀.

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MARKER_LABEL_STORAGE_KEY,
  MarkerLabelProvider,
  useMarkerLabel,
} from '../markerLabelToggle.js';

let captured: ReturnType<typeof useMarkerLabel> | null = null;
function Probe() {
  captured = useMarkerLabel();
  return null;
}

beforeEach(() => {
  captured = null;
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useMarkerLabel — 기본 ON', () => {
  it('Provider 없이 호출 시 default true (안전한 fallback)', () => {
    render(<Probe />);
    expect(captured?.showLabel).toBe(true);
  });
  it('Provider 안에서 localStorage 비어 있으면 true', () => {
    render(
      <MarkerLabelProvider>
        <Probe />
      </MarkerLabelProvider>,
    );
    expect(captured?.showLabel).toBe(true);
  });
});

describe('useMarkerLabel — localStorage 복원', () => {
  it("'false' 저장돼 있으면 false 로 복원", () => {
    window.localStorage.setItem(MARKER_LABEL_STORAGE_KEY, 'false');
    render(
      <MarkerLabelProvider>
        <Probe />
      </MarkerLabelProvider>,
    );
    expect(captured?.showLabel).toBe(false);
  });
  it("'true' 저장돼 있으면 true 복원", () => {
    window.localStorage.setItem(MARKER_LABEL_STORAGE_KEY, 'true');
    render(
      <MarkerLabelProvider>
        <Probe />
      </MarkerLabelProvider>,
    );
    expect(captured?.showLabel).toBe(true);
  });
});

describe('setShowLabel — state 변경 + localStorage 저장', () => {
  it('setShowLabel(false) 시 state false + localStorage "false" 저장', () => {
    render(
      <MarkerLabelProvider>
        <Probe />
      </MarkerLabelProvider>,
    );
    act(() => {
      captured?.setShowLabel(false);
    });
    expect(captured?.showLabel).toBe(false);
    expect(window.localStorage.getItem(MARKER_LABEL_STORAGE_KEY)).toBe('false');
  });
  it('setShowLabel(true) 시 state true + localStorage "true" 저장', () => {
    window.localStorage.setItem(MARKER_LABEL_STORAGE_KEY, 'false');
    render(
      <MarkerLabelProvider>
        <Probe />
      </MarkerLabelProvider>,
    );
    act(() => {
      captured?.setShowLabel(true);
    });
    expect(captured?.showLabel).toBe(true);
    expect(window.localStorage.getItem(MARKER_LABEL_STORAGE_KEY)).toBe('true');
  });
});

describe('localStorage 손상 graceful', () => {
  it('잘못된 값 (예: "bogus") 은 default true 로 fallback (plan §4.1.1 기본 ON)', () => {
    window.localStorage.setItem(MARKER_LABEL_STORAGE_KEY, 'bogus');
    render(
      <MarkerLabelProvider>
        <Probe />
      </MarkerLabelProvider>,
    );
    // 명시적 'false' 만 OFF. 'bogus' 처럼 손상된 값은 default true 로 graceful.
    expect(captured?.showLabel).toBe(true);
  });
});
