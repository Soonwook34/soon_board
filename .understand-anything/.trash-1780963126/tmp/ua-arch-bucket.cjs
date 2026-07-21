const fs = require('fs');
const inp = JSON.parse(fs.readFileSync('/Users/a453498/Downloads/project/soon_board/.understand-anything/tmp/arch-input.json','utf8'));
const nodes = inp.fileNodes;

// second-level segment under src/, or top-level dir otherwise
function bucket(n){
  const id = n.id;
  const p = n.filePath;
  // non-code by type first
  if (n.type === 'pipeline') return 'ci-cd';
  if (n.type === 'document') return 'docs';
  if (n.type === 'config') {
    if (/\.understandignore$|\.understand-anything\//.test(p)) return 'config';
    return 'config';
  }
  // code (file)
  if (p.startsWith('scripts/')) return 'scripts';
  if (p.startsWith('e2e/')) return 'e2e';
  if (p.startsWith('src/')){
    const seg = p.split('/')[1];
    return 'src/'+seg;
  }
  // root-level code files: index.html, vite.config.ts, vitest.setup.ts, playwright.config.ts
  return 'root-code';
}
const buckets = {};
for(const n of nodes){
  const b = bucket(n);
  (buckets[b]=buckets[b]||[]).push({id:n.id,p:n.filePath,t:n.type,tags:n.tags});
}
const summary={};
for(const [b,arr] of Object.entries(buckets)) summary[b]=arr.length;
console.log('BUCKET COUNTS:');
console.log(JSON.stringify(summary,null,2));
console.log('TOTAL:', nodes.length);
// show src/* subgroup detail and root-code + config members
for(const key of ['root-code','config','src/shared','src/style']){
  console.log('\n=== '+key+' ===');
  for(const m of (buckets[key]||[])) console.log(' ', m.t, m.p);
}
fs.writeFileSync('/Users/a453498/Downloads/project/soon_board/.understand-anything/tmp/ua-buckets.json', JSON.stringify(buckets,null,2));
