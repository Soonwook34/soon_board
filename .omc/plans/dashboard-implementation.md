# 대시보드 구현 계획 (pending approval)

> 작성일: 2026-05-20 · 최종 수정: 2026-05-22 · 상태: **pending approval**
> 전제: [openf1-api-reference.md](../../docs/openf1-api-reference.md) (엔드포인트 사실), [live-streaming-strategy.md](../../docs/live-streaming-strategy.md) (라이브 30s 버퍼, 브라우저 폴러), [replay-strategy.md](../../docs/replay-strategy.md) (재생 60s 윈도우, 메모리 캐시), [live-map-implementation.md](./live-map-implementation.md) (맵 + DataSource 추상), [deployment-architecture.md](../../docs/deployment-architecture.md). 본 계획은 그 위에 올라가는 **대시보드 패널 구성과 시간 정렬**의 구현 전략이다.
>
> **호스팅·MVP 컨텍스트 (2026-05-22 확정):** GitHub + Vercel 정적 호스팅 + 개인 사용(동접 1명). DataSource는 **브라우저에서 OpenF1 REST를 직접 폴**. 프레임워크 **Vite + React 18**, 라우팅 **wouter** 확정.
>
> **UI 컨텍스트 동기 ([main-page §0](./main-page-implementation.md) · [live-map §0](./live-map-implementation.md) 일치):** **Desktop only (1280px+)** — 1024 미만은 안내 배너. **다크 모드 only** — 디자인 토큰은 `src/style/tokens.ts` (전 plan 공유). **`raceDistance.json`은 `public/` + fetch** + GitHub Actions 일일 cron으로 자동 갱신.

---

## 0. 한눈에 보는 사양

| 항목 | 값 |
|---|---|
| 타깃 디바이스 (사용자 결정) | **Desktop 우선 한 페이지** |
| 디테일 트리거 (사용자 결정) | **클릭만** (마커 또는 리더보드 행) |
| 디테일 패널 형태 (사용자 결정) | **우측 sticky 사이드 패널** |
| 글로벌 패널 (사용자 결정, 기본 + 추가 4종) | 맵 / 리더보드 / 세션 헤더 / 날씨 / Race Control latest / **타이어 전략** / **이벤트 티커** / **빠른 랩 배지** / **세션 진행률 바** |
| 시간 정렬 원칙 | 모든 패널이 `display_time` 기준 (라이브 30s 지연, 재생 사용자 제어) |
| 제외 항목 | `car_data` 텔레메트리, `team_radio` |
| 데이터 소스 추상 | `DataSource` 인터페이스 (라이브맵 §3과 공유) |
| 컴포넌트 통신 | 시간 변화 → 리액티브 재평가 (각 패널이 `display_time` slice 구독) |

---

## 1. 화면 레이아웃 (Desktop 한 페이지)

### 1.1 기본 형태 (사이드 패널 닫힘)

사용자 결정에 따라 **좌/우 분리 + 상단/하단 글로벌 띠 (Hybrid B)** 채택.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ① 세션 헤더 (트랙 · 세션 · 연도 · gmt · live/replay 시계 · ⓘ)            │
├────────────────────────────────────────────┬─────────────────────────────┤
│ ② 세션 진행률 바 (lap N/M 또는 시간 진행)   │ ④ Race Control latest 배너 │
├────────────────────────────────────────────┴─────────────────────────────┤
│                                       │ ⑤ 리더보드 (20행)                │
│                                       │ ┌─────────────────────────────┐ │
│                                       │ │ P# DRV INT LAST TYR 표지   │ │
│                                       │ │ 1  VER  -  1:31.4 M18 ⓕⓟ  │ │
│                                       │ │ 2  HAM +1.2 1:31.7 S5  ⓟ   │ │
│                                       │ │ ... 20 rows                │ │
│      ③ 라이브 맵                       │ └─────────────────────────────┘ │
│      (live-map-implementation.md)      │ ⑥ 타이어 전략 시각화             │
│                                       │ ┌─────────────────────────────┐ │
│                                       │ │ VER ▰▰▰ M ▰▰▰▰ H ▰▰ S      │ │
│                                       │ │ HAM ▰▰▰▰ S ▰▰ M ▰▰▰▰ H     │ │
│                                       │ └─────────────────────────────┘ │
│                                       │ ⑦ 이벤트 티커 (최근 5건)         │
│                                       │ ┌─────────────────────────────┐ │
│                                       │ │ 🚩 YELLOW SECTOR 4 · L12    │ │
│                                       │ │ 🚨 SAFETY CAR DEPLOYED · L9 │ │
│                                       │ │ ... 5 entries                │ │
│                                       │ └─────────────────────────────┘ │
├───────────────────────────────────────┴─────────────────────────────────┤
│ ⑧ 빠른 랩 배지 (4 cards 가로)  +  ⑨ 날씨 미니                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 사이드 패널 열림 (Push 모드, 사용자 결정)

선수 클릭 시 **우측에 새 column이 추가**되어 페이지 내부 column이 재분배됨. 맵 폭은 약간 줄지만 여전히 좌측에서 보이고, 우측 글로벌 패널도 좁아진 폭으로 유지됨.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ① 세션 헤더                                                                    │
├────────────────────────────────────────────┬───────────────────────────────────┤
│ ② 진행률 바                                 │ ④ Race Control 배너               │
├──────────────────────────┬─────────────────┴─────────────┬─────────────────────┤
│                          │ ⑤ 리더보드 (좁게)              │ ⑩ 선수 디테일 패널   │
│                          │   (LAST 칼럼 숨김 등 적응)     │ ┌──────────────────┐│
│                          │                              │ │ 헤드샷·이름·번호 ││
│   ③ 라이브 맵            │                              │ │ 팀 컬러 칩       ││
│   (폭 조금 줄어듦)        │                              │ ├──────────────────┤│
│                          │ ⑥ 타이어 전략                  │ │ 현재 상태        ││
│                          │                              │ │ (P/lap/갭/타이어)││
│                          │ ⑦ 이벤트 티커                  │ ├──────────────────┤│
│                          │                              │ │ 최근 5랩 테이블  ││
│                          │                              │ │ 핏 히스토리      ││
│                          │                              │ │ 스틴트 히스토리  ││
│                          │                              │ │ (세션 종료 후    ││
│                          │                              │ │  결과 섹션)      ││
├──────────────────────────┴───────────────────────────────┴─────────────────────┤
│ ⑧ 빠른 랩 배지                                + ⑨ 날씨 미니                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 그리드 결정

| 상태 | 맵 | 글로벌 우측 | 사이드 패널 | 비고 |
|---|---|---|---|---|
| 사이드 패널 닫힘 | 7 col | 5 col | 0 col | 12-col CSS Grid |
| 사이드 패널 열림 | 6 col | 3 col | 3 col | 우측 글로벌 패널 적응형 압축 |

- Desktop minimum **1280×800**. 1920×1080 기준 디자인.
- 사이드 패널 폭 목표: **~360px** (열림 시).
- 상단 띠: ① 세션 헤더는 항상 전체 폭. ② 진행률 바 + ④ Race Control 배너는 같은 행을 좌(7/12)·우(5/12)로 나눠 사용 (Race Control이 우측에 있으면 시선이 맵→우측 패널 흐름에 자연스럽게 끼어듦).
- 하단 띠: ⑧ 빠른 랩 배지 (좌측 8/12) + ⑨ 날씨 미니 (우측 4/12). 전체 폭.
- 우측 글로벌 column은 세로 스크롤 가능 (정보 양 확장 자유).

### 1.4 사이드 패널 열림 시 우측 패널 적응

폭이 5 col → 3 col 로 줄어들면 일부 칼럼/시각이 압축됨:
- 리더보드: `LAST` 또는 `Gap to leader` 칼럼 숨김 (사용자 옵션). 핵심은 P# · DRV · INT · TYR 유지.
- 타이어 전략: 막대 두께 그대로, 좌우 여백 줄임. 정보 손실 없음.
- 이벤트 티커: 메시지 텍스트 wrapping. 5건 유지.

### 1.5 좁은 화면 fallback (Desktop only)

