// Cardio activities — built in, not stored in the exercise library, so
// every account has them without a re-seed (seedExerciseLibraryIfEmpty only
// ever runs on an empty library).
//
// A cardio exercise is saved like any other ({ name, category, sets }), plus
// `kind: 'cardio'`, `activity` and, for walking/running, `inputMode`. Each
// of its "sets" is a segment holding only what was actually entered — every
// field is optional: { durationSec, distanceKm, paceSec, speedKmh,
// inclinePct, level, effort, notes }. Whatever can be worked out from the
// rest (e.g. pace from time + distance) is derived by segmentMetrics(), and
// saved alongside as `calc` for anything reading the raw data.

export const CARDIO_CATEGORY = 'אירובי';

export const CARDIO_ACTIVITIES = [
  {
    id: 'walk',
    name: 'הליכה',
    efforts: [{ id: 'easy', label: 'נינוח' }, { id: 'moderate', label: 'רגיל' }, { id: 'fast', label: 'מהיר' }],
    defaults: { free: {}, treadmill: { durationSec: 600, speedKmh: 5.5, inclinePct: 0 } },
  },
  {
    id: 'run',
    name: 'ריצה',
    efforts: [{ id: 'easy', label: 'קליל' }, { id: 'moderate', label: 'בינוני' }, { id: 'hard', label: 'עצים' }],
    defaults: { free: {}, treadmill: { durationSec: 600, speedKmh: 10, inclinePct: 1 } },
  },
  { id: 'stairs', name: 'מדרגות', efforts: [], defaults: { free: { durationSec: 600, level: 6 } } },
  { id: 'bike', name: 'אופניים', efforts: [], defaults: { free: { durationSec: 900, level: 8, speedKmh: 25 } } },
];

// Every value a segment can carry; anything else on it is UI state.
export const SEGMENT_KEYS = ['durationSec', 'distanceKm', 'paceSec', 'speedKmh', 'inclinePct', 'level', 'effort'];

// key: the segment field; clock: entered as m:ss rather than a number.
export const CARDIO_FIELDS = {
  duration: { key: 'durationSec', clock: true, unit: 'זמן', aria: 'משך' },
  distance: { key: 'distanceKm', unit: 'ק"מ', aria: 'מרחק' },
  pace: { key: 'paceSec', clock: true, unit: '/ק"מ', aria: 'קצב' },
  speed: { key: 'speedKmh', unit: 'קמ"ש', aria: 'מהירות' },
  incline: { key: 'inclinePct', unit: '%', aria: 'שיפוע' },
  level: { key: 'level', unit: 'רמה', aria: 'רמה' },
};

// Shaped like exercise-library entries so the picker can list them alongside.
export const CARDIO_LIBRARY = CARDIO_ACTIVITIES.map((a) => ({
  id: `cardio:${a.id}`,
  name: a.name,
  category: CARDIO_CATEGORY,
  kind: 'cardio',
  activity: a.id,
}));

export function cardioActivity(id) {
  return CARDIO_ACTIVITIES.find((a) => a.id === id) || CARDIO_ACTIVITIES[0];
}

// Walking and running are either logged freely (time / distance / pace —
// a walk around town) or off a treadmill's display (time / speed / incline).
export function hasInputModes(activityId) {
  return activityId === 'walk' || activityId === 'run';
}

export function segmentFields(activityId, inputMode) {
  if (activityId === 'stairs') return ['duration', 'level'];
  if (activityId === 'bike') return ['duration', 'level', 'speed'];
  return inputMode === 'treadmill' ? ['duration', 'speed', 'incline'] : ['duration', 'distance', 'pace'];
}

export function effortLabel(activityId, effortId) {
  return cardioActivity(activityId).efforts.find((e) => e.id === effortId)?.label || '';
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v) || null);

// Fills in whatever the entered values imply: any two of time, distance
// and speed (or pace) give the third. Entered values always win.
export function segmentMetrics(seg) {
  let durationSec = num(seg.durationSec);
  let distanceKm = num(seg.distanceKm);
  let speedKmh = num(seg.speedKmh) ?? (num(seg.paceSec) ? 3600 / num(seg.paceSec) : null);
  if (speedKmh === null && durationSec && distanceKm) speedKmh = (distanceKm / durationSec) * 3600;
  if (distanceKm === null && durationSec && speedKmh) distanceKm = (speedKmh * durationSec) / 3600;
  if (durationSec === null && distanceKm && speedKmh) durationSec = (distanceKm / speedKmh) * 3600;
  return {
    durationSec,
    distanceKm,
    speedKmh,
    paceSec: speedKmh ? 3600 / speedKmh : null,
  };
}

