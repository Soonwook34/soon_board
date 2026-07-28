# soon-board 디자인 (claude.ai/design 스냅샷)

claude.ai/design **"Claude Design Study"** 프로젝트에서 2026-07-24에 가져온 디자인 스냅샷.
구현(React SPA)의 시각 레퍼런스이자 로컬에서 열어볼 수 있는 실행 가능한 미리보기다.

- **원본(라이브) 프로젝트:** https://claude.ai/design/p/5a36c84f-d63b-4d02-bdd6-bd87d7a0c517?file=SoonBoard.dc.html
- **사용 디자인 시스템:** macOS 27 Design System (사용자 소유 claude.ai/design 프로젝트 `b9482771-…`)

## 파일

| 경로 | 내용 |
|---|---|
| `SoonBoard.dc.html` | 디자인 본체 (JSX 템플릿 + `sb-*` 커스텀 스타일). 구현 시 이 파일이 SSOT |
| `support.js` | dc 런타임 — CDN에서 React 18.3.1 UMD + Babel을 로드해 `<x-dc>`를 렌더 |
| `_ds/macos-27-…/` | 디자인이 참조하는 DS 사본: 토큰 3종 CSS, `styles.css`, `fig-assets.css`, `_ds_bundle.js`, `readme.md`(디자인 언어 문서) |

## 화면 구성 (`screen` prop)

`hub` · `race`(기본) · `driver` · `qualifying` · `map` · `compare` · `shell`, 테마 `dark`(기본)/`light`.

## 로컬 미리보기

```sh
cd design && python3 -m http.server 8931
# 브라우저: http://localhost:8931/SoonBoard.dc.html  (React/Babel CDN 로드를 위해 네트워크 필요)
```

- 테마: URL에 `?theme=dark` 부여 가능.
- 화면 전환: 콘솔에서 `__dcSetProps(__dcRootName(), { screen: "qualifying" })`
  (또는 `SoonBoard.dc.html` 하단 `data-props`의 `screen.default` 수정).
- 2026-07-24 헤드리스 Chrome으로 race 화면 렌더 검증 완료.
- **v2 (2026-07-24 재동기화):** `docs/design-revision-brief.md`의 R1~R16 반영본.
  월드피드→배틀/팔로우 재정의, FP 세션 변형(`sessionType:'practice'`, 허브 라우팅 연결),
  DNF Cause 제거, elapsed 표기, UTC+2, 연도 2024–26, 미니섹터·리타이어 행·OFFICIAL 상태 추가.
  렌더 재검증 완료 (LAP 28/—, UTC+2, 인터벌 "—" 상태 화면 확인).
- **v3 (2026-07-24 재동기화):** R5 반영 — 히어로 날씨가 관측치 요약(`'Dry · 17°C air'`)으로 교체.
  **R1~R16 전 항목 반영 완료.**
- **v4 (2026-07-24 재동기화):** `docs/design-revision-brief.md` §6(R17~R27) 반영본. 173KB→192KB.
  스포일러 게이트(히어로 블러·카드 Show result·OFFICIAL 확인 모달), 재생분까지만 키모먼트,
  세션별 Compare 게이팅, SQ1~SQ3, PTS=규정 포인트(FL 보너스 제거), Practice 정렬 수정,
  Quali 레일 Weather·RC, 행 높이 34px 통일. 보너스: Track Map이 Quali/Practice에서도 동작.
  검증: 8화면 헤드리스 렌더(hub·hub확장·race·official·spoiler·practice·quali·SQ맵·연습맵·패널2종).
  **미해결 10건은 §6 감사 결과(R28~ 후보) 참조** — 특히 대시보드 Track Map 카드가
  1280×800에서 헤더만 렌더(우측 레일 자식에 `flex:none` 누락), 퀄리 포커스 카드의 Q3 시간 노출.
- **v5 (2026-07-27 재동기화):** `docs/design-revision-brief.md` §8(R31~R34) 반영본. 192KB→193KB.
  대시보드 우측 레일 `flex:none`+`min-height:0`, 퀄리 미래 세그먼트 "—" 게이팅,
  필드베스트 칩을 세그먼트 P1 타임에 결속, 리타이어 드라이버 랩 절단(`retireLap()` 신설 —
  랩 히스토리·Lap Trend 개수·스틴트 축·"Show all N laps" 전부 연동).
  검증: 9화면 헤드리스 렌더(dash·Q1·Q2·Q3·STR패널·BOT패널·practice패널·official).
  **R31~R34 수용 기준까지 전 항목 충족.** 후속 7건은 지시서 §9(R35~R41) — 신규는
  리타이어 드라이버의 스틴트·핏 섹션 공백(R35)뿐이고 나머지는 이월 목록에서 승격.
