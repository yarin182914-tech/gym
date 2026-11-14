// Sample data for the local sandbox (`?dev` on localhost or a branch preview) so History,
// Dashboard and the "previous performance" popup have something to render.
// Loaded via dynamic import from app.js and therefore never fetched in
// production. Writes only to the dev-store's localStorage key.
import {
  listWorkouts, createWorkout, addExerciseToLibrary, seedExerciseLibraryIfEmpty, addNutritionEntry,
} from '../lib/firestore.js';
import { EXAMPLE_HABITS } from '../lib/habits.js';
import { todayKey, shiftKey } from '../lib/body-weight.js';

function sets(rows, weightMode, weightUnit) {
  return rows.map(([type, weight, reps], i) => ({
    setNumber: i + 1, type, weight, reps, weightMode, weightUnit,
  }));
}

const EXTRA_EXERCISES = [
  { name: 'חזה מכונה', category: 'חזה', defaultWeightMode: 'perSide', defaultUnit: 'kg' },
  { name: 'פולי למטה', category: 'גב', defaultWeightMode: 'perSide', defaultUnit: 'kg' },
  { name: 'חתירה למעלה', category: 'גב', defaultWeightMode: 'total', defaultUnit: 'lb' },
  { name: 'רגליים 4 ראשי', category: 'רגליים', defaultWeightMode: 'total', defaultUnit: 'kg' },
  { name: 'כבלים עליון', category: 'חזה', defaultWeightMode: 'total', defaultUnit: 'kg' },
  { name: 'יד קדמית כבל', category: 'יד קדמית', defaultWeightMode: 'total', defaultUnit: 'kg' },
  { name: 'יד אחורית כבל', category: 'יד אחורית', defaultWeightMode: 'total', defaultUnit: 'kg' },
  { name: 'בטן מיטה בשיפוע', category: 'בטן', defaultWeightMode: 'total', defaultUnit: 'kg' },
];

// Three deadlift sessions with a rising load, so the progress chart has a real
// trend; one lb-based exercise, to keep unit handling honest during testing.
const WORKOUTS = [
  {
    date: new Date(2026, 6, 17, 18, 0), end: new Date(2026, 6, 17, 19, 0),
    exercises: [
      { name: 'דדליפט', category: 'גב', sets: sets([['working', 22.5, 8], ['working', 22.5, 8], ['working', 22.5, 8]], 'perSide', 'kg') },
      { name: 'פולי למטה', category: 'גב', sets: sets([['working', 51.25, 6], ['working', 50, 6]], 'perSide', 'kg') },
      { name: 'חתירה למעלה', category: 'גב', sets: sets([['working', 210, 7], ['working', 210, 7]], 'total', 'lb') },
    ],
  },
  {
    date: new Date(2026, 6, 20, 18, 0), end: new Date(2026, 6, 20, 19, 0),
    exercises: [
      { name: 'דדליפט', category: 'גב', sets: sets([['working', 25, 8], ['working', 25, 8], ['working', 25, 8]], 'perSide', 'kg') },
      { name: 'רגליים 4 ראשי', category: 'רגליים', sets: sets([['working', 70, 10], ['working', 70, 10]], 'total', 'kg') },
      { name: 'יד קדמית כבל', category: 'יד קדמית', sets: sets([['working', 32, 8], ['dropset', 27, 4]], 'total', 'kg') },
    ],
  },
  {
    date: new Date(2026, 6, 24, 18, 0), end: new Date(2026, 6, 24, 19, 0),
    exercises: [
      { name: 'דדליפט', category: 'גב', sets: sets([['working', 26.125, 8], ['working', 26.125, 8]], 'perSide', 'kg') },
      { name: 'חתירה למעלה', category: 'גב', sets: sets([['working', 220, 7], ['working', 215, 7]], 'total', 'lb') },
      { name: 'בטן מיטה בשיפוע', category: 'בטן', sets: sets([['working', 10, 15], ['working', 10, 15]], 'total', 'kg') },
    ],
  },
  {
    date: new Date(2026, 6, 26, 18, 0), end: new Date(2026, 6, 26, 19, 0),
    exercises: [
      { name: 'חזה מכונה', category: 'חזה', sets: sets([['warmup', 30, 8], ['working', 35, 7], ['working', 35, 6], ['dropset', 20, 6]], 'perSide', 'kg') },
      { name: 'כבלים עליון', category: 'חזה', sets: sets([['working', 30, 10], ['working', 22.5, 12]], 'total', 'kg') },
      { name: 'יד אחורית כבל', category: 'יד אחורית', sets: sets([['working', 57.5, 12], ['working', 50, 12]], 'total', 'kg') },
    ],
  },
];

