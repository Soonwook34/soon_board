// React 18 act() 환경 플래그 — jsdom 환경 통합 테스트에서 act warning 억제.
// vite.config.ts test.setupFiles로 로드.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
