# OpenF1 API 분석 레퍼런스

> 정리일: 2026-05-20 · 대상 API 버전: `v1`
> 본 문서는 OpenF1 API 자체에 대한 사실 정리이며, 그 위에 올릴 서비스 설계는 포함하지 않는다.

---

## 0. 한눈에 보는 요약

| 항목 | 값 |
|---|---|
| 공식/비공식 | **비공식** 커뮤니티 프로젝트 (Formula 1, FIA, FOM과 무관) |
| 메인테이너 | GitHub `br-g` (1인 메인테이너) |
| 라이선스 | CC BY-NC-SA 4.0 (비상업, 출처 표시, 동일 조건 공유) |
| Base URL | `https://api.openf1.org/v1/` |
| 응답 포맷 | JSON (기본), CSV (`?csv=true`) |
| 인증 (과거 데이터) | **불필요** — 익명 접근 |
| 인증 (실시간 데이터) | OAuth2 Bearer 토큰 (유료 구독 필요) |
| Rate limit (무료) | 3 req/s, 30 req/min |
| Rate limit (스폰서) | 6 req/s, 60 req/min |
| 필터 연산자 | `=`, `>=`, `<=`, `>`, `<` (AND 결합) |
| 정렬/페이지네이션 | **미지원** (필터로만 범위 축소) |
| 실시간 스트림 | MQTT (`mqtts://mqtt.openf1.org:8883`) / WebSocket (`wss://mqtt.openf1.org:8084`) |
| 실시간 지연 | 약 3초 (텔레메트리 기준, 공식 수치) |
| 데이터 시작 시점 | **2023 시즌부터** (전 엔드포인트 공통) |
| 시간 표기 | 전부 **UTC**, ISO 8601 (마이크로초 정밀도) |
| 라이브 윈도우 | 세션 시작 30분 전 ~ 종료 30분 후 |
| SLA / Status page | 없음 (GitHub Discussions에서 임시 공지) |

---

## 1. 프로젝트/API 개요