- **v6 (2026-07-27 재동기화):** `docs/design-revision-brief.md` §9(R35~R41) 반영본. 193KB→197KB.
  리타이어 드라이버 스틴트·핏 복원(`startCompound()`·1랩 가드), Practice 패널 본문을
  연습 데이터로 전환(`practiceRuns()`·"Run Plan"·핏 섹션 숨김), OFFICIAL 배너 집계 자동 생성,
  페널티 반영 순위 재정렬 + ▲/▼ 변동 표시, 스프린트 주말 세션 구성 분기,
  랩 수 분모를 `collectDone()` 단일 소스로 통일, 죽은 코드 `qBoard` 삭제.
  검증: 13화면 헤드리스 렌더(dash·official·spoiler·BOT·STR·1랩합성·practice 2종·스프린트/일반 주말·quali·VER·compare).
  **R35~R41 수용 기준까지 전 항목 충족, 회귀 없음.** 후속 4건은 지시서 §10(R42~R45) —
  신규는 연습 패널의 "Overall best" 보라색이 개인 최고랩에 붙는 문제(R42)이고 나머지는 잔여 다듬기.
  §10에 **R38 구현 메모**(페널티 재정렬은 `session_result`를 읽을 것, 클라이언트 계산 금지) 포함.
- **v7 (2026-07-27 재동기화):** `docs/design-revision-brief.md` §10(R42~R45) 반영본. 197KB→198KB (19+/11−).
  랩 히스토리 최고랩 색을 세션 최고(`flOverall`)에 따라 보라/초록 분기, OFFICIAL에서 핏 인터벌
  회색·툴팁 제거, 랩 토글을 총 랩 ≤5면 숨김 + 단복수 처리, 스틴트 축을 `axisTicks` 배열로 교체,
  Compare 카드 `stopsLabel`.
  검증: DOM 덤프 실측 8화면 — ALO `rgb(67,200,107)` / PIA `rgb(182,99,230)`,
  LAW 인터벌 `var(--labels-primary)` + `title=""`, 1랩 합성 케이스에서 토글 0건·축 `Lap 1` 1회.
  **R42~R45 수용 기준까지 전 항목 충족.** 후속 1건은 지시서 §11(R46) — R42가 랩 히스토리 행에만
  적용돼, 같은 값이 스탯 카드·트렌드 `BEST`·스파크라인 마커에서는 아직 보라색인 잔여분.
- **v8 (2026-07-27 재동기화) — 디자인 라운드 종료:** `docs/design-revision-brief.md` §11(R46) 반영본.
  198KB (7 hunks). `holdsOverallBest`/`bestColor`를 패널 단위 값 하나로 만들어 스탯 카드·트렌드
  `BEST`·스파크 마커·랩 히스토리 네 자리에 연결, 하드코딩 `#B663E6` 3곳 제거.
  R38 이동 아이콘도 보간 `<use href>` 대신 정적 `<use>` 2개로 교체.
  검증: DOM 실측 5패널 × 4자리 전부 일치(PIA·VER 보라 / ALO·HAM·BOT 초록), 세션 전체 값의
  보라는 전부 보존, R42~R45 회귀 없음.
  **R1~R46 전 항목 반영 완료 — 신규 지시 없음.** 잔여 콘솔 파스 오류 48건은 SVG 기하 속성의
  `{{ }}` 보간에서 나오는 dc-runtime 목업 한계로 렌더 무영향이고 React 구현에서 소멸한다(지시서 §12).

- **v9 (2026-07-27 재동기화):** `docs/design-revision-brief.md` §13(R47~R51) 반영본. 198KB→201KB (109+/88−).
  맵 전용이던 리플레이 트랜스포트를 **세션 셸 최하단 상주 바로 승격**(`transportVals()` 신설, `showTransport`),
  헤더 아래 정적 진행바 행 삭제 후 랩 카운터·분모 툴팁·세션 라벨·VSC 존을 하단 바로 이관,
  키 모먼트·존·Race Control을 **커서 랩 기준으로 필터**, 점프를 `scrubBySec(±30)` 고정 초로 교체(+툴팁·`30` 라벨),
  100%에서 ▶→↺ Replay, 퀄리 세그먼트 경계 틱·연습 10분 틱, 키보드(Space·←/→·Shift+←/→).
  검증: 11화면 DOM 실측 — 트랜스포트 hub 0 / 세션·Compare 6화면 각 1, 진행바 화면당 1개,
  L20 시킹 시 마커 4→1·존 0·RC `No race control messages up to lap 20`, 퀄리 라벨 게이팅(20%→Q1, 55%→Q1·Q2).
  **R47~R51 수용 기준까지 전 항목 충족.** 후속 4건은 지시서 §14(R52~R55) — 커서 비연동 2건(퀄리 세그먼트,
  퀄리·연습 RC)과 **키 모먼트 API 소스 2건**. 특히 🟢 그린 플래그는 `flag='GREEN'`이 실측 전건 랩 1의
  핏 출구 개방이라 소스가 틀렸다(재개는 `flag='CLEAR' + scope='Track'`) — `docs/openf1-api-reference.md`
  §8.11에 `category='SafetyCar'` 누락분과 함께 실측 반영.

