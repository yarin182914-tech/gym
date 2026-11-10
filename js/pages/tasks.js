// "משימות" (M6): three views of the user's tasks — היום (today's list and
// the queue waiting for a time), מטריצה (important × urgent) and הכול
// (with area / owner filters). Logic: js/lib/tasks.js; the form:
// js/ui/task-sheet.js; data: users/{uid}/tasks (docs/DATA.md).
//
// The procrastination ladder shows on a task with no time: orange "מחכה
// שבוע" after a week, "למה תקועה?" after two (or after 3 moves), and a
// decision after three. Never red, never a penalty.

import { listTasks, newTaskId, setTask, deleteTask } from '../lib/firestore.js';
import {
  AREAS, OWNERS, SIZES, STUCK_REASONS, STUCK_TIPS, normalizeTask, dayList, isRepeating, isOpen, isDoneOn,
  isUnscheduled, quadrant, sortTasks, ladderStage, whenText, toggleDoneDate, noonOf, weekOf, isUrgent, scheduledKey,
} from '../lib/tasks.js';
import { dateKey, shiftDays } from '../lib/sleep.js';
import { toDate } from '../lib/format.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { esc } from '../core/dom.js';
import { icon } from '../ui/icon.js';
import { showToast } from '../ui/toast.js';
import { emptyState } from '../ui/empty-state.js';
import { openTaskSheet, openQuickTask } from '../ui/task-sheet.js';
import { handleQuickActions } from '../ui/quick-add.js';

const VIEWS = { today: 'היום', matrix: 'מטריצה', all: 'הכול' };
const QUADRANTS = {
  do: { title: 'חשוב ודחוף', hint: 'לעשות עכשיו' },
  plan: { title: 'חשוב, לא דחוף', hint: 'לקבוע לו זמן' },
  quick: { title: 'דחוף, לא חשוב', hint: 'מהר, או להעביר' },
  drop: { title: 'לא חשוב ולא דחוף', hint: 'לשקול למחוק' },
};

let container = null;
let tasks = []; // normalized
let view = 'today';
let filter = { area: null, owner: null };
let openLadder = null; // the task whose "why stuck?" answer is showing
let stopQuickActions = null;

const todayKey = () => dateKey(new Date());
const byId = (id) => tasks.find((t) => t.id === id);
const failed = (what) => (err) => {
  console.error(`[tasks] ${what} failed`, err);
  showToast('השמירה נכשלה — נסה שוב');
};

export async function mountTasks(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען משימות…');
  const loaded = await listTasks().catch((err) => {
    console.error('[tasks] load failed', err);
    return [];
  });
  if (isStale(token)) return;
  tasks = loaded.map(normalizeTask);
  render();
  container.addEventListener('click', onClick);
  // The + button's "משימה": one line into the inbox.
  stopQuickActions = handleQuickActions('tasks', () => quickAdd());
}

export function unmountTasks() {
  stopQuickActions?.();
  stopQuickActions = null;
  container?.removeEventListener('click', onClick);
  container = null;
  tasks = [];
  openLadder = null;
}

// ---------- writes ----------

// Saves a change and shows it at once.
function save(id, patch, { isNew = false } = {}) {
  const now = new Date();
  const existing = byId(id);
  const merged = { ...(existing || {}), ...patch, id, ...(isNew ? { createdAt: now } : {}) };
  tasks = existing ? tasks.map((t) => (t.id === id ? normalizeTask(merged) : t)) : [...tasks, normalizeTask(merged)];
  setTask(id, patch, { isNew }).catch(failed('task'));
  render();
}

export function quickAdd() {
  openQuickTask({
    onSave: ({ title }) => {
      save(newTaskId(), {
        title, type: 'once', recurrence: null, area: null, owner: 'me', complexity: 'S', important: false, urgent: false,
        timing: null, scheduledAt: null, dueDate: null, status: 'inbox', firstStep: '', postponeCount: 0,
        doneAt: null, doneDates: [], stuckReason: null, startedAt: null, calendarEventId: null, source: 'quick',
      }, { isNew: true });
      showToast(`${icon('check', { className: 'icon--sm' })} נכנסה לתיבה`);
    },
    onMore: (title) => openForm(null, { title }),
  });
}

