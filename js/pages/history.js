import { listWorkouts, deleteWorkout } from '../lib/firestore.js';
import { formatDateHe, formatMonthHe, toDate } from '../lib/format.js';
import { esc } from '../core/dom.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { setsTable } from '../ui/sets-table.js';
import { emptyState } from '../ui/empty-state.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { icon } from '../ui/icon.js';

let container = null;
let workouts = [];
let expanded = new Set(); // workout ids
// 'YYYY-MM' keys — in-memory only, same as `expanded`: resets when you leave
// this screen and come back, it doesn't persist across visits.
let expandedMonths = new Set();
// The one day the calendar and the list agree is "the point of interest" —
// sets whichever way you navigate (tap a day, or expand a workout directly),
// so the two views can never show contradictory state.
let selectedDate = null;
let calendarMonth = new Date();
let hintTimeoutId = null;
// workoutId -> { detailEl, chevronEl, rootEl } — built once per render(),
// patched in place on expand/collapse so toggling one row never touches any
// other row, month section, or the calendar above it.
let rowRefs = new Map();
// 'YYYY-MM' -> { detailEl, chevronEl } — same idea, one per month section.
let monthRefs = new Map();

export async function mountHistory(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען היסטוריית אימונים...');
  const loaded = await listWorkouts(200);
  if (isStale(token)) return;
  workouts = loaded;
  // Open the month the most recent workout falls in — usually "this month",
  // but never assumes that: a user who hasn't trained yet this month would
  // otherwise land on an all-collapsed, seemingly-empty screen.
  if (workouts.length > 0) expandedMonths.add(monthKey(toDate(workouts[0].date)));
  render();
}

