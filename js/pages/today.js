// "היום" — the home screen, top to bottom: the level bar (a placeholder
// until M4's points), the next step, last night's sleep, and today's
// habits, marked right here.
//
// Marks show at once and are written in the background (see the habits
// section of js/lib/firestore.js) — offline, Firestore keeps them in its
// local cache and syncs when the connection is back.

import {
  getUserSettings, updateUserSettings, listSleep, listDailyActivity,
  listHabits, listHabitLogs, newHabitId, setHabit, deleteHabit, setHabitMark,
} from '../lib/firestore.js';
import {
  EXAMPLE_HABITS, normalizeHabit, habitContext, entryFor, isDone, isDue, isOpenToday,
  weekCount, habitStreak, levelFor,
} from '../lib/habits.js';
import { dateKey, shiftDays, parseKey } from '../lib/sleep.js';
import { HABITS } from '../lib/rules.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { createSleepCard } from '../ui/sleep-card.js';
import { habitCardHtml, targetText } from '../ui/habit-card.js';
import { openHabitForm } from '../ui/habit-form.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { mountNumericField } from '../ui/numeric-input.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../ui/icon.js';
import { esc } from '../core/dom.js';
import { navigate } from '../lib/router.js';

const LEVEL_TEXT = { full: 'מלא', short: 'מקוצר', none: 'פחות מהמקוצר, לא נורא' };

let container = null;
let sleepCard = null; // created once per visit, re-attached by render()
let habits = []; // normalized, active and paused, in order
let logs = []; // habitLogs docs
let activities = []; // dailyActivity docs, for auto-counted steps
let ctx = habitContext();
let sleepLoggedToday = false;
let openId = null; // the habit whose buttons are showing
let pressTimer = null;
let swallowClick = false; // the click that ends a long press
// The day the habit cards show and mark: null = today. Picking an earlier
// day (up to HABITS.backfillDays back) marks a habit you forgot to log.
let habitDay = null;

const todayKey = () => dateKey(new Date());
const habitKey = () => habitDay ?? todayKey();
const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const sortHabits = (list) => [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
const activeHabits = () => habits.filter((h) => h.active);
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
  const [settings, nights, loadedHabits, loadedLogs, acts] = await Promise.all([
    getUserSettings().catch(loadFailed('settings', {})),
    listSleep(60).catch(loadFailed('sleep', [])),
    // null, not [] — a failed load must never look like "no habits yet"
    // and trigger the examples.
    listHabits().catch(loadFailed('habits', null)),
    listHabitLogs(HABITS.logDaysToLoad).catch(loadFailed('habit logs', [])),
    listDailyActivity(HABITS.logDaysToLoad).catch(loadFailed('activity', [])),
  ]);
  if (isStale(token)) return;

  habits = sortHabits((loadedHabits || []).map(normalizeHabit));
  logs = loadedLogs;
  activities = acts;
  ctx = habitContext(logs, activities);
  if (loadedHabits && !settings.habitsSeeded) {
    if (!loadedHabits.length) seedExamples();
    updateUserSettings({ habitsSeeded: true }).catch(logFailed('habitsSeeded'));
  }

  sleepLoggedToday = nights.some((n) => n.date === todayKey());
  sleepCard = createSleepCard(nights, settings, {
    onChange(list) {
      sleepLoggedToday = list.some((n) => n.date === todayKey());
      renderTop();
    },
  });
  render();
}