function openForm(task, prefill = {}) {
  openTaskSheet({
    task,
    prefill,
    tasks,
    newId: newTaskId,
    onSave: ({ id, data, isNew }) => save(id, data, { isNew }),
    onDelete: (id) => {
      tasks = tasks.filter((t) => t.id !== id);
      deleteTask(id).catch(failed('delete'));
      render();
    },
  });
}

function toggleDone(task) {
  const key = todayKey();
  if (isRepeating(task)) {
    const done = !isDoneOn(task, key);
    save(task.id, { doneDates: toggleDoneDate(task.doneDates, key, done) });
  } else if (task.status === 'done') {
    save(task.id, { status: 'open', doneAt: null });
  } else {
    save(task.id, { status: 'done', doneAt: new Date() });
  }
}

// "מחר": a timed task moves to tomorrow (from today, if it was due
// earlier), at the same time; counts toward "moved 3 times".
function postpone(task) {
  const from = toDate(task.scheduledAt || noonOf(todayKey()));
  const next = noonOf(shiftDays(todayKey(), 1));
  if (task.timing === 'exact') next.setHours(from.getHours(), from.getMinutes(), 0, 0);
  save(task.id, { scheduledAt: next, postponeCount: task.postponeCount + 1 });
  showToast('עברה למחר');
}

function onClick(e) {
  const el = e.target.closest('[data-view], [data-filter-area], [data-filter-owner], [data-check], [data-open], [data-add], [data-postpone], [data-why], [data-reason], [data-act]');
  if (!el || !container?.contains(el)) return;
  const d = el.dataset;
  if (d.view) {
    view = d.view;
    return render();
  }
  if (d.filterArea !== undefined) {
    filter.area = d.filterArea || null;
    return render();
  }
  if (d.filterOwner !== undefined) {
    filter.owner = d.filterOwner || null;
    return render();
  }
  if (d.add !== undefined) return openForm(null);
  const task = byId(d.check || d.open || d.postpone || d.why || d.reason?.split('|')[0] || d.act?.split('|')[0]);
  if (!task) return;
  if (d.check) return toggleDone(task);
  if (d.open) return openForm(task);
  if (d.postpone) return postpone(task);
  if (d.why) {
    openLadder = openLadder === task.id ? null : task.id;
    return render();
  }
  if (d.reason) {
    openLadder = task.id;
    return save(task.id, { stuckReason: d.reason.split('|')[1] });
  }
  if (d.act) {
    const act = d.act.split('|')[1];
    openLadder = null;
    if (act === 'start') {
      save(task.id, { startedAt: new Date() });
      showToast(`${icon('sparkles', { className: 'icon--sm' })} התחלה זה הכי קשה — כל הכבוד`);
    } else if (act === 'week') {
      save(task.id, { timing: 'week', scheduledAt: noonOf(weekOf(todayKey())), status: 'open' });
    } else if (act === 'someday') {
      save(task.id, { status: 'someday' });
      showToast('עברה ל"מתישהו"');
    } else if (act === 'edit') {
      openForm(task);
    } else if (act === 'delete') {
      tasks = tasks.filter((t) => t.id !== task.id);
      deleteTask(task.id).catch(failed('delete'));
      render();
    }
  }
}

// ---------- render ----------

function render() {
  if (!container) return;
  const body = view === 'matrix' ? matrixView() : view === 'all' ? allView() : todayView();
  container.innerHTML = `
    <div class="task-head">
      <nav class="toggle-group task-tabs" aria-label="תצוגה">
        ${Object.entries(VIEWS).map(([k, l]) => `<button type="button" data-view="${k}"${view === k ? ' class="active" aria-current="page"' : ''}>${l}</button>`).join('')}
      </nav>
      <button type="button" class="btn btn-primary task-add" data-add>${icon('plus', { className: 'icon--sm' })} משימה</button>
    </div>
    ${body}`;
}

