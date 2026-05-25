# Third-party assets and licenses

본 프로젝트는 다음 외부 자산을 사용한다. 각 항목의 라이선스 의무는 항상 준수된다.

---

## julesr0y/f1-circuits-svg (CC-BY-4.0)

- **위치 in this repo:** `vendor/f1-circuits-svg/` (git submodule)
- **빌드 산출물:** `public/trackOutlines/{circuit_key}-{year}.json`
  (SVG path → polyline 변환 결과, `scripts/fetch-circuit-maps.ts` 산출)
- **원본 소스:** https://github.com/julesr0y/f1-circuits-svg
- **라이선스:** Creative Commons Attribution 4.0 International (CC BY 4.0)
  https://creativecommons.org/licenses/by/4.0/
- **저자 표기:** 모든 UI 페이지 푸터에 "Track maps © julesr0y/f1-circuits-svg (CC BY 4.0)" 1줄
  표기 ([src/shared/Footer.tsx](src/shared/Footer.tsx), live-map plan §1.2 + 단계 3).
- **변경 표기:** 본 프로젝트는 SVG 파일 자체를 수정하지 않으며, `<path d="...">` 속성을
  arc-length 균등 샘플링한 polyline 좌표로 변환해 별도 JSON 파일을 산출한다. 산출물의
  `source` / `source_file` / `license` 필드에 출처/라이선스를 보존한다.

### CC BY 4.0 요약 (전문은 위 링크 참조)

- 자유: 복사·재배포·변형·상업적 사용 가능
- 의무:
  - 저작자 표기 (이름, 저작권 표시, 라이선스, 링크, 변경 사실)
  - 본 라이선스의 추가 제약은 부과하지 않음
  - 동일 라이선스 강제 없음 (ShareAlike 아님)

---

## OpenF1 API (CC0-1.0)

- **사용:** 빌드 타임 카탈로그 fetch (`scripts/fetch-season-catalog.ts`, `scripts/fetch-circuit-maps.ts` 의
  affine transform 추출), 런타임 라이브/리플레이 폴 (`src/map/LiveDataSource.ts`, `ReplayDataSource.ts`)
- **원본:** https://openf1.org
- **라이선스:** CC0-1.0 (Public Domain Dedication) — 저자 표기 의무 없음. 자발적으로
  푸터에 "Data: OpenF1.org" 1줄 표기.

---

## Formula 1 / FIA / FOM trademark disclaimer

본 프로젝트는 Formula 1, F1, FIA, FOM, Liberty Media, 또는 어떤 F1 팀과도 무관한
**비공식 fan project** 다. 모든 팀명·드라이버명·이벤트명·서킷명·로고는 각 권리자에게
귀속된다. 본 프로젝트는 어떤 공식 데이터·중계·라이선스도 사용하지 않으며,
공개된 OpenF1.org 데이터와 CC-BY-4.0 SVG 만 사용한다.

푸터 표기: "Unofficial fan project. Not affiliated with Formula 1, FIA, or any F1 team."