export function unmountHistory() {
  container = null;
  workouts = [];
  expanded = new Set();
  expandedMonths = new Set();
  selectedDate = null;
  calendarMonth = new Date();
  if (hintTimeoutId) clearTimeout(hintTimeoutId);
  hintTimeoutId = null;
  rowRefs = new Map();
  monthRefs = new Map();
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Workouts already arrive newest-first (listWorkouts orders by date desc),
// so grouping in the same pass keeps months in that same newest-first order
// with zero extra sorting.
function groupByMonth(list) {
  const groups = new Map();
  for (const w of list) {
    const d = toDate(w.date);
    const key = monthKey(d);
    if (!groups.has(key)) groups.set(key, { year: d.getFullYear(), month: d.getMonth(), workouts: [] });
    groups.get(key).workouts.push(w);
  }
  return groups;
}

function render() {
  if (!container) return;
  rowRefs = new Map();
  monthRefs = new Map();
  container.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:10px;">
        <button class="btn btn-secondary" id="cal-prev">‹</button>
        <h3 id="cal-heading" style="margin:0;">${formatMonthHe(calendarMonth)}</h3>
        <button class="btn btn-secondary" id="cal-next">›</button>
      </div>
      <div id="cal-grid" style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center;"></div>
      <div id="cal-hint" class="text-muted" style="font-size:var(--text-sm); text-align:center; min-height:1.2em; margin-top:6px; opacity:0; transition:opacity 0.2s ease;"></div>
    </div>
    <div id="workout-list"></div>
  `;

  renderCalendar();

  const list = container.querySelector('#workout-list');
  if (workouts.length === 0) {
    list.innerHTML = emptyState('עוד לא נרשמו אימונים.', { centered: true });
  } else {
    const groups = groupByMonth(workouts);
    for (const [key, group] of groups) {
      list.appendChild(buildMonthSection(key, group));
    }
  }

  container.querySelector('#cal-prev').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    animateCalendarChange();
  });
  container.querySelector('#cal-next').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    animateCalendarChange();
  });
}

// A brief fade instead of an instant content swap — only the calendar itself
// is touched, so the workout list (and any row a user has expanded) below it
// is completely unaffected by switching months.
function animateCalendarChange() {
  const grid = container?.querySelector('#cal-grid');
  const heading = container?.querySelector('#cal-heading');
  if (!grid) return;
  grid.classList.add('cal-grid--transitioning');
  setTimeout(() => {
    if (!container) return;
    renderCalendar();
    if (heading) heading.textContent = formatMonthHe(calendarMonth);
    grid.classList.remove('cal-grid--transitioning');
  }, 150);
}

function renderCalendar() {
  const grid = container.querySelector('#cal-grid');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();

  const workoutDays = new Set(
    workouts
      .map((w) => toDate(w.date))
      .filter((d) => d.getFullYear() === year && d.getMonth() === month)
      .map((d) => d.getDate())
  );

  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isSelectedMonth = selectedDate && selectedDate.getFullYear() === year && selectedDate.getMonth() === month;

  const cells = [];
  ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].forEach((d) => cells.push(`<div class="text-muted" style="font-size:var(--text-sm);">${d}</div>`));
  for (let i = 0; i < startOffset; i++) cells.push('<div></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const isWorkoutDay = workoutDays.has(day);
    const isToday = isCurrentMonth && day === today.getDate();
    const isSelected = isSelectedMonth && day === selectedDate.getDate();
    const classes = ['num', 'history-day'];
    if (isWorkoutDay) classes.push('history-day--workout');
    if (isToday) classes.push('history-day--today');
    if (isSelected) classes.push('history-day--selected');
    cells.push(`<div class="${classes.join(' ')}" data-day="${day}">${day}</div>`);
  }
  grid.innerHTML = cells.join('');

  grid.querySelectorAll('[data-day]').forEach((cellEl) => {
    cellEl.addEventListener('click', () => onCalendarDayClick(Number(cellEl.dataset.day)));
  });
}

function onCalendarDayClick(day) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const matches = workouts.filter((w) => {
    const d = toDate(w.date);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });

  if (matches.length === 0) {
    showCalendarHint('אין אימון בתאריך זה');
  } else if (matches.length === 1) {
    openWorkout(matches[0]);
  } else {
    openWorkoutPickerSheet(matches);
  }
}

function showCalendarHint(text) {
  const hintEl = container?.querySelector('#cal-hint');
  if (!hintEl) return;
  if (hintTimeoutId) clearTimeout(hintTimeoutId);
  hintEl.textContent = text;
  hintEl.style.opacity = '1';
  hintTimeoutId = setTimeout(() => {
    if (hintEl) hintEl.style.opacity = '0';
  }, 1500);
}

// A day with more than one workout (e.g. two sessions in one day) can't be
// opened directly — this is the same bottom-sheet pattern used elsewhere in
// the app for "pick one of several" rather than inventing a new dialog type.
function openWorkoutPickerSheet(matches) {
  openBottomSheet({
    ariaLabel: 'בחירת אימון',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">כמה אימונים ביום הזה</h3>
        ${matches.map((w) => {
          const start = w.startTime ? toDate(w.startTime) : toDate(w.date);
          const timeLabel = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
          const exerciseCount = (w.exercises || []).length;
          return `
            <button type="button" class="btn btn-secondary btn-block" data-pick-workout="${esc(w.id)}" style="margin-bottom:8px; justify-content:space-between;">
              <span>${esc(timeLabel)}</span>
              <span class="text-muted">${exerciseCount} תרגילים</span>
            </button>`;
        }).join('')}
      `;
      body.querySelectorAll('[data-pick-workout]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const w = matches.find((x) => x.id === btn.dataset.pickWorkout);
          sheetApi.close();
          if (w) openWorkout(w);
        });
      });
    },
  });
}

