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
