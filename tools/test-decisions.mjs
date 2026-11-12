// Decisions (js/lib/decisions.js) and their points (js/lib/rewards.js). No libraries:
//   node tools/test-decisions.mjs
// Exits non-zero if any case fails.

process.env.TZ = 'Asia/Jerusalem';

const D = await import('../js/lib/decisions.js');
const R = await import('../js/lib/rewards.js');
const { DECISIONS } = await import('../js/lib/rules.js');

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

// A small seeded [0, 1) source (mulberry32), so the draw tests repeat.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const dec = (extra) => D.normalizeDecision({ id: 'd1', question: 'q', ...extra });
const at = (s) => new Date(s);

console.log('normalize');
check('defaults', (({ track, status, budgetSec, goodEnough, reopened, method }) => ({ track, status, budgetSec, goodEnough, reopened, method }))(dec({})),
  { track: 'small', status: 'open', budgetSec: 120, goodEnough: 3.5, reopened: false, method: null });
check('medium budget', dec({ track: 'medium' }).budgetSec, 600);
check('bad weight → 1, score out of range dropped', (() => {
  const d = dec({ criteria: [{ id: 'c1', name: 'מחיר', weight: 9 }], options: [{ id: 'a', text: 'A', scores: { c1: 7 } }] });
  return [d.criteria[0].weight, d.options[0].scores];
})(), [1, {}]);
check('at most 4 options', dec({ options: [1, 2, 3, 4, 5].map((i) => ({ id: `o${i}`, text: String(i) })) }).options.length, 4);

console.log('triage');
check('undoable + nothing in a year → small', D.triage({ reversible: true, impact: 'low' }), { track: 'small', large: false });
check('unanswered → small', D.triage({}), { track: 'small', large: false });
check('undoable + some → medium', D.triage({ reversible: true, impact: 'some' }), { track: 'medium', large: false });
check('can\'t undo + small → medium', D.triage({ reversible: false, impact: 'low' }), { track: 'medium', large: false });
check('can\'t undo + big → large', D.triage({ reversible: false, impact: 'high' }), { track: 'large', large: true });

console.log('on time');
const small = (decidedAt) => dec({ track: 'small', startedAt: at('2026-11-12T10:00:00'), decidedAt, status: 'decided' });
check('small at 1:59 → on time', D.isOnTime(small(at('2026-11-12T10:01:59'))), true);
check('small at exactly 2:00 → on time', D.isOnTime(small(at('2026-11-12T10:02:00'))), true);
check('small at 2:01 → late', D.isOnTime(small(at('2026-11-12T10:02:01'))), false);
const medium = (startedAt, decidedAt) => dec({ track: 'medium', startedAt: at(startedAt), decidedAt: at(decidedAt), status: 'decided' });
check('medium: tomorrow 23:59 → on time', D.isOnTime(medium('2026-11-12T22:00:00', '2026-11-13T23:59:00')), true);
check('medium: the midnight after tomorrow → late', D.isOnTime(medium('2026-11-12T22:00:00', '2026-11-14T00:00:00')), false);
check('medium: started 23:58, deadline is tomorrow\'s end', D.deadline(medium('2026-11-12T23:58:00', '2026-11-12T23:59:00')).getTime(), at('2026-11-14T00:00:00').getTime());
check('not started → no deadline', D.deadline(dec({})), null);

console.log('timer');
check('seconds left', D.secondsLeft(dec({ startedAt: at('2026-11-12T10:00:00') }), at('2026-11-12T10:00:30')), 90);
check('never below 0', D.secondsLeft(dec({ startedAt: at('2026-11-12T10:00:00') }), at('2026-11-12T10:05:00')), 0);
check('before start → the whole budget', D.secondsLeft(dec({})), 120);