본 MVP는 Desktop only (1280px+) 가정 ([main-page §1.3](./main-page-implementation.md) 동기). 그 미만 처리:

- **1280px 미만:** 사이드 패널은 자동으로 닫힘 (push 모드 폭 부족). 다시 열려고 하면 토스트 "1280px 이상에서 사이드 패널을 사용하세요".
- **1024px 미만:** 메인 페이지의 `NarrowScreenBanner`가 먼저 표시되어 대시보드 진입 자체를 차단 (정상 동작). 직접 URL 진입한 경우엔 핵심(맵 + 리더보드)만 표시 + 안내 배너.

---

## 2. 글로벌 패널 — 항목별 데이터/주기/시간정렬 매트릭스

각 패널은 `DataSource`에 구독되며 `display_time`이 변할 때마다 재평가된다. **"라이브 cadence"는 데이터가 새로 들어오는 주기**이고, **"패널 재평가 주기"는 UI가 다시 그려지는 주기**다 — 둘이 다를 수 있음 (예: weather는 1/min 갱신, UI는 매 프레임 같은 값 표시).

### 2.1 ① 세션 헤더

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 트랙명 + 국가 플래그 | `meetings` (정적) | N/A | 세션 1회 |
| 세션명 + 타입 | `sessions` (정적) | N/A | 세션 1회 |
| 현지 시간 (gmt_offset 적용) | `sessions.gmt_offset` | wall clock + offset | 1s |
| 모드 인디케이터 ("LIVE -30s" / "REPLAY 1.5x" / 일시정지) | `DataSource.getStreamState()` | display_time 자체 | 매 프레임 |
| 데이터 끊김 배지 | DataSource state | display_time 정체 감지 | 1s |
| CC-BY-4.0 attribution (작은 ⓘ → 호버 시 라이선스) | 정적 | N/A | 정적 |

### 2.2 ② 세션 진행률 바

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 현재 lap / 총 lap (Race/Sprint) | `laps` (현재 진행 lap) + 서킷 총 랩 수 룩업 | display_time 기준 leader의 현재 lap | 랩 시작마다 |
| 경과 시간 / 총 시간 (Practice/Qualifying) | `sessions.date_start`/`date_end` | display_time − date_start | 매 프레임 |
| 적기/세이프티카 구간 (배경 색 segment) | `race_control` `RED`/`SafetyCar` 메시지 | display_time ≤ date 인 모든 활성 구간 | 이벤트 시 |

**총 lap 수 문제:** OpenF1은 "예정된 race distance" 필드 없음 (참고: [openf1-api-reference.md §11](../../docs/openf1-api-reference.md)의 알려진 함정). 해결: **GitHub Actions 일일 cron이 종료된 PAST race 세션의 `laps` 최대 `lap_number`로 자동 계산**해 `public/raceDistance.json` 으로 commit. `(circuit_key, year) → total_laps` 매핑.

```json
{
  "generated_at": "2026-05-22T01:00:00Z",
  "method": "max(laps.lap_number) of completed race sessions",
  "entries": [
    { "circuit_key": 63, "year": 2024, "total_laps": 57 },
    { "circuit_key": 30, "year": 2024, "total_laps": 58 }
  ]
}
```

**진행 중·예정 race 처리:** 종료 안 된 세션은 entries에 없음 → UI는 "L?? / ??" 표시. 세션 종료 후 다음 daily cron에서 자동 추가. 진행 중 표시가 필요하면 같은 서킷의 직전 시즌 값을 fallback으로 사용 (옵션, §13 미해결로 두지 않고 fallback 정책으로 결정).

**런타임 사용:** 페이지 진입 시 `fetch('/raceDistance.json')` 1회 (~5KB) → in-memory Map 캐시.

### 2.3 ③ 라이브 맵
[live-map-implementation.md](./live-map-implementation.md) 참조. 본 대시보드는 맵 인스턴스를 임베드만 함.

### 2.4 ④ Race Control latest 배너

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 현재 활성 메시지 1건 (예: "YELLOW SECTOR 4", "SAFETY CAR", "CHEQUERED") | `race_control` | `date ≤ display_time` 인 가장 최근 메시지 중 still-active 인 것 | display_time 변화 시 |
| 종료된 메시지 (CLEAR 등) 후 N초간 잔상 표시 | 동일 | 동일 + 만료 시각 비교 | display_time 변화 시 |

**Still-active 판정 휴리스틱:**
- `flag == "CHEQUERED"` → 세션 종료까지 유지
- `flag == "GREEN"` 또는 `flag == "CLEAR"` → 5초 표시 후 사라짐
- `flag == "RED"` → 다음 GREEN/CHEQUERED까지 유지
- `flag == "YELLOW"` / `"DOUBLE YELLOW"` → 다음 GREEN/CLEAR까지
- SafetyCar 카테고리 → 메시지 텍스트 파싱으로 종료 판정 (예: "SAFETY CAR IN THIS LAP")

### 2.5 ⑤ 리더보드 (20행)

매 행마다 `display_time` 기준 정렬된 데이터:

| 칼럼 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 포지션 | `position` | latest with `date ≤ display_time` | 이벤트 |
| 드라이버 (acronym + 팀 컬러 칩) | `drivers` (정적) | N/A | 세션 1회 |
| 인터벌 (앞차) | `intervals` | latest with `date ≤ display_time` | ~4s (라이브), 재생은 historical 한정 |
| Gap to leader | `intervals.gap_to_leader` | 동일 | 동일 |
| 마지막 lap 시간 | `laps` | `date_start ≤ display_time` 인 가장 최근 완료된 lap | 랩 종료 시 |
| **마지막 lap 섹터 바** (LAST 아래 가는 2px 높이, 3등분 고정) | `laps.duration_sector_1/2/3` (직전 완료 lap) | 직전 완료 lap | 랩 종료 시 |
| 현재 타이어 (compound + age) | `stints` (현재 lap이 포함된 stint) + 현재 lap | 현재 lap = leader의 lap | 랩 시작 시 |
| 표지: 핏 진행 중 (ⓟ) | `pit` (`date ≤ display_time` 직전 핏 진입 + lane_duration 윈도우 내) | 시간 윈도우 비교 | 1s |
| 표지: 핀스톱 후 N랩 동안 노란 점 | derived | display_time 기반 | 랩 변화 시 |
| 표지: 빠른 랩 (ⓕ) | derived: 본인 최고 랩 = 전체 최고? | display_time 기준 누적 통계 | 랩 변화 시 |
| 표지: 리타이어 (✕) | `session_result.dnf == true` | session_result 게이트 | 세션 종료 시 |

**라이브 cadence와 cadence 안정성:**
- `position`은 이벤트 기반이라 라이브에서 자주 갱신. 재생에서는 60s 윈도우당 fetch.
- `intervals`은 라이브에서는 4s 갱신, **재생에서는 historical 보존이 비신뢰** (replay-strategy §1.2의 "intervals: live only" 주의). 재생에서는 `laps`+`position`으로 갭을 derive하거나 "데이터 없음" 표기.
- `laps`는 랩 완료 후 추가 → **섹터 시간 + 섹터 바도 랩이 닫혀야 산출됨**. 라이브/재생 차이 없음 (둘 다 `laps.duration_sector_*` 동일 필드 사용).

**섹터 바 시각 사양 (F1 방송 표준):**
- 위치: LAST 시간 텍스트 바로 아래 2px 높이 가로 바, S1|S2|S3 각각 정확히 1/3 폭 (시간 비율 미반영).
- 색 의미 (`shared/sectorColors.ts`에서 단일 정의):
  - **보라 `#A855F7`** — 그 섹터의 세션 전체 최고 (overall best)
  - **초록 `#10B981`** — 그 드라이버의 본인 최고 (personal best) 단, overall best는 아님
  - **노랑 `#F59E0B`** — 그 외 (본인 베스트보다 느림)
  - **회색 `#374151`** — 미주행/데이터 없음 (현재 랩 진행 중 미통과 섹터 또는 `duration_sector_n == null`)
