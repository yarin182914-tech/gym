// "משימות להיום" on the home screen (M6): the few most pressing open tasks
// for today (TASKS.homeCount), each with its tick, and a link to the
// tasks page; under them the nearest open decision (M6b, one line, opens it
// on להחליט), and a decision whose "איך זה יצא?" is due (M6e, opens its
// review). Hidden when there is nothing. Loads and saves on its own, so
// js/pages/today.js only gives it a place.

import { listTasks, setTask, listDecisions } from '../lib/firestore.js';
import { normalizeTask, topToday, isRepeating, toggleDoneDate, whenText, shortDay } from '../lib/tasks.js';
import { normalizeDecision, openDecisions, reviewsDue } from '../lib/decisions.js';
import { DECISIONS } from '../lib/rules.js';
import { dateKey } from '../lib/sleep.js';
import { toDate } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { showToast } from './toast.js';
import { runQuickAction } from './quick-add.js';

// host: an element on the home screen. Returns { refresh } for re-renders
// of the screen that rebuild the host.
export function mountTodayTasks(host) {
  let tasks = [];
  let decisions = [];
  let justDone = new Set(); // ticked here: stays on the card, ticked, until the next visit

  function render() {
    const key = dateKey(new Date());
    const top = topToday(tasks.filter((t) => !justDone.has(t.id)), key);
    const done = tasks.filter((t) => justDone.has(t.id));
    const list = [...top, ...done];
    const nearest = openDecisions(decisions).slice(0, DECISIONS.homeCount);
    const reviews = reviewsDue(decisions, key).slice(0, DECISIONS.homeReviewCount);
    if (!list.length && !nearest.length && !reviews.length) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `
      <div class="today-section-head">
        <h2 class="today-section-title">${list.length ? 'משימות להיום' : 'להחליט'}</h2>
        <span class="today-section-count"></span>
        <button type="button" class="btn-mini-dashed" data-tasks-all="${list.length ? '' : 'decide'}">${list.length ? 'כל המשימות' : 'כל ההחלטות'}</button>
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
        ${nearest.map((d) => `
          <div class="card task-row decision-row">
            <div class="task-row-main">
              <span class="decision-row-icon">${icon('split', { className: 'icon--sm' })}</span>
              <button type="button" class="task-row-body" data-today-decision="${esc(d.id)}">
                <span class="task-title">${esc(d.question)}</span>
                <span class="task-when">${d.decideBy ? `להחליט עד ${esc(shortDay(dateKey(toDate(d.decideBy)), key))}` : 'מחכה להחלטה'}</span>
              </button>
            </div>
          </div>`).join('')}
        ${reviews.map((d) => `
          <div class="card task-row decision-row">
            <div class="task-row-main">
              <span class="decision-row-icon">${icon('repeat', { className: 'icon--sm' })}</span>
              <button type="button" class="task-row-body" data-today-review="${esc(d.id)}">
                <span class="task-title">איך זה יצא? ${esc(d.question)}</span>
                <span class="task-when">הגיע הזמן להסתכל אחורה</span>
              </button>
            </div>
          </div>`).join('')}
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
    const dec = e.target.closest('[data-today-decision]');
    if (dec) return runQuickAction('tasks', `decision:${dec.dataset.todayDecision}`);
    const rev = e.target.closest('[data-today-review]');
    if (rev) return runQuickAction('tasks', `review:${rev.dataset.todayReview}`);
    const all = e.target.closest('[data-tasks-all]');
    if (all) {
      if (all.dataset.tasksAll === 'decide') return runQuickAction('tasks', 'decisions');
      navigate('tasks');
    }
  });

  Promise.all([listTasks(), listDecisions().catch(() => [])])
    .then(([list, decs]) => {
      tasks = list.map(normalizeTask);
      decisions = decs.map(normalizeDecision);
      render();
    })
    .catch((err) => console.error('[today] tasks load failed', err));

  return { render };
}
