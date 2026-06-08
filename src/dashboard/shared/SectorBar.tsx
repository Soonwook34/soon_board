// dashboard §2.5 — 2px·3등분 섹터 색 바. 리더보드 LAST 아래 + 디테일 §3.2/§3.3 공용.
// S1|S2|S3 각각 정확히 1/3 폭(시간 비율 미반영), 색은 sectorColors SSOT 사용.

import type { CSSProperties } from 'react';
import type { AggregateResults } from '../../shared/openf1Types';
import { sectorColor, SECTOR_INDICES } from './sectorColors';

export interface SectorBarProps {
  /** [s1, s2, s3] 섹터 시간(초). null 은 미주행/데이터 없음 → 회색. */
  sectors: readonly [number | null, number | null, number | null];
  aggregate: AggregateResults;
  driverNumber: number;
  /** 바 높이(px). 기본 2 (방송 표준). */
  height?: number;
}

export function SectorBar({ sectors, aggregate, driverNumber, height = 2 }: SectorBarProps) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    width: '100%',
    height,
    gap: '1px',
  };
  return (
    <div role="img" aria-label="섹터 시간 색상" style={containerStyle}>
      {SECTOR_INDICES.map((s) => (
        <span
          key={s}
          data-sector={s}
          style={{ flex: 1, background: sectorColor(aggregate, driverNumber, s, sectors[s - 1]) }}
        />
      ))}
    </div>
  );
}
