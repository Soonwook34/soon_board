// live-map plan §3.3 + §5.2 — 차량별 독립 DriverSample 버퍼.
// 각 차량 sample timestamp 가 미세하게 어긋나므로 전 차량 단일 시간축 정렬 금지.
//
// sentinel (|x|+|y| < 50) 은 push 시 silent skip — plan §4.2 가라지 처리, 인수 6번.
//   주의: plan §4.2 는 OpenF1 raw 좌표 기준 |x|+|y|+|z| < 50 명시. 본 버퍼 는 projection 후
//   SVG viewBox 좌표 기준 defense-in-depth 검사. 진짜 sentinel 필터는 Phase 12/13 의
//   LiveDataSource/ReplayDataSource 가 OpenF1 raw 좌표로 수행해야 한다.
// findPair 는 binary search O(log N) — plan §5.7 성능 예산 부합.

import type { DriverSample } from './interpolation.js';

/** plan §4.2 가라지 sentinel — |x|+|y|+|z| < 임계. SVG viewBox 변환 후 좌표 기준. */
export const SENTINEL_THRESHOLD = 50;

export type SamplePair =
  | { s1: DriverSample; s2: DriverSample }
  | { s1: DriverSample; s2: null }
  | null;

export class PerDriverBuffer {
  private samples = new Map<number, DriverSample[]>();

  /** 시간순 삽입 (대부분 append; 늦게 도착한 sample 만 정렬 검색). sentinel 은 silent skip. */
  push(driverNumber: number, sample: DriverSample): void {
    if (isSentinel(sample)) return;
    const arr = this.samples.get(driverNumber);
    if (!arr) {
      this.samples.set(driverNumber, [sample]);
      return;
    }
    const last = arr[arr.length - 1];
    if (sample.date >= last.date) {
      arr.push(sample);
      return;
    }
    // 늦게 도착한 sample — binary search 로 삽입 위치 찾기
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].date <= sample.date) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, sample);
  }

  /** t 를 둘러싼 두 sample. plan §5.3 의 freeze/interpolate 분기 입력. */
  findPair(driverNumber: number, t: number): SamplePair {
    const arr = this.samples.get(driverNumber);
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) {
      // 단일 sample — freeze 만 가능
      return { s1: arr[0], s2: null };
    }
    // t < 첫 sample 시간: 아직 데이터 시작 안 됨 → freeze 에 첫 sample
    if (t < arr[0].date) return { s1: arr[0], s2: null };
    // t ≥ 마지막 sample 시간: freeze 모드
    if (t >= arr[arr.length - 1].date) return { s1: arr[arr.length - 1], s2: null };
    // binary search: 가장 큰 i 중 arr[i].date ≤ t
    let lo = 0;
    let hi = arr.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].date <= t) lo = mid;
      else hi = mid;
    }
    return { s1: arr[lo], s2: arr[lo + 1] };
  }

  /** ring buffer trim — beforeT 이전 sample 폐기 (단, 차량별 마지막 1건은 freeze 용 보존). */
  trim(beforeT: number): void {
    for (const arr of this.samples.values()) {
      if (arr.length <= 1) continue;
      let dropEnd = 0;
      while (dropEnd < arr.length - 1 && arr[dropEnd].date < beforeT) dropEnd++;
      if (dropEnd > 0) arr.splice(0, dropEnd);
    }
  }

  /** 현재 sample 이 1건 이상 있는 driverNumber 목록. */
  drivers(): readonly number[] {
    return Array.from(this.samples.keys());
  }

  /** 진단/테스트용. */
  size(driverNumber: number): number {
    return this.samples.get(driverNumber)?.length ?? 0;
  }
}

function isSentinel(sample: DriverSample): boolean {
  const [x, y] = sample.rawXY;
  return Math.abs(x) + Math.abs(y) < SENTINEL_THRESHOLD;
}
