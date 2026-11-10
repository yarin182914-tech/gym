// Sleep: turning the two clock times into a night, and judging a night
// against the user's rules. Pure functions — no DOM, no Firestore — so
// tools/test-sleep.mjs can run them under Node.
//
// A night is logged under its MORNING's date (the doc id, 'yyyy-mm-dd'),
// but the rules (bedtime target, flexible nights) follow its EVENING:
// Thursday night is the one that starts Thursday evening and is logged on
// Friday. Times are the device's local time — Israel, like the rest of the
// app (docs/DATA.md).

import { SLEEP } from './rules.js';

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0);
}

export function shiftDays(key, days) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

// 'hh:mm' of a Date or Firestore Timestamp.
export function clockOf(value) {
  const d = value?.toDate ? value.toDate() : new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const asDate = (v) => (v?.toDate ? v.toDate() : new Date(v));

// The user doc's sleep fields over the defaults, each checked for shape.
export function sleepSettings(userDoc = {}) {
  const d = SLEEP.defaults;
  const time = (v, fallback) => (/^\d{1,2}:\d{2}$/.test(v ?? '') ? v : fallback);
  const flex = Array.isArray(userDoc.sleepFlexibleNights)
    ? userDoc.sleepFlexibleNights.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : d.sleepFlexibleNights;
  const minHours = Number(userDoc.sleepMinHours);
  return {
    sleepBedtimeTarget: time(userDoc.sleepBedtimeTarget, d.sleepBedtimeTarget),
    sleepBedtimeLatest: time(userDoc.sleepBedtimeLatest, d.sleepBedtimeLatest),
    sleepWakeTime: time(userDoc.sleepWakeTime, d.sleepWakeTime),
    sleepMinHours: Number.isFinite(minHours) && minHours > 0 ? minHours : d.sleepMinHours,
    sleepFlexibleNights: flex,
    sleepBedtimeByWeekday: userDoc.sleepBedtimeByWeekday && typeof userDoc.sleepBedtimeByWeekday === 'object'
      ? userDoc.sleepBedtimeByWeekday
      : d.sleepBedtimeByWeekday,
  };
}

// A clock time on the night of `morningKey`: from SLEEP.eveningFromHour on
// it's the evening before, earlier it's past midnight on the morning itself.
export function nightClock(morningKey, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const day = h >= SLEEP.eveningFromHour ? shiftDays(morningKey, -1) : morningKey;
  const d = parseKey(day);
  d.setHours(h, m, 0, 0);
  return d;
}

// The night's two moments from the two clocks. Waking is always on the
// morning itself (a lie-in to 12:30 on Saturday included). Null when the
// wake time doesn't come after the bedtime.
export function buildNight(morningKey, bedHHMM, wakeHHMM) {
  const bedtime = nightClock(morningKey, bedHHMM);
  const [wh, wm] = wakeHHMM.split(':').map(Number);
  const wakeTime = parseKey(morningKey);
  wakeTime.setHours(wh, wm, 0, 0);
  const durationMin = Math.round((wakeTime - bedtime) / 60000);
  if (durationMin <= 0) return null;
  return { date: morningKey, bedtime, wakeTime, durationMin };
}

// The rules that apply to the night of `morningKey`.
export function nightRules(morningKey, settings) {
  const evening = parseKey(shiftDays(morningKey, -1)).getDay();
  const target = settings.sleepBedtimeByWeekday?.[evening] || settings.sleepBedtimeTarget;
  // A per-weekday target keeps the usual gap to the latest bedtime.
  const gap = Math.max(0, toMin(settings.sleepBedtimeLatest) - toMin(settings.sleepBedtimeTarget));
  const targetDate = nightClock(morningKey, target);
  return {
    eveningWeekday: evening,
    flexible: settings.sleepFlexibleNights.includes(evening),
    bedtimeTarget: target,
    targetDate,
    latestDate: new Date(targetDate.getTime() + (gap || SLEEP.closeWindowMin) * 60000),
    minMin: settings.sleepMinHours * 60,
  };
}

// The prefilled clocks for a night not logged yet: the usual times.
export function usualTimes(morningKey, settings) {
  return { bed: nightRules(morningKey, settings).bedtimeTarget, wake: settings.sleepWakeTime };
}

// night: { date, bedtime, wakeTime, durationMin } (Dates or Timestamps).
// → { onTime, duration, flexible }, each 'full' | 'close' | 'miss';
// onTime is null on a flexible night, where only the duration counts.
//   onTime:   asleep by the target → full; by the latest bedtime → close.
//   duration: the minimum or more → full; up to closeWindowMin short →
//             close; under hardMinHours → always miss.
export function evaluateNight(night, settings) {
  const rules = nightRules(night.date, settings);
  const bedtime = asDate(night.bedtime);
  const durationMin = Number(night.durationMin) || Math.round((asDate(night.wakeTime) - bedtime) / 60000);

  let onTime = null;
  if (!rules.flexible) {
    if (bedtime <= rules.targetDate) onTime = 'full';
    else if (bedtime <= rules.latestDate) onTime = 'close';
    else onTime = 'miss';
  }

  let duration;
  if (durationMin < SLEEP.hardMinHours * 60) duration = 'miss';
  else if (durationMin >= rules.minMin) duration = 'full';
  else if (durationMin >= rules.minMin - SLEEP.closeWindowMin) duration = 'close';
  else duration = 'miss';

  return { onTime, duration, flexible: rules.flexible };
}

// One word for a night: its worst part (a flexible night is its duration).
export function nightGrade(evaluation) {
  const parts = [evaluation.duration, evaluation.onTime].filter(Boolean);
  if (parts.includes('miss')) return 'miss';
  if (parts.includes('close')) return 'close';
  return 'full';
}

// Nights in a row that weren't a miss, counting back from this morning —
// or from yesterday's, while this morning's night isn't logged yet, so the
// streak doesn't look broken before the morning log. nights: any order.
export function sleepStreak(nights, settings, todayKey) {
  const byDate = new Map(nights.map((n) => [n.date, n]));
  let key = byDate.has(todayKey) ? todayKey : shiftDays(todayKey, -1);
  let count = 0;
  while (byDate.has(key) && nightGrade(evaluateNight(byDate.get(key), settings)) !== 'miss') {
    count += 1;
    key = shiftDays(key, -1);
  }
  return count;
}

// "7:50" from minutes.
export function formatDuration(min) {
  return `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;
}

// ---------- charts (js/ui/sleep-trend.js) ----------
// Minutes after 18:00 the evening before, for a bedtime chart: 22:30 → 270,
// 00:15 → 375. A time between 18:00 and 06:00 the next morning.
export function minutesAfterSix(value) {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return null;
  return ((d.getHours() * 60 + d.getMinutes()) - 18 * 60 + 24 * 60) % (24 * 60);
}

export function clockFromMinutesAfterSix(min) {
  const t = Math.round(min + 18 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// The last `count` nights, oldest first, one entry per morning (null where
// none was logged): { keys, hours, bed, target, flexible, avgHours, onTarget, logged }.
export function sleepSeries(nights, settings, todayKey, count) {
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const keys = Array.from({ length: count }, (_, i) => shiftDays(todayKey, i - count + 1));
  const hours = [];
  const bed = [];
  const target = [];
  const flexible = [];
  let sum = 0;
  let logged = 0;
  let onTarget = 0;
  keys.forEach((k) => {
    const n = byDate.get(k);
    const rules = nightRules(k, settings);
    flexible.push(rules.flexible);
    target.push(rules.flexible ? null : minutesAfterSix(rules.targetDate));
    if (!n) {
      hours.push(null);
      bed.push(null);
      return;
    }
    const h = Math.round((Number(n.durationMin) / 60) * 10) / 10;
    hours.push(h);
    bed.push(minutesAfterSix(n.bedtime));
    sum += Number(n.durationMin);
    logged += 1;
    if (h * 60 >= rules.minMin) onTarget += 1;
  });
  return { keys, hours, bed, target, flexible, logged, onTarget, avgHours: logged ? Math.round((sum / logged / 60) * 10) / 10 : null };
}
