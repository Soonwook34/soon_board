# soon-board 재설계 개요 — 두 경로 비교

> 목표: F1 실시간 타이밍/리플레이 대시보드를 **"화면 먼저(screen-first) → 구현"** 순서로 다시 만든다.
> 아키텍처는 깔끔한 3레이어 MVC: **`api/`(호출) → `store/`(저장) → `view/`(화면)**.
>
> 이 문서는 두 가지 재시작 경로를 나란히 제시한다. 나중에 보고 고르면 된다.
> - **경로 A — 코어 보존 + 뷰만 재작성** (추천)
> - **경로 B — 완전 새 레포 zero-base**

---

## 0. 한눈에 비교

| 항목 | 경로 A · 코어 보존 | 경로 B · 완전 새 레포 |
|---|---|---|
| 데이터 레이어(`shared/`, client, types, DataSource) | **그대로 이식** | 처음부터 재구축 |
| 파생 정적 데이터(`public/`, `scripts/`, `vendor/`) | 그대로 유지 | 새 레포로 복사 |
| 문서(`docs/`, `.omc/plans/`) | 그대로 참조 | 복사 후 참조 |
| git 히스토리 | 유지 | 버림(새로 시작) |
| 미래 누설/퀄리 세그먼트/sentinel 등 도메인 버그 위험 | **낮음**(검증된 코드 재사용) | 높음(재구현) |
| 초기 작업량 | 작음(뷰 + 폴더 재배치) | 큼(전 레이어 + 자산 이전) |
| "완전히 깨끗한 출발"의 심리적 만족 | 중 | 상 |
| 권장도 | ⭐ 추천 | 상황상 필요할 때만 |

**요지:** "깨끗함"은 *빈 레포*가 아니라 *폴더 경계와 규칙*에서 온다. 데이터 레이어는 이 프로젝트에서
가장 어렵고 검증에 시간이 든 부분(아래 §3)이므로, 특별한 이유가 없으면 **경로 A**를 권한다.

---

## 1. 공통 타깃 아키텍처 (두 경로 동일)

```
src/
  api/      # OpenF1 호출만. fetch + 응답 타입. 상태 없음, React 없음.
  store/    # 응답을 받아 저장/버퍼링. DataSource 구현(Live/Replay) + 도메인 store.
  shared/   # 순수 도메인 로직 + 계약(인터페이스/타입). 의존성 없음.
  view/     # 저장된 값으로 화면만. 오직 shared의 DataSource·타입에만 의존.
  main.tsx  # 부트스트랩 + 라우팅(wouter)
```

### 불변 규칙 (이거 하나만 지키면 구조가 깨끗하게 유지된다)

1. **`view/`는 `api/`를 절대 직접 import하지 않는다.** 데이터는 항상 `store/`(= `DataSource` 인터페이스)를 통해서만 읽는다.
2. **`store/`만 `api/`를 부른다.** 화면은 라이브인지 리플레이인지 모른다 — `DataSource` 한 겹으로 가려진다.
3. **`shared/`는 아무것도 import하지 않는다**(외부 라이브러리 제외). 타입과 순수 함수만.
4. 시간 컷은 전부 **`date ≤ t` (등호 포함, 미래 누설 zero)**. 화면은 "지금 시각 t"를 store에 묻고, store가 t 이하의 진실만 돌려준다.

> 선택: `eslint` `no-restricted-imports`로 `view/**` → `api/**` import를 금지하면 규칙이 자동 강제된다.

### 라우팅 (현재 스택 = wouter)

```
/                       → 메인 페이지(시즌 → GP → 세션 선택)
/live/:sessionKey       → 라이브 대시보드(+서킷맵)
/replay/:sessionKey     → 리플레이 대시보드(+서킷맵)
```

---

## 2. 화면 목록 (브리프 문서와 1:1)

