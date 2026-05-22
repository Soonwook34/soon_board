import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { VERCEL_ENV } from './shared/env';
import './style/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');

// 빌드 시점 환경 라벨을 DOM에 노출 — 프로덕션 배포 검증·디버깅용 (critic P0-3 use-site).
// 이 라인이 있어야 Vite의 define 인라인 치환이 DCE되지 않고 번들에 남는다.
rootEl.dataset.vercelEnv = VERCEL_ENV;

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
