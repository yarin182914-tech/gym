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
  shortcutUrl: 'https://www.icloud.com/shortcuts/18d3b3748dc544c2b28928cb007d90d9',
  shortcutName: 'ג׳ימי צעדים',
  // Suggested time for the daily automation (shown in the how-to).
  automationTime: '21:00',
};

// Workout burn (M3b) — kcal = MET × body kg × hours, summed per day into
// dailyActivity.workoutKcal by the app (see docs/DATA.md). METs are the
// usual Compendium-of-Physical-Activities values.
export const WORKOUTS = {
  // Used when there's no weigh-in on or before the workout's day.
  defaultBodyKg: 70,
  // A session logged without an effort counts as this one.
  defaultRpe: 5,
  // A session's MET is its type's value at effort 5, scaled by effort:
  // base + perPoint × rpe — effort 5 = ×1, effort 10 = ×1.4, effort 1 = ×0.68.
  rpeFactor: { base: 0.6, perPoint: 0.08 },
  sessionMet: {
    functional: 6,
    crossfit: 7.5,
    pilates: 3,
    yoga: 2.5,
    swim: 7,
    studio: 7,
    sport: 6,
    ski: 5.3,
  },
  // A type of the user's own.
  customMet: 5,
  // Strength: ~250 kcal/hour at 70 kg. Its time is the workout's length
  // minus its cardio and sessions; a workout logged without a time of day
  // has no real length, so it counts minutes per set instead.
  strengthMet: 3.5,
  strengthMinPerSet: 2.5,
  strengthMaxMin: 180,
  // Treadmill walk/run with a speed uses the ACSM equations; without one,
  // the segment's effort picks a MET here.
  cardioMet: {
    walk: { easy: 3, moderate: 3.5, fast: 4.5 },
    run: { easy: 8, moderate: 9.8, hard: 11.5 },
    bike: 7,
    stairs: 9,
  },
  // Outdoor walks and runs are already in the phone's step count
  // (dailyActivity.steps), so they add nothing here — history and streaks only.
  freeWalkRunKcal: 0,
};
