// Steps from the iPhone: an iOS Shortcut reads the steps from Apple
// Health and opens #/import?steps=N&date=yyyy-mm-dd (js/pages/import.js).
// Pure functions — no DOM, no Firestore — so tools/test-steps-import.mjs
// can run them under Node. Limits come from STEPS_IMPORT in rules.js.

import { ACTIVITY, STEPS_IMPORT } from './rules.js';
import { stepsKcal } from './daily-activity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Today's yyyy-mm-dd in Israel, whatever the device's own time zone.
export function israelDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STEPS_IMPORT.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Days from `key` to `today` (both yyyy-mm-dd): 0 = today, 1 = yesterday,
// negative = the future. null for a string that isn't a real date.
function daysBefore(key, today) {
  const utc = (k) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    // 2026-02-31 rolls over into March — not a real date.
    return new Date(t).toISOString().slice(0, 10) === k ? t : null;
  };
  const a = utc(key);
  const b = utc(today);
  return a === null || b === null ? null : Math.round((b - a) / DAY_MS);
}

// The shortcut's query (a string, URLSearchParams or plain object) →
// { steps, date } or { error: 'steps' | 'date' }. `steps` is a whole number
// 0…maxSteps (thousands separators allowed: "12,450"); `date` defaults to
// `today` and may be up to maxDaysBack days earlier, never later.
export function parseImport(query, today = israelDateKey()) {
  const params = query instanceof URLSearchParams ? query
    : typeof query === 'string' ? new URLSearchParams(query.replace(/^\?/, ''))
      : new URLSearchParams(query || {});

  const rawSteps = (params.get('steps') ?? '').trim().replace(/[,   ]/g, '');
  if (!/^\d+$/.test(rawSteps)) return { error: 'steps' };
  const steps = Number(rawSteps);
  if (steps > STEPS_IMPORT.maxSteps) return { error: 'steps' };

  const rawDate = (params.get('date') ?? '').trim();
  const date = rawDate || today;
  const back = daysBefore(date, today);
  if (back === null || back < 0 || back > STEPS_IMPORT.maxDaysBack) return { error: 'date' };

  return { steps, date };
}

// The fields to merge into dailyActivity/{date}, or null when there's
// nothing to write: a day never loses steps (a midday run can't undo the
// evening's number), so the same or a lower count changes nothing — which
// also makes running the same URL twice harmless. The kcal fields are
// recomputed from the day's own base and workout, so the sum stays true.
// `newBase` is the user's own baseKcal (users/{uid}, M16a) — used only for
// a day with no doc yet; an existing doc keeps the base it was saved with.
export function mergeSteps(existing, steps, newBase = ACTIVITY.baseKcal) {
  const stored = Number(existing?.steps) || 0;
  if (steps <= stored) return null;
  const baseKcal = Number.isFinite(existing?.baseKcal) ? existing.baseKcal
    : existing ? ACTIVITY.baseKcal : newBase;
  // An older doc may carry only totalOutKcal: recover its workout part
  // from the old total so the strength workout isn't lost.
  const workoutKcal = Number.isFinite(existing?.workoutKcal) ? existing.workoutKcal
    : Number.isFinite(existing?.totalOutKcal)
      ? Math.max(0, existing.totalOutKcal - baseKcal - stepsKcal(stored)) : 0;
  const sk = stepsKcal(steps);
  return {
    steps,
    stepsKcal: sk,
    baseKcal,
    workoutKcal,
    totalOutKcal: baseKcal + sk + workoutKcal,
    source: 'shortcut',
    ...(existing ? {} : { note: '' }),
  };
}

// Items of a list the shortcut sent: a JSON array, or the text iOS makes
// of a list (one item per line). Steps keep "9,750" whole, so only line
// breaks split them; dates may also be split by commas or spaces.
function listOf(value, splitter) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (value === undefined || value === null) return [];
  return String(value).split(splitter).map((v) => v.trim()).filter(Boolean);
}

// The body of POST /api/steps → { days: [{ date, steps }] } or
// { error: 'steps' | 'date' }. One number (with an optional date) works as
// before. A list of numbers with a matching list of dates (the shortcut
// reads the last couple of days, grouped by day) keeps only the days from
// batchDaysBack days ago to today — an older first day may be partial —
// and adds up repeats of a day (samples that weren't grouped).
export function parseStepsBody(body, today = israelDateKey()) {
  const stepsList = listOf(body?.steps, /\r?\n/);
  const dateList = listOf(body?.date, /[\s,;]+/);
  const one = (steps, date) => parseImport({ steps: String(steps).split('.')[0], date: date || '' }, today);

  if (stepsList.length <= 1 && dateList.length <= 1) {
    const parsed = one(stepsList[0] ?? '', dateList[0]);
    return parsed.error ? parsed : { days: [parsed] };
  }
  if (stepsList.length !== dateList.length) return { error: 'date' };

  const byDate = new Map();
  for (let i = 0; i < stepsList.length; i++) {
    const back = daysBefore(dateList[i], today);
    if (back === null || back < 0) return { error: 'date' };
    if (back > STEPS_IMPORT.batchDaysBack) continue;
    const parsed = one(stepsList[i], dateList[i]);
    if (parsed.error) return parsed;
    byDate.set(parsed.date, (byDate.get(parsed.date) || 0) + parsed.steps);
  }
  if (!byDate.size) return { error: 'date' };
  const days = [...byDate].map(([date, steps]) => ({ date, steps: Math.min(steps, STEPS_IMPORT.maxSteps) }));
  return { days: days.sort((a, b) => b.date.localeCompare(a.date)) };
}
