# Playwright Memory Profile (LiveMap)

`e2e/memory.spec.ts` 는 `/test-rig` 라우트에 `SyntheticDataSource` 를 마운트한 뒤 `performance.memory.usedJSHeapSize` 를 30 초 간격으로 샘플링해 leak 여부를 판정한다.

## 측정 방법

1. `/test-rig?driverCount=20&sps=10` — 20 대 차량 × 10 Hz (라이브 운영 상한과 동일).
2. 첫 60 초 (`WARMUP_MS`) 는 JIT/initial allocation 안정화를 위해 제외.
3. 남은 샘플로 선형 회귀 → slope (bytes/sec) 계산.
4. **slope < 1024 B/sec** 통과. 1 KB/sec 은 60 분 외삽 ~3.5 MB — 라이브 운영 한 세션 (≤ 3 시간) 도 ~11 MB 이내라 사용자 체감 안전선.
5. **peak heap < 200 MB** 통과. ring buffer (30 초 × 20 driver × 10 sps × ~32 bytes/sample = ~192 KB) + LiveMapRenderer 자체 < 50 MB 기준 + 4 배 안전 마진.

## CI vs Local

| 모드 | 명령 | 측정 시간 | 용도 |
| --- | --- | --- | --- |
| CI | `npm run e2e:ci` | 10 분 | PR 게이트, regression detection |
| Local | `npm run e2e:long` | 60 분 | 출시 전 정밀 검증, `@long` tag |

두 spec 은 **동일한 `runMemoryProfile` 헬퍼** 를 호출한다. 차이는 `durationMs` 와 `tag` 만이다. 따라서 10 분 결과의 slope 이 60 분에도 그대로 외삽된다 (정상 leak 곡선은 시간에 선형).

## 외삽 근거

`SyntheticDataSource` 는 OpenF1 폴링과 동일한 30 초 ring buffer trim 정책 (`LiveDataSource` 와 같은 60 초 보관 → 30 초 표시 + 30 초 마진) 을 사용한다. 따라서 buffer growth 는 워밍업 직후 평형 (~30 sample × N driver) 에 도달한다. **그 이후의 모든 heap 증가는 leak 후보** 다.

10 분 측정 시 워밍업 후 ≥ 17 sample (`(10 - 1) × 60 / 30 = 18`) 으로 slope estimator 가 통계적으로 유의미하다 (R² 분석은 향후 §16+ 후속 단계).

## 알려진 제약

- `performance.memory` 는 Chromium-only API. WebKit/Firefox 에서는 spec 이 자동 skip (`test.skip(true, ...)`).
- 측정값은 V8 GC 시점에 영향 — 단일 샘플 jitter ±5 MB 가능. 선형 회귀 가 outlier 흡수.
- 60 분 long-form 은 dev server 안정성에 의존 — HMR/file watcher fluctuation 도 측정값에 포함됨. spec 코드는 본 Ralph 에 commit 되지만 정기 실행은 출시 직전 1 회 권장.

## 로컬 실행 (60 분)

```bash
npm run dev               # 별도 터미널, optional (reuseExistingServer)
npm run e2e:long
```

리포트: `playwright-report/index.html` (`npx playwright show-report`).