| # | 화면 | 브리프 | 비고 |
|---|---|---|---|
| 1 | 메인 페이지 (시즌/GP/세션 선택) | `briefs/01-main-page.md` | 정적 카탈로그(`/seasons/*.json`) 소비 |
| 2 | 레이스 대시보드 (타이밍 메인) | `briefs/02-race-dashboard.md` | 헤더+리더보드+사이드 패널 |
| 3 | 드라이버 디테일 패널 | `briefs/03-driver-detail.md` | 리더보드 행 클릭 시 |
| 4 | 퀄리파잉 대시보드 | `briefs/04-qualifying-dashboard.md` | Q1/Q2/Q3 세그먼트 변형 |
| 5 | 서킷 맵 (라이브 맵) | `briefs/05-circuit-map.md` | location 보간 렌더 |
| 6 | 라이브/리플레이 셸 + 상태 | `briefs/06-live-replay-shell.md` | 시계·스트림 상태·카운트다운 |

첫 화면 프롬프트(메인 페이지)는 `01-first-screen-prompt.md`에 두 변형(A/B)으로 완성돼 있다.

---

## 3. 파일 티어 — 무엇을 가져가고 무엇을 버리나 (두 경로 공통 판단)

### Tier 1 · 코어 (재작성 금지 — 경로 A는 이식, 경로 B는 복사 권장)
이 영역은 실 API 검증과 도메인 함정 회피가 응축돼 있어 **LLM 재구현 시 미묘한 버그가 재발하기 쉽다.**

- `src/shared/openf1Types.ts` — 14개 엔드포인트 응답 타입 (퀄리 `duration`이 `[Q1,Q2,Q3]` 배열 패딩되는 함정 등 포함)
- `src/shared/openf1Client.ts` — rate-limit / CORS / `latest` 처리 호출 모듈 → 새 구조의 `api/`
- `src/shared/DataSource.ts` — 라이브/리플레이 공용 쿼리 계약(미래 누설 zero 의미) → `shared/`
- `src/shared/sessionKind.ts` — 세션 5종 정규화 + 퀄리 세그먼트 제한시간 SSOT
- `src/shared/seasonData.ts`, `env.ts`, `simulatedNow.ts`
- `LiveDataSource` / `ReplayDataSource` 구현(현재 src 내부) → `store/`
- `scripts/`(전체, `_lib` 포함) + `vendor/f1-circuits-svg`
- `public/seasons/*.json`, `public/trackOutlines/*.json`, `data/slm-zones-raw.json`

### Tier 2 · 설계 입력 (design 단계에 먹일 자료)
- `docs/openf1-api-reference.md` — API 동작/제약/엔드포인트 카탈로그
- `docs/live-streaming-strategy.md`, `docs/replay-strategy.md` — 라이브/리플레이 시계 동작
- `docs/deployment-architecture.md`
- `.omc/plans/*.md` — 화면별 패널·레이아웃·엣지케이스 명세 (= 브리프의 원천)
- `e2e/visual.spec.ts-snapshots/*.png` — 기존 화면 시각 참조(현재 1장)

### Tier 3 · 버리고 새로 (불만이던 뷰)
- `src/dashboard/**`, `src/live/**`(화면), `src/map/**`(렌더 컴포넌트), `src/style/**`
- `src/main/stores/`는 로직 참조만 하고 `store/`로 재정리

---

## 4. 경로 A — 코어 보존 + 뷰만 재작성 (추천)

**이 레포에서 새 브랜치를 파고 진행한다.** 새 레포로 가면 docs/scripts/public/vendor/히스토리 이전 잡일만 늘고 얻는 게 없다.

```
1) git switch -c redesign/screen-first
2) 새 폴더 골격 생성: src/api  src/store  src/shared  src/view
3) Tier 1 이식 (이동 + import 경로 수정):
     openf1Client.ts            → src/api/openf1Client.ts
     openf1Types.ts             → src/api/openf1Types.ts   (또는 shared/, 취향)
     DataSource.ts              → src/shared/DataSource.ts
     sessionKind.ts seasonData.ts env.ts simulatedNow.ts → src/shared/
     Live/ReplayDataSource 구현 → src/store/
     (scripts/ public/ vendor/ data/ 는 그대로 — 손대지 않는다)
4) view/는 비운 채 시작. screen-first로 화면부터 디자인(아래 §6).
5) 화면 확정 → DataSource에 연결 → store 구현 검증(실 endpoint 1회 호출).
```

