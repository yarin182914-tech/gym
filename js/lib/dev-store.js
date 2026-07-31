// Local dev-mode data store — a drop-in stand-in for js/lib/firestore.js,
// used only until a real Firebase project is configured (see
// js/firebase-config.js `useCloud`). Persists to this browser's
// localStorage so the app is fully clickable/editable offline, with no
// login required. None of this syncs across devices — that's what the
// real Firestore-backed functions do once Firebase is wired up.

const KEY = 'gym-dev-store';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt/blocked storage falls through to defaults */ }
  return { user: { displayName: 'מצב פיתוח', weddingDate: null }, workouts: [], exerciseLibrary: [], nutritionEntries: [], plans: [] };
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID();
}

export async function devEnsureUserDoc() { /* no-op: load() already seeds a default user */ }

export async function devCreateWorkout(workout) {
  const state = load();
  const id = uid();
  state.workouts.unshift({
    id,
    date: workout.date instanceof Date ? workout.date.toISOString() : new Date().toISOString(),
    startTime: workout.startTime instanceof Date ? workout.startTime.toISOString() : new Date().toISOString(),
    endTime: workout.endTime instanceof Date ? workout.endTime.toISOString() : null,
    notes: workout.notes ?? '',
    exercises: workout.exercises ?? [],
  });
  save(state);
  return id;
}

export async function devDeleteWorkout(workoutId) {
  const state = load();
  state.workouts = state.workouts.filter((x) => x.id !== workoutId);
  save(state);
}

export async function devListWorkouts(max = 100) {
  const state = load();
  return [...state.workouts]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, max);
}

export async function devListExerciseLibrary() {
  return load().exerciseLibrary;
}

export async function devAddExerciseToLibrary(exercise) {
  const state = load();
  const id = uid();
  state.exerciseLibrary.push({
    id,
    name: exercise.name,
    category: exercise.category ?? '',
    defaultUnit: exercise.defaultUnit ?? 'kg',
    defaultWeightMode: exercise.defaultWeightMode ?? 'total',
    isCustom: exercise.isCustom ?? true,
  });
  save(state);
  return id;
}

// Renames the library entry and every past workout's matching exercise
// name/category in one pass — the point is a single continuous PR history,
// not a library-only relabel that fragments History/Dashboard at the rename.
export async function devRenameExerciseEverywhere(libraryId, oldName, newName, newCategory) {
  const state = load();
  const lib = state.exerciseLibrary.find((e) => e.id === libraryId);
  if (lib) {
    lib.name = newName;
    lib.category = newCategory;
  }
  let updated = 0;
  state.workouts.forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (ex.name === oldName) {
        ex.name = newName;
        ex.category = newCategory;
        updated += 1;
      }
    });
  });
  save(state);
  return { updatedWorkoutExercises: updated };
}

// Removes only the library (quick-pick) entry — past workout records are
// left untouched, since purging real training history is a separate,
// far more destructive action than tidying up the exercise list.
export async function devDeleteExerciseFromLibrary(libraryId) {
  const state = load();
  state.exerciseLibrary = state.exerciseLibrary.filter((e) => e.id !== libraryId);
  save(state);
}

export async function devAddNutritionEntry(entry) {
  const state = load();
  const id = uid();
  state.nutritionEntries.unshift({
    id,
    date: entry.date instanceof Date ? entry.date.toISOString() : new Date().toISOString(),
    mealType: entry.mealType ?? 'snack',
    description: entry.description ?? '',
    calories: entry.calories ?? 0,
    proteinG: entry.proteinG ?? 0,
    carbsG: entry.carbsG ?? 0,
    fatG: entry.fatG ?? 0,
    source: entry.source ?? 'manual',
  });
  save(state);
  return id;
}

export async function devListNutritionEntries(max = 200) {
  const state = load();
  return [...state.nutritionEntries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, max);
}

