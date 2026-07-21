# 디자인 브리프 — 라이브/리플레이 화면 셸

> 시계·스트림 상태 배지·카운트다운·리플레이 transport를 포함하는 외곽 셸 레이아웃 · 라우트: `/live`, `/replay/:sessionKey` · 데이터: DataSource

## 1. 목적 / 컨텍스트

화면 셸(shell)은 대시보드 패널과 서킷 맵 패널을 감싸는 외곽 레이아웃이다.
셸 자체가 렌더하는 요소는 세 가지다.

1. **시계(display_time)** — `DataSource.getDisplayTime()`을 매 프레임 구독해 UTC 시각을 표시한다.
2. **스트림 상태 배지** — `DataSource.getStreamState()`를 폴링해 `live / lagging / stalled / buffering` 중 하나를 색 배지로 표시한다.
3. **리플레이 transport bar** — `/replay` 라우트에서만 표시. 재생/일시정지, 배속 선택, 시크 바.

셸은 라이브/리플레이를 구분하는 **유일한** 레이어이며, 내부 패널들은 DataSource 인터페이스만 본다.
라이브(`/live`)에서는 transport bar가 없고, 카운트다운은 세션 시작 전에만 나타난다.

---

## 2. 화면 구성 (패널 인벤토리 + 레이아웃)

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                         │
│  [logo]  [세션명: 2026 Bahrain GP — Race]   [시계: 15:34:02 UTC]   │
│                                             [스트림 배지: ● LIVE]   │
├───────────────────────────────────┬─────────────────────────────────┤
│  DASHBOARD PANEL (좌, ~60%)       │  MAP PANEL (우, ~40%)           │
│                                   │                                 │
│  ┌─────────────────────────────┐  │  ┌─────────────────────────┐   │
│  │  리더보드                   │  │  │                         │   │
│  │  타이어 / 스틴트            │  │  │    서킷 맵              │   │
│  │  랩 타임                    │  │  │    (브리프 05)          │   │
│  │  날씨 / 이벤트 티커         │  │  │                         │   │
│  └─────────────────────────────┘  │  └─────────────────────────┘   │
│                                   │                                 │
├───────────────────────────────────┴─────────────────────────────────┤
│  TRANSPORT BAR  (리플레이 전용 — /replay 라우트에서만 표시)          │
│  [◀◀ 15s] [▶ 재생 / ⏸ 일시정지] [▶▶ 15s]  [──●──────────]  [1x▾] │
│            00:14:23 / 01:52:47                   배속: 0.5/1/2/4    │
├─────────────────────────────────────────────────────────────────────┤
│  FOOTER  "Track maps © julesr0y/f1-circuits-svg (CC BY 4.0)"        │
└─────────────────────────────────────────────────────────────────────┘

--- 세션 시작 전 오버레이 (countdown) ---
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              세션 시작까지                                          │
│                 00 : 14 : 23                                        │
│          [2026 Bahrain GP — Qualifying]                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

--- CORS 실패 안내 오버레이 ---
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠  OpenF1 데이터를 불러올 수 없습니다                              │
│     브라우저 확장(uBlock 등) 또는 네트워크 정책이                   │
│     openf1.org 요청을 차단하고 있을 수 있습니다.                    │
│     [다시 시도]  [도움말]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**영역별 설명**

| 영역 | 라이브 | 리플레이 |
|---|---|---|
| Header bar | 상시 표시. 시계 실시간 진행. | 상시 표시. 시계는 playback_clock. |
| 스트림 배지 | `live/lagging/stalled/buffering` 중 하나. | `live`(정상 재생) 또는 `buffering`(시크 후 로딩). |
| Dashboard panel | DataSource 구독. | 동일. |
| Map panel | DataSource 구독. | 동일. |
| Transport bar | **미표시** | **표시**: 재생/일시정지, 시크 바, 배속, ±15s 점프. |
| Countdown overlay | 세션 시작 전(`display_time < session.date_start`) | 해당 없음(리플레이는 세션 내부 진입). |
| CORS 실패 안내 | fetch 연속 실패 시 표시 | 동일. |

---

## 3. 데이터 계약 (mock = 실제 타입)

### 3.1 DataSource.ts 실제 시그니처

