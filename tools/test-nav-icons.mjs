// The static bottom nav in index.html copies its icons by hand from
// js/ui/icon.js (the markup exists before any module loads). This checks
// every nav link's <svg> against icon(name) for the name in its data-icon:
//   node tools/test-nav-icons.mjs
// Exits non-zero on any drift. Run by tools/check.sh.

import { readFileSync } from 'node:fs';

const { icon } = await import('../js/ui/icon.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const nav = html.match(/<nav id="bottom-nav"[\s\S]*?<\/nav>/)?.[0];
if (!nav) {
  console.log('FAILED — no <nav id="bottom-nav"> in index.html');
  process.exit(1);
}

let failed = 0;
const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
for (const [, attrs, body] of links) {
  const name = attrs.match(/data-icon="([^"]+)"/)?.[1];
  const label = body.match(/<span>([^<]*)<\/span>/)?.[1] || '?';
  const svg = body.match(/<svg[\s\S]*?<\/svg>/)?.[0];
  const expected = name && icon(name);
  if (!name) {
    console.log(`  FAIL  ${label}: no data-icon`);
    failed += 1;
  } else if (!expected) {
    console.log(`  FAIL  ${label}: "${name}" is not in js/ui/icon.js`);
    failed += 1;
  } else if (svg !== expected) {
    console.log(`  FAIL  ${label}: <svg> differs from icon('${name}')`);
    failed += 1;
  } else {
    console.log(`  ok    ${label} (${name})`);
  }
}

if (!links.length) failed += 1;
console.log(failed ? `FAILED — ${failed} nav icon(s) out of sync.` : `OK — ${links.length} nav icons match js/ui/icon.js.`);
process.exit(failed ? 1 : 0);
