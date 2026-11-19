// "מטרות לחיים" (js/lib/life-plan.js, js/lib/plan-templates.js, M10e) and
// its part of the coach's page. No libraries:
//   node tools/test-life-plan.mjs
// Exits non-zero if any case fails.

const L = await import('../js/lib/life-plan.js');
const { LIFE_AREAS } = await import('../js/lib/plan-templates.js');
const { coachBrief } = await import('../js/lib/coach-brief.js');
const { LIFE_PLAN } = await import('../js/lib/rules.js');
const { AREAS, normalizeHabit } = await import('../js/lib/habits.js');
const { icon } = await import('../js/ui/icon.js');

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
const has = (text, piece) => String(text).includes(piece);

console.log('the areas');
check('eight built-in areas', LIFE_AREAS.length, 8);
check('ids are unique', new Set(LIFE_AREAS.map((a) => a.id)).size, 8);
check('every habit area is a known one', LIFE_AREAS.every((a) => !!AREAS[a.habitArea]), true);
check('every area icon exists', LIFE_AREAS.every((a) => icon(a.icon) !== ''), true);
check('every idea icon exists', LIFE_AREAS.every((a) => a.ideas.every((i) => i.kind !== 'habit' || icon(i.template.icon || 'check') !== '')), true);
check('every area has 3 example wishes', LIFE_AREAS.every((a) => a.wishes.length === 3), true);
check('every area has ideas', LIFE_AREAS.every((a) => a.ideas.length >= 2), true);
check('habit ideas have a name and a schedule', LIFE_AREAS.every((a) => a.ideas.every((i) => i.kind !== 'habit' || (i.template.name && i.template.schedule))), true);

console.log('the plan on the user doc');
const plan = {
  lifePlan: {
    order: ['money', 'health'],
    areas: {
      health: { score: 6, wish3m: 'להתאמן 3 פעמים בשבוע', successMetric: '3 בשבוע', dueDate: '2027-02-19T10:00:00.000Z' },
      money: { score: 4, wish3m: '', successMetric: '', dueDate: null },
      home: { score: 7, removed: true },
      'custom-1': { name: 'מוזיקה', icon: 'target', score: 5 },
      junk: { score: 3 },
    },
  },
};
check('no plan → no areas', L.activeAreas({}).map((a) => a.id), []);
check('ירין (no lifePlan) → basic', L.planDepth({}), 'basic');
check('active areas in the chosen order, own ones last, removed and unknown out', L.activeAreas(plan).map((a) => a.id), ['money', 'health', 'custom-1']);
check('with areas → goals', L.planDepth(plan), 'goals');
check('own area keeps its name', L.areaInfo('custom-1', plan.lifePlan.areas['custom-1']).name, 'מוזיקה');
check('stored ids include removed', L.storedAreaIds(plan).sort(), ['custom-1', 'health', 'home', 'money']);
check('the offer: never', L.planOffer({ lifePlan: { offer: 'never' } }), 'never');
check('the offer: something else → null', L.planOffer({ lifePlan: { offer: 'x' } }), null);
check('next own id', L.newCustomId(plan), 'custom-2');
const full = { lifePlan: { areas: Object.fromEntries(Array.from({ length: LIFE_PLAN.maxCustomAreas }, (_, i) => [`custom-${i + 1}`, { name: 'x' }])) } };
check('own areas at the limit → null', L.newCustomId(full), null);
check('a removed own area frees a place, its id is not reused', L.newCustomId({ lifePlan: { areas: { ...full.lifePlan.areas, 'custom-3': { name: 'x', removed: true } } } }), 'custom-4');