```ts
// src/shared/DataSource.ts

/**
 * 현재 표시되어야 할 UTC 시각.
 * 라이브: newest_received_date − 30s
 * 리플레이: playback_clock (사용자 제어)
 */
getDisplayTime(): Date;

/**
 * 스트림 상태.
 * - 'buffering': 초기 hydration 진행 중 (워밍업)
 * - 'live'     : 정상. display_time이 newest_received_date − 30s로 진행
 * - 'lagging'  : newest_received_date가 갱신되지만 cadence가 느려짐 (≥1 cycle skip)
 * - 'stalled'  : ≥5s 신규 sample 없음. UI에 "데이터 끊김" 표시
 *
 * ReplayDataSource는 항상 'live' 또는 'buffering'.
 */
getStreamState(): StreamState; // 'live' | 'lagging' | 'stalled' | 'buffering'

/**
 * display_time 변경을 구독. RAF/throttle 이전 단계 이벤트.
 * 반환된 함수를 호출하면 구독 해제.
 */
onDisplayTimeChange(handler: (t: Date) => void): () => void;
```

### 3.2 스트림 상태 배지 색상

| StreamState | 배지 색 | 텍스트 |
|---|---|---|
| `'live'` | green (`#00D2BE` 또는 토큰 green) | LIVE |
| `'lagging'` | amber (`#FFA500` 또는 토큰 amber) | 지연 |
| `'stalled'` | red (`#E8002D` 또는 토큰 red) | 끊김 |
| `'buffering'` | gray (`tokens.surface.muted`) | 버퍼링 |

### 3.3 리플레이 transport 상태 (셸 내부 로컬 상태)

```ts
interface ReplayTransportState {
  isPlaying: boolean;
  speed: 0.5 | 1 | 2 | 4;
  currentTime: Date;       // playback_clock (DataSource.getDisplayTime()과 동기)
  sessionStart: Date;      // session.date_start
  sessionEnd: Date;        // session.date_end
}
```

시크(seek) 후 `StreamState`가 `'buffering'`으로 전환되는 동안 transport bar 시크 핸들에 로딩 인디케이터 표시.

### 3.4 드라이버 메타 (마커 라벨, 헤더 드라이버 칩 등)

```ts
interface DriverRecord {
  driver_number: number;
  name_acronym: string;
  team_colour: string;
}
```

---

## 4. 상태 / 엣지케이스

### 4.1 스트림 상태 배지

| `StreamState` | UX |
|---|---|
| `'buffering'` | 배지: 회색 "버퍼링". 라이브: "버퍼 채우는 중 (~30s)". 리플레이: 시크 후 "로딩 중". 시계는 멈춤 또는 느리게 진행. |
| `'live'` | 배지: 초록 "LIVE". 시계 정상 진행. |
| `'lagging'` | 배지: 황색 "지연". 시계 정상 진행 (버퍼가 얕아지지만 표시는 계속). 작은 경고 아이콘 병기. |
| `'stalled'` | 배지: 빨강 "끊김". 시계 일시정지 또는 매우 느리게. 패널 위 "데이터 수신 중단" 배너 표시. |

### 4.2 세션 시작 전 카운트다운 (라이브 전용)

- 조건: `display_time < session.date_start` (세션 메타 로드 후 판정)
- 표시: 화면 중앙 fullscreen-ish overlay. `session.date_start − display_time`을 `HH:MM:SS` 형식으로 카운트다운.
- 카운트다운 종료(= 0 도달) 시 overlay 자동 사라짐 → 대시보드+맵 패널 표시 전환.
- `session.date_start` 정보 없으면(아직 로딩 중) overlay 미표시, spinner 표시.

### 4.3 리플레이 transport

| 동작 | 처리 |
|---|---|
| 재생/일시정지 | `isPlaying` toggle. 일시정지 시 시계 정지. |
| 시크(seek) | 시크 바 드래그 또는 ±15s 점프. `playback_clock` 즉시 업데이트. 새 위치 윈도우 캐시 미스 시 `StreamState → 'buffering'`, 약 200~500ms 후 재개. |
| 배속 변경 | `speed` 변경 → 룩어헤드 버퍼 자동 재계산 (`60s × speed`). |
| 세션 끝 도달 | 재생 자동 일시정지. transport bar 끝 위치에 고정. "세션 종료" 텍스트 표시. |
| 세션 시작 이전 시크 | `session.date_start` 이전으로 시크 불가 — 시크 바 시작점 잠금. |

### 4.4 라이브 vs 리플레이 transport 차이

| 항목 | 라이브 | 리플레이 |
|---|---|---|
| Transport bar | 미표시 | 표시 (재생·시크·배속) |
| 시계 원천 | `newest_received_date − 30s` (데이터가 끌고 감) | `playback_clock` (사용자가 끌고 감) |
| 끊김 시 | `stalled` 배지 + 시계 느리게 진행 | `buffering` 배지 + 시계 정지 |
| 배속 선택 | 불가 (항상 실시간) | 0.5 / 1 / 2 / 4 |
| 시크 | 불가 | 가능 (세션 범위 내) |

### 4.5 CORS 실패 안내

