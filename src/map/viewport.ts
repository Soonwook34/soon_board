// SVG viewBox → canvas pixels (aspect-fit) — live-map §2.1 ② viewport transform + §2.3.
//
// Phase 3 의 정적 트랙 렌더는 매 프레임 viewport 를 갱신하지 않고 (zoom/pan 미지원),
// canvas resize 시에만 1회 재계산하면 충분. 본 모듈은 pure math.
//
// Aspect-fit 정책: viewBox 의 가로세로 비율을 보존하면서 canvas 안에 letterbox.
// 가로/세로 한쪽이 캔버스보다 좁아지면 그 축에 빈 여백 (중앙 정렬).
//
// 좌표계: viewBox 와 canvas 모두 Y-down (SVG 표준). OpenF1 의 Y-up 은 §2.1 ① openf1_transform
// 가 흡수하므로 본 모듈은 신경 쓰지 않음.

export type ViewBox = readonly [number, number, number, number];
export type Point2D = readonly [number, number];

export interface ViewportTransform {
  /** 균등 스케일 (viewBox 단위 → canvas 픽셀). */
  scale: number;
  /** SVG (vx, vy) 가 canvas (offsetX, offsetY) 에 위치 (letterbox 보정 포함). */
  offsetX: number;
  offsetY: number;
}

export interface ComputeViewportInput {
  viewBox: ViewBox;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * viewBox 를 canvas 에 aspect-fit 으로 letterbox. 캔버스 가운데 정렬.
 *
 * @throws 음수/0 dimension 또는 비정상 viewBox.
 */
export function computeViewport(input: ComputeViewportInput): ViewportTransform {
  const [vx, vy, vw, vh] = input.viewBox;
  if (!(vw > 0) || !(vh > 0)) {
    throw new Error(`computeViewport: viewBox width/height must be > 0 (got ${vw}x${vh})`);
  }
  if (!(input.canvasWidth > 0) || !(input.canvasHeight > 0)) {
    throw new Error(
      `computeViewport: canvas dimensions must be > 0 (got ${input.canvasWidth}x${input.canvasHeight})`,
    );
  }
  const sx = input.canvasWidth / vw;
  const sy = input.canvasHeight / vh;
  const scale = Math.min(sx, sy);

  // letterbox 여백 (가로 또는 세로 둘 중 하나만 양수, 나머지는 0)
  const usedW = vw * scale;
  const usedH = vh * scale;
  const padX = (input.canvasWidth - usedW) / 2;
  const padY = (input.canvasHeight - usedH) / 2;

  // (vx, vy) → (padX, padY) 매핑이 되도록 offset 산출
  const offsetX = padX - vx * scale;
  const offsetY = padY - vy * scale;

  return { scale, offsetX, offsetY };
}

/**
 * SVG viewBox 좌표를 canvas 픽셀 좌표로 변환.
 */
export function applyViewport(p: Point2D, t: ViewportTransform): Point2D {
  return [p[0] * t.scale + t.offsetX, p[1] * t.scale + t.offsetY];
}