- 누적 산정: `derived/personalBests.ts` 가 `display_time` 시점까지의 누적으로 산출 → 시크해도 일관 (인수 8번과 동일 정책).
- 데이터 누락 처리: `laps.duration_sector_n`이 null이면 (아웃랩/인랩) 해당 섹터만 회색.

**클릭 시:** 사이드 패널 (⑩) 열림. 마커 클릭과 동일 동작.

### 2.6 ⑥ 타이어 전략 시각화 (사용자 결정 패널)

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 드라이버별 스틴트 막대 (가로축 = lap 1 ~ 현재 lap, 색 = compound) | `stints` (모든 records with `lap_end ≤ current_lap`) | `current_lap = display_time 기준 leader의 lap` | 스틴트 변경 시 |
| 현재 lap 위치를 세로 라인으로 표시 | derived | display_time 기반 | 매 프레임 |
| 핏스톱 표시 (스틴트 경계에 점) | `pit` | `date ≤ display_time` | 핏 시 |

**컴파운드 색상:** SOFT=빨강, MEDIUM=노랑, HARD=흰색/회색, INTERMEDIATE=초록, WET=파랑 (F1 표준).

**Issue #89 함정 (openf1-api-reference §11):** `stint_end`/`stint_start`가 같은 lap에 중복 표시되어 +1 오차 가능. 막대 길이 계산 시 `[lap_start, lap_end)` 반-개구간으로 합산해 중복 카운트 방지.

### 2.7 ⑦ 이벤트 티커 (사용자 결정 패널)

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 최근 5건 race control 메시지 | `race_control` | `date ≤ display_time` 인 마지막 5건, 최신이 위 | 이벤트 시 |
| 새 메시지 도착 시 슬라이드인 애니메이션 | 동일 | display_time 진행에 따라 | 매 프레임 비교 |
| 메시지 카테고리별 아이콘 (🚩 Flag / 🚨 SafetyCar / 🔵 DRS / 📋 Other) | derived | N/A | 정적 |

**페이드 정책:** 새 메시지가 위에 추가되면 가장 오래된 메시지는 fade out. display_time이 거꾸로 가면(시크) 티커도 시점에 맞게 재구성.

### 2.8 ⑧ 빠른 랩 / 보라색 섹터 배지 (사용자 결정 패널)

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 세션 최고 랩 (드라이버 + 시간) | `laps` | `min(lap_duration WHERE date_start ≤ display_time AND lap_duration NOT NULL)` | 랩 변화 시 |
| 섹터 1 최고 (드라이버 + 시간, 보라색) | `laps.duration_sector_1` | `min(... WHERE date_start ≤ display_time)` | 랩 변화 시 |
| 섹터 2 최고 / 섹터 3 최고 | 동일 | 동일 | 랩 변화 시 |
| 최고 스피드 트랩 (`st_speed`) | `laps.st_speed` | `max(... WHERE date_start ≤ display_time)` | 랩 변화 시 |

**시각:** 4개의 작은 카드 가로 배치. 각각 드라이버 색칩 + 숫자.

**시크 시 일관성:** display_time이 과거로 갈 때 그 시점까지의 누적 최고 기록만 표시 (미래 기록이 "이미 알려진" 것처럼 표시되면 안 됨).

### 2.9 ⑨ 날씨 미니 패널

| 표시 항목 | API | 시간 정렬 | 갱신 주기 |
|---|---|---|---|
| 기온 (°C) | `weather.air_temperature` | latest with `date ≤ display_time` | ~1/min |
| 노면 온도 (°C) | `weather.track_temperature` | 동일 | ~1/min |
| 강수 (아이콘) | `weather.rainfall` (0/1) | 동일 | ~1/min |
| 풍속 + 풍향 | `weather.wind_speed`/`wind_direction` | 동일 | ~1/min |

**강수 강도 없음 (openf1-api-reference §8.13 binary):** 0/1만 표시. UI에 "강수 강도 정보 없음" 안내 안 함 (단순 아이콘만).

---

## 3. ⑩ 우측 sticky 사이드 패널 — 선수 디테일

리더보드 행 또는 맵 마커 클릭으로 열림. 다시 클릭 또는 X로 닫힘. 한 번에 1명만.

### 3.1 헤더 영역 (정적)

| 항목 | API | 비고 |
|---|---|---|
| 헤드샷 사진 | `drivers.headshot_url` | F1 CDN, 인증 불필요 |
| 풀 네임 (`broadcast_name` 또는 `full_name`) | `drivers` | — |
| 드라이버 번호 (큰 숫자) + 팀 컬러 칩 | `drivers.driver_number`, `team_colour` | — |
| 팀 이름 | `drivers.team_name` | — |
| 국가 코드 (작은 플래그) | `drivers.country_code` | — |

### 3.2 현재 상태 섹션

| 항목 | API | 시간 정렬 | 주기 |
|---|---|---|---|
| 현재 포지션 (P3) | `position` | latest ≤ display_time | 이벤트 |
| 현재 lap 수 | `laps` | 본인의 `date_start ≤ display_time` 인 가장 최근 lap | 랩 |
| 앞차와 갭 / 리더와 갭 | `intervals` | latest ≤ display_time | ~4s (라이브) |
| 현재 타이어 + age | `stints` (포함 lap 기준) | 현재 본인 lap | 랩 |
| **Last Lap** 시간 (큰 숫자) | `laps.lap_duration` (직전 완료 lap) | 동일 | 랩 |
| **Last Lap 섹터 바** (LAST 행 아래 2px, 3등분) + S1/S2/S3 시간 텍스트 (바 우측 또는 하단) | `laps.duration_sector_1/2/3` (직전 완료 lap) | 동일 | 랩 |
| **In Progress** 행 (별도 추가, 본인이 현재 주행 중일 때만 표시) | derived: 본인의 `lap_number = current_lap` 인 record | 본인 현재 lap | 섹터 통과 시 |
| In Progress 섹터 바 (2px, 3등분) + 통과 섹터 시간 텍스트 | `laps.duration_sector_*` (현재 lap의 부분 sector durations) | 통과한 섹터만 색상 적용, 미통과 섹터는 회색 (`#374151`) | 섹터 통과 시 |

### 3.3 최근 랩 5개 (테이블)

| 컬럼 | API | 비고 |
|---|---|---|
| Lap # | `laps.lap_number` | — |
| 총 시간 | `laps.lap_duration` | null 가능 (아웃랩 등) |
| S1 / S2 / S3 | `laps.duration_sector_1/2/3` | F1 방송 표준 색 (§2.5 참조): 보라(overall best) / 초록(personal best) / 노랑(그 외) / 회색(null) |
| Speed Trap | `laps.st_speed` | — |

`date_start ≤ display_time` 인 마지막 5 lap. 색 판정은 `shared/sectorColors.ts`에서 단일 정의 (글로벌 패널 ⑧, 리더보드 섹터 바, 현재 상태 섹터 바와 동일 함수 사용).

### 3.4 핏 히스토리

| 항목 | API | 시간 정렬 |
|---|---|---|
| 핏 진입 lap + 박스 머문 시간(`stop_duration`, null 가능) + 레인 시간(`lane_duration`) | `pit` | `date ≤ display_time` 인 모든 records (`getAllBefore('pit', display_time)`) |
| 표시 형식 | "Lap 18 · 24.6s lane (2.3s box)" 형태로 한 줄씩 | — |

`stop_duration` 이 2024 US GP 이전엔 null인 경우 많음 (openf1-api-reference §11) → null은 "—" 표시.

**미래 누설 방지 (필수):** `pit.date` 가 핏 진입 시각이므로 `getAllBefore('pit', display_time)` 의 결과만 표시. **버퍼/캐시에 이미 도착해 있는 미래 record 도 절대 표시하지 않는다.** (라이브 30s 버퍼 또는 재생 60s 윈도우의 데이터가 display_time 보다 앞서 있을 수 있음 — DataSource 내부 인덱스가 빠르더라도 표시단에서 `date ≤ display_time` 컷이 마지막 게이트). 동일 원칙이 §3.3 5랩, §3.5 스틴트, §2.7 이벤트 티커, §2.5 리더보드의 `LAST` 칼럼에도 적용된다. (§4.5 신설 참조)

