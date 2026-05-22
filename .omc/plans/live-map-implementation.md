# 라이브 맵 구현 계획 (pending approval)

> 작성일: 2026-05-20 · 최종 수정: 2026-05-22 · 상태: **pending approval**
> 전제: [openf1-api-reference.md](../../docs/openf1-api-reference.md), [live-streaming-strategy.md](../../docs/live-streaming-strategy.md), [replay-strategy.md](../../docs/replay-strategy.md), [deployment-architecture.md](../../docs/deployment-architecture.md). 본 계획은 그 위에 올라가는 **렌더링 컴포넌트**의 구현 전략이다.
>
> **호스팅·MVP 컨텍스트 (2026-05-22 확정):** GitHub + Vercel 정적 호스팅 + 개인 사용(동접 1명) + 무료/익명 OpenF1 폴만 사용. 폴러는 **사용자 브라우저**에서 직접 동작. 프레임워크는 **Vite + React** 확정. 라우팅 = `wouter`. 트랙 오버레이는 **메인 트랙 + 핏레인 2종만 MVP**에 포함하고 섹터/DRS/SLM은 후속 단계(§14)로 이동.
>
> **UI 컨텍스트 동기 ([main-page §0](./main-page-implementation.md) 일치):** **Desktop only (1280px+)** — 1024 미만은 안내 배너. **다크 모드 only** — 디자인 토큰은 `src/style/tokens.ts` (main-page와 공유). **트랙 데이터 산출물은 `public/trackOutlines/`에 두고 `fetch()`로 로드** (시즌 카탈로그 JSON과 동일 패턴, Vercel CDN 적중).

---

## 0. 요구 사항 요약

사용자가 명시한 4가지 관심사:

1. **맵 소스** — 어떻게 서킷 맵을 구할 것인가
2. **마커 표시** — 맵 위에 20명의 드라이버 마커를 어떻게 그릴 것인가
3. **라이브/리플레이 모드별 간격·버퍼 인지** — 두 모드의 시계/버퍼 차이를 렌더러가 어떻게 흡수할 것인가
4. **자연스러운 움직임** — 마커가 실제 차량처럼 부드럽게 흐르도록 하는 기법

---

## 1. 맵 소스 전략

### 1.1 채택: **julesr0y/f1-circuits-svg** (CC-BY-4.0, SVG)

[julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg)를 1차 소스로 사용한다 (사용자 결정).

- **라이선스:** CC-BY-4.0 — attribution 의무, 상업 사용 가능, 동일 라이선스 강제 없음
- **커버리지:** 78개 서킷 (1950~현재 + 2026 신규 포함)
- **포맷:** SVG, 500×500 viewBox 정규화
- **디테일:** outline + 출발선 마커 + 주행방향 (2026 일부 서킷은 코너 번호 포함)
- **유지보수:** 2026-04 활발, v2026.2.0
- **스타일 옵션:** minimal / detailed, 4가지 색상 variant

`bacinger/f1-circuits` (MIT, GeoJSON) 및 `f1laps/f1-track-vectors` (MIT, archived)는 채택하지 않는다. 채택 사유는 julesr0y가 2026 시즌까지 활발히 반영되고 SVG가 직접 사용 가능한 형식이라는 점.

### 1.2 Attribution 처리 (CC-BY-4.0 의무)

- UI 푸터 또는 맵 코너에 "Track maps © julesr0y/f1-circuits-svg (CC BY 4.0)" 표기 (작은 폰트, 한 줄)
- 코드 리포 최상위 `THIRD_PARTY_LICENSES.md`에 라이선스 전문 + 소스 링크 첨부
- 빌드 타임에 가져온 각 SVG 파일은 원본 파일명/소스 URL을 메타에 보존

### 1.3 빌드 타임 맵 데이터 파이프라인

> **MVP 스코프 (2026-05-22 확정):** 아래 5종 중 **메인 트랙 polyline + OpenF1 affine transform + 핏레인 polyline** 3개만 본 MVP에 포함한다. 섹터 경계·DRS zone·SLM zone은 **§14 후속 단계로 이동**. 파이프라인은 **GitHub Actions runner**에서 실행되어 산출물 JSON을 main 브랜치에 commit하고, Vercel이 자동 재배포한다. 산출물은 **`public/trackOutlines/`** (정적 자산)에 둬서 런타임에 `fetch('/trackOutlines/{key}-{year}.json')` 으로 로드 — Vercel CDN 적중 시 < 100ms. main-page의 `public/seasons/` 와 동일 패턴.

| 산출물 | 스크립트 | 출처 | MVP |
|---|---|---|---|
| **트랙 polyline** (메인 트랙) | `scripts/fetch-circuit-maps.ts` | julesr0y SVG | **O** |
| **OpenF1 affine transform** | `scripts/extract-openf1-transform.ts` | OpenF1 location 정합 | **O** |
| **핏레인 polyline** | `scripts/trace-pitlane.ts` | OpenF1 `pit`+`location` 결합 추적 | **O** |
| **섹터 경계 좌표** (i1/i2 derive) | `scripts/derive-sector-boundaries.ts` | OpenF1 `laps.i1_speed`/`i2_speed` timestamp + `location` nearest-neighbor | 후속 (§14) |
| **DRS zone 폴리라인** (historical 재생 전용) | `scripts/derive-drs-zones.ts` | OpenF1 `car_data.drs` 전이 시점 + `location` nearest-neighbor | 후속 (§14) |
| **SLM zone 좌표** (정적 입력) | `scripts/load-slm-zones.ts` | FIA 공식 발표 수동 입력 JSON | 후속 (§14) |

#### 1.3.1 트랙 polyline (`scripts/fetch-circuit-maps.ts`)

1. 대상 서킷 목록(설정 파일 `circuits.json`)을 읽음 — `(circuit_key, year, julesr0y_filename)` 매핑
2. julesr0y 리포의 minimal 스타일 SVG를 fetch (HTTP GET, git submodule도 가능 — §15 결정 필요)
3. SVG 파싱 → 트랙 `<path d="...">` 추출 + 출발선 마커 위치 추출
4. SVG path를 polyline으로 샘플링 (균등 호 길이 간격, ~5m 등가)
5. arc-length table 사전 계산 (§5에서 사용)
6. OpenF1 ↔ SVG affine transform 추출 (§2.2)
7. `public/trackOutlines/{circuit_key}-{year}.json` 출력:
```json
{
  "circuit_key": 63,
  "year": 2024,
  "circuit_short_name": "Sakhir",
  "source": "julesr0y/f1-circuits-svg",
  "source_file": "circuits/bahrain/2024-minimal.svg",
  "license": "CC-BY-4.0",
  "viewBox": [0, 0, 500, 500],
  "polyline": [[x, y], ...],         // SVG viewBox 좌표
  "arc_length_table": [0, 4.2, 8.1, ...],
  "total_length": 1234.5,            // SVG viewBox 단위
  "start_finish_index": 0,
  "direction": "clockwise",
  "openf1_transform": {              // OpenF1 X/Y → SVG viewBox
    "scale": 0.0234,
    "rotation_deg": -47.3,
    "translate": [250.0, 250.0]
  },
  "openf1_transform_confidence": 0.97  // 추출 품질 점수
}
```

#### 1.3.2 핏레인 polyline (`scripts/trace-pitlane.ts`)

외부 SVG 소스(julesr0y/bacinger 등)에 핏레인 데이터가 없음이 리서치로 확인됨 → 자체 추적이 유일한 경로.

1. 해당 `(circuit_key, year)`에서 레이스 또는 quali 세션 1~2개 선택
2. `pit` 엔드포인트에서 핏 진입 시각 목록 수집
3. 각 핏 진입 전후 윈도우(`date_start - 5s ≤ date ≤ date_start + lane_duration + 5s`)의 `location` sample을 차량별로 fetch
4. `(0,0,0)` sentinel + 가라지 영역 필터링
5. 복수 드라이버 × 복수 세션 좌표 중첩 → median smoothing → polyline 추출
6. arc-length table 사전 계산 (분기/병합 처리)
7. `public/trackOutlines/pitlane_{circuit_key}-{year}.json` 출력 (필드 구조는 메인 트랙 JSON과 동일)

**한계 (§11에 반영):** `location` 횡방향 정밀도 한계로 핏레인 폭(10~15m)이 좌우 구분 없이 뭉개짐. 시각적으로 단일 라인으로 표현되어도 충분.

#### 1.3.3 섹터 경계 좌표 (`scripts/derive-sector-boundaries.ts`, i1/i2 derive)

`laps.i1_speed`/`i2_speed`는 intermediate speed trap 위치에서 측정되며, 통상 섹터 경계 근방에 설치됨. 정확한 섹터 경계는 아니지만 시각 표시용으로 적합 (사용자 결정).

