// Rules for the "ללמוד" screen (js/lib/library.js) and the shape of the
// shared list (js/data/library.js). No libraries:
//   node tools/test-library.mjs
// Exits non-zero if any case fails.

process.env.TZ = 'Asia/Jerusalem';

const { areaOrder, sortItems, filterItems, pickToItem } = await import('../js/lib/library.js');
const { LIBRARY, LIBRARY_AREAS, LIBRARY_TYPES } = await import('../js/data/library.js');
const { LIBRARY_RULES } = await import('../js/lib/rules.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok    ${name}`);
  else { failed++; console.log(`  FAIL  ${name}\n        got      ${a}\n        expected ${e}`); }
}

const today = '2026-11-10';
const def = LIBRARY_RULES.defaultOrder;
const night = (date, h) => ({ date, durationMin: h * 60 });

console.log('areaOrder');
check('no data, no goal → default order', areaOrder({ today, minHours: 8 }), def);
check('short sleep, enough nights → sleep first',
  areaOrder({ today, minHours: 8, nights: [night('2026-11-09', 6), night('2026-11-08', 6.5), night('2026-11-07', 7)] })[0], 'sleep');
check('short sleep, too few nights → not flagged',
  areaOrder({ today, minHours: 8, nights: [night('2026-11-09', 5), night('2026-11-08', 5)] }), def);
check('old nights outside the window are ignored',
  areaOrder({ today, minHours: 8, nights: [night('2026-10-01', 5), night('2026-10-02', 5), night('2026-10-03', 5)] }), def);
check('enough sleep → not flagged',
  areaOrder({ today, minHours: 8, nights: [night('2026-11-09', 8.5), night('2026-11-08', 8), night('2026-11-07', 9)] }), def);
check('few workouts → training first',
  areaOrder({ today, weeklyGoal: 3, workoutDays: ['2026-11-09'] })[0], 'training');
check('workouts on goal → not flagged',
  areaOrder({ today, weeklyGoal: 3, workoutDays: ['2026-11-05', '2026-11-07', '2026-11-09'] }), def);
const both = areaOrder({ today, minHours: 8, weeklyGoal: 3,
  nights: [night('2026-11-09', 6), night('2026-11-08', 6), night('2026-11-07', 6)], workoutDays: [] });
check('both weak → sleep, training, then the rest', both.slice(0, 2), ['sleep', 'training']);
check('every area appears once', [...both].sort(), [...def].sort());

console.log('sortItems / filterItems');
const items = [
  { id: 'a', area: 'mind', type: 'book' },
  { id: 'b', area: 'sleep', type: 'podcast' },
  { id: 'c', area: 'sleep', type: 'book' },
  { id: 'pick:x', area: 'longevity', type: 'video', pick: true },
];
const marks = { c: { doneAt: 1 }, a: { saved: true } };
check('picks first, finished last, then by area',
  sortItems(items, ['sleep', 'mind', 'longevity'], marks).map((i) => i.id), ['pick:x', 'b', 'a', 'c']);
check('filter by area', filterItems(items, { area: 'sleep' }).map((i) => i.id), ['b', 'c']);
check('filter by type', filterItems(items, { type: 'book' }).map((i) => i.id), ['a', 'c']);
check('filter saved', filterItems(items, { saved: true }, marks).map((i) => i.id), ['a']);

console.log('pickToItem');
const p = pickToItem({ id: 'x1', title: 'T', takeaways: ['1', '2', '3', '4'] });
check('id and flag', [p.id, p.pick], ['pick:x1', true]);
check('takeaways capped at 3', p.takeaways.length, 3);
check('missing takeaways → []', pickToItem({ id: 'y' }).takeaways, []);

console.log('shared list');
const ids = LIBRARY.map((i) => i.id);
check('ids are unique', new Set(ids).size, ids.length);
const bad = LIBRARY.filter((i) => !LIBRARY_AREAS[i.area] || !LIBRARY_TYPES[i.type]
  || !i.title || !/^https:\/\//.test(i.link || '') || !Array.isArray(i.takeaways) || i.takeaways.length !== 3);
check('every item has a known area/type, https link and 3 takeaways', bad.map((i) => i.id), []);
check('every default area exists', def.filter((a) => !LIBRARY_AREAS[a]), []);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