### 3.5 스틴트 히스토리

| 항목 | API | 시간 정렬 |
|---|---|---|
| 스틴트 번호 / 컴파운드 / lap_start ~ lap_end / 시작 시 tyre age | `stints` | `lap_end ≤ current_lap` 인 모든 |
| 현재 진행 중인 스틴트는 "진행 중" 표기 + lap_end = current_lap | derived | — |

### 3.6 세션 결과 (세션 종료 후만)

| 항목 | API | 게이트 |
|---|---|---|
| 최종 포지션 / 포인트 | `session_result.position`, `points` | `session_result` available |
| DNF / DNS / DSQ 표지 | `session_result.dnf/dns/dsq` | 동일 |
| 총 lap, 총 시간 또는 리더 갭 | `session_result.number_of_laps`, `duration`, `gap_to_leader` | 동일 |
| Qualifying은 Q1/Q2/Q3 배열 표시 | `session_result.duration` (배열) | 세션 타입 |

라이브 중에는 이 섹션 숨김. 세션 종료 후 display_time이 종료 시각을 넘으면 나타남.

### 3.7 사이드 패널 동작 규칙

- 닫기: 다시 클릭, X 버튼, ESC 키
- 다른 드라이버 클릭 시: 같은 패널이 새 내용으로 슬라이드 트랜지션 (다시 안 열고 안 닫음)
- 패널이 열린 동안 맵 마커의 해당 드라이버에 selected 표시 (외부 노란 링 1px — `tokens.accent.warning` 등)
- 모드 전환(라이브↔리플레이)되면 닫기 (패널 데이터는 display_time에 의존하므로 모드 전환 시 의미가 달라질 수 있음)
- **1280px 미만으로 viewport 축소 감지 시 자동 닫힘** (`window.resize` 이벤트 + 토스트 안내)

---

## 4. 시간 정렬 모델 (핵심 원칙)

### 4.1 단일 진실 원천: `display_time`

모든 패널은 **자체 시계가 아니라** 공유된 `display_time` 값을 구독한다. 이 값의 정의는 [live-map-implementation.md §6](./live-map-implementation.md):
- 라이브: `display_time = newest_received_date - 30s`
- 재생: `display_time = playback_clock` (사용자 제어)

### 4.2 데이터 쿼리 패턴 (DataSource SSOT)

> **단일 진실 원천 (critic M1):** `DataSource` 인터페이스는 [live-map §3.1](./live-map-implementation.md) 에 단일 정의되며 위치는 `src/shared/DataSource.ts`. 본 plan은 그 정의에서 import해 사용하고, 별도 확장하지 않음. 아래는 대시보드 패널이 사용하는 6개 메서드만 발췌 (전체 정의는 live-map §3.1 참고).

```ts
// src/shared/DataSource.ts 에서 import — 발췌
interface DataSource {
  // ── 대시보드 패널 전용 메서드 (live-map §3.1 의 SSOT 정의 일부) ──
  getLatestBefore<E>(endpoint: E, t: Date, filters?: object): Record<E> | null;
  getAllBefore<E>(endpoint: E, t: Date, filters?: object, limit?: number): Record<E>[];
  getLapAt(driverNum: number, t: Date): LapRecord | null;
  getCompletedLapsBefore(driverNum: number, t: Date, limit?: number): LapRecord[];
  getStintForLap(driverNum: number, lap: number): StintRecord | null;
  getAggregateBefore<A>(aggregate: A, t: Date): AggregateResult<A>;
}
```

구현체:
- 라이브: 내부 버퍼에 데이터가 도착하는 대로 인덱스 갱신, 쿼리는 O(log n)
- 재생: 윈도우 단위 캐시, t를 포함하는 윈도우가 로드되어 있으면 즉시 O(log n)

### 4.3 패널의 리액티브 구독

```ts
// 각 패널이 자체적으로 구독
class LeaderboardPanel {
  constructor(private ds: DataSource) {
    ds.onDisplayTimeChange((t) => this.render(t));
  }
  render(t: Date) {
    const positions = this.ds.getAllBefore('position', t, {}, 20);
    // ...
  }
}
```

**갱신 throttle:** `display_time`은 매 프레임 변할 수 있으나 패널 갱신은 그렇게 자주 필요 없음. 패널별 갱신 주기:

| 패널 | 재평가 주기 | 이유 |
|---|---|---|
| 세션 헤더 | 1s | 시계 표시용 |
| 진행률 바 | 1s | 시계 표시용 |
| 맵 | 30 fps | 마커 보간 (live-map 별도 처리) |
| Race Control latest | 250ms | 메시지 변화 감지 |
| 리더보드 | 500ms | 갭/순위 변화 |
| 타이어 전략 | 1s | 스틴트 경계는 드물게 변화 |
| 이벤트 티커 | 500ms | 메시지 도착 감지 |
| 빠른 랩 배지 | 1s | 랩 완료 단위 |
| 날씨 미니 | 5s | 업스트림 1/min |
| 사이드 패널 (디테일) | 500ms | 사용자 주시 중 |

**메커니즘:** `display_time` 자체는 RAF로 갱신되지만, 각 패널이 자체 setInterval 또는 throttled debouncing으로 재평가.

### 4.4 시크 / 모드 전환 시 일관성

- 사용자가 재생에서 시크 → `display_time` 점프 → 모든 패널이 동시에 새 t로 재평가됨 (단일 진실 원천 덕분에 자동 일관성)
- 라이브 → 재생 전환 시: 모든 패널 동일 시점에 한 번 재평가됨
- 시크 후 누적 통계 (빠른 랩 등) 도 t까지의 데이터로 다시 산출 → 미래 기록이 표시되는 일관성 깨짐 방지

### 4.5 미래 누설 zero (Future Leak Prevention)

대시보드의 모든 패널은 **`display_time` 시점에 "이미 발생한" 정보만 표시한다.** 미래 데이터가 버퍼/캐시에 이미 적재되어 있어도 표시단에서 컷한다. 자주 발생하는 누설 케이스와 방어:

| 패널 / 항목 | 누설 발생 원인 | 방어 |
|---|---|---|
| **§3.4 핏 히스토리** | `pit.date` 미래 record 가 라이브 30s 버퍼 또는 재생 60s 윈도우에 적재되어 그대로 렌더 | `getAllBefore('pit', display_time)` 강제, 컴포넌트 단에서 `.filter(r => r.date <= display_time)` 재확인 |
| **§3.3 최근 5랩** | `laps.date_start ≤ display_time` 만 적용하고 `lap_duration` 은 끝났는지 미확인 → 아직 끝나지 않은 lap이 5랩 테이블에 나타날 수 있음 | `date_start + lap_duration ≤ display_time` (lap이 끝나야 표시). 완료 안 된 lap은 5랩 테이블에서 제외하고 In Progress 행으로만 표시 |
| **§3.5 스틴트 히스토리** | `lap_end` 가 미래 lap 인 record 가 "진행 중 스틴트" 가 아닌 "완료된 스틴트" 처럼 표시 | `lap_end ≤ leader_current_lap` 인 것만 완료된 스틴트로, 그 외는 "진행 중" 으로 라벨. 미래 스틴트(아직 시작 안 됨)는 표시 안 함 |
| **§2.7 이벤트 티커** | `race_control.date` 미래 메시지 가 최근 5건에 섞임 | `getAllBefore('race_control', display_time, {}, 5)` 강제 |
| **§2.5 리더보드 LAST + 섹터 바** | 직전 완료 lap 산출 시 미래 lap 의 sector duration 이 섞임 | `lap.date_start + lap.lap_duration ≤ display_time` 인 것 중 가장 최근으로 산출 |
| **§2.8 빠른 랩 배지** | `personalBests.ts` incremental 갱신이 시크 시 미래 lap 의 best 를 그대로 유지 | 시크 발생 시 누적 통계 reset 후 `t` 까지 다시 빌드 (`getAggregateBefore(t)` 의 의미) |
| **§3.2 In Progress 행** | 본인 lap이 시작도 안 했는데 행이 표시됨 | `lap.date_start ≤ display_time` AND `(date_start + lap_duration) > display_time` 인 record 만 (또는 `lap_duration == null` 이고 `lap_number == leader_current_lap`) |
| **§3.6 세션 결과** | `session_result` 가 라이브 중에 보임 | `display_time ≥ session.date_end` 게이트 (현 정책 유지) |

