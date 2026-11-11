// App time from the iPhone (js/lib/app-usage.js). No libraries:
//   node tools/test-app-usage.mjs
// Exits non-zero if any case fails.

process.env.TZ = 'Asia/Jerusalem';

const U = await import('../js/lib/app-usage.js');
const { USAGE } = await import('../js/lib/rules.js');
const { israelDateKey } = await import('../js/lib/steps-import.js');

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

const at = (s) => new Date(s);
const day = israelDateKey;

console.log('sessions');
const open = U.applyEvent(null, 'open', at('2026-11-11T10:00:00Z'), day);
check('open: one more opening, nothing counted', [open.add, open.counted], [{ day: '2026-11-11', seconds: 0, opens: 1 }, 0]);
const close = U.applyEvent(open.state, 'close', at('2026-11-11T10:12:30Z'), day);
check('close: the seconds in between', [close.add, close.state.openSince], [{ day: '2026-11-11', seconds: 750, opens: 0 }, null]);
check('close with no open: nothing', U.applyEvent(null, 'close', at('2026-11-11T10:00:00Z'), day).add, null);
check('close after the max: a missed close, nothing', U.applyEvent(open.state, 'close', new Date(at('2026-11-11T10:00:00Z').getTime() + (USAGE.maxSessionMin + 1) * 60000), day).add, null);
const late = U.applyEvent(null, 'open', at('2026-11-11T21:55:00Z'), day); // 23:55 Israel
check('past midnight: counted on the day it opened', U.applyEvent(late.state, 'close', at('2026-11-11T22:10:00Z'), day).add.day, '2026-11-11');
check('open twice: the new one wins', U.applyEvent(open.state, 'open', at('2026-11-11T10:05:00Z'), day).state.openSince.toISOString(), '2026-11-11T10:05:00.000Z');
check('minutes round', [U.minutesOf(89), U.minutesOf(90), U.minutesOf(750)], [1, 2, 13]);

console.log('habit');
const ig = { id: 'ig', kind: 'bad', measure: 'limit', name: 'אינסטגרם + פייסבוק', parts: ['אינסטגרם', 'פייסבוק'], full: 15, short: 30, unit: 'דקות' };
const read = { id: 'r', kind: 'good', measure: 'quantity', name: 'קריאה' };
check('found by its part', U.findUsageHabit([read, ig], 'instagram').part, 'אינסטגרם');
check('found by name, no parts', U.findUsageHabit([{ ...ig, id: 'x', name: 'אינסטגרם', parts: [] }], 'instagram').part, null);
check('paused habit: none', U.findUsageHabit([{ ...ig, active: false }], 'instagram'), null);
check('usageApp wins', U.findUsageHabit([ig, { ...ig, id: 'y', name: 'מסכים', parts: [], usageApp: 'instagram' }], 'instagram').habit.id, 'y');
const habit = U.findUsageHabit([ig], 'instagram').habit;
const typed = { level: 'full', value: 5, parts: { 'פייסבוק': 5 }, clean: true, slips: [], source: 'manual' };
check('keeps the part typed by hand, sums', U.usageMark(habit, 'אינסטגרם', typed, 12), { clean: false, slips: [], value: 17, parts: { 'פייסבוק': 5, 'אינסטגרם': 12 }, level: 'short', source: 'shortcut' });
check('facebook fills its own part', U.findUsageHabit([ig], 'facebook').part, 'פייסבוק');
check('no mark yet', U.usageMark(habit, 'אינסטגרם', null, 9).level, 'full');
check('over the short limit: none', U.usageMark(habit, 'אינסטגרם', null, 40).level, 'none');

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
