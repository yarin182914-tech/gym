import {
  collection, doc, setDoc as rawSetDoc, getDoc, getDocs, updateDoc as rawUpdateDoc, deleteDoc as rawDeleteDoc,
  query, orderBy, limit, where, serverTimestamp, deleteField,
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';
import { db, useCloud } from '../firebase-config.js';
import { currentUid } from '../auth.js';
import {
  devEnsureUserDoc, devGetUserSettings, devUpdateUserSettings, devCreateWorkout, devUpdateWorkout, devDeleteWorkout, devListWorkouts,
  devListExerciseLibrary, devAddExerciseToLibrary,
  devRenameExerciseEverywhere, devDeleteExerciseFromLibrary,
  devAddNutritionEntry, devListNutritionEntries, devUpdateNutritionEntry, devDeleteNutritionEntry,
  devSetBodyWeight, devListBodyWeights, devDeleteBodyWeight,
  devSetDailyActivity, devGetDailyActivity, devMergeDailyActivity, devListDailyActivity,
  devGetPlannedWorkout, devUpdatePlannedWorkout,
  devSetSleep, devListSleep, devDeleteSleep,
  devNewHabitId, devSetHabit, devDeleteHabit, devListHabits, devSetHabitMark, devListHabitLogs,
  devCreateFeedback, devListFeedback, devUpdateFeedback, devDeleteFeedback,
  devListWorkoutTypes, devAddWorkoutType, devUpdateWorkoutType, devDeleteWorkoutType,
} from './dev-store.js';
import { lastPerformanceIn, exerciseHistoryIn, workoutDayKey } from './workout-types.js';
import { bodyKgOn as bodyKgFrom, dayWorkoutKcal, workoutKcalPatch } from './workout-kcal.js';
import { normalizeExerciseName, findByName } from './exercise-names.js';
import { WRITE_WAIT_MS } from './rules.js';

// Writes land in the persistent local cache at once and sync by themselves,
// but Firestore's promise waits for the server. On weak signal that froze
// every save button (feedback 1.11 "לא עובד חלק באינטרנט חלש"), so a write
// counts as done once the server answers or WRITE_WAIT_MS passes, whichever
// comes first. A real failure is still logged.
function settle(write) {
  write.catch((err) => console.error('[firestore] write failed', err));
  return Promise.race([write, new Promise((r) => setTimeout(r, WRITE_WAIT_MS))]);
}
const setDoc = (...args) => settle(rawSetDoc(...args));
const updateDoc = (...args) => settle(rawUpdateDoc(...args));
const deleteDoc = (...args) => settle(rawDeleteDoc(...args));
// The id is made on the device, so a new doc doesn't wait for the server.
const addDoc = (colRef, data) => {
  const ref = doc(colRef);
  return setDoc(ref, data).then(() => ref);
};

function uidOrThrow() {
  const uid = currentUid();
  if (!uid) throw new Error('No authenticated user');
  return uid;
}

// ---------- users/{uid} ----------

export async function ensureUserDoc() {
  if (!useCloud) return devEnsureUserDoc();
  const uid = uidOrThrow();
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: '',
      weddingDate: null,
      createdAt: serverTimestamp(),
    });
  }
  return ref;
}

// Settings kept on users/{uid} itself, e.g. calorieTarget — read by the
// app, and by anything else writing for the user (see docs/DATA.md).
export async function getUserSettings() {
  if (!useCloud) return devGetUserSettings();
  const snap = await getDoc(doc(db, 'users', uidOrThrow()));
  return snap.exists() ? snap.data() : {};
}

export async function updateUserSettings(patch) {
  if (!useCloud) return devUpdateUserSettings(patch);
  await setDoc(doc(db, 'users', uidOrThrow()), patch, { merge: true });
}

// ---------- workouts ----------

