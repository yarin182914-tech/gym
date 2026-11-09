// Every tunable number in the app's scoring and habit rules, in one place —
// ירין hasn't finalised them, so they're kept here rather than scattered
// through the screens. Values are the plan's defaults (docs/upgrade-plan.md).

export const SLEEP = {
  // "Close" (partial credit): up to this many minutes past the bedtime
  // target, or short of the minimum duration.
  closeWindowMin: 30,
  // Under this many hours a night never counts, whatever the settings.
  hardMinHours: 6,
  // A bedtime at or after this hour belongs to the evening before the
  // morning the night is logged under; earlier is past midnight, on the
  // morning's own date. Only the bedtime — waking is always that morning.
  eveningFromHour: 12,
  // Nights listed on the "שינה" screen, this morning's included.
  historyNights: 30,
  // Settings for a user who hasn't set their own (users/{uid} fields).
  defaults: {
    sleepBedtimeTarget: '22:30',
    sleepBedtimeLatest: '23:00',
    sleepWakeTime: '06:30',
    sleepMinHours: 8,
    // Evening weekdays (0 = Sunday … 6 = Saturday) whose night counts
    // duration only: Thursday and Friday night.
    sleepFlexibleNights: [4, 5],
    // Optional per-evening-weekday bedtime targets, e.g. { 6: '23:00' }.
    sleepBedtimeByWeekday: {},
  },
};

export const HABITS = {
  // Points per day — awarded from M4 (rewards); kept here so the habit
  // card and the ledger agree on them.
  points: { full: 10, short: 5 },
  // Meeting an N-per-week target; over-target days earn the usual points only.
  weeklyBonus: 20,
  // Weeks run Sunday → Saturday (0 = Sunday), Israel style.
  weekStartsOn: 0,
  // How many days of logs the "היום" screen loads — also how far back a
  // streak can see.
  logDaysToLoad: 120,
  // How many days back a forgotten habit can still be marked on "היום".
  backfillDays: 7,
  // Holding a habit card this long undoes its mark.
  longPressMs: 550,
  // The "next step" card: the morning (log sleep) ends at this hour, the
  // evening (mark habits) starts at this one.
  morningUntilHour: 12,
  eveningFromHour: 18,
};

// Calories out (dailyActivity, see docs/DATA.md). The base is resting +
// daily life — Mifflin-St Jeor BMR × 1.2, sedentary — until M10 makes it
// personal. Each saved day keeps the base it was saved with.
export const ACTIVITY = {
  baseKcal: 1950,
  kcalPerStep: 0.04,
};

// Steps from the iPhone: an iOS Shortcut opens #/import?steps=N&date=…
// (js/pages/import.js) and the "חיבורים" page explains how to set it up.
export const STEPS_IMPORT = {
  maxSteps: 100000,
  // How far back `date` may go; today is 0. Never in the future.
  maxDaysBack: 7,
  // The day `date` defaults to, and the window it's checked against.
  timeZone: 'Asia/Jerusalem',
  // "חיבורים" hints that something's wrong after this long with no import.
  staleAfterDays: 2,
  // How many days of dailyActivity the "חיבורים" page reads for the
  // last import.
  statusDays: 30,
  // The ready-made shortcut, shared from iCloud. ירין publishes it once;
  // while it's empty the "הוספת הקיצור" button stays off.
  shortcutUrl: '',
  shortcutName: 'ג׳ימי צעדים',
  // Suggested time for the daily automation (shown in the how-to).
  automationTime: '21:00',
};
