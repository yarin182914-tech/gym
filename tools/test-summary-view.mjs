// What the progress summary shows before anything is opened
// (js/lib/summary-view.js). No libraries:
//   node tools/test-summary-view.mjs
// Exits non-zero if any case fails.

const { roadLevels, splitStreaks, badgeShelves } = await import('../js/lib/summary-view.js');
const { REWARDS, SLEEP } = await import('../js/lib/rules.js');

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

const levels = [1, 2, 3, 4, 5].map((level) => ({ level }));
const nums = (r) => [r.shown.map((l) => l.level), r.hidden];

console.log('levels');
check('the current level and the next', nums(roadLevels(levels, 2, 2)), [[2, 3], 3]);
check('first level', nums(roadLevels(levels, 1, 2)), [[1, 2], 3]);
check('top level stands alone', nums(roadLevels(levels, 5, 2)), [[5], 4]);
check('an unknown level falls back to the first', nums(roadLevels(levels, 9, 2)), [[1, 2], 3]);
check('a count of zero still shows the current', nums(roadLevels(levels, 3, 0)), [[3], 4]);
check('the real road, by the rule', nums(roadLevels(REWARDS.levels, 1, REWARDS.roadLevelsShown)), [[1, 2], REWARDS.levels.length - 2]);

console.log('streaks');
const s = splitStreaks([{ id: 'a', n: 3 }, { id: 'b', n: 0 }, { id: 'c', n: 1 }, { id: 'd' }]);
check('running ones', s.active.map((x) => x.id), ['a', 'c']);
check('the ones at zero', s.idle.map((x) => x.id), ['b', 'd']);
check('none', splitStreaks([]), { active: [], idle: [] });

console.log('badges');
const b = (id, area, earnedOn = null) => ({ id, area, earnedOn });
const shelves = badgeShelves([
  b('s1', 'sleep', '2026-11-01'), b('s2', 'sleep'), b('s3', 'sleep'),
  b('h1', 'habits'), b('h2', 'habits'), b('h3', 'habits', '2026-11-02'),
  b('n1', 'nutrition', '2026-11-03'),
]);
const ids = shelves.map((x) => [x.area, x.shown.map((y) => y.id), x.hidden]);
check('earned, then the next one', ids[0], ['sleep', ['s1', 's2'], 1]);
check('an earned one after the next still shows', ids[1], ['habits', ['h3', 'h1'], 1]);
check('all earned: nothing hidden', ids[2], ['nutrition', ['n1'], 0]);
const fresh = badgeShelves(REWARDS.badges.map((d) => ({ ...d, earnedOn: null })));
check('nothing earned: one per area', fresh.map((x) => x.shown.length), fresh.map(() => 1));
check('every badge is shown or counted', fresh.reduce((n, x) => n + x.shown.length + x.hidden, 0), REWARDS.badges.length);

console.log('rules');
check('the short sleep list fits in the long one', SLEEP.logNights > 0 && SLEEP.logNights <= SLEEP.historyNights, true);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