// Expands the workout's month (if needed) and the workout itself, moves the
// calendar to that month, marks the day "selected", and scrolls the row
// into view — the single entry point for "the calendar told the list to
// show something", whether that came from a single match or a sheet pick.
function openWorkout(w) {
  const date = toDate(w.date);
  const key = monthKey(date);
  expandedMonths.add(key);
  expanded.add(w.id);

  const monthR = monthRefs.get(key);
  monthR?.detailEl.classList.add('history-detail--open');
  monthR?.chevronEl.classList.add('history-chevron--open');

  const rowR = rowRefs.get(w.id);
  rowR?.detailEl.classList.add('history-detail--open');
  rowR?.chevronEl.classList.add('history-chevron--open');

  syncCalendarToDate(date);
  rowR?.rootEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// The reverse direction: expanding a workout by tapping it directly (not via
// the calendar) still moves the calendar to match, so the two views can
// never end up disagreeing about which day is "selected".
function syncCalendarToDate(date) {
  selectedDate = date;
  const monthChanged = date.getFullYear() !== calendarMonth.getFullYear() || date.getMonth() !== calendarMonth.getMonth();
  calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  if (monthChanged) {
    const heading = container?.querySelector('#cal-heading');
    if (heading) heading.textContent = formatMonthHe(calendarMonth);
  }
  renderCalendar();
}

function buildMonthSection(key, group) {
  const el = document.createElement('div');
  const isOpen = expandedMonths.has(key);
  const monthLabel = formatMonthHe(new Date(group.year, group.month, 1));

  el.innerHTML = `
    <div class="row" data-month-toggle style="cursor:pointer; margin-bottom:8px;">
      <h3 style="margin:0;">${esc(monthLabel)}</h3>
      <span class="history-chevron${isOpen ? ' history-chevron--open' : ''}" data-chevron aria-hidden="true">⌄</span>
    </div>
    <div class="history-detail${isOpen ? ' history-detail--open' : ''}" data-detail>
      <div class="history-detail-inner" data-workouts-slot></div>
    </div>
  `;

  const detailEl = el.querySelector('[data-detail]');
  const chevronEl = el.querySelector('[data-chevron]');
  const slot = el.querySelector('[data-workouts-slot]');
  group.workouts.forEach((w) => slot.appendChild(buildWorkoutRow(w)));

  monthRefs.set(key, { detailEl, chevronEl });

  el.querySelector('[data-month-toggle]').addEventListener('click', () => {
    const nowOpen = !expandedMonths.has(key);
    if (nowOpen) expandedMonths.add(key); else expandedMonths.delete(key);
    detailEl.classList.toggle('history-detail--open', nowOpen);
    chevronEl.classList.toggle('history-chevron--open', nowOpen);
  });

  return el;
}

function buildWorkoutRow(w) {
  const el = document.createElement('div');
  el.className = 'card';
  const exerciseCount = (w.exercises || []).length;
  const start = w.startTime ? toDate(w.startTime) : toDate(w.date);
  const end = w.endTime ? toDate(w.endTime) : null;
  const durationMin = end ? Math.round((end - start) / 60000) : null;
  const isOpen = expanded.has(w.id);

  el.innerHTML = `
    <div class="row" data-toggle style="cursor:pointer;">
      <div>
        <strong>${formatDateHe(w.date)}</strong>
        <div class="text-muted" style="font-size:var(--text-sm);">${exerciseCount} תרגילים${durationMin ? ` · ${durationMin} דק'` : ''}</div>
      </div>
      <span class="history-chevron${isOpen ? ' history-chevron--open' : ''}" data-chevron aria-hidden="true">⌄</span>
    </div>
    <div class="history-detail${isOpen ? ' history-detail--open' : ''}" data-detail>
      <div class="history-detail-inner">
        ${(w.exercises || []).map((ex) => `
          <div style="margin-bottom:14px;">
            <strong>${esc(ex.name)}</strong>
            ${setsTable(ex.sets)}
          </div>`).join('')}
        <button class="btn btn-secondary" data-delete style="color:var(--danger); margin-top:6px;">${icon('trash-2', { className: 'icon--sm' })} מחיקת אימון</button>
      </div>
    </div>
  `;

  const detailEl = el.querySelector('[data-detail]');
  const chevronEl = el.querySelector('[data-chevron]');
  rowRefs.set(w.id, { detailEl, chevronEl, rootEl: el });

  el.querySelector('[data-toggle]').addEventListener('click', () => {
    const nowOpen = !expanded.has(w.id);
    if (nowOpen) expanded.add(w.id); else expanded.delete(w.id);
    detailEl.classList.toggle('history-detail--open', nowOpen);
    chevronEl.classList.toggle('history-chevron--open', nowOpen);
    if (nowOpen) syncCalendarToDate(toDate(w.date));
  });

  el.querySelector('[data-delete]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = await confirmDialog({
      title: 'מחיקת אימון',
      message: `למחוק את האימון מתאריך ${formatDateHe(w.date)}? הפעולה לא הפיכה.`,
      confirmLabel: 'מחיקה',
      danger: true,
    });
    if (!confirmed) return;
    await deleteWorkout(w.id);
    workouts = workouts.filter((x) => x.id !== w.id);
    expanded.delete(w.id);
    render();
  });

  return el;
}
