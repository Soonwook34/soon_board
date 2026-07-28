# OpenF1 API 분석 레퍼런스

> 최초 정리: 2026-05-20 · 전면 재검증·개정: **2026-07-21** · 대상 API 버전: `v1`
> 본 문서는 OpenF1 API 자체에 대한 사실 정리이며, 그 위에 올릴 서비스 설계는 포함하지 않는다 — **구축 결정(호스팅·저장·용량·비용·운영)은 [infra-architecture.md](./infra-architecture.md) 참조.**
>
> **검증 방법:** 공식 문서 3페이지(docs/홈/인증) 원문 대조 + 실 API 호출 약 40회 스모크 테스트(2023·2024·2026 세션, 응답 헤더 포함).
> 각 항목에 출처를 표기한다 — `[공식]` 공식 문서 명시, `[실측]` 2026-07-21 실제 호출로 확인, `[커뮤니티]` GitHub 이슈/FastF1 등 외부 관찰.

---

## 0. 한눈에 보는 요약

| 항목 | 값 |
|---|---|
| 공식/비공식 | **비공식** 커뮤니티 프로젝트 (Formula 1, FIA, FOM과 무관) [공식] |
| 메인테이너 | GitHub `br-g` 중심 (+ 소수 컨트리뷰터) |
| 라이선스 | CC BY-NC-SA 4.0 (비상업, 출처 표시, 동일 조건 공유) |
| Base URL | `https://api.openf1.org/v1/` |
| 엔드포인트 수 | **18개** [공식] |
| 응답 포맷 | JSON 배열 (기본), CSV (`?csv=true`) |
| **조건 미일치 시** | **HTTP 404 + `{"detail":"No results found."}`** — 빈 배열이 아님 [실측] |
| 인증 (historical) | **불필요** — 익명 접근, 무료 [공식] |
| 인증 (실시간) | OAuth2 Bearer 토큰 — 유료 구독 €9.90/월 [공식] |
| Rate limit (무료) | 3 req/s, 30 req/min [공식] |
| Rate limit (스폰서) | 6 req/s, 60 req/min + MQTT/WS 동시 10연결 [공식] |
| CORS | **허용** — `Access-Control-Allow-Origin: *`, preflight 정상 → 브라우저 직접 fetch 가능 [실측] |
| 필터 연산자 | `=`, `>=`, `<=`, `>`, `<` (서로 다른 파라미터는 AND) |
| 다중값 필터 | **같은 파라미터 반복 = IN(OR)** — `driver_number=4&driver_number=81` [공식·실측] |
| 정렬/페이지네이션 | **미지원** (필터로만 범위 축소) |
| 실시간 스트림 | MQTT `mqtts://mqtt.openf1.org:8883` / WebSocket `wss://mqtt.openf1.org:8084/mqtt` [공식] |
| 실시간 지연 | 약 3초 (TV 중계보다 빠름) [공식] |
| 데이터 시작 시점 | **2023 시즌부터** (전 엔드포인트 공통) [공식] |
| 시간 표기 | 전부 **UTC**, ISO 8601 (마이크로초 정밀도) |
| 라이브 윈도우 | 세션 시작 30분 전 ~ 종료 30분 후 [공식] |
| SLA / Status page | 없음 (GitHub Discussions에서 임시 공지) |

---

## 1. 프로젝트/API 개요

### 1.1 정체성
- **비공식 커뮤니티 프로젝트.** F1 / FIA / FOM과 어떠한 공식 관계도 없음. F1 관련 모든 상표는 Formula One Licensing B.V. 소유. 공식 F1 상품·라이선스 데이터 서비스와 경쟁/대체하지 않음을 명시.
- **메인테이너:** GitHub `br-g` 중심, 소수 컨트리뷰터 참여. 스폰서십(€9.90/월)이 서버 비용을 충당하며, 스폰서에게 실시간 데이터와 높은 rate limit 제공.
- **목적:** "교육, 학습 프로젝트, 연구, 비상업 팬 활동" 명시. 그 외 용도는 별도 협의 요구.
- **라이선스:** `CC BY-NC-SA 4.0`
  - 비상업 사용만 허용
  - 출처 표시 의무
  - 파생 저작물은 동일/호환 라이선스로 공유
  - 정확성/적합성에 대한 무보증

### 1.2 베이스 URL과 버전 정책
- **운영:** `https://api.openf1.org/v1/`
- **로컬 자체호스팅:** `http://127.0.0.1:8000/v1/` (FastAPI/uvicorn으로 직접 실행 시)
- **버전:** `v1`만 존재. 공식 deprecation 정책/체인지로그 없음. 다만 필드 단위 deprecation은 문서에 명시됨 — 현재 `drivers.country_code`, `pit.pit_duration`이 **2026 시즌 종료 시 제거 예정** [공식]. 상용 API 수준의 안정성을 가정하면 안 됨.

### 1.3 데이터 소스 — 어떻게 모으는가
- OpenF1는 F1 공식 **Live Timing SignalR 엔드포인트** (`https://livetiming.formula1.com/signalr`)에 연결해 "Streaming" Hub의 토픽들(`CarData.z`, `Position.z`, `TimingData`, `RaceControlMessages`, `WeatherData`, `TeamRadio` 등)을 구독해 정규화한다.
- 즉, **스크래핑이 아니라 F1이 공개한 비문서화 스트림**을 받아 저장하는 구조. FastF1·undercut-f1·F1 공식 라이브 타이밍 대시보드도 같은 원천을 사용한다.
- **함의:** F1이 스트림을 차단하거나 프로토콜을 바꾸면 OpenF1도 즉시 영향받는다. 실제 사례 — 2025 Dutch GP 이후 F1이 일부 데이터(Driver Tracker, DRS, 핏스톱 시간 등)를 F1 TV 가입자 전용으로 제한하며 커버리지가 줄었고, 팀라디오는 2026년 들어 대부분의 이벤트에서 미공개 [공식, §8.12].

---

## 2. 인증 모델

| 데이터 종류 | 인증 | 비용 |
|---|---|---|
| historical — 라이브 윈도우 밖의 모든 세션 | **불필요** (익명) | 무료 |
| real-time — 라이브 윈도우 내 데이터 | OAuth2 Bearer 토큰 | 유료 (€9.90/월) |

### 2.1 토큰 발급 (실시간용)
```http
POST https://api.openf1.org/token
Content-Type: application/x-www-form-urlencoded

username=<email>&password=<password>
```
응답: `{"access_token": "...", "token_type": "bearer", "expires_in": "3600"}` — **토큰 수명 1시간**, 만료 대비 재발급 로직 필수 [공식].

### 2.2 사용
- **REST:** `Authorization: Bearer <access_token>`
- **MQTT:** `mqtt.openf1.org:8883` (TLS/MQTTS) — username은 임의 비어있지 않은 문자열(또는 가입 이메일), **password 자리에 access_token** [공식]
- **WebSocket (MQTT over WSS):** `wss://mqtt.openf1.org:8084/mqtt` — 경로 `/mqtt`까지 포함해야 함. 인증 규칙은 MQTT와 동일 [공식]

### 2.3 MQTT/WS 토픽·메시지 형식 [공식]
- 토픽은 REST 경로와 1:1 대응: `v1/laps`, `v1/location`, `v1/position` … 와일드카드 `#`로 전체 구독 가능.
- 메시지는 해당 REST 엔드포인트와 같은 JSON 오브젝트에 **2개 필드가 추가**된다:
  - `_id` (int) — 전역 증가 ID. **수신 메시지의 시간순 정렬 기준**으로 사용.
  - `_key` (string) — 문서 식별자. **같은 `_key`의 메시지는 같은 오브젝트의 갱신판**이다. 예: `v1/laps`는 진행 중 랩의 섹터 타임이 채워질 때마다 같은 `_key`로 재전송됨 → 클라이언트는 upsert로 처리해야 한다.
- 용도 가이드 [공식]: 과거/현재 데이터 단건 조회 → REST · 백엔드 실시간 → MQTT · 브라우저 실시간 → WebSocket. 라이브는 REST 폴링 대신 MQTT/WS를 강하게 권장.

### 2.4 보안 권고 [공식]
- username/password 교환(토큰 발급)은 **반드시 백엔드에서**. 클라이언트 사이드에 자격증명 임베드 금지.
- 토큰을 `localStorage`에 두지 말 것(XSS). 세션 메모리 보관 또는 HttpOnly 쿠키.
- 권장 아키텍처: 백엔드가 MQTT/WS 연결과 토큰을 관리하고, 브라우저에는 자체 채널로 푸시.

---

## 3. Rate Limit · HTTP 동작