console.log('scores and the suggestion');
const scored = dec({
  track: 'medium',
  criteria: [{ id: 'p', name: 'מחיר', weight: 3 }, { id: 'f', name: 'כיף', weight: 1 }],
  options: [
    { id: 'a', text: 'A', scores: { p: 2, f: 5 } }, // (6+5)/4 = 2.75
    { id: 'b', text: 'B', scores: { p: 4, f: 3 } }, // (12+3)/4 = 3.75
    { id: 'c', text: 'C', scores: { p: 5, f: 5 } }, // 5
  ],
});
check('weighted average', scored.options.map((o) => D.optionScore(o, scored.criteria)), [2.75, 3.75, 5]);
check('first good-enough wins over the best', D.suggestion(scored), { id: 'b', score: 3.75, goodEnough: true });
check('none good enough → the highest', D.suggestion({ ...scored, goodEnough: 5.0, options: scored.options.slice(0, 2) }), { id: 'b', score: 3.75, goodEnough: false });
check('nothing scored → null', D.suggestion(dec({ options: [{ id: 'a', text: 'A' }] })), null);
check('only scored criteria count', D.optionScore({ scores: { p: 4 } }, scored.criteria), 4);

console.log('points');
check('small on time + first', D.decisionPoints(small(at('2026-11-12T10:01:00'))), { raw: 5, onTime: true, first: 5 });
check('small late', D.decisionPoints(small(at('2026-11-12T10:30:00'))).raw, 2);
check('medium on time', D.decisionPoints(medium('2026-11-12T10:00:00', '2026-11-13T09:00:00')).raw, 15);
check('medium late', D.decisionPoints(medium('2026-11-12T10:00:00', '2026-11-15T09:00:00')).raw, 5);
check('reopened → no first bonus', D.decisionPoints({ ...small(at('2026-11-12T10:01:00')), reopened: true }).first, 0);
check('open → nothing', D.decisionPoints(dec({})), { raw: 0, onTime: false, first: 0 });

console.log('ladder');
const old = (days, extra = {}) => dec({ createdAt: new Date(at('2026-11-12T10:00:00') - days * 86400000), ...extra });
const NOW = at('2026-11-12T10:00:00');
check('6 days → nothing', D.ladderStage(old(6), NOW), null);
check('7 days → set a date', D.ladderStage(old(7), NOW), 'setDate');
check('14 days → what is missing', D.ladderStage(old(14), NOW), 'missing');
check('with a decide-by date → nothing', D.ladderStage(old(20, { decideBy: at('2026-11-20T12:00:00') }), NOW), null);
check('decided → nothing', D.ladderStage(old(20, { status: 'decided' }), NOW), null);
check('open list: dated first, then oldest', D.openDecisions([
  old(3, { id: 'x' }), old(9, { id: 'y' }), old(1, { id: 'z', decideBy: at('2026-11-14T12:00:00') }),
].map(D.normalizeDecision)).map((d) => d.id), ['z', 'y', 'x']);

console.log('the draw');
check('always in range', (() => {
  const rand = seeded(1);
  for (let i = 0; i < 5000; i += 1) {
    const n = 2 + (i % 3);
    const k = D.pickRandom(n, rand);
    if (k < 0 || k >= n || !Number.isInteger(k)) return false;
  }
  return true;
})(), true);
check('fair: each of 4 feet within 3% of a quarter', (() => {
  const rand = seeded(42);
  const counts = [0, 0, 0, 0];
  const N = 40000;
  for (let i = 0; i < N; i += 1) counts[D.pickRandom(4, rand)] += 1;
  return counts.every((c) => Math.abs(c / N - 0.25) < 0.03);
})(), true);
check('rand of 0.9999 stays in range', D.pickRandom(2, () => 0.99999999), 1);
check('the secure source gives [0, 1)', (() => {
  for (let i = 0; i < 200; i += 1) {
    const v = D.secureRandom();
    if (!(v >= 0 && v < 1)) return false;
  }
  return true;
})(), true);

console.log('drum plan');
const plan = D.drumPlan(2, seeded(7));
check('starts at 0', plan[0].at, 0);
check('ends inside the drum roll', plan[plan.length - 1].at < DECISIONS.game.drumMs, true);
check('speeds up', plan[1].at - plan[0].at > plan[plan.length - 1].at - plan[plan.length - 2].at, true);
check('never the same foot twice in a row', plan.every((b, i) => i === 0 || b.foot !== plan[i - 1].foot), true);
check('4 feet: all of them drum', new Set(D.drumPlan(4, seeded(3)).map((b) => b.foot)).size, 4);
check('one foot: still plays', D.drumPlan(1, seeded(3)).every((b) => b.foot === 0), true);

