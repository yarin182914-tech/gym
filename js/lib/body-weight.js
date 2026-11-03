// Body-weight math shared by Nutrition's weigh-in card, History's weight
// list and the Dashboard trend. `weights` is always listBodyWeights()'s
// shape — [{ date: 'yyyy-mm-dd', kg, note }], newest day first.

import { dateInputValue, parseDateInputValue } from './format.js';

// Days in the rolling average. A single morning swings by a kilo with
// water and salt; a week's mean is what actually shows the trend.
export const TREND_DAYS = 7;

export function todayKey() {
  return dateInputValue(new Date());
}

export function shiftKey(key, days) {
  const d = parseDateInputValue(key);
  d.setDate(d.getDate() + days);
  return dateInputValue(d);
}

export const round2 = (n) => Math.round(n * 100) / 100;

// Mean of the weigh-ins in the TREND_DAYS days ending on `key` (inclusive),
// or null when there are none.
export function trendAt(weights, key) {
  const from = shiftKey(key, -(TREND_DAYS - 1));
  let sum = 0;
  let count = 0;
  for (const w of weights) {
    if (w.date >= from && w.date <= key) {
      sum += w.kg;
      count += 1;
    }
  }
  return count ? sum / count : null;
}

// The trend now minus the trend `days` ago — null when either end has no
// weigh-ins to average.
export function trendChange(weights, days, key = todayKey()) {
  const now = trendAt(weights, key);
  const then = trendAt(weights, shiftKey(key, -days));
  return now === null || then === null ? null : now - then;
}

// "+0.4" / "−1.2" / "±0" — U+2212 minus, matching the steppers. Wrapped in
// an LTR isolate so the sign stays in front of the digits inside Hebrew text.
export function signedKg(n, digits = 1) {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return `<bdi dir="ltr">${sign}${Math.abs(r)}</bdi>`;
}

// Puts a saved day into the list in place of any earlier entry for that
// day, keeping it newest-first — a back-filled day lands in its own spot,
// so "the previous weigh-in" stays right everywhere.
export function upsertWeight(weights, entry) {
  const i = weights.findIndex((w) => w.date === entry.date);
  if (i >= 0) weights.splice(i, 1);
  weights.push(entry);
  weights.sort((a, b) => (a.date < b.date ? 1 : -1));
}
