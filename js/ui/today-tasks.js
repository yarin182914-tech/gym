// "משימות להיום" on the home screen (M6): the few most pressing open tasks
// for today (TASKS.homeCount), each with its tick, and a link to the
// tasks page. Hidden when there are none. Loads and saves on its own, so
// js/pages/today.js only gives it a place.

import { listTasks, setTask } from '../lib/firestore.js';
import { normalizeTask, topToday, isRepeating, toggleDoneDate, whenText } from '../lib/tasks.js';
import { dateKey } from '../lib/sleep.js';
import { navigate } from '../lib/router.js';
import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { showToast } from './toast.js';

// host: an element on the home screen. Returns { refresh } for re-renders
// of the screen that rebuild the host.
export function mountTodayTasks(host) {
  let tasks = [];
  let justDone = new Set(); // ticked here: stays on the card, ticked, until the next visit

  function render() {
    const key = dateKey(new Date());
    const top = topToday(tasks.filter((t) => !justDone.has(t.id)), key);
    const done = tasks.filter((t) => justDone.has(t.id));
    const list = [...top, ...done];
    if (!list.length) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `
      <div class="today-section-head">
        <h2 class="today-section-title">משימות להיום</h2>
        <span class="today-section-count"></span>
        <button type="button" class="btn-mini-dashed" data-tasks-all>כל המשימות</button>
      </div>
      <div class="task-list">
        ${list.map((t) => {
          const isDone = justDone.has(t.id);
          const when = whenText(t, key);
          return `
          <div class="card task-row${isDone ? ' task-row--done' : ''}">
            <div class="task-row-main">
              <button type="button" class="task-check${isDone ? ' task-check--done' : ''}" data-today-task="${esc(t.id)}" aria-pressed="${isDone}" aria-label="${esc(`${isDone ? 'לבטל סימון' : 'סיום'}: ${t.title}`)}">${isDone ? icon('check', { className: 'icon--sm' }) : ''}</button>
              <button type="button" class="task-row-body" data-tasks-all>
                <span class="task-title">${esc(t.title)}</span>
                ${when ? `<span class="task-when">${esc(when)}</span>` : ''}
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function toggle(task) {
    const key = dateKey(new Date());
    const done = !justDone.has(task.id);
    if (done) justDone.add(task.id);
    else justDone.delete(task.id);
    const patch = isRepeating(task)
      ? { doneDates: toggleDoneDate(task.doneDates, key, done) }
      : { status: done ? 'done' : 'open', doneAt: done ? new Date() : null };
    tasks = tasks.map((t) => (t.id === task.id ? normalizeTask({ ...t, ...patch }) : t));
    setTask(task.id, patch).catch((err) => {
      console.error('[today] task failed', err);
      showToast('השמירה נכשלה — נסה שוב');
    });
    render();
  }

  host.addEventListener('click', (e) => {
    const tick = e.target.closest('[data-today-task]');
    if (tick) {
      const task = tasks.find((t) => t.id === tick.dataset.todayTask);
      if (task) toggle(task);
      return;
    }
    if (e.target.closest('[data-tasks-all]')) navigate('tasks');
  });

  listTasks()
    .then((list) => {
      tasks = list.map(normalizeTask);
      render();
    })
    .catch((err) => console.error('[today] tasks load failed', err));

  return { render };
}
