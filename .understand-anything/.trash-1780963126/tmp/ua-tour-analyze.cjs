#!/usr/bin/env node
'use strict';

const fs = require('fs');

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error('Usage: ua-tour-analyze.js <input.json> <output.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const layers = Array.isArray(data.layers) ? data.layers : [];

  const nodeById = new Map();
  for (const n of nodes) nodeById.set(n.id, n);

  // ---- Build adjacency ----
  const fanIn = new Map();
  const fanOut = new Map();
  for (const n of nodes) {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
  }
  // forward adjacency for imports/calls (BFS)
  const traverseAdj = new Map(); // id -> Set of targets via imports|calls
  // generic adjacency by type for clusters
  const outBy = new Map(); // id -> Map(targetId -> Set(types))
  const inBy = new Map();

  for (const n of nodes) {
    traverseAdj.set(n.id, new Set());
    outBy.set(n.id, new Map());
    inBy.set(n.id, new Map());
  }

  for (const e of edges) {
    const s = e.source;
    const t = e.target;
    if (!nodeById.has(s) || !nodeById.has(t)) continue;
    if (s === t) continue;
    fanOut.set(s, fanOut.get(s) + 1);
    fanIn.set(t, fanIn.get(t) + 1);
    if (e.type === 'imports' || e.type === 'calls') {
      traverseAdj.get(s).add(t);
    }
    if (!outBy.get(s).has(t)) outBy.get(s).set(t, new Set());
    outBy.get(s).get(t).add(e.type);
    if (!inBy.get(t).has(s)) inBy.get(t).set(s, new Set());
    inBy.get(t).get(s).add(e.type);
  }

  // ---- A. Fan-In Ranking ----
  const fanInRanking = nodes
    .map((n) => ({ id: n.id, fanIn: fanIn.get(n.id), name: n.name }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 20);

  // ---- B. Fan-Out Ranking ----
  const fanOutRanking = nodes
    .map((n) => ({ id: n.id, fanOut: fanOut.get(n.id), name: n.name }))
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 20);

  // ---- C. Entry Point Candidates ----
  const codeEntryNames = new Set([
    'index.ts', 'index.js', 'index.tsx', 'index.jsx',
    'main.ts', 'main.js', 'main.tsx', 'main.jsx',
    'app.ts', 'app.js', 'app.tsx', 'app.jsx',
    'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py',
    'main.rs', 'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py',
    '__main__.py', 'Application.java', 'Main.java', 'Program.cs',
    'config.ru', 'index.php', 'App.swift', 'Application.kt',
    'main.cpp', 'main.c'
  ]);

  // fan-out top 10% threshold
  const sortedFanOut = nodes.map((n) => fanOut.get(n.id)).sort((a, b) => b - a);
  const top10idx = Math.max(0, Math.floor(sortedFanOut.length * 0.1) - 1);
  const fanOutTop10Threshold = sortedFanOut.length ? sortedFanOut[top10idx] : 0;
  // fan-in bottom 25% threshold
  const sortedFanInAsc = nodes.map((n) => fanIn.get(n.id)).sort((a, b) => a - b);
  const bot25idx = Math.max(0, Math.floor(sortedFanInAsc.length * 0.25) - 1);
  const fanInBottom25Threshold = sortedFanInAsc.length ? sortedFanInAsc[bot25idx] : 0;

  function depthOfPath(fp) {
    if (!fp) return 99;
    return fp.split('/').filter(Boolean).length - 1; // number of dirs above file
  }

  const entryScores = [];
  for (const n of nodes) {
    let score = 0;
    const fp = n.filePath || '';
    const isDoc = n.type === 'document';
    if (isDoc) {
      const isRootReadme = /^README\.md$/i.test(fp) || /^README\.md$/i.test(n.name || '');
      const atRoot = depthOfPath(fp) === 0;
      if (isRootReadme && atRoot) {
        score += 5;
      } else if (atRoot && /\.md$/i.test(n.name || '')) {
        score += 2;
      }
    } else if (n.type === 'file') {
      if (codeEntryNames.has(n.name)) score += 3;
      const d = depthOfPath(fp);
      if (d <= 1) score += 1;
      if (fanOut.get(n.id) >= fanOutTop10Threshold && fanOutTop10Threshold > 0) score += 1;
      if (fanIn.get(n.id) <= fanInBottom25Threshold) score += 1;
    }
    if (score > 0) entryScores.push({ id: n.id, score, name: n.name, summary: n.summary || '' });
  }
  entryScores.sort((a, b) => b.score - a.score);
  const entryPointCandidates = entryScores.slice(0, 5);

  // top code entry point for BFS
  const codeEntries = entryScores.filter((e) => {
    const n = nodeById.get(e.id);
    return n && n.type !== 'document';
  });
  let bfsStart = codeEntries.length ? codeEntries[0].id : null;
  // Prefer src/main.tsx if it exists (per project entry point)
  if (nodeById.has('file:src/main.tsx')) bfsStart = 'file:src/main.tsx';
  else if (!bfsStart && nodes.length) bfsStart = nodes[0].id;

  // ---- D. BFS Traversal ----
  const order = [];
  const depthMap = {};
  if (bfsStart && nodeById.has(bfsStart)) {
    const queue = [bfsStart];
    depthMap[bfsStart] = 0;
    while (queue.length) {
      const cur = queue.shift();
      order.push(cur);
      const neighbors = traverseAdj.get(cur) || new Set();
      for (const nb of neighbors) {
        if (depthMap[nb] === undefined) {
          depthMap[nb] = depthMap[cur] + 1;
          queue.push(nb);
        }
      }
    }
  }
  const byDepth = {};
  for (const id of order) {
    const d = depthMap[id];
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(id);
  }

  // ---- E. Non-Code File Inventory ----
  const nonCodeFiles = { documentation: [], infrastructure: [], data: [], config: [] };
  for (const n of nodes) {
    const entry = { id: n.id, name: n.name, type: n.type, summary: n.summary || '' };
    switch (n.type) {
      case 'document':
        nonCodeFiles.documentation.push(entry); break;
      case 'service':
      case 'pipeline':
      case 'resource':
        nonCodeFiles.infrastructure.push(entry); break;
      case 'table':
      case 'schema':
      case 'endpoint':
        nonCodeFiles.data.push(entry); break;
      case 'config':
        nonCodeFiles.config.push(entry); break;
      default:
        break;
    }
  }

  // ---- F. Tightly Coupled Clusters ----
  // Seed clusters from bidirectional imports/calls pairs.
  function hasBidir(a, b) {
    const ab = outBy.get(a).get(b);
    const ba = outBy.get(b).get(a);
    const codeTypes = (s) => s && (s.has('imports') || s.has('calls'));
    return codeTypes(ab) && codeTypes(ba);
  }
  const visited = new Set();
  const clustersRaw = [];
  const ids = nodes.map((n) => n.id);
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    if (visited.has(a)) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      if (visited.has(b)) continue;
      if (hasBidir(a, b)) {
        // seed cluster {a,b}, expand
        const cluster = new Set([a, b]);
        let grew = true;
        while (grew && cluster.size < 5) {
          grew = false;
          // candidate nodes connecting to 2+ cluster members
          const candCount = new Map();
          for (const m of cluster) {
            for (const [t] of outBy.get(m)) {
              if (!cluster.has(t)) candCount.set(t, (candCount.get(t) || 0) + 1);
            }
            for (const [s] of inBy.get(m)) {
              if (!cluster.has(s)) candCount.set(s, (candCount.get(s) || 0) + 1);
            }
          }
          let best = null, bestC = 0;
          for (const [cid, c] of candCount) {
            if (c >= 2 && c > bestC && !visited.has(cid)) { best = cid; bestC = c; }
          }
          if (best) { cluster.add(best); grew = true; }
        }
        // count internal edges
        let edgeCount = 0;
        const arr = [...cluster];
        for (const m of arr) {
          for (const [t] of outBy.get(m)) if (cluster.has(t)) edgeCount++;
        }
        for (const m of arr) visited.add(m);
        clustersRaw.push({ nodes: arr, edgeCount });
        break;
      }
    }
  }
  clustersRaw.sort((a, b) => b.edgeCount - a.edgeCount);
  const clusters = clustersRaw.slice(0, 10);

  // ---- G. Layer List ----
  const layerList = layers.map((l) => ({ id: l.id, name: l.name, description: l.description || '' }));

  // ---- H. Node Summary Index ----
  const nodeSummaryIndex = {};
  for (const n of nodes) {
    nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary || '' };
  }

  const out = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal: { startNode: bfsStart, order, depthMap, byDepth },
    nonCodeFiles,
    clusters,
    layers: { count: layerList.length, list: layerList },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length
  };

  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error('FATAL:', err && err.stack ? err.stack : String(err));
  process.exit(1);
}