function section(title, rows, { count = null, note = '' } = {}) {
  if (!rows.length) return '';
  return `
    <section class="task-section">
      <div class="today-section-head">
        <h2 class="today-section-title">${title}</h2>
        ${count !== null ? `<span class="today-section-count num">${count}</span>` : ''}
      </div>
      ${note ? `<p class="task-note">${note}</p>` : ''}
      <div class="task-list">${rows.join('')}</div>
    </section>`;
}

function todayView() {
  const key = todayKey();
  const list = dayList(tasks, key, key);
  const done = list.filter((t) => isDoneOn(t, key)).length;
  const queue = sortTasks(tasks.filter((t) => isUnscheduled(t)), key);
  if (!list.length && !queue.length) {
    return `<div class="card">${emptyState('אין משימות להיום. משימה חדשה: בכפתור למעלה, או ב־+ למטה.', { centered: true })}</div>`;
  }
  return section('להיום', list.map((t) => row(t, key)), { count: list.length ? `${done}/${list.length}` : null })
    + (list.length ? '' : '<div class="card task-empty-day">אין משהו מתוכנן להיום.</div>')
    + section('מחכה לשיבוץ', queue.map((t) => row(t, key)), { note: 'קלוד מציע להן זמן בבדיקת הערב.' });
}

function matrixView() {
  const key = todayKey();
  const open = tasks.filter((t) => !isRepeating(t) && isOpen(t));
  const cells = Object.entries(QUADRANTS).map(([q, { title, hint }]) => {
    const list = sortTasks(open.filter((t) => quadrant(t, key) === q), key);
    return `
      <div class="card task-quad task-quad--${q}">
        <div class="task-quad-head"><strong>${title}</strong><span class="text-muted">${hint}</span></div>
        ${list.length ? list.map((t) => `
          <div class="task-quad-row">
            ${checkButton(t, key)}
            <button type="button" class="task-quad-title" data-open="${esc(t.id)}">${esc(t.title)}</button>
          </div>`).join('') : '<p class="text-muted task-quad-empty">ריק</p>'}
      </div>`;
  });
  return `<div class="task-matrix">${cells.join('')}</div>
    <p class="task-note">"דחוף" = יעד או מועד בתוך יומיים, או מסומנת דחופה.</p>`;
}

function allView() {
  const key = todayKey();
  const match = (t) => (!filter.area || t.area === filter.area) && (!filter.owner || t.owner === filter.owner);
  const list = tasks.filter(match);
  const chip = (attr, value, label, active) => `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${value}" aria-pressed="${active}">${label}</button>`;
  const weekAgo = shiftDays(key, -7);
  const recentDone = list.filter((t) => !isRepeating(t) && t.status === 'done' && t.doneAt && dateKey(toDate(t.doneAt)) >= weekAgo)
    .sort((a, b) => toDate(b.doneAt) - toDate(a.doneAt));
  const body = section('פתוחות', sortTasks(list.filter((t) => !isRepeating(t) && isOpen(t)), key).map((t) => row(t, key)))
    + section('חוזרות', list.filter((t) => isRepeating(t) && t.status === 'open').map((t) => row(t, key)))
    + section('מתישהו', list.filter((t) => t.status === 'someday').map((t) => row(t, key)), { note: 'בלי אשמה. עוברים עליהן פעם בחודש.' })
    + section('בוצעו השבוע', recentDone.map((t) => row(t, key)));
  return `
    <div class="pill-row task-filters">
      ${chip('data-filter-area', '', 'כל התחומים', !filter.area)}
      ${Object.entries(AREAS).map(([k, l]) => chip('data-filter-area', k, l, filter.area === k)).join('')}
    </div>
    <div class="pill-row task-filters">
      ${chip('data-filter-owner', '', 'כולם', !filter.owner)}
      ${Object.entries(OWNERS).map(([k, l]) => chip('data-filter-owner', k, l, filter.owner === k)).join('')}
    </div>
    ${body || `<div class="card">${emptyState('אין משימות כאן.', { centered: true })}</div>`}`;
}

function checkButton(t, key) {
  const done = isDoneOn(t, key) || (!isRepeating(t) && t.status === 'done');
  const label = done ? `לבטל סימון: ${t.title}` : `סיום: ${t.title}`;
  return `<button type="button" class="task-check${done ? ' task-check--done' : ''}" data-check="${esc(t.id)}" aria-pressed="${done}" aria-label="${esc(label)}">${done ? icon('check', { className: 'icon--sm' }) : ''}</button>`;
}

