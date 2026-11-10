// Workout types — the third exercise kind next to strength and cardio:
// functional, CrossFit, Pilates and so on, plus types the user builds.
//
// A session is saved inside a workout's `exercises` like any other
// exercise, but it has no `sets`:
//   { name, category: 'אימון', kind: 'session', typeId, durationSec?, rpe?,
//     avgHr?, place?, fields: { …type-specific }, notes }
// Only what was entered is written. Built-in types live here in code;
// the user's own are users/{uid}/workoutTypes/{auto} (typeId
// `custom:<docId>`). See docs/DATA.md.
//
// Also here: the small readers every screen uses to tell the kinds apart,
// so a session (no sets) never reaches code that expects them.

import { cardioActivity } from './cardio.js';
import { toDate } from './format.js';

export const SESSION_CATEGORY = 'אימון';

const LEVELS = ['מתחילים', 'בינוני', 'מתקדם'];
const INTENSITY = ['קלה', 'בינונית', 'גבוהה'];

// How each field is entered and stored. input: clock (seconds), number,
// pick (one of `options`, a string), text, stations (functional only).
export const FIELD_KINDS = {
  duration: { input: 'clock', label: 'זמן' },
  distance: { input: 'number', label: 'מרחק', unit: 'ק"מ' },
  meters: { input: 'number', label: 'מרחק', unit: 'מ׳', int: true, max: 99999 },
  rounds: { input: 'number', label: 'סבבים', unit: 'סבבים', int: true },
  reps: { input: 'number', label: 'חזרות', unit: 'חזרות', int: true },
  count: { input: 'number', label: 'כמות', unit: '', int: true },
  weight: { input: 'number', label: 'משקל', unit: 'ק"ג' },
  resultTime: { input: 'clock', label: 'זמן תוצאה' },
  level: { input: 'pick', label: 'רמה', options: LEVELS },
  picklist: { input: 'pick', label: 'רשימת בחירה' },
  text: { input: 'text', label: 'טקסט' },
  stations: { input: 'stations', label: 'תחנות' },
};

// What a type of your own can be built from.
export const FIELD_PALETTE = ['duration', 'distance', 'rounds', 'reps', 'weight', 'resultTime', 'level', 'picklist', 'text'];

