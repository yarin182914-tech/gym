// Workout types (js/lib/workout-types.js), their burn (js/lib/workout-kcal.js)
// and every reader of a workout's exercises: a session has no `sets`, and
// none of them may fall over on it. No libraries:
//   node tools/test-workout-types.mjs
// Exits non-zero if any case fails.

process.env.TZ = 'Asia/Jerusalem';

const T = await import('../js/lib/workout-types.js');
const K = await import('../js/lib/workout-kcal.js');
const { WORKOUTS, ACTIVITY } = await import('../js/lib/rules.js');
const { heaviestSet, buildWeightSeries } = await import('../js/lib/charts.js');
const { summarizeSegments, findCardioRecords } = await import('../js/lib/cardio.js');
const { setsTable, cardioTable, sessionTable } = await import('../js/ui/sets-table.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        got      ${a}`);
  }
}
function noThrow(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}\n        threw ${err.message}`);
  }
}

// ---------- fixtures ----------
const at = (iso) => new Date(iso);
const bench = {
  name: 'לחיצת חזה',
  category: 'חזה',
  sets: [
    { setNumber: 1, type: 'working', weight: 60, weightUnit: 'kg', weightMode: 'total', reps: 8, notes: '' },
    { setNumber: 2, type: 'working', weight: 65, weightUnit: 'kg', weightMode: 'total', reps: 6, notes: '' },
  ],
};
const pilates = {
  name: 'פילאטיס', category: 'אימון', kind: 'session', typeId: 'pilates',
  durationSec: 3000, rpe: 6, place: 'סטודיו', fields: { equipment: 'מכשירים', level: 'בינוני' }, notes: '',
};
const fran = (resultSec) => ({
  name: 'קרוספיט', category: 'אימון', kind: 'session', typeId: 'crossfit', durationSec: 2700, rpe: 9,
  fields: { wod: 'Fran', format: 'For Time', resultSec }, notes: '',
});
const outdoorRun = { name: 'ריצה', category: 'אירובי', kind: 'cardio', activity: 'run', inputMode: 'free', sets: [{ setNumber: 1, durationSec: 1800, distanceKm: 5 }] };
const treadmillWalk = { name: 'הליכה', category: 'אירובי', kind: 'cardio', activity: 'walk', inputMode: 'treadmill', sets: [{ setNumber: 1, durationSec: 3600, speedKmh: 5.5, inclinePct: 0 }] };
const bike = { name: 'אופניים', category: 'אירובי', kind: 'cardio', activity: 'bike', sets: [{ setNumber: 1, durationSec: 1800, level: 8 }] };

// Newest first, like listWorkouts().
const workouts = [
  { id: 'w3', date: at('2026-11-10T08:00:00'), startTime: at('2026-11-10T08:00:00'), endTime: at('2026-11-10T09:15:00'), noTime: false, exercises: [fran(300), bench] },
  { id: 'w2', date: at('2026-11-09T18:00:00'), startTime: at('2026-11-09T18:00:00'), endTime: at('2026-11-09T19:00:00'), noTime: false, exercises: [pilates] },
  { id: 'w1', date: at('2026-11-08T07:00:00'), startTime: at('2026-11-08T07:00:00'), endTime: at('2026-11-08T08:00:00'), noTime: false, exercises: [bench, outdoorRun] },
];

console.log('kinds');
check('strength (no kind)', T.exerciseKind(bench), 'strength');
check('cardio', T.exerciseKind(outdoorRun), 'cardio');
check('session', T.exerciseKind(pilates), 'session');

console.log('burn: MET × kg × hours');
check('rpe 5 = ×1', K.rpeFactor(5), 1);
check('rpe 10 = ×1.4', Math.round(K.rpeFactor(10) * 100) / 100, 1.4);
check('no rpe counts as the default', K.rpeFactor(null), K.rpeFactor(WORKOUTS.defaultRpe));
check('pilates 50 min, rpe 6, 70 kg', Math.round(K.sessionKcal(pilates, 70)), Math.round(3 * (0.6 + 0.08 * 6) * 70 * (3000 / 3600)));
check('custom type uses customMet', Math.round(K.sessionKcal({ typeId: 'custom:abc', durationSec: 3600, rpe: 5 }, 70)), WORKOUTS.customMet * 70);
check('session without a duration burns 0', K.sessionKcal({ typeId: 'yoga', rpe: 5 }, 70), 0);
check('outdoor run = 0 (already in steps)', K.cardioKcal(outdoorRun, 70), 0);
check('walk with no inputMode counts as outdoor = 0', K.cardioKcal({ ...outdoorRun, activity: 'walk', inputMode: undefined }, 70), 0);
check('treadmill walk 5.5 km/h 1h > 0 (ACSM ≈ 3.6 MET)', Math.round(K.cardioKcal(treadmillWalk, 70)), Math.round(((0.1 * (5.5 * 1000 / 60) + 3.5) / 3.5) * 70));
check('treadmill run without speed uses the effort table', Math.round(K.cardioKcal({ activity: 'run', inputMode: 'treadmill', sets: [{ durationSec: 3600, effort: 'hard' }] }, 70)), Math.round(11.5 * 70));
check('bike 30 min > 0', Math.round(K.cardioKcal(bike, 70)), Math.round(7 * 70 * 0.5));
check('strength 60 min ≈ 245 kcal at 70 kg', K.workoutKcal({ startTime: at('2026-11-10T08:00:00'), endTime: at('2026-11-10T09:00:00'), noTime: false, exercises: [bench] }, 70), 245);
check('strength without a time of day: minutes per set', K.strengthMinutes({ noTime: true, exercises: [bench] }), 2 * WORKOUTS.strengthMinPerSet);
check('mixed: strength time excludes the session', Math.round(K.strengthMinutes(workouts[0])), 75 - 45);
check('workout with a session only (no sets) has no strength part', K.strengthMinutes(workouts[1]), 0);

console.log('body weight');
const weights = [{ date: '2026-11-09', kg: 82 }, { date: '2026-11-01', kg: 83 }];
check('weigh-in on the day', K.bodyKgOn(weights, '2026-11-09'), 82);
check('latest one before the day', K.bodyKgOn(weights, '2026-11-05'), 83);
check('none before the day → 70', K.bodyKgOn(weights, '2026-10-01'), 70);
check('no weigh-ins at all → 70', K.bodyKgOn([], '2026-11-09'), 70);
check('the default lives in rules.js', WORKOUTS.defaultBodyKg, 70);

console.log('the day\'s total and dailyActivity');
check('day key is local', T.workoutDayKey({ startTime: at('2026-11-09T23:30:00+02:00') }), '2026-11-09');
check('saved kcal is used as it is', K.dayWorkoutKcal([{ ...workouts[1], kcal: 123 }], '2026-11-09', []), 123);
check('an older workout without kcal is worked out', K.dayWorkoutKcal(workouts, '2026-11-09', []), K.workoutKcal(workouts[1], 70));
check('strength + outdoor run: the run adds 0, its 30 min aren\'t strength', K.dayWorkoutKcal(workouts, '2026-11-08', []), Math.round(3.5 * 70 * 0.5));
const existing = { date: '2026-11-09', steps: 10000, baseKcal: 1950, stepsKcal: 400, workoutKcal: 310, totalOutKcal: 2660, note: 'x', source: 'shortcut' };
check('existing day: merge only workoutKcal and the total', K.workoutKcalPatch('2026-11-09', existing, 200), { merge: { workoutKcal: 200, totalOutKcal: 1950 + 400 + 200 } });
check('nothing changed → null', K.workoutKcalPatch('2026-11-09', existing, 310), null);
check('older doc without stepsKcal: from its steps', K.workoutKcalPatch('2026-11-09', { steps: 5000, baseKcal: 1950 }, 100), { merge: { workoutKcal: 100, totalOutKcal: 1950 + 200 + 100 } });
check('new day with burn: a whole doc', K.workoutKcalPatch('2026-11-09', null, 250).set, {
  date: '2026-11-09', steps: 0, baseKcal: ACTIVITY.baseKcal, stepsKcal: 0, workoutKcal: 250, totalOutKcal: ACTIVITY.baseKcal + 250, note: '', source: 'workouts',
});
check('new day, no burn (an outdoor walk) → nothing written', K.workoutKcalPatch('2026-11-09', null, 0), null);

console.log('saving and prefilling a session');
const crossfitType = T.resolveType('crossfit');
const values = { durationSec: 1500, rpe: 8, avgHr: null, place: '  ', fields: { wod: ' Fran ', format: 'For Time', resultSec: 290, resultRounds: 4, scale: '' }, notes: '' };
check('only what was entered; hidden fields dropped', T.sessionToSaved({ name: 'קרוספיט', typeId: 'crossfit', values }, crossfitType), {
  name: 'קרוספיט', category: 'אימון', kind: 'session', typeId: 'crossfit', durationSec: 1500, rpe: 8, fields: { wod: 'Fran', format: 'For Time', resultSec: 290 }, notes: '',
});
check('stations: empty rows dropped, weight a number', T.sessionToSaved({ name: 'פונקציונלי', typeId: 'functional', values: { fields: { stations: [{ name: 'סקוואט', amount: '12', weight: '20' }, { name: '', amount: '', weight: null }] } } }, T.resolveType('functional')).fields, { stations: [{ name: 'סקוואט', amount: '12', weight: 20 }] });
check('saved session → form values', T.valuesFromSaved(pilates), { durationSec: 3000, rpe: 6, avgHr: null, place: 'סטודיו', fields: { equipment: 'מכשירים', level: 'בינוני' }, notes: '' });
check('prefill keeps time/effort/fields, drops hr and notes', T.prefillFrom({ ...pilates, avgHr: 120, notes: 'כאב גב', fields: { ...pilates.fields, gone: 1 } }, T.resolveType('pilates')), {
  durationSec: 3000, rpe: 6, avgHr: null, place: 'סטודיו', fields: { equipment: 'מכשירים', level: 'בינוני' }, notes: '',
});
check('no last session → empty', T.prefillFrom(null, crossfitType), T.emptyValues());
check('last session of the type, newest first', T.sessionsOfType(workouts, 'crossfit').map((s) => s.workoutId), ['w3']);
check('the workout being edited is skipped', T.sessionsOfType(workouts, 'crossfit', 'w3'), []);

console.log('records');
const past = [{ ex: fran(320) }, { ex: fran(300) }];
check('Fran faster → record', T.brokenSessionRecord(fran(290), past), 'WOD Fran');
check('Fran slower → none', T.brokenSessionRecord(fran(310), past), null);
check('a tie is not a record', T.brokenSessionRecord(fran(300), past), null);
check('first time → none', T.brokenSessionRecord(fran(200), []), null);
check('WOD name ignores case and spaces', T.brokenSessionRecord({ ...fran(250), fields: { wod: ' fran', format: 'For Time', resultSec: 250 } }, past), 'WOD fran');
const amrap = (r, reps) => ({ typeId: 'crossfit', fields: { wod: 'Cindy', format: 'AMRAP', resultRounds: r, resultReps: reps } });
check('AMRAP: more rounds', T.brokenSessionRecord(amrap(15, 0), [{ ex: amrap(14, 20) }]), 'WOD Cindy');
check('AMRAP: same rounds, more reps', T.brokenSessionRecord(amrap(14, 21), [{ ex: amrap(14, 20) }]), 'WOD Cindy');
check('a different format is not compared', T.brokenSessionRecord(amrap(30, 0), past), null);
const fn = (format, rounds) => ({ typeId: 'functional', fields: { format, rounds } });
check('functional: more rounds in the same format', T.brokenSessionRecord(fn('AMRAP', 6), [{ ex: fn('AMRAP', 5) }, { ex: fn('מעגל', 9) }]), 'AMRAP — 6 סבבים');
check('functional: other format ignored', T.brokenSessionRecord(fn('מעגל', 6), [{ ex: fn('AMRAP', 5) }, { ex: fn('מעגל', 9) }]), null);

console.log('display');
check('summary line', T.sessionSummary(pilates, T.resolveType('pilates')).replace(/[⁨⁩]/g, ''), '50:00 · מאמץ 6 · מכשירים · בינוני');
check('summary parts are bidi-isolated', T.sessionSummary({ durationSec: 60 }, null), '⁨1:00⁩');
check('swim pace per 100 m', T.swimPaceSec({ durationSec: 1800, fields: { distanceM: 1500 } }), 120);
check('a deleted custom type keeps the saved name', T.resolveType('custom:gone', [], 'TRX').name, 'TRX');
check('custom type from its doc', T.resolveType('custom:a1', [{ id: 'a1', name: 'TRX', fields: [{ id: 'f1', kind: 'rounds', label: 'סבבים' }] }]).fields.length, 1);
check('picker lists 8 built-in types + the user\'s', T.typeLibrary([{ id: 'a1', name: 'TRX', fields: [] }]).map((e) => e.typeId).slice(-1), ['custom:a1']);

console.log('every reader, with a session that has no sets');
// firestore.js: "last time" and history (progress charts, strength records)
check('last performance skips a session of the same name', T.lastPerformanceIn([{ id: 'x', date: 1, exercises: [{ ...pilates, name: 'לחיצת חזה' }] }, workouts[2]], 'לחיצת חזה')?.sets.length, 2);
check('last performance of a session name → null, not a crash', T.lastPerformanceIn(workouts, 'פילאטיס'), null);
check('exercise history skips sessions and empty sets', T.exerciseHistoryIn([...workouts, { id: 'w0', date: 0, exercises: [{ name: 'לחיצת חזה', sets: [] }] }], 'לחיצת חזה').length, 2);
// charts.js (strength progress, the dashboard)
check('heaviest set of no sets → null', heaviestSet(undefined), null);
noThrow('weight series skips a point with no sets', () => buildWeightSeries([{ date: at('2026-11-01'), sets: [] }, { date: at('2026-11-02'), sets: bench.sets }]));
// dashboard.js (strength exercise list)
check('dashboard lists strength only', T.strengthNamesIn(workouts).names, ['לחיצת חזה']);
// history.js (labels, colours, calendar dots, detail tables)
const k3 = T.workoutKind(workouts[0]);
check('crossfit + strength', [k3.kind, k3.look, T.workoutLabel(k3)], ['strength', 'strength', 'קרוספיט + כוח']);
const k2 = T.workoutKind(workouts[1]);
check('pilates only: session kind, strength colour', [k2.kind, k2.look, T.workoutLabel(k2)], ['session', 'strength', 'פילאטיס']);
const kMix = T.workoutKind({ exercises: [pilates, outdoorRun] });
check('pilates + run', [kMix.kind, T.workoutLabel(kMix)], ['mixed', 'פילאטיס + ריצה']);
check('strength + run unchanged', T.workoutLabel(T.workoutKind(workouts[2])), 'כוח + ריצה');
noThrow('history tables render a session', () => sessionTable(pilates, T.resolveType('pilates')));
noThrow('sets table with no sets', () => setsTable(pilates.sets));
noThrow('cardio table with no sets', () => cardioTable({ activity: 'run' }));
// cardio.js / cardio-stats.js (cardio only, but its math must not trip on missing sets)
check('segment totals of nothing', summarizeSegments(undefined).durationSec, 0);
check('cardio records with a point missing sets', findCardioRecords('run', [{ date: at('2026-11-01') }]), []);
// planned-workout-card.js (the coach's plan → the workout)
check('plan: a session passes through without sets', T.planExercisesOut([pilates, { ...bench, sets: [{ weight: 50, reps: 5 }] }])[0].sets, undefined);
check('plan: strength sets renumbered', T.planExercisesOut([{ ...bench, sets: [{ weight: 50, reps: 5 }, { weight: 55, reps: 5 }] }])[0].sets.map((s) => s.setNumber), [1, 2]);
// workout-kcal.js (the burn reads every exercise)
noThrow('burn of a workout with a session and no sets anywhere', () => K.workoutKcal({ exercises: [pilates, { name: 'x' }] }, 70));
check('burn of a session-only workout', K.workoutKcal(workouts[1], 70), Math.round(K.sessionKcal(pilates, 70)));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
