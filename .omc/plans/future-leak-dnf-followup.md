# 미래 누설 검수 + DNF/out 표시 시점 개선 plan (구현 완료·커밋 대기)

**Status**: `implemented` — ralph 구현·검증 완료 (2026-06-02). 커밋은 사용자 요청 시.
**Generated**: 2026-06-02
**Sources**: 사용자 보고("out '✕' 가 사건 발생 이전에 미리 표시됨") + 전 프로젝트 미래 누설 검수(Explore 에이전트 전수 스윕 + 코드 확인).
**Base plans**: [dashboard-implementation.md](./dashboard-implementation.md) (§4.5 미래 누설 zero·인수18 SSOT) · [dashboard-layout-improvements.md](./dashboard-layout-improvements.md)
**불변 가드**: §4.5 미래 누설 zero(인수17/18 — 컴포넌트 raw `date`/`date_start` 비교 금지, 시간 컷은 DataSource 메서드만), 인수13/16 섹터색 SSOT, 인수2 단일 시계.

---

## 사용자 결정 사항

- **요청**: out '✕'(및 유사 마커)이 **실제 사건 발생 시점 이전에 미리 표시되는** 누설을 전 프로젝트에 대해 검수 → 추가 사례 확인 → 개선 plan.
- **(Q) ✕ 노출 시점** → **실제 리타이어 시점** (Option B): `number_of_laps` 기반 time-cut 파생 신호로 그 드라이버가 마지막 랩을 완료한 시점 ~에 ✕ 등장. DNS 는 세션 시작부터. (대안 A 세션종료 게이트 / C staleness 는 비채택.)

---

## 1. 검수 결과 (전 프로젝트 미래 누설 스윕)

전 패널·디테일·맵 렌더러를 시간 컷 계약 기준으로 분류. **확정 누설은 1건뿐**, 나머지는 모두 DataSource 시간 컷 메서드 경유로 안전.

### 1.1 시간 컷 계약 (SSOT = [DataSource.ts](../../src/shared/DataSource.ts), 구현 [dashboardQueries.ts](../../src/map/dashboardQueries.ts))