- **v10 (2026-07-27 재동기화):** `docs/design-revision-brief.md` §14(R52~R57) 반영본. 201KB→207KB (93+/27−, 15 hunks).
  퀄리 세그먼트를 커서 파생으로 전환(`curQSeg()`·`Q_SEGS()`, `qseg` 독립 상태 제거, 헤더 elapsed도 트랜스포트 시계에서 파생),
  퀄리·연습 Race Control을 **세션 경과 초** 기반으로 재작성(`QP_EVENTS()`, 랩 기반 가짜 스탬프 삭제),
  마커·존·RC·랩타임 페널티를 **단일 `EVENTS()` 배열**에서 파생(재개 시점 3표시가 전부 L25로 일치),
  마커 라벨 `Green flag`→`Restart` / `VSC · Stavelot`→`VSC`,
  Lap Trend 차트에 SC/VSC 옅은 노랑 밴드 신설(`neutralLaps()` — 랩 단위·커서에서 절단·연속 랩만 병합) + 범례 `▨ SC / VSC`,
  랩 히스토리 개인 최고 랩타임 착색(클린 랩 `min()`, 동률은 최초 달성 랩, 세션 최고 보유자는 보라 유지).
  검증: 14화면 DOM 실측 — 시계 단일화(`12:00`/`38:09`/`54:00`, 화면당 `elapsed` 1개), 세그먼트 게이팅(20%→Q1·55%→Q2·90%→Q3),
  퀄리 RC 건수 2/4/6, 밴드 `x=160 w=82.9`·툴팁 `Virtual safety car · laps 23–25`·선 뒤 배치, 행 배경 우선순위(세션최고>핏>중립화),
  개인 최고 초록 1행(HAM L9, 동률 L18·L27 기본색) + VER 보라 1행 + 3랩 리타이어 BOT L1.
  **R52~R57 수용 기준까지 전 항목 충족.** 후속 5건은 지시서 §15(R58~R62) — 핵심은 **표 데이터가 커서를 모른다**는 것:
  커서 L20에서 트랜스포트는 정확히 잘리는데 VER 패널은 랩 29행·`BEST 1:45.712`(패스티스트 랩, 6랩 뒤)를 그대로 노출하고,
  R56 밴드만 커서에서 잘려 "노란 행은 있는데 밴드는 없는" 비대칭이 생긴다. 퀄리는 `0:00 elapsed`에 Q1 최종 타임 21건.
  콘솔은 48→50건(신규 2건은 밴드 `<rect>`의 `{{ }}` 보간 경고 — 기존 계열, 렌더 무영향).

- **v11 (2026-07-28 재동기화):** `docs/design-revision-brief.md` §15(R58~R62) 반영본. 207KB→210KB (72+/36−, 14 hunks).
  드라이버 패널을 **커서 파생 뷰 모델로 전환**(`panelCursorLap()`·`flSeen()` 신설 — 랩 수·진행 중 행·`LAP` 스탯·행 배경이 전부 커서에서 파생,
  깃발/리타이어 시점엔 진행 중 행 제거), 패스티스트 랩 관련 표시를 `flSeen()`으로 게이팅(`FASTEST LAP` 카드·`FL` 배지·보라 인터벌·RC 메시지),
  **퀄리 보드 내부 게이팅 신설**(`qSegProg`/`qConf`/`qTimeC`/`qBoardOrder`/`qSegDone` — 세그먼트 경과에 따라 느린 주자부터 타임이 채워지고
  컷 라인·KO 패널·필드베스트·포커스 카드·맵 스탠딩이 같은 소스), 세그먼트 탭을 `clamp(maxPlayedPct, segStart, segEnd)` 시킹으로,
  선언 패스티스트 랩을 `FASTEST()` 단일 소스로 승격, RC `car 1`→`car 3`.
  검증: 21화면 DOM 실측 — 랩 행 21/29/44/3행, 밴드↔노란 행 동시 0(v10 비대칭 해소), 커서 L20에서 `FASTEST LAP` `—`·`FL` 배지 0,
  퀄리 0% 타임 0개·`No time set`, 확정 인원 8→20→12/15→4/10(선두가 `OCO`로 폴 미노출), 90%→`Q1` 클릭 시 커서 30%·20명 확정.
  **R58·R59·R60·R62 수용 기준 충족, R61은 부분.** 후속 3건은 지시서 §16(R63~R65) — 전부 잔여분:
  `LAST` 2곳이 커서 무시(`1:46.812` 노출), 세션 최고 보유자의 다른 랩 4종이 선언값보다 빨라 **보라 2행** + Compare·스파크라인에 `1:45.712` 잔존,
  퀄리 0%에서 미기록 드라이버가 최종 순위대로 정렬·순번 표시. 콘솔 50건(v10과 동일).

