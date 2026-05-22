// 시즌 dropdown — plan main-page-implementation.md §1.1.
// index.seasons 기반 동적 옵션 (plan §2.1 — OpenF1 데이터가 있는 시즌만 노출).

import type { SeasonsIndex } from '../shared/seasonData';

export interface SeasonPickerProps {
  index: SeasonsIndex | null;
  currentSeason: number | null;
  onChange: (year: number) => void;
}

export function SeasonPicker({ index, currentSeason, onChange }: SeasonPickerProps) {
  const seasons = index ? [...index.seasons].sort((a, b) => b.year - a.year) : [];
  const disabled = seasons.length === 0;

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        color: 'var(--color-text-secondary)',
      }}
    >
      Season
      <select
        value={currentSeason ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          padding: '6px 12px',
          borderRadius: '6px',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {currentSeason !== null && !seasons.some((s) => s.year === currentSeason) && (
          <option value={currentSeason}>{currentSeason} (loading)</option>
        )}
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {s.year} 시즌
          </option>
        ))}
      </select>
    </label>
  );
}
