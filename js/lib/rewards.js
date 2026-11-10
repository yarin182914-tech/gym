// Points, levels and badges (M4). Pure functions — no DOM, no Firestore —
// so tools/test-rewards.mjs can run them under Node.
//
// Points come from the DATA, not from who wrote it: a meal the coach wrote
// scores like one typed in the app. scoreDay() turns one day's data into
// awards; planLedgerWrites() turns awards into users/{uid}/pointsLedger
// writes. Every award has one fixed id (`{date}_{rule}[_{ref}]`), so
// scoring the same day again — or a meal edited twice — never scores
// twice, and an entry is only ever raised, never lowered or deleted.
// Level, totals, streaks and badges are derived from the ledger here.
// All numbers: REWARDS in js/lib/rules.js.

import { REWARDS, NUTRITION, BAD_HABITS } from './rules.js';
import { evaluateNight, sleepSettings, shiftDays, dateKey } from './sleep.js';
import {
  habitContext, entryFor, isDone, isDue, weekStart, isBad, isGood, badMark, badDayLevel, slipReported,
  cleanRuns, cleanDaysThrough,
} from './habits.js';
import { totalOut } from './daily-activity.js';
import { exerciseKind, workoutDayKey, brokenSessionRecord } from './workout-types.js';
import { brokenCardioRecords } from './cardio.js';
import { toDate } from './format.js';

const P = REWARDS.points;

// Which part of the app an award belongs to (the ledger's `source`).
export const RULE_SOURCE = {
  'sleep-bedtime': 'sleep',
  'sleep-duration': 'sleep',
  habit: 'habit',
  'habit-week': 'habit',
  'meal-log': 'meal',
  calories: 'nutrition',
  protein: 'nutrition',
  'meal-count': 'nutrition',
  'weigh-in': 'weight',
  workout: 'workout',
  'workout-week': 'workout',
  pr: 'workout',
  'perfect-day': 'bonus',
  'bad-clean': 'habit',
  'bad-slip': 'habit',
  'bad-week': 'habit',
  'bad-streak': 'habit',
};

// Firestore ids can't hold '/', and stay short.
const slug = (s) => String(s ?? '').trim().replace(/[/\s]+/g, '-').slice(0, 60);
const awardId = (key, rule, ref) => `${key}_${rule}${ref ? `_${slug(ref)}` : ''}`;

// ---------- settings ----------

// The user doc's nutrition goals over the defaults. The deficit may be 0;
// every other goal must be above it.
export function nutritionGoals(userDoc = {}) {
  const result = { ...NUTRITION.defaults };
  for (const key of Object.keys(NUTRITION.defaults)) {
    const v = Number(userDoc[key]);
    if (Number.isFinite(v) && (v > 0 || (key === 'calorieDeficit' && v === 0))) result[key] = v;
  }
  return result;
}

export function weeklyWorkoutGoal(userDoc = {}) {
  const n = Number(userDoc.weeklyWorkoutGoal);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : REWARDS.weeklyWorkoutGoal;
}

// ---------- the day's context ----------

