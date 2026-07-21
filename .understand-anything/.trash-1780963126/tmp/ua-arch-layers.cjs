const fs = require('fs');
const inp = JSON.parse(fs.readFileSync('/Users/a453498/Downloads/project/soon_board/.understand-anything/tmp/arch-input.json','utf8'));
const nodes = inp.fileNodes;

function layerFor(n){
  const id = n.id, p = n.filePath, t = n.type;

  // --- non-code by type ---
  if (t === 'pipeline') return 'layer:docs-cicd';            // CI workflows -> docs & ci/cd
  if (t === 'document') return 'layer:docs-cicd';            // markdown docs -> docs & ci/cd

  if (t === 'config'){
    // map-domain data json stay with map layer
    if (p === 'src/map/circuits.json' || p === 'src/map/layoutVersions.json') return 'layer:map';
    return 'layer:config';
  }

  // --- code (file) ---
  if (p.startsWith('scripts/')) return 'layer:build-tools';
  if (p.startsWith('e2e/')) return 'layer:test-harness';

  // root-level code files
  if (p === 'index.html') return 'layer:test-harness';        // SPA entry html, build harness
  if (p === 'vite.config.ts' || p === 'vitest.setup.ts' || p === 'playwright.config.ts') return 'layer:test-harness';

  if (p.startsWith('src/')){
    if (p === 'src/main.tsx' || p === 'src/App.tsx') return 'layer:app-shell';
    const seg = p.split('/')[1];
    if (seg === 'main') return 'layer:app-shell';
    if (seg === 'dashboard') return 'layer:dashboard';
    if (seg === 'live') return 'layer:live-replay';
    if (seg === 'map') return 'layer:map';
    if (seg === 'shared' || seg === 'style') return 'layer:shared-core';
  }
  return 'layer:UNASSIGNED';
}

const layers = {};
for(const n of nodes){
  const L = layerFor(n);
  (layers[L]=layers[L]||[]).push(n.id);
}

const meta = {
  'layer:app-shell': {name:'앱 셸 & 시즌 카탈로그', desc:'앱 엔트리(main.tsx)·루트(App.tsx)와 라우팅, 시즌/GP 그리드·세션 카드 화면, 날짜·상태 파생 로직, 전역 UI store로 구성된 메인 페이지 레이어'},
  'layer:dashboard': {name:'대시보드', desc:'리더보드·디테일 패널·퀄리파잉 패널과 텔레메트리 파생 계산(스틴트·랩·플래그 등), 프로필 및 쿼리 hook을 포함한 타이밍 대시보드 레이어'},
  'layer:live-replay': {name:'라이브 & 리플레이', desc:'Live·Replay 화면, LiveMap, CORS ping과 합성/리플레이 data source 등 실시간·리플레이 모드 진입 화면 레이어'},
  'layer:map': {name:'서킷 맵 렌더링', desc:'서킷 트랙·마커·트레일 캔버스 렌더러, 좌표 변환·보간·위치 버퍼, 라이브/리플레이 맵 data source와 서킷·레이아웃 데이터를 담은 맵 렌더링 레이어'},
  'layer:shared-core': {name:'공용 코어', desc:'OpenF1 API 클라이언트·도메인 타입, DataSource 인터페이스, sessionKind·시즌 데이터·env·시뮬레이션 시계 등 전 모듈이 공유하는 기반 유틸과 스타일 토큰 레이어'},
  'layer:build-tools': {name:'데이터 빌드 도구', desc:'서킷 맵·섹터 경계·DRS 존·핏레인·시즌 카탈로그를 OpenF1에서 파생 생성하는 tsx 기반 scripts/ 빌드 도구와 _lib 공용 라이브러리 및 단위 테스트 레이어'},
  'layer:test-harness': {name:'빌드 & 테스트 하니스', desc:'Vite·Vitest·Playwright 설정과 SPA 진입 index.html, e2e 스모크·비주얼·메모리 Playwright 테스트로 구성된 빌드·테스트 하니스 레이어'},
  'layer:config': {name:'설정', desc:'package.json·tsconfig·vercel.json 등 프로젝트 설정과 테스트 픽스처·SLM 존 원본 데이터, understand-anything 설정을 포함한 구성 레이어'},
  'layer:docs-cicd': {name:'문서 & CI/CD', desc:'OpenF1·배포·리플레이 전략 문서와 구현 계획서(markdown), GitHub Actions CI·일일 데이터 갱신·Playwright 워크플로 파이프라인 레이어'},
};

const out = [];
for(const [id, ids] of Object.entries(layers)){
  if(id==='layer:UNASSIGNED'){ console.error('UNASSIGNED:', ids); continue; }
  const m = meta[id];
  out.push({id, name:m.name, description:m.desc, nodeIds:ids});
}

// verification
const total = out.reduce((s,l)=>s+l.nodeIds.length,0);
const allIds = new Set();
let dup=0;
for(const l of out) for(const x of l.nodeIds){ if(allIds.has(x)) dup++; allIds.add(x); }
console.log('layers:', out.length);
console.log('assigned total:', total, 'unique:', allIds.size, 'input:', nodes.length, 'dups:', dup);
const missing = nodes.filter(n=>!allIds.has(n.id)).map(n=>n.id);
console.log('missing:', missing.length, missing.slice(0,20));
for(const l of out) console.log('  '+l.id+': '+l.nodeIds.length);

fs.writeFileSync('/Users/a453498/Downloads/project/soon_board/.understand-anything/intermediate/layers.json', JSON.stringify(out,null,2));
console.log('WROTE layers.json');