// showIf: the field only applies while another field has one of these values.
export const BUILTIN_TYPES = [
  {
    id: 'functional',
    name: 'פונקציונלי',
    fields: [
      { id: 'format', kind: 'picklist', label: 'מבנה', options: ['מעגל', 'EMOM', 'AMRAP', 'טבטה'] },
      { id: 'rounds', kind: 'rounds', label: 'סבבים' },
      { id: 'stations', kind: 'stations', label: 'תחנות' },
      { id: 'restSec', kind: 'duration', label: 'מנוחה בין סבבים' },
    ],
  },
  {
    id: 'crossfit',
    name: 'קרוספיט',
    fields: [
      { id: 'wod', kind: 'text', label: 'שם ה-WOD' },
      { id: 'format', kind: 'picklist', label: 'מבנה', options: ['For Time', 'AMRAP', 'EMOM'] },
      { id: 'timeCapSec', kind: 'duration', label: 'מגבלת זמן' },
      { id: 'resultSec', kind: 'resultTime', label: 'תוצאה', showIf: { format: ['For Time'] } },
      { id: 'resultRounds', kind: 'rounds', label: 'סבבים', showIf: { format: ['AMRAP'] } },
      { id: 'resultReps', kind: 'reps', label: 'חזרות נוספות', showIf: { format: ['AMRAP'] } },
      { id: 'scale', kind: 'picklist', label: 'Rx / Scaled', options: ['Rx', 'Scaled'] },
      { id: 'weights', kind: 'text', label: 'משקלים' },
    ],
  },
  {
    id: 'pilates',
    name: 'פילאטיס',
    fields: [
      { id: 'equipment', kind: 'picklist', label: 'סוג', options: ['מכשירים', 'מזרן'] },
      { id: 'level', kind: 'level', label: 'רמה' },
      { id: 'focus', kind: 'picklist', label: 'מוקד', options: ['בטן', 'גמישות', 'יציבה'] },
      { id: 'instructor', kind: 'text', label: 'מדריך/ה' },
    ],
  },
  {
    id: 'yoga',
    name: 'יוגה',
    fields: [
      { id: 'style', kind: 'picklist', label: 'סגנון', options: ['ויניאסה', 'האטה', 'אשטנגה', 'יין', 'אחר'] },
      { id: 'level', kind: 'level', label: 'רמה' },
      { id: 'focus', kind: 'picklist', label: 'מוקד', options: ['גמישות', 'כוח', 'נשימה', 'הרפיה'] },
    ],
  },
  {
    id: 'swim',
    name: 'שחייה',
    fields: [
      { id: 'distanceM', kind: 'meters', label: 'מרחק' },
      { id: 'stroke', kind: 'picklist', label: 'סגנון', options: ['חתירה', 'חזה', 'גב', 'פרפר', 'מעורב'] },
    ],
  },
  {
    id: 'studio',
    name: 'סטודיו',
    fields: [
      { id: 'classType', kind: 'picklist', label: 'שיעור', options: ['ספינינג', 'HIIT', 'אגרוף', 'אחר'] },
      { id: 'intensity', kind: 'picklist', label: 'עצימות', options: INTENSITY },
      { id: 'rounds', kind: 'rounds', label: 'סבבים' },
    ],
  },
  {
    id: 'sport',
    name: 'ספורט',
    fields: [
      { id: 'game', kind: 'picklist', label: 'משחק', options: ['פאדל', 'טניס', 'כדורגל', 'כדורסל', 'אחר'] },
      { id: 'intensity', kind: 'picklist', label: 'עצימות', options: INTENSITY },
      { id: 'result', kind: 'text', label: 'תוצאה' },
    ],
  },
  {
    id: 'ski',
    name: 'סקי',
    durationLabel: 'זמן על המסלול',
    fields: [
      { id: 'runs', kind: 'count', label: 'ירידות' },
      { id: 'slope', kind: 'picklist', label: 'רמת מסלולים', options: ['ירוק', 'כחול', 'אדום', 'שחור'] },
    ],
  },
];

export const CUSTOM_PREFIX = 'custom:';
export const customTypeId = (docId) => `${CUSTOM_PREFIX}${docId}`;
export const isCustomType = (typeId) => String(typeId || '').startsWith(CUSTOM_PREFIX);

// A users/{uid}/workoutTypes doc as a type definition.
export function customType(doc) {
  return {
    id: customTypeId(doc.id),
    docId: doc.id,
    name: doc.name || 'אימון',
    custom: true,
    fields: (doc.fields || []).filter((f) => FIELD_KINDS[f.kind]),
  };
}

// The definition for a typeId — built in, one of `customTypes` (docs), or,
// for a type deleted since, a bare one under the saved name.
export function resolveType(typeId, customTypes = [], name = '') {
  const builtin = BUILTIN_TYPES.find((t) => t.id === typeId);
  if (builtin) return builtin;
  const doc = customTypes.find((d) => customTypeId(d.id) === typeId);
  if (doc) return customType(doc);
  return { id: typeId || '', name: name || 'אימון', custom: isCustomType(typeId), fields: [] };
}

// Picker entries, shaped like exercise-library entries.
export function typeLibrary(customTypes = []) {
  return [...BUILTIN_TYPES, ...customTypes.map(customType)].map((t) => ({
    id: `session:${t.id}`,
    name: t.name,
    category: SESSION_CATEGORY,
    kind: 'session',
    typeId: t.id,
    custom: !!t.custom,
    docId: t.docId,
  }));
}

// ---------- kinds ----------