1. 해당 `(circuit_key, year)`의 깨끗한 레이스 세션 선택
2. 다수 드라이버 × 다수 랩 데이터에서 `i1_speed` / `i2_speed`의 측정 timestamp 추정 (`car_data.speed` 시계열에서 해당 값에 가장 가까운 sample의 `date`로 매칭)
3. 그 timestamp에 대응하는 `location` sample을 nearest-neighbor로 가져와 좌표 추출
4. 복수 샘플의 median으로 수렴된 위치를 섹터 경계로 채택 (수 미터 정밀도 예상)
5. Sector 1 끝 = i1 측정 위치, Sector 2 끝 = i2 측정 위치, Sector 3 끝 = 출발선
6. `public/trackOutlines/sectors_{circuit_key}-{year}.json` 출력 (후속 단계):
```json
{
  "circuit_key": 63,
  "year": 2024,
  "boundaries": [
    { "sector": 1, "end_xy": [4123, -512], "arc_length_s": 1234.5 },
    { "sector": 2, "end_xy": [-201, 988],  "arc_length_s": 3456.7 },
    { "sector": 3, "end_xy": [0, 0],       "arc_length_s": 0 }
  ],
  "method": "i1_i2_speed_trap_derive",
  "accuracy_note": "speed trap position, not exact FIA sector boundary"
}
```

#### 1.3.4 DRS zone 폴리라인 (`scripts/derive-drs-zones.ts`, **historical 재생 전용**, 사용자 결정)

라이브 모드에는 표시하지 않음. 2023~2025 historical 세션 재생 시에만 사용.

1. 해당 `(circuit_key, year)`의 레이스 세션 선택 (DRS 활성화된 세션)
2. 다수 드라이버의 `car_data` 시계열에서 `drs` 전이 시점 추출:
   - `drs == 8` 시작 → detection point 통과
   - `drs >= 10` 시작 → 활성화 시작
   - `drs == 0|1` 복귀 → 활성화 종료 (브레이킹/zone 이탈)
3. 각 전이 시점의 `date`를 `location` sample에 nearest-neighbor 매칭(~150ms 윈도우) → 좌표
4. 20명 × 수십 랩 누적 후 통계적 클러스터링 → zone 시작/끝 좌표 수렴
5. 각 zone을 트랙 polyline의 arc-length 구간 `[s_start, s_end]`으로 표현
6. `public/trackOutlines/drsZones_{circuit_key}-{year}.json` 출력 (후속 단계):
```json
{
  "circuit_key": 63,
  "year": 2024,
  "zones": [
    { "id": 1, "detection_s": 2100.0, "activation_s_start": 2350.0, "activation_s_end": 2890.0 },
    { "id": 2, "detection_s": 4400.0, "activation_s_start": 4650.0, "activation_s_end": 5180.0 },
    { "id": 3, "detection_s": 5500.0, "activation_s_start": 5700.0, "activation_s_end": 5990.0 }
  ],
  "method": "drs_state_transitions_clustering",
  "coverage_note": "2025 Dutch GP 이후 일부 세션에서 F1이 DRS 데이터 제한 → 해당 세션은 부분 zone만 산출 가능"
}
```

#### 1.3.5 SLM (Straight Line Mode = 2026 X-mode) zone 좌표 (`scripts/load-slm-zones.ts`, **정적 입력**, 사용자 결정)

OpenF1에 X-mode 상태 필드가 아직 미노출(2026-05 기준). FIA가 서킷별 approved activation zone을 사전 발표하므로 그 좌표를 수동 입력 JSON으로 관리.

1. `data/slm-zones-raw.json` 수동 큐레이션 — FIA 공식 발표 + Motorsport Magazine 등 참조해 zone의 트랙 위치 기록 (예: "Turn 4 출구 ~ Turn 5 입구")
2. 스크립트가 트랙 polyline 위에 해당 위치의 arc-length 구간으로 변환 (정성적 기술 → 수치 좌표)
3. `public/trackOutlines/slmZones_{circuit_key}-{year}.json` 출력 (후속 단계, DRS zone과 동일한 구조 + `active: false` 차량별 활성화 데이터는 미포함)
4. 미래 OpenF1에 X-mode 필드 추가 시: 본 JSON은 그대로 유지, 차량 활성화 표시 로직만 추가 (§4.5)

#### 1.3.6 산출물 인덱스 — `public/trackOutlines/index.json`

런타임에 사용자 브라우저가 어떤 `(circuit_key, year)` 산출물이 가용한지 알기 위한 인덱스. 빌드 파이프라인 마지막 단계에서 생성·갱신.

```json
{
  "generated_at": "2026-05-22T01:00:00Z",
  "source": "julesr0y/f1-circuits-svg@<commit_sha>",
  "license": "CC-BY-4.0",
  "entries": [
    { "circuit_key": 63, "year": 2024, "track": true, "pitlane": true, "openf1_transform_confidence": 0.97 },
    { "circuit_key": 70, "year": 2021, "track": true, "pitlane": true, "openf1_transform_confidence": 0.92 }
  ]
}
```

- 미래 시즌은 OpenF1 location 데이터가 없으면 entries에 포함하지 않음 (main-page의 시즌 카탈로그 미생성 정책과 일치).
- 런타임 LiveDataSource가 진입 시 `fetch('/trackOutlines/index.json')` 1회 → 해당 (key, year)의 가용성 확인 후 본 JSON 2종 fetch.
- **Atomic 갱신 정책 (critic C3):** 빌드 파이프라인이 본 인덱스를 갱신할 때 (a) 모든 산출 step 성공 시에만 entry 추가, (b) tmp 파일 + `fs.renameSync` 로 POSIX atomic 교체, (c) commit은 `public/trackOutlines/` 디렉토리 단위. 부분 실패 시 이전 index.json + 이전 산출물 그대로 보존 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md) 의 "index.json atomic 갱신" 정책).

### 1.4 레이아웃 변경 대응 — `layout_versions` 매핑 (사용자 결정)

OpenF1의 `circuit_key`는 **물리적 venue 단위**로 부여되어 레이아웃 변경 시에도 같은 key를 유지한다. 따라서 SVG 저장 단위는 `(circuit_key, year)`.

`src/map/layoutVersions.json` 정적 테이블:
```json
[
  {
    "circuit_key": 70,
    "circuit_short_name": "Yas Marina",
    "ranges": [
      { "year_start": 2019, "year_end": 2020, "layout_file": "70-2019.json" },
      { "year_start": 2021, "year_end": null, "layout_file": "70-2021.json" }
    ]
  },
  {
    "circuit_key": 30,
    "circuit_short_name": "Albert Park",
    "ranges": [
      { "year_start": 2019, "year_end": 2019, "layout_file": "30-2019.json" },
      { "year_start": 2022, "year_end": null, "layout_file": "30-2022.json" }
    ]
  }
]
```

조회 로직 (`src/map/layoutVersions.ts`):
```ts
function resolveLayout(circuitKey: number, year: number): string | null {
  const entry = LAYOUT_VERSIONS.find(e => e.circuit_key === circuitKey);
  if (!entry) return null;
  const r = entry.ranges.find(r =>
    year >= r.year_start && (r.year_end === null || year <= r.year_end)
  );
  return r?.layout_file ?? null;
}
```

**알려진 변경 (초기 시드):** Yas Marina 2021, Albert Park 2022, Zandvoort 2021(복귀), Spa 2022(런오프), Las Vegas 2023(신규), Madring 2026(신규). 새 시즌 시작 전 수동 검토.

### 1.5 신규 서킷 / 시즌 시작 시 절차

1. julesr0y 리포의 신규 SVG 확인
2. `circuits.json`에 `(circuit_key, year)` 추가
3. `layoutVersions.json`에 새 range 추가 (또는 기존 range의 `year_end` 종료)
4. `scripts/fetch-circuit-maps.ts` 실행
5. 시각 점검 후 커밋

**시즌 중 변경(드문 경우):** 본 MVP는 지원하지 않음. 발생 시 hotfix로 `layoutVersions.json`에 임시 range 추가. (사용자 결정 — §15에서 `session_key` 단위 오버라이드는 채택 안 함)

---

## 2. 좌표계와 렌더링 기술

### 2.1 좌표계 계층
세 좌표계가 존재 — 변환 체인을 명확히 분리한다.

```
OpenF1 X/Y (1/10 m, 서킷 임의 원점)
     │  ① openf1_transform (rotate + scale + translate)
     ▼
SVG viewBox (500×500, julesr0y 정규화)
     │  ② viewport transform (canvas fit, scale + translate)
     ▼
Canvas pixels
```

- **① openf1_transform**: 서킷마다 1번 계산. 저장된 layout JSON에서 읽음 (§1.3).
- **② viewport transform**: 캔버스 크기/줌/팬에 따라 매 프레임 (또는 resize 시) 갱신.
- 마커는 OpenF1 X/Y → openf1_transform 적용 → ② 적용 → 캔버스 픽셀.
- 정적 트랙은 SVG viewBox 좌표를 가지고 있으므로 ② 만 적용.
- 캔버스 `setTransform()`에 ② 의 행렬을 setting하고, 마커 렌더 시에만 ① 의 결과를 좌표로 사용.

### 2.2 openf1_transform 추출 (빌드 타임, §1.3 단계 6)

OpenF1 X/Y와 SVG viewBox는 다른 서킷별 임의 원점 + 회전. 셋의 파라미터(rotation, scale, translate)를 빌드 타임에 산출:

**우선 시도 (자동):**
1. 해당 `(circuit_key, year)`의 깨끗한 빠른 랩의 OpenF1 `location` 폴리라인을 얻음
2. SVG의 트랙 path 폴리라인과 두 폴리라인 모양 매칭
3. 시작점 정합: OpenF1 랩 시작 시각의 좌표 ↔ SVG의 출발선 마커 위치
4. 회전 추정: 두 폴리라인의 주축(PCA 1번째 축) 정합
5. 스케일 추정: 두 폴리라인의 전체 길이 비율
6. translate 추정: 중심점 정합 후 잔차 최소화