### 3.1 공식 한도 [공식]
| 등급 | 초당 | 분당 | 비고 |
|---|---|---|---|
| 무료(익명) | 3 | 30 | historical 전체 |
| 스폰서(인증) | 6 | 60 | + 실시간, MQTT/WS 동시 10연결 |

- 한도 초과 시 **HTTP 429**. `Retry-After` 헤더 동작은 미문서화이며, 정상 응답에 `X-RateLimit-*` 헤더도 없다 [실측].
- 텔레메트리(3.7 Hz × 20대)는 REST 폴링으로 따라갈 수 없는 볼륨 — 라이브는 MQTT/WS가 전제.

### 3.2 응답 형식과 상태 코드 [실측]
- 성공: JSON 배열. 단일 결과여도 배열로 감싸여 옴.
- **조건 미일치: HTTP 404 + `{"detail":"No results found."}`** — 빈 배열 `[]`이 아니다. 클라이언트는 404를 오류가 아닌 "데이터 없음"으로 처리해야 한다. (예: 예선 세션에 `intervals` 조회, 존재하지 않는 `driver_number` 필터 → 전부 404)
- `?csv=true` 추가 시 CSV. CSV의 timestamp는 `T` 대신 공백 구분(`2024-03-02 15:00:00+00:00`) [실측].
- Accept 헤더 기반 콘텐트 네고시에이션은 미문서화.

### 3.3 CORS / 브라우저 직접 호출 [실측]
- **CORS 정식 지원 확인:** `Origin` 포함 GET에 `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Credentials: true`, OPTIONS preflight도 전 메서드 허용·`Access-Control-Max-Age: 600`으로 응답.
- → historical 데이터는 **브라우저에서 직접 fetch 가능** (프록시 불필요). 인증(실시간) 호출만 백엔드 경유 권장 (§2.4).

---

## 4. 쿼리 문법

### 4.1 지원 연산자
| 연산자 | 문법 | 예 |
|---|---|---|
| 같음 | `param=value` | `driver_number=44` |
| 이상 | `param>=value` | `lap_number>=5` |
| 이하 | `param<=value` | `speed<=315` |
| 초과 | `param>value` | `year>2023` |
| 미만 | `param<value` | `date<2024-01-01` |

- **서로 다른 파라미터는 AND**: `?session_key=9472&driver_number=1&lap_number>=5&lap_number<=15`
- **같은 파라미터 반복은 IN(OR)** [공식 예시·실측]: `?drivers?session_key=9472&driver_number=1&driver_number=44` → 두 드라이버 모두 반환. 공식 문서의 championship 예시도 이 문법을 사용.
- **배열 타입 필드는 필터 불가** (예: `segments_sector_1`) [공식].
- **정렬/페이지네이션 미지원.** 응답은 통상 시간 오름차순으로 관찰되지만 [실측] 보장은 없음. 대용량 엔드포인트는 필터로 좁히는 게 유일한 수단.
- URL에 `<`/`>`를 그대로 쓰거나 `%3C`/`%3E`로 인코딩 — 둘 다 동작 [실측].

### 4.2 날짜/시간 입력
- 내부적으로 Python `dateutil.parser.parse` 사용 [공식]. ISO 8601 외에 다양한 포맷 허용:
  - `2021-09-10T14:30:20+00:00` (권장)
  - `2021-09-10`, `10 September 2021`, `Sep 10, 2021`
  - `09/10/2021` (지역 모호성 주의 — 월/일 해석 순서 불명)

### 4.3 `latest` 키워드
- `session_key=latest`, `meeting_key=latest` — 진행 중 세션이 있으면 그것, 없으면 **가장 최근에 종료된** 세션/미팅 [실측: 레이스 이틀 뒤 호출 시 직전 GP 반환]. "지금 라이브인가" 플래그는 별도로 없음 → `date_start`/`date_end`와 현재 시각을 비교해 판단해야 한다.
- **오프시즌 주의:** 시즌 사이 기간 404/405 동작이 보고된 바 있음 [커뮤니티]. 안전망 코드 필요.

---

## 5. 라이브 데이터 동작

### 5.1 라이브 윈도우 [공식]
- 세션 **시작 30분 전 ~ 종료 30분 후**가 "live" — 이 구간의 데이터 접근에 구독 필요. 윈도우가 끝나면 historical로 전환되어 무료 접근.
- REST 폴링 시 응답이 점진적으로 커지고, MQTT/WS는 발생 즉시 푸시.

### 5.2 지연(latency)
- **공식 수치: 약 3초** (라이브 이벤트 발생 → API 노출). TV 중계(통상 30~60초 지연)보다 빠르다 [공식].
- 다만 FastF1 커뮤니티 측정으로는 메시지 종류에 따라 편차가 있어, 텔레메트리 3~10초·순위 요약 10~30초까지 열어두는 것이 안전 [커뮤니티].

### 5.3 엔드포인트별 갱신 특성
| 엔드포인트 | 라이브 갱신 | 비고 |
|---|---|---|
| `car_data` | O | ~3.7 Hz [실측 확인] |
| `location` | O | ~3.7 Hz [실측 확인] |
| `laps` | O | 랩 진행 중에도 같은 `_key`로 섹터가 채워지며 갱신 (MQTT) |
| `position` | O | 이벤트 기반, 세션 전 초기 배치 포함 |
| `intervals` | O | ~4초 주기 [공식·실측]. **레이스 세션에만 존재** |
| `pit` / `stints` | O | 이벤트 기반 |
| `race_control` | O | 이벤트 기반 |
| `weather` | O | ~1분 주기 |
| `team_radio` | O | F1가 공개한 분량만 |
| `meetings` / `sessions` | 정적 | **매일 자정 UTC 갱신** [공식] |
| `session_result` / `starting_grid` | X | 공식 결과 발표 후 수 분 내 [공식] |
| `championship_drivers` / `championship_teams` | 부분 | 레이스 세션에만 존재. `*_current`는 호출 시점에 따라 레이스 중/후 값 [공식] |
| `overtakes` | X(사후) | 레이스만, 불완전 가능 [공식] |

