// What the + button offers (js/ui/quick-add.js), and which of them a screen
// puts first. Pure — tested by tools/test-quick-actions.mjs.
//
// Each item opens the form that already exists for it, on its own screen:
//   אימון  → אימון, a new workout with the exercise picker open
//   הליכה  → אימון, a new workout with a walk ready to fill in
//   ארוחה  → תזונה, the add-meal form
//   שקילה  → תזונה, the morning weigh-in card
//   צעדים  → תזונה, today's activity sheet
//   שינה   → שינה, last night's sheet
//   הרגל   → היום: a new habit when asked for on היום itself, the habits
//            list (to mark one) from any other screen
//   משימה  → משימות, one line into the inbox
//   החלטה  → משימות, להחליט, a new decision

export const QUICK_ITEMS = [
  { route: 'session', action: 'workout', icon: 'dumbbell', label: 'אימון' },
  { route: 'session', action: 'walk', icon: 'walk', label: 'הליכה' },
  { route: 'nutrition', action: 'meal', icon: 'utensils', label: 'ארוחה' },
  { route: 'nutrition', action: 'weigh', icon: 'weight', label: 'שקילה' },
  { route: 'nutrition', action: 'steps', icon: 'footprints', label: 'צעדים' },
  { route: 'sleep', action: 'sleep', icon: 'moon', label: 'שינה' },
  { route: 'today', action: 'habit', icon: 'check', label: 'הרגל' },
  { route: 'tasks', action: 'task', icon: 'list-checks', label: 'משימה' },
  { route: 'tasks', action: 'decision', icon: 'split', label: 'החלטה' },
];

// The screen's own action: the sheet shows it first, as a wide row. A
// screen that isn't here (התקדמות, חיבורים, ללמוד, משוב) has none.
const PRIMARY = {
  today: 'habit',
  tasks: 'task',
  session: 'workout',
  history: 'workout',
  'workout-progress': 'workout',
  nutrition: 'meal',
  sleep: 'sleep',
};

// route: the screen that is showing. override: an action the screen itself
// named for right now (משימות names "decision" on its החלטות part); an
// unknown one falls back to the screen's usual action.
export function sheetItems(route, override = null) {
  const byAction = (action) => QUICK_ITEMS.find((item) => item.action === action) || null;
  const primary = byAction(override) || byAction(PRIMARY[route]);
  return { primary, rest: QUICK_ITEMS.filter((item) => item !== primary) };
}
