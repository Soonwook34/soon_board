// 공유 location 버퍼 — LiveDataSource 와 ReplayDataSource 가 동일 로직을 두 번 갖던 부분 통합.
// 책임: 시간순 driver-keyed sample 저장, sentinel filter, binary-search 기반 getSamplePair, trim.
//
// raw OpenF1 좌표 sentinel 임계 = 50 (plan §4.2). PerDriverBuffer (projected 좌표) 와 분리 —
// 본 버퍼는 transform 전 raw 좌표용. PerDriverBuffer 는 projected (s/n) 좌표용.

import type { LocationSample, SamplePair } from '../shared/DataSource.js';

const SENTINEL_THRESHOLD = 50;

export interface InternalLocationSample extends LocationSample {
  /** date.valueOf() 캐시 — binary search 비용 절감. */
  dateMs: number;
}

export class LocationBuffer {
  private readonly byDriver = new Map<number, InternalLocationSample[]>();

  /** raw OpenF1 record (driver_number/x/y/z/date) 를 sentinel 필터 후 적재.
   *  반환: 적재된 sample (caller 가 cursor/listener 등에 사용). 필터링 또는 invalid 시 null. */
  ingestRaw(raw: Record<string, unknown>): { driver: number; sample: LocationSample } | null {
    const date = parseDate(raw.date);
    if (!date) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    const driver = Number(raw.driver_number);
    if (!Number.isFinite(driver)) return null;
    if (Math.abs(x) + Math.abs(y) + Math.abs(z) < SENTINEL_THRESHOLD) return null;
    this.insertOrdered(driver, { date, dateMs: date.valueOf(), x, y, z });
    return { driver, sample: { date, x, y, z } };
  }

  /** time-ordered insert (대부분 append, 가끔 out-of-order 면 binary search insert). */
  insertOrdered(driver: number, sample: InternalLocationSample): void {
    const arr = this.byDriver.get(driver);
    if (!arr) {
      this.byDriver.set(driver, [sample]);
      return;
    }
    const last = arr[arr.length - 1];
    if (sample.dateMs >= last.dateMs) {
      arr.push(sample);
      return;
    }
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].dateMs <= sample.dateMs) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, sample);
  }

  /** t 시각에 대한 interpolation 쌍 (s1, s2) 반환. plan §4.1 + DataSource SSOT. */
  getSamplePair(driver: number, t: Date): SamplePair {
    const arr = this.byDriver.get(driver);
    if (!arr || arr.length === 0) return null;
    const tMs = t.valueOf();
    if (arr.length === 1) return { s1: toExternal(arr[0]), s2: null };
    if (tMs < arr[0].dateMs) return { s1: toExternal(arr[0]), s2: null };
    if (tMs >= arr[arr.length - 1].dateMs) {
      return { s1: toExternal(arr[arr.length - 1]), s2: null };
    }
    let lo = 0;
    let hi = arr.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].dateMs <= tMs) lo = mid;
      else hi = mid;
    }
    return { s1: toExternal(arr[lo]), s2: toExternal(arr[lo + 1]) };
  }

  /** cutoffMs 이전 sample 제거 (ring buffer trim). 모든 driver array 순회. */
  trimBefore(cutoffMs: number): void {
    for (const [driver, arr] of this.byDriver) {
      // 모두 cutoff 이전이면 전체 비움.
      if (arr.length === 0 || arr[arr.length - 1].dateMs < cutoffMs) {
        this.byDriver.set(driver, []);
        continue;
      }
      if (arr[0].dateMs >= cutoffMs) continue; // trim 불필요
      // binary search 로 cutoff 지점 찾기
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid].dateMs < cutoffMs) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) arr.splice(0, lo);
    }
  }

  /** 적재된 driver 수. */
  driverCount(): number {
    return this.byDriver.size;
  }

  /** 모든 driver 의 sample 총합 — memory invariant 검증용. */
  totalSampleCount(): number {
    let n = 0;
    for (const arr of this.byDriver.values()) n += arr.length;
    return n;
  }

  /** 특정 driver 의 sample 수. */
  size(driver: number): number {
    return this.byDriver.get(driver)?.length ?? 0;
  }
}

export function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  if (Number.isNaN(d.valueOf())) return null;
  return d;
}

function toExternal(s: InternalLocationSample): LocationSample {
  return { date: s.date, x: s.x, y: s.y, z: s.z };
}
