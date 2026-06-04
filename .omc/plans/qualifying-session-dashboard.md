# 세션 특화 대시보드 — 퀄리파잉 우선 (Qualifying + Sprint Qualifying)

> **상태: APPROVED — 실행 중 (ralph, 2026-06-02)** — 사용자가 ralph 실행을 승인. PRD: `.omc/state/sessions/<sid>/prd.json` (US-001~009, Phase 4 제외).
> 작성일 2026-06-02 · 모드: /plan (interview→direct) · 범위: 리플레이 우선

---

## 1. Requirements Summary

OpenF1 세션을 5종(Practice / Qualifying / Sprint Qualifying / Sprint / Race)으로 구분하고, **세션 스타일에 맞는 특화 대시보드/라이브맵**을 제공한다. 1차 범위는 **Qualifying 계열(Qualifying + Sprint Qualifying)**, **리플레이 우선**.

사용자 확정 사항(Q&A):
- **Scope**: 퀄리파잉 계열 먼저 → 이후 Race/Sprint/Practice 확장
- **Mode**: 리플레이 우선 → 라이브는 후속
- **Features (전부)**: ① Q1/Q2/Q3 분절 + 세그먼트별 베스트랩, ② 탈락 컷라인/녹아웃 존, ③ 세그먼트별 카운트다운(제한시간), ④ Out/In 랩 마킹
- **추가 요구 A**: 2026 시즌 참가 인원 증가(22대 / 11팀)로 녹아웃 수가 바뀜 → 반영 가능해야 함
- **추가 요구 B**: F1 중계의 각 세션 스타일에 맞춰 패널 구성을 재설계 — 세션별로 정보를 빼고/넣는 결정이 가능한 구조

### 1.1 핵심 데이터 사실 (검증 완료, 코드/문서 라인 근거)

