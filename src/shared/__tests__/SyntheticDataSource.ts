// Phase 6 합성 sample 검증용 fixture — DataSource 인터페이스 최소 구현.
// Phase 12 LiveDataSource / Phase 13 ReplayDataSource 는 동일 인터페이스 + 실제 데이터.
// 본 fixture 는 src/shared/__tests__/ 안에 두어 production 코드와 분리.

import type {
  AggregateName,
  AggregateResults,
  LapRecord,
  OpenF1EndpointName,
  OpenF1EndpointRecords,
  StintRecord,
} from '../openf1Types.js';
import type { DataSource, LocationSample, SamplePair, StreamState } from '../DataSource.js';

export class SyntheticDataSource implements DataSource {
  private displayTime: Date = new Date(0);
  private samples = new Map<number, LocationSample[]>();
  private listeners = new Set<(t: Date) => void>();

  setDisplayTime(t: Date): void {
    this.displayTime = t;
    for (const cb of this.listeners) cb(t);
  }

  pushSample(driverNumber: number, sample: LocationSample): void {
    const arr = this.samples.get(driverNumber) ?? [];
    arr.push(sample);
    this.samples.set(driverNumber, arr);
  }

  getDisplayTime(): Date {
    return this.displayTime;
  }

  getSamplePair(driverNumber: number, t: Date): SamplePair {
    const arr = this.samples.get(driverNumber);
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) return { s1: arr[0], s2: null };
    const tMs = t.valueOf();
    if (tMs < arr[0].date.valueOf()) return { s1: arr[0], s2: null };
    if (tMs >= arr[arr.length - 1].date.valueOf()) {
      return { s1: arr[arr.length - 1], s2: null };
    }
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i].date.valueOf() <= tMs && tMs < arr[i + 1].date.valueOf()) {
        return { s1: arr[i], s2: arr[i + 1] };
      }
    }
    return null;
  }

  getStreamState(): StreamState {
    return 'live';
  }

  onDisplayTimeChange(handler: (t: Date) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  // ── dashboard 메서드 stub (Phase 6 미사용) ─────────────────────────
  getLatestBefore<E extends OpenF1EndpointName>(
    _endpoint: E,
    _t: Date,
    _filters?: Partial<OpenF1EndpointRecords[E]>,
  ): OpenF1EndpointRecords[E] | null {
    throw new Error('SyntheticDataSource: getLatestBefore not implemented (Phase 12/13)');
  }

  getAllBefore<E extends OpenF1EndpointName>(
    _endpoint: E,
    _t: Date,
    _filters?: Partial<OpenF1EndpointRecords[E]>,
    _limit?: number,
  ): OpenF1EndpointRecords[E][] {
    throw new Error('SyntheticDataSource: getAllBefore not implemented (Phase 12/13)');
  }

  getLapAt(_driverNum: number, _t: Date): LapRecord | null {
    throw new Error('SyntheticDataSource: getLapAt not implemented (Phase 12/13)');
  }

  getCompletedLapsBefore(_driverNum: number, _t: Date, _limit?: number): LapRecord[] {
    throw new Error('SyntheticDataSource: getCompletedLapsBefore not implemented (Phase 12/13)');
  }

  getStintForLap(_driverNum: number, _lap: number): StintRecord | null {
    throw new Error('SyntheticDataSource: getStintForLap not implemented (Phase 12/13)');
  }

  getAggregateBefore<A extends AggregateName>(_aggregate: A, _t: Date): AggregateResults[A] {
    throw new Error('SyntheticDataSource: getAggregateBefore not implemented (Phase 12/13)');
  }
}
