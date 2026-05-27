// live-map plan §1.3.5 + §10 단계 11 — SLM (X-mode 2026+) zone 정적 로더.
// raw JSON (data/slm-zones-raw.json) 의 (circuit_key, year) entry 에서 s_start_hint/s_end_hint 수치를
// SlmZone 으로 변환. 음수·polyline 길이 초과는 절단.

import type { SlmZone } from './trackOutlinesSchema.js';

export interface SlmZoneRawEntry {
  description?: string;
  s_start_hint: number;
  s_end_hint: number;
  label?: string;
}

export interface SlmCircuitRaw {
  circuit_key: number;
  year: number;
  zones: readonly SlmZoneRawEntry[];
}

export interface SlmRawFile {
  $comment?: string;
  license?: string;
  circuits: readonly SlmCircuitRaw[];
}

export interface LoadSlmZonesOptions {
  raw: SlmRawFile;
  circuit_key: number;
  year: number;
  totalLength: number;
}

export function loadSlmZonesFromRaw(opts: LoadSlmZonesOptions): SlmZone[] | null {
  const entry = opts.raw.circuits.find(
    (c) => c.circuit_key === opts.circuit_key && c.year === opts.year,
  );
  if (!entry) return null;
  const out: SlmZone[] = [];
  for (let i = 0; i < entry.zones.length; i++) {
    const z = entry.zones[i];
    const start = clampToTrack(z.s_start_hint, opts.totalLength);
    const end = clampToTrack(z.s_end_hint, opts.totalLength);
    out.push({
      id: i + 1,
      s_start: start,
      s_end: end,
      ...(z.label ? { label: z.label } : {}),
    });
  }
  return out;
}

function clampToTrack(s: number, total: number): number {
  if (!Number.isFinite(s) || s < 0) return 0;
  if (s > total) return total;
  return s;
}
