import {
  collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';
import { db, useCloud } from '../firebase-config.js';
import { currentUid } from '../auth.js';
import {
  devEnsureUserDoc, devCreateWorkout, devUpdateWorkout, devDeleteWorkout, devListWorkouts,
  devListExerciseLibrary, devAddExerciseToLibrary,
  devRenameExerciseEverywhere, devDeleteExerciseFromLibrary,
  devAddNutritionEntry, devListNutritionEntries,
  devCreateFeedback, devListFeedback, devUpdateFeedback, devDeleteFeedback,
} from './dev-store.js';

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
      notes: workout.notes ?? '',
      exercises: workout.exercises ?? [],
    });
    return docRef.id;
  } finally {
    invalidateWorkouts();
  }
}

// `patch` is any subset of the workout's fields — used when a finished
// workout is reopened from History and saved again.
export async function updateWorkout(workoutId, patch) {
  try {
    if (!useCloud) return await devUpdateWorkout(workoutId, patch);
    const uid = uidOrThrow();
    await updateDoc(doc(db, 'users', uid, 'workouts', workoutId), patch);
  } finally {
    invalidateWorkouts();
  }
}

export async function deleteWorkout(workoutId) {
  try {
    if (!useCloud) return await devDeleteWorkout(workoutId);
    const uid = uidOrThrow();
    await deleteDoc(doc(db, 'users', uid, 'workouts', workoutId));
  } finally {
    invalidateWorkouts();
  }
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
export async function getLastPerformance(exerciseName, excludeWorkoutId = null) {
  const workouts = await allWorkouts();
  for (const w of workouts) {
    if (w.id === excludeWorkoutId) continue;
    const ex = (w.exercises || []).find((e) => e.name === exerciseName);
    if (ex) return { workoutDate: w.date, sets: ex.sets };
  }
  return null;
}

// All sets ever logged for an exercise, oldest first — used for progress
// charts and personal-record calculation.
export async function getExerciseHistory(exerciseName, excludeWorkoutId = null) {
  const workouts = await allWorkouts();
  const points = [];
  for (const w of workouts) {
    if (w.id === excludeWorkoutId) continue;
    const ex = (w.exercises || []).find((e) => e.name === exerciseName);
    if (ex) points.push({ date: w.date, sets: ex.sets });
  }
  return points.reverse();
}

// ---------- exercise library ----------

export async function listExerciseLibrary() {
  if (!useCloud) return devListExerciseLibrary();
  const uid = uidOrThrow();
  const snap = await getDocs(collection(db, 'users', uid, 'exerciseLibrary'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addExerciseToLibrary(exercise) {
  if (!useCloud) return devAddExerciseToLibrary(exercise);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'exerciseLibrary');
  const docRef = await addDoc(ref, {
    name: exercise.name,
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

export async function listNutritionEntries(max = 200) {
  if (!useCloud) return devListNutritionEntries(max);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'nutritionEntries');
  const q = query(ref, orderBy('date', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