export function exerciseKind(ex) {
  if (ex?.kind === 'cardio') return 'cardio';
  if (ex?.kind === 'session') return 'session';
  return 'strength';
}

export const isStrength = (ex) => exerciseKind(ex) === 'strength';

// What a workout holds, for its label and colour. look: the existing
// History colours — sessions use the strength one (no new colour).
export function workoutKind(w, customTypes = []) {
  const exercises = w?.exercises || [];
  const cardio = exercises.filter((ex) => exerciseKind(ex) === 'cardio');
  const strength = exercises.filter(isStrength);
  const sessions = exercises.filter((ex) => exerciseKind(ex) === 'session');
  const activities = [...new Set(cardio.map((ex) => ex.activity))];
  const sessionNames = [...new Set(sessions.map((ex) => resolveType(ex.typeId, customTypes, ex.name).name))];
  const solid = strength.length + sessions.length > 0;
  let kind = 'strength';
  if (cardio.length) kind = solid ? 'mixed' : 'cardio';
  else if (sessions.length && !strength.length) kind = 'session';
  const look = kind === 'session' ? 'strength' : kind;
  return { kind, look, cardio, strength, sessions, activities, sessionNames };
}

// "פילאטיס", "קרוספיט + כוח", "כוח + ריצה", "ריצה + הליכה".
export function workoutLabel({ strength, activities, sessionNames }) {
  const parts = [
    ...sessionNames,
    ...(strength.length ? ['כוח'] : []),
    ...activities.map((a) => cardioActivity(a).name),
  ];
  return parts.join(' + ') || 'אימון';
}

// ---------- readers that skip sessions ----------
// firestore.js's "last time" / history lookups and the dashboard are keyed
// by exercise name and read `sets`; a session has neither meaning.

export function lastPerformanceIn(workouts, exerciseName, excludeWorkoutId = null) {
  for (const w of workouts || []) {
    if (w.id === excludeWorkoutId) continue;
    const ex = (w.exercises || []).find((e) => e.name === exerciseName && exerciseKind(e) !== 'session');
    if (ex) return { workoutDate: w.date, sets: ex.sets || [], note: ex.note || '' };
  }
  return null;
}

// Oldest first. Workouts come newest first.
export function exerciseHistoryIn(workouts, exerciseName, excludeWorkoutId = null) {
  const points = [];
  for (const w of workouts || []) {
    if (w.id === excludeWorkoutId) continue;
    const ex = (w.exercises || []).find((e) => e.name === exerciseName && exerciseKind(e) !== 'session');
    if (ex && (ex.sets || []).length) points.push({ date: w.date, sets: ex.sets, note: ex.note || '' });
  }
  return points.reverse();
}

// Strength exercise names, most recent first, and their categories.
export function strengthNamesIn(workouts) {
  const names = [];
  const categoryByName = new Map();
  for (const w of workouts || []) {
    for (const ex of w.exercises || []) {
      if (!isStrength(ex)) continue;
      if (!names.includes(ex.name)) names.push(ex.name);
      if (ex.category) categoryByName.set(ex.name, ex.category);
    }
  }
  return { names, categoryByName };
}

// Sessions of one type, newest first: [{ date, workoutId, ex }].
export function sessionsOfType(workouts, typeId, excludeWorkoutId = null) {
  const out = [];
  for (const w of workouts || []) {
    if (w.id === excludeWorkoutId) continue;
    for (const ex of w.exercises || []) {
      if (exerciseKind(ex) === 'session' && ex.typeId === typeId) out.push({ date: w.date, workoutId: w.id, ex });
    }
  }
  return out;
}

// The coach's planned exercises as the plan card hands them on: sets
// renumbered for strength and cardio, a session passed through as it is.
export function planExercisesOut(draft, plainSet = (s) => s) {
  return JSON.parse(JSON.stringify((draft || []).map((ex) => {
    if (exerciseKind(ex) === 'session') return ex;
    return {
      ...ex,
      sets: (ex.sets || []).map((s, j) => ({ ...(exerciseKind(ex) === 'cardio' ? s : plainSet(s)), setNumber: j + 1 })),
    };
  })));
}