export function unmountToday() {
  clearTimeout(pressTimer);
  container = null;
  sleepCard = null;
  habits = [];
  logs = [];
  activities = [];
  ctx = habitContext();
  openId = null;
  pressTimer = null;
  swallowClick = false;
  habitDay = null;
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
    <div id="sleep-slot"></div>
    <section class="today-habits" data-today-habits aria-label="הרגלים"></section>`;
  container.querySelector('#sleep-slot').replaceWith(sleepCard);
  const section = container.querySelector('[data-today-habits]');
  bindHabitEvents(section);
  renderTop();
  renderHabits();
}

function rerender() {
  renderTop();
  renderHabits();
}

// ---------- level bar + next step ----------

function renderTop() {
  const host = container?.querySelector('[data-today-top]');
  if (!host) return;
  const key = todayKey();
  // Today's items: last night, and every habit that's due — minus an
  // N-per-week habit whose week is already met and wasn't done today.
  const items = activeHabits().filter((h) => isDue(h, key) && (isDone(entryFor(h, key, ctx)) || isOpenToday(h, key, ctx)));
  const total = items.length + 1;
  const done = items.filter((h) => isDone(entryFor(h, key, ctx))).length + (sleepLoggedToday ? 1 : 0);
  host.innerHTML = levelBar(done, total) + nextStep(key);
  host.querySelector('[data-level]').addEventListener('click', () => navigate('dashboard'));
  host.querySelector('[data-next]')?.addEventListener('click', (e) => {
    const target = e.currentTarget.dataset.next === 'sleep' ? sleepCard : container.querySelector('[data-today-habits]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Level and points arrive with M4 — until then the ring is today's items.
// The whole bar is a button to the progress screen (spans, not divs,
// inside it).
function levelBar(done, total) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return `
    <button type="button" class="card today-level" data-level aria-label="רמה 1 · ${done} מתוך ${total} סומנו היום · התקדמות">
      <span class="today-ring" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle class="today-ring-track" cx="24" cy="24" r="${r}"></circle>
          <circle class="today-ring-fill" cx="24" cy="24" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - done / total)}"></circle>
        </svg>
        <span class="today-ring-text num">${done}/${total}</span>
      </span>
      <span class="today-level-text" aria-hidden="true">
        <span class="today-level-name">רמה 1</span>
        <span class="today-level-bar"><span style="width:0%"></span></span>
        <span class="today-level-sub">נקודות ורמות — בקרוב</span>
      </span>
      ${icon('chevron-left', { className: 'icon--sm' })}
    </button>`;
}

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
  if (open && hour >= HABITS.eveningFromHour) return step('check', 'לסמן את ההרגלים', `עוד ${open} פתוחים היום`, 'habits');
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

  section.innerHTML = `
    <div class="today-section-head">
      <h2 class="today-section-title">הרגלים</h2>
      ${dueNow.length ? `<span class="today-section-count num">${doneCount}/${dueNow.length}</span>` : ''}
      <button type="button" class="btn-mini-dashed today-add" data-habit-add>${icon('plus', { className: 'icon--sm' })} הרגל</button>
    </div>
    ${habits.length ? dayStrip(key) : ''}
    ${isToday ? '' : `<p class="today-backfill-note">מסמנים ל${esc(dayName(key))}</p>`}
    ${habits.length ? '' : '<p class="text-muted">אין עדיין הרגלים. הוסיפו אחד — משהו קטן שאפשר לעשות כל יום.</p>'}
    <div class="habit-list">${dueNow.map(card).join('')}</div>
    ${group(isToday ? 'לא היום' : 'לא באותו יום', notToday)}
    ${group('מושהים', paused)}
    ${habits.length ? '<p class="today-hint">לחיצה לסימון · לחיצה ארוכה מבטלת</p>' : ''}`;
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
    const dayBtn = e.target.closest('[data-habit-day]');
    if (dayBtn) {
      habitDay = dayBtn.dataset.habitDay === todayKey() ? null : dayBtn.dataset.habitDay;
      openId = null;
      return renderHabits();
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
  if (kind === 'full' || kind === 'none') applyMark(habit, { level: kind, value: null });
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
    showToast('נספר אוטומטית מהצעדים של היום');
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
  const stored = mark ? { level: mark.level, value: mark.value ?? null, source: 'manual' } : null;
  let day = logs.find((l) => l.date === key);
  if (!day) {
    day = { id: key, date: key, habits: {} };
    logs = [...logs, day];
  }
  day.habits = { ...day.habits };
  if (stored) day.habits[habit.id] = stored;
  else delete day.habits[habit.id];
  ctx = habitContext(logs, activities);
  openId = null;
  rerender();
  setHabitMark(key, habit.id, stored).catch(logFailed('habit mark'));
}

// "מקוצר": type how much was done, starting from the short target; the
// level follows from the number.
function openValueSheet(habit) {
  const current = entryFor(habit, habitKey(), ctx);
  let value = current?.value ?? habit.short ?? null;
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
      const refresh = () => { previewEl.textContent = value === null ? '' : LEVEL_TEXT[levelFor(habit, value)]; };
      refresh();
      mountNumericField(body.querySelector('[data-v-field]'), {
        value, unitLabel: habit.unit, ariaLabel: habit.name, nullable: true, max: 100000,
        onCommit: (v) => { value = v; refresh(); },
      });
      body.querySelector('[data-v-cancel]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-v-save]').addEventListener('click', () => {
        if (value === null) {
          showToast('הזינו מספר');
          return;
        }
        sheetApi.close();
        applyMark(habit, { level: levelFor(habit, value), value });
      });
    },
  });
}

function addHabit() {
  openHabitForm({
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
  openHabitForm({
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