- **v12 (2026-07-28 재동기화):** `docs/design-brief-11.md`(R63~R70) 반영본. 210KB→242KB (433+/68−, 38 hunks).
  결함 3건(커서 파생 `LAST`·`genLaps` 패스티스트 랩 보정—하한 대신 전체 시프트·퀄리 미기록자 카넘버 정렬+순번 `—`) +
  신규 5건: **퀄리 푸시랩 갭 블록**(`pushVals` — 2자리·스플릿 굵게 `at split`/사이 `~`·`estimated`·28칸 띠·아웃랩 접힘),
  **맵 지오메트리 오버레이**(`GEO`·`buildGeo` — 섹터 명도 3단·마셜 21+커서 시점 깃발 강조·코너 숫자만·DRS 2023~25),
  **미니섹터 트랙 칠하기**(포커스 시 0.85 불투명 조각·커서 절단·`Focus only`), **설정창**(`settingsVals` — 5그룹 17항목,
  `markerLabel 3분기`·`jumpStep` 연동·스포일러 스위치·세션/연도별 disabled), **SLM 존 5개+OVT 칩**(`ovtState` 커서 연동·DISABLED 시 0.35).
  검증: 24화면 DOM 실측 + 스크린샷 4장 — **R63~R70 수용 기준 전건 충족.** 띠 18/28 = 맵 조각 18 파리티, 콘솔 90건(전부 `{{ }}` 기하 보간, JS 오류 0).
  이어진 **세션 유효성 전수감사**에서 2건 발견 → `docs/design-brief-12.md`(R71 퀄리 맵 클릭 시 레이스 패널 노출, R72 정적 깃발 배너).

- **v13 (2026-07-28 재동기화) — 디자인 라운드트립 종결 (R1~R72, 13라운드):** `docs/design-brief-12.md`(R71·R72) 반영본. 242KB→244KB (27+/7−, 8 hunks).
  퀄리·SQ 맵의 드라이버 클릭을 `setQFocus`로 전환(`focusDriver` 삭제 — 퀄리 화면에서 레이스 패널 경로 소멸),
  깃발 배너를 `activeFlagVals()`로 재작성 — 마셜 오버레이와 같은 커서 소스, 무깃발 시 배너 숨김, 상세는 RC 원문(코너 고유명 삭제),
  퀄리·연습은 세션 시계에서 YELLOW→GREEN 해제.
  검증: 13화면 실측 — 레이스 L20 숨김/L24 `DOUBLE YELLOW · SECTOR 10`/L28 `SECTOR 14`, 퀄리 70% 표시·85% 해제, `Pouhon` 0건,
  퀄리 맵에서 `INTERVAL`·스틴트·핏 0건 + 칠하기 18조각 전환. 콘솔 90건 동일(전부 `{{ }}` 보간, JS 오류 0).
  **열린 결함 0. 이후 시안 변경은 구현 중 확인된 필요만 새 지시서로.**

## 주의 (스냅샷 한계)

- `_ds_bundle.js`는 원본이 읽기 API 256 KiB 한도로 잘려 내려와 **마지막 완결 컴포넌트 블록(figma-kit 후반부 직전)까지 자르고 `Object.assign(__ds_ns, __ds_scope)` 노출 구문을 복원**한 것이다. 230개 중 122개 컴포넌트가 노출되며(큐레이션된 프리미티브 전부 포함), 디자인이 실제 사용하는 DS 컴포넌트는 `SegmentedControl`·`SearchField`·`Button` 3개뿐이라 렌더링에는 영향 없다. 전체 번들이 필요하면 claude.ai/design의 DS 프로젝트에서 받을 것.
- `fig-assets.css`가 참조하는 `assets/*.png`는 원본 디자인 프로젝트에도 없어 미포함 (렌더 영향 없음).
- SF Pro는 Apple 기기에서만 실폰트로 렌더 (DS `readme.md` Caveats 참고).
