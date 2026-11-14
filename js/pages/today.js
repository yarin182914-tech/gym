// "היום" — the home screen, top to bottom: the level card (points, level
// and streak, js/lib/rewards-sync.js), the day's three rings (workout,
// food, sleep — js/lib/today-rings.js), yesterday's points in one line, the
// next step, and today's tasks and habits, marked right here. The greeting
// above it all is the app bar's (js/ui/app-bar.js).
//
// Kept short on purpose (M14a, docs/specs/ux-cleanup.md): last night is the
// sleep ring plus the night sheet the next step opens — no sleep card; the
// habits' day strip, and the habits that aren't for today, open on demand.
//
// Marks show at once and are written in the background (see the habits
// section of js/lib/firestore.js) — offline, Firestore keeps them in its
// local cache and syncs when the connection is back.

import {
  getUserSettings, updateUserSettings, listSleep, listDailyActivity, listWorkouts, listNutritionEntries,
  listHabits, listHabitLogs, newHabitId, setHabit, deleteHabit, setHabitMark,
} from '../lib/firestore.js';
import {
  EXAMPLE_HABITS, normalizeHabit, habitContext, entryFor, isDone, isDue, isOpenToday,
  weekCount, habitStreak, levelFor, isGood, isBad, badMark, badDayLevel, slipsOf, routineLevel,
  partsMark, AUTO_STRENGTH,
} from '../lib/habits.js';
import { dateKey, shiftDays, parseKey, sleepSettings, nightRules, formatDuration } from '../lib/sleep.js';
import { HABITS, BAD_HABITS, TODAY } from '../lib/rules.js';
import { nutritionGoals, weeklyWorkoutGoal } from '../lib/rewards.js';
import { todayRings, pointsStreak } from '../lib/today-rings.js';
import { countHe } from '../lib/plural.js';
import { badHabitCardHtml, slipClock } from '../ui/bad-habit-card.js';
import { rewardsState, rewardsLedger, rewardsUserDoc, markSeen } from '../lib/rewards-sync.js';
import { daySummaryHtml } from '../ui/day-summary-card.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { openNightSheet } from '../ui/night-sheet.js';
import { habitCardHtml, targetText } from '../ui/habit-card.js';
import { openHabitWizard } from '../ui/habit-wizard.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { mountNumericField } from '../ui/numeric-input.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../ui/icon.js';
import { esc } from '../core/dom.js';
import { navigate } from '../lib/router.js';
import { handleQuickActions } from '../ui/quick-add.js';
import { mountTodayTasks } from '../ui/today-tasks.js';

const LEVEL_TEXT = { full: 'מלא', short: 'מקוצר', none: 'פחות מהמקוצר, לא נורא' };

let container = null;
let tasksHost = null; // "משימות להיום" (M6): created once per visit, re-attached by render()
let habits = []; // normalized, active and paused, in order
let logs = []; // habitLogs docs
let activities = []; // dailyActivity docs, for auto-counted steps
let workouts = []; // for habits counted from strength workouts, and the workout ring
let meals = []; // recent nutritionEntries, for the food ring
let nights = []; // sleep docs, for the sleep ring
let userDoc = {}; // users/{uid}: the rings' targets
let ctx = habitContext();
let sleepLoggedToday = false;
let openId = null; // the habit whose buttons are showing
let pressTimer = null;
let swallowClick = false; // the click that ends a long press
// The day the habit cards show and mark: null = today. Picking an earlier
// day (up to HABITS.backfillDays back) marks a habit you forgot to log.
let habitDay = null;
let showDays = false; // the day strip, behind "יום אחר"
let showMore = false; // the habits that aren't for this day, and the paused ones
let summaryOpen = false; // yesterday's points, line by line
let stopQuickActions = null; // while mounted: the + button's "הרגל"

