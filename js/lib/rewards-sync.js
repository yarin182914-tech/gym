// Scoring the data into the points ledger (M4): when the app opens and a
// moment after every save (firestore.js fires 'gym-data-changed'), the days
// from the last one checked to today are scored (js/lib/rewards.js) and the
// ledger is raised where they earned more. Whoever wrote the data — the
// app or the coach — it scores the same.
//
// After each pass a 'gym-rewards' event carries { summary, writes, first }:
// the screens redraw their level bar from it, and js/ui/reward-moments.js
// turns the new points into "+10", confetti, badge toasts and level-ups.

import {
  getUserSettings, updateUserSettings, listSleep, listHabits, listHabitLogs, listDailyActivity,
  listNutritionEntries, listBodyWeights, listWorkouts, listPlannedWorkouts, listLedger, writeLedger,
} from './firestore.js';
import { REWARDS } from './rules.js';
import { normalizeHabit } from './habits.js';
import { dateKey } from './sleep.js';
import {
  buildContext, scoreDay, daysToScore, planLedgerWrites, applyWrites, rewardsSummary,
} from './rewards.js';

let ledger = null; // every entry, kept after the first read
let summary = null;
let lastCtx = null; // the data of the last pass — the progress screen reads it
let userDoc = {};
let timer = null;
let running = null;
let again = false;
let started = false;

const todayKey = () => dateKey(new Date());

export const rewardsState = () => summary;
export const rewardsLedger = () => ledger || [];
export const rewardsUserDoc = () => userDoc;
export const rewardsContext = () => lastCtx;

// Scores now and resolves when it's done — the progress screen waits on it
// so it shows today's data.
export async function syncRewardsNow() {
  clearTimeout(timer);
  run();
  while (running) await running;
}

// Once, after sign-in: score, then listen for saves.
export function startRewards() {
  if (started) return;
  started = true;
  window.addEventListener('gym-data-changed', () => requestRewardsSync());
  // Back to the app: the ledger is read again (another phone may have
  // added to it) and a day that ended meanwhile gets closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    ledger = null;
    requestRewardsSync(0);
  });
  requestRewardsSync(0);
}

export function requestRewardsSync(delay = REWARDS.syncDelayMs) {
  clearTimeout(timer);
  timer = setTimeout(run, typeof delay === 'number' ? delay : REWARDS.syncDelayMs);
}

// One pass at a time; a save during a pass runs one more after it.
async function run() {
  if (running) {
    again = true;
    return;
  }
  running = reconcile()
    .catch((err) => console.error('[rewards] scoring failed', err))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        run();
      }
    });
}

async function reconcile() {
  const today = todayKey();
  userDoc = await getUserSettings();
  const first = !userDoc.rewardsStartDate;
  const startDate = userDoc.rewardsStartDate || today;
  // The first run starts today: the past isn't scored.
  if (first) updateUserSettings({ rewardsStartDate: today }).catch(() => {});
  const days = daysToScore({ today, startDate, checkedThrough: userDoc.rewardsCheckedThrough });

  const soft = (p, fallback) => p.catch((err) => {
    console.error('[rewards] load failed', err);
    return fallback;
  });
  const span = REWARDS.catchUpMaxDays + 14;
  const [nights, habits, logs, activities, meals, weights, workouts, plans, loadedLedger] = await Promise.all([
    soft(listSleep(span), []),
    soft(listHabits(), []),
    soft(listHabitLogs(span), []),
    soft(listDailyActivity(span), []),
    soft(listNutritionEntries(span * 6), []),
    soft(listBodyWeights(span), []),
    soft(listWorkouts(500), []),
    soft(listPlannedWorkouts(span), []),
    ledger ? Promise.resolve(ledger) : listLedger(),
  ]);
  ledger = loadedLedger;

  const ctx = buildContext({
    userDoc, nights, habits: habits.map(normalizeHabit), logs, activities, meals, weights, workouts, plans,
  });
  lastCtx = ctx;
  const awards = days.flatMap((key) => scoreDay(key, ctx, { closed: key < today }));
  const writes = planLedgerWrites(awards, ledger);
  if (writes.length) {
    await writeLedger(writes.map(({ before, ...e }) => e));
    ledger = applyWrites(ledger, writes);
  }
  if (userDoc.rewardsCheckedThrough !== today) {
    userDoc.rewardsCheckedThrough = today;
    updateUserSettings({ rewardsCheckedThrough: today }).catch(() => {});
  }
  summary = rewardsSummary(ledger, today);
  window.dispatchEvent(new CustomEvent('gym-rewards', { detail: { summary, writes, first, today } }));
}

// The "already shown" markers for level-up, badges and the day summary
// (users/{uid}.rewardsSeen) — display state only, never the points.
export function markSeen(patch) {
  userDoc.rewardsSeen = { ...(userDoc.rewardsSeen || {}), ...patch };
  return updateUserSettings({ rewardsSeen: userDoc.rewardsSeen }).catch((err) => console.error('[rewards] seen failed', err));
}
