import {
  collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db, useCloud } from '../firebase-config.js';
import { currentUid } from '../auth.js';
import {
  devEnsureUserDoc, devGetUserProfile, devSetWeddingDate,
  devCreateWorkout, devUpdateWorkout, devDeleteWorkout, devListWorkouts,
  devListExerciseLibrary, devAddExerciseToLibrary,
  devAddNutritionEntry, devListNutritionEntries,
  devGetActivePlan, devSavePlan,
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

export async function getUserProfile() {
  if (!useCloud) return devGetUserProfile();
  const uid = uidOrThrow();
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function setWeddingDate(dateStr) {
  if (!useCloud) return devSetWeddingDate(dateStr);
  const uid = uidOrThrow();
  await updateDoc(doc(db, 'users', uid), {
    weddingDate: dateStr ? Timestamp.fromDate(new Date(dateStr)) : null,
  });
}

// ---------- workouts ----------

export async function createWorkout(workout) {
  if (!useCloud) return devCreateWorkout(workout);
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
}

export async function updateWorkout(workoutId, data) {
  if (!useCloud) return devUpdateWorkout(workoutId, data);
  const uid = uidOrThrow();
  await updateDoc(doc(db, 'users', uid, 'workouts', workoutId), data);
}

export async function deleteWorkout(workoutId) {
  if (!useCloud) return devDeleteWorkout(workoutId);
  const uid = uidOrThrow();
  await deleteDoc(doc(db, 'users', uid, 'workouts', workoutId));
}

export async function listWorkouts(max = 100) {
  if (!useCloud) return devListWorkouts(max);
  const uid = uidOrThrow();
  const ref = collection(db, 'users', uid, 'workouts');
  const q = query(ref, orderBy('date', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Most recent prior workout that logged this exercise, so the Active
// Session screen can show a "previous" value per set.
export async function getLastPerformance(exerciseName) {
  const workouts = await listWorkouts(50);
  for (const w of workouts) {
    const ex = (w.exercises || []).find((e) => e.name === exerciseName);
    if (ex) return { workoutDate: w.date, sets: ex.sets };
  }
  return null;
}

// All sets ever logged for an exercise, oldest first — used for progress
// charts and personal-record calculation.
export async function getExerciseHistory(exerciseName) {
  const workouts = await listWorkouts(500);
  const points = [];
  for (const w of workouts) {
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

// The 7 muscle categories Yarin organizes his training around, grouped into
// the two workout types he actually trains (Push / Pull day). Shared by the
// Active Session exercise picker and the Dashboard's Personal Records list.
export const CATEGORY_GROUPS = [
  { label: 'פוש', categories: ['חזה', 'כתפיים', 'יד אחורית', 'בטן'] },
  { label: 'פול', categories: ['גב', 'רגליים', 'יד קדמית'] },
];

export const WORKOUT_TYPE_BY_CATEGORY = {
  'חזה': 'push',
  'כתפיים': 'push',
  'יד אחורית': 'push',
  'בטן': 'push',
  'גב': 'pull',
  'רגליים': 'pull',
  'יד קדמית': 'pull',
};

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

// ---------- plans ----------

export async function getActivePlan() {
  if (!useCloud) return devGetActivePlan();
  const uid = uidOrThrow();
  const snap = await getDocs(collection(db, 'users', uid, 'plans'));
  const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return plans.find((p) => p.status === 'active') ?? null;
}

export async function savePlan(plan) {
  if (!useCloud) return devSavePlan(plan);
  const uid = uidOrThrow();
  if (plan.id) {
    await updateDoc(doc(db, 'users', uid, 'plans', plan.id), plan);
    return plan.id;
  }
  const ref = collection(db, 'users', uid, 'plans');
  const docRef = await addDoc(ref, { ...plan, status: plan.status ?? 'active' });
  return docRef.id;
}