| 메서드 | 시간 컷 | 비고 |
|---|---|---|
| `getLatestBefore(ep,t,f)` / `getAllBefore` / `getLapAt` / `getCompletedLapsBefore` / `getAggregateBefore` | ✅ `date ≤ t` | 미래 누설 zero 보장 |
| `getStintForLap(driver, lap)` | ⚠️ undated(lap-keyed) | 호출처가 `1..currentLap`(시간 컷 파생)만 순회 → 안전 |
| **`getSessionResult(driver)`** | ❌ **undated(세션 1회 산출)** | [DataSource.ts:133-139](../../src/shared/DataSource.ts#L133-L139) 명시. 표시 게이트는 **호출처 책임** |

### 1.2 확정 누설 (1건)

| 위치 | 코드 | 메커니즘 | 증상 |
|---|---|---|---|
| **⑤ Leaderboard DNF ✕** [Leaderboard.tsx:73](../../src/dashboard/panels/Leaderboard.tsx#L73) → 렌더 [:147-149](../../src/dashboard/panels/Leaderboard.tsx#L147-L149) | `const dnf = ds.getSessionResult(driver_number)?.dnf ?? false;` | (a) undated accessor **게이트 없음** | 리플레이에서 ✕ 가 **t=0 부터** 표시 — 그 드라이버가 실제 리타이어하기 전에 미리 노출. **사용자 보고 버그.** |

- **라이브 영향 없음**: [LiveDataSource.ts:257-260](../../src/map/LiveDataSource.ts#L257-L260) — `getSessionResult` 가 항상 `null`(session_result 미폴링). 누설은 **리플레이 전용**(사용자가 본 `/replay/9472` 와 일치).
- 대조: [SessionResult.tsx](../../src/dashboard/detailPanel/SessionResult.tsx) 는 동일 accessor 를 쓰되 `t ≥ session.date_end` 게이트로 가림 → 누설 아님(단, 게이트가 "세션 전체 종료"라 거칠다).

### 1.3 "이벤트 티커" 확인 — 누설 아님

사용자가 함께 언급한 ⑦ 이벤트 티커는 [EventTicker.tsx](../../src/dashboard/panels/EventTicker.tsx) `getAllBefore('race_control', t, …)` 로 시간 컷됨. ④ RaceControlBanner·EventBroadcast 도 동일. **티커 자체는 미래 이벤트를 표시하지 않음** — 사용자가 본 "사건 전 표시"는 같은 행에 뜨는 Leaderboard ✕(1.2)로 판단. (티커가 ✕ 옆에 인접 배치되어 혼동 가능.)

### 1.4 안전 확인된 나머지 (누설 0)

⑥ TyreStrategy·② SessionProgress·⑧ FastestLapBadges(`getAggregateBefore`)·⑨ WeatherMini·디테일 전부(CurrentState/RecentLapsTable/PitHistory/StintHistory)·맵 렌더러 — 모두 시간 컷 메서드 또는 `1..currentLap` 게이트 경유. `useAggregateResults` 는 시크 시 t 까지 누적만 반영([useAggregateResults.ts](../../src/dashboard/shared/useAggregateResults.ts), 인수8/14). `activeFlags`/`EventBroadcast` 의 raw `date` 비교는 **이미 `getAllBefore(t)` 로 필터된 입력**에만 적용(계약상 안전). → **추가 확정 누설 없음.**

---

## 2. 설계 — time-cut "retired by t" 파생 신호

### 2.1 신규 derived 헬퍼 `src/dashboard/derived/driverOutStatus.ts`

[currentLap.ts](../../src/dashboard/derived/currentLap.ts)/[activeFlags.ts](../../src/dashboard/derived/activeFlags.ts) 와 동일 패턴(순수 함수, DataSource + t 입력, 시간 컷은 DataSource 메서드만).

```ts
import type { DataSource } from '../../shared/DataSource';

export type OutKind = 'dnf' | 'dns' | 'dsq' | null;

/**
 * 드라이버가 display_time(t) 시점에 "out" 인지 — 미래 누설 zero.
 * undated session_result 의 dnf/dns/dsq + number_of_laps 를 **시간 컷된 완료 랩**과 결합해
 * "실제 리타이어 시점 이후"에만 non-null. (인수18: 컴포넌트 raw date 비교 없이 헬퍼가 단일 진입점.)
 */
export function driverOutAt(ds: DataSource, driverNumber: number, t: Date): OutKind {
  const res = ds.getSessionResult(driverNumber);
  if (!res) return null;                       // 결과 없음(라이브 포함) → 마커 없음
  if (res.dns) return 'dns';                   // 미출발 → 세션 시작부터 out
  // dnf/dsq: 그 드라이버가 자기 최종 완료 랩(number_of_laps)에 도달한 뒤에만 노출.
  // 최신 완료 랩 1건만 조회(O(1)) — Leaderboard 가 이미 동일 호출을 함(중복 비용 0).
  if ((res.dnf || res.dsq) && res.number_of_laps != null) {
    const lastLapNum = ds.getCompletedLapsBefore(driverNumber, t, 1)[0]?.lap_number ?? 0;
    if (lastLapNum >= res.number_of_laps) return res.dnf ? 'dnf' : 'dsq';
  }
  return null;                                 // 아직 리타이어 전 / number_of_laps 불명 → 보수적으로 숨김
}
```

**판정 근거**: DNF 드라이버는 `number_of_laps`(완주 전 완료 랩 수)까지만 lap record 가 존재 → `getCompletedLapsBefore(driver,t)` 의 최신 `lap_number` 가 `number_of_laps` 에 도달하는 순간이 곧 리타이어 시점. 그 전 t 에선 `lastLapNum < number_of_laps` → 숨김.

**세부 규칙**
- **DNS** (`dns=true`): 한 바퀴도 안 뜀 → 세션 시작부터 out (정상, 누설 아님).
- **DNF** (`dnf=true`): 최신 완료 랩 ≥ `number_of_laps` 일 때만. (랩 도중 리타이어 → 최대 ~1랩 이른 노출, 허용 범위; t=0 노출 대비 압도적 개선.)
- **DSQ** (`dsq=true`): 본 plan 에선 dnf 와 동일하게 `number_of_laps` 기준 노출. *Caveat*: 실제 실격은 종종 레이스 후 판정 → 약간 이르게 보일 수 있음(결정 미루기 §6 에 RC/`date_end` 게이트 개선 기록). 단 "트랙에 있던 상태"를 미래 누설하진 않음.
- **완주 드라이버** (`dnf=false`): `null` → 마커 없음.
- **`number_of_laps == null` + dnf**: 보수적으로 `null`(누설 0, 마커 없음). RC 메시지 기반 보강은 §6.

### 2.2 적용 지점

1. **⑤ Leaderboard** ([Leaderboard.tsx:73](../../src/dashboard/panels/Leaderboard.tsx#L73), [:88](../../src/dashboard/panels/Leaderboard.tsx#L88), [:147-149](../../src/dashboard/panels/Leaderboard.tsx#L147-L149)):
   - `const dnf = ds.getSessionResult(driver_number)?.dnf ?? false;` → `const out = driverOutAt(ds, driver_number, t);`
   - row 필드 `dnf` → `out: OutKind`. 렌더: `out != null` 일 때 ✕(dnf/dsq) / dns 표식. `title`/`aria-label` 로 종류 구분(예: `out==='dns' ? 'DNS' : out==='dsq' ? 'DSQ' : 'DNF'`).
   - 정렬·기타 마커(ⓕ/ⓟ) 불변.
2. **(선택, 형제 일관)** 디테일 ③.2 CurrentState 또는 SessionResult 에 동일 `driverOutAt` 로 "RETIRED (lap N)" 조기 표시 — **본 plan 의 1차 범위 밖**(SessionResult 는 이미 누설 없음). 일관성 위해 후속 가능(§6).

### 2.3 재발 방지 가드 (전 프로젝트 "개선 방법")

- **G-헬퍼 SSOT**: UI 의 out-status 진입점을 `driverOutAt` 하나로 통일. `getSessionResult` 직접 호출은 **`derived/driverOutStatus.ts` + `detailPanel/SessionResult.tsx`(게이트 보유) 만** 허용.
- **G-가드 테스트** (기존 invariant 테스트 패턴 = [DashboardSeek.test.tsx](../../src/dashboard/__tests__/DashboardSeek.test.tsx) 와 동급): `src/dashboard/__tests__/futureLeakGuard.test.ts` — `src/dashboard/panels/**`·`detailPanel/**` 를 스캔해 `getSessionResult(` 사용처가 화이트리스트(위 2개)뿐임을 단언. 신규 ungated 사용 시 실패.

---

## 3. 작업 그룹 / 단계

> 표기: **[U]** vitest+jsdom 단위, **[T]** tsc/build 0 error, **[V]** dev-server 시각 게이트(USER, `/replay/9472`).

1. **신규 `derived/driverOutStatus.ts`** + 단위 테스트 `derived/__tests__/driverOutStatus.test.ts`. → 검증 [U][T].
2. **Leaderboard 적용** — §2.2.1 교체 + row 타입 `dnf:boolean`→`out:OutKind` + 렌더/`title`. → 검증 [U][T].
3. **가드 테스트** `__tests__/futureLeakGuard.test.ts` (§2.3). → 검증 [U].
4. **회귀 테스트** — Leaderboard 테스트에 DNF 시나리오(fake ds: 특정 드라이버 `number_of_laps=K` + 완료랩 시계열) 추가. → 검증 [U].
5. **(선택)** 디테일 조기 "RETIRED" 표시(§2.2.2) — 1차 범위 밖, 결재 시 별도.
6. 전체 `npx vitest run` + `npx tsc --noEmit` → architect 검증 → deslop → [V] 사용자 시각 게이트.

---

## 4. 인수 기준 (Acceptance Criteria)

- **AC1 [U]** `driverOutAt`:
  - dnf 드라이버(`number_of_laps=N`): 완료랩 최신 `lap_number < N` 인 t → `null`; `≥ N` 인 t → `'dnf'`.
  - dns → 항상 `'dns'`(t=0 포함).
  - dsq(`number_of_laps=M`) → `lap_number ≥ M` 후 `'dsq'`.
  - 완주(`dnf=false`) → `null`. `getSessionResult`=null → `null`. dnf+`number_of_laps=null` → `null`(보수).
- **AC2 [U]** Leaderboard: DNF 드라이버 fake ds 에서 **리타이어 랩 이전 t → 해당 행에 ✕ 없음**, 이후 t → ✕ 표시. **후진 시크 시 ✕ 재소멸**(미래 누설 zero).
- **AC3 [U]** 라이브 모드(`getSessionResult`→null) → ✕ 절대 미표시(기존 동작 회귀).
- **AC4 [U]** 가드 테스트: `panels/**`·`detailPanel/**` 의 `getSessionResult(` 사용처 = {`derived/driverOutStatus.ts`(import 경유), `detailPanel/SessionResult.tsx`} 화이트리스트뿐.
- **AC5 [U]** DashboardSeek 류 통합: ✕ 가 리타이어 랩 경계에서 hidden→shown, 다른 패널과 시크 일관.
- **AC6 [T]** `npx tsc --noEmit` 0 error + 전체 vitest 그린.
- **AC7 [V→USER]** `/replay/9472` 에서 알려진 DNF 드라이버를 리타이어 전/후로 스크럽 → ✕ 가 **시작이 아니라 ~리타이어 시점**에 등장. dns/dsq 표식 가독성.

---

## 5. 위험 / 완화

| 위험 | 완화 |
|---|---|
| `number_of_laps` 의미가 "완료 랩"이 아닐 가능성 | OpenF1 session_result.number_of_laps = 드라이버 완료 랩 수. 랩 도중 리타이어 → 최신 *완료* 랩 기준이라 최대 ~1랩 이른 노출(허용). [openf1Types.ts:145-156](../../src/shared/openf1Types.ts#L145) 확인됨. |
| 성능 — row 당 추가 쿼리 | `getCompletedLapsBefore(driver,t,1)` 1건만 — Leaderboard 가 이미 `last` 로 동일 호출([Leaderboard.tsx:63](../../src/dashboard/panels/Leaderboard.tsx#L63)) → 사실상 중복 0(헬퍼에 last 주입 옵션도 가능). |
| DSQ 후판정 부정확 | dnf 동일 처리 + caveat 문서화. 정밀화(RC/`date_end` 게이트)는 §6. |
| 형제 일관성 — 디테일은 여전히 `date_end` 게이트 | 1차는 Leaderboard 만(사용자 보고 지점). 디테일 조기표시는 §6 선택. [[feedback_sibling_consistency]] 인지. |

## 6. 결정 미루기 (범위 밖)

- 디테일(CurrentState/SessionResult)의 조기 "RETIRED (lap N)" 표시 — 형제 일관 위해 후속.
- DSQ 를 레이스-후 판정 시점(`t ≥ date_end` 또는 RC 실격 메시지)으로 정밀화.
- `number_of_laps=null` DNF 를 RC 메시지("CAR n STOPPED/RETIRED")로 보강.
- 라이브 모드 out 감지(session_result 부재) — 위치/랩 staleness 또는 RC 기반(별도 설계).
- 커스텀 ESLint 규칙으로 `getSessionResult` ungated 사용 정적 차단(가드 테스트보다 무겁움 — 필요 시).

## 7. 변경 파일 요약

**신규**: `src/dashboard/derived/driverOutStatus.ts`, `src/dashboard/derived/__tests__/driverOutStatus.test.ts`, `src/dashboard/__tests__/futureLeakGuard.test.ts`.
**수정**: `src/dashboard/panels/Leaderboard.tsx`(getSessionResult→driverOutAt, row 타입/렌더), `src/dashboard/panels/__tests__/Leaderboard.test.tsx`(DNF 회귀).
**불변(가드)**: `DataSource` 인터페이스·`getSessionResult` 시그니처·SectorBar/sectorColor·EventTicker/RaceControlBanner(이미 안전).

## Changelog

- 2026-06-02 generated from /oh-my-claudecode:plan. 전 프로젝트 미래 누설 검수(확정 1건=Leaderboard DNF ✕, 나머지 안전, 티커 누설 아님). 사용자 Q=실제 리타이어 시점(Option B). 상태 pending approval.
- 2026-06-02 **구현 완료** — ralph (사용자 "구현 시작"):
  - 신규 `derived/driverOutStatus.ts` (`driverOutAt`, OutKind) — undated session_result 를 `getCompletedLapsBefore(n,t,1)` 와 결합, `lastLapNum ≥ number_of_laps` 일 때만 'dnf'/'dsq', dns 는 시작부터. 미래누설 zero.
  - Leaderboard: `getSessionResult().dnf` 직접 사용 → `driverOutAt(ds,n,t)` (`row.out:OutKind`, `lb-out-<n>` testid + title/aria). 라이브는 getSessionResult=null → 마커 없음.
  - 신규 가드 테스트 `__tests__/futureLeakGuard.test.ts` — panels/**·detailPanel/** 의 `getSessionResult(` 사용을 화이트리스트({SessionResult.tsx}) 로 제한(재발 방지).
  - 검증: vitest **887/887**(+12), tsc 0. architect(opus) **APPROVED**(off-by-one 없음·DSQ 보수적·가드 sound, nit=문자열스캔 한계 주석 추가함). deslop no-op.
  - 커밋 안 함(사용자 요청 시). **[V] 사용자 게이트**: `/replay/9472` 에서 알려진 DNF 드라이버를 리타이어 전/후 스크럽 → ✕ 가 시작이 아니라 ~리타이어 시점에 등장 확인.
