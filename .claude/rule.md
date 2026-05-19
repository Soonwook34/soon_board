# SOON Board — Commit Convention Rule

이 문서는 SOON Board 프로젝트의 git commit 규칙입니다. Claude는 이 프로젝트에서 commit을 만들 때 반드시 이 규칙을 따른다.

> **선행 commit 주의:** `d9bd585`, `b80be5b`, `65cb037` (초기 부트스트랩 3개)는 이 규칙이 도입되기 전 작성되어 `Co-Authored-By` 푸터 + 영문 설명을 포함하고 있다. **이후 commit부터** 본 규칙을 엄격히 적용한다.

---

## 1. 커밋 메시지 형식

```
<type>: <Korean description>
```

- **단일 라인.** 본문/푸터 추가 금지 (기본값).
- **이모지 금지.**
- **`Co-Authored-By` 라인, `Generated with Claude Code` 라인, AI 관련 푸터 일체 금지.** 유저가 명시적으로 요청하지 않는 한 절대 붙이지 않는다.

## 2. Type 우선순위 (빈도순)

| type | 용도 | 힌트 |
|---|---|---|
| `feat` | 새 기능/Phase/컴포넌트 추가, 새 동작 도입 | 빈도 1위 예상 |
| `fix` | 버그 수정, 회귀 대응, 동작 보정 | 빈도 2위 |
| `refactor` | 동작 변경 없이 구조/로직 재구성 | 컴포넌트 분리, 스토어 정리 등 |
| `docs` | 문서 (`README.md`, `CLAUDE.md`, `.omc/specs/**`, `.omc/plans/**`, `rule.md`) | |
| `chore` | import 정리, 경로 정리, 미사용 코드 제거, 의존성 sync, lint 설정 등 | |
| `test` | 테스트 추가/수정 (vitest, playwright). 동작은 그대로 | |
| `style` | 포맷팅/Prettier 변경만 | 거의 없음 |
| `revert` | 이전 commit 롤백. 반드시 `(<short_sha> 시점으로 복원)` 형태로 기준점 명시 | |

- type이 애매하면 `feat` vs `fix` 기준: **없던 동작을 추가**했으면 feat, **있던 동작의 오류를 고쳤으면** fix.
- `refactor`는 겉보기 동작이 변하지 않을 때만. 로직/계약을 **엄격하게 바꾼 경우는 `refactor` + 괄호 설명**으로 처리. 예) `refactor: Poller AbortController per-endpoint 모델 재구성 + pause/resume 의미 일관화 (M2)`.

## 3. 한글 설명 스타일

- 설명은 **한글**. 코드 식별자(함수명, 변수명, 파일명, 컴포넌트명, 타입명)는 **원문 영문 유지** — 한글 풀이 금지.
- 관용 기호:
  - **`→`** : before/after 대체. 예) `as: 'raw' → query: '?raw', import: 'default'`, `React.memo → granular Zustand selector`, `useState → useRef`.
  - **`+`** : 병렬 추가 항목. 예) `Phase 8 Scrubber 구현 + AC6.4 500ms 타이밍 테스트`.
  - **`—` (em-dash, U+2014)** : 제목과 상세 설명 사이 구분. 예) `feat: Phase 6 CircuitMap — substrate-first 렌더링 + DecorationLayer 분리`.
  - **`(...)`** : 범위/대상 한정. 예) `(Phase 3)`, `(M4)`, `(d9bd585 시점으로 복원)`.
  - **`/`** : 다중 Phase/모듈 동시 변경 나열. 예) `Phase 6/7/8 통합 검증`.

## 4. 범위 명시 (필수)

영향 범위를 반드시 제목에 포함한다.

- **Phase 태그:** `Phase 0` ~ `Phase 10` (`.omc/plans/soon-board-consensus-plan.md` §3 참조)
- **M-amendment 태그:** `(M1)` ~ `(M9)` — consensus iter 2에서 적용된 amendment 식별자
- **모듈 경로:** `src/store/timelineStore`, `src/scheduler/poller`, `src/components/Map/CircuitMap` 등 핵심 파일 명시
- **AC 태그:** acceptance criteria 영향을 줄 때 `(AC4.5)`, `(AC6.4)` 형태로 명시
- **함수/훅명:** 핵심이면 원문 그대로 — `useMasterRaf`, `useFrameBudget`, `poller.pause`, `globalClockNow`, `fitAffine`
- **버그 리포트 스타일:** 증상 명시. 예) `iPad Safari Request Desktop Site UA에서 30Hz 폴백이 비활성화되는 버그 수정 (M4)`, `Scrubber 드래그 중 isApplying ref가 reset되지 않는 회귀 보정 (AC6.4)`

