# 디자인 브리프 — 서킷 맵

> 트랙 외곽선 위에 드라이버 위치 마커를 실시간으로 렌더하는 Canvas 2D 패널 · 라우트: `/live` 및 `/replay` 내부 패널 (독립 라우트 없음) · 데이터: DataSource

## 1. 목적 / 컨텍스트

서킷 맵 패널은 현재 `display_time` 시각의 전체 그리드 위치를 한눈에 보여주는 핵심 시각 요소다.
트랙 외곽선(track outline)은 빌드 타임에 생성된 정적 polyline JSON을 Canvas 2D로 stroke하며,
드라이버 마커는 `DataSource.getSamplePair()`가 반환하는 sample을 바탕으로 매 프레임 위치가 갱신된다.
패널 자체는 라이브/리플레이 모드를 모르며 오직 `DataSource` 인터페이스에만 의존한다.

**좌표계 체인**
```
OpenF1 X/Y (1/10 m)
  ①  openf1_transform (rotate + scale + translate) — layout JSON에 저장
SVG viewBox (500×500)
  ②  viewport transform (canvas fit)
Canvas pixels
```

---

## 2. 화면 구성 (패널 인벤토리 + 레이아웃)

```
┌──────────────────────────────────────────────────────┐
│  [attribution badge]              [overlay toggles]  │
│  "Track maps © julesr0y CC BY 4.0"   ☑핏레인 □섹터  │
│                                       □DRS  □SLM     │
│  ┌────────────────────────────────────────────────┐  │
│  │                                                │  │
│  │           (dark background #0A0A0F)            │  │
│  │                                                │  │
│  │    ╭──────────────────╮                        │  │
│  │   ╱  track outline    ╲   ● HAM (마커)         │  │
│  │  │   (stroke #2A2A35)  │  ● VER                │  │
│  │   ╲                   ╱   …                    │  │
│  │    ╰──────────────────╯                        │  │
│  │   - - - - (핏레인 파선 #1F1F28)                │  │
│  │                                                │  │
│  │                          [loading placeholder] │  │
│  └────────────────────────────────────────────────┘  │
│  [label toggle]  ☑ 드라이버 약어 표시                │
└──────────────────────────────────────────────────────┘
```

**영역별 설명**

| 영역 | 설명 |
|---|---|
| Canvas 본체 | track outline + 핏레인 파선은 offscreen canvas에 1회 stroke 후 매 프레임 blit. 마커·트레일은 그 위에 dynamic 렌더. |
| overlay toggles | 핏레인(기본 ON) · 섹터/DRS/SLM(MVP에서는 disabled "Coming soon"). |
| attribution badge | CC-BY-4.0 의무 표기. 맵 코너 또는 패널 하단 좌측, 작은 폰트. |
| loading placeholder | track outline fetch 완료 전(~50~100ms) 다크 배경 + 중앙 "트랙 로딩 중…" 텍스트. |
| label toggle | `name_acronym` 라벨 전체 ON/OFF. localStorage 복원. |

---

## 3. 데이터 계약 (mock = 실제 타입)

### 3.1 DataSource.ts 실제 시그니처

```ts
// src/shared/DataSource.ts

/** location 보간 단위 — date: UTC, x/y/z: OpenF1 단위(1/10 m) */
interface LocationSample {
  date: Date;
  x: number;
  y: number;
  z: number;
}

/**
 * 차량별 보간 sample 쌍
 * - { s1, s2 }        → 두 sample 사이 — 보간 가능
 * - { s1, s2: null }  → 마지막 sample만 — 위치 freeze
 * - null              → sample 0건 또는 가라지 sentinel만 — 마커 미표시
 */
type SamplePair =
  | { s1: LocationSample; s2: LocationSample }
  | { s1: LocationSample; s2: null }
  | null;

type StreamState = 'live' | 'lagging' | 'stalled' | 'buffering';

interface DataSource {
  getDisplayTime(): Date;
  getSamplePair(driverNumber: number, t: Date): SamplePair;
  getStreamState(): StreamState;
  onDisplayTimeChange(handler: (t: Date) => void): () => void;
}
```

### 3.2 track outline 정적 데이터

- 파일 경로: `/trackOutlines/{circuit_key}-{year}.json`
  - 예: `/trackOutlines/63-2024.json` (바레인 2024)
- 인덱스: `/trackOutlines/index.json` — 진입 시 1회 fetch → `(circuit_key, year)` 가용성 확인
- 핵심 필드:
  ```json
  {
    "polyline": [[x, y], ...],
    "arc_length_table": [0, 4.2, 8.1, ...],
    "total_length": 1234.5,
    "openf1_transform": {
      "scale": 0.0234,
      "rotation_deg": -47.3,
      "translate": [250.0, 250.0]
    },
    "openf1_transform_confidence": 0.97
  }
  ```
- 좌표 단위: polyline은 SVG viewBox(500×500) 좌표 / OpenF1 x/y/z는 1/10 m
- fetch 완료 전까지 로딩 placeholder 표시

### 3.3 드라이버 메타 (마커 라벨용)

`DataSource.getLatestBefore('drivers', t)` 또는 세션 시작 시 1회 로드한 정적 목록:

```ts
interface DriverRecord {
  driver_number: number;
  name_acronym: string;   // 마커 라벨 (예: "HAM")
  team_colour: string;    // 마커 내부 색 (예: "#00D2BE"), HEX
}
```

---

## 4. 상태 / 엣지케이스

