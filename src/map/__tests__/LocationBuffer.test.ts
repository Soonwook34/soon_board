// D1: 공유 LocationBuffer — LiveDataSource/ReplayDataSource 통합 후 회귀.

import { describe, expect, it } from 'vitest';
import { LocationBuffer, parseDate } from '../LocationBuffer.js';

function raw(driver: number, dateIso: string, x: number, y: number, z = 100) {
  return { driver_number: driver, date: dateIso, x, y, z };
}

describe('LocationBuffer — ingestRaw + sentinel', () => {
  it('정상 sample 적재 + driver/sample 반환', () => {
    const b = new LocationBuffer();
    const r = b.ingestRaw(raw(44, '2024-03-02T15:00:00Z', 100, 200));
    expect(r).not.toBeNull();
    expect(r!.driver).toBe(44);
    expect(r!.sample.x).toBe(100);
    expect(b.totalSampleCount()).toBe(1);
  });

  it('sentinel (|x|+|y|+|z| < 50) → 적재 안 함, null 반환', () => {
    const b = new LocationBuffer();
    expect(b.ingestRaw(raw(44, '2024-03-02T15:00:00Z', 10, 20, 5))).toBeNull(); // 35
    expect(b.totalSampleCount()).toBe(0);
  });

  it('invalid driver_number → null', () => {
    const b = new LocationBuffer();
    expect(b.ingestRaw({ ...raw(44, '2024-03-02T15:00:00Z', 100, 200), driver_number: 'X' })).toBeNull();
  });

  it('invalid date → null', () => {
    const b = new LocationBuffer();
    expect(b.ingestRaw({ ...raw(44, 'not-a-date', 100, 200) })).toBeNull();
  });
});

describe('LocationBuffer — getSamplePair', () => {
  it('단일 sample → s1 만, s2=null', () => {
    const b = new LocationBuffer();
    b.ingestRaw(raw(1, '2024-03-02T15:00:00Z', 100, 200));
    const pair = b.getSamplePair(1, new Date('2024-03-02T15:00:00Z'));
    expect(pair).not.toBeNull();
    expect(pair!.s1.x).toBe(100);
    expect(pair!.s2).toBeNull();
  });

  it('두 sample 사이 시각 → s1, s2 둘 다 반환', () => {
    const b = new LocationBuffer();
    b.ingestRaw(raw(1, '2024-03-02T15:00:00Z', 100, 200));
    b.ingestRaw(raw(1, '2024-03-02T15:00:10Z', 150, 250));
    const pair = b.getSamplePair(1, new Date('2024-03-02T15:00:05Z'));
    expect(pair!.s1.x).toBe(100);
    expect(pair!.s2!.x).toBe(150);
  });

  it('마지막 sample 이후 시각 → s1 = last, s2=null', () => {
    const b = new LocationBuffer();
    b.ingestRaw(raw(1, '2024-03-02T15:00:00Z', 100, 200));
    b.ingestRaw(raw(1, '2024-03-02T15:00:10Z', 150, 250));
    const pair = b.getSamplePair(1, new Date('2024-03-02T15:00:30Z'));
    expect(pair!.s1.x).toBe(150);
    expect(pair!.s2).toBeNull();
  });

  it('driver 미존재 → null', () => {
    const b = new LocationBuffer();
    expect(b.getSamplePair(99, new Date())).toBeNull();
  });
});

describe('LocationBuffer — insertOrdered (out-of-order)', () => {
  it('out-of-order 도 시간순으로 정렬 후 저장', () => {
    const b = new LocationBuffer();
    b.ingestRaw(raw(1, '2024-03-02T15:00:00Z', 100, 200));
    b.ingestRaw(raw(1, '2024-03-02T15:00:20Z', 200, 300));
    b.ingestRaw(raw(1, '2024-03-02T15:00:10Z', 150, 250)); // 중간 삽입
    expect(b.size(1)).toBe(3);
    const pair = b.getSamplePair(1, new Date('2024-03-02T15:00:15Z'));
    expect(pair!.s1.x).toBe(150);
    expect(pair!.s2!.x).toBe(200);
  });
});

describe('LocationBuffer — trimBefore', () => {
  it('cutoff 이전 sample 제거, 이후는 보존', () => {
    const b = new LocationBuffer();
    for (let i = 0; i < 10; i++) {
      b.ingestRaw(raw(1, new Date(Date.parse('2024-03-02T15:00:00Z') + i * 1000).toISOString(), 100, 200));
    }
    expect(b.size(1)).toBe(10);
    b.trimBefore(Date.parse('2024-03-02T15:00:05Z'));
    expect(b.size(1)).toBe(5); // 5,6,7,8,9 만 남음
  });

  it('모든 sample 이 cutoff 이전이면 빈 배열', () => {
    const b = new LocationBuffer();
    b.ingestRaw(raw(1, '2024-03-02T15:00:00Z', 100, 200));
    b.trimBefore(Date.parse('2024-03-02T16:00:00Z'));
    expect(b.size(1)).toBe(0);
  });

  it('모든 sample 이 cutoff 이후이면 변화 없음', () => {
    const b = new LocationBuffer();
    b.ingestRaw(raw(1, '2024-03-02T15:00:00Z', 100, 200));
    b.trimBefore(Date.parse('2024-03-02T14:00:00Z'));
    expect(b.size(1)).toBe(1);
  });
});

describe('parseDate util', () => {
  it('valid ISO → Date', () => {
    expect(parseDate('2024-03-02T15:00:00Z')).toBeInstanceOf(Date);
  });
  it('invalid → null', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(123)).toBeNull();
  });
});
