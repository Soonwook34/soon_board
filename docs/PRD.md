# PRD — soon-board: F1 실시간 타이밍 & 리플레이 대시보드

> 작성일: 2026-07-21 · 상태: Draft
> 용도: **Claude Design에 기능별로 입력해 화면 구성(screen-first)을 먼저 확정하고, 이후 기능 구현에 들어가기 위한 단일 요구사항 문서.**
> 상세 화면 명세는 `docs/redesign/briefs/01~06`이 SSOT이며, 본 문서는 제품 전체를 묶는 상위 문서다.

---

## 1. 제품 개요

**soon-board**는 [OpenF1 API](https://openf1.org)의 공개 데이터를 소비해 F1 세션(Race · Sprint · Qualifying · Sprint Qualifying · Practice)을
**라이브로 시청하거나(30초 지연), 종료된 세션을 리플레이(시크/배속)로 재생**할 수 있는 개인용 웹 대시보드다.

- 형태: 정적 SPA (React 18 + TypeScript + Vite + wouter)
- 호스팅: Vercel hobby (백엔드/DB 없음 — 폴러는 사용자 브라우저)
- 시각 스타일: F1 방송 그래픽 풍 **다크 모드 only · Desktop only (1280px+)**
- 사용자: 1명(제작자 본인). 외부 공개는 비-목표.

### 배경 — 왜 재설계인가
기존 구현(`src/main`, `src/live`, `src/dashboard`, `src/map`)은 기능적으로 동작하지만 뷰 레이어 구조에 불만이 있어,
**"화면 먼저(screen-first) → 구현"** 순서로 뷰를 다시 만든다. 검증에 가장 오래 걸린 **데이터 레이어(Tier 1)는 보존**한다
(경로 A — `docs/redesign/00-overview.md` §4, 권장안).

---

## 2. 목표 / 비-목표

### 목표
1. F1 세션을 **미래 누설 zero**(`date ≤ t`) 원칙 하에 라이브·리플레이 공통 화면으로 제공한다.
2. 뷰 레이어를 3레이어 MVC로 재구축: **`api/`(호출) → `store/`(저장) → `view/`(화면)**. view는 api를 직접 import하지 않는다.
3. 화면 6종을 Claude Design으로 먼저 확정(mock = 실제 record 타입)한 뒤 DataSource에 연결한다.
4. 데이터 레이어(Tier 1: `openf1Client`, `openf1Types`, `DataSource`, `sessionKind`, Live/ReplayDataSource, scripts/, public/ 정적 자산)는 재작성 없이 이식한다.

### 비-목표
- 다중 사용자 / 외부 공개 (백엔드 팬아웃·캐시 서버 없음)
- 모바일/태블릿 대응 (1024px 미만은 안내 배너만)
- 텔레메트리(`car_data`) · 팀 라디오(`team_radio`) 표시
- 라이트 테마
- 섹터/DRS/SLM 맵 오버레이의 MVP 활성화 (토글 UI는 두되 "Coming soon" disabled)

---

## 3. 사용자 시나리오

| # | 시나리오 | 경로 |
|---|---|---|
| S1 | 주말에 라이브 세션을 틀어놓고 순위·갭·타이어·깃발을 실시간 추적 | `/` → LIVE 카드 → `/live/:sessionKey` |
| S2 | 놓친 세션을 리플레이로 시청, 관심 구간 시크/배속 | `/` → PAST 카드 → `/replay/:sessionKey` |
| S3 | 퀄리파잉에서 Q1/Q2/Q3 컷라인·탈락권을 세그먼트 단위로 추적 | 퀄리 세션 진입 시 자동으로 퀄리 변형 화면 |
| S4 | 특정 드라이버의 랩·스틴트·핏 이력을 깊게 파기 | 리더보드 행/맵 마커 클릭 → 디테일 패널 |
| S5 | 다가올 세션 확인·카운트다운 대기 | 메인 Hero 배너 / UPCOMING 카드 → 카운트다운 오버레이 |

---

## 4. 시스템 컨텍스트 & 제약 (설계 시 반드시 지킬 것)

| 제약 | 내용 |
|---|---|
| 데이터 원천 | OpenF1 REST (무료/익명, ~30 req/min). 라이브 폴 합계 ~26 req/min 예산 내 |
| 표시 지연 | 라이브 시계 = `newest_received_date − 30s` (30초 플레이아웃 버퍼) |
| 리플레이 | 반-개구간 윈도우 폴링 `[T, T+W)`. 조밀 endpoint(location/position/intervals) 60s 윈도우, 희박 endpoint는 세션 전체 1회. 캐시는 브라우저 메모리만 |
| 정적 데이터 | GitHub Actions daily cron이 빌드: `public/seasons/*.json`(시즌 카탈로그 2023~), `public/trackOutlines/*.json`(서킷 폴리라인+transform), `public/raceDistance.json` |
| 배포 | Vercel 정적 SPA. rewrites: `/live/:key*`, `/replay/:key*` → `/index.html` |
| 시간 규율 | **미래 누설 zero** — 모든 조회는 `date ≤ t`. 화면은 DataSource의 `display_time` 하나에만 반응하며 라이브/리플레이를 구분하지 않는다 |
| 라이선스 | OpenF1: CC-BY-NC-SA 4.0 / 트랙 SVG(julesr0y): CC-BY-4.0 → 화면 내 attribution 필수 |
| 리플레이 intervals | historical `intervals`는 불완전("live only") → null/stale 대비 `—` 표시 |

### DataSource 계약 (화면이 보는 유일한 인터페이스)
```ts
getDisplayTime(): Date                       // 라이브: newest−30s / 리플레이: playback_clock
getStreamState(): 'live'|'lagging'|'stalled'|'buffering'
onDisplayTimeChange(handler): unsubscribe
getLatestBefore(endpoint, t, filters?)       // date ≤ t 최신 1건
getAllBefore(endpoint, t, filters?, limit?)  // date ≤ t 전체
getCompletedLapsBefore(driverNum, t, limit?) // date_start + lap_duration ≤ t 완료 랩만
getLapAt(driverNum, t) / getStintForLap(driverNum, lap)
getAggregateBefore('fastest_lap'|'purple_sectors'|'personal_bests', t)
getSessionResult(driverNum)                  // undated — 표시 게이트(t ≥ date_end)는 호출처 책임
getSamplePair(driverNumber, t): SamplePair   // 맵 마커 보간용
```

---

## 5. 정보 구조 & 라우팅

```
/                     메인 페이지 (시즌 → GP → 세션 선택 허브)
/live/:sessionKey     라이브 화면  = 셸(F6) + 대시보드(F2/F4) + 서킷맵(F5) [+ 디테일 패널(F3)]
/replay/:sessionKey   리플레이 화면 = 동일 구성 + transport bar
```

- 세션 종류 판정: `resolveSessionKind(session_type, session_name)` → race / sprint / qualifying / sprint_qualifying / practice.
  퀄리 계열(`isQualifyingFamily`)이면 대시보드가 퀄리 변형(F4)으로 전환.
- 라이브 진입 시 세션 시작 전이면 카운트다운 오버레이.

---

## 6. 기능 명세 (기능 = 화면 단위 · Claude Design 진행 순서)

> 각 기능의 §"브리프"가 상세 SSOT다. 브리프 §6에 **복사용 Claude Design 프롬프트 스니펫**이 들어 있다.
> 공통 전제: mock 데이터는 반드시 실제 record 타입(`src/shared/openf1Types.ts`, `seasonData.ts`) 그대로 사용.

### F0. 디자인 시스템 (모든 화면의 선행 작업)
- 다크 토큰: 배경 `#0A0A0F`~`#111827`, border `#1F2937`, 텍스트 흰색 계열. 기존 `src/style/tokens.ts` 참고.
- 강조색 SSOT: 보라 `#A855F7`(overall best/FL), 초록 `#10B981`(personal best), 노랑 `#F59E0B`(일반 완료/황기), 회색 `#374151`(null), 빨강 `#EF4444`(적기/DNF/SOFT).
- 타이어 컴파운드: SOFT 빨강 / MEDIUM 노랑 / HARD 회백 / INTER 초록 / WET 파랑.
- `team_colour`(6자리 hex, `#` 없음)는 칩/세로 바/번호 색으로만 — 배경 전체 물들이기 금지.
- 타이밍 숫자는 monospace(`m:ss.SSS`), 패널 타이틀은 uppercase + letter-spacing.
- 공용 프리미티브: Badge, Table, Card, SectorBar(2px, 3등분), CollapsibleSection, StatusPill.

### F1. 메인 페이지 — 시즌/GP/세션 선택 허브
- **브리프**: `docs/redesign/briefs/01-main-page.md` · 완성 프롬프트: `docs/redesign/01-first-screen-prompt.md`
- **구성**: 헤더(로고+GP 검색) / Hero 배너(임박·라이브 세션 자동 선택, 카운트다운 또는 진입 CTA) / 시즌 picker + 세션타입·상태 필터 / GP 카드 4열 그리드 / 카드 클릭 시 인라인 세션 패널 확장 / PAST 세션 호버 시 result_preview 팝업(포디엄 3인·FL·WET).
- **데이터**: 정적 `/seasons/index.json` + `/seasons/{year}.json`만. OpenF1 라이브 스트림 무의존(현재 시즌만 백그라운드 재검증 1회).
- **상태 판정**: `is_cancelled` + `date_start/end` + wall-clock. 라이브 윈도우 `[start−30min, end+30min]`.
- **수용 기준**: 상태 4종(upcoming/live/past/cancelled) 카드·배지·클릭 동작이 매트릭스대로 동작, 빈 시즌·필터 0건·1024px 미만 엣지케이스 처리.

### F2. 레이스 대시보드 — 타이밍 메인 화면
- **브리프**: `docs/redesign/briefs/02-race-dashboard.md`
- **구성**(12-col grid, 뷰포트 점유·스크롤 없음): ①SessionHeader ②SessionProgress(랩/시간 진행 바 + 적기·SC 구간 채색) ③LiveMap(F5) ④RaceControlBanner(활성 플래그 1건) ⑤Leaderboard 20행(P·DRV·INT·GAP·LAST+섹터바·TYR·배지) ⑥TyreStrategy(기본 접힘 stint 막대) ⑦EventTicker(race_control 최근 5건) ⑧FastestLapBadges(FL·S1·S2·S3) ⑨WeatherMini + EventBroadcast 오버레이(중요 플래그 슬라이드인).
- **사이드 패널 열림 시**: Push 모드 — 맵/리더보드 폭 압축, 우측 ~360px 디테일 패널(F3).
- **수용 기준**: 모든 패널이 `display_time` 하나에만 반응(자체 fetch·시계 금지), buffering/stalled/lagging 상태 표현, `+1 LAP` 문자열 interval 그대로 표시, DNF/DNS/DSQ는 세션 종료 후에만.

### F3. 드라이버 디테일 패널
- **브리프**: `docs/redesign/briefs/03-driver-detail.md`
- **구성**(우측 sticky ~360px, 내부 스크롤): DriverHeader(헤드샷·번호·팀) / CurrentState(P·LAP·interval·타이어 + Last Lap 섹터바 + In Progress) / RecentLapsTable(5행+더보기) / StintHistory / PitHistory / SessionResult(종료 후만, 퀄리는 `duration` 배열 → Q1/Q2/Q3).
- **상호작용**: 리더보드 행·맵 마커 클릭으로 열림, 다른 드라이버 클릭 시 슬라이드 전환, ESC/X/재클릭 닫힘, 라이브↔리플레이 전환 시 자동 닫힘.
- **수용 기준**: 미래 누설 방어 표(브리프 §4.3) 전체 충족, `headshot_url` null 폴백, `is_pit_out_lap` 랩 PIT OUT 라벨.

### F4. 퀄리파잉 대시보드 (Q1/Q2/Q3 변형)
- **브리프**: `docs/redesign/briefs/04-qualifying-dashboard.md`
- **활성 조건**: `isQualifyingFamily(kind)`. Sprint Qualifying이면 라벨 SQ1/SQ2/SQ3.
- **구성**: QualifyingTower(세그먼트 베스트 순위 + 컷라인 구분선 + drop zone 빨강 음영) / SegmentProgress(3-pill + 카운트다운, `SEGMENT_DURATIONS_MIN` SSOT: Q [18,15,12]분·SQ [12,10,8]분) / SegmentBestBoard(세그먼트별 전 드라이버 베스트, 세션 베스트 보라) / LiveMap 변형(미니섹터 색: 2048 노랑·2049 초록·2052 보라·2064 핏).
- **핵심 규칙**: 컷라인 위치는 데이터 파생(15/10/5 하드코딩 금지) · 진행 중 순위는 flying 랩만(`getCompletedLapsBefore`) · `session_result.duration[]`은 확정 뷰 전용 · 카운트다운 ≤30s 긴박감 시각.
- **수용 기준**: Q1 진행 중 t에서 Q2/Q3·최종 결과 미노출(미래 누설 스냅샷 테스트), 2026 22대 그리드 자동 대응.

### F5. 서킷 맵
- **브리프**: `docs/redesign/briefs/05-circuit-map.md`
- **구성**: Canvas 2D — 정적 track outline(offscreen 1회 stroke 후 blit) + 핏레인 파선 + 드라이버 마커(원형, team_colour, 흰 테두리, acronym 라벨 toggle) + 트레일(1.5s fade) + 리더 노란 글로우 + attribution 배지 + 오버레이 토글(핏레인 ON, 섹터/DRS/SLM은 MVP disabled).
- **데이터**: `/trackOutlines/{circuit_key}-{year}.json`(폴리라인·arc_length·openf1_transform) + `getSamplePair(driverNumber, t)` 보간.
- **엣지케이스**: sample null → 마커 미표시 / `s2: null` → freeze 후 dim+`?` / 가라지 sentinel(`|x|+|y|+|z| < 50`) → 미표시 / 결승선 wrapping path-arc / 리타이어 grayscale.

### F6. 라이브/리플레이 셸
- **브리프**: `docs/redesign/briefs/06-live-replay-shell.md`
- **구성**: 헤더(로고·세션명·UTC 시계·스트림 상태 pill) / 본문 2열(대시보드 ~60% + 맵 ~40%) / **transport bar(리플레이 전용)**: 재생·일시정지·±15s·시크 바(버퍼 구간 표시)·배속 0.5/1/2/4 / 카운트다운 오버레이(라이브, 시작 전) / CORS 실패 안내 오버레이 / Footer(CC-BY attribution).
- **셸만 라이브/리플레이를 구분**한다 — 내부 패널은 전부 DataSource만 본다.
- **수용 기준**: StreamState 4종 배지·시계 동작 매트릭스(브리프 §4.1) 충족, 시크 후 buffering 표시·200~500ms 내 재개, 세션 범위 밖 시크 잠금.

---

## 7. 데이터 아키텍처 (구현 단계 규칙)

```
src/
  api/      OpenF1 호출만 (openf1Client, openf1Types). 상태·React 없음.
  store/    LiveDataSource / ReplayDataSource + 도메인 store. api를 부르는 유일한 층.
  shared/   DataSource 계약·sessionKind·seasonData 등 순수 타입/함수. import 없음.
  view/     화면. shared의 DataSource·타입에만 의존. api 직접 import 금지(ESLint no-restricted-imports 권장).
```

- **이식(재작성 금지) Tier 1**: `openf1Client.ts`, `openf1Types.ts`, `DataSource.ts`, `sessionKind.ts`, `seasonData.ts`, `env.ts`, `simulatedNow.ts`, `LiveDataSource`/`ReplayDataSource`, `scripts/` 전체, `vendor/f1-circuits-svg`, `public/seasons·trackOutlines`, `data/slm-zones-raw.json`.
- 기존 뷰(`src/dashboard`, `src/live` 화면, `src/map` 렌더 컴포넌트, `src/style`)는 참조용으로만 두고 새 `view/`로 대체. 특히 `src/dashboard/derived/*`(knockout, qualifyingSegments, personalBests 등)와 `flagDecoder`, `sectorColors` 로직은 검증된 순수 함수이므로 로직 재사용 강력 권장.

---

## 8. 도메인 함정 (재구현 시 회귀하기 쉬운 5가지 — 반드시 보존/검증)

1. **미래 누설 zero** — 모든 조회 `date ≤ t`. 리플레이 시크 시 t 이후 데이터 누설 금지 (테스트 필수).
2. **퀄리 세그먼트** — `session_result.duration`이 `[Q1,Q2,Q3]` 배열 + null 패딩. 비예선은 스칼라.
3. **세션 5종 정규화** — Sprint / Sprint Qualifying은 `session_type`만으로 오분류됨 → `sessionKind.ts` 규칙 사용.
4. **가라지 sentinel** — location 가라지 좌표 필터(마커 미표시).
5. **CORS / rate-limit** — 브라우저 직접 호출 제약 (`docs/openf1-api-reference.md` §3.3). CORS 실패 전용 안내 UI.

---

## 9. 비기능 요구사항

| 항목 | 기준 |
|---|---|
| 요청 예산 | 라이브 합계 ≤ ~26 req/min (OpenF1 30 req/min 한도 내) |
| 맵 렌더 | RAF 기반 부드러운 보간. 정적 요소 offscreen canvas blit로 프레임 비용 최소화 |
| 리플레이 워밍업 | 재생 시작까지 ~1–2초, 시크 후 재개 200–500ms |
| 메모리 | 라이브 버퍼 30s ring / 리플레이 윈도우 캐시는 세션 메모리 한정 |
| 접근성 | 키보드 포커스 링 유지, ESC 닫기. (스크린리더 최적화는 비-목표) |
| 표기 의무 | OpenF1 CC-BY-NC-SA·트랙맵 CC-BY 4.0 attribution 상시 노출 |
| 테스트 | 도메인 파생 로직 vitest 유닛 + 미래 누설 스냅샷 + Playwright 시각/e2e(`@realnet` 실 API 스모크 1회 포함) |

---

## 10. 실행 계획 — Claude Design 워크플로우

```
[0] 브랜치: redesign/screen-first + 폴더 골격(api/store/shared/view) + Tier 1 이식
[1] F0 디자인 토큰·프리미티브 확정
[2] 화면 1개씩 Claude Design: 정적 컴포넌트 + mock(실제 record 타입) → 시각 확정
      순서: F1 메인 → F2 레이스 대시보드 → F3 디테일 → F4 퀄리 → F5 맵 → F6 셸
[3] 화면 확정 시마다 DataSource 메서드로만 연결
[4] store(Live/Replay) 이식 검증 — 실 endpoint 1회 호출 (mock 통과 ≠ 검증 완료)
```

**Claude Design에 매 화면 넣을 입력 3종** (`00-overview.md` §6):
(a) 해당 브리프 §2 패널/레이아웃 · (b) §3 데이터 계약(record 타입 + DataSource 시그니처) · (c) 시각 참조(기존 스냅샷 또는 F1 방송 화면).
각 브리프 §6의 프롬프트 스니펫을 그대로 복사해 시작한다.

**검증 게이트**(프로젝트 규칙): 화면 확정 후 dev 서버에서 실제 사용 확인 · API 연결 시 실 endpoint 스모크 1회 · 형제 화면(Live/Replay) 구조 cross-check · gated 화면은 hook을 early return 앞에 배치.

---

## 11. 성공 기준

1. 6개 화면이 브리프 §4 엣지케이스 표를 모두 충족한 상태로 `view/`에 존재한다.
2. `view/` → `api/` 직접 import 0건 (lint로 강제).
3. 라이브 세션 1회·리플레이 세션 1회를 실 데이터로 끝까지 시청 가능(수동 검증).
4. 미래 누설 테스트(시크 시나리오 포함) 전부 green.
5. 기존 기능 대비 회귀 없음: 세션 5종 정규화·퀄리 배열·sentinel 필터 유닛 테스트 유지.

## 12. 열린 결정

| 결정 | 옵션 | 권장 |
|---|---|---|
| 재시작 경로 | A 코어 보존(이 레포·브랜치) / B 새 레포 zero-base | **A** (`00-overview.md` §0) |
| 라이브 프로비저널 컷라인(KNOCKOUT_CONFIG) | MVP 포함 / Phase 4 연기 | 연기 (브리프 04 §4.3) |
| 섹터/DRS/SLM 맵 오버레이 | MVP 활성 / disabled 토글만 | disabled 토글만 (브리프 05) |
