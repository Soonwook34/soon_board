# 첫 화면 프롬프트 완성본 — 메인 페이지(시즌 → GP → 세션 선택)

> 왜 메인 페이지가 첫 화면인가: ① OpenF1 라이브 스트림 없이 **정적 카탈로그(`/seasons/*.json`)만**으로 완성되어
> 데이터 의존이 가장 단순하고, ② 디자인 시스템(색/카드/배지/팀컬러)을 여기서 먼저 확립하면 이후 모든 화면이 그 위에 쌓인다.
>
> 아래는 **그대로 복사해서** Claude(또는 v0/artifacts 등)에 붙여넣는 완성 프롬프트다.
> 경로 A(코어 보존)와 경로 B(zero-base) 두 변형을 제공한다. **데이터 모양은 두 변형이 동일**하고,
> 차이는 "타입을 이미 가진 상태로 쓰느냐 / 이번에 정의하느냐"뿐이다.

---

## 화면 요약 (두 변형 공통)

- **목적**: 사용자가 연도(2023~2026) → 그랑프리(meeting) → 세션(Practice/Qualifying/Sprint/Race)을 골라
  라이브 또는 리플레이 대시보드로 진입하는 허브.
- **데이터 출처**: 빌드 시 파생된 정적 JSON. 런타임에 `fetch('/seasons/index.json')` → 연도 목록,
  `fetch('/seasons/{year}.json')` → 해당 시즌의 meeting/세션 + `result_preview`.
- **카드에 보여줄 핵심**: GP는 국기/서킷명/날짜, 세션은 이름/시간 + **result_preview**(포디엄 3명 약어·팀컬러, 패스티스트 랩, 우천 여부).
- **상태**: 로딩 / 빈 시즌 / `is_cancelled` 세션 / 아직 안 열린(미래) 세션 / 결과 없는 세션.

### 데이터 계약 (mock = 실제 타입, 두 변형 공통으로 사용)

```ts
// 시즌 인덱스 — fetch('/seasons/index.json')
interface SeasonsIndex {
  generated_at: string;
  seasons: { year: number; generated_at: string; source: string }[];
}

// 시즌 상세 — fetch('/seasons/{year}.json')
interface SeasonData {
  year: number;
  generated_at: string;
  source: string;
  meetings: MeetingData[];
}
interface MeetingData {
  meeting_key: number;
  meeting_name: string;            // "Bahrain Grand Prix"
  meeting_official_name?: string;
  location?: string;               // "Sakhir"
  country_code?: string;           // "BRN"
  country_name?: string;           // "Bahrain"
  country_flag?: string;           // 국기 이미지 URL
  circuit_key?: number;
  circuit_short_name?: string;     // "Sakhir"
  circuit_type?: string;           // "Permanent"
  circuit_image?: string;          // 트랙 아이콘 URL
  gmt_offset?: string;             // "03:00:00"
  date_start?: string; date_end?: string; // ISO 8601
  is_cancelled?: boolean;
  sessions: SessionData[];
}
interface SessionData {
  session_key: number;
  session_name: string;            // "Race" | "Qualifying" | "Practice 1" | "Sprint" ...
  session_type: string;            // "Race" | "Qualifying" | "Practice"
  date_start: string; date_end: string; // ISO 8601
  is_cancelled?: boolean;
  result_preview?: ResultPreview;  // 종료된 세션만
}
interface ResultPreview {
  podium: { position: number; driver_number: number; name_acronym: string; team_colour: string }[]; // 1~3위
  fastest_lap: { driver_number: number; name_acronym: string; lap_duration: number } | null;
  rainfall_any: boolean;
}
```

> `team_colour`는 `#` 없는 6자리 hex(예: `"ED1131"`). 표시 시 `#`를 앞에 붙인다.
> `lap_duration`은 초(예: `94.669` → `1:34.669`). 시간 표기는 `m:ss.SSS`.

### 실제 mock 데이터 한 덩이 (그대로 붙여넣어 화면 채우기)

```json
{
  "year": 2026,
  "meetings": [
    {
      "meeting_key": 1304, "meeting_name": "Pre-Season Testing", "location": "Sakhir",
      "country_code": "BRN", "country_name": "Bahrain", "circuit_short_name": "Sakhir",
      "circuit_type": "Permanent", "gmt_offset": "03:00:00",
      "date_start": "2026-02-11T07:00:00+00:00", "date_end": "2026-02-13T16:00:00+00:00",
      "sessions": [
        { "session_key": 11465, "session_name": "Day 1", "session_type": "Practice",
          "date_start": "2026-02-11T07:00:00+00:00", "date_end": "2026-02-11T16:00:00+00:00",
          "result_preview": {
            "podium": [
              { "position": 1, "driver_number": 1, "name_acronym": "NOR", "team_colour": "F47600" },
              { "position": 2, "driver_number": 3, "name_acronym": "VER", "team_colour": "4781D7" },
              { "position": 3, "driver_number": 16, "name_acronym": "LEC", "team_colour": "ED1131" }
            ],
            "fastest_lap": { "driver_number": 1, "name_acronym": "NOR", "lap_duration": 94.669 },
            "rainfall_any": false
          }
        }
      ]
    }
  ]
}
```

---