| 항목 | 출처 | 결론 |
|---|---|---|
| 세션 5종 구분 | `session_type`+`session_name` ([openf1Types.ts:129-143](../../src/shared/openf1Types.ts#L129-L143), [api-ref:295-297](../../docs/openf1-api-reference.md#L295)) | **쉬움.** 두 필드 조합 필수(타입 단독은 Sprint→Race, SQ→Qualifying로 병합됨) |
| Q1/Q2/Q3 시간 경계 | `race_control.qualifying_phase` = 1/2/3 ([api-ref:443](../../docs/openf1-api-reference.md#L443)) | **신뢰 가능 경계 신호.** ⚠️ 단 repo `RaceControlRecord`에 필드 미정의 ([openf1Types.ts:116-127](../../src/shared/openf1Types.ts#L116-L127)) → 추가 필요 |
| 세그먼트 진출/탈락 + 세그먼트별 베스트 | `session_result.duration` 배열 ([openf1Types.ts:152](../../src/shared/openf1Types.ts#L152), [api-ref:490,499-506](../../docs/openf1-api-reference.md#L490)) | **권위 있음(최종).** 배열 길이=진출 단계(1=Q1탈락…3=Q3), 값=세그먼트 베스트. ⚠️ undated/세션종료값 → 라이브 순위에 쓰면 미래 누설 |
| Out lap | `laps.is_pit_out_lap` ([openf1Types.ts:77](../../src/shared/openf1Types.ts#L77)) | 직접 제공 |
| In lap | `/pit.lap_number` ([openf1Types.ts:98-106](../../src/shared/openf1Types.ts#L98-L106)) | 파생(해당 랩에 pit 레코드 존재) |
| 미니섹터 색 | `laps.segments_sector_1/2/3` ([openf1Types.ts:78-80](../../src/shared/openf1Types.ts#L78-L80), [api-ref:336-346](../../docs/openf1-api-reference.md#L336)) | 라이브맵용. 2048 노랑/2049 초록/2052 보라/2064 핏. 예선에서만 의미 |
| 2026 녹아웃 수 변경 | 데이터 파생 설계 | 진출 인원 = `session_result` 배열 길이로 파생 → **하드코딩 금지 시 자동 대응** |

**미래 누설 규율 (필수):** repo는 최근 `driverOutAt` ([Leaderboard.tsx:73-75](../../src/dashboard/panels/Leaderboard.tsx#L73-L75), commit a0b48e5) 에서 undated `session_result`를 시간 컷된 완료 랩과 결합해 누설을 막았다. 본 작업의 모든 파생 모듈은 **같은 규율**을 따른다: 시각 `t`의 "진행 중 순위/세그먼트 베스트"는 `date_start ≤ t`인 랩만 반영하고, `session_result.duration[]`는 **최종/확정 뷰와 경계 교차검증에만** 사용한다.

---

## 2. Acceptance Criteria (testable)

> **AC 게이트:** 단위/통합 테스트 + 실 OpenF1 1회 스모크(메모리 `feedback_real_api_smoke_test`) + dev-server 시각 검증(프로젝트 CLAUDE.md, 메모리 `feedback_dev_server_verification`).

**세션 구분**
- [ ] `resolveSessionKind(session_type, session_name)` 가 5종을 정확히 매핑 — Sprint Shootout(2023)·Sprint Qualifying(2024+)·Sprint·Race·Practice 1/2/3 모두 테이블 기반 테스트 통과.
- [ ] 기존 `normalizeSessionType` ([searchFilter.ts:27-35](../../src/main/derived/searchFilter.ts#L27-L35)) 가 새 SSOT에 위임하며 main 페이지 필터 동작 회귀 없음.

**세그먼트 재구성 (실 세션 기준)**
- [ ] 알려진 2024 Qualifying `session_key`에서 `reconstructSegments`가 정확히 3개 세그먼트와 시간 경계를 반환하고, 각 세그먼트 멤버십 크기가 `session_result.duration[]` 배열 길이 분포(예: 20/15/10)와 일치.
- [ ] 세그먼트별 드라이버 베스트랩이 `session_result.duration[]` 값과 epsilon(1e-3) 내 일치 (out/in 랩 제외 후).
- [ ] Sprint Qualifying(또는 Sprint Shootout) `session_key`에서도 3 세그먼트 재구성 성공 (짧은 제한시간 12/10/8분).
- [ ] `SEGMENT_DURATIONS_MIN`이 `qualifying`=[18,15,12], `sprint_qualifying`=[12,10,8]를 반환하고, SegmentProgress 카운트다운이 kind별로 올바른 값을 SSOT에서 읽음(분 리터럴 산재 부재 단정).

**녹아웃/컷라인 (2026 증빙)**
- [ ] 컷라인 진출 인원이 **상수가 아니라 데이터에서 파생**됨을 단정하는 테스트(코드에 `15`/`10`/`5` 리터럴로 분기 금지).
- [ ] 합성 22-엔트리 fixture에서 컷라인이 올바른 위치에 생성됨 (2026 그리드 증빙).

**랩 분류**
- [ ] `is_pit_out_lap===true`인 모든 랩이 OUT으로 플래그되고 세그먼트 베스트 산정에서 제외.
- [ ] In lap(해당 랩에 pit 레코드)이 IN으로 분류.

**미래 누설 zero**
- [ ] Q1 중간 시각 `t`의 스냅샷에서 순위/세그먼트 베스트가 `date_start ≤ t` 랩만 반영하고, Q2/Q3 데이터·`session_result` 최종값이 노출되지 않음(스냅샷 테스트).

**회귀 방지 (핵심 리스크)**
- [ ] Race/Sprint/Practice 대시보드가 기존과 동일하게 렌더(기존 dashboard 테스트 통과 + race 리플레이 시각 스냅샷 무변화).

**시각 검증**
- [ ] dev-server에서 실제 Qualifying 리플레이 URL을 열어 타워·세그먼트 진행바·컷라인·세그먼트 베스트 보드·라이브맵 미니섹터를 육안 확인.

---

## 3. Architecture

### 3.1 Session-kind 해석 (SSOT)
신규 `src/shared/sessionKind.ts`:
```ts
export type SessionKind = 'practice' | 'qualifying' | 'sprint_qualifying' | 'sprint' | 'race';
export function resolveSessionKind(sessionType: string, sessionName: string): SessionKind;
```
- `session_type`+`session_name` 둘 다 사용. 기존 `normalizeSessionType`은 이 함수에 위임(중복 제거).
- `isQualifyingFamily(kind)` = `qualifying | sprint_qualifying` 헬퍼.
- **`SEGMENT_DURATIONS_MIN` — 세그먼트 제한시간 SSOT(분).** Qualifying과 Sprint Qualifying은 시간이 **다르다**:

  | kind | Q1/SQ1 | Q2/SQ2 | Q3/SQ3 |
  |---|---|---|---|
  | `qualifying` | 18 | 15 | 12 |
  | `sprint_qualifying` | 12 | 10 | 8 |

  (Sprint Shootout 2023도 12/10/8 동일.) 카운트다운·세그먼트 길이 계산은 **이 테이블만 참조** — 패널/파생에 분(分) 리터럴 산재 금지(CLAUDE.md §2 단순성·SSOT).

### 3.2 대시보드 컴포지션 레이어 (요구 B의 핵심)
현재 `DashboardApp`은 패널 구성을 하드코딩 ([DashboardApp.tsx:91-146](../../src/dashboard/DashboardApp.tsx#L91-L146)). **프로파일 레지스트리** 도입:

신규 `src/dashboard/profiles/`:
- `types.ts` — `DashboardProfile`: 그리드 area 별 어떤 패널을 렌더할지 + 세션별 변형 패널 지정 + (선택) 그리드 템플릿 오버라이드.
- `defaultProfile.ts` — 현재 Race/Practice 레이아웃을 **그대로** 재현(회귀 안전 기준선).
- `qualifyingProfile.ts` — Leaderboard→QualifyingTower, SessionProgress→SegmentProgress, +SegmentBestBoard, +KnockoutPanel, TyreStrategy 강등/대체.
- `index.ts` — `resolveProfile(kind): DashboardProfile`.

`DashboardApp` 리팩터: `resolveProfile(resolveSessionKind(...))` 결과를 읽어 슬롯별 컴포넌트를 매핑 렌더. **기본 분기는 default 프로파일** → 비-퀄리 세션 회귀 0.

> 설계 원칙(CLAUDE.md §2 단순성): 프로파일은 "어떤 패널을 어느 슬롯에"만 선언하는 얇은 매핑. 패널 자체 로직은 패널 안에 둔다. 범용 레이아웃 엔진을 만들지 않는다(현 2종만 필요).

### 3.3 퀄리파잉 파생 모듈 (`src/dashboard/derived/`)
1. **`qualifyingSegments.ts`** — 핵심.
   - 경계: `race_control` 레코드의 `qualifying_phase`(1/2/3) 변화 + RED/GREEN/CHEQUERED 플래그로 각 세그먼트 `[startMs,endMs]` 도출 (PRIMARY).
   - 보강/폴백: race_control 공백 시 랩 `date_start` 활동 클러스터링(전 차량 피트 정지 구간) (SECONDARY).
   - 멤버십(최종): `session_result.duration[]` 길이로 각 드라이버 도달 세그먼트 확정 (확정 뷰 전용).
   - 진행 중(시각 t): `date_start ≤ t` 랩을 경계 윈도우에 매핑 → 세그먼트별 드라이버 베스트(미래 누설 zero).
   - 출력: `{ segments: SegmentInfo[], lapPhaseOf(lap): 1|2|3|null, confidence: 'phase'|'clustered' }`.
2. **`knockout.ts`** — 컷라인.
   - 진출 인원 = 다음 세그먼트 멤버십 크기(데이터 파생) → 2026 자동 대응.
   - 라이브 프로비저널(다음 세그먼트 미발생)용 `KNOCKOUT_CONFIG[year]` 폴백은 **스텁만** (라이브 단계로 연기). 리플레이는 항상 데이터 파생.
   - 출력: `{ cutlinePosition, knockoutZone: Set<driver>, gapToCutline(driver) }`.
3. **`qualiLapClass.ts`** — `classify(lap, pitRecords): 'out'|'in'|'flying'|'incomplete'`.
   - out = `is_pit_out_lap`. in = 해당 랩 pit 레코드 존재. flying = 그 외 유효 `lap_duration`. 베스트 산정은 flying만.

### 3.4 퀄리파잉 패널 (`src/dashboard/panels/qualifying/`)
- **`QualifyingTower.tsx`** — 리더보드 변형. 정렬=현재 세그먼트 베스트(레이스 position 아님). 컬럼: P · DRV(+OUT/flying 마커) · SEG BEST · GAP(컷라인까지/리더까지) · LAST(+미니섹터 바) · TYR. 녹아웃 존 행 음영 + 컷라인 구분선.
- **`SegmentProgress.tsx`** — SessionProgress 대체. Q1/Q2/Q3 3-pill(활성 강조) + 세그먼트 카운트다운. **제한시간은 `SEGMENT_DURATIONS_MIN[kind]` SSOT 참조**(Q 18/15/12 vs SQ 12/10/8 — kind별 자동 분기). red flag 보정은 best-effort 표기.
- **`SegmentBestBoard.tsx`** — Q1/Q2/Q3 3열, 각 열 드라이버별 베스트랩. 보라=세션 베스트.
- **`KnockoutPanel.tsx`** — "DROP ZONE": 현재 컷라인 아래 드라이버 + 진출에 필요한 갭. (타워에 접합 가능 — 단순화 시 타워 내 섹션으로)

### 3.5 퀄리파잉 라이브맵 변형
- 플라잉 랩 드라이버 마커 강조 vs out/in 랩 디밍.
- `segments_sector_*` 코드로 미니섹터 색칠(기존 `LiveMapRenderer`에 per-driver lap-state 채널 추가).
- 본 항목은 퀄리 단계 내 최후순위(Phase 3) — 패널이 먼저 가치 제공.

---

## 4. Implementation Steps (phased)

> 각 Phase 종료마다 검증 게이트 통과 후 다음 Phase. Phase 0/1은 UI 무변화/회귀 안전, Phase 2/3에서 시각 게이트.

### Phase 0 — Foundation (UI 무변화, 회귀 안전)
1. `src/shared/sessionKind.ts` 신규 — `resolveSessionKind` + `isQualifyingFamily`. → verify: 5종 테이블 단위 테스트.
2. `normalizeSessionType` ([searchFilter.ts:27-35](../../src/main/derived/searchFilter.ts#L27-L35)) 가 신규 SSOT 위임. → verify: main 필터 기존 테스트 통과.
3. `RaceControlRecord`에 `qualifying_phase: number | null` 추가 ([openf1Types.ts:116-127](../../src/shared/openf1Types.ts#L116-L127)) + Live/Replay DataSource fetch가 필드 보존하는지 확인. → verify: 타입 컴파일 + 실 세션 1회 스모크로 값 존재 확인.
4. `src/dashboard/profiles/` 도입 + `DashboardApp` 리팩터(default 프로파일=현 레이아웃). → verify: 기존 dashboard 테스트 통과 + race 리플레이 시각 스냅샷 무변화.

### Phase 1 — 퀄리파잉 파생 코어 (UI 무변화)
5. `qualifyingSegments.ts` (경계=qualifying_phase, 멤버십=session_result 배열, 진행중=시간 컷 랩). → verify: 실 2024 Quali session_key 단위 테스트(세그먼트 3개·멤버십 크기 일치).
6. `knockout.ts` (데이터 파생 컷라인 + 22-엔트리 합성 fixture). → verify: 상수 분기 부재 단정 + 2026 fixture.
7. `qualiLapClass.ts` (out/in/flying). → verify: is_pit_out_lap·pit 결합 테스트.
8. 미래 누설 스냅샷 테스트(Q1 중간 t). → verify: Q2/Q3·최종값 미노출.

### Phase 2 — 퀄리파잉 패널 (시각 게이트)
9. `QualifyingTower` · `SegmentProgress` · `SegmentBestBoard` · `KnockoutPanel` 구현.
10. `qualifyingProfile`에 패널 배선 + `resolveProfile` 연결.
11. **dev-server 시각 검증** — 실제 Quali 리플레이 URL에서 4개 패널 육안 확인(프로젝트 CLAUDE.md 게이트).

### Phase 3 — 퀄리파잉 라이브맵 변형 (시각 게이트)
12. 플라잉/out 랩 상태 + 미니섹터 색칠을 `LiveMapRenderer`에 추가.
13. **dev-server 시각 검증** — 미니섹터 색·플라잉 강조 확인.

### Phase 4 — 후속(현 범위 밖, 별도 승인)
- Race/Sprint/Practice 프로파일 특화, 라이브 모드 세그먼트 검출, 2026 라이브 프로비저널 `KNOCKOUT_CONFIG`.

---

## 5. Risks & Mitigations

| # | 리스크 | 완화 |
|---|---|---|
| R1 | **프로파일 리팩터로 기존 대시보드 회귀** | default 프로파일이 현 레이아웃을 1:1 재현; 기존 테스트 + race 리플레이 시각 스냅샷 before/after 비교 (AC) |
| R2 | **red-flag/중단된 퀄리에서 경계 오검출** | qualifying_phase가 PRIMARY(플래그에 강건); session_result 멤버십으로 교차검증; 경계 불확실 시 `confidence:'clustered'` 표기. 알려진 red-flag 퀄리로 테스트 |
| R3 | **미래 누설(반복 버그군)** | 진행 중 뷰는 `date_start ≤ t` 랩만; session_result는 확정 뷰 전용. `driverOutAt` 규율 복제. 전용 스냅샷 테스트(AC) |
| R4 | **`qualifying_phase` 필드가 repo 타입/fetch에 부재** | Phase 0-3에서 타입 추가 + DataSource 보존 확인 + 실 세션 스모크로 값 존재 검증 |
| R5 | **`session_result.duration`가 number\|number[]\|null** | 비배열/null 가드; 누락 시 시간 컷 랩에서 세그먼트 베스트 폴백 |
| R6 | **2026 녹아웃 수 미확정** | 리플레이는 데이터 파생이라 무관; 라이브 프로비저널만 영향 → Phase 4로 연기. 정확한 2026 분할은 FIA 스포팅 규정 확인 시점에 config화 |
| R7 | **Sprint Qualifying 데이터 누락 사례**(2024 일부 섹터/랩 누락, [api-ref:546](../../docs/openf1-api-reference.md#L546)) | 누락 랩 graceful degrade(— 표시); 세그먼트 멤버십은 session_result 우선 |
| R8 | **intervals historical 불완전**([api-ref:360](../../docs/openf1-api-reference.md#L360)) | 퀄리 GAP은 인터벌이 아니라 랩 베스트 기반으로 계산(컷라인까지 갭) |

---

## 6. Verification Steps

1. `npm test` (또는 프로젝트 테스트 러너) — Phase별 신규 단위/통합 테스트 + 기존 회귀 테스트 green.
2. **실 OpenF1 스모크**(메모리 게이트): 알려진 2024 Quali session_key 1건에 대해 `qualifying_phase`·`session_result.duration[]` 실제 응답 확인.
3. **dev-server 시각 검증**(메모리 게이트): Quali·SQ 리플레이 URL에서 타워/세그먼트 진행바/컷라인/베스트 보드/라이브맵 육안 확인.
4. Race 리플레이 시각 스냅샷 무변화로 회귀 부재 확인.
5. 형제 컴포넌트 일관성(메모리 `feedback_sibling_consistency`): Leaderboard↔QualifyingTower, SessionProgress↔SegmentProgress 구조 cross-check.

---

## 7. Open Questions (실행 전 확인 권장)

1. **세그먼트 카운트다운 정확도**: red-flag로 세그먼트가 연장/단축될 때, 표준 시간(18/15/12) 기준 카운트다운이면 약간 부정확할 수 있음. (a) 표준시간+"approx" 표기, (b) race_control CHEQUERED로 실제 종료시각 보정 — 어느 쪽 선호?
2. **KnockoutPanel을 독립 패널로 vs QualifyingTower 내부 섹션**으로? (단순성 측면에선 타워 내 음영+구분선만으로 충분할 수 있음)
3. **테스트 fixture 소스**: 실 OpenF1 응답을 캡처해 고정 fixture로 둘지(권장, 결정적), 아니면 라이브 fetch 스모크만 둘지.

---

## 8. Changelog
- v1 (2026-06-02): 초안. 코드/문서 라인 검증 후 작성. `race_control.qualifying_phase` 및 `session_result.duration[]` 발견으로 세그먼트 재구성을 클러스터링 추정 → 권위 신호 기반으로 강화. 2026 그리드는 데이터 파생 컷라인으로 자동 대응.
- v2 (2026-06-02): 세그먼트 제한시간을 `SEGMENT_DURATIONS_MIN` SSOT 상수로 명시(Qualifying 18/15/12 vs Sprint Qualifying 12/10/8). 인라인 산재 → kind별 단일 테이블 참조로 못박음. AC 추가.
