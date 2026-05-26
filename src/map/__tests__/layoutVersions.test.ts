// src/map/layoutVersions.ts — plan §10 단계 4 위험표 '레이아웃 변경된 연도에 잘못된 SVG 로드' 회귀.
// 경계 연도 + open-ended + 갭(F1 부재 구간) + 미등록 케이스.

import { describe, expect, it } from 'vitest';
import { LAYOUT_VERSIONS, resolveLayout } from '../layoutVersions.js';

describe('LAYOUT_VERSIONS seed', () => {
  it('6개 entry (Yas Marina, Melbourne, Zandvoort, Spa, Las Vegas, Madring) 등록', () => {
    expect(LAYOUT_VERSIONS).toHaveLength(6);
    const keys = LAYOUT_VERSIONS.map((e) => e.circuit_key).sort((a, b) => a - b);
    expect(keys).toEqual([7, 10, 55, 70, 152, 153]);
  });
});

describe('resolveLayout — Yas Marina (70) 2021 Tilke remodel', () => {
  it('2020 → 70-2019.json (이전 레이아웃 마지막)', () => {
    expect(resolveLayout(70, 2020)).toBe('70-2019.json');
  });
  it('2021 → 70-2021.json (변경 첫 해)', () => {
    expect(resolveLayout(70, 2021)).toBe('70-2021.json');
  });
  it('2024 → 70-2021.json (open-ended 적용)', () => {
    expect(resolveLayout(70, 2024)).toBe('70-2021.json');
  });
});

describe('resolveLayout — Melbourne (10) 2022 redesign with gap', () => {
  it('2019 → 10-2019.json (단일 연도 range)', () => {
    expect(resolveLayout(10, 2019)).toBe('10-2019.json');
  });
  it('2020 → null (COVID 캔슬 등으로 인한 갭 구간)', () => {
    expect(resolveLayout(10, 2020)).toBeNull();
  });
  it('2021 → null (갭 구간, 변경 전)', () => {
    expect(resolveLayout(10, 2021)).toBeNull();
  });
  it('2022 → 10-2022.json (변경 첫 해)', () => {
    expect(resolveLayout(10, 2022)).toBe('10-2022.json');
  });
  it('2025 → 10-2022.json (open-ended 적용)', () => {
    expect(resolveLayout(10, 2025)).toBe('10-2022.json');
  });
});

describe('resolveLayout — Zandvoort (55) 2021 F1 복귀', () => {
  it('2020 → null (F1 부재 구간)', () => {
    expect(resolveLayout(55, 2020)).toBeNull();
  });
  it('2021 → 55-2021.json', () => {
    expect(resolveLayout(55, 2021)).toBe('55-2021.json');
  });
  it('2024 → 55-2021.json (open-ended)', () => {
    expect(resolveLayout(55, 2024)).toBe('55-2021.json');
  });
});

describe('resolveLayout — Spa (7) 2022 runoff 변경', () => {
  it('2021 → 7-2019.json (runoff 이전 마지막)', () => {
    expect(resolveLayout(7, 2021)).toBe('7-2019.json');
  });
  it('2022 → 7-2022.json (runoff 이후 첫 해)', () => {
    expect(resolveLayout(7, 2022)).toBe('7-2022.json');
  });
  it('2025 → 7-2022.json (open-ended)', () => {
    expect(resolveLayout(7, 2025)).toBe('7-2022.json');
  });
});

describe('resolveLayout — Las Vegas (152) 2023 신규', () => {
  it('2022 → null (신규 이전)', () => {
    expect(resolveLayout(152, 2022)).toBeNull();
  });
  it('2023 → 152-2023.json', () => {
    expect(resolveLayout(152, 2023)).toBe('152-2023.json');
  });
});

describe('resolveLayout — Madring (153) 2026 신규', () => {
  it('2025 → null (신규 이전)', () => {
    expect(resolveLayout(153, 2025)).toBeNull();
  });
  it('2026 → 153-2026.json', () => {
    expect(resolveLayout(153, 2026)).toBe('153-2026.json');
  });
});

describe('resolveLayout — 미등록 circuit_key fallback', () => {
  it('Sakhir (63) 같은 미등록 venue 는 항상 null (caller 가 {key}-{year}.json fallback 책임)', () => {
    expect(resolveLayout(63, 2024)).toBeNull();
    expect(resolveLayout(63, 2019)).toBeNull();
    expect(resolveLayout(999, 2024)).toBeNull();
  });
});