const todayKey = () => dateKey(new Date());
const habitKey = () => habitDay ?? todayKey();
const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const sortHabits = (list) => [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
// Good habits are the "הרגלים" list (and the level bar's items); bad ones
// have their own "להיגמל" section below it.
const activeHabits = () => habits.filter((h) => h.active && isGood(h));
const activeBadHabits = () => habits.filter((h) => h.active && isBad(h));
// Slips waiting out their undo toast: `${habitId}|${day}` → { timer, commit }.
const pendingSlips = new Map();
const logFailed = (what) => (err) => {
  console.error(`[today] ${what} failed`, err);
  showToast('השמירה נכשלה — נסה שוב');
};

export async function mountToday(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען את היום...');
  const loadFailed = (what, fallback) => (err) => {
    console.error(`[today] ${what} load failed`, err);
    return fallback;
  };
  const [settings, loadedNights, loadedHabits, loadedLogs, acts, loadedWorkouts, loadedMeals] = await Promise.all([
    getUserSettings().catch(loadFailed('settings', {})),
    listSleep(60).catch(loadFailed('sleep', [])),
    // null, not [] — a failed load must never look like "no habits yet"
    // and trigger the examples.
    listHabits().catch(loadFailed('habits', null)),
    listHabitLogs(HABITS.logDaysToLoad).catch(loadFailed('habit logs', [])),
    listDailyActivity(HABITS.logDaysToLoad).catch(loadFailed('activity', [])),
    listWorkouts(200).catch(loadFailed('workouts', [])),
    // Today's meals are among the newest entries.
    listNutritionEntries(40).catch(loadFailed('meals', [])),
  ]);
  if (isStale(token)) return;

  habits = sortHabits((loadedHabits || []).map(normalizeHabit));
  logs = loadedLogs;
  activities = acts;
  workouts = loadedWorkouts;
  meals = loadedMeals;
  nights = loadedNights;
  userDoc = settings || {};
  ctx = habitContext(logs, activities, workouts);
  if (loadedHabits && !settings.habitsSeeded) {
    if (!loadedHabits.length) seedExamples();
    updateUserSettings({ habitsSeeded: true }).catch(logFailed('habitsSeeded'));
  }

  window.addEventListener('gym-rewards', onRewards);
  document.addEventListener('visibilitychange', flushIfHidden);
  window.addEventListener('pagehide', flushSlips);
  sleepLoggedToday = nights.some((n) => n.date === todayKey());
  tasksHost = document.createElement('section');
  tasksHost.className = 'today-habits today-tasks';
  tasksHost.setAttribute('aria-label', 'משימות להיום');
  mountTodayTasks(tasksHost);
  render();
  // The + button's "הרגל": asked for on this screen, a new habit (the sheet's
  // wide first row); from another screen, today's habits, ready to mark (or
  // a new one when there are none).
  stopQuickActions = handleQuickActions('today', (action, { here } = {}) => {
    const title = container?.querySelector('[data-today-habits] .today-section-title');
    if (here || !activeHabits().length || !title) addHabit();
    else title.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function unmountToday() {
  stopQuickActions?.();
  stopQuickActions = null;
  window.removeEventListener('gym-rewards', onRewards);
  document.removeEventListener('visibilitychange', flushIfHidden);
  window.removeEventListener('pagehide', flushSlips);
  flushSlips();
  clearTimeout(pressTimer);
  container = null;
  tasksHost = null;
  habits = [];
  logs = [];
  activities = [];
  workouts = [];
  meals = [];
  nights = [];
  userDoc = {};
  ctx = habitContext();
  openId = null;
  pressTimer = null;
  swallowClick = false;
  habitDay = null;
  showDays = false;
  showMore = false;
  summaryOpen = false;
}

// The three example habits, once per user (habitsSeeded on the user doc
// keeps them from coming back after they're deleted).
function seedExamples() {
  habits = EXAMPLE_HABITS.map((example, i) => {
    const id = newHabitId();
    const data = { ...example, active: true, order: i, source: 'example' };
    setHabit(id, data, { isNew: true }).catch(logFailed('example habit'));
    return normalizeHabit({ id, ...data });
  });
}

function render() {
  if (!container) return;
  container.innerHTML = `
    <div data-today-top></div>
    <div id="tasks-slot"></div>
    <section class="today-habits" data-today-habits aria-label="הרגלים"></section>
    <section class="today-habits today-bad" data-today-bad aria-label="להיגמל"></section>`;
  container.querySelector('#tasks-slot').replaceWith(tasksHost);
  const section = container.querySelector('[data-today-habits]');
  bindHabitEvents(section);
  bindBadEvents(container.querySelector('[data-today-bad]'));
  renderTop();
  renderHabits();
  renderBad();
}

function rerender() {
  renderTop();
  renderHabits();
  renderBad();
}

// ---------- level card, rings, next step ----------

function renderTop() {
  const host = container?.querySelector('[data-today-top]');
  if (!host) return;
  const key = todayKey();
  // Yesterday's points, once, after the day closed.
  const yesterday = shiftDays(key, -1);
  const showSummary = rewardsState() && rewardsUserDoc().rewardsSeen?.daySummary !== yesterday;
  host.innerHTML = levelCard(key) + ringsRow(key)
    + (showSummary ? daySummaryHtml(rewardsLedger(), yesterday, { open: summaryOpen }) : '') + nextStep(key);
  host.querySelector('[data-level]').addEventListener('click', () => navigate('dashboard'));
  host.querySelectorAll('[data-ring]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.ring)));
  host.querySelector('[data-day-summary-toggle]')?.addEventListener('click', () => {
    summaryOpen = !summaryOpen;
    renderTop();
  });
  host.querySelector('[data-day-summary-close]')?.addEventListener('click', () => {
    markSeen({ daySummary: yesterday });
    renderTop();
  });
  host.querySelector('[data-next]')?.addEventListener('click', (e) => {
    if (e.currentTarget.dataset.next === 'sleep') return openLastNight();
    container.querySelector('[data-today-habits]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// "לרשום את הלילה": last night's two clocks in a sheet. Once saved the
// sleep ring fills and the next step moves on; fixing a night, the week and
// the sleep settings are on the שינה tab (the ring leads there).
function openLastNight() {
  openNightSheet({
    key: todayKey(),
    nights,
    settings: sleepSettings(userDoc),
    onChange(list) {
      nights = list;
      sleepLoggedToday = list.some((n) => n.date === todayKey());
      renderTop();
    },
  });
}

// The level card: the level, the points on the way to the next one, the
// streak (days in a row with points) and what today has added so far —
// all from the ledger (js/lib/rewards-sync.js). Before the first scoring
// pass has answered it shows level 1 and a dash. The whole card is a
// button to the progress screen (spans, not divs, inside it).
// js/ui/reward-moments.js plays the points moment on it, and counts
// [data-hero-total] up from the old total.
function levelCard(key) {
  const state = rewardsState();
  const level = state?.level;
  const fmt = (n) => n.toLocaleString('he-IL');
  const streak = state ? pointsStreak(state.byDay, key) : 0;
  const showStreak = streak >= TODAY.streakMinDays;
  let foot = 'סופרים נקודות…';
  if (state && state.total === 0) foot = 'ההרפתקה מתחילה — כל סימון שווה נקודות';
  else if (state && level.next) foot = `עוד ${countHe(level.toNext, 'נקודה', 'נקודות', { feminine: true })} לרמה ${level.next.level}`;
  else if (state) foot = 'הרמה הגבוהה ביותר';
  const label = state
    ? `רמה ${level.level}, ${level.name} · ${fmt(state.total)} נקודות · ${foot}${showStreak ? ` · רצף של ${streak} ימים` : ''} · ${state.today} נקודות היום · התקדמות`
    : 'רמה ונקודות · התקדמות';
  return `
    <button type="button" class="today-hero" data-level aria-label="${esc(label)}">
      <span class="today-hero-head" aria-hidden="true">
        <span class="today-hero-level">רמה ${level?.level ?? 1}${level ? ` · ${esc(level.name)}` : ''}</span>
        ${showStreak ? `<span class="today-hero-streak">${icon('flame', { className: 'icon--sm' })}<span class="num">${streak}</span> ימים</span>` : ''}
        ${icon('chevron-left', { className: 'icon--sm' })}
      </span>
      <span class="today-hero-points" aria-hidden="true">
        <span class="today-hero-pair num" dir="ltr"><span class="today-hero-total" data-hero-total="${state?.total ?? 0}">${state ? fmt(state.total) : '—'}</span>${level?.next ? ` / ${fmt(level.next.min)}` : ''}</span>
        <span class="today-hero-of">נק׳</span>
      </span>
      <span class="today-hero-bar" aria-hidden="true"><span style="width:${Math.round((level?.progress ?? 0) * 100)}%"></span></span>
      <span class="today-hero-foot" aria-hidden="true">
        <span>${esc(foot)}</span>
        ${state?.today > 0 ? `<span class="today-hero-today">היום <span class="num" dir="ltr">+${fmt(state.today)}</span></span>` : ''}
      </span>
    </button>`;
}

// The day's three rings, each in its own colour in every theme and a
// button to its tab. A ring with nothing logged yet is grey — never a miss.
const RINGS = [
  { id: 'train', route: 'session', icon: 'dumbbell', name: 'אימון' },
  { id: 'food', route: 'nutrition', icon: 'utensils', name: 'תזונה' },
  { id: 'sleep', route: 'sleep', icon: 'moon', name: 'שינה' },
];

function ringsRow(key) {
  const rings = todayRings({
    today: key,
    workouts,
    workoutGoal: weeklyWorkoutGoal(userDoc),
    meals,
    activity: activities.find((a) => a.date === key) || null,
    goals: nutritionGoals(userDoc),
    night: nights.find((n) => n.date === key) || null,
    sleepTargetMin: nightRules(key, sleepSettings(userDoc)).minMin,
  });
  const fmt = (n) => n.toLocaleString('he-IL');
  const pair = (a, b) => `<span class="num" dir="ltr">${a} / ${b}</span>`;
  const NOT_YET = 'עוד לא נרשם';
  const text = {
    train: pair(rings.train.value, rings.train.target),
    food: rings.food.empty ? NOT_YET : pair(fmt(rings.food.value), fmt(rings.food.target)),
    sleep: rings.sleep.empty ? NOT_YET : pair(formatDuration(rings.sleep.value), formatDuration(rings.sleep.target)),
  };
  const spoken = {
    train: `${rings.train.value} מתוך ${rings.train.target} ימי אימון השבוע`,
    food: rings.food.empty ? NOT_YET : `${fmt(rings.food.value)} מתוך ${fmt(rings.food.target)} קלוריות היום`,
    sleep: rings.sleep.empty ? NOT_YET : `${formatDuration(rings.sleep.value)} מתוך ${formatDuration(rings.sleep.target)} שעות בלילה האחרון`,
  };
  const r = 26;
  const c = 2 * Math.PI * r;
  return `
    <div class="card day-rings">
      ${RINGS.map((def) => {
        const ring = rings[def.id];
        return `
      <button type="button" class="day-ring day-ring--${def.id}${ring.empty ? ' day-ring--empty' : ''}" data-ring="${def.route}" aria-label="${def.name}: ${esc(spoken[def.id])}">
        <span class="day-ring-dial" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <circle class="day-ring-track" cx="32" cy="32" r="${r}"></circle>
            ${ring.fraction > 0 ? `<circle class="day-ring-fill" cx="32" cy="32" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - ring.fraction)}"></circle>` : ''}
          </svg>
          ${icon(def.icon)}
        </span>
        <span class="day-ring-name" aria-hidden="true">${def.name}</span>
        <span class="day-ring-value" aria-hidden="true">${text[def.id]}</span>
      </button>`;
      }).join('')}
    </div>`;
}

const onRewards = () => renderTop();

// One card that changes with the hour and the state: the morning asks for
// last night, the evening for the habits.
function nextStep(key) {
  const hour = new Date().getHours();
  const open = activeHabits().filter((h) => isOpenToday(h, key, ctx)).length;
  const step = (iconName, title, sub, target) => `
    <button type="button" class="card today-next" data-next="${target}">
      <span class="today-next-icon">${icon(iconName)}</span>
      <span class="today-next-text"><span class="today-next-title">${title}</span><span class="today-next-sub">${sub}</span></span>
      ${icon('chevron-left', { className: 'icon--sm' })}
    </button>`;

  if (!sleepLoggedToday && hour < HABITS.morningUntilHour) return step('moon', 'לרשום את הלילה', 'שני שעונים, שתי שניות', 'sleep');
  if (open && hour >= HABITS.eveningFromHour) return step('check', 'לסמן את ההרגלים', open === 1 ? 'עוד אחד פתוח היום' : `עוד ${open} פתוחים היום`, 'habits');
  if (!sleepLoggedToday) return step('moon', 'הלילה עוד לא נרשם', 'אפשר לרשום גם עכשיו', 'sleep');
  if (open) return step('check', open === 1 ? 'הרגל אחד פתוח היום' : `${open} הרגלים פתוחים היום`, 'אפשר לסמן כבר עכשיו', 'habits');
  if (activeHabits().length) {
    return `
    <div class="card today-next today-next--done">
      <span class="today-next-icon">${icon('sparkles')}</span>
      <span class="today-next-text"><span class="today-next-title">היום מסומן</span><span class="today-next-sub">כל ההרגלים של היום סומנו</span></span>
    </div>`;
  }
  return '';
}

// ---------- habits ----------

function renderHabits() {
  const section = container?.querySelector('[data-today-habits]');
  if (!section) return;
  const key = habitKey();
  const isToday = key === todayKey();
  const active = activeHabits();
  const dueNow = active.filter((h) => isDue(h, key));
  const notToday = active.filter((h) => !isDue(h, key));
  const paused = habits.filter((h) => !h.active);
  const doneCount = dueNow.filter((h) => isDone(entryFor(h, key, ctx))).length;

  const card = (h) => habitCardHtml(h, {
    entry: entryFor(h, key, ctx),
    streak: habitStreak(h, key, ctx),
    week: h.schedule.type === 'weekly' ? weekCount(h, key, ctx) : 0,
    due: h.active && isDue(h, key),
    open: openId === h.id,
  });
  const group = (title, list) => (list.length ? `
    <div class="today-sub-head">${title}</div>
    <div class="habit-list">${list.map(card).join('')}</div>` : '');

  // The day strip opens from "יום אחר", and stays while another day is picked.
  const daysOpen = showDays || !isToday;
  // Habits that aren't for this day, and paused ones: one closed row.
  const notTodayTitle = isToday ? 'לא היום' : 'לא באותו יום';
  const moreCount = notToday.length + paused.length;
  const moreKinds = [notToday.length ? notTodayTitle : '', paused.length ? 'מושהים' : ''].filter(Boolean).join(' ו');
  // The how-to line is for the first days only.
  const markedDays = logs.filter((l) => Object.keys(l.habits || {}).length).length;

  section.innerHTML = `
    <div class="today-section-head">
      <h2 class="today-section-title">הרגלים</h2>
      ${dueNow.length ? `<span class="today-section-count num">${doneCount}/${dueNow.length}</span>` : ''}
      ${habits.length ? `<button type="button" class="btn-mini-dashed today-head-btn${daysOpen ? ' active' : ''}" data-habit-days-toggle aria-expanded="${daysOpen}">${icon('calendar-days', { className: 'icon--sm' })} יום אחר</button>` : ''}
    </div>
    ${habits.length && daysOpen ? dayStrip(key) : ''}
    ${isToday ? '' : `<p class="today-backfill-note">מסמנים ל${esc(dayName(key))}</p>`}
    ${habits.length ? '' : `
    <div class="card today-empty">
      <p class="text-muted">אין עדיין הרגלים. מתחילים מאחד: משהו קטן שאפשר לעשות כל יום.</p>
      <button type="button" class="btn btn-primary" data-habit-add>${icon('plus', { className: 'icon--sm' })} הרגל ראשון</button>
    </div>`}
    <div class="habit-list">${dueNow.map(card).join('')}</div>
    ${moreCount ? `
    <button type="button" class="today-more" data-habit-more aria-expanded="${showMore}">
      <span>עוד ${countHe(moreCount, 'הרגל', 'הרגלים')} · ${moreKinds}</span>
      ${icon('chevron-down', { className: 'icon--sm' })}
    </button>` : ''}
    ${showMore ? group(notTodayTitle, notToday) + group('מושהים', paused) : ''}
    ${habits.length && markedDays < TODAY.hintMarkedDays ? '<p class="today-hint">לחיצה לסימון · לחיצה ארוכה מבטלת</p>' : ''}`;
}

// "היום", "אתמול", then weekday letters, newest first — tap to mark that day.
function dayName(key) {
  const today = todayKey();
  if (key === today) return 'היום';
  if (key === shiftDays(today, -1)) return 'אתמול';
  const d = parseKey(key);
  return `יום ${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

function dayStrip(selected) {
  const today = todayKey();
  const days = [];
  for (let i = 0; i <= HABITS.backfillDays; i += 1) days.push(shiftDays(today, -i));
  return `
    <div class="habit-days" role="tablist" aria-label="איזה יום לסמן">
      ${days.map((k, i) => {
        const d = parseKey(k);
        const label = i === 0 ? 'היום' : i === 1 ? 'אתמול' : `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`;
        return `<button type="button" role="tab" class="habit-day${k === selected ? ' active' : ''}" data-habit-day="${k}" aria-selected="${k === selected}">${label}</button>`;
      }).join('')}
    </div>`;
}

// Bound once per render() on the section, which renderHabits() refills.
function bindHabitEvents(section) {
  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-habit-add]')) return addHabit();
    if (e.target.closest('[data-habit-more]')) {
      showMore = !showMore;
      return renderHabits();
    }
    // "יום אחר" opens the day strip; closing it goes back to today.
    if (e.target.closest('[data-habit-days-toggle]')) {
      showDays = !(showDays || habitDay);
      habitDay = null;
      openId = null;
      renderHabits();
      renderBad();
      return;
    }
    const dayBtn = e.target.closest('[data-habit-day]');
    if (dayBtn) {
      habitDay = dayBtn.dataset.habitDay === todayKey() ? null : dayBtn.dataset.habitDay;
      // Back on "היום" the strip has done its job.
      if (!habitDay) showDays = false;
      openId = null;
      // The "להיגמל" cards follow the same day: an unreported day is filled
      // in from here.
      renderHabits();
      renderBad();
      return;
    }
    const cardEl = e.target.closest('[data-habit]');
    const habit = cardEl && habits.find((h) => h.id === cardEl.dataset.habit);
    if (!habit) return;
    if (e.target.closest('[data-habit-edit]')) return editHabit(habit);
    const markBtn = e.target.closest('[data-mark]');
    if (markBtn) return onMarkButton(habit, markBtn.dataset.mark);
    if (!e.target.closest('[data-habit-tap]')) return;
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (!habit.active) return editHabit(habit);
    // A routine is marked step by step.
    if (habit.measure === 'steps' && habit.steps.length) return openRoutineSheet(habit);
    // A yes/no habit with no short level has nothing to choose: one tap.
    if (habit.measure === 'yesno' && habit.short === null && !entryFor(habit, habitKey(), ctx)) {
      return applyMark(habit, { level: 'full', value: null });
    }
    openId = openId === habit.id ? null : habit.id;
    renderHabits();
  });

  // Long press on a card undoes today's mark.
  section.addEventListener('pointerdown', (e) => {
    const tap = e.target.closest('[data-habit-tap]');
    clearTimeout(pressTimer);
    swallowClick = false;
    if (!tap) return;
    const id = tap.closest('[data-habit]').dataset.habit;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      swallowClick = true;
      undo(id);
    }, HABITS.longPressMs);
  });
  const cancelPress = () => clearTimeout(pressTimer);
  section.addEventListener('pointerup', cancelPress);
  section.addEventListener('pointercancel', cancelPress);
  section.addEventListener('pointermove', (e) => {
    // A finger that starts scrolling isn't a long press.
    if (pressTimer && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancelPress();
  });
  section.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-habit-tap]')) e.preventDefault();
  });
}

function onMarkButton(habit, kind) {
  // A habit split into fields always asks for each one's number.
  if (habit.parts.length && (kind === 'full' || kind === 'short')) openValueSheet(habit);
  else if (kind === 'full' || kind === 'none') applyMark(habit, { level: kind, value: null });
  // "מקוצר" asks how much (minutes, steps…) when the habit has numeric
  // targets; the level then follows from the number.
  else if (kind === 'short') {
    if (habit.full !== null && habit.short !== null) openValueSheet(habit);
    else applyMark(habit, { level: 'short', value: null });
  }
  else if (kind === 'undo') undo(habit.id);
}

function undo(habitId) {
  const habit = habits.find((h) => h.id === habitId);
  const entry = habit && entryFor(habit, habitKey(), ctx);
  if (!entry) return;
  if (entry.auto) {
    showToast(habit.autoSource === AUTO_STRENGTH ? 'נספר אוטומטית מאימוני הכוח של היום' : 'נספר אוטומטית מהצעדים של היום');
    return;
  }
  navigator.vibrate?.(15);
  applyMark(habit, null);
  showToast(`${icon('undo-2', { className: 'icon--sm' })} הסימון בוטל`);
}

// mark: { level, value } or null to clear today's mark. The screen changes
// first; the write follows in the background.
function applyMark(habit, mark) {
  const key = habitKey();
  const stored = mark
    ? {
      level: mark.level,
      value: mark.value ?? null,
      ...(mark.stepsDone ? { stepsDone: mark.stepsDone } : {}),
      ...(mark.parts ? { parts: mark.parts } : {}),
      source: 'manual',
    }
    : null;
  setLocalMark(key, habit.id, stored);
  openId = null;
  rerender();
  setHabitMark(key, habit.id, stored).catch(logFailed('habit mark'));
}

// The day's mark in this screen's copy of habitLogs (null clears it).
function setLocalMark(key, habitId, stored) {
  let day = logs.find((l) => l.date === key);
  if (!day) {
    day = { id: key, date: key, habits: {} };
    logs = [...logs, day];
  }
  day.habits = { ...day.habits };
  if (stored) day.habits[habitId] = stored;
  else delete day.habits[habitId];
  ctx = habitContext(logs, activities, workouts);
}

// A routine, step by step: every step → מלא, the short steps → מקוצר.
function openRoutineSheet(habit) {
  const current = ctx.logsByDate.get(habitKey())?.habits?.[habit.id];
  const done = new Set(current?.stepsDone || []);
  openBottomSheet({
    ariaLabel: habit.name,
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 4px; color:var(--text);">${esc(habit.name)}</h3>
        <p class="text-muted" style="margin:0 0 12px; font-size:0.85rem;">מלא: כל הצעדים${habit.shortSteps.length ? ` · מקוצר: ${habit.shortSteps.map((i) => esc(habit.steps[i])).join(', ')}` : ''}</p>
        <div class="settings-list routine-list">
          ${habit.steps.map((s, i) => `
            <label class="track-check routine-step">
              <input type="checkbox" data-routine-step="${i}" ${done.has(i) ? 'checked' : ''}>
              <span>${esc(s)}</span>
            </label>`).join('')}
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-r-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-r-save>שמירה</button>
        </div>`;
      body.querySelectorAll('[data-routine-step]').forEach((cb) => cb.addEventListener('change', () => {
        const i = Number(cb.dataset.routineStep);
        if (cb.checked) done.add(i); else done.delete(i);
      }));
      body.querySelector('[data-r-cancel]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-r-save]').addEventListener('click', () => {
        sheetApi.close();
        const stepsDone = [...done].sort((a, b) => a - b);
        const level = routineLevel(habit, stepsDone);
        applyMark(habit, level ? { level, value: stepsDone.length, stepsDone } : null);
      });
    },
  });
}

// ---------- להיגמל (bad habits) ----------

function renderBad() {
  const section = container?.querySelector('[data-today-bad]');
  if (!section) return;
  const list = activeBadHabits();
  if (!list.length) {
    section.innerHTML = '';
    return;
  }
  const key = habitKey();
  const today = todayKey();
  section.innerHTML = `
    <div class="today-section-head">
      <h2 class="today-section-title">להיגמל</h2>
    </div>
    ${key === today ? '' : `<p class="today-backfill-note">מסמנים ל${esc(dayName(key))}</p>`}
    <div class="habit-list">${list.map((h) => badHabitCardHtml(h, { key, today, ctx })).join('')}</div>`;
}

function bindBadEvents(section) {
  section.addEventListener('click', (e) => {
    const cardEl = e.target.closest('[data-bad]');
    const habit = cardEl && habits.find((h) => h.id === cardEl.dataset.bad);
    if (!habit) return;
    if (e.target.closest('[data-bad-edit]')) return editHabit(habit);
    if (e.target.closest('[data-bad-slip]')) return logSlip(habit);
    if (e.target.closest('[data-bad-clean]')) return toggleClean(habit);
    if (e.target.closest('[data-bad-value]')) return openBadValueSheet(habit);
  });
}

// "מעדתי": the moment, on the chosen day. Shown at once; written only after
// the undo toast has gone (or when the app is left), so a slip undone in
// time never reaches the data — or the points.
function logSlip(habit) {
  const key = habitKey();
  const now = new Date();
  const when = parseKey(key);
  when.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  const prev = badMark(habit, key, ctx);
  const slips = [...slipsOf(prev), when];
  setLocalMark(key, habit.id, badMarkWith(habit, slips));
  renderBad();
  navigator.vibrate?.(15);
  const id = `${habit.id}|${key}`;
  clearTimeout(pendingSlips.get(id)?.timer);
  const commit = () => {
    pendingSlips.delete(id);
    setHabitMark(key, habit.id, badMark(habit, key, ctx)).catch(logFailed('slip'));
  };
  pendingSlips.set(id, { timer: setTimeout(commit, BAD_HABITS.slipUndoMs), commit });
  showToast(`נרשם ${slipClock(when)} · כנות שווה ${BAD_HABITS.points.slipLog} נק׳`, {
    duration: BAD_HABITS.slipUndoMs,
    action: {
      label: 'ביטול',
      onClick: () => {
        const left = slipsOf(badMark(habit, key, ctx)).filter((t) => t !== when);
        setLocalMark(key, habit.id, left.length ? badMarkWith(habit, left) : null);
        renderBad();
        // Still waiting: write what's left (or nothing) right away.
        const pending = pendingSlips.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          pending.commit();
        } else {
          setHabitMark(key, habit.id, badMark(habit, key, ctx)).catch(logFailed('slip undo'));
        }
      },
    },
  });
}

// The whole mark for a day with these slips (the clean tap no longer holds).
function badMarkWith(habit, slips) {
  return { clean: false, slips, value: slips.length, level: badDayLevel(habit, { slips }), source: 'manual' };
}

function flushSlips() {
  for (const pending of [...pendingSlips.values()]) {
    clearTimeout(pending.timer);
    pending.commit();
  }
}

const flushIfHidden = () => {
  if (document.visibilityState === 'hidden') flushSlips();
};

// "יום נקי ✓" — reported clean; tapping it again takes it back. The points
// come when the day is over (a later slip would win).
function toggleClean(habit) {
  const key = habitKey();
  const prev = badMark(habit, key, ctx);
  if (slipsOf(prev).length) return;
  const wasClean = badDayLevel(habit, prev) === 'full';
  const stored = wasClean ? null : { clean: true, slips: [], value: 0, level: 'full', source: 'manual' };
  setLocalMark(key, habit.id, stored);
  renderBad();
  setHabitMark(key, habit.id, stored).catch(logFailed('clean day'));
  if (!wasClean) {
    navigator.vibrate?.(15);
    showToast(`${icon('check', { className: 'icon--sm' })} יום נקי נרשם${key === todayKey() ? ' · הנקודות בסגירת היום' : ''}`);
  }
}

// A limit (e.g. Instagram minutes): how much it was that day.
function openBadValueSheet(habit) {
  const key = habitKey();
  const current = badMark(habit, key, ctx);
  let value = current?.value ?? null;
  const partValues = { ...(current?.parts || {}) };
  openBottomSheet({
    ariaLabel: habit.name,
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 4px; color:var(--text);">${esc(habit.name)} · כמה ${key === todayKey() ? 'היום' : 'באותו יום'}?</h3>
        <p class="text-muted" style="margin:0 0 12px; font-size:0.85rem;">${esc(targetText(habit))}</p>
        <div data-bv-field></div>
        <p class="text-muted" data-bv-total style="margin:10px 0 0; font-size:0.85rem;"></p>
        <div class="sheet-actions">
          ${current ? '<button type="button" class="btn btn-secondary" data-bv-clear>ניקוי</button>' : ''}
          <button type="button" class="btn btn-secondary" data-bv-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-bv-save>שמירה</button>
        </div>`;
      const totalEl = body.querySelector('[data-bv-total]');
      mountValueFields(body.querySelector('[data-bv-field]'), habit, value, partValues, (v) => {
        value = v;
        if (habit.parts.length) totalEl.textContent = v === null ? '' : `סה״כ ${v} ${habit.unit}`;
      });
      const write = (stored) => {
        sheetApi.close();
        setLocalMark(key, habit.id, stored);
        renderBad();
        setHabitMark(key, habit.id, stored).catch(logFailed('limit'));
      };
      body.querySelector('[data-bv-cancel]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-bv-clear]')?.addEventListener('click', () => write(null));
      body.querySelector('[data-bv-save]').addEventListener('click', () => {
        if (value === null) return showToast('הזינו מספר');
        const level = levelFor(habit, value);
        const parts = habit.parts.length ? partsMark(habit, partValues).parts : null;
        write({ clean: level === 'full', slips: [], value, ...(parts ? { parts } : {}), level, source: 'manual' });
      });
    },
  });
}

// "מקוצר": type how much was done, starting from the short target; the
// level follows from the number.
function openValueSheet(habit) {
  const current = entryFor(habit, habitKey(), ctx);
  const currentParts = current && !current.auto ? ctx.logsByDate.get(habitKey())?.habits?.[habit.id]?.parts : null;
  const partValues = { ...(currentParts || {}) };
  let value = habit.parts.length ? partsMark(habit, partValues)?.value ?? null : current?.value ?? habit.short ?? null;
  openBottomSheet({
    ariaLabel: habit.name,
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 4px; color:var(--text);">${esc(habit.name)} · כמה בפועל?</h3>
        <p class="text-muted" style="margin:0 0 12px; font-size:0.85rem;">${esc(targetText(habit))}</p>
        <div data-v-field></div>
        <p class="text-muted" data-v-preview style="margin:10px 0 0; font-size:0.85rem;"></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-v-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-v-save>שמירה</button>
        </div>`;
      const previewEl = body.querySelector('[data-v-preview]');
      const refresh = () => {
        const total = habit.parts.length && value !== null ? `סה״כ ${value} ${habit.unit} · ` : '';
        previewEl.textContent = value === null ? '' : `${total}${LEVEL_TEXT[levelFor(habit, value)]}`;
      };
      refresh();
      mountValueFields(body.querySelector('[data-v-field]'), habit, value, partValues, (v) => { value = v; refresh(); });
      body.querySelector('[data-v-cancel]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-v-save]').addEventListener('click', () => {
        if (value === null) {
          showToast('הזינו מספר');
          return;
        }
        sheetApi.close();
        const parts = habit.parts.length ? partsMark(habit, partValues).parts : null;
        applyMark(habit, { level: levelFor(habit, value), value, ...(parts ? { parts } : {}) });
      });
    },
  });
}

// The sheet's number: one field, or one per part (partValues is filled in
// place) — onChange gets the value, the parts' sum, null while empty.
function mountValueFields(host, habit, value, partValues, onChange) {
  if (!habit.parts.length) {
    mountNumericField(host, {
      value, unitLabel: habit.unit, ariaLabel: habit.name, nullable: true, max: 100000, onCommit: onChange,
    });
    return;
  }
  host.innerHTML = habit.parts.map((name, i) => `
    <div class="sheet-field-label">${esc(name)}</div>
    <div data-part-field="${i}"></div>`).join('');
  habit.parts.forEach((name, i) => {
    mountNumericField(host.querySelector(`[data-part-field="${i}"]`), {
      value: partValues[name] ?? null, unitLabel: habit.unit, ariaLabel: name, nullable: true, max: 100000,
      onCommit: (v) => {
        if (v === null) delete partValues[name];
        else partValues[name] = v;
        onChange(partsMark(habit, partValues)?.value ?? null);
      },
    });
  });
  onChange(partsMark(habit, partValues)?.value ?? null);
}

function addHabit() {
  openHabitWizard({
    onSave(fields) {
      const id = newHabitId();
      const order = habits.reduce((max, h) => Math.max(max, h.order), -1) + 1;
      const data = { ...fields, order, source: 'manual' };
      habits = sortHabits([...habits, normalizeHabit({ id, ...data })]);
      rerender();
      setHabit(id, data, { isNew: true }).catch(logFailed('habit add'));
    },
  });
}

function editHabit(habit) {
  openHabitWizard({
    habit,
    onSave(fields) {
      habits = sortHabits(habits.map((h) => (h.id === habit.id ? normalizeHabit({ ...h, ...fields }) : h)));
      rerender();
      setHabit(habit.id, fields).catch(logFailed('habit edit'));
    },
    onDelete() {
      habits = habits.filter((h) => h.id !== habit.id);
      if (openId === habit.id) openId = null;
      rerender();
      deleteHabit(habit.id).catch(logFailed('habit delete'));
      showToast('ההרגל נמחק');
    },
  });
}