console.log('ledger awards');
const ctx = R.buildContext({
  today: '2026-11-12',
  decisions: [
    { ...small(at('2026-11-12T10:01:00')), id: 'd1' },
    { ...dec({ track: 'medium', startedAt: at('2026-11-10T10:00:00'), decidedAt: at('2026-11-12T09:00:00'), status: 'decided', reopened: true }), id: 'd2' },
    { ...dec({ status: 'open' }), id: 'd3' },
  ],
});
const awards = R.scoreDay('2026-11-12', ctx, { closed: false }).filter((a) => a.source === 'decision');
check('awards for the day', awards.map((a) => [a.rule, a.ref, a.raw, a.grade]), [
  ['decision', 'd1', 5, 'on-time'],
  ['decision-first', 'd1', 5, null],
  ['decision', 'd2', 5, 'late'],
]);
check('nothing on another day', R.scoreDay('2026-11-11', ctx, { closed: true }).filter((a) => a.source === 'decision').length, 0);

console.log('badge: on time in a row');
const entry = (date, i, grade) => ({ id: `${date}_decision_d${i}`, date, rule: 'decision', grade, points: 5 });
const five = [1, 2, 3, 4, 5].map((i) => entry(`2026-11-0${i}`, i, 'on-time'));
const badge = (ledger, id) => R.badgesFrom(ledger).find((b) => b.id === id).earnedOn;
check('5 in a row → on the fifth', badge(five, 'decide-5'), '2026-11-05');
check('a late one starts it over', badge([...five.slice(0, 4), entry('2026-11-05', 9, 'late'), entry('2026-11-06', 6, 'on-time')], 'decide-5'), null);
check('same day counts each', badge([1, 2, 3, 4, 5].map((i) => entry('2026-11-03', i, 'on-time')), 'decide-5'), '2026-11-03');

// ---------- M6c: large ----------
console.log('large track');
const large = (decideBy, decidedAt, extra = {}) => dec({
  track: 'large', startedAt: at('2026-11-12T10:00:00'), decideBy: decideBy && at(decideBy), decidedAt: at(decidedAt), status: 'decided', ...extra,
});
check('large: 23:59 of the decide-by day → on time', D.isOnTime(large('2026-11-19T12:00:00', '2026-11-19T23:59:00')), true);
check('large: the midnight after it → late', D.isOnTime(large('2026-11-19T12:00:00', '2026-11-20T00:00:00')), false);
check('large: no decide-by → a week from the start', D.deadline(large(null, '2026-11-13T09:00:00')).getTime(), at('2026-11-20T00:00:00').getTime());
check('large on time → 40 + 5', (({ raw, first }) => [raw, first])(D.decisionPoints(large('2026-11-19T12:00:00', '2026-11-15T09:00:00'))), [40, 5]);
check('large late → 10', D.decisionPoints(large('2026-11-19T12:00:00', '2026-11-21T09:00:00')).raw, 10);
check('large keeps its budget', dec({ track: 'large' }).budgetSec, DECISIONS.budgetSec.large);
check('days left: 2', D.daysLeft(dec({ decideBy: at('2026-11-14T12:00:00') }), at('2026-11-12T23:00:00')), 2);
check('days left: the day itself → 0', D.daysLeft(dec({ decideBy: at('2026-11-14T12:00:00') }), at('2026-11-14T08:00:00')), 0);
check('large fields default', (({ friendAdvice, premortem, experiment }) => ({ friendAdvice, premortem, experiment }))(dec({})),
  { friendAdvice: '', premortem: '', experiment: null });
check('experiment pending', D.experimentPending(dec({ status: 'open', experiment: { text: 'לשאול את דנה' } })), true);
check('experiment learned → not pending', D.experimentPending(dec({ status: 'open', experiment: { text: 'לשאול', learned: 'זה עובד' } })), false);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