// True when nothing at all was entered — such a segment isn't saved.
export function isEmptySegment(seg) {
  return SEGMENT_KEYS.every((k) => seg[k] === null || seg[k] === undefined || seg[k] === '');
}

// "5:30", "1:02:00" — no zero-padding on the leading part.
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatKm(km) {
  return (Math.round(km * 100) / 100).toString();
}

export function formatSpeed(kmh) {
  return (Math.round(kmh * 10) / 10).toString();
}

// Totals over a list of segments. Average pace only counts segments whose
// time and distance are both known.
export function summarizeSegments(segments) {
  let durationSec = 0;
  let distanceKm = 0;
  let pacedSec = 0;
  let pacedKm = 0;
  let maxLevel = 0;
  for (const seg of segments || []) {
    const m = segmentMetrics(seg);
    durationSec += m.durationSec || 0;
    distanceKm += m.distanceKm || 0;
    if (m.durationSec && m.distanceKm) {
      pacedSec += m.durationSec;
      pacedKm += m.distanceKm;
    }
    maxLevel = Math.max(maxLevel, Number(seg.level) || 0);
  }
  return { durationSec, distanceKm, avgPaceSec: pacedKm > 0 ? pacedSec / pacedKm : null, maxLevel };
}

// ---------- records ----------
// Cardio has no single "heaviest" to rank by, so each activity tracks a few
// separate records, each judged on one workout's totals (summarizeSegments).

const RECORDS = {
  distance: { label: 'מרחק הכי ארוך', short: 'מרחק', value: (t) => t.distanceKm, better: (a, b) => a > b, format: (v) => `${formatKm(v)} ק"מ` },
  pace: { label: 'קצב הכי מהיר', short: 'קצב', value: (t) => t.avgPaceSec, better: (a, b) => a < b, format: (v) => `${formatClock(v)} /ק"מ` },
  duration: { label: 'זמן הכי ארוך', short: 'זמן', value: (t) => t.durationSec, better: (a, b) => a > b, format: (v) => formatClock(v) },
  level: { label: 'רמה הכי גבוהה', short: 'רמה', value: (t) => t.maxLevel, better: (a, b) => a > b, format: (v) => `רמה ${v}` },
};

function recordIds(activityId) {
  if (activityId === 'stairs') return ['duration', 'level'];
  if (activityId === 'bike') return ['distance', 'duration', 'level'];
  return ['distance', 'pace', 'duration'];
}

// points: [{ date, sets }] in any order. Returns only records that have a
// value: [{ id, label, value, text, date }]. An exact tie goes to the newer
// workout, same as the strength PR.
export function findCardioRecords(activityId, points) {
  return recordIds(activityId).map((id) => {
    const def = RECORDS[id];
    let best = null;
    for (const p of points || []) {
      const v = def.value(summarizeSegments(p.sets));
      if (!v) continue;
      const date = p.date?.toDate ? p.date.toDate() : new Date(p.date);
      if (!best || def.better(v, best.value) || (v === best.value && date > best.date)) best = { value: v, date };
    }
    return best && { id, label: def.label, value: best.value, text: def.format(best.value), date: best.date };
  }).filter(Boolean);
}

// The records this workout's segments beat — the short names, e.g. ['מרחק'].
// Nothing counts as broken with no history to compare against.
export function brokenCardioRecords(activityId, points, sets) {
  const totals = summarizeSegments(sets);
  const records = findCardioRecords(activityId, points);
  return records
    .filter((r) => {
      const v = RECORDS[r.id].value(totals);
      return v && RECORDS[r.id].better(v, r.value);
    })
    .map((r) => RECORDS[r.id].short);
}

// "25:00 · 3.4 ק"מ · 7:21 /ק"מ" — each part only when known.
export function formatSummary({ durationSec, distanceKm, avgPaceSec }, { withPace = true } = {}) {
  const parts = [];
  if (durationSec > 0) parts.push(formatClock(durationSec));
  if (distanceKm > 0) parts.push(`${formatKm(distanceKm)} ק"מ`);
  if (withPace && avgPaceSec) parts.push(`${formatClock(avgPaceSec)} /ק"מ`);
  return parts.join(' · ');
}
