// Sample data for the local sandbox (`?dev` on localhost) so History,
// Dashboard and the "previous performance" popup have something to render.
// Loaded via dynamic import from app.js and therefore never fetched in
// production. Writes only to the dev-store's localStorage key.
import { listWorkouts, createWorkout, addExerciseToLibrary, seedExerciseLibraryIfEmpty } from '../lib/firestore.js';

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
  console.info('[dev] seeded sandbox with', WORKOUTS.length, 'workouts');
}
