# 대시보드 레이아웃·디자인 개선 plan (pending approval)

**Status**: `pending approval` — 사용자 결재 전, 코드 변경 없음.
**Generated**: 2026-06-02
**Sources**: dev-server 스크린샷(LAP 35, Lando NORRIS 디테일 열림) + 사용자 6개 개선 요청 + 코드 감사.
**Base plans**: [dashboard-implementation.md](./dashboard-implementation.md) (§/①~⑩·인수기준 SSOT, 단계 1-12 완료) · [live-map-implementation.md](./live-map-implementation.md) · [live-map-followup.md](./live-map-followup.md)
**불변 가드**: §4 시간정렬(`display_time` 단일 진실), §4.5 미래 누설 zero(인수17/18 — 컴포넌트 raw date 비교 금지, DataSource 메서드만), 인수19 토큰/표준색, Desktop only 1280px+, 인수1 무스크롤, 인수2 단일시계, 인수13/16 섹터색 SSOT, 인수22/23 반응형·모드전환.

## 사용자 결정 사항

- **요청 범위**: 아래 6개 + "전체 레이아웃 조정 시 **live-map 조정도 허용**".
- **(Q1) 리더보드 우선 + 접이식 전략** — ⑤ 리더보드를 주 패널로, ⑥ 타이어 전략은 기본 접힘.
- **(Q2) 상단 알림 = 중요 이벤트만 + 자동 사라짐** — 플래그/SC/적기/체커 등만 상단 슬라이드인 후 ~5s 페이드. ④ Race Control 배너는 현재 상태 표시로 유지.

### 요청 → 작업 그룹 매핑

| # | 요청 | 그룹 |
|---|---|---|
| 1 | 스틴트(타이어 전략) 현재 순위대로 정렬 | **A** |
| 2 | 리더보드가 메인이 되도록(현재 ⑥이 세로 지배) | **B** |
| 3 | 디테일 최근 5랩 + 펼치기로 전체 랩 | **C** |
| 4 | 진행률바+레이스컨트롤 맵 위로, 우측 세로 확보 | **E** |
| 5 | 이벤트 티커 길이 단축 + 상단 알림(F1 중계식) | **D** |
| 6 | 사진 기반 추가 개선(맵 조화·배치) | **B/E/F** (패널 타이틀·구분선·맵 라벨 겹침·컨트롤 위치) |

> 표기: **[U]** vitest+jsdom 단위/렌더, **[T]** tsc/build/lsp 0 error, **[V]** dev-server 시각 게이트(USER, `/replay/9472`).

---

## A. ⑥ 타이어 전략 — 현재 순위 정렬 (#1, est ~30m)