**잔차 검증:** 변환 후 OpenF1 폴리라인의 모든 점에서 SVG 폴리라인까지 거리 평균이 SVG viewBox 단위 < 5 (대략 트랙 폭의 1/4) 이내면 통과. 미달이면 confidence 점수를 낮춰 저장하고, 시각 점검 큐에 올림.

**fallback (수동):** 잔차가 큰 서킷은 SVG 위에 2-3개 mapping point(출발선 + 한두 코너의 정점)를 수동 입력해 affine을 직접 풀 수 있도록 보조 도구 제공. (§15 미해결 — 자동만으로 충분한가)

### 2.3 렌더링 기술: **Canvas 2D**

- SVG는 정적 자산이지만 **DOM에 직접 마운트하지 않는다.** 30fps에서 20개 마커가 SVG DOM에서 transform 갱신되는 비용이 큼.
- 빌드 타임에 SVG path → polyline JSON으로 변환 후, **Canvas 2D로 직접 stroke한다.**
- WebGL/PixiJS: 20개 마커에 과잉.
- Leaflet 등 지도 라이브러리: 지구 위경도 전제, 본 좌표계와 맞지 않음.

**다크 모드 색상 (디자인 토큰 일관):**
- 캔버스 배경 (clearRect 후 fill): `tokens.bg.primary` (예: `#0A0A0F`)
- 트랙 stroke: `tokens.surface.elevated` (예: `#2A2A35`)
- 핏레인 stroke (회색 파선): `tokens.surface.muted` (예: `#1F1F28`)
- 모든 색은 `src/style/tokens.ts` 에서 import (main-page와 공유). map 전용 색은 `mapStyles.ts`.

### 2.4 더블 버퍼링

- **Offscreen canvas (또는 별도 hidden canvas)**: 정적 트랙 외곽선 1회 stroke 후 캐시.
- 메인 캔버스 매 프레임: (1) 정적 캔버스 blit (2) 마커/트레일/오버레이 dynamic 렌더.
- 정적 캐시는 resize/줌 변경 시에만 재생성.

**비동기 fetch와의 결합:**
- 트랙 polyline은 `public/trackOutlines/`에서 `fetch()`로 받음 (~10KB × 2 + index.json). 즉시 사용 불가능.
- 진입 시점부터 fetch 완료까지 (~50~100ms, CDN 적중 시): **메인 캔버스에 다크 배경만 칠하고 중앙에 "트랙 로딩 중…" placeholder** (디자인 토큰 색).
- fetch 완료 → offscreen 캔버스에 정적 트랙 1회 stroke → 메인 RAF 루프 시작.
- 워밍업 인수(§9-5) 의 < 2s 안에 충분히 들어옴.

---

## 3. 데이터 소스 추상화 (라이브/리플레이 공용)

### 3.1 `DataSource` 인터페이스 — **SSOT: `src/shared/DataSource.ts`**

> **단일 진실 원천 (critic M1):** 본 인터페이스는 `src/shared/DataSource.ts` 한 곳에서 정의되고 live-map (좌표·보간)과 dashboard (패널·시간 정렬)가 모두 import해 동일 타입을 사용한다. dashboard 전용 메서드도 본 정의에 포함해 인터페이스 drift를 차단.

```ts
interface LocationSample { date: Date; x: number; y: number; z: number; }

interface DataSource {
  // ── 공통 ──
  /** 현재 표시되어야 할 UTC 시각 */
  getDisplayTime(): Date;
  /** 차량별 buffer에서 displayTime 부근의 sample 쌍을 반환 */
  getSamplePair(driverNumber: number, t: Date):
    | { s1: LocationSample; s2: LocationSample }
    | { s1: LocationSample; s2: null }
    | null;
  /** UI 상태 */
  getStreamState(): "live" | "lagging" | "stalled" | "buffering";
  /** display_time 변경 구독 (RAF/throttle 이전 단계) */
  onDisplayTimeChange(handler: (t: Date) => void): () => void;

  // ── 대시보드 패널용 (dashboard-implementation.md §4.2 동기) ──
  /** date ≤ t 인 가장 최근 record (1건) */
  getLatestBefore<E>(endpoint: E, t: Date, filters?: object): Record<E> | null;
  /** date ≤ t 인 모든 records (시간 역순) */
  getAllBefore<E>(endpoint: E, t: Date, filters?: object, limit?: number): Record<E>[];
  /** lap이 t를 포함하는 record (lap_number 추론용) */
  getLapAt(driverNum: number, t: Date): LapRecord | null;
  /** lap이 t 전에 "완료된" record 만 (date_start + lap_duration ≤ t) */
  getCompletedLapsBefore(driverNum: number, t: Date, limit?: number): LapRecord[];
  /** stint이 lap을 포함하는 record */
  getStintForLap(driverNum: number, lap: number): StintRecord | null;
  /** 누적 통계 (빠른 랩, 보라색 섹터) — t까지의 데이터로만 산출 */
  getAggregateBefore<A>(aggregate: A, t: Date): AggregateResult<A>;
}
```

- 본 plan(live-map)은 공통 4개 메서드를 사용. dashboard는 추가 6개도 사용.
- 구현체(`LiveDataSource`, `ReplayDataSource`)는 전체 10개 메서드를 모두 구현. live-map 단독 사용 시에도 dashboard 메서드가 stub으로 존재하면 컴파일 통과.
- `Record<E>` / `LapRecord` / `StintRecord` / `AggregateResult<A>` 타입은 `src/shared/openf1Types.ts` 에 정의 (전 plan 공유).

### 3.2 구현체

- **`LiveDataSource`** — **브라우저에서 OpenF1 REST를 직접 폴**해 ring buffer를 채운다 ([live-streaming-strategy.md §3.1·§8.1](../../docs/live-streaming-strategy.md)). `display_time = newest_received_date - 30s` ([live-streaming-strategy.md §2.1](../../docs/live-streaming-strategy.md)). 자체 WebSocket이나 백엔드 어댑터는 본 MVP에 없음 (향후 확장 시 어댑터 한 클래스 교체).
- **`ReplayDataSource`** — 브라우저에서 OpenF1 REST를 60s 윈도우로 폴해 메모리 캐시에 적재한다 ([replay-strategy.md §5·§8.1](../../docs/replay-strategy.md)). `display_time = playback_clock` (사용자 제어, [replay-strategy.md §4.1](../../docs/replay-strategy.md)).

렌더러는 인터페이스만 알고, 두 모드를 **구분하지 않는다**.

### 3.3 차량별 독립 버퍼

`location` sample은 차량마다 timestamp가 미세하게 어긋난다. 전 차량 단일 시간축에 정렬하지 말 것.

```ts
class PerDriverBuffer {
  private samples: Map<driverNumber, LocationSample[]>;  // 시간순 정렬

  push(sample: LocationSample, driverNumber: number) { /* 정렬 삽입 */ }

  /** binary search로 t를 둘러싼 두 sample 반환 */
  findPair(driverNumber, t): { s1, s2 } | null { ... }

  /** 오래된 sample은 폐기 (라이브: t-60s 이전, 리플레이: window 밖) */
  trim(beforeT: Date) { ... }
}
```

---

## 4. 마커 표시

### 4.1 시각 디자인 (다크 모드 토큰 기반)

각 마커:
- **외곽:** 흰 테두리 1.5px (`tokens.text.primary` = 흰색) — 다크 배경과 강한 대비
- **내부:** `drivers.team_colour` (HEX, `#` prefix 추가) — F1 공식 팀 색이라 토큰화 안 함
- **숫자:** `driver_number` 흰색 굵은 산세리프(`tokens.text.primary`), 마커 중앙
- **크기:** 트랙 외곽선 평균 폭의 ~80% (자동 계산), 최소 18px, 최대 32px
- **라벨:** `name_acronym` (HAM, VER) 마커 아래 6px, 작은 폰트, 옅은 그림자(`tokens.shadow.subtle`). **기본 ON, UI 토글로 끄기 가능** (§4.2)
- **트레일:** 차량 색 alpha 감쇠 (fade-out). 1.5초 윈도우. 토큰 색 (`tokens.text.muted` α=0.3 → 0) 위에 차량 색 합성

### 4.1.1 마커 라벨 토글 (2026-05-22 확정)

- 라벨(`name_acronym`)은 **기본 ON**. 다크 모드 위에서 마커가 가까이 겹쳐 있을 때 식별성 도움.
- 사용자가 끄고 싶을 때를 위해 UI 토글 제공: `MarkerLabelToggle` 컴포넌트 (지도 코너 또는 사이드 컨트롤). 상태는 React Context 또는 zustand store에 보관 (페이지 새로고침 시 localStorage 복원).
- 토글이 OFF여도 마커 hover/click 시는 라벨 한 줄 임시 표시 (1.5초 fade).
- 클릭 영역은 라벨과 무관 — 마커 자체로 충분 (Desktop 가정).

### 4.2 상태별 표현

| 상태 | 시각 표현 | 판정 기준 |
|---|---|---|
| 정상 주행 | 풀 컬러 마커 + 트레일 | 최근 1s 이내 sample 존재 + (0,0,0) 영역 밖 |
| 핏 진행 중 | 마커 보더에 점선 효과 | `race_control` PIT 메시지 또는 `pit` 이벤트 직후 60s |
| 핏 정차 | 마커 살짝 축소 + 정지 표시 | location 변화 < 5 단위 / 3s 지속 |
| 연결 끊김 | 마커 dim 50% + `?` 배지 | 최근 sample이 1.5s 이상 전 |
| 리타이어 | 마커 grayscale | `session_result.dnf == true` 또는 5s+ 정지 |
| 가라지 (sentinel) | 표시 안 함 | `|x| + |y| + |z| < 50` 단위 |