**구현 강제 수단:**
1. `DataSource.getAllBefore`, `getLatestBefore` 가 내부적으로 `date ≤ t` 컷을 보장. 단, **lap.date_start 기반 endpoint (`laps`) 는 lap이 완료된 시점 (`date_start + lap_duration`) 기준 필터가 별도 필요** → `DataSource.getCompletedLapsBefore(driverNum?: number, t: Date)` 메서드 추가.
2. 모든 패널 컴포넌트는 raw `display_time` 비교를 직접 하지 않고 위 메서드만 사용. 자체 `Array.filter` 금지 (코드 리뷰 체크).
3. ESLint custom rule (옵션): `import` 한 DataSource 메서드 외에 `record.date` / `record.date_start` 와 `Date` 비교 코드를 금지.

---

## 5. 데이터 흐름 통합 (라이브맵과 공유)

```
OpenF1 API (REST, 무료/익명)
  │
  ▼  fetch (라이브: 26 req/min cadence / 재생: 60s 윈도우 prefetch)
브라우저 폴러 (LiveDataSource / ReplayDataSource — [live-streaming-strategy.md §8.1](../../docs/live-streaming-strategy.md))
  │
  ▼
브라우저 In-memory Buffer (라이브 30s ring / 재생 60s 윈도우 메모리 Map)
  │
  ▼  in-process (단일 DataSource 인스턴스 구독)
React 컴포넌트: 맵 + 대시보드 패널들
  │
  ├─ getDisplayTime(): subscribe
  ├─ getSamplePair → 맵
  ├─ getLatestBefore → 리더보드/Race Control/날씨
  ├─ getAllBefore → 이벤트 티커/핏 히스토리
  ├─ getLapAt → 진행률/현재 lap
  ├─ getStintForLap → 타이어 strategy
  └─ getAggregateBefore → 빠른 랩 배지
```

- **단 하나의 DataSource 인스턴스**가 맵과 모든 대시보드 패널을 동시에 서빙 (React Context로 주입).
- 동일 데이터를 중복 fetch하지 않음 (인스턴스 내부에서 ring buffer/캐시 공유).
- **백엔드·WebSocket 없음** — 향후 외부 공개 시 어댑터 한 클래스만 백엔드 호출용으로 교체 (DataSource 추상화 덕).

---

## 6. 컴포넌트 / 모듈 구조

```
src/dashboard/
├── index.ts                       # public API
├── DashboardApp.tsx               # 최상위 레이아웃 (CSS Grid)
├── panels/
│   ├── SessionHeader.tsx          # ①
│   ├── SessionProgress.tsx        # ②
│   ├── RaceControlBanner.tsx      # ④ (latest 1건)
│   ├── Leaderboard.tsx            # ⑤
│   ├── TyreStrategy.tsx           # ⑥
│   ├── EventTicker.tsx            # ⑦
│   ├── FastestLapBadges.tsx       # ⑧
│   └── WeatherMini.tsx            # ⑨
├── detailPanel/
│   ├── DriverDetailPanel.tsx      # ⑩ 컨테이너
│   ├── DriverHeader.tsx           # 3.1
│   ├── CurrentState.tsx           # 3.2
│   ├── RecentLapsTable.tsx        # 3.3
│   ├── PitHistory.tsx             # 3.4
│   ├── StintHistory.tsx           # 3.5
│   └── SessionResult.tsx          # 3.6
├── shared/                          # **대시보드 내부 공유** (src/shared/와 별개 — critic M1/M8)
│   ├── useDisplayTime.ts          # display_time 구독 훅
│   ├── useLatestBefore.ts         # getLatestBefore 훅
│   ├── useAllBefore.ts            # getAllBefore 훅
│   ├── useAggregate.ts            # getAggregateBefore 훅
│   ├── selectionStore.ts          # 선택된 드라이버 (사이드 패널 트리거)
│   ├── flagDecoder.ts             # race_control 활성/만료 판정
│   ├── tyreColors.ts              # compound → F1 표준 색 (SOFT=빨강 등, raw hex 유지)
│   ├── sectorColors.ts            # sector (s, driver, t) → F1 방송 표준 보라/초록/노랑/회색 (raw hex 유지)
│   ├── SectorBar.tsx              # 2px·3등분 섹터 색 바 (리더보드 LAST, 디테일 §3.2 공용)
│   ├── flagIcons.ts               # category → 아이콘
│   └── dashboardStyles.ts         # 패널 배경·텍스트·구분선 색 (src/style/tokens.ts에서 import)
└── derived/
    ├── totalLaps.ts               # fetch('/raceDistance.json') 후 (circuit_key, year) → total_laps 룩업
    ├── currentLap.ts              # display_time → leader의 lap
    ├── activeFlags.ts             # 4.2.4 still-active 판정
    └── personalBests.ts           # 빠른 랩 / 섹터 누적 계산 (드라이버별·overall, sectorColors가 사용)

src/shared/                        # cross-plan SSOT (live-map §7 정의, 본 plan은 import만)
├── DataSource.ts                  # 인터페이스 SSOT (critic M1)
├── openf1Types.ts                 # OpenF1 타입
└── Footer.tsx                     # 단일 attribution + 라이선스 + F1 디스클레이머 (critic M8)

public/                            # Vite가 빌드 시 dist/ 루트로 복사 (해시 없는 정적 자산)
└── raceDistance.json              # GitHub Actions가 OpenF1 laps에서 자동 생성 (§2.2)

scripts/
└── fetch-race-distance.ts         # 일일 cron — completed race 세션의 max(lap_number)로 raceDistance.json 갱신
```

---

## 7. 기술 스택 정합 (2026-05-22 확정)

[라이브맵 §8](./live-map-implementation.md) 결정사항과 동기:
- TypeScript (strict) + Vite
- **React 18** (확정) — 대시보드 패널들은 React 컴포넌트, 맵은 framework-agnostic core를 React thin wrapper로 감싸서 임베드
- **라우팅: wouter** (메인 페이지·라이브·리플레이 진입 경로)
- 상태: DataSource 인스턴스 (React Context로 주입) + selectionStore (드라이버 선택, Zustand 또는 vanilla event emitter). 그 외 별도 글로벌 store 없음.
- 스타일: CSS Modules 또는 Tailwind (§13 미해결)
- 시각화 작은 차트 (스틴트 막대): 순수 SVG/Canvas. 외부 차트 라이브러리(Recharts/Chart.js) 미도입 — 본 대시보드의 차트 복잡도가 그 수준이 아님.
- 호스팅: Vercel hobby 정적 SPA ([deployment-architecture.md](../../docs/deployment-architecture.md))

---

## 8. 인수 기준 (Acceptance Criteria)