## 변형 A — 경로 A(코어 보존)용 프롬프트  ⭐

> 전제: 기존 레포의 새 브랜치에서 작업. `src/shared/seasonData.ts`에 위 타입이 **이미 존재**하고,
> `public/seasons/*.json`이 **이미 있다**. 즉 디자인만 끝나면 바로 실데이터로 동작한다.

```
나는 OpenF1 기반 F1 타이밍/리플레이 대시보드를 React 18 + TypeScript + Vite + wouter로
재설계 중이다. 아키텍처는 3레이어 강제: api/(fetch) → store/(저장) → view/(화면).
view는 store/shared의 타입만 의존하고 api를 직접 부르지 않는다.

지금은 "화면 먼저" 단계다. 데이터 연결/라우팅 구현은 아직 하지 마라.
정적 컴포넌트 + mock 데이터로 화면만 디자인한다.

[디자인할 화면] 메인 페이지 — 시즌(2023~2026) → 그랑프리(meeting) → 세션 선택 허브.
- 상단: 연도 셀렉터(2023/2024/2025/2026).
- 본문: 선택 연도의 GP 그리드(카드). 카드 = 국기/국가, GP명, 서킷명, 날짜 범위.
- GP 카드 클릭/펼침 → 세션 목록(Practice/Qualifying/Sprint/Race).
- 종료된 세션 카드에는 result_preview를 요약 표시:
  포디엄 3명(약어 + 팀컬러 점), 패스티스트 랩(약어 + m:ss.SSS), 우천 배지(rainfall_any).
- 세션 클릭 → (나중에) /live/:sessionKey 또는 /replay/:sessionKey 로 이동(지금은 onClick stub).

[데이터 계약 — mock은 반드시 이 타입을 그대로 쓴다. 나중에 store와 1:1 매핑]
<위 "데이터 계약" 코드블록 전체를 여기에 붙여넣기>
<위 "실제 mock 데이터 한 덩이"를 여기에 붙여넣기>

[상태 처리] 로딩 스켈레톤 / 빈 시즌 / is_cancelled 세션(취소 표시) /
아직 안 열린 미래 세션(result_preview 없음 → "예정") / 결과 없는 세션.

[디자인 방향] 다크, F1 방송 그래픽 느낌, 정보 밀도 높게, team_colour 적극 활용.
team_colour는 '#' 없는 6자리 hex이니 표시 시 '#'를 붙여라. lap_duration은 초 → m:ss.SSS.

먼저 ① 디자인 토큰(색 팔레트/타이포/간격/반응형 브레이크포인트)과 공용 프리미티브
(Card, Badge, DriverChip, FlagIcon)를 제안하고, ② 그 위에 이 메인 페이지를 구성해라.
산출물은 src/view/ 아래에 둘 수 있는 자기완결 React + TS 컴포넌트로.
```

---

## 변형 B — 경로 B(zero-base 새 레포)용 프롬프트

> 전제: 빈 Vite+React+TS 레포. 타입을 **이번에 새로 정의**한다. `public/seasons/*.json`은
> 기존 레포에서 복사해 온 상태(또는 위 mock 한 덩이로 대체).

```
나는 OpenF1 기반 F1 타이밍/리플레이 대시보드를 백지에서 새로 만든다.
스택: React 18 + TypeScript + Vite + wouter. 아키텍처는 3레이어 강제:
api/(fetch만, 상태 없음) → store/(응답 저장) → view/(화면). view는 api를 직접 부르지 않는다.

지금은 "화면 먼저" 단계다. 데이터 fetch/라우팅 구현은 아직 하지 마라.
정적 컴포넌트 + mock 데이터로 화면만 디자인하되, mock의 타입을 src/shared/seasonData.ts에
정식 인터페이스로 함께 정의해라(나중에 store가 이 타입으로 채운다).

[디자인할 화면] 메인 페이지 — 시즌(2023~2026) → 그랑프리(meeting) → 세션 선택 허브.
(… 변형 A의 [디자인할 화면] 블록과 동일하게 붙여넣기 …)

[정의할 타입 — 이 모양을 src/shared/seasonData.ts로 만들고 mock도 이 타입으로]
<위 "데이터 계약" 코드블록 전체를 여기에 붙여넣기>
<위 "실제 mock 데이터 한 덩이"를 여기에 붙여넣기>

[상태 처리] (변형 A와 동일)
[디자인 방향] (변형 A와 동일)

먼저 ① src/shared/seasonData.ts 타입 정의, ② 디자인 토큰 + 공용 프리미티브,
③ 메인 페이지 컴포넌트(src/view/) 순서로 산출해라.
```

---

## 사용 팁
- **한 번에 한 화면.** 메인 페이지가 확정(토큰 + 프리미티브 + 레이아웃)되면 그 토큰을 이후 화면 프롬프트에 함께 전달해 일관성을 유지한다.
- 디자인이 마음에 들면, 그때 비로소 **데이터 연결**: 변형 A는 `fetch('/seasons/{year}.json')` → 위 타입으로 파싱만 하면 끝.
- 실데이터 검증은 **실제 `/seasons/2026.json`을 한 번 띄워** 카드가 깨지지 않는지 확인(mock 통과 ≠ 검증 완료).
- 다음 화면: `briefs/02-race-dashboard.md`.