console.log('numbers and dates');
check('score in range', L.clampScore(7), 7);
check('score out of range → null', L.clampScore(11), null);
check('score empty → null', L.clampScore(''), null);
check('3 months from 19.11.2026', L.defaultDueKey('2026-11-19'), '2027-02-19');
check('31 → the month\'s last day', L.defaultDueKey('2026-11-30'), '2027-02-28');
check('due key from an ISO string', L.dueKeyOf('2027-02-19T10:00:00.000Z'), '2027-02-19');
check('due key from a Timestamp-like', L.dueKeyOf({ seconds: Date.UTC(2027, 1, 19, 10) / 1000 }), '2027-02-19');
check('due key empty', L.dueKeyOf(null), '');
const f = L.areaFields({ score: '8', wish3m: '  לחסוך  ', successMetric: '1,000 ₪', dueKey: '2027-02-19' });
check('fields: score as a number', f.score, 8);
check('fields: trimmed text', f.wish3m, 'לחסוך');
check('fields: local noon', [f.dueDate.getFullYear(), f.dueDate.getMonth(), f.dueDate.getDate(), f.dueDate.getHours()], [2027, 1, 19, 12]);
check('fields: not removed', f.removed, false);
check('fields: no date → null', L.areaFields({ dueKey: '' }).dueDate, null);
check('fields: own area name', L.areaFields({}, { name: ' מוזיקה ' }).name, 'מוזיקה');
check('a row line', L.areaLine({ score: 6, wish3m: 'לחסוך' }), '6/10 · לחסוך');
check('an empty row line', L.areaLine({}), '');

console.log('ideas');
const ideas = L.ideasFor('health');
check('at most ideasPerArea', ideas.length <= LIFE_PLAN.ideasPerArea, true);
check('a habit that exists is not offered', L.ideasFor('health', { habits: [{ name: 'מים' }] }).some((i) => i.name === 'מים'), false);
check('a task that exists is not offered', L.ideasFor('money', { tasks: [{ title: 'להגדיר הוראת קבע לחיסכון' }] }).some((i) => i.name === 'להגדיר הוראת קבע לחיסכון'), false);
check('an own area has no ideas', L.ideasFor('custom-1'), []);
const tpl = L.ideaHabitTemplate(LIFE_AREAS.find((a) => a.id === 'relationship').ideas[0], 'relationship');
check('a habit idea gets the mapped area', tpl.area, 'relationship');
check('a habit idea is a good habit', tpl.kind, 'good');
check('a habit idea normalizes', normalizeHabit({ id: 'x', ...tpl }).name, 'ערב זוגי');
const pre = L.ideaTaskPrefill(LIFE_AREAS.find((a) => a.id === 'money').ideas[1], 'money');
check('a task idea prefills the title and the link', [pre.title, pre.planArea, pre.area], ['להגדיר הוראת קבע לחיסכון', 'money', 'personal']);

console.log('the coach page');
const habits = [{ id: 'h1', name: 'הליכה', planArea: 'health', schedule: { type: 'daily' } }];
const brief = coachBrief({ user: { ...plan }, habits, today: '2026-11-19' });
check('a goals section', has(brief, '## מטרות לחיים'), true);
check('an area with its score', has(brief, '**בריאות וגוף** · היום 6/10'), true);
check('its 3-month change', has(brief, 'לשנות ב-3 החודשים הקרובים: להתאמן 3 פעמים בשבוע'), true);
check('its metric and date', has(brief, 'הצלחה: 3 בשבוע, עד 19.2.2027'), true);
check('a linked habit', has(brief, 'הרגלים שקשורים: "הליכה"'), true);
check('a removed area is not there', has(brief, 'בית'), false);
check('when to offer more', has(brief, `פעם ב-${LIFE_PLAN.coachOfferDays} יום`), true);
const none = coachBrief({ user: {}, habits: [], today: '2026-11-19' });
check('no plan → no goals section', has(none, '## מטרות לחיים'), false);
check('no plan → may offer once', has(none, 'אפשר להציע פעם אחת, ברגע טבעי, להגדיר ב"התכנית שלי"'), true);
const never = coachBrief({ user: { lifePlan: { offer: 'never' } }, habits: [], today: '2026-11-19' });
check('never → don\'t offer', has(never, 'לא מציעים, אלא אם ביקש/ה'), true);
check('never → not "may offer"', has(never, 'אפשר להציע פעם אחת, ברגע טבעי'), false);
const later = coachBrief({ user: { lifePlan: { offer: 'never', areas: { money: { score: 3 } } } }, habits: [], today: '2026-11-19' });
check('goals set after "never" → the goals win', [has(later, '**כסף**'), has(later, 'לא מציעים, אלא אם')], [true, false]);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