1. **레이아웃 정합** — 1280×800 이상에서 모든 9종 글로벌 패널이 스크롤 없이 한 페이지에 표시
2. **단일 시계 일관성** — 시크 후 모든 패널이 100ms 이내에 동일한 `display_time` 시점의 데이터로 갱신됨 (시각 회귀)
3. **랩 카운터 정확성** — 시크 시 진행률 바의 "현재 lap" 가 실제 leader의 lap 과 일치 (단위 테스트)
4. **리더보드 갱신 cadence** — 라이브 정상 운영 중 포지션 변경이 1초 이내 리더보드에 반영 (display_time 기준)
5. **타이어 전략 정확성** — Issue #89 stint 중복랩 케이스에서도 막대 길이 합산이 +1 오차 없이 정확 (단위 테스트)
6. **사이드 패널 트리거** — 리더보드 행 또는 맵 마커 클릭 시 300ms 이내 슬라이드인 완료
7. **사이드 패널 전환** — 다른 드라이버 클릭 시 패널이 새 내용으로 200ms 이내 전환
8. **누적 통계 일관성** — 시크로 과거로 가도 빠른 랩 배지가 "그 시점까지의" 최고 기록만 표시 (시각 회귀)
9. **race_control 활성 판정** — YELLOW → GREEN 전이 시 배너가 GREEN 표시 후 5초 내 사라짐 (단위 테스트)
10. **누락 데이터 대응** — `intervals`가 historical 재생에서 비어 있어도 리더보드는 다른 칼럼이 정상 표시되며 INT만 "—"
11. **세션 종료 후 결과 섹션** — 라이브 중에는 사이드 패널에 결과 섹션 비표시, 세션 종료 후 표시
12. **시간 정렬 누락 zero** — 모든 패널 컴포넌트가 `useDisplayTime` 등 공유 훅을 통해서만 시간을 읽음 (코드 리뷰 체크리스트)
13. **섹터 바 색 일관성** — 같은 (lap, sector, driver) 가 리더보드 ⑤, 디테일 §3.2, §3.3, 빠른 랩 배지 ⑧ 네 곳에서 모두 동일한 색 (보라/초록/노랑/회색) 으로 표시 (시각 회귀 + 단위 테스트로 `sectorColors.ts` 검증)
14. **섹터 바 시크 일관성** — 시크해서 과거 시점으로 가도 그 시점까지의 누적으로 보라/초록 판정 (미래에 깨질 best가 현재에 보라로 표시되지 않음) — 시각 회귀
15. **진행 중 랩 섹터 표시** — 본인 lap이 진행 중일 때 디테일 §3.2 의 "In Progress" 행이 통과 섹터만 색칠하고 미통과 섹터는 회색 — 단위 테스트
16. **null 섹터 처리** — `duration_sector_n == null` (아웃랩/인랩) 이어도 해당 섹터만 회색이고 다른 두 섹터는 정상 색 — 단위 테스트
17. **미래 누설 zero (현재 시점 컷, 핏 포함)** — 모든 패널의 어떤 시점에도 `display_time` 이후의 정보가 표시되지 않는다. 특히 다음 케이스를 명시적으로 테스트:
    - (a) **핏 히스토리** §3.4 — 시크 t=20분 시점에 t=25분에 일어난 핏 stop 이 표시되지 않음 (단위 테스트 + 시각 회귀)
    - (b) **5랩 테이블** §3.3 — 완료되지 않은 lap (date_start ≤ t 이지만 date_start+lap_duration > t) 이 5랩에 포함되지 않음 (단위 테스트)
    - (c) **스틴트 히스토리** §3.5 — 미래 시작 스틴트가 표시되지 않고, 현재 시점이 lap_end 이전인 스틴트는 "진행 중" 라벨 (단위 테스트)
    - (d) **이벤트 티커** §2.7 — 미래 race_control 메시지 미포함 (단위 테스트)
    - (e) **리더보드 LAST + 섹터 바** — 직전 완료 lap 이 미래 lap 으로 잘못 잡히지 않음 (단위 테스트)
    - (f) **빠른 랩 배지** §2.8 — 시크 후 미래 best 가 표시되지 않음 (기존 인수 8 + 14 와 동일하지만 통합 검증)
    - (g) **결과 섹션** §3.6 — `display_time < session.date_end` 일 때 결과 섹션 미표시 (기존 인수 11 통합)
18. **DataSource 메서드 단일 진입점** — 모든 패널이 raw `display_time` 비교 (예: `record.date <= dt`) 를 컴포넌트에서 직접 하지 않고 DataSource 메서드 (`getLatestBefore` / `getAllBefore` / `getCompletedLapsBefore` / `getAggregateBefore`) 만 사용 — 코드 리뷰 체크리스트 + (옵션) ESLint custom rule
19. **다크 모드 토큰 일관성** — 패널 배경·텍스트·구분선은 `src/style/tokens.ts` 또는 `dashboardStyles.ts`에서만 import. raw hex는 F1 표준 색(섹터·컴파운드·팀)에만 허용 (코드 리뷰)
20. **WCAG AA 콘트라스트** — 다크 배경 위 본문 텍스트 4.5:1, 아이콘·작은 텍스트 3:1 (axe-core/playwright)
21. **`raceDistance.json` CDN 적중** — 페이지 진입 시 `fetch('/raceDistance.json')` 응답 < 100ms (재방문, CDN 적중 가정)
22. **Desktop only 동작** — 1280px+ 풀 레이아웃, 1280 미만에서 사이드 패널 자동 닫힘 + 토스트 (Playwright viewport 테스트)
23. **모드 전환 사이드 패널 닫기** — 라이브↔리플레이 전환 시 사이드 패널이 자동 닫힘 + selectionStore reset

---

## 9. 구현 단계

> **단계 0 (의존, critic P0-1/P0-2):**
> - [main-page §12 단계 0](./main-page-implementation.md) — Vite/React/wouter 부트스트랩 + `src/style/tokens.ts` 디자인 토큰 + `vercel.json` SPA fallback.
> - [live-map §10 단계 0.5](./live-map-implementation.md) — `src/shared/DataSource.ts` SSOT **인터페이스 파일** 생성.
> - [live-map §10 단계 6](./live-map-implementation.md) — `LiveDataSource`·`ReplayDataSource` 시간 인덱스 구조 구현체.
> - **단계 0의 destructive 작업(기존 `.github/workflows/ci.yml` 삭제·교체, `package.json` 신규 생성)은 main-page 작업자가 단독 수행한다. dashboard 작업자는 단계 0 완료 인수(새 ci.yml main 녹색 통과 + `npm run build` 성공 + `vercel.json` SPA fallback preview 동작)가 충족된 commit을 base로 단계 1에 진입.**
> - 본 plan의 단계 1은 그 위에서 시작.

### 단계 1: DataSource 확장 (SSOT)
- **`src/shared/DataSource.ts` 인터페이스** ([live-map §3.1](./live-map-implementation.md) SSOT, **파일은 live-map §10 단계 0.5에서 생성됨**) 에 본 plan용 6개 메서드가 이미 정의됨 (live-map MVP에 미리 통합) — 본 단계에서는 인터페이스를 수정하지 않고 구현체에 미구현 메서드(`getLatestBefore` 등)를 implement
- `src/map/LiveDataSource.ts`·`src/map/ReplayDataSource.ts` 구현체에 시간 인덱스 구조 추가 (각 엔드포인트별 timestamp 정렬 array + binary search)
- **모든 메서드의 내부 컷에서 `< t` 또는 `≤ t` 경계 정밀 명세 + 합성 fixture (t 직후의 record 존재) 로 누설 zero 검증**
- ✅ 단위 테스트로 시간 범위 쿼리 검증, 인수 17번/18번 (미래 누설 zero / 단일 진입점)

### 단계 2: 공유 훅 + 시간 동기 인프라
- `useDisplayTime`, `useLatestBefore`, `useAllBefore`, `useAggregate` 작성
- throttle/debounce 정책 (§4.3) 구현
- ✅ 인수 2번 (단일 시계 일관성)

### 단계 3: derived 모듈 (총 lap, 현재 lap, active flag, personal best) + 섹터 색 판정
- `scripts/fetch-race-distance.ts` — GitHub Actions에서 OpenF1 `laps` 최대 lap_number로 `public/raceDistance.json` 생성 (§2.2)
- 통합 `.github/workflows/daily-data-refresh.yml`의 step 2 — 시즌 카탈로그·맵과 함께 1개 commit ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md))
- `derived/totalLaps.ts` — `fetch('/raceDistance.json')` 1회 + 메모리 캐시 + (circuit_key, year) 룩업
- `derived/currentLap.ts`, `derived/activeFlags.ts`, `derived/personalBests.ts`
- `shared/sectorColors.ts` — `personalBests.ts` 를 기반으로 (driver, sector, t) → 보라/초록/노랑/회색 결정 (F1 표준 hex)
- `shared/SectorBar.tsx` — 2px·3등분 SVG/Flex 바, props: `[s1, s2, s3] times + driver + t`
- `shared/dashboardStyles.ts` — 패널 배경·텍스트·구분선 토큰 (다크 모드)
- ✅ 인수 3번 (랩 카운터), 9번 (flag 활성 판정), 13번 (섹터 바 색 일관성), 16번 (null 섹터), 19번 (다크 토큰), 21번 (raceDistance CDN)

