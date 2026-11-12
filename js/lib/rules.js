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
  // The silent shortcut (posts to /api/steps), shared from iCloud with an
  // import question that asks for the personal key. ירין publishes it once;
  // while it's empty, "חיבורים" shows the build-it-yourself steps instead.
  silentShortcutUrl: 'https://www.icloud.com/shortcuts/9554d3d8965744319559cd1bc51cd7cd',
  // Suggested time for the daily automation (shown in the how-to).
  automationTime: '21:00',
};

// App time from the iPhone (M3e): one shared shortcut, run by an "app
// opened" and an "app closed" automation per app, posts to /api/usage; the
// minutes between them fill that app's part of a limit habit (e.g.
// אינסטגרם in "אינסטגרם + פייסבוק"). See docs/DATA.md "App usage".
export const USAGE = {
  // Ready-made choices on חיבורים. Any other app can be added by name.
  // `name`: Hebrew, also the habit part (or habit name) the minutes go
  // into and the word typed in the automation; `ios`: how the app is
  // called in the iPhone's app list; `aliases`: other names the shortcut
  // may send.
  apps: {
    instagram: { name: 'אינסטגרם', ios: 'Instagram', aliases: ['instagram', 'insta'] },
    facebook: { name: 'פייסבוק', ios: 'Facebook', aliases: ['facebook', 'fb'] },
    tiktok: { name: 'טיקטוק', ios: 'TikTok', aliases: ['tiktok', 'tik tok'] },
    youtube: { name: 'יוטיוב', ios: 'YouTube', aliases: ['youtube'] },
    whatsapp: { name: 'וואטסאפ', ios: 'WhatsApp', aliases: ['whatsapp', 'ווטסאפ'] },
    x: { name: 'X', ios: 'X', aliases: ['twitter', 'טוויטר'] },
    snapchat: { name: 'סנאפצ׳ט', ios: 'Snapchat', aliases: ['snapchat', 'סנאפ'] },
    netflix: { name: 'נטפליקס', ios: 'Netflix', aliases: ['netflix'] },
  },
  // How many apps one user can pick, and the longest custom name.
  maxApps: 12,
  maxNameLength: 24,
  // The words after the app's name in the automation's text.
  events: {
    open: ['open', 'opened', 'נפתח', 'נפתחת', 'פתיחה'],
    close: ['close', 'closed', 'נסגר', 'נסגרת', 'סגירה'],
  },
  // A session longer than this is a missed "closed" — not counted.
  maxSessionMin: 120,
  // The shared shortcut: an iCloud link with an import question for the
  // key. ירין publishes it once; while empty, חיבורים shows how to build
  // it by hand.
  shortcut: { url: 'https://www.icloud.com/shortcuts/76affd04dd904b5787f46b69de045895', name: 'ג׳ימי זמן באפליקציה' },
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

// Saves stop waiting for the server after this long; the write is already
// in the phone's local copy and syncs by itself (js/lib/firestore.js).
export const WRITE_WAIT_MS = 1500;

// Nutrition goals for a user who hasn't set their own (users/{uid} fields,
// set in the nutrition screen's "יעדים" sheet), and the eating plan's
// meals a day (lunch and dinner).
export const NUTRITION = {
  defaults: {
    calorieDeficit: 250,
    calorieTarget: 2000,
    proteinTarget: 120,
    carbsTarget: 250,
    fatTarget: 65,
  },
  maxMeals: 2,
};

// Bad habits (M5, plan: "הרגלים רעים: אשף גמילה"). A day is clean only
// when reported ("יום נקי ✓", or the coach's mark); an unreported day
// scores nothing and shows as unknown. A slip never takes points away.
export const BAD_HABITS = {
  points: {
    // At day close: a reported clean day / one slip or within the short limit.
    clean: { full: 10, short: 5 },
    // Logging a slip (or an over-the-limit day) honestly, once a day.
    slipLog: 2,
    // The week's clean days reach the habit's target (outside the daily cap).
    weekBonus: 20,
  },
  // Clean days a week for the bonus, unless the habit sets its own.
  cleanWeekTarget: 5,
  // Slips a day that still count as "מקוצר" on a slip counter.
  shortSlips: 1,
  // An unreported day can be filled in this many days back (the day strip);
  // older and still empty, it ends the clean streak.
  fillInDays: HABITS.backfillDays,
  // Clean-streak bonuses, each once per streak, outside the daily cap.
  // The one with `badge` also earns that badge ("נגמל").
  streakMilestones: [
    { days: 3, points: 15 },
    { days: 7, points: 30 },
    { days: 14, points: 60 },
    { days: 30, points: 120 },
    { days: 66, points: 250, badge: 'quit' },
    { days: 100, points: 400 },
  ],
  // Milestones from this many days on get confetti too.
  confettiFromDays: 30,
  // "מעדתי" can be undone from its toast for this long.
  slipUndoMs: 5000,
};

// Points, levels and badges (M4) — the plan's values ("שלב 2: תכנית
// התגמול"). Points are worked out from the data (js/lib/rewards.js) and
// written to users/{uid}/pointsLedger; they never go down.
export const REWARDS = {
  // A day's points stop here — except the rules in `uncapped`, so a good
  // day never loses its bonus.
  dailyCap: 200,
  uncapped: ['habit-week', 'workout-week', 'pr', 'perfect-day', 'bad-week', 'bad-streak'],
  points: {
    sleepBedtime: { full: 20, close: 10 },
    sleepDuration: { full: 15, close: 8 },
    habit: HABITS.points,
    habitWeek: HABITS.weeklyBonus,
    calories: { full: 30, close: 15 },
    protein: { full: 10, close: 5 },
    mealCount: { full: 10, close: 5 },
    mealLog: 5,
    workout: 30,
    pr: 20,
    workoutWeek: 50,
    weighIn: 5,
    perfectDay: 30,
  },
  // Partial ("close") scoring.
  bands: {
    // Calories: at most the target → full; up to this much over → close.
    caloriesCloseOver: 0.1,
    // A deficit bigger than this scores nothing (no rewarding extremes).
    maxDeficit: 1000,
    // Protein: the target or more → full; this share of it or more → close.
    proteinClose: 0.8,
    // Meals: at most maxMeals → full; this many more → close.
    mealsCloseExtra: 1,
  },
  // At most this many awards of a rule per day (a deleted meal keeps its
  // points, so a new one mustn't add a third).
  perDay: { 'meal-log': NUTRITION.maxMeals, workout: 1, 'weigh-in': 1 },
  // Workout days a week for the weekly bonus (users/{uid}.weeklyWorkoutGoal).
  weeklyWorkoutGoal: 3,
  // A perfect day needs every one of these. Sleep: both parts (a flexible
  // night's bedtime counts as 'free'). Habits: every daily / fixed-weekday
  // habit due that day, done. A workout only on a day the coach planned
  // one (and it wasn't marked "לא היום"); a rest day never blocks it.
  perfectDay: {
    needs: {
      'sleep-bedtime': ['full', 'free'],
      'sleep-duration': ['full'],
      calories: ['full'],
      protein: ['full'],
      'meal-count': ['full'],
    },
    allHabitsDue: true,
    workoutWhenPlanned: true,
  },
  // Catch-up: scoring runs from the last day checked (users/{uid}
  // .rewardsCheckedThrough) — re-checking this many days before it, for
  // late logs and late burns — up to today, at most catchUpMaxDays days.
  rescoreDays: 7,
  // Days of habit logs read for scoring — enough for the longest
  // bad-habit streak milestone with room to spare.
  habitLogsToLoad: 400,
  catchUpMaxDays: 31,
  // A save is scored this long after it (several quick taps → one pass).
  syncDelayMs: 300,
  // The "+10" floats from where you tapped if it was this recent.
  floatAnchorMs: 4000,
  levels: [
    { level: 1, name: 'צעד ראשון', min: 0, unlock: 'המסך הבסיסי ויום חסד אחד בשבוע' },
    { level: 2, name: 'בתנועה', min: 500, unlock: 'ערכת צבעים חדשה' },
    { level: 3, name: 'מתמיד', min: 1500, unlock: 'אנימציית חגיגה וצליל חדשים' },
    { level: 4, name: 'בונה הרגלים', min: 3000, unlock: 'יום חסד שני בשבוע' },
    { level: 5, name: 'מכונה', min: 6000, unlock: 'מסך מגמות: שינה, משקל והרגלים לאורך זמן' },
    { level: 6, name: 'ברזל', min: 10000, unlock: 'הפרס האמיתי שבחרת', reward: true },
    { level: 7, name: 'אגדה', min: 16000, unlock: 'פרס אמיתי גדול ותג זהב קבוע', reward: true },
  ],
  // Badges, derived from the ledger. kind: first (the first entry of the
  // rule), streak (n days in a row), count (n entries, or n days with
  // unit 'days'), month (n entries in one calendar month), comeback.
  badges: [
    { id: 'sleep-first', area: 'sleep', name: 'לילה ראשון בזמן', icon: 'moon', kind: 'first', rule: 'sleep-bedtime', grades: ['full'] },
    { id: 'sleep-7', area: 'sleep', name: '7 לילות ברצף', icon: 'moon', kind: 'streak', rule: 'sleep-duration', n: 7 },
    { id: 'sleep-30', area: 'sleep', name: '30 לילות', icon: 'moon', kind: 'count', rule: 'sleep-duration', n: 30 },
    { id: 'sleep-8h-week', area: 'sleep', name: 'שבוע שלם של שינה מלאה', icon: 'moon', kind: 'streak', rule: 'sleep-duration', grades: ['full'], n: 7 },
    { id: 'perfect-first', area: 'habits', name: 'יום מושלם ראשון', icon: 'sparkles', kind: 'first', rule: 'perfect-day' },
    { id: 'perfect-3', area: 'habits', name: '3 ימים מושלמים ברצף', icon: 'sparkles', kind: 'streak', rule: 'perfect-day', n: 3 },
    { id: 'perfect-week', area: 'habits', name: 'שבוע מושלם', icon: 'sparkles', kind: 'streak', rule: 'perfect-day', n: 7 },
    { id: 'habits-100', area: 'habits', name: '100 סימונים', icon: 'check', kind: 'count', rule: 'habit', n: 100 },
    { id: 'clean-first', area: 'habits', name: 'יום נקי ראשון', icon: 'check', kind: 'first', rule: 'bad-clean', grades: ['full'] },
    { id: 'quit', area: 'habits', name: 'נגמל', icon: 'sparkles', kind: 'first', rule: 'bad-streak', grades: BAD_HABITS.streakMilestones.filter((m) => m.badge === 'quit').map((m) => String(m.days)) },
    { id: 'calories-7', area: 'nutrition', name: '7 ימים ביעד הקלורי', icon: 'target', kind: 'streak', rule: 'calories', grades: ['full'], n: 7 },
    { id: 'protein-week', area: 'nutrition', name: 'שבוע חלבון מלא', icon: 'utensils', kind: 'streak', rule: 'protein', grades: ['full'], n: 7 },
    { id: 'logged-30', area: 'nutrition', name: '30 ימים מתועדים', icon: 'utensils', kind: 'count', rule: 'meal-log', unit: 'days', n: 30 },
    { id: 'week-goal-first', area: 'workouts', name: 'יעד שבועי ראשון', icon: 'dumbbell', kind: 'first', rule: 'workout-week' },
    { id: 'workouts-12', area: 'workouts', name: '12 אימונים בחודש', icon: 'dumbbell', kind: 'month', rule: 'workout', n: 12 },
    { id: 'pr-first', area: 'workouts', name: 'שיא אישי', icon: 'trophy', kind: 'first', rule: 'pr' },
    { id: 'pr-5', area: 'workouts', name: '5 שיאים בחודש', icon: 'trophy', kind: 'month', rule: 'pr', n: 5 },
    { id: 'comeback', area: 'general', name: 'קאמבק', icon: 'undo-2', kind: 'comeback', rule: 'calories', grades: ['full'] },
    // "מחליט בזמן" (M6b): n decisions in a row on time — kind run counts
    // consecutive entries of the rule, any late one starts it over.
    { id: 'decide-5', area: 'general', name: '5 החלטות בזמן ברצף', icon: 'split', kind: 'run', rule: 'decision', grades: ['on-time'], n: 5 },
    { id: 'decide-20', area: 'general', name: '20 החלטות בזמן ברצף', icon: 'split', kind: 'run', rule: 'decision', grades: ['on-time'], n: 20 },
    { id: 'decide-50', area: 'general', name: '50 החלטות בזמן ברצף', icon: 'split', kind: 'run', rule: 'decision', grades: ['on-time'], n: 50 },
  ],
};

// "ללמוד" (M8b): the areas where your own data is weakest go first.
export const LIBRARY_RULES = {
  // Days looked back at for "weak".
  lookbackDays: 7,
  // Sleep counts as weak only with at least this many nights logged.
  minNights: 3,
  // Areas in order when nothing is weak.
  defaultOrder: ['sleep', 'training', 'nutrition', 'habits', 'mind', 'longevity'],
};

// The Claude connector (M11): a remote MCP server at /api/mcp that reads
// and writes the user's own data with a personal key (see docs/DATA.md,
// "Claude connector keys"). Read by the "חיבורים" card and by the server.
export const MCP = {
  // A key is this prefix + keyBytes random bytes, base64url. Only its
  // SHA-256 is stored.
  keyPrefix: 'gymi_',
  keyBytes: 32,
  // Characters of the key kept in the clear, so a key can be recognised
  // on the card ("gymi_AbCd…").
  previewChars: 9,
  // Active keys per user — one per Claude account is the usual case.
  maxKeysPerUser: 3,
  // The server remembers a key → user lookup this long, so a revoked key
  // stops working within this time.
  keyCacheMs: 60 * 1000,
  // lastUsedAt on the key is refreshed at most this often.
  touchEveryMs: 10 * 60 * 1000,
  // Read tools: days looked back when not asked, and the most allowed.
  defaultDays: 7,
  maxDays: 60,
  // Workouts listed at most per call (they're big).
  maxWorkouts: 30,
  // "What changed": with no earlier check and no `since`, this far back.
  changesDefaultHours: 24,
  // Writes are accepted for dates up to this many days back, never ahead.
  writeDaysBack: 14,
  // Sanity limits on written numbers.
  limits: {
    calories: [0, 5000],
    macroG: [0, 500],
    kg: [25, 300],
    steps: [0, 100000],
    habitValue: [0, 100000],
  },
};

// Tasks (M6) — the plan's "דף המשימות" and "מניעת דחיינות".
export const TASKS = {
  // Points by size; an important task is worth `importantFactor` times as
  // much; done on or before its due date adds `onTimeBonus`. A late task
  // still earns its points — never a penalty.
  points: { S: 5, M: 15, L: 30 },
  importantFactor: 2,
  onTimeBonus: 5,
  // A daily task is "do and mark" — worth a small one, so the points don't
  // inflate (the plan: "כמו הרגל מקוצר").
  dailyPoints: 5,
  // "התחלתי 10 דקות" on a stuck task, once per task.
  startBonus: 5,
  // Due within this many days (today included) counts as urgent.
  urgentDays: 2,
  // At most this many important tasks a day; more is itself a reason to put off.
  maxImportantPerDay: 3,
  // On the home screen ("היום").
  homeCount: 3,
  // The procrastination ladder for a task with no time (days since it was added).
  ladder: { waiting: 7, stuck: 14, decide: 21 },
  // Moved this many times → the "why stuck?" question too.
  stuckAfterPostpones: 3,
  // Days of a repeating task's done marks kept on its doc.
  keepDoneDays: 120,
  // A monthly task's day is picked from 1 to this (every month has it).
  maxMonthDay: 28,
};

// Decisions (M6b) — the plan's "קבלת החלטות: "להחליט"". The reward is for
// deciding in time, never for being "right"; nothing is ever taken away.
export const DECISIONS = {
  // Time budgets from startedAt. Medium: 10 minutes, or until the end of
  // the next day (Israel time), whichever is later.
  // Large (M6c): no minutes — a decide-by date, a week from the start by
  // default, on time until that day ends.
  budgetSec: { small: 120, medium: 600, large: 7 * 86400 },
  mediumDaysToDecide: 1,
  decideByDays: 7,
  points: {
    small: { onTime: 5, late: 2 },
    medium: { onTime: 15, late: 5 },
    large: { onTime: 40, late: 10 },
  },
  // Decided without reopening it (a second draw, a changed choice).
  firstChoiceBonus: 5,
  // An open decision with no decide-by date: days since it was added.
  ladder: { setDate: 7, missing: 14 },
  minOptions: 2,
  minOptionsLarge: 3,
  maxOptions: 4,
  maxCriteria: 3,
  weights: [1, 2, 3],
  scoreRange: [1, 5],
  // Good enough: the option's weighted average (1–5) reaches this.
  goodEnough: 3.5,
  // The nearest open decision on "היום".
  homeCount: 1,
  // The feet game (js/ui/choosers/feet.js): the drum roll's length, the
  // beat it starts and ends on, the hush before the toe, and the toe.
  game: { drumMs: 2400, firstBeatMs: 260, lastBeatMs: 70, hushMs: 500, toeMs: 600 },
  // "איך זה יצא?" (M6e): days after deciding, per track (small: never).
  // The answer is worth the same whatever it says; homeReviewCount lines
  // of it on "היום".
  reviewDays: { medium: 30, large: 90 },
  review: 3,
  homeReviewCount: 1,
};

// Google Calendar sync (M7): a one-off task with a time or a day gets an
// event in the user's primary calendar (docs/specs/calendar-sync.md). Read
// by the app and by the server (api/calendar.js).
export const CALENDAR = {
  // Length of a timed event, by the task's size (minutes).
  durationMin: { S: 15, M: 60, L: 120 },
  // Open tasks pushed to the calendar right after connecting, at most.
  connectSyncMax: 50,
  // Task ids the server takes in one sync request.
  batchSize: 20,
  // Task ids kept on the device while waiting for a network (room for
  // the whole push after connecting).
  retryMax: 60,
  // A moment after a save before the calendar is told, so a burst of
  // edits goes out as one request.
  syncDelayMs: 1500,
  timeZone: 'Asia/Jerusalem',
  // Written in the event's description.
  appUrl: 'https://gym-yarin9.vercel.app/#/tasks',
  // The consent link is good for this long.
  stateTtlMs: 10 * 60 * 1000,
};