## 5. 작은 commit / 빠른 반복

- **큰 묶음 commit을 피하고 작게 쪼개 반복.** 한 commit에 여러 관심사가 섞이면 분할을 제안한다.
- 같은 주제의 연속 `fix:` 사슬은 정상 패턴 (접근법 실험 → revert → 재시도 포함).
- 실험 실패로 되돌릴 때: `revert: <요약> (<sha> 시점으로 복원)`.
- **`git commit --amend` 금지** — 신규 commit 선호. (전역 가이드라인과 일치)
- **`--no-verify`, `--no-gpg-sign` 금지** — 훅 우회 절대 금지.

## 6. 예시 (좋은 / 나쁜)

### 좋음

```
feat: Phase 9 AppShell 반응형 그리드 — FHD lg:grid-cols-[60fr_40fr] + iPad 단일 컬럼
feat: Phase 6 CircuitMap substrate-first 렌더링 (M6) + DecorationLayer 분리
fix: useFrameBudget iPad Safari Request Desktop Site UA 누락 보정 (M4)
fix: Scrubber.onCommit finally 블록에서 isApplying ref reset 누락 (AC6.4)
refactor: Poller AbortController 모델 — endpoint별 컨트롤러 → 단일 공유 (M2 의미 일관화)
refactor: src/components/Map DecorationLayer.tsx as:'raw' → query:'?raw',import:'default' (Vite 6 대비)
docs: README 핵심 설계 표 + v1 manual gate 체크리스트 보강
docs: .omc/plans/soon-board-consensus-plan.md M-amendment 5개 추가 (M1/M2/M3/M4/M5)
chore: src/components/Playback 미사용 import 정리
chore: tailwind.config.ts tire-* 토큰 spec §D.2와 정렬
test: src/scheduler/poller.pause-resume.test.ts — refetchWindow 순서 보장 케이스 추가
revert: Lighthouse CI assertion 0.85 → 0.80 롤백 (b80be5b 시점으로 복원)
```

### 나쁨

```
Update code                                              # 범위/유형 불명
feat: add map                                            # Phase 불명, 한글 아님
fix: Phase 6 버그 수정함                                  # 증상 불명
feat: 여러 개 수정                                        # 여러 관심사 묶음
feat: Phase 6 개선 🚀                                     # 이모지 금지
feat: Phase 6 substrate 추가                             # 본문에 AI 푸터 자동 추가됨

Co-Authored-By: Claude Opus 4.7 (1M context) <...>       # 절대 금지
```

## 7. 이 프로젝트 고유 약어 사전 (참고용)

| 약어 | 의미 |
|---|---|
| `P0`~`P10` | Phase 0 ~ Phase 10 (consensus plan §3) |
| `M1`~`M9` | iteration-2 amendment 9개 (M1 cadence, M2 pause/resume, M3 Lighthouse split, M4 UA fps, M5 AC2.2 lock, M6 substrate, M7 server-time, M8 memory cap, M9 deploy perms) |
| `AC<X.Y>` | Acceptance Criteria (예: AC6.4 = scrub settle ≤ 500ms) |
| `rAF` | `requestAnimationFrame` |
| `viewBox` | SVG viewBox 속성 (좌표계 기준) |
| `affine fit` | 4-parameter similarity (scale + rotation + 2D translation) |
| `substrate` | 텔레메트리 폴리라인 (좌표 기준, 항상 ON) |
| `decoration` | bacinger SVG 오버레이 (선택적, cosmetic) |
| `LOCKED cadence` | M1에서 확정한 30 req/min 폴링 스케줄 |
| `global clock` | `timelineStore.globalClockNow(state)` 단일 진실원 |

## 8. Claude 행동 지침

- commit 만들기 전 **반드시** 이 파일을 참조한다.
- 사용자가 명시적으로 commit을 요청하지 않으면 commit하지 않는다.
- `git push` / 원격 변경 동작은 반드시 사용자가 명시적으로 요청한 turn에만 실행한다.
- 본 규칙과 전역 가이드라인(`/Users/a453498/.claude/CLAUDE.md`, `./CLAUDE.md`)이 충돌하면 **본 규칙이 우선**한다 (프로젝트 로컬 override).
- 본 규칙을 어긴 commit을 만든 것을 감지하면, 사용자에게 보고하고 다음 commit부터 교정한다. 이미 push된 history는 사용자의 명시적 지시 없이 임의로 수정하지 않는다.
