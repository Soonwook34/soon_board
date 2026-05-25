// 알려진 시즌 목록 단일 진실원 — main-page-implementation.md §3.2.
// 배치 fetch entrypoint (fetch-season-catalog.ts --all) + check-season-sizes.ts가 공유.
// 미래 시즌(아직 OpenF1에 노출 안 됨)도 포함 — buildSeasonCatalog가 빈 meetings 응답 시 skip.

export const KNOWN_SEASONS = [2023, 2024, 2025, 2026, 2027] as const;
export type KnownSeasonYear = (typeof KNOWN_SEASONS)[number];
