// The feedback page's rules (js/lib/feedback.js, M15a). No libraries:
//   node tools/test-feedback.mjs
// Exits non-zero if any case fails.

import { readFileSync } from 'node:fs';

const F = await import('../js/lib/feedback.js');
const { FEEDBACK } = await import('../js/lib/rules.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok    ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        got      ${a}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-15T12:00:00Z');
const ago = (d) => new Date(now - d * DAY).toISOString();
// A Firestore Timestamp look-alike.
const ts = (d) => ({ toMillis: () => now - d * DAY });

const items = [
  { id: 'a', authorUid: 'me', status: 'new', createdAt: ts(0) },
  { id: 'b', authorUid: 'me', status: 'in_progress', createdAt: ts(3) },
  { id: 'c', authorUid: 'me', status: 'done', createdAt: ts(6), closedAt: ts(2) },
  { id: 'd', authorUid: 'me', status: 'done', createdAt: ts(20), closedAt: ts(10) },
  // Closed before closedAt existed: falls back to updatedAt.
  { id: 'e', authorUid: 'me', status: 'dismissed', createdAt: ago(9), updatedAt: ago(8) },
  { id: 'f', authorUid: 'me', status: 'dismissed', createdAt: ago(5), updatedAt: ago(1) },
  { id: 'g', authorUid: 'other', status: 'new', createdAt: ts(1) },
  { id: 'h', authorUid: 'other', status: 'done', createdAt: ts(30), closedAt: ts(29) },
  // No status at all reads as new; no authorUid = admin only.
  { id: 'i', createdAt: ts(2) },
];
const ids = (list) => list.map((x) => x.id);

console.log('split — user');
{
  const { open, closed } = F.splitFeedback(items, { uid: 'me', now, closedVisibleDays: 7 });
  check('open: own new + in progress, newest first', ids(open), ['a', 'b']);
  check('closed: own, closed in the last 7 days, newest first', ids(closed), ['f', 'c']);
}
{
  const { open, closed } = F.splitFeedback(items, { uid: null, now });
  check('signed out sees nothing', [ids(open), ids(closed)], [[], []]);
}
{
  const { closed } = F.splitFeedback(items, { uid: 'me', now, closedVisibleDays: 30 });
  check('window is a parameter', ids(closed), ['f', 'c', 'e', 'd']);
}

console.log('split — admin');
{
  const { open, closed } = F.splitFeedback(items, { admin: true, now });
  check('open: everyone\'s, missing status = new', ids(open), ['a', 'g', 'i', 'b']);
  check('closed: everything, nothing hidden', ids(closed), ['f', 'c', 'e', 'd', 'h']);
}

console.log('labels');
check('user sees "נשלח" for new', F.statusLabel('new'), 'נשלח');
check('user sees "נסגר", never "נדחה"', F.statusLabel('dismissed'), 'נסגר');
check('admin sees "נדחה"', F.statusLabel('dismissed', { admin: true }), 'נדחה');
check('unknown status reads as new', F.statusLabel('weird'), 'נשלח');
check('old "suggestion" reads as רעיון', F.categoryLabel('suggestion'), 'רעיון');
check('feature reads as רעיון', F.categoryLabel('feature'), 'רעיון');
check('unknown category reads as אחר', F.categoryLabel(undefined), 'אחר');
check('the form offers five types', F.FEEDBACK_CATEGORIES.map((c) => c.id), ['bug', 'ux', 'ui', 'feature', 'other']);

console.log('who may edit');
check('author, new', F.canEdit(items[0], { uid: 'me' }), true);
check('author, in progress', F.canEdit(items[1], { uid: 'me' }), false);
check('author, done', F.canEdit(items[2], { uid: 'me' }), false);
check('someone else', F.canEdit(items[6], { uid: 'me' }), false);
check('signed out', F.canEdit(items[0], { uid: null }), false);
check('admin, anything', F.canEdit(items[7], { uid: 'x', admin: true }), true);

console.log('status change');
check('done sets closedAt', F.statusChange('done'), { status: 'done', closedAt: 'now' });
check('dismissed sets closedAt', F.statusChange('dismissed'), { status: 'dismissed', closedAt: 'now' });
check('reopen clears closedAt', F.statusChange('in_progress'), { status: 'in_progress', closedAt: null });

console.log('time values');
check('ISO string', F.toMillis('2026-11-15T12:00:00Z'), now);
check('Timestamp', F.toMillis(ts(0)), now);
check('Date', F.toMillis(new Date(now)), now);
check('missing', F.toMillis(undefined), null);
check('garbage', F.toMillis('not a date'), null);

console.log('admin');
check('admin uid', F.isAdminUid('A', ['A']), true);
check('not admin', F.isAdminUid('B', ['A']), false);
check('no uid', F.isAdminUid(null, ['A']), false);

console.log('firestore.rules matches rules.js');
{
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const m = rules.match(/request\.auth\.uid in \[([^\]]*)\]/);
  const ruleUids = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
  check('same admin uids', ruleUids, FEEDBACK.adminUids);
  check('same text limit', rules.includes(`text.size() <= ${FEEDBACK.textMax}`), true);
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