// data: { userDoc, nights, habits (normalized), logs, activities, meals,
// weights, workouts, plans, today? } — any order, any range. Indexed once.
// today (default: now) only decides which unreported days of a bad habit
// can still be filled in (js/lib/habits.js#cleanRuns).
export function buildContext(data) {
  const today = data.today || dateKey(new Date());
  const active = (data.habits || []).filter((h) => h.active !== false);
  const habitCtx = habitContext(data.logs || [], data.activities || [], data.workouts || []);
  const badHabits = active.filter(isBad);
  const byDay = (list, keyOf) => {
    const map = new Map();
    for (const item of list || []) {
      const k = keyOf(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return map;
  };
  const time = (v) => (v ? toDate(v).getTime() : 0);
  const meals = byDay(data.meals, (m) => dateKey(toDate(m.date)));
  for (const list of meals.values()) list.sort((a, b) => time(a.date) - time(b.date) || String(a.id).localeCompare(String(b.id)));
  const workouts = byDay(data.workouts, workoutDayKey);
  for (const list of workouts.values()) list.sort((a, b) => time(a.startTime || a.date) - time(b.startTime || b.date));
  return {
    userDoc: data.userDoc || {},
    sleep: sleepSettings(data.userDoc || {}),
    goals: nutritionGoals(data.userDoc || {}),
    workoutGoal: weeklyWorkoutGoal(data.userDoc || {}),
    nights: new Map((data.nights || []).map((n) => [n.date, n])),
    today,
    // Every active habit (the progress rows); good and bad apart for scoring.
    habits: active,
    goodHabits: active.filter(isGood),
    badHabits,
    habitCtx,
    badRuns: new Map(badHabits.map((h) => [h.id, cleanRuns(h, today, habitCtx)])),
    // The first habit log read when older ones weren't (null: all read).
    logsFrom: data.logsFrom || null,
    activities: new Map((data.activities || []).map((a) => [a.date || a.id, a])),
    meals,
    weights: new Set((data.weights || []).map((w) => w.date)),
    weightList: [...(data.weights || [])].sort((a, b) => (a.date < b.date ? 1 : -1)),
    workouts,
    plans: new Map((data.plans || []).map((p) => [p.date || p.id, p])),
    prs: prsByWorkout(data.workouts || []),
  };
}

// The records each workout set, judged against every workout before it:
// workoutId → [exercise name]. Strength: a heavier set than ever before in
// the same weighting and unit; cardio and sessions: their own records
// (js/lib/cardio.js, js/lib/workout-types.js). A first time is no record.
export function prsByWorkout(workouts) {
  const time = (w) => toDate(w.startTime || w.date).getTime();
  const sorted = [...(workouts || [])].sort((a, b) => time(a) - time(b));
  const strengthBest = new Map(); // name → Map(mode|unit → kg)
  const cardioPoints = new Map(); // activity → [{ date, sets }]
  const sessionPast = new Map(); // typeId → [saved session]
  const out = new Map();
  for (const w of sorted) {
    const names = [];
    const after = [];
    for (const ex of w.exercises || []) {
      const kind = exerciseKind(ex);
      if (kind === 'strength') {
        const best = strengthBest.get(ex.name) || new Map();
        const now = new Map();
        for (const s of ex.sets || []) {
          const k = `${s.weightMode || 'total'}|${s.weightUnit || 'kg'}`;
          now.set(k, Math.max(now.get(k) ?? -Infinity, Number(s.weight) || 0));
        }
        if ([...now].some(([k, kg]) => best.has(k) && kg > best.get(k))) names.push(ex.name);
        after.push(() => {
          for (const [k, kg] of now) best.set(k, Math.max(best.get(k) ?? -Infinity, kg));
          strengthBest.set(ex.name, best);
        });
      } else if (kind === 'cardio') {
        const past = cardioPoints.get(ex.activity) || [];
        if (brokenCardioRecords(ex.activity, past, ex.sets || []).length) names.push(ex.name);
        after.push(() => cardioPoints.set(ex.activity, [...past, { date: w.date, sets: ex.sets || [] }]));
      } else {
        const past = sessionPast.get(ex.typeId) || [];
        if (brokenSessionRecord(ex, past)) names.push(ex.name);
        after.push(() => sessionPast.set(ex.typeId, [...past, ex]));
      }
    }
    after.forEach((fn) => fn());
    if (names.length) out.set(w.id, [...new Set(names)]);
  }
  return out;
}

// ---------- one day ----------

const gradePoints = (table, grade) => (grade === 'full' || grade === 'free' ? table.full : grade === 'close' ? table.close : 0);

function award(key, rule, { ref = null, id = null, raw, grade = null, reason }) {
  return { id: id || awardId(key, rule, ref), date: key, source: RULE_SOURCE[rule], rule, ref, raw, grade, reason };
}

// Habits that count toward a perfect day: active daily / fixed-weekday ones
// due that day, which existed by then (N-per-week habits never block it).
function habitsDueFor(key, ctx) {
  return ctx.goodHabits.filter((h) => {
    if (h.schedule?.type === 'weekly' || !isDue(h, key)) return false;
    const created = h.createdAt ? dateKey(toDate(h.createdAt)) : null;
    return !created || created <= key;
  });
}

function doneThrough(habit, key, ctx) {
  let count = 0;
  for (let k = weekStart(key); k <= key; k = shiftDays(k, 1)) if (isDone(entryFor(habit, k, ctx.habitCtx))) count += 1;
  return count;
}

function workoutDaysThrough(key, ctx) {
  let count = 0;
  for (let k = weekStart(key); k <= key; k = shiftDays(k, 1)) if (ctx.workouts.get(k)?.length) count += 1;
  return count;
}

// The day-end grades for nutrition, or null with no meal logged (nothing
// to judge — an empty day isn't "under target").
export function nutritionGrades(key, ctx) {
  const meals = ctx.meals.get(key) || [];
  if (!meals.length) return null;
  const { goals } = ctx;
  const b = REWARDS.bands;
  const eaten = meals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
  const protein = meals.reduce((s, m) => s + (Number(m.proteinG) || 0), 0);
  const out = totalOut(ctx.activities.get(key));
  const burn = out ?? goals.calorieTarget + goals.calorieDeficit;
  const target = out === null ? goals.calorieTarget : Math.max(0, out - goals.calorieDeficit);
  let calories = 'miss';
  if (burn - eaten > b.maxDeficit) calories = 'miss';
  else if (eaten <= target) calories = 'full';
  else if (eaten <= target * (1 + b.caloriesCloseOver)) calories = 'close';
  const proteinGrade = protein >= goals.proteinTarget ? 'full' : protein >= goals.proteinTarget * b.proteinClose ? 'close' : 'miss';
  const n = meals.length;
  const mealCount = n <= NUTRITION.maxMeals ? 'full' : n <= NUTRITION.maxMeals + b.mealsCloseExtra ? 'close' : 'miss';
  return { calories, protein: proteinGrade, mealCount, eaten, target, proteinG: protein, meals: n };
}

// Every award the day's data earns. closed: the day is over — only then
// are calories, protein, meal count and the perfect day judged (and again
// later, if a burn or a meal arrives late; points only ever rise).
export function scoreDay(key, ctx, { closed }) {
  const out = [];
  const grades = {};

  // Sleep, logged under the morning. A flexible night's bedtime is free:
  // its points come automatically, only the duration is judged.
  const night = ctx.nights.get(key);
  if (night) {
    const ev = evaluateNight(night, ctx.sleep);
    grades['sleep-bedtime'] = ev.flexible ? 'free' : ev.onTime;
    grades['sleep-duration'] = ev.duration;
    const bed = gradePoints(P.sleepBedtime, grades['sleep-bedtime']);
    if (bed) out.push(award(key, 'sleep-bedtime', { raw: bed, grade: grades['sleep-bedtime'], reason: ev.flexible ? 'לילה גמיש — שעת השינה חופשית' : grades['sleep-bedtime'] === 'full' ? 'נרדמת בזמן' : 'נרדמת קרוב לזמן' }));
    const dur = gradePoints(P.sleepDuration, ev.duration);
    if (dur) out.push(award(key, 'sleep-duration', { raw: dur, grade: ev.duration, reason: ev.duration === 'full' ? 'ישנת מספיק' : 'ישנת כמעט מספיק' }));
  }

  // Habits: full / short, and the N-per-week bonus on the day it's reached.
  for (const h of ctx.goodHabits) {
    const entry = entryFor(h, key, ctx.habitCtx);
    if (!isDone(entry)) continue;
    out.push(award(key, 'habit', { ref: h.id, raw: P.habit[entry.level], grade: entry.level, reason: h.name }));
    if (h.schedule?.type === 'weekly' && doneThrough(h, key, ctx) === h.schedule.perWeek) {
      out.push(award(key, 'habit-week', { id: `${weekStart(key)}_habit-week_${slug(h.id)}`, ref: h.id, raw: P.habitWeek, reason: `${h.name} — יעד שבועי` }));
    }
  }

  // Meals: 5 for each logged, up to the day's planned meals.
  (ctx.meals.get(key) || []).slice(0, NUTRITION.maxMeals).forEach((m) => {
    out.push(award(key, 'meal-log', { ref: m.id, raw: P.mealLog, reason: 'ארוחה נרשמה' }));
  });

  if (ctx.weights.has(key)) out.push(award(key, 'weigh-in', { raw: P.weighIn, reason: 'שקילה' }));

  // Workouts: 30 for the day, 50 when the week's goal is reached, 20 a record.
  const workouts = ctx.workouts.get(key) || [];
  if (workouts.length) {
    out.push(award(key, 'workout', { ref: null, raw: P.workout, reason: 'אימון' }));
    if (workoutDaysThrough(key, ctx) === ctx.workoutGoal) {
      out.push(award(key, 'workout-week', { id: `${weekStart(key)}_workout-week`, raw: P.workoutWeek, reason: `${ctx.workoutGoal} אימונים השבוע` }));
    }
    for (const w of workouts) {
      for (const name of ctx.prs.get(w.id) || []) {
        out.push(award(key, 'pr', { ref: `${w.id}_${name}`, raw: P.pr, reason: `שיא אישי — ${name}` }));
      }
    }
  }

  // Bad habits: their own scoring (never part of the perfect day).
  for (const h of ctx.badHabits) out.push(...scoreBadHabit(h, key, ctx, { closed }));

  if (closed) {
    const n = nutritionGrades(key, ctx);
    if (n) {
      grades.calories = n.calories;
      grades.protein = n.protein;
      grades['meal-count'] = n.mealCount;
      const add = (rule, table, grade, reason) => {
        const raw = gradePoints(table, grade);
        if (raw) out.push(award(key, rule, { raw, grade, reason }));
      };
      add('calories', P.calories, n.calories, n.calories === 'full' ? 'קלוריות ביעד' : 'קלוריות קרוב ליעד');
      add('protein', P.protein, n.protein, n.protein === 'full' ? 'חלבון ביעד' : 'חלבון קרוב ליעד');
      add('meal-count', P.mealCount, n.mealCount, n.mealCount === 'full' ? 'מספר הארוחות ביעד' : 'ארוחה אחת מעבר');
    }
    if (isPerfectDay(key, ctx, grades)) out.push(award(key, 'perfect-day', { raw: P.perfectDay, reason: 'יום מושלם' }));
  }
  return out;
}

// One bad habit's day (BAD_HABITS in rules.js). Right away: 2 for an
// honest slip (or over-the-limit) report. Once the day is over — so a
// "clean" tapped before a later slip can't keep its 10 — the clean day
// 10 / 5, the week's clean-days bonus, and the clean-streak milestones,
// each once per streak (its id carries the streak's first day).
export function scoreBadHabit(h, key, ctx, { closed }) {
  const out = [];
  const B = BAD_HABITS.points;
  const mark = badMark(h, key, ctx.habitCtx);
  if (slipReported(h, mark)) {
    out.push(award(key, 'bad-slip', { ref: h.id, raw: B.slipLog, reason: `${h.name} — רישום כן` }));
  }
  if (!closed) return out;
  const level = badDayLevel(h, mark);
  const raw = level === 'full' ? B.clean.full : level === 'short' ? B.clean.short : 0;
  if (raw) out.push(award(key, 'bad-clean', { ref: h.id, raw, grade: level, reason: level === 'full' ? `${h.name} — יום נקי` : `${h.name} — כמעט נקי` }));
  if (level === 'full' && cleanDaysThrough(h, key, ctx.habitCtx) === h.cleanWeekTarget) {
    out.push(award(key, 'bad-week', {
      id: `${weekStart(key)}_bad-week_${slug(h.id)}`, ref: h.id, raw: B.weekBonus, reason: `${h.name} — ${h.cleanWeekTarget} ימים נקיים השבוע`,
    }));
  }
  const run = (ctx.badRuns.get(h.id) || []).find((r) => r.days.includes(key));
  // A streak reaching back past the logs read has an unknown start — its
  // milestones would land on shifting ids, so none are given for it.
  if (run && !(ctx.logsFrom && run.start <= ctx.logsFrom)) {
    const n = run.days.indexOf(key) + 1;
    const milestone = BAD_HABITS.streakMilestones.find((m) => m.days === n);
    if (milestone) {
      out.push(award(key, 'bad-streak', {
        id: `${run.start}_bad-streak_${slug(h.id)}_${n}`, ref: h.id, raw: milestone.points, grade: String(n),
        reason: `${h.name} — ${n} ימים נקיים ברצף`,
      }));
    }
  }
  return out;
}

export function isPerfectDay(key, ctx, grades) {
  const rule = REWARDS.perfectDay;
  for (const [part, ok] of Object.entries(rule.needs)) if (!ok.includes(grades[part])) return false;
  if (rule.allHabitsDue && !habitsDueFor(key, ctx).every((h) => isDone(entryFor(h, key, ctx.habitCtx)))) return false;
  if (rule.workoutWhenPlanned) {
    const plan = ctx.plans.get(key);
    if (plan && plan.status !== 'skipped' && !(ctx.workouts.get(key) || []).length) return false;
  }
  return true;
}

// The days to score: from the last day checked (less rescoreDays, for late
// logs) or the start, to today — never more than catchUpMaxDays.
export function daysToScore({ today, startDate, checkedThrough }) {
  const start = startDate || today;
  let from = checkedThrough ? shiftDays(checkedThrough, -REWARDS.rescoreDays) : start;
  if (from < start) from = start;
  const earliest = shiftDays(today, -(REWARDS.catchUpMaxDays - 1));
  if (from < earliest) from = earliest;
  const days = [];
  for (let k = from; k <= today; k = shiftDays(k, 1)) days.push(k);
  return days;
}

// ---------- awards → ledger writes ----------

// ledger: the existing entries ({ id, date, rule, points, raw }). Returns
// the entries to write, each with `before` (its points until now). Upward
// only: an entry's points never drop, a missing award deletes nothing.
// The daily cap counts capped rules only; perDay limits a rule's entries.
export function planLedgerWrites(awards, ledger) {
  const byId = new Map((ledger || []).map((e) => [e.id, e]));
  const daySum = new Map();
  const dayRuleCount = new Map();
  const capped = (rule) => !REWARDS.uncapped.includes(rule);
  for (const e of ledger || []) {
    if (capped(e.rule)) daySum.set(e.date, (daySum.get(e.date) || 0) + (e.points || 0));
    const k = `${e.date}|${e.rule}`;
    dayRuleCount.set(k, (dayRuleCount.get(k) || 0) + 1);
  }
  const writes = [];
  for (const a of awards) {
    const existing = byId.get(a.id);
    const countKey = `${a.date}|${a.rule}`;
    const limit = REWARDS.perDay[a.rule];
    if (!existing && limit !== undefined && (dayRuleCount.get(countKey) || 0) >= limit) continue;
    const base = existing?.points || 0;
    let points;
    if (capped(a.rule)) {
      const room = REWARDS.dailyCap - ((daySum.get(a.date) || 0) - base);
      points = Math.max(base, Math.min(a.raw, room));
    } else {
      points = Math.max(base, a.raw);
    }
    const raw = Math.max(a.raw, existing?.raw || 0);
    if (existing && points === base && raw === (existing.raw || 0)) continue;
    if (!existing && points <= 0) continue;
    const entry = { ...existing, ...a, points, raw, before: base };
    byId.set(a.id, entry);
    writes.push(entry);
    if (capped(a.rule)) daySum.set(a.date, (daySum.get(a.date) || 0) - base + points);
    if (!existing) dayRuleCount.set(countKey, (dayRuleCount.get(countKey) || 0) + 1);
  }
  return writes;
}

// The ledger after the writes.
export function applyWrites(ledger, writes) {
  const byId = new Map((ledger || []).map((e) => [e.id, e]));
  for (const w of writes) {
    const { before, ...entry } = w;
    byId.set(w.id, entry);
  }
  return [...byId.values()];
}

// ---------- derived: totals, level, streaks, badges ----------

export function pointsByDay(ledger) {
  const map = new Map();
  for (const e of ledger || []) map.set(e.date, (map.get(e.date) || 0) + (e.points || 0));
  return map;
}

export const totalPoints = (ledger) => (ledger || []).reduce((s, e) => s + (e.points || 0), 0);

// → { level, name, min, next (the next level, or null), toNext, progress
// 0–1, unlock, reward }.
export function levelInfo(total) {
  const levels = REWARDS.levels;
  let i = 0;
  while (i + 1 < levels.length && total >= levels[i + 1].min) i += 1;
  const cur = levels[i];
  const next = levels[i + 1] || null;
  return {
    ...cur,
    next,
    toNext: next ? next.min - total : 0,
    progress: next ? (total - cur.min) / (next.min - cur.min) : 1,
  };
}

const matches = (e, def) => e.rule === def.rule && (!def.grades || def.grades.includes(e.grade));

// Days in a row (ending on `today`, or yesterday while today has none yet)
// with an entry of the rule — e.g. the calories streak.
export function ledgerStreak(ledger, rule, grades, today) {
  const days = new Set((ledger || []).filter((e) => matches(e, { rule, grades })).map((e) => e.date));
  let key = days.has(today) ? today : shiftDays(today, -1);
  let count = 0;
  while (days.has(key)) {
    count += 1;
    key = shiftDays(key, -1);
  }
  return count;
}

// Each badge with the day it was earned, or null — worked out from the
// ledger alone, never stored.
export function badgesFrom(ledger) {
  const sorted = [...(ledger || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return REWARDS.badges.map((def) => ({ ...def, earnedOn: earnedOn(def, sorted) }));
}

function earnedOn(def, sorted) {
  const hits = sorted.filter((e) => matches(e, def));
  if (def.kind === 'first') return hits[0]?.date || null;
  if (def.kind === 'count') {
    if (def.unit === 'days') {
      const days = [...new Set(hits.map((e) => e.date))];
      return days.length >= def.n ? days[def.n - 1] : null;
    }
    return hits.length >= def.n ? hits[def.n - 1].date : null;
  }
  if (def.kind === 'streak') {
    const days = [...new Set(hits.map((e) => e.date))];
    let run = 0;
    for (let i = 0; i < days.length; i += 1) {
      run = i > 0 && shiftDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
      if (run >= def.n) return days[i];
    }
    return null;
  }
  if (def.kind === 'month') {
    const perMonth = new Map();
    for (const e of hits) {
      const m = e.date.slice(0, 7);
      perMonth.set(m, (perMonth.get(m) || 0) + 1);
      if (perMonth.get(m) === def.n) return e.date;
    }
    return null;
  }
  if (def.kind === 'comeback') {
    // At the target again right after a day with meals logged that wasn't.
    const atTarget = new Set(hits.map((e) => e.date));
    const logged = new Set(sorted.filter((e) => e.rule === 'meal-log').map((e) => e.date));
    for (const day of [...atTarget].sort()) {
      const prev = shiftDays(day, -1);
      if (logged.has(prev) && !atTarget.has(prev)) return day;
    }
    return null;
  }
  return null;
}

// Everything the screens show, from the ledger.
export function rewardsSummary(ledger, today) {
  const total = totalPoints(ledger);
  const byDay = pointsByDay(ledger);
  return {
    total,
    today: byDay.get(today) || 0,
    level: levelInfo(total),
    badges: badgesFrom(ledger),
    byDay,
  };
}
