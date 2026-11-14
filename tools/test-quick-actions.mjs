// The + sheet's items and each screen's first one (js/lib/quick-actions.js).
// No libraries:
//   node tools/test-quick-actions.mjs
// Exits non-zero if any case fails.

const { QUICK_ITEMS, sheetItems } = await import('../js/lib/quick-actions.js');

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

const first = (route, override) => sheetItems(route, override).primary?.action ?? null;

console.log('the screen\'s own action');
check('each tab', ['today', 'tasks', 'session', 'nutrition', 'sleep'].map((r) => first(r)), ['habit', 'task', 'workout', 'meal', 'sleep']);
check('the parts of אימון', ['history', 'workout-progress'].map((r) => first(r)), ['workout', 'workout']);
check('screens with none', ['dashboard', 'connections', 'library', 'feedback', 'nope'].map((r) => first(r)), [null, null, null, null, null]);

console.log('named by the screen');
check('משימות on its החלטות part', first('tasks', 'decision'), 'decision');
check('an unknown name falls back', first('tasks', 'nope'), 'task');
check('a screen with none can still name one', first('dashboard', 'weigh'), 'weigh');

console.log('the wide row\'s words');
check('the grid\'s word by default', sheetItems('tasks').primary.label, 'משימה');
check('on היום, "הרגל" adds one', sheetItems('today').primary.label, 'הרגל חדש');
check('named from another screen, the grid\'s word', sheetItems('dashboard', 'habit').primary.label, 'הרגל');
check('the list itself is untouched', QUICK_ITEMS.find((i) => i.action === 'habit').label, 'הרגל');

console.log('the rest');
const { primary, rest } = sheetItems('tasks');
check('the first one is not repeated', rest.some((i) => i.action === primary.action), false);
check('nothing is lost', rest.length + 1, QUICK_ITEMS.length);
check('order is kept', rest.map((i) => i.action), QUICK_ITEMS.filter((i) => i.action !== 'task').map((i) => i.action));
check('with none, the whole grid', sheetItems('dashboard').rest.length, QUICK_ITEMS.length);
check('every action is unique', new Set(QUICK_ITEMS.map((i) => i.action)).size, QUICK_ITEMS.length);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