export async function createWorkout(workout) {
  try {
    if (!useCloud) return await devCreateWorkout(workout);
    const uid = uidOrThrow();
    const ref = collection(db, 'users', uid, 'workouts');
    const docRef = await addDoc(ref, {
      date: workout.date ?? serverTimestamp(),
      startTime: workout.startTime ?? serverTimestamp(),
      endTime: workout.endTime ?? null,
      noTime: !!workout.noTime,
      notes: workout.notes ?? '',
      exercises: workout.exercises ?? [],
      // Burn worked out at save (js/lib/workout-kcal.js).
      ...(Number.isFinite(workout.kcal) ? { kcal: workout.kcal } : {}),
      // Started from the coach's plan for that day (plannedWorkouts doc id).
      ...(workout.planId ? { planId: workout.planId } : {}),
    });
    return docRef.id;
  } finally {
    invalidateWorkouts();
    syncWorkoutKcal([workout.startTime || workout.date ? workoutDayKey(workout) : null]);
  }
}

// `patch` is any subset of the workout's fields — used when a finished
// workout is reopened from History and saved again.
export async function updateWorkout(workoutId, patch) {
  const before = await dayOfWorkout(workoutId);
  try {
    if (!useCloud) return await devUpdateWorkout(workoutId, patch);
    const uid = uidOrThrow();
    await updateDoc(doc(db, 'users', uid, 'workouts', workoutId), patch);
  } finally {
    invalidateWorkouts();
    // A date change moves the burn from one day to the other.
    syncWorkoutKcal([before, patch.startTime || patch.date ? workoutDayKey(patch) : null]);
  }
}

export async function deleteWorkout(workoutId) {
  const before = await dayOfWorkout(workoutId);
  try {
    if (!useCloud) return await devDeleteWorkout(workoutId);
    const uid = uidOrThrow();
    await deleteDoc(doc(db, 'users', uid, 'workouts', workoutId));
  } finally {
    invalidateWorkouts();
    syncWorkoutKcal([before]);
  }
}

// The day a saved workout counts for, from the cached list — null if it
// isn't there (or the list can't be read).
async function dayOfWorkout(workoutId) {
  try {
    const w = (await allWorkouts()).find((x) => x.id === workoutId);
    return w ? workoutDayKey(w) : null;
  } catch {
    return null;
  }
}

// ---------- workout burn → dailyActivity.workoutKcal ----------
// The app is the only writer of workoutKcal: after every workout save,
// edit or delete, each day touched gets the sum of its workouts' kcal
// (js/lib/workout-kcal.js), keeping the doc's steps, base and note. Not
// awaited by the screens — offline, the write waits in Firestore's queue.
export function syncWorkoutKcal(dateKeys) {
  const keys = [...new Set((dateKeys || []).filter(Boolean))];
  return Promise.all(keys.map(async (key) => {
    try {
      const [workouts, weights, existing] = await Promise.all([
        allWorkouts(), weighInUpTo(key), getDailyActivity(key),
      ]);
      const patch = workoutKcalPatch(key, existing, dayWorkoutKcal(workouts, key, weights));
      if (patch?.set) await setDailyActivity(key, patch.set);
      else if (patch?.merge) await mergeDailyActivity(key, patch.merge, { stamp: false });
    } catch (err) {
      console.error('[workout-kcal] day sync failed', key, err);
    }
  }));
}

// Every workout read in the app goes through one cached fetch.
//
// Before this, each derived query re-fetched the whole collection: the
// dashboard's personal-records list called getExerciseHistory once per
// exercise, in parallel, and each of those pulled 500 documents — roughly
// 16,000 document reads to draw one screen, repeated on every toggle.
//
// The cache holds the *promise*, not the resolved array, so callers that fire
// concurrently all await the same in-flight request instead of starting their
// own. Writes clear it; a failed fetch is never cached.
const WORKOUT_FETCH_LIMIT = 500;
let workoutsPromise = null;

function invalidateWorkouts() {
  workoutsPromise = null;
}

function allWorkouts() {
  if (!workoutsPromise) {
    workoutsPromise = fetchWorkouts().catch((err) => {
      workoutsPromise = null;
      throw err;
    });
  }
  return workoutsPromise;
}

