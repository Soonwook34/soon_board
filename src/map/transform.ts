// 런타임 OpenF1 X/Y → SVG viewBox affine 적용 — live-map §2.1·§2.2.
//
// public/trackOutlines/{key}-{year}.json 의 openf1_transform 필드를 받아 단일 sample 변환.
// 빌드 타임 scripts/_lib/openf1Affine.ts 의 applyAffine2D 와 수치 일치 (cross-test).
//
// Hot path — LiveMapRenderer 가 매 프레임 20대 × 보간 윈도우 sample 마다 호출.
// 빈 객체 alloc/heap 추가 없이 readonly tuple 반환만.

export type MapPoint = readonly [number, number];

export interface OpenF1Transform {
  /** uniform scale (OpenF1 단위 → viewBox 단위). 양수. */
  scale: number;
  /** 회전 (도, [-180, 180]). 양의 값은 viewBox 좌표 기준 반시계 (수학 표준). */
  rotation_deg: number;
  /** viewBox 단위 평행 이동. */
  translate: readonly [number, number];
  /** Y-반사 적용 여부. 미지정 시 false (backward-compat). */
  reflection?: boolean;
}

/**
 * OpenF1 좌표 (x, y) 를 SVG viewBox 좌표로 변환한다.
 * 본 함수의 수식은 scripts/_lib/openf1Affine.ts 의 applyAffine2D 와 동일.
 */
export function applyOpenF1Transform(
  x: number,
  y: number,
  t: OpenF1Transform,
): MapPoint {
  const yIn = t.reflection ? -y : y;
  const rad = (t.rotation_deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    t.scale * (c * x - s * yIn) + t.translate[0],
    t.scale * (s * x + c * yIn) + t.translate[1],
  ];
}
