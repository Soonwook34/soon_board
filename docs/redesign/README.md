# soon-board 재설계 — 문서 인덱스

"화면 먼저(screen-first) → 구현" 순서로 F1 타이밍/리플레이 대시보드를 다시 만들기 위한 설계 자료 모음.
아키텍처 목표: 깔끔한 3레이어 MVC — **`api/`(호출) → `store/`(저장) → `view/`(화면)**.

## 읽는 순서
1. **[00-overview.md](./00-overview.md)** — 두 재시작 경로(코어 보존 / 완전 새 레포) 비교, 타깃 아키텍처,
   파일 티어(무엇을 가져가고 버리나), 폴더 구조, screen-first 워크플로우.
2. **[01-first-screen-prompt.md](./01-first-screen-prompt.md)** — **첫 화면(메인 페이지) 복사용 완성 프롬프트.**
   경로 A(코어 보존)·경로 B(zero-base) 두 변형 + 실제 mock 데이터 포함.
3. **`briefs/`** — 화면별 디자인 브리프. 각 문서는 §1 목적 / §2 패널·레이아웃(ASCII 와이어프레임) /
   §3 데이터 계약(실제 타입·DataSource 메서드) / §4 상태·엣지케이스 / §5 비주얼 / §6 복사용 프롬프트 스니펫.

## 화면별 브리프 (권장 진행 순서)
| 순서 | 문서 | 화면 |
|---|---|---|
| 1 | [briefs/01-main-page.md](./briefs/01-main-page.md) | 메인 페이지(시즌 → GP → 세션 선택) |
| 2 | [briefs/02-race-dashboard.md](./briefs/02-race-dashboard.md) | 레이스 대시보드(타이밍 메인) |
| 3 | [briefs/03-driver-detail.md](./briefs/03-driver-detail.md) | 드라이버 디테일 패널 |
| 4 | [briefs/04-qualifying-dashboard.md](./briefs/04-qualifying-dashboard.md) | 퀄리파잉 대시보드(Q1/Q2/Q3) |
| 5 | [briefs/05-circuit-map.md](./briefs/05-circuit-map.md) | 서킷 맵(라이브 맵) |
| 6 | [briefs/06-live-replay-shell.md](./briefs/06-live-replay-shell.md) | 라이브/리플레이 셸(시계·상태·트랜스포트) |

## 핵심 원칙 (이거 하나만 기억)
> **view는 api를 직접 부르지 않는다. 데이터는 항상 store(= `DataSource` 인터페이스)를 통해서만 읽는다.**
> 모든 시간 조회는 `date ≤ t`(미래 누설 zero). 화면은 라이브인지 리플레이인지 모른다.

## 데이터 계약 원본 (브리프가 인용하는 SSOT)
- 응답 타입: [`src/shared/openf1Types.ts`](../../src/shared/openf1Types.ts)
- 쿼리 계약: [`src/shared/DataSource.ts`](../../src/shared/DataSource.ts)
- 세션 종류/퀄리 세그먼트: [`src/shared/sessionKind.ts`](../../src/shared/sessionKind.ts)
- 시즌 카탈로그: [`src/shared/seasonData.ts`](../../src/shared/seasonData.ts)
- API 동작/제약: [`docs/openf1-api-reference.md`](../openf1-api-reference.md)