- 조건: OpenF1 API fetch가 CORS 오류(또는 net::ERR_BLOCKED) 연속 실패 시
- 표시: 화면 하단 또는 중앙 오버레이. 브라우저 확장(uBlock 등) 또는 네트워크 정책 차단 가능성 안내.
- 버튼: [다시 시도] (재hydration 트리거), [도움말] (CORS 우회 방법 안내 링크)
- 일반 네트워크 오류(`stalled`)와 구분: CORS는 재시도 자동화가 불가능해 사용자 조치가 필요함을 명시.

### 4.6 1024px 미만 화면

- 안내 배너: "이 화면은 데스크톱(1280px 이상)에 최적화되어 있습니다."
- 패널은 그대로 표시하되 레이아웃 보장 없음 (MVP 스코프 밖).

---

## 5. 비주얼 방향

**전체**
- 다크 모드 only. 디자인 토큰: `src/style/tokens.ts`.
- Desktop only(1280px+).

**Header bar**
- 배경: `tokens.bg.secondary` 또는 투명 (맵 패널 위를 커버하지 않도록)
- 시계: 고정폭 폰트(monospace), `tokens.text.primary`. 형식: `15:34:02 UTC`
- 스트림 배지: 작은 pill 형태. 색은 §3.2 표 참조. 펄싱 애니메이션은 `live` 상태에서만 (pulse 0.5s ease-in-out, 과하지 않게).

**Transport bar (리플레이)**
- 배경: `tokens.bg.secondary`, 상단 1px border `tokens.border.subtle`
- 시크 바: 전체 세션 범위를 표시. 현재 위치 핸들, 버퍼된 구간 살짝 밝게 표시.
- 시간 표시: `00:14:23 / 01:52:47` (경과 / 세션 길이), 고정폭 폰트
- 배속 버튼: `0.5x / 1x / 2x / 4x`, 현재 배속 강조

**카운트다운 overlay**
- 반투명 다크 배경 위 대형 숫자. `tokens.text.primary`, 모노스페이스.

---

## 6. Claude design 프롬프트 스니펫

```
지금은 화면 디자인(와이어프레임/컴포넌트 구조)만 작업한다. 구현 코드는 작성하지 않는다.

[라이브/리플레이 화면 셸 디자인]

목적:
- 대시보드 패널 + 서킷 맵 패널을 감싸는 외곽 레이아웃 셸이다.
- 셸이 직접 렌더하는 요소: 시계, 스트림 상태 배지, 세션 카운트다운, 리플레이 transport bar.
- 셸은 /live와 /replay 두 라우트를 커버하며, 내부 패널들은 DataSource 인터페이스만 본다.

데이터 계약 (mock 데이터가 실제 타입과 동일해야 함):

// 시계 (라이브: newest_received_date − 30s / 리플레이: playback_clock)
getDisplayTime(): Date

// 스트림 상태
type StreamState = 'live' | 'lagging' | 'stalled' | 'buffering'
getStreamState(): StreamState
// 배지 색: live=green, lagging=amber, stalled=red, buffering=gray

// 구독
onDisplayTimeChange(handler: (t: Date) => void): () => void

// 리플레이 transport 로컬 상태
interface ReplayTransportState {
  isPlaying: boolean;
  speed: 0.5 | 1 | 2 | 4;
  currentTime: Date;
  sessionStart: Date;
  sessionEnd: Date;
}

// 드라이버 메타
interface DriverRecord { driver_number: number; name_acronym: string; team_colour: string; }

엣지케이스 처리:
- StreamState === 'buffering' → 시계 멈춤/느리게, 배지 회색 "버퍼링"
- StreamState === 'stalled' → 빨강 배지 + "데이터 수신 중단" 배너
- StreamState === 'lagging' → 황색 배지 + 경고 아이콘
- 세션 시작 전(라이브) → 카운트다운 overlay (HH:MM:SS)
- 리플레이 시크 후 → StreamState 'buffering', 시크 핸들에 로딩 인디케이터
- CORS 실패 → 안내 오버레이: 브라우저 확장 차단 가능성 + [다시 시도] 버튼

레이아웃:
- Desktop only (1280px+), 다크 모드 only
- Header: 로고 / 세션명 / 시계 / 스트림 배지
- 본문: 대시보드 패널(좌 ~60%) + 서킷 맵 패널(우 ~40%) 2열
- Transport bar: /replay에서만 표시, 하단 고정 — 재생/일시정지, ±15s 점프, 시크 바, 배속(0.5/1/2/4)
- 라이브에서는 transport bar 미표시

비주얼 방향:
- 다크 모드 only, 토큰: src/style/tokens.ts
- 시계: 고정폭 폰트, UTC 표기
- 스트림 배지: pill 형태, live 상태에서만 pulse 애니메이션
- 시크 바: 세션 전체 범위 표시, 버퍼된 구간 밝게 표시
```