| 상태 | 화면 처리 |
|---|---|
| **sample 0건** (`getSamplePair` → `null`) | 마커 미표시. 해당 드라이버 슬롯 렌더 skip. |
| **freeze** (`s2: null`) | s1 위치에 마커 고정. 트레일 fade-out 후 dim 50% + `?` 배지 (1.5s 이상 경과 시). |
| **가라지 sentinel** (`|x|+|y|+|z| < 50`) | null과 동일하게 취급 — 마커 미표시. 실주행 좌표로 간주하지 않음. |
| **정상 보간** (`s1`, `s2` 모두 존재, track-on) | path-arc 보간으로 호 위를 부드럽게 이동. |
| **오프트랙** (`|n| > N_OFFTRACK`) | raw XY lerp fallback — 실제 좌표 보존 우선. |
| **핏레인 진입** | 핏레인 polyline 위에 동일 path-arc 알고리즘 적용. 마커 보더 점선 효과. |
| **결승선 wrapping** (`s2 < s1 − 0.8 × total_length`) | wrapping path-arc 처리 — 마커가 결승선을 자연스럽게 통과. |
| **track outline fetch 전** | 다크 배경 + "트랙 로딩 중…" placeholder. 마커 렌더 대기. |
| **transform confidence 낮음** | 마커 위치 오차 가능성. 현재 브리프 범위에서 별도 UX 없음(구현 단계 시각 점검). |
| **리타이어** (`dnf` 또는 5s+ 정지) | 마커 grayscale 처리. |

---

## 5. 비주얼 방향

**트랙 라인**
- 메인 트랙 stroke: `tokens.surface.elevated` (`#2A2A35`), 두께 ~3px (viewport에 따라 자동 조정)
- 핏레인 stroke: `tokens.surface.muted` (`#1F1F28`), 두께 ~2px, 대시 패턴 4px/2px
- Canvas 배경: `tokens.bg.primary` (`#0A0A0F`)

**드라이버 마커**
- 형태: 원형 dot
- 외곽: 흰 테두리 1.5px (`tokens.text.primary`)
- 내부: `team_colour` (F1 공식 팀 색)
- 크기: 트랙 외곽선 평균 폭 × ~80%, 최소 18px / 최대 32px
- 라벨: `name_acronym` 마커 아래 6px, 작은 폰트, `tokens.shadow.subtle` 그림자 (toggle OFF 시 숨김)
- 트레일: 차량 색 alpha 감쇠, 1.5초 윈도우, `tokens.text.muted` α 0.3 → 0

**선두(리더) 강조**
- `position.position == 1` 차량: 노란 외부 글로우 1px. 그 외 마커와 동일 레이어 유지.

**섹터 / DRS / SLM 오버레이 (후속 단계, MVP disabled)**
- 섹터 경계: 트랙 위 수직 막대 8px + S1/S2/S3 레이블
- DRS zone: 청록색 강조 (트랙 stroke 2배 두께) + "DRS ▶" 화살표, historical 재생(2023~2025) 전용
- SLM zone: 밝은 파란색 강조 + "SLM ▶" 화살표, 2026+ 정적 zone만

---

## 6. Claude design 프롬프트 스니펫

```
지금은 화면 디자인(와이어프레임/컴포넌트 구조)만 작업한다. 구현 코드는 작성하지 않는다.

[서킷 맵 패널 디자인]

목적:
- Canvas 2D 패널로, 트랙 외곽선(track outline) 위에 드라이버 마커를 실시간으로 렌더한다.
- 라이브/리플레이 모드를 구분하지 않는다. DataSource 인터페이스에만 의존한다.

데이터 계약 (mock 데이터가 실제 타입과 동일해야 함):

// 위치 보간 단위
interface LocationSample { date: Date; x: number; y: number; z: number; }

// 차량별 sample 쌍
// { s1, s2 }       → 보간 가능
// { s1, s2: null } → 마지막 위치 freeze
// null             → 마커 미표시 (sample 없음 또는 가라지 sentinel)
type SamplePair =
  | { s1: LocationSample; s2: LocationSample }
  | { s1: LocationSample; s2: null }
  | null;

// 조회 메서드
getSamplePair(driverNumber: number, t: Date): SamplePair
getDisplayTime(): Date
onDisplayTimeChange(handler: (t: Date) => void): () => void

// 트랙 정적 데이터
fetch('/trackOutlines/{circuit_key}-{year}.json')
// polyline: SVG viewBox(500×500) 좌표 / x/y/z: OpenF1 1/10 m
// openf1_transform: { scale, rotation_deg, translate } — OpenF1 → SVG viewBox 변환

// 드라이버 메타
interface DriverRecord { driver_number: number; name_acronym: string; team_colour: string; }

엣지케이스 처리:
- SamplePair === null → 해당 드라이버 마커 미표시
- s2 === null → 마지막 위치 freeze, 1.5s 경과 시 dim + ? 배지
- |x|+|y|+|z| < 50 (가라지 sentinel) → null과 동일 취급
- track outline fetch 전 → 다크 배경 + "트랙 로딩 중…" placeholder

비주얼 방향:
- 다크 모드 only, 배경 #0A0A0F
- 트랙 라인: #2A2A35, ~3px
- 핏레인 파선: #1F1F28, ~2px, dash 4/2
- 마커: 원형 dot, 흰 테두리 1.5px, 내부 team_colour
- 라벨: name_acronym, 마커 아래, toggle 가능
- 선두 차량: 노란 글로우 1px
```