장점: 첫날부터 실제 데이터로 화면을 채울 수 있다(타입·store가 이미 동작). 위험한 도메인 로직 0줄 재작성.

---

## 5. 경로 B — 완전 새 레포 zero-base

정말 백지에서 시작하고 싶을 때.

```
1) 새 레포 생성: npm create vite@latest soon-board-2 -- --template react-ts
   + react-dom, wouter / dev: vitest @testing-library/* playwright tsx
2) 자산 복사(재생성 비싸므로 그대로 가져옴):
     docs/  .omc/plans/  scripts/  vendor/f1-circuits-svg/  public/seasons/  public/trackOutlines/  data/
3) 데이터 레이어 재구축 — 단, "참조 구현"으로 기존 파일을 옆에 두고 본다:
     api/openf1Client.ts   ← docs/openf1-api-reference.md §3~8 기준으로 재작성
     api/openf1Types.ts    ← 14개 record 타입 (구 openf1Types.ts를 정답지로)
     shared/DataSource.ts  ← 쿼리 계약 (미래 누설 zero 의미 반드시 보존)
     shared/sessionKind.ts ← 5종 정규화 + 세그먼트 SSOT
4) store/ 재구축: LiveDataSource/ReplayDataSource
5) view/ screen-first 디자인(아래 §6).
```

⚠️ **반드시 검증할 위험 지점**(기존 코드가 어렵게 잡아낸 것들 — 재구현 시 회귀하기 쉬움):
- **미래 누설 zero** — 모든 조회가 `date ≤ t`. 리플레이 시크 시 t 이후 데이터가 새지 않는지 테스트.
- **퀄리 세그먼트** — `session_result.duration`이 `[Q1,Q2,Q3]` 배열(미도달 세그먼트 null 패딩).
- **세션 5종 정규화** — Sprint/Sprint Qualifying가 `session_type`만 보면 오분류됨(`sessionKind.ts` 규칙).
- **sentinel/가라지 좌표** — location의 가라지 sentinel 필터링(마커 미표시 조건).
- **CORS/rate-limit** — 브라우저 직접 호출 제약(`docs/openf1-api-reference.md §3.3`).

> 권장: 경로 B를 택해도 위 5개는 기존 파일을 **그대로 복붙**하는 게 안전하다(= 사실상 경로 A로 수렴).

---

## 6. screen-first × Claude design 워크플로우 (두 경로 공통)

```
디자인 시스템 → 화면 1개씩(정적+mock) → DataSource 연결 → store 구현 검증
```

1. **디자인 토큰 먼저**: 색/타이포/간격/팀컬러(`team_colour` 8桁 hex) → 공용 프리미티브(Badge, Table, Card…).
2. **화면 1개씩** 정적 컴포넌트 + **mock 데이터로** 구성. 단, **mock은 반드시 실제 record 타입을 그대로** 쓴다
   (`DriverRecord`, `LapRecord`, `IntervalRecord`, `SessionData`…). → 나중에 store와 1:1로 붙는다.
3. 화면 확정 후 데이터 접근을 **`DataSource` 메서드로만** 추상화해 연결.
4. store 구현(Live/Replay)을 이식/작성하고 **실 endpoint 1회 호출로 검증**(mock 통과 ≠ 검증 완료).

**Claude design에 매번 먹일 입력 3종:**
- (a) 화면 명세 — 해당 브리프 `briefs/NN-*.md`의 §2(패널/레이아웃)
- (b) 데이터 모양 — 브리프 §3(record 타입 + DataSource 메서드 시그니처)
- (c) 시각 참조 — 기존 스냅샷 또는 실제 F1 방송 타이밍 화면 이미지

각 브리프의 **§6에 "이 화면용 프롬프트 스니펫"**이 들어 있어 복사해서 바로 쓰면 된다.

---

## 7. 다음 단계
1. 경로 A/B 중 선택(나중에).
2. `01-first-screen-prompt.md`로 **메인 페이지부터** 디자인 시작.
3. 화면이 확정될 때마다 다음 브리프로 진행(2 → 6 순서 권장: 메인 → 레이스 대시보드 → 디테일 → 퀄리 → 맵 → 셸).
