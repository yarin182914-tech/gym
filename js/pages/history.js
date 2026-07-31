import { listWorkouts, deleteWorkout } from '../lib/firestore.js';
import { formatDateHe, formatMonthHe, toDate } from '../lib/format.js';
import { esc } from '../core/dom.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { setsTable } from '../ui/sets-table.js';
import { emptyState } from '../ui/empty-state.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { icon } from '../ui/icon.js';

let container = null;
let workouts = [];
let expanded = new Set();
let calendarMonth = new Date();
// workoutId -> { detailEl, chevronEl } — built once per render(), patched in
// place on expand/collapse so toggling one row never touches any other row
// or the calendar above it.
let rowRefs = new Map();

export async function mountHistory(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען היסטוריית אימונים...');
  const loaded = await listWorkouts(200);
  if (isStale(token)) return;
  workouts = loaded;
  render();
}

export function unmountHistory() {
  container = null;
  workouts = [];
  expanded = new Set();
  calendarMonth = new Date();
  rowRefs = new Map();
}

function render() {
  if (!container) return;
  rowRefs = new Map();
  container.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:10px;">
        <button class="btn btn-secondary" id="cal-prev">‹</button>
        <h3 id="cal-heading" style="margin:0;">${formatMonthHe(calendarMonth)}</h3>
        <button class="btn btn-secondary" id="cal-next">›</button>
      </div>
      <div id="cal-grid" style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center;"></div>
    </div>
    <div id="workout-list"></div>
  `;

  renderCalendar();

  const list = container.querySelector('#workout-list');
  if (workouts.length === 0) {
    list.innerHTML = emptyState('עוד לא נרשמו אימונים.', { centered: true });
  }
  workouts.forEach((w) => list.appendChild(buildWorkoutRow(w)));

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

  const cells = [];
  ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].forEach((d) => cells.push(`<div class="text-muted" style="font-size:var(--text-sm);">${d}</div>`));
  for (let i = 0; i < startOffset; i++) cells.push('<div></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const isWorkoutDay = workoutDays.has(day);
    const isToday = isCurrentMonth && day === today.getDate();
    const classes = ['num', 'history-day'];
    if (isWorkoutDay) classes.push('history-day--workout');
    if (isToday) classes.push('history-day--today');
    cells.push(`<div class="${classes.join(' ')}">${day}</div>`);
  }
  grid.innerHTML = cells.join('');
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
  rowRefs.set(w.id, { detailEl, chevronEl });

  el.querySelector('[data-toggle]').addEventListener('click', () => {
    const nowOpen = !expanded.has(w.id);
    if (nowOpen) expanded.add(w.id); else expanded.delete(w.id);
    detailEl.classList.toggle('history-detail--open', nowOpen);
    chevronEl.classList.toggle('history-chevron--open', nowOpen);
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