### 단계 4: 글로벌 패널 — 세션 헤더, 진행률 바, 날씨, Race Control 배너
- `SessionHeader.tsx`, `SessionProgress.tsx`, `WeatherMini.tsx`, `RaceControlBanner.tsx`
- ✅ 인수 1번 (레이아웃), 9번

### 단계 5: 리더보드
- `Leaderboard.tsx` 20행 테이블
- 각 행 LAST 시간 아래 `SectorBar` 컴포넌트 임베드 (직전 완료 lap의 S1/S2/S3 색)
- 클릭 시 selectionStore 업데이트
- ✅ 인수 4번 (cadence), 10번 (누락 데이터), 13번 (섹터 바 색 일관성)

### 단계 6: 타이어 전략 시각화
- `TyreStrategy.tsx` SVG 막대 그래프
- Issue #89 방어 코드
- ✅ 인수 5번 (stint 중복랩)

### 단계 7: 이벤트 티커 + 빠른 랩 배지
- `EventTicker.tsx`, `FastestLapBadges.tsx`
- ✅ 인수 8번 (누적 통계 일관성)

### 단계 8: 사이드 패널 컨테이너 + 헤더 + 현재 상태
- `DriverDetailPanel.tsx`, `DriverHeader.tsx`, `CurrentState.tsx`
- §3.2 의 Last Lap 행 아래 + In Progress 행 (조건부 표시) 에 `SectorBar` + S1/S2/S3 시간 텍스트 임베드
- 슬라이드인 애니메이션 + selectionStore 연동
- ✅ 인수 6번 (트리거), 7번 (전환), 15번 (진행 중 랩 섹터 표시)

### 단계 9: 사이드 패널 — 랩 / 핏 / 스틴트 히스토리
- `RecentLapsTable.tsx` — `getCompletedLapsBefore` 사용 (lap_duration 포함 시점까지 컷)
- `PitHistory.tsx` — `getAllBefore('pit', t)` 사용, 컴포넌트 자체 filter 금지
- `StintHistory.tsx` — `lap_end ≤ leader_current_lap` 인 것만 완료된 스틴트, 그 외는 "진행 중" 라벨
- ✅ 모든 자료 표시, 인수 17번 (a)/(b)/(c) (핏·5랩·스틴트 누설 zero)

### 단계 10: 사이드 패널 — 세션 결과 (게이트)
- `SessionResult.tsx` + 종료 후 표시 로직
- ✅ 인수 11번 (세션 종료 후)

### 단계 11: 모드 전환 + 시크 시 일관성 시각 회귀
- Playwright 시각 회귀: 라이브→재생, 재생 시크
- ✅ 인수 2번, 8번

### 단계 12: 1024px 이하 fallback + 1280px 이상 디자인 폴리시
- "전체 정보 보기 어려움" 경고 + 핵심 패널만 표시
- 데스크탑 시각 폴리시 패스
- ✅ 인수 1번 폴리시

---

## 10. 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| `intervals` historical 재생에서 비어 있어 리더보드 갭 칼럼 공백 | 정보 누락 | 칼럼은 "—" 표시, 보조로 `position`+`laps`로 갭 derive (옵션) |
| `total_laps` 누락 (진행 중 race는 자동 fetch에 안 잡힘) | 진행률 바 "L?? / ??" 표시 | 같은 서킷 직전 시즌 fallback (옵션). 누락 자체는 의도된 동작 — 종료 후 다음 daily cron에 자동 보완. UI에 콘솔 경고만 |
| `pit.stop_duration` null (2024 US GP 이전) | 사이드 패널 핏 히스토리 일부 — 표시 | 디자인상 의도된 상태 ("—"), 사용자가 lane_duration만으로도 이해 가능 |
| `stints` 중복랩 버그 (Issue #89) | 타이어 막대 길이 +1 | `[lap_start, lap_end)` 반-개구간 합산 + 단위 테스트 |
| race_control 메시지 자유 텍스트 파싱 부정확 | 활성 판정 잘못 → 배너가 잘못된 flag 표시 | `flag` / `category` 필드만 사용, `message` 텍스트는 표시용으로만 |
| 시크 후 누적 통계 비일관 ("미래" 기록 표시) | 사용자 혼란 | 모든 derived는 `getAggregateBefore(t)` 사용 강제 + 코드 리뷰 |
| 리더보드 500ms 갱신이 무거운 렌더 비용 유발 | 프레임 드롭 | React memo + 행 단위 분리 컴포넌트. 변경된 행만 재렌더 |
| 사이드 패널 열림 (push 모드, 사용자 결정) 시 맵 폭이 7→6 col로 축소 | 맵 viewport transform 재계산 필요, 깜빡임 가능 | `openf1_transform`은 그대로 유지하고 **viewport transform (§2.1 ②)만** 갱신. 정적 트랙 캐시는 새 해상도로 1회 재렌더 (~50ms). 슬라이드인 애니메이션 200ms 동안 맵 transition도 같은 duration으로 동기화해 깜빡임 회피 |
| 사이드 패널 열림 시 우측 글로벌 column 5→3 col 압축 | 리더보드 LAST/Gap 칼럼 잘림 | 적응형 칼럼 숨김 (§1.4) 또는 폰트 축소 (§13-8 미해결) |
| 1280px 미만에서 사이드 패널 push 시 우측 글로벌이 너무 좁아짐 | 정보 무력화 | 1024~1280 구간은 우측을 2 col로 더 줄임, 1024 미만은 overlay fallback (§1.5) |
| 빠른 랩 배지가 매 lap 완료 시 전체 데이터 재스캔 | CPU 비용 | 누적 통계는 incremental 유지 (새 lap만 비교) — `personalBests` 내부에서 처리 |
| 모드 전환 시 모든 패널이 동시 재평가 | 1-프레임 freeze | `display_time` 단발 갱신 → 모든 throttled 훅이 한 사이클에 정렬됨. 200ms 정도는 허용 (모드 전환은 드문 이벤트) |
| 패널이 자체 시계 사용해 시간 정렬 어김 | 어긋난 표시 | 코드 리뷰 체크리스트 + 단계 11 시각 회귀로 검출 |
| Qualifying의 `session_result.duration`이 배열 (Q1/Q2/Q3) | 결과 섹션 표시 오류 | 세션 타입 분기 + 렌더링 테스트 |
| `duration_sector_*` null (아웃랩/인랩/SC 중) 으로 섹터 바 색 판정 실패 | 일부 섹터만 색 표시 안 됨 | 회색 (`#374151`) 로 명시적 표시 + 단위 테스트 (인수 16번) |
| 섹터 best 갱신은 lap 닫힐 때만 발생 → 라이브에서 진행 중인 빠른 섹터가 즉시 보라로 안 바뀜 | 사용자가 "방금 보라색이어야 하는데" 느낄 수 있음 | 의도된 동작. OpenF1 `laps`가 랩 종료 시에만 sector duration 확정 → 라이브/재생 동일. UI에 별도 안내 불필요 (F1 방송과 동일 방식) |
| `sectorColors.ts` 가 호출처마다 다르게 구현되면 4곳 일관성 깨짐 | 같은 lap이 다른 색으로 표시됨 | 함수 단일 정의 + 코드 리뷰 + 인수 13번 시각 회귀 |
| **버퍼 미래 데이터 누설** (가장 빈번한 함정) — 라이브 30s 버퍼나 재생 60s 윈도우에 `display_time` 이후의 record 가 적재되어 있는데 패널이 그대로 표시. 핏 히스토리에서 자주 관측됨 | 사용자 신뢰 손상 ("아직 안 일어난 일이 보임") | §4.5 의 단일 진입점 규칙. DataSource 메서드 외 직접 비교 금지. 인수 17번 시각 회귀로 검출 |
| `laps.date_start ≤ display_time` 만 체크하고 lap 완료 여부 미체크 | 진행 중인 lap이 5랩 테이블에 절반 데이터로 표시 | `getCompletedLapsBefore` 사용 강제 (lap_duration 도 포함된 시점까지 기다림) |
| 시크 후 incremental 누적 통계 reset 누락 | 미래 best 가 그대로 표시 | `personalBests.ts` 가 display_time 점프 감지 시 reset → t까지 재빌드 |
| 다크 토큰 분산 — 패널마다 raw hex 직접 사용 | 다크 모드 일관성 깨짐 | `dashboardStyles.ts` 단일 정의 + CSS variables. F1 표준 색(섹터·컴파운드·팀)만 raw 허용. 인수 19번 |
| Desktop viewport 축소 (1280 미만)에서 사이드 패널 클릭 | 사이드 패널이 좁아 정보 무력화 | 자동 닫힘 + 토스트 (§3.7). 인수 22번 |
| `raceDistance.json` fetch 실패 (네트워크/CDN 장애) | 모든 진행률 바 "L?? / ??" | totalLaps 함수가 fetch 실패 시 빈 Map 반환 + 콘솔 경고. UI는 정상 동작 (degraded) |
| 빌드 타임 OpenF1 429 / 5xx / abuse 차단 (critic C2) — race distance 빌드가 OpenF1 `laps` 다수 호출 | raceDistance.json stale 또는 일부 entry 누락 | `scripts/_lib/openf1Client.ts` 공통 wrapper에 token-bucket(25 req/min) + exponential backoff + jitter. 실패 시 이전 raceDistance.json 보존 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md)) |
| 런타임 hydration cadence — 동시 다중 패널 첫 진입 시 OpenF1 3 req/s 초과 (critic M4) | 429 hit, 일부 패널 빈 화면 | 모든 패널의 첫 fetch를 token-bucket 또는 직렬화로 묶음. `LiveDataSource`/`ReplayDataSource`가 hydration 호출을 중앙에서 sequence ([live-streaming-strategy.md §6](../../docs/live-streaming-strategy.md)) |
| **OpenF1 CORS 정책 변경 (critic P0-4)** | 대시보드 패널 전체 비활성 (라이브·리플레이 모두) | main-page 진입 시 CORS ping (1 req) 선행 → 실패 시 `CorsFailedNotice` 표시 + DashboardApp 마운트 보류. 본 plan은 main-page 정책에 따름 ([main-page §13 위험표](./main-page-implementation.md)) |

