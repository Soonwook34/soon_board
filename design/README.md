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

## 주의 (스냅샷 한계)

- `_ds_bundle.js`는 원본이 읽기 API 256 KiB 한도로 잘려 내려와 **마지막 완결 컴포넌트 블록(figma-kit 후반부 직전)까지 자르고 `Object.assign(__ds_ns, __ds_scope)` 노출 구문을 복원**한 것이다. 230개 중 122개 컴포넌트가 노출되며(큐레이션된 프리미티브 전부 포함), 디자인이 실제 사용하는 DS 컴포넌트는 `SegmentedControl`·`SearchField`·`Button` 3개뿐이라 렌더링에는 영향 없다. 전체 번들이 필요하면 claude.ai/design의 DS 프로젝트에서 받을 것.
- `fig-assets.css`가 참조하는 `assets/*.png`는 원본 디자인 프로젝트에도 없어 미포함 (렌더 영향 없음).
- SF Pro는 Apple 기기에서만 실폰트로 렌더 (DS `readme.md` Caveats 참고).