async function fetchWorkouts() {
  if (!useCloud) return devListWorkouts(WORKOUT_FETCH_LIMIT);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'workouts');
  const q = query(ref, orderBy('date', 'desc'), limit(WORKOUT_FETCH_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Newest first.
export async function listWorkouts(max = 100) {
  const workouts = await allWorkouts();
  return max >= workouts.length ? workouts : workouts.slice(0, max);
}

// Most recent prior workout that logged this exercise, so the Active
// Session screen can show a "previous" value per set.
// excludeWorkoutId: a workout reopened for editing must not count as its
// own "last time" or history.
// Sessions (no sets) are skipped — js/lib/workout-types.js.
export async function getLastPerformance(exerciseName, excludeWorkoutId = null) {
  return lastPerformanceIn(await allWorkouts(), exerciseName, excludeWorkoutId);
}

// All sets ever logged for an exercise, oldest first — used for progress
// charts and personal-record calculation.
export async function getExerciseHistory(exerciseName, excludeWorkoutId = null) {
  return exerciseHistoryIn(await allWorkouts(), exerciseName, excludeWorkoutId);
}

// ---------- workout types of the user's own ----------
// users/{uid}/workoutTypes/{auto}: { name, fields: [{ id, kind, label,
// options? }], order, createdAt } — see js/lib/workout-types.js.

export async function listWorkoutTypes() {
  if (!useCloud) return devListWorkoutTypes();
  const snap = await getDocs(collection(db, 'users', uidOrThrow(), 'workoutTypes'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function addWorkoutType(type) {
  if (!useCloud) return devAddWorkoutType(type);
  const ref = await addDoc(collection(db, 'users', uidOrThrow(), 'workoutTypes'), {
    ...type,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorkoutType(typeDocId, patch) {
  if (!useCloud) return devUpdateWorkoutType(typeDocId, patch);
  await updateDoc(doc(db, 'users', uidOrThrow(), 'workoutTypes', typeDocId), patch);
}

// Workouts already logged with it keep their values; History shows them
// under the saved name.
export async function deleteWorkoutType(typeDocId) {
  if (!useCloud) return devDeleteWorkoutType(typeDocId);
  await deleteDoc(doc(db, 'users', uidOrThrow(), 'workoutTypes', typeDocId));
}

// ---------- exercise library ----------

export async function listExerciseLibrary() {
  if (!useCloud) return devListExerciseLibrary();
  const uid = uidOrThrow();
  const snap = await getDocs(collection(db, 'users', uid, 'exerciseLibrary'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// One entry per name: a name that already exists (spaces and case
// ignored) returns that entry's id instead of adding a second one.
export async function addExerciseToLibrary(exercise) {
  const name = normalizeExerciseName(exercise.name);
  const existing = findByName(await listExerciseLibrary(), name);
  if (existing) return existing.id;
  if (!useCloud) return devAddExerciseToLibrary({ ...exercise, name });
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'exerciseLibrary');
  const docRef = await addDoc(ref, {
    name,
    category: exercise.category ?? '',
    defaultUnit: exercise.defaultUnit ?? 'kg',
    defaultWeightMode: exercise.defaultWeightMode ?? 'total',
    isCustom: exercise.isCustom ?? true,
  });
  return docRef.id;
}

// Renames the library entry and every past workout's matching exercise
// name/category in one pass — the point is a single continuous PR history
// across History/Dashboard, not a library-only relabel that leaves old
// workouts stuck under the previous name.
export async function renameExerciseEverywhere(libraryId, oldName, newName, newCategory) {
  try {
    if (!useCloud) return await devRenameExerciseEverywhere(libraryId, oldName, newName, newCategory);
    const uid = uidOrThrow();
    if (libraryId) {
      await updateDoc(doc(db, 'users', uid, 'exerciseLibrary', libraryId), { name: newName, category: newCategory });
    }
    const workouts = await allWorkouts();
    for (const w of workouts) {
      const exercises = w.exercises || [];
      let changed = false;
      const updatedExercises = exercises.map((ex) => {
        if (ex.name !== oldName) return ex;
        changed = true;
        return { ...ex, name: newName, category: newCategory };
      });
      if (changed) {
        await updateDoc(doc(db, 'users', uid, 'workouts', w.id), { exercises: updatedExercises });
      }
    }
  } finally {
    invalidateWorkouts();
  }
}

// Removes only the library (quick-pick) entry — past workout records are
// left untouched, since purging real training history is a separate, far
// more destructive action than tidying up the exercise list.
export async function deleteExerciseFromLibrary(libraryId) {
  if (!useCloud) return devDeleteExerciseFromLibrary(libraryId);
  const uid = uidOrThrow();
  await deleteDoc(doc(db, 'users', uid, 'exerciseLibrary', libraryId));
}

// The 7 muscle categories Yarin organizes his training around, grouped into
// the two workout types he actually trains (Push / Pull day). Shared by the
// Active Session exercise picker and the Dashboard's Personal Records list.
export const CATEGORY_GROUPS = [
  { label: 'פוש', categories: ['חזה', 'כתפיים', 'יד אחורית', 'בטן'] },
  { label: 'פול', categories: ['גב', 'רגליים', 'יד קדמית'] },
];

export const DEFAULT_EXERCISES = [
  { name: 'סקוואט', category: 'רגליים', defaultWeightMode: 'total' },
  { name: 'לחיצת חזה', category: 'חזה', defaultWeightMode: 'total' },
  { name: 'דדליפט', category: 'גב', defaultWeightMode: 'perSide' },
  { name: 'מתח', category: 'גב', defaultWeightMode: 'total' },
  { name: 'לחיצת כתפיים', category: 'כתפיים', defaultWeightMode: 'total' },
  { name: 'תלישה', category: 'רגליים', defaultWeightMode: 'total' },
  { name: 'פשיטת מרפק (טרייספס)', category: 'יד אחורית', defaultWeightMode: 'total' },
  { name: 'כפיפת מרפק (בייספס)', category: 'יד קדמית', defaultWeightMode: 'perSide' },
  { name: 'הרחקת כתפיים (דמבל)', category: 'כתפיים', defaultWeightMode: 'perSide' },
  { name: 'חתירה בישיבה', category: 'גב', defaultWeightMode: 'total' },
];

export async function seedExerciseLibraryIfEmpty() {
  const existing = await listExerciseLibrary();
  if (existing.length > 0) return;
  for (const ex of DEFAULT_EXERCISES) {
    await addExerciseToLibrary({ ...ex, isCustom: false });
  }
}

// ---------- nutrition ----------

export async function addNutritionEntry(entry) {
  if (!useCloud) return devAddNutritionEntry(entry);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'nutritionEntries');
  const docRef = await addDoc(ref, {
    date: entry.date ?? serverTimestamp(),
    mealType: entry.mealType ?? 'snack',
    description: entry.description ?? '',
    calories: entry.calories ?? 0,
    proteinG: entry.proteinG ?? 0,
    carbsG: entry.carbsG ?? 0,
    fatG: entry.fatG ?? 0,
    source: entry.source ?? 'manual',
  });
  return docRef.id;
}

export async function updateNutritionEntry(entryId, patch) {
  if (!useCloud) return devUpdateNutritionEntry(entryId, patch);
  await updateDoc(doc(db, 'users', uidOrThrow(), 'nutritionEntries', entryId), patch);
}

export async function deleteNutritionEntry(entryId) {
  if (!useCloud) return devDeleteNutritionEntry(entryId);
  await deleteDoc(doc(db, 'users', uidOrThrow(), 'nutritionEntries', entryId));
}

export async function listNutritionEntries(max = 200) {
  if (!useCloud) return devListNutritionEntries(max);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'nutritionEntries');
  const q = query(ref, orderBy('date', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- body weight ----------
// One document per calendar day, keyed by its local yyyy-mm-dd (also kept
// as the `date` field, for ordering) — weighing in again the same day
// overwrites that day's entry instead of adding a second one.

export async function setBodyWeight(dateKey, { kg, note = '' }) {
  if (!useCloud) return devSetBodyWeight(dateKey, { kg, note });
  const uid = uidOrThrow();
  await setDoc(doc(db, 'users', uid, 'bodyWeight', dateKey), {
    date: dateKey,
    kg,
    note,
    loggedAt: serverTimestamp(),
  });
}

export async function deleteBodyWeight(dateKey) {
  if (!useCloud) return devDeleteBodyWeight(dateKey);
  await deleteDoc(doc(db, 'users', uidOrThrow(), 'bodyWeight', dateKey));
}

// The weight a workout's burn is worked out with: the latest weigh-in on or
// before its day, or the default (js/lib/workout-kcal.js#bodyKgOn).
export async function bodyKgOn(dateKey) {
  return bodyKgFrom(await weighInUpTo(dateKey), dateKey);
}

// The latest weigh-in on or before the day, as a list of at most one.
async function weighInUpTo(dateKey) {
  if (!useCloud) return (await devListBodyWeights(1000)).filter((w) => w.date <= dateKey).slice(0, 1);
  const ref = collection(db, 'users', uidOrThrow(), 'bodyWeight');
  const snap = await getDocs(query(ref, where('date', '<=', dateKey), orderBy('date', 'desc'), limit(1)));
  return snap.docs.map((d) => d.data());
}

// Newest day first.
export async function listBodyWeights(max = 400) {
  if (!useCloud) return devListBodyWeights(max);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'bodyWeight');
  const q = query(ref, orderBy('date', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- daily activity (calories out) ----------
// Like body weight: one document per local day, keyed yyyy-mm-dd, so saving
// a day again replaces it. Built by buildActivity() in daily-activity.js.

export async function setDailyActivity(dateKey, data) {
  if (!useCloud) return devSetDailyActivity(dateKey, data);
  const uid = uidOrThrow();
  await setDoc(doc(db, 'users', uid, 'dailyActivity', dateKey), {
    ...data,
    date: dateKey,
    loggedAt: serverTimestamp(),
  });
}

// One day's doc, or null.
export async function getDailyActivity(dateKey) {
  if (!useCloud) return devGetDailyActivity(dateKey);
  const snap = await getDoc(doc(db, 'users', uidOrThrow(), 'dailyActivity', dateKey));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Updates only the given fields and keeps the rest (note, workoutKcal…) —
// the steps import (js/lib/steps-import.js#mergeSteps) and the workout
// burn. stamp: false leaves loggedAt alone, so a workout save doesn't pass
// for the iPhone's last sync on the "חיבורים" screen.
export async function mergeDailyActivity(dateKey, data, { stamp = true } = {}) {
  if (!useCloud) return devMergeDailyActivity(dateKey, data, { stamp });
  await setDoc(doc(db, 'users', uidOrThrow(), 'dailyActivity', dateKey), {
    ...data,
    date: dateKey,
    ...(stamp ? { loggedAt: serverTimestamp() } : {}),
  }, { merge: true });
}

// Newest day first.
export async function listDailyActivity(max = 60) {
  if (!useCloud) return devListDailyActivity(max);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'dailyActivity');
  const q = query(ref, orderBy('date', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- sleep ----------
// One document per night, keyed by its MORNING's local date (yyyy-mm-dd);
// saving the night again replaces it. See docs/DATA.md and js/lib/sleep.js.
// isNew: stamp createdAt (kept as it was on later edits).

export async function setSleep(dateKey, { bedtime, wakeTime, durationMin, source = 'manual' }, { isNew = false } = {}) {
  if (!useCloud) return devSetSleep(dateKey, { bedtime, wakeTime, durationMin, source }, { isNew });
  await setDoc(doc(db, 'users', uidOrThrow(), 'sleep', dateKey), {
    date: dateKey,
    bedtime,
    wakeTime,
    durationMin,
    source,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }, { merge: true });
}

export async function deleteSleep(dateKey) {
  if (!useCloud) return devDeleteSleep(dateKey);
  await deleteDoc(doc(db, 'users', uidOrThrow(), 'sleep', dateKey));
}

// Newest night first.
export async function listSleep(max = 60) {
  if (!useCloud) return devListSleep(max);
  const ref = collection(db, 'users', uidOrThrow(), 'sleep');
  const snap = await getDocs(query(ref, orderBy('date', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- habits ----------
// The habits themselves (users/{uid}/habits/{auto}) and one log doc per
// local day (users/{uid}/habitLogs/{yyyy-mm-dd}, map habitId → mark). See
// docs/DATA.md and js/lib/habits.js.
//
// These writes are NOT meant to be awaited by the UI: Firestore applies
// them to the local cache (and every later read) at once, but the promise
// only settles when the server has them — offline, that's whenever the
// connection comes back. Callers update the screen right away and only
// .catch() the promise.

// An id for a new habit, so the screen can show it before the write lands.
export function newHabitId() {
  if (!useCloud) return devNewHabitId();
  return doc(collection(db, 'users', uidOrThrow(), 'habits')).id;
}

// isNew: stamp createdAt (kept as it was on later edits).
export function setHabit(habitId, data, { isNew = false } = {}) {
  if (!useCloud) return devSetHabit(habitId, data, { isNew });
  return setDoc(doc(db, 'users', uidOrThrow(), 'habits', habitId), {
    ...data,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }, { merge: true });
}

// Its marks stay in habitLogs — harmless, and never shown without the habit.
export function deleteHabit(habitId) {
  if (!useCloud) return devDeleteHabit(habitId);
  return deleteDoc(doc(db, 'users', uidOrThrow(), 'habits', habitId));
}

export async function listHabits() {
  if (!useCloud) return devListHabits();
  const snap = await getDocs(collection(db, 'users', uidOrThrow(), 'habits'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// One habit's mark for one day — { level, value, source }, or null to clear
// it. Touches only that habit's key, so other habits' marks that day (the
// coach's included) are left alone. The whole mark is always written, so
// nothing from an earlier mark (an old value) survives the merge.
export function setHabitMark(dateKey, habitId, mark) {
  if (!useCloud) return devSetHabitMark(dateKey, habitId, mark);
  return setDoc(doc(db, 'users', uidOrThrow(), 'habitLogs', dateKey), {
    date: dateKey,
    habits: { [habitId]: mark ?? deleteField() },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Newest day first.
export async function listHabitLogs(max = 120) {
  if (!useCloud) return devListHabitLogs(max);
  const ref = collection(db, 'users', uidOrThrow(), 'habitLogs');
  const snap = await getDocs(query(ref, orderBy('date', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- planned workouts ----------
// The coach's proposed workout for a day, written from outside the app (see
// docs/DATA.md) — one document per local day, keyed yyyy-mm-dd. The app
// only reads it and moves its status along (proposed → started → done, or
// skipped).

export async function getPlannedWorkout(dateKey) {
  if (!useCloud) return devGetPlannedWorkout(dateKey);
  const snap = await getDoc(doc(db, 'users', uidOrThrow(), 'plannedWorkouts', dateKey));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updatePlannedWorkout(dateKey, patch) {
  if (!useCloud) return devUpdatePlannedWorkout(dateKey, patch);
  await updateDoc(doc(db, 'users', uidOrThrow(), 'plannedWorkouts', dateKey), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

// ---------- site feedback ----------
// A shared board, not per-user data — unlike everything above this, these
// documents live at the top-level siteFeedback/ collection instead of under
// users/{uid}/, so every signed-in user reads and writes the same list. See
// firestore.rules for the matching access rule. Deliberately no query
// caching like allWorkouts() below has: that exists to stop one screen from
// re-fetching the same collection dozens of times in parallel (Dashboard's
// PR list did exactly that), which doesn't apply here — this is read once
// per page visit by the one screen that shows it.

export async function createFeedback({ text, author, category }) {
  if (!useCloud) return devCreateFeedback({ text, author, category, authorUid: currentUid() });
  const uid = uidOrThrow();
  const ref = collection(db, 'siteFeedback');
  const docRef = await addDoc(ref, {
    text: text ?? '',
    author: author ?? '',
    authorUid: uid,
    category: category ?? 'other',
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

// Newest first.
export async function listFeedback(max = 200) {
  if (!useCloud) return devListFeedback(max);
  const ref = collection(db, 'siteFeedback');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// `patch` is any subset of { text, author, category, status } — covers
// editing the text, recategorizing, and changing status through the same
// one function, all of which bump updatedAt.
export async function updateFeedback(feedbackId, patch) {
  if (!useCloud) return devUpdateFeedback(feedbackId, patch);
  await updateDoc(doc(db, 'siteFeedback', feedbackId), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteFeedback(feedbackId) {
  if (!useCloud) return devDeleteFeedback(feedbackId);
  await deleteDoc(doc(db, 'siteFeedback', feedbackId));
}

// Plan persistence (getActivePlan/savePlan) and the profile helpers
// (getUserProfile/setWeddingDate/updateWorkout) were written ahead of the Plan
// screen and never called. Removed rather than carried as dead weight — see
// git history if that screen gets built.