### 4.3 트레일 (선택, 기본 on)
- 차량 뒤로 직전 ~1.5초 경로를 fade out 라인으로 그림.
- 너무 길면 시각 노이즈, 너무 짧으면 효과 미미.
- 비활성화 가능한 옵션.

### 4.4 리더 강조 (선택)
- `position.position == 1` 차량의 마커에 노란 외부 글로우 1pixel.
- 과한 강조는 안 함 (모든 마커가 같은 레이어에서 잘 보여야 함).

### 4.5 트랙 기능 오버레이 표시 (핏레인 · 섹터 · DRS · SLM)

> **MVP 스코프 (2026-05-22 확정):** 본 MVP에서는 **핏레인 polyline만 활성화**한다. 섹터 경계·DRS zone·SLM zone은 후속 단계(§14)로 이동하며, UI 토글(§4.5.1)에 항목 자리만 disabled 상태로 예약한다.

§1.3.2에서 생성된 핏레인 polyline을 정적 트랙 캐시(§2.4)에 함께 그려둔다 (매 프레임 동적 렌더 아님). 마커 상태에 따라 동적으로 발광/페이드되는 일부만 렌더 루프에서 갱신.

| 기능 | 시각 표현 | 라이브 모드 | 재생 모드 |
|---|---|---|---|
| **핏레인 polyline** | 메인 트랙 옆에 **회색 파선** (대시 4px/2px). 핏 진입 시 해당 차량 마커가 polyline 위로 전환 (§5.5) | O | O |
| **섹터 경계** | 트랙 위 짧은 **수직 막대(8px) + 섹터 번호 레이블** (S1/S2/S3). 트랙 색상은 단색 유지 (segment 색 구분은 안 함, 노이즈 방지) | O | O |
| **DRS zone** | 트랙 segment를 **밝은 청록색 강조 (트랙 stroke 2배 두께)** + 시작점에 작은 "DRS ▶" 화살표. 사용자 결정에 따라 **historical 재생 모드(2023~2025)에서만 표시**, 라이브엔 비표시 | X | **O (2023~2025만)** |
| **SLM zone** | 트랙 segment를 **밝은 파란색 강조** + "SLM ▶" 화살표. 정적 zone 표시만, 차량별 활성화는 OpenF1 신규 필드 입수 후 활성화 (UI 자리만 예약) | O (정적 zone만, 2026+) | O (정적 zone만, 2026+) |

#### 4.5.1 토글 정책
- 사용자 패널에 4개 체크박스 (핏레인 · 섹터 · DRS · SLM) — 각각 켜고 끌 수 있음.
- **본 MVP에서는 핏레인만 활성**, 나머지 3개는 UI 자리만 표시하고 `disabled` + "Coming soon" tooltip. 데이터가 준비되면 그대로 활성화됨.
- 기본값(MVP 후 전체 활성 시): 핏레인 ON, 섹터 ON, DRS/SLM은 세션 연도에 따라 자동 ON (해당 시즌만).

#### 4.5.2 SLM 활성화 표시 (미래 확장 자리)
- 향후 OpenF1에 X-mode 활성화 필드가 추가되면, 활성화 중인 차량 마커 옆에 작은 SLM 아이콘을 일시 표시 (~1-2초 페이드아웃).
- `src/map/markers.ts`에 placeholder 함수 `drawSlmIndicator(driverNum, isActive)` 정의. 데이터 입수 전엔 항상 false 반환.
- 데이터 들어오면 `DataSource`가 차량별 `x_mode_active: boolean`을 전달하도록 어댑터만 갱신.

#### 4.5.3 줌·해상도 적응
- 모바일/작은 캔버스에서 4종 오버레이가 동시에 켜지면 시각적 혼잡 → 트랙 외곽선 stroke 굵기 < 3px일 때 섹터 막대를 자동으로 숨김 (DRS/SLM 강조는 유지, 정보 우선순위 차).

---

## 5. 자연스러운 움직임 (Path-arc 보간)

사용자 결정: Linear lerp 대신 트랙 polyline을 따라 움직이는 **Path-arc 보간**을 1차 경로로, 핏레인/오프트랙은 별도 fallback. 시케인 안쪽 잘림을 원천 차단하고, 마커가 항상 트랙 위에 있도록 보장한다.

### 5.1 사전 계산 (빌드 타임, §1.3에서 출력됨)

각 `(circuit_key, year)`의 layout JSON이 다음을 가지고 있다:
- `polyline: [[x, y], ...]` (SVG viewBox 좌표)
- `arc_length_table: [0, s1, s2, ..., total_length]` (누적 호 길이)
- `total_length` — 1랩 전체 호 길이

### 5.2 런타임 — sample 수신 시 (~3.7 Hz, sample마다 1회)

각 차량의 새 sample(`x`, `y`, `date`)이 도착하면:

1. OpenF1 X/Y → openf1_transform(§2.2) → SVG viewBox 좌표 `(xs, ys)`
2. SVG polyline 상의 closest-point projection:
```ts
// brute-force, ~600 segments → 0.01~0.03 ms (V8)
function projectToPolyline(P, polyline, S): { s, n, segIdx } {
  let best = { d: Infinity, s: 0, n: 0, segIdx: 0 };
  for (let i = 0; i < polyline.length - 1; i++) {
    const A = polyline[i], B = polyline[i+1];
    const AB = { x: B.x-A.x, y: B.y-A.y };
    const len2 = AB.x*AB.x + AB.y*AB.y;
    const t = Math.max(0, Math.min(1,
      ((P.x-A.x)*AB.x + (P.y-A.y)*AB.y) / len2));
    const proj = { x: A.x + t*AB.x, y: A.y + t*AB.y };
    const dx = P.x - proj.x, dy = P.y - proj.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < best.d) {
      const segLen = Math.sqrt(len2);
      best = {
        d: d2, segIdx: i,
        s: S[i] + t * segLen,     // arc-length
        n: Math.sqrt(d2) * Math.sign(/* normal cross-product */)
      };
    }
  }
  return best;
}
```
3. 결과 `(s, n)`을 PerDriverBuffer에 push: `{date, raw_xy, s, n}`

### 5.3 런타임 — 매 렌더 프레임 (30 fps, 20대)

차량별로 매 프레임:

1. PerDriverBuffer에서 displayTime 기준 `s1`, `s2` (전후 두 sample) 가져옴
2. 정상 주행 판정 — fallback 분기:

| 조건 | 처리 | 출력 |
|---|---|---|
| 두 sample 모두 `|n| ≤ N_TRACK` (track-on) + 1랩 wrapping 정상 | **Path-arc 보간** | 호를 따라 움직임 |
| 한쪽이라도 `|n| > N_OFFTRACK` | **Raw XY lerp** | 트랙 밖이라 직선 보간 (실제 위치 보존) |
| 핏레인 영역에 진입했다고 판정 | **별도 핏레인 polyline에 동일 알고리즘 적용** | 핏레인 위를 흐름 |
| s2 미수신 (>1.5s gap) | **마지막 위치 freeze + "연결 끊김" UI** | 정지 |
| 1랩 wrapping 감지 (s2 < s1 - 0.8 × total_length) | **wrapping path-arc**: `s = sA + u·(sB + total - sA) mod total` | 결승선 통과 |

3. Path-arc 보간 핵심:
```ts
const u = (t - s1.date) / (s2.date - s1.date);   // 0..1
const sNow = s1.s + u * (s2.s - s1.s);            // arc-length 공간 lerp
const pos = sampleAtArcLength(polyline, S, sNow); // O(log N) binary search
```
4. `n` 도 같은 방식으로 보간해 미세한 좌우 오프셋 보존 (선택, 기본 켜둠 — 차량이 인사이드/아웃사이드 라인 따라가는 효과)

### 5.4 임계치 (튜닝 필요, 단계 6에서 확정)

| 상수 | 의미 | 초기값 (SVG viewBox 단위) |
|---|---|---|
| `N_TRACK` | 정상 주행 인정 횡오프셋 | 8 (≈트랙 폭의 1/2) |
| `N_OFFTRACK` | 오프트랙 fallback 임계 | 15 (≈트랙 폭) |
| `GAP_FREEZE_MS` | freeze 전환 임계 | 1500 |
| `WRAP_THRESHOLD` | 1랩 wrap 감지 | 0.8 × total_length |

### 5.5 핏레인 처리

- julesr0y SVG는 핏레인 데이터를 포함하지 않음 (§1.1 디테일 표 참조).
- 핏레인은 OpenF1의 `pit` + `race_control` (PIT 메시지) + 핏 시간 윈도우의 `location` sample들에서 빌드 타임에 자체 추적해 별도 polyline으로 저장: `pitlane_{circuit_key}-{year}.json`.
- 정상 트랙 polyline에 projection 시 `|n| > N_OFFTRACK`이고 핏 이벤트가 진행 중이면 핏레인 polyline으로 전환.
- 둘 다 미일치 시 raw XY (오프트랙 fallback).

### 5.6 외삽 금지

