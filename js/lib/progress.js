// The progress screen's rows (M4): one per tracked area — sleep, each
// habit, meals, protein, calories, workouts, weigh-ins — each day judged
// full / close / miss, or neutral (nothing due, nothing logged, a rest
// day). A miss is shown grey, never red. Pure functions over the context
// js/lib/rewards.js builds, so tools/test-rewards.mjs can run them.
//
// Which rows show, and their order, is the user's (users/{uid}
// .trackedRows: { order: [rowId], hidden: [rowId] }); a new habit shows
// until it's hidden.

import { NUTRITION } from './rules.js';
import { evaluateNight, nightGrade, shiftDays, parseKey, formatDuration } from './sleep.js';
import { entryFor, isDue, weekStart } from './habits.js';
import { nutritionGrades } from './rewards.js';
import { trendAt } from './body-weight.js';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

// Every row the user could track, in the default order.
export function allRows(ctx) {
  return [
    { id: 'sleep', name: 'שינה', icon: 'moon', unit: 'שעות' },
    ...ctx.habits.map((h) => ({ id: `habit:${h.id}`, name: h.name, icon: h.icon || 'check', habit: h })),
    { id: 'meals', name: 'ארוחות', icon: 'utensils' },
    { id: 'protein', name: 'חלבון', icon: 'utensils', unit: 'g' },
    { id: 'calories', name: 'גירעון קלורי', icon: 'target', unit: 'קק"ל' },
    { id: 'workouts', name: 'אימונים', icon: 'dumbbell' },
    { id: 'weight', name: 'שקילה', icon: 'weight', unit: 'ק"ג' },
  ];
}

// The rows to show, in the user's order.
export function visibleRows(ctx, tracked = {}) {
  const rows = allRows(ctx);
  const hidden = new Set(tracked.hidden || []);
  const order = tracked.order || [];
  const pos = (id) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length + rows.findIndex((r) => r.id === id) : i;
  };
  return rows.filter((r) => !hidden.has(r.id)).sort((a, b) => pos(a.id) - pos(b.id));
}

// A day of a row: { status: full|close|miss|none|rest|future, value }.
// value: the number its detail chart shows (null = nothing that day).
export function dayCell(row, key, ctx, today) {
  if (key > today) return { status: 'future', value: null };
  if (row.id === 'sleep') {
    const night = ctx.nights.get(key);
    if (!night) return { status: key === today ? 'none' : 'miss', value: null };
    return { status: nightGrade(evaluateNight(night, ctx.sleep)), value: Math.round((Number(night.durationMin) || 0) / 6) / 10 };
  }
  if (row.habit) {
    const entry = entryFor(row.habit, key, ctx.habitCtx);
    if (entry?.level === 'full') return { status: 'full', value: 1 };
    if (entry?.level === 'short') return { status: 'close', value: 0.5 };
    const due = row.habit.schedule?.type !== 'weekly' && isDue(row.habit, key);
    return { status: due && key < today ? 'miss' : due ? 'none' : 'rest', value: 0 };
  }
  if (row.id === 'workouts') {
    const n = (ctx.workouts.get(key) || []).length;
    return { status: n ? 'full' : 'rest', value: n };
  }
  if (row.id === 'weight') {
    const w = ctx.weightList.find((x) => x.date === key);
    return { status: w ? 'full' : 'none', value: w ? Number(w.kg) : null };
  }
  const meals = ctx.meals.get(key) || [];
  if (row.id === 'meals') {
    if (!meals.length) return { status: 'none', value: 0 };
    const n = meals.length;
    return { status: n <= NUTRITION.maxMeals ? 'full' : n <= NUTRITION.maxMeals + 1 ? 'close' : 'miss', value: n };
  }
  const grades = nutritionGrades(key, ctx);
  if (!grades) return { status: 'none', value: null };
  // Today isn't over: its grade is a "so far", never a miss yet.
  const open = (g) => (key === today && g === 'miss' ? 'none' : g);
  if (row.id === 'protein') return { status: open(grades.protein), value: Math.round(grades.proteinG) };
  if (row.id === 'calories') {
    const burn = grades.target + ctx.goals.calorieDeficit;
    return { status: open(grades.calories), value: Math.round(burn - grades.eaten) };
  }
  return { status: 'none', value: null };
}

// The 7 days of the week `today` is in (Sunday first).
export function weekDays(today) {
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => shiftDays(start, i));
}

// The calendar month of `today`: its days, with blanks before the 1st so
// the grid's columns are weekdays.
export function monthGrid(today) {
  const first = `${today.slice(0, 8)}01`;
  const lead = parseKey(first).getDay();
  const days = [];
  for (let k = first; k.slice(0, 7) === today.slice(0, 7); k = shiftDays(k, 1)) days.push(k);
  return [...Array(lead).fill(null), ...days];
}

// One short line under the row's name, over the shown days.
export function rowSummary(row, days, ctx, today) {
  const cells = days.filter(Boolean).filter((k) => k <= today).map((k) => dayCell(row, k, ctx, today));
  const count = (s) => cells.filter((c) => s.includes(c.status)).length;
  if (row.id === 'workouts') {
    const week = weekDays(today).filter((k) => k <= today && (ctx.workouts.get(k) || []).length).length;
    return `${week}/${ctx.workoutGoal} השבוע`;
  }
  if (row.id === 'weight') {
    const avg = trendAt(ctx.weightList, today);
    return avg ? `ממוצע שבועי ${Math.round(avg * 10) / 10} ק"ג` : 'אין שקילה השבוע';
  }
  if (row.id === 'sleep') {
    const hours = cells.map((c) => c.value).filter((v) => v);
    const avg = hours.length ? hours.reduce((s, v) => s + v, 0) / hours.length : 0;
    return `${count(['full', 'close'])} לילות ביעד${avg ? ` · ממוצע ${formatDuration(avg * 60)}` : ''}`;
  }
  if (row.id === 'meals') return `${count(['full'])} ימים עד ${NUTRITION.maxMeals} ארוחות`;
  if (row.id === 'protein') return `${count(['full'])} ימים ביעד ${fmt(ctx.goals.proteinTarget)}g`;
  if (row.id === 'calories') return `${count(['full'])} ימים ביעד`;
  return `${count(['full', 'close'])} מתוך ${cells.filter((c) => c.status !== 'rest').length}`;
}

// The detail chart's points: the last `n` days, oldest first.
export function rowSeries(row, today, ctx, n = 30) {
  const keys = Array.from({ length: n }, (_, i) => shiftDays(today, i - n + 1));
  return { keys, values: keys.map((k) => dayCell(row, k, ctx, today).value) };
}

export function formatRowValue(row, v) {
  if (v === null || v === undefined) return '—';
  if (row.id === 'sleep') return `${v} ש׳`;
  if (row.id === 'weight') return `${v} ק"ג`;
  if (row.id === 'protein') return `${fmt(v)}g`;
  if (row.id === 'calories') return `${fmt(v)}`;
  if (row.habit) return v >= 1 ? 'מלא' : v > 0 ? 'מקוצר' : '—';
  return fmt(v);
}