function row(t, key) {
  const done = isDoneOn(t, key) || (!isRepeating(t) && t.status === 'done');
  const stage = done ? null : ladderStage(t);
  const tags = [
    t.status === 'inbox' ? '<span class="task-tag">בתיבה</span>' : '',
    t.important ? `<span class="task-tag task-tag--accent">${icon('sparkles', { className: 'icon--sm' })} חשובה</span>` : '',
    !done && isUrgent(t, key) ? `<span class="task-tag">${icon('flame', { className: 'icon--sm' })} דחופה</span>` : '',
    stage === 'waiting' ? '<span class="task-tag task-tag--wait">מחכה שבוע</span>' : '',
    t.owner !== 'me' ? `<span class="task-tag">${OWNERS[t.owner]}</span>` : '',
    `<span class="task-tag task-tag--quiet">${SIZES[t.complexity]}</span>`,
  ].join('');
  const when = whenText(t, key);
  const canPostpone = !done && !isRepeating(t) && (t.timing === 'exact' || t.timing === 'day') && scheduledKey(t) && scheduledKey(t) <= key;
  return `
    <div class="card task-row${done ? ' task-row--done' : ''}${stage === 'waiting' ? ' task-row--wait' : ''}">
      <div class="task-row-main">
        ${checkButton(t, key)}
        <button type="button" class="task-row-body" data-open="${esc(t.id)}">
          <span class="task-title">${esc(t.title)}</span>
          ${when ? `<span class="task-when">${esc(when)}</span>` : ''}
          ${t.firstStep && !done ? `<span class="task-step">צעד ראשון: ${esc(t.firstStep)}</span>` : ''}
          <span class="task-tags">${tags}</span>
        </button>
        ${canPostpone ? '<button type="button" class="btn-mini-dashed task-postpone" data-postpone="' + esc(t.id) + '">מחר</button>' : ''}
      </div>
      ${stage === 'stuck' || stage === 'decide' ? ladder(t, stage) : ''}
    </div>`;
}

// Two weeks: "why stuck?" with one-tap answers; three: a decision.
function ladder(t, stage) {
  const id = esc(t.id);
  if (stage === 'decide') {
    return `
      <div class="task-ladder">
        <p class="task-ladder-q">שלושה שבועות בלי זמן. מה עושים איתה?</p>
        <div class="pill-row">
          <button type="button" class="pill" data-act="${id}|week">לשבץ השבוע</button>
          <button type="button" class="pill" data-act="${id}|someday">מתישהו</button>
          <button type="button" class="pill" data-act="${id}|delete">למחוק</button>
        </div>
      </div>`;
  }
  if (openLadder !== t.id) {
    return `<div class="task-ladder"><button type="button" class="btn-mini-dashed" data-why="${id}">למה היא תקועה?</button></div>`;
  }
  const reason = t.stuckReason;
  const actions = {
    unclear: [['edit', 'להגדיר צעד ראשון']],
    big: [['edit', 'לפרק']],
    unpleasant: [['start', 'התחלתי 10 דקות'], ['edit', 'לשייך לשעת הסידורים']],
    stressful: [['start', 'התחלתי 10 דקות']],
    notImportant: [['someday', 'למתישהו'], ['delete', 'למחוק']],
  };
  return `
    <div class="task-ladder">
      <p class="task-ladder-q">למה היא תקועה?</p>
      <div class="pill-row">${Object.entries(STUCK_REASONS).map(([k, l]) => `<button type="button" class="pill${reason === k ? ' active' : ''}" data-reason="${id}|${k}" aria-pressed="${reason === k}">${l}</button>`).join('')}</div>
      ${reason ? `
        <p class="task-note">${STUCK_TIPS[reason]}</p>
        <div class="pill-row">${actions[reason].filter(([a]) => a !== 'start' || !t.startedAt).map(([a, l]) => `<button type="button" class="pill active" data-act="${id}|${a}">${l}</button>`).join('')}</div>` : ''}
    </div>`;
}
