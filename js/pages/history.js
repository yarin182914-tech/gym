import { listWorkouts, deleteWorkout } from '../lib/firestore.js';
import { formatDateHe, formatMonthHe, formatWeight, setTypeLabel, toDate } from '../lib/format.js';
import { esc } from '../core/dom.js';

let container = null;
let workouts = [];
let expanded = new Set();
let calendarMonth = new Date();

export async function mountHistory(rootEl) {
  container = rootEl;
  container.innerHTML = '<p class="text-muted">טוען היסטוריית אימונים...</p>';
  workouts = await listWorkouts(200);
  if (!container) return; // navigated away while loading
  render();
}

export function unmountHistory() {
  container = null;
  workouts = [];
  expanded = new Set();
  calendarMonth = new Date();
}


function render() {
  if (!container) return;
  container.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:10px;">
        <button class="btn btn-secondary" id="cal-prev">‹</button>
        <h3 style="margin:0;">${formatMonthHe(calendarMonth)}</h3>
        <button class="btn btn-secondary" id="cal-next">›</button>
      </div>
      <div id="cal-grid" style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center;"></div>
    </div>
    <div id="workout-list"></div>
  `;

  renderCalendar();

  const list = container.querySelector('#workout-list');
  if (workouts.length === 0) {
    list.innerHTML = '<p class="text-muted" style="text-align:center;">עוד לא נרשמו אימונים.</p>';
  }
  workouts.forEach((w) => list.appendChild(renderWorkoutRow(w)));

  container.querySelector('#cal-prev').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    render();
  });
  container.querySelector('#cal-next').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    render();
  });
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

  const cells = [];
  ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].forEach((d) => cells.push(`<div class="text-muted" style="font-size:0.75rem;">${d}</div>`));
  for (let i = 0; i < startOffset; i++) cells.push('<div></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const active = workoutDays.has(day);
    cells.push(`<div class="num" style="padding:6px 0; border-radius:8px; ${active ? 'background:var(--accent); color:#FFFFFF; font-weight:700;' : ''}">${day}</div>`);
  }
  grid.innerHTML = cells.join('');
}

function renderWorkoutRow(w) {
  const el = document.createElement('div');
  el.className = 'card';
  const isOpen = expanded.has(w.id);
  const exerciseCount = (w.exercises || []).length;
  const start = w.startTime ? toDate(w.startTime) : toDate(w.date);
  const end = w.endTime ? toDate(w.endTime) : null;
  const durationMin = end ? Math.round((end - start) / 60000) : null;

  el.innerHTML = `
    <div class="row" data-toggle style="cursor:pointer;">
      <div>
        <strong>${formatDateHe(w.date)}</strong>
        <div class="text-muted" style="font-size:0.85rem;">${exerciseCount} תרגילים${durationMin ? ` · ${durationMin} דק'` : ''}</div>
      </div>
      <span class="text-muted">${isOpen ? '▲' : '▼'}</span>
    </div>
    ${isOpen ? `<div style="margin-top:10px;">${(w.exercises || []).map((ex) => `
      <div style="margin-bottom:14px;">
        <strong>${esc(ex.name)}</strong>
        <table>
          <thead><tr><th>#</th><th>סוג</th><th>משקל</th><th>חזרות</th></tr></thead>
          <tbody>
            ${(ex.sets || []).map((s, i) => `
              <tr>
                <td class="num">${i + 1}</td>
                <td>${esc(setTypeLabel(s.type))}</td>
                <td class="num">${esc(formatWeight(s))}</td>
                <td class="num">${esc(s.reps)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`).join('')}
      <button class="btn btn-secondary" data-delete style="color:var(--danger); margin-top:6px;">🗑️ מחיקת אימון</button>
    </div>` : ''}
  `;

  el.querySelector('[data-toggle]').addEventListener('click', () => {
    if (isOpen) expanded.delete(w.id); else expanded.add(w.id);
    render();
  });

  const deleteBtn = el.querySelector('[data-delete]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = confirm(`למחוק את האימון מתאריך ${formatDateHe(w.date)}? הפעולה לא הפיכה.`);
      if (!confirmed) return;
      await deleteWorkout(w.id);
      workouts = workouts.filter((x) => x.id !== w.id);
      expanded.delete(w.id);
      render();
    });
  }

  return el;
}
