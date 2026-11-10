// "ללמוד" (M8b): which areas go first, and the order of the cards. Pure —
// no DOM, no Firestore — so tools/test-library.mjs runs it under Node.

import { LIBRARY_RULES, SLEEP } from './rules.js';
import { shiftDays } from './sleep.js';

// Areas where the user's own data is weakest, first: sleep under the
// minimum on average (enough nights logged), workouts under the weekly
// goal. The rest keep their default order.
export function areaOrder({ nights = [], workoutDays = [], today, minHours, weeklyGoal } = {}) {
  const from = shiftDays(today, -(LIBRARY_RULES.lookbackDays - 1));
  const inRange = (key) => key && key >= from && key <= today;
  const weak = [];
  const recent = nights.filter((n) => inRange(n.date) && Number.isFinite(n.durationMin));
  const min = (minHours ?? SLEEP.defaults.sleepMinHours) * 60;
  if (recent.length >= LIBRARY_RULES.minNights) {
    const avg = recent.reduce((s, n) => s + n.durationMin, 0) / recent.length;
    if (avg < min) weak.push('sleep');
  }
  const days = new Set(workoutDays.filter(inRange));
  if (weeklyGoal && days.size < weeklyGoal) weak.push('training');
  return [...weak, ...LIBRARY_RULES.defaultOrder.filter((a) => !weak.includes(a))];
}

// Cards in area order (coach picks first), finished ones last.
export function sortItems(items, order, marks = {}) {
  const rank = (a) => {
    const i = order.indexOf(a);
    return i === -1 ? order.length : i;
  };
  return [...items].sort((a, b) => {
    const da = marks[a.id]?.doneAt ? 1 : 0;
    const db = marks[b.id]?.doneAt ? 1 : 0;
    if (da !== db) return da - db;
    const pa = a.pick ? 0 : 1;
    const pb = b.pick ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return rank(a.area) - rank(b.area);
  });
}

// What the filter chips show.
export function filterItems(items, { area = null, type = null, saved = false } = {}, marks = {}) {
  return items.filter((it) => (!area || it.area === area)
    && (!type || it.type === type)
    && (!saved || marks[it.id]?.saved));
}

// A coach pick (users/{uid}/libraryPicks) in the shape of an item.
export function pickToItem(doc) {
  return {
    ...doc,
    id: `pick:${doc.id}`,
    pick: true,
    takeaways: Array.isArray(doc.takeaways) ? doc.takeaways.slice(0, 3) : [],
  };
}
