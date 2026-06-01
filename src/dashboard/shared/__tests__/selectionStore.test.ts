/// @vitest-environment jsdom
// US-5B — 선택 드라이버 전역 스토어.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  _resetSelection,
  clearSelection,
  getSelectedDriver,
  selectDriver,
  subscribeSelection,
  useSelectedDriver,
} from '../selectionStore';

afterEach(() => _resetSelection());

describe('selectionStore', () => {
  it('select → get', () => {
    selectDriver(44);
    expect(getSelectedDriver()).toBe(44);
  });

  it('같은 driver 재선택 시 toggle 해제 (§3.7)', () => {
    selectDriver(44);
    selectDriver(44);
    expect(getSelectedDriver()).toBeNull();
  });

  it('다른 driver 선택 시 교체', () => {
    selectDriver(44);
    selectDriver(1);
    expect(getSelectedDriver()).toBe(1);
  });

  it('clearSelection 명시적 해제', () => {
    selectDriver(44);
    clearSelection();
    expect(getSelectedDriver()).toBeNull();
  });

  it('subscribe 통지 + unsub 후 미통지', () => {
    let count = 0;
    const unsub = subscribeSelection(() => {
      count += 1;
    });
    selectDriver(44); // select
    selectDriver(44); // toggle clear
    expect(count).toBe(2);
    unsub();
    selectDriver(7);
    expect(count).toBe(2);
  });

  it('useSelectedDriver 훅이 변경 반영', () => {
    const { result } = renderHook(() => useSelectedDriver());
    expect(result.current).toBeNull();
    act(() => selectDriver(44));
    expect(result.current).toBe(44);
    act(() => clearSelection());
    expect(result.current).toBeNull();
  });
});