// ---------- values ----------

const blank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

// The common values plus the type's own, as the form edits them.
export function emptyValues() {
  return { durationSec: null, rpe: null, avgHr: null, place: '', fields: {}, notes: '' };
}

// A saved session's values back in the form's shape.
export function valuesFromSaved(ex) {
  return {
    durationSec: ex?.durationSec ?? null,
    rpe: ex?.rpe ?? null,
    avgHr: ex?.avgHr ?? null,
    place: ex?.place || '',
    fields: JSON.parse(JSON.stringify(ex?.fields || {})),
    notes: ex?.notes || '',
  };
}

// Quick log: the last session of the same type, minus what belongs to that
// day only (heart rate, notes). Fields the type no longer has are dropped.
export function prefillFrom(last, type) {
  if (!last) return emptyValues();
  const v = valuesFromSaved(last);
  const ids = new Set((type?.fields || []).map((f) => f.id));
  const fields = {};
  for (const [k, val] of Object.entries(v.fields)) if (ids.has(k)) fields[k] = val;
  return { ...v, fields, avgHr: null, notes: '' };
}

export function fieldShown(field, fields) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, allowed]) => allowed.includes(fields?.[k]));
}

function cleanStations(list) {
  return (Array.isArray(list) ? list : [])
    .map((s) => {
      const out = {};
      if (!blank(s?.name)) out.name = String(s.name).trim();
      if (!blank(s?.amount)) out.amount = String(s.amount).trim();
      if (Number(s?.weight) > 0) out.weight = Number(s.weight);
      return out;
    })
    .filter((s) => Object.keys(s).length > 0);
}

// The session as saved: only what was entered, never null; hidden fields
// (showIf) dropped. Numbers stay numbers.
export function sessionToSaved({ name, typeId, values }, type) {
  const v = values || emptyValues();
  const out = { name, category: SESSION_CATEGORY, kind: 'session', typeId };
  if (Number(v.durationSec) > 0) out.durationSec = Math.round(Number(v.durationSec));
  if (Number(v.rpe) >= 1) out.rpe = Math.min(10, Math.max(1, Math.round(Number(v.rpe))));
  if (Number(v.avgHr) > 0) out.avgHr = Math.round(Number(v.avgHr));
  if (!blank(v.place?.trim?.())) out.place = v.place.trim();
  const fields = {};
  const defs = type?.fields || [];
  for (const f of defs) {
    if (!fieldShown(f, v.fields)) continue;
    let val = v.fields?.[f.id];
    const kind = FIELD_KINDS[f.kind];
    if (kind.input === 'stations') val = cleanStations(val);
    else if (kind.input === 'number' || kind.input === 'clock') val = Number(val) > 0 ? Number(val) : null;
    else if (typeof val === 'string') val = val.trim();
    if (!blank(val)) fields[f.id] = val;
  }
  // A type deleted since keeps whatever it had.
  if (defs.length === 0) Object.assign(fields, v.fields || {});
  out.fields = fields;
  out.notes = (v.notes || '').trim();
  return out;
}

// ---------- display ----------