### 1.1 정체성
- **비공식 커뮤니티 프로젝트.** F1 / FIA / FOM과 어떠한 공식 관계도 없음. F1 관련 모든 상표는 Formula One Licensing B.V. 소유.
- **메인테이너:** GitHub `br-g` 1인. 후원은 [GitHub Sponsors](https://github.com/sponsors/br-g)와 Buy Me A Coffee로 운영. 스폰서 등급은 더 높은 rate limit 부여.
- **목적:** "교육, 학습 프로젝트, 연구, 비상업 팬 활동" 명시. 상업 사용은 별도 협의 요구.
- **라이선스:** `CC BY-NC-SA 4.0`
  - 비상업 사용만 허용
  - 출처 표시 의무
  - 파생 저작물은 동일/호환 라이선스로 공유
  - 정확성/적합성에 대한 무보증

### 1.2 베이스 URL과 버전 정책
- **운영:** `https://api.openf1.org/v1/`
- **로컬 자체호스팅:** `http://127.0.0.1:8000/v1/` (FastAPI/uvicorn으로 직접 실행 시)
- **버전:** `v1`만 존재. `v2` 계획 없음. 공식 deprecation 정책/체인지로그 없음 — 단일 메인테이너 프로젝트의 한계로, 상용 API 수준의 안정성을 가정하면 안 됨.

### 1.3 데이터 소스 — 어떻게 모으는가
- OpenF1는 F1 공식 **Live Timing SignalR 엔드포인트** (`https://livetiming.formula1.com/signalr`, ASP.NET SignalR)에 연결해 "Streaming" Hub의 16개 토픽(`CarData.z`, `Position.z`, `TimingData`, `RaceControlMessages`, `WeatherData`, `TeamRadio` 등)을 구독한다.
- 즉, **스크래핑이 아니라 F1이 공개한 비문서화 스트림**을 받아 정규화하는 구조다. FastF1·undercut-f1·F1 공식 라이브 타이밍 대시보드도 같은 엔드포인트를 사용한다.
- **함의:** F1이 스트림을 차단하거나 프로토콜을 바꾸면 OpenF1 데이터도 즉시 영향받는다. 실제 사례 — 2025 Dutch GP 이후 F1이 Driver Tracker, DRS, 핏스톱 시간을 F1 TV 가입자 전용으로 일부 제한하면서 해당 데이터 커버리지가 줄었다.

---

## 2. 인증 모델

| 데이터 종류 | 인증 | 비용 |
|---|---|---|
| 과거(historical) 데이터 — 종료된 세션 | **불필요** (익명) | 무료 |
| 실시간(real-time) 데이터 — 활성 세션 윈도우 내 | OAuth2 Bearer 토큰 | **유료 구독** |

### 2.1 토큰 발급 (실시간용)
```http
POST https://api.openf1.org/token
Content-Type: application/x-www-form-urlencoded

username=<email>&password=<password>
```
응답: `access_token`, `token_type: bearer`, `expires_in` (초). **토큰 수명 1시간** — 만료 시 재발급 필요.

### 2.2 사용
- REST: `Authorization: Bearer <access_token>`
- MQTT: `mqtts://mqtt.openf1.org:8883` (TLS) — username 임의 문자열(또는 이메일), password에 access_token
- WebSocket: `wss://mqtt.openf1.org:8084` — 동일한 username/password 규칙

### 2.3 보안 권고
- 공식 문서가 **명시적으로 경고**: username/password를 클라이언트 사이드에 임베드하지 말 것. 토큰을 `localStorage`에 보관하지 말 것.
- 권장 아키텍처: 백엔드에서 토큰을 보유하고, 브라우저 클라이언트에게는 자체 채널로 데이터를 푸시.

---

## 3. Rate Limit과 운영 제약

### 3.1 공식 한도
| 등급 | 초당 | 분당 |
|---|---|---|
| 무료(익명) | 3 | 30 |
| 스폰서(인증) | 6 | 60 |

- **HTTP 429** 반환 시점은 위 한도 초과. `Retry-After` 헤더 동작/값은 미문서화.
- **실시간 데이터에는 MQTT/WebSocket 사용을 공식 권장** ("MQTT or Websockets are significantly more efficient and provide data as soon as it's available"). 텔레메트리 3.7 Hz × 20 드라이버 = 74 req/s 수준이므로 REST 폴링으로는 사실상 실시간 추적 불가.

### 3.2 응답 포맷
- 기본 JSON 배열. 조건 미일치 시 `[]`. 단일 결과여도 배열로 감싸여 옴.
- `?csv=true` 추가 시 CSV.
- Accept 헤더 기반 콘텐트 네고시에이션 미문서화.

### 3.3 CORS / 브라우저 직접 호출
- **공개 엔드포인트는 브라우저 직접 호출 가능** — 문서가 "directly through your browser or HTTP client" 사용을 명시.
- **인증 엔드포인트는 백엔드 프록시 권고.** CORS 헤더 정책은 미문서화.

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

- 여러 필터는 모두 AND. 예: `?session_key=9472&driver_number=1&lap_number>=5&lap_number<=15`
- **배열 타입 필드는 필터 불가** (예: `segments_sector_1`).
- **IN/다중값/OR 미지원** (`param=a,b` 형식 없음).
- **정렬/페이지네이션 미지원.** 응답은 서버가 정한 순서(보통 시간 오름차순). 대용량 엔드포인트는 필터로 좁히는 게 유일한 수단.

### 4.2 날짜/시간 입력
- 내부적으로 Python `dateutil.parser.parse` 사용. ISO 8601 외에도 자연어, 지역 포맷 허용:
  - `2021-09-10T14:30:20+00:00` (권장)
  - `10 September 2021`
  - `09/10/2021` (지역 모호성 주의)

### 4.3 `latest` 키워드
- `session_key=latest`, `meeting_key=latest` 형태로 "가장 최근" 세션/미팅 조회.
- **규칙:** 진행 중 세션이 있으면 그것, 없으면 가장 최근에 종료된 세션. 별도의 "현재 라이브냐" 플래그는 노출되지 않음.
- **오프시즌 주의:** 시즌 사이 기간에는 405/404 동작이 보고된 바 있음(특히 CLI). 안전망 코드 필요.

---

## 5. 라이브 데이터 동작

### 5.1 라이브 윈도우
- 세션 **시작 30분 전 ~ 종료 30분 후** 까지는 신규 레코드가 점진적으로 누적 노출(REST 폴링 시 응답 크기 증가, MQTT/WS는 푸시).
- 윈도우 종료 후엔 해당 세션이 historical로 전환.

### 5.2 지연(latency)
- **공식 수치: "약 3초"** (실시간 데이터가 라이브 이벤트 발생 후 API로 노출되기까지).
- 다만 FastF1 커뮤니티 측정에 따르면 `DriverList` 같은 일부 메시지는 F1 공식 대시보드보다 SignalR 스트림 쪽이 느려질 수 있음 → 텔레메트리는 3~10초, 레이스 데이의 포지션 요약은 10~30초까지 예상하는 것이 안전.
- TV 중계는 통상 30~60초 지연이므로 OpenF1는 일반 TV보다 빠르다.

### 5.3 엔드포인트별 라이브/포스트세션 구분
| 엔드포인트 | 라이브 갱신 | 비고 |
|---|---|---|
| `car_data` | O | ~3.7 Hz |
| `location` | O | ~3.7 Hz |
| `laps` | O | 랩 완료 시 추가 |
| `position` | O | 이벤트 기반 |
| `intervals` | O | ~0.25 Hz, **historical 보존 불완전** |
| `pit` | O | — |
| `stints` | O | — |
| `race_control` | O | 이벤트 기반 |
| `weather` | O | ~1/min |
| `team_radio` | O | F1가 공개한 분량만 |
| `meetings` / `sessions` | 대체로 정적 | 매일 자정 UTC 갱신 |
| `session_result` | X | 공식 결과 확정 후 분 단위 지연 |
| `starting_grid` | X | 퀄리 종료 후 |
| `championship_drivers` / `championship_teams` | X | 레이스 후 |

### 5.4 알려진 라이브 불안정 사례
- **2026-03-15 (Race day):** `POST /token` 대상 트래픽 스파이크(메인테이너는 의도적 공격으로 추정)로 API 전체가 다운. 인증 엔드포인트의 rate limiting 부재가 원인. (GitHub Discussions #365)
- **2026-05-03 Miami:** 활성 세션 동안 전 엔드포인트 데이터 누락. (Issue #400, 미해결 상태로 보고됨)
- **2026-05-01 Miami FP1:** MQTT 연결 끊김으로 약 8분 텔레메트리 공백. (Issue #397)

> 어떤 SLA도 없는 단일 메인테이너 프로젝트라는 점은 항상 전제해야 함.

---

## 6. 시간/공간/단위 약속

### 6.1 시간
- 모든 timestamp는 **UTC**, ISO 8601, 오프셋은 `+00:00` 형식.
- 마이크로초(소수 6자리) 정밀도 (`2023-09-17T13:31:02.395000+00:00`).
- 의미별 필드명:
  - `date` — 점(샘플) 시각 (텔레메트리, 날씨, 포지션 변화, race control 등)
  - `date_start` / `date_end` — 구간의 시작/끝 (세션, 미팅, 랩 등). 랩 `date_start`는 **근사**값임을 문서가 명시.
- `gmt_offset` (meetings/sessions) — 현지 시간 표기용 정보일 뿐, API 자체는 전부 UTC.
- 업스트림 SignalR에는 `SessionTime`(세션 상대 시계)과 `Date`(UTC 절대) 두 시간 축이 있는데, OpenF1는 절대 시간(`Date` 계열)을 사용. 재생 정렬은 `date`를 기준점으로 삼아야 한다.

### 6.2 좌표 (`location`)
- X/Y/Z 카르테시안. **단위는 1/10 미터 (데시미터)** — 2020 이후 적용. OpenF1는 2023+ 데이터만 다루므로 항상 dm.
- 원점 (0,0,0)은 **서킷별로 임의** — 트랙상의 특정 지점에 고정된 것이 아니다. 서킷마다 다른 로컬 원점/회전.
- 횡방향 정밀도가 낮아 "트랙 좌우 어디로 붙었는가"까지는 구분되지 않는다 (공식 문서 명시).
- WGS-84 위경도 변환은 제공하지 않는다. 서킷 이미지 위에 마커를 얹으려면 **per-circuit affine transform**(평행이동+회전+스케일)을 외부에서 직접 산출해야 한다.

### 6.3 텔레메트리 단위
| 필드 | 단위 | 비고 |
|---|---|---|
| `speed` | km/h (int) | — |
| `throttle` | % (0–100, int) | `104` 같은 비정상값은 센서 오류로 알려짐 |
| `brake` | 0/100 (int) | **아날로그가 아닌 사실상 binary**. 압력 비율 아님 |
| `n_gear` | 0–8 (int) | 0=중립. 후진 없음(트랙에서 미전송) |
| `rpm` | rev/min (int) | — |
| `drs` | enum (정수) | 아래 §8.3 참조 |

---

## 7. 엔드포인트 카탈로그 (Quick Index)

### 7.1 ID/구조
- `/v1/meetings` — GP 주말 단위
- `/v1/sessions` — 세션 단위 (FP/Q/Sprint/Race)
- `/v1/drivers` — 세션 스코프 드라이버 프로필

### 7.2 타이밍
- `/v1/laps` — 랩별 섹터/스피드트랩/미니섹터 색상
- `/v1/intervals` — 앞차와의 간격, 리더 갭 (≈0.25 Hz, **라이브만 신뢰**)
- `/v1/position` — 순위 변화 이벤트 시계열
- `/v1/stints` — 타이어 스틴트 (compound, age)
- `/v1/pit` — 핏스톱 (lane_duration, stop_duration)

### 7.3 텔레메트리
- `/v1/car_data` — 속도/스로틀/브레이크/기어/RPM/DRS, ~3.7 Hz
- `/v1/location` — X/Y/Z 좌표, ~3.7 Hz

### 7.4 레이스 운영
- `/v1/race_control` — 깃발/세이프티카/DRS/세션 상태/스튜어즈 메시지
- `/v1/team_radio` — 드라이버 무선 MP3 URL
- `/v1/weather` — 기온/노면온/습도/기압/풍속/풍향/강수, ~1/min

### 7.5 결과
- `/v1/session_result` — 최종 결과 (포지션, 포인트, 갭, DNF/DNS/DSQ)
- `/v1/starting_grid` — **확인 미완** (테스트 시 404 사례). 사실상 qualifying의 `session_result`로 대체 가능
- `/v1/championship_drivers`, `/v1/championship_teams` — 베타, 레이스 후 갱신

### 7.6 공통 조인 키
```
meetings ─meeting_key─> sessions ─session_key─> (laps, intervals, position,
                                                  stints, pit, car_data,
                                                  location, race_control,
                                                  team_radio, weather,
                                                  session_result, drivers)
                              ↑
                       driver_number → drivers
```
- `meeting_key`, `session_key`, `driver_number`는 모든 엔드포인트 간 외래키. 재조회해도 값이 바뀌지 않는 **안정적 정수 PK**.

---

## 8. 엔드포인트 상세

### 8.1 `/v1/meetings`
**목적:** GP 주말(또는 테스트) 단위 1레코드.

**주요 필터:** `meeting_key`, `year`, `country_code`, `circuit_key`, `location`

**스키마 (핵심):**
| 필드 | 타입 | 비고 |
|---|---|---|
| `meeting_key` | int | PK |
| `meeting_name` | str | 짧은 이름 |
| `meeting_official_name` | str | 타이틀 스폰서 포함 풀 이름 |
| `location` / `country_name` / `country_code` | str | ISO 3166-1 alpha-3 |
| `country_flag` | url | 국기 이미지 |
| `circuit_key` / `circuit_short_name` / `circuit_type` | int/str/str | `Permanent` 또는 `Street` |
| `circuit_image` / `circuit_info_url` | url | 일부 서킷 이미지 URL 깨짐 보고됨 (Madring, Catalunya) |
| `gmt_offset` | str | `HH:MM:SS` |
| `date_start` / `date_end` | ISO8601 | UTC |
| `year` | int | 챔피언십 연도 |
| `is_cancelled` | bool | 취소 여부 |

**예:**
```json
{
  "meeting_key": 1229,
  "meeting_name": "Bahrain Grand Prix",
  "meeting_official_name": "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2024",
  "location": "Sakhir",
  "country_code": "BRN",
  "circuit_key": 63,
  "circuit_short_name": "Sakhir",
  "circuit_type": "Permanent",
  "gmt_offset": "03:00:00",
  "date_start": "2024-02-29T11:30:00+00:00",
  "date_end": "2024-03-02T17:00:00+00:00",
  "year": 2024,
  "is_cancelled": false
}
```

---

### 8.2 `/v1/sessions`
**목적:** 미팅 내부 세션(연습/예선/스프린트/레이스) 1레코드.

**주요 필터:** `session_key`, `meeting_key`, `session_type`, `session_name`, `year`, `country_code`, `circuit_key`

**`session_name` ↔ `session_type` 대응:**
| `session_name` | `session_type` |
|---|---|
| `Practice 1/2/3` | `Practice` |
| `Qualifying` | `Qualifying` |
| `Sprint` | `Sprint` |
| `Sprint Qualifying` | `Sprint Qualifying` |
| `Race` | `Race` |

→ FP1/FP2/FP3 구분은 `session_type`이 아니라 `session_name`에 있다.

**스키마 핵심:** `session_key`, `date_start`/`date_end`, `meeting_key`, `circuit_*`, `country_*`, `gmt_offset`, `year`, `is_cancelled`.

---

### 8.3 `/v1/drivers`
**목적:** 세션 단위 드라이버 프로필. 한 드라이버는 참가한 세션 수만큼 레코드를 가진다.

**스키마 핵심:**
| 필드 | 비고 |
|---|---|
| `driver_number` | 시즌 영구 번호(2014+). 챔피언이 1번을 쓰면 그 시즌만 1로 표기됨 |
| `broadcast_name` | 방송 표기 (`L HAMILTON`) |
| `full_name` / `first_name` / `last_name` | — |
| `name_acronym` | 3글자 (`HAM`). 시즌 내 안정, 시즌 간 변경 가능 |
| `team_name` / `team_colour` | 색상은 `#` 없는 HEX (`3671C6`) |
| `headshot_url` | F1 공식 CDN, 인증 불필요. 게스트/리저브는 fallback 이미지 가능 |
| `country_code` | ISO 3166-1 alpha-3 |
| `session_key` / `meeting_key` | 컨텍스트 키 |

> 시즌 중 교체 드라이버는 별도 `driver_number`/`full_name`으로 들어옴. "누구의 대체"라는 관계 필드는 없음.

---

### 8.4 `/v1/laps`
**필터:** `session_key`, `meeting_key`, `driver_number`, `lap_number`, `is_pit_out_lap`

**핵심 필드:**
- `lap_number` (1부터 시작, 0 없음, 포메이션 랩은 별도 번호 없음)
- `date_start` — 랩 시작 추정 시각 (문서상 "approximate")
- `lap_duration`, `duration_sector_1/2/3` — 초 단위 float, 미완성/아웃랩은 null
- `i1_speed`, `i2_speed`, `st_speed` — 스피드 트랩 km/h
- `is_pit_out_lap` — 부울. 아웃랩은 일반적으로 비교에서 제외
- `segments_sector_1/2/3` — **미니섹터 색상 코드 배열** (연습/예선만 의미 있음, 레이스에서는 비신뢰)

**미니섹터 색 코드:**
| 값 | 의미 |
|---|---|
| `0` | 데이터 없음 |
| `2048` | 노랑 (개인 최고보다 느림) |
| `2049` | 초록 (개인 최고) |
| `2051` | 초록 (섹터 베스트) |
| `2052` | 보라 (오버롤 베스트) |
| `2064` | 핏레인 통과 |

(코드별 의미는 자료마다 미세하게 다르며 2049/2051 구분이 모호함 — 안전하게는 `2048=slower`, `>=2049=better/improved`, `2052=overall-purple`, `2064=pit`로 처리)

---

### 8.5 `/v1/intervals`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `interval`

**필드:**
- `date` — UTC
- `interval` — 앞차와의 갭(초). 리더는 `null`. **랩 다운 드라이버는 문자열 `"+1 LAP"`** 등으로 표기 → 숫자 연산 전에 타입 확인 필수.
- `gap_to_leader` — 동일한 타입 규칙 (`null`/숫자/`"+N LAP"`)

**주의:**
- 갱신 주기 ~4초(0.25 Hz).
- **historical 보존이 불완전** ("live only"로 기술). 과거 세션 재현 시에는 `position` + `laps`에서 재구성하는 우회로 필요.
- 레이스 초반 몇 랩은 데이터가 늦게 들어와 비어 있는 구간이 흔하다.

---

### 8.6 `/v1/position`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `position`

**필드:** `date`, `driver_number`, `position` (1=리더)

**특성:**
- 순위 변화 시점마다 이벤트로 기록. 추월 많은 구간에서는 초당 다수 레코드.
- 세이프티카·포메이션 랩 동안에는 갱신이 거의 멈춤(실제 경쟁 순위 변화가 없으므로).
- **최종 결과 ≠ 마지막 `position`** — 페널티 등으로 `session_result`와 달라질 수 있다.

---

### 8.7 `/v1/stints`
**필터:** `session_key`, `meeting_key`, `driver_number`, `stint_number`, `compound`

**필드:** `stint_number`(1부터), `lap_start`, `lap_end`, `compound`, `tyre_age_at_start`

**`compound` 값:** `SOFT`, `MEDIUM`, `HARD`, `INTERMEDIATE`, `WET` (INTERMEDIATE/WET는 문서 예시엔 없지만 우천 시 등장)

**알려진 함정 (Issue #89):** `stint_end`와 다음 `stint_start`가 같은 랩으로 중복 표기되어 총 랩 수가 +1 되는 사례가 2024 Hungarian GP 등에서 관찰됨. 누적 시 경계 랩을 한 번만 카운트하도록 방어 코드 필요.

---

### 8.8 `/v1/pit`
**필터:** `session_key`, `meeting_key`, `driver_number`, `lap_number`, `pit_duration`

**필드:**
- `date` — 핏 진입 시각
- `lap_number` — 핏 들어간 랩
- `lane_duration` — 핏레인 진입~퇴출까지 총 시간(초)
- `stop_duration` — 박스 정차 시간(초). **2024 미국 GP 이전엔 거의 항상 null**
- `pit_duration` — `lane_duration`의 deprecated 별칭. 신규 코드에서는 `lane_duration` 사용 권장

---

### 8.9 `/v1/car_data`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `speed`, `rpm`, `drs`

**필드:** `date`, `speed`, `rpm`, `throttle`, `brake`, `n_gear`, `drs`

**DRS 코드:**
| 값 | 의미 | 비고 |
|---|---|---|
| 0 | OFF | |
| 1 | OFF | |
| 2, 3 | 불명 | 드물게 관찰, 의미 미문서화 (전이 상태 추정) |
| 8 | ELIGIBLE | 디텍션 존 통과로 활성화 자격 획득, 아직 열지 않음 |
| 10 | ON | 정확한 10/12/14 구분은 미문서화 |
| 12 | ON | 대부분의 커뮤니티 도구가 "open"의 정식값으로 사용 |
| 14 | ON | |

→ 실용 권장: `>=10`이면 활성, `==8`이면 자격만, `0/1`은 비활성. (홀수=off / 짝수=on이라는 커뮤니티 관찰이 있으나 절대적이지는 않음)

**볼륨:** 가장 무거운 엔드포인트. 드라이버 1명, 90분 세션 기준 약 800 sample/min × 20명 = 수천만 레코드. **반드시 `driver_number` + 좁은 `date` 범위로 필터링**해서 호출할 것.

---

### 8.10 `/v1/location`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`, `x`, `y`

**필드:** `date`, `x`, `y`, `z` (정수, 1/10 m 단위)

**특성:**
- `car_data`와 **타임스탬프가 정확히 일치하지 않는다.** 둘을 결합하려면 ~150 ms 윈도우 내 nearest-neighbor 매칭 필요.
- (0,0,0) 부근 값은 가라지/핏 정지 상태의 센티넬일 가능성. 실주행 데이터로 간주하지 말 것.
- 서킷별 affine transform이 필요한 이유: 원점/방향이 서킷마다 다르므로 동일 코드로 모든 트랙을 그릴 수 없다. 보통 서킷별 캘리브레이션을 pre-ship.

---

### 8.11 `/v1/race_control`
**필터:** `session_key`, `meeting_key`, `driver_number`, `lap_number`, `date`, `category`, `flag`, `scope`

**`category` 값 (관찰 기준):** `Flag`, `SafetyCar`, `Drs`, `SessionStatus`, `Other`/`CarEvent`

**`flag` 값:** `GREEN`, `YELLOW`, `DOUBLE YELLOW`, `RED`, `CHEQUERED`, `BLUE`, `BLACK AND WHITE`, `BLACK`, `CLEAR`

**`scope` 값:** `Track`, `Sector`, `Driver` (그에 따라 `sector` / `driver_number` 필드가 채워짐)

**`qualifying_phase`:** 예선에서만 `1`/`2`/`3` (Q1/Q2/Q3), 레이스는 null.

**`message`:** 사람이 읽을 수 있는 자유 텍스트. 파싱 타겟이 아니라 표시 텍스트로 다루는 것이 안전.

**볼륨:** 세션당 30~150건. 이벤트 기반.

---

### 8.12 `/v1/team_radio`
**필터:** `session_key`, `meeting_key`, `driver_number`, `date`

**필드:** `date`, `driver_number`, `recording_url`

**URL 패턴:**
```
https://livetiming.formula1.com/static/{YYYY}/{YYYY-MM-DD}_{Event_Name}/
  {YYYY-MM-DD}_{Session_Type}/TeamRadio/{ACR}{NUM}_{seq}_{ts}.mp3
```
- 인증 불필요. 그러나 F1 CDN 의존 — 영구성 보장 없음.
- **드라이버→피트 방향만** 포함. 엔지니어→드라이버 메시지는 미포함.
- 모든 교신이 아닌 F1가 공개한 일부만. **2026 이후 커버리지가 크게 줄어 거의 데이터가 없는 이벤트도 있음** (F1 정책 변화).

---

### 8.13 `/v1/weather`
**필터:** `session_key`, `meeting_key`, `date`, `rainfall`, `air_temperature`, `track_temperature`

**필드/단위:**
| 필드 | 단위 | 비고 |
|---|---|---|
| `air_temperature` | °C float | |
| `track_temperature` | °C float | |
| `humidity` | % | |
| `pressure` | mbar | |
| `wind_speed` | m/s | |
| `wind_direction` | ° (0~359) | 기상학 관례 — 바람이 **불어오는** 방향 |
| `rainfall` | 0/1 | 강수 강도 정보는 없음 |

**갱신:** ~60초 1회. 세션당 60~120건.

---

### 8.14 `/v1/session_result`
**필터:** `session_key`, `meeting_key`, `driver_number`, `position`

**필드 (레이스):** `position`, `number_of_laps`, `points`, `duration`(초, float), `gap_to_leader`(초), `dnf`, `dns`, `dsq`

**필드 (예선):** `duration`과 `gap_to_leader`가 **배열** — 진출한 Q1/Q2/Q3 각 단계의 베스트랩/갭. Q1 탈락자는 길이 1.

**예 (Race):**
```json
{"position":1,"driver_number":1,"number_of_laps":57,"points":26.0,
 "duration":5504.742,"gap_to_leader":0,
 "dnf":false,"dns":false,"dsq":false,
 "meeting_key":1229,"session_key":9472}
```
**예 (Qualifying):**
```json
{"position":1,"driver_number":55,"number_of_laps":20,
 "duration":[92.339,91.439,90.984],
 "gap_to_leader":[0.348,0.0,0.0],
 "dnf":false,"dns":false,"dsq":false,
 "meeting_key":1219,"session_key":9161}
```
**주의:** `points`는 Practice/Qualifying에서 null. 스프린트는 포인트 부여되어 채워짐 (페스트랩 보너스 +1 포함 가능).

---

### 8.15 `/v1/starting_grid`
- 일부 세션에서 404 반환이 확인됨. **안정 엔드포인트로 가정하지 말 것.** 사실상 직전 Qualifying의 `session_result` 또는 레이스 시작 직후의 `position`으로 대체 가능.

---

## 9. 데이터 볼륨 가이드

| 엔드포인트 | 주기 | 드라이버당/레이스 | 레이스 전체(20명) |
|---|---|---|---|
| `car_data` | ~3.7 Hz | ~1,200,000 | ~24,000,000 |
| `location` | ~3.7 Hz | ~1,200,000 | ~24,000,000 |
| `intervals` | ~0.25 Hz | ~8,000 | ~160,000 |
| `position` | 이벤트 | 100~1,000 | 5,000~20,000 |
| `laps` | 랩당 1 | 50~78 | 1,000~1,600 |
| `weather` | ~1/min | — | 90~120 |
| `race_control` | 이벤트 | — | 30~150 |
| `team_radio` | 이벤트 | 10~50 | 200~500 |
| `stints` | 스틴트당 1 | 2~4 | 40~80 |
| `pit` | 핏당 1 | 1~4 | 30~80 |
| `session_result` | 세션당 1 | 1 | 20 |

→ `car_data`/`location`은 항상 **`driver_number` + 좁은 `date` 범위**로 좁혀 요청해야 한다.

---

## 10. 시간 커버리지

### 10.1 시작점
- **2023 시즌이 절대 시작점.** 전 엔드포인트 공통. 2022 이전 데이터는 공개 API에서 일체 제공되지 않는다.

### 10.2 엔드포인트별 미세 차이
- `intervals`: "live only"로 기술. **historical 응답이 비어있거나 불완전.** 과거 재현 시 `position`+`laps`로 재구성 필요.
- `pit.stop_duration`: **2024 US GP 이전엔 거의 null.** 그 이전 핏스톱 정차 시간 비교 불가.
- `team_radio`: F1가 공개한 분량만. **2026 이후 거의 비어 있음.**
- `overtakes` (베타): "may be incomplete" 명시.
- 일부 2024 Sprint Qualifying 섹터/랩 타임 누락 (FastF1 #597, 업스트림 피드 문제).
- Miami 2026: 라이브 수집 실패로 historical 기록 자체에 공백 가능.

### 10.3 세션 타입
- FP1/FP2/FP3, Qualifying, Sprint, Sprint Qualifying(=Sprint Shootout), Race 모두 커버.
- 프리시즌 테스트도 `meetings`/`sessions`에 포함.

### 10.4 취소된 세션
- `is_cancelled` 필드 존재. 다만 우천 중단/일부 진행 후 취소된 세션이 어떻게 표기되는지(데이터 일부+is_cancelled=true) 공식 문서 부재. GitHub Discussions #384 미답변.

### 10.5 자가 호스팅으로 pre-2023 확장
- 메인테이너(br-g)는 "2023 이전은 공개 ingestion에서 제외"라고 밝힘 (호환성 비용 대비 수요 부족). 다만 프로젝트의 historical ingestor를 직접 돌리면 F1의 정적 타이밍 아카이브에서 가져올 수 있다고 안내. 시즌별 스키마 차이로 추가 작업 필요.

---

## 11. 알려진 함정 정리

1. **`intervals`에서 lapped car는 문자열** (`"+1 LAP"`) — 숫자 연산 전에 `typeof` 체크.
2. **`stints`의 `lap_end`/`lap_start` 중복** — 같은 랩이 두 스틴트에 걸쳐 나타날 수 있어 합산 시 +1 오류.
3. **`pit.stop_duration` null이 다수** — 2024 US GP 이전 데이터는 사실상 사용 불가.
4. **DRS 값 10/12/14 구분 미문서화** — `>=10`이면 ON으로 통일 권장.
5. **`brake`는 binary** (0/100) — 압력 그래프로 가정하지 말 것.
6. **`throttle = 104` 같은 비정상값** — 센서 오류로 알려짐.
7. **`location` (0,0,0)** — 가라지/핏 정지 sentinel일 가능성.
8. **`car_data`와 `location` 타임스탬프 불일치** — nearest-neighbor 매칭(~150 ms 윈도우) 필요.
9. **랩별 시간 데이터 null** — 아웃랩/사고/적기로 인한 미주행 랩.
10. **`segments_sector_*`는 레이스에서 신뢰 어려움** — 연습/예선 위주로만 활용.
11. **`session_key=latest`가 오프시즌에 404** — 핸들링 필요.
12. **일부 서킷 이미지 URL 깨짐** (Madring, Catalunya).
13. **`total_laps` 같은 "예정 레이스 거리" 필드 없음** — 서킷별 룩업 또는 사후 계산 필요.
14. **timestamp는 마이크로초까지 표기되지만 정확도는 그 이하** — 파생 필드(sector 경계 등) 정확도는 ms 미만이 보장되지 않음.
15. **`starting_grid` 엔드포인트는 불안정** — 의존 금지.
16. **`team_radio` MP3 URL의 영속성 없음** — F1 CDN 정책에 종속.
17. **API는 상태 머신이 아닌 로그** — "현재 상태" 엔드포인트 없음. 클라이언트가 최신 레코드 집계로 계산.
18. **응답 정렬/페이지네이션 없음** — 큰 응답은 필터로 좁히는 게 유일한 수단.
19. **rate limiting 부재로 인증 엔드포인트가 공격에 취약** — 과거 다운타임 사례.
20. **단일 메인테이너 의존성** — 장기적 안정성 가정 금지.

---

## 12. 참고 자료

- OpenF1 공식 사이트: <https://openf1.org/>
- OpenF1 문서: <https://openf1.org/docs/>
- 인증 가이드: <https://openf1.org/auth.html>
- GitHub 리포: <https://github.com/br-g/openf1>
- 라이선스: <https://github.com/br-g/openf1/blob/main/LICENSE>
- 주요 이슈/디스커션
  - 라이브 다운타임: <https://github.com/br-g/openf1/discussions/365>
  - pre-2023 데이터: <https://github.com/br-g/openf1/discussions/406>
  - 스틴트 중복 (#89): <https://github.com/br-g/openf1/issues/89>
  - Miami 2026 라이브 결손 (#400): <https://github.com/br-g/openf1/issues/400>
  - Miami FP1 MQTT 8분 공백 (#397): <https://github.com/br-g/openf1/issues/397>
- 상위(F1) 라이브 타이밍 동작 — FastF1 문서: <https://docs.fastf1.dev/api.html>, <https://docs.fastf1.dev/api_reference/telemetry.html>, <https://docs.fastf1.dev/time_explanation.html>
- 좌표 매핑 보조 자료
  - bacinger/f1-circuits (GeoJSON): <https://github.com/bacinger/f1-circuits>
  - f1laps/f1-track-vectors (SVG): <https://github.com/f1laps/f1-track-vectors>
- SignalR 구현 참고
  - OpenF1.Data (NuGet): <https://www.nuget.org/packages/OpenF1.Data>
  - JustAman62/undercut-f1: <https://github.com/JustAman62/undercut-f1>