---

## 11. 검증

| 단계 | 방법 | 도구 |
|---|---|---|
| 단위 | `getLatestBefore/getAllBefore/getLapAt/getStintForLap/getAggregateBefore`, totalLaps 룩업, activeFlags, personalBests, 막대 +1 방어, `sectorColors` (보라/초록/노랑/회색 전이 + null 처리) | Vitest |
| 통합 | 합성 sample로 DashboardApp 한 페이지 렌더 + display_time 변경 시 모든 패널 동시 재평가 | Vitest + JSDOM |
| 시각 회귀 | 알려진 historical 세션 (예: 2024 Bahrain GP) 의 t=20분 / t=40분 / t=종료 후 스냅샷 비교 | Playwright + 픽셀 diff |
| 시각 회귀 시크 | t=40분 → t=10분으로 시크, 모든 패널 일관 표시 | Playwright |
| **시각 회귀 미래 누설** | 알려진 historical 세션에서 t=15분 (첫 핏스톱 직전) 으로 시크 후: 핏 히스토리 비어 있음, 5랩 테이블에 첫 1~2 lap 만, 스틴트 1개만 (진행 중), 이벤트 티커에 t 이후 메시지 없음 — 픽셀 diff | Playwright |
| **단위 미래 누설** | DataSource 합성 fixture: t=10:00 일 때 t=10:05 의 pit/lap/race_control record 가 결과에 포함되지 않음을 각 메서드별로 검증 | Vitest |
| 모드 전환 | 라이브 → 재생, 재생 → 라이브 (라이브 데이터 있는 경우만) | Playwright |
| 성능 | 60분 라이브 운영 후 메모리, 평균 패널 재평가 비용 | Chrome DevTools |
| **다크 모드 콘트라스트** | 모든 패널의 텍스트·아이콘이 WCAG AA 충족 (4.5:1 / 3:1) | `@axe-core/playwright` |
| **Desktop viewport** | 1280px+ 풀 레이아웃, 1280 미만 사이드 패널 자동 닫힘 + 토스트 | Playwright viewport 시뮬레이션 |
| **`raceDistance.json` CDN 적중** | 두 번째 페이지 진입 시 응답 < 100ms | Vercel preview Network 패널 (수동) |

---

## 12. 명시적으로 스코프 밖

- 텔레메트리 (`car_data`) — 사용자 결정으로 제외
- 무선 audio (`team_radio`) — 사용자 결정으로 제외
- 챔피언십 standings (시즌 누적) — `championship_drivers/teams` 베타 엔드포인트. 후속.
- 비교 모드 (드라이버 2명 나란히) — 후속.
- 차트 (lap time 그래프, 갭 차트) — 후속.
- 사이드 패널의 알림 기능 (북마크/팔로우) — 후속.
- **모바일·태블릿 우선 UX** — Desktop only 확정 ([main-page §1.3](./main-page-implementation.md))
- **라이트 모드 / 테마 토글** — 다크 모드 only 확정
- **다중 사용자 / SNS 공유 / 임베드** — 외부 공개 시 [deployment-architecture.md §8](../../docs/deployment-architecture.md) 백엔드 도입 트리거
- 다국어 (i18n) — 현재 한국어만 가정

---

## 13. 미해결 / 결정 필요 항목

(2026-05-22 확정 — 사용자 결정)
- **프레임워크:** Vite + React 18
- **라우팅:** wouter
- **테마:** 다크 모드 only ([main-page §0](./main-page-implementation.md))
- **타깃 디바이스:** Desktop only (1280px+)
- **`raceDistance.json` 운영:** GitHub Actions 일일 cron에서 OpenF1 `laps` 최대 lap_number(또는 FastF1)로 자동 fetch → `public/raceDistance.json` 갱신 (§2.2)

남은 미해결:
1. **스타일링 방법** — 다크 토큰을 (a) CSS variables 직접 (b) Tailwind config `theme.extend` (c) styled-components 중 어느 방식으로 표현할지. [main-page §16-7](./main-page-implementation.md)과 통합 결정.
2. **`intervals` historical derive 채택 여부** — 재생 모드에서 `intervals`가 비어 있을 때 `position`+`laps`로 갭을 계산할지. [live-map §15](./live-map-implementation.md)와 동일.
3. **테이블 정렬 컨트롤 허용?** — 리더보드 기본 포지션 정렬. 사용자가 다른 기준으로 정렬 가능하게 할지.
4. **이벤트 티커 클릭 시 동작** — 메시지를 클릭하면 그 시각으로 시크할지 (재생 모드).
5. **드라이버 검색/필터** — 20명 중에서 빠르게 찾는 UI 필요할까.
6. **사이드 패널 열림 시 리더보드 적응형 압축의 구체 칼럼** — `LAST` vs `Gap to leader` 중 어느 칼럼을 숨길지 (§1.4). 또는 모두 유지하며 폰트만 축소.

---

## 14. 참고

- [openf1-api-reference.md](../../docs/openf1-api-reference.md) — 본 plan이 매핑하는 모든 엔드포인트의 사실
- [live-streaming-strategy.md](../../docs/live-streaming-strategy.md) — 라이브 30s 버퍼 정책
- [replay-strategy.md](../../docs/replay-strategy.md) — 재생 60s 윈도우 정책
- [deployment-architecture.md](../../docs/deployment-architecture.md) — Vercel + GitHub Actions + `public/raceDistance.json` 정적 자산 정책
- [main-page-implementation.md](./main-page-implementation.md) — 부트스트랩 (단계 0)·디자인 토큰·라우팅 동기 기준
- [live-map-implementation.md](./live-map-implementation.md) — DataSource 추상, display_time 시계, 좌표/보간/오버레이