미수신 시 마지막 위치 freeze. 외삽은 트랙을 벗어나거나 핏 정차 중 움직이는 등 부자연스러운 결과를 만든다.

### 5.7 성능 예산

- Sample 수신 시 projection: 20대 × 3.7 Hz × 0.02 ms ≈ 1.5 ms/s (백그라운드)
- 프레임 렌더 시 arc-length lookup: 20대 × log(600) × ~0.001 ms ≈ 0.2 ms/프레임
- 전체 프레임 < 5 ms (30 fps 기준 33ms 예산의 15%)
- KD-tree·spatial hashing 등 최적화는 불필요 (segment 수 < 2000)

### 5.8 렌더 루프

```ts
class LiveMapRenderer {
  start() {
    const tick = () => {
      const t = this.dataSource.getDisplayTime();
      this.renderFrame(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private renderFrame(t: Date) {
    this.ctx.drawImage(this.staticCache, 0, 0);
    for (const driverNum of this.knownDrivers) {
      const pair = this.buffer.findPair(driverNum, t);
      const state = this.classifyState(driverNum, pair, t);
      const pos = this.computePosition(pair, state, t);  // path-arc or fallback
      if (this.trailsEnabled) this.drawTrail(driverNum, t);
      this.drawMarker(driverNum, pos, state);
    }
    this.drawHud(t);
  }
}
```

### 5.9 탭 백그라운드 처리

- RAF는 백그라운드에서 1Hz로 강제 → 자연 일시정지.
- 복귀 시 `displayTime`이 점프 → 보간 윈도우가 새 위치로 이동 → 자연 재개. **별도 코드 불필요.**

---

## 6. 라이브/리플레이 모드별 간격·버퍼 통합

### 6.1 라이브 모드

| 항목 | 값 (출처: live-streaming-strategy.md) |
|---|---|
| `location` 폴 주기 | 10s (req 6/min) |
| 버퍼 깊이 목표 | 30s |
| display_time | `newest_received_date - 30s` |
| 끊김 시 동작 | display_time 진행 속도 감소 → 정지 → "데이터 끊김" UI |

렌더러의 책임: PerDriverBuffer에 sample을 푸시받고, display_time에서 보간하는 것만.
**본 MVP**: REST 폴링은 `LiveDataSource` 어댑터가 브라우저 안에서 직접 담당 (MQTT는 향후 확장 — 백엔드 도입 시).

### 6.2 리플레이 모드

| 항목 | 값 (출처: replay-strategy.md) |
|---|---|
| `location` 윈도우 | 60s 반-개구간 `[T, T+60s)` |
| 룩어헤드 | `60s × speed` |
| display_time | `playback_clock` (사용자 제어) |
| 시크 시 동작 | 신규 윈도우 fetch, 캐시 적중 시 즉시, 미적중 시 200~500ms 로딩 |

렌더러는 동일. `ReplayDataSource`가 윈도우 fetch와 시계 관리 담당.

### 6.3 모드 전환
- 같은 `LiveMapRenderer` 인스턴스가 `DataSource`만 갈아끼면 됨.
- 라이브 → 리플레이 전환: 라이브 30s 버퍼 데이터 일부를 리플레이 버퍼 초기 상태로 활용 가능 (워밍업 단축).

---

## 7. 모듈 구조

> 표기 — `MVP`: 본 MVP에 포함 / `후속`: §14 후속 단계로 이동.

```
src/map/
├── index.ts                       # public API exports                            [MVP]
├── LiveMapRenderer.ts             # 메인 렌더러 (path-arc + fallback)              [MVP]
├── LiveDataSource.ts              # 라이브 어댑터 — 브라우저 REST 직접 폴          [MVP]
├── ReplayDataSource.ts            # 리플레이 어댑터 — 60s 윈도우 메모리 캐시       [MVP]
├── PerDriverBuffer.ts             # 차량별 sample 버퍼 ({date, raw_xy, s, n})      [MVP]
├── pathProjection.ts              # closest-point-on-polyline                     [MVP]
├── arcLength.ts                   # arc-length table 조회 (binary search)         [MVP]
├── interpolation.ts               # path-arc + fallback + wrapping                [MVP]
├── transform.ts                   # OpenF1 X/Y ↔ SVG viewBox affine               [MVP]
├── viewport.ts                    # SVG viewBox → canvas pixels                   [MVP]
├── layoutVersions.ts              # (circuit_key, year) → layout 파일 조회        [MVP]
├── markers.ts                     # 마커 그리기 (drawSlmIndicator placeholder)    [MVP]
├── trails.ts                      # 트레일 그리기                                 [MVP]
├── trackRenderer.ts               # 정적 트랙 캐시 (트랙 + 핏레인만 합성)         [MVP]
├── pitLane.ts                     # 핏레인 polyline 로드 + 진입/퇴출 판정         [MVP]
├── sectorBoundaries.ts            # 섹터 경계 막대/레이블 렌더                    [후속]
├── drsZones.ts                    # DRS zone 렌더 (historical 재생 한정 게이트)   [후속]
├── slmZones.ts                    # SLM zone 렌더                                 [후속]
├── trackFeatureToggle.ts          # §4.5.1 4종 오버레이 on/off (MVP는 핏레인만)   [MVP]
├── markerLabelToggle.ts           # §4.1.1 라벨 표시 ON/OFF + localStorage 복원   [MVP]
├── mapStyles.ts                   # map 전용 색만 (src/style/tokens.ts에서 import) [MVP]
├── trackOutlinesFetcher.ts        # public/trackOutlines/*.json fetch + 메모리 캐시 [MVP]
├── stateBadges.ts                 # stream state 인디케이터                       [MVP]
│                                  # (attribution은 src/shared/Footer.tsx 단일, critic M8)
├── layoutVersions.json            # 정적 매핑 테이블 (§1.4)                       [MVP]
└── circuits.json                  # 서킷 메타 + julesr0y 파일명 매핑              [MVP]

src/shared/                        # 전 plan 공유 (SSOT)
├── DataSource.ts                  # DataSource 인터페이스 + 타입 (§3.1, critic M1)  [MVP]
├── openf1Types.ts                 # Record<E>·LapRecord·StintRecord 등 OpenF1 타입  [MVP]
└── Footer.tsx                     # 단일 attribution + 라이선스 + 디스클레이머 (critic M8)  [MVP]

public/trackOutlines/              # GitHub Actions 빌드 산출물 (커밋됨, Vercel 정적 서빙)
├── index.json                     # 가용 (key, year) 인덱스 (§1.3.6)              [MVP]
├── 63-2024.json                   # 메인 트랙                                     [MVP]
├── pitlane_63-2024.json           # 핏레인 polyline (§1.3.2)                      [MVP]
├── sectors_63-2024.json           # 섹터 경계 좌표 (§1.3.3)                       [후속]
├── drsZones_63-2024.json          # DRS zone (§1.3.4)                             [후속]
├── slmZones_63-2026.json          # SLM zone (§1.3.5)                             [후속]
├── 70-2021.json                   # Yas Marina 신 레이아웃 (메인 트랙)            [MVP]
└── ...

scripts/                           # GitHub Actions runner에서 실행 ([deployment-architecture.md](../../docs/deployment-architecture.md))
├── fetch-circuit-maps.ts          # julesr0y SVG fetch + polyline 추출            [MVP]
├── extract-openf1-transform.ts    # affine transform 자동 추출 + 잔차 검증        [MVP]
├── trace-pitlane.ts               # 핏 이벤트 + location → 핏레인 polyline        [MVP]
├── derive-sector-boundaries.ts    # i1/i2 speed trap → 섹터 경계                  [후속]
├── derive-drs-zones.ts            # car_data.drs → DRS zone                       [후속]
└── load-slm-zones.ts              # FIA 수동 입력 → SLM zone JSON                 [후속]

data/
└── slm-zones-raw.json             # FIA 공식 발표 수동 큐레이션                   [후속]

THIRD_PARTY_LICENSES.md            # CC-BY-4.0 attribution                          [MVP]
```

---

## 8. 기술 스택 (2026-05-22 확정)

- **언어:** TypeScript (strict)
- **빌드:** Vite
- **프레임워크:** **React 18** — core는 framework-agnostic Canvas 2D 로직, React thin wrapper(`<LiveMap />`)로 dashboard·main page와 통합
- **라우팅:** **wouter** (~1.5KB, SPA용, [main-page-implementation.md §16](./main-page-implementation.md) 동기화)
- **상태 관리:** core 내부는 자체 클래스 상태. React 통합은 가벼운 store (Zustand 또는 vanilla event emitter).
- **테스트:** Vitest (단위) + Playwright (시각 회귀)
- **호스팅:** Vercel hobby 정적 SPA. 자세한 배포 흐름은 [deployment-architecture.md](../../docs/deployment-architecture.md) 참고.

---

## 9. 인수 기준 (Acceptance Criteria)

각 항목은 자동 또는 수동으로 검증 가능.

