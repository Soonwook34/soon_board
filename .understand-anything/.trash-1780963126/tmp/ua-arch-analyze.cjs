#!/usr/bin/env node
'use strict';

const fs = require('fs');

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error('Usage: ua-arch-analyze.js <input.json> <output.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const fileNodes = data.fileNodes || [];
  const importEdges = data.importEdges || [];
  const allEdges = data.allEdges || [];

  const nodeById = new Map();
  for (const n of fileNodes) nodeById.set(n.id, n);

  // ---- Helpers ----
  const filePathOf = (n) => n.filePath || (n.id.includes(':') ? n.id.split(':').slice(1).join(':') : n.id);

  // ---- Common prefix of all file paths (directory-segment based) ----
  function commonDirPrefix(paths) {
    if (paths.length === 0) return '';
    const split = paths.map((p) => p.split('/'));
    // only consider directory portions (drop last segment = filename)
    let prefix = [];
    const first = split[0];
    for (let i = 0; i < first.length - 1; i++) {
      const seg = first[i];
      if (split.every((parts) => parts.length - 1 > i && parts[i] === seg)) {
        prefix.push(seg);
      } else break;
    }
    return prefix.length ? prefix.join('/') + '/' : '';
  }

  const allPaths = fileNodes.map(filePathOf);
  const prefix = commonDirPrefix(allPaths);

  // ---- A. Directory Grouping ----
  const directoryGroups = {};
  const groupOfNode = new Map();
  function groupForPath(p) {
    let rest = p;
    if (prefix && rest.startsWith(prefix)) rest = rest.slice(prefix.length);
    const parts = rest.split('/');
    if (parts.length > 1) return parts[0];
    return '(root)';
  }
  for (const n of fileNodes) {
    const g = groupForPath(filePathOf(n));
    (directoryGroups[g] = directoryGroups[g] || []).push(n.id);
    groupOfNode.set(n.id, g);
  }

  // ---- B. Node Type Grouping ----
  const nodeTypeGroups = {};
  for (const n of fileNodes) {
    (nodeTypeGroups[n.type] = nodeTypeGroups[n.type] || []).push(n.id);
  }

  // ---- C. Import Adjacency (fan-in / fan-out) ----
  const fileFanIn = {};
  const fileFanOut = {};
  for (const n of fileNodes) { fileFanIn[n.id] = 0; fileFanOut[n.id] = 0; }
  for (const e of importEdges) {
    if (fileFanOut[e.source] !== undefined) fileFanOut[e.source]++;
    if (fileFanIn[e.target] !== undefined) fileFanIn[e.target]++;
  }

  // ---- D. Cross-Category Dependency Analysis (allEdges) ----
  const crossCatMap = new Map(); // key: fromType|toType|edgeType
  for (const e of allEdges) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    if (s.type === t.type) continue; // cross-category only
    const key = `${s.type}|${t.type}|${e.type}`;
    crossCatMap.set(key, (crossCatMap.get(key) || 0) + 1);
  }
  const crossCategoryEdges = [];
  for (const [key, count] of crossCatMap.entries()) {
    const [fromType, toType, edgeType] = key.split('|');
    crossCategoryEdges.push({ fromType, toType, edgeType, count });
  }
  crossCategoryEdges.sort((a, b) => b.count - a.count);

  // ---- E. Inter-Group Import Frequency ----
  const interMap = new Map(); // from|to
  for (const e of importEdges) {
    const gs = groupOfNode.get(e.source);
    const gt = groupOfNode.get(e.target);
    if (gs === undefined || gt === undefined) continue;
    if (gs === gt) continue;
    const key = `${gs}|${gt}`;
    interMap.set(key, (interMap.get(key) || 0) + 1);
  }
  const interGroupImports = [];
  for (const [key, count] of interMap.entries()) {
    const [from, to] = key.split('|');
    interGroupImports.push({ from, to, count });
  }
  interGroupImports.sort((a, b) => b.count - a.count);

  // ---- F. Intra-Group Import Density ----
  const intraGroupDensity = {};
  const groupTotal = {};   // edges touching the group
  const groupInternal = {};
  for (const g of Object.keys(directoryGroups)) { groupTotal[g] = 0; groupInternal[g] = 0; }
  for (const e of importEdges) {
    const gs = groupOfNode.get(e.source);
    const gt = groupOfNode.get(e.target);
    if (gs === undefined && gt === undefined) continue;
    if (gs !== undefined) groupTotal[gs]++;
    if (gt !== undefined && gt !== gs) groupTotal[gt]++;
    if (gs !== undefined && gs === gt) { groupInternal[gs]++; }
  }
  for (const g of Object.keys(directoryGroups)) {
    const internal = groupInternal[g];
    const total = groupTotal[g];
    intraGroupDensity[g] = {
      internalEdges: internal,
      totalEdges: total,
      density: total > 0 ? +(internal / total).toFixed(3) : 0,
    };
  }

  // ---- G. Directory Pattern Matching ----
  const dirPatternTable = [
    [['routes', 'api', 'controllers', 'endpoints', 'handlers'], 'api'],
    [['services', 'core', 'lib', 'domain', 'logic'], 'service'],
    [['models', 'db', 'data', 'persistence', 'repository', 'entities'], 'data'],
    [['components', 'views', 'pages', 'ui', 'layouts', 'screens'], 'ui'],
    [['middleware', 'plugins', 'interceptors', 'guards'], 'middleware'],
    [['utils', 'helpers', 'common', 'shared', 'tools'], 'utility'],
    [['config', 'constants', 'env', 'settings'], 'config'],
    [['__tests__', 'test', 'tests', 'spec', 'specs'], 'test'],
    [['types', 'interfaces', 'schemas', 'contracts', 'dtos'], 'types'],
    [['hooks'], 'hooks'],
    [['store', 'state', 'reducers', 'actions', 'slices'], 'state'],
    [['assets', 'static', 'public'], 'assets'],
    [['migrations'], 'data'],
    [['management', 'commands'], 'config'],
    [['templatetags'], 'utility'],
    [['signals'], 'service'],
    [['serializers'], 'api'],
    [['cmd'], 'entry'],
    [['internal'], 'service'],
    [['pkg'], 'utility'],
    [['dto', 'request', 'response'], 'types'],
    [['entity'], 'data'],
    [['controller'], 'api'],
    [['routers'], 'api'],
    [['composables'], 'service'],
    [['blueprints'], 'api'],
    [['mailers', 'jobs', 'channels'], 'service'],
    [['bin'], 'entry'],
    [['docs', 'documentation', 'wiki'], 'documentation'],
    [['deploy', 'deployment', 'infra', 'infrastructure'], 'infrastructure'],
    [['.github', '.gitlab', '.circleci'], 'ci-cd'],
    [['k8s', 'kubernetes', 'helm', 'charts'], 'infrastructure'],
    [['terraform', 'tf'], 'infrastructure'],
    [['docker'], 'infrastructure'],
    [['sql', 'database', 'schema'], 'data'],
    [['map'], 'ui'],
    [['style', 'styles'], 'ui'],
  ];
  const dirPatternLookup = {};
  for (const [names, label] of dirPatternTable) {
    for (const nm of names) dirPatternLookup[nm] = label;
  }

  function fileLevelPattern(p, name) {
    const base = name || p.split('/').pop();
    if (/\.(test|spec)\./i.test(base) || /^test_.*\.py$/i.test(base) || /_test\.go$/i.test(base) ||
        /Test\.java$/.test(base) || /_spec\.rb$/i.test(base) || /Test\.php$/.test(base) || /Tests\.cs$/.test(base)) return 'test';
    if (/\.d\.ts$/.test(base)) return 'types';
    if (/^(index\.ts|index\.js|__init__\.py)$/.test(base)) return 'entry';
    if (base === 'manage.py') return 'entry';
    if (/^(wsgi|asgi)\.py$/.test(base)) return 'config';
    if (base === 'main.go' && /(^|\/)cmd\//.test(p)) return 'entry';
    if ((base === 'main.rs' || base === 'lib.rs') && /(^|\/)src\//.test(p)) return 'entry';
    if (base === 'Application.java' || base === 'Program.cs') return 'entry';
    if (base === 'config.ru') return 'entry';
    if (/^(Cargo\.toml|go\.mod|Gemfile|pom\.xml|build\.gradle|composer\.json)$/.test(base)) return 'config';
    if (base === 'Dockerfile' || /^docker-compose\..*/.test(base)) return 'infrastructure';
    if (/\.(tf|tfvars)$/.test(base)) return 'infrastructure';
    if (/\.github\/workflows\//.test(p) || base === '.gitlab-ci.yml' || base === 'Jenkinsfile') return 'ci-cd';
    if (/\.sql$/.test(base)) return 'data';
    if (/\.(graphql|gql|proto)$/.test(base)) return 'types';
    if (/\.(md|rst)$/i.test(base)) return 'documentation';
    if (base === 'Makefile') return 'infrastructure';
    return null;
  }

  const patternMatches = {};
  for (const g of Object.keys(directoryGroups)) {
    if (dirPatternLookup[g]) patternMatches[g] = dirPatternLookup[g];
  }

  // ---- H. Deployment Topology Detection ----
  const infraFiles = [];
  let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;
  for (const n of fileNodes) {
    const p = filePathOf(n);
    const base = n.name || p.split('/').pop();
    if (base === 'Dockerfile' || /^Dockerfile\./.test(base)) { hasDockerfile = true; infraFiles.push(p); }
    if (/^docker-compose\..*/.test(base)) { hasCompose = true; infraFiles.push(p); }
    if (/(^|\/)(k8s|kubernetes|helm|charts)\//.test(p)) { hasK8s = true; infraFiles.push(p); }
    if (/\.(tf|tfvars)$/.test(base)) { hasTerraform = true; infraFiles.push(p); }
    if (/\.github\/workflows\//.test(p) || base === '.gitlab-ci.yml' || base === 'Jenkinsfile') { hasCI = true; infraFiles.push(p); }
  }

  // ---- I. Data Pipeline Detection ----
  const schemaFiles = [], migrationFiles = [], dataModelFiles = [], apiHandlerFiles = [];
  for (const n of fileNodes) {
    const p = filePathOf(n);
    const base = n.name || p.split('/').pop();
    const tags = (n.tags || []).map((t) => String(t).toLowerCase());
    if (/\.(sql|graphql|gql|proto|prisma)$/.test(base)) schemaFiles.push(p);
    if (/(^|\/)migrations\//.test(p)) migrationFiles.push(p);
    if (/(^|\/)(models|entities|entity)\//.test(p) || tags.includes('model') || tags.includes('data-model')) dataModelFiles.push(p);
    if (/(^|\/)(routes|controllers|api|endpoints|handlers)\//.test(p) || tags.includes('api-handler')) apiHandlerFiles.push(p);
  }

  // ---- J. Documentation Coverage ----
  const docNodeIds = new Set((nodeTypeGroups['document'] || []));
  const groupsWithDocs = new Set();
  // a group "has docs" if any document node lives inside it
  for (const id of docNodeIds) {
    const g = groupOfNode.get(id);
    if (g !== undefined) groupsWithDocs.add(g);
  }
  // also: groups referenced by documents edges
  for (const e of allEdges) {
    if (e.type !== 'documents') continue;
    const t = groupOfNode.get(e.target);
    if (t !== undefined) groupsWithDocs.add(t);
  }
  const totalGroups = Object.keys(directoryGroups).length;
  const undocumentedGroups = Object.keys(directoryGroups).filter((g) => !groupsWithDocs.has(g));
  const docCoverage = {
    groupsWithDocs: groupsWithDocs.size,
    totalGroups,
    coverageRatio: totalGroups > 0 ? +(groupsWithDocs.size / totalGroups).toFixed(2) : 0,
    undocumentedGroups,
  };

  // ---- K. Dependency Direction ----
  const pairCount = new Map(); // unordered pair "a|b" sorted -> {abCount for a->b}
  const directed = new Map(); // "from|to" count
  for (const ig of interGroupImports) directed.set(`${ig.from}|${ig.to}`, ig.count);
  const seenPairs = new Set();
  const dependencyDirection = [];
  for (const ig of interGroupImports) {
    const a = ig.from, b = ig.to;
    const pairKey = [a, b].sort().join('||');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const ab = directed.get(`${a}|${b}`) || 0;
    const ba = directed.get(`${b}|${a}`) || 0;
    if (ab >= ba && ab > 0) dependencyDirection.push({ dependent: a, dependsOn: b });
    else if (ba > ab) dependencyDirection.push({ dependent: b, dependsOn: a });
  }

  // ---- File stats ----
  const filesPerGroup = {};
  for (const [g, ids] of Object.entries(directoryGroups)) filesPerGroup[g] = ids.length;
  const nodeTypeCounts = {};
  for (const [t, ids] of Object.entries(nodeTypeGroups)) nodeTypeCounts[t] = ids.length;

  const result = {
    scriptCompleted: true,
    commonPrefix: prefix,
    directoryGroups,
    nodeTypeGroups,
    crossCategoryEdges,
    interGroupImports,
    intraGroupDensity,
    patternMatches,
    fileLevelPatternHints: (() => {
      const hints = {};
      for (const n of fileNodes) {
        const fl = fileLevelPattern(filePathOf(n), n.name);
        if (fl) hints[n.id] = fl;
      }
      return hints;
    })(),
    deploymentTopology: {
      hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI,
      infraFiles: Array.from(new Set(infraFiles)),
    },
    dataPipeline: { schemaFiles, migrationFiles, dataModelFiles, apiHandlerFiles },
    docCoverage,
    dependencyDirection,
    fileStats: {
      totalFileNodes: fileNodes.length,
      filesPerGroup,
      nodeTypeCounts,
    },
    fileFanIn,
    fileFanOut,
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  process.stderr.write(`OK: ${fileNodes.length} nodes, ${Object.keys(directoryGroups).length} groups\n`);
  process.exit(0);
}

try { main(); } catch (err) {
  console.error('FATAL:', err && err.stack ? err.stack : String(err));
  process.exit(1);
}