- **현재**: [TyreStrategy.tsx:60](../../src/dashboard/panels/TyreStrategy.tsx#L60) `for (const driverNumber of drivers.keys())` → drivers Map 삽입순. 스크린샷의 NOR/VER/BOR/… 순서가 리더보드(ANT P1…)와 불일치.
- **Fix**: `rows` useMemo 안에서 `ds.getLatestBefore('position', t, { driver_number })?.position` 을 읽어 `DriverRow.sortKey`(없으면 `+Infinity`)로 두고, `out.sort((a,b)=>a.sortKey-b.sortKey)` — 리더보드 [Leaderboard.tsx:89-92](../../src/dashboard/panels/Leaderboard.tsx#L89-L92) 와 동일 패턴. 막대 계산(`stintLapSpans`)·미래 누설 가드 불변(시간 컷은 `getLatestBefore` 가 보장).
- **AC**:
  - **A1 [U]** 동일 fake ds·동일 `t` 에서 `tyre-row-*` DOM 순서 == `lb-row-*` 순서. position 없는 행은 맨 뒤.
  - **A2 [U]** position 시간의존 fake ds 로 `setTime` 전/후 정렬 갱신(미래 position 누설 없음).
  - **A3 [T]** tsc 0 error.
- **위험**: position 읽기 추가 비용 — 이미 `useMemo([ds,t,drivers,currentLap])` 내부라 리더보드와 동일 부하, 무시 가능.

---

## B. 우측 컬럼 재배치 — 리더보드 우선 + ⑥ 접이식 + 패널 타이틀 (#2, #6, est ~2h)

- **현재**: 우측열 `s` 는 ⑤→⑥→⑦ 세로 stack([DashboardApp.tsx:116-130](../../src/dashboard/DashboardApp.tsx#L116-L130)). ⑥ TyreStrategy 22행이 세로를 지배, 리더보드는 위로 밀려 스크롤.
- **Fix**:
  - **신규** `src/dashboard/shared/CollapsibleSection.tsx` — `{ title, defaultOpen?, toggleTestId, children }`, 헤더(타이틀 + ▸/▾) + 본문 토글. `dashboardColors` 토큰만, `useState(defaultOpen ?? false)`. 추측성 옵션 금지(§simplicity).
  - **TyreStrategy** 를 `<CollapsibleSection title="TYRE STRATEGY" defaultOpen={false} toggleTestId="tyre-strategy-toggle">` 로 감싼다(기본 접힘). 내부 막대 렌더 유지, `data-testid="tyre-strategy"` 보존(기존 테스트 호환).
  - **Leaderboard** 상단 "LEADERBOARD" 타이틀 헤더(접이 없음, 항상 펼침). 행/섹터바 로직 불변.
  - **EventTicker** 상단 "EVENTS" 타이틀(압축은 그룹 D).
- **AC**:
  - **B1 [U]** ⑥ 기본 접힘: 초기 렌더에 `tyre-row-*` 없음, `tyre-strategy-toggle` 만 보임.
  - **B2 [U]** 토글 클릭 → `tyre-row-*` 표시, 재클릭 → 숨김.
  - **B3 [U]** `leaderboard` 항상 펼침(접이 토글 없음) + 우측열 상단 위치.
  - **B4 [U]** 세 패널 타이틀(LEADERBOARD/TYRE STRATEGY/EVENTS) 헤더 존재.
  - **B5 [V]** 1280×800 에서 리더보드 20행이 주 패널, ⑥ 접힘 시 세로 점유 헤더 1줄.
- **위험**: ⑥ 기본 접힘으로 발견성↓ → 명확한 "▸ TYRE STRATEGY" affordance(B1). 기존 `getByTestId('tyre-strategy')` 호환 유지.

---

## C. 디테일 §3.3 — 최근 5랩 + 전체 펼치기 (#3, est ~1h)

- **현재**: [RecentLapsTable.tsx:30-33](../../src/dashboard/detailPanel/RecentLapsTable.tsx#L30-L33) `getCompletedLapsBefore(driverNumber, t, 5)` 고정.
- **Fix**: `getCompletedLapsBefore(driverNumber, t)` (limit 생략 → 전체 완료랩 반환, 확인됨 [dashboardQueries.ts:135](../../src/map/dashboardQueries.ts#L135)) 한 번 호출해 `all` 확보. `const [expanded,setExpanded]=useState(false)`; 표시 = `expanded ? all : all.slice(0,5)`. 테이블 하단 토글 `recent-laps-toggle`: `expanded ? '접기' : `더 보기 (+${all.length-5})``. `all.length>5` 일 때만 노출. 디테일 패널은 이미 `overflowY:auto`([DriverDetailPanel.tsx:44-46](../../src/dashboard/detailPanel/DriverDetailPanel.tsx#L44-L46)).
- **AC**:
  - **C1 [U]** 완료랩 8개 fake ds → 기본 5행만.
  - **C2 [U]** `recent-laps-toggle` 클릭 → 8행 전부, 재클릭 → 5행.
  - **C3 [U]** 완료랩 ≤5 → 토글 미표시.
  - **C4 [U]** 펼침 상태도 미완료 랩 제외(`getCompletedLapsBefore` 경유, 인수17b).
- **위험**: 없음(쿼리 1회, 표시단 slice).

---

## D. ⑦ 이벤트 티커 압축 + 상단 브로드캐스트 (#5, est ~3h, **신규·최고난도**)

### D1. 티커 1줄 압축
- **현재**: [EventTicker.tsx:30](../../src/dashboard/panels/EventTicker.tsx#L30) 메시지 span `flex:1` 만 → 긴 메시지 다줄 wrap(스크린샷 "WAVED BLUE FLAG…TIMED AT 14:00:09" 2~3줄).
- **Fix**: 메시지 span 에 `whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'` + `title={rc.message}`(hover 전체). 5건 유지(컴팩트 3건은 시각 게이트에서 확정, 기본 5).
- **AC**: **D1-AC [U]** 항목이 1줄 클램프 스타일 + `title` 보유.

### D2. 상단 브로드캐스트 (중요 이벤트만 + 자동 사라짐)
- **신규** `src/dashboard/panels/EventBroadcast.tsx` + DashboardApp 마운트(NarrowScreenBanner 처럼 fragment 형제 → 라이브/리플레이 공통).
- **로직**: `useDisplayTime` + `getAllBefore('race_control', t, undefined, 1)` 로 현재 최신 1건 추적. 중요도 분류는 `shared/flagDecoder`의 `FlagKind`(red/yellow/safetycar/chequered) 재사용 — 일상(blue/track-limits/other) 제외. `derived/activeFlags`·`flagDecoder` 기존 함수만(중복 금지).
- **발생 가드**: `useRef` 로 마지막 통지 식별자(date.valueOf()+message). 마운트 시 baseline=현재 최신(초기 무통지). 새 최신 date > 이전(전진) + 중요 + 미통지 → enqueue. 후진 시크(date ≤ 이전) → 무통지.
- **자동 사라짐**: `setTimeout(~5s)` dismiss, 새 이벤트 시 타이머 리셋, 언마운트 clear.
- **시각**: top-center `position:fixed`, 위에서 슬라이드인(자체 keyframes), 플래그별 강조색은 ④와 동일 `FLAG_ACCENT`(인수19 표준색 예외). 기존 `src/main/Toast`(bottom-right·no-auto-dismiss)와 별개 — 재사용 안 함.
- **AC**:
  - **D2-1 [U]** 전진 시크로 YELLOW/RED/SC/체커 새로 지나면 `event-broadcast` 등장.
  - **D2-2 [U]** 일상 메시지(blue/track-limits)에선 미등장.
  - **D2-3 [U]** 후진 시크·초기 마운트에선 미발생(spam 금지).
  - **D2-4 [U]** fake timer ~5s 후 자동 사라짐.
  - **D2-5 [U]** 미래 누설 zero: `getAllBefore('race_control', t)` 만, `t` 이후 이벤트로 미발생.
- **위험**: 시크/마운트 spam → baseline ref + **전진 전용** 가드(D2-3 명시 테스트). 미래 누설 → DataSource 메서드만(D2-5). `DashboardSeek.test.tsx` 패턴 + `vi.useFakeTimers` 재사용.

---

## E. 상단 띠 그리드 재배치 + 컨트롤 정리 (#4, #6, est ~2.5h, **cross-cutting**)

### E1. ②진행률 + ④Race Control 을 라이브맵 위 좌측으로, 우측열 2행 확장
- **현재**: [DashboardApp.tsx:23-34](../../src/dashboard/DashboardApp.tsx#L23-L34) `GRID_CLOSED`/`GRID_OPEN` — `r`(④)이 우측열 위. 우측열 `s` 는 1행 높이.
- **Fix** (템플릿 문자열만 교체, JSX `gridArea` 매핑 불변 — ④는 'r' 그대로, 위치만 좌상단으로):
  - **GRID_CLOSED** (좌블록 7 = p(5)+r(2), 우측 s(5)가 진행률행+맵행 2행 점유):
    ```
    h h h h h h h h h h h h
    p p p p p r r s s s s s
    m m m m m m m s s s s s
    b b b b b b b w w w w w
    ```
  - **GRID_OPEN** (맵 6 / s 3 / d 3):
    ```
    h h h h h h h h h h h h
    p p p p r r s s s d d d
    m m m m m m s s s d d d
    b b b b b b w w w d d d
    ```
  - `s` 컨테이너 `maxHeight`([DashboardApp.tsx:122](../../src/dashboard/DashboardApp.tsx#L122)) 를 2행 점유에 맞춰 재산정(정확값은 E-AC [V]). 하단 b/w 를 맵(7)/우측(5) 경계에 정렬(시각 리듬).
- **AC**:
  - **E1-1 [U]** 마운트 시 ②·④·③맵슬롯·⑤~⑨ 모두 존재(기존 `DashboardApp.test.tsx` 그린).
  - **E1-2 [U]** `selectDriver` 시 `driver-detail` 등장 + 우측 패널 유지(기존 push 테스트 그린).
  - **E1-3 [V]** ②+④ 가 맵 위 좌측 한 행, 우측열이 2행 높이, 1280×800 무스크롤(인수1).
  - **E1-4 [T]** 시크(인수2)·반응형(인수22) 기존 테스트 그린.

### E2. Back / Pause 컨트롤 정리 (#6 — live-map 조정 허용)
- **현재**: Back([LiveMap.tsx:370-377](../../src/live/LiveMap.tsx#L370-L377)) + Pause([LiveMap.tsx:378-399](../../src/live/LiveMap.tsx#L378-L399)) 가 캔버스 위 `position:absolute` 부유 — 스크린샷에서 트랙 좌상단·우측에 떠 배치 부조화.
- **Fix**:
  - **Back → ① 세션 헤더 좌측 통합**: `SessionHeader` 에 optional `onBack?` 추가([SessionHeader.tsx:11-16](../../src/dashboard/panels/SessionHeader.tsx#L11-L16) props + [:59](../../src/dashboard/panels/SessionHeader.tsx#L59) 좌측 클러스터 맨 앞에 ← 버튼). `onBack` plumb: `LiveScreen`/`ReplayScreen` → `DashboardApp(onBack)` → `SessionHeader`. **LiveMap 성공 경로 Back 버튼 제거**, 단 **에러 경로 Back([LiveMap.tsx:343-347](../../src/live/LiveMap.tsx#L343-L347))은 헤더가 없으므로 유지**.
  - **Pause(리플레이)**: 맵 오버레이로 유지하되 Back 이 빠진 좌상단으로 정리/일관 restyle(저위험). 통합 컨트롤 바로의 이동은 ds.pause 노출 plumbing 필요 → 별도(아래 결정 미루기).
- **AC**:
  - **E2-1 [U]** `onBack` 전달 시 SessionHeader 에 back 버튼 렌더 + 클릭 시 콜백.
  - **E2-2 [U]** LiveMap 성공 경로에 중복 Back 없음(에러 경로 Back 회귀 유지).
  - **E2-3 [V]** 라이브/리플레이 양 화면 헤더 좌측 Back 동작, 맵 코너 정돈.
- **위험**: onBack plumbing 이 screens·DashboardApp·SessionHeader·LiveMap 4곳 → 형제 일관성(LiveScreen/ReplayScreen 동일 수정) 체크. LiveMap 기존 onBack 테스트(에러 경로) 회귀 유지.

---

## F. live-map 마커 라벨 declutter (#6 — 맵 가독성, est ~1.5h)

- **현재**: 라벨은 전역 on/off([markerLabelToggle.ts](../../src/map/markerLabelToggle.ts)). 렌더러가 매 마커에 `showLabel: labelOn` 동일 적용([LiveMapRenderer.ts:177-183](../../src/map/LiveMapRenderer.ts#L177-L183)) → 충돌 회피 없음 → 스크린샷 `BOT/AM`·`HAD/SAI`·`BEA/B` 겹침.
- **Fix**: 마커 루프에서 프레임별 `placedLabelRects: Rect[]` 유지. 각 마커의 라벨 chip 사각형(중앙 `canvasPos.x`, `y+radius+labelOffset`, 폭 = `measureText`/fallback)을 계산해, 이미 배치된 rect 와 교차하면 그 마커는 `showLabel=false` 로 그린다(원·번호는 항상). 전역 토글 OFF 면 전부 무라벨(기존 동작).
  - 우선순위(MVP): `buffer.drivers()` 순회 순서 그리디. (선택 드라이버 우선은 selectionStore↔렌더러 결합 필요 → 아래 결정 미루기.)
- **AC**:
  - **F1 [U]** 두 마커를 겹치는 화면 위치로 두고 전역 showLabel=true → 라벨 `fillText` 가 2회가 아닌 1회(번호 2 + 라벨 1). 기존 `LiveMapRenderer.test.ts` 비겹침 케이스(라벨 N회) 회귀 유지.
  - **F2 [U]** 전역 토글 OFF → 라벨 0회(기존 동작 불변).
  - **F3 [V]** /replay/9472 군집 구간에서 라벨 겹침 해소.
- **위험**: hot path(60fps×20) 에 rect 교차 비용 — O(n²) but n≤20, 무시 가능. `measureText` 미구현 환경 fallback 은 markers.ts 와 동일 추정식 사용.

---

## G. 디테일 섹션 구분선 + 마감(회귀·시각 게이트) (#6, est ~1h)

- **Fix**: `DriverDetailPanel`(또는 각 섹션) 섹션 간 `borderTop:1px dashboardColors.border` + 간격 일관화(기존 토큰만, 신규 색 금지). 펼침 랩(그룹 C)으로 하단 여백 감소.
- **AC**:
  - **G1 [U]** 인수13/16 섹터색 SSOT 불변(SectorBar/sectorColor 미변경).
  - **G2 [U]** 인수18 단일 진입점: 신규/수정 컴포넌트에 `record.date`/`date_start` 직접 비교 없음.
  - **G3 [U]** 인수22 반응형·인수23 모드전환 기존 동작 불변.
  - **G4 [V]** 디테일 섹션 구분 가독성·여백 일관.

---

## 추천 실행 순서

안전·고립 → cross-cutting → 마감 순:
1. **A** (타이어 정렬, ~30m) — 가장 작고 고립.
2. **C** (최근랩 펼치기, ~1h) — 디테일 고립.
3. **F** (맵 라벨 declutter, ~1.5h) — 렌더러 고립, dashboard 무관.
4. **B** (우측 컬럼 접이식 + 타이틀, ~2h).
5. **D** (티커 압축 + 상단 브로드캐스트, ~3h) — 신규·최고난도.
6. **E** (그리드 재배치 + Back 헤더 통합, ~2.5h) — screens/header/LiveMap 4곳 cross-cutting, 레이아웃 확정 위해 D 다음.
7. **G** (구분선 + 마감 회귀·시각 게이트).

각 그룹 후 해당 **[U]** 그린 + **[T]** clean. 마지막 **[V]** dev-server `/replay/9472` 사용자 시각 게이트(자체 시각 완료 선언 금지 — [feedback_dev_server_verification](../../memory/feedback_dev_server_verification.md)).

---

## 인증 요건 / 회귀

- 모든 변경 후: `npx vitest run` 전체 그린 + `npx tsc --noEmit` clean + `lsp_diagnostics` 변경 파일 0.
- 라이브/리플레이 **양 화면** 동일 동작(형제 일관성 — [feedback_sibling_consistency](../../memory/feedback_sibling_consistency.md)).
- E/F (live-map·screens 변경) 는 architect 검증 권장(cross-cutting).
- 최종 **[V]** 사용자 시각 게이트 통과 후 마감.

## 변경 파일 요약

**수정**: `panels/TyreStrategy.tsx`(A,B), `panels/Leaderboard.tsx`(B 타이틀), `panels/EventTicker.tsx`(D1,B 타이틀), `detailPanel/RecentLapsTable.tsx`(C), `DashboardApp.tsx`(E1 그리드 + D2 마운트 + onBack 전달), `panels/SessionHeader.tsx`(E2 Back), `live/LiveScreen.tsx`·`live/ReplayScreen.tsx`(E2 onBack plumb), `live/LiveMap.tsx`(E2 성공경로 Back 제거), `map/LiveMapRenderer.ts`(F declutter), `detailPanel/DriverDetailPanel.tsx`(G 구분선).
**신규**: `shared/CollapsibleSection.tsx`(B), `panels/EventBroadcast.tsx`(D2), 대응 `__tests__/*`.
**불변(가드)**: `shared/sectorColors.ts`·`SectorBar.tsx`·`useDisplayTime.ts`·`DataSource` 인터페이스·`markers.ts` 라벨 시각 사양·`src/main/*`.

## 결정 미루기 (deferred / 범위 밖)

- **선택 드라이버 라벨 우선/하이라이트**(§3.7 "selected 노란 링") — 렌더러↔selectionStore 결합 필요. F 는 그리디 declutter 까지만; selected 우선은 별도.
- **Pause/playback 컨트롤을 통합 컨트롤 바로 이동** — ds.pause() 를 DashboardApp 까지 노출하는 plumbing 필요. E2 는 맵 오버레이 정리까지만.
- **티커 컴팩트 3건 / "TIMED AT…" 접미 strip** — 1줄 클램프(D1)로 충분하면 생략, 시각 게이트에서 결정.
- 이전 ralph(단계 8-12) 세션 상태 잔류 — 새 구현 착수 시 `/oh-my-claudecode:cancel` 로 정리 후 진행.

## Changelog

- 2026-06-02 generated from /oh-my-claudecode:plan. 사용자 6개 요청 + live-map 조정 허용. Q1=리더보드 우선+접이식, Q2=중요 이벤트만+자동사라짐. 상태 pending approval.
- 2026-06-02 **Phase 1 구현 완료 (그룹 A, C, F)** — ralph:
  - **A** TyreStrategy 현재 순위(position) 정렬 — getLatestBefore('position') sortKey, 리더보드 패턴 미러 (+1 test)
  - **C** RecentLapsTable 최근 5랩 + "더 보기/접기" 전체 펼침 — getCompletedLapsBefore no-limit, all.slice(0,5) (+3 tests)
  - **F** LiveMapRenderer 마커 라벨 declutter — 프레임별 AABB 겹침 skip(원·번호 항상), markers.ts geometry 미러(measureText 미사용) (+2 tests, 기존 "6회" 테스트 간격 150 으로 갱신)
  - 검증: vitest 858/858 ✓, tsc 0 error. architect(opus) **APPROVED-WITH-NITS** (future-leak clean, sibling-consistent, surgical). deslop = no-op(genuine slop 없음).
  - 커밋 안 함(사용자 미요청 — working tree 에 6파일 변경 대기). 다음 phase: **B → D → E → G** (B5/E/F3/G4 는 dev-server 시각 게이트 필요).
  - architect 이연 nit(차후): chip-width 공유 helper, pit-stopped 라벨 y-offset. 둘 다 sub-pixel·무위험.
- 2026-06-02 **Phase 2 구현 완료 (그룹 B, D)** — ralph:
  - **B** 리더보드 우선 + ⑥ 접이식(기본 접힘) + 패널 타이틀 — 신규 `shared/PanelHeading.tsx`(3× 재사용), TyreStrategy 인라인 collapse(`tyre-strategy-toggle`, 기본 접힘), Leaderboard/EventTicker 타이틀. *CollapsibleSection 추상화는 single-use 라 미생성(인라인 채택) — architect 승인.* 기존 Tyre 테스트 6건 expand-first 갱신 + B1/B2.
  - **D** ⑦ 티커 1줄 클램프(ellipsis+title) + **신규 `panels/EventBroadcast.tsx`** — 중요 플래그(red/yellow/safetycar/chequered)만 상단 슬라이드인 + ~5s 자동 사라짐. 전진-전용 가드(baseline ref, 마운트/후진 무통지), 미래누설 zero(getAllBefore 컷). DashboardApp fragment 형제 마운트(라이브/리플레이 공통). BROADCAST_ACCENT 는 로컬 4종(④와 동일 표준색) — 공유 추출은 이연.
  - 검증: vitest **869/869 ✓**, tsc 0. architect(opus) **APPROVED-WITH-NITS** (인수18 clean — broadcast date 비교는 이벤트 간 전진 판정, 시간 컷은 getAllBefore). deslop = no-op.
  - 커밋 안 함(사용자 미요청 — A/C/F + B/D 누적 변경 working tree 대기).
  - **다음 = E(그리드 ②+④ 맵 위로 + Back 헤더 통합) + G(디테일 구분선) — dev-server 시각 게이트(인수1 무스크롤) 필수 → 시각 확인과 함께 진행 권장.**
- 2026-06-02 **Phase 1-2 커밋 완료** — `f3825c3 feat(dashboard): 레이아웃 개선 (그룹 A·C·F·B·D)` (16파일, 사용자 "커밋 후 다음 phase" 지시).
- 2026-06-02 **Phase 3 구현 완료 (그룹 E, G)** — ralph:
  - **E1** GRID_CLOSED/GRID_OPEN 재배치 — ②진행률(p)+④RaceControl(r) 을 ③맵(m) 위 한 행, 우측열 s(⑤⑥⑦)가 진행률행+맵행 2행 점유. 템플릿 문자열만 교체(gridArea 매핑 불변), 모든 named area 직사각형(architect 프로그램 검증). 하단 b(7)/w(5) 를 맵/우측 경계에 정렬.
  - **E2** Back 을 LiveMap 캔버스 오버레이 → ① SessionHeader 좌측(`header-back`, optional `onBack`)으로 통합. DashboardApp `onBack` 전달, LiveScreen/ReplayScreen 이 DashboardApp+LiveMap 양쪽에 `onBack` 주입(형제 일관). LiveMap 성공경로 Back 제거, **에러경로 Back 유지**(헤더 없는 standalone + Retry 옆 복구 co-location).
  - **G** DriverDetailPanel 헤더 다음 5섹션을 `DetailSection` 래퍼(borderTop 1px `dashboardColors.border` + paddingTop, 5× 재사용)로 감싸 구분선. 신규 색/시간로직 없음(인수13/16/18 불변).
  - 검증: vitest **875/875 ✓**(+6), tsc 0. architect(opus) **APPROVED-WITH-NITS** (양 그리드 직사각형 검증, 성공경로 단일 Back, 형제 일관, 인수18/섹터색 불변, 테스트 non-vacuous). nit 1(LiveMap 주석 부정확) 수정 완료. deslop = no-op(주석 외 genuine slop 없음).
  - 커밋 안 함(E/G 는 **[V] dev-server 시각 게이트(USER) 후 커밋** — 인수1 무스크롤·E1-5·E2-5·G5).
  - **[V] 사용자 확인 체크리스트(`/replay/9472`)**: ①②③④ 상단 배치(②+④ 맵 위 좌측, 우측 리더보드 세로 최대), 1280×800 무스크롤, 헤더 좌측 ← Back 동작(라이브·리플레이), 맵 코너 정돈(Pause 만 남음), 디테일 섹션 구분선 가독성.
