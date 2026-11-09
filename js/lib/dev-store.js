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
  return { user: { displayName: 'מצב פיתוח', weddingDate: null }, workouts: [], exerciseLibrary: [], nutritionEntries: [], plans: [], feedback: [], bodyWeights: [] };
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID();
}

export async function devEnsureUserDoc() { /* no-op: load() already seeds a default user */ }

export async function devGetUserSettings() {
  return load().user || {};
}

export async function devUpdateUserSettings(patch) {
  const state = load();
  state.user = { ...state.user, ...patch };
  save(state);
}

export async function devCreateWorkout(workout) {
  const state = load();
  const id = uid();
  state.workouts.unshift({
    id,
    date: workout.date instanceof Date ? workout.date.toISOString() : new Date().toISOString(),
    startTime: workout.startTime instanceof Date ? workout.startTime.toISOString() : new Date().toISOString(),
    endTime: workout.endTime instanceof Date ? workout.endTime.toISOString() : null,
    noTime: !!workout.noTime,
    notes: workout.notes ?? '',
    exercises: workout.exercises ?? [],
    ...(workout.planId ? { planId: workout.planId } : {}),
  });
  save(state);
  return id;
}

export async function devUpdateWorkout(workoutId, patch) {
  const state = load();
  const w = state.workouts.find((x) => x.id === workoutId);
  if (!w) throw new Error('Workout not found');
  for (const [key, value] of Object.entries(patch)) {
    w[key] = value instanceof Date ? value.toISOString() : value;
  }
  save(state);
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

export async function devUpdateNutritionEntry(id, patch) {
  const state = load();
  const e = state.nutritionEntries.find((x) => x.id === id);
  if (!e) return;
  for (const [key, value] of Object.entries(patch)) {
    e[key] = value instanceof Date ? value.toISOString() : value;
  }
  save(state);
}

export async function devDeleteNutritionEntry(id) {
  const state = load();
  state.nutritionEntries = state.nutritionEntries.filter((x) => x.id !== id);
  save(state);
}

export async function devListNutritionEntries(max = 200) {
  const state = load();
  return [...state.nutritionEntries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, max);
}

export async function devSetBodyWeight(dateKey, { kg, note = '' }) {
  const state = load();
  if (!state.bodyWeights) state.bodyWeights = []; // localStorage blobs saved before this field existed
  state.bodyWeights = state.bodyWeights.filter((w) => w.id !== dateKey);
  state.bodyWeights.push({ id: dateKey, date: dateKey, kg, note, loggedAt: new Date().toISOString() });
  save(state);
}

export async function devDeleteBodyWeight(dateKey) {
  const state = load();
  state.bodyWeights = (state.bodyWeights || []).filter((w) => w.id !== dateKey);
  save(state);
}

export async function devListBodyWeights(max = 400) {
  const state = load();
  return [...(state.bodyWeights || [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, max);
}

export async function devSetDailyActivity(dateKey, data) {
  const state = load();
  state.dailyActivity = (state.dailyActivity || []).filter((a) => a.id !== dateKey);
  state.dailyActivity.push({ ...data, id: dateKey, date: dateKey, loggedAt: new Date().toISOString() });
  save(state);
}

export async function devListDailyActivity(max = 60) {
  const state = load();
  return [...(state.dailyActivity || [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, max);
}

export async function devSetSleep(dateKey, data, { isNew = false } = {}) {
  const state = load();
  state.sleep = state.sleep || [];
  const existing = state.sleep.find((s) => s.id === dateKey);
  const now = new Date().toISOString();
  const entry = {
    ...(existing || {}),
    id: dateKey,
    date: dateKey,
    bedtime: data.bedtime.toISOString(),
    wakeTime: data.wakeTime.toISOString(),
    durationMin: data.durationMin,
    source: data.source,
    updatedAt: now,
    ...(isNew || !existing ? { createdAt: now } : {}),
  };
  state.sleep = state.sleep.filter((s) => s.id !== dateKey).concat(entry);
  save(state);
}

export async function devDeleteSleep(dateKey) {
  const state = load();
  state.sleep = (state.sleep || []).filter((s) => s.id !== dateKey);
  save(state);
}

export async function devListSleep(max = 60) {
  return [...(load().sleep || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, max);
}

export function devNewHabitId() {
  return uid();
}

export async function devSetHabit(habitId, data, { isNew = false } = {}) {
  const state = load();
  state.habits = state.habits || [];
  const existing = state.habits.find((h) => h.id === habitId);
  const now = new Date().toISOString();
  const entry = { ...(existing || {}), ...data, id: habitId, updatedAt: now, ...(isNew || !existing ? { createdAt: now } : {}) };
  state.habits = state.habits.filter((h) => h.id !== habitId).concat(entry);
  save(state);
}

export async function devDeleteHabit(habitId) {
  const state = load();
  state.habits = (state.habits || []).filter((h) => h.id !== habitId);
  save(state);
}

export async function devListHabits() {
  return [...(load().habits || [])];
}

// mark: { level, value, source } or null to clear the habit's day.
export async function devSetHabitMark(dateKey, habitId, mark) {
  const state = load();
  state.habitLogs = state.habitLogs || [];
  const day = state.habitLogs.find((l) => l.id === dateKey) || { id: dateKey, date: dateKey, habits: {} };
  const habits = { ...day.habits };
  if (mark) habits[habitId] = mark;
  else delete habits[habitId];
  state.habitLogs = state.habitLogs.filter((l) => l.id !== dateKey).concat({ ...day, habits, updatedAt: new Date().toISOString() });
  save(state);
}

export async function devListHabitLogs(max = 120) {
  return [...(load().habitLogs || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, max);
}

// Seeded by hand in dev (localStorage 'gym-dev-store' → plannedWorkouts:
// [{ id: 'yyyy-mm-dd', date, title, ... }]), the way the coach writes them.
export async function devGetPlannedWorkout(dateKey) {
  const found = (load().plannedWorkouts || []).find((p) => p.id === dateKey);
  return found ? { ...found } : null;
}

export async function devUpdatePlannedWorkout(dateKey, patch) {
  const state = load();
  const p = (state.plannedWorkouts || []).find((x) => x.id === dateKey);
  if (!p) throw new Error('No such planned workout');
  Object.assign(p, patch, { updatedAt: new Date().toISOString() });
  save(state);
}

// ---------- site feedback (shared board — see firestore.js for why this
// isn't scoped under the user, unlike everything above) ----------

export async function devCreateFeedback({ text, author, category, authorUid }) {
  const state = load();
  if (!state.feedback) state.feedback = []; // localStorage blobs saved before this field existed
  const id = uid();
  const now = new Date().toISOString();
  state.feedback.unshift({
    id,
    text: text ?? '',
    author: author ?? '',
    authorUid: authorUid ?? null,
    category: category ?? 'other',
    status: 'new',
    createdAt: now,
    updatedAt: now,
  });
  save(state);
  return id;
}

export async function devListFeedback(max = 200) {
  const state = load();
  return [...(state.feedback || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, max);
}

export async function devUpdateFeedback(feedbackId, patch) {
  const state = load();
  if (!state.feedback) state.feedback = [];
  const item = state.feedback.find((f) => f.id === feedbackId);
  if (item) {
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    save(state);
  }
}

export async function devDeleteFeedback(feedbackId) {
  const state = load();
  state.feedback = (state.feedback || []).filter((f) => f.id !== feedbackId);
  save(state);
}