### 5.4 알려진 라이브 불안정 사례 [커뮤니티]
- **2026-03-15 (레이스 데이):** `POST /token` 트래픽 스파이크로 API 전체 다운 — 인증 엔드포인트 rate limiting 부재가 원인 (Discussions #365).
- **2026-05-03 Miami:** 활성 세션 동안 전 엔드포인트 데이터 누락 (Issue #400).
- **2026-05-01 Miami FP1:** MQTT 연결 끊김으로 약 8분 텔레메트리 공백 (Issue #397).
- **세션 통째 결측 [실측 2026-07-27]:** 2026 개최 완료 레이스 13개 중 **2개(04-12 Bahrain, 04-19 Saudi Arabia)가 `race_control`·`pit`·`laps` 전부 404** — 일부 엔드포인트만 빠진 게 아니라 세션 데이터 자체가 없다. 나머지 11개는 정상(`race_control` 49~287건). **리플레이 대상 세션 목록은 "일정에 있으니 있을 것"이 아니라 실제 적재 여부로 만들어야 한다.**

> SLA 없는 커뮤니티 프로젝트라는 점은 항상 전제해야 함. (서비스 측 대응 — 수집 재시도·리플레이 경로 분리 — 은 `infra-architecture.md` §6 참조)

---

## 6. 시간/공간/단위 약속

### 6.1 시간
- 모든 timestamp는 **UTC**, ISO 8601, 오프셋 `+00:00`, 마이크로초(소수 6자리) 정밀도. 단, 표기 정밀도가 실제 정확도를 보장하지는 않음.
- 의미별 필드명:
  - `date` — 점(샘플) 시각 (텔레메트리, 날씨, 포지션 변화, race control 등)
  - `date_start` / `date_end` — 구간의 시작/끝 (세션, 미팅, 랩). **랩의 `date_start`는 근사값** [공식].
- `gmt_offset` (meetings/sessions) — `HH:MM:SS` 문자열. 현지 시각 표시용 정보일 뿐 API 자체는 전부 UTC.
- 업스트림 SignalR에는 세션 상대 시계(`SessionTime`)와 절대 시계(`Date`)가 있는데 OpenF1는 절대 시간을 사용. 리플레이 재생 정렬은 `date`(또는 MQTT `_id`)를 기준으로 삼는다.

### 6.2 좌표 (`location`)
- X/Y/Z 카르테시안 정수. **단위 1/10 미터(데시미터)** — 2023+ 데이터는 항상 dm [커뮤니티(FastF1)].
- **원점 (0,0,0)은 서킷별 임의** — 트랙상 특정 지점에 고정되지 않음 [공식]. 서킷마다 로컬 원점/회전이 다르다.
- 횡방향 정밀도가 낮아 "트랙 좌우 어디에 붙었는가"는 구분 불가 [공식].
- WGS-84 위경도 변환은 미제공. 트랙 그림 위에 마커를 얹으려면 **서킷별 affine transform**(평행이동+회전+스케일)을 직접 산출해야 한다.
- 보조 자원: `meetings.circuit_info_url`이 가리키는 **MultiViewer 서킷 API**(`https://api.multiviewer.app/api/v1/circuits/{key}/{year}`)가 트랙 아웃라인·코너 좌표 JSON을 제공하며, `location`과 같은 좌표계를 쓴다 (FastF1도 이를 사용) [공식·실측 200 확인].

#### 6.2.1 MultiViewer 서킷 JSON — 스키마와 좌표계 일치 [실측 2026-07-28, Spa `circuit_key=7`, 2026, 19.7 KB]

**좌표계가 `location`과 동일해 affine 변환이 필요 없다.** 같은 주말 퀄리(11330) NOR 1랩의 `location` 407건과 대조:

| | x 범위 | y 범위 |
|---|---|---|
| `location` 실측 | −4338 … 8313 | −15767 … 4550 |
| MultiViewer `x`/`y` | −4341 … 8316 | −15778 … 4555 |

→ 회전·평행이동·스케일 전부 불필요. **아웃라인에 직접 투영(project)해서 arc-length를 얻을 수 있다.** (§6.2의 "서킷별 affine transform을 직접 산출해야 한다"는 자체 SVG 소스를 쓸 때의 이야기다.)

**필드:**
| 필드 | 내용 |
|---|---|
| `x` / `y` | 트랙 아웃라인 폴리라인 (Spa 1005점). 누적 거리 합 69,617 dm = **6,962 m** (공식 7,004 m 대비 −0.6% — 폴리라인 코드 오차) |
| `miniSectorsIndexes` | **미니섹터 경계** — `x`/`y` 배열의 인덱스 (Spa 27개). §8.4 참조 |
| `marshalSectors` | 마셜 섹터 (Spa 21개) — `number`·`trackPosition`·`length`(랩 시작부터 누적 거리 dm)·`angle`. **`race_control.sector`와 번호가 대응** [실측: 2026 스파 레이스의 `sector` 값이 4~19로 전부 1~21 범위, `scope='Sector'` 메시지 81건] |
| `corners` | 코너 (Spa 19개) — 같은 구조. `number`로 **`TURN n` 라벨 파생 가능** (고유명 `Stavelot`은 여전히 없음) |
| `marshalLights` | 마셜 라이트 패널 (Spa 21개) |
| `pitLoss` | `{normal, sc, vsc}` — 핏 손실 시간 초 (Spa `19.07`/`12.08`/`13.80`) |
| `candidateLap` | 아웃라인을 만든 기준 랩 (`driverNumber`·`lapNumber`·`lapStartDate`·`lapTime`·`session`) — Spa는 2021 FP1 3번차 3랩 |
| `rotation` | 표시용 회전각(도). Spa 91 — **렌더링 방향 조정용이며 좌표 정합에는 불필요** |

- 투영 정확도 실측: 최근접점 잔차 **중앙값 20 dm(2 m)**, 최대 1286 dm(129 m — 핏레인·코스이탈 표본). 이상치 가드 필요.
- 서드파티이며 OpenF1보다도 보장이 없다 → **수집 시 R2에 스냅샷할 것** (infra §3.4). 비상업 개인 사용 범위에서 쓰고 출처를 표기한다.

### 6.3 텔레메트리 단위 (`car_data`)
| 필드 | 단위 | 비고 |
|---|---|---|
| `speed` | km/h (int) | — |
| `throttle` | % (0–100, int) | `104` 같은 비정상값은 센서 오류로 알려짐 [커뮤니티] |
| `brake` | 0/100 (int) | **사실상 binary**. 압력 비율 아님 [실측: 0/100만 관찰] |
| `n_gear` | 0–8 (int) | 0=중립 |
| `rpm` | rev/min (int) | — |
| `drs` | enum (int) | §8.9 매핑 참조 |

---

## 7. 엔드포인트 카탈로그 (18개)

### 7.1 ID/구조
- `/v1/meetings` — GP 주말(또는 테스트) 단위
- `/v1/sessions` — 세션 단위 (연습/예선/스프린트/레이스)
- `/v1/drivers` — 세션 스코프 드라이버 프로필

### 7.2 타이밍
- `/v1/laps` — 랩별 섹터/스피드트랩/미니섹터 색상
- `/v1/intervals` — 앞차 간격·리더 갭 (~4초 주기, **레이스 세션 전용**)
- `/v1/position` — 순위 변화 이벤트 시계열 (세션 전 초기 배치 포함)
- `/v1/stints` — 타이어 스틴트 (compound, age)
- `/v1/pit` — 핏 통과 (lane_duration, stop_duration)
- `/v1/overtakes` — 추월/순위 교환 이벤트 (레이스 전용, 베타 성격)

### 7.3 텔레메트리
- `/v1/car_data` — 속도/스로틀/브레이크/기어/RPM/DRS, ~3.7 Hz
- `/v1/location` — X/Y/Z 좌표, ~3.7 Hz

### 7.4 레이스 운영
- `/v1/race_control` — 깃발/SC/DRS/세션 상태/스튜어드 메시지
- `/v1/team_radio` — 드라이버 무선 MP3 URL (2026년 커버리지 급감)
- `/v1/weather` — 기온/노면온/습도/기압/풍속/풍향/강수, ~1분 주기

### 7.5 결과/집계
- `/v1/session_result` — 세션 최종 결과 (연습·예선·스프린트·레이스 모두 존재) [실측]
- `/v1/starting_grid` — 공식 문서엔 있으나 **실측상 대부분의 레이스에서 404** — 의존 금지 (§8.15)
- `/v1/championship_drivers` / `/v1/championship_teams` — 챔피언십 순위/포인트 (베타, 레이스 세션 전용)

### 7.6 공통 조인 키
```
meetings ─meeting_key─> sessions ─session_key─> (laps, intervals, position,
                                                  stints, pit, car_data,
                                                  location, race_control,
                                                  team_radio, weather,
                                                  session_result, drivers,
                                                  overtakes, championship_*)
                              ↑
                       driver_number → drivers
```
- `meeting_key`, `session_key`, `driver_number`가 전 엔드포인트 공통 외래키. 재조회해도 값이 바뀌지 않는 **안정적 정수 PK**.
- `meeting_key`/`session_key` 자리에 `latest` 키워드 사용 가능 (전 엔드포인트) [공식].

---

## 8. 엔드포인트 상세

### 8.1 `/v1/meetings`
**목적:** GP 주말(또는 프리시즌 테스트) 단위 1레코드. 프리시즌 테스트도 포함됨 (2026년: 미팅 26개 = 테스트 2 + GP 24) [실측].

**주요 필터:** `meeting_key`, `year`, `country_name`, `country_code`, `circuit_key`, `location`

**스키마:**
| 필드 | 타입 | 비고 |
|---|---|---|
| `meeting_key` | int | PK |
| `meeting_name` | str | 짧은 이름 (`Belgian Grand Prix`) |
| `meeting_official_name` | str | 타이틀 스폰서 포함 풀 네임 |
| `location` | str | 도시/지역 (`Spa-Francorchamps`) |
| `country_key` / `country_code` / `country_name` | int/str/str | code는 ISO 3166-1 alpha-3 |
| `country_flag` | url | 국기 이미지 (F1 CDN) |
| `circuit_key` / `circuit_short_name` | int/str | — |
| `circuit_type` | str | **`Permanent` \| `Temporary - Street` \| `Temporary - Road`** [공식·실측: 2026년 17/8/1, Spa가 Road] |
| `circuit_info_url` | url | **MultiViewer 서킷 JSON** (트랙 지오메트리, §6.2) |
| `circuit_image` | url | 트랙 아이콘. 신규 서킷은 generic 이미지일 수 있음 (Madring → 스페인 공용 아이콘) [실측] |
| `gmt_offset` | str | `HH:MM:SS` |
| `date_start` / `date_end` | ISO8601 | UTC |
| `year` | int | 챔피언십 연도 |
| `is_cancelled` | bool | 취소 여부 |

갱신: 매일 자정 UTC [공식].

---

### 8.2 `/v1/sessions`
**목적:** 미팅 내부 세션 1레코드. 스키마는 meetings와 유사 (`session_key`, `session_name`, `session_type`, `date_start/end`, `meeting_key`, `circuit_*`, `country_*`, `gmt_offset`, `year`, `is_cancelled`).

**주요 필터:** `session_key`, `meeting_key`, `session_name`, `session_type`, `year`, `country_name`, `circuit_key`

**`session_name` ↔ `session_type` 대응 (2026 시즌 실측):**
| `session_name` | `session_type` |
|---|---|
| `Practice 1/2/3` | `Practice` |
| `Sprint Qualifying` | **`Qualifying`** |
| `Qualifying` | `Qualifying` |
| `Sprint` | **`Race`** |
| `Race` | `Race` |

- **주의 1:** `session_type=Race` 필터는 **스프린트 레이스도 함께 반환**한다 (2026년: 30건 = GP 24 + 스프린트 6) [실측]. GP 본선만 원하면 `session_name=Race`로 걸러야 한다.
- **주의 2:** 과거 시즌 데이터에는 `session_type`이 `Sprint`/`Sprint Qualifying`으로 들어간 레코드도 있다 (공식 문서의 2023 예시). **세션 분류는 `session_name` 기준**이 시즌 간 일관적이다.
- 스프린트 주말은 연습이 `Practice 1` 하나뿐 [실측].

---

### 8.3 `/v1/drivers`
**목적:** 세션 단위 드라이버 프로필. 한 드라이버는 참가 세션 수만큼 레코드를 가진다. 2026년 기준 11팀 22명 [실측].

**스키마:**
| 필드 | 비고 |
|---|---|
| `driver_number` | 시즌 영구 번호. 챔피언이 1번을 선택하면 그 시즌 1로 표기 (2026: NOR=1) [실측] |
| `broadcast_name` | 방송 표기 (`L NORRIS`) |
| `full_name` / `first_name` / `last_name` | — |
| `name_acronym` | 3글자 (`NOR`). 시즌 내 안정, 시즌 간 변경 가능 |
| `team_name` / `team_colour` | 색상은 `#` 없는 HEX (`F47600`) |
| `headshot_url` | F1 공식 CDN, 인증 불필요. 게스트/리저브(및 일부 정규 드라이버)는 fallback 이미지 URL |
| `country_code` | **deprecated — 2026 시즌 종료 시 제거 예정** [공식]. 2026 세션에선 이미 전원 `null` [실측]. 국적 표시가 필요하면 자체 매핑 필요 |
| `session_key` / `meeting_key` | 컨텍스트 키 |

> 시즌 중 교체 드라이버는 별도 `driver_number`/`full_name`으로 들어옴. "누구의 대체"라는 관계 필드는 없음.

---

### 8.4 `/v1/laps`
**필터:** `session_key`, `meeting_key`, `driver_number`, `lap_number`, `is_pit_out_lap` (+ 수치 필드 범위)

**핵심 필드:**
- `lap_number` — 1부터 시작. 포메이션 랩은 별도 번호 없음
- `date_start` — 랩 시작 시각, **근사값** [공식]
- `lap_duration`, `duration_sector_1/2/3` — 초 단위 float. 미완성 랩/일부 아웃랩은 null
- `i1_speed`, `i2_speed`, `st_speed` — 인터미디엇/스피드트랩 km/h
- `is_pit_out_lap` — 아웃랩 여부. 랩타임 비교에서 통상 제외
- `segments_sector_1/2/3` — 미니섹터 상태 코드 **배열** (배열이므로 필터 불가)

**주의 — 개인 최고랩 플래그가 없다 [실측 2026-07-27]:** 랩 레코드에 `is_personal_best` 류의 필드는 **없다**(필드 전체: `date_start`·`driver_number`·`duration_sector_1/2/3`·`i1_speed`·`i2_speed`·`is_pit_out_lap`·`lap_duration`·`lap_number`·`meeting_key`·`segments_sector_1/2/3`·`session_key`·`st_speed`). 개인 최고랩은 **드라이버별 `min(lap_duration)`로 직접 계산**해야 하고, 핏 인/아웃랩은 제외한다(`is_pit_out_lap`). 미니섹터의 `2049`(개인 베스트)는 섹터 단위 플래그일 뿐 랩 단위가 아니다.
- `lap_duration`이 ms 정밀도(소수 3자리)라 **동률은 실무상 발생하지 않는다** [실측 2026 스파 HAM: 최고랩 L33 `109.454` 단일]. 그래도 동률 시 규칙은 정해 둘 것 — **최초 달성 랩**.

**미니섹터 코드 [공식 매핑]:**
| 값 | 의미 |
|---|---|
| `0` | 데이터 없음 |
| `2048` | 노랑 (개인 베스트보다 느림) |
| `2049` | 초록 (개인 베스트) |
| `2051` | **보라 (오버롤 베스트)** |
| `2064` | 핏레인 |
| `2050` / `2052` / `2068` | 의미 미상 [공식 문서도 `?`] |

- 배열 중간에 `null` 원소가 섞일 수 있다 [실측].
- **공식 문서는 "레이스 중 세그먼트 미제공"이라 하나, 실측상 레이스 랩에도 값이 채워져 있는 경우가 있다** (2024 Bahrain). 레이스에서의 신뢰도는 낮게 취급하고 연습/예선 위주로 활용.
- TV 그래픽 색상과 완전히 일치하지 않을 수 있음 [공식].

**미니섹터 개수와 커버리지 [실측 2026-07-28, 2026 스파 퀄리 `session_key=11330`, 269랩]:**

| `(s1,s2,s3)` 길이 | 랩 수 |
|---|---|
| `(8, 12, 8)` = 28개 | **232** |
| `(8, 12, 7)` | 27 |
| `(8, 12, 1)` | 9 |
| `(8, 1, null)` | 1 |

→ 서킷별로 개수가 고정(Spa 8/12/8)이고 **예선에서는 86%의 랩이 완전히 채워진다.** 짧은 배열은 진행 중이거나 중단된 랩이다.

**⚠ 미니섹터에는 "시간"이 없다.** 값은 색 코드뿐이므로 **구간별 랩타임/갭은 이 필드에서 나오지 않는다.** 방송 그래픽의 `GAP TO FASTEST -0.087` 같은 숫자는 별도 계산이 필요하다 — 아래.

**미니섹터 경계의 위치 = MultiViewer `miniSectorsIndexes` [실측 검증 2026-07-28]:**

§6.2.1의 아웃라인에 `location`을 투영해 각 경계 통과 시각을 구하고, 정확한 섹터 타임과 대조했다 (NOR 퀄리 최속 랩 `L8` 104.801s, S1/S2/S3 = 30.314/46.100/28.387):

| 경계 | 통과 시각(파생) | 정확값 | 오차 |
|---|---|---|---|
| **8번째** | 30.133 s | `duration_sector_1` 30.314 | 0.181 s |
| **20번째** | 76.347 s | S1+S2 = 76.414 | 0.067 s |
| 27번째(마지막) | 104.552 s | `lap_duration` 104.801 | 0.249 s |

→ **8 = 섹터1 끝, 20 = 섹터2 끝**이 8/12/8 분할과 정확히 일치한다. 미니섹터 지오메트리는 이 인덱스로 확정된다.
- ⚠ **개수는 1개 어긋난다** — `segments_*` 합계는 28개인데 `miniSectorsIndexes`는 27개(마지막이 S/F 라인)로, 섹터 3에서 1개가 모자란다. **서킷별로 검증하고, 기준점은 항상 정확한 `duration_sector_*` 3개로 잡을 것.**

**"최속 랩과의 갭"을 미니섹터 단위로 만들 수 있는가 — 조건부 가능 [실측 2026-07-28]:**

두 랩(ANT 104.361 최속 vs VER 104.678)을 같은 아웃라인에 투영해 경계별 갭을 계산하고, 정확한 근거가 있는 지점에서 대조:

| 지점 | 파생 갭 | 정확 갭 (섹터 타임 차) | 오차 |
|---|---|---|---|
| 미니섹터 8 (=S1 끝) | +0.302 | +0.283 | **+0.019 s** |
| 미니섹터 20 (=S2 끝) | +0.291 | +0.274 | **+0.017 s** |
| 미니섹터 27 (S/F) | +0.428 | +0.317 | +0.111 s |

- **투영의 계통 오차는 두 랩 사이에서 대부분 상쇄된다** → 랩 중간 지점 오차 **±0.02 s**.
- 다만 S/F 라인 부근(인덱스 954→1004의 큰 점프)에서는 0.11 s로 커지고, **미니섹터 단위 갭에는 물리적으로 불가능한 흔들림이 있다** (실측: MS11 +0.178 → MS12 +0.464 → MS13 +0.449). 3.7 Hz 표본(270 ms 간격, 300 km/h에서 22 m)의 한계다.
- → **소수 3자리는 허위 정밀도다. 2자리로 표기하고, 섹터 경계 3개는 정확값으로 고정할 것.** 방송의 3자리 숫자는 재현 대상이 아니다.
- 연산량: 세션당 표본 22대 × 3600 s × 3.7 Hz ≈ **29만 건**. 연속 표본이 트랙을 단조 진행하므로 최근접 탐색을 진행 인덱스에서 시작하면 O(n) — 클라이언트에서 충분하다.

---

### 8.5 `/v1/intervals`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `interval`, `gap_to_leader`

**필드:**
- `date` — UTC
- `interval` — 앞차와의 갭(초). `gap_to_leader` — 리더와의 갭(초)
- 두 필드 모두 값 타입이 **float | 문자열 | null** 3종 [실측]:
  - 랩 다운 시 문자열 `"+1 LAP"` (복수 랩은 `"+N LAPS"`) → 숫자 연산 전 타입 확인 필수
  - 리더는 null이 원칙이나, **null이 리더가 아닌 드라이버에게도 산발적으로 나타난다** [실측] → "null이면 리더"로 추론하지 말고 리더 판정은 `position`으로 할 것

**특성:**
- 갱신 주기 ~4초 [공식·실측: 2분 창에서 드라이버당 ~30건].
- **레이스 세션 전용** — 연습/예선 조회는 404 [공식·실측].
- **historical 제공 정상** — 2023·2024·2026 레이스 모두 과거 조회 가능 [실측]. (구버전 문서의 "live only" 서술은 폐기됨)
- 레이스 초반 수 랩은 값이 늦게 채워지는 구간이 흔함 [커뮤니티].

---

### 8.6 `/v1/position`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `position`

**필드:** `date`, `driver_number`, `position` (1=리더)

**특성:**
- 초기 배치 + 변화 시점 이벤트 기록 [공식]. **세션 시작 전(약 1시간 전) 레코드부터 존재**하고, 시작 직후 전 드라이버 초기값이 한꺼번에 들어온다 [실측].
- 세이프티카·포메이션 중에는 순위 변화가 없어 갱신이 거의 멈춤.
- **최종 결과 ≠ 마지막 `position`** — 페널티 등으로 `session_result`와 다를 수 있다.
- 현재 순위표를 만들려면 드라이버별 최신 레코드를 집계해야 한다 (상태 스냅샷 엔드포인트 없음).

---

### 8.7 `/v1/stints`
**필터:** `session_key`, `meeting_key`, `driver_number`, `stint_number`, `compound`, `tyre_age_at_start`

**필드:** `stint_number`(1부터), `lap_start`, `lap_end`, `compound`, `tyre_age_at_start`(장착 시점 누적 사용 랩)

**`compound` 값:** `SOFT`, `MEDIUM`, `HARD`, `INTERMEDIATE`, `WET`

**주의 [커뮤니티, Issue #89]:** 과거 일부 세션(2024 Hungarian GP 등)에서 `lap_end`와 다음 스틴트 `lap_start`가 같은 랩으로 중복 표기된 사례. 2024 Bahrain 실측에선 재현되지 않았으나(인접 43쌍 중 0), 랩 수 합산 시 경계 랩 중복 방어 코드를 두는 것이 안전.

---

### 8.8 `/v1/pit`
**필터:** `session_key`, `meeting_key`, `driver_number`, `lap_number` (+ duration 범위)

**필드:**
- `date` — 핏레인 진입 시각
- `lap_number` — 진입 랩
- `lane_duration` — 핏레인 진입~퇴출 총 시간(초)
- `stop_duration` — 박스 정차 시간(초). **2024 US GP 이후에만 존재** [공식] — 그 이전 세션은 전부 null [실측: 2024 Bahrain 43/43 null, 2026 Spa 전건 채워짐]
- `pit_duration` — `lane_duration`의 **deprecated 별칭, 2026 시즌 종료 시 제거 예정** [공식]. 신규 코드는 `lane_duration` 사용

---

### 8.9 `/v1/car_data`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date` (+ 수치 필드 범위)

**필드:** `date`, `speed`, `rpm`, `throttle`, `brake`, `n_gear`, `drs`

**DRS 코드 [공식(FastF1 유래) 매핑]:**
| 값 | 의미 |
|---|---|
| 0, 1 | OFF |
| 2, 3, 9 | 미상 (`?`) |
| 8 | ELIGIBLE — 디텍션 존 통과, 아직 미개방 |
| 10, 12, 14 | ON (셋의 구분은 미문서화) |

→ 실용 권장: `>=10` ON, `==8` 자격만, `0/1` OFF.

**시즌별 가용성 — 2026은 `drs`가 전부 null이다 [실측 2026-07-28]:**

| 시즌 | `car_data.drs` | `race_control?category=Drs` |
|---|---|---|
| 2024 (Bahrain 9472) | 값 있음 — `drs>=10` **145건**(14×142, 10×3), `drs=8` **344건** | — |
| 2025 (Qatar 9850) | 값 있음 — `drs>=10` **254건**(14×250, 10×4) | — |
| **2026 (Spa 11334)** | **459/459 전부 `null`** | **404** (2023 싱가포르는 `DRS ENABLED/DISABLED` 4건 정상) |

- 2026 규정에서 DRS가 폐지되었고, **`car_data`의 필드 목록도 2024와 완전히 동일하다** (`brake·date·driver_number·drs·meeting_key·n_gear·rpm·session_key·speed·throttle`) — 액티브 에어로(스트레이트/코너 모드)·오버테이크 모드용 **신규 필드는 없다.**
- → **DRS zone은 2023~2025만 데이터로 도출 가능**하고, **2026의 차량별 모드 사용 여부는 관측 불가**다. 단 **세션 단위 허용 상태는 `race_control`에 있다** — §8.11의 `OVERTAKE ENABLED/DISABLED` 참조.
- 도출 방법: `drs` 전이(`0|1 → 8` = 디텍션, `<10 → >=10` = 액티베이션 시작, `>=10 → 0|1` = 종료) 시각을 `location`과 ±150 ms 매칭 → §6.2.1 아웃라인에 투영해 arc-length → 1D 클러스터링. `?drs>=10` / `?drs=8` 범위 필터로 필요한 표본만 24~57 KB로 받을 수 있어 `car_data` 전량 저장이 불필요하다 (저장 범위 제외 유지, infra §3.1).

**볼륨:** 샘플레이트 ~3.7 Hz [실측: 30초에 111건]. 90분 세션 기준 드라이버당 약 2만 건, 20대 전체 약 40만 건. **반드시 `driver_number` + 좁은 `date` 범위로 필터**해서 호출할 것.

---

### 8.10 `/v1/location`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `x`, `y`

**필드:** `date`, `x`, `y`, `z` (정수, 1/10 m)

**특성:**
- `car_data`와 **타임스탬프가 정확히 일치하지 않음** — 결합 시 ~150 ms 윈도우 nearest-neighbor 매칭 필요 [커뮤니티].
- `(0,0,0)` 값은 가라지/신호 없음의 센티넬로 실제 등장한다 [공식 문서의 MQTT 예시에도 x=y=z=0 레코드] — 실주행 좌표로 취급하지 말 것.
- 서킷별 원점/방향이 달라 트랙 렌더링에는 서킷별 캘리브레이션(affine) 또는 MultiViewer 서킷 JSON(§6.2)이 필요.
- 볼륨은 `car_data`와 동급 (~3.7 Hz).

---

### 8.11 `/v1/race_control`
**필터:** `session_key`, `meeting_key`, `driver_number`, `lap_number`, `date`, `category`, `flag`, `scope`, `sector`

**필드와 값 (2024 레이스 실측 분포 포함):**
- `category` — `Flag`, `Other`, `Drs`, `SessionStatus`, `CarEvent`, **`SafetyCar`** [공식·실측 모두 확인]
  - ⚠ `SafetyCar`는 **공식 문서 예시에 없어 이 문서도 누락하고 있었다** — 2026-07-27 실측 추가. 2023 싱가포르 4건, 2026 스파 6건, 2026 8개 레이스 전수에서 확인.
- `flag` — `GREEN`, `YELLOW`, `DOUBLE YELLOW`, `RED`, `CHEQUERED`, `BLUE`, `BLACK AND WHITE`, `BLACK`, `CLEAR` + **null** (깃발 무관 메시지)
- `scope` — `Track`, `Sector`, `Driver` + **null**. scope에 따라 `sector`/`driver_number`가 채워짐
- `qualifying_phase` — 예선에서만 1/2/3 (Q1/Q2/Q3), 그 외 null
- `message` — 자유 텍스트. **파싱 대상이 아니라 표시용**으로 취급 (형식 보장 없음)
- 세션 시작 전 메시지도 포함되며 그때도 `lap_number=1`로 찍힌다 [실측]

**볼륨:** 세션당 30~150건 (2024 Bahrain 레이스: 71건).

**주의 — SC/VSC 판별 [실측 2026-07-27]:**
- 세이프티카와 버추얼 세이프티카는 **둘 다 `category='SafetyCar'` · `flag=null`**로 들어온다. 구분 정보는 `message` 텍스트뿐이다.
- 그 텍스트가 **시즌마다 다르다:** 2023~2025 `VIRTUAL SAFETY CAR DEPLOYED` / `… ENDING` ↔ 2026 `VSC DEPLOYED` / `VSC ENDING`. 따라서 SC/VSC를 구분하려면 두 표기를 **모두** 매칭해야 한다(`VSC` ∪ `VIRTUAL`).
- 다행히 문구 집합 자체는 닫혀 있다 — 아래 "도출 알고리즘"의 전수 조사표 참조.

**주의 — 재개(그린 플래그)는 `flag='GREEN'`이 아니다 [실측 2026-07-27]:**
- `flag='GREEN'`은 **전부 랩 1의 `GREEN LIGHT - PIT EXIT OPEN`**이다 (2026 6개 레이스 12/12건, 2023 싱가포르 2/2건). 레이스 중 재개를 뜻하는 GREEN 레코드는 **0건**.
- SC·VSC·옐로 해제 후의 재개는 **`flag='CLEAR'` + `scope='Track'` (`TRACK CLEAR`)**로 들어온다 [2023 L22·L45, 2026 L4·L18·L21 확인]. `scope='Sector'`인 `CLEAR`는 해당 섹터 해제일 뿐 재개가 아니다 — **scope로 반드시 구분할 것.**

**주의 — 이벤트 위치는 `lap_number`가 아니라 `date`로:** 2026 스파 L18에서 `VSC DEPLOYED`와 `VSC ENDING`이 같은 랩에 찍혔다. 시간축 UI(스크럽 바 등)에 랩 번호로 배치하면 두 이벤트가 겹친다.

**중립화 구간 도출 — 실측 검증 [2026 스파 `session_key=11334`]:**

`date`는 초 단위로 들어오므로 구간을 그대로 만들 수 있다.

| 이벤트 | `date` | 랩 |
|---|---|---|
| `SAFETY CAR DEPLOYED` | 13:05:25 | L1 |
| `SAFETY CAR IN THIS LAP` | 13:12:32 | L4 |
| `TRACK CLEAR` (`CLEAR`/`Track`) | 13:13:50 | L4 |
| `VSC DEPLOYED` | 13:39:13 | L18 |
| `VSC ENDING` | 13:39:46 | L18 |
| `TRACK CLEAR` | 13:39:59 | L18 |
| `VSC DEPLOYED` | 13:43:18 | L20 |
| `VSC ENDING` | 13:44:52 | L21 |
| `TRACK CLEAR` | 13:45:06 | L21 |

→ 구간 = **전개 `date` ~ 그 다음 `TRACK CLEAR` `date`**: SC 8분 25초, VSC 46초, VSC 1분 48초.
`… IN THIS LAP` / `… ENDING`은 **해제 예고**이지 재개가 아니다(각각 78초·13초·14초 앞섬) — 구간 끝으로 쓰지 말 것.

**도출 알고리즘 — 결정론적, 자연어 처리 불필요 [실측 검증 완료]:**

```js
// race_control을 date 오름차순으로 훑으며 상태 기계 하나만 돌린다.
// 문자열 판정은 '어미가 DEPLOYED인가' + '앞이 VSC/VIRTUAL인가' 두 개뿐.
let open = null; const out = [];
for (const x of rc.sort(byDate)) {
  const m = (x.message || '').trim().toUpperCase();
  if (x.category === 'SafetyCar') {
    if (m.endsWith('DEPLOYED')) {
      const kind = m.startsWith('VSC') || m.startsWith('VIRTUAL') ? 'VSC' : 'SC';
      if (!open) open = { kind, start: x.date, startLap: x.lap_number };
      else if (kind === 'SC' && open.kind === 'VSC') open.kind = 'SC';  // VSC→SC 격상
    }
  } else if (x.flag === 'CLEAR' && x.scope === 'Track' && open) {
    out.push({ ...open, end: x.date, endLap: x.lap_number }); open = null;
  }
}
if (open) out.push({ ...open, end: null });   // 해제 없이 세션 종료
```

- `… IN THIS LAP` / `… ENDING` / `SAFETY CAR THROUGH THE PIT LANE`은 **읽지 않는다** — 어미가 `DEPLOYED`가 아니므로 자동으로 무시되고, 구간 끝은 항상 `TRACK CLEAR`가 된다.
- **VSC→SC 격상 처리가 필요하다** [실측 2024 Qatar]: `17:08:24 VIRTUAL SAFETY CAR DEPLOYED` 20초 뒤 `17:08:44 SAFETY CAR DEPLOYED`. 격상 분기가 없으면 구간 경계는 맞지만 라벨이 `VSC`로 남는다.
- 실행 결과: 2026 스파 `SC L1–L4 / VSC L18 / VSC L20–L21`, 2023 싱가포르 `SC L20–L22 / VSC L44–L45`, 2024 Qatar `SC L1–L4 / SC L35–L39 / SC L40–L42`, 2025 Australia `SC L1–L7 / SC L34–L41 / SC L47–L51` — 수기 판독과 완전 일치.

**문구 집합은 닫혀 있다 [실측: 2023~2026 레이스 95개 중 응답 81개, SafetyCar 이벤트 보유 54개 세션 전수 조사].** `category='SafetyCar'`의 `message`는 **7종뿐**이고 그 밖은 0건:

| message | 건수 |
|---|---|
| `SAFETY CAR DEPLOYED` | 54 |
| `SAFETY CAR IN THIS LAP` | 47 |
| `VIRTUAL SAFETY CAR DEPLOYED` | 32 |
| `VIRTUAL SAFETY CAR ENDING` | 26 |
| `VSC DEPLOYED` | 15 |
| `VSC ENDING` | 15 |
| `SAFETY CAR THROUGH THE PIT LANE` | 4 |

→ 자유 텍스트지만 **이 필드에 한해서는 사실상 열거형**이다. 다만 열거형이라는 보장이 문서에 없으므로, 알려지지 않은 문구가 나오면 조용히 무시하지 말고 로그에 남길 것.
- **랩 그래프 음영용 매핑:** 랩 구간 `[date_start, date_start + lap_duration]`이 중립화 구간과 겹치면 그 랩을 칠한다. 2026 스파 VER(#1) 결과 `L1,2,3,4(SC) · L18,20,21(VSC)` — 해당 랩 `140.0/163.2/157.3/158.2/122.6/130.0/121.7 s`, 비음영 랩 `110~113 s`. **경계가 정확히 갈린다** (VSC 두 구간 사이의 L19는 `111.5 s`로 미음영).

**독립 교차검증 (랩타임과 대조):** 위 구간에 시작된 랩의 중앙값 랩타임이 나머지 구간과 확연히 갈린다 — SC **159.62 s**, VSC **124.33 s / 128.89 s**, 그 외 791랩 **111.99 s**. 중립화 구간 안의 최속 랩(112.01 s)조차 세션 최속(108.89 s)보다 느리다. **타임스탬프가 실제 주행 상황과 일치한다는 증거다.**

**2026 오버테이크 모드 허용 상태 — `OVERTAKE ENABLED` / `DISABLED` [실측 2026-07-28]:**

2023의 `category='Drs'` + `DRS ENABLED/DISABLED`를 2026에서 대체하는 신호가 있다. **`category='Other'`, `flag=null`**로 들어온다.

- 2026 완료 레이스 13개 중 **11개에서 관측**(나머지 2개는 §5.4의 세션 통째 결측인 Bahrain·Saudi). 문구는 **`OVERTAKE ENABLED`·`OVERTAKE DISABLED` 두 종뿐**이고 `STRAIGHT MODE`·`SLM`·`AERO` 류 문구는 **0건**이다.
- 예선에도 있다 (2026 스파 퀄리 `OVERTAKE ENABLED` 14:57:28 1건).
- 중립화와 정합한다 [2026 스파 레이스 실측]: `OVERTAKE DISABLED` 12:57:25(레이스 시작 전) → `TRACK CLEAR` 13:13:50 → **`OVERTAKE ENABLED` 13:16:13** (재개 후 2랩 뒤 허용, DRS 시절과 같은 관례).
- ⚠ **차량별 사용 여부는 여전히 없다.** 이 신호는 "지금 오버테이크 모드가 허용되는가"라는 **세션 단위 상태**일 뿐이다. 스트레이트 모드(SLM)의 허용 상태를 알리는 메시지는 존재하지 않는다.
- 리플레이에서는 `date` 순으로 훑어 커서 시점의 최신 상태를 취하면 된다(`ENABLED`/`DISABLED` 토글). SC/VSC 상태 기계와 동일한 패턴.

**스트레이트 모드(SLM) zone은 API에 없다 — 수동 큐레이션이 유일한 경로 [조사 2026-07-28]:**

- 2026 규정의 스트레이트 모드는 **FIA가 서킷마다 지정한 액티베이션 존**에서만 쓸 수 있다(근접 조건 없이 전 드라이버 사용 가능). 멜버른 5곳, 스파 5곳으로 공표됐다 — 즉 **"구역"이 실재한다.**
- 그러나 **어떤 API·공개 데이터셋도 이 좌표를 제공하지 않는다.** 출처는 이벤트별 FIA 레이스 디렉터 이벤트 노트(PDF)와 F1 공식 서킷 맵 그래픽이고, 커뮤니티 블로그가 이를 옮겨 적는다. MultiViewer 서킷 JSON에도 없다(§6.2.1 필드 목록 확인).
- 오버테이크 모드는 DRS와 같은 **디텍션 포인트 1개 + 액티베이션 포인트 1개** 구조다 (스파: 디텍션 = 버스스톱 T19 앞, 액티베이션 = S/F 라인 / 멜버른: 디텍션 = 마지막 직전 코너 뒤, 액티베이션 = 마지막 코너 앞).
- → **`data/slm-zones.json` 수동 큐레이션 + 코너 번호 기준 기술 → arc-length 변환**이 현실적인 방법이다. 존 길이가 주말 중 조정될 수 있다는 보도가 있어 **세션 단위가 아니라 서킷·연도 단위 근사로 취급**하고, 정확도를 주장하지 말 것.

**퀄리 세그먼트 경계 도출 [실측 2026-07-28, 2026 스파 퀄리 `session_key=11330`]:**

Q1/Q2/Q3 경계는 하드코딩할 필요 없이 `race_control`에서 그대로 나온다 — **`qualifying_phase`(1/2/3) + `SessionStatus 'SESSION STARTED'` / `flag='CHEQUERED'` 쌍**이 세그먼트마다 찍힌다:

| `date` | phase | 이벤트 |
|---|---|---|
| 14:00:00 | 1 | `SESSION STARTED` + `GREEN LIGHT - PIT EXIT OPEN` |
| 14:18:00 | 1 | `CHEQUERED FLAG` |
| 14:25:00 | 2 | `SESSION STARTED` |
| 14:40:00 | 2 | `CHEQUERED FLAG` |
| 14:50:00 | 3 | `SESSION STARTED` |
| 14:56:55 | 3 | **`RED FLAG`** → 15:00:16 `Q3 WILL RESUME AT 17:04` |
| 15:04:00 | 3 | `SESSION STARTED` (재개 — 같은 phase에 START가 2회) |
| 15:10:06 | 3 | `CHEQUERED FLAG` |

- **주의 1:** 적기 중단 시 같은 phase에 `SESSION STARTED`가 여러 번 온다 — 세그먼트 시작은 **phase별 최초** START, 끝은 **phase별 최후** CHEQUERED로 잡을 것.
- **주의 2:** 퀄리에서는 `flag='GREEN'`이 세그먼트마다 나온다(전부 `PIT EXIT OPEN`, 재개 포함 4건) — "GREEN은 랩 1뿐"이라는 §위 관찰은 **레이스 한정**이다.
- **랩의 세그먼트 분류는 `laps.date_start` 버킷팅으로 충분하다** [실측 NOR 11랩]: Q1 `14:05~14:09` / Q2 `14:27~14:31` / Q3 `14:51~15:08`로 깨끗이 갈린다. 부산물 두 개 주의 — 가라지 대기가 포함된 아웃랩은 `lap_duration`이 1000초대로 찍히고(`is_pit_out_lap=true`라 어차피 제외), 적기로 중단된 랩은 `lap_duration=null`이다.
- → **시안의 고정 경계(0/43.3/68.3/81.7%)는 목업 근사일 뿐, 구현은 이 실데이터 경계를 쓴다.** 세그먼트별 잔여 시간·"보드가 채워지는" 게이팅도 전부 이 시각들에서 파생 가능.

**리플레이 키 모먼트 파생 가능 여부 [실측 2026 스파 `session_key=11334`]:**

| 마커 | 소스 | 판정 |
|---|---|---|
| 핏스톱 | `/v1/pit` — `lap_number`·`date`·`lane_duration` (28건, 최다 랩 L20에 7건) | ✅ 확정 가능 |
| 패스티스트 랩 | `/v1/laps` 최소 `lap_duration` (875행 중 null 4건; 최속 = 1번 차 L44 108.89s, `date_start` 보유) | ✅ 확정 가능 |
| SC / VSC | `category='SafetyCar'` + message 매칭 | ⚠ 조건부 — 위 주의 참조 |
| 재개(그린) | `flag='CLEAR'` + `scope='Track'` | ✅ 가능하나 **소스가 GREEN이 아님** |
| 코너 이름 (예: "Stavelot") | 없음 — `scope='Sector'`의 섹터 번호이거나 자유 텍스트 속 `TURN n`뿐 | ❌ 파생 불가 |

---

### 8.12 `/v1/team_radio`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`

**필드:** `date`, `driver_number`, `recording_url` (MP3)

**주의:**
- **2026년부터 커버리지 급감 — 대부분의 이벤트에 라디오 데이터가 아예 없다** (F1 측 정책, OpenF1가 공식 공지) [공식]. 있는 이벤트도 존재 (2026 Spa 레이스 29건 [실측]) — 이벤트별 복불복으로 설계할 것.
- 원래도 전체 교신이 아니라 F1가 공개한 일부만, **드라이버→피트 방향만** 포함.
- MP3는 F1 CDN(livetiming.formula1.com) 직링크, 인증 불필요 [실측 200]. 단 영속성 보장 없음.
- **URL 파일명 패턴은 시즌마다 다르다** [실측: 2024 `MAXVER01_1_...` vs 2026 `OCO_31_...`] — URL을 파싱하지 말고 불투명 문자열로 취급.

---

### 8.13 `/v1/weather`
**필터:** `session_key`, `meeting_key`, `date` (+ 수치 필드 범위)

**필드/단위:**
| 필드 | 단위 | 비고 |
|---|---|---|
| `air_temperature` | °C float | |
| `track_temperature` | °C float | |
| `humidity` | % | |
| `pressure` | mbar | |
| `wind_speed` | m/s | |
| `wind_direction` | ° (0~359) | 기상학 관례 — 바람이 **불어오는** 방향 |
| `rainfall` | 0/1 | 강수 유무만. 강도 정보 없음 |

**갱신:** ~1분 주기. 세션 시작 1시간 전부터 기록되어 세션당 100~200건 [실측: 157건].

---

### 8.14 `/v1/session_result`
**필터:** `session_key`, `meeting_key`, `driver_number`, `position`

**세션 타입별 응답 형태 [실측]:**
| 세션 | `duration` | `gap_to_leader` | `points` |
|---|---|---|---|
| 연습 | 베스트랩(초, float) | float | **필드 없음** |
| 예선 계열 | **길이 3 배열** `[Q1, Q2, Q3]` — 미진출 단계는 null | 동일 형태 배열 | **필드 없음** |
| 스프린트 | 총 레이스 타임(초) | float \| `"+N LAP(S)"` \| 0(리더) | 있음 (P1=8.0) |
| 레이스 | 총 레이스 타임(초) | float \| `"+N LAP(S)"` \| 0(리더) | 있음 |

- 예선 배열은 항상 길이 3에 **null 패딩** — Q1 탈락자는 `[92.809, null, null]` [실측]. (길이가 줄어드는 게 아님)
- 레이스 `gap_to_leader`는 랩 다운 시 문자열 — intervals와 같은 타입 주의.
- `dnf`/`dns`/`dsq` boolean. dnf/dns는 예선·레이스에서만 true 가능 [공식].
- 공식 결과가 F1 사이트에 발표된 뒤 수 분 내 생성 [공식]. 라이브 중에는 없음.
- `points`는 해당 시즌 규정의 실제 부여 포인트 (보너스 포함 가능).

---

### 8.15 `/v1/starting_grid`
- 공식 문서 스키마: `position`, `driver_number`, `lap_duration`(예선 랩타임), `meeting_key`, `session_key`(레이스 세션 키).
- **실측: 2024 Bahrain·2025 Mexico City·2026 Spa 레이스 모두 404** ("No results found"). 공식 문서의 2023 예시 키(7783)만 200. 데이터 적재가 세션별로 누락이 많다.
- → **의존 금지.** 그리드가 필요하면 직전 예선의 `session_result`(단, 그리드 페널티 미반영)나 레이스 `position`의 초기 레코드로 대체.

---

### 8.16 `/v1/overtakes`
**목적:** 순위 교환 이벤트. 트랙 위 추월뿐 아니라 **핏스톱·페널티로 인한 순위 변동도 포함** [공식].

**필터:** `session_key`, `meeting_key`, `overtaking_driver_number`, `overtaken_driver_number`, `position`, `date`

**필드:** `date`, `overtaking_driver_number`, `overtaken_driver_number`, `position`(추월자의 추월 후 순위)

**주의:** 레이스 전용. **"불완전할 수 있음" 명시** [공식]. 2024·2026 레이스에서 정상 반환 확인 [실측].

---

### 8.17 `/v1/championship_drivers` · `/v1/championship_teams` (베타)
**목적:** 드라이버/컨스트럭터 챔피언십 순위·포인트. **레이스 세션에만 존재** [공식].

**필드:** `position_start`/`position_current`, `points_start`/`points_current` (+ `driver_number` 또는 `team_name`)
- `*_start` = 레이스 시작 전 기준, `*_current` = **호출 시점에 따라 레이스 중 또는 확정 후 값** [공식].
- 반복 파라미터 IN 필터 지원 예시가 이 엔드포인트에 있음 (`driver_number=4&driver_number=81`).
- 2026 데이터 정상 반환 확인 (11팀) [실측]. 베타 지위 — 스키마 변동 가능성 열어둘 것.

---

## 9. 데이터 볼륨 가이드 (90분 레이스, 20대 기준 근사)

| 엔드포인트 | 주기 | 드라이버당 | 세션 전체 |
|---|---|---|---|
| `car_data` | ~3.7 Hz | ~20,000 | ~400,000 |
| `location` | ~3.7 Hz | ~20,000 | ~400,000 |
| `intervals` | ~4초 | ~1,400 | ~28,000 |
| `position` | 이벤트 | 수~수십 | 수백 |
| `laps` | 랩당 1 | 44~78 | ~1,000–1,600 |
| `weather` | ~1분 | — | 100~200 |
| `race_control` | 이벤트 | — | 30~150 |
| `team_radio` | 이벤트 | 0~수십 | 0~수백 (2026년은 0인 이벤트 다수) |
| `stints` | 스틴트당 1 | 2~4 | 40~80 |
| `pit` | 핏 통과당 1 | 1~4 | 30~60 |
| `overtakes` | 이벤트 | 수 건 | 수십~수백 |
| `session_result` | 세션당 | 1 | 20 |

→ `car_data`/`location`은 항상 **`driver_number` + 좁은 `date` 범위**로 좁혀 호출할 것. (soon-board의 세션 수집·청크 저장 전략은 `infra-architecture.md` §3·§6 참조)

---

## 10. 시간 커버리지

### 10.1 시작점
- **2023 시즌이 절대 시작점** [공식]. 2022 이전 데이터는 공개 API에 없음.

### 10.2 엔드포인트별 미세 차이
- `pit.stop_duration`: **2024 US GP부터** [공식]. 이전 세션은 null.
- `team_radio`: 2026년부터 대부분의 이벤트 미제공 [공식].
- `overtakes`: 불완전 가능 [공식].
- `drivers.country_code`: 2026년 null → 시즌 후 필드 제거 예정 [공식].
- `session_type` 어휘가 시즌에 따라 다름 (§8.2) — 분류는 `session_name` 기준.
- 일부 2024 Sprint Qualifying 섹터/랩 타임 누락 (FastF1 #597, 업스트림 피드 문제) [커뮤니티].
- Miami 2026: 라이브 수집 실패로 historical 기록 자체에 공백 가능 [커뮤니티].

### 10.3 세션 타입
- FP1/FP2/FP3, Qualifying, Sprint, Sprint Qualifying, Race 모두 커버. 프리시즌 테스트도 `meetings`/`sessions`에 포함 [실측].

### 10.4 취소된 세션
- `is_cancelled` 필드 존재. 우천 중단/부분 진행 세션의 표기 방식은 공식 문서 부재 (Discussions #384 미답변) [커뮤니티].

### 10.5 자가 호스팅으로 pre-2023 확장
- 메인테이너는 "2023 이전은 공개 ingestion에서 제외" 입장 (수요 대비 호환성 비용). 프로젝트의 historical ingestor를 직접 돌리면 F1 정적 타이밍 아카이브에서 가져올 수 있으나 시즌별 스키마 차이로 추가 작업 필요 [커뮤니티].

---

## 11. 알려진 함정 정리

**타입/파싱**
1. `intervals`·`session_result`의 갭 필드는 **float | `"+N LAP(S)"` 문자열 | null** 3종 — 숫자 연산 전 타입 체크.
2. `intervals`의 null은 리더 외 드라이버에게도 나타난다 [실측] — **리더 판정은 `position`으로**.
3. 예선 `session_result`의 `duration`/`gap_to_leader`는 **항상 길이 3 배열, null 패딩** — 길이로 진출 단계를 세지 말 것.
4. `points` 필드는 연습/예선 응답에 **아예 없음** (null이 아니라 부재) — 옵셔널 처리.
5. `segments_sector_*` 배열 중간에 null 원소 가능.
6. `brake`는 0/100 binary — 압력 그래프로 가정 금지.
7. `throttle` 100 초과 값(104 등)은 센서 오류.
8. `drivers.country_code`는 이미 null (2026) — 사용 금지.

**HTTP/쿼리**
9. **조건 미일치 = HTTP 404** (`{"detail":"No results found."}`) — 404를 오류로 처리하면 정상 상황(예선에 intervals 없음 등)이 전부 에러가 된다.
10. 정렬 보장 없음, 페이지네이션 없음 — 큰 응답은 필터 분할이 유일한 수단.
11. `session_key=latest`는 오프시즌에 404/405 가능 — 핸들링 필요.
12. 배열 필드는 필터 불가.

**의미론**
13. `session_type=Race`에 스프린트가 섞여 온다 — GP 본선은 `session_name=Race`.
14. **API는 상태 머신이 아닌 로그** — "현재 상태" 엔드포인트 없음. 최신 레코드 집계로 클라이언트가 계산 (MQTT `_key` upsert 규칙 참조).
15. **최종 순위 ≠ 마지막 `position`** — 페널티 반영은 `session_result`에만.
16. `laps.date_start`는 근사값 — 정밀 동기화 기준으로 쓰지 말 것.
17. `total_laps`(예정 레이스 거리) 필드 없음 — 서킷별 룩업 또는 사후 계산.
18. `stints` 경계 랩 중복 사례(#89) — 합산 시 방어 코드.
19. `location`의 (0,0,0)은 센티넬 — 실좌표로 취급 금지.
20. `car_data`와 `location`의 타임스탬프 불일치 — ~150ms 윈도우 매칭.

**신뢰성**
21. `starting_grid`는 대부분의 레이스에서 404 [실측] — 의존 금지.
22. `overtakes`는 공식적으로 "불완전 가능".
23. `team_radio` MP3 URL 영속성 없음 + 파일명 패턴 시즌별 상이 — 파싱 금지.
24. 인증 엔드포인트 rate limiting 부재로 공격에 취약했던 전례 (2026-03 전면 다운).
25. 단일 메인테이너 의존 — 장기 안정성 가정 금지.

---

## 12. 참고 자료

**공식**
- 홈(요금/FAQ/rate limit): <https://openf1.org/>
- API 문서: <https://openf1.org/docs/>
- 인증·MQTT 가이드: <https://openf1.org/auth.html>
- GitHub 리포: <https://github.com/br-g/openf1>
- 라이선스: <https://github.com/br-g/openf1/blob/main/LICENSE>

**이슈/디스커션**
- 라이브 다운타임(2026-03): <https://github.com/br-g/openf1/discussions/365>
- pre-2023 데이터: <https://github.com/br-g/openf1/discussions/406>
- 스틴트 경계 중복 (#89): <https://github.com/br-g/openf1/issues/89>
- Miami 2026 라이브 결손 (#400): <https://github.com/br-g/openf1/issues/400>
- Miami FP1 MQTT 공백 (#397): <https://github.com/br-g/openf1/issues/397>

**업스트림/보조**
- FastF1 문서 (SignalR·시간축·텔레메트리): <https://docs.fastf1.dev/api.html>, <https://docs.fastf1.dev/time_explanation.html>
- MultiViewer 서킷 API (트랙 지오메트리, `circuit_info_url` 대상): `https://api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}`
- bacinger/f1-circuits (GeoJSON): <https://github.com/bacinger/f1-circuits>
- f1laps/f1-track-vectors (SVG): <https://github.com/f1laps/f1-track-vectors>
- SignalR 구현 참고: <https://www.nuget.org/packages/OpenF1.Data>, <https://github.com/JustAman62/undercut-f1>