1. **렌더 성능** — 20 마커 + 트랙 그리기 평균 < 8ms/frame (Chrome DevTools Performance recording, Desktop M1 또는 동급 기준 — 모바일 성능 기준 없음, §13 스코프 밖)
2. **마커 정확성** — 어느 프레임에서나 마커가 트랙 외곽선 폴리곤의 ±5px 이내 (시각 회귀 테스트)
3. **라이브 안정성** — 정상 운영 중 끊김 없음. OpenF1 시뮬레이션 stall 후 5초 이내 "데이터 지연" UI 표시
4. **리플레이 부드러움** — 1x/2x/4x 모두 시각 stutter 없음. 시크 후 첫 프레임 < 500ms
5. **워밍업** — 모드 진입 후 첫 마커 표시 < 2s
6. **가라지 처리** — `(0,0,0)` 근처 sample은 화면에 표시되지 않음
7. **연결 끊김 UI** — 마지막 sample 1.5s 후 해당 마커 dim 50% + `?` 배지
8. **차량별 독립 timeline** — 두 차량의 sample timestamp가 다를 때 각자 정확한 시각에 렌더링됨 (단위 테스트)
9. **트랙 외곽선 크기** — JSON 파일당 ≤ 50KB, gzip ≤ 10KB
10. **메모리** — 60분 라이브 운영 후 메모리 증가 < 50MB (Chrome Task Manager)
11. **모드 전환** — 라이브↔리플레이 전환이 200ms 이내 + 시각 깜빡임 없음
12. **탭 백그라운드** — 백그라운드 60초 후 포그라운드 복귀 시 보간이 정확한 displayTime에서 재개
13. **핏레인 표시** — 핏 진입 차량의 마커가 5초 이내 핏레인 polyline 위로 자연 전환되며, 퇴출 시 메인 트랙으로 복귀
14. **[후속]** 섹터 경계 표시 — 모든 알려진 서킷에서 S1/S2/S3 막대가 트랙 위 ±10px 이내 (시각 점검 기준)
15. **[후속]** DRS zone 표시 (historical) — 2023~2024 세션 재생 시 zone segment가 일관되게 표시되며, 라이브 모드에서는 비표시
16. **[후속]** SLM zone 표시 (정적, 2026+) — 2026 시즌 세션에서 정적 zone segment가 표시되고, 차량별 활성화 표시는 OpenF1 신규 필드 입수 전까지 자리만 예약 (placeholder false)
17. **[MVP]** 데이터 파이프라인 자동화 — 통합 `daily-data-refresh.yml` workflow의 **일요일 step**에서 `scripts/fetch-circuit-maps.ts`·`scripts/extract-openf1-transform.ts`·`scripts/trace-pitlane.ts` 3종 실행 → `public/trackOutlines/` 산출물(+ `index.json`) main 브랜치 commit, Vercel 자동 재배포 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md))
18. **[MVP]** 라이브 어댑터 동작 환경 — `LiveDataSource`가 백엔드/WebSocket 없이 브라우저에서 OpenF1 REST를 26 req/min으로 직접 폴해 30s ring buffer 유지 (개인 1명 동접 가정)
19. **[MVP]** trackOutlines CDN 적중 — `public/trackOutlines/index.json` + `{key}-{year}.json` 2종이 Vercel CDN에서 < 100ms 응답 (Network 패널 수동 확인)
20. **[MVP]** 다크 모드 토큰 일관성 — 캔버스 배경·트랙·핏레인·마커 라벨이 모두 `src/style/tokens.ts` 또는 `mapStyles.ts`에서 import. raw hex 직접 사용 없음 (코드 리뷰)
21. **[MVP]** 마커 라벨 토글 — 기본 ON, OFF로 전환 시 라벨 사라짐 + 새로고침 후 OFF 복원 (localStorage). hover/click 시 1.5초 임시 표시 (단위 + 시각 회귀)

---

## 10. 구현 단계 (순서)

> 각 단계는 독립적으로 검증 가능. 단계마다 만나야 할 인수 기준이 명시됨.
>
> **단계 0 (의존, critic P0-2):** [main-page §12 단계 0](./main-page-implementation.md) — Vite/React/wouter 부트스트랩 + `src/style/tokens.ts` 디자인 토큰 + `vercel.json` SPA fallback. **단계 0의 destructive 작업(기존 `.github/workflows/ci.yml` 삭제·교체, `package.json` 신규 생성)은 main-page 작업자가 단독 수행한다. live-map 작업자는 단계 0 완료 인수(새 ci.yml main 녹색 통과 + `npm run build` 성공 + `vercel.json` SPA fallback preview 동작)가 충족된 commit을 base로 단계 0.5 → 단계 1에 진입.**

### 단계 0.5: SSOT 인터페이스 파일 생성 (critic P0-1)
- [src/shared/DataSource.ts](../../src/shared/DataSource.ts) — **인터페이스만** (메서드 시그니처는 §3.1 그대로, dashboard plan용 6개 메서드 포함). 본 plan 단계 6의 구현체보다 먼저 만든다. dashboard 단계 1이 import할 SSOT가 cross-plan에서 누락되지 않도록 단독 step으로 분리.
- ✅ 인수: `git ls-files src/shared/DataSource.ts`가 1건. 파일 내부에 `getLatestBefore`, `getAllBefore`, `getCompletedLapsBefore` 등 dashboard plan의 6개 메서드 시그니처 존재 (구현체는 단계 6).

### 단계 1: SVG fetch + polyline 추출 (1개 서킷)
- [scripts/fetch-circuit-maps.ts](../../scripts/fetch-circuit-maps.ts) — julesr0y SVG fetch + path → polyline + arc-length table
- [src/map/circuits.json](../../src/map/circuits.json) — (circuit_key, year, julesr0y_filename) 매핑 시드
- 1개 서킷(예: Bahrain 2024)으로 검증 → `trackOutlines/63-2024.json` 산출
- THIRD_PARTY_LICENSES.md 작성
- ✅ 인수: 9번 (트랙 JSON 크기)

### 단계 2: openf1_transform 자동 추출
- [scripts/extract-openf1-transform.ts](../../scripts/extract-openf1-transform.ts) — OpenF1 location 폴리라인 ↔ SVG polyline 정합
- 단계 1 서킷에서 잔차 < 5 (viewBox 단위) 검증
- [src/map/transform.ts](../../src/map/transform.ts) — 런타임 transform 적용 함수
- ✅ 검증: OpenF1 sample을 변환했을 때 SVG path 근방에 위치하는지

### 단계 3: 정적 트랙 렌더 + viewport
- [src/map/viewport.ts](../../src/map/viewport.ts) — SVG viewBox ↔ canvas pixels
- [src/map/trackRenderer.ts](../../src/map/trackRenderer.ts) — offscreen canvas 캐시
- [src/shared/Footer.tsx](../../src/shared/Footer.tsx) — 단일 푸터 (CC-BY-4.0 + CC-BY-NC-SA + F1 디스클레이머 + generated_at, critic M8)
- 단계 1 결과 그려보기 (단계 5까지는 마커 없이)

### 단계 4: layout_versions 매핑
- [src/map/layoutVersions.json](../../src/map/layoutVersions.json) — 초기 시드 (Yas Marina, Albert Park, Las Vegas, Madring 등)
- [src/map/layoutVersions.ts](../../src/map/layoutVersions.ts) — `(circuit_key, year) → layout_file` 조회 함수
- 단위 테스트: 경계 연도(2020/2021/2022 Yas Marina, 2019/2022 Albert Park 등)

### 단계 5: path-arc 보간 라이브러리
- [src/map/pathProjection.ts](../../src/map/pathProjection.ts) — closest-point on polyline
- [src/map/arcLength.ts](../../src/map/arcLength.ts) — `sampleAtArcLength(polyline, S, s)` binary search
- [src/map/interpolation.ts](../../src/map/interpolation.ts) — path-arc + fallback + wrapping
- 단위 테스트: 시케인 케이스(중심 사이드 보간이 안쪽으로 잘리지 않음), wrapping 케이스, 오프트랙 fallback
- ✅ 인수: 8번 (단위), 신규: "정상 주행 마커는 항상 polyline의 ±N_TRACK 이내"

### 단계 6: DataSource + 마커 + 렌더 루프
- [src/shared/DataSource.ts](../../src/shared/DataSource.ts) **구현체** (SSOT 인터페이스 파일은 단계 0.5에서 이미 생성됨, §3.1·§7 참조), [src/map/PerDriverBuffer.ts](../../src/map/PerDriverBuffer.ts)
- [src/map/markers.ts](../../src/map/markers.ts), [src/map/mapStyles.ts](../../src/map/mapStyles.ts), [src/map/markerLabelToggle.ts](../../src/map/markerLabelToggle.ts)
- [src/map/LiveMapRenderer.ts](../../src/map/LiveMapRenderer.ts) — RAF 루프
- 합성 sample로 검증 (시케인 + 헤어핀 + 1랩 wrapping)
- ✅ 인수: 1번 (렌더 성능), 6번 (가라지 처리)

### 단계 7: 트레일 + 상태 인디케이터
- [src/map/trails.ts](../../src/map/trails.ts), [src/map/stateBadges.ts](../../src/map/stateBadges.ts)
- 핏/리타이어/연결 끊김 상태 핸들링
- ✅ 인수: 7번 (연결 끊김 UI)

### 단계 8: 핏레인 polyline 추적 + 마커 전환
- [scripts/trace-pitlane.ts](../../scripts/trace-pitlane.ts) — `pit` 이벤트 + `location` 윈도우로 핏레인 self-trace (§1.3.2)
- `trackOutlines/pitlane_63-2024.json` 등 생성
- [src/map/pitLane.ts](../../src/map/pitLane.ts) — 핏레인 polyline 로드 + 진입/퇴출 판정
- 마커가 핏 진입 시 핏레인 polyline 위 path-arc 보간으로 자연 전환 (§5.5)
- 정적 트랙 캐시에 핏레인 회색 파선 렌더
- ✅ 인수: 13번 (핏레인 표시)