export async function seedDevStoreIfEmpty() {
  const existing = await listWorkouts(1);
  if (existing.length > 0) return;

  await seedExerciseLibraryIfEmpty();
  for (const ex of EXTRA_EXERCISES) {
    await addExerciseToLibrary({ ...ex, isCustom: false });
  }
  for (const w of WORKOUTS) {
    await createWorkout({
      date: w.date, startTime: w.date, endTime: w.end, notes: '', exercises: w.exercises,
    });
  }
  // This week, so the three rings on "היום" (M4c2) each show a state: two
  // recent workouts, two meals today, and no night logged (the grey ring).
  const at = (daysBack, hour, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  for (const back of [1, 3]) {
    await createWorkout({
      date: at(back, 18), startTime: at(back, 18), endTime: at(back, 19), notes: '', exercises: WORKOUTS[0].exercises,
    });
  }
  await addNutritionEntry({
    date: at(0, 8), mealType: 'breakfast', description: 'חביתה, לחם וירקות', calories: 520, proteinG: 32, carbsG: 40, fatG: 24,
  });
  await addNutritionEntry({
    date: at(0, 13, 30), mealType: 'lunch', description: 'עוף, אורז וסלט', calories: 780, proteinG: 55, carbsG: 80, fatG: 22,
  });

  // A few tasks (M6), some old enough to show the procrastination ladder.
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const noon = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  const base = { type: 'once', recurrence: null, owner: 'me', complexity: 'S', important: false, urgent: false, timing: null, scheduledAt: null, dueDate: null, status: 'open', firstStep: '', postponeCount: 0, doneAt: null, doneDates: [], stuckReason: null, startedAt: null, calendarEventId: null, source: 'manual' };
  const TASKS = [
    { title: 'לקבוע תור לספר', area: 'personal', timing: 'day', scheduledAt: noon(0), createdAt: daysAgo(1) },
    { title: 'להגיש דו"ח הוצאות', area: 'career', complexity: 'M', important: true, timing: 'day', scheduledAt: noon(0), dueDate: noon(1), firstStep: 'לאסוף את הקבלות', createdAt: daysAgo(3) },
    { title: 'לסדר את המטבח', type: 'daily', recurrence: { days: [0, 1, 2, 3, 4, 5, 6] }, area: 'personal', createdAt: daysAgo(10) },
    { title: 'לתקן את הקרש', complexity: 'M', area: 'personal', timing: 'claude', createdAt: daysAgo(9) },
    { title: 'לבדוק מסלול בקרן ההשתלמות', important: true, complexity: 'L', area: 'career', owner: 'shared', timing: null, createdAt: daysAgo(16) },
    { title: 'לסדר את המחסן', complexity: 'L', area: 'personal', timing: null, createdAt: daysAgo(23) },
    { title: 'להזמין מתנה לאמא', status: 'inbox', source: 'quick', createdAt: daysAgo(0) },
  ];
  const state = JSON.parse(localStorage.getItem('gym-dev-store') || '{}');
  state.tasks = TASKS.map((t, i) => ({ ...base, ...t, id: `task${i + 1}`, updatedAt: t.createdAt }));
  // A medium decision from 31 days ago, so "איך זה יצא?" (M6e) is due.
  state.decisions = [{
    id: 'dec1', question: 'לעבור לחדר כושר ליד העבודה?', track: 'medium', triage: { reversible: true, impact: 'some' },
    options: [{ id: 'o1', text: 'לעבור' }, { id: 'o2', text: 'להישאר' }], choiceId: 'o1', method: 'score',
    reason: 'חוסך חצי שעה ביום', feeling: 'happy', status: 'decided',
    startedAt: daysAgo(31), decidedAt: daysAgo(31), createdAt: daysAgo(31), updatedAt: daysAgo(31), source: 'manual',
  }];
  // Habits (M14b), so "היום" shows its closed "עוד … הרגלים" row and its
  // "אתמול" line: the three examples, one that isn't for today, one paused,
  // and two of them marked yesterday. Points count from yesterday, so the
  // first scoring pass gives that day its points.
  const yesterday = shiftKey(todayKey(), -1);
  const notToday = [(new Date().getDay() + 2) % 7, (new Date().getDay() + 4) % 7];
  const HABITS = [
    ...EXAMPLE_HABITS.map((h) => ({ ...h, source: 'example' })),
    { name: 'יוגה', icon: 'activity', area: 'body', schedule: { type: 'days', days: notToday }, measure: 'yesno', unit: '', full: null, short: null, autoSource: null, source: 'manual' },
    { name: 'מדיטציה', icon: 'sparkles', area: 'personal', schedule: { type: 'daily' }, measure: 'yesno', unit: '', full: null, short: null, autoSource: null, source: 'manual', active: false },
  ];
  state.habits = HABITS.map((h, i) => ({ active: true, ...h, id: `habit${i + 1}`, order: i, createdAt: daysAgo(10), updatedAt: daysAgo(10) }));
  state.habitLogs = [{
    id: yesterday,
    date: yesterday,
    habits: {
      habit1: { level: 'full', value: 10, source: 'manual' },
      habit3: { level: 'full', value: null, source: 'manual' },
    },
    updatedAt: daysAgo(1),
  }];
  state.user = { ...state.user, habitsSeeded: true, rewardsStartDate: yesterday };
  localStorage.setItem('gym-dev-store', JSON.stringify(state));
  console.info('[dev] seeded sandbox with', WORKOUTS.length, 'workouts');
}