function clock(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function fieldText(field, value) {
  const kind = FIELD_KINDS[field.kind];
  if (!kind || blank(value)) return '';
  if (kind.input === 'clock') return clock(value);
  if (kind.input === 'stations') return value.map((s) => [s.name, s.amount, s.weight ? `${s.weight} ק"ג` : ''].filter(Boolean).join(' ')).join(' · ');
  if (kind.input === 'number') return kind.unit ? `${value} ${kind.unit}` : String(value);
  return String(value);
}

// Swimming: pace per 100 m, from the time and distance.
export function swimPaceSec(ex) {
  const m = Number(ex?.fields?.distanceM);
  const sec = Number(ex?.durationSec);
  return m > 0 && sec > 0 ? Math.round((sec / m) * 100) : null;
}

// [{ label, text }] for History's detail: the common values, then the type's.
export function sessionDetails(ex, type) {
  const rows = [];
  if (ex.durationSec) rows.push({ label: type?.durationLabel || 'משך', text: clock(ex.durationSec) });
  if (ex.rpe) rows.push({ label: 'מאמץ', text: `${ex.rpe}/10` });
  if (ex.avgHr) rows.push({ label: 'דופק ממוצע', text: String(ex.avgHr) });
  if (ex.place) rows.push({ label: 'מקום', text: ex.place });
  const defs = type?.fields || [];
  for (const f of defs) {
    const text = fieldText(f, ex.fields?.[f.id]);
    if (text) rows.push({ label: f.label, text });
  }
  if (defs.length === 0) {
    for (const [k, val] of Object.entries(ex.fields || {})) {
      if (!blank(val) && typeof val !== 'object') rows.push({ label: k, text: String(val) });
    }
  }
  const pace = type?.id === 'swim' ? swimPaceSec(ex) : null;
  if (pace) rows.push({ label: 'קצב', text: `${clock(pace)} /100 מ׳` });
  if (ex.notes) rows.push({ label: 'הערות', text: ex.notes });
  return rows;
}

// One line: "45:00 · מאמץ 7 · מכשירים · בינוני" — time, effort, then the
// first few picked/typed values. Each part is bidi-isolated (FSI…PDI), so
// "Fran · For Time · 5:00" keeps its order inside Hebrew text.
const isolate = (s) => `⁨${s}⁩`;

export function sessionSummary(ex, type) {
  const parts = [];
  if (ex.durationSec) parts.push(clock(ex.durationSec));
  if (ex.rpe) parts.push(`מאמץ ${ex.rpe}`);
  for (const f of type?.fields || []) {
    if (parts.length >= 4) break;
    if (f.kind === 'stations') continue;
    const text = fieldText(f, ex.fields?.[f.id]);
    if (text) parts.push(text);
  }
  return parts.map(isolate).join(' · ');
}

// ---------- records ----------
// CrossFit: the same WOD (by name) in the same format — For Time, a faster
// result; AMRAP, more rounds (then reps). Functional: more rounds in the
// same format. Nothing counts as broken with no history to compare against.

const norm = (s) => String(s || '').trim().toLowerCase();

function recordScore(ex) {
  const f = ex?.fields || {};
  if (ex?.typeId === 'crossfit' && norm(f.wod)) {
    if (f.format === 'For Time' && Number(f.resultSec) > 0) {
      return { key: `crossfit|${norm(f.wod)}|For Time`, score: -Number(f.resultSec), label: `WOD ${String(f.wod).trim()}` };
    }
    if (f.format === 'AMRAP' && (Number(f.resultRounds) > 0 || Number(f.resultReps) > 0)) {
      return {
        key: `crossfit|${norm(f.wod)}|AMRAP`,
        score: (Number(f.resultRounds) || 0) * 1000 + (Number(f.resultReps) || 0),
        label: `WOD ${String(f.wod).trim()}`,
      };
    }
  }
  if (ex?.typeId === 'functional' && f.format && Number(f.rounds) > 0) {
    return { key: `functional|${f.format}`, score: Number(f.rounds), label: `${f.format} — ${f.rounds} סבבים` };
  }
  return null;
}

// past: earlier sessions (saved shape). The label of the record this one
// beats, or null.
export function brokenSessionRecord(ex, past) {
  const mine = recordScore(ex);
  if (!mine) return null;
  let best = null;
  for (const p of past || []) {
    const s = recordScore(p?.ex || p);
    if (s && s.key === mine.key && (best === null || s.score > best)) best = s.score;
  }
  return best !== null && mine.score > best ? mine.label : null;
}

// The day a workout counts for, yyyy-mm-dd local.
export function workoutDayKey(w) {
  const d = toDate(w.startTime || w.date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