### 단계 9 [후속, §14]: 섹터 경계 derive + 표시
> 본 MVP에서 제외. 후속 단계로 이동.
- [scripts/derive-sector-boundaries.ts](../../scripts/derive-sector-boundaries.ts) — `i1/i2_speed` timestamp 매칭 → `location` 좌표 (§1.3.3)
- `trackOutlines/sectors_63-2024.json` 등 생성
- [src/map/sectorBoundaries.ts](../../src/map/sectorBoundaries.ts) — 막대/레이블 렌더, 정적 트랙 캐시에 합성
- 작은 캔버스에서 자동 숨김 (§4.5.3)
- ✅ 인수: 14번 (섹터 경계 표시)

### 단계 10 [후속, §14]: DRS zone derive (historical 전용)
> 본 MVP에서 제외. 후속 단계로 이동.
- [scripts/derive-drs-zones.ts](../../scripts/derive-drs-zones.ts) — `car_data.drs` 전이 시점 + `location` nearest-neighbor (§1.3.4)
- `trackOutlines/drsZones_63-2024.json` 등 생성 (2023~2025 세션 한정)
- [src/map/drsZones.ts](../../src/map/drsZones.ts) — historical 재생 게이트 + zone segment 강조 + "DRS ▶" 화살표
- 라이브 모드에서는 비활성 (게이트 확인)
- ✅ 인수: 15번 (DRS zone historical 표시)

### 단계 11 [후속, §14]: SLM zone 정적 입력 + UI placeholder
> 본 MVP에서 제외. 후속 단계로 이동. (단, §4.5.1 UI 토글 자리는 MVP에 disabled 상태로 포함)
- `data/slm-zones-raw.json` 큐레이션 (FIA 공식 발표 입력)
- [scripts/load-slm-zones.ts](../../scripts/load-slm-zones.ts) — raw → arc-length 좌표 변환 (§1.3.5)
- `trackOutlines/slmZones_*-2026.json` 생성
- [src/map/slmZones.ts](../../src/map/slmZones.ts) — 정적 zone 렌더 + "SLM ▶" 화살표
- [src/map/markers.ts](../../src/map/markers.ts) `drawSlmIndicator()` placeholder 추가 (항상 false 반환)
- ✅ 인수: 16번 (SLM zone 정적 표시 + 활성화 placeholder)

### 단계 12 [MVP]: 라이브 어댑터
- [src/map/LiveDataSource.ts](../../src/map/LiveDataSource.ts) — **브라우저에서 OpenF1 REST 직접 폴**. live-streaming-strategy.md §3.1·§8.1 정책 구현 (26 req/min, 30s ring buffer)
- ✅ 인수: 3번 (라이브 안정성), 5번 (워밍업), 18번 (브라우저 폴러)
- ✅ **신규 인수 (critic P0-4)**: CORS preflight 실패 mock 시 `LiveDataSource.start()`가 cadence interval을 등록하지 않고 `onCorsFailed` 콜백을 발화 (Vitest + msw로 OPTIONS 404 시뮬레이션)
- ✅ **신규 인수 (critic P0-5)**: hydration burst와 정상 cadence가 시간상 직렬임을 단위 테스트로 검증. vitest + fake timer로 hydration `Promise.all` resolve 전 `vi.advanceTimersByTime(60000)` 호출 시 cadence fetch가 0건임을 확인. hydration resolve 후 같은 timer 진행 시 cadence fetch 발생 확인. 구현 강제: `LiveDataSource.start()`는 `await Promise.all(hydrationPromises)` 완료 직후에만 `setInterval(cadenceTick, cadenceMs)` 등록.

### 단계 13 [MVP]: 리플레이 어댑터
- [src/map/ReplayDataSource.ts](../../src/map/ReplayDataSource.ts) — replay-strategy.md §5·§8.1 정책 구현 (60s 윈도우, 브라우저 메모리 캐시)
- ✅ 인수: 4번 (리플레이 부드러움), 11번 (모드 전환)

### 단계 14 [MVP]: 78개 서킷 일괄 처리 + 잔차 큐레이션
- 모든 `(circuit_key, year)`에 단계 1~3·8의 MVP 산출물 (메인 트랙·affine·핏레인) 일괄 실행
- GitHub Actions workflow로 자동화 ([deployment-architecture.md](../../docs/deployment-architecture.md))
- 잔차 미달 서킷 수동 점검 (mapping point 보정 도구 포함)
- 시각 점검 후 커밋
- ✅ 인수: 2번 (시각 회귀), 17번 (파이프라인 자동화)

### 단계 15 [MVP]: 시각 회귀 + 메모리 + 탭 처리
- Playwright 시각 회귀 (MVP 스코프: 메인 트랙 + 핏레인)
- 메모리 누수 확인
- 백그라운드 탭 복귀 테스트
- ✅ 인수: 10번 (메모리), 12번 (탭 백그라운드)

---

## 11. 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| OpenF1 X/Y ↔ SVG viewBox affine 추출 부정확 | 마커가 트랙에서 떨어짐 | 단계 2에서 잔차 < 5 검증. 미달 서킷은 단계 11에서 수동 mapping point 보정. confidence 점수 저장해 시각 점검 큐 생성 |
| julesr0y CC-BY-4.0 attribution 누락 | 라이선스 위반 | 단계 1에서 THIRD_PARTY_LICENSES.md + UI 푸터 attribution 동시에 작성. 단계 11 점검 체크리스트에 attribution 포함 |
| 레이아웃 변경된 연도에 잘못된 SVG 로드 | 마커가 다른 레이아웃 위를 움직임 | `(circuit_key, year)` 키 + layoutVersions 매핑. 단위 테스트로 경계 연도 검증 (단계 4) |
| 핏레인 데이터 없음 (julesr0y SVG 미포함) | 핏 진행 시 마커 점프 또는 사라짐 | OpenF1 `pit` + `location`에서 자체 추적 (단계 8). 단기적으로 핏 영역 진입 시 raw XY fallback으로 처리 |
| Path projection이 8자 트랙·인접 segment에서 오선택 | 마커가 반대편 segment로 snap | F1은 8자 트랙 없음. 단 핏레인 진입로처럼 평행 segment는 발생 가능 → 직전 프레임의 `s`와의 연속성 검사 (Δs가 트랙 길이의 30% 초과 시 직전 segment 유지) |
| 오프트랙 사고 시 path-arc가 강제로 트랙 위로 snap | 실제와 다른 위치 표시 | `\|n\| > N_OFFTRACK`이면 raw XY fallback (§5.3). 단계 5 단위 테스트에 오프트랙 케이스 포함 |
| 1랩 wrapping(결승선 통과) 시 s가 거꾸로 감소 | 마커가 트랙을 거꾸로 달림 | `s2 < s1 - 0.8 × total_length` 감지 시 wrapping path-arc 분기 (§5.3) |
| 차량별 sample timestamp 어긋남 | 보간 잘못하면 마커 점프 | 차량별 독립 PerDriverBuffer + binary search |
| 외삽(extrapolation) 유혹 | 트랙 벗어남, 정차 중 움직임 | 정책: **외삽 금지**. 미수신 시 freeze |
| 가라지 sentinel을 실주행으로 오인 | (0,0,0) 부근에 마커 떠 있음 | `\|x\|+\|y\|+\|z\| < 50` 임계로 숨김 |
| 리타이어 vs 정상 정차 구분 어려움 | 화면 혼란 | `session_result.dnf` + 정지 시간 휴리스틱 조합 |
| 백그라운드 탭 RAF 멈춤 → 복귀 시 점프 | UI 깜빡임 | displayTime 기반 자연 재개. 추가 코드 불필요 |
| 60fps 모니터에서 의도와 다른 cadence | 일관성 부족 | core는 RAF에 맡기되 인수 기준은 30fps 최소만 보장 |
| 트랙 JSON 크기 증가 | 초기 로드 지연 | 균등 리샘플 ~5m로 sample 수 제한. 압축 시 < 10KB/circuit |
| julesr0y 리포 future 변경/breaking | 빌드 깨짐 | 결과물(`trackOutlines/*.json`)을 커밋. 리모트 변경과 빌드를 분리. 픽스된 commit SHA로 fetch |
| 핏레인 추적의 횡방향 정밀도 부족 | 단일 라인으로 뭉개져 진입로/퇴출로 분기 안 보임 | MVP는 단일 polyline 허용 (시각적으로 충분). 향후 핏 입구/출구 segment를 분리 추적하는 후속 패스 (§14) |
| 섹터 경계 derive가 정확한 FIA sector 경계 아님 | 시각 표시가 실제 sector와 수 미터~수십 미터 차이 | UI에 "approximate" 라벨 표기 안 함 — 사용자가 이를 사용해 의사결정하지 않으므로 시각적 일관성으로 충분. 향후 FastF1 marshal_sectors 비교 검증 (§15) |
| DRS zone derive가 2025 Dutch GP 이후 세션에서 누락 가능 | 일부 historical 세션에서 zone이 부분만 표시 | JSON에 `coverage_note` 메타 보존. UI는 누락된 zone을 그리지 않을 뿐 에러 없음. 영향받는 세션 목록을 별도 문서화 |
| SLM zone 좌표 갱신 누락 | FIA가 세션 직전 zone 변경 시 시각 표시가 outdated | MVP는 시즌 단위 정적 입력 + 사용자 수동 hotfix 절차. 자동화는 OpenF1에 신규 필드 추가 후 검토 (§15) |
| OpenF1 X-mode 신규 필드 영영 미노출 | SLM 활성화 표시 placeholder가 영원히 빈 채로 | UI는 정적 zone만으로도 사용자에게 유의미한 정보 제공 (zone 위치 + 차량 진입 추정 가능). placeholder는 비용 거의 없음 |
| 대시보드 사이드 패널(push 모드, [dashboard-implementation.md §1.2](./dashboard-implementation.md)) 열림 시 맵 column 폭 7→6 변경 | viewport transform 재계산 + 정적 캐시 재렌더 필요, 깜빡임 가능 | `openf1_transform`은 불변, viewport transform만 갱신. 사이드 패널 슬라이드인 200ms와 맵 transition을 동기화. 정적 캐시 재렌더는 ~50ms (단계 3에서 측정) |
| trackOutlines fetch 지연 (~50~100ms) — 진입 즉시 트랙이 안 보임 | 첫 인상 빈 화면 | 다크 배경 + "트랙 로딩 중…" placeholder (§2.4). CDN 적중 시 보통 <100ms라 자연스럽게 fade-in. 미적중(첫 방문)이어도 < 1s |
| 빌드 타임 OpenF1 429 / 5xx / abuse 차단 (critic C2) — 일요일 maps step에서 핏레인 추적·affine 추출 등 다량 호출 | trackOutlines 산출 실패, 인덱스 stale | `scripts/_lib/openf1Client.ts` 공통 wrapper에 token-bucket(25 req/min) + exponential backoff + jitter. 실패 시 이전 산출물 유지 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md)) |
| trackOutlines index.json에 해당 (key, year) 없음 (신규 서킷 GitHub Actions 미실행) | 트랙 표시 불가 | UI에 "이 세션의 트랙 데이터가 아직 준비되지 않았습니다" 메시지 + 마커는 SVG viewBox 기준 좌표로만 표시 가능 시도. fallback 없으면 진입 차단 |
| 다크 모드 캔버스 배경이 OS 다크 모드와 충돌 (사용자가 라이트 OS에서 다크 앱) | 시각 위화감 없음 | 본 앱은 다크 모드 only ([§0](#0-요구-사항-요약)). prefers-color-scheme 무시 |
| 화면 폭 1280px 미만에서 마커 클릭 영역 작음 | 클릭 어려움 | Desktop only ([§13](#13-명시적으로-스코프-밖)). <1024는 안내 배너로 차단 |
| **OpenF1 CORS 정책 변경 (critic P0-4)** | 마커·트랙 렌더 정지 (LiveDataSource·ReplayDataSource fetch 실패) | main-page 진입 시 CORS ping (1 req) 선행 → 실패 시 `CorsFailedNotice` 표시 + LiveMapRenderer 마운트 보류. `LiveDataSource.start()`도 CORS 실패 mock 시 cadence interval 등록 금지 + `onCorsFailed` 콜백 발화 (단계 12 인수). 본 plan은 main-page 정책에 따름 ([main-page §13 위험표](./main-page-implementation.md)) |

---

## 12. 검증 단계

| 단계 | 방법 | 도구 |
|---|---|---|
| 단위 | 보간 함수, binary search, viewport transform | Vitest |
| 통합 | 합성 sample 픽스처로 LiveMapRenderer 1회 렌더 | Vitest + JSDOM canvas |
| 시각 회귀 | 알려진 historical 랩 데이터 → 트랙 외곽선과 마커 정합 비교 | Playwright + 픽셀 diff |
| 성능 | 20 마커 30분 렌더 시 CPU 누적, 메모리 추이 | Chrome DevTools Performance + Task Manager |
| 모드 전환 | 라이브 ↔ 리플레이 200ms 전환 검증 | Playwright |
| 라이브 stall | LiveDataSource를 mock으로 stall 시뮬레이션 → "데이터 끊김" UI 5s 이내 출현 | Playwright |
| 시크 | 리플레이에서 무작위 5개 시점 시크 → 첫 프레임 < 500ms | Playwright |

---

## 13. 명시적으로 스코프 밖

- 차트(랩 타임 그래프, 갭 차트 등) — 대시보드 계획에서 다룸
- 리더보드 — 대시보드 계획에서 다룸
- 무선 audio 재생 — `team_radio` 제외
- 텔레메트리 시각화 — `car_data` 제외
- 외부 지리 정보 (위성 이미지, 도로) — 사용 안 함
- 다른 모터스포츠 카테고리
- **모바일·태블릿 우선 UX** — Desktop only 확정 ([main-page §1.3](./main-page-implementation.md))
- **라이트 모드 / 테마 토글** — 다크 모드 only 확정
- **다중 사용자 / SNS 공유 / 임베드** — 외부 공개 시 [deployment-architecture.md §8](../../docs/deployment-architecture.md) 백엔드 도입 트리거

---

## 14. 후속 개선 항목 (MVP 이후)

- 미적 오버레이 (코너 번호, 섹터 마커, 핏레인 별도 라인)
- Catmull-Rom 보간 옵션 (사용자 환경에서 평가)
- 마커 클러스터링 (확대 시 가까운 마커 그룹)
- 줌/팬 사용자 인터랙션
- 풀스크린 모드
- 차량 클릭 시 상세 패널 토글 (대시보드와 연동)
- 트랙 외곽선 자동 재추적 (시즌 시작 시 batch)

---

## 15. 미해결 / 결정 필요 항목

(2026-05-22 추가 결정 — 사용자 확정)
- **프레임워크:** Vite + React 18
- **라우팅:** wouter
- **자산 fetch:** GitHub Actions에서 build-time HTTP fetch (julesr0y 리포의 pinned commit SHA)
- **모노레포 vs 단일:** 단일 레포 (백엔드 없음)
- **MVP 오버레이 스코프:** 메인 트랙 + 핏레인만 ([dashboard-implementation.md §0](./dashboard-implementation.md) 동기)

남은 미해결:
1. **affine transform 추출 자동화 수준** — 단계 2의 자동 추출만으로 78서킷 모두 잔차 통과할지. 통과 못 하는 서킷에 대한 보정 도구 UX (CLI 충분 가정).
2. **시즌 중 레이아웃 변경 지원 여부** — `session_key` 오버라이드는 채택 안 함으로 결정. 실제 발생 시 hotfix range 추가 절차만 명문화.
3. **트레일 기본 on/off** — 시각 노이즈와 정보량의 트레이드오프.
4. ~~모바일 지원 수준~~ — §13으로 이동 (Desktop only 확정)
5. **`n` 횡오프셋 보존 여부** — §5.3에서 보간 시 `n`도 lerp할지 0으로 normalize할지. 초기값 "보존" 채택, 시각 점검 후 재평가.
6. ~~CC-BY 푸터 표시 위치~~ — **확정 (critic M8): `src/shared/Footer.tsx` 단일 컴포넌트, App 라우터 바깥 모든 페이지 하단** ([deployment-architecture.md §6.2](../../docs/deployment-architecture.md))

후속(§14)이 부활할 때 다시 검토:
- OpenF1 X-mode 신규 필드 모니터링 (FastF1 issue #864)
- FIA SLM zone 좌표 공식 채널
- i1/i2 speed trap = sector 경계 가정의 정확도 검증 (FastF1 marshal_sectors 비교)
- DRS zone 시즌 중 변경 자동 감지

---

## 16. 참고

### 본 프로젝트 문서
- [openf1-api-reference.md](../../docs/openf1-api-reference.md) — `location` 좌표계, 단위, sentinel 동작
- [live-streaming-strategy.md](../../docs/live-streaming-strategy.md) — 라이브 30s 버퍼 정책
- [replay-strategy.md](../../docs/replay-strategy.md) — 리플레이 60s 윈도우 정책
- [deployment-architecture.md](../../docs/deployment-architecture.md) — Vercel + GitHub Actions + `public/trackOutlines/` 정적 자산 정책
- [main-page-implementation.md](./main-page-implementation.md) — 부트스트랩 (단계 0)·디자인 토큰·라우팅 동기 기준
- [dashboard-implementation.md](./dashboard-implementation.md) — 대시보드 사이드 패널과 맵 column 폭 변화

### 채택된 외부 자료
- [julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg) — 1차 맵 소스, CC-BY-4.0, 78서킷

### 참고한 외부 자료 (채택 안 함)
- [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) — MIT GeoJSON, 위경도 기반이라 affine 추출 복잡
- [f1laps/f1-track-vectors](https://github.com/f1laps/f1-track-vectors) — MIT SVG archived, 최신 시즌 미반영
- [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database) — LGPL CSV centerline+racing line, 단순화 위해 미채택

### 보간 알고리즘 참고
- [Closest Point on Line Segment — sunshine2k](https://www.sunshine2k.de/coding/java/PointOnLine/PointOnLine.html)
- [FastF1 Circuit Info (rotation)](https://docs.fastf1.dev/circuit_info.html)
- [Smooth Paths Using Catmull-Rom — Habrador](https://qroph.github.io/2018/07/30/smooth-paths-using-catmull-rom-splines.html) (미채택, 비교 자료)
- [Arc Length Parameterization — Ximera/OSU](https://ximera.osu.edu/mooculus/calculus3/motionAndPathsInSpace/digInParameterizingByArcLength)
